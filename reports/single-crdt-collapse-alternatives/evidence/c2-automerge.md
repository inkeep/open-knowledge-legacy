# Evidence: Candidate 2 — Automerge 2.2+ Text (Peritext)

**Dimension:** Primary candidate
**Date:** 2026-04-16
**Sources:** `reports/automerge-prosemirror-migration-assessment/REPORT.md`, Automerge 3.0 blog, GitHub

---

## A. Production Readiness (2026-04-16)

- **Version:** Automerge 3.0 released (July 2025). `@automerge/prosemirror@0.2.0` — BETA. `@automerge/automerge-repo@2.5.3`.
- **Backwards compatibility:** File format identical to Automerge 2; API nearly backwards-compatible. Automerge 3 unifies around collaborative strings as default, eliminates legacy `Text` class, makes experimental `next` namespace standard.
- **Memory improvements:** 538x for large documents. Moby Dick drops from 700MB → 1.3MB. Document that failed after 17h now loads in 9s.
- **Production users:** Ink & Switch projects (Patchwork). Not as widespread as Yjs. `automerge-repo` adoption includes Trellis. Less common in production than Yjs.
- **Maintainer responsiveness:** Actively maintained by Ink & Switch team. `automerge-prosemirror` last commit Feb 2026 (recent).
- **Stability caveat:** Official docs state the ProseMirror plugin is "beta quality software, with the API probably changing a bit before a stable release and there are bugs."
- **Issue velocity:** Stable — Automerge 3.0 migration guide published; no churn-class issues.

**Confidence:** CONFIRMED.

---

## B. Migration Scope — Structural

**Architecture:** Single Automerge document with flat `A.Text` field. Rich text: inline marks + block markers (objects in sequence with `{ type, parents, attrs, isEmbed }`). Peritext boundary semantics built-in via `ExpandMark` (before/after/both/none).

**File-by-file 1P impact:**

Bridge code DELETED (same as Candidate 1):
- server-observers.ts, server-observer-extension.ts, observers.ts (660 lines), apply-by-prefix-suffix.ts, diff-lines-fast.ts, mergeThreeWay.

Client editor integration (TipTap):
- `@tiptap/y-tiptap` removed; `@tiptap/extension-collaboration` removed.
- `@automerge/prosemirror@0.2.0` provides `syncPlugin`, `SchemaAdapter`, `pmDocFromSpans`/`pmNodeToSpans`, but returns a raw ProseMirror plugin (not a TipTap extension).
- TipTap integration requires custom wrapper (~50-80 lines) — **but the bigger cost is that every TipTap extension used (heading, codeBlock, list, link, image, bold, italic, callout, jsxComponent, rawMdxFallback, etc.) needs an Automerge-annotated `NodeSpec` via the SchemaAdapter.** This is schema-side work proportional to extension count. Open Knowledge has ~20 extensions.
- **No cursor/presence plugin.** Custom implementation needed using `automerge-repo` Presence API + PM decorations (~1-2 weeks).
- **No undo/redo integration.** Automerge has `A.changeAt()` document-level undo, but no PM plugin. Custom implementation (~1-2 weeks).

Source-mode integration (CodeMirror):
- `automerge-codemirror@0.2.0` (242 lines, last commit July 2025) binds CM to plain text via `A.splice()`. Does NOT understand block markers. CM cannot display Automerge rich-text sequence as markdown.
- Same translation problem as Yjs: Automerge spans ↔ markdown. The flat-span model is STRUCTURALLY SIMPLER than Y.XmlFragment tree ↔ markdown, but it is STILL a translation problem.

Server persistence (Hocuspocus):
- REPLACED by `automerge-repo-sync-server` (minimal Express, `PORT`/`DATA_DIR` env vars) + custom orchestration.
- Hocuspocus hooks gone: `onStoreDocument`, `onLoadDocument`, `onAuthenticate`, `onLoadDocument`, extension system, rate limiting.
- Rewrite: `packages/server/src/agent-sessions.ts` (handle.change() replaces DirectConnection), `persistence.ts` (`handle.on('change', ...)` replaces onStoreDocument), `external-change.ts` (external disk → AM write path), `api-extension.ts` (HTTP layer reconstruction), `file-watcher.ts` integration with `handle.change()`, `shadow-repo.ts` (shadow attribution must stream AM changes not YDoc updates).
- **All ~10 server files need non-trivial rewrite.**

