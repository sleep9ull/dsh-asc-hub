# Changelog

All notable changes to `dsh-asc-hub` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **A new icon.** `icon.svg` is now a black squircle holding a single yellow `A`: a flat head, a
  narrow waist and a wide base — a trapezoid — carried by strokes with round terminals, so the
  shoulders and the feet turn on arcs and the bar across the legs sits flush. It replaces the
  blue-field / white-frame re-drawing this release briefly carried, which read as a copy of the App
  Store icon rather than as this product's own. Original artwork, not Apple's asset; the panel's
  `--asc-hub-accent` is unchanged and the READMEs keep pointing at the same absolute URL.

- **README badges became links, and three of them became data.** In all four READMEs every badge is
  now an anchor to the thing it asserts: `dsh` opens the *Requirements* section of that language's own
  file, Node opens nodejs.org, `TypeScript strict` opens `tsconfig.json` (the file that carries
  `"strict": true`), `license` opens `LICENSE`, `stars` opens `stargazers`, `npm` opens the package
  page. The `dsh`, `Node` and license badges also stopped being hand-typed: they read `engines.dsh`
  from the repository's `package.json` (`badge/dynamic/json`), `engines.node` from the registry
  (`node/v`) and the license from the registry (`npm/l`), so they can no longer drift from the
  manifest. The hand-typed `>=0.2.2-rc.1 <0.3.0`, `>=22` and `MIT` strings in the badge row are gone.

- **English is now the default README.** `README.md` is the English document — the one the repository
  opens on and the one npm renders — and the Chinese translation moved to `README.zh.md`, beside
  `README.ko.md` and `README.ja.md`. The language line under the title now reads
  `English | 简体中文 | 한국어 | 日本語`, with the current language left unlinked and the other three
  reached by absolute URL; `README.en.md` is gone, so older links to it must land on `README.md`.
  This also fixes the translated pages' DSH badge: it used to point at the repository root, whose
  anchor only ever exists in the default README, and now targets the requirements anchor inside its
  own file.

## [0.1.0] — 2026-11-10

The first public release. `dsh-asc-hub` puts the post-coding half of shipping an iOS app in a
DeepSeek Harness side panel — install and inherit the `asc` CLI, sign in through the macOS Keychain,
build the session's working directory, send a build to TestFlight, submit for App Review, release it,
and read sales — with the same operations behind the `asc_hub` tool and the same gates behind both.

### Added

- **A declared DSH requirement.** `engines.dsh: ">=0.2.2-rc.1 <0.3.0"` — the plugin previously
  installed on any Harness, including one whose `ctx.connection.fetch` or `ctx.skills.register` it
  was never tested against. The range is checked before mounting with `includePrerelease`, so the
  prerelease lower bound is what makes the current Desktop runtime acceptable; a DSH minor bump
  needs a verification pass and a widened range, and the profile's version exemptions remain the
  per-user escape hatch.

- **A release runbook.** [docs/RELEASING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/RELEASING.md) states how a DSH plugin is
  versioned — `package.json` plus `engines.dsh`, with npm as the only upgrade channel, since the
  Plugin Manager reads registry versions and never GitHub Releases — and gives the release
  checklist plus the upgrade path for each install kind (npm, CLI, `plugin_manager`, linked
  checkout, git). `prepublishOnly` now runs `check` and the test suite before a publish.

- **Distribution and discovery are documented as two doors.** `npm publish` makes the plugin
  installable (**Add plugin**, `dsh plugin add`, both read the registry directly); it does not make
  it findable, because **Discover** searches a curated format-1 index, not npm. The runbook now says
  so, measures it against the running app, and gives the T+1 / T+3 listing checks plus a
  self-hosted index named `dsh-asc-hub`.

- **A working routine, not just a rulebook.** [docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md) is the day-to-day
  loop — the two copies of the plugin and which one you are running, the daily change→check→commit
  cycle, when a batch is worth a version bump, a twenty-minute release day, the 72 hours after a
  publish, the same-day incident loop, the DSH/`asc` maintenance cadence, and a copy-paste checklist
  card. It also records that the Desktop app's profile is owned by the app shell, so package
  operations there go through the Plugins page or `plugin_manager`, not `dsh plugin`.

- **The panel says where the session works.** Under the app picker the console prints the directory
  the Harness gives this session — `~/dev/dsh-asc-hub`, with `worktree` and the branch beside it —
  from a new read action, `workspace.info`. The directory is the Harness's own answer
  (`ctx.sessions` → `ctx.workingDirectory`, falling back to the profile default), never the plugin's
  guess; the git facts are best effort, so a directory that is not a checkout, a detached HEAD or a
  missing `git` narrows the line instead of breaking it. The action is panel-only: the model already
  knows its directory from the system prompt, so it gets `CLIENT_ONLY`.

