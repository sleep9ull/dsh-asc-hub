/**
 * The asc command layer: argv assembly, JSON decoding and error classification.
 *
 * Everything the plugin knows about App Store Connect comes through this seam.
 * It is also the compatibility boundary described in docs/UPSTREAM-ASC.md: a
 * changed upstream flag is a one-line edit here, and nothing else.
 */

import { childEnv, globalFlags, runProcess } from './exec.js'
import { clampText, redact } from './redact.js'

/** Parse one JSON document without throwing. */
export function parseJson(text) {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/**
 * asc's JSON envelopes are not uniform (a bare array, `{data:[…]}`, or a named
 * collection). Pick the first plausible array without guessing field values.
 * @param {unknown} value
 * @param {readonly string[]} keys
 */
export function pickArray(value, keys = []) {
  if (Array.isArray(value)) return value
  if (value !== null && typeof value === 'object') {
    for (const key of keys) {
      const candidate = value[key]
      if (Array.isArray(candidate)) return candidate
    }
    if (Array.isArray(value.data)) return value.data
    if (Array.isArray(value.items)) return value.items
  }
  return []
}

/**
 * Read one field from a possibly nested object, e.g. `attributes.name`.
 * @param {any} value
 * @param {string} path
 */
export function field(value, path) {
  let current = value
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

/** Map an asc exit code to the contract's error code. */
export function classifyExit(exitCode, stdout, stderr) {
  const text = `${stderr}\n${stdout}`
  if (exitCode === 0) return undefined
  if (exitCode === 3) {
    return { code: 'ASC_AUTH_MISSING', message: 'asc has no usable App Store Connect credentials.' }
  }
  if (exitCode === 2) {
    return { code: 'INVALID_INPUT', message: firstErrorLine(text) ?? 'asc rejected the arguments.' }
  }
  if (exitCode === 6) {
    return { code: 'READ_ONLY_MODE', message: 'asc refused a mutating command in read-only mode.' }
  }
  if (exitCode === 7) {
    return { code: 'PROCESSING_PENDING', message: 'asc reported the operation is still pending.' }
  }
  if (/missing authentication|not authenticated|401|403/i.test(text)) {
    return { code: 'ASC_AUTH_MISSING', message: 'asc has no usable App Store Connect credentials.' }
  }
  return { code: 'ASC_FAILED', message: firstErrorLine(text) ?? `asc exited with code ${exitCode}.` }
}

function firstErrorLine(text) {
  if (typeof text !== 'string' || text.trim() === '') return undefined
  const line = text.split('\n').map((item) => item.trim()).find((item) => item !== '')
  return line ? redact(line).slice(0, 400) : undefined
}

/**
 * Create the asc invocation client.
 * @param {any} ctx Host context
 * @param {import('./config.js').DEFAULTS & object} config
 */
export function createAsc(ctx, config) {
  /** @type {Set<AbortController>} */
  const active = new Set()

  /** Resolve the executable once per invocation so a reinstall is picked up. */
  async function run(args, options = {}) {
    const {
      path,
      cwd = process.cwd(),
      timeoutMs = config.timeoutMs,
      signal,
      output = true,
      outputFormat = 'json',
      extraEnv,
      maxBytes = config.maxOutputBytes,
      local = false,
      forceReadOnly = false,
    } = options
    const binary = path
    if (!binary) return { missing: true, exitCode: null, stdout: '', stderr: '', json: undefined }
    const argv = [binary, ...globalFlags(config, { local, forceReadOnly }), ...args]
    if (output) argv.push('--output', outputFormat)
    const result = await runProcess(ctx, {
      argv,
      cwd,
      timeoutMs,
      maxBytes,
      env: childEnv(config, extraEnv, { local, forceReadOnly }),
      signal,
    })
    const json = output && outputFormat === 'json' ? parseJson(result.stdout) : undefined
    return { ...result, argv, json, missing: false }
  }

  /** Run and throw a classified error for any non-zero exit. */
  async function must(args, options = {}) {
    const result = await run(args, options)
    if (result.missing) {
      const error = new Error('The asc engine is not installed.')
      error.code = 'ASC_NOT_INSTALLED'
      throw error
    }
    const failure = classifyExit(result.exitCode, result.stdout, result.stderr)
    if (failure) {
      const error = new Error(failure.message)
      error.code = failure.code
      error.detail = redact(clampText(`${result.stderr}\n${result.stdout}`, 8_000)).trim() || undefined
      error.result = result
      throw error
    }
    return result
  }

  /**
   * Run a command that may or may not accept `--output json` (meta commands such
   * as `asc version` reject it). The retry is driven by asc's own usage error, so
   * a future command that gains or loses the flag keeps working.
   */
  async function runAuto(args, options = {}) {
    const first = await run(args, { ...options, output: true })
    if (first.missing) return first
    if (first.exitCode === 2 && /unknown flag .{0,3}output/i.test(first.stderr)) {
      const second = await run(args, { ...options, output: false })
      if (second.exitCode === 0) second.json = parseJson(second.stdout)
      return second
    }
    return first
  }

  function track(controller) {
    active.add(controller)
    return () => active.delete(controller)
  }

  function dispose() {
    for (const controller of active) {
      try {
        controller.abort()
      } catch {
        // ignore
      }
    }
    active.clear()
  }

  return { run, runAuto, must, track, dispose }
}
