/**
 * The Web Client adapter: one exact Fetch route per action, under the `/api`
 * bridge owned by `@deepseek-ai/dsh-client-connection`.
 *
 * Why this channel (see docs/ARCHITECTURE.md): the bridge already enforces the
 * browser-trust fence (401 unauthenticated, 403 for a non-owner Peer), it writes
 * nothing to the session log or model history, and it works in both the browser
 * and the Desktop shell without any build-time code generation.
 *
 * Wire contract, mirrored from `ctx.connection.rpc.call`:
 *   request   { type: 'client-request', rpcId, method: 'asc-hub/<action>', payload: { action, input } }
 *   response  { type: 'server-response', rpcId, result: { ok, value } | { ok, error } }
 */

import { HubError } from './dispatch.js'
import { redact } from './redact.js'

const PREFIX = '/api/asc-hub/'
const METHOD_PREFIX = 'asc-hub/'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function failure(error) {
  const code = typeof error?.code === 'string' ? error.code : 'ASC_FAILED'
  const message = typeof error?.message === 'string' ? error.message : 'The asc operation failed.'
  const detail = typeof error?.detail === 'string' ? redact(error.detail).slice(0, 8_000) : undefined
  return {
    ok: false,
    error: { code, message: redact(message).slice(0, 600), details: detail ? { text: detail } : {} },
  }
}

/**
 * @param {any} ctx Host context
 * @param {ReturnType<import('./dispatch.js').createHub>} hub
 * @returns {number} how many routes were registered
 */
export function registerRpc(ctx, hub) {
  const connection = ctx.get('connection')
  const registry = connection?.fetch
  if (!registry || typeof registry.register !== 'function') {
    ctx.logger?.warn?.('asc-hub: no connection fetch registry; the panel cannot reach the Host half')
    return 0
  }

  let count = 0
  for (const action of hub.actionNames) {
    const method = `${METHOD_PREFIX}${action}`
    const dispose = registry.register({
      path: `${PREFIX}${action}`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try {
          body = await request.json()
        } catch {
          return jsonResponse({ error: 'body is not JSON' }, 400)
        }
        if (
          body === null ||
          typeof body !== 'object' ||
          body.type !== 'client-request' ||
          typeof body.rpcId !== 'string' ||
          body.method !== method
        ) {
          return jsonResponse({ error: 'invalid asc-hub request envelope' }, 400)
        }
        const payload = body.payload !== null && typeof body.payload === 'object' ? body.payload : {}
        if (payload.action !== undefined && payload.action !== action) {
          return jsonResponse({ error: 'action does not match the route' }, 400)
        }
        let result
        try {
          const value = await hub.call(action, payload.input, { caller: 'client', signal: request.signal })
          result = { ok: true, value: value === undefined ? null : value }
        } catch (error) {
          result = failure(error instanceof HubError ? error : error)
        }
        return jsonResponse({ type: 'server-response', rpcId: body.rpcId, result })
      },
    })
    // Registering through `ctx.effect` keeps the route owned by this plugin's
    // fiber, so unloading the row removes the surface with it.
    ctx.effect(() => dispose, `asc-hub: rpc ${action}`)
    count += 1
  }
  return count
}
