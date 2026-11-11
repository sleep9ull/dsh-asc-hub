# asc-hub Host ↔ Client contract

This document is the single source of truth for the wire between the two halves of
the plugin. The Host half (`index.js` + `host/**`) implements every operation once;
the Web Client half (`client.js`) and the agent tool (`asc_hub`) are thin adapters
over the same dispatcher.

Nothing in this contract stores, logs or transmits App Store Connect private key
material. Credentials belong to `asc` and to the macOS Keychain.

## Transport

The Client half runs in the Harness Web page. It reaches the Host half through the
carrier-neutral exact-Fetch RPC channel of `@deepseek-ai/dsh-client-connection`.
This is the same channel the shipped third-party bundle `dsh-worktrace` uses.

```
client  -> ctx.connection.rpc.call('/api', 'asc-hub/<action>', { action, input })
host    -> ctx.connection.fetch.register({ path: '/api/asc-hub/<action>', methods: ['POST'], requestBody: 'buffered', fetch })
```

* The route lives under the existing `/api` bridge, so the browser-trust
  fence answers before plugin code runs: unauthenticated requests get 401, a
  non-owner Peer gets 403. The plugin invents no authentication of its own.
* Nothing is written to the session log and nothing enters model history, so the
  panel can refresh freely.
* The host handler validates the wire envelope (`type === 'client-request'`,
  `rpcId` is a string, `method === 'asc-hub/<action>'`) and always answers
  `{ type: 'server-response', rpcId, result }`.
* The client call returns `{ ok: true, value }` or
  `{ ok: false, error: { code, message, details? } }`. A transport-level failure
  throws; the panel reports that as `RPC_FAILED`.

Request payload:

```json
{ "action": "status", "input": { } }
```

`action` selects the operation and `input` is its argument object (omitted or `{}`
when the action takes none). The `action` in the URL, in the envelope body and the
handler's own name must agree; a mismatch is rejected with 400.

Result envelope:

```json
{ "ok": true,  "value": { } }
{ "ok": false, "error": { "code": "ASC_AUTH_MISSING", "message": "..." } }
```

The value is the action's `data` from the tables below. `error.code` is a stable,
non-secret machine code. `error.message` is safe to show. Raw child output is only
attached as `error.details.text` after redaction (see §Redaction).

## Actions

Every action is exposed twice: through the Fetch route (the human panel) and
through the `asc_hub` tool (the model). Both call the same dispatcher.

Three classes, and the class decides the gate:

| `kind` | changes | gate |
|---|---|---|
| `read` | nothing | none — runs immediately |
| `local-write` | this machine only (installs the engine, stores a key in the Keychain) | none — allowed in `read-only` mode, because otherwise onboarding could never finish. Panel-only actions cannot be called by the model at all (`CLIENT_ONLY`). |
| `write` | App Store Connect state | refused with `READ_ONLY_MODE` unless `mode: write`; refused with `CONFIRM_REQUIRED` unless `input.confirm === true` |

`kind: "write"` called through the **tool** additionally requires a Host approval;
`local-write` through the tool (only `engine.install`) requires one too, because it
downloads and installs software. A denial returns `APPROVAL_DENIED`.

Actions marked **panel-only** (`auth.login`, `auth.importKey`, `auth.logout`,
`auth.switch`) exist so the human owns the credential handoff: the model is told to
ask the user, and receives `CLIENT_ONLY` if it tries.

A `write` still requires `input.confirm === true` on the wire; how the panel earns it
is a UI decision, not a contract one. `testflight.distribute` treats its single
**Distribute build** button as the confirmation — the group selection plus that click —
instead of asking for a second tick.

### Hub state

| action | kind | input | data |
|---|---|---|---|
| `status` | read | — | `HubState` (see §Hub state) |

### Engine

