# The dev-to-release routine

The loop in one line: **iterate in the primary checkout on `main` — the tree the panel renders —
prove it on the live surfaces, commit; when the batch is worth someone else's restart, cut the one PR
of the cycle, merge it, publish from `main`, tag the published commit, then check discovery.**

This page is the routine; [docs/RELEASING.md](RELEASING.md) is the mechanism (what a version is, what
DSH reads, what each install kind can and cannot do). When they disagree, RELEASING is right.

## The loop

Edit `src/**`, run `npm run build`, then refresh the panel; the Host half additionally needs the
row reinstalled so its module generation reloads. `npm run verify` is the gate: `tsc --noEmit` on
all four projects, the 61 host tests against `dist/`, and the 248-check client smoke harness.

## 0. Two copies, one rule

| copy | how it gets in | code takes effect after | upgradable in place |
|---|---|---|---|
| **dev** — linked checkout | `plugin_manager` → `install_bundle` with `/Users/jinchunxu/dev/dsh-asc-hub` (`link:`) | page refresh (client) · app restart (host) | no, by design |
| **user** — registry | **Plugins → Add plugin** → `@sleep9ull/dsh-asc-hub` (`saveExact`) | restart when the Host says `restart-required` | yes: **Plugins → Installed → Versions → Update** |

**The rule: dev is linked, everything you hand to anyone else is registry.** A `link:` install has no
Versions section, so a user on one can never upgrade — which is why a checkout is never the answer to
"how do I install this".

One more boundary worth knowing before scripting anything: on this Desktop build the `desktop`
profile's package operations belong to the app shell (`plugin_manager` / the Plugins page), not to the
CLI — `dsh --profile desktop --dump-config` refuses with *profile "desktop" is managed exclusively by
the Electron application*, and the plugin-manager documentation states that Desktop package operations
remain owned by the Desktop shell. `dsh plugin --profile <name> add …` is the path for CLI-managed
profiles (`web`, `tui`, your own), not for the app you are testing in.

## 1. Daily loop

Work in the primary checkout, on `main`. The profile's `link:` points at that directory, so whatever
is checked out there is what the panel renders: no repointing, and no worktree to keep in sync. Commit
straight to `main` — a branch is only worth it for a change you want reviewed, and the release is the
one PR of the cycle.

```
npm run build   → refresh the page        (client half)
                → restart the Harness     (Host half, icon, locale, version)
```

A cycle is: change → check → live check → commit → push.

1. **Change one thing.** Client work is `src/client.ts` (plus the `en`/`zh` dictionaries inline
   there); Host work is `src/index.ts` + `src/host/**`.
2. **Static checks.** `npm run check` (four `tsc --noEmit` projects), then `npm test` (61 host tests
   against `dist/`) and `npm run smoke` (248 client checks).
