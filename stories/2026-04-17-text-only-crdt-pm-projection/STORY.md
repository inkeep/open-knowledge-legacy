# Text-only CRDT with ProseMirror projection

**Status:** Story seed (pre-spec; captured for graduation when prerequisites land)
**Created:** 2026-04-17
**Last verified:** 2026-04-17
**Owner(s):** Nick Gomez (architecture), engineering
**Type:** Architectural direction — not a commitment, not a roadmap item yet
**Graduation prerequisite:** Rust markdown engine shipped + bridge-correctness spec landed
**Projected graduation window:** Q3 2026 (after Rust engine in production, after Bucket A telemetry accumulates)
**Baseline commit:** 432a834b (main), exploration conducted on worktree `bridge-correctness` at `spec/bridge-correctness`
**Novelty note:** No production precedent found for this pattern (dual-view PM+CM editor on a single `Y.Text` CRDT). Ecosystem default is tree-canonical Y.XmlFragment + y-prosemirror (Milkdown, TipTap, et al.) which solves a DIFFERENT problem (single-editor WYSIWYG-over-markdown). The text-only + PM-projection pattern is pioneer work — see §12 Risks and §9 A1 for verification plan.

---

## 0) Executive summary

Open Knowledge runs a dual-CRDT architecture today — `Y.XmlFragment` for WYSIWYG (TipTap/ProseMirror) and `Y.Text` for source mode (CodeMirror), bridged by a server-authoritative observer pair. The bridge is a perpetual source of correctness work: three prior specs this year (`2026-04-14-bridge-convergence-under-concurrent-writes`, `2026-04-15-server-authoritative-observer-bridge`, `2026-04-15-lossless-bridge-merge`), plus the active `2026-04-16-bridge-correctness` spec, are iterations against the same underlying issue.

**The underlying issue is ontological, not implementational.** The bridge exists because y-prosemirror's tree-native orientation — a reasonable choice when we adopted it — produces a dual-representation CRDT protocol (tree shape + flat shape), and the product has since evolved toward markdown-canonical semantics where the tree is a projection, not the source of truth. Every feature we add (agent writes through markdown, file-watcher on markdown, MDX with its γ dirty-tracking pattern per Component Blocks v2, attribution via source-slice fidelity) is acknowledging markdown source as canonical while still running on a tree-canonical CRDT.

**The architectural resolution is one CRDT (Y.Text) with the WYSIWYG editor as a client-local projection via a custom PM↔Y.Text binding.** No production precedent for this specific pattern exists — ecosystem default is Y.XmlFragment tree-canonical (Milkdown, TipTap) which solves single-editor WYSIWYG-over-markdown, not our dual-view requirement. The architecture is pioneer work; its value is:

- Eliminates the server-side observer bridge entirely (~1,856 LOC + 7,500 test LOC deleted)
- Keeps the full TipTap ecosystem intact (tables, drag-handles, lists, slash menus, all 100+ extensions)
- Preserves the Component Blocks v2 architecture ~95% unchanged (`sourceDirty` lifecycle shortens; everything else survives)
- Stays on Yjs 13 indefinitely — no Yjs 14 migration, no Loro migration, no Hocuspocus fork
- Relocates the translation work from a distributed-concurrency problem (two CRDTs, many writers, Khanna-Kunal-Pierce impossibility territory) to a client-local single-writer translation (one editor, one translator per transaction, trivially correct CRDT composition underneath)

The prerequisite is a fast parse/serialize engine. The Rust engine (per `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md`) is enabling technology, not optional: typing latency in the custom binding requires ~5-10ms parse + serialize per transaction, which the Rust engine delivers and TS does not.

This story captures the insight while it's fresh, with the evidence trail for a future /spec to synthesize.

---

## 1) Problem statement (SCR)

### Situation

The current CRDT architecture uses two Yjs types per document:
- `Y.XmlFragment('default')` — TipTap/ProseMirror binds via `y-prosemirror` (vendored as `@tiptap/y-tiptap@3.0.3`)
- `Y.Text('source')` — CodeMirror 6 binds via `y-codemirror.next@0.3.5`

A server-side observer bridge in `packages/server/src/server-observers.ts` (401 LOC) synchronizes them: Observer A (XmlFragment → Y.Text) and Observer B (Y.Text → XmlFragment), both gated by `OBSERVER_SYNC_ORIGIN`, both debounced at 50ms, both maintaining per-document baselines (`lastSyncedXmlMd`). Client-side `observers.ts` (444 LOC) maintains corresponding baseline tracking.

Precedents in CLAUDE.md codify the bridge architecture:
- #11 (minimize CRDT mutation in sync bridges)
- #12 (XmlFragment-authoritative; Y.Text mirrors)
- #13 (bridge invariants auto-enforced; implicit time-coupling is a test smell; CRDT races tested by message ordering; example-based coverage is a floor)
- #14 (cross-CRDT sync is single-writer, server-side)

### Complication

The bridge is the perpetual source of a specific class of correctness problem. Three prior specs ship incremental fixes:
- **#141 (2026-04-14):** Bridge convergence under concurrent writes — discovered Bug-A (server-side rebuild-from-Y.Text anti-pattern), Bug-B (observer A baseline absorption), Bug-C/D.
- **#152 (2026-04-15):** Server-authoritative observer bridge — server owns all cross-CRDT writes; client write paths deleted.
- **#161 (2026-04-15):** Lossless bridge merge — DMP `patch_apply` (2-3% silent drops) replaced with hybrid diff3+DMP `mergeThreeWay`.
- **#172 (2026-04-16):** Current bridge-correctness spec — fuzz flake at seed `1776386718697` traced to Observer B lacking `isPairedWriteOrigin` short-circuit; Bucket 0 (paired-write symmetry), A (post-condition + telemetry), B (settlement-based propagation), C (characterize residuals).

And per `reports/three-way-merge-content-preservation/REPORT.md`, the Khanna-Kunal-Pierce 2007 result formally proves that no purely-state-based three-way merge preserves content under arbitrary interleavings. The bridge-correctness spec's Bucket A accepts this and installs a loudness mechanism. Each iteration tightens the bridge; none dissolves it.

Meanwhile the product has moved markdown-canonical in every direction:
- MCP agent write tools operate on markdown strings
- File-watcher reconciliation at disk operates on markdown
- Component Blocks v2's γ pattern declares `sourceRaw` authoritative for pristine nodes
- Attribution/fidelity reasoning (I1-I11, I12-I17) measures faithfulness of markdown round-trip
- Save-version, git integration, shadow repo — all operate on markdown bytes

The bridge pattern is upstream of every decision these features made. Component Blocks v2's `sourceDirty` attribute, Observer B's early-exit checks, `equalYTypePNode` deep-equals, bridgeId via PluginState — these are all mitigations that exist because the bridge exists. Replace the bridge with single-writer projection and most of the mitigation vanishes.

### Resolution

