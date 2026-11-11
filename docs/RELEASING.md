# Releasing `@sleep9ull/dsh-asc-hub`

How a version of this plugin becomes something a person can install, and how that person upgrades
later. The short version: **the version is `package.json`'s `version`, and the upgrade channel is
npm.** DeepSeek Harness never reads GitHub Releases.

## How DSH resolves a plugin version

Three facts, three places. None of them is a DSH-specific version registry.

| fact | lives in | read by |
|---|---|---|
| what version this code is | `package.json` `version` (semver) | install/inspect, `listBundles`, the panel footer (`status.hub.version`) |
| what the profile wants installed | the profile's `package.json` `dependencies` — an exact `x.y.z` for a registry install, `link:<dir>` for a checkout, or a git/tarball spec | the profile's package manager |
| what is actually loaded | `<profile>/node_modules/<name>/package.json` | module resolution |

Compatibility is a separate declaration, not a version number: `engines.dsh` (or, if absent,
`peerDependencies` on `@deepseek-ai/dsh*`). DSH checks it against the single runtime version before
a plugin mounts, with `semver.satisfies(runtime, range, { includePrerelease: true })`, so a range
has to accept the runtime you actually run — the Desktop app currently reports `0.2.2-rc.1`, which
`">=0.2.0"` accepts only *because* of `includePrerelease`. This repository declares:

```json
"engines.dsh": ">=0.2.2-rc.1 <0.3.0"
```

The upper bound is deliberate: this plugin uses `ctx.connection.fetch`, the sidebar slot and
`ctx.skills.register`, and a DSH minor may change them. When a new DSH line lands, verify here and
widen the range in the same release. A user stuck behind a refusal can grant a per-package exemption
(`compatibility.json` in the profile, `plugin_manager` → `set_version_exemption`, or
`dsh plugin --profile <profile> allow-version <pkg>@<version> --dsh-version <runtime> --accept-risk`),
but that is their risk decision, not a substitute for testing.

The gate is not advisory. Verified against this runtime with a throwaway bundle declaring an
impossible requirement:

```text
dsh: installation rejected: Plugin dsh-compat-probe@0.0.1 is incompatible with dsh 0.2.2-rc.1:
requirements {"engines.dsh":">=99.0.0"}. Running it may cause crashes or data loss.
dsh: nothing was installed.
```

`plugin_manager` reports it as `error.code: incompatible-version` with the refused version and the
unmet requirements, before any download runs. The same range also decides whether an installed
bundle may mount, so a bad declaration breaks upgrades, not just first installs. The mirror image
also holds: this repository's real range passed the check on the same host, which is why a linked
install still applies.

An empty or invalid range is treated as *incompatible*, so never write `"dsh": ""`.

## The upgrade channel is npm, not GitHub Releases

`plugin-manager` decides whether a bundle is `updatable` from the profile's dependency spec, then
asks the registry plan — `pnpm view <name> versions time dist-tags` — for versions above the
installed one. A bundle installed from a **registry spec under its own name** with a semver version
and no plugin management gets a **Versions** section on its page in **Plugins → Installed**, with
**Update** per version; anything installed from a link, a path, git or a tarball, and anything DSH
ships itself, gets no Versions section at all. The market (`Plugins → Discover`) is read-only about
upgrades: it shows `Update available` against the index's default version and leaves the action to
the Installed tab.

So:

- **npm publish is the release.** It is what makes `Update` appear.
- **There is a tag, and no GitHub Release.** Every version is tagged `v<version>` (annotated) on the
  tree `npm publish` shipped, so the tag and the packument's `gitHead`
  (`npm view @sleep9ull/dsh-asc-hub@0.1.1 gitHead`) mark the same tree and can be checked against each
  other: `git rev-parse v<version>^{tree}` must equal `git rev-parse <gitHead>^{tree}`. Compare trees,
  not commits — a squash merge keeps the tree and changes the hash, and 0.1.1 was published from a
  branch commit before its squash, so its `gitHead` (`49b706d`) and its tag (`33e80d9`) are different
  commits over one tree. The tag is created with the publish, never after it: `v0.1.0` once pointed
  three commits past the code npm received, which is the failure this rule exists to prevent. A
  GitHub Release is still not used — it would keep a second copy of notes the CHANGELOG owns.
