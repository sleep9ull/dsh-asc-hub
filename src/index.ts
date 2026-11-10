/**
 * dsh-asc-hub — App Store Connect console for DeepSeek Harness.
 *
 * The plugin is a product layer over the open-source `asc` CLI: it inherits the
 * engine instead of vendoring it. The Host half owns every operation once
 * (host/dispatch.js) and exposes it through two adapters:
 *
 *  - host/rpc.js   — an exact Fetch RPC route the Web Client panel calls;
 *  - host/tool.js  — the `asc_hub` agent tool, same actions, same gating.
 *
 * The Web Client half (`client.js`) is declared by `dsh.client` in package.json
 * and registers the header status button and the right-sidebar console.
 *
 * @module dsh-asc-hub
 */

import { normalizeConfig } from './host/config.js'
import { createHub } from './host/dispatch.js'
import { registerRpc } from './host/rpc.js'
import { registerSkill } from './host/skill.js'
import { registerApproval, registerTool } from './host/tool.js'
import type { HostContext } from './host/types.js'
import { toolRegistry } from './host/types.js'

/** Cordis plugin name; matches the Loader row id in cordis.patch.yml. */
export const name = 'asc-hub'

/**
 * The Host half needs the connection service, because that is what serves the
 * `/api` bridge the panel calls. Without it the plugin stays inactive rather
 * than throwing.
 */
export const inject = ['connection']

/**
 * @param ctx Host context
 * @param config the Loader row's raw `config`
 */
export function apply(ctx: HostContext, config: unknown): void {
  const resolved = normalizeConfig(config)
  const hub = createHub(ctx, resolved)

  ctx.effect(() => () => hub.dispose(), 'asc-hub: child processes')

  const routes = registerRpc(ctx, hub)

  // The skill ships in this package and is registered in memory: a package
  // directory is not a skill root, so discovery alone would never find it.
  const skill = registerSkill(ctx) ? 'on' : 'off'

  const tools = toolRegistry(ctx.get('tools'))
  if (tools) {
    registerTool(ctx, tools, hub)
    registerApproval(ctx, hub)
  }

  ctx.logger?.info?.(
    `asc-hub ready: ${routes} rpc route(s), skill=${skill}, mode=${resolved.mode}, engine=${resolved.ascPath}`,
  )
}
