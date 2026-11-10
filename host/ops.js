/**
 * App Store Connect operations: apps, builds, TestFlight, review and sales.
 *
 * This module knows the asc command surface and nothing else. Gating (read-only
 * mode, confirmation, approval), redaction and the result envelope are the
 * dispatcher's job, so every adapter sees the same behaviour.
 */

import { field, pickArray } from './asc.js'
import { redact } from './redact.js'

function fail(code, message, detail) {
  const error = new Error(message)
  error.code = code
  error.detail = detail
  throw error
}

function requireApp(input, config) {
  const appId = input.appId ?? config.defaultAppId
  if (!appId) fail('APP_NOT_SELECTED', 'Choose an app first.')
  return String(appId)
}

function log(result) {
  return redact(`${result.stdout}\n${result.stderr}`).trim()
}

/** Index one ASC response's `included` array by `type:id`. */
export function indexIncluded(json) {
  const included = json && Array.isArray(json.included) ? json.included : []
  const index = new Map()
  for (const item of included) {
    if (!item || typeof item !== 'object') continue
    const type = typeof item.type === 'string' ? item.type : ''
    const id = field(item, 'id')
    if (type === '' || id === undefined || id === null || id === '') continue
    index.set(`${type}:${String(id)}`, item)
  }
  return index
}

/** The id of a to-one relationship, e.g. `preReleaseVersion`. */
function relationshipId(entry, name) {
  const id = field(entry, `relationships.${name}.data.id`)
  return id === undefined || id === null || id === '' ? '' : String(id)
}

/** The ids of a to-many relationship, e.g. `betaGroups`. */
function relationshipIds(entry, name) {
  const data = field(entry, `relationships.${name}.data`)
  if (!Array.isArray(data)) return []
  return data
    .map((item) => (item && item.id !== undefined && item.id !== null ? String(item.id) : ''))
    .filter((id) => id !== '')
}

/** A TestFlight audience counts once Apple reports the build in it. */
const BETA_LIVE = /^(READY_FOR_BETA_TESTING|IN_BETA_TESTING)$/

/**
 * One `builds` resource → the contract's build shape.
 *
 * `attributes.version` is CFBundleVersion — the build number, not the marketing
 * version. CFBundleShortVersionString lives on the included `preReleaseVersions`
 * resource, and both TestFlight audiences live on the included
 * `buildBetaDetails` and `betaGroups` resources, which is why `builds.list`
 * asks asc for those includes.
 *
 * @param {any} entry one resource from `data`
 * @param {Map<string, any>} included
 */
export function normalizeBuild(entry, included) {
  const lookup = (relationship, type) => {
    const id = relationshipId(entry, relationship)
    return id === '' ? null : included.get(`${type}:${id}`) ?? null
  }
  const preRelease = lookup('preReleaseVersion', 'preReleaseVersions')
  const detail = lookup('buildBetaDetail', 'buildBetaDetails')
  const groups = relationshipIds(entry, 'betaGroups')
    .map((id) => included.get(`betaGroups:${id}`))
    .filter(Boolean)
  const audiences = groups
    .map((group) => field(group, 'attributes.isInternalGroup'))
    .filter((flag) => typeof flag === 'boolean')
  const internalState = field(detail, 'attributes.internalBuildState')
  const externalState = field(detail, 'attributes.externalBuildState')
  const live = (state) => typeof state === 'string' && BETA_LIVE.test(state.toUpperCase())
  return {
    id: String(field(entry, 'id') ?? ''),
    version: String(field(preRelease, 'attributes.version') ?? field(preRelease, 'version') ?? ''),
    buildNumber: String(field(entry, 'attributes.version') ?? field(entry, 'buildNumber') ?? ''),
    processingState: String(
      field(entry, 'attributes.processingState') ?? field(entry, 'processingState') ?? 'UNKNOWN',
    ),
    uploadedDate: field(entry, 'attributes.uploadedDate') ?? field(entry, 'uploadedDate') ?? null,
    expired: Boolean(field(entry, 'attributes.expired') ?? field(entry, 'expired')),
    internal: audiences.includes(true) || live(internalState),
    external: audiences.includes(false) || live(externalState),
    internalBuildState: typeof internalState === 'string' ? internalState : null,
    externalBuildState: typeof externalState === 'string' ? externalState : null,
  }
}

/** `asc builds list --output json` → the contract's `{ builds }`. */
export function normalizeBuilds(json) {
  const included = indexIncluded(json)
  return pickArray(json, ['builds', 'data'])
    .map((entry) => normalizeBuild(entry, included))
    .filter((build) => build.id !== '')
}

