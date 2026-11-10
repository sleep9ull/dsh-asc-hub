import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { normalizeConfig } from '../dist/host/config.js'
import { classifyExit, field, parseJson, pickArray } from '../dist/host/asc.js'
import { normalizeAuthState, normalizeDoctor } from '../dist/host/auth.js'

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
  assert.equal(classifyExit(3, '', '')?.code, 'ASC_AUTH_MISSING')
  assert.equal(classifyExit(2, '', 'Error: unknown flag')?.code, 'INVALID_INPUT')
  assert.equal(classifyExit(6, '', '')?.code, 'READ_ONLY_MODE')
  assert.equal(classifyExit(7, '', '')?.code, 'PROCESSING_PENDING')
  assert.equal(classifyExit(1, '', 'Error: boom')?.code, 'ASC_FAILED')
  assert.equal(classifyExit(1, '', 'HTTP 401 unauthorized')?.code, 'ASC_AUTH_MISSING')
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
  assert.equal(report.checks[0].section, 'Keychain')
  assert.equal(report.checks[0].message, 'reachable')
})

test('doctor is not ok when the summary carries warnings', () => {
  const report = normalizeDoctor({ sections: [], summary: { ok: true, warnings: 2 } })
  assert.equal(report.ok, false)
})

test('the read-only switch reaches data-plane commands only', async () => {
  const { childEnv, globalFlags } = (await import('../dist/host/exec.js')) as any
  const readOnly = { profile: null, mode: 'read-only' as const, telemetryDisabled: true, bypassKeychain: false }
  // Data-plane calls carry the kill switch, in flags and in the environment.
  assert.deepEqual(globalFlags(readOnly), ['--read-only'])
  assert.equal(childEnv(readOnly).ASC_READ_ONLY, '1')
  // Plumbing (auth, version) must not: asc would refuse to store a credential and
  // onboarding could never finish in the product's default mode.
  assert.deepEqual(globalFlags(readOnly, { local: true }), [])
  assert.equal(childEnv(readOnly, undefined, { local: true }).ASC_READ_ONLY, undefined)
  // Write mode never carries it.
  assert.deepEqual(globalFlags({ ...readOnly, mode: 'write' as const }), [])
  assert.equal(childEnv({ ...readOnly, mode: 'write' as const }).ASC_READ_ONLY, undefined)
})

test('action results are lossless JSON with no undefined members', async () => {
  const { jsonClean } = (await import('../dist/host/dispatch.js')) as any
  const cleaned = jsonClean({ a: 1, b: undefined, c: { d: undefined, e: null }, f: [{ g: undefined, h: 'x' }] })
  assert.deepEqual(cleaned, { a: 1, c: { e: null }, f: [{ h: 'x' }] })
  assert.ok(!JSON.stringify(jsonClean({ x: undefined })).includes('undefined'))
})


test('status reports both versions and the update slot', async () => {
  const { createHub } = (await import('../dist/host/dispatch.js')) as any
  const { normalizeConfig } = (await import('../dist/host/config.js')) as any
  const ctx = {
    get: () => undefined,
    effect: () => () => {},
    on: () => () => {},
    logger: { info() {}, warn() {}, debug() {} },
  }
  const hub = createHub(ctx, normalizeConfig({ mode: 'write' }))
  try {
    const state = await hub.call('status', {}, { caller: 'client' })
    assert.equal(typeof state.hub.version, 'string')
    assert.ok(state.hub.version.length > 0, 'the hub reports its own version')
    assert.equal(state.update.available, false)
    assert.equal(state.update.scope, null)
  } finally {
    hub.dispose()
  }
})

test('the mode switch flips this session and stays panel-only', async () => {
  const { createHub } = (await import('../dist/host/dispatch.js')) as any
  const { normalizeConfig } = (await import('../dist/host/config.js')) as any
  const ctx = { get: () => undefined, effect: () => () => {}, on: () => () => {}, logger: { info() {}, warn() {}, debug() {} } }
  const hub = createHub(ctx, normalizeConfig({ mode: 'read-only' }))
  try {
    assert.equal((await hub.call('status', {}, { caller: 'client' })).mode, 'read-only')
    assert.equal((await hub.call('mode.set', { mode: 'write' }, { caller: 'client' })).mode, 'write')
    assert.equal(hub.config.mode, 'write')
    assert.equal((await hub.call('mode.set', { mode: 'read-only' as const }, { caller: 'client' })).mode, 'read-only')
    await assert.rejects(() => hub.call('mode.set', { mode: 'root' }, { caller: 'client' }), (error: any) => error.code === 'INVALID_INPUT')
    // The model cannot unlock writing on its own.
    await assert.rejects(() => hub.call('mode.set', { mode: 'write' }, { caller: 'tool' }), (error: any) => error.code === 'CLIENT_ONLY')
  } finally {
    hub.dispose()
  }
})

