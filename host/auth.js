/**
 * Authentication: everything the plugin knows about App Store Connect
 * credentials is what `asc auth …` reports.
 *
 * The product never asks for an Apple ID password and never persists key
 * material: the user produces an App Store Connect API key (.p8), and asc stores
 * it in the macOS Keychain. The one case where bytes pass through the Host is
 * `importKey` (a drag-and-dropped .p8), where the PEM is written to a private
 * temporary file, handed to `asc auth login`, and deleted in a `finally` block.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { field, pickArray } from './asc.js'
import { tail } from './redact.js'

const KEY_TYPES = new Set(['team', 'individual', 'enterprise'])
const PEM_PATTERN = /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/

/**
 * Normalize `asc auth status --output json` into the contract's `AuthState`.
 * The upstream shape is `{ storageBackend, storageLocation, credentials: […],
 * environmentCredentialsProvided, environmentCredentialsComplete }`; a
 * credential's own field names are read defensively.
 */
export function normalizeAuthState(json, config) {
  const credentials = pickArray(json, ['credentials', 'profiles'])
  const profiles = credentials.map((entry) => {
    const keyId = field(entry, 'keyId') ?? field(entry, 'key_id')
    return {
      name: field(entry, 'name') ?? field(entry, 'profile') ?? 'default',
      keyIdTail: tail(typeof keyId === 'string' ? keyId : undefined),
      keyType: field(entry, 'keyType') ?? field(entry, 'key_type') ?? undefined,
      isDefault: Boolean(field(entry, 'default') ?? field(entry, 'isDefault')),
    }
  })
  const active =
    profiles.find((profile) => profile.isDefault)?.name ??
    (config.profile ? profiles.find((profile) => profile.name === config.profile)?.name : undefined) ??
    (profiles.length === 1 ? profiles[0].name : undefined)
  return {
    configured: profiles.length > 0 || Boolean(field(json, 'environmentCredentialsComplete')),
    profiles: profiles.map((profile) => ({
      name: profile.name,
      keyIdTail: profile.keyIdTail,
      keyType: profile.keyType,
    })),
    activeProfile: active ?? null,
    storage: field(json, 'storageBackend') ?? field(json, 'storageLocation') ?? null,
    environment: {
      provided: Boolean(field(json, 'environmentCredentialsProvided')),
      complete: Boolean(field(json, 'environmentCredentialsComplete')),
    },
  }
}

/** Normalize `asc auth doctor --output json`. */
export function normalizeDoctor(json) {
  const sections = Array.isArray(field(json, 'sections')) ? field(json, 'sections') : []
  const checks = []
  for (const section of sections) {
    const title = field(section, 'title') ?? 'checks'
    for (const check of Array.isArray(field(section, 'checks')) ? field(section, 'checks') : []) {
      checks.push({
        name: `${title}: ${field(check, 'name') ?? field(check, 'title') ?? 'check'}`,
        status: field(check, 'status') ?? 'info',
        message: field(check, 'message') ?? '',
      })
    }
  }
  const summary = field(json, 'summary') ?? {}
  return {
    ok: Boolean(field(summary, 'ok')) && !field(summary, 'errors') && !field(summary, 'warnings'),
    summary,
    checks,
  }
}

/**
 * @param {any} ctx
 * @param {{ profile: string|null }} config
 * @param {ReturnType<import('./asc.js').createAsc>} asc
 * @param {{ detect: Function }} engine
 */
