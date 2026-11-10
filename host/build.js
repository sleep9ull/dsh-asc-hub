/**
 * Building the code the session is working on.
 *
 * The unit of work is the working directory, not a file the user picks: a build
 * means "archive this checkout, export an .ipa, upload it", which is exactly what
 * `asc xcode` and `asc builds upload` are for. This module owns three things and
 * nothing else:
 *
 *  - finding the Xcode project that directory builds (a workspace wins over a
 *    project, shallow wins over deep, generated folders are skipped);
 *  - asking xcodebuild which schemes that project has;
 *  - running archive → export → upload, with version and build number passed as
 *    build settings so the checkout is never rewritten.
 */

import { mkdirSync } from 'node:fs'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { childEnv, resolveExecutable, runProcess } from './exec.js'
import { redact } from './redact.js'

/** Directories that never contain the project this checkout builds. */
const SKIP = new Set([
  'node_modules',
  'Pods',
  'Build',
  'DerivedData',
  '.asc',
  '.build',
  '.git',
  '.swiftpm',
  'vendor',
  'Carthage',
])

/** How deep below the working directory a project may live (0 = the directory itself). */
const MAX_DEPTH = 2

/**
 * The Xcode project a directory builds.
 *
 * Podfile layouts usually put `App.xcworkspace` beside the sources; monorepos put
 * it one level down (`ios/App.xcworkspace`). A workspace wins because it carries
 * the dependency graph; a project is the fallback. `Pods/Pods.xcodeproj` and
 * friends are skipped by name, so the fallback cannot pick a generated project.
 *
 * @param {string} root absolute working directory
 * @returns {{ kind: 'workspace' | 'project', path: string, depth: number } | null}
 */
export function findProject(root) {
  if (typeof root !== 'string' || root === '') return null
  /** @type {{ kind: 'workspace' | 'project', path: string, depth: number }[]} */
  const found = []
  const walk = (directory, depth) => {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const name = entry.name
      if (name.startsWith('.') || SKIP.has(name)) continue
      const path = join(directory, name)
      if (name.endsWith('.xcworkspace')) {
        found.push({ kind: 'workspace', path, depth })
        continue
      }
      if (name.endsWith('.xcodeproj')) {
        found.push({ kind: 'project', path, depth })
        continue
      }
      if (depth + 1 < MAX_DEPTH) walk(path, depth + 1)
    }
  }
  walk(root, 0)
  if (found.length === 0) return null
  const rank = entry => (entry.kind === 'workspace' ? 0 : 1)
  found.sort((a, b) => a.depth - b.depth || rank(a) - rank(b) || a.path.localeCompare(b.path))
  return found[0]
}

/** A short label for the project: `App.xcworkspace`. */
export function projectName(project) {
  return project && typeof project.path === 'string' ? basename(project.path) : null
}

/**
 * `xcodebuild -list -json` → its schemes, tolerating every other shape.
 * The JSON is either `{ workspace: { schemes: [...] } }` or the `project` variant.
 * @param {string} stdout
 * @returns {string[]}
 */
export function parseSchemes(stdout) {
  try {
    const parsed = JSON.parse(String(stdout ?? ''))
    const container = parsed && typeof parsed === 'object'
      ? (parsed.workspace && typeof parsed.workspace === 'object'
        ? parsed.workspace
        : parsed.project && typeof parsed.project === 'object' ? parsed.project : null)
      : null
    const schemes = container && Array.isArray(container.schemes) ? container.schemes : []
    return schemes.filter(name => typeof name === 'string' && name.trim() !== '')
  } catch {
    return []
  }
}

/**
 * The three asc argument lists a build needs, built here so they are testable and
 * so the version travels as a build setting instead of a project rewrite.
 *
 * @param {object} spec
 * @param {'workspace' | 'project'} spec.kind
 * @param {string} spec.projectPath
 * @param {string} spec.scheme
 * @param {string | null} spec.version
 * @param {string | null} spec.buildNumber
 * @param {string} spec.appId
 * @param {string} spec.archivePath
 * @param {string} spec.ipaPath
 * @returns {{ archive: string[], export: string[], upload: string[] }}
 */