test('an update is applied by scope, and the plugin half stays manual', async () => {
  const { createHub } = (await import('../dist/host/dispatch.js')) as any
  const { normalizeConfig } = (await import('../dist/host/config.js')) as any
  const ctx = { get: () => undefined, effect: () => () => {}, on: () => () => {}, logger: { info() {}, warn() {}, debug() {} } }
  const hub = createHub(ctx, normalizeConfig({ mode: 'read-only' }))
  try {
    await assert.rejects(
      () => hub.call('update.apply', { scope: 'hub' }, { caller: 'client' }),
      (error: any) => error.code === 'MANUAL_UPDATE_REQUIRED',
    )
    await assert.rejects(
      () => hub.call('update.apply', { scope: 'hub' }, { caller: 'tool' }),
      (error: any) => error.code === 'CLIENT_ONLY',
    )
  } finally {
    hub.dispose()
  }
})

test('the skill document parses into a registerable definition', async () => {
  const { readSkill, parseSkillDocument, registerSkill } = (await import('../dist/host/skill.js')) as any
  const skill = readSkill()
  assert.equal(skill.name, 'asc-hub')
  assert.ok(skill.description.length > 40, 'the description is the routing text the model sees')
  assert.ok(skill.content.startsWith('# asc-hub'))
  assert.ok(!skill.content.includes('---\nname:'), 'frontmatter is stripped from the body')
  const parsed = parseSkillDocument('---\nname: x-y\ndescription: "quoted text"\n---\n\n# body\n')
  assert.deepEqual(parsed.fields, { name: 'x-y', description: 'quoted text' })
  assert.equal(parsed.content, '# body')
})

test('skill registration is optional and never breaks the plugin', async () => {
  const { registerSkill } = (await import('../dist/host/skill.js')) as any
  const effects = []
  const withoutService = { get: () => undefined, effect: (fn: any) => { effects.push(fn) }, logger: { warn() {} } }
  assert.equal(registerSkill(withoutService), false)
  const registrations: any[] = []
  const withService = {
    get: (name: any) => (name === 'skills' ? { register: (skill: any) => { registrations.push(skill); return () => {} } } : undefined),
    effect: (fn: any) => { const dispose = fn(); effects.push(dispose); return dispose },
    logger: { warn() {} },
  }
  assert.equal(registerSkill(withService), true)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].name, 'asc-hub')
  // The skill reports its package as the source; read the manifest so a rename
  // cannot leave this assertion agreeing with itself.
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(registrations[0].source, manifest.name)
  assert.ok(registrations[0].content.length > 100)
})

