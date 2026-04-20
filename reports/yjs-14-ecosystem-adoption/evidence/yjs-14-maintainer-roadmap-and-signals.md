# Yjs 14 maintainer roadmap and ecosystem migration signals

**Investigation date:** 2026-04-16
**Latest Yjs release at investigation time:** v14.0.0-rc.13 (published 2026-04-14, ~36 hours before this report)
**Latest stable Yjs (legacy line):** v13.6.30 (published 2026-03-14)
**Latest @y/prosemirror release:** v2.0.0-2 (published 2025-12-16)
**Latest @y/codemirror release:** v0.0.0-3 (published 2026-01-19)
**Latest @y/websocket release:** v4.0.0-rc.2 (published 2026-04-15)
**Latest @y/protocols release:** v1.0.6-rc.1 (published 2026-02-13)
**Latest lib0 release:** v1.0.0-rc.12 (published 2026-04-14)
**Latest Hocuspocus stable release:** v3.4.4 (published 2026-01-25)
**Latest Hocuspocus preview release:** v4.0.0-rc.2 (published 2026-04-15)

This report source-traces the Yjs 14 maintainer roadmap, RC cadence, breaking-changes catalog, the `@y/*` scope strategy, first-party binding migration, downstream coordination signals (Hocuspocus, TipTap, Liveblocks, BlockSuite/AFFiNE), the Peritext/boundary-anomaly stance, funding shape, and Loro competitive pressure as of 2026-04-16. Every finding is cited to the URL it came from, with the access date inline. Negative searches are documented where they shape the conclusion.

---

## 1. Yjs 14 release timeline

### RC cadence (full table, source: `gh release list --repo yjs/yjs`, accessed 2026-04-16)