- **Review and Release are two sections, because they are two decisions.** The section that submits
  for App Review is now called `Review`: it shows the review state in its corner (`IN_REVIEW`,
  `COMPLETE`, …), the version and its state, readiness, the blockers with their remediation, the
  warnings that do not block, when the version was submitted, and one confirmed `Submit for review`
  action. Below it, a new `Release` section is the other half: the version App Review approved
  (`PENDING_DEVELOPER_RELEASE`) with the build it carries, and one confirmed `Release to App Store`
  action (`asc versions release`). Neither button appears when it has nothing to do.

- **The Review menu says what each build is.** Every entry carries its state — `released`, `in
  review`, or `not submitted` — so a TestFlight-only build of a shipped version is visible before it
  is selected. Selecting one now shows `version released` with the reason (a released version locks
  its number, so nothing can be submitted under it) instead of a wall of blockers about a version
  that is already live.

- **Engine onboarding.** Detection through the configured path, `PATH`, `/opt/homebrew/bin`,
  `/usr/local/bin` and `~/.local/bin`; version read from `asc version`; installation through
  Homebrew, with the official installer script as the other channel and as the fallback when a
  Homebrew pour fails (its prefix can be unwritable, a tap untrusted, a keg half-poured).

- **Panel-only sign-in.** App Store Connect API key (`.p8`) handed to `asc auth login`, which stores
  it in the macOS Keychain. Typed path or drag-and-drop import; the PEM only ever reaches a `0600`
  temporary file that is deleted in a `finally` block. The model cannot run sign-in (`CLIENT_ONLY`).

- **Status trigger** in the session header — `asc: start | ready | build | review | error`, where
  everything before onboarding finishes reads `asc: start` — that opens the console in the right
  sidebar.

- **Single-page onboarding.** The whole flow on one page, top to bottom as 1-2-3, with no card
  frames: a 2px progress spine in the left gutter carries a node per step, and a single hairline
  divider separates the steps without crossing the spine. A filled 26px accent disc marks the current
  gate, a filled disc with a tick marks a finished one, a hollow disc marks a step still ahead, and
  the same accent fills the one button that is the next action. A title with a 12px subtitle directly
  beneath it per step, the installer's output in a bounded scroller under `Install`, primary actions
  sharing one fixed font-relative width, and a hidden "Step n of 3" so the decorative numerals are
  announced.

### Changed

- **The package is scoped: `@sleep9ull/dsh-asc-hub`.** `package.json` `name` and the bundle patch's
  row `name` both carry the scope, because the row loads the package by that spec; the skill it
  registers reports the same source, and the `MANUAL_UPDATE_REQUIRED` copy names it. The repository,
  the product name, the slot key and the `asc-hub` row id are unchanged, so an existing panel keeps
  its tab and its saved state.

- **The codebase is TypeScript.** `index.js`, `host/*.js` and `client.js` became `src/index.ts`,
  `src/host/*.ts` (with a shared `src/host/types.ts` for the Harness surface it does not publish) and
  `src/client.ts`. Two `tsc` projects build `dist/`: the Host as ESM with declarations, the client as
  a single script (`module: none`) so it stays the one file the module loader evaluates. `strict` is
  on everywhere; the only casts left are at the dynamic-JSON and loader boundaries. `npm run verify`
  (both projects, the 61 host tests against `dist/`, the 247-check client harness) is the gate, and
  `package.json` `main`/`exports`/`files` now point at `dist/`, which `prepare` builds on install.

- **One refresh, for the whole panel.** Every section used to carry its own `Refresh` button; the
  console now has the one in the header, and every query watches the store's reload counter, so one
  click re-reads status, workspace, builds, the release version and TestFlight groups together.

- **The working directory says whether it can build, in the corner.** `ready to build` / `cannot
  build` sits in the section head, and when it cannot the section says which of the four reasons
  applies: not an iOS project, an Xcode project that is not iOS, no full Xcode on this machine, or a
  project that does not load because it has build errors. For an iOS codebase there is an
  **Auto-fix** button: it copies a repair prompt (build a Release archive, fix dependencies, signing,
  build settings, compiler errors and version numbers, without changing behavior or committing) to
  paste into the chat — the panel cannot send a message on the user's behalf.

- **The build list is a reference; each step picks from its own menu.** The list starts at the three
  newest processed builds with a `Load more` row that adds three at a time (`Show less` appears on the
  same row once it has grown), then a divider, then the release build in its own row. Its tags split by row kind: the five newest say where each build already is (`Internal` /
  `External`), and the pinned row says only `Release`. Choosing happens where the choice is used:
  TestFlight has a `Build to send` menu, and Review has a `Build to submit` menu, so sending a build
  to testers and submitting one for review no longer share a single selection.

