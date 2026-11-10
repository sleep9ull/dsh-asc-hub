/**
 * Engine lifecycle: find asc, read its version, install it when missing.
 *
 * The product inherits asc as an external engine. Nothing here vendors, embeds
 * or reimplements any part of it: detection proves a real binary answers, and
 * installation delegates to the project's own official channel (Homebrew first,
 * the published installer script otherwise).
 */

import { existsSync } from 'node:fs'
import { childEnv, resolveExecutable, runProcess } from './exec.js'
import { redact } from './redact.js'
import type {
  AscRunner,
  CallOptions,
  EngineInstallResult,
  EngineState,
  EnvConfig,
  HostContext,
  HubConfig,
} from './types.js'
import { errorCode, errorDetail, hostError } from './types.js'

const VERSION_PATTERN = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/

/** Absolute locations worth checking when PATH lookup fails. */
const KNOWN_LOCATIONS = [
  '/opt/homebrew/bin/asc',
  '/usr/local/bin/asc',
  `${process.env.HOME ?? ''}/.local/bin/asc`,
]

const BREW_LOCATIONS = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']

/** The upstream project's published installer, as documented by the project. */
export const INSTALL_SCRIPT_URL = 'https://asccli.sh/install'

export function parseVersion(text: string): string | undefined {
  if (typeof text !== 'string') return undefined
  const match = VERSION_PATTERN.exec(text.trim())
  return match ? match[1] : undefined
}

/** The engine client: detection, installation, and the cached detection pass. */
export interface Engine {
  detect(options?: { force?: boolean }): Promise<EngineState>
  install(method: unknown, options?: CallOptions): Promise<EngineInstallResult>
  invalidate(): void
  resolveBrew(): Promise<string | undefined>
}

export function createEngine(
  ctx: HostContext,
  config: EnvConfig & Pick<HubConfig, 'maxOutputBytes' | 'ascPath'>,
  asc: AscRunner,
): Engine {
  let cache: { state: EngineState; at: number } | undefined
  const CACHE_MS = 15_000

  async function resolveBinary(): Promise<{ path: string; source: string } | undefined> {
    const direct = await resolveExecutable(ctx, config.ascPath)
    if (direct) return { path: direct, source: 'path' }
    for (const candidate of KNOWN_LOCATIONS) {
      if (candidate && existsSync(candidate)) return { path: candidate, source: 'path' }
    }
    return undefined
  }

  async function resolveBrew(): Promise<string | undefined> {
    const resolved = await resolveExecutable(ctx, 'brew')
    if (resolved) return resolved
    for (const candidate of BREW_LOCATIONS) {
      if (existsSync(candidate)) return candidate
    }
    return undefined
  }

  /** Full detection pass; the only source of `EngineState`. */
  async function detect(options: { force?: boolean } = {}): Promise<EngineState> {
    if (!options.force && cache && Date.now() - cache.at < CACHE_MS) return cache.state
    const brewPath = await resolveBrew()
    const binary = await resolveBinary()
    const state: EngineState = {
      installed: false,
      path: binary?.path ?? null,
      version: null,
      source: 'missing',
      brew: { installed: Boolean(brewPath), path: brewPath ?? null },
      checkedAt: new Date().toISOString(),
    }
    if (binary) {
      const probe = await asc.run(['version'], { path: binary.path, timeoutMs: 15_000, output: false, local: true })
      if (!probe.missing && probe.exitCode === 0) {
        state.installed = true
        state.source = binary.source
        state.version = parseVersion(probe.stdout) ?? null
      }
    }
    cache = { state, at: Date.now() }
    return state
  }

  /**
   * Install asc. Delegates to Homebrew when the user has it, otherwise to the
   * official installer script. Returns `{ method, log }`; the caller re-detects.
   */
  async function install(method: unknown, options: CallOptions = {}): Promise<EngineInstallResult> {
    const chosen = method === 'curl' ? 'curl' : 'brew'
    cache = undefined
    if (chosen === 'curl') return installWithScript(options)
    try {
      return await installWithBrew(options)
    } catch (error) {
      // Homebrew can refuse to write its prefix (ownership, a partial keg, an
      // untrusted tap) and a failed pour can leave no binary behind. The published
      // installer is the project's other official channel and needs no sudo, so a
      // failed brew attempt falls back to it instead of ending onboarding.
      const code = errorCode(error)
      if (code !== 'BREW_MISSING' && code !== 'INSTALL_FAILED') throw error
      let fallback: EngineInstallResult
      try {
        fallback = await installWithScript(options)
      } catch (fallbackError) {
        const failure = hostError(
          'INSTALL_FAILED',
          'Homebrew could not install asc, and the official installer also failed.',
        )
        failure.detail = [errorDetail(error), errorDetail(fallbackError)].filter(Boolean).join('\n\n')
        throw failure
      }
      return {
        method: 'curl',
        fallback: true,
        fallbackReason: code === 'BREW_MISSING' ? 'brew-missing' : 'brew-failed',
        log: [errorDetail(error), fallback.log].filter(Boolean).join('\n\n'),
      }
    }
  }

  async function installWithBrew(options: CallOptions): Promise<EngineInstallResult> {
    const brewPath = await resolveBrew()
    if (!brewPath) {
      throw hostError('BREW_MISSING', 'Homebrew is not installed; use the curl installer instead.')
    }
    const result = await runProcess(ctx, {
      argv: [brewPath, 'install', 'asc'],
      cwd: process.cwd(),
      timeoutMs: 15 * 60_000,
      maxBytes: config.maxOutputBytes,
      env: childEnv(config),
      signal: options.signal,
    })
    const log = redact(`${result.stdout}\n${result.stderr}`).trim()
    if (result.exitCode !== 0) {
      throw hostError('INSTALL_FAILED', 'Homebrew could not install asc.', log)
    }
    return { method: 'brew', log }
  }

  async function installWithScript(options: CallOptions): Promise<EngineInstallResult> {
    // The published installer is a shell pipeline by design; it is the upstream
    // project's documented channel, not something this plugin invented.
    const command = `curl -fsSL ${INSTALL_SCRIPT_URL} | /bin/bash`
    const result = await runProcess(ctx, {
      argv: ['/bin/bash', '-lc', command],
      cwd: process.cwd(),
      timeoutMs: 15 * 60_000,
      maxBytes: config.maxOutputBytes,
      env: childEnv(config),
      signal: options.signal,
    })
    const log = redact(`${result.stdout}\n${result.stderr}`).trim()
    if (result.exitCode !== 0) {
      throw hostError('INSTALL_FAILED', 'The asc installer script failed.', log)
    }
    return { method: 'curl', log }
  }

  function invalidate(): void {
    cache = undefined
  }

  return { detect, install, invalidate, resolveBrew }
}
