# `asc` CLI research — for building a product UI on top of it

Research date: 2026-11-09
Binary under test: `/opt/homebrew/bin/asc` — `6.5.3 (commit: unknown, date: unknown)`
Upstream: <https://github.com/rorkai/App-Store-Connect-CLI> (MIT)

## Verification legend

| Mark | Meaning |
| --- | --- |
| ✅ | **Verified locally** by running a read-only `asc ... --help` / informational command and copying its output. |
| 📄 | **Verified from upstream source/docs** (README, LICENSE, `website/src/content/docs/*.mdx`, Homebrew formula, GitHub API). |
| ⚠️ | **Not verified.** Called out because the UI must not assume it. |

### What could not be verified, and why

The machine has **no stored credentials**:

```
$ asc auth status --output json
{"storageBackend":"System Keychain","storageLocation":"system keychain","credentials":[],
 "environmentCredentialsProvided":false,"environmentCredentialsComplete":false}
```

No mutating command was run (per instruction), so `asc auth login` was never executed.
Consequence: **the exact JSON payload shape of every authenticated App Store Connect
command (`apps list`, `status`, `builds list`, `validate`, `analytics sales`, …) could
not be observed live.** Where that matters the shape below is derived from
(a) `--help` text, which documents some field names verbatim, and (b) the documented
API resources the command wraps — and each such shape is marked ⚠️.

Two more things that stayed unverified:

- **Keychain service name.** `asc auth status` reports the backend as `"System Keychain"`
  ✅ but never prints the service/account labels. The literal `App-Store-Connect-CLI`
  appears in the binary next to keychain strings (`Removing keychain item service=%q, account=%q, keychain %q`),
  which strongly suggests that is the service name. Treat as high-confidence, ⚠️ unverified.
- **Exit code 6** (`ASC_READ_ONLY` refusal) and **exit code 7** (`--until` pending).
  Both are documented in help text ✅ but were not triggered, because triggering them
  requires issuing a mutating command.

---

## 1. Global conventions

### 1.1 Command surface

`asc --help` ✅ groups subcommands into:

| Section | Groups |
| --- | --- |
| Getting started | `auth`, `doctor`, `install-skills`, `init`, `docs` |
| Web session | `web` (Apple Account session: app creation, finance transaction-tax, privacy, api-keys…) |
| Analytics & finance | `analytics`, `ads`, `optimize`, `insights`, `finance`, `performance` |
| App management | `apps`, `app-setup`, `app-tags`, `versions`, `localizations`, `metadata`, `screenshots`, `video-previews`, `asset-library`, `background-assets`, `product-pages`, `routing-coverage`, `pricing`, `pre-orders`, `categories`, `age-rating`, `accessibility`, `encryption`, `eula`, `agreements`, `app-clips`, `android-ios-mapping`, `marketplace`, `alternative-distribution`, `nominations`, `game-center` |
| TestFlight & builds | `testflight`, `builds`, `build-bundles`, `build-localizations`, `xcode`, `distribute`, `ipa-info`, `pkg-info`, `sandbox` |
| Review & release | `release`, `status`, `release-notes`, `review`, `reviews`, `submit`, `validate`, `publish` |
| Monetization | `iap`, `storekit`, `app-events`, `subscriptions` |
| Signing | `signing`, `bundle-ids`, `certificates`, `profiles`, `merchant-ids`, `pass-type-ids`, `notarization` |
| Team & access | `account`, `users`, `actors`, `devices` |
| Automation | `workflow`, `webhooks`, `xcode-cloud`, `notify`, `migrate` |
| Utility | `system-status`, `diff`, `capabilities`, `search`, `snitch`, `version`, `completion`, `schema`, `api`, `telemetry` |

