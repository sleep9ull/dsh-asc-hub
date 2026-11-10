# Operations

Every console capability is one action in [docs/CONTRACT.md](CONTRACT.md), implemented once in the
Host dispatcher and used by the panel (over the Fetch route) and the `asc_hub` tool — except the
panel-only credential actions, which the tool refuses.
This file documents what each action does, the `asc` command behind it, whether it changes App
Store Connect, this machine, or nothing, and what can go wrong.

## The gating rule

| kind | changes | gate |
|---|---|---|
| `read` | nothing | none — runs immediately |
| `local-write` | this machine only (installs the engine, stores a key in the Keychain) | none — **allowed in `read-only` mode**, because otherwise onboarding could never finish. Panel-only actions refuse the model with `CLIENT_ONLY`; a tool-called `local-write` asks for Host approval. |
| `write` | App Store Connect state | `mode: write` (`READ_ONLY_MODE`) and `input.confirm: true` (`CONFIRM_REQUIRED`); the tool caller also needs Host approval (`APPROVAL_DENIED`). |

Only these four actions need write mode: `builds.upload`, `testflight.distribute`,
`testflight.submitBeta`, `release.submit`. Installing the engine, signing in, logging out and
switching profiles are local actions and work in the default `read-only` mode.

Sign-in and credential management are **panel-only**: `auth.login`, `auth.importKey`, `auth.logout`
and `auth.switch` are human actions. A tool call to any of them returns `CLIENT_ONLY`, and the model
is expected to ask the user to use the panel instead.

## At a glance

| action | kind | `asc` command(s) |
|---|---|---|
| `status` | read | none; derived from `engine.detect` + `auth.status` + operation state |
| `engine.detect` | read | `asc version` |
| `engine.install` | local-write | `brew install asc` or `curl -fsSL https://asccli.sh/install \| bash` |
| `auth.status` | read | `asc auth status --output json` |
| `auth.login` | local-write · panel-only | `asc auth login --name … --key-id … --issuer-id … --private-key …` |
| `auth.importKey` | local-write · panel-only | `asc auth login --private-key <0600 temp file>` |
| `auth.logout` | local-write · panel-only | `asc auth logout --name … --confirm` |
| `auth.switch` | local-write · panel-only | `asc auth switch --name …` |
| `auth.doctor` | read | `asc auth doctor --output json` |
| `apps.list` | read | `asc apps list --paginate --output json` |
| `builds.list` | read | `asc builds list --app … --sort -uploadedDate --output json` |
| `builds.upload` | write | `asc builds upload --app … --ipa … [--version … --build-number …] [--wait] --output json` |
| `testflight.groups` | read | `asc testflight groups list --app … --output json` |
| `testflight.distribute` | write | `asc builds test-notes create --build-id … --locale … --whats-new …`, then `asc builds add-groups --build-id … --group "G1,G2"` |
| `testflight.submitBeta` | write | `asc testflight review submit --build-id … --confirm` |
| `release.readiness` | read | `asc validate --app … [--version …] --output json` |
| `release.status` | read | `asc status --app … --include appstore,submission,review --output json` |
| `release.submit` | write | `asc review submit --app … --version … --build-id … --confirm` |
| `sales.summary` | read | `asc insights daily …` or `asc insights weekly …` |
| `analytics.reports` | read | `asc analytics requests --app … --paginate --output json` |
| `run` | read | `asc <argv>` after classification |

## Hub state

`status` runs no dedicated `asc` command: the Host derives it from the engine probe (`asc version`),
the credential probe (`asc auth status`), the current operation and the last error, and returns the
`HubState` from
[CONTRACT.md § Hub state](CONTRACT.md). The trigger renders `asc: <label>` from it:

| label | when |
|---|---|
| `asc: start` | onboarding is unfinished — nothing probed yet, `asc` missing or installing, credentials missing or being added |
| `asc: ready` | both ready, idle |
| `asc: build` | an upload or TestFlight operation is running |
| `asc: review` | a submission operation is running |
| `asc: error` | the last operation failed |

## Engine

### `engine.detect` — read

Resolves the binary (configured `ascPath` → `PATH` → `/opt/homebrew/bin/asc` →
`/usr/local/bin/asc` → `~/.local/bin/asc`) and runs `asc version`. Returns
`{ installed, path, version, source, brew: { installed, path }, checkedAt }`. Missing binary →
`ASC_NOT_INSTALLED`; the phase becomes `engine`.

