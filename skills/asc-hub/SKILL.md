---
name: asc-hub
description: Ship an iOS app through App Store Connect with the asc_hub tool. Use when the session built a build and the user wants to install the asc engine, check or set up App Store Connect sign-in, list apps and builds, upload to TestFlight, distribute to testers, submit for App Review, or read sales and analytics.
---

# asc-hub

`asc_hub` is the model adapter over the `@sleep9ull/dsh-asc-hub` Host dispatcher. It drives the open-source `asc`
CLI as an external engine, so the same commands work from a terminal. The plugin never stores
credentials and never asks for an Apple ID password: sign-in is an App Store Connect API key stored
by `asc` in the macOS Keychain.

Read actions run immediately. `engine.install` is a **local** action: it changes this machine, works
in the default `read-only` mode, and asks for Host approval when you call it. Publishing actions
(`builds.upload`, `testflight.distribute`, `testflight.submitBeta`, `release.submit`) run only when
the plugin is configured `mode: write`, the call sets `confirm: true`, and the human approves the
Host prompt. Signing in, signing out and switching profiles are **panel-only**: you cannot call them,
and an attempt returns `CLIENT_ONLY`.

## When to use

- The user wants to ship: upload a build, put it on TestFlight, submit a version for review.
- The engine or sign-in state is unknown: start with `status`.
- The user asks about App Store Connect data: apps, builds, groups, readiness, review state, sales.
- A read-only `asc` command this surface does not model is needed: use `run`.

## Calling

Arguments are flat on the tool, not nested under `input`:

```
asc_hub(action="status")
asc_hub(action="apps.list", limit=20)
asc_hub(action="release.readiness", appId="123456789", version="1.2.3")
asc_hub(action="release.submit", appId="123456789", version="1.2.3", confirm=true)
```

## Actions

| action | kind | arguments |
|---|---|---|
| `status` | read | — |
| `engine.detect` | read | — |
| `engine.install` | local-write (no confirm) | `method`: `"brew"` or `"curl"` |
| `auth.status` | read | — |
| `auth.doctor` | read | — |
| `auth.login` | panel-only — do not call | ask the user to sign in in the ASC Hub panel |
| `auth.importKey` | panel-only — do not call | ask the user to drop the `.p8` in the ASC Hub panel |
| `auth.logout` | panel-only — do not call | ask the user to remove the profile in the panel |
| `auth.switch` | panel-only — do not call | ask the user to switch profiles in the panel |
| `apps.list` | read | `limit?`, `name?` |
| `builds.list` | read | `appId`, `limit?` |
| `builds.upload` | write | `appId?`, `ipaPath`, `version?`, `buildNumber?`, `wait?`, `confirm` |
| `testflight.groups` | read | `appId` |
| `testflight.distribute` | write | `appId`, `buildId`, `groupIds?`, `groupNames?`, `whatsNew?`, `locale?`, `confirm` |
| `testflight.submitBeta` | write | `appId`, `buildId`, `confirm` |
| `release.readiness` | read | `appId`, `version?` |
| `release.status` | read | `appId` |
| `release.submit` | write | `appId`, `version?`, `buildId?`, `confirm` |
| `sales.summary` | read | `appId`, `vendorNumber?`, `period?` (`day`/`week`), `date?`, `week?` |
| `analytics.reports` | read | `appId` |
| `run` | read | `argv`, `cwd?`, `timeoutMs?` |

## Rules

- Need an app? `apps.list` first, then reuse its `id` as `appId`.
- Need a build? `builds.list`; `processingState` must be `VALID` before distributing or submitting.
- Sales are vendor-scoped: pass `vendorNumber`, or ask the user for it — it is the number in the
  App Store Connect **Sales and Trends** page URL. Missing it returns `VENDOR_REQUIRED`. With
  `period: "week"`, pass `week` as the week's start date; `date` applies to the day report.
- Never try to sign the user in or out. `auth.login`, `auth.importKey`, `auth.logout` and
  `auth.switch` are panel-only; a call returns `CLIENT_ONLY`. Ask the user to use the ASC Hub panel.
- Before any publishing write: say exactly what will change and get the user's agreement, then set
  `confirm: true`. Never set it pre-emptively. The Host approval prompt still appears.
