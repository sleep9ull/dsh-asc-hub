/**
 * The dispatcher: one implementation of every operation, shared by the Web
 * Client adapter (host/rpc.js) and the model adapter (host/tool.js).
 *
 * It owns the three things that must never be duplicated per adapter:
 *  1. gating — read-only mode, explicit confirmation, and approval;
 *  2. observation — the current operation and the last failure, which together
 *     produce the status the header button renders;
 *  3. the error envelope — a stable code, a safe message and redacted details.
 */

import { createAsc } from './asc.js'
import { readFileSync } from 'node:fs'
import { createAuth } from './auth.js'
import type { Auth, AuthState } from './auth.js'
import { createEngine } from './engine.js'
import type { EngineState } from './types.js'
import { createBuild } from './build.js'
import type { Build, BuildFacts } from './build.js'
import { createOps } from './ops.js'
import type { Ops } from './ops.js'
import { redact } from './redact.js'
import { detectSkills, installSkills, parseShippedRef, sameRef } from './skills.js'
import type { SkillPackState } from './skills.js'
import { createWorkspace } from './workspace.js'
import type { Workspace, WorkspaceInfo } from './workspace.js'
import type { AscMode, CallContext, CallOptions, HostContext, HubConfig } from './types.js'
import { errorCode, errorDetail, errorMessage, isRecord } from './types.js'

/** This plugin's own version, read once from the package manifest. */
const HUB_VERSION = (() => {
  try {
    // dist/host/ -> the package root, so the manifest travels with the build.
    const manifest: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    return isRecord(manifest) && typeof manifest.version === 'string' ? manifest.version : ''
  } catch {
    return ''
  }
})()

/** The update slot the footer reserves space for. */
export interface KnownUpdate {
  available: boolean
  scope: 'hub' | 'core' | null
  latest: string | null
}

/**
 * Whether a newer build of either half is known. Nothing probes a release feed yet,
 * so this is always "no"; the shape is what the footer reserves space for.
 */
function knownUpdate(): KnownUpdate {
  return { available: false, scope: null, latest: null }
}

/** An error that is safe to serialize to the client. */
export class HubError extends Error {
  /** Stable machine code from docs/CONTRACT.md §Errors. */
  readonly code: string
  /** Raw child output (redacted on the way out). */
  readonly detail: string | undefined

  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = 'HubError'
    this.code = code
    this.detail = detail
  }
}

function asHubError(error: unknown): HubError {
  if (error instanceof HubError) return error
  const code = errorCode(error) ?? 'ASC_FAILED'
  const message = errorMessage(error) ?? 'The asc operation failed.'
  // The detail is whatever the thrown value carried; `errorDetail` proves the
  // string case, which is the only one the wire envelope can carry.
  return new HubError(code, redact(message).slice(0, 600), errorDetail(error))
}

/**
 * Drop `undefined` members recursively.
 *
 * A tool result must be lossless JSON, and an optional field that is absent must
 * be absent rather than explicitly undefined; the same shape travels over the RPC
 * route, so both adapters get clean data from one place.
 */
export function jsonClean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonClean)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = jsonClean(item)
    }
    return out
  }
  return value
}

/** Which operation kind one action represents, for the status label. */
function operationKind(action: string): string {
  if (action.startsWith('builds.')) return 'upload'
  if (action.startsWith('testflight.')) return 'distribute'
  if (action === 'release.submit') return 'submit'
  if (action === 'engine.install') return 'install'
  if (action.startsWith('auth.')) return 'auth'
  return 'operation'
}

/** Map a phase plus the running operation to the user-facing trigger label. */
function labelFor(phase: string, operation: Operation | null): string {
  // `phase` is the panel's vocabulary (it decides which onboarding step to show);
  // `label` is the user's, and it deliberately has five words: everything before
  // onboarding finishes reads `asc: start`, whatever step is missing or running.
  if (phase === 'engine' || phase === 'login') return 'start'
  if (phase === 'busy') return operation?.kind === 'submit' ? 'review' : 'build'
  if (phase === 'error') return 'error'
  if (phase === 'ready') return 'ready'
  return 'start'
}

/** The running operation the trigger observes. */
export interface Operation {
  id: string
  kind: string
  startedAt: string
}

/** The last failure the trigger observes. */
export interface LastError {
  code: string
  message: string
  at: string
}

/** The three gating classes of an action. */
export type ActionKind = 'read' | 'write' | 'local-write'

/** One row of the action table. */
export interface ActionSpec {
  kind: ActionKind
  skipConfirm?: boolean
  quiet?: boolean
  clientOnly?: boolean
  run(input: Record<string, unknown>, options: CallOptions): unknown
}

