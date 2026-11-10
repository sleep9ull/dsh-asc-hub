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
import type { AscRunner, CallOptions, EngineDetector, HostContext } from './types.js'
import { hostError } from './types.js'

const KEY_TYPES = new Set(['team', 'individual', 'enterprise'])
const PEM_PATTERN = /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/

/** One stored credential, as the panel shows it. */
export interface AuthProfile {
  name: string
  keyIdTail: string | undefined
  /** asc's own passthrough value; the panel only displays it. */
  keyType: unknown
}

/** The contract's `AuthState`. */
export interface AuthState {
  configured: boolean
  profiles: AuthProfile[]
  activeProfile: string | null
  /** Whatever asc reports (`storageBackend`/`storageLocation`); display only. */
  storage: unknown
  environment: { provided: boolean; complete: boolean }
}

/** One `auth doctor` line. */
export interface DoctorCheck {
  section: unknown
  status: unknown
  message: unknown
  recommendation: unknown
}

export interface DoctorReport {
  ok: boolean
  summary: unknown
  checks: DoctorCheck[]
}

/** The credential surface the dispatcher calls. */
export interface Auth {
  status(): Promise<AuthState>
  doctor(): Promise<DoctorReport>
  login(input: Record<string, unknown>, options?: CallOptions): Promise<AuthState>
  importKey(input: Record<string, unknown>, options?: CallOptions): Promise<AuthState>
  logout(input: Record<string, unknown>, options?: CallOptions): Promise<AuthState>
  switchProfile(input: Record<string, unknown>, options?: CallOptions): Promise<AuthState>
}

/**
 * Normalize `asc auth status --output json` into the contract's `AuthState`.
 * The upstream shape is `{ storageBackend, storageLocation, credentials: […],
 * environmentCredentialsProvided, environmentCredentialsComplete }`; a
 * credential's own field names are read defensively.
 */
export function normalizeAuthState(json: unknown, config: { profile: string | null }): AuthState {
  const credentials = pickArray(json, ['credentials', 'profiles'])
  const profiles = credentials.map((entry) => {
    const keyId = field(entry, 'keyId') ?? field(entry, 'key_id')
    return {
      // asc names every credential; the cast keeps the value verbatim (the
      // upstream field is a string) instead of inventing a different fallback.
      name: (field(entry, 'name') ?? field(entry, 'profile') ?? 'default') as string,
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
export function normalizeDoctor(json: unknown): DoctorReport {
  const sectionsValue = field(json, 'sections')
  const sections = Array.isArray(sectionsValue) ? sectionsValue : []
  const checks: DoctorCheck[] = []
  for (const section of sections) {
    const title = field(section, 'title') ?? 'checks'
    const sectionChecksValue = field(section, 'checks')
    const sectionChecks = Array.isArray(sectionChecksValue) ? sectionChecksValue : []
    for (const check of sectionChecks) {
      // asc's check objects carry only `status`, `message` and an optional
      // `recommendation`; the section title is their only grouping label.
      checks.push({
        section: title,
        status: field(check, 'status') ?? 'info',
        message: field(check, 'message') ?? '',
        recommendation: field(check, 'recommendation') ?? undefined,
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

export function createAuth(
  ctx: HostContext,
  config: { profile: string | null },
  asc: AscRunner,
  engine: EngineDetector,
): Auth {
  async function binary(): Promise<string> {
    const state = await engine.detect()
    if (!state.installed || !state.path) {
      throw hostError('ASC_NOT_INSTALLED', 'The asc engine is not installed.')
    }
    return state.path
  }

  async function status(): Promise<AuthState> {
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

  async function doctor(): Promise<DoctorReport> {
    const path = await binary()
    const result = await asc.run(['auth', 'doctor'], { path, timeoutMs: 60_000, local: true })
    return normalizeDoctor(result.json ?? {})
  }

  async function profileNames(): Promise<string[]> {
    const state = await status()
    return state.profiles.map((profile) => profile.name)
  }

  async function login(input: Record<string, unknown>, options: CallOptions = {}): Promise<AuthState> {
    const keyId = String(input.keyId ?? '')
    const issuerId = String(input.issuerId ?? '')
    const privateKeyPath = typeof input.privateKeyPath === 'string' ? input.privateKeyPath : ''
    const keyType = input.keyType
    const name = typeof input.name === 'string' ? input.name : ''
    const storage = input.storage
    // Validate the human's input before probing the engine: a typo must answer
    // immediately and must not depend on what is installed on this machine.
    if (!/^[A-Za-z0-9]{4,}$/.test(keyId)) {
      fail('INVALID_INPUT', 'The Key ID looks wrong; it is the 10-character id shown next to the key name.')
    }
    if (keyType !== undefined && (typeof keyType !== 'string' || !KEY_TYPES.has(keyType))) {
      fail('INVALID_INPUT', 'The key type must be team, individual or enterprise.')
    }
    if (!privateKeyPath) {
      fail('INVALID_INPUT', 'A private key path is required.')
    }
    const path = await binary()
    const existing = await profileNames()
    if (!name) {
      if (existing.length > 0) {
        fail('INVALID_INPUT', `A profile name is required; asc already has ${existing.join(', ')}.`)
      }
    }
    const argv = ['auth', 'login']
    if (name) argv.push('--name', name)
    argv.push('--key-id', keyId, '--issuer-id', issuerId)
    argv.push('--private-key', privateKeyPath)
    if (keyType) argv.push('--key-type', keyType)
    if (storage === 'config') argv.push('--bypass-keychain')
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

  async function importKey(input: Record<string, unknown>, options: CallOptions = {}): Promise<AuthState> {
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

  async function logout(input: Record<string, unknown>, options: CallOptions = {}): Promise<AuthState> {
    const path = await binary()
    const name = typeof input.name === 'string' ? input.name : ''
    const argv = ['auth', 'logout']
    if (name) argv.push('--name', name)
    if (input.all === true) argv.push('--all')
    argv.push('--confirm')
    const result = await asc.run(argv, { path, timeoutMs: 60_000, output: false, local: true, signal: options.signal })
    if (result.exitCode !== 0) fail('ASC_FAILED', 'asc could not remove the credentials.', result.stderr)
    return status()
  }

  async function switchProfile(input: Record<string, unknown>, options: CallOptions = {}): Promise<AuthState> {
    const path = await binary()
    const name = typeof input.name === 'string' ? input.name : ''
    const result = await asc.run(['auth', 'switch', '--name', name], {
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

function fail(code: string, message: string, detail?: string): never {
  throw hostError(code, message, detail)
}