- Never ask for an Apple ID password. Never echo `privateKeyPem`, a `.p8` path, a JWT or a key id in
  full; report only what the tool returns.
- Report error codes literally and follow the remedy. Never retry a failed write blindly.

## Error codes → next step

| code | next step |
|---|---|
| `ASC_NOT_INSTALLED` | `engine.install` with `method: "brew"` if `engine.detect` reports brew installed, else `"curl"`. |
| `BREW_MISSING` | Retry `engine.install` with `method: "curl"`. |
| `INSTALL_FAILED` | Show the redacted log; ask the user to run `brew install asc` or the installer themselves. |
| `ASC_AUTH_MISSING` | `auth.status` to confirm, then ask the user to sign in in the ASC Hub panel. You cannot run the sign-in. |
| `ASC_AUTH_FAILED` | The panel rejected the key. Ask the user to re-check key id / issuer id / key type (team vs individual) and retry in the panel; do not retry `auth.login` yourself. |
| `KEY_FILE_UNSAFE` | Tell the user to `chmod 600 "<path>"`, then retry in the panel. |
| `APP_NOT_SELECTED` | Ask which app, or `apps.list`. |
| `APP_NOT_FOUND` | Re-run `apps.list` and use a real id. |
| `VENDOR_REQUIRED` | Ask for the vendor number from the Sales and Trends page URL. |
| `PROCESSING_PENDING` | `builds.list` until `VALID`; retry later. Do not resubmit. |
| `READINESS_BLOCKED` | Show every blocker, fix the app, re-run `release.readiness`; do not submit. |
| `READ_ONLY_MODE` | Only publishing needs this. Tell the user to set `mode: write`; onboarding actions do not need it. |
| `CLIENT_ONLY` | You tried a human-only sign-in action. Ask the user to use the ASC Hub panel; never retry it. |
| `CONFIRM_REQUIRED` | Get explicit agreement, then retry with `confirm: true`. |
| `APPROVAL_DENIED` | Stop. Ask again only if the user raises it; a denial is a decision. |
| `TIMEOUT` | Retry once; long uploads and submissions need patience. |
| `ASC_FAILED` | Read the message, fix the cause (often a role or state problem), then retry once. |
| `INVALID_INPUT` | Fix the named field; `asc` usage errors name the flag. |
| `UNSUPPORTED_ACTION` | Use an action from the table. |

## Examples

**1. Engine and sign-in state**

```
asc_hub(action="status")
```

If the label is `engine`, run `engine.detect` then `engine.install` (approve the Host prompt). If it
is `login`, the user signs in: tell them to open the ASC Hub panel and enter the API key id, issuer id
and `.p8` path there. You never ask for an Apple ID password and you never run the sign-in yourself;
poll `status` after they finish.

**2. Upload, then distribute a processed build**

```
asc_hub(action="apps.list", name="MyApp")
asc_hub(action="builds.upload", appId="123456789", ipaPath="/abs/path/MyApp.ipa", wait=true, confirm=true)
asc_hub(action="builds.list", appId="123456789", limit=5)          # wait for VALID
asc_hub(action="testflight.groups", appId="123456789")
asc_hub(action="testflight.distribute", appId="123456789", buildId="BUILD_ID", groupNames=["External Testers"], whatsNew="Try the new import flow", confirm=true)
```

**3. Readiness, then App Review submission**

```
asc_hub(action="release.readiness", appId="123456789", version="1.2.3")
asc_hub(action="release.submit", appId="123456789", version="1.2.3", confirm=true)
```

Submit only when readiness reports no blockers and the user has agreed. A monthly sales roll-up is
not available: `period` accepts `day` (default) or `week`.

## Where the rest of asc lives

This surface models the shipping funnel: status, apps, builds, TestFlight, release, sales. Everything
else — metadata, screenshots, signing, pricing, ads, crash triage, workflows — belongs to asc's own
skill pack. `status` reports it as `skills.installed`: when true, the `asc-*` skills are already in
the catalog, so use them; when false, tell the user to install the pack (the console has the button,
or they can run `asc install-skills`).

For upload, TestFlight, submission and the reads the panel shows, prefer `asc_hub` over a raw `asc`
command: only the tool carries the mode gate, the explicit confirmation and the redaction the user
was promised in the panel.
