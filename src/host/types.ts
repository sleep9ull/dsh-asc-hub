/**
 * Shared Host-side type surface for the strict TypeScript build.
 *
 * The Harness runtime this plugin mounts into publishes no types for the services
 * it hands a plugin (`subprocess`, `sessions`, `workingDirectory`, `connection`,
 * `skills`, `tools`). This module declares the minimal structural shapes the
 * plugin actually uses, plus small readers that prove them at runtime, so a
 * missing service is still a quiet `undefined` rather than a thrown import.
 *
 * `asc` output stays `unknown` everywhere: host/asc.js decodes it and every
 * operation narrows at the point of use.
 *
 * @module host/types
 */

// ------------------------------------------------------------- primitives ---

/** A JSON object, as opposed to `null`, an array or a scalar. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The `code` the dispatcher reads off a thrown value. */
export function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined
}

/** The `detail` the dispatcher reads off a thrown value. */
export function errorDetail(error: unknown): string | undefined {
  return isRecord(error) && typeof error.detail === 'string' ? error.detail : undefined
}

/** The `message` the dispatcher reads off a thrown value. */
export function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && typeof error.message === 'string') return error.message
  return isRecord(error) && typeof error.message === 'string' ? error.message : undefined
}

/**
 * The plain `Error` this Host half throws below the dispatcher, carrying the
 * contract's machine code and the (already redacted) child output.
 */
export type HostError = Error & { code?: string; detail?: string; result?: unknown }

/** Build one; the fields are exactly what the dispatcher and adapters read. */
export function hostError(code: string, message: string, detail?: string): HostError {
  const error: HostError = new Error(message)
  error.code = code
  error.detail = detail
  return error
}

// ---------------------------------------------------------------- config ---

/** `read-only` gates every mutating App Store Connect action. */
export type AscMode = 'read-only' | 'write'

/** The normalized Loader-row configuration (`host/config.js` produces this). */
export interface HubConfig {
  ascPath: string
  profile: string | null
  mode: AscMode
  requireApproval: boolean
  timeoutMs: number
  longTimeoutMs: number
  maxOutputBytes: number
  telemetryDisabled: boolean
  bypassKeychain: boolean
  defaultAppId: string | null
  vendorNumber: string | null
}

/** The config slice the global `asc` flags read. */
export type FlagConfig = Pick<HubConfig, 'profile' | 'mode'>

/** The config slice the child environment reads. */
export type EnvConfig = Pick<HubConfig, 'telemetryDisabled' | 'bypassKeychain' | 'mode'>

/** What one call may carry: a cancellation signal from the caller. */
export interface CallOptions {
  signal?: AbortSignal
}

/** Who is calling: the panel or the model (the dispatcher gates on it). */
export interface CallContext extends CallOptions {
  caller?: 'client' | 'tool'
}

// ------------------------------------------------------------ Host context ---

export interface HostLogger {
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
  debug?(message: string): void
}

/** One tool call as `tools/pre-execute` sees it. */
export interface ToolExecRequest {
  name?: string
  arguments?: Record<string, unknown>
  signal?: AbortSignal
}

/** Continue the tool pipeline. */
export type ToolNext = () => unknown

/**
 * The Cordis plugin context, narrowed to what this Host half touches.
 * Everything else arrives through `get`, which answers `unknown` by design.
 */
export interface HostContext {
  /** Resolve an optional Harness service by name; absent services are `undefined`. */
  get(name: string): unknown
  /** Own a disposable inside this plugin's fiber. */
  effect(setup: () => (() => void) | void, label?: string): unknown
  /** Subscribe to a Host event. */
  on(
    event: 'tools/pre-execute',
    handler: (exec: ToolExecRequest, next: ToolNext) => unknown,
  ): unknown
  logger?: HostLogger
}

// ------------------------------------------------------------ subprocess ---

/** One collected output stream the subprocess service spilled. */
export interface SubprocessCollection {
  readFrom(offset: number): { text: string } | undefined
}