- A git spec (`github:sleep9ull/dsh-asc-hub#<commit>`) still installs, pinned to a commit, but that
  profile can never be upgraded in place — only uninstall + reinstall.

## Version policy

While the plugin is pre-1.0:

| bump | when |
|---|---|
| `0.1.x` | behaviour fixes, docs, tests; the wire contract's action table is unchanged |
| `0.x.0` | new actions, new panel surface, new state fields; anything that edits `docs/CONTRACT.md`'s tables |
| `1.0.0` | when the action table, `HubState` and the gating classes are frozen |

Rules that never bend:

- A published version is immutable. Never reuse or overwrite one; npm allows an unpublish for 72
  hours and it is still the wrong tool — ship `0.2.1`.
- `package.json` `version`, the CHANGELOG heading (`## [0.2.0] — YYYY-MM-DD`) and the `v0.2.0` tag
  name one release. The packument's `gitHead` records the commit npm received and the tag marks the
  same tree, so a version, its notes, its code and its tag still name one thing.
- `HUB_VERSION` in `src/host/dispatch.ts` is read once from `package.json` at Host load, so the footer
  reports the version of the **loaded** copy: after a bump, restart the Host to see it. A linked
  checkout shows the new number only after a restart, not after a page refresh.

## Release checklist

The release is a pull request, and the publish happens from `main` after it merges.

1. **Green.** `npm run check` clean; `npm test` (Host) and
   `node --experimental-strip-types client/__smoke__.mts` (Client) green.
2. **Branch.** Cut `release/x.y.z` from an up-to-date `main`. A `git worktree` is fine for the edit;
   step 7 says where the publish has to run.
3. **Bump.** `npm version x.y.z --no-git-tag-version` — it edits `package.json` and
   `package-lock.json` and creates no tag.
4. **CHANGELOG.** Move `[Unreleased]` to `## [x.y.z] — <date>`, leave a fresh `[Unreleased]`, add
   `[x.y.z]: https://www.npmjs.com/package/@sleep9ull/dsh-asc-hub/v/x.y.z` at the bottom, and point
   `[Unreleased]` at `compare/vx.y.z...HEAD`.
5. **Contract.** If the wire changed, `docs/CONTRACT.md` changed in the same commit (invariant in
   `AGENTS.md`).
6. **Commit, PR, squash-merge.** `git commit -m "release: @sleep9ull/dsh-asc-hub x.y.z"`, push the
   branch, open the PR, then `gh pr merge <N> --squash --delete-branch`. The merge writes a **new**
   commit on `main`; that commit is the release and its hash is what npm will record.
7. **Pull it.** In the checkout you publish from — normally the primary one, not the worktree —
   `git checkout main && git pull --ff-only`. Confirm `git log -1` is the release commit and
   `git status --short` is empty. Publishing from the release branch records the pre-squash commit as
   `gitHead`, and no tag on `main` can then match it by hash.
8. **Publish.** `npm publish` — `prepublishOnly` re-runs `check` + tests, and refuses to publish a
   broken tree. `npm pack --dry-run` first if the `files` list changed (~122 kB packed, 46 files
   today). The README the registry renders is the tarball's `README.md` — English, since the
   translations are `README.zh.md`, `README.ko.md` and `README.ja.md` — and every link in it is
   absolute: npmjs.com does not resolve relative paths, so `README.zh.md`, `docs/**` and `icon.svg`
   must stay full URLs or they are 404s on the package page.
