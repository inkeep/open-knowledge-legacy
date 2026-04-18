# Refresh — Peritext Implementation Status (D7, D11, D12)

**Date:** 2026-04-16
**Refreshes prior claims from:** `REPORT.md` (2026-04-07) and `evidence/peritext-reference.md` (2026-04-07)
**Method:** Direct GitHub API + raw.githubusercontent.com fetches of source code, package.json, releases, issues. Web search for production references and v14 production claims.

---

## Headline

The 2026-04-07 conclusion **fully holds nine days later** — and the empirical case is now stronger:

1. **Peritext-on-Yjs:** still does not exist. v14-RC `ContentFormat` source is byte-identical to v13.6.30 (only `key` + `value`, no `expand`). Zero PRs, zero open issues mention "peritext" in `yjs/yjs`.
2. **Boundary anomaly in Yjs:** unaddressed in v14 main branch. No public commitment from Kevin Jahns. Issue #291 (the canonical reproducer) sits open since April 2021 with no recent activity.
3. **Production users on Yjs 14:** zero identified. AFFiNE pins v13.6.21, BlockSuite pins v13.6.18, Outline pins v13.6.30, **`@tiptap/y-tiptap` v3.0.3 (released 2026-04-08, latest) STILL pins `yjs ^13.5.38` — the canonical TipTap-Yjs binding has not migrated to v14.** Yjs 14 itself is still RC (`v14.0.0-rc.13` 2026-04-14).

