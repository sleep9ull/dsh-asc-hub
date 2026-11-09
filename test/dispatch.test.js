import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { normalizeConfig } from '../host/config.js'
import { createHub, HubError } from '../host/dispatch.js'

/** A context stub: no subprocess service, no tools, no logger. */
function stubCtx() {
  return {
    get: () => undefined,
    effect: () => () => {},
    on: () => () => {},
    logger: { info: () => {}, warn: () => {} },
  }
}

function hub(config) {
  return createHub(stubCtx(), normalizeConfig(config))
}

test('unknown actions are refused before any work', async () => {
  const h = hub({})
  await assert.rejects(() => h.call('nope.nope', {}), (error) => {
    assert.ok(error instanceof HubError)
    assert.equal(error.code, 'UNSUPPORTED_ACTION')
    return true
  })
})

test('read-only mode refuses every publishing action', async () => {
  const h = hub({ mode: 'read-only' })
  for (const action of ['builds.upload', 'testflight.distribute', 'testflight.submitBeta', 'release.submit']) {
    await assert.rejects(
      () => h.call(action, { appId: '1', buildId: '1', ipaPath: '/tmp/x.ipa', groupNames: ['A'], confirm: true }),
      (error) => error.code === 'READ_ONLY_MODE',
      `${action} should be refused in read-only mode`,
    )
  }
})

test('onboarding actions are not blocked by the publish gate', async () => {
  // Metadata only, on purpose: calling these actions would run the installer or
  // remove credentials on this machine. A test must never mutate the machine.
  const h = hub({ mode: 'read-only' })
  for (const action of ['engine.install', 'auth.login', 'auth.importKey', 'auth.logout', 'auth.switch']) {
    assert.equal(h.ACTIONS[action].kind, 'local-write', `${action} must be local-write`)
  }
  // And the two credential actions validate their input before any child runs.
  await assert.rejects(() => h.call('auth.login', {}), (error) => error.code === 'INVALID_INPUT')
})

test('credential actions validate before touching the engine', async () => {
  const h = hub({ mode: 'read-only' })
  await assert.rejects(() => h.call('auth.login', { keyId: 'no' }), (error) => error.code === 'INVALID_INPUT')
  await assert.rejects(() => h.call('auth.importKey', { privateKeyPem: 'not a key' }), (error) => error.code === 'INVALID_INPUT')
})

test('the model cannot sign the user in or out', async () => {
  const h = hub({ mode: 'write' })
  for (const action of ['auth.login', 'auth.importKey', 'auth.logout', 'auth.switch']) {
    await assert.rejects(
      () => h.call(action, { name: 'x', keyId: 'ABCD1234', issuerId: 'i' }, { caller: 'tool' }),
      (error) => error.code === 'CLIENT_ONLY',
      `${action} must be panel-only`,
    )
  }
})

test('write mode still requires an explicit confirmation', async () => {
  const h = hub({ mode: 'write' })
  await assert.rejects(() => h.call('release.submit', { appId: '1' }), (error) => {
    assert.equal(error.code, 'CONFIRM_REQUIRED')
    return true
  })
})

test('engine.install is its own explicit action, so it needs no confirm field', () => {
  // Pure metadata check: this test must NEVER run the installer. An earlier
  // version of it called engine.install and a failing `brew install` uninstalled
  // the user's asc binary. Installing is a machine mutation, so it is only ever
  // exercised by hand.
  const spec = hub({ mode: 'write' }).ACTIONS['engine.install']
  assert.equal(spec.kind, 'local-write')
  assert.equal(spec.skipConfirm, true)
})

test('non-object input is rejected', async () => {
  const h = hub({})
  await assert.rejects(() => h.call('apps.list', ['nope']), (error) => error.code === 'INVALID_INPUT')
})

test('the escape hatch refuses authentication and shell-ish entry points', async () => {
  const h = hub({})
  await assert.rejects(() => h.call('run', { argv: [] }), (error) => error.code === 'INVALID_INPUT')
  await assert.rejects(() => h.call('run', { argv: ['auth', 'login'] }), (error) => error.code === 'INVALID_INPUT')
  await assert.rejects(() => h.call('run', { argv: ['web', 'finance'] }), (error) => error.code === 'INVALID_INPUT')
})

test('status is derived, never stored, and safe on a bare host', async () => {
  const h = hub({})
  const state = await h.call('status', {})
  assert.ok(['engine', 'login', 'ready'].includes(state.phase))
  assert.equal(state.mode, 'read-only')
  assert.equal(state.operation, null)
  assert.equal(state.lastError, null)
  assert.equal(typeof state.label, 'string')
  // The label vocabulary is the product's own.
  assert.ok(['start', 'ready', 'build', 'review', 'error'].includes(state.label))
})

test('the escape hatch is read-only by construction, even in write mode', async () => {
  const { childEnv, globalFlags } = await import('../host/exec.js')
  const writeMode = { profile: null, mode: 'write', telemetryDisabled: true, bypassKeychain: false }
  assert.deepEqual(globalFlags(writeMode, { forceReadOnly: true }), ['--read-only'])
  assert.equal(childEnv(writeMode, undefined, { forceReadOnly: true }).ASC_READ_ONLY, '1')
})

test('the escape hatch refuses the command groups that own a typed action', async () => {
  const h = hub({ mode: 'write' })
  for (const argv of [
    ['builds', 'upload', '--app', '1', '--ipa', '/tmp/x.ipa'],
    ['metadata', 'push'],
    ['versions', 'create', '--app', '1', '--version', '1.0.0'],
    ['testflight', 'review', 'submit'],
    ['auth', 'login'],
  ]) {
    await assert.rejects(
      () => h.call('run', { argv }),
      (error) => error.code === 'INVALID_INPUT',
      `${argv.join(' ')} must be refused`,
    )
  }
})

test('every pre-onboarding phase reports the label "start"', async () => {
  // The user's vocabulary has five words. `phase` stays engine/login so the panel
  // can pick the onboarding step; the trigger must not.
  const h = hub({})
  const state = await h.call('status', {})
  if (state.phase === 'engine' || state.phase === 'login') assert.equal(state.label, 'start')
  else assert.ok(['ready', 'build', 'review', 'error'].includes(state.label))
})
