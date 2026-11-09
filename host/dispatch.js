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
import { createAuth } from './auth.js'
import { createEngine } from './engine.js'
import { createOps } from './ops.js'
import { redact } from './redact.js'

/** An error that is safe to serialize to the client. */
export class HubError extends Error {
  /**
   * @param {string} code stable machine code
   * @param {string} message safe to show
   * @param {string | undefined} detail raw child output (redacted on the way out)
   */
  constructor(code, message, detail) {
    super(message)
    this.name = 'HubError'
    this.code = code
    this.detail = detail
  }
}

function asHubError(error) {
  if (error instanceof HubError) return error
  const code = typeof error?.code === 'string' ? error.code : 'ASC_FAILED'
  const message = typeof error?.message === 'string' ? error.message : 'The asc operation failed.'
  return new HubError(code, redact(message).slice(0, 600), error?.detail)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Drop `undefined` members recursively.
 *
 * A tool result must be lossless JSON, and an optional field that is absent must
 * be absent rather than explicitly undefined; the same shape travels over the RPC
 * route, so both adapters get clean data from one place.
 * @param {unknown} value
 * @returns {unknown}
 */
export function jsonClean(value) {
  if (Array.isArray(value)) return value.map(jsonClean)
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = jsonClean(item)
    }
    return out
  }
  return value
}

/** Which operation kind one action represents, for the status label. */
function operationKind(action) {
  if (action.startsWith('builds.')) return 'upload'
  if (action.startsWith('testflight.')) return 'distribute'
  if (action === 'release.submit') return 'submit'
  if (action === 'engine.install') return 'install'
  if (action.startsWith('auth.')) return 'auth'
  return 'operation'
}

/** Map a phase plus the running operation to the user-facing trigger label. */
function labelFor(phase, operation) {
  // `phase` is the panel's vocabulary (it decides which onboarding step to show);
  // `label` is the user's, and it deliberately has five words: everything before
  // onboarding finishes reads `asc: start`, whatever step is missing or running.
  if (phase === 'engine' || phase === 'login') return 'start'
  if (phase === 'busy') return operation?.kind === 'submit' ? 'review' : 'build'
  if (phase === 'error') return 'error'
  if (phase === 'ready') return 'ready'
  return 'start'
}

/**
 * @param {any} ctx Host context
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 */
export function createHub(ctx, config) {
  const asc = createAsc(ctx, config)
  const engine = createEngine(ctx, config, asc)
  const auth = createAuth(ctx, config, asc, engine)
  const ops = createOps(ctx, config, asc, engine)

  /** @type {{ id: string, kind: string, startedAt: string } | null} */
  let operation = null
  /** @type {{ code: string, message: string, at: string } | null} */
  let lastError = null
  let sequence = 0

  /** @type {Record<string, { kind: 'read'|'write'|'local-write', skipConfirm?: boolean, clientOnly?: boolean, run: (input: any, options: any) => Promise<any> }>} */
  const ACTIONS = {
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
    'apps.list': { kind: 'read', run: (input, options) => ops.listApps(input, options) },
    'builds.list': { kind: 'read', run: (input, options) => ops.listBuilds(input, options) },
    'builds.upload': { kind: 'write', run: (input, options) => ops.uploadBuild(input, options) },
    'testflight.groups': { kind: 'read', run: (input, options) => ops.listGroups(input, options) },
    'testflight.distribute': { kind: 'write', run: (input, options) => ops.distribute(input, options) },
    'testflight.submitBeta': { kind: 'write', run: (input, options) => ops.submitBeta(input, options) },
    'release.readiness': { kind: 'read', run: (input, options) => ops.readiness(input, options) },
    'release.status': { kind: 'read', run: (input, options) => ops.releaseStatus(input, options) },
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
  async function runEscapeHatch(input, options) {
    const argv = Array.isArray(input.argv) ? input.argv.filter((item) => typeof item === 'string') : []
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
  async function status() {
    const engineState = await engine.detect()
    let authState = {
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
    const phase =
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
      checkedAt: new Date().toISOString(),
    }
  }

  /**
   * Run one action.
   * @param {string} action
   * @param {Record<string, unknown>} rawInput
   * @param {{ caller?: 'client' | 'tool', signal?: AbortSignal }} options
   */
  async function call(action, rawInput, options = {}) {
    const spec = ACTIONS[action]
    if (!spec) {
      throw new HubError('UNSUPPORTED_ACTION', `Unknown action: ${String(action)}`)
    }
    if (rawInput !== undefined && rawInput !== null && !isRecord(rawInput)) {
      throw new HubError('INVALID_INPUT', '`input` must be a JSON object.')
    }
    const input = isRecord(rawInput) ? rawInput : {}

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
        'Signing in and out is a human action in the ASC Hub panel; ask the user to do it there.',
      )
    }

    const started = new Date().toISOString()
    // Reads never make the button look busy; installing and signing in do, so the
    // user sees that onboarding is working.
    const tracked = spec.kind !== 'read'
    if (tracked) {
      operation = { id: `${Date.now()}-${++sequence}`, kind: operationKind(action), startedAt: started }
    }
    try {
      const value = await spec.run(input, { signal: options.signal })
      lastError = null
      return jsonClean(value)
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

  function dispose() {
    asc.dispose()
  }

  return { call, status, actionNames, ACTIONS, dispose, config }
}