Failure modes: no binary resolved (`ASC_NOT_INSTALLED`), binary present but unrunnable
(`ASC_FAILED` with the redacted error).

### `engine.install` — local-write

Two methods, exactly the upstream install channels:

```bash
brew install asc                          # method: "brew" — homebrew-core, no tap
curl -fsSL https://asccli.sh/install | bash   # method: "curl" — official script
```

Runs with a 15-minute deadline, streams nothing (the panel shows the operation as busy), and returns
`{ method, log }` with the log redacted and size-capped. Re-run `engine.detect` afterwards; the
phase only leaves `engine` when a version is found.

What the user must confirm: pressing the install button. It is a local action, so no `input.confirm`
field and no write mode are needed; a tool-driven install asks for the Host approval instead
(`APPROVAL_DENIED` on refusal).

Failure modes: `BREW_MISSING` (brew method, no brew), `INSTALL_FAILED` (child exited non-zero),
`TIMEOUT` (slow network or source build).

## Sign-in

The credential actions in this section are `local-write · panel-only`: they change only this machine,
they work in `read-only` mode, and the model cannot call them. A tool attempt is `CLIENT_ONLY`; ask
the user to use the panel.

### `auth.status` — read

`asc auth status --output json`, normalized to `AuthState`:
`{ configured, profiles: [{ name, keyIdTail, keyType }], activeProfile, storage, environment: {
provided, complete } }`.

Failure modes: `ASC_FAILED` if `asc` fails; an unconfigured account is not an error — it returns
`configured: false`, which drives the `login` phase.

### `auth.login` — local-write · panel-only

```bash
asc auth login \
  --name "MyKey" \
  --key-id "KEY_ID" \
  --issuer-id "ISSUER_ID" \
  --private-key "/path/to/AuthKey_KEY_ID.p8"
```

Optional flags: `--key-type team|individual|enterprise` and `--network` (validate with a lightweight
API request). `asc` stores encrypted key material in the macOS Keychain by default. Returns the
refreshed `AuthState`. If the `.p8` is over-permissive, `asc` refuses it; the panel shows the
`chmod 600` that repairs it (the upstream `--fix-permissions` flag is available when the user runs
`asc auth login` by hand).

What the user must confirm: submitting the panel's sign-in form. There is no `input.confirm` field
and no write mode for a local action; the handoff is the confirmation.

Failure modes: `ASC_AUTH_FAILED` (key rejected: wrong key id/issuer, wrong key type, revoked key),
`KEY_FILE_UNSAFE` (`.p8` readable by others; the panel shows the `chmod 600`), `TIMEOUT`
(`--network` against a slow API), `CLIENT_ONLY` (the model tried to call it).

### `auth.importKey` — local-write · panel-only

The drag-and-drop variant. The Host writes `input.privateKeyPem` to a temporary file with mode
`0600`, runs `asc auth login --private-key <tmp>`, and deletes the file in a `finally` block. The
PEM is never persisted by this plugin, never logged, and never echoed back.

Same gates and failure modes as `auth.login`, including `CLIENT_ONLY` for the model.

### `auth.logout` — local-write · panel-only

```bash
asc auth logout --name "MyKey" --confirm   # or --all --confirm
```

Removes one profile (or all profiles with `input.all: true`) from the Keychain and the active config
file. This is destructive: the key must be supplied again to sign back in. Returns the refreshed
`AuthState`.

What the user must confirm: the panel action itself; no `input.confirm` field and no write mode.

Failure modes: `INVALID_INPUT` (missing/unknown `name`), `ASC_FAILED`, `TIMEOUT`, `CLIENT_ONLY`.

### `auth.switch` — local-write · panel-only

```bash
asc auth switch --name "OtherKey"
```

Makes a stored profile the default for later operations. No key material moves.

What the user must confirm: the panel action itself; no `input.confirm` field and no write mode.

Failure modes: `ASC_FAILED` with the profile list in the redacted stderr, `TIMEOUT`, `CLIENT_ONLY`.

### `auth.doctor` — read

```bash
asc auth doctor --output json
```

Normalized to `{ ok, summary, checks: [{ name, status, message }] }`. `asc auth doctor` exits `0`
even with warnings, so the Host reads the payload, not the exit code.