- **Review knows which builds it has already seen, from App Store Connect itself.** App Review
  applies to a version, not a build, so the panel asks the Host for `release.versions` (every version
  with the build it carries) and a build counts as reviewed only when its version reached
  `READY_FOR_DISTRIBUTION` or later. Picking such a build shows `Reviewed · as part of 1.2.5
  (READY_FOR_DISTRIBUTION)` and offers no button; picking a build no version carries — including
  TestFlight-only builds — or one whose version is still in preparation lights up `Submit for
  review`, which submits exactly that build and its version. Rows carry only the two tags that matter — `TestFlight` (it has been in a beta
  group) and `Release` (it is the release build) — because everything listed here is processed.

- **TestFlight reads as one send.** The build menu and the groups share one form grid — `Build to
  send [ … ]` and `Groups ☐ Internal ☐ External` are two rows whose controls start at the same left
  edge — and `What to test` follows.

- **Building and distributing are two steps, in that order.** A new `Build` section builds **the code
  the session is working on** — never a file the user picks: `asc xcode archive` → `asc xcode export`
  → `asc builds upload --wait`, with the marketing version and the build number passed as
  `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` build settings so the checkout is never rewritten,
  and artifacts in a temporary directory. The two numbers are separate fields because they are
  separate decisions (that is what `1.2.5 (2)` is), and both are suggested from history without being
  imposed. The Working directory section answers the other half of the question — `ready to build`
  with the workspace it found, or `cannot build` with the reason (no Xcode, no project) — and a
  session without an Xcode project fails that action with `BUILD_UNAVAILABLE` instead of pretending.

- **TestFlight only sends builds that are ready.** The card asks which ready build goes out (a picker
  over the recent processed builds, newest selected), which groups receive it, and what testers
  should look at, then sends on one button. The old behaviour always distributed "the latest valid
  build", which was right once and wrong the moment a second build needed a different audience. A
  successful send says what went where (`Sent 1.2.5 (3) to Core, Public`) and re-reads the Builds
  card, where the row gains its audience tag plus a `just sent` mark for this session.

- **The working directory reads like `git status`.** Under the path the section now says which branch
  it is, how far it has drifted from its upstream (`↑2 ↓1`, with the sentence in the tooltip — no
  fetch, so it is drift against the last known `origin/main`), and whether anything is uncommitted:
  `main ↑2 · 3 uncommitted · 1 untracked`, or simply `clean`. Counts come from one
  `git status --porcelain=v1 --branch`; ignored paths are never counted, and a git that cannot read
  the tree just drops the line. The section gained the same `Refresh` control as its neighbours,
  because a working tree changes while the panel is open.

- **A build row finally reads `1.2.5 (1)`, and says where it went.** A build's own `version` attribute
  is CFBundleVersion — the build number — so the panel could only ever print `1`; `builds.list` now
  asks asc for `preReleaseVersion` (the marketing version), `buildBetaDetail` and `betaGroups`, and the
  answer carries `internal` / `external` (the TestFlight audiences the build reached) beside the raw
  states. The row is three columns: the build id with its audience tags, the processing state as a
  short step immediately right of it, and the date at the end.

- **Sections breathe.** The console stacks its cards on one rhythm — 14px between sections, 8px
  inside each — instead of letting bordered cards sit flush against each other. The session
  directory is a section of its own now, with the same card chrome and title as the rest (it was a
  hairline line inside the App card), and the skills row lost its extra margin for the same reason.

- **The app card is one line.** The separate `App and bundle id` label is gone: the card title is the
  picker's own label — `App & Bundle`, because the options read `name · bundleId` — so they share a row
  instead of a title stacked above a second label.

- **TestFlight no longer repeats the audience.** The internal/external tags left the group list and
  moved to the build row, where the distribution actually happened.

- **The plugin row is named after the product**: `App Store release console` →
  **`App Store Connect hub`** (`App Store Connect 控制台` in Chinese), in `locale/*.json`. The
  sidebar tab keeps the short form `ASC Hub` / `ASC 控制台`, which has to fit a tab.

- **Onboarding is a three-line placeholder away from perfect.** The slot under `Install` is exactly one
  text line tall and is held open in every state, so clicking it never moves the steps below: it
  shows `Installing…` while the engine arrives, `(asc 6.5.3 ready)` once it has, and the last line of
  installer output if it fails. The busy banner is gone from the panel header; only the step reports
  its own work (the announcement stays for screen readers).