export function buildArgv(spec) {
  const projectFlag = spec.kind === 'workspace' ? '--workspace' : '--project'
  const archive = [
    'xcode',
    'archive',
    projectFlag,
    spec.projectPath,
    '--scheme',
    spec.scheme,
    '--configuration',
    'Release',
    '--archive-path',
    spec.archivePath,
    '--overwrite',
  ]
  if (spec.version) archive.push(`--xcodebuild-flag=MARKETING_VERSION=${spec.version}`)
  if (spec.buildNumber) archive.push(`--xcodebuild-flag=CURRENT_PROJECT_VERSION=${spec.buildNumber}`)
  const exported = [
    'xcode',
    'export',
    '--archive-path',
    spec.archivePath,
    '--ipa-path',
    spec.ipaPath,
    '--xcodebuild-flag=-allowProvisioningUpdates',
  ]
  const upload = ['builds', 'upload', '--app', spec.appId, '--ipa', spec.ipaPath]
  if (spec.version) upload.push('--version', spec.version)
  if (spec.buildNumber) upload.push('--build-number', spec.buildNumber)
  upload.push('--wait')
  return { archive, export: exported, upload }
}

/**
 * Whether an Xcode project is an iOS one.
 *
 * A workspace has no project file of its own, so the projects beside it are the
 * evidence; a project is its own `project.pbxproj`. `IPHONEOS_DEPLOYMENT_TARGET`
 * (or an `iphoneos` SDK root) is what every iOS target carries and a macOS-only
 * project does not.
 *
 * @param {{ kind: 'workspace' | 'project', path: string }} project
 * @returns {boolean}
 */