Failure modes: `ASC_FAILED`.

## Inherited skill pack

### `skills.detect` — read

Reads `~/.agents/.skill-lock.json` plus `~/.agents/skills/asc-cli-usage/SKILL.md` and reports
`{ installed, count, ref, installedAt, root, shippedRef, update, checkedAt }`. An unreadable or
malformed lock reads as "not installed"; it never throws.

`shippedRef` comes from the engine itself — `asc install-skills --help` names the reviewed commit it
would check out (`Checks out the reviewed skills commit <sha>`) — so "there is an update" is a fact
about the installed engine, not a guess, and it costs one local help read per engine build (cached by
`path@version`), no network and no checkout. `update` is true only when both pins are known and differ;
a short sha still matches its full form, and an unparsable help text means "unknown", never "stale".

### `skills.install` — local-write · quiet

Runs `asc install-skills` exactly as a user would: the CLI checks out its pinned reviewed commit with
git and writes the skill documents into the global agent-skills directory. Local machine change, so it
is allowed in `read-only` mode; `quiet` keeps it out of the trigger's five-word vocabulary. The result
carries the installer's last output line, which is what the panel shows when it fails.

This plugin does not vendor those skills and does not rewrite them: the console reports whether they
are present, and the model uses `asc-*` skills for the long tail (metadata, screenshots, signing,
pricing, ads, workflows) while `asc_hub` keeps the shipping funnel — upload, TestFlight, submission
and the reads the panel shows.

## Mode switch

### `mode.set` — local-write · panel-only

No `asc` command: it flips the Hub's own `mode` for this process, which decides both the
gating of `write` actions and whether `--read-only` is passed to `asc` on data-plane calls.
The panel's footer pill calls it; the model cannot (`CLIENT_ONLY`), and the change is not
persisted — the `asc-hub` row's `config.mode` decides what the next start does.

Failure modes: `INVALID_INPUT` (a mode other than `read-only` / `write`), `CLIENT_ONLY`.

## Apps

### `apps.list` — read

```bash
asc apps list --paginate --output json
```

Optional `--limit` and `--name` (exact name) filters. Returns
`{ apps: [{ id, name, bundleId, sku?, primaryLocale? }] }`.

Failure modes: `ASC_AUTH_MISSING` (exit 3), `ASC_FAILED`. An app id that does not resolve in a later
action is `APP_NOT_FOUND`; an action that needs an app id and got none is `APP_NOT_SELECTED`.

## Builds and TestFlight

### `builds.list` — read

```bash
asc builds list --app "APP_ID" --sort -uploadedDate --limit 10 \
  --include preReleaseVersion,buildBetaDetail,betaGroups --output json
```

`limit` defaults to 10 and is clamped to 1–50; the panel asks for 3. Returns
`{ builds: [{ id, version, buildNumber, processingState, uploadedDate, expired, internal, external,
internalBuildState, externalBuildState }] }`.

The three includes are not optional for the panel's reading of a build:

- `preReleaseVersion` supplies the marketing version. A build's own
  `attributes.version` is **CFBundleVersion** — the build number — so without the
  include a row can only say `1`, never `1.0.1 (1)`.
- `buildBetaDetail` carries `internalBuildState` / `externalBuildState`, Apple's
  per-build TestFlight state.
- `betaGroups` says which groups the build was actually added to, and each group's
  `isInternalGroup` decides which TestFlight audience that is.

`internal` / `external` are derived, and mean "this build reached that audience":
true when the build sits in a group of that kind, or when the matching build-beta
state is `READY_FOR_BETA_TESTING` / `IN_BETA_TESTING`. `processingState` is the
source of truth for whether a build can be distributed or submitted.

Failure modes: `APP_NOT_SELECTED`, `APP_NOT_FOUND`, `ASC_AUTH_MISSING`, `ASC_FAILED`.

### `builds.upload` — write

```bash
asc builds upload \
  --app "APP_ID" \
  --ipa "/path/to/App.ipa" \
  --version "1.2.3" \
  --build-number "42" \
  --wait \
  --output json
```

`--app` is optional in the action because the selected/default app supplies it. `--wait` waits for
processing to finish; without it the call returns after the upload commit. Presigned upload URLs and
request-header values are redacted by `asc` by default — the console never passes
`--include-sensitive`.

