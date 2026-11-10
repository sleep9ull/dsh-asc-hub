/**
 * The model adapter: one tool (`asc_hub`) over the same dispatcher the panel uses.
 *
 * "One operation, two callers": the tool never re-implements an operation, and it
 * inherits the same gating. Writes additionally pass through `tools/pre-execute`,
 * which turns them into a Host approval request so a human always sees a mutating
 * App Store Connect action before it happens.
 */

import { HubError } from './dispatch.js'
import type { Hub } from './dispatch.js'
import { redact } from './redact.js'
import type { HostContext, ToolDefinition, ToolRegistry } from './types.js'
import { errorCode, errorDetail, errorMessage } from './types.js'

/** Fields the tool accepts and forwards into the action's `input`. */
const INPUT_FIELDS: string[] = [
  'appId',
  'vendorNumber',
  'period',
  'date',
  'week',
  'buildId',
  'versionId',
  'groupNames',
  'groupIds',
  'whatsNew',
  'locale',
  'ipaPath',
  'version',
  'buildNumber',
  'wait',
  'confirm',
  'method',
  'limit',
  'argv',
  'cwd',
  'timeoutMs',
]

const DESCRIPTION = `App Store Connect operations for iOS releases through the asc engine.

Use this tool after the app is built, to finish shipping it:
- \`status\`: the console state (engine, sign-in, running operation, last error).
- \`engine.detect\` / \`engine.install\`: check or install the asc engine (Homebrew when present, otherwise the official installer). Installing asks the user for approval.
- \`auth.status\` / \`auth.doctor\`: read the credential state. Signing in and out is a HUMAN action in the ASC Hub panel; this tool cannot do it, and you must ask the user to use the panel instead.
- \`apps.list\`: find the app id and bundle id.
- \`builds.list\`: recent builds with their processing state. \`builds.upload\`: upload an .ipa.
- \`testflight.groups\`: beta groups. \`testflight.distribute\`: add a build to groups (optionally writing the "What to Test" note). \`testflight.submitBeta\`: submit a build for beta review.
- \`release.readiness\`: the canonical submission readiness check and its blockers. \`release.status\`: the version state and the review state. \`release.submit\`: submit the version for App Review. \`release.versions\`: the App Store versions with the build each carries (which is how you know whether a build has been reviewed). \`release.publish\`: release a version App Review already approved (\`PENDING_DEVELOPER_RELEASE\`).
- \`sales.summary\`: sales for a day or a week (needs the Vendor number). \`analytics.reports\`: analytics report requests.
- \`run\`: READ-ONLY escape hatch for an asc argv this surface does not cover yet. It always runs with asc's own read-only switch on, in every mode.

Read actions run immediately. Publishing actions (builds.upload, testflight.distribute, testflight.submitBeta, release.submit, release.publish) need the plugin in \`mode: write\`, an explicit \`confirm: true\`, and a human approval; without approval they fail closed. Report the returned \`code\` to the user and follow its remedy instead of retrying blindly.`

