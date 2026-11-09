# Architecture

`dsh-asc-hub` has two halves separated by a process boundary. The Host half runs in the Harness
Node process and is the only code that touches `asc`, the filesystem or credentials. The Web Client
half runs in the browser page and renders the trigger and the panel. They meet at one wire defined by
[docs/CONTRACT.md](CONTRACT.md), and the agent tool is a second adapter over the same Host
dispatcher.

```
┌───────────────────────────── browser page ─────────────────────────────┐
│ client.js  trigger · right-sidebar panel · onboarding · app picker      │
└───────────────▲─────────────────────────────────────────────────────────┘
                │ POST /api/asc-hub/<action>   { action, input }
                │ { ok: true, value } | { ok: false, error }
┌───────────────┴──────────────────── Harness Host process ──────────────┐
│ index.js                                                                │
│   ├─ host/rpc.js      Fetch route adapter (wire validation, responses)  │
│   ├─ host/tool.js     asc_hub adapter (schema + Host approval)          │
│   └─ host/dispatch.js ACTIONS table · gating · operation · error envelope│
│         ├─ host/engine.js   detect / version / install                 │
│         ├─ host/auth.js     login / importKey / status / doctor        │
│         ├─ host/ops.js      apps · builds · TestFlight · release · sales│
│         ├─ host/asc.js      argv · JSON decode · exit classification   │
│         ├─ host/exec.js     the only child-process spawn               │
│         └─ host/redact.js   redaction · clamp · identifier tails       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ argv array (no shell)
                          ┌─────▼──────┐
                          │  asc 6.5.x │  external engine, MIT, not bundled
                          └────────────┘
```

## Two halves, one dispatcher

| half | lives in | owns | never does |
|---|---|---|---|
| Host | `index.js`, `host/**` | input validation, gating, running `asc`, error classification, redaction, Hub state | render UI, talk to Apple directly |
| Client | `client.js` | theme, layout, confirmation dialogs, app/vendor selection, the panel-only credential handoff | spawn processes, hold credentials, import Harness Client packages |
| Tool | `host/tool.js` | the `asc_hub` schema and approval request | re-implement any operation |

The rule that keeps the halves honest: **every operation is implemented once, in the Host
dispatcher, and each caller is an adapter** — the panel for everything, the tool for everything
except the panel-only credential actions. Adding a behaviour to the panel must not add behaviour to
the Host; adding a permission check to the Host automatically covers the tool.

## Why the transport is an exact Fetch RPC route

The Client reaches the Host over a POST route under the Harness `/api` bridge:

```js
// client
ctx.connection.rpc.call('/api', 'asc-hub/<action>', { action, input })

// host, inside ctx.effect
ctx.connection.fetch.register({
  path: '/api/asc-hub/<action>',
  methods: ['POST'],
  requestBody: 'buffered',
  fetch: handler,
})
```

The alternatives were considered and rejected for concrete reasons:

| alternative | why not |
|---|---|
| session command (`/asc-hub <json>`) | appends `command/run` + `command/done` to the session log and renders a visible transcript row, so panel polling would pollute the conversation and model history; the command row needs its own suppression registration |
| custom HTTP route with its own auth | invents an authentication scheme and a trust boundary this plugin cannot audit |
| typed Remote (typert codegen) | requires generated schemas and a build step for the Client half, which this plugin deliberately does not have |

What the Fetch route buys:

- **Nothing in the session log and nothing in the model's context** when the panel refreshes, so the
  UI can poll `status` freely.
- **The browser-trust fence comes for free.** The route lives under `/api`, so unauthenticated
  requests are rejected with 401 and a non-owner Peer with 403 before plugin code runs.
- **Carrier neutrality.** The same route works in the Web GUI and in the Desktop app, because it is
  the bridge both carriers already expose.
- **No build step.** The Client half is hand-written JavaScript that sends JSON and renders JSON;
  the contract is the only schema, and it is written by hand too.

The trade-off is that validation is ours: the handler checks the wire envelope (`type`, `rpcId`,
matching `method`) and returns `INVALID_INPUT` for action inputs that fail validation, instead of
getting generated client types. [docs/CONTRACT.md](CONTRACT.md) is the enforcement point for that.

## The wire

Request payload: `{ "action": "builds.list", "input": { "appId": "…" } }`. The action in the URL, in
the body and in the handler must agree; a mismatch is a 400. The Host answers
`{ type: 'server-response', rpcId, result }` where `result` is
`{ ok: true, value }` or `{ ok: false, error: { code, message, details? } }`. Transport failure
(network, carrier, malformed response) throws on the client and is reported as `RPC_FAILED`; it is
the only failure that is not a product-level error.

