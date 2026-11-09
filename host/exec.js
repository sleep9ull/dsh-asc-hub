/**
 * The only place asc-hub starts a child process.
 *
 * Two execution worlds are supported:
 *  - the Harness subprocess service (`ctx.subprocess`), so the plugin shares the
 *    same process discipline, cancellation and spill handling as the host;
 *  - `node:child_process` when a profile mounts no subprocess service.
 *
 * Semantics are identical either way: argv arrays only (never a shell string),
 * a deadline that actually kills the child, bounded output, a scrubbed child
 * environment, and a cancellation signal forwarded from the caller.
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

/** Global flags that must precede the subcommand. */
export function globalFlags(config, options = {}) {
  const flags = []
  if (config.profile) flags.push('--profile', config.profile)
  // `--read-only` is asc's data-plane kill switch. Plumb-only commands (auth,
  // version) must not receive it: asc would refuse to store a credential, which
  // would make onboarding impossible in the product's default read-only mode.
  if (options.forceReadOnly === true) flags.push('--read-only')
  else if (config.mode === 'read-only' && options.local !== true) flags.push('--read-only')
  return flags
}

/** Child environment: scrubbed parent plus the plugin's explicit switches. */
export function childEnv(config, extra, options = {}) {
  /** @type {Record<string, string>} */
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  if (config.telemetryDisabled) env.ASC_TELEMETRY_DISABLED = '1'
  if (config.bypassKeychain) env.ASC_BYPASS_KEYCHAIN = '1'
  // asc writes progress to stderr; a spinner would corrupt diagnostics.
  env.ASC_SPINNER_DISABLED = '1'
  env.NO_COLOR = '1'
  if (options.forceReadOnly === true) {
    env.ASC_READ_ONLY = '1'
  } else if (config.mode === 'read-only' && options.local === true) {
    // A tombstone removes an ambient value instead of passing one.
    delete env.ASC_READ_ONLY
  } else if (config.mode === 'read-only') {
    env.ASC_READ_ONLY = '1'
  }
  if (extra) Object.assign(env, extra)
  return env
}

function lookupOnPath(command) {
  const path = process.env.PATH ?? ''
  for (const directory of path.split(delimiter)) {
    if (directory === '') continue
    const candidate = join(directory, command)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  return undefined
}

/**
 * Resolve one executable to an absolute path.
 * @param {any} ctx Host context
 * @param {string} command bare name or absolute path
 * @returns {Promise<string | undefined>}
 */
export async function resolveExecutable(ctx, command) {
  const subprocess = ctx.get?.('subprocess')
  if (subprocess && typeof subprocess.resolveExecutable === 'function') {
    try {
      return await subprocess.resolveExecutable(command)
    } catch {
      return undefined
    }
  }
  if (isAbsolute(command)) return existsSync(command) ? command : undefined
  return lookupOnPath(command)
}

function linkSignals(callerSignal, timeoutMs) {
  const controller = new AbortController()
  let timer
  if (Number.isInteger(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
    timer.unref?.()
  }
  const forward = () => controller.abort(callerSignal?.reason)
  if (callerSignal) {
    if (callerSignal.aborted) forward()
    else callerSignal.addEventListener('abort', forward, { once: true })
  }
  const release = () => {
    if (timer) clearTimeout(timer)
    if (callerSignal) callerSignal.removeEventListener('abort', forward)
  }
  return { signal: controller.signal, release }
}

/**
 * Run one prepared invocation.
 *
 * @param {any} ctx Host context
 * @param {object} request
 * @param {readonly string[]} request.argv executable plus arguments
 * @param {string} request.cwd
 * @param {number} request.timeoutMs
 * @param {number} request.maxBytes
 * @param {Record<string,string>} request.env
 * @param {AbortSignal | undefined} request.signal
 * @returns {Promise<{exitCode:number|null, signalName:string|null, stdout:string, stderr:string, timedOut:boolean, aborted:boolean, durationMs:number}>}
 */
export async function runProcess(ctx, request) {
  const { argv, cwd, timeoutMs, maxBytes, env, signal: callerSignal } = request
  const started = Date.now()
  const { signal, release } = linkSignals(callerSignal, timeoutMs)
  const subprocess = ctx.get?.('subprocess')

  try {
    if (subprocess && typeof subprocess.spawn === 'function') {
      const handle = subprocess.spawn({
        argv,
        cwd: cwd || process.cwd(),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes, spill: { maxBytes: maxBytes * 4 } },
          stderr: { maxBytes, spill: { maxBytes: maxBytes * 4 } },
        },
        graceMs: 5_000,
        signal,
        env,
      })
      let timedOut = false
      /** @type {{exitCode:number|null, signal:string|null}} */
      let outcome = { exitCode: null, signal: null }
      try {
        outcome = await handle.done
      } catch {
        outcome = { exitCode: null, signal: null }
      }
      const stdout = handle.collected?.stdout?.readFrom(0)?.text ?? ''
      const stderr = handle.collected?.stderr?.readFrom(0)?.text ?? ''
      if (signal.aborted && !callerSignal?.aborted) timedOut = true
      return {
        exitCode: outcome.exitCode,
        signalName: outcome.signal ?? null,
        stdout,
        stderr,
        timedOut,
        aborted: Boolean(callerSignal?.aborted),
        durationMs: Date.now() - started,
      }
    }

    return await new Promise((resolve) => {
      let settled = false
      let stdout = ''
      let stderr = ''
      let timedOut = false
      let aborted = false
      const child = nodeSpawn(argv[0], argv.slice(1), {
        cwd: cwd || process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const take = (chunk) => {
        const text = chunk.toString('utf8')
        return text.length > maxBytes ? text.slice(0, maxBytes) : text
      }
      child.stdout?.on('data', (chunk) => {
        if (stdout.length < maxBytes) stdout += take(chunk)
      })
      child.stderr?.on('data', (chunk) => {
        if (stderr.length < maxBytes) stderr += take(chunk)
      })
      const finish = (exitCode, signalName) => {
        if (settled) return
        settled = true
        release()
        resolve({
          exitCode,
          signalName,
          stdout,
          stderr,
          timedOut,
          aborted,
          durationMs: Date.now() - started,
        })
      }
      const onAbort = () => {
        if (settled) return
        if (callerSignal?.aborted) aborted = true
        else timedOut = true
        child.kill('SIGTERM')
        const hard = setTimeout(() => child.kill('SIGKILL'), 3_000)
        hard.unref?.()
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
      child.on('error', () => finish(null, null))
      child.on('close', (code, signalName) => {
        signal.removeEventListener('abort', onAbort)
        finish(code, signalName)
      })
    })
  } finally {
    release()
  }
}
