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
import type { Dirent } from 'node:fs'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { childEnv, resolveExecutable, runProcess } from './exec.js'
import { redact } from './redact.js'
import type {
  AscMust,
  AscOutcome,
  CallOptions,
  EngineDetector,
  EnvConfig,
  ExecResult,
  HostContext,
  HubConfig,
} from './types.js'
import { hostError, isRecord } from './types.js'

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

/** The Xcode project a directory builds. */
export interface Project {
  kind: 'workspace' | 'project'
  path: string
  depth: number
}

/** What a directory can build, and why not when it cannot. */
export interface BuildFacts {
  xcode: boolean
  kind: 'workspace' | 'project' | null
  project: string | null
  name: string | null
  ios: boolean
  schemes: string[]
  ready: boolean
  reason: string | null
}

/** The three asc argument lists one build needs. */
export interface BuildArgv {
  archive: string[]
  export: string[]
  upload: string[]
}

/** What one completed build reports back. */
export interface BuildCreateResult {
  scheme: string
  project: string | null
  archivePath: string
  ipaPath: string
  version: string | null
  buildNumber: string | null
  buildId: string | null
  log: string
}

/** The build surface the dispatcher calls. */
export interface Build {
  facts(cwd: string | null): Promise<BuildFacts>
  schemesFor(project: Project, cwd: string, signal?: AbortSignal): Promise<string[]>
  create(input?: Record<string, unknown>, options?: CallOptions): Promise<BuildCreateResult>
}

/**
 * The Xcode project a directory builds.
 *
 * Podfile layouts usually put `App.xcworkspace` beside the sources; monorepos put
 * it one level down (`ios/App.xcworkspace`). A workspace wins because it carries
 * the dependency graph; a project is the fallback. `Pods/Pods.xcodeproj` and
 * friends are skipped by name, so the fallback cannot pick a generated project.
 *
 * @param root absolute working directory
 */
export function findProject(root: string): Project | null {
  if (typeof root !== 'string' || root === '') return null
  const found: Project[] = []
  const walk = (directory: string, depth: number) => {
    let entries: Dirent[]
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
  const rank = (entry: Project) => (entry.kind === 'workspace' ? 0 : 1)
  found.sort((a, b) => a.depth - b.depth || rank(a) - rank(b) || a.path.localeCompare(b.path))
  return found[0]
}

/** A short label for the project: `App.xcworkspace`. */
export function projectName(project: Project | null): string | null {
  return project && typeof project.path === 'string' ? basename(project.path) : null
}

/**
 * `xcodebuild -list -json` → its schemes, tolerating every other shape.
 * The JSON is either `{ workspace: { schemes: [...] } }` or the `project` variant.
 */
export function parseSchemes(stdout: string): string[] {
  try {
    const parsed: unknown = JSON.parse(String(stdout ?? ''))
    const container = isRecord(parsed)
      ? isRecord(parsed.workspace)
        ? parsed.workspace
        : isRecord(parsed.project)
          ? parsed.project
          : null
      : null
    const schemes = container && Array.isArray(container.schemes) ? container.schemes : []
    return schemes.filter((name): name is string => typeof name === 'string' && name.trim() !== '')
  } catch {
    return []
  }
}

/**
 * The three asc argument lists a build needs, built here so they are testable and
 * so the version travels as a build setting instead of a project rewrite.
 */
export function buildArgv(spec: {
  kind: 'workspace' | 'project'
  projectPath: string
  scheme: string
  version: string | null
  buildNumber: string | null
  appId: string
  archivePath: string
  ipaPath: string
}): BuildArgv {
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
 */
export function projectIsIos(project: Project | null): boolean {
  if (!project || typeof project.path !== 'string') return false
  const candidates: string[] = []
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
function tail(result: AscOutcome | undefined): string {
  const text = redact(`${result?.stderr ?? ''}\n${result?.stdout ?? ''}`).trim()
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  return lines.slice(-8).join('\n')
}

export function createBuild(
  ctx: HostContext,
  config: EnvConfig & Pick<HubConfig, 'maxOutputBytes'>,
  asc: AscMust,
  engine: EngineDetector,
): Build {
  /**
   * Whether this machine can build an iOS app.
   *
   * `xcodebuild` resolving is not enough: with only the Command Line Tools selected,
   * it exists but refuses every project ("requires Xcode"), and the developer
   * directory is what says which of the two is active.
   */
  async function xcodeAvailable(): Promise<boolean> {
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
  async function facts(cwd: string | null): Promise<BuildFacts> {
    const project = typeof cwd === 'string' && cwd !== '' ? findProject(cwd) : null
    const xcode = await xcodeAvailable()
    const base: BuildFacts = {
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
    const schemes = await schemesFor(project, cwd ?? '')
    if (!ios) return { ...base, ios: false, schemes, reason: 'not-ios' }
    const ready = schemes.length > 0
    return { ...base, ios: true, schemes, ready, reason: ready ? null : 'unloadable' }
  }

  async function schemesFor(project: Project, cwd: string, signal?: AbortSignal): Promise<string[]> {
    const flag = project.kind === 'workspace' ? '-workspace' : '-project'
    let result: ExecResult | undefined
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
   */
  async function create(
    input: Record<string, unknown> = {},
    options: CallOptions = {},
  ): Promise<BuildCreateResult> {
    const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : ''
    if (cwd === '') {
      throw hostError('BUILD_UNAVAILABLE', 'This session has no working directory to build.')
    }
    const appId = String(input.appId ?? '')
    const project = findProject(cwd)
    if (project === null) {
      throw hostError('BUILD_UNAVAILABLE', `No Xcode project or workspace found under ${cwd}.`)
    }
    const schemes = typeof input.scheme === 'string' && input.scheme !== ''
      ? [input.scheme]
      : await schemesFor(project, cwd, options.signal)
    const scheme = schemes.length > 0 ? String(schemes[0]) : (projectName(project) ?? '').replace(/\.xcodeproj$/, '')
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
      throw hostError('ASC_NOT_INSTALLED', 'The asc engine is not installed.')
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
    const json = uploaded.json
    const buildIdValue = isRecord(json) ? json.buildId : undefined
    return {
      scheme,
      project: projectName(project),
      archivePath,
      ipaPath,
      version,
      buildNumber,
      buildId: typeof buildIdValue === 'string' ? buildIdValue : null,
      log: [tail(archive), tail(exported), tail(uploaded)].filter(line => line !== '').join('\n'),
    }
  }

  return { facts, schemesFor, create }
}