9. **Tag and verify.** On the published commit: `git tag -a vx.y.z -m "x.y.z — <one line>"` and
   `git push origin vx.y.z`. `git rev-parse vx.y.z^{commit}` must equal `npm view … gitHead`; if a
   squash ever separates them, compare `vx.y.z^{tree}` with `<gitHead>^{tree}` instead.
10. **Re-verify the published copy** the way a user gets it — remove the `link:` dependency and
    install the registry version (see below), then confirm the footer reports `x.y.z` after a restart.
11. **T+1 day:** ask `plugin_market` for `@sleep9ull/dsh-asc-hub`. Found → the catalog picked it up;
    absent → step 12.
12. **T+3 days, still absent:** open a listing request with the catalog, and/or publish our own
    `@sleep9ull/dsh-asc-hub` index (see [Distribution vs discovery](#distribution-vs-discovery-npm-ships-it-an-index-finds-it)).

Steps 11–12 are discovery only. Skipping them costs nothing at install time — **Add plugin** and
`dsh plugin add` read npm directly — but it costs every search in Discover.

First publish needs `npm login` once, with the account that owns the `@sleep9ull` scope. The package
is scoped, so npm treats a publish as **restricted** unless `publishConfig.access` says `public` —
that field is what keeps the first release from failing with a payment error. Check the name with
`npm view @sleep9ull/dsh-asc-hub version`: `E404` means nothing is published yet.

## Native install channels

The Harness plugin manager accepts four spec forms (`parseInstallSpec` in `dsh-plugin-manager`): a
registry `name` / `name@range`, an absolute path (or `file:` / `link:`), a git spec, and an
`https://…/*.tgz` URL. Only the first is an install path a user should be told to use: the path form
is the development link, a tarball is pinned to one artifact and never updates, and a git spec is a
fallback this project does not document.

| channel | what the user does | what has to be true | updates |
|---|---|---|---|
| **Plugins → Add plugin**, registry spec | paste `@sleep9ull/dsh-asc-hub` (optionally `@X.Y.Z`) | the version is on npm, at a registry the profile can reach | **Plugins → Installed → Versions** |
| **Discover**, market index | search and press install | an index lists the package at an npm version or a pinned git commit, and the user added the index under **Discover → Index sources** | per the index entry |
| git spec (`github:…`, repo URL) | paste it | nothing beyond the repo | `pnpm` re-resolves on install |

One consequence for a release: **publish to npm.** That is the only channel this project documents,
and it is also what makes the package appear in the community catalog, which is generated from npm —
a `git`-sourced entry only exists in an index that lists it explicitly.

## How a user upgrades, per install kind

| installed as | profile dependency | upgrade path |
|---|---|---|
| npm registry (what **Add plugin** produces — and Discover too, once the package is listed — saved **exact**) | `"@sleep9ull/dsh-asc-hub": "0.2.0"` | **Plugins → Installed →** the bundle's page → **Versions** → **Update**. The Host removes the old version and installs `@sleep9ull/dsh-asc-hub@0.2.1` with the same selection, and reinstalls the old one if the new one fails. The Installed list also flags **Update available**. |
| CLI-managed profile (`web`, `tui`, your own — **not** the Desktop app's profile, which the app shell owns) | same | `dsh plugin --profile <profile> add @sleep9ull/dsh-asc-hub@0.2.1` (forwards to pnpm). Recomposition follows; restart if the Host reports `restart-required`. |
| `plugin_manager` tool | same | `install_bundle` with spec `@sleep9ull/dsh-asc-hub@0.2.1`; under HMR a same-name install is refused with `already-installed`, so `remove_bundle` first (or let the user press Update). |
| linked checkout (this repository, `link:/Users/…/dsh-asc-hub`) | `"@sleep9ull/dsh-asc-hub": "link:…"` | `git pull` in the checkout, then restart the Desktop app / Host process (client-only edits need just a page refresh). **No Versions section** — a link install is not updatable by design. |
| git or tarball | `github:…` / a URL | Re-`add` the new spec. No Versions section. |

A version can also be pinned on the way in, which is the answer to "install exactly this one": the
market entry's **Versions** list offers **Install** per version; **Add plugin** accepts
`@sleep9ull/dsh-asc-hub@0.2.0`; `plugin_manager` → `install_bundle` takes the same spec; the CLI takes the same
string after `add`. Registry installs are saved **exact**, not as a range, so the profile never
drifts on its own.

## Distribution vs discovery: npm ships it, an index finds it

Two different surfaces read two different things, and conflating them is the easy mistake:

| surface | reads | finds a brand-new release? |
|---|---|---|
| `Plugins → Add plugin` | the **npm registry** (`pnpm view` against the chosen registry) | immediately, by exact name |
| `dsh plugin add` / `plugin_manager.install_bundle` | the **npm registry** | immediately |
| `Plugins → Discover` and the `plugin_market` tool | a **format-1 index document**, default `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` | only after the package is listed in that index |

**Discover does not search npm.** It fetches one curated JSON per configured index source and
searches that document's fields (name, author, keywords, every language of title/description,
categories, labels). A package published five minutes ago is invisible there until the catalog that
lists it is regenerated. Measured against the running app:

```text
plugin_market list_indexes   → one source: https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json
plugin_market query "memory" → 289 entries        (the index and the search work)
plugin_market query "@sleep9ull/dsh-asc-hub" → 0 entries     (not listed yet)
```

So `npm publish` makes the plugin **installable**; being listed makes it **findable**. Both are worth
doing, and they are separate steps.

### Getting listed

The shipped index is a third party's document, curated by
[awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) (their
[repo](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) documents the listing bar: it
installs with `dsh plugin add`, declares `dsh.bundle`, and does what its one-line description says).
This repository cannot publish into it. Sequence:

1. `npm publish` with the `dsh-plugin` / `deepseek-harness` keywords already declared in
   `package.json`.
2. **T+1 day:** re-run `plugin_market` with query `@sleep9ull/dsh-asc-hub`. The catalog looks generated from npm,
   so it may appear on its own — verify rather than assume.
3. **T+3 days, still absent:** open a listing request/PR against their repository with the package
   name.

### Our own index, named `@sleep9ull/dsh-asc-hub`

The fallback is an index we control, and it is named after the package: the index document's `title`
is `@sleep9ull/dsh-asc-hub` and its single entry's `title` is `@sleep9ull/dsh-asc-hub` too, so the Discover card, the
source picker and the search hit all read exactly the name people install by. The entry's `name`
stays the npm package name (`@sleep9ull/dsh-asc-hub`), and every version is `source: { "type": "npm" }` with its
`publishTimestamp` and `engines`.

```text
https://sleep9ull.github.io/dsh-asc-hub/index.json     (GitHub Pages)
# or an npm package served by jsDelivr, which is the reliable choice:
https://cdn.jsdelivr.net/npm/<index-package>/index.json
```

Users add it under **Plugins → Discover → Index sources**. A source gets 15 seconds to load, so keep
it small and CDN-served. Until either list exists, the README's install line is **Add plugin** with
`@sleep9ull/dsh-asc-hub` — which needs nothing but npm.

## What the plugin itself reports

The panel footer keeps a slot for the update tag and the `update.apply` action exists for the half
the plugin can update by itself (the `asc` engine: `engine.install('brew')`). For the plugin half the
Host answers `MANUAL_UPDATE_REQUIRED`, because installation belongs to the Plugin Manager and only it
holds the profile lock, the selection and the rollback. `status.update` is currently a constant
`{ available: false }`: the footer tag lights only for a host-side answer, and the authoritative
"update available" lives in **Plugins → Installed**.

## Build output

The published tarball ships `dist/` (built by `prepare`), never `src/`. `prepublishOnly` runs
`npm run verify` — both `tsc` projects, the host tests and the client smoke harness — so a publish
cannot leave a stale or broken build behind. `files` lists `dist`, not `src`.
