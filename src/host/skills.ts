/**
 * The inherited skill pack: `asc install-skills` puts 25 reviewed skill
 * documents into the standard global agent-skills directory, pinned to a commit
 * of the upstream skills repository. This plugin neither vendors nor rewrites
 * them — it reports whether they are there and can run the same installer the
 * user would run by hand.
 *
 * Detection is filesystem-only and read-only: a lock file plus one document, so
 * a missing pack is a quiet "no" rather than an error.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { hostError, isRecord } from './types.js'

/** The upstream installer, as documented by `asc install-skills --help`. */
const INSTALL_ARGV = ['install-skills']

/** The two paths the pack lives at. */
export interface SkillPaths {
  root: string
  lockPath: string
}

/** One entry the upstream installer wrote into the lock. */
export interface PackEntry {
  name: string
  ref: string | null
  installedAt: string | null
}

/** What detection found on this machine. */
export interface SkillPackState {
  installed: boolean
  count: number
  ref: string | null
  installedAt: string | null
  root: string
  checkedAt: string
}

/** What the lock file said; `ok: false` means "unknown", never an error. */
export interface SkillLock {
  ok: boolean
  skills?: Record<string, unknown>
}

/** What one installer run reports back. */
export interface InstallSkillsResult {
  installed: boolean
  changed: boolean
  log: string
  state: SkillPackState
}

/** The `asc` invocation the installer runs through. */
export type SkillInstallerRun = (
  argv: string[],
  options: { deadlineMs: number; local: boolean },
) => Promise<{ stdout?: string; stderr?: string; exitCode?: number | null }>

export function skillsPaths(env: NodeJS.ProcessEnv = process.env): SkillPaths {
  const home = typeof env.HOME === 'string' && env.HOME.length > 0 ? env.HOME : homedir()
  const root = join(home, '.agents')
  return { root, lockPath: join(root, '.skill-lock.json') }
}

/**
 * Read the skill lock, tolerating every failure: an unreadable or malformed lock
 * means "unknown", never a thrown status call.
 */
export function readLock(lockPath: string): SkillLock {
  try {
    const parsed: unknown = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return { ok: false }
    const skills = isRecord(parsed) ? parsed.skills : undefined
    if (!isRecord(skills)) return { ok: true, skills: {} }
    return { ok: true, skills }
  } catch {
    return { ok: false }
  }
}

/**
 * The pack this project inherits: every asc skill the upstream installer owns.
 */
export function packEntries(skills: Record<string, unknown>): PackEntry[] {
  const entries: PackEntry[] = []
  for (const [name, value] of Object.entries(skills)) {
    if (!name.startsWith('asc-')) continue
    entries.push({
      name,
      ref: isRecord(value) && typeof value.ref === 'string' ? value.ref : null,
      installedAt: isRecord(value) && typeof value.installedAt === 'string' ? value.installedAt : null,
    })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function detectSkills(
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {},
): Promise<SkillPackState> {
  const { root, lockPath } = skillsPaths(env)
  const checkedAt = new Date().toISOString()
  const lock = readLock(lockPath)
  const entries = lock.skills === undefined ? [] : packEntries(lock.skills)
  const document = join(root, 'skills', 'asc-cli-usage', 'SKILL.md')
  const present = existsSync(document)
  const newest = entries.reduce<string | null>((latest, entry) => {
    if (entry.installedAt === null) return latest
    return latest === null || entry.installedAt > latest ? entry.installedAt : latest
  }, null)
  return {
    installed: present && entries.length > 0,
    count: entries.length,
    ref: entries.find(entry => entry.ref !== null)?.ref ?? null,
    installedAt: newest,
    root: join(root, 'skills'),
    checkedAt,
  }
}

/**
 * Run the upstream installer. It checks out a pinned commit with git and writes
 * the standard directory, so it is a machine change like `engine.install`: local
 * write class, no App Store Connect involvement, and it needs a real deadline.
 */
export async function installSkills(
  { run }: { run: SkillInstallerRun },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {},
): Promise<InstallSkillsResult> {
  const before = await detectSkills({ env })
  const result = await run(INSTALL_ARGV, { deadlineMs: 180_000, local: true })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
    throw hostError('ASC_FAILED', output === '' ? `asc install-skills exited ${result.exitCode}` : output)
  }
  const after = await detectSkills({ env })
  const lastLine = output === '' ? '' : output.split(/\r?\n/).filter(line => line.trim() !== '').slice(-1)[0]
  return {
    installed: after.installed,
    changed: after.installed !== before.installed || after.ref !== before.ref,
    log: lastLine,
    state: after,
  }
}

/**
 * The skill-pack commit the installed engine ships, read from its own help text:
 * `asc install-skills --help` names the reviewed commit it would check out. No
 * network, no checkout — the pin lives in the asc source.
 */
export function parseShippedRef(helpText: string | undefined): string | null {
  const match = /\b([0-9a-f]{40})\b/i.exec(String(helpText ?? ''))
  return match ? match[1].toLowerCase() : null
}

/**
 * Whether two references name the same commit. Either side may be a short sha, and
 * an unknown side is never "different": that would fake an update.
 */
export function sameRef(a: string | null, b: string | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (left.length < 7 || right.length < 7) return false
  return left.startsWith(right) || right.startsWith(left)
}

/**
 * Whether a skill document exists on disk — used by tests and by the panel copy.
 */
export function hasDocument(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
