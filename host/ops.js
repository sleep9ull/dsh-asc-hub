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
      ['builds', 'list', '--app', appId, '--sort', '-uploadedDate', '--limit', String(limit)],
      { path, timeoutMs: 60_000, signal: options.signal },
    )
    const builds = pickArray(result.json, ['builds', 'data']).map((entry) => ({
      id: String(field(entry, 'id') ?? ''),
      version: field(entry, 'version') ?? field(entry, 'attributes.version') ?? '',
      buildNumber: field(entry, 'buildNumber') ?? field(entry, 'attributes.version') ?? '',
      processingState:
        field(entry, 'processingState') ?? field(entry, 'attributes.processingState') ?? 'UNKNOWN',
      uploadedDate: field(entry, 'uploadedDate') ?? field(entry, 'attributes.uploadedDate') ?? null,
      expired: Boolean(field(entry, 'expired') ?? field(entry, 'attributes.expired')),
    }))
    return { builds }
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
    const groups = await normalizeGroups(input, options)
    if (groups.length === 0) fail('INVALID_INPUT', 'Select at least one TestFlight group.')
    const added = await asc.run(
      ['builds', 'add-groups', '--build-id', String(input.buildId), '--group', groups.join(',')],
      { path, timeoutMs: 5 * 60_000, signal: options.signal },
    )
    logText += log(added)
    if (added.exitCode !== 0) fail('ASC_FAILED', 'asc could not add the build to those groups.', logText)
    return { log: logText.trim() }
  }

  /**
   * asc addresses beta groups by name on `builds add-groups`. An id-only request
   * is resolved against the app's groups first, so a caller that works from ids
   * (the panel's checkbox list) never has to know that detail.
   */
  async function normalizeGroups(input, options = {}) {
    if (Array.isArray(input.groupNames) && input.groupNames.length > 0) {
      return input.groupNames.map(String)
    }
    if (Array.isArray(input.groupIds) && input.groupIds.length > 0) {
      const { groups } = await listGroups({ ...input }, options)
      const byId = new Map(groups.map((group) => [group.id, group.name]))
      const names = input.groupIds.map((id) => byId.get(String(id))).filter((name) => typeof name === 'string')
      if (names.length !== input.groupIds.length) {
        fail('INVALID_INPUT', 'One of the selected TestFlight groups no longer exists; refresh the group list.')
      }
      return names
    }
    return []
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
      version: input.version ?? field(json, 'version') ?? undefined,
      raw: json ?? undefined,
    }
  }

  function collectBlockers(json) {
    const candidates = [
      ...pickArray(json, ['blockers', 'issues', 'problems', 'errors']),
      ...pickArray(field(json, 'summary') ?? {}, ['blockers', 'issues']),
    ]
    return candidates.slice(0, 40).map((entry) => ({
      code: String(field(entry, 'code') ?? field(entry, 'id') ?? 'BLOCKER'),
      message: String(field(entry, 'message') ?? field(entry, 'title') ?? JSON.stringify(entry)),
    }))
  }

  async function releaseStatus(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    const result = await asc.run(
      ['status', '--app', appId, '--include', 'appstore,submission,review'],
      { path, timeoutMs: 90_000, signal: options.signal },
    )
    const json = result.json
    return {
      version: field(json, 'appstore.version') ?? field(json, 'version') ?? undefined,
      state:
        field(json, 'appstore.state') ??
        field(json, 'submission.state') ??
        field(json, 'review.state') ??
        undefined,
      buildNumber: field(json, 'appstore.buildNumber') ?? field(json, 'builds.latest.buildNumber') ?? undefined,
      submittedDate:
        field(json, 'submission.submittedDate') ?? field(json, 'review.submittedDate') ?? undefined,
      raw: json ?? undefined,
    }
  }

  async function submitRelease(input, options = {}) {
    const path = await binary()
    const appId = requireApp(input, config)
    let buildId = input.buildId
    if (!buildId) {
      const builds = await listBuilds({ appId, limit: 10 }, options)
      buildId = builds.builds.find((build) => String(build.processingState).toUpperCase() === 'VALID')?.id
      if (!buildId) fail('PROCESSING_PENDING', 'No processed build is available yet; wait for processing.')
    }
    const argv = ['review', 'submit', '--app', appId, '--build-id', String(buildId), '--confirm']
    if (input.version) argv.push('--version', String(input.version))
    const result = await asc.run(argv, { path, timeoutMs: 10 * 60_000, signal: options.signal })
    if (result.exitCode !== 0) {
      const text = log(result)
      if (/readiness|blocker|not ready|invalid/i.test(text)) {
        fail('READINESS_BLOCKED', 'The version is not ready for submission yet.', text)
      }
      fail('ASC_FAILED', 'asc could not submit the version for review.', text)
    }
    return { log: log(result) }
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