test('skill pack detection reads the lock and tolerates every failure', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { detectSkills } = (await import('../dist/host/skills.js')) as any
  const home = mkdtempSync(join(tmpdir(), 'asc-hub-skills-'))
  try {
    const agents = join(home, '.agents')
    mkdirSync(join(agents, 'skills', 'asc-cli-usage'), { recursive: true })
    writeFileSync(join(agents, 'skills', 'asc-cli-usage', 'SKILL.md'), '# asc-cli-usage\n')
    writeFileSync(join(agents, '.skill-lock.json'), JSON.stringify({
      version: 3,
      skills: {
        'asc-cli-usage': { ref: 'abcdef1234', installedAt: '2026-10-25T03:27:06.737725Z' },
        'asc-release-flow': { ref: 'abcdef1234', installedAt: '2026-10-25T03:27:06.737725Z' },
        'frontend-design': { ref: 'nope', installedAt: '2026-01-01T00:00:00.000Z' },
      },
    }))
    const state = await detectSkills({ env: { HOME: home } })
    assert.equal(state.installed, true)
    assert.equal(state.count, 2, 'only the asc pack counts')
    assert.equal(state.ref, 'abcdef1234')
    assert.equal(state.installedAt, '2026-10-25T03:27:06.737725Z')

    writeFileSync(join(agents, '.skill-lock.json'), '{not json')
    const broken = await detectSkills({ env: { HOME: home } })
    assert.equal(broken.installed, false)
    assert.equal(broken.count, 0)

    rmSync(join(agents, '.skill-lock.json'))
    const missing = await detectSkills({ env: { HOME: home } })
    assert.equal(missing.installed, false)
    assert.equal(missing.ref, null)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('installing the pack is a local write that reports the last line', async () => {
  const { installSkills } = (await import('../dist/host/skills.js')) as any
  const calls: any[] = []
  const run = async (argv: any) => {
    calls.push(argv)
    return { stdout: 'cloning...\n25 skills installed\n', stderr: '', exitCode: 0 }
  }
  const result = await installSkills({ run }, { env: { HOME: '/nonexistent-home' } })
  assert.deepEqual(calls[0], ['install-skills'], 'it runs the engine\'s own installer, not a copy of it')
  assert.equal(result.log, '25 skills installed')
  assert.equal(result.installed, false)

  const failing = async () => ({ stdout: '', stderr: 'git: command not found', exitCode: 127 })
  await assert.rejects(() => installSkills({ run: failing }, { env: { HOME: '/nonexistent-home' } }), (error: any) => {
    assert.equal(error.code, 'ASC_FAILED')
    assert.match(error.message, /git: command not found/)
    return true
  })
})

test('a build row reads the marketing version and both TestFlight audiences', async () => {
  const { normalizeBuilds } = (await import('../dist/host/ops.js')) as any
  // The ASC envelope `builds list --output json` prints: the build resource
  // carries CFBundleVersion only, so everything a person reads on the row comes
  // from the included resources.
  const response = {
    data: [
      {
        type: 'builds',
        id: 'b1',
        attributes: {
          version: '1',
          processingState: 'VALID',
          uploadedDate: '2026-11-01T10:00:00-07:00',
          expired: false,
        },
        relationships: {
          preReleaseVersion: { data: { type: 'preReleaseVersions', id: 'p1' } },
          buildBetaDetail: { data: { type: 'buildBetaDetails', id: 'd1' } },
          betaGroups: { data: [{ type: 'betaGroups', id: 'g1' }, { type: 'betaGroups', id: 'g2' }] },
        },
      },
    ],
    included: [
      { type: 'preReleaseVersions', id: 'p1', attributes: { version: '1.0.1', platform: 'IOS' } },
      {
        type: 'buildBetaDetails',
        id: 'd1',
        attributes: { internalBuildState: 'IN_BETA_TESTING', externalBuildState: 'WAITING_FOR_BETA_REVIEW' },
      },
      { type: 'betaGroups', id: 'g1', attributes: { name: 'Core', isInternalGroup: true } },
      { type: 'betaGroups', id: 'g2', attributes: { name: 'Public', isInternalGroup: false } },
    ],
  }
  const [build] = normalizeBuilds(response)
  assert.equal(build.version, '1.0.1', 'the marketing version comes from preReleaseVersion, never the build number')
  assert.equal(build.buildNumber, '1', 'attributes.version is CFBundleVersion')
  assert.equal(build.internal, true)
  assert.equal(build.external, true)
  assert.equal(build.internalBuildState, 'IN_BETA_TESTING')
  assert.equal(build.externalBuildState, 'WAITING_FOR_BETA_REVIEW')
})

test('a build without includes still renders, and says nothing about TestFlight', async () => {
  const { normalizeBuilds } = (await import('../dist/host/ops.js')) as any
  const [build] = normalizeBuilds({
    data: [{ type: 'builds', id: 'b2', attributes: { version: '7', processingState: 'PROCESSING' } }],
  })
  assert.equal(build.version, '', 'no preReleaseVersion means no marketing version, not the build number')
  assert.equal(build.buildNumber, '7')
  assert.equal(build.internal, false)
  assert.equal(build.external, false)
  assert.equal(build.internalBuildState, null)
  assert.equal(build.externalBuildState, null)

  // An empty body is a refusal, not a crash.
  assert.deepEqual(normalizeBuilds({ data: [] }), [])
  assert.deepEqual(normalizeBuilds(null), [])
})

test('the build-beta state alone can mark an audience, without groups', async () => {
  const { normalizeBuilds } = (await import('../dist/host/ops.js')) as any
  const [internalOnly] = normalizeBuilds({
    data: [
      {
        type: 'builds',
        id: 'b3',
        attributes: { version: '8' },
        relationships: { buildBetaDetail: { data: { type: 'buildBetaDetails', id: 'd3' } } },
      },
    ],
    included: [
      {
        type: 'buildBetaDetails',
        id: 'd3',
        attributes: { internalBuildState: 'READY_FOR_BETA_TESTING', externalBuildState: 'NOT_APPLICABLE' },
      },
    ],
  })
  assert.equal(internalOnly.internal, true)
  assert.equal(internalOnly.external, false, 'only READY_FOR_BETA_TESTING / IN_BETA_TESTING count as reached')
})

test('a workspace path is shortened only against the home directory itself', async () => {
  const { shortenPath, parseGitFacts } = (await import('../dist/host/workspace.js')) as any
  assert.equal(shortenPath('/Users/jane/dev/app', '/Users/jane'), '~/dev/app')
  assert.equal(shortenPath('/Users/jane', '/Users/jane'), '~')
  assert.equal(shortenPath('/Users/jane2/app', '/Users/jane'), '/Users/jane2/app')
  assert.equal(shortenPath('/opt/work', '/Users/jane'), '/opt/work')
  assert.equal(shortenPath('', '/Users/jane'), '')

  const primary = parseGitFacts('/repo\nmain\n/repo/.git\n/repo/.git\n')
  assert.deepEqual(primary, { repo: 'repo', branch: 'main', worktree: false })
  const linked = parseGitFacts('/repo-feature\nfeat\n/repo/.git/worktrees/feature\n/repo/.git\n')
  assert.deepEqual(linked, { repo: 'repo-feature', branch: 'feat', worktree: true })
  assert.equal(parseGitFacts(''), null, 'not a repository is not an error')
  assert.equal(parseGitFacts('/repo\nHEAD\n/repo/.git\n/repo/.git\n').branch, null, 'a detached HEAD has no branch')
})

test('the workspace action reports the session directory, not the process one', async () => {
  const { createWorkspace } = (await import('../dist/host/workspace.js')) as any
  const session = { id: 's1', cwd: process.cwd() }
  const ctx = {
    get: (name: any) => {
      if (name === 'sessions') return { get: (id: any) => (id === 's1' ? session : undefined) }
      if (name === 'workingDirectory') {
        return { defaultDirectory: '/tmp', get: (target: any) => target.cwd }
      }
      return undefined
    },
  }
  const workspace = createWorkspace(ctx, normalizeConfig({}))
  const info = await workspace.info({ sessionId: 's1' })
  assert.equal(info.cwd, process.cwd(), 'the session decides the directory')
  assert.ok(String(info.display).length > 0)
  assert.equal(info.repo, process.cwd().split('/').pop(), 'the repository is this checkout')
  assert.equal(info.worktree, false)
  assert.equal(typeof info.branch, 'string')

  // An unknown session falls back to the profile default instead of failing.
  const fallback = await workspace.info({ sessionId: 'nope' })
  assert.equal(fallback.cwd, '/tmp')
})

test('the workspace action survives a missing harness service and no repository', async () => {
  const { createWorkspace } = (await import('../dist/host/workspace.js')) as any
  const workspace = createWorkspace({ get: () => undefined }, normalizeConfig({}))
  const info = await workspace.info({})
  assert.equal(info.cwd, process.cwd(), 'no workingDirectory service means the process directory')
  assert.equal(typeof info.checkedAt, 'string')

  // A directory that is not a git checkout answers the path and nothing else.
  const outside = createWorkspace({
    get: (name: any) => (name === 'workingDirectory' ? { defaultDirectory: '/', get: () => '/' } : undefined),
  }, normalizeConfig({}))
  const root = await outside.info({})
  assert.equal(root.cwd, '/')
  assert.equal(root.worktree, false)
  assert.equal(root.branch, null)
  assert.equal(root.repo, null)
})

test('the shipped skill pin comes from the engine, and a short sha still matches', async () => {
  const { parseShippedRef, sameRef } = (await import('../dist/host/skills.js')) as any
  const help = [
    'Checks out the reviewed skills commit',
    'f52c4f04323bb2dfb21ca8be82e6494e9cd0b4d8',
    'and installs its 25 skills directly into the standard global agent-skills directory.',
  ].join('\n')
  assert.equal(parseShippedRef(help), 'f52c4f04323bb2dfb21ca8be82e6494e9cd0b4d8')
  assert.equal(parseShippedRef('no commit in this text'), null)
  assert.equal(parseShippedRef(undefined), null)

  assert.equal(sameRef('f52c4f04', 'f52c4f04323bb2dfb21ca8be82e6494e9cd0b4d8'), true, 'a short sha names the same commit')
  assert.equal(sameRef('F52C4F04323BB2DFB21CA8BE82E6494E9CD0B4D8', 'f52c4f04323bb2dfb21ca8be82e6494e9cd0b4d8'), true)
  assert.equal(sameRef('aaaaaaa', 'bbbbbbb'), false)
  assert.equal(sameRef(null, 'f52c4f04'), false, 'an unknown side is never "different"')
  assert.equal(sameRef('short', 'f52c4f04'), false, 'too short to be a commit')
})

test('git status is read as branch, drift and a dirty count', async () => {
  const { parseGitStatus } = (await import('../dist/host/workspace.js')) as any

  const dirty = [
    '## main...origin/main [ahead 2, behind 1]',
    ' M client.js',
    'M  docs/CONTRACT.md',
    '?? host/workspace.js',
    'UU conflict.md',
    '',
  ].join('\n')
  assert.deepEqual(parseGitStatus(dirty), {
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
    changed: 3,
    untracked: 1,
    clean: false,
  })

  // Level with the upstream: git prints the branch line with no bracket at all.
  assert.deepEqual(parseGitStatus('## main...origin/main\n'), {
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    changed: 0,
    untracked: 0,
    clean: true,
  })

  // No upstream configured, so there is no drift to report.
  assert.deepEqual(parseGitStatus('## feature/local\n?? notes.md\n'), {
    upstream: null,
    ahead: 0,
    behind: 0,
    changed: 0,
    untracked: 1,
    clean: false,
  })

  // An upstream whose remote branch is gone still names itself.
  assert.equal(parseGitStatus('## main...origin/main [gone]\n').upstream, 'origin/main')
  // A detached HEAD has no branch line with dots, so no upstream and no drift.
  assert.deepEqual(parseGitStatus('## HEAD (no branch)\n'), {
    upstream: null,
    ahead: 0,
    behind: 0,
    changed: 0,
    untracked: 0,
    clean: true,
  })
})

test('the workspace action reports this checkout\'s working tree', async () => {
  const { createWorkspace } = (await import('../dist/host/workspace.js')) as any
  const workspace = createWorkspace({
    get: (name: any) => (name === 'workingDirectory' ? { defaultDirectory: process.cwd(), get: () => process.cwd() } : undefined),
  }, normalizeConfig({}))
  const info = await workspace.info({})
  assert.equal(typeof info.changed, 'number')
  assert.equal(typeof info.untracked, 'number')
  assert.equal(info.clean, info.changed === 0 && info.untracked === 0, 'clean is exactly "nothing to commit"')
  assert.equal(typeof info.ahead, 'number')
  assert.equal(typeof info.behind, 'number')
})

test('the build finds the project a directory builds', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { findProject, projectName } = (await import('../dist/host/build.js')) as any

  const root = mkdtempSync(join(tmpdir(), 'asc-hub-build-'))
  assert.equal(findProject(root), null, 'an empty directory has nothing to build')

  // One level down, a project; a generated Pods project must never win.
  mkdirSync(join(root, 'ios', 'App.xcodeproj'), { recursive: true })
  mkdirSync(join(root, 'ios', 'Pods', 'Pods.xcodeproj'), { recursive: true })
  assert.equal(findProject(root).kind, 'project')
  assert.equal(projectName(findProject(root)), 'App.xcodeproj')

  // A workspace beside it wins, because it carries the dependency graph.
  mkdirSync(join(root, 'ios', 'App.xcworkspace'), { recursive: true })
  const found = findProject(root)
  assert.equal(found.kind, 'workspace')
  assert.equal(projectName(found), 'App.xcworkspace')
  assert.equal(found.depth, 1)

  // node_modules and hidden directories are never searched.
  mkdirSync(join(root, 'node_modules', 'evil.xcworkspace'), { recursive: true })
  assert.equal(findProject(root).kind, 'workspace')

  writeFileSync(join(root, 'README.md'), '# app\n')
})

test('xcodebuild -list output is read as schemes, whatever shape it has', async () => {
  const { parseSchemes } = (await import('../dist/host/build.js')) as any
  assert.deepEqual(parseSchemes(JSON.stringify({ workspace: { schemes: ['App', 'AppTests'] } })), ['App', 'AppTests'])
  assert.deepEqual(parseSchemes(JSON.stringify({ project: { schemes: ['Only'] } })), ['Only'])
  assert.deepEqual(parseSchemes(JSON.stringify({ workspace: { schemes: [] } })), [])
  assert.deepEqual(parseSchemes('not json'), [])
  assert.deepEqual(parseSchemes(''), [])
  assert.deepEqual(parseSchemes(JSON.stringify({ project: { schemes: ['', 3, 'App'] } })), ['App'])
})

test('a build passes the version as a build setting, never a project edit', async () => {
  const { buildArgv } = (await import('../dist/host/build.js')) as any
  const argv = buildArgv({
    kind: 'workspace',
    projectPath: '/repo/ios/App.xcworkspace',
    scheme: 'App',
    version: '1.2.5',
    buildNumber: '3',
    appId: '6811580598',
    archivePath: '/tmp/b/App.xcarchive',
    ipaPath: '/tmp/b/App.ipa',
  })
  assert.equal(argv.archive[0], 'xcode')
  assert.equal(argv.archive[1], 'archive')
  assert.deepEqual(argv.archive.slice(2, 4), ['--workspace', '/repo/ios/App.xcworkspace'])
  assert.ok(argv.archive.includes('--xcodebuild-flag=MARKETING_VERSION=1.2.5'), 'version travels as a build setting')
  assert.ok(argv.archive.includes('--xcodebuild-flag=CURRENT_PROJECT_VERSION=3'))
  assert.ok(argv.archive.includes('--archive-path'))
  assert.ok(argv.archive.includes('--overwrite'))
  assert.deepEqual(argv.export.slice(0, 2), ['xcode', 'export'])
  assert.ok(argv.export.includes('--ipa-path'))
  assert.deepEqual(argv.upload.slice(0, 2), ['builds', 'upload'])
  assert.ok(argv.upload.includes('--app') && argv.upload.includes('6811580598'))
  assert.equal(argv.upload[argv.upload.length - 1], '--wait', 'the upload waits for App Store Connect')

  // A bare project and no version: no build-setting flags, still a project flag.
  const project = buildArgv({
    kind: 'project',
    projectPath: '/repo/App.xcodeproj',
    scheme: 'App',
    version: null,
    buildNumber: null,
    appId: '1',
    archivePath: '/tmp/a.xcarchive',
    ipaPath: '/tmp/a.ipa',
  })
  assert.deepEqual(project.archive.slice(2, 4), ['--project', '/repo/App.xcodeproj'])
  assert.equal(project.archive.some((flag: any) => flag.startsWith('--xcodebuild-flag=')), false)
})

test('build readiness names the reason, and iOS is decided by the project file', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { createBuild } = (await import('../dist/host/build.js')) as any

  const build = createBuild({ get: () => undefined }, normalizeConfig({}), {}, {
    detect: async () => ({ installed: true, path: '/opt/homebrew/bin/asc' }),
  })

  const empty = mkdtempSync(join(tmpdir(), 'asc-hub-noproj-'))
  const nothing = await build.facts(empty)
  assert.equal(nothing.ready, false)
  assert.ok(nothing.reason === 'no-project' || nothing.reason === 'no-xcode', nothing.reason)

  const app = mkdtempSync(join(tmpdir(), 'asc-hub-ios-'))
  mkdirSync(join(app, 'App.xcodeproj'), { recursive: true })
  writeFileSync(join(app, 'App.xcodeproj', 'project.pbxproj'), 'IPHONEOS_DEPLOYMENT_TARGET = 17.0;\n')
  const ios = await build.facts(app)
  assert.equal(ios.ios, true, 'the deployment target is what makes it an iOS project')
  assert.equal(ios.kind, 'project')
  assert.equal(ios.ready, false)
  assert.ok(['no-xcode', 'unloadable'].includes(ios.reason), ios.reason)

  const mac = mkdtempSync(join(tmpdir(), 'asc-hub-mac-'))
  mkdirSync(join(mac, 'Desk.xcodeproj'), { recursive: true })
  writeFileSync(join(mac, 'Desk.xcodeproj', 'project.pbxproj'), 'SDKROOT = macosx;\n')
  const desktop = await build.facts(mac)
  assert.equal(desktop.ios, false, 'a macOS project is not an iOS one')
  assert.ok(['not-ios', 'no-xcode'].includes(desktop.reason), desktop.reason)
})