export interface SubprocessOutcome {
  exitCode: number | null
  signal: string | null
}

export interface SubprocessHandle {
  done: Promise<SubprocessOutcome>
  collected?: {
    stdout?: SubprocessCollection
    stderr?: SubprocessCollection
  }
}

export interface SubprocessRequest {
  argv: readonly string[]
  cwd: string
  stdio: {
    stdin: 'ignore'
    stdout: { maxBytes: number; spill: { maxBytes: number } }
    stderr: { maxBytes: number; spill: { maxBytes: number } }
  }
  graceMs: number
  signal: AbortSignal
  env: Record<string, string>
}

/** The Harness's own process discipline; used when a profile mounts it. */
export interface SubprocessService {
  spawn?(request: SubprocessRequest): SubprocessHandle
  resolveExecutable?(command: string): string | undefined | Promise<string | undefined>
}

/** What one child process did, whichever execution world ran it. */
export interface ExecResult {
  exitCode: number | null
  signalName: string | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted: boolean
  durationMs: number
}

/** One prepared child-process invocation. */
export interface ProcessRequest {
  argv: readonly string[]
  cwd?: string
  timeoutMs: number
  maxBytes: number
  env: Record<string, string>
  signal?: AbortSignal
}

/** The `ctx.subprocess` service, read structurally (it is unpublished). */
export function subprocessService(ctx: HostContext): SubprocessService | undefined {
  const value = ctx.get('subprocess')
  if (!isRecord(value)) return undefined
  const spawn = value.spawn
  const resolveExecutable = value.resolveExecutable
  if (typeof spawn !== 'function' && typeof resolveExecutable !== 'function') return undefined
  // `.call(value, …)` keeps the service as the receiver: these are class methods
  // in the Harness, and calling them unbound would lose `this`.
  return {
    spawn: typeof spawn === 'function' ? (request) => spawn.call(value, request) : undefined,
    resolveExecutable: typeof resolveExecutable === 'function'
      ? (command) => resolveExecutable.call(value, command)
      : undefined,
  }
}

// ------------------------------------------------------------------- asc ---

/** Options shared by every `asc` invocation. */
export interface AscRunOptions {
  path?: string | null
  cwd?: string
  timeoutMs?: number
  signal?: AbortSignal
  output?: boolean
  outputFormat?: string
  extraEnv?: Record<string, string>
  maxBytes?: number
  local?: boolean
  forceReadOnly?: boolean
}

/**
 * What the asc seam hands back. `missing` reports a call that never ran because
 * no engine was configured (absent means it ran); everything else is the child's
 * verdict. `json` stays `unknown`: decoding it to a shape is the caller's call.
 */
export interface AscOutcome {
  missing?: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  json: unknown
}

/** One completed asc invocation; `argv` is what actually ran. */
export interface AscResult extends AscOutcome {
  /** Absent when the call never ran because no engine was configured. */
  argv?: string[]
}

/** The slice of the asc client an operation module needs. */
export interface AscRunner {
  run(args: readonly string[], options?: AscRunOptions): Promise<AscResult>
}

/** The throwing variant, for a command whose non-zero exit is an error. */
export interface AscMust {
  must(args: readonly string[], options?: AscRunOptions): Promise<AscResult>
}

/** The full seam `host/asc.js` creates: build argv, run, decode, classify. */
export interface AscClient {
  run(args: readonly string[], options?: AscRunOptions): Promise<AscResult>
  runAuto(args: readonly string[], options?: AscRunOptions): Promise<AscResult>
  must(args: readonly string[], options?: AscRunOptions): Promise<AscResult>
  track(controller: AbortController): () => boolean
  dispose(): void
}

// ---------------------------------------------------------------- engine ---

/** The three facts every caller of detection needs. */
export interface EngineSnapshot {
  installed: boolean
  path: string | null
  version?: string | null
}

/** Full detection output. */
export interface EngineState extends EngineSnapshot {
  version: string | null
  source: string
  brew: { installed: boolean; path: string | null }
  checkedAt: string
}

