---
title: "Yjs 14 + @y/* Stack: Source-Traced Ecosystem Adoption Status & Transitive Migration Cost"
description: "Source-traced map of the Yjs 14 ecosystem as of 2026-04-16 — every load-bearing package's API diff (yjs core, y-prosemirror, y-codemirror.next, @tiptap/y-tiptap, @hocuspocus, lib0), the @y/* npm rebrand reality, what's structurally compatible vs broken, what would need to be forked or rewritten for a production migration, and where the maintainer roadmap actually points."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Yjs
  - "@y/y"
  - y-prosemirror
  - "@y/prosemirror"
  - y-codemirror.next
  - "@y/codemirror"
  - "@tiptap/y-tiptap"
  - "@hocuspocus/server"
  - "@hocuspocus/provider"
  - "@y/websocket-server"
  - "@y/protocols"
  - lib0
  - BlockNote
  - dmonad
topics:
  - Yjs major version migration
  - CRDT ecosystem adoption
  - editor binding compatibility
  - server lifecycle migration
  - peer-dependency analysis
---

# Yjs 14 + @y/* Stack: Source-Traced Ecosystem Adoption Status & Transitive Migration Cost

**Purpose:** Determine, from source code and direct npm-registry verification, what it would actually take to migrate a Yjs 13 / Hocuspocus / TipTap / CodeMirror collaborative editor stack to Yjs 14 + the `@y/*` ecosystem today (2026-04-16). The reader cares about: which packages REPLACE cleanly, which need PATCH or FORK, what must be WRITE-CUSTOM, and what's still-broken-by-design upstream.

---

## Executive Summary

**Yjs 14 is technically real, structurally available on npm, and structurally incompatible with the rest of the production CRDT-collab ecosystem.** Six parallel Opus source-traces (yjs core, y-prosemirror, y-codemirror, TipTap collab packages, Hocuspocus, maintainer roadmap) agree on the same picture from independent angles:

