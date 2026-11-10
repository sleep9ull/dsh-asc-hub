# AGENTS.md

`dsh-asc-hub` is a DeepSeek Harness plugin: an App Store Connect console for the post-coding half of
shipping an iOS app. It **inherits** the open-source `asc` CLI as an external engine — installs it,
runs it, reads its output — and owns the console, the state machine and the safety rails. The Host
implements every operation once; the Web Client and the `asc_hub` tool are adapters over it.

## Read first

- **[docs/CONTRACT.md](docs/CONTRACT.md)** — the wire contract: transport, actions, gating, Hub
  state, error codes, redaction, configuration. It is authoritative. A behavior change starts as a
  contract edit; if code and contract disagree, report the mismatch instead of documenting the code.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the pipeline, the module map and what is
  deliberately deferred.
- **Maximum two doors to the plugin:** the Fetch RPC route (panel) and the `asc_hub` tool (model).
  There is no third transport, no session command, no custom auth.

## Layout

| path | what it is |
|---|---|
| `index.js` | Host entry: `apply(ctx, config)`, normalize config, create the hub, register the Fetch route + tool inside `ctx.effect`, dispose children on unload. `inject = ['connection']`. |
| `host/config.js` | Defaults and tolerant normalization; the row's `config` is normalized here, not by a Cordis `Config` export. |
| `host/exec.js` | The only child-process spawn. Harness `ctx.subprocess` when mounted, `node:child_process` otherwise. argv arrays, deadline, scrubbed env, bounded output, cancellation. |
| `host/asc.js` | The `asc` seam: global flags, argv assembly, JSON decoding, exit-code classification. The compatibility boundary. |
| `host/engine.js` | Detect (configured path → PATH → known locations), parse `asc version`, install via brew or the official script. |
| `host/auth.js` | `auth status/login/importKey/logout/switch/doctor`; the only place a PEM passes through, and only to a `0600` temp file deleted in `finally`. |
| `host/ops.js` | App Store operations: apps, builds, TestFlight, release, sales, analytics. |
| `host/dispatch.js` | The `ACTIONS` table (class + `clientOnly`), gating, operation/lastError observation, Hub state derivation, error envelope. |
| `host/rpc.js` | Client adapter: one POST route per action under `/api/asc-hub/`, wire validation, responses. |
| `host/tool.js` | Model adapter: flat tool parameters, action forwarding, Host approval for tool-called `local-write`/`write` actions; credential actions stay model-unreachable. |
| `host/skill.js` | The plugin's own model skill: `skills/asc-hub/SKILL.md` parsed and registered via `ctx.skills.register` (a package directory is not a skill root, so discovery alone never finds it). Optional. |
| `host/skills.js` | The inherited `asc` skill pack: detection from `~/.agents` and the `asc install-skills` call. Neither vendored nor rewritten. |
| `host/workspace.js` | Where the session works: the Harness's effective directory (`ctx.sessions` → `ctx.workingDirectory`) plus best-effort git facts (repo, branch, linked worktree). |
| `host/build.js` | Building that directory: find the Xcode workspace/project, list schemes, and run `asc xcode archive` → `export` → `builds upload --wait`. Version and build number travel as build settings, never as a project edit. |
| `host/redact.js` | Redaction rules, output clamping, identifier tails. |
| `client.js` | Hand-written plain-JS browser module: header trigger, right-sidebar console, onboarding. No build. |
| `locale/*.json` | Plugin display metadata (`meta.title`, `meta.description`) for the Plugin Manager; the panel's `en`/`zh` dictionaries live inline in `client.js`. |
| `cordis.patch.yml` | Bundle patch inserting the `asc-hub` row (`name: dsh-asc-hub`). |
| `docs/` | CONTRACT (authoritative), ARCHITECTURE, OPERATIONS, ONBOARDING, UPSTREAM-ASC, RELEASING, WORKFLOW, research. |
| `skills/asc-hub/SKILL.md` | The compact model-facing skill for the `asc_hub` tool, registered at runtime by `host/skill.js` (it is not discovered from disk). |
| `THIRD_PARTY_NOTICES.md`, `LICENSE` | MIT for the plugin; verbatim MIT notice for `asc` (not bundled). |

If you split or rename a Host module, update this table and the module map in
`docs/ARCHITECTURE.md` in the same change.

## Invariants

These do not regress. Each has a cheap test; run the test before claiming the change is done.