test('readiness reads the blockers from asc validate, not from its stderr', async () => {
  const { createOps } = (await import('../dist/host/ops.js')) as any
  const ops = createOps({}, normalizeConfig({ defaultAppId: 'app-1' }), {
    run: async () => ({
      exitCode: 1,
      json: {
        versionString: '1.2.5',
        summary: { errors: 1, warnings: 2, infos: 2, blocking: 1 },
        remediation: {
          steps: [
            {
              order: 1,
              blocking: true,
              severity: 'error',
              checkId: 'version.state.editable',
              message: 'version is in non-editable state "READY_FOR_DISTRIBUTION"',
              remediation: 'Use an editable version state before submission',
            },
            { order: 2, blocking: false, severity: 'warning', checkId: 'subscriptions.images.recommended', message: 'no promo image' },
            { order: 3, blocking: false, severity: 'warning', checkId: 'subscriptions.images.recommended', message: 'no promo image' },
            { order: 4, blocking: false, severity: 'info', checkId: 'build.upload_requirement.sdk_unverified', message: 'sdk' },
          ],
        },
        checks: [{ id: 'version.state.editable', severity: 'error', message: 'version is in non-editable state' }],
      },
      stdout: '',
      stderr: 'Using version 1.2.5 (READY_FOR_DISTRIBUTION) for platform IOS; pass --version to override',
    }),
  }, { detect: async () => ({ installed: true, path: '/opt/homebrew/bin/asc' }) })

  const data = await ops.readiness({ appId: 'app-1' })
  assert.equal(data.ready, false)
  assert.equal(data.blockers.length, 1, 'only the blocking step is a blocker')
  assert.equal(data.blockers[0].code, 'version.state.editable')
  assert.match(data.blockers[0].message, /non-editable state/)
  assert.equal(data.blockers[0].detail, 'Use an editable version state before submission')
  assert.equal(data.warnings, 2, 'warnings are counted, not turned into blockers')
  assert.equal(data.blockers.some((blocker: any) => blocker.code === 'ASC_FAILED'), false, 'stderr notice is not a blocker')
})