/** The skill pack plus whether the engine ships a newer one. */
export interface SkillsStatus extends SkillPackState {
  shippedRef: string | null
  update: boolean
}

/** The workspace action's payload: where it works, and what it can build. */
export type WorkspaceStatus = WorkspaceInfo & { build: BuildFacts }

/** Derived state for the trigger and the panel (docs/CONTRACT.md §Hub state). */
export interface HubStatus {
  phase: string
  label: string
  engine: EngineState
  auth: AuthState
  app: null
  operation: Operation | null
  lastError: LastError | null
  mode: AscMode
  hub: { version: string }
  skills: SkillsStatus
  update: KnownUpdate
  checkedAt: string
}

/** The one thing both adapters talk to. */
export interface Hub {
  /**
   * Run one action. `T` is the wire shape the caller expects for that action
   * (`docs/CONTRACT.md` §Actions); the dispatcher itself only knows it is JSON.
   */
  call<T = unknown>(action: string, rawInput?: unknown, options?: CallContext): Promise<T>
  status(): Promise<HubStatus>
  actionNames: string[]
  ACTIONS: Record<string, ActionSpec>
  dispose(): void
  config: HubConfig
}

export function createHub(ctx: HostContext, rawConfig: HubConfig): Hub {
  // A private, editable copy: `normalizeConfig` freezes its result, and the footer's
  // mode switch has to change `mode` for this process without touching the row config.
  const config: HubConfig = { ...rawConfig }
  const asc = createAsc(ctx, config)
  const engine = createEngine(ctx, config, asc)
  const auth: Auth = createAuth(ctx, config, asc, engine)
  const ops: Ops = createOps(ctx, config, asc, engine)
  const workspace: Workspace = createWorkspace(ctx, config)
  const build: Build = createBuild(ctx, config, asc, engine)

  /** Where this session works, plus what that directory can build. */
  async function readWorkspace(input: Record<string, unknown>, options: CallOptions): Promise<WorkspaceStatus> {
    const info = await workspace.info(input, options)
    return { ...info, build: await build.facts(info.cwd) }
  }

  /** The pin the installed engine ships, parsed once per engine build. */
  let shippedSkills: { key: string | null; ref: string | null } = { key: null, ref: null }
  async function shippedSkillsRef(): Promise<string | null> {
    const state = await engine.detect()
    if (!state.installed || !state.path) return null
    const key = `${state.path}@${state.version ?? ''}`
    if (shippedSkills.key === key) return shippedSkills.ref
    const result = await asc.run(['install-skills', '--help'], {
      path: state.path,
      output: false,
      local: true,
      timeoutMs: 15_000,
    })
    const ref = result.exitCode === 0 ? parseShippedRef(`${result.stdout}\n${result.stderr}`) : null
    shippedSkills = { key, ref }
    return ref
  }

  /**
   * The inherited pack, plus whether the engine now ships a newer one. The pin is
   * read from the engine itself, so "there is an update" is a fact, not a guess.
   */
  async function readSkills(): Promise<SkillsStatus> {
    const state = await detectSkills()
    if (!state.installed || typeof state.ref !== 'string') {
      return { ...state, shippedRef: null, update: false }
    }
    const shipped = await shippedSkillsRef()
    return { ...state, shippedRef: shipped, update: shipped !== null && !sameRef(state.ref, shipped) }
  }

  let operation: Operation | null = null
  let lastError: LastError | null = null
  let sequence = 0

  const ACTIONS: Record<string, ActionSpec> = {
    status: { kind: 'read', run: () => status() },
    'engine.detect': { kind: 'read', run: () => engine.detect({ force: true }) },
    'engine.install': {
      // Installs a local binary and never touches App Store Connect, so onboarding
      // must stay available in read-only mode.
      kind: 'local-write',
      skipConfirm: true,
      run: (input, options) => engine.install(input.method, options),
    },
    'auth.status': { kind: 'read', run: () => auth.status() },
    'auth.doctor': { kind: 'read', run: () => auth.doctor() },
    'auth.login': { kind: 'local-write', clientOnly: true, run: (input, options) => auth.login(input, options) },
    'auth.importKey': { kind: 'local-write', clientOnly: true, run: (input, options) => auth.importKey(input, options) },
    'auth.logout': { kind: 'local-write', clientOnly: true, run: (input, options) => auth.logout(input, options) },
    'auth.switch': { kind: 'local-write', clientOnly: true, run: (input, options) => auth.switchProfile(input, options) },
    // Session-scoped mode switch for the panel's footer. It flips this process's
    // gating and the flags handed to asc; it is deliberately not persisted, so the
    // config row still decides what the next start does.
    'mode.set': {
      kind: 'local-write',
      clientOnly: true,
      run: (input) => {
        const next = input !== null && typeof input === 'object' && typeof input.mode === 'string' ? input.mode : ''
        if (next !== 'read-only' && next !== 'write') {
          throw new HubError('INVALID_INPUT', '`mode` must be "read-only" or "write".')
        }
        config.mode = next
        return status()
      },
    },
    // The footer's update tag. The core half can be reinstalled from here; the plugin
    // half belongs to the Plugin Manager, which owns installation, so it says so.
    'update.apply': {
      kind: 'local-write',
      skipConfirm: true,
      clientOnly: true,
      run: async (input, options) => {
        const scope = input !== null && typeof input === 'object' && typeof input.scope === 'string' ? input.scope : ''
        if (scope === 'core') return engine.install('brew', options)
        throw new HubError(
          'MANUAL_UPDATE_REQUIRED',
          'Update dsh-asc-hub from the Plugin Manager: it owns installation and versions.',
        )
      },
    },
    // The inherited skill pack: detect what `asc install-skills` put on this machine,
    // and run that same installer on request. Both are local — no App Store Connect.
    'skills.detect': { kind: 'read', run: () => readSkills() },
    'skills.install': {
      kind: 'local-write',
      skipConfirm: true,
      quiet: true,
      run: async (input, options) => installSkills({
        run: (argv, request) => asc.run(argv, {
          output: false,
          local: true,
          timeoutMs: request.deadlineMs,
          signal: options.signal,
        }),
      }),
    },
    // Where this session works: the Harness's effective directory plus the git
    // facts a person reads at a glance. Panel-only, because the model already knows
    // its own directory from the system prompt.
    'workspace.info': { kind: 'read', clientOnly: true, run: (input, options) => readWorkspace(input, options) },
    // Build the checkout this session is working on: archive, export an .ipa, upload
    // it and wait for Apple. The unit of work is the directory, never a chosen file.
    'build.create': {
      kind: 'write',
      // Panel-only: the build needs the session's directory, which only the panel
      // knows. The model can run the same asc commands itself when it means to.
      clientOnly: true,
      run: (input, options) => build.create({
        ...input,
        cwd: workspace.directory(typeof input.sessionId === 'string' ? input.sessionId : ''),
      }, options),
    },
    'apps.list': { kind: 'read', run: (input, options) => ops.listApps(input, options) },
    'builds.list': { kind: 'read', run: (input, options) => ops.listBuilds(input, options) },
    'builds.upload': { kind: 'write', run: (input, options) => ops.uploadBuild(input, options) },
    'testflight.groups': { kind: 'read', run: (input, options) => ops.listGroups(input, options) },
    'testflight.distribute': { kind: 'write', run: (input, options) => ops.distribute(input, options) },
    'testflight.submitBeta': { kind: 'write', run: (input, options) => ops.submitBeta(input, options) },
    'release.readiness': { kind: 'read', run: (input, options) => ops.readiness(input, options) },
    'release.status': { kind: 'read', run: (input, options) => ops.releaseStatus(input, options) },
    // App Store release of an approved version: the second half of the review flow.
    'release.versions': { kind: 'read', run: (input, options) => ops.listVersions(input, options) },
    'release.publish': { kind: 'write', run: (input, options) => ops.publishVersion(input, options) },
    'release.submit': { kind: 'write', run: (input, options) => ops.submitRelease(input, options) },
    'sales.summary': { kind: 'read', run: (input, options) => ops.salesSummary(input, options) },
    'analytics.reports': { kind: 'read', run: (input, options) => ops.analyticsReports(input, options) },
    run: { kind: 'read', run: (input, options) => runEscapeHatch(input, options) },
  }

  const actionNames = Object.keys(ACTIONS)

  /**
   * Escape hatch for commands the typed surface does not cover yet. It is
   * read-only by construction: mutating subcommands are refused, and read-only
   * mode is also enforced by asc itself through the global `--read-only` flag.
   */
  async function runEscapeHatch(input: Record<string, unknown>, options: CallOptions): Promise<unknown> {
    const argv = Array.isArray(input.argv)
      ? input.argv.filter((item): item is string => typeof item === 'string')
      : []
    if (argv.length === 0) throw new HubError('INVALID_INPUT', '`argv` must be a non-empty array of strings.')
    const forbidden = new Set([
      'auth',
      'web',
      'install-skills',
      'init',
      'distribute',
      'promo',
      'publish',
      'release',
      'review',
      'submit',
      'metadata',
      'versions',
      'testflight',
      'builds',
    ])
    if (forbidden.has(String(argv[0]))) {
      throw new HubError('INVALID_INPUT', `\`${argv[0]}\` is not available through the escape hatch; use a typed action.`)
    }
    const state = await engine.detect()
    if (!state.installed || !state.path) throw new HubError('ASC_NOT_INSTALLED', 'The asc engine is not installed.')
    const result = await asc.runAuto(argv, {
      path: state.path,
      timeoutMs: Math.min(Math.max(Number(input.timeoutMs) || config.timeoutMs, 5_000), config.longTimeoutMs),
      cwd: typeof input.cwd === 'string' ? input.cwd : process.cwd(),
      // The escape hatch is read-only by construction, in every mode: asc's own
      // kill switch is forced on, so a mutating command fails closed at exit 6
      // instead of relying on a denylist staying complete.
      forceReadOnly: true,
      signal: options.signal,
    })
    return {
      exitCode: result.exitCode,
      stdout: redact(result.stdout),
      stderr: redact(result.stderr),
      json: result.json,
      redacted: true,
    }
  }

  /** Derived state for the trigger and the panel. */
  async function status(): Promise<HubStatus> {
    const engineState = await engine.detect()
    let authState: AuthState = {
      configured: false,
      profiles: [],
      activeProfile: null,
      storage: null,
      environment: { provided: false, complete: false },
    }
    if (engineState.installed) {
      try {
        authState = await auth.status()
      } catch {
        // A failing status probe is not a panel failure; onboarding stays at login.
      }
    }
    // Order matches docs/CONTRACT.md §Hub state: engine -> login -> busy -> error -> ready.
    const phase: string =
      !engineState.installed || operation?.kind === 'install'
        ? 'engine'
        : !authState.configured
          ? 'login'
          : operation !== null
            ? 'busy'
            : lastError !== null
              ? 'error'
              : 'ready'
    return {
      phase,
      label: labelFor(phase, operation),
      engine: engineState,
      auth: authState,
      app: null,
      operation,
      lastError,
      mode: config.mode,
      hub: { version: HUB_VERSION },
      // Whether the inherited skill pack is on this machine, and whether the engine
      // ships a newer one; the console shows it in one quiet row and the model learns
      // it from `status` for free.
      skills: await readSkills(),
      update: knownUpdate(),
      checkedAt: new Date().toISOString(),
    }
  }

  /**
   * Run one action.
   */
  async function call<T = unknown>(action: string, rawInput?: unknown, options: CallContext = {}): Promise<T> {
    const spec = ACTIONS[action]
    if (!spec) {
      throw new HubError('UNSUPPORTED_ACTION', `Unknown action: ${String(action)}`)
    }
    if (rawInput !== undefined && rawInput !== null && !isRecord(rawInput)) {
      throw new HubError('INVALID_INPUT', '`input` must be a JSON object.')
    }
    const input: Record<string, unknown> = isRecord(rawInput) ? rawInput : {}

    if (spec.kind === 'write') {
      if (config.mode !== 'write') {
        throw new HubError(
          'READ_ONLY_MODE',
          'This profile runs asc-hub in read-only mode. Set `mode: write` in the plugin configuration to allow publishing.',
        )
      }
      if (spec.skipConfirm !== true && input.confirm !== true) {
        throw new HubError('CONFIRM_REQUIRED', 'This action changes App Store Connect state; confirm it explicitly.')
      }
    }

    if (spec.clientOnly === true && options.caller === 'tool') {
      throw new HubError(
        'CLIENT_ONLY',
        String(action).startsWith('auth.')
          ? 'Signing in and out is a human action in the ASC Hub panel; ask the user to do it there.'
          : 'This action belongs to the ASC Hub panel; ask the user to do it there.',
      )
    }

    const started = new Date().toISOString()
    // Reads never make the button look busy; installing and signing in do, so the
    // user sees that onboarding is working.
    // `quiet` actions still gate, run and report errors, but they do not take over
    // the trigger's five-word vocabulary (installing the inherited skill pack is
    // housekeeping, not a build).
    const tracked = spec.kind !== 'read' && spec.quiet !== true
    if (tracked) {
      operation = { id: `${Date.now()}-${++sequence}`, kind: operationKind(action), startedAt: started }
    }
    try {
      const value = await spec.run(input, { signal: options.signal })
      lastError = null
      // The value is lossless JSON by construction (`jsonClean`); `T` is the shape
      // the caller declared, which only the wire contract can promise.
      return jsonClean(value) as T
    } catch (error) {
      const hubError = asHubError(error)
      // A cancelled call is not a product failure; do not paint the button red.
      if (!options.signal?.aborted) {
        lastError = { code: hubError.code, message: hubError.message, at: new Date().toISOString() }
      }
      throw hubError
    } finally {
      if (tracked) operation = null
    }
  }

  function dispose(): void {
    asc.dispose()
  }

  return { call, status, actionNames, ACTIONS, dispose, config }
}