| action | kind | input | data |
|---|---|---|---|
| `engine.detect` | read | — | `EngineState` |
| `update.apply` | local-write · panel-only | `{ "scope": "core" \| "hub" }` | core: `EngineState` after a reinstall; hub: refused with `MANUAL_UPDATE_REQUIRED` (the Plugin Manager owns installation) |
| `skills.detect` | read | — | `{ "installed", "count", "ref", "installedAt", "root", "shippedRef", "update", "checkedAt" }` — the inherited `asc` skill pack, read from `~/.agents` |
| `skills.install` | local-write · quiet | — | `{ "installed", "changed", "log", "state" }` — runs `asc install-skills`; `quiet` means it does not take over the trigger label |
| `mode.set` | local-write · panel-only | `{ "mode": "read-only" \| "write" }` | `HubState` — flips this session's gating and the flags handed to `asc`; **not persisted**, the config row still decides the next start |
| `engine.install` | local-write | `{ "method": "brew" \| "curl" }` | `{ "method", "log", "fallback"?, "fallbackReason"? }` — re-detect with `engine.detect` afterwards |

`EngineState`:

```json
{
  "installed": true,
  "path": "/opt/homebrew/bin/asc",
  "version": "6.5.3",
  "source": "path" | "missing",
  "brew": { "installed": true, "path": "/opt/homebrew/bin/brew" },
  "checkedAt": "2026-11-09T05:00:00.000Z"
}
```

Detection order: the configured `ascPath` → `asc` on PATH → `/opt/homebrew/bin/asc`
→ `/usr/local/bin/asc` → `~/.local/bin/asc`. `version` is parsed from
`asc version` (`6.5.3 (commit: …, date: …)`); asc has no JSON version output.
Installation is `brew install asc` (homebrew-core) when Homebrew exists, otherwise
`curl -fsSL https://asccli.sh/install | bash`. A failed Homebrew pour – its prefix
can be unwritable, a tap untrusted, a keg half-poured – is retried once through the
official installer, because that channel needs no `sudo` and a failed pour can leave
no binary behind. The result then carries `fallback: true` and `fallbackReason`
(`brew-missing` or `brew-failed`) so the panel can explain what happened.

### Authentication

| action | kind | input | data |
|---|---|---|---|
| `auth.status` | read | — | `AuthState` |
| `auth.login` | local-write · panel-only | `{ "keyId", "issuerId", "privateKeyPath", "name"?, "keyType"?, "storage"?, "network"?: true }` | `AuthState` |
| `auth.importKey` | local-write · panel-only | `{ "keyId", "issuerId", "privateKeyPem", "name"?, "keyType"? }` | `AuthState` |
| `auth.logout` | local-write · panel-only | `{ "name": string, "all"?: boolean }` | `AuthState` |
| `auth.switch` | local-write · panel-only | `{ "name": string }` | `AuthState` |
| `auth.doctor` | read | — | `{ "ok": boolean, "summary": object, "checks": [{ "section", "status", "message", "recommendation"? }] }` |

`AuthState` is derived from `asc auth status --output json`
(`{ storageBackend, storageLocation, credentials, environmentCredentialsProvided,
environmentCredentialsComplete }`):

```json
{
  "configured": true,
  "profiles": [{ "name": "MyKey", "keyIdTail": "…AB12", "keyType": "team" }],
  "activeProfile": "MyKey",
  "storage": "System Keychain",
  "environment": { "provided": false, "complete": false }
}
```

`auth.login` runs `asc auth login` with the given flags. `auth.importKey` exists so
a human can drag a freshly downloaded `AuthKey_*.p8` onto the panel: the Host
writes the PEM to a private temporary file with mode `0600`, runs
`asc auth login --private-key <tmp>`, and deletes the file in a `finally` block.
The PEM is never persisted by this plugin, never logged, and never echoed back.

### Apps

| action | kind | input | data |
|---|---|---|---|
| `apps.list` | read | `{ "limit"?: number, "name"?: string }` | `{ "apps": [{ "id", "name", "bundleId", "sku"?, "primaryLocale"? }] }` |

### Workspace

| action | kind | input | data |
|---|---|---|---|
| `workspace.info` | read · panel-only | `{ "sessionId"?: string }` | `{ "cwd", "display", "repo", "branch", "worktree", "upstream", "ahead", "behind", "changed", "untracked", "clean", "build": { "xcode", "kind", "project", "name", "ios", "schemes", "ready", "reason" }, "checkedAt" }` |
| `build.create` | write · panel-only | `{ "appId", "sessionId"?, "version"?, "buildNumber"?, "scheme"?, "confirm": true }` | `{ "scheme", "project", "archivePath", "ipaPath", "version", "buildNumber", "buildId", "log" }` — archives the session's working directory, exports an `.ipa`, uploads it and waits |

