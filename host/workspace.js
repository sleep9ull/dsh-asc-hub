/**
 * Where this session works.
 *
 * The directory is the Harness's own answer, not the plugin's guess: `ctx.sessions`
 * resolves the Session and `ctx.workingDirectory` owns its effective directory. The
 * git facts are best effort — a directory that is not a repository, a detached HEAD
 * or a git that refuses the read narrows the answer instead of failing it, because
 * the panel must still say where the session is.
 */

import { homedir } from 'node:os'
import { basename } from 'node:path'

import { childEnv, resolveExecutable, runProcess } from './exec.js'

/** `~/dev/app` for a path under the home directory, the absolute path otherwise. */
export function shortenPath(path, home = homedir()) {
  if (typeof path !== 'string' || path === '') return ''
  if (typeof home !== 'string' || home === '' || home === '/') return path
  if (path === home) return '~'
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

/**
 * The four facts `git rev-parse --path-format=absolute --show-toplevel
 * --abbrev-ref HEAD --git-dir --git-common-dir` prints, in that order.
 *
 * `worktree` is the interesting one: inside a linked worktree the git directory is
 * `.git/worktrees/<name>` while the common directory is still the main `.git`, so
 * the two differ. In the primary checkout they are the same path.
 *
 * @param {string} stdout
 */
export function parseGitFacts(stdout) {
  const lines = String(stdout ?? '').split('\n').map((line) => line.trim())
  const [toplevel = '', branch = '', gitDir = '', commonDir = ''] = lines
  if (toplevel === '') return null
  return {
    repo: basename(toplevel) || toplevel,
    branch: branch === '' || branch === 'HEAD' ? null : branch,
    worktree: gitDir !== '' && commonDir !== '' && gitDir !== commonDir,
  }
}

/**
 * `git status --porcelain=v1 --branch` → the working tree's shape.
 *
 * The header line carries the three facts a person asks about first: the branch, its
 * upstream, and how far it has drifted (`## main...origin/main [ahead 2, behind 1]`).
 * Every following line is one changed path; `??` is untracked, `!!` is ignored and
 * never counted, and anything else is a tracked change (staged, unstaged or a
 * conflict). One command answers "dirty? how far from origin?" without a fetch.
 *
 * @param {string} stdout
 */
export function parseGitStatus(stdout) {
  const lines = String(stdout ?? '').split('\n')
  let upstream = null
  let ahead = 0
  let behind = 0
  let changed = 0
  let untracked = 0
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const rest = line.slice(3)
      const dots = rest.indexOf('...')
      if (dots !== -1) {
        const right = rest.slice(dots + 3)
        const bracket = right.indexOf('[')
        const name = (bracket === -1 ? right : right.slice(0, bracket)).trim()
        upstream = name === '' ? null : name
        const counts = /\[([^\]]*)\]/.exec(right)
        if (counts) {
          const aheadMatch = /ahead (\d+)/.exec(counts[1])
          const behindMatch = /behind (\d+)/.exec(counts[1])
          if (aheadMatch) ahead = Number(aheadMatch[1])
          if (behindMatch) behind = Number(behindMatch[1])
        }
      }
      continue
    }
    if (line === '') continue
    if (line.startsWith('??')) { untracked += 1; continue }
    if (line.startsWith('!!')) continue
    changed += 1
  }
  return { upstream, ahead, behind, changed, untracked, clean: changed === 0 && untracked === 0 }
}

/**
 * @param {any} ctx Host context
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 */
export function createWorkspace(ctx, config) {
  /**
   * The live Session for an id the caller already knows.
   *
   * Session ids stringify with a `session-` prefix, while a caller may hand over
   * either form, so the match is made on the bare id.
   */
  function findSession(sessions, sessionId) {
    if (!sessions || !sessionId) return undefined
    if (typeof sessions.get === 'function') {
      const direct = sessions.get(sessionId)
      if (direct) return direct
    }
    if (typeof sessions.list !== 'function') return undefined
    const wanted = String(sessionId).replace(/^session-/, '')
    for (const session of sessions.list()) {
      const id = session && session.id !== undefined ? String(session.id).replace(/^session-/, '') : ''
      if (id !== '' && id === wanted) return session
    }
    return undefined
  }

  /** The Session's effective directory, falling back to the profile default. */
  function directoryOf(sessionId) {
    const directories = ctx.get?.('workingDirectory')
    if (!directories) return process.cwd()
    const session = findSession(ctx.get?.('sessions'), sessionId)
    if (session && typeof directories.get === 'function') return directories.get(session)
    return typeof directories.defaultDirectory === 'string' ? directories.defaultDirectory : process.cwd()
  }

  async function runGit(git, cwd, argv, signal) {
    try {
      const result = await runProcess(ctx, {
        argv: [git, '-C', cwd, ...argv],
        cwd,
        timeoutMs: 4_000,
        maxBytes: 64_000,
        env: childEnv(config),
        signal,
      })
      return result && result.exitCode === 0 ? result.stdout : null
    } catch {
      return null
    }
  }

  /**
   * Repository identity, checkout shape and working-tree state. Two local commands,
   * no fetch: `rev-parse` answers where and which checkout, `status` answers whether
   * it is dirty and how far it is from its upstream.
   */
  async function gitFacts(cwd, signal) {
    const git = (await resolveExecutable(ctx, 'git')) ?? 'git'
    const identity = await runGit(git, cwd, [
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--abbrev-ref',
      'HEAD',
      '--git-dir',
      '--git-common-dir',
    ], signal)
    const facts = parseGitFacts(identity ?? '')
    if (!facts) return null
    const status = await runGit(git, cwd, ['status', '--porcelain=v1', '--branch'], signal)
    const tree = status === null ? null : parseGitStatus(status)
    return {
      ...facts,
      upstream: tree ? tree.upstream : null,
      ahead: tree ? tree.ahead : null,
      behind: tree ? tree.behind : null,
      changed: tree ? tree.changed : null,
      untracked: tree ? tree.untracked : null,
      clean: tree ? tree.clean : null,
    }
  }

  /**
   * @param {any} input `{ sessionId? }`
   * @param {{ signal?: AbortSignal }} [options]
   */
  async function info(input = {}, options = {}) {
    const raw = input !== null && typeof input === 'object' ? input : {}
    const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
    const cwd = directoryOf(sessionId)
    const path = typeof cwd === 'string' && cwd !== '' ? cwd : null
    const facts = path ? await gitFacts(path, options.signal) : null
    return {
      cwd: path,
      display: path ? shortenPath(path) : null,
      repo: facts ? facts.repo : null,
      branch: facts ? facts.branch : null,
      worktree: facts ? facts.worktree === true : false,
      upstream: facts ? facts.upstream : null,
      ahead: facts ? facts.ahead : null,
      behind: facts ? facts.behind : null,
      changed: facts ? facts.changed : null,
      untracked: facts ? facts.untracked : null,
      clean: facts ? facts.clean : null,
      checkedAt: new Date().toISOString(),
    }
  }

  return { info, directory: directoryOf }
}
