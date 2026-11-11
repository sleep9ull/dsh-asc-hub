<p align="center">
  <img src="https://raw.githubusercontent.com/sleep9ull/dsh-asc-hub/main/icon.svg" width="88" alt="dsh-asc-hub icon">
</p>

<h1 align="center">dsh-asc-hub</h1>

<p align="center">
  <strong>The App Store Connect console inside DeepSeek Harness.</strong><br>
  Build the session's working directory, ship it to TestFlight, submit it for review, release it —
  in the side panel, next to the code that built it.
</p>

<p align="center">
  English | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.zh.md">简体中文</a> | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ko.md">한국어</a> | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.md#requirements"><img alt="DSH" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsleep9ull%2Fdsh-asc-hub%2Fmain%2Fpackage.json&query=%24.engines.dsh&label=DSH&style=flat-square&color=4c6ef5&labelColor=454a54"></a>
  <a href="https://nodejs.org/"><img alt="Node" src="https://img.shields.io/node/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=Node&logo=node.js&logoColor=white&color=339933"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/tsconfig.json"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&color=263146"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/sleep9ull/dsh-asc-hub?style=flat-square&color=4b6fff"></a>
  <a href="https://www.npmjs.com/package/@sleep9ull/dsh-asc-hub"><img alt="npm" src="https://img.shields.io/npm/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=npm&color=cb3837"></a>
</p>

<p align="center">
  <b>Engine:</b> <a href="https://github.com/rorkai/App-Store-Connect-CLI"><code>asc</code></a> — the open-source App Store Connect CLI by Rudrank Riyam.<br>
  Installed and run as an external program, never bundled, vendored or forked.
</p>

<div align="center">

