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
| `src/index.ts` | Host entry: `apply(ctx, config)`, normalize config, create the hub, register the Fetch route + tool inside `ctx.effect`, dispose children on unload. `inject = ['connection']`. |
| `src/host/config.ts` | Defaults and tolerant normalization; the row's `config` is normalized here, not by a Cordis `Config` export. |
| `src/host/exec.ts` | The only child-process spawn. Harness `ctx.subprocess` when mounted, `node:child_process` otherwise. argv arrays, deadline, scrubbed env, bounded output, cancellation. |
| `src/host/asc.ts` | The `asc` seam: global flags, argv assembly, JSON decoding, exit-code classification. The compatibility boundary. |
| `src/host/engine.ts` | Detect (configured path → PATH → known locations), parse `asc version`, install via brew or the official script. |
| `src/host/auth.ts` | `auth status/login/importKey/logout/switch/doctor`; the only place a PEM passes through, and only to a `0600` temp file deleted in `finally`. |
| `src/host/ops.ts` | App Store operations: apps, builds, TestFlight, release, versions, sales, analytics. |
| `src/host/dispatch.ts` | The `ACTIONS` table (class + `clientOnly`), gating, operation/lastError observation, Hub state derivation, error envelope. |
| `src/host/rpc.ts` | Client adapter: one POST route per action under `/api/asc-hub/`, wire validation, responses. |
| `src/host/tool.ts` | Model adapter: flat tool parameters, action forwarding, Host approval for tool-called `local-write`/`write` actions; credential actions stay model-unreachable. |
| `src/host/skill.ts` | The plugin's own model skill: `skills/asc-hub/SKILL.md` parsed and registered via `ctx.skills.register` (a package directory is not a skill root, so discovery alone never finds it). Optional. |
| `src/host/skills.ts` | The inherited `asc` skill pack: detection from `~/.agents` and the `asc install-skills` call. Neither vendored nor rewritten. |
| `src/host/workspace.ts` | Where the session works: the Harness's effective directory (`ctx.sessions` → `ctx.workingDirectory`) plus git facts (repo, branch, linked worktree, drift, dirty count) and build readiness. |
| `src/host/build.ts` | Building that directory: find the Xcode workspace/project, list schemes, and run `asc xcode archive` → `export` → `builds upload --wait`. Version and build number travel as build settings, never as a project edit. |
| `src/host/redact.ts` | Redaction rules, output clamping, identifier tails. |
| `src/client.ts` | The Web Client half: one TypeScript script, compiled by `tsconfig.client.json` into `dist/client.js`. No JSX, no `@deepseek-ai` imports; React arrives through the loader's `require`. |
| `dist/` | Build output (`npm run build`): `dist/index.js`, `dist/host/*.js` + `.d.ts`, `dist/client.js`. Git-ignored; shipped in the npm tarball. |
| `tsconfig.json` / `tsconfig.client.json` / `tsconfig.test.json` | Host (ESM, strict, declarations), client (script, DOM libs, `module: none`), tests (compiled into `dist-test/`). |
| `locale/*.json` | Plugin display metadata (`meta.title`, `meta.description`) for the Plugin Manager; the panel's `en`/`zh` dictionaries live inline in `src/client.ts`. |
| `cordis.patch.yml` | Bundle patch inserting the `asc-hub` row (`name: @sleep9ull/dsh-asc-hub`). |
| `docs/` | CONTRACT (authoritative), ARCHITECTURE, OPERATIONS, ONBOARDING, UPSTREAM-ASC, RELEASING, WORKFLOW, research. |
| `skills/asc-hub/SKILL.md` | The compact model-facing skill for the `asc_hub` tool, registered at runtime by `src/host/skill.ts` (it is not discovered from disk). |
| `test/*.test.ts` | Host tests, compiled into `dist-test/` and run against `dist/`. `client/__smoke__.mts` is the client harness: it loads `dist/client.js` the way the loader does and audits the module. |
| `THIRD_PARTY_NOTICES.md`, `LICENSE` | MIT for the plugin; verbatim MIT notice for `asc` (not bundled). |

If you split or rename a Host module, update this table and the module map in
`docs/ARCHITECTURE.md` in the same change.

## Invariants

These do not regress. Each has a cheap test; run the test before claiming the change is done.

1. **One operation, implemented once.** Behavior lives in the Host dispatcher (`src/host/dispatch.ts`
   `ACTIONS` + the operation module). Adapters (`src/host/rpc.ts`, `src/host/tool.ts`, `src/client.ts`) only
   translate. *Test:* the operation still works end-to-end with either adapter.