/**
 * @param {any} ctx
 * @param {{ defaultAppId: string|null, vendorNumber?: string|null }} config
 * @param {ReturnType<import('./asc.js').createAsc>} asc
 * @param {{ detect: Function }} engine
 */
export function createOps(ctx, config, asc, engine) {
  async function binary() {
    const state = await engine.detect()
    if (!state.installed || !state.path) {
      const error = new Error('The asc engine is not installed.')
      error.code = 'ASC_NOT_INSTALLED'
      throw error
    }
    return state.path
  }

  // ---------------------------------------------------------------- apps ----
  async function listApps(input = {}, options = {}) {
    const path = await binary()
    const argv = ['apps', 'list', '--limit', String(Math.min(Math.max(Number(input.limit) || 50, 1), 200))]
    if (input.name) argv.push('--name', String(input.name))
    const result = await asc.must(argv, { path, timeoutMs: 60_000, signal: options.signal })
    const apps = pickArray(result.json, ['apps', 'data']).map((entry) => ({
      id: String(field(entry, 'id') ?? field(entry, 'attributes.id') ?? ''),
      name: field(entry, 'name') ?? field(entry, 'attributes.name') ?? '',
      bundleId: field(entry, 'bundleId') ?? field(entry, 'attributes.bundleId') ?? '',
      sku: field(entry, 'sku') ?? field(entry, 'attributes.sku') ?? undefined,
      primaryLocale:
        field(entry, 'primaryLocale') ?? field(entry, 'attributes.primaryLocale') ?? undefined,
    }))
    return { apps: apps.filter((app) => app.id !== '') }
  }

  // -------------------------------------------------------------- builds ----
  async function listBuilds(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50)
    const result = await asc.must(
      [
        'builds',
        'list',
        '--app',
        appId,
        '--sort',
        '-uploadedDate',
        '--limit',
        String(limit),
        // The marketing version and both TestFlight audiences are related
        // resources; without these includes a build only carries the build
        // number from its own attributes.
        '--include',
        'preReleaseVersion,buildBetaDetail,betaGroups',
      ],
      { path, timeoutMs: 60_000, signal: options.signal },
    )
    return { builds: normalizeBuilds(result.json) }
  }

  async function uploadBuild(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const argv = ['builds', 'upload', '--app', appId, '--ipa', String(input.ipaPath)]
    if (input.version) argv.push('--version', String(input.version))
    if (input.buildNumber) argv.push('--build-number', String(input.buildNumber))
    if (input.wait === true) argv.push('--wait')
    const result = await asc.run(argv, {
      path,
      timeoutMs: input.wait === true ? 30 * 60_000 : 10 * 60_000,
      signal: options.signal,
    })
    if (result.exitCode !== 0) {
      fail('ASC_FAILED', 'The build upload failed.', log(result))
    }
    const json = result.json ?? {}
    return { log: log(result), buildId: field(json, 'buildId') ?? field(json, 'receipt.buildId') ?? undefined }
  }

  // ---------------------------------------------------------- testflight ----
  async function listGroups(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const result = await asc.must(['testflight', 'groups', 'list', '--app', appId], {
      path,
      timeoutMs: 60_000,
      signal: options.signal,
    })
    const groups = pickArray(result.json, ['groups', 'data']).map((entry) => ({
      id: String(field(entry, 'id') ?? ''),
      name: field(entry, 'name') ?? field(entry, 'attributes.name') ?? '',
      internal: Boolean(field(entry, 'internal') ?? field(entry, 'attributes.isInternalGroup')),
      publicLink: field(entry, 'publicLink') ?? field(entry, 'attributes.publicLink') ?? undefined,
      testerCount: field(entry, 'testerCount') ?? undefined,
    }))
    return { groups }
  }

  async function distribute(input, options = {}) {
    const path = await binary()
    requireApp(input, config)
    if (!input.buildId) fail('INVALID_INPUT', 'Choose a build to distribute.')
    let logText = ''
    if (typeof input.whatsNew === 'string' && input.whatsNew.trim() !== '') {
      const notes = await asc.run(
        [
          'builds',
          'test-notes',
          'create',
          '--build-id',
          String(input.buildId),
          '--locale',
          String(input.locale ?? 'en-US'),
          '--whats-new',
          input.whatsNew,
        ],
        { path, timeoutMs: 60_000, signal: options.signal },
      )
      logText += `${log(notes)}\n`
      if (notes.exitCode !== 0) fail('ASC_FAILED', 'asc could not save the "What to Test" note.', logText)
    }
    const picked = await resolveGroups(input, options)
    if (picked.length === 0) fail('INVALID_INPUT', 'Select at least one TestFlight group.')
    const groups = picked.map((group) => group.name)
    const argv = ['builds', 'add-groups', '--build-id', String(input.buildId), '--group', groups.join(',')]
    // Assigning an external group is not enough for its testers to receive the build:
    // external distribution needs a beta review submission, and that is a separate
    // step of the same command.
    if (picked.some((group) => group.internal === false)) argv.push('--submit', '--confirm')
    const added = await asc.run(argv, { path, timeoutMs: 5 * 60_000, signal: options.signal })
    logText += log(added)
    if (added.exitCode !== 0) fail('ASC_FAILED', 'asc could not add the build to those groups.', logText)
    return { log: logText.trim() }
  }

  /**
   * asc addresses beta groups by name on `builds add-groups`. An id-only request
   * is resolved against the app's groups first, so a caller that works from ids
   * (the panel's checkbox list) never has to know that detail.
   */
  /**
   * The selected groups as full records, so a caller can act on `internal` and not
   * only on the name: an external group needs a beta review submission before its
   * testers see anything, an internal one does not.
   */
  async function resolveGroups(input, options = {}) {
    const ids = Array.isArray(input.groupIds) ? input.groupIds.map(String) : []
    const names = Array.isArray(input.groupNames) ? input.groupNames.map(String) : []
    if (ids.length === 0 && names.length === 0) return []
    const { groups } = await listGroups({ ...input }, options)
    if (ids.length > 0) {
      const byId = new Map(groups.map((group) => [String(group.id), group]))
      const picked = ids.map((id) => byId.get(id)).filter(Boolean)
      if (picked.length !== ids.length) {
        fail('INVALID_INPUT', 'One of the selected TestFlight groups no longer exists; refresh the group list.')
      }
      return picked
    }
    const byName = new Map(groups.map((group) => [String(group.name), group]))
    const picked = names.map((name) => byName.get(name)).filter(Boolean)
    if (picked.length !== names.length) {
      fail('INVALID_INPUT', 'One of the selected TestFlight groups no longer exists; refresh the group list.')
    }
    return picked
  }

  async function normalizeGroups(input, options = {}) {
    const picked = await resolveGroups(input, options)
    return picked.map((group) => group.name)
  }

  async function submitBeta(input, options = {}) {
    const path = await binary()
    if (!input.buildId) fail('INVALID_INPUT', 'Choose a build to submit for beta review.')
    const result = await asc.run(
      ['testflight', 'review', 'submit', '--build-id', String(input.buildId), '--confirm'],
      { path, timeoutMs: 5 * 60_000, signal: options.signal },
    )
    if (result.exitCode !== 0) {
      fail('ASC_FAILED', 'asc could not submit the build for beta review.', log(result))
    }
    return { log: log(result) }
  }

  // -------------------------------------------------------------- review ----
  async function readiness(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const argv = ['validate', '--app', appId]
    if (input.version) argv.push('--version', String(input.version))
    const result = await asc.run(argv, { path, timeoutMs: 5 * 60_000, signal: options.signal })
    const json = result.json
    const blockers = collectBlockers(json)
    const ready = result.exitCode === 0 && blockers.length === 0
    if (result.exitCode !== 0 && blockers.length === 0) {
      blockers.push({ code: 'ASC_FAILED', message: firstLine(result.stderr) ?? 'asc validate failed.' })
    }
    return {
      ready,
      blockers,
      warnings: countWarnings(json),
      version: input.version ?? field(json, 'version') ?? undefined,
      raw: json ?? undefined,
    }
  }

  /**
   * The blockers `asc validate --output json` reports.
   *
   * The authoritative shape is `remediation.steps[]`: every step carries `blocking`,
   * `severity`, `checkId`, `message` and `remediation`, in the order a person should
   * fix them. `checks[]` is the same set without the ordering, so it is the fallback
   * for a hard error, and the older `blockers`/`issues` lists stay accepted so a future
   * asc keeps working. Warnings are counted but never block.
   */
  function collectBlockers(json) {
    const steps = pickArray(field(json, 'remediation') ?? {}, ['steps'])
    const blocking = steps.filter((step) => field(step, 'blocking') === true)
    if (blocking.length > 0) return normalize(blocking)
    const errors = pickArray(json, ['checks'])
      .filter((check) => String(field(check, 'severity') ?? '').toLowerCase() === 'error')
    if (errors.length > 0) return normalize(errors)
    const legacy = [
      ...pickArray(json, ['blockers', 'issues', 'problems', 'errors']),
      ...pickArray(field(json, 'summary') ?? {}, ['blockers', 'issues']),
    ]
    return normalize(legacy)

    function normalize(entries) {
      return entries.slice(0, 40).map((entry) => ({
        code: String(field(entry, 'checkId') ?? field(entry, 'code') ?? field(entry, 'id') ?? 'BLOCKER'),
        message: String(field(entry, 'message') ?? field(entry, 'title') ?? ''),
        detail: field(entry, 'remediation') ? String(field(entry, 'remediation')) : undefined,
      }))
    }
  }

  /** How many non-blocking warnings the same report carries. */
  function countWarnings(json) {
    const steps = pickArray(field(json, 'remediation') ?? {}, ['steps'])
    return steps.filter((step) => field(step, 'blocking') !== true
      && String(field(step, 'severity') ?? '').toLowerCase() === 'warning').length
  }

  async function releaseStatus(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const result = await asc.run(
      ['status', '--app', appId, '--include', 'appstore,submission,review'],
      { path, timeoutMs: 90_000, signal: options.signal },
    )
    const json = result.json
    const versionState = field(json, 'appstore.state') ?? undefined
    const reviewState = field(json, 'review.state') ?? field(json, 'submission.state') ?? undefined
    return {
      version: field(json, 'appstore.version') ?? field(json, 'version') ?? undefined,
      versionId: field(json, 'appstore.versionId') ?? field(json, 'versionId') ?? undefined,
      versionState,
      reviewState,
      // The one word a caller usually wants: where the version is right now.
      state: versionState ?? reviewState ?? undefined,
      buildNumber: field(json, 'appstore.buildNumber') ?? field(json, 'builds.latest.buildNumber') ?? undefined,
      submittedDate:
        field(json, 'submission.submittedDate') ?? field(json, 'review.submittedDate') ?? undefined,
      raw: json ?? undefined,
    }
  }

  /**
   * Release a version App Review already approved (`PENDING_DEVELOPER_RELEASE`).
   *
   * `asc versions release` is the mutating call; the Host supplies `--confirm` only
   * after the panel's gate passed, exactly like every other destructive command.
   */
  async function publishVersion(input, options = {}) {
    const path = await binary()
    const versionId = typeof input.versionId === 'string' ? input.versionId.trim() : ''
    if (versionId === '') fail('INVALID_INPUT', 'A version id is required to release a version.')
    const result = await asc.must(['versions', 'release', '--version-id', versionId, '--confirm'], {
      path,
      timeoutMs: 120_000,
      signal: options.signal,
    })
    return {
      versionId,
      released: true,
      raw: result.json ?? undefined,
    }
  }

  /**
   * The App Store versions of an app with the build each one carries.
   *
   * This is the only honest way to answer "has this build been through review?":
   * App Review applies to a version, and a version's state says whether it got
   * through. A build that no version carries never went to review at all.
   */
  async function listVersions(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const result = await asc.run(
      ['versions', 'list', '--app', appId, '--include', 'build'],
      { path, timeoutMs: 90_000, signal: options.signal },
    )
    const json = result.json
    const versions = pickArray(json, ['appStoreVersions', 'versions', 'data'])
      .map((entry) => ({
        id: String(field(entry, 'id') ?? ''),
        version: String(field(entry, 'attributes.versionString') ?? ''),
        // appVersionState is the live one; appStoreState is the deprecated spelling.
        state: String(
          field(entry, 'attributes.appVersionState') ?? field(entry, 'attributes.appStoreState') ?? '',
        ),
        buildId: String(field(entry, 'relationships.build.data.id') ?? '') || null,
        createdDate: field(entry, 'attributes.createdDate') ?? undefined,
      }))
      .filter((version) => version.id !== '')
    return { versions }
  }

  async function submitRelease(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    let buildId = input.buildId
    let logText = ''
    if (!buildId) {
      const builds = await listBuilds({ appId, limit: 10 }, options)
      buildId = builds.builds.find((build) => String(build.processingState).toUpperCase() === 'VALID')?.id
      if (!buildId) fail('PROCESSING_PENDING', 'No processed build is available yet; wait for processing.')
    }
    const version = input.version ? String(input.version) : ''
    // `review submit` attaches a build to a version that must already exist; a version
    // number nobody has created yet fails with "create it first", so create it here.
    if (version !== '') {
      const { versions } = await listVersions({ appId }, options)
      const exists = versions.some((entry) => entry.version === version)
      if (!exists) {
        const created = await asc.must(
          ['versions', 'create', '--app', appId, '--version', version, '--platform', String(input.platform ?? 'IOS')],
          { path, timeoutMs: 2 * 60_000, signal: options.signal },
        )
        logText += `${log(created)}\n`
      }
    }
    const argv = ['review', 'submit', '--app', appId, '--build-id', String(buildId), '--confirm']
    if (version !== '') argv.push('--version', version)
    const result = await asc.run(argv, { path, timeoutMs: 10 * 60_000, signal: options.signal })
    if (result.exitCode !== 0) {
      const text = `${logText}\n${log(result)}`.trim()
      if (/readiness|blocker|not ready|invalid/i.test(text)) {
        fail('READINESS_BLOCKED', 'The version is not ready for submission yet.', text)
      }
      fail('ASC_FAILED', 'asc could not submit the version for review.', text)
    }
    return { log: `${logText}\n${log(result)}`.trim() }
  }

  // --------------------------------------------------------------- sales ----
  async function salesSummary(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const vendor = input.vendorNumber ?? config.vendorNumber
    if (!vendor) {
      fail(
        'VENDOR_REQUIRED',
        'App Store Connect sales reports are vendor-scoped. Add your Vendor number (the id in the Sales and Trends URL).',
      )
    }
    const period = input.period === 'week' ? 'week' : 'day'
    const weekStart = input.week ?? input.date
    const result =
      period === 'day'
        ? await asc.run(
            ['insights', 'daily', '--app', appId, '--vendor', String(vendor)]
              .concat(input.date ? ['--date', String(input.date)] : []),
            { path, timeoutMs: 5 * 60_000, signal: options.signal },
          )
        : await asc.run(
            ['insights', 'weekly', '--app', appId, '--vendor', String(vendor), '--source', 'sales']
              // The panel sends `date`; the tool may send `week`. Both name the
              // week start that asc itself requires.
              .concat(weekStart ? ['--week', String(weekStart)] : []),
            { path, timeoutMs: 5 * 60_000, signal: options.signal },
          )
    if (result.exitCode !== 0) {
      fail('ASC_FAILED', 'asc could not read a sales report for that date.', log(result))
    }
    return normalizeSales(period, input.date, result.json)
  }

  function normalizeSales(period, date, json) {
    const rows = pickArray(json, ['rows', 'days', 'series'])
      .slice(0, 60)
      .map((entry) => ({
        date: field(entry, 'date') ?? field(entry, 'day') ?? '',
        units: field(entry, 'units') ?? field(entry, 'totalUnits') ?? null,
        proceeds: field(entry, 'proceeds') ?? field(entry, 'totalProceeds') ?? null,
        currency: field(entry, 'currency') ?? undefined,
      }))
    const totals =
      field(json, 'totals') ??
      (json !== null && typeof json === 'object' && ('units' in json || 'proceeds' in json)
        ? { units: field(json, 'units') ?? null, proceeds: field(json, 'proceeds') ?? null }
        : undefined)
    return {
      period,
      date: date ?? field(json, 'date') ?? undefined,
      totals: totals ?? undefined,
      rows,
      raw: rows.length === 0 ? (json ?? undefined) : undefined,
    }
  }

  async function analyticsReports(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const result = await asc.run(['analytics', 'requests', '--app', appId, '--paginate'], {
      path,
      timeoutMs: 2 * 60_000,
      signal: options.signal,
    })
    if (result.exitCode !== 0) {
      fail('ASC_FAILED', 'asc could not list analytics report requests.', log(result))
    }
    const requests = pickArray(result.json, ['requests', 'data'])
    return { requests, raw: true }
  }

  return {
    listApps,
    listBuilds,
    uploadBuild,
    listGroups,
    distribute,
    submitBeta,
    readiness,
    publishVersion,
    listVersions,
    releaseStatus,
    submitRelease,
    salesSummary,
    analyticsReports,
  }
}

function firstLine(text) {
  if (typeof text !== 'string') return undefined
  const line = text.split('\n').map((item) => item.trim()).find((item) => item !== '')
  return line ? redact(line).slice(0, 400) : undefined
}
