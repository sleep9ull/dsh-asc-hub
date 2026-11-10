/**
 * Configuration defaults and normalization.
 *
 * This plugin deliberately exports no Cordis `Config`: a linked directory
 * install resolves the checkout's own module graph, so the Host half keeps a
 * zero-dependency surface and normalizes the row's `config` itself. Values that
 * do not type-check fall back to the safe default instead of throwing at load.
 */

import type { AscMode, HubConfig } from './types.js'
import { isRecord } from './types.js'

export const DEFAULTS = Object.freeze({
  ascPath: 'asc',
  profile: null,
  mode: 'read-only',
  requireApproval: true,
  timeoutMs: 60_000,
  longTimeoutMs: 1_800_000,
  maxOutputBytes: 262_144,
  telemetryDisabled: true,
  bypassKeychain: false,
  defaultAppId: null,
  vendorNumber: null,
})

function string(value: unknown, fallback: string): string
function string(value: unknown, fallback: null): string | null
function string(value: unknown, fallback: string | null): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * Normalize the Loader row's raw config into a complete, frozen config object.
 * @param raw the row's `config` value.
 */
export function normalizeConfig(raw: unknown): HubConfig {
  const input = isRecord(raw) ? raw : {}
  const mode: AscMode = input.mode === 'write' ? 'write' : 'read-only'
  return Object.freeze({
    ascPath: string(input.ascPath, DEFAULTS.ascPath),
    profile: string(input.profile, DEFAULTS.profile),
    mode,
    requireApproval: bool(input.requireApproval, DEFAULTS.requireApproval),
    timeoutMs: positiveInt(input.timeoutMs, DEFAULTS.timeoutMs),
    longTimeoutMs: positiveInt(input.longTimeoutMs, DEFAULTS.longTimeoutMs),
    maxOutputBytes: positiveInt(input.maxOutputBytes, DEFAULTS.maxOutputBytes),
    telemetryDisabled: bool(input.telemetryDisabled, DEFAULTS.telemetryDisabled),
    bypassKeychain: bool(input.bypassKeychain, DEFAULTS.bypassKeychain),
    defaultAppId: string(input.defaultAppId, DEFAULTS.defaultAppId),
    vendorNumber: string(input.vendorNumber, DEFAULTS.vendorNumber),
  })
}

/** Whether this config permits mutating actions at all. */
export function allowsWrites(config: HubConfig): boolean {
  return config.mode === 'write'
}
