# Onboarding

Two steps stand between a fresh install and a working console: install the `asc` engine, then connect
App Store Connect with an API key. The trigger in the session header tracks both — `asc: engine` →
`asc: login` → `asc: ready`.

Both onboarding steps are **local actions** (class `local-write` in the contract): they change this
machine, not App Store Connect. They work in the default `read-only` mode, so onboarding needs no
configuration change — `mode: write` is only required later, for publishing. Sign-in is
**panel-only**: the human enters the API key in the panel, and the model never handles it (a tool
call gets `CLIENT_ONLY`).

## Before you start

- macOS. Homebrew is optional; the official install script covers machines without it.
- An Apple Developer Program account with App Store Connect access.
- A network path to Apple's API endpoints.
- For the write capabilities: Admin or App Manager access on the team, or a key whose role carries
  the same rights.

## Step 1 — install the `asc` engine

The console detects the engine by resolving a binary and running `asc version` (no network, no
credentials). Resolution order:

1. the configured `ascPath`,
2. `asc` on `PATH`,
3. `/opt/homebrew/bin/asc`,
4. `/usr/local/bin/asc`,
5. `~/.local/bin/asc`.

If none resolves, the phase is `engine`, the trigger reads `asc: engine`, and the panel shows the
install step.

### Option A — Homebrew (recommended)

```bash
brew install asc
```

`asc` ships in Homebrew-core (`Formula/a/asc.rb`), so no tap is needed. The formula builds from
source. If you already have a conflicting package installed, Homebrew reports the conflict; remove
`asccli` first.

### Option B — official install script

```bash
curl -fsSL https://asccli.sh/install | bash
```

The script installs to `~/.local/bin` by default (`INSTALL_DIR` overrides it), verifies the release
checksum, and installs a self-contained Go binary. Two caveats:

- Put the install directory on `PATH` **before** starting Harness, because detection reads `PATH`.
  Alternatively set `ascPath` to the absolute path, e.g. `ascPath: /Users/you/.local/bin/asc`.
- Releases built with Go 1.27 require macOS 13 Ventura or later; on an older Mac, install an older
  compatible release or upgrade macOS.

### Verify

```bash
asc version
asc --help
```

Expected version output:

```text
6.5.3 (commit: unknown, date: unknown)
```

`asc` has no JSON version flag. The console parses the version from this line; `commit` and `date`
are `unknown` for source builds and are never used to gate features.

### What the console runs

| action | command |
|---|---|
| `engine.detect` | the resolved `asc version` |
| `engine.install` (`method: "brew"`) | `brew install asc` |
| `engine.install` (`method: "curl"`) | `curl -fsSL https://asccli.sh/install \| bash` |

`engine.install` is an explicit button, not a confirm-gated action: pressing it is the confirmation.
It is a local action, so it also runs in `read-only` mode. It runs with a 15-minute deadline and
shows the redacted install log. After either method, run `engine.detect` again to refresh the phase.

### If Homebrew is missing

The console refuses the brew method with `BREW_MISSING` and offers the script instead. Install
Homebrew from <https://brew.sh> if you prefer it, then retry.

## Step 2 — connect App Store Connect

### 2a. Create the API key

Open <https://appstoreconnect.apple.com/access/integrations/api> (Users and Access → Integrations →
App Store Connect API) and create a key.

You need:

- **Key ID** — shown in the key list; also part of the downloaded filename (`AuthKey_<KEY_ID>.p8`).
- **Issuer ID** — shown once at the top of the keys page. Required for team and enterprise keys.
  Individual keys have no issuer ID.
- **The private key file** — download it now. Apple allows the download exactly once; if it is lost,
  revoke the key and create another.
- **The right role.** Apple lets you choose the key's role; the key can do only what that role
  allows. Guidance:
  - build upload, TestFlight distribution and beta review, App Store submission: **Admin** or
    **App Manager**;
  - sales and analytics reports: **Admin**, **Finance**, **Sales**, or **Access to Reports**;
  - read-only inspection: any role that can see the app.

  The console does not hard-code roles. It surfaces Apple's refusal — a 401 or 403 is reported as
  `ASC_AUTH_MISSING` with the redacted message — so an under-scoped key fails at the operation, not
  silently. If a working key returns 403 on a write, widen the key's role.

### 2b. Hand the key to `asc`

The panel collects the three values and the Host runs, with flags verified against `asc auth login
--help`. This is a panel-only action: the model cannot sign in or out, so the credential handoff
always belongs to the human.

```bash
asc auth login \
  --name "MyKey" \
  --key-id "KEY_ID" \
  --issuer-id "ISSUER_ID" \
  --private-key "/path/to/AuthKey_KEY_ID.p8"
```

Flags the console can pass, and the manual equivalents:

| situation | flag |
|---|---|
| validate with a lightweight API request | `--network` (optional; login otherwise validates the JWT locally) |
| individual key (no issuer ID) | `--key-type individual`; an individual key has no issuer ID |
| enterprise key (Enterprise Program API) | `--key-type enterprise` |
| store in a config file instead of the Keychain | `--bypass-keychain` (`bypassKeychain` sets `ASC_BYPASS_KEYCHAIN=1`) |
| repair an over-permissive key file | `--fix-permissions` — an **upstream `asc` flag**; the console guides you to `chmod`, or run `asc auth login --fix-permissions …` yourself |

`--name` is optional on the very first login (`asc` stores it as `default`); once a profile exists,
`--name` is required and `asc` lists the existing profiles in its error.