1. **The unification is real at the source level.** `@y/y@14.0.0-rc.13` exports a single `YType` class that holds both `_map` (KV) and `_start` (sequence) storage on every instance. `Doc.get(key, name)` replaces `getText`/`getXmlFragment`/`getMap`/`getArray`. The `Y.Item.delete` algorithm is byte-identical to v13 — precedent #10 (Y.Item identity) reasoning still holds.
2. **The ecosystem coexists as TWO parallel publishing channels** — the legacy `yjs` package continues receiving v14 prereleases (`14.0.0-16` beta) AND a new `@y/*` scope publishes a parallel v14 line (`@y/y@14.0.0-rc.13`). Two `wontfix` issues confirm this dual-package coexistence is intentional and dmonad is deliberately keeping the alpha low-traffic.
3. **Adoption is rounding-error.** `yjs` legacy: **3,566,000 weekly npm downloads**. `@y/y`: **9,822** (0.275%). `y-prosemirror`: 701K vs `@y/prosemirror`: **9 weekly**. `y-codemirror.next`: 30.5K vs `@y/codemirror`: **4**. Production-user survey across ~60 published "Who is using Yjs" list members shows zero on Yjs 14 (see sister evidence: [reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-production-survey-full.md](../peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-production-survey-full.md)).
4. **The maintainer himself flagged it as broken.** dmonad on issue #751 (2025-11-30): *"I'm not ready yet to make Yjs v14 available for everyone... please don't open bug reports against alpha software (x.x.x-*) yet. I know that these releases are broken."*
5. **Hocuspocus + @y/y is structurally incompatible at the import layer.** `lib0` undergoes a major version split (Hocuspocus pins `^0.2.x`, @y/* uses `^1.0.0-rc.x`) — they cannot share a single install. Hocuspocus imports `'yjs'`; `@y/protocols` and `@y/websocket` import `'@y/y'` — different npm package identifiers. Cannot remap one to the other via `npm overrides`. Either stay on Hocuspocus (force `yjs@14` via overrides, unsupported but possible) or swap Hocuspocus entirely (~2,000-LOC framework rewrite).
6. **`@y/websocket-server` is a 281-LOC starter, missing 13 of 17 Hocuspocus features we use** (1 PRESENT / 3 PARTIAL / 13 ABSENT). Estimated ~1,850 server LOC + ~250 client to recover what Hocuspocus rc.1 ships in 3,000+ LOC.
7. **Single-YType dual-view binding (one CRDT, two editors) is NOT achievable today.** `@y/codemirror@0.0.0-3`'s `y-sync.js:209` casts `op.insert` to `string` with no array-insert branch — feeding it tree-shape ops produces `"[object Object]"` writes.
8. **`@y/prosemirror@2.0.0-2` preserves the legacy public API verbatim at the package entry.** The `src/y-prosemirror.js` file (the actual `package.json#exports` entry) re-exports `ySyncPlugin`, `updateYFragment`, `yCursorPlugin`, `yUndoPlugin`, `prosemirrorJSONToYXmlFragment`, `yXmlFragmentToProsemirrorJSON`, `equalYTypePNode` — all identical signatures to v1.3.7. A NEW delta-based `syncPlugin(opts)` plus `YEditorView` class exists at `src/index.js:70` (~627 LOC) but is NOT in the `package.json#exports` map. Our `patches/y-prosemirror@1.3.7.patch` ports to v2 with only line-offset edits. Schema-throw safety patch (precedent #9) is a mechanical port, not a full reimplementation.
9. **TipTap is not migrating.** `@tiptap/y-tiptap@3.0.3` was published 2026-04-08 (8 days ago) STILL pinning `yjs ^13.5.38`. Zero PRs/issues across `ueberdosis/*` mention v14. Hocuspocus shipped `4.0.0-rc.5` today (2026-04-16) STILL pinning `yjs ^13.6.8` — and invented its own typed-origin solution (parallel-implementation signal).
10. **Yjs 14 stable best-guess: Q3-Q4 2026.** RC cadence (rc.0 → rc.13 over 48 days, mean 3.7-day gap), then a 13-day rc.11 stall containing only supply-chain hardening (a "clearing decks for stable" pattern). No published migration guide, no MIGRATION.md, no RELEASE_NOTES_V14.md.
11. **Headline v14 feature is attribution** (Google-Docs-style versioning + Track Changes), built with ZenDiS (German government) + DINUM (French government) grant funding via BlockNote design partnership. Requires `gc: false`. **BlockNote adoption status (verified 2026-04-16):** `@blocknote/core@0.48.1` shipped today STILL pinning `yjs@^13.6.27` + `y-prosemirror@^1.3.7`. Zero `@y/*` packages in deps. Zero branches named yjs-14/v14/@y/attribution/track-changes/versioning. Zero commits in last 30 days mention Yjs 14. 2.5 months after the FOSDEM 2026 talk, public code progress on v14 integration is zero. See [evidence/blocknote-yjs-14-adoption-tracker.md](evidence/blocknote-yjs-14-adoption-tracker.md).
12. **Peritext / boundary anomaly is NOT addressed in v14.** Zero RFC, draft PR, in-repo doc, or release-note mention of per-mark expand semantics. v15 or never.

**Tactical bonus finding (not Yjs 14 related, but surfaced during research):** Open Knowledge's `patches/y-prosemirror@1.3.7.patch` only patches `node_modules/y-prosemirror/`, but our actual production code imports from `@tiptap/y-tiptap@3.0.3` — a vendored fork (2250 LOC, single file) that is **unpatched**. Our destructive-delete safety net (precedent #9 / R13 substitution) is currently bypassed. This is a separate production bug worth fixing on Yjs 13 today.

**Net practical implication.** Yjs 14 + @y/* is the right long-term direction (per the unification design + active maintainer investment), but it is not a viable production target for any TipTap + Hocuspocus stack today. Adoption requires either: (a) bet on BlockNote's binding work + government-funded coordination paying off in 6-12 months; (b) fork 5 packages (`@tiptap/y-tiptap`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `@tiptap/extension-drag-handle`, `@hocuspocus/server`) plus rebuild the missing 12 Hocuspocus features on `@y/websocket-server`; or (c) wait for the 0.275% adoption ratio to invert.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| D1 | Yjs core v13 vs @y/y v14 source diff | P0 | Deep | CONFIRMED |
| D2 | y-prosemirror v1.3.7 vs @y/prosemirror v2.0.0-2 source diff | P0 | Deep | CONFIRMED |
| D3 | y-codemirror.next vs @y/codemirror source diff + dual-view feasibility | P0 | Deep | CONFIRMED |
| D4 | TipTap collab packages source-trace + transitive deps | P0 | Deep | CONFIRMED |
| D5 | Hocuspocus features vs @y/websocket-server delta | P0 | Deep | CONFIRMED |
| D6 | Open Knowledge 1P consumption surface (file:line) | P0 | Deep | CONFIRMED |
| D7 | Maintainer roadmap + ecosystem migration signals | P0 | Deep | CONFIRMED |

**Scope:** 3P-pure (upstream packages) with bounded 1P consumption surface (D6) used to size the migration. Out of scope: Loro alternative (covered by `loro-ecosystem-readiness-assessment`), Automerge alternative (covered by `automerge-prosemirror-migration-assessment`), Peritext semantics correctness (covered by `peritext-on-yjs-feasibility`).

---

## Detailed Findings

### D1 — Yjs core v13 → @y/y v14 source diff

**Finding:** Type collapse is real and structural; internal Item primitives are preserved verbatim.

**Evidence:** [evidence/yjs-core-v13-vs-v14-source-diff.md](evidence/yjs-core-v13-vs-v14-source-diff.md)

**Key facts (file:line cited in evidence):**
- v13 has 8 type files (`AbstractType.js`, `YArray.js`, `YMap.js`, `YText.js`, `YXml{Element,Fragment,Hook,Text}.js`); v14 has ONE: `ytype.js` with class `YType` at line 637.
- `YType` constructor confirms `this._map = new Map()` (line 653) AND `this._start = null` (line 657) coexist on every instance.
- None of `YText`/`YMap`/`YArray`/`YXml*`/`AbstractType` are exported from `@y/y/src/index.js` — only `export YType as Type`.
- `Doc.get(key, name)` at v14 `Doc.js:197-203` is the entire surface; `getText`/`getMap`/`getArray`/`getXmlFragment`/`getXmlElement` are GONE.
- **`Item.delete(transaction)` at v14 `structs/Item.js:366-378` is byte-identical to v13 lines 612-624** except `addToDeleteSet(ds, ...)` → `ds.add(...)` (DeleteSet → IdSet rename). Constructor signature preserved verbatim. Bitfield `info` byte unchanged.
- Wire format preserved and **empirically confirmed** ([evidence/wire-format-interop-harness.md](evidence/wire-format-interop-harness.md)) — `UpdateEncoderV1/V2` class names + `applyUpdate`/`encodeStateAsUpdate`/`mergeUpdates` free functions identical (only `DSEncoderV1` → `IdSetEncoderV1` renamed). Type-ref IDs (YArray=0, YMap=1, YText=2, YXmlElement=3, YXmlFragment=4, YXmlHook=5, YXmlText=6) are LINE-IDENTICAL across v13's `Item.js` and v14's `Item.js:1382-1388`; v14's unified `YType` writes them via `_legacyTypeRef` at `ytype.js:1475`.
- Awareness API near-identical (`y-protocols@1.0.7` → `@y/protocols@1.0.6-rc.1`): `setLocalState`, `setLocalStateField`, `getLocalState`, `getStates`, events `'change'` and `'update'`.
- `lib0` undergoes major bump `^0.2.99` → `^1.0.0-rc.12`; new `lib0/trait` directory; some delta op-classes renamed.
- v14 declares `engines.node>=22` but no Node-22-required syntax found in source — conservative declared minimum, not hard runtime barrier.

**Implications:**
- **Precedent #10 (opaque-but-content-bearing nodes for Y.Item identity) reasoning survives v14** — `Item.delete()` is still CRDT-permanent and broadcast; the `updateYFragment`-style deep-attr-equality logic still applies; "use `atom: false, content: 'text*'` for raw-content nodes" guidance does NOT relax.
- **`y-prosemirror@1.3.7` will NOT compile against v14** — hard `instanceof Y.XmlElement` / `instanceof Y.XmlText` checks at sync-plugin.js:995, 1005 reference classes that don't exist in v14. Also uses `el._first` getter (v13 `AbstractType.js:344`) which is removed in v14.
- **No runtime guard collision** — v13 uses `'__ $YJS$ __'`, v14 uses `'__ $YJS14$ __'` (different strings, no collision). Dual-load triggers ZERO warning even though `instanceof` checks across versions silently fail. Earlier evidence claiming a `__$YJS14$__` blocking guard was overstated.

**Decision triggers (when this matters):**
- If our consumption stays at the "use Doc/transact/applyUpdate" abstraction level, migration is largely mechanical (rename `getText`/`getXmlFragment` to `Doc.get`).
- If we reach into Item internals (we don't directly; the y-prosemirror patch does), the patched library must be re-ported.

**Verification gaps closed (2026-04-16, Path C):** wire-format byte interop is **empirically CONFIRMED** across 28 cross-version decode attempts (8 payloads × v1/v2 × forward + 6 × v1/v2 × reverse + sync-protocol handshake both directions + realistic persistence-migration scenario — all byte-for-byte round-trip equivalent, all semantically preserving text, marks, attributes, deletes, tombstones, nested refs, and concurrent-edit histories). See [evidence/wire-format-interop-harness.md](evidence/wire-format-interop-harness.md) for per-payload results and reproduction scripts. New caveat surfaced: consumers of `yText.toDelta()` must accommodate v14's shape change from v13's `[{insert, attributes}]` to v14's `{type: 'delta', children: [{type: 'insert', insert, format}]}` — relevant for any code bridging editor state (y-prosemirror's `sync-plugin.js` and the vendored `@tiptap/y-tiptap` fork both consume `.toDelta()`). Remaining gap: persistence-layer providers (y-leveldb, y-indexeddb) not directly tested — their on-disk representation is a thin wrapper over the same `encodeStateAsUpdate` bytes that ARE verified, so the gap is bounded.

---

### D2 — y-prosemirror v1.3.7 → @y/prosemirror v2.0.0-2 source diff

**Finding:** Public API of legacy y-prosemirror is preserved verbatim in @y/prosemirror v2; a NEW delta-based plugin is shipped in parallel but is NOT exported via package.json. Our destructive-delete patch ports cleanly. **A separately-discovered patch coverage gap means our production code is currently unprotected even on v13.**

**Evidence:** [evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md](evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md)

**Key facts:**
- `@y/prosemirror@2.0.0-2`'s public exports — `ySyncPlugin`, `updateYFragment`, `yCursorPlugin`, `yUndoPlugin`, `prosemirrorJSONToYXmlFragment`, `yXmlFragmentToProsemirrorJSON`, `equalYTypePNode` — are LINE-FOR-LINE identical to v1.3.7 except ±17 LOC of shift.
- A NEW `syncPlugin(opts)` shape with YType in plugin metadata exists at `/tmp/yprose2/package/src/index.js:70` (627 LOC of new code using `lib0/delta` semantic deltas + `attribution-manager`s + a `YEditorView` class), but is **NOT in the `package.json#exports` map**.
- The destructive-delete failure mode is unchanged in v2: lines `:804-811` (block) and `:839-844` (inline) of v2's `sync-plugin.js` are LINE-FOR-LINE the upstream pre-patch code. Our `patches/y-prosemirror@1.3.7.patch` ports cleanly with mechanical line-offset edits.
- **CRITICAL collateral finding** (separate from Yjs 14 question): `agent-sessions.ts:26`, `server-observers.ts:34`, `observers.ts:41`, and `TiptapEditor.tsx:15` all import from `@tiptap/y-tiptap`, which is a **vendored fork** at `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (2250 LOC, single file) containing the destructive-delete at lines 862 and 897. **The fork is unpatched** — `grep "rawMdxFallback\|R13 patch"` returns nothing. The patch only modifies `node_modules/y-prosemirror/`.

**Implications:**
- API drop-in for v2's public surface is real, but the binding from Yjs 13 to Yjs 14 happens BELOW that surface — the `instanceof Y.XmlElement` checks (D1) are inside `sync-plugin.js`. So while the EXPORTED API is preserved, the INTERNAL implementation is incompatible with Yjs 13.
- Our patch can be re-ported to @y/prosemirror v2 at line-shift cost only — the algorithm structure is unchanged.
- **The patch coverage gap on `@tiptap/y-tiptap` is a pre-existing production bug** unrelated to Yjs 14, worth fixing on v13 immediately by patching y-tiptap directly, vendoring our own y-prosemirror with the patch, or moving symbols to import from `y-prosemirror` directly so the existing patch applies.

**Decision triggers:**
- If we go to Yjs 14 + @y/prosemirror v2, the patch ports cleanly — no algorithmic redesign.
- If we stay on Yjs 13, fix the patch coverage gap independently (1-day spike).

---

### D3 — y-codemirror.next → @y/codemirror source diff + dual-view feasibility

**Finding:** Single-YType dual-view binding is NOT achievable with stock @y/* today. Forking to enable it is more work than the existing two-CRDT bridge.

**Evidence:** [evidence/y-codemirror-vs-y-codemirror-source-diff.md](evidence/y-codemirror-vs-y-codemirror-source-diff.md)

**Key facts:**
- `@y/codemirror@0.0.0-3` observer at `/tmp/ycm/package/src/y-sync.js:209`:
  ```
  changes.push({ from: pos, to: pos, insert: /** @type {string} */ (op.insert) })
  ```
  This `string` cast has no array-insert branch. When fed a tree YType, this silently produces `"[object Object]"` writes into CodeMirror.
- `Y.Type<{ text: true }>` is purely a TS-side promise; `text:true`, `recursive:true`, `attrs:…` are orthogonal DConf fields. A YType structurally satisfying both PM's `{text:true, recursive:true, attrs}` and CM's `{text:true}` doesn't help — runtime observe events reflect actual content shape, not type assertion.
- A real fork requires not just an inbound array→string projection but a new outbound algorithm that locates leaf YTypes for CM diffs. Equivalent to writing a new binding from scratch.
- Two YTypes + bridge IS the answer under @y/y, same as today. The bridge code (`server-observers.ts`) survives the migration unchanged in algorithm.

**Implications:**
- **Architecture C ("delta-protocol dual view in 2-4 weeks") from the original peritext-on-yjs-feasibility report is REFUTED at source level for production use.** The `string` cast at `y-sync.js:209` is load-bearing and not removable by a small patch.
- The "single-CRDT collapse eliminates the bridge" framing is wrong. The bridge problem RELOCATES. Under @y/* you'd own the same bridge logic, just with different YType primitives underneath.

**Decision triggers:**
- If single-CRDT collapse is the goal: must fork @y/codemirror or wait for upstream tree-aware version. No production reference exists for either.
- If two-CRDT bridge is acceptable: Yjs 14 unification doesn't solve our problem; benefit dissolves.

**Cross-CRDT verification (added 2026-04-16):** The dual-view limitation is **not Yjs-specific**. `loro-codemirror@0.3.3` has the structurally identical constraint — `LoroSyncPluginValue` binds to `LoroText` only (`sync.ts:15-19`), filters non-text diffs at the observer (`sync.ts:64`: `if (diff.type !== "text") return`), and emits `Delta<string>`-typed ops to CodeMirror. Its sibling `loro-prosemirror@0.4.3` requires a disjoint `LoroMap<{nodeName, attributes, children: LoroList}>` container (`lib.ts:19-37`). SchoolAI's `loro-extended` (53-star wrapper) ships zero CodeMirror adapter. Source trace + ecosystem check: [reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md](../peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md). Implication: a tree-aware CodeMirror binding is **unbuilt in both major CRDT ecosystems as of 2026-04-16**. Choosing Loro does not unlock dual-view; it relocates the bridge to different primitives. The conclusion that the two-CRDT bridge is the prevailing approach, not a Yjs-13 artifact, cascades.

---

### D4 — TipTap collab packages + transitive coupling

**Finding:** TipTap has NOT migrated and isn't planning to publicly. `@tiptap/y-tiptap@3.0.3` is a vendored fork of y-prosemirror, not a wrapper. Three TipTap collab extensions are coupled, not two.

**Evidence:** [evidence/tiptap-collab-packages-source-trace.md](evidence/tiptap-collab-packages-source-trace.md)

**Key facts:**
- `@tiptap/y-tiptap@3.0.3` published 2026-04-08 — eight days ago — still pins `yjs ^13.5.38`.
- Zero GitHub issues/PRs mention "yjs 14" in either `ueberdosis/tiptap` or `ueberdosis/y-tiptap`.
- TipTap's 2026 roadmap (document structure, conversion, AI) does not mention Yjs 14.
- `@tiptap/y-tiptap@3.0.3` is **y-prosemirror@1.3.7 with one bug-fix patch** (stale cursor-meta transactions). Every single export is forked code — zero pass-through re-exports. Size: 2250 bundled LOC vs y-prosemirror's 2209 split LOC.
- **`@tiptap/extension-collaboration-cursor@3.0.0` bypasses y-tiptap entirely** — imports `yCursorPlugin` directly from `y-prosemirror`, NOT from `@tiptap/y-tiptap`. This is why we have `y-prosemirror@1.3.7` in `node_modules` even though we never import it directly.
- The cursor extension's `render(user)` callback is generic (`Record<string, any>`), not Yjs-typed.
- **Third coupled extension surfaced**: `@tiptap/extension-drag-handle` imports `absolutePositionToRelativePosition`, `relativePositionToAbsolutePosition`, `ySyncPluginKey` from `@tiptap/y-tiptap` and uses relative positions to keep drag-handle position stable across remote transactions.

**Concrete fork delta to support Yjs 14:**
- y-tiptap fork: ~700-900 LOC net, most of it ports
- 5 packages forked: `y-tiptap`, `extension-collaboration`, `extension-collaboration-cursor`, `extension-drag-handle`, plus `y-codemirror.next` or switch to `@y/codemirror@0.0.0-3` (which has the dual-view limitation per D3)
- Since `@y/prosemirror@2.0.0-2` preserves the legacy public API verbatim (see D2 correction), y-tiptap's fork re-targets `@y/prosemirror` calls to its preserved API — NOT a from-scratch delta-based rewrite. Smaller scope than initially estimated.
- `applyAgentMarkdownWrite` (precedent #10/#12) still consumes `updateYFragment` — which IS preserved in `@y/prosemirror@2.0.0-2`'s public exports. Port is mechanical.
- Schema-narrowing safety patch (precedent #9) is a line-offset port, not reimplementation against new architecture.
- **Revised estimate: 3-5 weeks focused work** for the binding fork alone (down from the initial 1-2 months estimate, corrected post-audit)

**Implications:**
- A long-running TipTap fork is the cost of Yjs 14 + TipTap. TipTap shipped fresh on Yjs 13 eight days ago — they're not going to do this for us.

---

### D5 — Hocuspocus features vs @y/websocket-server

**Finding:** Of 17 Hocuspocus capabilities OK uses, 1 is PRESENT in `@y/websocket-server`, 3 are PARTIAL, **13 are ABSENT**. Hocuspocus + `@y/y` is structurally incompatible at the import layer.

**Evidence:** [evidence/hocuspocus-features-vs-y-websocket-server.md](evidence/hocuspocus-features-vs-y-websocket-server.md)

**Key facts:**
- Verified: installed Hocuspocus is `4.0.0-rc.1`, but all rc.0–rc.5 are functionally equivalent (`peerDependencies.yjs: ^13.6.8` across the entire rc series).
- **No `__$YJS14$__` runtime guard exists in Hocuspocus.** `grep -rn "YJS14\|__\$YJS"` returns zero hits. The Yjs-14 blocker is purely the npm peer-dep solver — not a runtime check. `npm overrides yjs:14.0.0-16` will install + load Hocuspocus, but whether yjs@14 internal API drift breaks Hocuspocus at runtime is unverified by maintainers.
- **`@y/websocket-server@0.1.5` is 281 LOC.** `dependencies.yjs: ^14.0.0-7`, no peer-dep. Earlier "peer ^13.5.6 + dep ^14.0.0-7" claim was a version-confusion artifact (peer 13.5.6 was 0.1.0/0.1.1; dep 14.0.0-7 is 0.1.5; peer was dropped in 0.1.2).
- **`@y/websocket-server@0.1.5` is split-brain on naming** — `utils.js:1` imports `'yjs'` (legacy package name) while `@y/websocket@4.0.0-rc.2/src/y-websocket.js:6` imports `'@y/y'` (new namespaced package). Different npm packages, both publish 14.x lines, neither deprecated. The @y/* ecosystem itself is in transition.
- **Hocuspocus feature inventory (17 capabilities):**
  - **PRESENT (1):** awareness propagation (`@y/protocols` is a drop-in for `y-protocols/awareness`)
  - **PARTIAL (3):** server constructor, `bindState` ≈ onLoadDocument, `Document.transact(fn, origin)` (Y.Doc.transact is yjs-native but typed-origin convention + skipStoreHooks plumbing + DirectConnection wrapping are missing)
  - **ABSENT (13):** onStoreDocument debounce/mutex/skipStoreHooks, afterLoadDocument, onAuthenticate + queue-during-auth, openDirectConnection + DirectConnection.disconnect, broadcastStateless/CC1, Connection per-conn ordered queue, documents registry with load-promise dedup, document unload TTL/debounce, extensions array + plugin lifecycle, hook payload context propagation, server-managed lifecycle (`destroy`/`flushPendingStores`/`closeConnections`), `beforeBroadcastStateless` interception
- **Estimated greenfield budget on top of `@y/websocket-server`'s 281 LOC: ~1,850 server LOC + ~250 client-side** to recover what Hocuspocus rc.1 ships in 3,000+ LOC.
- **Decisive structural observation:** `lib0` undergoes a major version split between Hocuspocus's `^0.2.x` and `@y/*`'s `^1.0.0-rc.x`. They cannot share a single lib0 install. Combined with Hocuspocus's `import "yjs"` vs `@y/protocols`/`@y/websocket`'s `import "@y/y"` (different package identifiers — npm overrides cannot remap one to the other), **Hocuspocus + `@y/y@14` is structurally incompatible at the import level.**
- **OK uses ZERO `@hocuspocus/extension-*` packages.** Only `server`, `provider`, `common`. All extension equivalents (persistence, observability, agent sessions, CC1, server observers) are local in `packages/server/src/`. There's no extension-package migration path because there are no extension packages to migrate.

**Implications:**
- Either stay on Hocuspocus + force `yjs@14` via overrides (unsupported, unverified) — OR swap Hocuspocus + adopt `@y/y@14` cleanly (~2,000-LOC framework rewrite).
- The 13 ABSENT features include load-bearing primitives we use heavily: `openDirectConnection` (CC1 + observer attachment), `broadcastStateless` (CC1 wire format), Connection per-conn ordered queue (sync correctness), documents registry load-promise dedup (multi-client sync correctness).

---

### D6 — Open Knowledge 1P consumption surface

**Finding:** 89 direct import sites across 64 files. Three primitives carry the heavy migration cost.

**Evidence:** [evidence/open-knowledge-yjs-consumption-surface.md](evidence/open-knowledge-yjs-consumption-surface.md)

**Quantified surface:**
- `from 'yjs'`: 41 sites
- `from '@tiptap/y-tiptap'`: 24 sites
- `from '@hocuspocus/server'`: 28 sites
- `from '@hocuspocus/provider'`: 17 sites
- `from 'y-codemirror.next'`: 1 site (`SourceEditor.tsx:31` — single-point consumer)
- `from '@tiptap/extension-collaboration'`: 1 site (`TiptapEditor.tsx:12`)
- **Production LOC: ~12,861; test LOC: ~9,000+**
- **Zero direct imports** in `packages/cli/src/mcp/**` or in `docs/`

**Three primitives where migration cost concentrates:**
1. `@tiptap/y-tiptap`'s `updateYFragment` + `yXmlFragmentToProsemirrorJSON` — used in **11 production files** for bridge writes/reads; no public `@y/tiptap` successor exists.
2. The `y-prosemirror@1.3.7` patch's destructive-delete substitution — **5 production write paths** (`updateYFragment` consumers in `server-observers.ts`, `external-change.ts`, `agent-sessions.ts`, `api-extension.ts`, `persistence.ts`) transitively depend on it; the global `__okYpsCounters` it populates feeds `parse-health.ts` metrics.
3. The `LocalTransactionOrigin` typed-object identity contract — 7 origin singletons, 1 `BRIDGE_ENFORCING_ORIGINS` Set, 8+ `Y.UndoManager.trackedOrigins` sites; survives only if v14 keeps `transaction.origin` as opaque per-transaction value preserved through `transact()` (D1 confirmed it does).

**Yjs internals reach-in is minimal and well-marked:** zero deep imports; `transaction.changedParentTypes` is the single private-API access (`observers.ts:268-271`, with in-source degradation comment); `awareness.states.set/emit` is used only in a DEV-only test injection hook (`SystemDocSubscriber.tsx:131-132`).

**The CLI `@hocuspocus/provider` dep at `packages/cli/package.json:34` is vestigial** — no source file in `packages/cli/src` actually imports it. Could be dropped during the v14 port (or even now, independent of v14 question).

---

### D7 — Maintainer roadmap + ecosystem migration signals

**Finding:** Yjs 14 stable best-guess Q3-Q4 2026; Hocuspocus and TipTap have not committed; BlockNote is the lone publicly-committed Yjs 14 design partner with European government grant funding; Peritext / boundary anomaly NOT being addressed in v14.

**Evidence:** [evidence/yjs-14-maintainer-roadmap-and-signals.md](evidence/yjs-14-maintainer-roadmap-and-signals.md)

**Key facts:**
- **RC cadence:** rc.0 → rc.13 spans 2026-02-25 → 2026-04-14 (48 days, mean 3.7-day gap). rc.11 was a 13-day stall containing only supply-chain hardening (Scorecard, GHA permissions, incident response plan) — a "clearing the decks for stable" pattern. rc.12 and rc.13 ship without release notes (bot-published, ~14 hours apart).
- **dmonad's most explicit guidance** — issue #751 (2025-11-30): *"I'm not ready yet to make Yjs v14 available for everyone... please don't open bug reports against alpha software (x.x.x-*) yet. I know that these releases are broken."*
- **Adoption ratio:** `yjs` legacy 3,566K weekly vs `@y/y` 9,822 (0.275%). y-prosemirror 701K vs @y/prosemirror 9. y-codemirror.next 30.5K vs @y/codemirror 4.
- **Two `wontfix` issues confirm dual-package coexistence is intentional:** [y-codemirror.next#40](https://github.com/yjs/y-codemirror.next/issues/40), [y-websocket#201](https://github.com/yjs/y-websocket/issues/201). dmonad is deliberately keeping the alpha low-traffic.
- **Hocuspocus has NOT migrated:** `@hocuspocus/server@4.0.0-rc.5` hard-pins `yjs ^13.6.8`. v4 RELEASE_NOTES (cross-runtime + typed Context + ordered messages) has zero v14 mentions. Hocuspocus v4 invented its own `LocalTransactionOrigin`/`ConnectionTransactionOrigin`/`RedisTransactionOrigin` typed-origin solution — **a parallel-implementation signal that ueberdosis doesn't intend to wait for v14.**
- **TipTap pins `yjs ^13`** in `@tiptap/extension-collaboration`. Zero v14 PRs/issues across `ueberdosis/*`. AFFiNE pins `yjs 13.6.21` (Dec 2024 — many patch versions stale).
- **BlockNote is the lone publicly-ANNOUNCED Yjs 14 design partner** (sharpened from prior "committed" framing per Path C update). FOSDEM 2026 talk "BlockNote, Prosemirror and Yjs 14: Versioning and Track Changes" by Yousef El-Dardiry + Nick Perez confirms the design-partnership status with government funding (ZenDiS + DINUM). **Public code progress as of 2026-04-16, 2.5 months after the talk: zero.** `@blocknote/core@0.48.1` (published today) pins `yjs@^13.6.27`, imports no `@y/*` packages, and has no v14-related branches or PRs. See [evidence/blocknote-yjs-14-adoption-tracker.md](evidence/blocknote-yjs-14-adoption-tracker.md) for full tracker.
- **No v14→stable migration guide exists.** No `MIGRATION.md`, no `RELEASE_NOTES_V14.md`, no `CHANGELOG.md` (404 on raw fetch), no `ROADMAP.md` (404). `SECURITY.md` still lists only 13.6.x as supported. README on `main` doesn't mention v14 or `@y/y`.
- **Headline v14 feature is attribution** (Google-Docs-like versioning + Track Changes), per in-repo `attributing-content.md` + `attribution-manager.md`. Includes `DeleteSet → IdSet` rename, new `IdMap`, `Attribution`/`AttributionManager` types, `applyDelta` semantic changes. **Crucially: requires `new Y.Doc({ gc: false })` — exactly the GC-disabled mode dmonad called "unfair" when Loro's benchmarks assumed it.**
- **Peritext / boundary anomaly is NOT being addressed in v14.** Zero RFC, draft PR, in-repo doc, or release-note mention of per-mark expand semantics. v15 or never problem.
- **lib0 1.0.0 stable hasn't shipped (rc.12 only); Yjs 14 depends on `lib0 ^1.0.0-rc.12`.**
- **v13 is still being patched** (`v13.6.30` shipped 2026-03-14) — parallel-maintenance posture, not deprecation. v13.6.x is the security-supported line.
- **Loro is not visibly pressuring Yjs cadence.** Loro 23.5K weekly downloads (~0.66% of yjs). Last dmonad-Loro discussion was May 2024 — no recent updates or admissions of catch-up pressure.

**Funding shape:** GitHub Sponsors + OpenCollective (`y-collective`) + ZenDiS/DINUM grants for v14 attribution work + Velt corporate sponsor. Single maintainer (Berlin-based independent OSS dev). Nick Perez is the most-active y-prosemirror v2 contributor but not a co-maintainer.

---

## Library-by-library migration map

| Today's library | Pinned | Status | Migration class |
|---|---|---|---|
| `yjs` | `^13.6.30` | REPLACE | `@y/y@^14.0.0-rc.13` (or stay on `yjs ^14`) |
| `y-prosemirror` (transitive only) | 1.3.7 | REPLACE | `@y/prosemirror@^2.0.0-2` (public API preserved; patch re-port mechanical) |
| `@tiptap/y-tiptap` | `^3.0.3` | **FORK** | Vendored fork of y-prosemirror; upstream not migrating; ~700-900 LOC fork |
| `@tiptap/extension-collaboration` | `^3.22.3` | **FORK** | Trivial peerDep bump but transitively requires y-tiptap fork |
| `@tiptap/extension-collaboration-cursor` | `3.0.0` | **FORK** | Bypasses y-tiptap; imports `yCursorPlugin` directly from y-prosemirror; `@y/prosemirror@2.0.0-2` preserves `yCursorPlugin` export (audit-corrected — it IS ported) — fork swaps import from `y-prosemirror` to `@y/prosemirror` |
| `@tiptap/extension-drag-handle` (newly surfaced) | (verify) | **FORK** | Imports `absolutePositionToRelativePosition`, `ySyncPluginKey` from @tiptap/y-tiptap |
| `y-codemirror.next` | `^0.3.5` | REPLACE | `@y/codemirror@^0.0.0-3` — but cannot consume tree-shape ops (string cast at y-sync.js:209) |
| `@hocuspocus/server` | `4.0.0-rc.1` | **FORK or REPLACE** | Fork to bump yjs peer (no upstream signal), OR replace with custom server on `@y/websocket-server@0.1.5` (281 LOC starter) + ~1,850 LOC custom for missing 12 features |
| `@hocuspocus/provider` | `4.0.0-rc.1` | **FORK or REPLACE** | Fork peer-dep bump, OR replace with `@y/websocket@^4.0.0-rc.2` + ~250 LOC for missing client lifecycle (synced event etc.) |
| `@hocuspocus/common` | (transitive) | **FORK** | Pinned via Hocuspocus packages |
| `lib0` (transitive) | `^0.2.x` (Hocuspocus), `^1.0.0-rc.x` (@y/*) | **MAJOR SPLIT** | Cannot share single install; no override-resolvable path |
| `y-protocols` (transitive) | `^1.0.7` | REPLACE | `@y/protocols@^1.0.6-rc.1` (Awareness API near-identical) |
| `prosemirror-*` | various | SURVIVES | CRDT-orthogonal |
| `@codemirror/*` | various | SURVIVES | CRDT-orthogonal |
| `@tiptap/core`, `@tiptap/pm`, other `@tiptap/extension-*` non-collab | various | SURVIVES | CRDT-orthogonal |
| `patches/y-prosemirror@1.3.7.patch` | bun patch | RE-PORT (mechanical) | Lines `:804-811` block + `:839-844` inline ports verbatim to v2 |
| `patches/@handlewithcare/remark-prosemirror@0.1.5.patch` | bun patch | SURVIVES | Pure ProseMirror, no CRDT touch |

---

## Cross-cutting findings

### 1. The structural-incompatibility wall

`Hocuspocus + @y/y@14` cannot coexist in the same Node process today because:
- They import from different npm package names (`'yjs'` vs `'@y/y'`) — `npm overrides` cannot remap package identifiers
- They depend on different lib0 major versions (`^0.2.x` vs `^1.0.0-rc.x`) — cannot share a single install
- Bun and npm/pnpm peer-dep solvers will refuse the combination unless overridden, and even then the runtime imports are split

This is not a peer-dep policy choice; it is a structural artifact of the @y/* rebrand.

### 2. The dual-view binding gap

The original peritext-on-yjs-feasibility report's Architecture C ("delta-protocol dual view in 2-4 weeks") rests on an assumption that does not hold at source level today: `@y/codemirror` cannot consume tree-shape deltas. Either fork @y/codemirror (equivalent to writing a new binding) or maintain two YTypes + bridge (same architecture as today). Yjs 14 unification doesn't solve our specific problem; it relocates it.

### 3. The patch coverage gap (incidental finding, not Yjs-14-related)

Our `patches/y-prosemirror@1.3.7.patch` only modifies `node_modules/y-prosemirror/`. Production code imports from `@tiptap/y-tiptap`, a vendored fork of y-prosemirror that contains the destructive-delete failure mode at lines 862 and 897, **unpatched**. Our R13/precedent #9 safety net is currently bypassed in production. Worth fixing on Yjs 13 today — independent of any migration question.

### 4. Three coupled TipTap collab extensions, not two

Beyond `@tiptap/y-tiptap` and `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor` imports yCursorPlugin DIRECTLY from y-prosemirror (bypassing y-tiptap entirely), and `@tiptap/extension-drag-handle` imports relative-position helpers + `ySyncPluginKey` from y-tiptap. Any TipTap-side fork must cover all three.

### 5. The maintainer's own posture

dmonad has explicitly said v14 is "broken" alpha software (issue #751, 2025-11-30) and is deliberately keeping its npm download share at 0.275% via `wontfix` issues that prevent y-codemirror.next and y-websocket from migrating. The maintainer's own roadmap message is: *not yet ready for production*.

---

## Recommendations / Decision triggers

### When Yjs 14 + @y/* becomes viable for a TipTap + Hocuspocus stack

The migration ceases to be "fork 5+ libraries and rebuild Hocuspocus" when ALL of the following are true:
1. `lib0@^1.0.0` ships stable
2. `@y/y@14` ships stable (Q3-Q4 2026 best-guess per RC cadence)
3. dmonad publishes a `MIGRATION.md` and removes the "broken alpha" caveat
4. `@y/prosemirror` v2 stabilizes its entry point (currently its `package.json#exports` points at the preserved-verbatim legacy API; the NEW delta-based `syncPlugin` + `YEditorView` at `src/index.js` is unpublished for consumers today)
5. EITHER Hocuspocus ships a v5 with `yjs ^14` peer-dep, OR `@y/websocket-server` grows to feature parity with Hocuspocus (currently 281 LOC vs 3000+ LOC gap)
6. EITHER TipTap ships a `@tiptap/y-tiptap` v4 with `@y/y` peer-dep, OR an alternative TipTap-compatible binding emerges
7. BlockNote (the lone design partner) demonstrates production-shipped Yjs 14 + their stack works

None of these are true today. Items 5 and 6 have zero upstream PRs as of 2026-04-16.

### Watch-list signals (re-evaluate when these change)

- `@y/y` weekly downloads cross 100K (currently 9,822 — 10x growth needed)
- Hocuspocus or TipTap publishes ANY issue/PR/blog/talk mentioning v14 timeline
- **BlockNote-specific triggers** (monthly-check, sharpened post-Path-C): any `@y/*` dependency lands in `@blocknote/core`'s deps; any PR or branch in `TypeCellOS/BlockNote` appears with `yjs-14`/`v14`/`attribution`/`track-changes` in the name; ZenDiS or DINUM publishes a milestone report naming BlockNote + Yjs 14
- `lib0@^1.0.0` exits RC
- `MIGRATION.md` appears in `yjs/yjs` repo

### Implications for projects on Yjs 13 today

- Yjs 14 is NOT a "wait 6 months and migrate" situation. Most-likely outcome at 6 months: ecosystem still split, BlockNote ships first, Hocuspocus + TipTap remain on v13.
- The structural-incompatibility wall (lib0 split + import-name split) is unlikely to soften without a coordinated multi-org release.
- **Most predictable path to Yjs 14 for a TipTap + Hocuspocus stack: wait for ueberdosis to publish v14-compatible TipTap collab packages.** Track `@tiptap/y-tiptap` releases. Could be 12+ months given current signals.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Empirical wire-format interop test** — **CLOSED 2026-04-16** via [evidence/wire-format-interop-harness.md](evidence/wire-format-interop-harness.md). 28 cross-version decode directions all PASS byte-for-byte; sync protocol handshake interops both directions; realistic persistence-migration scenario round-trips 481-byte v1 / 403-byte v2 update bits bit-for-bit.
- **Persistence-layer-provider compatibility** — `y-leveldb`, `y-indexeddb` not directly tested end-to-end, but the on-disk representation of both is a thin wrapper around `encodeStateAsUpdate` bytes that ARE verified compatible. Confidence high that the gap is bounded.
- **`toDelta()` API-shape migration cost** — NEW caveat surfaced by the harness: v13's `[{insert, attributes}]` delta shape changed to v14's `{type: 'delta', children: [{type: 'insert', insert, format}]}`. Any editor-bridge consumer of `.toDelta()` (y-prosemirror, vendored @tiptap/y-tiptap) needs shape translation. `@y/prosemirror@2` already consumes v14's shape, so migration to that package inherits the fix.
- **Hocuspocus-extension migration paths** — OK uses none, so didn't deep-trace, but other consumers depend on `@hocuspocus/extension-database`, `@hocuspocus/extension-redis`, etc.
- **`docs.yjs.dev` and `beta.yjs.dev` sidebar exploration** — couldn't fully expand via WebFetch; some maintainer-published docs may exist that weren't surfaced.

### Open Questions

1. **What's BlockNote's Yjs 14 ship-date?** *(partially closed — Path C 2026-04-16):* Zero public code progress 2.5 months post-FOSDEM-2026. Either private-fork / design-phase OR delayed/deprioritized. No public ship-date. Next-check cadence: monthly or on BlockNote release (they ship frequently; a v14 signal appears quickly once work lands on main).
2. **Does ZenDiS / DINUM grant funding extend to Hocuspocus migration, or is it BlockNote-specific?** If the grants cover server-side too, the timeline shifts.
3. **Will Kevin Jahns publish a `@y/hocuspocus` or similar as part of the @y/* family?** No public signal yet.
4. **Is there a community fork of Hocuspocus targeting Yjs 14 in flight?** Searched GitHub orgs; none surfaced as of 2026-04-16.
5. **Does the `@y/websocket-server@0.1.5` split-brain (`yjs` vs `@y/y` imports) resolve in 0.2.x?** Not yet on npm.

---

## References

### Evidence Files (all written 2026-04-16, source-traced)
- [evidence/yjs-core-v13-vs-v14-source-diff.md](evidence/yjs-core-v13-vs-v14-source-diff.md) — Type collapse, Item internals preserved, Doc.get API, lib0 major bump, runtime guard analysis
- [evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md](evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md) — Public API preserved verbatim, NEW deltas plugin not exported, patch ports cleanly, **patch coverage gap on @tiptap/y-tiptap discovered**
- [evidence/y-codemirror-vs-y-codemirror-source-diff.md](evidence/y-codemirror-vs-y-codemirror-source-diff.md) — string cast at y-sync.js:209, dual-view NOT achievable, two-YType + bridge survives
- [evidence/tiptap-collab-packages-source-trace.md](evidence/tiptap-collab-packages-source-trace.md) — y-tiptap is vendored fork (2250 LOC), three coupled extensions, ~700-900 LOC fork estimate
- [evidence/hocuspocus-features-vs-y-websocket-server.md](evidence/hocuspocus-features-vs-y-websocket-server.md) — 1 PRESENT / 3 PARTIAL / 13 ABSENT, lib0 split, structural incompatibility
- [evidence/open-knowledge-yjs-consumption-surface.md](evidence/open-knowledge-yjs-consumption-surface.md) — 89 import sites across 64 files, three primitive concentrations, vestigial CLI dep
- [evidence/yjs-14-maintainer-roadmap-and-signals.md](evidence/yjs-14-maintainer-roadmap-and-signals.md) — RC cadence, dmonad's broken-alpha statement, BlockNote government-funded design partnership, attribution as headline feature

### External Sources (key)
- [Yjs GitHub](https://github.com/yjs/yjs) main branch
- [Yjs v14 RC releases](https://github.com/yjs/yjs/releases) — rc.0 through rc.13
- [yjs issue #751 — dmonad's broken-alpha statement](https://github.com/yjs/yjs/issues/751)
- [y-codemirror.next#40 — wontfix dual-package](https://github.com/yjs/y-codemirror.next/issues/40)
- [y-websocket#201 — wontfix dual-package](https://github.com/yjs/y-websocket/issues/201)
- [BlockNote, Prosemirror and Yjs 14 (FOSDEM 2026)](https://fosdem.org/2026/schedule/event/) — Yousef El-Dardiry + Nick Perez
- [npm @y/y dist-tags](https://registry.npmjs.org/-/package/@y/y/dist-tags)
- [npm yjs dist-tags](https://registry.npmjs.org/-/package/yjs/dist-tags)
- [Hocuspocus releases](https://github.com/ueberdosis/hocuspocus/releases) — v4.0.0-rc.5 (2026-04-16) still pinning yjs ^13
- [@tiptap/y-tiptap@3.0.3 npm](https://www.npmjs.com/package/@tiptap/y-tiptap) — published 2026-04-08, peer yjs ^13.5.38

### Library Source (verified file:line)
- `node_modules/yjs/src/` (v13.6.30)
- `/tmp/y14/package/src/` extracted from `https://registry.npmjs.org/@y/y/-/y-14.0.0-rc.13.tgz`
- `/tmp/yprose2/package/src/` extracted from `https://registry.npmjs.org/@y/prosemirror/-/prosemirror-2.0.0-2.tgz`
- `/tmp/ycm/package/src/` extracted from `https://registry.npmjs.org/@y/codemirror/-/codemirror-0.0.0-3.tgz`
- `/tmp/ywss/package/src/` extracted from `https://registry.npmjs.org/@y/websocket-server/-/websocket-server-0.1.5.tgz`
- `/tmp/yws/package/src/` extracted from `https://registry.npmjs.org/@y/websocket/-/websocket-4.0.0-rc.2.tgz`
- `/tmp/yp/package/src/` extracted from `https://registry.npmjs.org/@y/protocols/-/protocols-1.0.6-rc.1.tgz`
- `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (vendored fork, 2250 LOC)
- `node_modules/@hocuspocus/{server,provider,common}/src/`

### Related Research
- [reports/peritext-on-yjs-feasibility/REPORT.md](../peritext-on-yjs-feasibility/REPORT.md) — consumer perspective on Yjs 14 unification (drives Peritext-style dual-view)
- [reports/loro-ecosystem-readiness-assessment/REPORT.md](../loro-ecosystem-readiness-assessment/REPORT.md) — alternative CRDT (Peritext-correct, weaker server tooling)
- [reports/automerge-prosemirror-migration-assessment/REPORT.md](../automerge-prosemirror-migration-assessment/REPORT.md) — alternative CRDT (12-20 weeks, all-or-nothing)
- [reports/three-way-merge-content-preservation/REPORT.md](../three-way-merge-content-preservation/REPORT.md) — the algorithmic limit that Yjs 14 doesn't fix
- [reports/yjs-transaction-settlement-hooks/REPORT.md](../yjs-transaction-settlement-hooks/REPORT.md) — `afterAllTransactions` semantics (preserved across v13/v14)
- [reports/crdt-observer-bridge-latency-analysis/REPORT.md](../crdt-observer-bridge-latency-analysis/REPORT.md) — performance context for the dual-CRDT architecture