Direct quote from the root help (worth mirroring in the UI's empty/discovery states):

```
  Add --help to any command; replace placeholders like APP_ID with real values.
  Any flag that takes a value accepts @env:NAME or @file:PATH; escape a literal @ as @@.
  --output and the root --profile, --report, --report-file are read literally.
```

### 1.2 Root flags (all of them) ✅

```
  --api-debug    Enable HTTP debug logging to stderr (redacts sensitive values)
  --debug        Enable debug logging to stderr
  --profile      Use named authentication profile (accepted before or after the command name)
  --read-only    Refuse every mutating request (POST/PATCH/PUT/DELETE) before it is sent;
                 ASC_READ_ONLY=1 has the same effect (default: false)
  --report       Report format for CI output (e.g., junit)
  --report-file  Path to write CI report file
  --retry-log    Enable retry logging to stderr (overrides ASC_RETRY_LOG/config when set)
  --strict-auth  Fail when credentials are resolved from multiple sources (default: false)
  --version      Print version and exit (default: false)
```

**Flag-position rule (important, easy to get wrong).** Root flags must come *before* the
command name; `--profile` is the only exception. Verified error:

```
$ asc apps list --report junit
Error: unknown flag `--report` for `asc apps list`
`--report` is a global flag; the flag and any required valid value must appear before the command name.
[exit 2]
```

`asc --report junit --report-file /tmp/asc-report.xml apps list` does work and writes:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="asc" tests="1" failures="1" skipped="0" errors="0" time="0.005"
  timestamp="2026-11-09T13:44:02+08:00"><testcase name="asc apps list"
  classname="asc apps list" time="0.005"><failure message="apps: missing authentication. …"
  type="ERROR"></failure></testcase></testsuite>
```

Note: **there is no root-level `--output`, `--timeout`, or `--json`.** ✅
`asc --version --output json` → `Error: unknown flag '--output' for 'asc'`, exit 2.

### 1.3 `--output` formats

Per-command, not global. Every data command declares it:

```
  --output   Output format: json, table, markdown (default: json)
  --pretty   Pretty-print JSON output (default: false)
```

- Available formats: **`json`, `table`, `markdown`**. No `yaml`, no `ndjson` (except `--watch`, §6.4).
- Format **defaults are TTY-aware** 📄: `table` in an interactive terminal, `json` when
  piped / non-interactive. Since a UI will always pipe, the effective default is `json`
  — but **pass `--output json` explicitly** anyway, since a pseudo-TTY can flip it.
- `ASC_DEFAULT_OUTPUT` pins the default globally 📄 (`json|table|markdown`).
- `--pretty` is only valid with JSON ✅.
- **Trap:** on the report-download commands `--output` is a *file path*, and the metadata
  format moved to `--output-format`:
  - `asc analytics sales … --output "reports/daily_sales.tsv.gz" --output-format json`
  - `asc finance reports … --output "reports/finance.tsv.gz" --output-format json`
  ✅
- Some commands have no output flag at all: `asc version`, `asc auth login`, `asc auth switch`,
  `asc auth token`, `asc install-skills`, `asc auth doctor` (its flag is `--output text|json`,
  default `text`, **not** table/json/markdown) ✅.

**JSON envelope is not uniform** ✅ — the UI must parse defensively:

| Command | Top-level JSON |
| --- | --- |
| `asc docs list` | bare array `[{slug,description},…]` |
| `asc auth status` | object |
| `asc search` | `{query,count,results:[…]}` |
| `asc capabilities` | `{summary:{…},capabilities:[…]}` |
| `asc system-status` | `{source,summary,services:[…]}` |
| `asc schema` | bare array |

List commands with `--paginate` aggregate into one payload; `asc api --paginate` explicitly
"print[s] one merged collection envelope", i.e. Apple's `{data,links,meta}` shape ✅.

### 1.4 Pagination ✅

Every list command carries the same trio:

```
  --limit     Maximum results per page (1-200) (default: 0)
  --next      Fetch next page using a links.next URL
  --paginate  Automatically fetch all pages (aggregate results) (default: false)
```

Details that matter for a UI:

- `--limit 0` means "use the command's own default", not "no results".
- With `--paginate`, several commands switch to a fixed page size of **200** and ignore
  `--limit` as page size (`testflight groups list`: *"Explicit --paginate uses a page size
  of 200 instead of --limit"*). In the stable app-scoped `--internal/--external` aggregate,
  `--limit` caps the *final* result set instead. ✅
- `--next` URLs already encode their query, so some commands reject combining `--next` with
  query-shaping flags ✅.
- For a responsive UI, prefer manual `--limit` + `--next` loops so you can stream pages,
  and reserve `--paginate` for one-shot exports.

### 1.5 `--profile` ✅

```
  --profile   Use named authentication profile (accepted before or after the command name)
```

Semantics from `asc auth --help` ✅:

```
  - --profile or ASC_PROFILE selects a stored profile and disables the env-only fast path.
  - With no profile and keychain bypass disabled, a complete environment set skips stored lookup.
  - After stored selection succeeds, environment variables can fill eligible missing fields.
  - ASC_BYPASS_KEYCHAIN skips keychain; env fallback follows only missing/default-selection config errors.
```

Profiles are created by `asc auth login --name NAME`, made default by `asc auth switch --name NAME`.
Mixed-source credentials produce a warning unless `--strict-auth` is set.

### 1.6 `--report` / `--report-file`

`--report junit` (the only documented value) writes a JUnit XML `<testsuite>` for the whole
invocation to `--report-file`, including failures ✅ (sample above). Useful if the UI also
drives CI; not useful for interactive UI rendering.

### 1.7 `@env:` / `@file:` value indirection ✅

Any flag that takes a value accepts:

- `@env:NAME` → value of environment variable `NAME`
- `@file:PATH` → file contents (also `@-`… only for `asc api --body`; `@file:` itself takes a path)
- `@@x` → literal `@x`

Verified failures (both to stderr, exit **2**):

```
$ asc builds list --app "@env:NO_SUCH_VAR"
Error: --app: environment variable NO_SUCH_VAR is not set
$ asc builds list --app "@file:/tmp/nope.txt"
Error: --app: cannot read file /tmp/nope.txt: file does not exist
```

Exceptions: `--output`, root `--profile`, `--report`, `--report-file` are **read literally**.

UI use: never interpolate IDs into a shell string; write JSON bodies/IDs to a temp file and
pass `@file:` (or `--body-file` for `asc api`). This kills a class of injection and
quoting bugs.

### 1.8 Exit codes

| Code | Meaning | Evidence |
| --- | --- | --- |
| `0` | success (also `skipped` idempotent outcomes) | ✅ |
| `1` | runtime/business failure: API error, missing local file, validation `--strict`, rejected review, `--until` reaching a rejected state | ✅ (`apps public view --app 999999999999` → `Error: apps public view: app not found: 999999999999`, exit 1); `builds upload --ipa /missing.ipa` → exit 1 |
| `2` | usage error: unknown command/subcommand, unknown flag, missing required flag, invalid enum value, unreadable `@file:`/unset `@env:` | ✅ |
| `3` | **authentication failure** | ✅ |
| `6` | `--read-only` / `ASC_READ_ONLY` refused a mutating request | ⚠️ documented in `asc docs show reference`: *"ASC_READ_ONLY — Refuse every mutating request; refusals exit `6`"* |
| `7` | wait ended while still pending (`--until`, `builds wait --report-pending`) | ⚠️ documented in `asc status --help` / `asc builds wait --help` |

Exact auth-failure output ✅ (stdout empty, everything on stderr):

```
$ asc apps list --output json ; echo $?
Error: apps: missing authentication. Run 'asc auth login' or create /Users/you/.asc/config.json (see 'asc auth init')
Hint: Run `asc auth status` to see configured credentials. To add an API key, create one at
https://appstoreconnect.apple.com/access/integrations/api and run `asc auth login --name MyKey
--key-id KEY_ID --issuer-id ISSUER_ID --private-key /path/to/AuthKey_KEY_ID.p8`
(or set ASC_KEY_ID/ASC_ISSUER_ID/ASC_PRIVATE_KEY_PATH).
3
```

**Error model for the UI:** there is **no JSON error object**. Errors are always human
prose on stderr, prefixed `Error: <command path>: <message>`, optionally followed by
`Hint:` lines. Machine-readable signal = **exit code only**. So:

- `exit 3` → show "Sign in / reconnect API key" with the API-key page link.
- `exit 2` → developer error; surface stderr verbatim (it names the exact flag).
- `exit 1` → show the stderr message; parse `<command path>:` prefix for subject.
- Treat any non-empty stderr on exit 0 as warnings to display.

Nice touch to mirror: unknown-subcommand errors include a task-oriented hint block ✅

```
$ asc auth capabilities
Error: unknown command `asc auth capabilities`
Common tasks:
  check credentials  asc auth status
  diagnose problems  asc auth doctor
  switch profile     asc auth switch --name PROFILE
  store an API key   asc auth login --name NAME --key-id KEY_ID --issuer-id ISSUER_ID --private-key KEY_PATH
```

and wrong-level flags get a "did you mean a subcommand" list ✅

```
$ asc builds --output json
Error: unknown flag `--output` for `asc builds`
Did you mean a subcommand? These accept `--output`: list, count, next-build-number, wait, info,
expire, expire-all, upload, update, add-groups, remove-groups, dsyms, compile, package
```

### 1.9 `--json` alternative

There is **no `--json` flag** anywhere. ✅ `asc version --json` → `Error: unknown flag '--json' for 'asc version'`, exit 2.
The only machine-readable switch is `--output json` (plus `--pretty`).

### 1.10 `asc docs` ✅

```
$ asc docs list
[{"slug":"api-notes","description":"API quirks: date formats, finance reports, sandbox testers"},
 {"slug":"reference","description":"Repo-local ASC quick reference (also available via 'asc init')"},
 {"slug":"workflows","description":"Task-based workflow recipes for release, TestFlight, and Xcode flows"},
 {"slug":"third-party-notices","description":"Licenses for native dependencies included in release binaries"}]
```

- `asc docs show <slug>` — huge (thousands of lines), plain text/markdown to stdout, no `--output` variants.
- `asc docs init [--path ./ASC.md] [--force] [--link=false]` — writes `ASC.md` into the repo
  (also reachable as `asc init`). **Mutates the repo; do not call from the UI.**
- `asc docs show api-notes` is the single best source for "why did Apple reject this" quirks
  (date formats, finance regions, `Z1`, web-session-only gaps). Worth bundling into the UI's help.

---

## 2. Installation, engine, version detection

### 2.1 How it is installed here ✅

```
$ brew info asc
==> asc: stable 6.5.3 (bottled), HEAD
Fast, lightweight CLI for App Store Connect
https://asccli.sh
Conflicts with:
  asccli (because both install `asc` binaries)
Installed (on request)
From: https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/a/asc.rb
License: MIT
```

It is a **single static Go binary** (no Node, no Python, no runtime deps) at
`/opt/homebrew/bin/asc`, 61.3 MB.

### 2.2 Official install commands 📄

```bash
# Homebrew (recommended) — official homebrew-core formula, NO tap needed
brew install asc

# optional: the project's own tap (binary download instead of source build)
brew install rorkai/tap/asc

# install script (macOS/Linux)
curl -fsSL https://asccli.sh/install | bash

# custom install dir
INSTALL_DIR="$HOME/bin" curl -fsSL https://asccli.sh/install | bash

# Windows
winget install asc
winget install --id Rorkai.ASC --exact

# from source
git clone https://github.com/rorkai/App-Store-Connect-CLI.git && cd App-Store-Connect-CLI && make build && make install
```

**Exact formula/tap facts** (verified via GitHub API, 📄):

- `Homebrew/homebrew-core` → `Formula/a/asc.rb`, class `Asc < Formula`, `homepage "https://asccli.sh"`,
  `license "MIT"`, `url "https://github.com/rorkai/App-Store-Connect-CLI/archive/refs/tags/6.5.3.tar.gz"`,
  **builds from source**: `depends_on "go" => :build` + `system "go", "build", *std_go_args(ldflags: "-X main.version=#{version}")`,
  plus `generate_completions_from_executable(bin/"asc", "completion", "--shell")`.
  It declares `conflicts_with "asccli"`.
- `rorkai/homebrew-tap` → `Formula/asc.rb`, subclass, `version '6.5.3'`, downloads
  `https://github.com/rorkai/App-Store-Connect-CLI/releases/download/6.5.3/asc_6.5.3_macOS_arm64`
  (or `_macOS_amd64`), `depends_on macos: :ventura`. So both `brew install asc` and
  `brew install rorkai/tap/asc` are valid; **`brew install asc` is the documented one.**
- Install script details 📄: installs to `~/.local/bin` (or `/usr/local/bin` if `$HOME` unset),
  verifies SHA-256 against the release `checksums.txt`, aborts on mismatch,
  `ASC_INSTALL_INSECURE=1` skips verification, on macOS < 13 refuses Go-1.27 releases.
- Manual assets 📄: `asc_6.5.3_macOS_arm64`, `asc_6.5.3_macOS_amd64`, `asc_6.5.3_linux_arm64`,
  `asc_6.5.3_linux_amd64`, `asc_6.5.3_windows_amd64.exe`, `asc_6.5.3_checksums.txt`.
  (The upstream installation doc's `asc_v{version}_…` naming is stale; actual assets have no `v`.)

### 2.3 Presence + version detection

```bash
command -v asc          # → /opt/homebrew/bin/asc
asc --version           # ≡ asc version
```

Exact output here ✅ (no `v` prefix, and **commit/date are `unknown`** because the
homebrew-core formula compiles from source with only `-X main.version` set):

```
6.5.3 (commit: unknown, date: unknown)
```

**There is no JSON/machine-readable version output.** ✅

```
$ asc version --output json  → Error: unknown flag `--output` for `asc version`   (exit 2)
$ asc version --json         → Error: unknown flag `--json` for `asc version`     (exit 2)
$ asc --version --output json→ Error: unknown flag `--output` for `asc`           (exit 2)
```

Recommended detection recipe:

```bash
# presence + version, one exec, no network
out=$(asc --version 2>/dev/null) || { echo "asc not installed"; exit 1; }
ver=$(printf '%s' "$out" | sed -nE 's/^(v?[0-9]+\.[0-9]+\.[0-9]+).*/\1/p')
# semver-compare $ver against the minimum you support; show raw $out as build detail
```

Caveats:
- Accept an optional leading `v` — release **tags are bare SemVer** (`tag_name: "6.5.3"` 📄)
  but the upstream docs show `v1.2.3 (...)`, so both have shipped.
- `commit`/`date` are `unknown` for source builds (Homebrew) and may be populated for
  release-binary installs. Do not gate features on them.
- Latest available version: `GET https://api.github.com/repos/rorkai/App-Store-Connect-CLI/releases/latest`
  → `.tag_name` (e.g. `6.5.3`). Or `brew outdated asc` when Homebrew-managed.
- `asc version` is a fast local command (no network, no auth) — safe as a preflight on every app start.

### 2.4 Engine platform notes

- Native Go binary; **no npm package exists** for this CLI (distribution is Homebrew,
  install script, WinGet, GitHub release binaries, source). The project is not a Node tool;
  `asc install-skills` explicitly states it "runs no Node.js, `npx`, npm package, or repository script".
- Platform-sensitive commands: `asc xcode *` (macOS only), `asc notarization` (macOS only),
  `asc builds compile/package` (needs `xtool`/`rcodesign`), `asc distribute`, screenshot capture
  (`axe`, `sips`, Koubou). Everything in §4 is cross-platform except the `asc xcode` helpers.
- macOS 13 Ventura+ required for releases built with Go 1.27 📄.

---

## 3. Authentication

### 3.1 `asc auth --help` ✅ — full subcommand list

```
  init              Create a template config.json for authentication.
  login             Register and store App Store Connect API key credentials.
  export-to-config  Copy keychain credentials into config.json.
  switch            Switch the default authentication profile.
  logout            Remove stored API credentials.
  doctor            Diagnose authentication configuration issues.
  status            Show active profile and authentication status.
  issuer-id         Print the active App Store Connect issuer ID.
  token             Print a signed JWT for direct App Store Connect API calls.
```

Documented resolution rules, verbatim ✅:

```
Config selection: ASC_CONFIG_PATH; otherwise nearest ancestor .asc/config.json; otherwise ~/.asc/config.json.
Use --strict-auth or ASC_STRICT_AUTH=true (also: 1, yes, y, on) to reject split-source fields.
Set ASC_BYPASS_KEYCHAIN to 1/true/yes/on to bypass keychain.
```

Note: `asc auth capabilities` **does not exist** in 6.5.3 ✅ (the `asc web auth capabilities --help`
text still references it — upstream doc bug). Don't build against it.

### 3.2 `asc auth login` — every flag ✅

```
USAGE
  asc auth login [flags]

  --bypass-keychain  Store credentials in config.json instead of keychain (default: false)
  --fix-permissions  Change an over-permissive private key file to 0600 before reading it (default: false)
  --issuer-id        App Store Connect Issuer ID
  --key-id           App Store Connect API Key ID
  --key-type         API key type: team, individual, or enterprise (Enterprise Program API) (default: team)
  --local            When bypassing keychain, write to ./.asc/config.json (default: false)
  --name             Friendly name for this key (optional on first login: defaults to "default" when no profiles are stored)
  --network          Validate credentials with a lightweight API request (default: false)
  --private-key      Path to private key (.p8) file
  --skip-validation  Skip JWT and network validation checks (default: false)
```

Key semantics ✅:

- **Storage options**: system keychain (default) → fallback config file. `--bypass-keychain`
  forces config. `--local` → `./.asc/config.json`. `ASC_CONFIG_PATH` overrides the target file.
- **Profiles**: `--name` is optional on first login ("default"); once profiles exist it is
  required, and the error lists them. `asc auth switch --name` sets the default.
- **Key types** (`--key-type`): `team` (default), `individual` (no issuer ID), `enterprise`
  (Enterprise Program API, `https://api.enterprise.developer.apple.com`, audience
  `apple-developer-enterprise-v1`, key created at developer.apple.com not App Store Connect).
- **Validation flags**: `--network` (lightweight API call), `--skip-validation`,
  `--fix-permissions`; private-key file must not be group/world-readable, and on failure asc
  "prints the exact chmod command that repairs it".
- **No `--output` flag** — login prints human text only. Use `asc auth status --output json`
  afterwards for a machine-readable result.
- Keychain logins store **encrypted key material** so "commands continue to work even if the
  original .p8 file is removed" ✅. The `.p8` is never printed.

Canonical invocations:

```bash
# team key (the one in the root help)
asc auth login --name "MyKey" --key-id KEY_ID --issuer-id ISSUER_ID --private-key /path/to/AuthKey_KEY_ID.p8

# individual key (no issuer id)
asc auth login --name "MyIndividualKey" --key-id "ABC123" --key-type individual --private-key /path/to/AuthKey.p8

# enterprise key
asc auth login --name "MyEnterpriseKey" --key-id "ABC123" --issuer-id "DEF456" --key-type enterprise --private-key /path/to/AuthKey.p8

# CI / headless: no keychain
asc auth login --bypass-keychain --name "MyCIKey" --key-id "ABC123" --issuer-id "DEF456" --private-key /path/to/AuthKey.p8

# repo-local
asc auth login --bypass-keychain --local --name "ProjectKey" --key-id "XYZ789" --issuer-id "…" --private-key ./AuthKey_XYZ789.p8
```

### 3.3 `asc auth status` — machine-readable ✅ (verified, credential-free)

```
USAGE
  asc auth status

  --output   Output format: table, json (default: json)
  --pretty   Pretty-print JSON output (default: false)
  --validate Validate stored credentials via network (default: false)
  --verbose  Show detailed storage information (default: false)
```

**Default output is already JSON** (`default: json`) — unlike every other command. Verified:

```json
// asc auth status --output json   (also plain `asc auth status`)
{"storageBackend":"System Keychain","storageLocation":"system keychain","credentials":[],
 "environmentCredentialsProvided":false,"environmentCredentialsComplete":false}

// asc auth status --verbose --output json
{"storageBackend":"System Keychain","storageLocation":"system keychain","credentials":[],
 "environmentCredentialsProvided":false,"environmentCredentialsComplete":false,
 "keychainAvailable":true,"configPath":"/Users/jinchunxu/.asc/config.json"}
```

Fields verified so far: `storageBackend`, `storageLocation`, `credentials[]`,
`environmentCredentialsProvided`, `environmentCredentialsComplete`, and with `--verbose`
`keychainAvailable`, `configPath`.
Per-credential fields are ⚠️ unverified live; the documented table columns are
`Name`, `Key ID`, `Default`, `Stored In` (values include `keychain`), and `--validate`
adds a `Validation` column (`works`, …) 📄. Expect camelCase equivalents
(`name`/`keyId`/`default`/`storedIn`/`validation`) — do not hard-fail if absent.

### 3.4 `asc auth doctor` — machine-readable ✅ (verified)

```
  --confirm  Confirm applying fixes (default: false)
  --fix      Attempt to fix issues where possible (default: false)
  --output   Output format: text (default), json (default: text)
  --pretty   Pretty-print JSON output (default: false)
```

Note the output enum is `text|json` and the **default is `text`** — you must pass `--output json`.

Verified JSON (this machine):

```json
{"sections":[
  {"title":"Storage","checks":[{"status":"ok","message":"System keychain is available"},
                               {"status":"info","message":"Config file not found at /Users/…/.asc/config.json"}]},
  {"title":"Profiles","checks":[{"status":"warn","message":"No credentials configured",
                                 "recommendation":"Create an API key at … then run: asc auth login …"}]},
  {"title":"Private Keys","checks":[{"status":"info","message":"No private keys to validate"}]},
  {"title":"Environment","checks":[]},
  {"title":"Temp Files","checks":[{"status":"ok","message":"No orphaned temp key files found"}]},
  {"title":"Migration Hints","checks":[{"status":"info","message":"No Appfile/Fastfile/Deliverfile detected in common fastlane locations"}]}],
 "summary":{"ok":2,"info":3,"warnings":1,"errors":0},
 "recommendations":["Create an API key at …"],
 "migration":{"detectedFiles":[],"detectedActions":[],"suggestedCommands":[]}}
```

Contract: `sections[].checks[].status ∈ {ok, info, warn, error}` (error inferred; not observed),
plus an optional `recommendation` per check. **Exit code is 0 even with warnings** ✅ — read
`summary.errors` / `summary.warnings`, not the exit code, to gate the UI.

`asc doctor` is an alias for `asc auth doctor` ✅ (`asc doctor --help` prints the same page).

### 3.5 `asc auth switch` / `logout` / `token` / `issuer-id` ✅

```
asc auth switch --name <profile>          # sets default profile; no --output
asc auth logout --name NAME --confirm     # or --all --confirm; --include-global
asc auth token --confirm [--name NAME] [--output text|json]   # prints a live 10-min JWT
asc auth issuer-id [--name NAME] [--output text|json]         # raw issuer ID or JSON, no network
asc auth export-to-config --confirm [--local] [--config PATH] [--private-key-dir DIR] [--remove-keychain] [--output table|json]
asc auth init [--local] [--force] [--open]                    # template config.json
```

`asc auth token` **requires `--confirm`** because it prints a live bearer token — a good
pattern to copy: anything that emits a secret demands an explicit confirmation flag.

### 3.6 Where credentials actually live, and the security properties

| Backend | Location | Notes |
| --- | --- | --- |
| System keychain (default) | macOS Keychain / Windows Credential Manager / Linux Secret Service. `asc auth status` → `"storageBackend":"System Keychain"`, `"storageLocation":"system keychain"` ✅ | Key **material** is stored encrypted; the original `.p8` may be deleted afterwards ✅. Service label almost certainly `App-Store-Connect-CLI` ⚠️. |
| Config file | `~/.asc/config.json` (verified path from `--verbose` → `configPath`) ✅ | Written with `0600`; `--local` writes `./.asc/config.json`; `ASC_CONFIG_PATH` (absolute) wins; otherwise the **nearest ancestor `.asc/config.json`** shadows the global one. |
| Environment | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH` / `ASC_PRIVATE_KEY` / `ASC_PRIVATE_KEY_B64`, `ASC_KEY_TYPE`, `ASC_BEARER_TOKEN` | Complete env set skips stored lookup. `ASC_BEARER_TOKEN` outranks everything but cannot be renewed (20-min cap, then exit 3). |

Security properties to preserve in your UI:

- **Private key material is never echoed.** Login stores it; `asc auth token` gates the JWT
  behind `--confirm`; `asc web api-keys create` "saves the one-time P8 as `AuthKey_<KEY_ID>.p8`
  without printing its contents" ✅.
- **Redaction is the default** for secrets in command output: presigned upload URLs and
  request-header values on `asc builds upload` ("redacted from output by default"), review
  demo-account passwords on `asc versions list` (`--include-sensitive` to reveal),
  `--api-debug` "redacts sensitive values". **Never pass `--include-sensitive` from the UI.**
- **Permission enforcement**: an over-permissive `.p8` fails validation; `--fix-permissions`
  chmods to `0600`. `asc auth doctor --fix --confirm` can repair permissions and legacy entries.
- `.asc/config.json` contains plaintext credentials → add it to `.gitignore`; if you offer
  "use config file" in the UI, warn.
- `--strict-auth` refuses split-source credentials; set it for production.

### 3.7 API key creation page + required roles

**Page:** <https://appstoreconnect.apple.com/access/integrations/api>
(printed by `asc auth --help`, `asc auth doctor`, `asc web api-keys create` ✅)

What asc itself documents about roles:

- `asc finance --help` ✅: *"Requires Account Holder, Admin, or Finance role."* (also repeated
  in `asc finance reports --help`).
- `asc web api-keys create --help` ✅: *"Account Holder or Admin access is required. The role
  defaults to ADMIN and is a role identifier such as ADMIN or APP_MANAGER."*
- `asc users list --role` ✅ enumerates the full role identifier vocabulary:
  `ADMIN, FINANCE, ACCOUNT_HOLDER, SALES, MARKETING, APP_MANAGER, DEVELOPER, ACCESS_TO_REPORTS,
  CUSTOMER_SUPPORT, CREATE_APPS, CLOUD_MANAGED_DEVELOPER_ID, CLOUD_MANAGED_APP_DISTRIBUTION,
  GENERATE_INDIVIDUAL_KEYS`
  (`ACCESS_TO_REPORTS` is flagged deprecated in API 4.4 in the binary's help strings).
- `asc web auth capabilities --key-id` ✅ "Show exact web-visible API key roles and full
  documented capability metadata" — the supported way to *verify* what a given key can do.

**Role-by-capability (⚠️ Apple-side, not verifiable from asc):** asc documents the finance row
explicitly; for build upload / TestFlight / submission the requirement comes from Apple's API-key
role model, not from asc, and this machine has no key to probe. Working statement to design
around, with the UI surfacing the authoritative check instead of hard-coding:

| Capability | Practically requires | Confidence |
| --- | --- | --- |
| Read apps/builds/versions/status | any role with app visibility, incl. `DEVELOPER`, `APP_MANAGER`, `ADMIN` | ⚠️ |
| Build upload (`asc builds upload`, `asc publish *`) | `ADMIN` or `APP_MANAGER` | ⚠️ |
| TestFlight groups/testers/beta review | `ADMIN` or `APP_MANAGER` | ⚠️ |
| App Store submission (`asc review submit`, `asc publish appstore --submit`) | `ADMIN` or `APP_MANAGER` | ⚠️ |
| Sales & Trends reports (`asc analytics sales`) | `ADMIN`, `FINANCE`, or sales/reports access | ⚠️ |
| Finance reports (`asc finance reports`) | **Account Holder, Admin, or Finance** | ✅ (asc help) |

**Recommendation for the UI:** don't hard-code roles. On connect, run
`asc auth status --validate --output json` (network validation per credential) and
`asc account status --output json` (auth health + read-only API probe + agreements note),
and gate mutating actions on the resulting `exit 0`, surfacing exit 3 as "key missing/expired".
Advertising "Admin or App Manager key required" as guidance (not as an enforced precondition)
is the safe UX.

---

## 4. Capability matrix for the UI

Conventions used below: `APP_ID` may be an App Store Connect app ID, an exact bundle ID, or an
exact app name on most commands (`asc status --app`, `asc builds list --app`, `asc builds upload --app`);
commands that need a *version/build/group* ID need the numeric resource ID.
Every mutating call needs `--confirm` (some accept `--dry-run` instead).

### 4.a Health / status (all read-only)

| Purpose | Command |
| --- | --- |
| Version / presence | `asc version` (≡ `asc --version`) |
| Auth state | `asc auth status --output json` (add `--validate`, `--verbose`) |
| Auth diagnosis | `asc auth doctor --output json` |
| Account health | `asc account status --app APP_ID --output json` |
| Apple service health (no auth) | `asc system-status --service "App Store Connect" --output json` |
| List apps | `asc apps list --output json --paginate` (bare `asc apps` == list ✅) |
| One app | `asc apps view --id APP_ID --output json` |
| Release dashboard | `asc status --app APP_ID --output json` |
| Builds | `asc builds list --app APP_ID --sort -uploadedDate --limit 5 --output json` |
| Latest build | `asc builds info --app APP_ID --latest --output json` |
| Build processing | `asc builds wait --app APP_ID --build-number N --platform IOS --report-pending --output json` |
| Next build number | `asc builds next-build-number --app APP_ID --version 1.2.3 --platform IOS --output json` |
| Versions | `asc versions list --app APP_ID --output json` |
| Review status | `asc review status --app APP_ID --output json` |
| Review blockers | `asc review doctor --app APP_ID --output json` |
| Readiness report | `asc validate --app APP_ID --version 1.2.3 --output json` |

`asc status` ✅ — the one-screen overview, and the best single call for a dashboard:

```
USAGE
  asc status [flags]

FLAGS
  --app          App Store Connect app ID, bundle ID, or exact app name (required, or ASC_APP_ID env)
  --include      Comma-separated sections: app,builds,testflight,appstore,submission,review,phased-release,links
  --max-polls    Maximum polls for --watch (0 = unlimited) (default: 0)
  --output       Output format: json, table, markdown (default: json)
  --platform     Filter release status by platform: IOS, MAC_OS, TV_OS, VISION_OS
  --poll-interval Polling interval for --watch (default: 30s)
  --pretty       Pretty-print JSON output (default: false)
  --timeout      Maximum time to wait for --until (0 = no limit) (default: 0s)
  --until        Wait until a condition is reached, then exit (implies --watch):
                 review-done, ready-for-sale, processed, testflight-ready, change
  --watch        Poll and emit snapshots when status changes (default: false)
```

Verified shape hints from `--help` ✅ (the only field names the CLI documents verbatim):

- per-snapshot object is "a deterministic payload"; `summary.nextCommands` lists runnable
  `asc` commands "with a reason and whether each command mutates App Store Connect"
  (**omitted in `--read-only` mode** — a nice ready-made "next best action" feed for the UI);
- `--until` prints a final object `{"until","reached","outcome","state","polls"}`;
- exit codes: `review-done` → 0 on APPROVED-ish states (`ACCEPTED`, `PENDING_*_RELEASE`,
  `PROCESSING_FOR_DISTRIBUTION`, `READY_FOR_DISTRIBUTION`), 1 on `REJECTED`,
  `METADATA_REJECTED`, `INVALID_BINARY`, `DEVELOPER_REJECTED`; `processed` → 0 on `VALID`,
  1 on `FAILED`/`INVALID`; `testflight-ready` → 0 on `READY_FOR_BETA_TESTING`/`IN_BETA_TESTING`,
  1 on `PROCESSING_EXCEPTION`/`MISSING_EXPORT_COMPLIANCE`/`EXPIRED`; timeout/interrupt → 7.

`asc builds wait` ✅ — processing-state poller with a built-in resume contract:

```
  --build-id BUILD_ID | --app APP --latest | --app APP --build-number N --platform PLATFORM
  --timeout 15m0s (default)   --poll-interval 30s
  --report-pending  (on timeout: print {"status":"pending","phase":"discovery|processing",…,"resumeCommand":…} → exit 7)
  --fail-on-invalid (exit non-zero on INVALID)
  --since RFC3339
```

`VALID` → 0; `FAILED` → non-zero; `INVALID` → non-zero only with `--fail-on-invalid`;
plain `--timeout` expiry → exit 1 *with the command that resumes the wait*, `--report-pending`
→ exit 7 + `resumeCommand`. This is exactly the primitive a UI's progress screen wants.

`asc builds next-build-number` ✅ documented output fields:
`latestProcessedBuildNumber`, `latestObservedBuildNumber`, `nextBuildNumber`, `sourcesConsidered`
(`null`s when only zero-style placeholders exist; falls back to `--initial-build-number`).
⚠️ overall envelope unverified.

### 4.b Upload a build to TestFlight

Two layers: low-level `asc builds upload`, high-level `asc publish testflight` /
`asc publish appstore`, plus local Xcode helpers.

**Low level** ✅

```bash
asc builds upload --app APP_ID --ipa ./App.ipa
asc builds upload --app APP_ID --ipa ./App.ipa --version 1.0.0 --build-number 123 --wait --output json
asc builds upload --app APP_ID --pkg ./App.pkg --version 1.0.0 --build-number 42 --wait --output json
asc builds upload --app APP_ID --ipa ./App.ipa --dry-run          # reserve operations only
asc builds upload --app APP_ID --ipa ./App.ipa --test-notes "Test flow" --locale en-US
```

```
FLAGS
  --app          (required, or ASC_APP_ID env) — IPA uploads also accept exact bundle ID or exact name
  --ipa          Path to .ipa (iOS, tvOS, visionOS)
  --pkg          Path to .pkg (macOS; platform forced to MAC_OS)
  --version      CFBundleShortVersionString (auto-extracted from IPA)
  --build-number CFBundleVersion (auto-extracted from IPA)
  --platform     IOS | MAC_OS | TV_OS | VISION_OS (auto-detected)
  --wait         Wait for build processing to complete (default: false)
  --poll-interval 30s
  --verify-timeout  How long to watch for immediate post-commit upload failures (0 to disable) (default: 0s)
  --test-notes / --locale   create/update What to Test after the build appears
  --concurrency  Upload concurrency (default: 4)
  --checksum     Verify upload checksums if provided by API
  --dry-run      Reserve upload operations without uploading the file
  --include-sensitive  NEVER use from a UI (prints presigned URLs / header values)
  --output json|table|markdown ; --pretty
```

Behaviour that matters ✅: uploads to presigned URLs then commits immediately; when
`--wait`/`--test-notes`/`--verify-timeout` observes the build, the **receipt includes `buildId`**;
if the build is not yet visible it prints a stderr notice explaining how to look it up.
Presigned URLs are redacted unless `--include-sensitive`.
⚠️ The full receipt schema is unverified; plan for `{buildId, uploadId, state, …}` and read
`buildId` defensively, then confirm via `asc builds info --build-id`.

**High level (recommended for the UI's "upload & distribute" button)** ✅

```bash
# upload only, machine-readable build metadata
asc publish testflight --app APP_ID --ipa ./App.ipa --upload-only --wait --output json

# upload + add to groups (+ notify) (+ beta review)
asc publish testflight --app APP_ID --ipa ./App.ipa --group "GROUP_ID" --wait
asc publish testflight --app APP_ID --ipa ./App.ipa --group "G1,G2" --wait --notify
asc publish testflight --app APP_ID --ipa ./App.ipa --group "External Testers" --submit --confirm
asc publish testflight --app APP_ID --ipa ./App.ipa --group "GROUP_ID" --test-notes "…" --locale en-US --wait

# distribute an already-uploaded build (no upload)
asc publish testflight --app APP_ID --build-id BUILD_ID --group GROUP_ID --wait
```

`asc publish testflight` flags ✅: `--app`(req), `--ipa|--pkg|--build-id|--build-number`,
`--version`, `--group` (IDs **or names**, comma-separated), `--wait`, `--upload-only`,
`--notify`, `--submit` + `--confirm`, `--test-notes`, `--locale`, `--platform`, `--timeout`,
`--poll-interval`, `--output`, plus local-build mode flags (`--workspace|--project`, `--scheme`,
`--configuration`, `--clean`, `--archive-path`, `--ipa-path`, `--pkg-path`, `--export-options`,
`--signing-style automatic|manual`, `--team-id`, `--initial-build-number`,
`--archive-xcodebuild-flag`, `--export-xcodebuild-flag`).

**App Store variant** ✅

```bash
asc publish appstore --app APP_ID --ipa ./App.ipa --version 1.2.3 --submit --confirm
asc publish appstore --app APP_ID --ipa ./App.ipa --version 1.2.3 --submit --dry-run   # plan only
asc publish appstore --app APP_ID --pkg ./Mac.pkg --version 1.2.3 --build-number 42
```

Workflow per its help ✅: upload → `--wait` processing → find/create version → apply
`--metadata-dir` → attach build → `--submit --confirm`.

**Local Xcode helpers** (macOS only; produce the artifacts the upload commands consume) ✅

```bash
asc xcode archive --workspace App.xcworkspace --scheme App --archive-path .asc/artifacts/App.xcarchive --output json
asc xcode export  --archive-path .asc/artifacts/App.xcarchive --ipa-path .asc/artifacts/App.ipa --output json
asc xcode build   --project App.xcodeproj --scheme App --destination 'platform=iOS Simulator,name=iPhone 17 Pro Max,OS=27.0' --no-code-signing --output json
asc xcode export-options generate --archive-path … --output-path … --overwrite
asc xcode validate --ipa …            # pre-upload validation with Apple
asc xcode version view | bump --type patch | edit --version 1.3.0 --build-number 42
asc xcode inject --manifest .asc/deployment.json --set version=1.2.3 --set build_number=42 --dry-run
asc xcode doctor --output json
asc xcode test …  /  asc xcode install --ipa … --device-id …
asc ipa-info --path ./App.ipa --output json    # fully offline, no auth, no upload
```

`asc ipa-info` is a great pre-flight for the UI: **no auth, no network** ✅, reports bundle
identity, `codeSignature` (`signed|ad-hoc|unsigned|unreadable`), `signer`, `teamId`,
`architectures[]`, `signerConsistent`, and with `--verify-signature` an offline
`signatureVerification ∈ {valid, invalid, untrusted-chain, expired, unsupported}` (non-`valid`
→ exit 1).

### 4.c TestFlight distribution

```bash
# groups
asc testflight groups list --app APP_ID --output json
asc testflight groups list --app APP_ID --internal | --external
asc testflight groups list --build-id BUILD_ID --output json          # which groups have this build
asc testflight groups create --app APP_ID --name "Beta Testers" [--internal]
asc testflight groups add-testers --group GROUP_ID --email a@x.com[,b@y.com]
asc testflight groups add-testers --group GROUP_ID --tester TESTER_ID[,ID2]

# testers
asc testflight testers list --app APP_ID --output json
asc testflight testers add --app APP_ID --email t@x.com --group "Beta,iOS 27"
asc testflight testers add --app APP_ID --email t@x.com --group "Beta" --build-id B1,B2
asc testflight testers invite --app APP_ID --email t@x.com [--group ID]
asc testflight testers import --app APP_ID --input ./testers.csv --dry-run
asc testflight testers export --app APP_ID --output ./testers.csv
asc testflight testers remove --app APP_ID --email t@x.com --confirm
asc testflight testers add-groups --id TESTER_ID --group GROUP_ID
asc testflight testers remove-groups --id TESTER_ID --group GROUP_ID --confirm

# build ⇄ group
asc builds add-groups --app APP_ID --latest --group GROUP_ID --dry-run
asc builds add-groups --app APP_ID --latest --group GROUP_ID
asc builds add-groups --app APP_ID --latest --group "G1,G2" --skip-internal
asc builds add-groups --build-id BUILD_ID --group EXTERNAL_GROUP --submit --confirm
asc builds remove-groups --app APP_ID --latest --group GROUP_ID --confirm
asc builds groups list --build-id BUILD_ID
asc builds individual-testers list --build-id BUILD_ID
asc builds individual-testers add --build-id BUILD_ID --tester TESTER_ID

# "What to Test" notes
asc builds test-notes list   --build-id BUILD_ID
asc builds test-notes view   --app APP_ID --latest --locale en-US
asc builds test-notes create --app APP_ID --build-number 42 --platform IOS --version 1.2.3 --locale en-US --whats-new "Test instructions"
asc builds test-notes update --build-id BUILD_ID --locale en-US --whats-new "Updated instructions"
asc builds test-notes delete --build-id BUILD_ID --locale en-US --confirm

# beta app review (external groups)
asc testflight review view --app APP_ID --output json
asc testflight review submit --build-id BUILD_ID --confirm
asc testflight review submissions list --build-id BUILD_ID
asc builds beta-app-review-submission view --app APP_ID --latest

# distribution settings / notifications / metrics / feedback
asc testflight distribution view --build-id BUILD_ID
asc testflight distribution edit --id DETAIL_ID --auto-notify
asc testflight notifications send --build-id BUILD_ID
asc testflight metrics group-testers --group GROUP_ID
asc testflight metrics app-testers --app APP_ID
asc testflight feedback list --app APP_ID --paginate
asc testflight crashes list --app APP_ID --sort -createdDate --limit 10
asc testflight config export --app APP_ID --output ./testflight.yaml
```

Key read/write classification: `list|view|export|metrics|feedback|crashes` are read-only;
`create|add|remove|delete|update|edit|invite|submit|send|import` mutate.
`--confirm` is required for `delete`, `remove*`, `submit`, and other destructive ops ✅.
`asc builds add-groups` is notable: it **pre-verifies** build processing/expiry and, for
external groups, encryption + audience + beta-review state, and **stops without sending** if
it cannot prove readiness ✅ — excellent, UI-friendly behaviour.

⚠️ JSON shape of a beta group / tester: unverified. Expect Apple `betaGroups` / `betaTesters`
attributes (`name`, `isInternalGroup`, `publicLinkEnabled`, `publicLinkLimit`,
`createdDate`; `email`, `firstName`, `lastName`, `inviteType`) — from Apple's resources, not
observed here. Also: `asc testflight groups list --build-id` can return `complete=false`
and exit non-zero when an inverse relationship can't be read ✅ (handle that as "partial").

### 4.d Submit for App Store review

Canonical order (all ✅ from help):

```bash
# 0) readiness (canonical)
asc validate --app APP_ID --version 1.2.3 --output json
asc validate --app APP_ID --version 1.2.3 --strict          # warnings become errors
asc validate --app APP_ID --version 1.2.3 --deep            # + cached web-session checks
asc validate testflight --app APP_ID --build-id BUILD_ID
asc validate iap --app APP_ID ; asc validate subscriptions --app APP_ID

# 1) stage version + metadata + attach build, without submitting
asc release stage --app APP_ID --version 2.4.0 --build-id BUILD_ID --copy-metadata-from 2.3.2 --dry-run
asc release stage --app APP_ID --version 2.4.0 --build-id BUILD_ID --copy-metadata-from 2.3.2 --confirm
asc release stage --app APP_ID --version 2.4.0 --build-id BUILD_ID --metadata-dir ./metadata --confirm

# 2) lower-level version/build plumbing
asc versions list  --app APP_ID --output json
asc versions view  --version-id VERSION_ID --include-build --include-submission
asc versions create --app APP_ID --version 2.0.0 --platform IOS [--release-type MANUAL|AFTER_APPROVAL|SCHEDULED]
asc versions create --app APP_ID --version 2.4.0 --copy-metadata-from 2.3.2 --if-exists skip|update|fail
asc versions attach-build --app APP_ID --version 1.2.0 --build-number 45 --wait --timeout 30m
asc versions update --version-id VERSION_ID --release-type MANUAL
asc versions release --version-id VERSION_ID --confirm      # release a PENDING_DEVELOPER_RELEASE version

# 3) submit
asc review submit --app APP_ID --version 1.2.3 --build-id BUILD_ID --confirm
asc review submit --app APP_ID --version 1.2.3 --build-number 46 --wait --confirm
asc review submit --app APP_ID --version-id VERSION_ID --build-id BUILD_ID --dry-run
# or the whole thing at once:
asc publish appstore --app APP_ID --ipa ./App.ipa --version 1.2.3 --submit --confirm

# 4) poll
asc status --app APP_ID --until review-done --timeout 2h
asc review status --app APP_ID --output json
asc review doctor --app APP_ID --output json
asc submit status --version-id VERSION_ID
asc review submissions list --app APP_ID --output json
asc review history --app APP_ID --output json
asc submit cancel --version-id VERSION_ID --app APP_ID --confirm
```

`asc release stage` ✅ — flags: `--app`, `--version` (req), `--build-id` (req),
`--metadata-dir | --copy-metadata-from` (one required), `--copy-fields`,
`--exclude-fields`, `--routing-coverage-file`, `--dry-run`, `--confirm`,
`--checkpoint-file` (resumable), `--strict-validate`, `--timeout 30m`, `--platform`.
Its 6 steps (verify build → ensure version → apply metadata → routing coverage →
attach build → readiness) stop **before** creating a review submission; on blockers it
"prints blockers to stderr and exits **1**", leaving earlier steps applied and the checkpoint
in place so re-running the same command resumes. That is a great "wizard with resumable steps"
backing flow.

`asc validate` ✅ — the canonical readiness report. Flags: `--app`, `--version`,
`--version-id`, `--platform`, `--ipa` (enables iPad-screenshot requirement via
`UIDeviceFamily`), `--deep`, `--apple-id` (cached web session), `--check-urls`, `--strict`,
`--output`, `--pretty`. Documented checks include metadata length limits, placeholder copy,
other-platform wording, stale copyright ranges, required fields/localizations, review-details
completeness, primary category, build attached+processed, encryption declaration, content
rights, pricing/availability, screenshot presence+size, subscription readiness, age rating.
"The default validate response includes an ordered remediation plan, so the first step is the
next thing to fix." ⚠️ exact finding object schema unverified — the binary's strings suggest
finding IDs such as `metadata.minimum.name`, `privacy.publish_state`, `build.invalid.expired`,
`media.delivery.failed`, `subscriptions.diagnostics.*` and per-finding classifications
`api-fixable | web-fixable | manual` (documented for `--deep` ✅). Design for an array of
findings with `{id, severity, message, nextAction}` and render defensively.

`asc review submit` ✅ — `--app`, `--version|--version-id`, `--build-id|--build-number|--latest`,
`--wait`, `--timeout`, `--poll-interval`, `--platform`, `--dry-run`, `--confirm`
("required unless `--dry-run`"). Wraps attach-build → submissions-create → items-add →
submissions-submit.

⚠️ Shapes unverified for: `versions list`, `review status`, `review doctor`, `submit status`,
`review submissions list`, `status`, `validate`.

### 4.e Sales / analytics / finance

**Sales & Trends (units, proceeds) — the row-level data source**

```bash
asc analytics sales --vendor 12345678 --type SALES --subtype SUMMARY --frequency DAILY \
    --date 2024-01-20 --decompress --output reports/daily_sales.tsv.gz
asc analytics sales --vendor 12345678 --type SALES --subtype SUMMARY --frequency DAILY      # latest available
asc analytics sales … --allow-missing        # return available=false instead of failing
```

```
FLAGS
  --vendor        Vendor number (or ASC_VENDOR_NUMBER / ASC_ANALYTICS_VENDOR_NUMBER env)
  --type          SALES, PRE_ORDER, NEWSSTAND, SUBSCRIPTION, SUBSCRIPTION_EVENT, SUBSCRIBER,
                  SUBSCRIPTION_OFFER_CODE_REDEMPTION, INSTALLS (deprecated), FIRST_ANNUAL, WIN_BACK_ELIGIBILITY
  --subtype       SUMMARY, DETAILED, SUMMARY_INSTALL_TYPE, SUMMARY_TERRITORY, SUMMARY_CHANNEL
  --frequency     DAILY, WEEKLY, MONTHLY, YEARLY
  --date          daily/weekly YYYY-MM-DD, monthly YYYY-MM or YYYY-MM-DD, yearly YYYY or YYYY-MM-DD
                  (optional for DAILY); WEEKLY must be a Monday or Sunday
  --version       report format version allowed for the (type, subtype, frequency) tuple
  --decompress    decompress gzip output to .tsv
  --output        OUTPUT FILE PATH (default sales_report_{date|latest}_{type}.tsv.gz)
  --output-format Output format for METADATA: json (default), table, markdown
  --allow-missing / --pretty
```

Download-and-parse flow: the command **downloads the gzip TSV to `--output`** and prints a
**metadata JSON** on stdout (file path/bytes/date/type…, ⚠️ exact keys unverified).
So a UI flow is: pick vendor + type/subtype/frequency/date → run with an explicit `--output`
path in a temp dir → read the JSON receipt → parse the `.tsv` rows locally
(use `--decompress` to get `.tsv` directly). Vendor number comes from the Sales and Trends
report URL (`vendorNumber=…`) ✅.

**App Store Analytics (impressions, conversion, retention…) — API report pipeline**

```bash
asc analytics request  --app APP_ID --access-type ONGOING [--reuse-existing]     # mutating (creates a request)
asc analytics requests --app APP_ID --paginate --output json                     # read
asc analytics requests delete --request-id ID --confirm
asc analytics view     --request-id ID [--processing-date YYYY-MM-DD] [--granularity "DAILY,WEEKLY,MONTHLY"] --paginate
asc analytics reports  view --report-id REPORT_ID
asc analytics instances links --instance-id INSTANCE_ID
asc analytics segments view --segment-id SEGMENT_ID
asc analytics download --request-id ID --instance-id INSTANCE_ID
```

Notes ✅: use `--paginate` with `--processing-date` (`filter[processingDate]`) to search every
report page, or `--next <links.next> --paginate` to resume; raise `ASC_TIMEOUT` for long runs.
`asc analytics request` is the one mutating call in this family (it creates a durable report
request; `--reuse-existing` makes it idempotent — use that).

**Derived summaries (best fit for a dashboard widget)**

```bash
asc insights weekly --app APP_ID --source analytics --week 2026-02-16 --output json
asc insights weekly --app APP_ID --source sales --week 2026-02-16 --vendor 12345678 --output json
asc insights daily  --app APP_ID --vendor 12345678 --date 2026-02-20 --output json
asc analytics compare --source sales --vendor 12345678 --app APP_ID \
    --from 2026-01-01 --to 2026-02-01 --frequency DAILY --output json
```

`insights weekly` ✅ compares this week vs last week; with `--source sales` totals are
app-scoped and include linked IAP/subscriptions matched by Parent Identifier vs app SKU.
`insights daily` is sales-only, app-scoped, day-over-day subscription-renewal signals
(rows where `Subscription == "Renewal"`). `analytics compare` ✅ aggregates both ranges and
produces "delta and percentage-change output scoped to the specified app"; all report dates
must exist or it fails (so pre-check with `--allow-missing` on `sales` if unsure).
⚠️ Exact field names unverified; strings in the binary hint at insight keys such as
`Proceeds by Territory`, `Proceeds by In-App Purchases`, `Active Plans by Subscription`,
`cohort-download-to-paid-rate`, `overview retention range`, `overview crash breakdown`,
`Redownloads`, `Impressions`, `Free Trials`, `Paid Offers`, `Offer Churn`, `Acquisition`.

**Finance (payments/settlements, fiscal months)**

```bash
asc finance reports --vendor 12345678 --report-type FINANCIAL --region ZZ --date 2025-12 --decompress
asc finance reports --vendor 12345678 --report-type FINANCE_DETAIL --region Z1 --date 2025-12 --decompress
asc finance regions --output table
```

✅ Facts: `--report-type ∈ {FINANCIAL, FINANCE_DETAIL}`; `FINANCE_DETAIL` **requires
`--region Z1`**; `FINANCIAL` uses `ZZ` (consolidated) or a per-region code (`US`, `EU`, `JP`, …);
`--date` is an **Apple fiscal month** `YYYY-MM`, not calendar; Transaction Tax reports are
**not** available via the public API (use `asc web finance transaction-tax download`);
requires Account Holder/Admin/Finance role; `--output` is a file path with
`--output-format` for metadata. Region list verified live via `asc finance regions`
(US, AU, BR, BG, CA, CL, CN, CO, CZ, HR, DK, EG, HK, HU, IN, ID, IL, JP, KZ, KR, MY, MX, …).

**Performance / diagnostics**

```bash
asc performance metrics list --app APP_ID
asc performance metrics view --build-id BUILD_ID
asc performance overview --app APP_ID
asc performance diagnostics list --build-id BUILD_ID
asc performance diagnostics view --id SIGNATURE_ID
asc performance download --build-id BUILD_ID --output ./metrics.json
```

### 4.f Adjacent commands the UI will likely need

```bash
asc apps view --id APP_ID --output json
asc apps info view|edit …                       # App Store *version* metadata (name/subtitle/whats-new)
asc metadata pull  --app APP_ID --version 1.2.3 --dir ./metadata
asc metadata push  --app APP_ID --version 1.2.3 --dir ./metadata --dry-run|--confirm
asc localizations list --app APP_ID --type app-info
asc screenshots list|upload|plan|apply …
asc pricing current|schedule|availability …
asc review details-for-version --version-id VERSION_ID
asc review details-create --version-id VERSION_ID --contact-first-name … --contact-email … --contact-phone …
asc xcode-cloud run --workflow-id W --pull-request-id PR
asc webhooks …        asc users …        asc devices …
asc api GET /v1/apps --query limit=5 --pretty           # escape hatch, raw Apple JSON
asc schema "GET /v1/apps" --pretty                     # discover exact query params/fields
asc capabilities --area release --output table          # what asc can/can't do
asc search "external testers" --output json             # command discovery
```

---

## 5. License, attribution, packages, versioning

### 5.1 LICENSE (exact) 📄

`https://raw.githubusercontent.com/rorkai/App-Store-Connect-CLI/main/LICENSE`:

```
MIT License

Copyright (c) 2026 Rudrank Riyam
```

followed by the standard MIT permission text, ending with the "AS IS" warranty disclaimer.

**Exact copyright line to reproduce:**

```
Copyright (c) 2026 Rudrank Riyam
```

### 5.2 What attribution a product must include

MIT is permissive but conditional. The license requires, in every copy or substantial portion
of the software:

> "The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software."

Practical obligations:

1. Include the full MIT text **plus** the line `Copyright (c) 2026 Rudrank Riyam`.
2. If you redistribute the `asc` binary or bundle it with your product, ship that notice
   alongside it (e.g. a `THIRD-PARTY-NOTICES` file, an in-app "Open source licenses" screen,
   or `about` endpoint). If you merely shell out to a user-installed `asc`, the notice is still
   the courteous/standard thing to surface in your licenses page.
3. No copyleft, no source-disclosure requirement, no trademark grant. You may use the name
   `asc` descriptively ("requires the `asc` CLI"), but the project itself is independent:
   verbatim from the README footer —

   > "This project is an independent, unofficial tool and is not affiliated with, endorsed by,
   > or sponsored by Apple Inc. App Store Connect, TestFlight, Xcode Cloud, and Apple are
   > trademarks of Apple Inc., registered in the U.S. and other countries."

   Mirror that disclaimer in your own About/legal screen; also disclaim Apple affiliation
   yourself, since your UI sits on Apple's API.
4. `asc docs show third-party-notices` (embedded guide) lists licenses for native dependencies
   in release binaries — pull that into your notices if you redistribute the binary.
5. Acknowledgements worth carrying if you use specific features: Koubou (screenshot framing,
   pinned 0.20.0), AXe CLI (simulator automation), and the ASO keyword-difficulty methodology
   adapted from semihcihan/App-Store-Optimization-CLI (MIT). 📄

### 5.3 Package names

| Channel | Exact identifier | Notes |
| --- | --- | --- |
| Homebrew (official) | `asc` → `Homebrew/homebrew-core` `Formula/a/asc.rb` | `brew install asc`; source build via Go; `conflicts_with "asccli"` |
| Homebrew tap | `rorkai/tap/asc` → `rorkai/homebrew-tap` `Formula/asc.rb` | binary download; `brew install rorkai/tap/asc` |
| Install script | `https://asccli.sh/install` | `curl -fsSL https://asccli.sh/install \| bash`; honors `INSTALL_DIR`, `ASC_INSTALL_INSECURE` |
| WinGet | `asc`, exact id `Rorkai.ASC` | `winget install asc` / `winget install --id Rorkai.ASC --exact` |
| GitHub Releases | repo `rorkai/App-Store-Connect-CLI`, assets `asc_<ver>_<os>_<arch>` | + `asc_<ver>_checksums.txt` |
| Go module | `github.com/rorkai/App-Store-Connect-CLI` | binary name `asc`; homepage <https://asccli.sh> |
| npm | **none** | the project ships no npm package; it is a Go binary |

### 5.4 Versioning scheme

- **Bare SemVer, no `v` prefix** on tags: release `tag_name: "6.5.3"`, `name: "6.5.3"`,
  assets `asc_6.5.3_macOS_arm64`, `asc_6.5.3_checksums.txt` 📄.
- CLI self-report format: `<version> (commit: <sha|unknown>, date: <date|unknown>)` ✅.
  Docs show `v1.2.3 (commit: abc1234, date: 2026-03-04)` 📄 — parse with an optional `v`.
- Frequent patch releases (6.5.2 → 6.5.3 within days) with grouped feature PRs; no LTS.
  Pin a minimum version and warn on drift rather than pinning an exact one.
- Version-specific surfaces shift often (this research found one already-stale doc reference:
  `asc auth capabilities` does not exist in 6.5.3). **Featurize by probing `--help`, not by
  assuming a version map.**

---

## 6. Features that specifically help a UI

### 6.1 Command discovery / introspection (great for a command palette, help pane, "why" tooltips)

| Command | Output | Verified shape |
| --- | --- | --- |
| `asc search "<query>" --output json --limit 10` | local, deterministic index of the command tree (paths, summaries, usage, examples, flag names); no network, no auth | ✅ `{"query","count","results":[{"command","summary","usage","score","matched":[…],"examples":[…]}]}` |
| `asc schema "<fuzzy|METHOD /path|action.dot>" [--method POST] [--list] [--pretty]` | bundled App Store Connect OpenAPI index (**1337 endpoints** in 6.5.3) with parameters, request attributes/relationships, response schema names | ✅ bare JSON array |
| `asc capabilities [--area …] [--status …] [--output json]` | 54 capabilities with status `cli-supported(19) / partial(3) / web-session(32)`, mapped `commands[]` + `apiResources[]` + long `notes[]` | ✅ `{"summary":{total,schemaEndpointCount,statuses,areas},"capabilities":[…]}` |
| `asc docs list` / `asc docs show <slug>` | 4 embedded guides (`api-notes`, `reference`, `workflows`, `third-party-notices`) | ✅ |
| `asc system-status --output json` | Apple Developer System Status, **unauthenticated** | ✅ `{"source","summary":{status,totalServices,operationalServices,affectedServices,activeIncidents},"services":[{name,status,url,events[]}]}` |
| `asc ipa-info --path X --output json` | offline IPA inspection, **unauthenticated** | ✅ (documented fields) |

This is the single biggest UI accelerant: you can build a real command browser and a
"can asc do X?" capability matrix without scraping the docs.

### 6.2 `asc install-skills` ✅

```
asc install-skills
```
Installs the project's **25 agent skills** from a pinned, reviewed commit
(`f52c4f04323bb2dfb21ca8be82e6494e9cd0b4d8`) into the global agent-skills directory.
Requires only `git`; runs no Node/npx/npm/repo script; verifies every file; rolls back on
failure; pins the 25 lock entries so external checks can't move them. Upgrade = an explicit
change to the pinned commit.
Pairs well with: `asc init` / `asc docs init [--path ./ASC.md] [--force] [--link=false]`
(writes a repo-local `ASC.md` and can link it from `AGENTS.md`/`CLAUDE.md`) — **these write
files, so never trigger them from the UI without an explicit user action.**

### 6.3 Machine-readable errors

Exit code is the only structured signal (§1.8). Patterns to build on:

- Prefix contract: `Error: <command path>: <message>` — parse the prefix to attribute the error.
- `Hint:` lines carry actionable next steps (often the exact `asc` command to run) — display them.
- Helpful "did you mean" blocks for wrong subcommand/flag, plus task-oriented hint blocks
  ("Common tasks: check credentials … diagnose problems …").
- No JSON error envelope exists; wrap stderr text in your own `{code, message, hint}` DTO.

### 6.4 `--timeout`, streaming, progress

- `--timeout` is **per command**, not a root flag ✅ (e.g. `builds wait` 15m default,
  `versions attach-build --wait` 15m, `release stage` 30m, `status --until` 0 = none,
  `publish *` 0 = command default).
- Env: `ASC_TIMEOUT` / `ASC_TIMEOUT_SECONDS` (request), `ASC_UPLOAD_TIMEOUT` /
  `ASC_UPLOAD_TIMEOUT_SECONDS` (upload/streamed download) ✅.
- `--watch --poll-interval 30s --max-polls N` on `asc status` and `asc system-status`;
  watch mode emits the initial snapshot then **only on change**; **JSON watch output is
  newline-delimited (NDJSON) and does not support `--pretty`** ✅ — ideal to stream into a UI
  over SSE/websocket.
- `--until review-done|ready-for-sale|processed|testflight-ready|change` turns `asc status`
  into a long-poll with a final `{"until","reached","outcome","state","polls"}` object and
  semantic exit codes (0/1/7) ✅.
- `--report-pending` (builds wait) converts a timeout into `exit 7` + a **`resumeCommand`** —
  let the UI persist and re-run it instead of restarting the wait.
- Progress/spinner goes to **stderr** only; `ASC_SPINNER_DISABLED` disables the interactive
  spinner ✅. stdout stays clean JSON — safe to pipe.
- `asc workflow` is JSON-only on stdout with step/hook output streamed to stderr ✅.

### 6.5 Resumability

- `asc release stage --checkpoint-file` — checkpointed, resumable staging pipeline ✅.
- `asc builds wait --report-pending` → `resumeCommand` ✅.
- `asc workflow` maintains run state; failing runs keep JSON on stdout including hook results ✅.
- `asc distribute` has protected run state / resume for private distributions ✅
  (`asc distribute verify --run RUN_ID`).
- Uploads: presigned-URL multipart with `--concurrency` and `--checksum`; **no explicit
  "resume a partial upload" flag** ✅ — treat re-upload as the recovery path
  (`asc builds uploads list` shows prior upload attempts and their `state`).

### 6.6 Dry-run and confirmation (the safety model to replicate in the UI)

- `--dry-run` exists on nearly every orchestration/mutation surface:
  `builds upload`, `builds add-groups`, `builds expire-all`, `release stage`,
  `publish appstore`, `publish testflight` (plan preview), `review submit`, `metadata push`,
  `screenshots apply`, `workflow run --dry-run`, `apps wall submit --dry-run`,
  `xcode inject`, `pricing …`.
- `--confirm` is required on every destructive/mutating action **and** on secret-emitting
  reads: `auth logout`, `auth token`, `auth export-to-config`, `review submit`,
  `review submissions-submit`, `submit cancel`, `versions release`, `builds remove-groups`,
  `testflight groups delete`, `api POST/PATCH/DELETE`, `web api-keys revoke`, `web apps delete`.
- `--read-only` / `ASC_READ_ONLY=1` — a **global kill switch**: refuses every POST/PATCH/PUT/DELETE
  before it is sent (documented refusal exit code **6** ✅ docs / ⚠️ untested). Perfect for
  a UI "demo/safe mode" toggle, and `asc status` even omits mutating `nextCommands` in that mode.
- Idempotency helpers built in: `versions create --if-exists fail|skip|update`,
  `analytics request --reuse-existing`, `builds add-groups --skip-internal`,
  `groups add-testers` returns `{"action":"skipped"}` + exit 0 on a 409 that readback confirms.
- Exactly-once bias: several mutations "send one request, verify readback, never retry"
  (e.g. `versions release`, `pricing availability edit`, `web api-keys revoke`) ✅ — mirror
  that in the UI: on ambiguous failure, re-read state instead of retrying blindly.

### 6.7 Redaction and side-channel hygiene

- Default redaction (presigned URLs, header values, demo passwords) with `--include-sensitive`
  as the explicit opt-out ✅ — never expose that flag in the UI.
- `--api-debug` redacts sensitive values; `--debug` / `--retry-log` write to stderr ✅.
- Telemetry: enabled by default, pseudonymous, command-level only, **no args/IDs/paths**;
  `asc telemetry status|disable|enable|reset-id`, `ASC_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1` ✅.
  Verified: `asc telemetry status --output json` →
  `{"path":"~/.asc/telemetry.json","enabled":true,"install_id":"…","endpoint":"https://rork.com/cf-api/asc/v1/events"}`.
  If your product is privacy-sensitive, surface this setting and respect `DO_NOT_TRACK`.
- `asc notify slack --webhook … --message …` (or `ASC_SLACK_WEBHOOK`) for release notifications ✅.
- `asc snitch` files a GitHub issue about CLI friction — useful as a "report a problem" hook ✅.

### 6.8 Suggested UI wiring (condensed)

```
startup:      asc --version                          → version gate (no network)
              asc auth status --output json          → signed-in? which profile/key?
              asc auth doctor --output json          → problems + recommendations
              asc system-status --output json        → Apple incident banner (no auth)
on connect:   asc auth status --validate --output json
              asc account status --output json
home:         asc apps list --paginate --output json
              asc status --app APP_ID --output json  (summary.nextCommands = next-best-action)
builds:       asc builds list --app … --sort -uploadedDate
              asc builds wait --app … --report-pending (persist resumeCommand)
upload:       asc ipa-info --path … (offline) → asc builds upload --dry-run
              → asc publish testflight --upload-only --wait
testflight:   asc testflight groups list / testers list / builds add-groups --dry-run → --submit --confirm
release:      asc validate --strict → asc release stage --dry-run → --confirm
              → asc review submit --dry-run → --confirm → asc status --until review-done
analytics:    asc analytics sales (file) + insights weekly/compare (JSON summaries)
              asc finance reports --report-type FINANCIAL --region ZZ
safety:       always ASC_READ_ONLY=1 unless the user just confirmed a mutation
```

---

## Appendix A — high-value exact invocations (copy/paste verified)

```bash
# --- bootstrap / health ---
asc --version
asc auth status --output json
asc auth status --validate --verbose --output json
asc auth doctor --output json
asc account status --app "APP_ID" --output json
asc system-status --service "App Store Connect,TestFlight" --output json
asc apps list --paginate --sort name --output json
asc status --app "APP_ID" --include app,builds,testflight,appstore,submission,review --output json
asc status --app "APP_ID" --until review-done --timeout 2h

# --- build upload ---
asc builds next-build-number --app "APP_ID" --version "1.2.3" --platform IOS --output json
asc builds upload --app "APP_ID" --ipa "./App.ipa" --version "1.2.3" --build-number "42" --wait --output json
asc builds info --app "APP_ID" --latest --version "1.2.3" --platform IOS --output json
asc builds wait --app "APP_ID" --build-number "42" --platform IOS --timeout 20m --report-pending --output json

# --- TestFlight ---
asc testflight groups list --app "APP_ID" --output json
asc testflight groups list --build-id "BUILD_ID" --output json
asc builds add-groups --build-id "BUILD_ID" --group "GROUP_ID" --dry-run
asc builds add-groups --build-id "BUILD_ID" --group "GROUP_ID" --submit --confirm
asc builds test-notes create --app "APP_ID" --build-number "42" --platform IOS --version "1.2.3" \
    --locale "en-US" --whats-new "Test instructions"
asc publish testflight --app "APP_ID" --ipa "./App.ipa" --group "GROUP_ID" --wait --notify

# --- App Store submission ---
asc validate --app "APP_ID" --version "1.2.3" --output json
asc release stage --app "APP_ID" --version "1.2.3" --build-id "BUILD_ID" \
    --copy-metadata-from "1.2.2" --dry-run
asc review submit --app "APP_ID" --version "1.2.3" --build-id "BUILD_ID" --confirm
asc publish appstore --app "APP_ID" --ipa "./App.ipa" --version "1.2.3" --submit --confirm
asc submit status --version-id "VERSION_ID" --output json
asc submit cancel --version-id "VERSION_ID" --app "APP_ID" --confirm

# --- money ---
asc analytics sales --vendor "12345678" --type SALES --subtype SUMMARY --frequency DAILY \
    --date "2026-11-01" --decompress --output "/tmp/daily_sales.tsv"
asc insights weekly --app "APP_ID" --source sales --week "2026-11-02" --vendor "12345678" --output json
asc analytics compare --source sales --vendor "12345678" --app "APP_ID" \
    --from "2026-10-01" --to "2026-11-01" --frequency DAILY --output json
asc finance reports --vendor "12345678" --report-type FINANCIAL --region "ZZ" --date "2026-10" --decompress

# --- discovery ---
asc search "external testers" --output json --limit 10
asc schema "GET /v1/builds" --pretty
asc capabilities --area release --output table
asc docs show workflows
```

## Appendix B — gotchas checklist for the UI implementers

1. `--output` is **not** global; root flags must precede the command name (only `--profile`
   may trail). Wrap your exec layer accordingly.
2. `asc analytics sales` / `asc finance reports` use `--output` for the **file path** and
   `--output-format` for the metadata format. Blindly appending `--output json` will write a
   file literally named `json`.
3. `asc auth status` and `asc auth doctor` default to JSON-ish output but with **different
   enums** (`table|json` and `text|json`). Always pass the flag explicitly.
4. Errors are prose on stderr; only the **exit code** is structured. 3 = auth, 2 = usage,
   1 = failure, 6 = read-only refusal, 7 = still pending.
5. `asc apps` == `asc apps list`, but `asc builds` is a pure group and rejects `--output`.
6. Version strings can have `v` or not, and `commit`/`date` are `unknown` on Homebrew
   source builds. Compare only the numeric part.
7. `--limit 0` = command default, not zero rows.
8. Some `--paginate` paths force page size 200 and change `--limit` semantics; some reject
   `--next` combined with query flags.
9. `asc testflight groups list --build-id` may return `complete=false` + non-zero exit with
   partial data — don't discard the payload.
10. `asc builds add-groups` can refuse to send when readiness is unprovable — treat as a
    surfaced warning, not a bug.
11. Never pass `--include-sensitive`; never echo `ASC_PRIVATE_KEY*`.
12. `asc status --until` / `builds wait --report-pending` exit 7 ≠ failure; it means "resume".
13. `asc release stage` exit 1 with applied steps is a **resumable** state, not a rollback.
14. Stale upstream docs exist (`asc auth capabilities`, `asc_v{ver}_…` asset names,
    `v`-prefixed versions). Trust `--help` on the installed binary over any doc, including
    this one, whenever they disagree.
