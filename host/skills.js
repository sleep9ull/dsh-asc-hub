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

/** The upstream installer, as documented by `asc install-skills --help`. */
const INSTALL_ARGV = ['install-skills']

/**
 * @param {Record<string, unknown>} env process environment, injected for tests
 * @returns {{ root: string, lockPath: string }}
 */
export function skillsPaths(env = process.env) {
  const home = typeof env.HOME === 'string' && env.HOME.length > 0 ? env.HOME : homedir()
  const root = join(home, '.agents')
  return { root, lockPath: join(root, '.skill-lock.json') }
}

/**
 * Read the skill lock, tolerating every failure: an unreadable or malformed lock
 * means "unknown", never a thrown status call.
 * @param {string} lockPath
 * @returns {{ ok: boolean, skills?: Record<string, any> }}
 */
export function readLock(lockPath) {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return { ok: false }
    const skills = parsed.skills
    if (skills === null || typeof skills !== 'object' || Array.isArray(skills)) return { ok: true, skills: {} }
    return { ok: true, skills }
  } catch {
    return { ok: false }
  }
}

/**
 * The pack this project inherits: every asc skill the upstream installer owns.
 * @param {Record<string, any>} skills lock entries
 * @returns {{ name: string, ref: string | null, installedAt: string | null }[]}
 */
export function packEntries(skills) {
  /** @type {{ name: string, ref: string | null, installedAt: string | null }[]} */
  const entries = []
  for (const [name, value] of Object.entries(skills)) {
    if (!name.startsWith('asc-')) continue
    entries.push({
      name,
      ref: value !== null && typeof value === 'object' && typeof value.ref === 'string' ? value.ref : null,
      installedAt: value !== null && typeof value === 'object' && typeof value.installedAt === 'string' ? value.installedAt : null,
    })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} [options.env]
 * @param {(argv: string[], options: { deadlineMs: number, local: boolean }) => Promise<any>} [options.run]
 * @returns {Promise<{ installed: boolean, count: number, ref: string | null, installedAt: string | null, root: string, checkedAt: string }>}
 */
export async function detectSkills({ env = process.env } = {}) {
  const { root, lockPath } = skillsPaths(env)
  const checkedAt = new Date().toISOString()
  const lock = readLock(lockPath)
  const entries = lock.skills === undefined ? [] : packEntries(lock.skills)
  const document = join(root, 'skills', 'asc-cli-usage', 'SKILL.md')
  const present = existsSync(document)
  const newest = entries.reduce((latest, entry) => {
    if (entry.installedAt === null) return latest
    return latest === null || entry.installedAt > latest ? entry.installedAt : latest
  }, /** @type {string | null} */ (null))
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
 * @param {object} deps
 * @param {(argv: string[], options: { deadlineMs: number, local: boolean }) => Promise<{ stdout: string, stderr: string, exitCode?: number }>} deps.run
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env]
 * @returns {Promise<{ installed: boolean, changed: true, log: string, state: object }>}
 */
export async function installSkills({ run }, { env = process.env } = {}) {
  const before = await detectSkills({ env })
  const result = await run(INSTALL_ARGV, { deadlineMs: 180_000, local: true })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
    const error = new Error(output === '' ? `asc install-skills exited ${result.exitCode}` : output)
    // @ts-expect-error the dispatcher reads this code off the error
    error.code = 'ASC_FAILED'
    throw error
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
 * @param {string} helpText
 * @returns {string | null}
 */
export function parseShippedRef(helpText) {
  const match = /\b([0-9a-f]{40})\b/i.exec(String(helpText ?? ''))
  return match ? match[1].toLowerCase() : null
}

/**
 * Whether two references name the same commit. Either side may be a short sha, and
 * an unknown side is never "different": that would fake an update.
 * @param {string | null} a
 * @param {string | null} b
 */
export function sameRef(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (left.length < 7 || right.length < 7) return false
  return left.startsWith(right) || right.startsWith(left)
}

/**
 * Whether a skill document exists on disk — used by tests and by the panel copy.
 * @param {string} path
 * @returns {boolean}
 */
export function hasDocument(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