There is also a drag-and-drop path (`auth.importKey`): the Host writes the PEM to a temporary file
with mode `0600`, runs `asc auth login --private-key <tmp>`, and deletes the file in a `finally`
block. The PEM is never persisted by the plugin, never logged, and never echoed back.

### 2c. Where the credentials go

`asc` owns credential storage. With the default storage it puts **encrypted key material in the macOS
Keychain** — `asc auth login --help` states that commands keep working even if the original `.p8` is
deleted. `asc auth status --output json` reports the backend:

```json
{ "storageBackend": "System Keychain", "storageLocation": "system keychain", "credentials": [] }
```

The plugin never reads or writes the Keychain. It passes the key path to `asc` once, keeps no copy,
and every later call runs `asc` with the profile it selected.

Two escape hatches with different security properties:

- `--bypass-keychain` / config `bypassKeychain: true` — credentials go to `~/.asc/config.json`
  (mode `0600`, but plaintext). Use it for CI or headless machines, not for a normal workstation.
- `--local` — repo-local `./.asc/config.json`. The console does not use this.

### 2d. The `.p8` permission rule

`asc` refuses a private key file that is group- or world-readable. The file must be `0600`
(readable only by the owner):

```bash
chmod 600 /path/to/AuthKey_KEY_ID.p8
```

The failure is `KEY_FILE_UNSAFE`; the panel shows the exact `chmod` that repairs it. If you prefer
`asc` to do it, run the login yourself with the upstream `--fix-permissions` flag:

```bash
asc auth login --fix-permissions --name "MyKey" --key-id "KEY_ID" --issuer-id "ISSUER_ID" \
  --private-key "/path/to/AuthKey_KEY_ID.p8"
```

The console itself never broadens permissions.

### 2e. Verify

```bash
asc auth status --output json
asc auth doctor --output json
```

Expect your profile in `credentials`, with the Keychain backend. `asc auth doctor` reports warnings
in its JSON payload but still exits `0`; the panel reads its `summary` and per-check `status` instead
of the exit code. When status shows a configured profile, the trigger turns to `asc: ready`.

Other profile operations the panel exposes:

```bash
asc auth switch --name "OtherKey"       # make a profile the default
asc auth logout --name "MyKey" --confirm # remove one profile (--confirm is required)
```

## If Homebrew fails

Homebrew can refuse to pour: its prefix may not be writable by your user, a tap may be
untrusted, or a half-finished keg can leave no `asc` binary behind. When the brew attempt
fails, the Host retries once through the project's official installer
(`curl -fsSL https://asccli.sh/install | bash`), which needs no `sudo`. The install log
then names the fallback (`fallback: true`, `fallbackReason: brew-failed`). If both
channels fail, the console shows both redacted logs and you can retry with the curl
method explicitly.

## Troubleshooting

Every onboarding failure maps to a stable code from [CONTRACT.md § Errors](CONTRACT.md). The
message shown in the panel is safe to share; `error.details.text`, when present, is `asc`'s stderr
after redaction.

| code | what happened | what to do |
|---|---|---|
| `ASC_NOT_INSTALLED` | No `asc` binary resolved in any of the five locations. | Install it (step 1). If you used the script, check `PATH` includes `~/.local/bin`, or set `ascPath` to the absolute path. Confirm with `command -v asc && asc version`. |
| `BREW_MISSING` | The brew install method was requested but no `brew` was found. | Choose the curl method, or install Homebrew from <https://brew.sh>, then retry. |
| `INSTALL_FAILED` (after fallback) | `brew install asc` or the install script exited non-zero. | Read the redacted log. Refresh Homebrew (`brew update`) or run the command by hand in a terminal to see the full output; check network access to `asccli.sh` / GitHub releases. |
| `ASC_AUTH_MISSING` | `asc` has no usable credentials (exit code 3, or Apple answered 401/403). | Run step 2 again. Check `asc auth status --output json`; if the profile exists but is stale, `asc auth logout --name "MyKey" --confirm`, then log in again. A 403 on an otherwise valid key means the key's role is too narrow. |
| `ASC_AUTH_FAILED` | `asc auth login` rejected the key. | Re-check Key ID and Issuer ID against the App Store Connect keys page. Team keys need the issuer ID; individual keys need `--key-type individual` and no issuer. Confirm the key has not been revoked or expired, and that the `.p8` matches the key id in its filename. Retry with `--network` to see the API-side rejection. |
| `KEY_FILE_UNSAFE` | The `.p8` is readable by other users. | `chmod 600 "<path>"`, or run `asc auth login --fix-permissions …` yourself. |
| `TIMEOUT` | The child process exceeded its deadline (`timeoutMs`, or the fixed 15-minute install deadline). | Check the network and retry. A slow link can justify raising `timeoutMs`. An install interrupted mid-way may need `brew install asc` re-run manually. |
| `ASC_FAILED` | Non-zero exit that no better code covers. | Read the redacted stdout/stderr; `asc` prefixes errors with `Error: <command>: <message>` and often appends a `Hint:` line with the command that fixes it. A 403 from Apple usually means the key's role is too narrow. |

## What the console never does

- It never asks for the Apple ID password or an Apple ID at all; API keys are the only sign-in path.
- It never reads, copies or writes the Keychain entry that `asc` created.
- It never persists, logs or echoes private key material, and it redacts `AuthKey_*.p8` paths and
  JWTs before any text reaches the panel or the model.
- It never installs anything without an explicit request (`engine.install`), and never runs a
  mutating App Store operation without `mode: write` plus a confirmation.
- The model cannot sign the user in or out: the credential actions are panel-only (`CLIENT_ONLY`).