2. **The Client half is one compiled script with no Harness imports.** `src/client.ts` is a script
   (`module: none`) compiled to `dist/client.js`; no JSX, no `import`/`export` statements,
   `require('react')` from the browser module table only, zero `@deepseek-ai/*` imports. *Test:*
   `npx tsc -p tsconfig.client.json --noEmit`, plus the smoke harness's static audit of
   `dist/client.js`.
3. **The Host half stays dependency-free at runtime.** `src/` uses only `node:*` builtins and
   relative modules, and `dist/` carries no dependencies: TypeScript and `@types/node` are
   devDependencies that never reach the tarball's runtime. A linked directory install resolves the
   checkout's own module graph; a runtime dependency would resolve in the plugin's tree, not yours,
   and break the link.
4. **Every visible string is localized.** Text goes through `ctx.locale` under namespace `asc-hub`,
   registered with both an `en` and a `zh` dictionary (currently inline in `src/client.ts`); no literal
   user-facing copy in components. Plugin display metadata lives in `locale/en.json` /
   `locale/zh.json` and is edited there.
5. **Host-theme styling only, with one documented exception.** CSS uses `--dsw-alias-*` tokens from
   `cordis_inspect_query` → `Theme.listTokens`. The single literal is the product accent:
   `--asc-hub-accent: #0071e3` (App Store Connect blue), declared once on `[data-asc-hub]` and aliased
   onto `--dsw-alias-brand-primary` inside this subtree only, so the host UI is never repainted and no
   rule repeats the literal. *Test:* the client smoke fails unless there is exactly one literal, it is
   `#0071e3`, and it is aliased. Artwork keeps its own colors in `icon.svg` — a black tile and a
   yellow `A` with a flat top, rounded shoulders and rounded feet — and is original artwork, not
   Apple's icon asset: do not trace, embed or download the real one.
6. **Key material never persists, logs or echoes.** The plugin hands key ids/paths to `asc`; `asc`
   and the macOS Keychain own storage. Every outbound string passes `src/host/redact.ts`; ids are
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
2. **Dispatcher.** Implement the command in `src/host/ops.ts` (or `src/host/engine.ts` / `src/host/auth.ts`),
   validate input, and add `{ kind, run }` to `ACTIONS` in `src/host/dispatch.ts`; add `clientOnly` only
   for a credential action the model must never run, and use the action's natural `operationKind`.
   *Done when:* no adapter file changed to make it work.
3. **Tool.** For anything the model may call, add the input fields to `INPUT_FIELDS` and the action
   to the `asc_hub` description in `src/host/tool.ts`. Panel-only actions stay out of the tool's reach.
   *Done when:* `Tool.listTools` shows the action and its fields, and a tool-called `write` or
   `local-write` reaches the approval prompt.
4. **Client.** Add the card/button in `src/client.ts`, gate writes on the same `confirm` step, and route
   all text through the locale dictionaries. *Done when:* `npx tsc -p tsconfig.client.json --noEmit` passes and the
   live slot renders the new card with both locales.

Run the checks: `npm run check` (both `tsc --noEmit` projects), then `npm test` (builds `dist/`,
compiles the tests into `dist-test/` and runs them against the built output), then `npm run smoke`
(builds and runs `client/__smoke__.mts`). Then verify in the running Harness (next section).

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

- **Linked installs serve `dist/client.js` and `dist/index.js` from the checkout.** Editing
  `src/**` changes nothing until `npm run build` regenerates `dist/`; then refresh the page (the Host
  half additionally needs the row reinstalled so the module generation reloads). HMR only reloads
  client bundles while the deployment's dev watcher (`pnpm run dev:web`) is running. An unchanged
  slot id does not prove the new code loaded.
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
- **The client bundle must survive being evaluated twice.** The module system fails the whole window
  with `client-modules: duplicate factory registration for "@sleep9ull/dsh-asc-hub" (bundle executed twice
  without invalidate?)` when the same registration arrives twice, so `src/client.ts` registers behind
  an idempotence flag (`__ascHubRegistered`) inside an IIFE — no top-level `const`, which a second
  evaluation could not redeclare. The harness's own smoke runs the bundle twice and asserts one
  registration; do not "simplify" that guard away.