test('readiness falls back to a hard error in checks, and to a clean pass', async () => {
  const { createOps } = (await import('../dist/host/ops.js')) as any
  const make = (json: any, exitCode: number) => createOps({}, normalizeConfig({ defaultAppId: 'a' }), {
    run: async () => ({ exitCode, json, stdout: '', stderr: '' }),
  }, { detect: async () => ({ installed: true, path: '/x' }) })

  const onlyChecks = await make({
    checks: [{ id: 'build.missing', severity: 'error', message: 'no build attached' }],
  }, 1).readiness({ appId: 'a' })
  assert.equal(onlyChecks.ready, false)
  assert.equal(onlyChecks.blockers[0].code, 'build.missing')

  const clean = await make({ checks: [{ id: 'ok', severity: 'info', message: 'fine' }] }, 0).readiness({ appId: 'a' })
  assert.equal(clean.ready, true)
  assert.deepEqual(clean.blockers, [])
})

test('release status names the version id, its state and the review state', async () => {
  const { createOps } = (await import('../dist/host/ops.js')) as any
  const ops = createOps({}, normalizeConfig({ defaultAppId: 'a' }), {
    run: async () => ({
      exitCode: 0,
      json: {
        appstore: { versionId: 'v-9', version: '1.2.5', state: 'PENDING_DEVELOPER_RELEASE' },
        review: { state: 'COMPLETE', submittedDate: '2026-10-11T00:01:18Z' },
      },
      stdout: '',
      stderr: '',
    }),
  }, { detect: async () => ({ installed: true, path: '/x' }) })

  const status = await ops.releaseStatus({ appId: 'a' })
  assert.equal(status.versionId, 'v-9')
  assert.equal(status.version, '1.2.5')
  assert.equal(status.versionState, 'PENDING_DEVELOPER_RELEASE')
  assert.equal(status.reviewState, 'COMPLETE')
  assert.equal(status.state, 'PENDING_DEVELOPER_RELEASE', 'state keeps meaning "where the version is"')
  assert.equal(status.submittedDate, '2026-10-11T00:01:18Z')
})

