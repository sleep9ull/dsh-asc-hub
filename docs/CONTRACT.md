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

* The route lives under the existing `/api` bridge, so the browser-trust fence
  answers before plugin code runs: unauthenticated requests get 401, a non-owner
  Peer gets 403. The plugin invents no authentication of its own.
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

### Hub state

| action | kind | input | data |
|---|---|---|---|
| `status` | read | — | `HubState` (see §Hub state) |

### Engine

| action | kind | input | data |
|---|---|---|---|
| `engine.detect` | read | — | `EngineState` |
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
| `auth.doctor` | read | — | `{ "ok": boolean, "summary": object, "checks": [{ "name", "status", "message" }] }` |

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

### Builds and TestFlight

| action | kind | input | data |
|---|---|---|---|
| `builds.list` | read | `{ "appId", "limit"?: number }` | `{ "builds": [{ "id", "version", "buildNumber", "processingState", "uploadedDate", "expired" }] }` |
| `builds.upload` | write | `{ "appId", "ipaPath", "version"?, "buildNumber"?, "wait"?: boolean, "confirm": true }` | `{ "log": string, "buildId"?: string }` |
| `testflight.groups` | read | `{ "appId" }` | `{ "groups": [{ "id", "name", "internal", "publicLink"?, "testerCount"? }] }` |
| `testflight.distribute` | write | `{ "appId", "buildId", "groupIds"?: string[], "groupNames"?: string[], "whatsNew"?: string, "confirm": true }` | `{ "log": string }` |
| `testflight.submitBeta` | write | `{ "appId", "buildId", "confirm": true }` | `{ "log": string }` |

`testflight.distribute` writes the "What to Test" note first
(`asc builds test-notes create --build-id … --locale … --whats-new …`) when
`whatsNew` is present, then adds the build to the groups
(`asc builds add-groups --build-id … --group "G1,G2"`).

### Review and release

| action | kind | input | data |
|---|---|---|---|
| `release.readiness` | read | `{ "appId", "version"?: string }` | `{ "ready": boolean, "blockers": [{ "code", "message" }], "version"?, "raw"?: unknown }` |
| `release.status` | read | `{ "appId" }` | `{ "version"?, "state"?, "buildNumber"?, "submittedDate"?, "raw"?: unknown }` |
| `release.submit` | write | `{ "appId", "version"?: string, "buildId"?: string, "confirm": true }` | `{ "log": string }` |

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
  "label": "start | engine | login | ready | build | review | error",
  "engine": EngineState,
  "auth": AuthState,
  "app": { "id": "...", "name": "..." } | null,
  "operation": { "id": "...", "kind": "upload | distribute | submit", "startedAt": "..." } | null,
  "lastError": { "code": "...", "message": "..." } | null,
  "mode": "read-only | write",
  "checkedAt": "2026-11-09T05:00:00.000Z"
}
```

Phase is derived, never stored:

```
engine.installed === false                       -> "engine"   (onboarding: install asc)
engine.installed && auth.configured === false    -> "login"    (onboarding: sign in)
operation !== null                               -> "busy"
lastError !== null                               -> "error"
otherwise                                        -> "ready"
```

`phase: "start"` is the first contact before any probe finished. The trigger shows
`asc: <label>`; that string is the user's own vocabulary for the product:

| label | trigger text | meaning |
|---|---|---|
| `start` | `asc: start` | nothing probed yet / onboarding needed |
| `engine` | `asc: engine` | the asc engine is missing or being installed |
| `login` | `asc: login` | asc installed, no App Store Connect credentials |
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
| `CLIENT_ONLY` | the model tried a panel-only sign-in action | ask the user to use the panel |
| `APPROVAL_DENIED` | the human declined the approval | keep the panel state |
| `TIMEOUT` | the child exceeded its deadline | offer retry |
| `ASC_FAILED` | non-zero exit with no better classification | show the redacted output |
| `INVALID_INPUT` | input failed validation or asc exit 2 | fix the field |
| `UNSUPPORTED_ACTION` | unknown action | — |
| `RPC_FAILED` | the browser↔Host call itself failed | retry / reconnect |

## Configuration

```yaml
- id: asc-hub
  name: dsh-asc-hub
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

The Client persists the selected app id in `localStorage` under
`dsh.asc-hub.v1.app` and the vendor number under `dsh.asc-hub.v1.vendor`.