1. **One operation, implemented once.** Behavior lives in the Host dispatcher (`host/dispatch.js`
   `ACTIONS` + the operation module). Adapters (`host/rpc.js`, `host/tool.js`, `client.js`) only
   translate. *Test:* the operation still works end-to-end with either adapter.
2. **The Client half has no build step and no Harness imports.** Hand-written JavaScript, no JSX,
   `require('react')` from the browser module table only, zero `@deepseek-ai/*` imports. *Test:*
   `node --check client.js` and grep for `@deepseek-ai`.
3. **The Host half stays dependency-free.** Only `node:*` builtins and relative modules. A linked
   directory install resolves the checkout's own module graph; a dependency would resolve in the
   plugin's tree, not yours, and break the link.
4. **Every visible string is localized.** Text goes through `ctx.locale` under namespace `asc-hub`,
   registered with both an `en` and a `zh` dictionary (currently inline in `client.js`); no literal
   user-facing copy in components. Plugin display metadata lives in `locale/en.json` /
   `locale/zh.json` and is edited there.
5. **Host-theme styling only, with one documented exception.** CSS uses `--dsw-alias-*` tokens from
   `cordis_inspect_query` → `Theme.listTokens`. The single literal is the product accent:
   `--asc-hub-accent: #0071e3` (App Store Connect blue), declared once on `[data-asc-hub]` and aliased
   onto `--dsw-alias-brand-primary` inside this subtree only, so the host UI is never repainted and no
   rule repeats the literal. *Test:* the client smoke fails unless there is exactly one literal, it is
   `#0071e3`, and it is aliased. Artwork keeps its own colors in `icon.svg`.
6. **Key material never persists, logs or echoes.** The plugin hands key ids/paths to `asc`; `asc`
   and the macOS Keychain own storage. Every outbound string passes `host/redact.js`; ids are
   shortened to their last four characters (`keyIdTail`).
7. **Read-only by default, with one deliberate exception.** Three classes decide the gate: `read`
   (none), `local-write` (this machine only — engine install, credential actions — **allowed in
   `read-only`** so onboarding can finish, no `confirm` field), and `write` (App Store Connect —
   `mode: write` plus `input.confirm === true`, plus a Host approval for the tool caller). Credential
   actions are `clientOnly`: the model gets `CLIENT_ONLY`. Never add an ungated mutating path —
   including through the `run` escape hatch.
8. **The wire never throws.** Every call returns `{ ok, value }` or `{ ok, error: { code, message,
   details? } }` with codes from the contract; unknown actions are `UNSUPPORTED_ACTION` and bad input
   is `INVALID_INPUT`.
9. **`asc` is external.** No vendored binary, no copied command implementation. Every `asc` command
   quoted in docs or code is verifiable with `asc <group> --help` on the installed 6.5.x; probe
   read-only, never run a mutating command to check a flag.
10. **Skills are inherited, not vendored.** `asc` ships its own reviewed skill pack
    (`asc install-skills`, pinned commit, `~/.agents/skills`); this plugin reports and can install it,
    never copies or rewrites it. Its own skill is the funnel-facing document, registered at runtime.
11. **Nothing is written to the session log or model history by the panel path.** That is why the
    transport is the Fetch route and not a session command.

## Adding an operation

Do it in this order; each step has a completion check.

1. **Contract.** Add the row to the right table in `docs/CONTRACT.md`: `action`, `kind` (`read`,
   `local-write` or `write`; add `clientOnly` if it touches credentials), `input`, `data`. Add any
   new error code to §Errors. *Done when:* the panel and tool meanings are identical and the input
   shape has no undefined field.
2. **Dispatcher.** Implement the command in `host/ops.js` (or `host/engine.js` / `host/auth.js`),
   validate input, and add `{ kind, run }` to `ACTIONS` in `host/dispatch.js`; add `clientOnly` only
   for a credential action the model must never run, and use the action's natural `operationKind`.
   *Done when:* no adapter file changed to make it work.
3. **Tool.** For anything the model may call, add the input fields to `INPUT_FIELDS` and the action
   to the `asc_hub` description in `host/tool.js`. Panel-only actions stay out of the tool's reach.
   *Done when:* `Tool.listTools` shows the action and its fields, and a tool-called `write` or
   `local-write` reaches the approval prompt.
4. **Client.** Add the card/button in `client.js`, gate writes on the same `confirm` step, and route
   all text through the locale dictionaries. *Done when:* `node --check client.js` passes and the
   live slot renders the new card with both locales.