const PARAMETERS: Record<string, unknown> = {
  action: {
    type: 'string',
    required: true,
    description:
      'The operation to run: status, engine.detect, engine.install, auth.status, auth.doctor, apps.list, builds.list, builds.upload, testflight.groups, testflight.distribute, testflight.submitBeta, release.readiness, release.status, release.submit, release.publish, release.versions, sales.summary, analytics.reports, run.',
  },
  appId: { type: 'string', description: 'App Store Connect app id (falls back to the configured default).' },
  vendorNumber: {
    type: 'string',
    description: 'Vendor number for sales reports; the id in the App Store Connect Sales and Trends URL.',
  },
  period: { type: 'string', enum: ['day', 'week'], description: 'For sales.summary: report period.' },
  date: { type: 'string', description: 'For sales.summary: report date, YYYY-MM-DD.' },
  week: { type: 'string', description: 'For sales.summary with period week: the week start, YYYY-MM-DD.' },
  buildId: { type: 'string', description: 'App Store Connect build id for distribution or submission.' },
  groupNames: {
    type: 'array',
    items: { type: 'string' },
    description: 'For testflight.distribute: TestFlight group names.',
  },
  groupIds: {
    type: 'array',
    items: { type: 'string' },
    description: 'For testflight.distribute: TestFlight group ids.',
  },
  whatsNew: { type: 'string', description: 'For testflight.distribute: the "What to Test" note.' },
  locale: { type: 'string', description: 'For the "What to Test" note: locale id, e.g. en-US.' },
  ipaPath: { type: 'string', description: 'For builds.upload: absolute path to the .ipa.' },
  version: { type: 'string', description: 'Marketing version, e.g. 1.4.0.' },
  buildNumber: { type: 'string', description: 'Build number, e.g. 42.' },
  wait: { type: 'boolean', description: 'For builds.upload: wait until App Store Connect finishes processing.' },
  method: { type: 'string', enum: ['brew', 'curl'], description: 'For engine.install: installer channel.' },
  confirm: {
    type: 'boolean',
    description:
      'Publishing actions require `true`. Only after the user explicitly agreed to this exact change. Engine install and credential actions do not take this field.',
  },
  argv: {
    type: 'array',
    items: { type: 'string' },
    description:
      'For run: the asc argv tail, e.g. ["builds","list","--app","123"]. No shell quoting. Mutating subcommands are refused; the escape hatch is read-only.',
  },
  cwd: { type: 'string', description: 'For run: working directory.' },
  timeoutMs: { type: 'integer', description: 'For run: timeout in milliseconds.' },
}

export function registerTool(ctx: HostContext, tools: ToolRegistry, hub: Hub): void {
  const definition: ToolDefinition = {
    name: 'asc_hub',
    description: DESCRIPTION,
    parameters: PARAMETERS,
    timeoutMs: hub.config.longTimeoutMs + 30_000,
    output: {
      schema: { type: 'object', properties: {}, additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const action = typeof args?.action === 'string' ? args.action : ''
      const input: Record<string, unknown> = {}
      for (const field of INPUT_FIELDS) {
        if (args[field] !== undefined) input[field] = args[field]
      }
      try {
        return await hub.call(action, input, { caller: 'tool', signal: exec?.signal })
      } catch (error) {
        const code = errorCode(error) ?? 'ASC_FAILED'
        const message = errorMessage(error) ?? 'The asc operation failed.'
        const rawDetail = errorDetail(error)
        const detail = rawDetail ? redact(rawDetail).slice(0, 4_000) : ''
        const failure = new Error(`${code}: ${redact(message).slice(0, 600)}${detail ? `\n\n${detail}` : ''}`)
        failure.name = 'AscHubError'
        throw failure
      }
    },
  }
  const dispose = tools.register(definition)
  ctx.effect(() => dispose, 'asc-hub: tool')
}

/**
 * Ask for approval before any write action the model initiates. Read actions and
 * the UI caller never pass through here.
 */
export function registerApproval(ctx: HostContext, hub: Hub): void {
  if (!hub.config.requireApproval) return
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec?.name !== 'asc_hub') return next()
    const action = exec.arguments !== null && typeof exec.arguments === 'object' ? exec.arguments.action : undefined
    if (typeof action !== 'string') return next()
    const spec = hub.ACTIONS[action]
    if (!spec || spec.kind === 'read' || spec.clientOnly === true) return next()
    if (spec.kind === 'write' && hub.config.mode !== 'write') {
      return {
        kind: 'deny',
        reason: 'asc-hub runs in read-only mode; mutating App Store Connect actions are disabled.',
        info: { name: 'AscHubReadOnly', code: 'READ_ONLY_MODE' },
      }
    }
    return {
      kind: 'ask',
      reason: `asc-hub wants to run a mutating action: ${action}`,
      displayReason: {
        en: `Allow asc-hub to run "${action}" against App Store Connect?`,
        zh: `允许 asc-hub 对 App Store Connect 执行「${action}」吗？`,
      },
    }
  })
}

export { HubError }