export function projectIsIos(project) {
  if (!project || typeof project.path !== 'string') return false
  const candidates = []
  if (project.kind === 'project') candidates.push(project.path)
  else {
    try {
      for (const entry of readdirSync(dirname(project.path), { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) candidates.push(join(dirname(project.path), entry.name))
      }
    } catch {
      return false
    }
  }
  for (const candidate of candidates) {
    let text
    try {
      text = readFileSync(join(candidate, 'project.pbxproj'), 'utf8')
    } catch {
      continue
    }
    if (/IPHONEOS_DEPLOYMENT_TARGET|SDKROOT = iphoneos|\biphoneos\b/.test(text)) return true
  }
  return false
}

/** The last few lines of a child's output, redacted, for a failure message. */
function tail(result) {
  const text = redact(`${result?.stderr ?? ''}\n${result?.stdout ?? ''}`).trim()
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  return lines.slice(-8).join('\n')
}

/**
 * @param {any} ctx Host context
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 * @param {ReturnType<import('./asc.js').createAsc>} asc
 * @param {{ detect: Function }} engine
 */
export function createBuild(ctx, config, asc, engine) {
  /**
   * Whether this machine can build an iOS app.
   *
   * `xcodebuild` resolving is not enough: with only the Command Line Tools selected,
   * it exists but refuses every project ("requires Xcode"), and the developer
   * directory is what says which of the two is active.
   */
  async function xcodeAvailable() {
    const select = await resolveExecutable(ctx, 'xcode-select')
    if (!select) return Boolean(await resolveExecutable(ctx, 'xcodebuild'))
    try {
      const result = await runProcess(ctx, {
        argv: [select, '-p'],
        timeoutMs: 10_000,
        maxBytes: 4_096,
        env: childEnv(config),
      })
      const developer = result && result.exitCode === 0 ? String(result.stdout ?? '').trim() : ''
      if (developer === '') return false
      return /Xcode\.app|\.app\/Contents\/Developer/.test(developer)
    } catch {
      return false
    }
  }

  /**
   * What this directory can build, and why not when it cannot.
   *
   * `reason` is ordered the way a person asks the question: is this even an iOS
   * project (`no-project`, `not-ios`), then can this machine build it (`no-xcode`),
   * then does the project load (`unloadable`). Only the last two are fixable by
   * repairing the codebase, which is what the panel's auto-fix prompt is for.
   */
  async function facts(cwd) {
    const project = typeof cwd === 'string' && cwd !== '' ? findProject(cwd) : null
    const xcode = await xcodeAvailable()
    const base = {
      xcode,
      kind: project ? project.kind : null,
      project: project ? project.path : null,
      name: projectName(project),
      ios: false,
      schemes: [],
      ready: false,
      reason: null,
    }
    if (project === null) return { ...base, reason: xcode ? 'no-project' : 'no-xcode' }
    const ios = projectIsIos(project)
    if (!xcode) return { ...base, ios, reason: 'no-xcode' }
    const schemes = await schemesFor(project, cwd)
    if (!ios) return { ...base, ios: false, schemes, reason: 'not-ios' }
    const ready = schemes.length > 0
    return { ...base, ios: true, schemes, ready, reason: ready ? null : 'unloadable' }
  }

  async function schemesFor(project, cwd, signal) {
    const flag = project.kind === 'workspace' ? '-workspace' : '-project'
    let result
    try {
      result = await runProcess(ctx, {
        argv: ['xcodebuild', '-list', '-json', flag, project.path],
        cwd,
        timeoutMs: 20_000,
        maxBytes: 64_000,
        env: childEnv(config),
        signal,
      })
    } catch {
      return []
    }
    if (!result || result.exitCode !== 0) return []
    return parseSchemes(result.stdout)
  }

  /**
   * Archive this checkout, export an .ipa, upload it, and wait for Apple to accept
   * it. Artifacts go to a temporary directory: a build must not dirty the repo it is
   * building, and an .xarchive is large.
   *
   * @param {any} input `{ appId, cwd, scheme?, version?, buildNumber? }`
   * @param {{ signal?: AbortSignal }} [options]
   */
  async function create(input = {}, options = {}) {
    const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : ''
    if (cwd === '') {
      // @ts-expect-error the dispatcher reads this code off the error
      const error = new Error('This session has no working directory to build.')
      error.code = 'BUILD_UNAVAILABLE'
      throw error
    }
    const appId = String(input.appId ?? '')
    const project = findProject(cwd)
    if (project === null) {
      // @ts-expect-error the dispatcher reads this code off the error
      const error = new Error(`No Xcode project or workspace found under ${cwd}.`)
      error.code = 'BUILD_UNAVAILABLE'
      throw error
    }
    const schemes = typeof input.scheme === 'string' && input.scheme !== ''
      ? [input.scheme]
      : await schemesFor(project, cwd, options.signal)
    const scheme = schemes.length > 0 ? String(schemes[0]) : projectName(project).replace(/\.xcodeproj$/, '')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const directory = join(tmpdir(), 'asc-hub-build', stamp)
    mkdirSync(directory, { recursive: true })
    const archivePath = join(directory, `${scheme}.xcarchive`)
    const ipaPath = join(directory, `${scheme}.ipa`)
    const version = typeof input.version === 'string' && input.version.trim() !== '' ? input.version.trim() : null
    const buildNumber = typeof input.buildNumber === 'string' && input.buildNumber.trim() !== ''
      ? input.buildNumber.trim()
      : null
    const argv = buildArgv({
      kind: project.kind,
      projectPath: project.path,
      scheme,
      version,
      buildNumber,
      appId,
      archivePath,
      ipaPath,
    })
    const state = await engine.detect()
    if (!state.installed || !state.path) {
      // @ts-expect-error the dispatcher reads this code off the error
      const error = new Error('The asc engine is not installed.')
      error.code = 'ASC_NOT_INSTALLED'
      throw error
    }

    // Archive and export are local and long; upload talks to App Store Connect.
    const archive = await asc.must(argv.archive, {
      path: state.path,
      output: false,
      local: true,
      timeoutMs: 45 * 60_000,
      signal: options.signal,
    })
    const exported = await asc.must(argv.export, {
      path: state.path,
      output: false,
      local: true,
      timeoutMs: 20 * 60_000,
      signal: options.signal,
    })
    const uploaded = await asc.must(argv.upload, {
      path: state.path,
      output: false,
      timeoutMs: 60 * 60_000,
      signal: options.signal,
    })
    const json = uploaded.json ?? {}
    return {
      scheme,
      project: projectName(project),
      archivePath,
      ipaPath,
      version,
      buildNumber,
      buildId: typeof json.buildId === 'string' ? json.buildId : null,
      log: [tail(archive), tail(exported), tail(uploaded)].filter(line => line !== '').join('\n'),
    }
  }

  return { facts, schemesFor, create }
}