`workspace.info` answers "where is this session working": `cwd` is the Harness's own
effective directory for that session (`ctx.sessions` → `ctx.workingDirectory`, falling
back to the profile default), `display` abbreviates it against the home directory, and
the git facts are best effort — `repo`, `branch` and `worktree` are null/false when the
directory is not a repository, git is unavailable or the read times out. `worktree` is
true when the git directory differs from the common directory, which is exactly what a
linked worktree looks like. It is panel-only: the model already knows its directory
from the system prompt.

`build` says whether that directory can be built, and why not when it cannot. `kind` /
`project` / `name` name the nearest `.xcworkspace` (preferred) or `.xcodeproj` within two
levels; `ios` says whether that project targets iOS (its `project.pbxproj` carries
`IPHONEOS_DEPLOYMENT_TARGET` or an `iphoneos` SDK root); `xcode` says whether a full Xcode
is selected (`xcode-select -p` — the Command Line Tools alone cannot archive, even though
`xcodebuild` resolves); `schemes` is what `xcodebuild -list` returned; `ready` is exactly
"Xcode + an iOS project that lists at least one scheme". `reason` is ordered the way a
person asks the question and is `null` only when `ready`:

| `reason` | meaning | repairable by the panel's auto-fix prompt |
|---|---|---|
| `no-project` | nothing Xcode-shaped here — not an iOS project | no |
| `not-ios` | an Xcode project, but not an iOS app | no |
| `no-xcode` | an iOS project, but this machine has no full Xcode | yes (the prompt asks the model to diagnose the toolchain) |
| `unloadable` | an iOS project whose schemes do not list — it has build errors | yes |

A directory without a project is a normal answer, not an error.

`build.create` builds **the session's working directory** — the code the panel is looking
at — never a file the user picks: `asc xcode archive` (version and build number passed as
`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` build settings, so the checkout is never
rewritten) → `asc xcode export` → `asc builds upload --wait`, with artifacts in a
temporary directory. The scheme is the first one xcodebuild lists unless the input names
one. A directory that cannot build fails with `BUILD_UNAVAILABLE`.

The working tree is read from one `git status --porcelain=v1 --branch`, which answers
three questions at once: `upstream` (the branch it tracks, `origin/main` by default in
these repos), the drift `ahead` / `behind` in commits, and what is uncommitted —
`changed` counts tracked paths (staged, unstaged or conflicted), `untracked` counts
`??` entries, and `clean` is exactly "both are zero". Ignored paths are never counted.
No fetch runs, so the drift is against the last known upstream, not the network. When
`git status` fails, every tree field is `null` and the panel simply omits that line.

### Builds and TestFlight

| action | kind | input | data |
|---|---|---|---|
| `builds.list` | read | `{ "appId", "limit"?: number }` | `{ "builds": [{ "id", "version", "buildNumber", "processingState", "uploadedDate", "expired", "internal", "external", "internalBuildState", "externalBuildState" }] }` |
| `builds.upload` | write | `{ "appId", "ipaPath", "version"?, "buildNumber"?, "wait"?: boolean, "confirm": true }` | `{ "log": string, "buildId"?: string }` |
| `testflight.groups` | read | `{ "appId" }` | `{ "groups": [{ "id", "name", "internal", "publicLink"?, "testerCount"? }] }` |
| `testflight.distribute` | write | `{ "appId", "buildId", "groupIds"?: string[], "groupNames"?: string[], "whatsNew"?: string, "confirm": true }` | `{ "log": string }` |
| `testflight.submitBeta` | write | `{ "appId", "buildId", "confirm": true }` | `{ "log": string }` |

`builds.list` asks asc for three includes — `preReleaseVersion`, `buildBetaDetail`,
`betaGroups` — because none of what a person reads on a build row is on the build
resource itself: `version` there is CFBundleVersion, so `version` in the answer is the
marketing version from `preReleaseVersion` and `buildNumber` is the build number.
`internal` / `external` mean "this build reached that TestFlight audience", true when
the build is in a group of that kind or when `internalBuildState` /
`externalBuildState` is `READY_FOR_BETA_TESTING` / `IN_BETA_TESTING`; the raw states
are returned beside them for callers that need the nuance.

