# Changelog — yjs-14-ecosystem-adoption

## 2026-04-16 — Path C: D1 wire-format empirical verification

Closed D1 verification gap flagged in the original report: "wire-format byte interop not empirically tested." Built a 4-directory Bun harness at `/tmp/yjs-interop-harness/` that pairs `yjs@13.6.30` with `@y/y@14.0.0-rc.13` (separate installs because the packages conflict under a single dependency solver). Exercised 8 payloads covering every major CRDT construct (Y.Text with concurrent-edit history, Y.XmlFragment with nested XmlElements + attrs, Y.Map with nested Y.Text values, Y.Array with mixed scalar + Y.Map entries, Y.Text after UndoManager ops, Y.Text with tombstones, rich formatting marks, deep XmlElement nesting). Tested every decode direction (v13→v14 v1, v13→v14 v2, v14→v13 v1, v14→v13 v2, state-vector diff both directions, sync protocol handshake both directions, persistence-migration scenario mimicking Open Knowledge's actual 4-type doc shape).

**Finding:** Wire-format interop is **empirically CONFIRMED**. All 28 cross-version decode attempts succeeded with byte-for-byte round-trip equivalence. Sync protocol messages interop without modification (`messageYjsSyncStep1=0`, `messageYjsSyncStep2=1`, `messageYjsUpdate=2` unchanged; both packages' sync.js bodies structurally identical). Realistic persistence-migration scenario (481-byte v1 / 403-byte v2 update) loads in v14 byte-for-byte. Type-ref IDs (YArray=0, YMap=1, YText=2, YXmlElement=3, YXmlFragment=4, YXmlHook=5, YXmlText=6) are LINE-IDENTICAL across both packages' `Item.js`; v14's unified `YType` writes them via `_legacyTypeRef` at `ytype.js:1475`.

**New caveat surfaced:** `yText.toDelta()` output shape changed from v13's `[{insert, attributes}]` (Quill-delta-shaped) to v14's `{type: 'delta', children: [{type: 'insert', insert, format}]}`. The mark attributions themselves are identical, but the outer JS object shape breaks consumers that destructure via v13's shape. Relevant for editor-bridge code in y-prosemirror and the vendored @tiptap/y-tiptap fork. `@y/prosemirror@2` already reads v14's shape, so D2 migration inherits the fix.

**Additional observable differences** (all API-surface-only, zero data loss): `ymap.keys()/get()/has()/set()` renamed to `attrKeys()/getAttr()/hasAttr()/setAttr()` on v14's unified YType; `XmlText.toString()` drops the `<bold>...</bold>` mark rendering in favor of `<>...</>`; named YText `.toString()` wraps with pseudo-XML tags (`<text>...</text>`). All underlying CRDT state preserved and accessible via `.toDelta()` with shape translation.

**Files touched:**
- `evidence/wire-format-interop-harness.md` — new evidence file (harness setup, test matrix, per-direction results, failure-mode classification, reproduction scripts)
- `REPORT.md` D1 "Key facts" bullet on wire format — upgraded "apparently preserved" to "preserved and empirically confirmed" with ytype/Item.js citations
- `REPORT.md` D1 "Verification gaps" line — upgraded from "not empirically tested" to "empirically CONFIRMED ... CLOSED" with new `toDelta()`-shape caveat and bounded persistence-layer gap
- `REPORT.md` Limitations — "Empirical wire-format interop test" marked CLOSED; new entry added for `toDelta()` shape translation as a migration line-item
- `meta/_changelog.md` — new entry (this entry)

## 2026-04-16 — Cross-report Loro CodeMirror tree-aware check

Added D3 cross-CRDT verification note referencing shared evidence [`reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md`](../../peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md). Source-traced `loro-codemirror@0.3.3` (binds `LoroText` only, filters non-text diffs at `sync.ts:64`, emits `Delta<string>`) and `loro-prosemirror@0.4.3` (requires disjoint `LoroMap<{nodeName, attributes, children}>` shape at `lib.ts:19-37`). Verified SchoolAI/loro-extended (53⭐) has no CodeMirror adapter.

**Finding:** The D3 conclusion — "Single-YType dual-view binding is NOT achievable with stock `@y/*` today" — holds **symmetrically for Loro**. Both ecosystems have flat-string-gated CodeMirror bindings and disjoint ProseMirror container shapes. The dual-view binding gap is ecosystem-universal, not Yjs-specific. Choosing Loro over Yjs 14 does not unlock dual-view; it relocates the bridge to different primitives. The two-CRDT bridge architecture is the prevailing approach across both major CRDT ecosystems.

**Files touched:**
- `REPORT.md` D3 section — appended "Cross-CRDT verification (added 2026-04-16)" paragraph with source-trace citations
- `meta/_changelog.md` — new entry (this entry)

## 2026-04-16 — Initial report + audit pass

- 6 parallel Opus subagents source-traced Yjs 14 + @y/* ecosystem
- REPORT.md written; 7 rubric dimensions, library-by-library migration map, recommendations
- /audit pass run via nested Opus subagent — 14 findings (4 HIGH / 5 MEDIUM / 5 LOW)

### HIGH fixes applied post-audit

1. **Two evidence files relocated** — `y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md` and `open-knowledge-yjs-consumption-surface.md` were saved by subagents to the worktree's `reports/` path instead of the parent repo's. Moved to canonical location; cross-references now resolve.

2. **Material correction to @y/prosemirror claim** — REPORT originally claimed "`updateYFragment` is GONE" and "yUndo and yCursor plugins are not yet ported in @y/prosemirror@2.0.0-2." Audit refuted both: the published npm tarball's `src/y-prosemirror.js` (the actual `package.json#exports` entry) re-exports `ySyncPlugin`, `updateYFragment`, `yCursorPlugin`, `yUndoPlugin`, `prosemirrorJSONToYXmlFragment`, `yXmlFragmentToProsemirrorJSON`, `equalYTypePNode` — all preserved verbatim from v1.3.7 with ±17 LOC shift. The NEW delta-based `syncPlugin` + `YEditorView` at `src/index.js:70` exists but is NOT in the exports map. This changes the migration-cost estimate: TipTap y-tiptap fork revised from 1-2 months to 3-5 weeks (ports retain the legacy-API surface, not rewrites).

3. **Hocuspocus count reconciled** — REPORT's 1 PRESENT / 4 PARTIAL / 12 ABSENT corrected to 1 PRESENT / 3 PARTIAL / 13 ABSENT per the authoritative evidence file's own executive summary. Total 17 unchanged.

4. **Production survey cross-reference added** — "Zero of ~60 surveyed production users" claim now explicitly references `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-production-survey-full.md` rather than asserting standalone.

### MEDIUM + LOW findings

Deferred — documented in `meta/audit-findings.md` for future refresh passes. None block the report's headline conclusions.

### Subagent contradiction resolved

The y-prosemirror subagent correctly identified that public API is preserved verbatim in v2. The TipTap subagent incorrectly claimed yUndo/yCursor plugins were unported (based on reading the `upgrade-y` GitHub branch rather than the published npm tarball). Audit adjudicated; y-prosemirror subagent's finding is authoritative. REPORT corrected.

## 2026-04-16 — Path C: BlockNote Yjs 14 adoption tracker

Closed the "What's BlockNote's ship-date?" gap flagged as Limitations Open Question #1. Direct npm registry + GitHub API probes (2026-04-16):

**Finding:** BlockNote publicly committed to Yjs 14 integration via FOSDEM 2026 talk but has **zero public code progress** 2.5 months later. `@blocknote/core@0.48.1` published today still pins `yjs@^13.6.27` + `y-prosemirror@^1.3.7`; no `@y/*` packages in deps; no branches named yjs-14/v14/attribution/track-changes/versioning; no commits in the last 30 days mention Yjs 14. This is a strong negative signal for any production consumer depending on BlockNote's v14 work as a leading indicator.

**Sharpened framing in REPORT:** "lone publicly-committed design partner" → "lone publicly-announced design partner" — they are announced but have not committed code.

**Files touched:**
- `evidence/blocknote-yjs-14-adoption-tracker.md` — new evidence file (quick facts, commit activity, branch search, FOSDEM timeline, ship signals, implications, watch-list triggers, sources)
- `REPORT.md` Executive Summary item 11 — BlockNote adoption status inlined
- `REPORT.md` D7 section — BlockNote bullet sharpened with zero-public-code finding
- `REPORT.md` Watch-list signals — BlockNote-specific triggers added (monthly-check cadence)
- `REPORT.md` Limitations & Open Questions #1 — marked partially closed with current state + next-check cadence
- `meta/_changelog.md` — this entry
