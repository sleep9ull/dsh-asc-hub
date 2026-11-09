# Changelog

All notable changes to `dsh-asc-hub` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-09

The first stable release: a working App Store Connect console inside DeepSeek Harness, built on the
open-source `asc` CLI as an inherited external engine.

### Added

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
- **Gate-sheet onboarding.** A three-segment progress rail and `Step n of 3`, the current step as the
  panel's only 20px headline behind a brand spine, passed steps reduced to one stamped line, upcoming
  steps to a numeral and a title, and every explanatory detail held at 11–12px secondary.
- **Console**: app selection, build inventory and IPA upload, TestFlight groups plus "What to Test"
  and beta review submission, release readiness with blockers, review status and submission behind an
  explicit confirmation, vendor-scoped sales summary for a day or a week, and analytics report
  requests.
- **`asc_hub` agent tool** over the same dispatcher, so the model can run the same operations, with a
  Host approval prompt for publishing and install actions.
- **Safety model**: `read-only` by default; publishing needs `mode: write`, `input.confirm === true`
  and an approval for the tool caller; redaction of key-shaped text on every outbound string; a
  read-only escape hatch enforced by `asc`'s own `--read-only` switch.
- **Documentation**: `AGENTS.md`, the authoritative wire contract, architecture, onboarding,
  operations, the upstream-inheritance boundary, and a model-facing skill.
- 33 tests: pure units, the gating matrix, and live checks against a real `asc` binary.

### Known limitations

- No streaming progress: a long operation reports one `busy` state and its result at completion
  (`asc --watch` NDJSON is the planned channel).
- Monthly sales roll-ups and the raw Sales and Trends TSV export are not modeled yet.
- Analytics report instances (granularity, processing date) are not walked; only report requests.
- One account/profile at a time; multi-team `asc --profile` switching is roadmapped.

[0.1.0]: https://github.com/sleep9ull/dsh-asc-hub/releases/tag/v0.1.0
