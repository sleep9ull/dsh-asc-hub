# Upstream: `asc` as an inherited engine

`dsh-asc-hub` is a console around the open-source
[App Store Connect CLI](https://github.com/rorkai/App-Store-Connect-CLI) (`asc`). The architectural
decision that shapes the whole product is that the plugin **inherits** `asc`: it installs the CLI,
runs it as an external program, and reads its output. It does not fork, vendor, patch or absorb it.

## The boundary

| | `asc` owns | this plugin owns |
|---|---|---|
| Protocol | App Store Connect API calls, JWT signing, upload protocol, pagination | nothing protocol-level |
| Credentials | API key storage, Keychain access, profiles, token refresh | asking for key id / issuer / path and handing them to `asc` |
| Command surface | every command, flag, JSON shape and exit code | choosing which commands to run and how to present the result |
| Safety | `--read-only`, `--confirm`, `--dry-run`, redaction of secrets in its own output | the console's mode, confirm step, approval prompt, output redaction, error classification |
| Updates | shipping new capabilities | modeling new capabilities in the console |

The plugin's work starts where `asc`'s output begins: it classifies exit codes, maps stderr to stable
error codes, redacts secrets on the way out, derives the Hub phase, and turns JSON into panel state.

## Why inherit instead of fork

- **The protocol is the moving part.** Apple changes endpoints, roles and report formats. Forking
  would freeze a copy of that surface and put the maintenance on this project. Inheriting puts it on
  `asc`, which is maintained for exactly this.
- **Credentials must have one owner.** `asc` already stores API keys in the macOS Keychain and knows
  how to sign requests. A second implementation would mean a second key store, a second permission
  model and a second place to leak key material. The plugin never touches key material after login.
- **Upgrades reach users for free.** `brew upgrade asc` upgrades the engine behind the console. New
  `asc` commands need no plugin release to exist; they need one only to get a dedicated card.
- **Smaller trust surface.** This repository contains no App Store Connect API client, no crypto, no
  upload code. It contains a console and a process runner, which is what can be reviewed here.

## How the two compose

For every operation the Host:

1. validates the action's input,
2. applies the console gates (mode, confirmation, approval),
3. spawns the resolved `asc` binary with an argv array — never a shell string — plus the configured
   profile, environment (`ASC_TELEMETRY_DISABLED`, optionally `ASC_BYPASS_KEYCHAIN`, `ASC_READ_ONLY`
   in read-only mode) and, for `engine.install` only, the upstream project's own shell installer,
4. decides the exit status: `0` success, `3` missing credentials, `2` usage error, `1` failure,
   `6` a mutating request refused by `--read-only`, `7` a wait that is still pending,
5. redacts secrets from stdout/stderr/logs, and
6. returns the contract envelope.

The exact commands behind each console capability are listed in
[OPERATIONS.md](OPERATIONS.md). They are ordinary `asc` invocations that a person could
type by hand; that is deliberate, and it is why the console can always be debugged from a terminal.

## Compatibility and version policy

- **Verified against `asc` 6.5.x** (6.5.3 at the time of writing). That is the version whose command
  surface the operations in this repository were checked against with `asc <group> --help`.
- **Commands are the contract, not the version string.** The plugin reads `asc version` to show the
  engine state, but it does not maintain a version → feature map. It runs the documented command; if
  the flag was removed upstream, the action fails with `ASC_FAILED` and the redacted stderr names the
  offending flag.
- **Patch upgrades are expected to be safe.** `asc` releases frequent patches; nothing in the console
  pins an exact patch version.
- **Minor/major drift is verified before release.** When a new `asc` minor ships, re-run the help
  checks for the commands in [OPERATIONS.md](OPERATIONS.md); if a flag moved, the console's
  command table changes in a plugin release, not in a user's terminal.
- **A missing engine is reported, not hidden.** If `asc` is absent the phase is `engine` and the
  panel shows the install step. If the version line cannot be parsed, the console still works and
  shows the version as unknown; nothing gates on the version string.

## How an `asc` upgrade reaches users

Users own the engine, so upgrades are theirs to make:

```bash
brew update && brew upgrade asc     # Homebrew
curl -fsSL https://asccli.sh/install | bash   # script-managed installs
asc version                         # confirm; the console re-reads it
```

The console picks up the new binary on the next detection (`engine.detect`) and the next operation.
Capabilities that the console already models keep working because the underlying command names are
stable; new read-only capabilities are reachable through the `run` escape hatch until they get a
card in a plugin release, and new mutating ones wait for a typed action.

## What we refuse to reimplement

These stay in `asc`, permanently:

- JWT creation and request signing for App Store Connect.
- API key storage and Keychain integration.
- The upload protocol (presigned URLs, chunking, commit) and build processing polling.
- App Store Connect resource schemas, pagination and error envelope parsing.
- The Sales and Trends / finance report formats (gzip TSV, fiscal calendars, regions).
- `--read-only`, `--confirm`, `--dry-run` semantics.

The plugin also refuses to vendor a copy "just in case": a bundled binary would go stale silently and
would make this project the distributor of a third-party product.

## License boundary

`asc` is MIT licensed, Copyright (c) 2026 Rudrank Riyam. The CLI is **not bundled** with this plugin;
it is installed separately and invoked as an external program. The MIT text and the exact copyright
line are reproduced in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The plugin itself is MIT
licensed — see [LICENSE](../LICENSE).

Neither project is affiliated with Apple Inc. App Store Connect, TestFlight, Xcode Cloud, and Apple
are trademarks of Apple Inc.