## One operation, two callers

```
client.js ──Fetch RPC──┐
                       ├──▶ dispatch.call(action, input, { caller })
host/tool.js ─tool─────┘         │
                                 ├─ ACTIONS[action].kind   ('read' | 'write')
                                 ├─ gates (mode → confirm → approval)
                                 ├─ ACTIONS[action].run(input)  → host/asc.js → asc
                                 └─ redact → envelope → caller
```

The dispatcher holds one `ACTIONS` table:

```js
const ACTIONS = {
  status:            { kind: 'read',        run: () => status() },
  'engine.install':  { kind: 'local-write', run: (i, o) => engine.install(i.method, o) },
  'auth.login':      { kind: 'local-write', clientOnly: true, run: (i, o) => auth.login(i, o) },
  'builds.upload':   { kind: 'write',       run: (i, o) => ops.uploadBuild(i, o) },
  'release.submit':  { kind: 'write',       run: (i, o) => ops.submitRelease(i, o) },
  // …
}
```

Both adapters read the same table, which is why the tool's action list, the route's action
validation and the panel's buttons cannot drift apart. The `clientOnly` entries are the exception
that proves the rule: the tool sees them and refuses them, rather than implementing a second path. An unknown action is `UNSUPPORTED_ACTION` from
either caller. `host/tool.js` adds exactly one thing: the Host approval request for tool-called
`write` and `local-write` actions, whose denial is `APPROVAL_DENIED`; the `clientOnly` flag on the
credential actions keeps them out of the model's reach (`CLIENT_ONLY`). Everything before and after
that call is shared.

## Operation pipeline

Every call runs the same six stages, in this order:

1. **Validate.** Unknown action → `UNSUPPORTED_ACTION`. `input` must be an object (omitted becomes
   `{}`) → `INVALID_INPUT`. The operation validates its own fields and rejects values that cannot be
   used as given.
2. **Gate.** Gating happens before any child process starts, and the action's class decides which
   gates apply:
   - `read` — no gate.
   - `local-write` — changes this machine only (installs the engine, stores a key in the Keychain).
     It is deliberately allowed in `mode: read-only`, because otherwise onboarding could never
     finish in the default mode. A `local-write` action marked `clientOnly` (the four `auth`
     credential actions) refuses the tool with `CLIENT_ONLY`; a tool-called `local-write`
     (`engine.install`) asks for the Host approval.
   - `write` — changes App Store Connect state. Requires `config.mode === 'write'`
     (`READ_ONLY_MODE`), then `input.confirm === true` (`CONFIRM_REQUIRED`), then — for the tool
     caller — the Host approval (`APPROVAL_DENIED`). The order matters: a read-only profile answers
     `READ_ONLY_MODE` even if the caller also forgot `confirm`.
3. **Execute.** The operation resolves the engine (`ASC_NOT_INSTALLED` when missing), assembles an
   argv array, and runs the child with a deadline, a cancellation signal, a scrubbed environment
   (`ASC_TELEMETRY_DISABLED`, optionally `ASC_BYPASS_KEYCHAIN`, and `ASC_READ_ONLY` in read-only
   mode) and bounded output. The one deliberate shell pipeline is `engine.install`'s upstream
   installer, which is published as a shell script. While it runs,
   the dispatcher records `operation` so the trigger can show `asc: build` / `asc: review` and the
   panel can render the busy state.
4. **Classify.** Exit status becomes a stable code: `3` → `ASC_AUTH_MISSING`, `7` →
   `PROCESSING_PENDING`, `2` → `INVALID_INPUT`, `1` and anything else → `ASC_FAILED`, and a killed
   deadline → `TIMEOUT`. Actions refine this where the domain is known: `ASC_AUTH_FAILED` from a
   rejected login, `KEY_FILE_UNSAFE` from a permission rejection, `APP_NOT_SELECTED` /
   `APP_NOT_FOUND`, `VENDOR_REQUIRED`, `READINESS_BLOCKED`.
5. **Redact.** Every string that leaves the operation — messages, logs, stdout, stderr — goes
   through `redact()`, then is length-capped. Key ids and issuer ids are reduced to their last four
   characters (`keyIdTail`). Nothing key-shaped crosses the wire.
6. **Envelope.** `{ ok: true, value }` on success; `{ ok: false, error: { code, message, details? } }`
   on failure, where `details.text` is the redacted child output. The dispatcher never lets an
   exception escape to the wire. It records `lastError` for the trigger, except for a call the caller
   cancelled (an aborted call is not a product failure).

