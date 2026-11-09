/**
 * Live seam checks against the real `asc` binary when this machine has one.
 *
 * These are the tests that would catch an upstream change: they assert the
 * commands asc-hub actually runs, not a mock of them. They skip — never fail —
 * on a machine without asc, so the suite stays usable everywhere.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { normalizeConfig } from '../host/config.js'
import { createHub } from '../host/dispatch.js'

const ASC = ['/opt/homebrew/bin/asc', '/usr/local/bin/asc'].find(existsSync)
const skip = ASC === undefined ? 'asc is not installed on this machine' : false

function stubCtx() {
  return { get: () => undefined, effect: () => () => {}, on: () => () => {}, logger: { info() {}, warn() {} } }
}

function hub(config = {}) {
  return createHub(stubCtx(), normalizeConfig(config))
}

test('detects the installed engine and its version', { skip }, async () => {
  const state = await hub().call('engine.detect', {})
  assert.equal(state.installed, true)
  assert.match(state.version, /^\d+\.\d+\.\d+/)
  assert.ok(state.path.endsWith('asc'))
})

test('reports the onboarding phase without throwing', { skip }, async () => {
  const state = await hub().call('status', {})
  assert.ok(['engine', 'login', 'ready', 'busy', 'error'].includes(state.phase))
  assert.equal(state.mode, 'read-only')
  assert.equal(state.operation, null)
  assert.ok(state.engine.installed)
})

test('an unauthenticated read is classified, not crashed', { skip }, async () => {
  const state = await hub().call('status', {})
  if (state.auth.configured) return // a signed-in machine skips this branch
  await assert.rejects(() => hub().call('apps.list', {}), (error) => {
    assert.equal(error.code, 'ASC_AUTH_MISSING')
    // The raw detail is redacted and bounded, never a raw credential echo.
    assert.ok(error.detail === undefined || !/ASCAuthKey/.test(error.detail))
    return true
  })
})

test('read-only mode refuses to publish', { skip }, async () => {
  const instance = hub({ mode: 'read-only' })
  await assert.rejects(
    () => instance.call('release.submit', { appId: '1', confirm: true }),
    (error) => error.code === 'READ_ONLY_MODE',
  )
})

test('the escape hatch runs a read-only asc command', { skip }, async () => {
  const result = await hub().call('run', { argv: ['version'] })
  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /\d+\.\d+\.\d+/)
  assert.equal(result.redacted, true)
})