`testflight.distribute` writes the "What to Test" note first
(`asc builds test-notes create --build-id … --locale … --whats-new …`) when
`whatsNew` is present, then adds the build to the groups
(`asc builds add-groups --build-id … --group "G1,G2"`).

### Review and release

| action | kind | input | data |
|---|---|---|---|
| `release.readiness` | read | `{ "appId", "version"?: string }` | `{ "ready": boolean, "blockers": [{ "code", "message", "detail"? }], "warnings": number, "version"?, "raw"?: unknown }` |
| `release.status` | read | `{ "appId" }` | `{ "version"?, "versionId"?, "versionState"?, "reviewState"?, "state"?, "buildNumber"?, "submittedDate"?, "raw"?: unknown }` |
| `release.versions` | read | `{ "appId" }` | `{ "versions": [{ "id", "version", "state", "buildId", "createdDate"? }] }` — every App Store version with the build it carries |
| `release.publish` | write | `{ "versionId": string, "confirm": true }` | `{ "versionId", "released": true, "raw"?: unknown }` — `asc versions release --version-id … --confirm`, for a version App Review already approved (`PENDING_DEVELOPER_RELEASE`) |
| `release.submit` | write | `{ "appId", "version"?: string, "buildId"?: string, "platform"?: string, "confirm": true }` | `{ "log": string }` — attaches the build to the version and submits; **creates the version** when that version string does not exist yet |

`release.status` separates the two states a person asks about: `versionState` is where the App
Store version is (`PREPARE_FOR_SUBMISSION`, `WAITING_FOR_REVIEW`, `IN_REVIEW`,
`PENDING_DEVELOPER_RELEASE`, `READY_FOR_DISTRIBUTION`, …) and `reviewState` is where the review
submission is (`WAITING_FOR_REVIEW`, `IN_REVIEW`, `COMPLETE`, …). `state` keeps the old meaning —
the version state when there is one — so existing callers do not change. `release.publish` is the
one action that can only ever be right for `PENDING_DEVELOPER_RELEASE`: Apple-scheduled releases
move on their own, and a distributed version is not releasable again.

`release.versions` is the answer to "has this build been reviewed?": App Review applies to a
version, so a build is reviewed exactly when the version carrying it reached
`READY_FOR_DISTRIBUTION` (or later). A build that no version carries — a TestFlight-only build — was
never reviewed, which is why the panel asks the Host instead of guessing from version numbers.
`testflight.distribute` adds the build to the selected groups. When any of them is an **external**
group it also submits the build for beta review (`add-groups --submit --confirm`), because assigning
an external group alone does not deliver anything to its testers; internal groups need no review, so
they are added without it.

`release.submit` resolves the latest valid build itself when `buildId` is absent and
then runs `asc review submit --app … --version … --build-id … --confirm`.

### Sales and analytics

| action | kind | input | data |
|---|---|---|---|
| `sales.summary` | read | `{ "appId", "vendorNumber"?, "period"?: "day" \| "week", "date"?: "YYYY-MM-DD", "week"?: "YYYY-MM-DD" }` | `{ "period", "date"?, "totals"?: object, "rows": array, "raw"?: unknown }` |
| `analytics.reports` | read | `{ "appId" }` | `{ "requests": Array<Record<string, unknown>>, "raw": true }` |

`date` and `week` name the same thing — the report date, or the week start when
`period` is `week` (asc requires a week start for `insights weekly`). A caller may
send either.

App Store Connect sales are vendor-scoped: every sales call needs a Vendor number,
supplied as `input.vendorNumber` or the plugin's configured `vendorNumber`
otherwise the action fails with `VENDOR_REQUIRED`. `period` is `day` (default) or
`week`; a monthly roll-up is deferred. `analytics.reports` passes asc's analytics
report-request objects through essentially unmodified.

### Escape hatch

| action | kind | input | data |
|---|---|---|---|
| `run` | read | `{ "argv": string[], "cwd"?: string, "timeoutMs"?: number }` | `{ "exitCode", "stdout", "stderr", "json"?, "redacted": true }` |