3. **Live check — the step that gets skipped.**
   - Client: refresh the page. The trigger and panel must render with no `slot entry crashed in
     '<slot>'` in the console.
   - Host: the action must answer. Read the real state, do not trust a log line: `cordis_inspect_query`
     → host `Tool.listTools` for the schema, `asc_hub` (or the panel) for the value.
   - A new panel string must exist in **both** dictionaries; a new action must already have its row in
     `docs/CONTRACT.md` (contract first, then `ACTIONS`, then the tool's `INPUT_FIELDS`, then the client).
4. **Docs ride the same commit** when behavior changed: `docs/CONTRACT.md` for the wire, `README.md` for
   the user, `CHANGELOG.md` gets a line under `[Unreleased]` **only for user-visible changes**.
5. **Commit.** Style already in the log: `fix: …`, `design: …`, `docs: …`, `release: @sleep9ull/dsh-asc-hub X.Y.Z`.
6. **Do not bump the version here.** The version is a release artifact, not a commit artifact.

Fast path for a pure client tweak: `npm run check` → smoke → refresh. Nothing else changed, so
skip the rest.

## 2. Deciding to release

`[Unreleased]` in the CHANGELOG **is** the batch log. When its bullets describe one story a person
would notice, the batch is ready; when it is a pile of unrelated fixes, release anyway or you will
never ship.

| what changed | version | example |
|---|---|---|
| fix, docs, tests, styling | patch `x.y.Z+1` | `0.2.1` |
| new action, new panel surface, any `CONTRACT.md` table edit | minor `x.Y.0` | `0.2.0` |
| contract frozen, backward compatibility promised | `1.0.0` (not yet) | — |

Do **not** cut a release for: docs-only work, a refactor with no observable change, or a feature that
is half-wired (ship it when the panel or the tool can actually do it).

Rhythm: one release train per week at most (Wednesday is a fine default), and never let
`[Unreleased]` get older than two weeks. Same-day patch when the shipped version is wrong.

## 3. Release day (~20 minutes)

Run the two "green" and "rot" audits before touching the version; they are cheap and they are the two
things that silently break.

1. **Green sweep.** `npm test`, `node --experimental-strip-types client/__smoke__.mts`,
   `npm run check`.
2. **Rot audit.**
   - `engines.dsh` still matches what you actually tested (the Desktop runtime reports its version; a
     DSH minor needs a fresh pass and a widened range) — see RELEASING.
   - `docs/CONTRACT.md` matches the code. If they disagree, the contract wins and the code is the bug.
   - README's install line and the row title still read correctly (**App Store Connect Hub**).
3. **Branch.** From an up-to-date `main`, cut `release/X.Y.Z` — the one PR of the cycle. The edits
   below land on that branch, not on `main`.
4. **Bump.** `npm version X.Y.Z --no-git-tag-version`.
5. **CHANGELOG.** `[Unreleased]` → `## [X.Y.Z] — <date>`, fresh `[Unreleased]`, link reference at the
   bottom (`[X.Y.Z]: …/v/X.Y.Z`), and `[Unreleased]` comparing from `vX.Y.Z`.
6. **Pack check** (only when `files`/`exports` changed): `npm pack --dry-run`.
7. **Commit, PR, squash-merge.** `git commit -m "release: @sleep9ull/dsh-asc-hub X.Y.Z"`,
   `git push -u origin release/X.Y.Z`, `gh pr create`, then
   `gh pr merge <N> --squash --delete-branch --subject "release: @sleep9ull/dsh-asc-hub X.Y.Z"`.
   The merge writes a **new** commit hash on `main`; that commit is the release.
8. **Pull it.** In the primary checkout: `git checkout main && git pull --ff-only`. Confirm `git log -1` is the release commit and
   `git status --short` is empty. Never publish from the release branch: `gitHead` would record the
   pre-squash commit and no tag on `main` could match it.
9. **Publish.** `npm publish`. `prepublishOnly` re-runs `check` + tests, so a broken tree cannot ship.
   This step is irreversible — treat it as the one human decision in the routine.
10. **Tag and verify.** On that same commit: `git tag -a vX.Y.Z -m "X.Y.Z — <one line>"`,
    `git push origin vX.Y.Z`, then compare `git rev-parse vX.Y.Z^{commit}` with
    `npm view @sleep9ull/dsh-asc-hub@X.Y.Z gitHead`. Publishing from `main` after the merge makes them
    the same commit; if a squash ever separates them, compare `vX.Y.Z^{tree}` with `<gitHead>^{tree}`.
11. **Announce.** No GitHub Release to create: the tag, the CHANGELOG entry and the npm version page
    are the record. Say so explicitly when the `engines.dsh` floor moved.
12. **Dogfood the user path.** Switch the profile to the registry copy, restart, and confirm you are
    looking at what a user gets:

    ```
    plugin_manager → remove_bundle   @sleep9ull/dsh-asc-hub
    plugin_manager → install_bundle  @sleep9ull/dsh-asc-hub@X.Y.Z
    ```

    Check: footer reports `X.Y.Z`, **Plugins → Installed** shows the bundle with a **Versions**
    section, and **Add plugin** with `@sleep9ull/dsh-asc-hub` finds it by name. Then switch back to dev:

    ```
    plugin_manager → remove_bundle   @sleep9ull/dsh-asc-hub
    plugin_manager → install_bundle  /Users/jinchunxu/dev/dsh-asc-hub
    ```

    Staying on the registry copy between releases is also legitimate — just remember Host changes then
    need a reinstall instead of a refresh.

## 4. The 72 hours after

| when | what | why |
|---|---|---|
| T+0 | the dogfood in step 10 above | proves install, footer version and the Update surface |
| T+1 | `plugin_market` with query `@sleep9ull/dsh-asc-hub` | the shipped catalog looks generated from npm; verify instead of assuming |
| T+3 | still absent → listing request, and/or ship our own `@sleep9ull/dsh-asc-hub` index | Discover searches an index, **not npm**; without a listing the release is installable but unfindable |
| any time | watch npm download counts | the only adoption signal there is; the plugin collects no telemetry |

If the release is bad:

- **Deprecate, never unpublish.** `npm deprecate @sleep9ull/dsh-asc-hub@X.Y.Z "broken: <one line>"`. DSH shows the
  message in its version list and its updater will not offer a deprecated version.
- **Pull `latest` back** only if nobody sensible has upgraded: `npm dist-tag add @sleep9ull/dsh-asc-hub@X.Y.{Z-1}
  latest`.
- Publish the fix as `X.Y.Z+1`. A version number is never reused.

## 5. Incident loop (same day)

1. Reproduce on the **linked** copy checked out at the commit npm shipped —
   `npm view @sleep9ull/dsh-asc-hub@x.y.z gitHead`, then `git switch -c hotfix/x.y.z <sha>` or a
   worktree — so the fix is made against the code that shipped, not against `main`.
2. Fix, patch bump, `npm publish`, `git push origin main` from the hotfix branch, then cherry-pick the
   fix onto `main` and move `[Unreleased]` on.
3. `npm deprecate` the bad version with a sentence that tells a user what to do.

## 6. Maintenance cadence (not per release)

| every | what |
|---|---|
| DSH minor | run the plugin on it, widen `engines.dsh`, release, and update README's "Verified against" |
| `asc` minor | probe `host/asc.js`'s argv surface with read-only `asc <group> --help`; update the verified `asc` version in README/CHANGELOG |
| monthly | skim README / CONTRACT / AGENTS for drift; `git status` for stray files; confirm the profile still points at dev |
| quarterly | prune the roadmap; re-ask whether the self-hosted index is still needed once the catalog lists the package |

## 7. Anti-patterns (each one has cost a user)

- Publishing from a dirty tree, or with `[Unreleased]` half-written.
- Publishing from a release branch before its PR is squash-merged: `gitHead` keeps the pre-squash hash,
  and no tag on `main` can match it — 0.1.1 did exactly this.
- `npm unpublish`, or reusing a version number.
- The npm version, the CHANGELOG heading, the tag and `gitHead` disagreeing — a tag that points at a
  commit npm never received is worse than none.
- Bumping the version in a normal commit, so every refactor looks like a release.
- Treating a GitHub Release as the release action (DSH never reads it).
- Declaring an `engines.dsh` floor that excludes the prerelease runtime you actually use.
- Telling a user to install a `link:` path or a git spec.
- Shipping a gating or contract change as a patch.
- Adding a mutating action without a gate (AGENTS invariant 7).

## 8. Checklist card

```
PRE-FLIGHT
[ ] npm test / smoke / npm run check green
[ ] engines.dsh still true on the current DSH
[ ] CONTRACT.md matches the code; both locale dictionaries complete
[ ] README install line + row title correct

RELEASE
[ ] package.json version bumped
[ ] CHANGELOG: [Unreleased] → [x.y.z] — date, fresh [Unreleased], link ref
[ ] commit "release: @sleep9ull/dsh-asc-hub X.Y.Z", PR opened, squash-merged
[ ] main pulled; HEAD is the release commit, tree clean
[ ] npm publish (irreversible)
[ ] tag vX.Y.Z on that commit, pushed, and equal to gitHead

AFTER
[ ] dev→registry dogfood: footer version, Versions section, Add plugin finds it
[ ] T+1 discovery check (plugin_market)
[ ] T+3 listing request or self-hosted index
```

## 9. Where the rules come from

| rule | official source |
|---|---|
| installation, update, rollback, `saveExact`, "no Versions for link/git/tarball" | `@deepseek-ai/dsh-plugin-manager` README |
| `engines.dsh` / peer check, `includePrerelease`, version exemptions | `@deepseek-ai/dsh-app-boot` README |
| index format 1, default version, "no upgrade in Discover" | `@deepseek-ai/dsh-plugin-market` / `dsh-plugin-market-index` README |
| listing bar for the community catalog | awesome-dsh-plugin.com README |
| `dsh plugin` = pnpm in the profile directory | `dsh plugin --help` |
| keep-a-changelog / semver conventions | CHANGELOG header, this repo |
| the plugin's own invariants and required checks | `AGENTS.md` |