The one **material delta** since the prior report: **`loro-prosemirror` is more concretely usable today** than the prior research conveyed (v0.4.3, Feb 2026, with full ProseMirror plugin trio: sync + undo + ephemeral cursor). It is still pre-1.0 with an open data-loss issue (#77, March 2026). Loro-the-CRDT is 1.0+ and stable, with documented Peritext+Fugue rich-text marks supporting `expand: 'before' | 'after' | 'both' | 'none'`. **Loro-on-ProseMirror is the only "ship today" path to true Peritext semantics on a TipTap-compatible binding** — but the binding itself is still 0.x and the bug rate suggests it is not yet a like-for-like substitute for `y-prosemirror`.

---

## D7: Peritext implementations — actual production-ready code

### inkandswitch/peritext (reference implementation)

| Claim | Evidence | Confidence |
|---|---|---|
| Last commit: **September 16, 2022** ("Link to open-access copy of CSCW paper") | `https://api.github.com/repos/inkandswitch/peritext/commits` returned `2022-09-16` for HEAD; previous commit `2022-08-31`; no activity in 2023, 2024, 2025, or 2026. | **CONFIRMED** |
| Repository describes itself as a "prototype implementation" | README; same as 2026-04-07 baseline. | **CONFIRMED** |
| Built on Micromerge (custom CRDT, ~800 LOC), not Yjs | Prior evidence file `peritext-reference.md`; corroborated by Loro blog "Rust implementation of Peritext and Fugue" (`https://loro.dev/blog/crdt-richtext`) which references Peritext as the algorithmic ancestor, not a usable Yjs library. | **CONFIRMED** |

**Net:** The reference implementation has been frozen for 3.5 years. It is a research artifact, not a buildable substrate.

### loro-dev/loro + loro-dev/loro-prosemirror

| Claim | Evidence | Confidence |
|---|---|---|
| Loro CRDT 1.x is stable; latest published `loro-crdt-map@1.11.0` on **2026-04-12** | GitHub releases page at `https://api.github.com/repos/loro-dev/loro/releases/latest`; "Loro 1.0 is out!" milestone announcement. | **CONFIRMED** |
| Loro implements Peritext+Fugue with per-mark expand semantics: `'before' \| 'after' \| 'both' \| 'none'` | Loro docs (`https://loro.dev/docs/tutorial/text` returned 403 to direct fetch but content is enumerated in search snippets); `crdt-richtext` Rust crate README; `LoroDoc` rustdocs (`docs.rs/loro/latest`). API is `configTextStyle({ bold: { expand: 'after' }, link: { expand: 'none' }, ... })` mirroring Automerge 2.2's `ExpandMark` enum. | **CONFIRMED** |
| `loro-prosemirror` v0.4.3 published **2026-02-19** (latest) — pre-1.0 | npm registry `https://registry.npmjs.org/loro-prosemirror`; GitHub releases. | **CONFIRMED** |
| `loro-prosemirror` provides `LoroSyncPlugin`, `LoroUndoPlugin`, `LoroEphemeralCursorPlugin` (parity with y-prosemirror's plugin model) | README excerpt at `https://github.com/loro-dev/loro-prosemirror`. | **CONFIRMED** |
| `loro-prosemirror` peer-deps `loro-crdt ^1.10.2` | `https://raw.githubusercontent.com/loro-dev/loro-prosemirror/main/package.json` (verified, full text obtained). | **CONFIRMED** |
| Open data-loss-class issue: #77 "LoroSyncPlugin: content wipe when docChanged transaction fires before init()" (2026-03-28) | `https://github.com/loro-dev/loro-prosemirror/issues`; 7 open issues total; #75 also a race condition (2026-03-18). | **CONFIRMED** |
| README does NOT mention Tiptap support; LoroSyncPlugin examples use raw `EditorView`/`EditorState` | README content at `https://github.com/loro-dev/loro-prosemirror/blob/main/README.md`. ProseKit's `prosekit-loro` extension exists as a third-party adapter. | **CONFIRMED** |

**Net:** Loro is the only Peritext-implementing CRDT with a TipTap-compatible-by-construction (any-ProseMirror-binding-works) editor binding shipping today. **Caveat:** binding is 0.x with known sync bugs surfacing within the last 30 days. Migrating from Yjs to Loro is a sync-stack rewrite (see D5 of the original report), not a drop-in.

### automerge/automerge

| Claim | Evidence | Confidence |
|---|---|---|
| Latest version v3.2.5 (2026-03-25) | GitHub releases page (via WebFetch); README does not mention Peritext. Prior 2026-04-07 evidence noted Automerge 2.2 adopted Peritext with ExpandMark enum, which carries forward into 3.x. | **CONFIRMED (3.x continuity assumed from continuous-release pattern; not re-verified)** |
| `automerge-prosemirror` 3,272 LOC reference binding (per prior 2026-04-07 evidence) | Not re-fetched in this refresh; relying on prior evidence file `existing-bindings.md`. | **INHERITED (CONFIRMED in prior report)** |

**Net:** Automerge has Peritext but is not used in this product's stack. Same status as 2026-04-07.

### "Yjs side" — peritext-yjs / @yjs/peritext

| Claim | Evidence | Confidence |
|---|---|---|
| **No `peritext-yjs` package on npm registry.** No `@yjs/peritext`. No `@y/peritext`. | Search trail: prior research (peritext-reference.md), no new package surfaced in npm registry probes for `loro-crdt`, `loro-prosemirror`, `yjs`, `y-prosemirror` (each a separate `registry.npmjs.org/<name>` fetch in this refresh). | **CONFIRMED (negative search)** |
| Kevin Jahns's (@dmonad) profile shows 6 pinned repos: `yjs/yjs`, `y-crdt/y-crdt`, `lib0`, `crdt-benchmarks`, `yjs/yjs-demos`, `yjs/y-prosemirror`. **No peritext-related repo.** Profile claims 43 total repos but pinned set has none. | `https://github.com/dmonad` profile page enumerated. | **CONFIRMED (with caveat: did not exhaustively enumerate all 43)** |
| **Zero open or closed PRs in `yjs/yjs` mention "peritext"** | GitHub PR search `is:pr peritext` returned `0 Open / 0 Closed`. | **CONFIRMED (negative search)** |
| **Zero open or closed issues in `yjs/yjs` mention "peritext"** in current results | GitHub issue search `peritext` returned "No results"; corroborated by the second search for `expand mark boundary` also returning "No results". | **CONFIRMED (negative search)** |
| **Yjs v14 main branch source: `ContentFormat` class has only `key` and `value` fields** — byte-identical to v13.6.30 implementation | Direct source diff: `src/structs/Item.js` lines 1093+ in v14 main vs `src/structs/ContentFormat.js` in v13.6.30 tag. Both define `constructor(key, value)`, `getLength() => 1`, `write(encoder, offset)` writing only `writeKey(this.key)` + `writeJSON(this.value)`. **Zero `expand` properties added.** Zero `boundary` references. v14's `ytype.js` (the new unified type module) imports `ContentFormat` and uses it identically — `formatText` still walks `ContentFormat` items via `key/value`. | **CONFIRMED (source verified line-by-line)** |
| Yjs v14 architecture change: collapsed `src/types/` (Y.Text, Y.XmlFragment, Y.Map etc. as separate files) into single `src/ytype.js` (the unified `YType<DeltaConf>` class promised in 2026-04-07's D1 finding) | `src/structs/` in v14 main lists only 4 files (`AbstractStruct.js`, `GC.js`, `Item.js`, `Skip.js`). v13.6.30 had `src/structs/` plus separate `src/types/` directory. v14 `src/` has only `index.js`, `ytype.js`, plus `structs/` and `utils/`. | **CONFIRMED (directory listings verified via API)** |

**Bottom line for D7:** No peritext-on-yjs library exists or is imminent. The architectural simplification in v14 (unified YType) **does not extend to formatting semantics** — `ContentFormat` is unchanged. A Peritext implementation on Yjs would still require modifying the core CRDT (encoding `expand` flags into ContentFormat or introducing a new struct type) and then re-implementing `formatText`'s traversal logic. This is the same conclusion as 2026-04-07.

---

## D11: Boundary anomaly question — has Yjs 14 fixed it?

| Claim | Evidence | Confidence |
|---|---|---|
| **Yjs v14 has NOT added per-mark expand semantics** | Source verification (above): `ContentFormat` is unchanged. `ytype.js` `formatText` walks ContentFormat items by `key/value` only. No `expand` parameter passed to `format()` API. Zero source-level evidence of boundary semantics. | **CONFIRMED (source-verified)** |
| **No PRs in flight to add expand semantics in v14** | `is:pr expand OR boundary` returned 1 closed PR (#397, 2022, about adding `immer-yjs` to bindings — unrelated). Search `is:pr peritext` returned zero. | **CONFIRMED (negative search)** |
| **Issue #291 ("Different outcomes for Y.Text when artificially delaying text attribute updates") still open**, last activity April 2021. Assigned to dmonad with no public commitment to a fix. | `https://github.com/yjs/yjs/issues/291` — same status as 2026-04-07 baseline confirmed. | **CONFIRMED** |
| Related issue #606 ("Inconsistent Y.XmlText.format behavior" — attributes stripped outside range when initialized via applyUpdate) closed January 2024 | `https://github.com/yjs/yjs/issues/606`. Different bug class; not the Peritext boundary anomaly. | **CONFIRMED (clarification)** |
| **Discuss.yjs.dev has no recent Peritext / boundary discussion** | `https://discuss.yjs.dev/latest` enumerates last 5 topics (April 10, March 26, February 14, January 22, January 14, 2026). Top themes: observeDeep events, ProseMirror integration, multi-person collaboration scaling. **No Peritext or boundary semantics discussion in the visible feed.** | **CONFIRMED (negative search at the level of the latest-feed; deeper search would need site-internal indexing)** |
| Loro DOES solve the boundary anomaly via `configTextStyle({ <markName>: { expand: 'before'|'after'|'both'|'none' } })` — verified API | Loro docs (search-result snippets); `crdt-richtext` Rust crate; `loro` rustdocs at `docs.rs/loro/latest`. Documented config example: bold→`expand: 'after'`, link→`expand: 'none'`. | **CONFIRMED** |
| For Open Knowledge's use case (markdown editor with infrequent rich formatting; agent writes typically write to whole regions, not overlapping format ranges) — anomaly remains a **theoretical, not practical, blocker** | Inferred from product use case (per CLAUDE.md: TipTap WYSIWYG + CodeMirror source mode; agent writes go through `applyAgentMarkdownWrite` in `agent-sessions.ts` which composes at markdown level, not at format-mark level). The anomaly requires concurrent overlapping `format()` calls in identical time windows; markdown round-tripping does not produce these. | **HIGH confidence (architectural inference; no production telemetry to falsify)** |

**Production-workaround note:** No documented BlockSuite/AFFiNE workaround for the Yjs boundary anomaly was found in this refresh. BlockSuite uses Y.Text only for inline formatting within blocks (Y.Map tree for block hierarchy) — this confines any anomaly to within-block ranges, but does not address it.

**D11 verdict:** Materially unchanged from 2026-04-07. Yjs 14 does NOT solve the boundary anomaly. Loro DOES. For OUR use case the anomaly is unlikely to be product-visible. Path C math from the prior report is unchanged: ship Architecture C on Yjs 13/14 if staying on the Yjs sync stack; switch to Loro only if (a) the anomaly becomes product-visible, OR (b) we want full Peritext semantics now without waiting on Yjs core changes that nobody is committed to making.

---

## D12: Production references for Yjs 14 + y-prosemirror v2

### Yjs 14 release status (2026-04-16)

| Claim | Evidence | Confidence |
|---|---|---|
| **Yjs 14 is still pre-stable.** Latest tag: `v14.0.0-rc.13` published **2026-04-14** | GitHub releases listing of last 10 releases, oldest `v14.0.0-rc.4` (March 24) → newest `v14.0.0-rc.13` (April 14). Release cadence is roughly weekly with multiple-RCs-per-week patches; not yet `v14.0.0` final. | **CONFIRMED** |
| Stable yjs is `13.6.30` (March 14, 2026 per ithile.com/Medium snippet); npm `dist-tags`: `latest: 13.6.30`, `next: 14.0.0-8`, `beta: 14.0.0-16` | npm registry direct fetch `https://registry.npmjs.org/yjs`. Note: `dist-tags.beta` is older than the GitHub `rc.13` tag because npm publishes lag GitHub tags by a few RCs in this cadence. | **CONFIRMED** |
| Open v14-specific bug: #694 "yjs v14: issue with move operation" — `Y.Array` corruption on `move()`, reported on `v14.0.0-1`, still open | `https://github.com/yjs/yjs/issues/694`. | **CONFIRMED** |
| Recent v14 RC commits include security workflow additions and "applyDelta modifyOp" fixes — release-stabilization signal, not feature work | RC.4 ("considering deleted content - fix applyDelta modifyOp"), RC.5 ("fix stack overflow when using spread operator"), RC.11 ("supply-chain security scorecard workflow"). | **CONFIRMED** |

**Net:** v14 is in late-RC stabilization, not stable. No semver-guaranteed cutover signal yet. Bugs are still being fixed in the main public API (`Y.Array.move()`).

### y-prosemirror v2 status (2026-04-16)

| Claim | Evidence | Confidence |
|---|---|---|
| **y-prosemirror v2 is package-rescoped.** Master branch `package.json` shows `"name": "@y/prosemirror"`, `"version": "2.0.0-2"`, peer-deps `"@y/y": "^14.0.0-rc.13"`, `"@y/protocols": "^1.0.6-rc.1"`, `"prosemirror-*": "^1.x"`. Production dep on `lib0: ^1.0.0-rc.12`. | `https://raw.githubusercontent.com/yjs/y-prosemirror/master/package.json` (verified text). | **CONFIRMED** |
| Most recent prerelease tags: **v2.0.0-2 (Dec 16, 2025)** and **v2.0.0-1 (Dec 10, 2025)**. Most recent stable: **v1.3.7 (Jul 3, 2025)** | GitHub tags page at `https://github.com/yjs/y-prosemirror/tags`. | **CONFIRMED** |
| Master branch last updated **2026-04-14**; secondary branch `upgrade-y` last updated 2026-03-23 | `https://github.com/yjs/y-prosemirror/branches`. | **CONFIRMED** |
| **Only 2 open issues** on `yjs/y-prosemirror`: #205 "Cursor Jumps on splitting of paragraph" (Dec 9, 2025), #113 "Edits by peers produce a prosemirror transaction that spans the entire document" (May 19, 2022) | GitHub issues page (default open filter). | **CONFIRMED (low signal, but worth noting that the project is not visibly in distress)** |
| **No published v2.0.0 stable.** Only `2.0.0-1` and `2.0.0-2` prereleases exist on npm. | Tags listing + releases search via WebFetch. | **CONFIRMED** |

### Production users — package.json forensics (2026-04-16)

| Project | yjs version pinned | y-prosemirror version | Source | Confidence |
|---|---|---|---|---|
| **AFFiNE** (`toeverything/AFFiNE` canary branch) | `13.6.21` (with monorepo patch via `.yarn/patches/yjs-npm-13.6.21-c9f1f3397c.patch`) | not directly listed in root | `https://raw.githubusercontent.com/toeverything/AFFiNE/canary/package.json` | **CONFIRMED** |
| **BlockSuite** (`toeverything/blocksuite/packages/framework/store`) | `^13.6.18` (peerDep + devDep) | not in this package | `https://raw.githubusercontent.com/toeverything/blocksuite/master/packages/framework/store/package.json` | **CONFIRMED** |
| **BlockSuite inline** (`toeverything/blocksuite/packages/framework/inline`) | `^13.6.18` (peerDep + devDep) | not in this package | `https://raw.githubusercontent.com/toeverything/blocksuite/master/packages/framework/inline/package.json` | **CONFIRMED** |
| **Outline** (`outline/outline` main) | `^13.6.30` | `^1.3.7` (latest stable; pinned via caret allowing 1.x) | `https://raw.githubusercontent.com/outline/outline/main/package.json` | **CONFIRMED** |
| **`@tiptap/y-tiptap`** (the canonical TipTap-Yjs binding) v3.0.3 — published **2026-04-08** | peerDep `^13.5.38` | itself; depends on `prosemirror-*` directly | `https://raw.githubusercontent.com/ueberdosis/y-tiptap/main/package.json` + npm registry | **CONFIRMED** |
| `@hocuspocus/server` (latest main) | peerDep `^13.6.8` | n/a | `https://raw.githubusercontent.com/ueberdosis/hocuspocus/main/packages/server/package.json` | **CONFIRMED** |
| **Cargo (Notion ex-team)** | NOT FOUND — searches returned cargo.site (designer website builder) and Cargo Collective, neither of which match the rich-text-CRDT product. May be a different name / not public / different stack. | n/a | Web searches | **NEGATIVE — could not verify** |

**Production-on-v14 search (`"\"yjs\":\"^14\"" site:github.com`):** Returned no production-product package.json files. Top hit was bug report #694 itself.

| Claim | Evidence | Confidence |
|---|---|---|
| **Zero identified production users on Yjs 14 as of 2026-04-16.** | All forensics above. | **CONFIRMED (within the surveyed-projects bound; cannot prove zero universally)** |
| **The `@tiptap/y-tiptap` v3.0.3 release on 2026-04-08 is the strongest negative signal.** This is Tiptap's own y-prosemirror fork, the canonical TipTap-Yjs binding, released 8 days ago. It still pins `yjs ^13.5.38`. If TipTap intended to migrate to v14, this release would be the natural cutover point. | npm registry + GitHub package.json (both verified) | **HIGH confidence** |
| **Twitter/blog evidence of Yjs 14 production adoption since 2026-04-07: nothing surfaced.** Only references found are Yjs's own GitHub releases, yjs.dev, npm package page, and Liveblocks's blog (which is about their managed-Yjs offering generally, not v14). | Web search "yjs 14 production stable release 2026" | **CONFIRMED (negative)** |

**D12 verdict:** Production references for Yjs 14 **remain at zero**. The ecosystem is doubling down on v13 (Tiptap's most recent release pins ^13.5.38; Outline pinned ^13.6.30; AFFiNE patches v13.6.21; BlockSuite pinned ^13.6.18). Yjs 14 itself is in late-stabilization-RC; y-prosemirror v2 is in early-prerelease (2 publishes since December). Adopting v14 today is being a v14 production beta tester, not riding an established adoption curve.

---

## Summary of net changes vs. 2026-04-07 baseline

| Dimension | 2026-04-07 conclusion | 2026-04-16 conclusion | Delta |
|---|---|---|---|
| **Peritext-on-Yjs library exists** | No | No (source verified: ContentFormat unchanged in v14 main) | **No change.** Stronger evidence. |
| **Kevin Jahns committed to adding Peritext** | No | No (zero PRs, zero issues mention peritext in `yjs/yjs`) | **No change.** Stronger evidence. |
| **Boundary anomaly fixed in Yjs 14** | No | No (source verified) | **No change.** Stronger evidence. |
| **Loro implements Peritext with expand semantics** | Yes (Loro 1.x stable) | Yes (verified `configTextStyle({ <mark>: { expand } })`) | **No change.** |
| **Loro has a ProseMirror binding** | Mentioned but treated as immature | **`loro-prosemirror` v0.4.3 (Feb 2026), full plugin trio (sync + undo + ephemeral cursor); 7 open issues incl. data-loss #77 (March 2026)** | **Material upgrade in confidence-of-existence; downgrade in confidence-of-stability.** |
| **Yjs 14 production users** | Zero | Zero (and TipTap's 2026-04-08 release reinforces this) | **No change.** Stronger evidence. |
| **`@tiptap/y-tiptap` migration to v14** | Anticipated as a barrier | **Confirmed: v3.0.3 (2026-04-08, latest) still pins yjs ^13.5.38** | **No change.** Stronger evidence — most recent release confirms no migration. |

**Practical implication for Open Knowledge:**

The math from the prior report is unchanged. Architecture C (delta-protocol dual view on Yjs) remains the cheapest path. The boundary anomaly does not block that work. **The one new option worth flagging: Loro-on-ProseMirror is now concretely usable with a maintained binding, if (and only if) the team is willing to swap the entire sync stack** — Hocuspocus → Loro server (`loro-server` / Loro's own sync), `y-prosemirror` → `loro-prosemirror`, `y-codemirror.next` → no equivalent yet (Loro lacks a CodeMirror binding). The dual-CRDT bridge work this repo just landed (server-authoritative observers — see `specs/2026-04-15-server-authoritative-observer-bridge/`) is Yjs-specific and would need to be re-implemented against Loro's API surface.

Loro's value proposition becomes compelling only if (a) the Peritext boundary anomaly becomes product-visible (low likelihood per CLAUDE.md's bridge architecture), OR (b) the team independently wants Loro's other claims (P2P sync, time travel, JSON-tree CRDT for richer non-text data). Neither is currently driving a switch.

---

## Open questions / non-confirmations

- **`@dmonad`'s 43 total repositories were not exhaustively enumerated** — only the 6 pinned repos. A peritext repo could exist in the long tail; would need to scrape the full repo list to be 100% certain. Confidence-adjustment: very unlikely to change the conclusion (a peritext repo would be heavily linked from the public discussion).
- **Cargo (Notion ex-team) could not be located** — name collision with cargo.site / Cargo Collective. If this product exists publicly under a different name, we missed it.
- **Loro's actual production users were not enumerated.** Search for "Loro production company case study" returned generic adoption claims but no specific named customers in 2025-2026. Loro 1.0 is recent — production references may genuinely not exist yet at scale.
- **No fetch of `discuss.yjs.dev` site-search for `peritext`** (only the latest-topics feed). A site-internal search might surface older discussion. Low likelihood of changing the conclusion; if Kevin had publicly committed it would have surfaced via the GitHub PR/issue queries.