test('releasing a version is one gated asc call for exactly that version', async () => {
  const { createOps } = (await import('../dist/host/ops.js')) as any
  const calls: any[] = []
  const record = async (args: any, options: any) => {
    calls.push({ args, options })
    return { exitCode: 0, json: { released: true }, stdout: '', stderr: '' }
  }
  const ops = createOps({}, normalizeConfig({ defaultAppId: 'a' }), { run: record, must: record }, {
    detect: async () => ({ installed: true, path: '/x' }),
  })

  const result = await ops.publishVersion({ versionId: 'v-9' })
  assert.equal(result.released, true)
  assert.deepEqual(calls[0].args, ['versions', 'release', '--version-id', 'v-9', '--confirm'])
  assert.equal(calls[0].options.path, '/x')

  await assert.rejects(() => ops.publishVersion({}), (error: any) => error.code === 'INVALID_INPUT')
})

test('versions say which build each one carries, and in what state', async () => {
  const { createOps } = (await import('../dist/host/ops.js')) as any
  const ops = createOps({}, normalizeConfig({ defaultAppId: 'a' }), {
    run: async () => ({
      exitCode: 0,
      json: {
        data: [
          {
            id: 'v-1',
            type: 'appStoreVersions',
            attributes: { versionString: '1.2.5', appVersionState: 'READY_FOR_DISTRIBUTION', appStoreState: 'READY_FOR_SALE' },
            relationships: { build: { data: { type: 'builds', id: 'build-a' } } },
          },
          {
            id: 'v-2',
            type: 'appStoreVersions',
            attributes: { versionString: '1.2.6', appVersionState: 'PREPARE_FOR_SUBMISSION' },
            relationships: { build: { data: null } },
          },
        ],
      },
      stdout: '',
      stderr: '',
    }),
  }, { detect: async () => ({ installed: true, path: '/x' }) })

  const { versions } = await ops.listVersions({ appId: 'a' })
  assert.equal(versions.length, 2)
  assert.deepEqual(versions[0], { id: 'v-1', version: '1.2.5', state: 'READY_FOR_DISTRIBUTION', buildId: 'build-a', createdDate: undefined })
  assert.equal(versions[1].buildId, null, 'a version without a build carries none')
  assert.equal(versions[1].state, 'PREPARE_FOR_SUBMISSION')
})