`run` is read-only by construction, in every mode: the Host forces asc's own
read-only switch (`--read-only` plus `ASC_READ_ONLY=1`) for the call, and asc
refuses a mutating command with exit 6 (`READ_ONLY_MODE`). The Host additionally
refuses the command groups that own a typed action (`auth`, `web`,
`install-skills`, `init`, `publish`, `release`, `review`, `submit`, `metadata`,
`versions`, `testflight`, `builds`, `distribute`) so a mutation always goes
through the gated surface instead of the escape hatch.

## Hub state (what the button and the panel render)

One derived object keeps the trigger and the panel in sync. `status` returns it:

```json
{
  "phase": "start | engine | login | ready | busy | error",
  "label": "start | ready | build | review | error",
  "engine": EngineState,
  "auth": AuthState,
  "app": { "id": "...", "name": "..." } | null,
  "operation": { "id": "...", "kind": "upload | distribute | submit", "startedAt": "..." } | null,
  "lastError": { "code": "...", "message": "..." } | null,
  "mode": "read-only | write",
  "hub": { "version": "0.1.1" },
  "skills": { "installed": true, "count": 25, "ref": "f52c4f0", "installedAt": "...", "root": "...", "checkedAt": "..." },
  "update": { "available": false, "scope": "hub | core | null", "latest": "6.6.0 | null" },
  "checkedAt": "2026-11-09T05:00:00.000Z"
}
```

`skills` reports the inherited skill pack: `asc install-skills` writes 25 reviewed `asc-*` skill
documents into the global agent-skills directory (`~/.agents/skills`) pinned to a commit, and this
plugin neither vendors nor rewrites them. `ref` is the pin the installed pack records; `shippedRef` is
the pin the installed engine *now* ships, read from `asc install-skills --help` (offline, no checkout),
and `update` is true only when both are known and differ. The console shows the state in a quiet row
that opens by default, with `install` or `update` at the end of that line when there is something to
do; the model learns it from `status` and uses the `asc-*` skills when present.

`hub.version` is read once from the plugin's own `package.json`, so the footer can report
both halves of the product on one line: `version 0.1.1 © sleep9ull · engine asc 6.5.3`, where
the author and the engine are links to their GitHub projects. `update` is the contract the
footer reserves space for: when a release feed says something newer exists, `available`
becomes `true`, `scope` says which half (`core` re-runs the installer from the panel, `hub`
belongs to the plugin manager) and `latest` carries the version string. Nothing probes a
feed yet, so it is `{ available: false, scope: null, latest: null }`.

Phase is derived, never stored:

```
engine.installed === false                       -> "engine"   (onboarding: install asc)
engine.installed && auth.configured === false    -> "login"    (onboarding: sign in)
operation !== null                               -> "busy"
lastError !== null                               -> "error"
otherwise                                        -> "ready"
```

Onboarding ends with the person, not with the state machine: `phase: "ready"` alone does not
open the console. The panel keeps its own completion flag in browser storage
(`dsh-asc-hub:onboarded`) and sets it only when `Start to build` is pressed; a refresh after
signing in therefore lands on step three, and a sign-out drops back to onboarding because the
phase is `login` again.

`phase: "start"` is the first contact before any probe finished. The trigger shows
`asc: <label>`; that string is the user's own vocabulary for the product:

`label` is the user's vocabulary and has **five** words: every state before onboarding
finishes reads `asc: start`, whatever step is missing and whether it is idle or running.
`phase` is the panel's vocabulary and keeps `engine` and `login` distinct so the body can
show the right onboarding step.

| label | trigger text | meaning |
|---|---|---|
| `start` | `asc: start` | onboarding is not finished: nothing probed yet, the engine is missing or installing, or credentials are missing or being added |
| `ready` | `asc: ready` | both ready, idle |
| `build` | `asc: build` | an upload or TestFlight operation is running |
| `review` | `asc: review` | a submission / review operation is running |
| `error` | `asc: error` | the last operation failed |

`app` and `lastError` are per-Host-session observations; the selected app id lives
in the Client's `localStorage`, not in the Host.

## Redaction

Before any text crosses the wire, the Host removes:

* the contents of any `-----BEGIN … PRIVATE KEY-----` block and long base64 lines,
* values of `ASC_PRIVATE_KEY`, `ASC_PRIVATE_KEY_PATH`, `ASC_KEY_ID`, `ASC_ISSUER_ID`
  environment assignments,