- **Skills are inherited, not vendored.** The plugin's own skill is now actually registered (it was
  shipped in a path no skill root scans, so the model never saw it), and the console gained a
  `Skills pack` row that reports what `asc install-skills` put on the machine and can run that same
  installer in one click. The row opens by default — it is a fact about the machine, and its action
  should not be hidden behind a disclosure — and stays collapsible for panels short on height. The
  action is a word at the end of the summary line, in the line's own type size: `install` when the pack
  is absent, `update` only when the installed engine ships a newer pin (read from
  `asc install-skills --help`, offline), and nothing at all when the pack is current. The body says
  what the pack is *for* as seven concrete asks — "resize these screenshots to the sizes App Store
  Connect accepts", "summarize this week's TestFlight crashes" — one per upstream skill area, instead
  of a paragraph about inheritance. The 25 upstream `asc-*` skills are neither copied nor rewritten; `status`
  reports them so the model knows to use them for the long tail.

- **A footer that reports the product.** `version 0.1.0 © sleep9ull · engine asc 6.5.3` sits at the
  foot of the panel, both names linking to their GitHub projects; the engine version turns into an
  `↑` update tag when one is known, and the mode pill beside it is now the switch — neutral while
  read-only, orange while this session may write.

- **A verified sign-in says so.** Once the key is in the Keychain the form is replaced by a disabled
  `Verified` button and one word, `Undo`, which runs `asc auth logout` and brings the form back.

### Fixed

- **A page that outlived the Host half now says so, once.** Reinstalling the plugin (or a
  Host restart) while the panel stayed open left the console painting the same red
  "Harness connection is not available" box in every card, forever. A transport failure is now
  retried once after 600 ms — enough to ride out an HMR swap — and if it is still gone the panel
  shows one calm banner with a **Reload panel** button, while the per-card notes stop repeating
  the same fact. The panel renders with the last known state behind the banner, so nothing on
  screen is lost.

- **Distributing to an external group actually reaches it.** `builds add-groups` only creates the
  build↔group relationship; external testers receive nothing until the build is submitted for beta
  review. The Host now passes `--submit --confirm` when any selected group is external (internal
  groups stay review-free), so `Distribute build` delivers instead of half-delivering.

- **Submitting for review creates the version when it does not exist.** `asc review submit` attaches
  a build to an *existing* App Store version, so a brand-new version number failed with "create it
  first". The Host now checks the version list and runs `asc versions create` before submitting when
  needed — the first submit of a fresh version works from the panel.

- **A release with nothing to release is silent no more.** `Release to App Store` only appears for a
  version in `PENDING_DEVELOPER_RELEASE`; every other state says why instead of showing a dead
  button.

- **A disabled primary action looks disabled.** The muted style for a gated `Submit for review` /
  `Distribute build` only existed inside the onboarding steps, so in the console a blocked action
  still wore the accent fill and looked clickable. The disabled style is global now.

- **The submission date belongs to the selected build's version.** `Submitted 2026-10-11` was the
  current store version's date, shown even while an older version's build was selected; it now
  appears only when the chosen build's version is the store version.

- **Readiness reports the real blockers.** `asc validate` answers with `remediation.steps[]`
  (`blocking`, `severity`, `checkId`, `message`, `remediation`), but the collector only knew
  `blockers` / `issues`, so it fell through to a non-zero exit and reported asc's own
  "Using version … pass --version to override" notice as an `ASC_FAILED` blocker. Blockers now come
  from the ordered steps (falling back to a hard `checks[]` error), warnings are counted separately,
  and a version in a non-editable state says exactly that instead of a red herring.

### Removed

- **The second confirmation tick in TestFlight.** `Distribute build` is the confirmation: the button
  stays disabled until a group is selected, and that one click is the human's decision, so the payload
  sets the confirmation flag itself. The wire still refuses a write without `confirm: true`; only the
  duplicate checkbox is gone.

- The panel's standalone `.ipa` upload form, the beta-review controls and the sales/analytics cards.
  Those actions remain implemented once in the Host, gated the same way, and reachable through the
  `asc_hub` tool and the `asc` CLI.

- The question mark beside `Get an API key` and its screenshot guide, with the `asset.read` action and
  `assets/` that existed to serve it.

### Known limitations

- No streaming progress: a long operation reports one `busy` state and its result at completion
  (`asc --watch` NDJSON is the planned channel).

- Monthly sales roll-ups and the raw Sales and Trends TSV export are not modeled yet.

- Analytics report instances (granularity, processing date) are not walked; only report requests.

- One account/profile at a time; multi-team `asc --profile` switching is roadmapped.

[Unreleased]: https://github.com/sleep9ull/dsh-asc-hub/compare/v0.1.0...HEAD
[0.1.0]: https://www.npmjs.com/package/@sleep9ull/dsh-asc-hub/v/0.1.0