export function createAuth(ctx, config, asc, engine) {
  async function binary() {
    const state = await engine.detect()
    if (!state.installed || !state.path) {
      const error = new Error('The asc engine is not installed.')
      error.code = 'ASC_NOT_INSTALLED'
      throw error
    }
    return state.path
  }

  async function status() {
    const path = await binary()
    const result = await asc.run(['auth', 'status'], { path, timeoutMs: 20_000, local: true })
    if (result.exitCode !== 0) {
      return {
        configured: false,
        profiles: [],
        activeProfile: null,
        storage: null,
        environment: { provided: false, complete: false },
      }
    }
    return normalizeAuthState(result.json, config)
  }

  async function doctor() {
    const path = await binary()
    const result = await asc.run(['auth', 'doctor'], { path, timeoutMs: 60_000, local: true })
    return normalizeDoctor(result.json ?? {})
  }

  async function profileNames() {
    const state = await status()
    return state.profiles.map((profile) => profile.name)
  }

  async function login(input, options = {}) {
    const path = await binary()
    if (!/^[A-Za-z0-9]{4,}$/.test(String(input.keyId ?? ''))) {
      fail('INVALID_INPUT', 'The Key ID looks wrong; it is the 10-character id shown next to the key name.')
    }
    if (input.keyType !== undefined && !KEY_TYPES.has(input.keyType)) {
      fail('INVALID_INPUT', 'The key type must be team, individual or enterprise.')
    }
    if (!input.privateKeyPath) {
      fail('INVALID_INPUT', 'A private key path is required.')
    }
    const existing = await profileNames()
    let name = input.name
    if (!name) {
      if (existing.length > 0) {
        fail('INVALID_INPUT', `A profile name is required; asc already has ${existing.join(', ')}.`)
      }
    }
    const argv = ['auth', 'login']
    if (name) argv.push('--name', name)
    argv.push('--key-id', input.keyId, '--issuer-id', String(input.issuerId ?? ''))
    argv.push('--private-key', input.privateKeyPath)
    if (input.keyType) argv.push('--key-type', input.keyType)
    if (input.storage === 'config') argv.push('--bypass-keychain')
    if (input.network === true) argv.push('--network')
    const result = await asc.run(argv, { path, timeoutMs: 120_000, output: false, local: true, signal: options.signal })
    if (result.exitCode !== 0) {
      const message = `${result.stderr}\n${result.stdout}`
      if (/permission|chmod|readable/i.test(message)) {
        fail('KEY_FILE_UNSAFE', 'The private key file is readable by other users.', message)
      }
      fail('ASC_AUTH_FAILED', 'asc rejected the API key.', message)
    }
    return status()
  }

  async function importKey(input, options = {}) {
    const pem = String(input.privateKeyPem ?? '')
    if (!PEM_PATTERN.test(pem)) {
      fail('INVALID_INPUT', 'That file is not a PEM private key.')
    }
    const directory = await mkdtemp(join(tmpdir(), 'asc-hub-key-'))
    const keyPath = join(directory, `AuthKey_${String(input.keyId ?? 'key').replace(/[^A-Za-z0-9]/g, '')}.p8`)
    try {
      await writeFile(keyPath, pem, { mode: 0o600 })
      return await login({ ...input, privateKeyPath: keyPath }, options)
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  }

  async function logout(input, options = {}) {
    const path = await binary()
    const argv = ['auth', 'logout']
    if (input.name) argv.push('--name', input.name)
    if (input.all === true) argv.push('--all')
    argv.push('--confirm')
    const result = await asc.run(argv, { path, timeoutMs: 60_000, output: false, local: true, signal: options.signal })
    if (result.exitCode !== 0) fail('ASC_FAILED', 'asc could not remove the credentials.', result.stderr)
    return status()
  }

  async function switchProfile(input, options = {}) {
    const path = await binary()
    const result = await asc.run(['auth', 'switch', '--name', input.name], {
      path,
      timeoutMs: 30_000,
      output: false,
      local: true,
      signal: options.signal,
    })
    if (result.exitCode !== 0) fail('ASC_FAILED', 'asc could not switch the default profile.', result.stderr)
    return status()
  }

  return { status, doctor, login, importKey, logout, switchProfile }
}

function fail(code, message, detail) {
  const error = new Error(message)
  error.code = code
  error.detail = detail
  throw error
}