/** Detection as the operation modules use it. */
export interface EngineDetector {
  detect(options?: { force?: boolean }): Promise<EngineSnapshot>
}

/** What an install attempt reports back. */
export interface EngineInstallResult {
  method: string
  log: string
  fallback?: boolean
  fallbackReason?: 'brew-missing' | 'brew-failed'
}

// ---------------------------------------------------------------- tooling ---

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  timeoutMs: number
  output: {
    schema: Record<string, unknown>
    render(args: Record<string, unknown>, value: unknown): Array<{ type: string; text: string }>
  }
  execute(args: Record<string, unknown>, exec: { signal?: AbortSignal }): Promise<unknown>
}

export interface ToolRegistry {
  register(definition: ToolDefinition): (() => void) | void
}

/** The `ctx.tools` service, read structurally. */
export function toolRegistry(value: unknown): ToolRegistry | undefined {
  if (!isRecord(value) || typeof value.register !== 'function') return undefined
  const register = value.register
  return {
    register: (definition) => {
      // The registry method keeps its own object as `this`.
      const dispose: (() => void) | void = register.call(value, definition)
      return dispose
    },
  }
}

// ---------------------------------------------------------------- skills ---

export interface SkillDefinition {
  name: string
  description: string
  whenToUse?: string
  content: string
  source: string
}

export interface SkillRegistry {
  register(definition: SkillDefinition): (() => void) | void
}

/** The `ctx.skills` service, read structurally; registration stays optional. */
export function skillRegistry(ctx: HostContext): SkillRegistry | undefined {
  const value = ctx.get('skills')
  if (!isRecord(value) || typeof value.register !== 'function') return undefined
  const register = value.register
  return {
    register: (definition) => {
      const dispose: (() => void) | void = register.call(value, definition)
      return dispose
    },
  }
}

// ------------------------------------------------------------ connection ---

/** One exact Fetch route on the `/api` bridge. */
export interface FetchRoute {
  path: string
  methods: readonly string[]
  requestBody: string
  fetch(request: Request): Promise<Response> | Response
}

export interface FetchRegistry {
  register(route: FetchRoute): () => void
}

/** The `ctx.connection` service's route registry, read structurally. */
export function fetchRegistry(ctx: HostContext): FetchRegistry | undefined {
  const connection = ctx.get('connection')
  if (!isRecord(connection)) return undefined
  const registry = connection.fetch
  if (!isRecord(registry) || typeof registry.register !== 'function') return undefined
  const register = registry.register
  return {
    register: (route) => {
      const dispose: () => void = register.call(registry, route)
      return dispose
    },
  }
}

// ------------------------------------------------------------- workspace ---

/** The Harness's Session registry, as `ctx.sessions` exposes it. */
export interface SessionsService {
  get?(id: string): unknown
  list?(): unknown[]
}

/** The Harness's directory owner, as `ctx.workingDirectory` exposes it. */
export interface WorkingDirectoryService {
  get?(session: unknown): string
  defaultDirectory?: unknown
}

/** The `ctx.sessions` service, read structurally. */
export function sessionsService(ctx: HostContext): SessionsService | undefined {
  const value = ctx.get('sessions')
  if (!isRecord(value)) return undefined
  const get = value.get
  const list = value.list
  if (typeof get !== 'function' && typeof list !== 'function') return undefined
  return {
    get: typeof get === 'function' ? (id) => get.call(value, id) : undefined,
    list: typeof list === 'function' ? () => list.call(value) : undefined,
  }
}

/** The `ctx.workingDirectory` service, read structurally. */
export function workingDirectoryService(ctx: HostContext): WorkingDirectoryService | undefined {
  const value = ctx.get('workingDirectory')
  if (!isRecord(value)) return undefined
  const get = value.get
  return {
    get: typeof get === 'function' ? (session) => get.call(value, session) : undefined,
    defaultDirectory: value.defaultDirectory,
  }
}