The panel has **no upload form**: the card lists builds only, so this action is reached through the
`asc_hub` tool or the `asc` CLI. What the user must confirm: the confirm step (tool) or the explicit
`confirm: true` input. This is the slowest ordinary operation: a 10-minute deadline, or 30 minutes
when it waits for processing.

Failure modes: `PROCESSING_PENDING` (the build is not `VALID` yet; retry after processing),
`TIMEOUT`, `ASC_FAILED` (invalid or unsigned IPA, expired credentials), `CONFIRM_REQUIRED`,
`READ_ONLY_MODE`.

### `testflight.groups` — read

```bash
asc testflight groups list --app "APP_ID" --output json
```

Returns `{ groups: [{ id, name, internal, publicLink?, testerCount? }] }`. Group ids from here are
what `testflight.distribute` needs; exact group names are also accepted directly by
`asc builds add-groups --group`.

Failure modes: `APP_NOT_SELECTED`, `APP_NOT_FOUND`, `ASC_FAILED`.

### `testflight.distribute` — write

Two steps, in this order:

```bash
# 1. "What to Test" note, when input.whatsNew is present
asc builds test-notes create --build-id "BUILD_ID" --locale "en-US" --whats-new "Test the new import flow"

# 2. add the build to the groups
asc builds add-groups --build-id "BUILD_ID" --group "GROUP_ID_1,GROUP_ID_2"
```

`groupIds` and `groupNames` are interchangeable: `asc builds add-groups --group` accepts ids or exact
names. The "What to Test" note defaults to the `en-US` locale unless the action carries another one.
For an external group that needs beta app review, the separate `testflight.submitBeta` action
submits it.
`asc builds add-groups` verifies build processing, expiry and external-group readiness before it
sends anything; if it cannot prove readiness it stops without sending, and the console reports the
failure instead of claiming the distribution happened.

In the panel the **Distribute build** button *is* the confirmation: it stays disabled until at least
one group is selected, and the click supplies `input.confirm`. There is no separate tick to remove. A
tool caller still needs `confirm: true` plus the Host approval.

What the user must confirm: the confirm step.

Failure modes: `PROCESSING_PENDING`, `ASC_FAILED` (readiness unprovable, unknown group, expired
build), `CONFIRM_REQUIRED`, `READ_ONLY_MODE`.

### `testflight.submitBeta` — write

```bash
asc testflight review submit --build-id "BUILD_ID" --confirm
```

Submits a build for beta app review, which external TestFlight groups require. `asc` requires
`--confirm`; the console supplies it only after the user confirmed the action. The build must have
been added to an external group first. The panel's own beta-review controls were removed, so this
action is reached through the tool or the CLI.

Failure modes: `PROCESSING_PENDING` (build not `VALID`), `ASC_FAILED` (no external group, invalid
build state), `APPROVAL_DENIED`, `CONFIRM_REQUIRED`.

## Review and release

### `release.readiness` — read

```bash
asc validate --app "APP_ID" --version "1.2.3" --output json
```

`asc validate` is the canonical readiness report: metadata lengths and placeholders, required
fields and localizations, review details, category, build attached and processed, encryption,
content rights, pricing and availability, screenshots and sizes, age rating, and more. The console
returns `{ ready, blockers: [{ code, message }], version?, raw }` and the panel lists the blockers.
`READINESS_BLOCKED` is returned by a submission attempt that `asc` rejects for readiness, with the
same blocker text.

Failure modes: `APP_NOT_SELECTED`, `APP_NOT_FOUND`, `ASC_AUTH_MISSING`, `ASC_FAILED`.

### `release.status` — read

The app-scoped release picture. The console runs the one-screen dashboard with the release sections
selected:

```bash
asc status --app "APP_ID" --include appstore,submission,review --output json
```

Normalized to `{ version?, state?, buildNumber?, raw }`. `asc review status --app …` is the
equivalent lower-level read if you want to reproduce it by hand.

Failure modes: `APP_NOT_SELECTED`, `APP_NOT_FOUND`, `ASC_FAILED`.

### `release.submit` — write

```bash
# the console resolves the latest VALID build when input.buildId is absent
asc review submit \
  --app "APP_ID" \
  --version "1.2.3" \
  --build-id "BUILD_ID" \
  --confirm
```

`asc review submit` wraps attach-build → create submission → add item → submit. The version must
already be prepared (metadata and build staged); run `release.readiness` first and treat its blockers
as the work list.