* `AuthKey_*.p8` absolute paths (replaced with `<redacted-path>`),
* anything matching a JWT (`eyJ…`).

Key ids and issuer ids are not secrets without the private key, but panel copy still
shows only their last 4 characters (`keyIdTail`).

## Readiness

`release.readiness` runs `asc validate --app <id> [--version <v>]` and reads its report the way asc
writes it: `remediation.steps[]` ordered by `order`, where `blocking: true` is a blocker and
`severity: warning` is only counted. `checks[]` is the same set without the ordering, so a hard
`severity: error` there is the fallback; the older `blockers` / `issues` lists stay accepted. A
non-zero exit with no structured blocker still becomes one `ASC_FAILED` blocker carrying the last
stderr line, because silence would look like a pass. `ready` is exactly "exit 0 and no blockers".

## Errors

| code | meaning | panel action |
|---|---|---|
| `ASC_NOT_INSTALLED` | engine missing | show install step |
| `BREW_MISSING` | brew requested but absent | offer the curl installer |
| `INSTALL_FAILED` | brew/curl exited non-zero | show the redacted log |
| `ASC_AUTH_MISSING` | asc has no usable credentials (exit 3) | show login step |
| `ASC_AUTH_FAILED` | `asc auth login` rejected the key | show the redacted detail |
| `KEY_FILE_UNSAFE` | the `.p8` is readable by others | show the suggested `chmod` |
| `APP_NOT_SELECTED` | action needs an app id | focus the app picker |
| `APP_NOT_FOUND` | app id does not resolve | refetch apps |
| `VENDOR_REQUIRED` | sales action without a vendor number | ask for the vendor number |
| `PROCESSING_PENDING` | a build is still processing (exit 7) | retry after it is VALID |
| `READINESS_BLOCKED` | readiness reported blockers | show the blockers |
| `READ_ONLY_MODE` | write action while `mode: read-only` | point at `mode` |
| `CONFIRM_REQUIRED` | write action without `input.confirm === true` | show the confirm step |
| `BUILD_UNAVAILABLE` | the working directory has no Xcode project, or this session has no directory | ask the user to open the app's directory |
| `MANUAL_UPDATE_REQUIRED` | a plugin-half update has to go through the Plugin Manager |
| `CLIENT_ONLY` | the model tried a panel-only action | ask the user to use the panel |
| `APPROVAL_DENIED` | the human declined the approval | keep the panel state |
| `TIMEOUT` | the child exceeded its deadline | offer retry |
| `ASC_FAILED` | non-zero exit with no better classification | show the redacted output |
| `INVALID_INPUT` | input failed validation or asc exit 2 | fix the field |
| `UNSUPPORTED_ACTION` | unknown action | — |
| `RPC_FAILED` | the browser↔Host call itself failed | retry / reconnect |

## Configuration

```yaml
- id: asc-hub
  name: "@sleep9ull/dsh-asc-hub"
  config:
    ascPath: asc            # bare name or absolute path
    profile: null           # asc --profile
    mode: read-only         # read-only | write
    requireApproval: true   # approval for tool-driven writes
    timeoutMs: 60000
    longTimeoutMs: 1800000
    maxOutputBytes: 262144
    telemetryDisabled: true # ASC_TELEMETRY_DISABLED=1
    bypassKeychain: false   # ASC_BYPASS_KEYCHAIN=1
    defaultAppId: null
    vendorNumber: null      # sales reports; the number in the Sales and Trends URL
```

The plugin deliberately exports no Cordis `Config`. A `Config` is a schema object built by a runtime
schema library, and the Host half ships dependency-free (`AGENTS.md` invariant 3), so
`src/host/config.ts` normalizes the row's `config` instead: unknown keys are ignored and a value of the
wrong type falls back to the default above rather than failing activation. The visible consequence is
that the Plugin Manager shows this row's config as raw YAML rather than a form, and that a persistent
mode change is that edit — `mode.set` from the panel footer only affects the running session.

The Client persists the selected app id in `localStorage` under
`dsh.asc-hub.v1.app` and the vendor number under `dsh.asc-hub.v1.vendor`.