Fidelity invariants impact:
- I1-I4, NG5-NG10: depend on markdown pipeline — unchanged if pipeline sits between AM spans ↔ PM JSON ↔ markdown.
- I5 Layer A === Layer B: layer boundary collapses.
- I6, I7: simplified.

Data migration:
- Y.Doc → Automerge is all-or-nothing one-way. `encodeStateAsUpdate(ydoc)` can be consumed to extract content, but AM's change DAG cannot reconstruct Yjs history. Shadow repo's attribution journal becomes a discontinuity.

---

## C. Ecosystem Integration

**Hocuspocus:** INCOMPATIBLE (replaced by automerge-repo-sync-server).

**Markdown pipeline:** still operates at PM JSON level — unchanged downstream of the binding. Pipeline: `AM → A.spans() → pmDocFromSpans() → PM Node → mdManager.serialize() → markdown`.

**Source-mode:** `automerge-codemirror` exists but does not speak rich-text. Same translation problem as Candidate 1.

---

## D. Effort Estimate (engineer-weeks)

Per prior report (component-by-component):
- SchemaAdapter for all extensions: 2-3 wk
- TipTap wrapper: 1 wk
- Cursor/presence plugin: 1-2 wk
- Undo/redo: 1-2 wk
- Sync server (replace Hocuspocus): 1-2 wk
- Agent write path: 1 wk
- Markdown pipeline rewire: 1 wk
- Data migration: 1-2 wk
- Source toggle: 2-3 wk
- Testing + edge cases: 2 wk

| Scenario | Weeks |
|---|---|
| Optimistic | 10-12 |
| Realistic | 14-18 |
| Conservative | 18-24 |

Plus Open Knowledge-specific: shadow-repo.ts rewrite for change-based attribution (2-3 wk), MDX extension schema adapters (1-2 wk). Realistic → **16-22 weeks**.

---

## E. Risk Profile

- **Beta risk:** `@automerge/prosemirror@0.2.0` beta — API may change before 1.0.
- **Performance:** 1.7MB WASM bundle (vs 69KB Yjs), 4.5x larger update messages (121 vs 27 bytes/keystroke). Moby Dick memory: 1.3MB (improved from 700MB; still more than Yjs's 10MB claim is off — actually Yjs also around MB-scale — verify in-context but overall Automerge 3 CLOSED the gap).
- **Migration breakage:** ~40 bridge + observer tests DELETED. Hocuspocus-dependent tests (C1-C10, agent-sessions test, persistence test, api-extension test — 30+ files) need rewrite for automerge-repo.
- **Reverse migration cost:** VERY HIGH. No public production Yjs ↔ Automerge migration tooling. The change DAG is not exportable to Y.Doc updates.
- **TipTap ecosystem loss:** Bubble menu, slash command extension, image upload, link tooltip — all TipTap-built. All need re-integration.
- **Greenfield alignment:** Peritext boundary semantics correct by construction.

---

## F. Key Advantage

**Peritext semantics correct by construction.** ExpandMark (before/after/both/none) — bold expands at end, links don't. Solves the Yjs boundary anomaly. **Eliminates the bridge, eliminates the Khanna-Kunal-Pierce counter-example class, eliminates the boundary anomaly.**

Single CRDT for the document — built-in version history (full change DAG), structural time travel, built-in branching via forkable changes.

---

## G. Key Disadvantage

**Full stack rewrite.** TipTap ecosystem gone (cursor, undo, ~20 extensions need SchemaAdapter rework). Hocuspocus gone (custom sync server, custom lifecycle, custom auth). 1.7MB WASM bundle. 4.5x keystroke size. All-or-nothing migration with no incremental path. Data migration is one-way door.

---

## Gaps / follow-ups

- Does automerge-prosemirror@0.2.0 support atom nodes / embed equivalents to our jsxComponent? Documented pattern exists via `isEmbed: true`, but untested for our custom extensions.
- Table support: ABSENT from basic schema, requires custom SchemaAdapter extension.
- Performance profile under 100-client load with MDX documents: unmeasured.