The panel's Release card is parked, so this action is reached through the tool or the CLI.
What the user must confirm: the confirm step, then (for the tool caller) the Host approval. This is
the one action that sends an app to Apple's review queue; there is no dry run exposed in v1.

Failure modes: `READINESS_BLOCKED` (asc rejected the version as not ready — run `release.readiness`
for the list), `PROCESSING_PENDING` (build not `VALID`), `INVALID_INPUT` (no version/build
resolvable), `ASC_FAILED` (version not in a submittable state), `APPROVAL_DENIED`,
`CONFIRM_REQUIRED`, `READ_ONLY_MODE`.

## Sales and analytics

### `sales.summary` — read

App Store Connect sales are **vendor-scoped**. The plugin takes the vendor number from
`input.vendorNumber` or the configured `vendorNumber`; without one the action fails with
`VENDOR_REQUIRED`. The number is digits only and appears in the App Store Connect **Sales and Trends**
page URL (`vendorNumber=…`).

```bash
# period: "day" (default)
asc insights daily --app "APP_ID" --vendor "12345678" --date "2026-11-01" --output json

# period: "week"
asc insights weekly --app "APP_ID" --vendor "12345678" --source sales --week "2026-10-27" --output json
```

The Host normalizes the command's JSON to `{ period, date?, rows, totals?, raw }`. `rows` and
`totals` shapes are the command's; the panel renders the summary and keeps `raw` for drill-down.
A monthly roll-up (`period: "month"`) is deferred; the action accepts only `day` and `week`.

Failure modes: `VENDOR_REQUIRED`, `APP_NOT_SELECTED`, `INVALID_INPUT` (bad date format), `ASC_FAILED`
(no report for that date, or the account lacks report access), `TIMEOUT`.

The raw Sales and Trends export (`asc analytics sales --output <file>`) is a different command with a
sharp edge — its `--output` is a file path, and metadata format is `--output-format json`. It is not
used for the summary; it is a roadmap item for the `run` escape hatch.

### `analytics.reports` — read

```bash
asc analytics requests --app "APP_ID" --paginate --output json
```

Returns `{ requests, raw: true }`: `asc`'s analytics report-request objects, passed through
essentially unmodified (only `id`/`accessType` are relied on). Report instances — granularity,
processing date, download segments — live under a report, not a request; walking them
(`asc analytics reports view --report-id …`, `asc analytics instances links …`) is deferred.

Failure modes: `APP_NOT_SELECTED`, `APP_NOT_FOUND`, `ASC_AUTH_MISSING`, `ASC_FAILED`, `TIMEOUT`.

## Escape hatch

### `run` — read

```bash
asc <argv…>
```

Runs an arbitrary `asc` argv after classification. `run` is read-only in v1: `auth`, `web`,
`install-skills` and the mutating command families are refused, and mutations belong to typed actions
so the mode, confirm and approval gates apply. In `mode: read-only` the child is also launched with
`asc`'s global `--read-only`, so even a command the classifier lets through cannot change App Store
Connect state. Arguments are passed as an argv array (no
shell), `cwd` is optional, and the result is `{ exitCode, stdout, stderr, json?, redacted: true }`
with all text redacted and size-capped.

Failure modes: `INVALID_INPUT` (empty argv, non-array), `READ_ONLY_MODE`/`ASC_FAILED` (refused
command), `TIMEOUT`.

## How `asc` exit codes are classified

| exit | meaning | console result |
|---|---|---|
| `0` | success | `ok: true` with the action's data |
| `1` | runtime/business failure | `ASC_FAILED` (or the action's more specific code) |
| `2` | usage error (unknown flag, bad enum, unreadable `@file:`) | `INVALID_INPUT`, with the flag named in the message |
| `3` | authentication failure | `ASC_AUTH_MISSING` |
| `6` | `asc` refused a mutating request (global `--read-only`) | `READ_ONLY_MODE` |
| `7` | a wait ended while still pending | `PROCESSING_PENDING` |
| timeout | the child exceeded its deadline and was killed | `TIMEOUT` |

`asc` has no JSON error object: errors are prose on stderr. The classifier also treats stderr that
mentions `401`, `403` or missing authentication as `ASC_AUTH_MISSING`, even when the exit code is not
`3`, because that is how Apple's API failures usually surface.