## The derived state machine

The Hub state is derived on every `status` call, never stored as a phase. The Host probes the
engine and the credentials, folds in the current operation and the last error, and returns
`HubState`:

```
engine.installed === false                       -> "engine"
engine.installed && auth.configured === false    -> "login"
operation !== null                               -> "busy"
lastError !== null                               -> "error"
otherwise                                        -> "ready"
```

`phase: "start"` exists only for the first contact before any probe has finished. The trigger label
is a second, user-facing projection of the same state:

| phase | extra condition | label | trigger | meaning |
|---|---|---|---|---|
| `start` | — | `start` | `asc: start` | first contact, nothing probed |
| `engine` | — | `engine` | `asc: engine` | engine missing or installing |
| `login` | — | `login` | `asc: login` | engine present, no credentials |
| `busy` | operation kind `install` | `engine` | `asc: engine` | engine install running |
| `busy` | operation kind `auth` | `login` | `asc: login` | sign-in running |
| `busy` | operation kind `submit` | `review` | `asc: review` | submission running |
| `busy` | any other operation | `build` | `asc: build` | upload / TestFlight running |
| `error` | — | `error` | `asc: error` | last operation failed |
| `ready` | — | `ready` | `asc: ready` | both ready, idle |

`HubState` also carries `mode` and `checkedAt` so the panel can render a read-only banner and the
age of the observation without asking again. The selected app id and vendor number live in the
Client's `localStorage` (`dsh.asc-hub.v1.app`, `dsh.asc-hub.v1.vendor`); the Host stays stateless
about selection.

## Module map

| file | role |
|---|---|
| `index.js` | plugin entry: normalize the row's config, create the hub, register the Fetch route and the `asc_hub` tool inside `ctx.effect`, dispose children on unload |
| `host/config.js` | config defaults and tolerant normalization (a wrong type falls back to the safe default) |
| `host/exec.js` | the only place a child process starts: Harness subprocess service when mounted, `node:child_process` otherwise; argv arrays, deadline, env scrub, bounded output, cancellation |
| `host/asc.js` | the `asc` seam: global flags, argv assembly, JSON decoding, exit-code classification — the compatibility boundary from [docs/UPSTREAM-ASC.md](UPSTREAM-ASC.md) |
| `host/engine.js` | detect the binary in the documented order, parse `asc version`, install via Homebrew or the official script |
| `host/auth.js` | `auth status/login/importKey/logout/switch/doctor`; the one place a PEM passes through, and only to a `0600` temporary file |
| `host/ops.js` | the App Store operations: apps, builds, TestFlight, review/release, sales, analytics |
| `host/dispatch.js` | the `ACTIONS` table, gating, operation observation, `HubState` + trigger-label derivation, error envelope |
| `host/rpc.js` | Fetch adapter: one route per action, wire-envelope validation, 400 responses; 401/403 come from the `/api` fence before the handler |
| `host/tool.js` | `asc_hub` adapter: flat tool parameters, action forwarding, Host approval for writes |
| `host/redact.js` | redaction rules, output clamping, identifier tails |
| `client.js` | hand-written browser module: status button in `conversation.session.header.utilities`, console tab in `sidebar.right.pane.tab` (+ its title), inline `en`/`zh` locale dictionaries registered under namespace `asc-hub` |
| `locale/*.json` | plugin display metadata (`meta.title` / `meta.description`) read by the Plugin Manager |
| `cordis.patch.yml` | the bundle patch that inserts the `asc-hub` Host row |
| `docs/CONTRACT.md` | the wire contract — the single source of truth for actions, state, errors and config |

If a file above is renamed or a module is split, update this table and
[AGENTS.md](../AGENTS.md) in the same change; the two are read by every agent that works here.

## Deliberately deferred

- **Streaming progress.** `asc` can emit NDJSON under `status --watch`, and `builds wait
  --report-pending` hands back a `resumeCommand` on exit 7. v1 exposes one `busy` flip and a single
  timeout; a v2 progress channel would stream phases and resume tokens to the panel.
- **Typed Remote transport.** The generated-schema RPC path is the natural upgrade once the Client
  half gains a build step. It is deferred precisely because that build step is the thing the Fetch
  route avoids.
- **Multiple accounts or teams.** `asc --profile` is wired through config, but the panel models one
  active profile at a time; a profile switcher belongs to a later release.
- **Sales beyond the summary.** Month roll-ups, the raw Sales and Trends TSV export (`analytics
  sales`, whose `--output` is a file path), report-instance drill-down and finance reports stay out
  of v1.