Migrate to a text-only CRDT architecture: one `Y.Text` holding canonical markdown source; ProseMirror/TipTap becomes a projection via a custom `PM↔Y.Text` binding. The same CodeMirror 6 source editor binds Y.Text directly via y-codemirror.next (unchanged from today's source-mode side).

The "bridge" moves from a distributed server-side multi-writer concern to a client-local single-writer translation — architecturally a different problem class, not merely a relocated one.

**The architectural argument stands on its own — not on prior art.** No production reference was found for this specific pattern (verified 2026-04-17 via source-read of Milkdown's collab plugin — uses `XmlFragment` + `ySyncPlugin`, tree-canonical — and web search for dual-view PM+CM single-CRDT markdown editors — no hits). The ecosystem default is y-prosemirror's tree-canonical pattern. Our dual-view requirement (WYSIWYG + source-mode editor with interactive MDX components) is itself uncommon, so prior art scarcity reflects scarcity of the problem, not rejection of the solution. Prototype validation is a hard gate before committing — see §9 Assumption A1.

**Why this is the unique-intersection answer:**
- Not Yjs 14 (ecosystem not migrating; dual-view binding gap persists)
- Not Loro (pre-1.0; dual-view binding has the same flat-string limit; WASM violates our size gates)
- Not CM-only WYSIWYG (≈2× LOC of this path; loses TipTap ecosystem; Obsidian-Live-Preview-class UX)
- Not stay-on-current-dual-CRDT (every new feature accumulates against the bridge)

Only text-only CRDT with PM-projection captures all four dimensions (architectural correctness + ecosystem alignment + product UX preservation + feature velocity) simultaneously. See §7 Rejected alternatives.

---

## 2) Multi-dimensional value + intersection reasoning

### Value dimensions

**D1 — Architectural correctness.** Dual-CRDT bridge's theoretical limit is Khanna-Kunal-Pierce; state-based three-way merge cannot universally preserve content. Text-only CRDT doesn't do state-based merge — Yjs RGA at the character level is op-based, provably convergent. The correctness bound shifts from "worst-case state merge" to "trivially correct CRDT composition."

**D2 — Ecosystem alignment.** Zero upstream migration pressure. Stays on `yjs@^13.6.30` / `@hocuspocus/server@^4` / `@tiptap/core@^3` / y-codemirror.next. No Yjs 14 peer-dep forks, no Hocuspocus rewrite, no Loro migration, no Yjs 14 ecosystem-readiness gamble. See `reports/yjs-14-ecosystem-adoption/REPORT.md` for the upstream survey (0 of ~60 production users on v14; maintainer flags v14 as "broken alpha"; TipTap + Hocuspocus both shipped fresh on v13 within the 8 days before research).

**D3 — Product UX preservation.** PM remains the WYSIWYG editor. Notion-class interactive components (MDX NodeViews, PropPanel, SideMenu, drag-handle, slash menu, compound Tabs/Accordion) all survive. No UX regression. No convergence on Obsidian Live Preview.

**D4 — Feature velocity.** New features (comments on paragraphs, track-changes UI, inline AI suggestions, interactive Kanban blocks, collaborative annotation) map cleanly to PM NodeViews — which are the RIGHT abstraction for "thing with identity that renders UI." CM decorations are the wrong abstraction for those features. Text-only + PM preserves the velocity axis.

**D5 — Agent-write simplicity.** `applyAgentMarkdownWrite` reduces from its current XmlFragment-authoritative 40+ LOC orchestration to a single `applyFastDiff(yText, currentText, newText)` call. MCP tools become trivial text ops. File-watcher reconciliation simplifies to text-level `applyFastDiff` on disk change. `external-change.ts`, `agent-sessions.ts`, `persistence.ts` collectively lose ~300 LOC net.

**D6 — Test surface reduction.** ~7,500 LOC of bridge-coupled tests (`bridge-matrix`, `c1-c10` series, `bridge-convergence.fuzz`, `server-authoritative-stress`, `observers.test`, `server-observers.test`) become obsolete. Replaced with ~2,000 LOC of binding-correctness tests + existing fidelity suite (I1-I17) unchanged. Net ~5,500 LOC test-code deletion.

**D7 — Disk-boundary alignment.** Markdown on disk is source-of-truth; git tracks markdown; agents speak markdown via MCP; file-watcher sees markdown diffs; reconciliation uses `mergeThreeWay` (diff3+DMP) on markdown lines; API reads (`/api/document`, MCP `read_document`) return markdown strings; Fumadocs preview reads markdown from disk. In Y.Text-canonical, the CRDT shape *matches* the disk shape — every disk-boundary operation collapses to `yText.insert`/`yText.toString`/`applyFastDiff` (3-10 LOC each). In Y.XmlFragment-canonical (Milkdown-style), every disk-boundary operation pays a serialize-or-parse tax AND reconciliation requires either tree-level three-way merge (unsolved ecosystem-wide pending verification — see A11) or serialize-merge-parse degeneration (which is Y.Text-canonical for reconciliation, under another name). **This dimension is INDEPENDENT of D3 (source-mode CM) — even if source-mode were dropped entirely, Y.Text-canonical would still win on ~6 disk-boundary flows (initial load, persistence, API reads, frontmatter, conflict markers, branch-switch reconciliation).** See §11b Flow matrix for the full enumeration.

### Intersection reasoning

Each alternative captures a proper subset:

| Alternative | D1 | D2 | D3 | D4 | D5 | D6 | D7 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Text-only CRDT + PM projection** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Yjs 14 migration | partial | ✗ | ✓ | ✓ | partial | ✗ | partial |
| Loro migration | ✓ | ✗ | ✓ | partial | partial | ✗ | partial |
| Milkdown-style Y.XmlFragment single-CRDT (§7.5) | ✓ | ✓ | ✗ | ✓ | partial | ✓ | ✗ |
| CM-only WYSIWYG | ✓ | ✓ | ✗ | ✗ | ✓ | partial | ✓ |
| Stay dual-CRDT | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | partial |

Only text-only + PM-projection fills the intersection. This is the load-bearing architectural claim — the value isn't additive (any single-dimension win would be worth considering), it's intersectional (we need all seven, and no other path provides all seven). The closest alternative is Milkdown-style Y.XmlFragment-canonical single-CRDT, which matches on 5 of 7 (architectural correctness, ecosystem alignment, feature velocity, test reduction) but fails on D3 (source-mode CM becomes derived/read-only or reintroduces dual-CRDT) AND D7 (disk-boundary misalignment forces serialize/parse at every boundary). Detailed rejection rationale in §7.

---

## 3) Target architecture

### Architecture diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT                                        │
│                                                                                 │
│  ┌─────────────────────────────────┐      ┌──────────────────────────────────┐ │
│  │  ProseMirror / TipTap           │      │  CodeMirror 6                    │ │
│  │  (WYSIWYG projection)           │      │  (Source view — canonical shape) │ │
│  │                                 │      │                                  │ │
│  │   • schema, extensions          │      │   • markdown lang + Lezer        │ │
│  │   • NodeViews for MDX blocks    │      │   • source-polish decorations    │ │
│  │   • PropPanel, SideMenu,        │      │   • wiki-link syntax highlight   │ │
│  │     drag-handle, slash menu     │      │   • broken-link squiggly         │ │
│  │   • Component Blocks v2         │      │                                  │ │
│  │     γ dirty-tracking            │      │                                  │ │
│  │   • PM history DISABLED         │      │                                  │ │
│  │     (UndoManager authoritative) │      │                                  │ │
│  └──────────────┬──────────────────┘      └────────────────┬─────────────────┘ │
│                 │                                           │                    │
│                 ▼                                           ▼                    │
│  ┌──────────────────────────────────┐      ┌──────────────────────────────────┐│
│  │  ★ CUSTOM (NEW):                 │      │  y-codemirror.next               ││
│  │  PM ↔ Y.Text binding             │      │  (off-the-shelf, UNCHANGED)      ││
│  │                                  │      │                                  ││
│  │   • Y.Text → PM: parse →         │      │   • observes Y.Text              ││
│  │     mdast → PM JSON →            │      │   • applies ChangeSpec to CM6    ││
│  │     reconciled PM tx             │      │   • CM6 tx → Y.Text              ││
│  │     (diffPMDocs algorithm)       │      │   • awareness (text offset)      ││
│  │   • PM → Y.Text: serialize →     │      │                                  ││
│  │     diff against baseline →      │      └──────────────┬───────────────────┘│
│  │     emit Y.Text ops              │                     │                    │
│  │   • IME composition deferral    │                     │                    │
│  │   • Origin guard (skip self)    │                     │                    │
│  │   • UndoManager integration     │                     │                    │
│  │   • Chunked large-paste batch   │                     │                    │
│  │   • Optional post-condition     │                     │                    │
│  │     (content-preservation)      │                     │                    │
│  └──────────────┬───────────────────┘                    │                    │
│                 │                                         │                    │
│                 │    ┌──────────────────────────────┐   │                    │
│                 │    │  ★ CUSTOM (NEW):             │   │                    │
│                 │    │  Cursor/selection translator │   │                    │
│                 ◀────┤                              │───▶│                    │
│                      │  pm_pos ↔ text_offset        │                        │
│                      │  (cross-view awareness)      │                        │
│                      └──────────────────────────────┘                        │
│                 │                                         │                    │
│                 └────────────────┬────────────────────────┘                    │
│                                  │                                              │
│                                  ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │                      Y.Doc (local replica)                                │ │
│  │                                                                           │ │
│  │    Y.Text('content')   ← THE canonical content CRDT                       │ │
│  │    Y.Map('metadata')   ← frontmatter cache (optional; unchanged)          │ │
│  │    Y.Map('activity')   ← agent flash attribution (unchanged)              │ │
│  │    Y.Awareness         ← cursors + view-mode per user                     │ │
│  │    Y.UndoManager       ← tracks Y.Text ops by origin                      │ │
│  └──────────────────────────────────────┬───────────────────────────────────┘ │
│                                         │                                      │
└─────────────────────────────────────────┼──────────────────────────────────────┘
                                          │  WebSocket (y-protocols sync + awareness)
                                          │
┌─────────────────────────────────────────┼──────────────────────────────────────┐
│                                 SERVER  ▼                                        │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │                    Hocuspocus Y.Doc (authoritative replica)               │ │
│  │                    (same shape as client; Y.XmlFragment GONE)             │ │
│  └──┬──────────┬─────────────────┬──────────────────────┬───────────────────┘ │
│     │          │                 │                      │                       │
│     ▼          ▼                 ▼                      ▼                       │
│  ┌──────┐  ┌───────────┐  ┌──────────────┐  ┌──────────────────┐             │
│  │ Per- │  │ Agent     │  │ File-watcher │  │ CC1 Broadcaster  │             │
│  │ sist │  │ writer    │  │ bridge       │  │ (__system__ doc, │             │
│  │ ence │  │           │  │              │  │  unchanged)      │             │
│  │(text)│  │ applyFast │  │ applyFast    │  │                  │             │
│  │      │  │ Diff      │  │ Diff from    │  │                  │             │
│  │      │  │           │  │ disk change  │  │                  │             │
│  └──┬───┘  └─────┬─────┘  └──────┬───────┘  └─────────┬────────┘             │
│     │            │                │                    │                       │
│     ▼            │                ▼                    ▼                       │
│  ┌──────┐        │         ┌──────────┐         (stateless msg                 │
│  │ Disk │◀───────┴─────────│ MCP HTTP │         for derived-view               │
│  │ .md  │                  │ /api     │         invalidation)                  │
│  │ files│                  │endpoints │                                        │
│  └──┬───┘                  └────┬─────┘                                        │
│     ▲                           ▲                                              │
│     │                           │                                              │
│  (Server observers              (agents, CLI tools, MCP clients)               │
│   GONE: setupServerObservers,                                                  │
│   server-observer-extension,                                                   │
│   observers.ts, all bridge/*)                                                  │
└─────┼───────────────────────────┼──────────────────────────────────────────────┘
      │                           │
      │ external editors          │
      │ (git, chokidar)           │
      ▼                           ▼
```

### Layer-by-layer enumeration

**Storage / disk.** Unchanged. Markdown files, git repo, shadow git repo, chokidar/parcel-watcher.

**CRDT layer.** Yjs 13 unchanged. One `Y.Text('content')` replaces the current `Y.XmlFragment('default')` + `Y.Text('source')` pair. `Y.Map('metadata')`, `Y.Map('activity')`, `Y.Awareness`, `Y.UndoManager` unchanged. No migration to Yjs 14 or `@y/*` scope.

**Server.** Hocuspocus stays. Simplifies dramatically:
- `persistence.ts` (530→~150 LOC) — debounced Y.Text → disk write; write-tracker unchanged
- `agent-sessions.ts` (270→~50 LOC) — `applyAgentMarkdownWrite` becomes trivial
- `external-change.ts` (95→~30 LOC) — disk change → `applyFastDiff` into Y.Text
- `cc1-broadcast.ts` unchanged
- `shadow-repo.ts`, `reconciliation.ts`, `head-watcher.ts` unchanged
- **Deleted:** `server-observers.ts` (401 LOC), `server-observer-extension.ts` (117 LOC)

**Client editor bindings.**
- y-codemirror.next unchanged (source view)
- ★ **Custom PM↔Y.Text binding** (~1,800 LOC) replaces y-prosemirror (2,200 LOC) + @tiptap/y-tiptap vendored fork (2,250 LOC) + client `observers.ts` (444 LOC)

**Editor frameworks.** ProseMirror, TipTap core, all TipTap extensions (tables, collaboration-cursor replacement, drag-handle, suggestion, input-rules) unchanged. CodeMirror 6 + `@codemirror/lang-markdown` + Lezer unchanged.

**Markdown pipeline.** Unchanged in shape. MarkdownEngine (parse/serialize/R23 guard/position-slice/MDX handlers) stays as-is. The Rust engine replaces the TS engine on the hot path per `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md`.

**MDX handling (Component Blocks v2).** ~95% unchanged. See §11 Interplay.

**Tests.** Delete ~7,500 LOC of bridge-coupled tests. Add ~2,000 LOC of binding-correctness tests. Fidelity invariants (I1-I17) unchanged.

### Custom pieces — what we would build

Each with LOC estimate and "what it entails" scope.

**★ Custom #1: PM ↔ Y.Text binding** (~1,800 LOC, the heart of the work)
- Remote-update path: `Y.Text.observe` → parse via MarkdownEngine → mdast → PM JSON → reconcile with current PM state → dispatch minimal PM transaction preserving cursor/selection/IME composition
- Local-transaction path: intercept PM transaction → serialize PM state → compute diff vs `lastSyncedText` → emit Y.Text ops (origin guarded to skip self-observation)
- `diffPMDocs(oldDoc, newDoc)` algorithm producing minimal PM Steps (this is the tricky part — y-prosemirror's `updateYFragment` is the reference; ~500-700 LOC of that algorithm applied in reverse direction)
- IME / composition deferral (defer remote updates during active composition)
- UndoManager integration (disable PM history; route undo through Y.UndoManager by origin)
- Chunked large-paste handling (preserve existing `chunkedYTextInsert` pattern)
- Origin registry (simpler — only `agent-write`, `file-watcher`, `rollback` origins externally, plus binding-self origin)

**★ Custom #2: Cursor / selection translator** (~300 LOC)
- `pmPosToTextOffset(pmState, pmPos): number` — walk PM doc, compute serialized markdown length up to pmPos
- `textOffsetToPmPos(pmState, offset): number` — inverse direction via incremental walk
- Awareness state shape: canonical form is text offset + `Y.RelativePosition`; view-mode ('pm' | 'cm'); translate on render per view

**★ Custom #3: Agent writer** (~50 LOC, simplification)
- `applyAgentMarkdownWrite(doc, content, position, origin)` becomes `applyFastDiff(yText, currentText, composedText)` with `AGENT_WRITE_ORIGIN`. No XmlFragment path, no updateYFragment mirror step.

**★ Custom #4: File-watcher bridge** (~30 LOC, simplification)
- `applyExternalChange`: `applyFastDiff(yText, currentYTextValue, newFileContents)` with `FILE_WATCHER_ORIGIN`. Same shape as agent writer.

**★ Custom #5: Y.Text → disk persistence** (~150 LOC, simplification)
- `onLoadDocument`: read file → `yText.insert(0, fileContents)`
- `onStoreDocument`: debounce; read `yText.toString()` → atomic-rename write
- Write-tracker unchanged
- No baseline tracking; no XmlFragment serialization

**★ Custom #6: Mode toggle + view preservation** (~200 LOC)
- Renders either PM or CM; preserves cursor via translator (#2); preserves scroll position

**★ Custom #7: MDX NodeView lifecycle** (minimal delta — ~100 LOC change from today)
- NodeViews for `<Callout>`, `<JsxComponent>`, `<JsxInline>`, `<RawMdxFallback>` preserved
- `sourceDirty` lifecycle shortens (per-tx ephemeral or short-lived vs long-persisted attr)
- Context Bridge Registry bridgeId keyed by PM node identity (preserved via diffPMDocs reconciliation) instead of Y.XmlElement identity
- Nested CM for rawMdxFallback uses direct PM dispatch per precedent #22 (unchanged; rationale strengthens — single-writer invariant preserved)

**★ Custom #8: Binding post-condition (optional)** (~100 LOC)
- Content-preservation assertion inside the binding's serialize path
- Mirrors bridge-correctness Bucket A's post-condition, applied at client binding level
- On violation: log structured event, optionally rollback the PM transaction

**★ Custom #9: Test harness** (~2,000 LOC new; ~7,500 LOC deleted)
- Binding correctness unit tests: per PM operation class (bold/italic, heading conversion, list nest/exit, table ops, MDX edit, paste, drop) verify Y.Text ops emitted correctly
- Concurrent-edit stress: two-client harness on single Y.Text (much simpler than current dual-CRDT fuzz)
- Fidelity invariants (I1-I17) unchanged
- Deleted: `bridge-matrix.test.ts`, `c1-c10-*.test.ts`, `bridge-convergence.fuzz.test.ts`, `server-authoritative-stress.test.ts`, `observers.test.ts`, `server-observers.test.ts`

### What gets deleted

| Package | LOC | Reason |
|---|---:|---|
| `packages/server/src/server-observers.ts` | 401 | No cross-CRDT bridge |
| `packages/server/src/server-observer-extension.ts` | 117 | No extension to wire |
| `packages/app/src/editor/observers.ts` | 444 | No client baseline tracking |
| `packages/core/src/bridge/merge-three-way.ts` | 109 | No mergeThreeWay needed |
| `packages/core/src/bridge/diff-lines.ts` | 55 | Was bridge utility |
| `packages/core/src/bridge/normalize.ts` | 28 | Was bridge utility |
| `packages/core/src/bridge/scheduler.ts` | 41 | No debounce in bridge |
| `packages/core/src/bridge/apply-diff.ts` (simplified) | keep `applyFastDiff` as 30 LOC utility | Rest of file simplifies |
| `patches/y-prosemirror@1.3.7.patch` | (safety net) | y-prosemirror replaced by custom binding |
| y-prosemirror (dep) | 2,200 | Replaced |
| @tiptap/y-tiptap (dep, vendored fork) | 2,250 | Replaced |
| @tiptap/extension-collaboration (dep) | — | Tied to y-prosemirror |
| @tiptap/extension-collaboration-cursor (dep) | — | Uses yCursorPlugin |
| `node-diff3` (dep) | — | Bridge merge gone |
| Bridge tests | 7,500 | Architecture gone |

**Net production-code delta:** −~1,856 LOC (deletions) + ~2,430 LOC (new custom pieces) = **+574 LOC net**, with a qualitatively simpler architecture. **Net test-code delta:** −~5,500 LOC.

### What stays unchanged

| Component | Why |
|---|---|
| Yjs 13 core (Y.Doc, Y.Text, Y.Map, UndoManager) | No version migration needed |
| Hocuspocus server + provider | No replacement needed; single-CRDT unaffected |
| y-codemirror.next | Already binds Y.Text directly |
| ProseMirror + TipTap core | Framework unchanged |
| All TipTap extensions (tables, suggestion, drag-handle, input-rules, etc.) | Preserved |
| CodeMirror 6 + markdown-lang + Lezer | Preserved |
| unified/remark markdown pipeline | Pipeline unchanged; Rust engine replaces TS on hot path |
| @handlewithcare/remark-prosemirror (patched) | mdast↔PM handlers unchanged |
| Component Blocks v2 architecture | γ pattern, descriptor dispatch, rawMdxFallback, Context Bridge — all preserved (see §11) |
| R23 PUA sentinel guard | Parse-side unchanged |
| Fidelity invariants I1-I17 | Unchanged |
| CC1 broadcaster | Orthogonal |
| Shadow repo + git integration | Orthogonal |
| MCP HTTP surface | Payload shapes unchanged |
| File-watcher disk side | Unchanged |

---

## 4) Non-goals (temporally tagged)

### [NOT UNTIL Rust] Typing-latency-dependent work

The custom PM↔Y.Text binding round-trips every PM transaction through parse + serialize. At current TS speeds (~98ms at 1K blocks, ~1,233ms at 10K blocks per `specs/2026-04-16-bridge-correctness/evidence/perf-baseline-measured.md`), this is unusable. At Rust speeds (~5ms parse + ~2ms serialize per the Rust engine spec's targets), it's imperceptible. The Rust engine is a hard prerequisite, not optional.

### [NOT UNTIL Bucket A telemetry] Commitment to priority

Bucket A's content-preservation post-condition + elevated fuzz sampling measures how frequently the current bridge actually loses content in practice. If the rate is low (e.g., <0.01% of Path B firings), the current bridge is acceptable indefinitely and the urgency for text-only drops. If high, urgency rises. The telemetry signal calibrates whether this migration is worth its effort.

### [NOT UNLESS concurrent-prop-edit pain proves real] Semantic mark-aware text emitter

Under text-only, two users editing the SAME prop concurrently resolve at character level (Y.Text RGA). Non-overlapping prop edits compose correctly. Overlapping same-prop edits may produce text the author didn't intend (e.g., `<Callout type="wan rning">`). Mitigation exists — a "semantic text emitter" that emits whole-prop-value replacements as atomic Y.Text transactions — but adds binding complexity. Only build if concurrent-prop editing pain is real in production.

### [NEVER] CM-only WYSIWYG

Rejected. See §7.3. Trades TipTap ecosystem + Notion-class UX for Obsidian-Live-Preview-class UX, at ~2x LOC. Our product's evolution toward MDX-first interactive components demands PM's tree ontology.

### [NEVER] Abandon ProseMirror for the WYSIWYG view

Follows from the CM-only rejection. PM's tree ontology is the right abstraction for interactive MDX components. The whole Component Blocks v2 architecture (NodeView + descriptor dispatch + PropPanel + compound components) is specifically tree-native.

### [NEVER] Re-introduce dual-CRDT on the wire

Once the migration ships, adding back a second CRDT (even for performance or feature reasons) would reintroduce bridge correctness problems. The text-only contract is the architectural floor.

### [NOT UNLESS Yjs 13 reaches EOL before text-only ships OR spike reveals a blocker solvable only by v14/Loro] Migrate to Yjs 14 / Loro concurrent with text-only migration

Rejected concurrently. See §7.1 and §7.2. Text-only migration is independent of CRDT library choice; staying on Yjs 13 is deliberate to keep scope contained. Specific revisit triggers: (a) `yjs@^13.6.x` is marked deprecated in upstream `SECURITY.md` before this story's graduation, OR (b) the spike validates that `diffPMDocs` requires a YType primitive that exists only in v14. Absent either trigger, the Yjs 14 question is permanently independent — and made LESS urgent by this migration since the ontology-unification motivation dissolves (we only have one CRDT type).

### [NEVER under text-only architecture] Server-side observers migration

`specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md` mentions "move Observer A/B from client to server" as a future workstream. That workstream presumes dual-CRDT continues. Under text-only there are NO observers — the entire workstream becomes moot. Tag is NEVER (not NOT NOW) because the target architecture removes the subject of the question, not the timing of it.

---

## 4b) Constraints

Constraints bound the solution space that a future /spec can explore. Grouped by kind:

### Dependency constraints (hard prerequisites)

- **C1. Rust markdown engine in production.** Binding round-trips parse+serialize per PM transaction; TS engine's 98ms–1233ms p50 range is architecturally incompatible. See `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md` G1 target (~5ms parse at 10K).
- **C2. Yjs 13 line remains maintained** through the graduation window (see A9). If `yjs@^13.6.x` is deprecated upstream before this story graduates, the Yjs-14 "NOT UNLESS" trigger fires and the migration question expands.
- **C3. TipTap 3.x / ProseMirror ecosystem stays the WYSIWYG framework.** The entire value proposition D3 (product UX preservation) depends on TipTap's ~100+ extensions surviving unchanged. A strategic decision to move off TipTap invalidates this story's approach (though the text-only CRDT insight would still apply under any PM-based WYSIWYG).
- **C4. Component Blocks v2 γ pattern survives.** `sourceRaw` authoritative + descriptor dispatch + Context Bridge Registry is load-bearing for MDX interactive components. Any architectural decision that replaces γ invalidates §11.3's 95%-carry-over claim.

### Appetite / scope constraints

- **C5. One-time architectural cutover, not phased coexistence.** Single-CRDT and dual-CRDT cannot coexist on the wire without reintroducing bridge-correctness concerns (see §4 NEVER: re-introduce dual-CRDT). Rollout can be feature-flagged per-environment, but the CRDT shape on a given document is single-mode.
- **C6. 8-10 weeks focused engineering** for the cutover phase (post-spike). If capacity for a continuous block of this size isn't available at graduation time, the story stays ungraduated — partial migration with a live bridge is worse than no migration.
- **C7. No new upstream fork obligations.** Rejected alternatives (Yjs 14, Loro, Hocuspocus rewrite) would incur long-lived fork maintenance. Text-only stays on stable upstream, no forks.

### Sequencing constraints

- **C8. Bridge-correctness spec ships first.** Bucket A's telemetry is the calibration signal for this story's urgency (see §8). Text-only without that signal risks over-investment if content-loss rate is already tolerable.
- **C9. Component Blocks v2 post-#165 follow-up ships before cutover.** I13-I17 + PF01-PF02 tests establish the baseline that text-only must match. Cutting over onto a partially-tested baseline dilutes which regressions come from which change.
- **C10. Prototype spike validates A1 before /spec graduation.** `diffPMDocs` tractability on MDX+CB-v2 workload is not a solution-space exploration — it's a gate on whether this story is even coherent.

### Non-constraints (explicit)

- **Not constrained by Yjs 14 readiness.** The architecture is independent of Yjs major version. If v14 ships and stabilizes, this story doesn't care.
- **Not constrained by Loro readiness.** Same — the architecture doesn't depend on CRDT library choice beyond "has Y.Text-equivalent text primitive with op-based RGA."
- **Not constrained by Peritext availability.** Under text-only, marks are source-chars. Peritext boundary semantics are moot (see §7.2).

---

## 5) Falsifiable invariants

1. **Single-writer-per-tx.** For every Y.Text transaction, exactly one writer (the binding, or agent-write, or file-watcher, or rollback). Verifiable: grep for all `Y.Text` mutations in codebase; fail CI if a write exists outside the origin registry.

2. **Typing latency ≤16ms p99** on 10K-block docs (hard gate). Measured via a test harness that drives N keystrokes through PM and measures per-transaction latency including binding round-trip. Requires Rust engine.

3. **Fidelity invariants I1-I17 unchanged** per `packages/app/tests/fidelity/`. `bun run test:fidelity` green throughout.

4. **Component Blocks v2 18 built-ins survive** with ≤10% per-component LOC delta vs pre-migration. Measured via git diff of `packages/core/src/registry/built-ins.ts` + related NodeView files.

5. **No Hocuspocus feature regressions.** All load/store/authenticate/openDirectConnection/broadcastStateless/awareness paths continue to work.

6. **Binding post-condition satisfied:** for every local PM transaction, `(mine \ base) ⊆ result` at the maximal-unique-substring level, verified inline (content-preservation assertion per `reports/three-way-merge-content-preservation/REPORT.md` D8 invariant c).

7. **bun run check green** throughout the cutover.

8. **Playwright E2E suite green** — existing UX suite (`packages/app/tests/stress/crdt-stress.e2e.ts`, `ux-interactions.e2e.ts`, `docs-open.e2e.ts`) unchanged.

9. **Concurrent correctness at char level.** Two-client harness: 5-minute concurrent-write stress should produce zero content loss at Y.Text level (trivially true by Yjs RGA) and binding-correctness equivalence for all synchronized end states.

10. **No precedent #11/#12/#13/#14 mitigations remain.** grep codebase for those precedent names; remove/replace references. Precedent #22 (direct PM dispatch for nested editors) stays.

---

## 6) Acceptance criteria (directional, pre-spec)

At /spec graduation these become specific R1, R2, ... requirements with AC per normal spec discipline. Directional shape:

**AC-1.** Single content CRDT. No `Y.XmlFragment` creation in server or client code. Single `Y.Text('content')` per document. Agent-write, file-watcher, persistence all operate on it directly.

**AC-2.** PM↔Y.Text binding correctness. For each PM operation class (mark toggle, block conversion, insert, delete, paste, MDX edit, compound-component interaction), the binding's emitted Y.Text ops produce a tree on reparse that matches the originating PM tree (modulo fidelity-invariant normalization).

**AC-3.** Typing latency target met. p99 typing round-trip (PM tx → Y.Text → reparse → PM applied) ≤16ms on 10K-block docs with Rust engine active.

**AC-4.** Component Blocks v2 shipping 18 built-ins working end-to-end. Slash-insert → PropPanel edit → NodeView interaction → save → byte-identical pristine → reopen → render.

**AC-5.** Source mode unchanged. CodeMirror + y-codemirror.next behavior identical to pre-migration.

**AC-6.** Cross-view cursor presence. Remote user's cursor in one view renders in another user's view correctly via translator.

**AC-7.** Agent-write simplification. `applyAgentMarkdownWrite` replaced with single `applyFastDiff` call. MCP tool tests green.

**AC-8.** File-watcher reconciliation simpler. `applyExternalChange` → single `applyFastDiff`. Integration tests green.

**AC-9.** Persistence simpler. `onLoadDocument`/`onStoreDocument` operate on Y.Text directly. No XmlFragment load/store path.

**AC-10.** Bridge-layer code deleted. `server-observers.ts`, `server-observer-extension.ts`, client `observers.ts`, `bridge/merge-three-way.ts`, `bridge/diff-lines.ts`, `bridge/normalize.ts`, `bridge/scheduler.ts` removed from the tree.

**AC-11.** Bridge-coupled tests deleted. `bridge-matrix.test.ts`, `c1-c10-*.test.ts`, `bridge-convergence.fuzz.test.ts`, `server-authoritative-stress.test.ts`, `observers.test.ts`, `server-observers.test.ts` removed.

**AC-12.** Existing fidelity invariants (I1-I17) green. `bun run test:fidelity` passes.

**AC-13.** Existing Playwright E2E green. Identical UX coverage.

**AC-14.** CLAUDE.md precedents #11, #12, #13, #14 marked "superseded / removed" with cross-reference to this spec. Precedents #18 (Activity+Suspense), #19 (clipboard), #22 (direct PM dispatch), and others preserved.

**AC-15.** No Yjs version migration. Still on `yjs@^13.6.30`. No `@y/*` packages added.

---

## 7) Rejected alternatives

### 7.1 Yjs 14 + `@y/*` migration

**Rejected.** Evidence: `reports/yjs-14-ecosystem-adoption/REPORT.md`.

Six structural walls identified (2026-04-16):

1. **No ecosystem adoption.** `yjs` legacy: 3.566M weekly npm downloads. `@y/y`: 9,822 (0.275%). `y-prosemirror` 701K vs `@y/prosemirror` 9 weekly. Zero of ~60 surveyed production users on v14.
2. **Hocuspocus + `@y/y` structurally incompatible at the import layer.** Different npm package identifiers (`yjs` vs `@y/y`) + `lib0` major split (`^0.2.x` vs `^1.0.0-rc.x`) — cannot share a single install via `npm overrides`.
3. **`@y/websocket-server@0.1.5` is a 281-LOC starter** missing 13 of 17 Hocuspocus features we use. Rebuilding the missing features is ~1,850 server LOC of custom work.
4. **TipTap + Hocuspocus not migrating.** `@tiptap/y-tiptap@3.0.3` (2026-04-08) still pins `yjs ^13.5.38`. `@hocuspocus/server@4.0.0-rc.5` (2026-04-16) still pins `yjs ^13.6.8`. Hocuspocus v4 invented its own typed-origin solution (parallel-implementation signal).
5. **Single-YType dual-view binding doesn't work.** `@y/codemirror@0.0.0-3` at `y-sync.js:209` casts `op.insert` to string — cannot consume tree-shape deltas. Same binding-gap problem, different package.
6. **Maintainer flags v14 as broken alpha.** dmonad on issue #751: *"I know that these releases are broken."* BlockNote (the lone publicly-announced design partner) has zero public code progress 2.5 months after their FOSDEM 2026 talk.

**Additionally, Yjs 14 would not solve the dual-view binding problem** even if everything else in the ecosystem was ready. See `reports/yjs-14-ecosystem-adoption/evidence/y-codemirror-vs-y-codemirror-source-diff.md` — the dual-view binding gap is ecosystem-universal.

**Interaction with text-only path:** under text-only CRDT, Yjs 14 becomes irrelevant. We use one Y.Text — no need for type unification. Yjs 14 could become relevant much later for attribution/track-changes feature infrastructure, but that's a different decision cycle.

### 7.2 Loro full migration

**Rejected.** Evidence: `reports/peritext-on-yjs-feasibility/REPORT.md` 2026-04-16 Refresh, `reports/peritext-on-yjs-feasibility/evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md`, `reports/loro-ecosystem-readiness-assessment/REPORT.md`.

Key findings:
- **Dual-view binding gap is ecosystem-universal, not Yjs-specific.** `loro-codemirror@0.3.3` at `sync.ts:64` filters non-text diffs — functionally identical to `@y/codemirror`'s string cast. `loro-prosemirror@0.4.3` requires disjoint `LoroMap<{nodeName, attrs, children}>` shape. SchoolAI/loro-extended has no CM adapter. Choosing Loro does NOT unlock dual-view — the bridge relocates.
- **Pre-1.0 with active data-loss bug.** `loro-prosemirror` issue #77 is OPEN as of 2026-04-16, 0 maintainer comments in 19 days. OK's Activity+Suspense navigation pattern is the reporter's exact reproducer.
- **Bundle: 3.1 MB raw / ~1.0 MB gzipped WASM** — violates OK's existing `size-limit` CI gates (800KB main, 950KB total).
- **No Loro server has Hocuspocus-feature parity.** `@loro-extended/repo@5.4.2` is client-shape only. Estimated 2,000-3,000 LOC server orchestration from scratch.
- **Typed-origin degrades to string-prefix convention.** `LocalTransactionOrigin` object-identity matching (precedent #1) collapses.
- **~7,500 LOC of bridge-coupled tests** reach into Yjs internals with no Loro equivalent. Add ~14-18 weeks not in prior 12-20 week estimate. Realistic total: **6-9 months dedicated work**.

**Only Loro advantage kept:** Peritext boundary semantics (per-mark `expand` flags). Real upside, but unlikely product-visible for OK's use case (agent writes go through markdown layer, not at format-mark level).

**Interaction with text-only path:** under text-only on Yjs 13, Peritext boundary semantics are moot because marks are character sequences in the source (`**`, `*`), not first-class CRDT entities. Loro's semantic advantage evaporates.

### 7.3 CM-only WYSIWYG (rebuild WYSIWYG in CodeMirror decorations)

**Rejected.** Evidence: §3 capability comparison in the exploration + ongoing observation of Obsidian Live Preview UX reception.

Per-capability breakdown comparing PM-over-Y.Text (Path A, this story) vs CM-only (Path B):

| Capability | Path A effort | Path B effort | Winner |
|---|---|---|---|
| Inline marks | free (built-in) | ~500 LOC + cursor-hide/show | Wash |
| Lists with nesting + Tab | free via TipTap | ~1,500 LOC custom | Path A |
| Tables | free via `@tiptap/extension-table` | ~3,000 LOC or Obsidian-level jank | **Path A decisive** |
| MDX block components | ~3,000 LOC (CB v2 stays) | ~5,000 LOC widget/decoration system | Path A |
| Compound components (Tabs, Accordion) | React state in NodeView | ~1,500 LOC UI-state projection | **Path A decisive** |
| Drag-and-drop block reorder | ~100 LOC integration | ~1,500 LOC custom | Path A |
| Structural commands | free via PM commands | ~1,000 LOC character-level analogs | Path A |
| Invalid MDX states | ~500 LOC (FR-30..35 nested CM) | **FREE** (CM is already source-editable) | Path B |
| Cursor preservation | ~300 LOC translator | Native | Path B |
| IME / composition | defer logic in binding | Native | Slight Path B |
| Fenced code highlighting | extension | Native in Lezer | Path B |

**Aggregate LOC:**
- Path A: ~7,000 LOC total new/modified code
- Path B: ~15,000 LOC total new/modified code

**Qualitative:**
- Path A preserves TipTap's ~100+ extension ecosystem (decades of polish on tables, drag-drop, slash menus, commands, input rules, etc.)
- Path B abandons the ecosystem and rebuilds each extension as a CM decoration analog
- Path A's UX matches Notion/Linear/GitBook (clean interactive components; opaque-box-with-PropPanel for Callouts)
- Path B's UX converges on Obsidian Live Preview — widely-reported as disorienting (syntax chars reveal near cursor; tables are weak; compound components can't exist naturally)

**The ontological core:** PM is tree-first. CM is string-first. Our product wants tree-first things (interactive components with identity, structural selection, NodeViews). Our source view wants string-first. Path A picks the right tool for each; Path B forces one tool for both.

### 7.4 Stay dual-CRDT indefinitely (do nothing)

**Rejected** on architectural trajectory grounds.

Every future feature accumulates against the bridge:
- V0-14 agent-undo needs new bridge invariants (per CLAUDE.md STOP rule)
- Attribution / track-changes will want source-slice reasoning (already in Component Blocks v2 `sourceRaw`)
- Comments-on-paragraphs want stable node identity across concurrent edits
- Every new agent-write path re-derives the XmlFragment-authoritative composition pattern

Bridge-correctness spec is a local optimum. Running that pattern forever means paying the correctness tax on every future feature, accepting Khanna-Kunal-Pierce's bound as a permanent ceiling, and continuing to coordinate 5 CLAUDE.md precedents around a representational mismatch.

The text-only migration is worth doing ONCE to escape this tax permanently — when the enabling technology (Rust engine) is ready.

### 7.5 Milkdown-style Y.XmlFragment-canonical single-CRDT

**Rejected.** Evidence: §11b flow matrix + Milkdown source verification (`milkdown/milkdown@packages/plugins/plugin-collab/src/collab-service.ts` — uses `doc.getXmlFragment('prosemirror')` + y-prosemirror's `ySyncPlugin`).

This is the ecosystem-default architecture, shipping in Milkdown and every other markdown-over-PM editor (TipTap.io, Linear, Notion). It is a *viable* single-CRDT option — unlike Yjs 14 migration it doesn't gamble on ecosystem readiness, unlike Loro it doesn't pay a 1.0MB WASM tax, unlike CM-only it preserves PM's tree ontology. It deserves explicit consideration.

Rejection rests on two independent losses, each sufficient on its own:

**Loss 1 — D3 (source-mode CM first-class collaborative editing).** Y.XmlFragment cannot serve both PM and CM as first-class binding targets. Three sub-options, each with a fatal cost:
- **(a) Read-only derived CM projection** — serialize XmlFragment on observer fire → render in CM → disallow editing. Kills collaborative source editing; regresses from today's shipped behavior.
- **(b) CM edits via parse+tree-diff** — user's CM chars trigger `parse(cmContent) → diffAgainstXmlFragment → apply tree ops`. Works with Rust speed, BUT: CM awareness lost (cursors are tree-position, not char-offset), concurrent CM typing becomes tree-level-interleave (never tested in y-prosemirror's design space), and char-level undo in CM becomes tree-level undo.
- **(c) Parallel Y.Text side-channel for CM** — sync Y.XmlFragment ↔ Y.Text as a bridge. **This IS the current dual-CRDT architecture**, just re-derived. Bridge-correctness problems reappear.

If source-mode CM is load-bearing product value (see §11b flow 2), none of (a)/(b)/(c) are acceptable.

**Loss 2 — D7 (disk-boundary alignment).** Independent of D3. In Y.XmlFragment-canonical, every disk-boundary operation — initial load, persistence, API read, file-watcher reconciliation, conflict-marker rendering, frontmatter, branch-switch reconciliation — requires serialize or parse at the boundary. Reconciliation specifically is currently done by `mergeThreeWay` on markdown lines (proven, shipped); under Y.XmlFragment-canonical, reconciliation either needs (i) tree-level three-way merge (A11 — claim is this is unsolved ecosystem-wide; verification pending via `reports/tree-level-three-way-merge-prior-art/`) or (ii) serialize-merge-parse — which collapses to Y.Text-canonical at the reconciliation boundary, meaning Y.XmlFragment-canonical is actually Y.Text-canonical-plus-round-trip at that boundary. This loss persists even if source-mode CM were removed.

**What Y.XmlFragment-canonical DOES win on (the honest comparison):**
- Per-keystroke typing in PM is ~0ms (no binding round-trip) vs Y.Text's ~14ms Rust-round-trip (flow 1)
- Concurrent mark toggles compose tree-LWW, not char-RGA (flow 1 — clean)
- Concurrent MDX attr edits compose attr-LWW, not char-RGA (flow 7 — clean)
- Drag-drop block moves emit compact tree ops vs Y.Text's delete+insert-at-distance (flow 5)
- Binding is off-the-shelf y-prosemirror (no custom `diffPMDocs` to write)

The concurrent-semantics wins (marks, attr LWW) are real but bounded: they matter only during overlapping concurrent edits on the same semantic unit, which for OK's workload (mostly single-author + agent-writes-to-distinct-blocks) is a 1-in-many event. The char-RGA anomaly is transient and self-healing on next keystroke, vs the permanent capability loss of first-class CM source-mode. A2 empirical survey (`reports/concurrent-mark-prop-crdt-semantics/`) quantifies this tradeoff.

**Interaction with text-only path:** if source-mode CM is dropped at the product level (A10 refuted), Y.XmlFragment-canonical-single-CRDT becomes genuinely competitive. It still loses D7 (disk-boundary), but D7 alone may not be decisive without the source-mode lever. This story's graduation is contingent on source-mode being load-bearing at graduation time (A10).

---

## 8) Prerequisites + sequencing

### Hard prerequisite: Rust markdown engine shipped

Per `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md`. Target: ~5ms parse + ~2ms serialize at 10K blocks on commodity hardware. This is not optional — the PM↔Y.Text binding round-trips through parse + serialize on every PM transaction.

Current TS baseline (per `specs/2026-04-16-bridge-correctness/evidence/perf-baseline-measured.md`): 98.6ms p50 at 1K blocks; 1,233ms p50 at 10K blocks. At these speeds, typing in WYSIWYG would be unusable (~1 second delay per keystroke on large docs).

### Soft prerequisite: bridge-correctness spec shipped + telemetry accumulated

Bucket A's post-condition + elevated fuzz gives production data on content-loss rate. Low rate → text-only migration is architectural polish (still valuable, but not urgent). High rate → text-only is the structural fix.

Either way, bridge-correctness work is days-to-weeks; text-only is months. Bridge-correctness ships first regardless.

### Sequencing

1. **(Now)** Bridge-correctness ships (days-to-weeks). Establishes telemetry.
2. **(Next)** Rust engine ships (4.5-5 weeks per its spec). Enables typing latency.
3. **(Then)** Prototype spike: custom PM↔Y.Text binding against actual MDX corpus (2-3 weeks spike, 1 developer). Validates the `diffPMDocs` algorithm, IME handling, UndoManager integration.
4. **(If spike validates)** Graduate this story to `/spec`. Use the spike as Phase 0. Full implementation cutover estimated 8-10 weeks.
5. **(Parallel to implementation)** Delete bridge-coupled tests; add binding-correctness tests.
6. **(Rollout)** Canary dev → staging → prod. Verdict file from Rust engine's CI infrastructure becomes the release gate.

### Parallelism assumptions

- Bridge-correctness and Rust engine can proceed in parallel — they touch different surfaces. Bridge-correctness is CRDT-layer; Rust engine is parse/serialize-layer.
- Component Blocks v2's post-#165 follow-up (I13-I17 + PF01-PF02 tests) can proceed in parallel — no CRDT-layer dependency.
- The text-only migration depends on BOTH (Rust engine for latency; bridge-correctness Bucket A for telemetry).

---

## 9) Assumptions with verification plans

**A1. `diffPMDocs(oldDoc, newDoc)` can produce minimal PM transactions that preserve cursor/selection/IME state for OUR specific MDX + Component Blocks v2 workload.**
- Confidence: MEDIUM
- Prior art: y-prosemirror's `updateYFragment` proves the algorithm in the forward direction. Inverse direction (from a provided target doc, not Y.XmlFragment diff) is novel but the same structural algorithm. No production reference for the inverse + our MDX NodeView shape.
- Verification: prototype spike on 3 representative MDX docs (hello-world, medium blog post with Component Blocks v2 components including nested compounds like Tabs>Tab, long agent-written transcript). Measure cursor preservation through 100+ PM transactions including: bold/italic/link mark toggles, block-type conversions, MDX prop edits, compound-component interactions, paste (small + large), IME composition.
- **Expiry:** must complete BEFORE /spec graduation. If assumption refuted, the story doesn't graduate — cascades to re-open the entire architectural direction.

**A2. Character-level mark composition is acceptable UX when two users concurrently toggle marks on overlapping ranges.**
- Confidence: **MEDIUM (downgraded / sharpened 2026-04-17 via `reports/concurrent-mark-prop-crdt-semantics/REPORT.md`).**
- Prior art (verified): **HedgeDoc 2** and **Obsidian Relay/Peerdraft** ship exactly this pattern — Yjs + Y.Text containing raw markdown source, CodeMirror binding, `**bold**` is literal `*` chars in a shared Y.Text. No widely-reported forum complaints despite structural presence of the Peritext "Example 3" artifact (canonical: Alice bolds "The fox", Bob bolds "fox jumped" → merge produces `**The **fox** jumped.**` rendering as "**The** fox **jumped**" with "fox" non-bold).
- Commercial editors (Notion, Linear, Google Docs, Figma, Confluence, y-prosemirror-based) have unanimously converged on structured-marks + LWW attrs; **no commercial editor ships char-RGA on serialized marks.** The two production instances that do ship it are small-userbase OSS markdown editors where concurrent-same-span-mark is a rare workflow.
- Academic consensus (Peritext 2022, Fugue 2023, Eg-walker 2024) is explicit: char-RGA on serialized marks is formally incorrect for concurrent overlapping marks. Peritext Example 3 artifact is **persistent in the merged CRDT — not transient, not self-healing** without user intervention.
- **Risk analysis for our target architecture:** (a) our PM projection emits Y.Text ops via `diff_main` not via semantic addMark — so concurrent PM bold toggles DO decompose to char-level asterisk insert/delete at overlapping positions. (b) Self-healing depends on markdown's asterisk-parity semantics, which are unreliable. (c) Our workload is mostly single-author or single-author+agent-writes-to-distinct-blocks; 1-in-many occurrence matches HedgeDoc's observed tolerance.
- Verification: (i) informal dogfooding on concurrent bold/italic/link toggles during spike Phase 0 — construct Peritext Example 3 explicitly; measure self-heal behavior on next keystroke, (ii) evaluate a "semantic emitter" option in the binding that routes PM addMark/removeMark through atomic whole-mark Y.Text operations (see Q1 in §10), bypassing char-level decomposition on mark ops specifically.
- **Expiry:** observed during spike Phase 0. If construction reproduces Peritext Example 3 AND self-heal UX is unacceptable, mark-aware semantic emitter becomes P0 in /spec (not NOT UNLESS). If Example 3 is tolerable (as HedgeDoc's deployment suggests for their workload shape), A2 holds.

**A3. Typing latency with Rust engine is ≤16ms p99 at 10K blocks.**
- Confidence: HIGH (based on Rust engine spec's G1 target of <20ms at 10K; binding overhead should be <5ms).
- Verification: typing-latency harness against Rust engine. Gate on AC-3.
- **Expiry:** measured during spike; if violated, the entire architectural direction fails its enabling premise — escalate immediately.

**A4. MDX NodeViews' γ dirty-tracking translates cleanly with only `sourceDirty` lifecycle changes.**
- Confidence: HIGH (analyzed in `specs/2026-04-14-component-blocks-v2/SPEC.md` context during exploration).
- Verification: port one built-in component (e.g., Callout) end-to-end as spike Phase 0 exit criterion. Verify round-trip byte-identity for pristine, idempotent normalization for edited.
- **Expiry:** spike Phase 0 (week 1 of prototype).

**A5. Context Bridge Registry bridgeId stays stable under `diffPMDocs`-preserved PM node identity.**
- Confidence: MEDIUM (depends on reconciler's node-preservation behavior; no direct prior art for this specific key-identity pattern under PM-tree diffing)
- Verification: nested-compound-component test (Tabs > Tab) survives 1000 concurrent edits without bridgeId churn. Content-addressed fallback available if identity proves unstable.
- **Expiry:** spike Phase 0.

**A6. Agent writes simplify to single `applyFastDiff` calls without semantic regression.**
- Confidence: HIGH (the XmlFragment-mirror step in current `applyAgentMarkdownWrite` exists purely for CRDT coherence, not correctness)
- Verification: MCP integration tests unchanged; agent-sim scripts produce byte-identical outputs pre/post.
- **Expiry:** during cutover (Phase 2-3 of implementation).

**A7. Hocuspocus + custom PM↔Y.Text binding has no unexpected interactions.**
- Confidence: MEDIUM-HIGH (Hocuspocus is Y.Doc-level; custom binding is client-local; no known interaction surface)
- Verification: integration test running 5-minute multi-client concurrent stress.
- **Expiry:** during cutover (Phase 2 of implementation).

**A8. File-watcher reconciliation three-way merge simplifies.**
- Confidence: HIGH (currently operates on markdown text in `reconciliation.ts`; single-CRDT collapse removes XmlFragment side)
- Verification: existing `reconciliation.test.ts` passes; simplified implementation matches current semantics on all `c5-file-watcher-*.test.ts` cases.
- **Expiry:** during cutover.

**A9. Yjs 13 lifetime is adequate for the decision window.** Yjs 13 remains maintained (parallel with v14 per `reports/yjs-14-ecosystem-adoption/evidence/yjs-14-maintainer-roadmap-and-signals.md`). No forced migration pressure within the graduation window.
- Confidence: HIGH (verified 2026-04-16 via maintainer-roadmap research — v13.6.30 shipped 2026-03-14; `SECURITY.md` lists 13.6.x as supported; parallel-maintenance posture, not deprecation)
- Verification: monitor `yjs` package release cadence quarterly. If v13.6.x moves to deprecation, re-evaluate whether text-only migration should fold in a Yjs 14 migration simultaneously.
- **Expiry:** recurring — quarterly check until /spec graduation.

**A10. Dual-view (WYSIWYG + source-mode) remains a product requirement through the graduation window.**
- Confidence: HIGH (explicit product direction; source-mode is already shipped and used)
- Verification: no product-level decision to drop source-mode.
- **Expiry:** any product decision to consolidate to single-view makes this story moot (different architecture would be preferred).

**A11. Tree-level three-way merge at the disk-reconciliation boundary is an unsolved problem ecosystem-wide; serialize-merge-parse is the realistic fallback for tree-canonical CRDTs.**
- Confidence: **HIGH (verified 2026-04-17 via `reports/tree-level-three-way-merge-prior-art/REPORT.md`).**
- Verified findings: (a) **Zero production CRDT editors** implement tree-level 3-way merge against external non-CRDT state. (b) `updateYFragment` is explicitly 2-way — confirmed by direct source read of y-prosemirror@1.3.7 `sync-plugin.js:1145` — signature takes no common-ancestor. (c) Automerge's marketing "no merge conflicts" applies only within the CRDT op-history domain, not against external disk state. (d) Loro's git-like `fork/merge/checkout` operates only between Loro versions. (e) Milkdown's `collab-service.ts` has NO disk integration; reconciliation is "destroy and recreate editor." (f) Every git-backed markdown editor surveyed (Obsidian, Dendron, Foam) falls back to line-level diff3 with manual resolution. (g) SemanticMerge (most advanced shipping structured-merge tool) explicitly uses hybrid tree+text+manual, leaf-level fallback to text. (h) Academic literature (Chawathe, Lindholm, Apel, Ignat, Kleppmann) is 25+ years of research with NP-hard matching; none absorbed into production CRDT editors.
- Significance: §7.5's D7 reconciliation argument is now HIGH-confidence. Y.XmlFragment-canonical's reconciliation leg either (i) requires inventing tree-level 3-way merge (open research problem) or (ii) degenerates to serialize-merge-parse (which IS Y.Text-canonical-at-the-reconciliation-boundary, with added parse overhead).
- **Expiry:** verified. Monitor ecosystem quarterly for any new production implementation of tree-level 3-way; if one ships, re-evaluate.

---

## 10) Decision surfaces open for /spec

These become /spec's opening Q batch when graduated:

**Q1.** Binding write model: single-authored (one writer per PM transaction; generic `diff_main` between old and new serialized markdown) vs op-aware (binding emits semantic text ops mapped from PM operation kinds — e.g., "mark bold" emits paired `**` inserts, "convert paragraph to heading" emits heading-prefix insert). Op-aware composes better under concurrent edits but is more complex.

**Q2.** `sourceDirty` attr lifecycle: ephemeral per-tx Set<NodeId> vs per-session PM attr vs long-persisted schema attr. Today's dual-CRDT architecture uses long-persisted; under text-only, shorter is possible.

**Q3.** PM history disabled entirely or kept with Y.UndoManager as outer authority. y-prosemirror disables PM history; we'd inherit that pattern.

**Q4.** Nested-CM implementation for rawMdxFallback: direct PM dispatch (per precedent #22, unchanged from today) vs range-scoped Y.Text binding via y-codemirror.next on a Y.Text substring view (if such an API existed; would need custom building).

**Q5.** Awareness shape: canonical text-offset form with PM-side translation on render, vs dual-form (both PM-pos and text-offset stored, view-appropriate used). Single form is simpler but requires more translation; dual-form is more state.

**Q6.** Cross-view cursor rendering precision: exact (translate on every render) vs approximate (update on coarse intervals). Exact is user-friendly but compute-heavy; approximate risks visual drift.

**Q7.** Binding post-condition severity in production: dev-throw vs prod-log-and-continue vs prod-log-and-rollback. Mirror bridge-correctness Bucket A decision.

**Q8.** Migration strategy for in-flight documents: one-shot cutover vs phased (feature flag) vs parallel (dual-CRDT and single-CRDT modes coexist during rollout). Complexity vs safety tradeoff.

**Q9.** Backward compat on the wire: one-shot breaking change vs compat layer for old docs (XmlFragment → Y.Text converter on load). Probably unnecessary — docs load from disk markdown anyway, not from persisted Y.Doc state.

**Q10.** Performance telemetry: what do we measure in production to validate AC-3?

---

## 10b) Items table (consolidated)

Per /stories extraction-protocol discipline, this unified table tracks every load-bearing item raised during the exploration. Type prefixes: **PQ** = product question (user-facing behavior, scope), **TQ** = technical question (implementation, algorithm), **XQ** = cross-cutting (both). Status lifecycle: `Decided` / `Assumed` / `Exploring` / `Parked`. Priority: P0 = must be resolved at /spec graduation; P2 = can be deferred into /spec iteration.

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|:-:|---|---|
| **Rejected alternatives (Decided)** |
| D1 | Yjs 14 + `@y/*` migration | XQ | P0 | Decided: rejected | §7.1. Revisit trigger: Yjs 13 EOL (A9) or spike uncovers v14-only blocker. Evidence: `reports/yjs-14-ecosystem-adoption/REPORT.md` |
| D2 | Loro full migration | XQ | P0 | Decided: rejected | §7.2. Dual-view binding gap ecosystem-universal; pre-1.0 data-loss bug; WASM size > gates. Evidence: `reports/peritext-on-yjs-feasibility/REPORT.md` 2026-04-16 Refresh |
| D3 | CM-only WYSIWYG | PQ | P0 | Decided: rejected | §7.3. ~2× LOC; Obsidian-Live-Preview UX regression; breaks CB v2 compound components |
| D4 | Stay dual-CRDT indefinitely | XQ | P0 | Decided: rejected | §7.4. Every feature accumulates bridge debt; Khanna-Kunal-Pierce is permanent ceiling. Must revisit if Rust engine slips indefinitely |
| D5 | Text-only + PM-projection as target architecture | XQ | P0 | Decided: chosen direction | §3. Conditional on prerequisites (§8, §15 graduation criteria) and spike validation (A1). Story is a seed, not a commitment |
| D6 | Milkdown-style Y.XmlFragment-canonical single-CRDT | XQ | P0 | Decided: rejected | §7.5. Loses on D3 (source-mode CM) and D7 (disk-boundary). Competitive if A10 refuted AND A11 refuted. Revisit trigger: product drops source-mode AND research confirms tree-3-way tractable |
| **Assumptions (need verification before /spec)** |
| A1 | `diffPMDocs` produces minimal PM txs preserving cursor/selection/IME on OUR MDX+CB v2 workload | TQ | P0 | Assumed: MEDIUM | §9. Verified by prototype spike on 3 MDX docs × 100+ txs. Expiry: before /spec graduation. Refutation ⇒ story doesn't graduate |
| A2 | Character-level mark composition is acceptable UX under concurrent toggle | PQ | P0 | Assumed: MEDIUM | §9. Verified by spike dogfooding. Refutation ⇒ mark-aware emitter becomes P0 (§4 NOT UNLESS) |
| A3 | Typing latency ≤16ms p99 at 10K blocks with Rust engine | TQ | P0 | Assumed: HIGH | §9. Verified by latency harness during spike. Refutation ⇒ entire direction fails enabling premise |
| A4 | CB v2 γ dirty-tracking ports with only `sourceDirty` lifecycle delta | TQ | P0 | Assumed: HIGH | §9. Verified by porting Callout end-to-end in spike Phase 0 |
| A5 | Context Bridge Registry bridgeId stable under `diffPMDocs`-preserved PM node identity | TQ | P0 | Assumed: MEDIUM | §9. Verified by nested-compound (Tabs>Tab) test. Fallback: content-addressed bridgeId |
| A6 | Agent writes simplify to `applyFastDiff` without semantic regression | TQ | P2 | Assumed: HIGH | §9. Verified during cutover Phase 2-3 |
| A7 | Hocuspocus + custom binding has no unexpected interactions | TQ | P2 | Assumed: MEDIUM-HIGH | §9. Verified by 5-minute multi-client stress during cutover |
| A8 | File-watcher reconciliation simplifies cleanly | TQ | P2 | Assumed: HIGH | §9. Verified by existing `c5-file-watcher-*.test.ts` suite against simplified impl |
| A9 | Yjs 13 line remains maintained through graduation window | XQ | P0 | Assumed: HIGH | §9. Quarterly monitoring; recurring expiry. Refutation ⇒ C2 constraint fires; story folds in Yjs 14 question |
| A10 | Dual-view (WYSIWYG + source) remains product requirement | PQ | P0 | Assumed: HIGH | §9. No product decision to drop source-mode. Refutation ⇒ Milkdown-style Y.XML-canonical becomes competitive (see D6), story may pivot |
| A11 | Tree-level 3-way merge is unsolved ecosystem-wide; serialize-merge-parse is the realistic fallback | TQ | P0 | **Assumed: HIGH (verified 2026-04-17)** | §9. `reports/tree-level-three-way-merge-prior-art/REPORT.md`: zero production CRDT editors implement tree-level 3-way; serialize-merge-parse universal fallback. §7.5 D7 argument stands HIGH-confidence |
| A2b | Concurrent mark + MDX-attr char-RGA semantics are acceptable UX | PQ | P0 | **Assumed: MEDIUM (sharpened 2026-04-17)** | §9 A2 extension. `reports/concurrent-mark-prop-crdt-semantics/REPORT.md`: HedgeDoc 2 + Obsidian Relay ship char-RGA on Y.Text markdown without widespread complaints; commercial editors converged on structured marks + LWW attrs. MDX-attr char-level merging: zero editors ship it. Spike Phase 0 constructs Peritext Example 3 explicitly |
| **Decision surfaces handed off to /spec (Parked → /spec)** |
| Q1 | Binding write model: generic `diff_main` vs op-aware semantic emitter | TQ | P0 | Parked → /spec | §10. Deferred deliberately — requires A1/A2 spike data to answer well. Op-aware composes better under concurrent edits but adds complexity |
| Q2 | `sourceDirty` attr lifecycle: per-tx / per-session / persisted | TQ | P0 | Parked → /spec | §10. Text-only enables shorter lifecycle than dual-CRDT today; /spec picks the right one for CB v2 interaction model |
| Q3 | PM history disabled vs kept under Y.UndoManager outer authority | TQ | P0 | Parked → /spec | §10. y-prosemirror disables PM history; likely inherit — but /spec confirms by checking UndoManager origin filter interaction |
| Q4 | Nested-CM for rawMdxFallback: direct PM dispatch vs range-scoped Y.Text binding | TQ | P2 | Parked → /spec | §10. Current precedent #22 likely prevails |
| Q5 | Awareness shape: canonical text-offset + translation vs dual-form | TQ | P0 | Parked → /spec | §10. Single form simpler; dual-form cheaper runtime — /spec picks based on translator perf |
| Q6 | Cross-view cursor rendering precision: exact vs approximate | PQ | P2 | Parked → /spec | §10. User-facing quality vs compute tradeoff |
| Q7 | Binding post-condition severity: dev-throw / prod-log / prod-rollback | TQ | P0 | Parked → /spec | §10. Mirror bridge-correctness Bucket A decision once that decision lands |
| Q8 | Migration strategy: one-shot / feature-flag / parallel-CRDT-modes | XQ | P0 | Parked → /spec | §10. Constrained by C5 (no dual coexistence on wire) — narrows choice set |
| Q9 | Backward compat on wire: breaking vs compat layer | XQ | P2 | Parked → /spec | §10. Likely unnecessary — disk is canonical source |
| Q10 | Performance telemetry shape for AC-3 validation | TQ | P2 | Parked → /spec | §10. /spec discipline; ties to bridge-correctness Bucket A |
| **Parked (adjacent/pre-conditions not in scope for this story)** |
| P1 | Concurrent-prop mark-aware semantic emitter | TQ | — | Parked (NOT UNLESS) | §4. Trigger: concurrent-prop pain observed in spike/production |
| P2 | `@tiptap/y-tiptap` vendored-fork patch coverage gap | TQ | — | Parked: separate issue | §13. Active prod bug; fix independently; becomes moot if text-only ships |
| P3 | Server-side observer migration (from Rust engine spec) | XQ | — | Parked: NEVER under target | §4. Target architecture removes subject of question |
| P4 | Yjs 14 track-changes feature infrastructure | XQ | — | Parked (NOT NOW) | §7.1 closing. Different decision cycle; not this story |
| **Constraints (from §4b, tracked for completeness)** |
| C1 | Rust markdown engine in production | TQ | P0 | Decided: hard prerequisite | §4b. Gates spike start |
| C5 | One-time architectural cutover (no dual coexistence on wire) | XQ | P0 | Decided: appetite constraint | §4b. Rules out Q8 "parallel-CRDT-modes" option |

**Provenance note:** Every Decided item's rationale traces to either a named report in §14 or an explicit section in this story. Every Assumed item has an expiry + verification plan (§9). No P0 items are Open without a verification path.

---

## 11) Interplay with existing work streams

### 11.1 Bridge-correctness spec (current, `specs/2026-04-16-bridge-correctness/`)

**Status:** In progress. 4 buckets (0 proximate, A guardrail, B settlement, C characterization).

**Interplay:** complementary short-term → strategically subsumed long-term.

Bridge-correctness fixes the current architecture's symptoms. Text-only migration replaces the architecture. Both are valuable. Bridge-correctness provides telemetry (Bucket A) that calibrates text-only's urgency. Bridge-correctness also installs the post-condition pattern that gets promoted to client-binding in text-only.

Bridge-correctness's D4 "LOCKED — Single-CRDT collapse out of scope" stays LOCKED. This story captures the separate-spec work that D4 points at.

### 11.2 Rust markdown engine spec (next, `specs/2026-04-14-markdown-engine-rust-bridge/`)

**Status:** Spec complete; implementation pending.

**Interplay:** enabling technology; strict prerequisite.

Rust engine ships independently, valuable on its own for server-side agent-write and persistence performance. When text-only migration begins, Rust is already production-deployed — binding can assume fast parse/serialize from day one.

Rust spec doesn't mention text-only (it was written 2026-04-14 pre-dating this exploration). No changes needed to Rust spec; the text-only migration benefits from Rust without coupling to it.

Actionable: Rust engine spec could add a note to its §15 Future Work → "text-only CRDT migration (see `stories/2026-04-17-text-only-crdt-pm-projection/`) depends on Rust engine performance." Purely informational, no scope change.

### 11.3 Component Blocks v2 spec (in flight, `specs/2026-04-14-component-blocks-v2/`)

**Status:** PR #165 shipped architecture + 18 built-ins + nested-CM convergence; follow-up PR pending for I13-I17 + PF01-PF02.

**Interplay:** architecturally aligned; 95% carry-over.

The γ dirty-tracking pattern is markdown-source-canonical by design. Under text-only CRDT, the pattern survives with only `sourceDirty` lifecycle adjustment. The descriptor registry, runtime dispatch, PropPanel, SideMenu, drag-handle, rawMdxFallback nested CM, Context Bridge Registry — all preserved.

**Specific deltas under text-only:**
- FR-7 source-dirty observer's origin-filter list shrinks from 4 (sync-from-text, sync-from-tree, agent-write, rollback-apply) to 1 (binding-self-origin)
- FR-22 "Observer B always-live" becomes trivial — there's no Observer B, just the binding's default behavior
- FR-29 bridgeId via PluginState keyed by PM node identity (preserved via diffPMDocs) instead of Y.XmlElement identity
- FR-35 "Direct PM dispatch for nested editors" precedent #22 strengthens — single-writer invariant at the CRDT layer
- G4 "Different props: attribute-level LWW" softens to "character-level merge for same-prop concurrent edits (rare)"

These deltas are captured in this story; they will inform the text-only /spec's approach to the Component Blocks v2 surface. Component Blocks v2 ships unchanged on today's architecture; the text-only migration is additive.

### 11.4 Clipboard-mdast-canonical spec (shipped)

**Status:** Shipped, precedent #19.

**Interplay:** stays. The mdast-canonical hub is CRDT-agnostic. Per-view CRDT-write side rewires to use the custom binding. Minimal delta.

### 11b Flow-by-flow matrix (canonicality comparison across user + system flows)

Added 2026-04-17. Motivated by the question "how does canonicality interact with all user and system flows, not just PM typing?" The matrix reveals that D7 (disk-boundary alignment) is a cluster of ~6 flows independent of D3 (source-mode CM), strengthening the Y.Text-canonical case beyond the source-mode argument alone.

Legend: **Y.Text** = Y.Text-canonical (proposed target). **Y.XML** = Y.XmlFragment-canonical single-CRDT (Milkdown-style, §7.5). Winners assume Rust engine is in production (parse+serialize ~5-7ms at 10K blocks).

| # | Flow | Y.Text | Y.XML | Winner + why |
|---|---|---|---|---|
| 1 | User typing in WYSIWYG (PM) | per-tx parse+serialize+diffPMDocs (~14ms Rust) | native y-prosemirror (~0ms) | **Y.XML** on latency; Y.Text viable with Rust |
| 2 | User typing in source mode (CM) | native y-codemirror.next, first-class collaborative | derived (read-only) OR CM→parse→tree-diff (loses char-awareness) OR parallel Y.Text (= dual-CRDT reborn) | **Y.Text decisive** (D3) |
| 3 | User paste in WYSIWYG | mdast→PM→serialize→Y.Text chunked | mdast→PM→tree ops chunked | tie |
| 4 | User paste in source mode | CM via y-codemirror.next | CM paste → parse full doc → tree diff | **Y.Text** simpler |
| 5 | Drag-drop block reorder | `diff_main` sees delete+insert (large op for 200-line block) | tree-level node-move op (compact) | **Y.XML** efficient |
| 6 | Slash commands / input rules | via binding | via y-prosemirror | tie |
| 7 | Edit MDX attr via PropPanel | char-RGA on attr value; concurrent garble possible without semantic emitter | attr-level LWW, clean | **Y.XML** semantic win |
| 8 | Raw MDX nested CM | precedent #22 direct PM dispatch | same | tie |
| 9 | Agent writes (/api/agent-write-md) | `applyFastDiff` one shot | parse → structural diff → tree ops | both simpler than dual-CRDT; edge Y.Text on simplicity |
| 10 | Agent undo / redo | UndoManager on Y.Text ops | UndoManager on XmlFragment ops | tie |
| 11 | File-watcher disk change | `applyFastDiff` one shot | parse → diffXmlFragment | tie on correctness; **Y.Text simpler** |
| 12 | Git branch switch reconciliation | `mergeThreeWay` (diff3+DMP) at markdown level — proven, shipped | tree-level 3-way merge (A11 unsolved) OR serialize-merge-parse | **Y.Text decisive** (D7) |
| 13 | Git conflict markers | `<<<<<<<` literal in Y.Text, visible both views | parse into text nodes — visible but unstructured | **Y.Text** natural (D7) |
| 14 | Initial doc load | `yText.insert(0, diskBytes)` | parse → mdast→PM→`prosemirrorToYXmlFragment` | **Y.Text** trivial (D7) |
| 15 | Persistence (CRDT→disk) | `yText.toString()` → atomic write | PM→mdast→markdown serialize → write | **Y.Text** trivial (D7) |
| 16 | Save-version | same as 15 + git commit | same as 15 + git commit | tie (edge Y.Text) |
| 17 | Rollback (timeline UI) | `applyFastDiff` with ROLLBACK_ORIGIN | parse → updateYFragment | tie |
| 18 | Mode toggle (PM ↔ CM) | both views are projections | forces derived-projection question for CM | **Y.Text** trivial |
| 19 | Frontmatter | lives naturally at top of Y.Text | sidecar Y.Map OR special node | **Y.Text** (D7) |
| 20 | API reads (MCP `read_document`, `/api/document`) | `yText.toString()` direct | XmlFragment → serialize per read | **Y.Text** (D7) |
| 21 | Cursor / awareness translation | text-offset canonical; PM translates; CM native | PM-pos canonical; CM translates; PM native | symmetric; one translator either way |
| 22 | Backlinks / graph / outline extraction | parse Y.Text → walk mdast | walk XmlFragment tree directly | tie |
| 23 | Two concurrent agents | char-RGA compose; overlap char-interleave | tree-level compose; overlap cleaner | **Y.XML** slightly cleaner |
| 24 | User typing + agent writing concurrently | char-RGA; no bridge means no Bug-A | tree-level via updateYFragment; no Bug-A either | tie (both single-CRDT options dissolve Bug-A) |
| 25 | User typing + file-watcher load | char-RGA compose | tree-level compose | tie |
| 26 | User typing + branch-switch reconcile | text 3-way merge into Y.Text (proven) | tree 3-way merge (unsolved) OR serialize-merge-parse | **Y.Text** (D7) |
| 27 | Fumadocs preview / external tools | markdown file on disk, unchanged | same | tie (orthogonal) |

**Tallies:** Y.Text wins 12 flows, Y.XML wins 4 flows, 11 ties.

**Cross-flow pattern:**
- **Y.XML wins cluster (4 flows: 1, 5, 7, 23):** PM-internal concurrency with rich semantic operations (mark composition, block moves, attr LWW, multi-agent overlap). Real wins but bounded to within-PM edits during overlapping concurrent operations.
- **Y.Text wins cluster 1 — D3 source-mode** (flows 2, 18): CM first-class collaborative editing + trivial mode toggle.
- **Y.Text wins cluster 2 — D7 disk-boundary** (flows 12, 13, 14, 15, 19, 20, 26): everything crossing the disk/API/git/reconciliation boundary is simpler when the CRDT shape matches the disk shape.

**Non-obvious finding:** the D7 cluster is INDEPENDENT of D3. Even if source-mode CM were dropped (A10 refuted), Y.Text-canonical still wins on ~6 disk-boundary flows vs Y.XML. Conversely, if source-mode were kept AND tree-level 3-way merge turned out tractable (A11 refuted by research), Y.XML-canonical would lose only D3 — still fatal, but by one dimension instead of two.

**Research commissions from this matrix:**
- `reports/concurrent-mark-prop-crdt-semantics/` — quantifies the severity of Y.Text's losses on flows 1, 7 (A2 verification).
- `reports/tree-level-three-way-merge-prior-art/` — verifies or refutes A11 (tree 3-way is unsolved). If refuted, flows 12/26 become ties and D7 narrows.

---

### 11.5 Page-render-optimization spec (shipped)

**Status:** Shipped, precedent #18 (Activity + Suspense + `use(promise)`).

**Interplay:** stays. Precedent #18 is React-side; orthogonal to CRDT.

---

## 12) Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **No production precedent for the pattern** — pioneer risk, unknown-unknowns in edge cases we haven't modeled | Medium-High | Medium | Prototype spike is a hard gate (§8 sequencing step 3), not optional. Extended validation period before cutover. Accept that some design decisions (mark-aware emitter per §4 NOT UNLESS) may need to be invented rather than copied. |
| `diffPMDocs` algorithm proves intractable at large doc sizes | Medium | High | Spike prototype measures worst-case. Fallback: full-tree-replace for large docs (worse UX but correct). Reference implementation: y-prosemirror's `updateYFragment` in reverse direction — proven at scale, just re-oriented. |
| IME composition deferral introduces visible lag during non-latin input | Medium | Medium | CJK user testing during spike. Prior art: y-prosemirror has same concern and solves it. |
| Undo semantics diverge from user expectation (PM tree-level undo vs Y.Text op undo) | Medium | Medium | Y.UndoManager tracks ops by origin; binding origin groups logically. User testing. |
| Concurrent mark composition produces visible artifacts (mismatched `**`) | Low-Medium | Low | Mitigation = semantic mark-aware emitter (§4 NOT UNLESS). Character-level is acceptable for usual cases; escape hatch exists if pain emerges. |
| Component Blocks v2's bridgeId churns under `diffPMDocs` | Low | Medium | Spike tests nested-compound-component (Tabs > Tab) survivability. Fallback: content-addressing via hash of component name + sourceRaw. |
| Test surface shrinks too fast (delete bridge tests before binding tests prove equivalent) | Medium | Medium | Parallel-run old and new tests during cutover. Delete only after binding tests cover the same invariants. |
| Cross-view cursor translation introduces visible jitter | Low | Low | Debounce awareness updates; use approximate positions for non-focused users. |
| Hocuspocus features (openDirectConnection, broadcastStateless) have unexpected interactions | Low | Low | Integration tests cover server-side paths. |
| Migration creates a Yjs-13-forever commitment (if Yjs 13 EOL'd before text-only stabilizes) | Low | Low | Yjs 14 path stays available; migration ceases to be urgent under text-only (only one type; unification motivation dissolves). |
| Rust engine delivery slips, blocks this work | Low-Medium | Medium | Text-only is months-later regardless; Rust engine slip just pushes timeline. Not a cliff. |

---

## 13) Tactical side finding — NOT a story, separate issue

During this exploration we discovered:

**`patches/y-prosemirror@1.3.7.patch` doesn't cover `@tiptap/y-tiptap`.** Our actual production code imports from `@tiptap/y-tiptap@3.0.3` — a vendored fork of y-prosemirror (2,250 LOC single file at `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js`) containing the destructive-delete failure mode at lines 862 and 897, UNPATCHED. Our R13/precedent #9 safety net is currently bypassed in production.

Evidence: `reports/yjs-14-ecosystem-adoption/evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md` finding #3.

This is:
- An **active production bug** (schema-narrowing failures produce CRDT-permanent multi-peer deletes that should instead be R13-substituted into rawMdxFallback)
- **Fixable on Yjs 13 today** (patch `@tiptap/y-tiptap` directly, or vendor our own y-prosemirror with the patch, or change the import path so our existing patch applies)
- **Independent of this story** — fix it regardless of the text-only migration decision

Recommended: file a separate GitHub issue or PR. Not in scope for this story. If we ship text-only, the patch becomes irrelevant (we replace `@tiptap/y-tiptap` entirely). Until then, the safety net should actually cover production.

---

## 14) Evidence trail

All architectural claims in this story are anchored to source-traced research in these reports:

### Reports (read these before graduating to /spec)

- **[reports/yjs-14-ecosystem-adoption/REPORT.md](../../reports/yjs-14-ecosystem-adoption/REPORT.md)** — Yjs 14 + `@y/*` ecosystem not viable for this product. 7 evidence files + 1 audit pass + 3 Path C follow-ups (wire-format interop empirical harness, BlockNote adoption tracker, Loro CodeMirror tree-aware check). Sharp finding: 0 of ~60 production users on v14; ecosystem structurally incompatible with Hocuspocus/TipTap at the import layer.
- **[reports/peritext-on-yjs-feasibility/REPORT.md](../../reports/peritext-on-yjs-feasibility/REPORT.md)** — original Peritext-on-Yjs feasibility + 2026-04-16 refresh + Loro codemirror gap check. Finding: dual-view binding gap is ecosystem-universal.
- **[reports/three-way-merge-content-preservation/REPORT.md](../../reports/three-way-merge-content-preservation/REPORT.md)** — Khanna-Kunal-Pierce 2007 impossibility. Formal foundation for why state-based merge has academic limits.
- **[reports/yjs-transaction-settlement-hooks/REPORT.md](../../reports/yjs-transaction-settlement-hooks/REPORT.md)** — `afterAllTransactions` semantics (relevant to bridge-correctness Bucket B; preserved under text-only).
- **[reports/loro-ecosystem-readiness-assessment/REPORT.md](../../reports/loro-ecosystem-readiness-assessment/REPORT.md)** — Loro not production-ready; WASM size blocker; dual-view gap.
- **[reports/automerge-prosemirror-migration-assessment/REPORT.md](../../reports/automerge-prosemirror-migration-assessment/REPORT.md)** — Automerge alternative analysis.
- **[reports/crdt-observer-bridge-latency-analysis/REPORT.md](../../reports/crdt-observer-bridge-latency-analysis/REPORT.md)** — dual-structure pattern is unique in Yjs ecosystem; identified as root cause of non-linear latency.
- **[reports/mdast-prosemirror-bridge-source-comparison/REPORT.md](../../reports/mdast-prosemirror-bridge-source-comparison/REPORT.md)** — mdast↔PM bridge library comparison (informs what stays JS per Option B).
- **[reports/concurrent-mark-prop-crdt-semantics/REPORT.md](../../reports/concurrent-mark-prop-crdt-semantics/REPORT.md)** — 12-dimensional survey (Notion, Linear, Google Docs, Figma, Confluence, y-prosemirror, Quill, Diamond-types, Peritext, Obsidian, HedgeDoc, academic). Key finding: char-RGA on serialized markdown ships in HedgeDoc 2 + Obsidian Relay; zero commercial editors ship it; Peritext Example 3 artifact is structurally unavoidable but rare in low-concurrency workloads. Commissioned 2026-04-17 for A2/A2b verification.
- **[reports/tree-level-three-way-merge-prior-art/REPORT.md](../../reports/tree-level-three-way-merge-prior-art/REPORT.md)** — 10-dimensional survey (Git, Automerge, y-prosemirror, Loro, Yjs ecosystem, Milkdown, academic, industry editors, git-backed markdown editors, KKP 2007 applicability). Key finding: zero production CRDT editors implement tree-level 3-way against external non-CRDT state; serialize-merge-parse is universal fallback. Commissioned 2026-04-17 for A11 verification.

### Specs (cross-referenced)

- **[specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md](../../specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md)** — hard prerequisite for this story's graduation.
- **[specs/2026-04-14-component-blocks-v2/SPEC.md](../../specs/2026-04-14-component-blocks-v2/SPEC.md)** — architectural alignment (γ pattern is markdown-canonical; survives migration).
- **[specs/2026-04-16-bridge-correctness/SPEC.md](../../specs/2026-04-16-bridge-correctness/SPEC.md)** — short-term bridge work; D4 evidence trail points here.
- **[specs/2026-04-15-lossless-bridge-merge/](../../specs/2026-04-15-lossless-bridge-merge/)** — prior bridge iteration; superseded by bridge-correctness.
- **[specs/2026-04-15-server-authoritative-observer-bridge/](../../specs/2026-04-15-server-authoritative-observer-bridge/)** — prior bridge iteration; established precedent #14.
- **[specs/2026-04-14-bridge-convergence-under-concurrent-writes/](../../specs/2026-04-14-bridge-convergence-under-concurrent-writes/)** — prior bridge iteration.

### Key architectural anchors in CLAUDE.md (as of baseline `432a834b`)

- **Precedents #11, #12, #13, #14** — all bridge-specific; superseded under text-only migration
- **Precedent #9** — schema add-only forever; preserved (still load-bearing for ProseMirror)
- **Precedent #10** — opaque-but-content-bearing nodes for Y.Item identity; preserved (still applies to NodeViews)
- **Precedent #18** — Activity + Suspense + `use(promise)`; preserved (React-side, orthogonal)
- **Precedent #19** — clipboard mdast-canonical; preserved (hub is CRDT-agnostic)
- **Precedent #22** — direct PM dispatch for nested editors; preserved + strengthened

### External precedent

- **No direct production precedent found** for dual-view (PM WYSIWYG + CM source) markdown editor on a single Y.Text CRDT. Verified 2026-04-17:
  - **Milkdown** (`https://milkdown.dev`) — source-checked at `packages/plugins/plugin-collab/src/collab-service.ts` (2026-04-17): uses `doc.getXmlFragment('prosemirror')` + y-prosemirror's `ySyncPlugin` — **tree-canonical Y.XmlFragment, NOT Y.Text**. Milkdown is markdown-canonical at the PRODUCT layer (markdown is the document format) but uses the ecosystem-standard tree-canonical CRDT pattern. Milkdown is also single-editor (PM only, no CM source-mode companion), so their architecture doesn't face our dual-view requirement.
  - **TipTap.io editor, Linear, Notion, GitBook** — all PM-based, tree-canonical, single-editor.
  - **Obsidian** — dual-view (Live Preview + Source) but ALL CodeMirror, not PM+CM; own sync engine, not Yjs.
  - **HedgeDoc/CodiMD** — CM source + HTML preview, not PM WYSIWYG editor.
  - **BlockSuite/AFFiNE** — block-level Y.Text (per-block CRDT), not whole-document Y.Text; different architecture entirely.
- **Indirect precedent** — y-prosemirror's `updateYFragment` algorithm is load-bearing prior art for the binding's `diffPMDocs` function (same algorithm, applied in reverse direction). That algorithm is proven at scale. This story's novelty is not the diff algorithm — it's the "PM projects from Y.Text, not the other way around" architectural inversion.
- **The absence of precedent means:** (a) the prototype spike (§8 Sequencing step 3) is a hard gate, not optional; (b) early telemetry on binding correctness matters; (c) at least one design decision (concurrent-prop-edit mark-aware emitter per §4 NOT UNLESS) may need to be invented rather than copied.

---

## 15) Graduation criteria (when to move from story to /spec)

Graduate this story to `/spec` when ALL of the following are true:

1. **Rust markdown engine is in production.** Parse/serialize targets met per its AC.
2. **Bridge-correctness spec has shipped** with Bucket A telemetry accumulating ≥4 weeks of production data.
3. **Bucket A telemetry is interpretable.** Either: (a) rate is low enough that text-only is architectural polish (still valuable; proceed with graduation but deprioritize scope), or (b) rate is high enough that text-only is the structural fix (graduation is urgent).
4. **Component Blocks v2's post-#165 follow-up has shipped** (I13-I17 tests + PF01-PF02). Ensures text-only doesn't land on a partially-tested baseline.
5. **Yjs 13 still maintained** at graduation time. Check `yjs` release cadence; check that v13.6.x security-line is still supported.
6. **Prototype spike on `diffPMDocs` has run** and validated A1 (the core algorithm is tractable).
7. **Engineering capacity available** for an 8-10 week focused effort.

When 1-7 align: this story graduates. The /spec's Phase 0 is the prototype spike's continuation; Phase 1-N is the full cutover.

---

## Changelog

**2026-04-17 — Story seed written.** Captures architectural direction after a multi-hour exploration session spanning Yjs 14 ecosystem research, Peritext on Yjs feasibility refresh, Loro feasibility check, dual-view binding analysis, CodeMirror-only alternative analysis, Component Blocks v2 interplay analysis, and PM-over-Y.Text architecture enumeration. All findings anchored in the 8 reports listed in §14. No commitments made; no resources allocated. Designed for graduation to `/spec` after prerequisites land.

**2026-04-17 — /stories refinement pass.** Applied critical-pass review via /stories skill against existing STORY.md content. Changes: (a) removed three instances of false "Milkdown ships this pattern in production" claim after source-verifying Milkdown's collab plugin uses `Y.XmlFragment` + y-prosemirror (tree-canonical), rewrote §14 External precedent with accurate verification trail, added pioneer-work risk to §12; (b) added explicit expiry dates to Assumptions A1-A9 and introduced A10 (dual-view product requirement); (c) strengthened A1 verification plan to include compound-component, prop-edit, IME, and paste scenarios; (d) added Last verified date + Novelty note to frontmatter; (e) sharpened two non-goal tags — `[NOT UNLESS infeasible]` → explicit triggers (Yjs 13 EOL OR spike reveals v14-only blocker); `[NOT NOW] Server-side observers` → `[NEVER under text-only architecture]` since the target removes the subject; (f) added new §4b Constraints section with C1-C10 grouped by kind (dependency / appetite / sequencing) plus explicit non-constraints; (g) added unified §10b Items table consolidating Decided (D1-D5) / Assumed (A1-A10) / Exploring (Q1-Q10) / Parked (P1-P4) / Constraints (C1, C5) per /stories extraction-protocol schema. No scope or decision changes; refinement pass strengthens the artifact for downstream /spec consumption without altering the architectural direction.