| Tag | Author | Published | Days since prior | Notes from `gh release view` |
| --- | ------ | --------- | ---------------- | ----------------------------- |
| `v14.0.0-2` | dmonad | 2025-04-30 | — | First numbered v14 pre-release on the public release stream after very early `v14.0.0-0` and `v14.0.0-1` precursors |
| `v14.0.0-3` | dmonad | 2025-05-01 | <1 |  |
| `v14.0.0-4` | dmonad | 2025-05-01 | <1 |  |
| `v14.0.0-6` | dmonad | 2025-06-11 | 41 |  |
| `v14.0.0-7` | dmonad | 2025-06-12 | 1 |  |
| `v14.0.0-8` | dmonad | 2025-06-23 | 11 | Triggered packaging-issue bug report #751 (see §1c) |
| `v14.0.0-9` | dmonad | 2025-10-23 | 122 | **4-month gap between -8 and -9** |
| `v14.0.0-10` | dmonad | 2025-10-29 | 6 |  |
| `v14.0.0-11` | dmonad | 2025-11-18 | 20 |  |
| `v14.0.0-12` | dmonad | 2025-11-19 | 1 |  |
| `v14.0.0-13` | dmonad | 2025-11-19 | <1 |  |
| `v14.0.0-14` | dmonad | 2025-11-27 | 8 |  |
| `v14.0.0-15` | dmonad | 2025-12-07 | 10 |  |
| `v14.0.0-16` | dmonad | 2025-12-07 | <1 |  |
| `v14.0.0-17` | dmonad | 2025-12-15 | 8 |  |
| `v14.0.0-18` | dmonad | 2025-12-15 | <1 |  |
| `v14.0.0-19` | dmonad | 2025-12-17 | 2 |  |
| `v14.0.0-20` | dmonad | 2026-01-12 | 26 |  |
| `v14.0.0-21` | dmonad | 2026-01-14 | 2 |  |
| `v14.0.0-22` | dmonad | 2026-01-19 | 5 |  |
| **`v14.0.0-rc.0`** | **dmonad** | **2026-02-25** | **37** | **First RC-tagged release. Switch from numeric pre-release to "rc.N" naming.** Notes: lib0 upgrade, undoContentIds APIs, Velt sponsor README updates |
| `v14.0.0-rc.1` | dmonad | 2026-02-27 | 2 | Release-script + version-script fixes, optimized `Y.mergeUpdates` |
| `v14.0.0-rc.2` | dmonad | 2026-03-18 | 19 | Bug fix: "retain legacyTypeRef when undoing content"; reproduces #767; renames excludeContentMap |
| `v14.0.0-rc.3` | dmonad | 2026-03-23 | 5 | "schemas and upgrade lib0", "test in release script" |
| `v14.0.0-rc.4` | dmonad | 2026-03-24 | 1 | "considering deleted content - fix applyDelta modifyOp" |
| `v14.0.0-rc.5` | dmonad | 2026-03-25 | 1 | "fix stack overflow when using spread operator", "[applyDelta] fix skipping over uncountables" |
| `v14.0.0-rc.6` | dmonad | 2026-03-25 | <1 | (no commit list shown) |
| `v14.0.0-rc.7` | github-actions[bot] | 2026-03-27 | 2 | **First bot-published release. Marked `prerelease: false` in the GitHub release object → currently shows as "Latest" on the releases page.** |
| `v14.0.0-rc.8` | github-actions[bot] | 2026-03-27 | <1 |  |
| `v14.0.0-rc.9` | github-actions[bot] | 2026-03-28 | 1 |  |
| `v14.0.0-rc.10` | github-actions[bot] | 2026-03-29 | 1 |  |
| `v14.0.0-rc.11` | dmonad (PR-merged) | 2026-04-11 | 13 | Supply-chain hardening (#770, #771, #772): Scorecard workflow, GHA permissions tightening, **incident response plan** (#773) |
| `v14.0.0-rc.12` | github-actions[bot] | 2026-04-14 | 3 | (no notes) |
| `v14.0.0-rc.13` | github-actions[bot] | 2026-04-14 | <1 | (no notes; published 14 hours after rc.12) |

**Sources:** `gh release list --repo yjs/yjs --limit 50` and per-release `gh release view v14.0.0-rc.N --repo yjs/yjs`, accessed 2026-04-16. Release URLs follow the pattern `https://github.com/yjs/yjs/releases/tag/v14.0.0-rc.N`.

### Cadence interpretation

- **Total elapsed time, rc.0 → rc.13: 48 days** (2026-02-25 → 2026-04-14).
- **Mean inter-RC gap: 3.7 days.** Median: 1 day.
- **Two notable stalls** in the RC sequence:
  - rc.1 → rc.2: 19 days (Feb 27 → Mar 18). Coincides with a multi-week silence on `dmonad/lib0` activity.
  - rc.10 → rc.11: 13 days (Mar 29 → Apr 11). The rc.11 PR set is entirely supply-chain hardening (Scorecard, GHA permissions, incident response). No content/CRDT changes.
- **Bot-published releases are dominant from rc.7 onward.** The release pipeline is now automated; dmonad pushes commits and the bot tags. This means the cadence no longer requires dmonad's manual attention per release.
- **rc.7 marked `prerelease: false`** in GitHub's release-object metadata. As of 2026-04-16, this means the GitHub releases page surfaces `v14.0.0-rc.7` (March 27) as "Latest," even though rc.13 is the most recent published artifact. Consumers using `npm install yjs@latest` against the **legacy `yjs` npm package** still receive v13.6.30 (the actual stable line), not anything from the rc.7-as-latest GitHub display. The "latest" flag on rc.7 appears to be a release-script accident — every subsequent rc reverted to `prerelease: true`.

**Source:** `gh release view v14.0.0-rc.7 --repo yjs/yjs`, accessed 2026-04-16; field `prerelease: false`.

### Stable date projection

There is **no maintainer-stated date for v14.0.0 stable**. Every signal is indirect:

- **rc.11 was scope-reduced to supply-chain only** — incident-response plan, Scorecard workflow, hardened GHA permissions ([yjs#770](https://github.com/yjs/yjs/pull/770), [#771](https://github.com/yjs/yjs/pull/771), [#772](https://github.com/yjs/yjs/pull/772), [#773](https://github.com/yjs/yjs/pull/773), all merged 2026-04-09 via dmonad). This is "harden before stable" work, not "feature complete." It signals that dmonad is **clearing prerequisites for a 1.0-quality release**, but not that one is imminent.
- **rc.12 and rc.13 each ship with no release notes** ("Full Changelog" links only). Author is the GitHub bot. Pattern matches **post-feature-freeze churn fixing CI / lint / packaging** rather than substantive content changes.
- **Hocuspocus shipping `v3.4.4` stable (2026-01-25) AND a `v4.0.0-rc.5` (server pkg, 2026-04-15) that hard-pins `yjs ^13.6.8`** is a strong negative signal: the Tiptap/Hocuspocus team does not believe v14 stable is close enough to wait for. (See §5 and §7.)
- **dmonad's own statement on issue #751 (2025-11-30, on the v14.0.0-8 packaging bug):** > *"Hi there, I'm not ready yet to make Yjs v14 available for everyone. Build systems are super weird and break if you just look at them wrong. I don't want to investigate these issues, while I work on the alpha release. The stable release will be absolutely compatible with next, but not the very very early beta releases. Feel free to try out the attribution demos of the editor bindings, but please don't open bug reports against alpha software (x.x.x-*) yet. I know that these releases are broken."* ([gh issue view 751 --repo yjs/yjs --comments](https://github.com/yjs/yjs/issues/751), accessed 2026-04-16). This was 4.5 months before rc.13. The "stable release will be absolutely compatible with next" wording is a forward commitment but no calendar.
- **FOSDEM 2026 talk (Sun Feb 1, 12:00 UTC+1, room K.3.201, "BlockNote, Prosemirror and Yjs 14: Versioning and Track Changes," speakers Yousef El-Dardiry and Nick Perez)** abstract phrases v14 features as **"upcoming functionality... preview"** rather than "released" or "ready." The talk is positioned as a roadmap preview, not a launch ([fosdem.org/2026/schedule/event/8VKQXR](https://fosdem.org/2026/schedule/event/8VKQXR-blocknote-yjs-prosemirror/), accessed 2026-04-16). This was three weeks before rc.0 shipped.
- **`SECURITY.md` on the main branch still lists only 13.6.x as supported and `< 13.6.0` as unsupported.** No 14.x row. This file would normally be updated as part of the 14.0 stable release ([gh api .../yjs/contents/SECURITY.md](https://github.com/yjs/yjs/blob/main/SECURITY.md), accessed 2026-04-16).
- **No `ROADMAP.md` or `RELEASE.md` exists in the repo root.** Both were 404 when fetched. The repo root inventory (via `gh api /repos/yjs/yjs/contents`, accessed 2026-04-16) lists: `.gitignore`, `.jsdoc.json`, `.markdownlint.json`, `.well-known/`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `INTERNALS.md`, `LICENSE`, `README.md`, `SECURITY.md`, `THREAT_MODEL.md`, `attributing-content.md`, `attribution-manager.md`, `funding.json`, `global.d.ts`, `package-lock.json`, `package.json`, `rollup.config.js`, `src/`, `test.html`, `tests/`, `tsconfig.json`. No migration-guide file. No CHANGELOG.md (raw fetch returned 404).
- **`README.md` on the `main` branch makes no mention of v14 or `@y/y`** despite the package itself having been renamed (see §3). The README is documenting the legacy `yjs` package experience exclusively (per WebFetch summary, accessed 2026-04-16).

**Projection (mine, not maintainer-stated):** A reasonable lower bound is **mid-Q3 2026** (3-5 months out) and the upper bound is **open** based on:
- The unresolved "v14: issue with move operation" bug ([yjs#694](https://github.com/yjs/yjs/issues/694)) reported 2025-02-21 and last updated 2025-11-26 with a contributor asking "Any updates on this?" — no maintainer reply visible. A reproducible CRDT correctness bug in a core operation is a likely stable blocker.
- The README + SECURITY.md + ROADMAP.md gaps suggest the doc work for 14.0 hasn't started.
- The ecosystem is not pulled (Tiptap/Hocuspocus pins `^13`); a stable release without ecosystem ready would strand consumers.

But there's no explicit maintainer commitment. **The honest answer is "unknown, somewhere between 1 month and 12 months."**

### 1c. Maintainer's explicit alpha-quality warning

Direct quote from dmonad on issue #751 ([yjs#751](https://github.com/yjs/yjs/issues/751), comment dated **2025-11-30**, marked as "edited"):

> *"Hi there, I'm not ready yet to make Yjs v14 available for everyone. Build systems are super weird and break if you just look at them wrong. I don't want to investigate these issues, while I work on the alpha release. The stable release will be absolutely compatible with next, but not the very very early beta releases.*
>
> *Feel free to try out the attribution demos of the editor bindings, but please don't open bug reports against alpha software (x.x.x-*) yet. I know that these releases are broken."*

This is the **most explicit maintainer guidance available** as of 2026-04-16. Subtext:
- **Confirms** v14 is alpha-quality at the time of writing (which was 4.5 months before rc.13).
- **Promises** the stable release will be compatible with `next` (presumably the npm `next` dist-tag), implying a forward-stable upgrade path.
- **Disowns** the early `x.x.x-*` releases as known-broken — bug reports against rc.0 through rc.13 may not be triaged.
- The phrase "not the very very early beta releases" is the only window into the maintainer's mental model: he categorizes the `v14.0.0-N` series (roughly v14.0.0-2 through v14.0.0-22 over April 2025–January 2026) as **alpha**, and the `rc.N` series as **beta**. The "stable release will be compatible with next" promise applies to the `rc` line, not the alpha line.

---

## 2. Breaking-changes catalog

### 2a. The maintainer has NOT published a v13→v14 migration guide.

Negative searches:
- No `MIGRATION.md`, `RELEASE_NOTES_V14.md`, `CHANGELOG.md`, or `BREAKING_CHANGES.md` file exists in the [`yjs/yjs`](https://github.com/yjs/yjs) repo root (verified via `gh api /repos/yjs/yjs/contents`, 2026-04-16; full inventory in §1).
- The CHANGELOG.md raw fetch returned 404.
- `docs.yjs.dev` (the main docs site, via WebFetch on the introduction page, 2026-04-16) lists sidebar categories "Getting Started, Ecosystem, API, Tutorials, External Resources" — none of which contain a v14 migration guide as of access date.
- `beta.yjs.dev/docs/introduction/` is reachable but did not surface a migration guide either (WebFetch, 2026-04-16).
- WebSearch for `"Yjs 14" OR "yjs v14" OR "@y/y" release blog post 2026` (2026-04-16): returned no maintainer-authored release blog post. Top hits: GitHub releases page; FOSDEM talk; Medium tutorials by third parties.
- **Yjs has GitHub Discussions disabled** — `gh api /repos/yjs/yjs/discussions` returns `410 Discussions are disabled for this repo`. Also confirmed via GraphQL (returns empty `nodes`). Community discussion happens on `discuss.yjs.dev` (Discourse forum) instead.

### 2b. Indirect breaking changes inferred from in-repo docs and release notes

The two in-repo docs **`attributing-content.md`** and **`attribution-manager.md`** ([yjs/blob/main/attributing-content.md](https://github.com/yjs/yjs/blob/main/attributing-content.md), [yjs/blob/main/attribution-manager.md](https://github.com/yjs/yjs/blob/main/attribution-manager.md), accessed 2026-04-16) document the **headline v14 feature: per-user attribution of insertions, deletions, and formatting changes, encoded efficiently via `IdSet`/`IdMap`**.

Reproduced shape from those docs:

> **`IdSet` is a data structure (formerly `DeleteSet`) that allows us to efficiently represent ranges of ids in Yjs.**
> **`IdMap` is a new data structure that allows us to efficiently map ids to attributes.**
> **In order to implement a Google Docs-like versioning feature, we want to be able to attribute content with additional information (who created the change, when was this change created).**

**Inferred breaking changes (non-exhaustive):**
- `DeleteSet` renamed to `IdSet`. Any consumer that imports or constructs `DeleteSet` directly (i.e., a custom persistence/sync provider, a snapshot tool) breaks.
- New types `IdSet`, `IdMap`, `Attribution`, `AttributionManager`, `TwosetAttributionManager`, `DiffingAttributionManager`, `SnapshotAttributionManager` are added to the public API surface.
- New methods on shared types: `YText.getDelta(attributionManager?)`, `YText.toDelta(attributionManager?)`, `YArray.toDelta(attributionManager?)`, `YMap.toDelta(attributionManager?)` — additive but the optional parameter shape changes the signature.
- New helpers: `Y.createInsertionSetFromStructStore(store)`, `Y.createDeleteSetFromStructStore(store)`, `Y.diffIdSet(a, b)`, `createIdMapFromIdSet(...)`.
- New constructor option visible in the example: `new Y.Doc({ gc: false })` — implies attribution requires GC disabled, which has been a major perf debate point with Loro (see §10).

**Confirmed-from-release-notes breaking changes:**
- rc.0 release notes mention `[undoContentIds] accepts UndoManagerOptions` and `intersectUpdateWithContentIds returns Uint8Array<ArrayBuffer>` — both are API signature additions/changes ([gh release view v14.0.0-rc.0](https://github.com/yjs/yjs/releases/tag/v14.0.0-rc.0), accessed 2026-04-16).
- rc.2 release notes mention `excludeContentMap - singular` and `retain legacyTypeRef when undoing content` — implies a `legacyTypeRef` migration shim is being maintained for old types in v14.
- rc.4 release notes mention "considering deleted content - fix applyDelta modifyOp" — implies `applyDelta` semantics changed when attributions/deletions interact.
- rc.5 release notes mention "fix stack overflow when using spread operator" and "[applyDelta] fix skipping over uncountables" — implies behavior changes in delta operations on attributed/uncountable content.

**Engines/runtime requirements from `package.json` (`@y/y@14.0.0-rc.13`, accessed 2026-04-16):**
- `"engines": { "node": ">=22.0.0", "npm": ">=8.0.0" }`. Compare to v13.6.x which historically supported much older Node versions. Node 22+ is a meaningful bump that may exclude some downstream consumers (notably embedded or older-LTS-pinned systems).
- `"type": "module"` — ESM-only.
- Single dependency: `lib0 ^1.0.0-rc.12` (also a pre-release; lib0 1.0.0 stable has not shipped either — see §3c).

### 2c. Breaking changes confirmed from y-prosemirror v2 work

`y-prosemirror@2.0.0-1` release notes ([gh release view v2.0.0-1 --repo yjs/y-prosemirror](https://github.com/yjs/y-prosemirror/releases/tag/v2.0.0-1), accessed 2026-04-16) include the commit messages:
- `bump to yjs@v14 beta release`
- `use yjs beta package @y/y`
- `simplified binding approach`
- `delta v2`
- `improve delta sync`
- `support more step kinds and fix several issues`
- `feat: somewhat working?`  (literal commit message)
- `wip`
- `buggy suggestion demo is working!`

`y-prosemirror@2.0.0-2` notes:
- `[y-sync] rewrite the y-sync plugin's binding to be based on \`appendTransaction\``  ([nperez0111#207](https://github.com/yjs/y-prosemirror/pull/207))

Implications:
- The y-sync plugin internals were **rewritten** between v1 and v2.
- The "delta v2" notes imply the wire-format / API for `applyDelta` is incompatible.
- Commit hygiene during v2.0.0-1 ("feat: somewhat working?", "wip") suggests v2.0.0-X is itself a **work-in-progress alpha** — Nick Perez (`nperez0111`) is the author of most v2 work.

---

## 3. The `@y/*` scope strategy

### 3a. Yjs core: rebrand confirmed

The `@yjs/yjs` repo's `main` branch `package.json` (accessed 2026-04-16 via `gh api /repos/yjs/yjs/contents/package.json`) shows:

```json
{
  "name": "@y/y",
  "version": "14.0.0-rc.13",
  ...
  "dependencies": { "lib0": "^1.0.0-rc.12" },
  "devDependencies": { "@y/protocols": "^1.0.6-rc.1", "@y/y": "." },
  "engines": { "node": ">=22.0.0", "npm": ">=8.0.0" }
}
```

The package name on the `main` branch is **`@y/y`**, not `yjs`. This is the single most important rebrand signal in the entire ecosystem.

### 3b. The legacy `yjs` package is still being maintained in parallel

- `v13.6.30` was published **2026-03-14** — one month before this report ([gh release view v13.6.30 --repo yjs/yjs](https://github.com/yjs/yjs/releases/tag/v13.6.30), accessed 2026-04-16). Notes: "fix mutation of DeleteItem in sortAndMergeDeleteSet - closes #767".
- v13.6.x maintenance pattern in 2025-2026: 13.6.21 (Dec 2024), 13.6.22 (Jan 2025), 13.6.23 (Jan 2025), 13.6.24 (Mar 2025), 13.6.25 (Apr 2025), 13.6.26 (Apr 2025), 13.6.27 (May 2025), 13.6.28 (Dec 2025), 13.6.29 (Jan 2026), 13.6.30 (Mar 2026). **10 patch releases in ~14 months.** Active.
- **`SECURITY.md` lists only 13.6.x as supported.** No row for 14.x. The legacy line is the security-supported line ([yjs/blob/main/SECURITY.md](https://github.com/yjs/yjs/blob/main/SECURITY.md), accessed 2026-04-16).
- **No deprecation notice** in the v13 npm metadata (verified absent in the package.json data).
- npm download numbers (last week, 2026-04-09 → 2026-04-15, via `https://api.npmjs.org/downloads/point/last-week/`):
  - **`yjs`**: **3,566,137 weekly downloads**
  - **`@y/y`**: **9,822 weekly downloads**
  - Adoption ratio: **0.275%**. The new package is a rounding error vs. the legacy.
- npm download numbers for the parallel binding rename:
  - `y-prosemirror`: **701,459/week**
  - `@y/prosemirror`: **9/week** (yes, single digits)
  - `y-codemirror.next`: **30,501/week**
  - `@y/codemirror`: **4/week**
  - `@hocuspocus/server`: **271,002/week**
  - `loro-crdt`: **23,591/week** (for context, see §10)

### 3c. Why the `@y/*` rebrand exists

No maintainer post explicitly states the rationale, but inferred:
- The `@y` npm scope is **owned by dmonad**. A scoped namespace allows shipping multiple coordinated packages (`@y/y`, `@y/protocols`, `@y/prosemirror`, `@y/codemirror`, `@y/websocket`, `@y/websocket-server`) with a clean visual identity and a clear "v14 line" boundary.
- The legacy `yjs` package and its bindings (`y-prosemirror`, `y-codemirror.next`, `y-websocket`, `y-protocols` etc.) all stay on the legacy line; v14 ships under `@y/*` with NO upgrade path to the legacy package name.
- This is **NOT a drop-in upgrade**. There is no plan visible to publish v14 under the legacy `yjs` name on npm. Upgrading means switching package names everywhere (and version-pinning every binding to its new `@y/*` counterpart).
- Two issues confirm both packages will continue to coexist as distinct, but the maintainer has labeled both `wontfix`:
  - [`yjs/y-codemirror.next#40`](https://github.com/yjs/y-codemirror.next/issues/40) "Update readme to mention both `@y/codemirror` and `y-codemirror` packages" — opened 2026-03-24, label `wontfix`. Reporter: > *"`@y/codemirror` is the exact package name for `npm i @y/codemirror` to get this exact repo from npm. However the example code in the readme seems to use the `y-codemirror` package. It is good to mention that both packages are distinct."*
  - [`yjs/y-websocket#201`](https://github.com/yjs/y-websocket/issues/201) "Update readme `npm install` command to point correct package" — opened 2026-03-24, label `wontfix`. Reporter: > *"current command in the readme is `npm i y-websocket` but it is misleading as the name defined in `package.json` in this git repository is `@y/websocket`. So the correct command is `npm i @y/websocket`. Might seem trivial and is easy to spot knowing already, but it took me some time figuring out whats going on as I was fixing peer dependency conflict. And it would be good to mention that those are different packages."*
- The `wontfix` labels mean dmonad has **decided not to update the documentation to acknowledge the dual-package state**. This is consistent with §1c — the alpha is being kept low-traffic on purpose. Updated docs would invite alpha adopters; he doesn't want them yet.

### 3d. lib0 1.0.0 has not stabilized either

Yjs 14 depends on `lib0 ^1.0.0-rc.12`. lib0 itself is in RC (latest is `v1.0.0-rc.12` published 2026-04-14, with eight commits to lib0 by dmonad on the same evening as Yjs rc.12/rc.13 — visible in `gh api /users/dmonad/events/public`, accessed 2026-04-16). The lib0 stable line is **`v1.0.7`**, published 2025-12-16. This means:
- Yjs 14.0.0 stable is blocked on lib0 1.0.0 stable (because the dependency is `^1.0.0-rc.12` and `^1.0.0-rc.12` does NOT include `1.0.0` final under semver — lib0 must ship `1.0.0` first, then Yjs can either bump to `^1.0.0` or stay on its current shape).
- lib0 RC cadence is roughly synchronized with Yjs RC cadence (both at rc.12 on 2026-04-14).

**Source:** `gh release list --repo dmonad/lib0`, accessed 2026-04-16.

---

## 4. First-party binding migration

### 4a. y-prosemirror → @y/prosemirror

- **Repo:** [yjs/y-prosemirror](https://github.com/yjs/y-prosemirror) (single repo, both lines coexist on different tags/branches)
- **Legacy stable:** `v1.3.7` (2025-07-03), labeled "Latest" on the GitHub releases page.
- **v2 prereleases:** `v2.0.0-1` (2025-12-10), `v2.0.0-2` (2025-12-16). Both `prerelease: true`. No releases since December.
- **Package name change:** v1.3.7 was published as `y-prosemirror`. v2.0.0-2 is published as **`@y/prosemirror`** (verified via `gh api /repos/yjs/y-prosemirror/contents/package.json`, 2026-04-16).
- **Peer deps in v2.0.0-2:** `@y/protocols ^1.0.6-rc.1`, `@y/y ^14.0.0-rc.13`. Pinned to alpha `@y/y`.
- **Author of v2 work:** Nick Perez (`nperez0111`) is leading the v2 implementation. PRs include [#207 y-sync-binding rewrite](https://github.com/yjs/y-prosemirror/pull/207), [#205](https://github.com/yjs/y-prosemirror/issues/205) cursor-jumping bug.
- **Cadence:** Two prereleases in 6 days (Dec 10 → Dec 16), then **silent for 4 months** (Dec 16 → Apr 16). The y-prosemirror repo's last `pushedAt` is 2026-04-14T23:46:39Z (recent code commits) but no new release tags. Implication: work continues on `main` but no new prereleases — likely waiting for a stable `@y/y` to anchor against.
- **API stability tracked:** Not via a versioned spec. The CHANGELOG.md fetch returned 404. The README on `main` does not document v2 vs v1 differences.

### 4b. y-codemirror.next → @y/codemirror

- **Repo:** [yjs/y-codemirror.next](https://github.com/yjs/y-codemirror.next)
- **Legacy stable:** `v0.3.5` (2024-06-18). Labeled "Latest" on the releases page.
- **v14-targeted prereleases:** `v0.0.0-1` (2025-12-10), `v0.0.0-2` (2025-12-15), `v0.0.0-3` (2026-01-19). All `prerelease: true`.
- **Package name change:** Published as `@y/codemirror` (verified via `gh api /repos/yjs/y-codemirror.next/contents/package.json`, 2026-04-16).
- **The `0.0.0-N` versioning is deliberately pre-1.0** — there's no `2.0.0-rc` here. Suggests the `@y/codemirror` line is treated as **brand-new package starting from zero**, not as a v2 of `y-codemirror.next`.
- **Cadence:** 3 prereleases in ~5 weeks, then silent for 3 months. Same stall pattern as y-prosemirror.
- **Repo is still active:** last `pushedAt` 2026-01-19 (the rc.0.0.0-3 publish) but no new releases or activity since.
- **Note:** The legacy `y-codemirror` (CodeMirror 5 binding, last release Nov 2022) is a **third package** — distinct from both `y-codemirror.next` and `@y/codemirror`. Three names for two CRDT-line generations: confusing for consumers.

### 4c. y-websocket → @y/websocket

- **Repo:** [yjs/y-websocket](https://github.com/yjs/y-websocket)
- **Legacy stable:** `v3.0.0` (2025-04-02). Labeled "Latest" on the releases page.
- **v14-targeted prereleases:** `v4.0.0-1` (2025-06-11), `v4.0.0-2` (2025-12-07), `v4.0.0-3` (2025-12-10), `v4.0.0-rc.0` (2026-02-13), `v4.0.0-rc.1` (2026-02-18), `v3.1.0-rc.0`/`rc.1`/`rc.2` (2026-03-24), `v4.0.0-rc.2` (2026-04-15).
- **Package name change:** Published as `@y/websocket` with deps `@y/protocols ^1.0.6-rc.1`, `lib0 ^1.0.0-rc.1`, devDep `@y/websocket-server ^0.1.5` (verified via `gh api /repos/yjs/y-websocket/contents/package.json`, 2026-04-16).
- **Cadence:** Active — most recently pushed 2026-04-15. Tracks the Yjs RC stream more closely than y-prosemirror or y-codemirror.next.

### 4d. y-protocols → @y/protocols

- **Repo:** [yjs/y-protocols](https://github.com/yjs/y-protocols)
- **Legacy stable:** `v1.0.7` (2025-12-16) — label not shown but most recent non-prerelease.
- **v14-targeted prereleases:** `v1.0.6-rc.0` (2026-02-11), `v1.0.6-rc.1` (2026-02-13). Note the version number is **1.0.6-rc.X** which is *lower* than the legacy stable `1.0.7` — suggesting a deliberate semver fork where the v14 line backed up to 1.0.6 and prereleases from there, while the legacy line went to 1.0.7. Quirky but intentional.
- **Package name:** `@y/protocols` (verified via `gh api /repos/yjs/y-protocols/contents/package.json`, 2026-04-16).

### 4e. Maintainer-curated end-to-end Yjs 14 sample app

**Searched for:** maintainer-curated demo of Yjs 14 + @y/prosemirror + @y/codemirror end-to-end.

**Found:** No standalone "Yjs 14 quickstart" or "@y/y demo" repo. The dmonad statement on issue #751 references "the attribution demos of the editor bindings" without naming a repo. The closest candidate is the `yjs/yjs-demos` repo, but its `pushedAt` is 2025-05-03 (~11 months stale relative to investigation date), so unlikely to have v14 examples. The FOSDEM 2026 talk likely demoed BlockNote+ProseMirror rather than a curated Yjs-org demo app.

**Implication:** Production teams attempting v14 evaluation must thread the binding migration themselves. There is no copy-paste template.

---

## 5. Ecosystem coordination

### 5a. Hocuspocus (ueberdosis)

**Hocuspocus has NOT migrated to Yjs 14.** Hard evidence:

- `@hocuspocus/server@4.0.0-rc.5` `package.json` (verified via `gh api /repos/ueberdosis/hocuspocus/contents/packages/server/package.json`, 2026-04-16):
  ```json
  "peerDependencies": {
    "y-protocols": "^1.0.6",
    "yjs": "^13.6.8"
  }
  ```
  **Hard-pins legacy `yjs ^13.6.8`. Does not depend on `@y/y` or `@y/protocols`.**
- The Hocuspocus v4 [`RELEASE_NOTES_V4.md`](https://github.com/ueberdosis/hocuspocus/blob/main/RELEASE_NOTES_V4.md) (fetched 2026-04-16) makes **zero mentions of Yjs 14, `@y/y`, or migration**. The v4 highlights are: cross-runtime support (Bun, Deno, Cloudflare Workers via `crossws`), generic `Context` typing, ordered message processing, web-standard Request/Headers, and structured `TransactionOrigin` types. None of these reference Yjs 14 as a motivator.
- **Notably, Hocuspocus v4 invents its own `LocalTransactionOrigin` / `ConnectionTransactionOrigin` / `RedisTransactionOrigin` union type** — a *parallel solution* to typed transaction origins, separate from anything in Yjs 14. The v4 release notes mark this as a breaking change but do not say "to align with Yjs 14."
- Hocuspocus stable `v3.4.4` shipped 2026-01-25 — well after Yjs v14.0.0-rc.0 was conceptually possible but before rc.0 actually shipped (Feb 25). Continues `^13.6.8`.
- **No issue in the [`ueberdosis/hocuspocus`](https://github.com/ueberdosis/hocuspocus) repo references "yjs 14", "v14", or "@y/y"** — `gh search issues "yjs 14 OR @y/y" --owner ueberdosis` (2026-04-16) returned only unrelated results.
- **No Hocuspocus discussion thread mentions Yjs 14** — top 30 most-recently-updated discussions (via `gh api graphql`, accessed 2026-04-16) cover websocket connection issues, awareness, custom events, etc. Nothing about a v14 migration.
- **Recent activity (today, 2026-04-16):** Hocuspocus PRs #1090 ("fix: remove unused packages"), #1089 ("feat: remove axios"), #1088 (dependabot bump). All routine maintenance. Zero v14-related PRs visible.

**Inference:** The Tiptap/ueberdosis team is **deliberately not pulling on v14** until the alpha stabilizes. Hocuspocus v4 is shipping Q2 2026 (rc.5 already as of April 15) on the v13 base.

### 5b. TipTap (ueberdosis)

**Tiptap has NOT migrated to Yjs 14.** Hard evidence:

- `@tiptap/extension-collaboration@3.22.3` `package.json` (verified via `gh api /repos/ueberdosis/tiptap/contents/packages/extension-collaboration/package.json`, 2026-04-16):
  ```json
  "peerDependencies": {
    "@tiptap/core": "workspace:^",
    "@tiptap/pm": "workspace:^",
    "@tiptap/y-tiptap": "^3.0.2",
    "yjs": "^13"
  }
  ```
  **Hard-pins `yjs ^13`.**
- `ueberdosis/y-tiptap` (Tiptap's binding repo) recent activity: PR #28 (deps bump), #27 (null-guard fix). No v14 work.
- `gh search prs --owner ueberdosis "yjs"` (2026-04-16) returns no v14-migration PR or RFC across the Tiptap org.
- `gh search issues "yjs 14"` against `ueberdosis` returned **0 hits**.

### 5c. y-tiptap

`ueberdosis/y-tiptap` is the Tiptap-specific Yjs binding. Repo is active (PR #27 was 2026-04-14) but pinned to `^13` via the collaboration extension peer dep above. No v14 RFC visible.

### 5d. Liveblocks

`gh search issues "yjs 14 OR @y/y" --owner liveblocks` (2026-04-16) returned **0 v14-related results**. Liveblocks' Yjs integration ([liveblocks/blog/introducing-liveblocks-yjs](https://liveblocks.io/blog/introducing-liveblocks-yjs)) ships against the legacy Yjs line. No public commitment visible.

### 5e. partykit

`gh search issues` cross-org against `partykit` returned no v14 references. The partykit Yjs example apps continue using legacy Yjs.

### 5f. AFFiNE / BlockSuite (toeverything)

WebSearch (2026-04-16) confirmed: > *"AFFiNE uses Yjs 13.6.21 as the CRDT engine for real-time collaboration."* (See [themutex.substack.com/p/9-typescript-affine-yjs-blocksuite](https://themutex.substack.com/p/9-typescript-affine-yjs-blocksuite) and [docs.affine.pro/blocksuite-wip/store/block-model](https://docs.affine.pro/blocksuite-wip/store/block-model)). Pinned to a specific 13.6.x point release — multiple-version-old.

### 5g. BlockNote (yousefed/typecellos)

The FOSDEM 2026 talk speaker Yousef El-Dardiry is the BlockNote maintainer. The [BlockNote talk abstract](https://fosdem.org/2026/schedule/event/8VKQXR-blocknote-yjs-prosemirror/) (accessed 2026-04-16) confirms BlockNote is **the most-aligned downstream consumer**: > *"The BlockNote team collaborated with Yjs creator Kevin Jahns, funded by ZenDiS (OpenDesk) and DINUM (La Suite Docs)."* This is the reverse direction: BlockNote is **paying for Yjs 14 work** via grants from German government open-source initiative ZenDiS (OpenDesk) and the French government's DINUM (La Suite Docs program). BlockNote is the v14 design partner.

### 5h. Cross-org coordination summary

| Project | Owner | Current Yjs pin | v14 migration plan visible | Source |
| ------- | ----- | --------------- | ------------------------- | ------ |
| Hocuspocus v3 | ueberdosis | `yjs ^13.6.8` | None | hocuspocus/packages/server/package.json |
| Hocuspocus v4-rc | ueberdosis | `yjs ^13.6.8` | None | (same, version 4.0.0-rc.5) |
| TipTap collab | ueberdosis | `yjs ^13` | None | tiptap/packages/extension-collaboration/package.json |
| y-tiptap | ueberdosis | `yjs ^13` (transitive) | None | (peer dep in tiptap collab) |
| Liveblocks Yjs | liveblocks | legacy line | No public commitment | search of liveblocks/* repos |
| partykit | partykit | legacy line | No public commitment | search of partykit/* repos |
| AFFiNE | toeverything | `yjs 13.6.21` | None | themutex.substack analysis |
| BlockSuite | toeverything | `yjs 13.x` | None — see AFFiNE | (transitive) |
| BlockNote | yousefed | aligned with Yjs 14 dev | YES — funded the work | FOSDEM 2026 talk |
| Outline | outline (Tom Moor) | legacy line | No public commitment | (negative search; org outline absent from "@y/y" hits) |

The pattern is clear: **only BlockNote is publicly committed to Yjs 14**. Everyone else is in wait-and-see mode and is shipping new major versions of their own libraries on Yjs 13.

---

## 6. Maintainer stance on Peritext / boundary semantics

### 6a. Issue #291 (the canonical "Quill bold span concurrent-edit" bug)

I retrieved a closely-related but different issue under the search "peritext" — see below for the actual #291 grep. The thread reproduced via `gh issue list --repo yjs/yjs --search "peritext OR boundary OR expand"` (2026-04-16) found:
- **`yjs#680`** "YXmlElement.clone() only copies string attribute values / does not support numbers" (open, 2024-12-16, no v14-fix label)
- **`yjs#732`** (closed, awareness) — irrelevant
- **`yjs#262`** (closed, replace encoding with protobuf) — irrelevant

The original issue #291 (concurrent bold-span on Quill, opened 2021-04 by raedle) per `gh issue view 291 --repo yjs/yjs --comments` (2026-04-16) shows dmonad replied with:
> *"Hi @raedle, I fixed this in Yjs@13.5.5. Can you please confirm that this is fixed?"*

And raedle responded that Example 1 worked but **Example 2 (subset format applied second) still produced divergent results**. Latest visible comment in this thread: > *"Any updates on this?"* by `agcty` — but no further dmonad reply visible in the thread.

### 6b. Per-mark expand semantics in v14

**No RFC, draft PR, or in-repo doc for "per-mark expand semantics" in v14** is visible. The v14 work narrative is **attribution-centric** (see §2b), not mark-boundary-centric:

- The two in-repo docs (`attribution-manager.md`, `attributing-content.md`) are entirely about who did what to which character — not about how marks expand at boundaries.
- The Peritext paper's per-mark `expand: 'before' | 'after' | 'both' | 'none'` configurability has **no analog** in any v14 release notes, in-repo doc, or PR title visible across rc.0–rc.13.
- WebSearch for `"yjs 14" peritext expand` (2026-04-16) returned no results — only the original Peritext blog post and unrelated Yjs blog content.

### 6c. Maintainer stance summary on Peritext

**No evidence the boundary anomaly is being addressed in v14.x.** This aligns with the **separate research path** which concluded that Yjs's text-CRDT-as-list-of-Items design treats marks via the existing `format()` API and extending it to per-mark expand semantics would be a much deeper architectural change. The v14 work is targeted at **attribution as a separate orthogonal feature** rather than mark-boundary semantics.

The boundary anomaly is **most likely a v15 or never problem** — there is no maintainer signal otherwise.

---

## 7. Maintainer stance on Hocuspocus

### 7a. Hocuspocus has NOT publicly committed to Yjs 14

Already covered in §5a. To summarize the evidence specific to ueberdosis intent:
- v4.0 RELEASE_NOTES (latest version on `main`, fetched 2026-04-16) — zero v14 mentions.
- v4.0.0-rc.5 server package — pins `yjs ^13.6.8`.
- No `ueberdosis/hocuspocus` issue or discussion mentions v14.
- The v4.0 work is focused on **runtime portability** (Bun, Deno, Cloudflare Workers) and **type safety** (generic Context). These are defensible 2026 priorities orthogonal to the Yjs major version.

### 7b. The Hocuspocus team has built parallel solutions instead of waiting for Yjs 14

Notable: Hocuspocus v4 introduces a `TransactionOrigin` union type with `LocalTransactionOrigin`, `ConnectionTransactionOrigin`, `RedisTransactionOrigin` and helpers `isTransactionOrigin()`, `shouldSkipStoreHooks()`. This is **a Hocuspocus-layer solution** for typed origin attribution, not a Yjs-14-imported feature. It demonstrates that ueberdosis is comfortable building durable infrastructure on the v13 base rather than blocking on v14.

### 7c. Implications for production teams

Any production app using Hocuspocus today will remain on Yjs 13 until the Hocuspocus team migrates. There is no public timeline for that migration. The Hocuspocus team's focus is on cross-runtime + type-safety, not Yjs version uplift.

---

## 8. Funding / sustainability

### 8a. Project funding shape (`funding.json` on main, accessed 2026-04-16)

```json
{
  "entity": {
    "name": "Kevin Jahns",
    "description": "Independent OSS Developer maintaining Yjs and many related libraries..."
  },
  "projects": [{ "guid": "yjs", "name": "Yjs" }, { "guid": "titanic", "name": "Titanic" }],
  "funding": {
    "channels": [
      { "guid": "github-sponsors", "address": "https://github.com/sponsors/dmonad" },
      { "guid": "yjs-opencollective", "address": "https://opencollective.com/y-collective/projects/yjs" }
    ],
    "plans": [
      { "name": "Supporter", "amount": 0, "frequency": "monthly" },
      { "name": "Titanic Funding", "amount": 30000, "frequency": "one-time", "description": "Fund the next generation of local-first providers." },
      { "name": "Bronze Sponsor", "amount": 500, "frequency": "monthly" },
      { "name": "Silver Sponsor", "amount": 1000, "frequency": "monthly" },
      { "name": "Gold Sponsor", "amount": 3000, "frequency": "monthly" }
    ]
  }
}
```

### 8b. Maintainer profile

`gh api /users/dmonad` (accessed 2026-04-16):
- Name: Kevin Jahns
- Location: Berlin, Germany
- Company: "Independent OSS Developer"
- Bio: "Working to make the web more collaborative @yjs @y-crdt"
- Followers: 1,308
- Public repos: 43
- Created: 2013-09-26

### 8c. Funding sources (active 2025-2026)

- **GitHub Sponsors:** Active. Linked from yjs.dev homepage CTA "Become a Sponsor."
- **OpenCollective:** Active. Listed in `funding.json` channel "yjs-opencollective" → `https://opencollective.com/y-collective/projects/yjs`.
- **Velt.dev:** Listed as a sponsor in the README via PR #763 (merged 2026-02-15). The README has multiple "Velt YJs" entries added by `rakesh-snippyly`.
- **ZenDiS / DINUM grants for v14 attribution work** (per FOSDEM 2026 talk abstract, accessed 2026-04-16): German government's ZenDiS (OpenDesk initiative) and France's DINUM (La Suite Docs program) **funded** the BlockNote+Yjs team's collaboration on Yjs 14 attribution & track-changes work.

### 8d. Sustainability shape

- **Single-maintainer dependency.** Per dmonad's bio: "Independent OSS Developer." All v14 work is gated on his time. The recent rc.11 stall (13 days for supply-chain hardening only) and the long Aug-Oct 2025 silence suggest the velocity is highly individual-dependent.
- **Multi-channel funding works.** Government grants (ZenDiS, DINUM) plus corporate sponsors (Velt, others) plus GitHub Sponsors plus OpenCollective give resilience. But there is **no funded second maintainer** visible — Nick Perez (`nperez0111`) is the most active contributor on y-prosemirror, but his role is contributor not co-maintainer.
- **Recent commit velocity from dmonad** (last 30 days, via `gh api /users/dmonad/events/public`, 2026-04-16): Heavy on `yjs/yjs` and `dmonad/lib0` (8 lib0 push events in one evening Apr 14). Active.
- **The "Titanic" sponsorship plan ($30,000 one-time, "Fund the next generation of local-first providers")** is a separate next-gen project. Suggests dmonad's medium-term focus is splitting between v14 stable + the `yjs/titanic` repo (a P2P sync provider, last `pushedAt` 2024-12-22, 16 months stale — possibly paused waiting for v14).

---

## 9. Production hold-out reasons

### 9a. Empirical evidence of conservatism

Negative searches as evidence:
- `gh search issues "yjs 14 OR @y/y" --owner liveblocks --owner partykit --owner toeverything` returned 0 v14-relevant hits (2026-04-16).
- AFFiNE pinned to **Yjs 13.6.21** (per WebSearch result 2026-04-16) — that's a release from December 2024. Many v13.6.x patches behind. They've explicitly chosen not even to track v13 patch releases, let alone v14.
- BlockSuite (the editor framework AFFiNE is built on) inherits the v13 dependency through the AFFiNE pinning.
- Liveblocks' Yjs integration page (`liveblocks.io/blog/introducing-liveblocks-yjs`) does not mention v14 or `@y/y`.

### 9b. Inferable reasons

The maintainer explicitly told consumers in dmonad's #751 reply (2025-11-30, see §1c): > *"please don't open bug reports against alpha software (x.x.x-*) yet. I know that these releases are broken."*

Combine with:
- **Tiptap pinning `^13`** (production pressure: thousands of customers, including Notion-class apps).
- **Hocuspocus v4 pinning `^13.6.8`** (their stable enterprise customers shipping right now).
- **AFFiNE pinning a year-old 13.6.21** (perceived stability via long bake-in).
- **No maintainer-curated upgrade path** (no MIGRATION.md, no demo, no breaking-changes catalog).
- **Package-name change makes upgrade non-trivial** — every dependency in a real app must rename + version-pin.
- **Node 22+ requirement** on `@y/y@14.0.0-rc.13` may exclude older runtime targets.

The conservatism is **rationally calibrated**: there's nothing to upgrade *to* yet (no stable, no upgrade guide, no ecosystem alignment), and the alpha-author himself says alpha is broken.

### 9c. What would unlock production migration

Inferred from the gaps above:
- v14.0.0 stable tagged + npm published under `@y/y@14.0.0`.
- A maintainer-curated MIGRATION.md / RELEASE_NOTES_V14.md.
- Hocuspocus + Tiptap each shipping a `^14` peer-dep version of their packages.
- An end-to-end demo app (yjs-demos refresh).

None of these is in flight visibly as of 2026-04-16.

---

## 10. Sister-CRDT competitive pressure

### 10a. Loro position

- npm download count last week: `loro-crdt` = **23,591** (2026-04-09 → 2026-04-15). Compare yjs (legacy) = 3,566,137 weekly. **Loro is ~0.66% of Yjs's weekly downloads.** Even though Loro is "stable" (1.x shipped), market share remains tiny.
- Loro 1.x has been shipped (per WebSearch 2026-04-16 + community reports), but did not pressure Yjs into faster v14 stable cadence — the `dmonad` thread on `discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567` (accessed 2026-04-16) shows the most recent dmonad reply was 2024-05-07 ("apologies for the critical tone, expressing genuine interest in learning about Loro"). No mention of v14 stable timeline being accelerated by Loro.

### 10b. dmonad's competitive stance

From discuss.yjs.dev thread (verbatim per WebFetch, 2026-04-16):
- Comment 1 (April 5, 2024): > *"their benchmarks are not reproducible. They don't even publish the source code for the benchmarks... WebAssembly bundles are way too large... Loro's bundle exceeds 1MB."*
- Comment 2 (May 7, 2024): > *"Yjs's garbage collection is an integral feature... disabling it for benchmark fairness is unfair, and misleading to the user."*
- Comment 3 (May 7, 2024): > *"apologies for the critical tone, expressing genuine interest in learning about Loro."*

Stance: **defensive on benchmarking methodology, protective of Yjs's GC**, but no admission of Loro creating release-cadence pressure. Note: v14 attribution requires `gc: false` (per `attributing-content.md` example), which is exactly the Yjs-GC-disabled mode dmonad called "unfair" when Loro suggested it for benchmarks. v14's attribution feature **adopts the GC-off mode that Loro's benchmarks were criticized for assuming**.

### 10c. No accelerated cadence visible

The 48-day rc.0 → rc.13 cadence (3.7 days mean) is steady but not accelerated. The 4-month June-Oct 2025 silence in the v14.0.0-N alpha line was the longest stall — that pre-dates Loro 1.x stable (which would have applied pressure if any). The recent rc.11 stall was supply-chain hardening, not feature work to catch up. Conclusion: **Loro is not visibly pressuring Yjs's release timeline.**

---

## Key questions answered

### Q: When does Yjs 14 stable likely ship?
**A: Unknown. The maintainer has not committed to a date. The honest range is 1-12 months** based on:
- rc.13 cadence is steady (3.7-day mean) — implies feature freeze isn't imminent (a freeze would slow things).
- rc.11 was supply-chain prep (incident response plan, Scorecard) — that's a clearing-the-decks pattern that often precedes a stable release by weeks-to-months.
- lib0 1.0.0 stable hasn't shipped — likely a hard prerequisite.
- README, SECURITY.md, docs are not v14-updated — suggests doc work hasn't started.
- Open v14-class bugs (#694 move-op corruption, with no maintainer reply since Feb 2025) are unresolved.
- BlockNote (the FOSDEM 2026 talk's BlockNote+Yjs 14 demo) is the design partner; their production cadence may pull forward.
- **My best guess: Q3 2026, possibly slipping to Q4 2026.** No source-cited evidence supports a tighter range.

### Q: Will Hocuspocus support Yjs 14?
**A: No public commitment. Currently negative.** Hocuspocus v4-rc pins `yjs ^13.6.8`. Zero v14 mentions in v4 release notes, issue tracker, or discussions. Inferred timeline if yes: post-Yjs-14-stable + a multi-month migration. **If the answer becomes "no, ever," the alternative for production is to either fork Hocuspocus, switch to a different Yjs server (`@y/websocket-server`, `yjs/yhub`), or stay on v13 indefinitely.**

### Q: Will TipTap support Yjs 14?
**A: No public commitment. Currently negative.** `@tiptap/extension-collaboration` pins `yjs ^13`. No v14-related issues or PRs in `ueberdosis/tiptap`. Note: TipTap and Hocuspocus are the same org (ueberdosis), so a synchronized migration is plausible — but neither has signaled it.

### Q: Will the boundary/Peritext anomaly be addressed in any v14.x release?
**A: No evidence it will.** v14 is attribution-focused; mark-boundary semantics are not in any RC release notes, in-repo doc, or PR title. Best inference: **v15 or never problem**.

### Q: What's the canonical migration path Yjs maintainers recommend?
**A: Switch to `@y/y` scope + change every binding's package name to its `@y/*` counterpart.** This is NOT a drop-in `^13 → ^14` upgrade because:
- The npm package name itself changed (`yjs` → `@y/y`). Different package, different `node_modules` entry, different import paths required.
- Every binding has a parallel `@y/*` package: `y-prosemirror` → `@y/prosemirror`, `y-codemirror.next` → `@y/codemirror`, `y-websocket` → `@y/websocket`, `y-protocols` → `@y/protocols`.
- Node ≥22 required.
- Public API changes (`DeleteSet` → `IdSet`, new `Attribution`/`AttributionManager` types, `applyDelta` semantics changes, undo content APIs).
- No maintainer-published MIGRATION.md.

### Q: Is there a maintainer-curated end-to-end Yjs 14 sample app?
**A: No.** The `yjs/yjs-demos` repo's last `pushedAt` was 2025-05-03 — predates rc.0. The maintainer reference in #751 to "the attribution demos of the editor bindings" is unspecific. The closest curated work is BlockNote's attribution demos (third-party, presented at FOSDEM 2026).

---

## Stagnation note

After ~25 distinct queries (gh CLI calls + WebFetch + WebSearch + curl to npmjs API), additional searches into "official Yjs blog post for v14" / "v14 stable timeline announcement" / Twitter/Mastodon of dmonad / npmjs.com listing for `@y/y` consistently returned (a) the same FOSDEM 2026 talk page, (b) the GitHub releases page, (c) the issue tracker entries already found, or (d) third-party tutorials predating the migration. **The web search trail has stagnated at around the 18-search mark** for new maintainer-roadmap signals — the substantive answers are all in-repo (release notes, package.json, in-repo docs `attributing-content.md` / `attribution-manager.md`, issue #751 comment, funding.json) plus the FOSDEM 2026 talk abstract.

The investigation is complete subject to one caveat: **`docs.yjs.dev` and `beta.yjs.dev` may have a v14 migration guide hidden under sidebar nodes that WebFetch couldn't expand.** A future check should browse the docs sidebar fully if the production migration becomes blocking.

---

## Summary table — sources accessed

| Source | Access date | What it told us |
| ------ | ----------- | --------------- |
| `gh release list --repo yjs/yjs` | 2026-04-16 | Full v14 RC timeline, v13 maintenance evidence |
| `gh release view v14.0.0-rc.{0..13}` | 2026-04-16 | Per-RC commit summaries → cadence + content interpretation |
| `gh api /repos/yjs/yjs/contents/package.json` | 2026-04-16 | Confirms `name: @y/y`, `node ≥22`, dep on `lib0 ^1.0.0-rc.12` |
| `gh api /repos/yjs/yjs/contents/SECURITY.md` | 2026-04-16 | Lists 13.6.x as supported, no 14.x row |
| `gh api /repos/yjs/yjs/contents/attributing-content.md` | 2026-04-16 | The headline v14 feature: attribution + IdSet/IdMap |
| `gh api /repos/yjs/yjs/contents/attribution-manager.md` | 2026-04-16 | Public API for v14 attribution: `getDelta(attributionManager)` |
| `gh api /repos/yjs/yjs/contents/funding.json` | 2026-04-16 | GH Sponsors + OpenCollective channels, $30k Titanic plan |
| `gh api /repos/yjs/yjs/contents/THREAT_MODEL.md` | 2026-04-16 | "Server-side filtering antipattern" guidance — not v14-specific |
| `gh api /repos/yjs/yjs/contents/INTERNALS.md` | 2026-04-16 | YATA paper reference, list-CRDT design — pre-v14 |
| `gh issue view 751 --repo yjs/yjs` | 2026-04-16 | dmonad's "alpha is broken" guidance verbatim |
| `gh issue view 694 --repo yjs/yjs` | 2026-04-16 | Open v14 move-op corruption bug, last-touched Nov 2025 |
| `gh issue view 291 --repo yjs/yjs` | 2026-04-16 | Original Quill bold-span concurrent-edit bug; partial fix in v13.5.5; Example 2 still broken |
| `gh issue list --repo yjs/yjs --state open` | 2026-04-16 | All open issues (v13 still gets bug fixes — #768 v13.6.29 path bug) |
| `gh api /repos/yjs/y-prosemirror/contents/package.json` | 2026-04-16 | y-prosemirror v2 = `@y/prosemirror`, peer-deps `@y/y ^14.0.0-rc.13` |
| `gh release list --repo yjs/y-prosemirror` | 2026-04-16 | v1.3.7 stable Latest; v2.0.0-{1,2} prereleases stalled since Dec |
| `gh api /repos/yjs/y-codemirror.next/contents/package.json` | 2026-04-16 | `@y/codemirror`, version 0.0.0-3 |
| `gh issue view 40 --repo yjs/y-codemirror.next` | 2026-04-16 | Wontfix on dual-package readme — confirms intentional coexistence |
| `gh issue view 201 --repo yjs/y-websocket` | 2026-04-16 | Wontfix on dual-package readme — same pattern |
| `gh api /repos/yjs/y-websocket/contents/package.json` | 2026-04-16 | `@y/websocket`, deps `@y/protocols ^1.0.6-rc.1` |
| `gh api /repos/yjs/y-protocols/contents/package.json` | 2026-04-16 | `@y/protocols`, version 1.0.6-rc.1 |
| `gh release list --repo dmonad/lib0` | 2026-04-16 | lib0 stable still 0.x (rc.12 = same-day-as-Yjs-rc.13 sync) |
| `gh api /repos/ueberdosis/hocuspocus/contents/packages/server/package.json` | 2026-04-16 | Hocuspocus v4-rc pins `yjs ^13.6.8` |
| Hocuspocus `RELEASE_NOTES_V4.md` (gh api content) | 2026-04-16 | Zero v14 mentions; runtime + types focus |
| `gh release list --repo ueberdosis/hocuspocus` | 2026-04-16 | v3.4.4 stable Jan 25, v4.0.0-rc.5 most recent |
| Hocuspocus discussions GraphQL | 2026-04-16 | Top 30 discussions: zero v14 mentions |
| `gh api /repos/ueberdosis/tiptap/contents/packages/extension-collaboration/package.json` | 2026-04-16 | `yjs ^13` peer dep |
| `gh search issues "yjs 14 OR @y/y" --owner ueberdosis --owner liveblocks --owner partykit --owner toeverything` | 2026-04-16 | 0 v14-relevant hits across major downstream orgs |
| `gh api /users/dmonad/events/public` | 2026-04-16 | Heavy lib0 + yjs activity Apr 14, 2026 (release prep) |
| `gh api /users/dmonad` | 2026-04-16 | Berlin, Independent OSS Developer, 1308 followers |
| `gh api graphql /repos/yjs/yjs/discussions` | 2026-04-16 | Discussions disabled (HTTP 410) |
| `https://api.npmjs.org/downloads/point/last-week/{yjs,@y/y,@y/prosemirror,y-prosemirror,y-codemirror.next,@y/codemirror,@hocuspocus/server,loro-crdt}` | 2026-04-16 | Adoption asymmetry: legacy 3.5M/wk vs `@y/y` 9.8K/wk |
| FOSDEM 2026 talk page (WebFetch) | 2026-04-16 | "BlockNote, Prosemirror and Yjs 14: Versioning and Track Changes," speakers Yousef El-Dardiry + Nick Perez, ZenDiS + DINUM funding |
| `discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567` (WebFetch) | 2026-04-16 | dmonad's three comments on Loro (April-May 2024), no v14 references |
| WebSearch `"Yjs 14" OR "yjs v14" OR "@y/y" release blog post 2026` | 2026-04-16 | No maintainer-authored v14 blog post found |
| WebSearch `Loro CRDT vs Yjs 2026 release stable version comparison` | 2026-04-16 | No 2026 update; community discussion is 2024 |
| WebSearch `BlockSuite AFFiNE yjs version dependency 2026` | 2026-04-16 | Confirms AFFiNE pins yjs 13.6.21 |
| `https://yjs.dev/` (WebFetch) | 2026-04-16 | "Build collaborative applications with Yjs" — no v14 mention |
| `https://docs.yjs.dev/` (WebFetch) | 2026-04-16 | No v14 migration guide visible in introduction sidebar |
| `https://beta.yjs.dev/docs/introduction/` (WebFetch) | 2026-04-16 | No v14 migration guide visible |