test('distributing to an external group also submits the beta review', async () => {
  const { createOps } = (await import('../dist/host/ops.js')) as any
  const calls: any[] = []
  const ops = createOps({}, normalizeConfig({ defaultAppId: 'a' }), {
    must: async (args: any, options: any) => {
      calls.push({ args, options })
      if (args[0] === 'testflight') {
        return {
          exitCode: 0,
          json: {
            data: [
              { id: 'g-in', name: 'Internal', internal: true },
              { id: 'g-ex', name: 'External', internal: false },
            ],
          },
          stdout: '',
          stderr: '',
        }
      }
      return { exitCode: 0, json: {}, stdout: '', stderr: '' }
    },
    run: async (args: any, options: any) => {
      calls.push({ args, options })
      return { exitCode: 0, json: {}, stdout: '', stderr: '' }
    },
  }, { detect: async () => ({ installed: true, path: '/x' }) })

  await ops.distribute({ appId: 'a', buildId: 'b-1', groupIds: ['g-in'] })
  const internal = calls.find((call) => call.args[0] === 'builds' && call.args[1] === 'add-groups')
  assert.deepEqual(internal.args, ['builds', 'add-groups', '--build-id', 'b-1', '--group', 'Internal'])
  assert.equal(internal.args.includes('--submit'), false, 'internal testers need no beta review')

  calls.length = 0
  await ops.distribute({ appId: 'a', buildId: 'b-1', groupIds: ['g-ex'] })
  const external = calls.find((call) => call.args[0] === 'builds' && call.args[1] === 'add-groups')
  assert.deepEqual(external.args, ['builds', 'add-groups', '--build-id', 'b-1', '--group', 'External', '--submit', '--confirm'])
})

