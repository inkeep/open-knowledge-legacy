# Changelog — peritext-on-yjs-feasibility

## 2026-04-16 — Cross-report Loro CodeMirror tree-aware check

Added shared evidence file [`evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md`](../evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md) (shared home with `reports/yjs-14-ecosystem-adoption`). Source-traced `loro-codemirror@0.3.3`, `loro-prosemirror@0.4.3`, `loro-crdt@1.11.0` tarballs + verified SchoolAI/loro-extended has no CM binding + verified `loro-prosemirror` issue #77 failure shape.

**Finding:** Loro has the structurally identical flat-string-only CodeMirror binding as Yjs's `@y/codemirror`. `LoroSyncPluginValue` binds `LoroText` only (`sync.ts:15-19`), filters non-text diffs (`sync.ts:64`), emits `Delta<string>` to CM. `loro-prosemirror` requires disjoint `LoroMap<{nodeName, attributes, children}>` shape (`lib.ts:19-37`). A single Loro container cannot drive both bindings.

**Implication:** The dual-view binding gap is ecosystem-universal as of 2026-04-16, not Yjs-specific. The NEW dimension "Loro now concretely competitive" (REPORT.md:284-294) was strengthened with the source-trace evidence. Loro's advantage is Peritext mark semantics, not dual-view binding. Issue #77 failure shape is an `init()`-race lifecycle bug, not dual-view related.

**Files touched:**
- `REPORT.md` — expanded "NEW dimension — Loro now concretely competitive" bullets with source-trace citations + clarified issue #77 failure shape
- `REPORT.md` — appended evidence cross-reference to "Key evidence files" section
- `meta/_changelog.md` — created (this file)
- `evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md` — new shared evidence file