[Overview](#overview) · [Installation](#installation) · [Features](#features) ·
[Workflow](#workflow) · [Onboarding](#onboarding) · [Requirements](#requirements) ·
[Security](#security) · [Configuration](#configuration) · [Development](#development) ·
[Limitations](#limitations) · [Documentation](#documentation)

</div>

## Overview

Most of shipping an iOS app is not writing it. It is archiving the thing you just built, uploading it,
picking the right build for the right TestFlight group, writing what testers should look at, waiting
for App Review, and then releasing it. That work happens in Xcode Organizer, a browser tab and a
terminal, usually minutes after the agent finished the code.

`dsh-asc-hub` puts that half in the Harness side panel, in the order it happens. It **inherits
[`asc`](https://github.com/rorkai/App-Store-Connect-CLI) as an external engine** — installs it, runs
it, reads its output — and owns the console, the state machine and the safety rails. It never forks,
vendors or re-implements the CLI, so upgrading `asc` upgrades the product.

Two doors, one dispatcher: the panel and the `asc_hub` model tool call the same Host operations, so
they share classification, gating and redaction.

> **Version 0.1.1** — verified against DeepSeek Harness 0.2.2-rc.1 and `asc` 6.5.3.

## Installation

The plugin installs through the Harness's own plugin manager — no `git clone`, no shell step, no
tarball to fetch:

### Plugins → Add plugin

Open **Plugins → Add plugin**, paste the spec and confirm:

```
@sleep9ull/dsh-asc-hub
```

Pin a version with `@sleep9ull/dsh-asc-hub@0.1.1`. From then on **Plugins → Installed → Versions**
owns updates.

Then enable the `asc-hub` row (it is titled **App Store Connect Hub** in the Plugin Manager) and open
the **ASC Hub** tab in the right sidebar.

> The Desktop app's own profile is managed by the app. Installing into `profiles/<name>` from a shell
> may report success and still not appear in the app — install through the app's Plugins page.

## Features

| Section | What it does | The `asc` behind it |
|---|---|---|
| **App & Bundle** | picks the app, remembers it per browser | `asc apps list` |
| **Working directory** | where the session works: path, branch, drift from `origin/main`, uncommitted files, and whether this checkout **can build** — with the reason when it cannot | `git status --porcelain=v1 --branch`, `xcode-select -p` |
| **Build** | archives the code in the session's working directory, exports the `.ipa`, uploads it; version and build number are two fields | `asc xcode archive` → `asc xcode export` → `asc builds upload --wait` |
| **Builds** | newest builds three at a time, a fixed row for the release build, `Internal` / `External` / `Release` tags | `asc builds list` |
| **TestFlight** | pick a build, pick groups, write *What to Test*, send | `asc builds test-notes create`, `asc builds add-groups` |
| **Review** | pick a build; `Reviewed` if its version already shipped, otherwise readiness, blockers and `Submit for review` | `asc validate`, `asc versions create`, `asc review submit` |
| **Release** | release a version App Review already approved | `asc versions release` |
| **Skills** | reports the inherited `asc` skill pack and installs it on request | `asc install-skills` |

Plus the things the panel does not draw but the model can use: sales summaries, analytics report
requests, raw read-only `asc` argv through a fenced escape hatch, and every panel action through the
`asc_hub` tool.

A few decisions worth knowing:

- **Build builds the directory, not a file you pick.** The unit of work is the code the session is
  looking at; artifacts go to a temporary directory, and the version travels as a build setting
  (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`) so your project file is never rewritten.
- **A build that never went to review does not claim it did.** App Review applies to a version, so
  the panel asks which version carries a build: TestFlight-only builds are correctly "not submitted".
- **One refresh button** re-reads every section; each step owns its own build menu, because sending
  to testers and submitting for review are different decisions about the same list.

## Workflow

```
working directory  →  Build  →  Builds  →  TestFlight  →  Review  →  Release
     can it build?   archive    pick one     send it      submit     ship it
                     export                 to groups     to Apple   to the store
                     upload
```

Every step is a real `asc` call, gated the same way whether the panel or the model starts it.

## Onboarding

Both steps are **local actions** and work in the default `read-only` mode — only App Store Connect
publishing needs `mode: write`.

**1. Install the `asc` engine.** The panel detects it (`asc version`), then installs it through
Homebrew (`brew install asc`) or the official script (`curl -fsSL https://asccli.sh/install | bash`)
and shows the redacted log.

**2. Sign in with an App Store Connect API key.** Create a key at
[App Store Connect → Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api),
note the **Key ID** and **Issuer ID**, download `AuthKey_XXXXXXXXXX.p8` once, and drop it on the panel
with the two ids. The Host writes the PEM to a private `0600` file, hands it to
`asc auth login --private-key …`, and deletes it — `asc` keeps the credential in the macOS Keychain.
Sign-in is **panel-only**: the model gets `CLIENT_ONLY`, so the human owns the credential handoff.

The key's role decides what you can do (Admin or App Manager for upload, TestFlight and submission;
reports access for sales). Apple enforces it; the console reports refusals instead of working around
them. Full journey and troubleshooting: [docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md).

## Requirements

| | |
|---|---|
| **Host** | DeepSeek Harness with plugin support, `>=0.2.2-rc.1 <0.3.0` (declared in `engines.dsh`; the Plugin Manager refuses an incompatible host) |
| **Node** | 22 or newer |
| **OS** | macOS — the Keychain holds the credential, and Build needs Xcode |
| **Build** | a full Xcode (`xcode-select -p` must point at `Xcode.app/Contents/Developer`); with Command Line Tools alone the panel says *cannot build: Xcode is not installed* and everything else still works |
| **Engine** | `asc` 6.5.x, detected at runtime; the command surface is the compatibility contract ([docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md) |
| **Account** | an Apple Developer Program membership with App Store Connect access |

## Security

- **No Apple ID password, ever.** App Store Connect API keys sign JWTs; there is no password or 2FA
  to route through a plugin.
- **Key material never persists, logs or echoes.** The PEM lives in a `0600` temp file that is deleted
  in a `finally`; every outbound string is redacted (private-key blocks, `ASC_*` assignments,
  `AuthKey_*.p8` paths, JWTs), and ids are shortened to their last four characters.
- **Read-only by default.** Every App Store Connect write needs `mode: write` *and*
  `input.confirm: true`, plus a Host approval when the model starts it. Installing the engine and
  signing in are deliberately allowed in `read-only` so onboarding can finish.
- **The escape hatch is fenced.** The raw `run` action refuses `auth`, `web` and `install-skills`
  plus the mutating command families, and in `read-only` the child runs with `asc --read-only`.
- **Telemetry is off.** `asc` runs with `ASC_TELEMETRY_DISABLED=1` by default.
- **The panel path never writes the session log or model history** — it is a Fetch route, not a
  session command.

## Configuration

The row's `config` is read by the Host; values with the wrong type fall back to the safe default.
Mirrors [docs/CONTRACT.md § Configuration](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md).

| key | default | meaning |
|---|---|---|
| `ascPath` | `asc` | Binary to run: a bare name resolved on `PATH`, or an absolute path. |
| `profile` | `null` | Named `asc` auth profile passed as `--profile`; empty uses `asc`'s default. |
| `mode` | `read-only` | Refuses App Store Connect writes with `READ_ONLY_MODE`; set `write` to publish. |
| `requireApproval` | `true` | Ask the human before a tool-driven write; the panel's own writes use their confirm step. |
| `timeoutMs` | `60000` | Deadline for ordinary `asc` calls. |
| `longTimeoutMs` | `1800000` | Upper bound for the `run` timeout and the tool's execution budget. |
| `maxOutputBytes` | `262144` | Cap on any log or stdout text returned to the panel or the model. |
| `telemetryDisabled` | `true` | Runs `asc` with `ASC_TELEMETRY_DISABLED=1`. |
| `bypassKeychain` | `false` | Runs `asc` with `ASC_BYPASS_KEYCHAIN=1`; credentials go to a config file instead of the Keychain. Not recommended. |
| `defaultAppId` | `null` | App id used when an action omits `appId`. |
| `vendorNumber` | `null` | Your vendor number from the Sales and Trends URL; required for sales summaries. |

> `mode` has two paths. The `read-only mode` / `write mode` pill in the panel footer is the switch: it
> flips **this session only** (`mode.set`, nothing written to disk). To keep it for the next start, set
> the row's `config.mode` to `write` in the Plugin Manager, or override it in the profile's
> `cordis.patch.yml` — the plugin never rewrites the profile patch itself.

The panel keeps the selected app id in `localStorage` (`dsh.asc-hub.v1.app`); the Host holds no
selection state.

## Development

The code is TypeScript. Two `tsc` projects build `dist/`: the Host as ESM with declarations, the
client as a single script (`module: none`) — the one file the Harness module loader evaluates.

```
src/index.ts            Host entry: apply(ctx, config)
src/host/*.ts           config, exec, asc seam, engine, auth, ops, dispatch, rpc, tool, skills,
                        workspace, build, redact, and types.ts (the surface DSH does not publish)
src/client.ts           the panel: trigger, onboarding, console
test/*.ts               host tests, compiled and run against dist/
client/__smoke__.mts    the client harness: loads dist/client.js the way the loader does
```

```sh
npm run build      # dist/ (host + client)
npm run check      # tsc --noEmit on all four projects
npm test           # 61 host tests against dist/
npm run smoke      # 248 client checks against dist/client.js
npm run verify     # all of the above
```

To run your checkout inside the Harness, `plugin_manager` → `install_bundle` with this directory's
absolute path: that is a `link:` install, kept for development and deliberately not updatable in
place. Editing `src/**` then needs `npm run build` before the panel sees it, and the Host half
additionally needs the row reinstalled so its module generation reloads. Conventions, invariants and the module map:
[AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md), [docs/ARCHITECTURE.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ARCHITECTURE.md),
[docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md).

## Limitations

- **Build needs a full Xcode.** Without it the panel reports `cannot build` with the reason and the
  rest of the console keeps working.
- **Sales and analytics have Host actions but no card yet.** `sales.summary` and
  `analytics.reports` are implemented and available to the model; the panel cards are parked.
- **No month-period sales and no raw TSV export** (`analytics sales --output` is a file path).
- **Uploads and waits are one flipping `busy` state**, not streamed progress.
- **The footer's update tag is inert**: `status.update` is a constant, and **Plugins → Installed**
  owns the notice and the action.
- **No screenshots in this file on purpose.** The panel renders with the Harness theme; a static
  image would go stale faster than this text.

## Documentation

| | |
|---|---|
| [docs/CONTRACT.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md) | the wire contract: transport, actions, gating, Hub state, error codes, redaction, configuration — authoritative |
| [docs/ARCHITECTURE.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ARCHITECTURE.md) | the pipeline, the module map, the build |
| [docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md) | engine, API key, key roles, troubleshooting |
| [docs/OPERATIONS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/OPERATIONS.md) | what each console action runs and how to read its output |
| [docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md) | what is inherited from `asc` and how upgrades flow |
| [docs/RELEASING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/RELEASING.md) | distribution, discovery, upgrade matrix, listing checks |
| [docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md) | the day-to-day loop: when to build, bump, release |
| [AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md) | invariants and the module map, for agents working in this repo |

## License

The plugin is MIT licensed — see [LICENSE](https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE). The `asc` CLI is MIT licensed, Copyright (c)
2026 Rudrank Riyam; it is installed separately and not bundled — see
[THIRD_PARTY_NOTICES.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/THIRD_PARTY_NOTICES.md).

This project is independent and unofficial. It is not affiliated with, endorsed by, or sponsored by
Apple Inc. App Store Connect, TestFlight, Xcode Cloud and Apple are trademarks of Apple Inc.