test('submitting for review creates the version when nobody has', async () => {
  const { createOps } = (await import('../dist/host/ops.js')) as any
  const calls: any[] = []
  const ops = createOps({}, normalizeConfig({ defaultAppId: 'a' }), {
    run: async (args: any, options: any) => {
      calls.push({ args, options })
      if (args[0] === 'versions' && args[1] === 'list') {
        return { exitCode: 0, json: { data: [{ id: 'v-1', attributes: { versionString: '1.2.5' } }] }, stdout: '', stderr: '' }
      }
      return { exitCode: 0, json: {}, stdout: '', stderr: '' }
    },
    must: async (args: any, options: any) => {
      calls.push({ args, options })
      return { exitCode: 0, json: {}, stdout: '', stderr: '' }
    },
  }, { detect: async () => ({ installed: true, path: '/x' }) })

  await ops.submitRelease({ appId: 'a', buildId: 'b-1', version: '1.2.6' })
  const create = calls.find((call) => call.args[0] === 'versions' && call.args[1] === 'create')
  assert.deepEqual(create.args, ['versions', 'create', '--app', 'a', '--version', '1.2.6', '--platform', 'IOS'])
  const submit = calls.find((call) => call.args[0] === 'review')
  assert.deepEqual(submit.args, ['review', 'submit', '--app', 'a', '--build-id', 'b-1', '--confirm', '--version', '1.2.6'])

  // An existing version is used as it is: no create call.
  calls.length = 0
  await ops.submitRelease({ appId: 'a', buildId: 'b-1', version: '1.2.5' })
  assert.equal(calls.some((call) => call.args[0] === 'versions' && call.args[1] === 'create'), false)
})
