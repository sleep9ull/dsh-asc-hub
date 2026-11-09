# dsh-asc-hub

An App Store Connect console for DeepSeek Harness: the post-coding half of shipping an iOS app,
in the side panel next to the session that built it. Install the engine, sign in with an App Store
Connect API key, send a build to TestFlight, submit a release for review, read sales — and let the
agent do the same through the `asc_hub` tool.

`dsh-asc-hub` **inherits [`asc`](https://github.com/rorkai/App-Store-Connect-CLI) as an external
engine**. It does not fork, vendor or absorb the CLI. The plugin owns the console, the state machine
and the safety rails; `asc` owns the App Store Connect protocol, the credential storage and the
command surface. Upgrading `asc` upgrades the product's capabilities.

## What you get

- **Engine onboarding.** Detects an installed `asc` (configured path → `PATH` → `/opt/homebrew/bin/asc`
  → `/usr/local/bin/asc` → `~/.local/bin/asc`), reads its version from `asc version`, and installs it
  on request through Homebrew or the official install script.
- **Sign-in without a password, panel-only.** The human enters the API key id, issuer id and `.p8`
  path in the panel; the Host hands them to `asc auth login`, and `asc` stores the key in the macOS
  Keychain. The plugin never asks for the Apple ID password, never persists key material, and the
  model cannot run the sign-in (`CLIENT_ONLY`).
- **Apps.** Lists App Store Connect apps and remembers the selection per browser.
- **Builds.** Recent builds with processing state; upload an `.ipa`; wait for processing to finish.
- **TestFlight.** List beta groups, distribute a processed build to groups, write "What to Test"
  notes, and submit a build for beta app review.
- **Release.** Readiness report with blockers, release status, and submission for App Store review
  behind an explicit confirmation.
- **Sales and analytics.** A sales summary per app for a day or a week (vendor-scoped, as Apple's
  reports are), plus the account's analytics report requests.
- **One status trigger.** The session header shows `asc: start | engine | login | ready | build |
  review | error`, derived from the live engine, credential and operation state.
- **The same operations for the agent.** Reads, engine installation and publishing are exposed as the
  `asc_hub` tool, and the panel and the tool call the same Host dispatcher, so they share
  classification, gating and redaction. Sign-in stays panel-only, so the model has no path to key
  material.

No screenshots in this file on purpose: the panel renders with the Harness theme, and a static
image would go stale faster than this list.

## How it works

The plugin has two halves. The Host half (`index.js` + `host/**`) implements every operation once,
runs `asc` as a child process, classifies the result and redacts secrets before anything leaves the
Host. The Client half (`client.js`) is hand-written browser JavaScript with no build step; it renders
the trigger and the panel and reaches the Host over a POST route under the Harness `/api` trust
fence. The `asc_hub` tool is a second adapter over the same dispatcher.

Architecture, transport and the state machine: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Install

Requirements: DeepSeek Harness with plugin support (this build), the Harness Web GUI or Desktop app,
macOS, and an Apple Developer Program account with App Store Connect access.

1. Install the bundle: use the Plugin Manager UI, or `plugin_manager` → `install_bundle` with the
   absolute path to this checkout. Enable the `asc-hub` row.
2. Open the **ASC Hub** tab in the right sidebar (the plugin row itself is titled "App Store release
   console" in the Plugin Manager; both titles follow the Harness locale).
3. Onboard: install the engine, then sign in. Both steps are **local actions and work in the default
   `read-only` mode** — only App Store Connect publishing needs `mode: write`.

The row configuration lives in your profile's `cordis.patch.yml`:

```yaml
- id: asc-hub
  name: dsh-asc-hub
  config:
    ascPath: asc
    mode: read-only    # onboarding works here; switch to write to publish
    requireApproval: true
    telemetryDisabled: true
```

The shipped default is `mode: read-only` (see [Configuration](#configuration)).

## Onboarding in two steps

### 1. Install the `asc` engine

- With Homebrew: `brew install asc` — the official Homebrew-core formula, no tap needed.
- Without Homebrew: `curl -fsSL https://asccli.sh/install | bash`.
- Verify: `asc version` prints something like `6.5.3 (commit: …, date: …)`.

The console runs this for you: it detects the engine with `asc version` and, when you ask it to
install, runs the Homebrew formula or the official script and shows the redacted log. If Homebrew is
absent it offers the script instead.

### 2. Sign in with an App Store Connect API key

1. Create a key at
   <https://appstoreconnect.apple.com/access/integrations/api> (Users and Access → Integrations →
   App Store Connect API). Note the **Key ID** and **Issuer ID**, and download the
   `AuthKey_XXXXXXXXXX.p8` once — Apple lets you download it only once.
2. Give the key a role that can do what you plan to do: Admin or App Manager for build upload,
   TestFlight and submission; a role with reports access (Admin, Finance, Sales, or Access to
   Reports) for sales. Apple enforces the key's role; the console reports refusals instead of
   bypassing them.
3. In the panel, enter the key id, issuer id and private-key path. Sign-in is panel-only: the model
   cannot do it, so the human owns the credential handoff. The Host runs:

   ```bash
   asc auth login --name "MyKey" --key-id "KEY_ID" --issuer-id "ISSUER_ID" --private-key "/path/to/AuthKey_KEY_ID.p8"
   ```

   `asc` stores the encrypted key material in the macOS Keychain, so the original `.p8` may be
   deleted afterwards. The key file must be readable only by you (`0600`); `asc` refuses an
   over-permissive file, and the panel shows the `chmod` that fixes it (or run
   `asc auth login --fix-permissions …` yourself).
4. Verify:

   ```bash
   asc auth status --output json
   asc auth doctor --output json
   ```

   The trigger turns to `asc: ready`.

Full journey, key roles and troubleshooting: [docs/ONBOARDING.md](docs/ONBOARDING.md).

## Configuration

Mirrors [docs/CONTRACT.md § Configuration](docs/CONTRACT.md); the row's `config` is read by the Host,
and values with the wrong type fall back to the safe default.

| key | default | meaning |
|---|---|---|
| `ascPath` | `asc` | Binary to run: bare name resolved on `PATH`, or an absolute path. |
| `profile` | `null` | Named `asc` auth profile passed as `--profile`; empty uses `asc`'s default. |
| `mode` | `read-only` | Refuses App Store Connect writes with `READ_ONLY_MODE`; set `write` to publish. Engine install and sign-in are local actions and work in `read-only`. |
| `requireApproval` | `true` | Ask the human before a tool-driven write; the panel's own writes use their confirm step. |
| `timeoutMs` | `60000` | Deadline for ordinary `asc` calls. |
| `longTimeoutMs` | `1800000` | Upper bound for the `run` timeout and the tool's execution budget. |
| `maxOutputBytes` | `262144` | Cap on any log or stdout text returned to the panel or the model. |
| `telemetryDisabled` | `true` | Runs `asc` with `ASC_TELEMETRY_DISABLED=1`. |
| `bypassKeychain` | `false` | Runs `asc` with `ASC_BYPASS_KEYCHAIN=1`; credentials go to a config file instead of the Keychain. Not recommended. |
| `defaultAppId` | `null` | App id used when an action omits `appId`. |
| `vendorNumber` | `null` | Your vendor number, from the App Store Connect Sales and Trends page URL; required for sales summaries. |

The panel stores the selected app id in `localStorage` under `dsh.asc-hub.v1.app` and the vendor
number under `dsh.asc-hub.v1.vendor`; the Host keeps no selection state.

## Security posture

- **No Apple ID password.** App Store Connect API keys sign JWTs; the console never asks for an
  Apple ID or a password, and there is no 2FA prompt to route through the plugin.
- **Credentials are created by the human, stored by `asc`.** The panel collects the API key id,
  issuer id and `.p8` path and hands them to `asc`, which stores encrypted key material in the macOS
  Keychain (or, with `bypassKeychain`, in a `0600` plaintext config file). The credential handoff is
  panel-only (`CLIENT_ONLY` to the model), so the model has no path to key material, and the plugin
  never reads or writes the Keychain.
- **Key material is never persisted, logged or echoed.** `auth.importKey` writes the PEM to a
  temporary file with mode `0600`, runs `asc auth login --private-key <tmp>`, and deletes it in a
  `finally` block. Before any text crosses the wire, the Host redacts private-key blocks, `ASC_*`
  credential assignments, `AuthKey_*.p8` paths and JWTs.
- **Read-only by default.** Every App Store Connect write is refused unless the row runs in
  `mode: write` *and* the call carries `input.confirm: true`; tool-driven writes additionally require
  a Host approval. Installing the engine and signing in are local actions, deliberately allowed in
  `read-only` so onboarding can finish.
- **The escape hatch is fenced.** The raw `run` action refuses `auth`, `web` and `install-skills`
  commands plus the mutating command families; in `mode: read-only` the child also runs with `asc`'s
  global `--read-only`, so it cannot change App Store Connect state.
- **Telemetry is off.** The plugin runs `asc` with `ASC_TELEMETRY_DISABLED=1` by default.

## Compatibility with `asc`

The plugin is built and verified against **`asc` 6.5.x** (6.5.3 at the time of writing). It reports
the version it finds and does not parse it into a feature map: each console operation documents the
`asc` command it runs, and the command surface is the compatibility contract. A patch upgrade of
`asc` is expected to keep working; if a flag is removed, the affected action fails with `ASC_FAILED`
and the redacted stderr naming the flag. Upgrading `asc` (`brew upgrade asc`, or re-running the
install script) gives every user new `asc` capabilities without a plugin release; capabilities the
console has not modeled yet arrive with the next plugin release. See
[docs/UPSTREAM-ASC.md](docs/UPSTREAM-ASC.md).

## Roadmap

- Month-period sales summaries and the raw Sales and Trends TSV export (`analytics sales`, whose
  `--output` is a file path).
- Streaming progress for uploads and waits (`asc status --watch` NDJSON, `builds wait
  --report-pending` resume contracts) instead of a single flipping `busy` operation.
- Report-instance drill-down for analytics (granularity and latest processing date live on reports,
  not on requests).
- More inherited surfaces: metadata, screenshots, pricing.
- Multiple accounts or teams (`asc --profile`) from one panel.

## License

The plugin is MIT licensed — see [LICENSE](LICENSE). The `asc` CLI is MIT licensed,
Copyright (c) 2026 Rudrank Riyam; it is installed separately and not bundled. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This project is independent and unofficial. It is not affiliated with, endorsed by, or sponsored by
Apple Inc. App Store Connect, TestFlight, Xcode Cloud, and Apple are trademarks of Apple Inc.