- **A bundle can be installed and still not load.** `plugin_manager` → `list_bundles` reports
  `installed: true, enabled: false` when the package is in the profile's `node_modules` but not in
  `dsh.profile.bundles`; the row never mounts, no tool/route/skill appears, and a restart does not
  fix it because the state is on disk. `set_bundle` with `enabled: true` re-inserts it. Removing and
  reinstalling a bundle can leave that state behind, especially when an install was rejected half way.
- **The plugin manager rewrites the profile's `cordis.patch.yml`.** A user override such as
  `- id: asc-hub\n  config:\n    mode: write` can disappear when a bundle is installed or removed;
  the manager keeps a `cordis.patch.yml.bak-<ts>` beside it. After any install, re-read
  `status.mode` (or the patch layer) instead of assuming the configuration survived.
- **Two install paths to the same checkout break the client.** A stale
  `node_modules/dsh-asc-hub` next to the scoped `node_modules/@sleep9ull/dsh-asc-hub` means the client
  bundle is evaluated twice, and `client.js` registers a fixed module id, so boot dies with
  `client-modules: duplicate factory registration for "@sleep9ull/dsh-asc-hub"` and the window reports
  `1 entry did not activate … import failed`. The Host half still answers, which makes it look like a
  client-only bug. Renaming a package leaves the old symlink behind: remove it (`rm` the stale link, or
  let `pnpm install` prune it) and never keep two links to one checkout in one profile.
- **A scoped package name must be quoted in `cordis.patch.yml`.** `@` starts a YAML reserved
  indicator, so `name: @scope/pkg` is a parse error (`bad indentation of a mapping entry`) and the
  install is rejected; write `name: "@scope/pkg"`.
- **npm renders the tarball's `README.md`, and it does not resolve relative paths.** A relative
  `icon.svg`, `README.zh.md` or `docs/CONTRACT.md` looks right on GitHub and is a 404 on npmjs.com, so
  every link and image in the four READMEs and in `CHANGELOG.md` is a full `github.com/sleep9ull/…/blob/main/`
  or `raw.githubusercontent.com/…` URL. npm auto-includes every root `README*`, so the translations do
  travel in the tarball, but the package page still renders `README.md` alone — which is why English is
  `README.md` and the other three are `README.<lang>.md`, reached from the language line under the title.
- **A scoped package publishes as restricted unless `publishConfig.access` is `public`.** Without the
  field npm tries to create a paid private package and the first `npm publish` fails, so `package.json`
  carries `"publishConfig": { "access": "public" }`.
- **Do not export a Cordis `Config`** for this row and do not persist config yourself. A `Config` is
  a schema object built by a runtime schema library, and the Host half ships dependency-free
  (invariant 3), so the row's `config` is normalized by `src/host/config.ts`; the patch layer survives
  plugin upgrades. The trade-off is visible: the Plugin Manager shows this row's config as raw YAML,
  and the footer's mode switch (`mode.set`) is session-scoped on purpose — persisting it would mean
  editing a config a profile override may already own.
- **Sign-in is panel-only.** Never route `auth.login`, `auth.importKey`, `auth.logout` or
  `auth.switch` through the model; `clientOnly` turns an attempt into `CLIENT_ONLY`, and the panel is
  the only credential handoff by design.
- **Publish mode is for App Store Connect writes only.** `engine.install` and the credential actions
  are `local-write` and deliberately work in `read-only`; do not add a `mode` check to them.

## Releasing

`package.json` `version` is the single source; DSH reads npm for updates and never reads GitHub
Releases, so **`npm publish` is the release** and a git/tarball/link install is not updatable in
place. **Every release is tagged `v<version>` (annotated) on the commit `npm publish` shipped, and no
GitHub Release is created.** The tag and the packument's `gitHead` must name the same commit — check
`git rev-parse v<version>^{commit}` against `npm view … gitHead` — because a tag that drifts from the
published tree is worse than none; a Release would only keep a second copy of notes the CHANGELOG
owns. Keep the CHANGELOG heading and the published version identical, and re-verify `engines.dsh` on
every DSH minor — it gates mounting, and `semver.satisfies` here runs with `includePrerelease`. Full checklist and the per-install-kind upgrade matrix: [docs/RELEASING.md](docs/RELEASING.md).
The day-to-day loop (when to commit, when to bump, release day, the 72 hours after, incidents) is
[docs/WORKFLOW.md](docs/WORKFLOW.md).

## Where the contract lives

`docs/CONTRACT.md`. Section numbers are stable; link them from code comments when behavior depends
on them. When a change alters the wire, edit the contract in the same commit as the code that
implements it.