Run the checks: `node --check` on every touched `.js` file, then `npm test`
(`node --test test/`). Then verify in the running Harness (next section).

## Install and verify

Use the `plugin_manager` tool; do not reproduce installation with shell commands.

1. `plugin_manager` → `install_bundle` with the **absolute package directory**
   (`/Users/jinchunxu/dev/dsh-asc-hub`). Installation needs `danger-full-access` approval; if the
   session rejects it, ask the user instead of working around it.
2. Read the result: `application` says whether it activated; `warnings` and any
   `failed`/`overridden`/`restart-required` state must be reported, not hidden. A linked install
   activates through HMR; replacing an installed package needs a Harness restart for the Host module
   generation.
3. Verify live surfaces with `cordis_inspect_query`:
   - host `Tool.listTools` → `asc_hub` present with the action/parameter schema;
   - host `Config.listConfigs` → the `asc-hub` entry in the live entry list (page through it);
   - client `Slots.listSubTree` → the status button among the
     `conversation.session.header.utilities` occupants and the `dsh-asc-hub` tab among the
     `sidebar.right.pane.tab` occupants. If a client query times out, the page is not connected:
     refresh the GUI and retry before concluding anything.
4. Verify the route: an unauthenticated
   `POST http://127.0.0.1:54885/api/asc-hub/status` must answer `401` (route registered, `/api`
   fence active), not `404`.
5. Only claim success after the panel shows the real state. A renderer crash surfaces in the console
   as `slot entry crashed in '<slot>'` — read it.

## Pitfalls

- **Linked installs serve `client.js` from the checkout.** After editing it, refresh the page. HMR
  only reloads client bundles while the deployment's dev watcher (`pnpm run dev:web`) is running;
  otherwise a refresh is required. An unchanged slot id does not prove the new code loaded.
- **`asc` flags are position-sensitive.** Root flags (`--profile`, `--report`, `--read-only`, …) go
  before the subcommand; `--profile` is the only one that may trail. `--output` is per-command, not
  global; `asc builds --output json` is a usage error.
- **`asc analytics sales --output` is a file path**, and metadata format is `--output-format`. The
  summary path uses `asc insights daily|weekly` instead.
- **`asc auth status` defaults to JSON, `asc auth doctor` defaults to text.** Always pass
  `--output json` explicitly.
- **Exit 7 is not a failure.** It means a wait is still pending (`builds wait --report-pending`,
  `status --until`); the console maps it to `PROCESSING_PENDING`.
- `asc auth doctor` exits `0` even with warnings — read `summary` / per-check `status`.
- **Destructive `asc` commands need their own `--confirm`.** The Host supplies it only after the
  console's gates passed; never pass it on the model's behalf.
- **Never pass `--include-sensitive`.** `asc` redacts presigned URLs and header values by default.
- **Version has no JSON output.** `asc version` prints `6.5.3 (commit: …, date: …)`; parse the
  numeric part only, accept an optional leading `v`.
- **`--limit 0` means "the command's default"**, not "no rows".
- **Do not export a Cordis `Config`** for this row and do not persist config yourself: the row's
  `config` is normalized by `host/config.js`; the patch layer survives plugin upgrades.
- **Sign-in is panel-only.** Never route `auth.login`, `auth.importKey`, `auth.logout` or
  `auth.switch` through the model; `clientOnly` turns an attempt into `CLIENT_ONLY`, and the panel is
  the only credential handoff by design.
- **Publish mode is for App Store Connect writes only.** `engine.install` and the credential actions
  are `local-write` and deliberately work in `read-only`; do not add a `mode` check to them.

## Releasing

`package.json` `version` is the single source; DSH reads npm for updates and never reads GitHub
Releases, so **`npm publish` is the release** and a git/tarball/link install is not updatable in
place. Keep the CHANGELOG heading, `git tag v<version>` and the published version identical, and
re-verify `engines.dsh` on every DSH minor — it gates mounting, and `semver.satisfies` here runs with
`includePrerelease`. Full checklist and the per-install-kind upgrade matrix: [docs/RELEASING.md](docs/RELEASING.md).
The day-to-day loop (when to commit, when to bump, release day, the 72 hours after, incidents) is
[docs/WORKFLOW.md](docs/WORKFLOW.md).

## Where the contract lives

`docs/CONTRACT.md`. Section numbers are stable; link them from code comments when behavior depends
on them. When a change alters the wire, edit the contract in the same commit as the code that
implements it.
