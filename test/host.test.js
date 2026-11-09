import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { normalizeConfig } from '../host/config.js'
import { classifyExit, field, parseJson, pickArray } from '../host/asc.js'
import { normalizeAuthState, normalizeDoctor } from '../host/auth.js'

test('config defaults are safe', () => {
  const config = normalizeConfig(undefined)
  assert.equal(config.mode, 'read-only')
  assert.equal(config.requireApproval, true)
  assert.equal(config.ascPath, 'asc')
  assert.equal(config.vendorNumber, null)
})

test('config rejects a hostile mode and keeps typed values', () => {
  const config = normalizeConfig({ mode: 'root', timeoutMs: -1, requireApproval: 'yes', ascPath: '  /x/asc  ' })
  assert.equal(config.mode, 'read-only')
  assert.equal(config.timeoutMs, 60_000)
  assert.equal(config.requireApproval, true)
  assert.equal(config.ascPath, '/x/asc')
})

test('classifyExit maps the upstream exit codes to contract codes', () => {
  assert.equal(classifyExit(0, '', ''), undefined)
  assert.equal(classifyExit(3, '', '').code, 'ASC_AUTH_MISSING')
  assert.equal(classifyExit(2, '', 'Error: unknown flag').code, 'INVALID_INPUT')
  assert.equal(classifyExit(6, '', '').code, 'READ_ONLY_MODE')
  assert.equal(classifyExit(7, '', '').code, 'PROCESSING_PENDING')
  assert.equal(classifyExit(1, '', 'Error: boom').code, 'ASC_FAILED')
  assert.equal(classifyExit(1, '', 'HTTP 401 unauthorized').code, 'ASC_AUTH_MISSING')
})

test('json helpers tolerate asc envelope drift', () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 })
  assert.equal(parseJson('not json'), undefined)
  assert.deepEqual(pickArray([1, 2]), [1, 2])
  assert.deepEqual(pickArray({ data: [3] }), [3])
  assert.deepEqual(pickArray({ builds: [4] }, ['builds']), [4])
  assert.deepEqual(pickArray({ nothing: true }), [])
  assert.equal(field({ a: { b: { c: 7 } } }, 'a.b.c'), 7)
  assert.equal(field({ a: 1 }, 'a.b.c'), undefined)
})

test('auth status normalizes the upstream credential report', () => {
  const state = normalizeAuthState(
    {
      storageBackend: 'System Keychain',
      storageLocation: 'system keychain',
      credentials: [{ name: 'Work', keyId: 'ABCDEF1234', keyType: 'team' }, { name: 'Default' }],
      environmentCredentialsProvided: false,
      environmentCredentialsComplete: false,
    },
    { profile: null },
  )
  assert.equal(state.configured, true)
  assert.equal(state.storage, 'System Keychain')
  assert.equal(state.profiles.length, 2)
  assert.equal(state.profiles[0].keyIdTail, '…1234')
  // Two stored profiles with no default marker: the active one is unknown.
  assert.equal(state.activeProfile, null)
  assert.equal(state.environment.complete, false)
})

test('auth status reports unconfigured when credentials are empty', () => {
  const state = normalizeAuthState(
    { storageBackend: 'System Keychain', credentials: [], environmentCredentialsComplete: false },
    { profile: null },
  )
  assert.equal(state.configured, false)
  assert.deepEqual(state.profiles, [])
  assert.equal(state.activeProfile, null)
})

test('doctor normalizes sections into a flat check list', () => {
  const report = normalizeDoctor({
    sections: [{ title: 'Keychain', checks: [{ status: 'ok', message: 'reachable' }] }],
    summary: { ok: true, info: 1, warnings: 0, errors: 0 },
  })
  assert.equal(report.ok, true)
  assert.equal(report.checks[0].status, 'ok')
  assert.ok(report.checks[0].name.includes('Keychain'))
})

test('doctor is not ok when the summary carries warnings', () => {
  const report = normalizeDoctor({ sections: [], summary: { ok: true, warnings: 2 } })
  assert.equal(report.ok, false)
})

test('the read-only switch reaches data-plane commands only', async () => {
  const { childEnv, globalFlags } = await import('../host/exec.js')
  const readOnly = { profile: null, mode: 'read-only', telemetryDisabled: true, bypassKeychain: false }
  // Data-plane calls carry the kill switch, in flags and in the environment.
  assert.deepEqual(globalFlags(readOnly), ['--read-only'])
  assert.equal(childEnv(readOnly).ASC_READ_ONLY, '1')
  // Plumbing (auth, version) must not: asc would refuse to store a credential and
  // onboarding could never finish in the product's default mode.
  assert.deepEqual(globalFlags(readOnly, { local: true }), [])
  assert.equal(childEnv(readOnly, undefined, { local: true }).ASC_READ_ONLY, undefined)
  // Write mode never carries it.
  assert.deepEqual(globalFlags({ ...readOnly, mode: 'write' }), [])
  assert.equal(childEnv({ ...readOnly, mode: 'write' }).ASC_READ_ONLY, undefined)
})
