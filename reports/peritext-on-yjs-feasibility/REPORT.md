---
title: "Peritext-on-Yjs Feasibility: Can the Peritext Rich Text Model Be Implemented on Y.Text with a ProseMirror Binding?"
description: "Deep source-code-level assessment of whether the Peritext rich text model (flat text + formatting annotations) can be implemented on top of Yjs's Y.Text type with a ProseMirror binding. Covers Y.Text formatting internals, block-level encoding, boundary semantics, void nodes, existing bindings, TipTap/Hocuspocus blast radius, and three implementation architectures with effort estimates."
createdAt: 2026-04-07
updatedAt: 2026-04-07
subjects:
  - Yjs
  - Peritext
  - ProseMirror
  - TipTap
  - Hocuspocus
  - Automerge
  - Loro
  - BlockSuite
  - AFFiNE
  - y-prosemirror
  - y-quill
topics:
  - Peritext CRDT rich text
  - Y.Text formatting internals
  - dual-view editor architecture
  - CRDT block-level structure
  - ProseMirror binding architecture
---

# Peritext-on-Yjs Feasibility: Can the Peritext Rich Text Model Be Implemented on Y.Text with a ProseMirror Binding?

**Purpose:** Determine whether the Peritext rich text model (flat text + formatting annotations) can be implemented on top of Yjs's Y.Text type, with a ProseMirror binding, enabling both WYSIWYG and raw markdown views on the same CRDT. The reader cares about: is this feasible, what are the specific technical barriers, and is the effort weeks or months?

---

## Executive Summary

The Peritext model on Yjs is feasible but splits into two distinct questions with different answers:

**Can you get the Peritext _behavior_ (dual WYSIWYG + source views on the same CRDT)? Yes, in weeks.** Yjs 14's refactored y-prosemirror operates through a generic delta protocol (toDeltaDeep() / applyDelta()) on a unified YType class -- the old hard boundary between Y.Text and Y.XmlFragment no longer exists at the type level. The entire sync stack (Hocuspocus, providers, cursors, undo) is type-agnostic. The blast radius for switching CRDT representations is limited to the editor binding layer alone.

**Can you get the Peritext _semantics_ (correct mark boundary expansion)? Not on Yjs today.** Yjs stores formatting as marker items (ContentFormat) in the CRDT sequence with no per-mark "expand before/after" flag. The Peritext paper explicitly identifies this as producing anomalous results during concurrent overlapping format operations. Neither Yjs 13 nor Yjs 14 implements Peritext's BoundaryPosition semantics. No peritext-yjs library exists. Kevin Jahns has not publicly committed to adding this.

**The practical verdict:** The boundary anomaly matters only for concurrent overlapping format operations (User A bolds chars 0-10 while User B bolds chars 5-15 simultaneously). For typical editing patterns -- including the AI agent co-editing use case where the agent writes to a different region -- the current Y.Text formatting works correctly. The dual-view architecture can be built in 2-4 weeks without full Peritext boundary semantics, and the product can ship while the edge cases remain a known limitation.

**Key Findings:**

- **Yjs 14 unified YType is the game-changer.** There is no longer a separate Y.Text class -- all types are YType<DeltaConf>. y-prosemirror operates through the generic delta interface. The type-system incompatibility that made the source-toggle problem intractable in Yjs 13 is architecturally resolved. **npm availability (verified 2026-04-07):** `yjs@14.0.0-16` (beta tag), `yjs@14.0.0-8` (next tag), `y-prosemirror@2.0.0-2` (pre-release). Stable latest remains `yjs@13.6.30`. **Ecosystem readiness caveat:** `@tiptap/y-tiptap` v3.0.2 and `@hocuspocus/server` v3.4.4 likely pin `yjs@^13` — peer dependency conflicts are expected when attempting to use v14 alongside the current TipTap/Hocuspocus stack. This is the primary practical barrier.
- **Three implementation architectures exist, ranging from 2 weeks to 10 weeks.** Architecture C (delta-protocol dual view) is 2-4 weeks and gives you dual-view behavior immediately. Architecture A (full Peritext with block markers) is 6-10 weeks and gives you the complete model.
- **Hocuspocus, providers, cursors, undo -- zero blast radius.** All sync infrastructure operates at the Y.Doc level, not the type level.
- **No one has built a Y.Text-to-ProseMirror binding.** The closest prior art is automerge-prosemirror (3,272 lines) which maps flat text + spans to ProseMirror's tree. y-quill (363 lines) maps Y.Text to Quill including block-level formatting via newline attributes.
- **BlockSuite/AFFiNE validates Y.Text for inline rich text in production.** Their @blocksuite/inline editor binds directly to Y.Text for inline formatting within blocks.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Y.Text formatting API as Peritext substrate | Deep | P0 |
| D2 | Block-level structure in Y.Text (y-quill prior art) | Deep | P0 |
| D3 | Existing Y.Text-to-ProseMirror bindings | Deep | P0 |
| D4 | Peritext reference implementation analysis | Deep | P0 |
| D5 | TipTap/Hocuspocus blast radius | Deep | P0 |
| D6 | Void node representation in Y.Text | Deep | P0 |
| D7 | Implementation effort estimate | Deep | P0 |

**Stance:** Factual with conclusions.
**Non-goals:** Implementing the binding, designing the ProseMirror schema, optimizing Hocuspocus performance, general TipTap architecture (covered by existing reports).

---

## Detailed Findings

### D1: Y.Text Formatting API as Peritext Substrate

**Finding: Y.Text formatting is structurally compatible with Peritext's mark model but lacks boundary semantics.**

**Evidence:** [evidence/ytext-formatting-api.md](evidence/ytext-formatting-api.md)

Yjs stores formatting as ContentFormat marker items in the CRDT sequence -- zero-length items with a key (e.g., "bold") and value (e.g., true or null). The format(index, length, attributes) method inserts markers before and after the target range. Two users bolding overlapping ranges produces correct results in the common case (non-concurrent or non-overlapping operations).

However, Yjs does not implement Peritext's per-mark boundary expansion semantics. In Peritext, each mark carries a flag specifying whether new text inserted at the boundary should inherit the mark (bold: yes at end, no at start; hyperlink: no at either end). Yjs's simpler model always inherits formatting from adjacent markers, which the Peritext paper explicitly identifies as producing anomalous results -- in extreme cases, causing the entire rest of the document to become bold after certain concurrent edit patterns.

Yjs 14 refactored all types to a unified YType<DeltaConf> class. The old hard distinction between Y.Text and Y.XmlFragment exists only in the delta configuration parameter, not as separate classes. This opens the door to a unified formatting model but does not itself add Peritext boundary semantics.

**Implications:**
- Y.Text formatting works correctly for all non-concurrent and most concurrent editing scenarios.
- The Peritext boundary anomaly is a known theoretical limitation, not a practical blocker for typical editing patterns.
- Adding ExpandMark semantics would require changes to Yjs's core CRDT (ContentFormat would need to encode boundary behavior). This is not on any public roadmap.

**Decision triggers:**
- If concurrent overlapping format operations are frequent, this anomaly becomes product-visible.
- If the product moves to Automerge or Loro, both have production Peritext implementations.

---

### D2: Block-Level Structure in Y.Text

**Finding: Block structure can be encoded in Y.Text via two proven approaches -- newline attributes (Quill model) or block markers (Automerge model).**

**Evidence:** [evidence/block-level-structure.md](evidence/block-level-structure.md)

**Quill/Delta approach (proven in production via y-quill):** Block formatting is encoded as attributes on the newline character that terminates each line. A heading is { insert: "Title\n", attributes: { header: 1 } }. This model is flat and simple but cannot represent arbitrary nesting.

**Automerge block marker approach (proven in production via automerge-prosemirror):** Block structure is encoded by inserting special marker objects into the text sequence. A marker { type: "ordered-list-item", parents: ["blockquote"], attrs: {} } establishes block structure with the parents array enabling unlimited nesting depth.

y-quill (363 lines) demonstrates the Quill approach in production. BlockSuite (AFFiNE) uses a hybrid: Y.Map tree for block hierarchy, Y.Text for inline content within each block.

**Implications:**
- For ProseMirror, the block marker approach is more suitable because ProseMirror natively supports arbitrary nesting.
- The binding layer must reconstruct ProseMirror's block tree from flat markers -- the same problem automerge-prosemirror's traversal.ts (1,016 lines) solves.

---

### D3: Existing Y.Text-to-ProseMirror Bindings

**Finding: No Y.Text-to-ProseMirror binding exists, but y-prosemirror v14's delta protocol makes the binding layer type-agnostic.**

**Evidence:** [evidence/existing-bindings.md](evidence/existing-bindings.md)

No library on npm, GitHub, or in academic literature binds ProseMirror to Y.Text. All existing ProseMirror bindings use Y.XmlFragment.

However, y-prosemirror v14 has been fundamentally refactored. The sync plugin now operates exclusively through toDeltaDeep(), applyDelta(), and observeDeep() -- all methods on the base YType class. The delta format supports named children, attributes, text content, and formatting.

The closest architectural reference is automerge-prosemirror (3,272 lines), which solves the exact problem of mapping flat text + spans + block markers to ProseMirror's nested node tree.

**Implications:**
- y-prosemirror v14 may already work with a non-XmlFragment YType. This needs empirical validation.
- If the delta protocol is truly type-agnostic, the effort drops to modifications rather than a rewrite.

---

### D4: Peritext Reference Implementation

**Finding: The Peritext reference implementation uses a custom CRDT (Micromerge), not Yjs. No peritext-yjs library exists.**

**Evidence:** [evidence/peritext-reference.md](evidence/peritext-reference.md)

The inkandswitch/peritext reference implementation is built on Micromerge -- a simplified, purpose-built CRDT. It includes a proof-of-concept ProseMirror bridge. Automerge 2.2 adopted Peritext with an ExpandMark enum. Loro also implements Peritext+Fugue. Neither is built on Yjs.

No one has ported Peritext boundary semantics to Yjs. Kevin Jahns has not publicly commented on adding this capability.

---

### D5: TipTap/Hocuspocus Blast Radius

**Finding: Zero blast radius to the sync stack. Only the editor binding layer is affected.**

**Evidence:** [evidence/tiptap-hocuspocus-blast-radius.md](evidence/tiptap-hocuspocus-blast-radius.md)

| Component | Impact | Changes needed |
|-----------|--------|----------------|
| Hocuspocus server | None | None -- syncs Y.Doc, not types |
| @hocuspocus/provider | None | Transport only |
| y-websocket protocol | None | Binary protocol on Y.Doc |
| y-prosemirror sync plugin | Low | Already uses generic YType delta |
| y-prosemirror cursor plugin | None | Uses RelativePosition (type-agnostic) |
| y-prosemirror undo | None | UndoManager accepts any YType |
| @tiptap/extension-collaboration | Low | One line: type creation |
| ProseMirror schema | Medium | Block-from-flat reconstruction |
| **Editor binding layer** | **High** | **Core of new work** |

---

### D6: Void Node Representation in Y.Text

**Finding: Y.Text supports embedded objects (ContentEmbed) for void nodes, with two mechanisms.**

**Evidence:** [evidence/void-nodes.md](evidence/void-nodes.md)

ContentEmbed stores an arbitrary JSON object occupying 1 position. ContentType (Y.XmlElement inside Y.Text) provides a full sub-CRDT for complex embeds. For JSX void nodes, ContentEmbed with JSON payload is sufficient.

---

### D7: Implementation Effort Estimate

**Finding: Three architectures exist -- 2-4 weeks (pragmatic), 2-4 weeks (hybrid), or 6-10 weeks (full Peritext).**

**Evidence:** [evidence/implementation-effort.md](evidence/implementation-effort.md)

#### Architecture A: Full Peritext Model (6-10 weeks)
Single flat Y.Text with formatting marks and block markers. ProseMirror tree reconstructed from spans. Estimated 2,000-3,300 lines. This is a rewrite of y-prosemirror. Reference: automerge-prosemirror is 3,272 lines.

Milestones: M1: Inline formatting (weeks 1-3) -> M2: Block structure (weeks 3-6) -> M3: Void nodes (weeks 6-7) -> M4: Tables (weeks 7-9) -> M5: Dual-view integration (weeks 9-10).

#### Architecture B: Hybrid (2-4 weeks)
Use Yjs 14's unified YType with recursive delta format. Block structure uses named child types, inline content uses formatting attributes. Estimated 400-900 lines of modifications.

#### Architecture C: Delta-Protocol Dual View (2-4 weeks)
Use y-prosemirror v14 as-is. Add serialization layer for source view. Estimated 500-1,000 lines. This is the serialize-on-toggle approach enabled by the delta protocol. Source view is non-collaborative.

---

## Recommendation

The three architectures form a progression, not a choice:

1. **Ship Architecture C now (2-4 weeks).** Dual-view toggle with non-collaborative source view. Same trade-off as Option I from the source-toggle report, but cleaner via the delta protocol.

2. **Spike Architecture B in parallel (1 week spike).** Test whether y-prosemirror v14 works with a flat YType. If yes, unlocks collaborative source editing with minimal code.

3. **Evaluate Architecture A only if boundary anomaly becomes product-visible.** Full Peritext semantics require modifying Yjs core. 6-10 week investment justified only by measured product pain.

**The answer: Peritext-style dual-view behavior on Yjs is feasible in weeks (2-4). Full Peritext boundary semantics are not feasible without modifying Yjs core -- but they are likely unnecessary for the product use case.**

---

## 2026-04-16 Refresh — Source-Verified Update (Path C)

**Context.** This section refreshes the original 2026-04-07 findings with source-traced evidence captured today. Four parallel Opus subagents verified npm registry state, GitHub source code, and ecosystem signals. Two prior-report claims are sharpened, two are materially refuted, and one entirely new finding reframes the practical adoption path.

**Evidence files:** `evidence/refresh-2026-04-16-yjs14-ecosystem.md`, `evidence/refresh-2026-04-16-bindings-architecture-c.md`, `evidence/refresh-2026-04-16-peritext-implementations.md`, `evidence/refresh-2026-04-16-adjacent-crdts-and-server-alternatives.md`.

### What changed since 2026-04-07

#### NEW — `@y/*` npm scope rebrand (the missing piece)

**The single biggest fact this refresh surfaces, missed entirely by the prior report.** Yjs 14's active publish stream lives on a new npm scope — `@y/*` — not on the legacy `yjs` package. Confirmed via npm registry probes (2026-04-16):

| New package | Version | Peer-deps |
|---|---|---|
| `@y/y` | `14.0.0-rc.13` (2026-04-14) | engines: Node ≥22 |
| `@y/prosemirror` | `2.0.0-2` (2025-12-16) | `@y/y@^14.0.0-rc.13` |
| `@y/codemirror` | `0.0.0-3` | `@y/y@^14.0.0-22` (older scheme — peer mismatch with prosemirror v2 today) |
| `@y/websocket` | `4.0.0-rc.2` (2026-04-15) | `@y/y@^14.0.0-6` |
| `@y/protocols` | `1.0.6-rc.1` (2026-02-13) | `yjs: 14.0.0-* \|\| ^14` |

Source: `src/index.js` of `@y/y` includes a runtime guard `__$YJS14$__` confirming this is the v14 source tree. Engines field requires Node ≥22.

**Reframing implication:** "Adopt Yjs 14" is NOT "wait for Hocuspocus + TipTap to bump their `yjs@^13` peer-deps." It IS "switch from `Hocuspocus + @tiptap/y-tiptap + y-codemirror.next` to `@y/websocket + @y/prosemirror + @y/codemirror`." That's a bigger architectural decision than the prior report framed it as — but it is *unblocked at the package level today*.

#### REFUTED — "@tiptap/y-tiptap and Hocuspocus likely pin yjs ^13 — peer dep conflicts expected"

Prior report flagged peer-dep pinning as the practical barrier. Verified today:

- **`@hocuspocus/server@4.0.0-rc.5` published 2026-04-16 (TODAY)** — STILL pins `yjs: ^13.6.8` and `lib0: ^0.2.47`. The v4 RC release notes mention Yjs 14 nowhere; v4 is a runtime-modernization release (cross-runtime via `crossws`, structured transaction origins), not a Yjs 14 migration. Zero PRs or issues mention Yjs 14 migration.
- **`@tiptap/y-tiptap@3.0.3` published 2026-04-08 (8 days ago)** — STILL pins `yjs: ^13.5.38`. If TipTap intended to migrate, this fresh release would have been the natural moment. They didn't.
- **`@tiptap/extension-collaboration@3.22.3`** pins `yjs: ^13`. **`@tiptap/extension-collaboration-cursor`** still on v2.26.2 (deprecated → caret).

**The refutation:** prior framed peer-dep pinning as "the primary practical barrier" implying "wait for them to fix it." Today's evidence: they're not fixing it — they're shipping new releases on Yjs 13. The practical barrier is REAL but the solution isn't waiting; it's switching to `@y/*`.

**Forking-Hocuspocus alternative (cross-cutting finding from D13):** verified across npm — y-websocket@3.0.0, y-partykit@0.0.33, @liveblocks/yjs@3.18.2, @lexical/yjs@0.43.0, @platejs/yjs@52.3.10 ALL pin yjs@^13.x. The Yjs ecosystem cliff is fleet-wide. **`openDirectConnection` is load-bearing** for our server-authoritative architecture (`setupServerObservers` and `applyAgentMarkdownWrite` depend on it) — y-partykit covers ~half the lifecycle hooks; y-sweet is intentionally less extensible; Liveblocks is SaaS-only; bare y-websocket lacks the lifecycle. **Forking Hocuspocus to bump yjs peerDep (1-2 days + retest) is strictly cheaper than swapping server libraries** — IF you stay on the `yjs` legacy package. Switching to `@y/websocket` is a different shape entirely.

#### CONFIRMED + SHARPENED — Unified `YType<DConf>` is real

Prior claim ("there is no longer a separate Y.Text class — all types are YType<DeltaConf>") is **structurally correct** with one cosmetic correction:
- The class is `YType<DConf>` where `DConf extends delta.DeltaConf` (not `YType<DeltaConf>` as prior report wrote).
- Source: `@y/y/src/ytype.js` defines a single `export class YType`. `@y/y/src/index.js:23` exports ONLY `YType as Type` — no YText/YMap/YArray/YXmlFragment exports anywhere.
- The same instance has BOTH `_map` (KV/tree storage) AND `_start` (sequence/text linked-list head), and exposes BOTH method families: `insert/format/push/slice/get` (sequence) AND `deleteAttr` + module-level `typeMapSet/typeMapGet` (map).
- `Doc.get(key, name)` replaces `getText/getXmlFragment/getArray/getMap` — the `name` parameter discriminates the delta-schema flavor.
- `applyDelta(d, am)` accepts a generic `delta.Delta<DC>`, dispatching to internal storage via the unified delta.

**A single YType instance can structurally serve both flat-sequence and tree-structured projections.** This is real, not a typing convenience.

#### REFUTED — "Architecture C (delta-protocol dual view) ships in 2-4 weeks"

Prior report's flagship claim. Materially optimistic given today's evidence:

- **No public dual-view binding exists.** Not in demos, not in `@y/prosemirror` issues, not in lib0 examples. The `lib0/src/delta/binding.js` `Binding<DeltaA, DeltaB>` primitive exists but ships with `// @ts-nocheck` and multiple `@todo` markers. **The first user in production will be doing original work.**
- **Schema gap is load-bearing.** `@y/prosemirror@2.0.0-2` uses `$prosemirrorDelta = delta.$delta({ name: s.$string, attrs: ..., text: true, recursiveChildren: true })` (tree). `@y/codemirror@0.0.0-3` `YSyncConfig` constructor takes `Y.Type<{ text: true }>` — and at `y-sync.js:209` does a hard cast `/** @type {string} */ (op.insert)` — **it CANNOT consume a tree delta**. Two shapes to bridge:
  - Shape 1 — custom CM-from-tree fork with a tree→string flattener
  - Shape 2 — two YTypes + lib0 Binding + transformer (which is morally what we have today, just relocated to a different layer)
- **Pre-release churn risk.** `@y/y@14.0.0-rc.13` published 2026-04-14 (yesterday). Peer mismatch today between `@y/prosemirror` (peers rc.13) and `@y/codemirror` (peers older `^14.0.0-22` scheme). `syncPlugin` v2 re-runs full `d.diff(ycontent, pcontent)` on every PM transaction — commented-out `appendTransaction` block signals in-flight optimization work.

**Sharpened framing:**
- Architecture C is **architecturally sound** (HIGH confidence).
- Architecture C is **buildable as a SPIKE in 2-4 weeks** (MEDIUM confidence).
- Architecture C is **NOT buildable in 2-4 weeks as a production-grade replacement for the current bridge with all existing invariants intact** (HIGH confidence against this).

#### CONFIRMED + UNADDRESSED — Boundary anomaly persists in Yjs 14

- **Yjs v14 has not added per-mark expand semantics.** Source-verified: `src/structs/Item.js` line 1093+ `ContentFormat` is byte-identical to v13.6.30's — only `key` + `value`, zero `expand` field. v14's restructure into `ytype.js` did NOT touch formatting semantics.
- **Zero PRs and zero issues in `yjs/yjs` mention "peritext".** Issue #291 (canonical reproducer) still open since April 2021.
- For markdown editor use case (rich-text formatting uncommon, agent writes go through `applyAgentMarkdownWrite` at markdown-level not at format-mark-level), the anomaly is unlikely to bite.
- **Loro DOES solve it** via documented `configTextStyle({ <mark>: { expand: 'before'|'after'|'both'|'none' } })` API — mirrors Automerge 2.2's ExpandMark.

#### CONFIRMED — Zero production users on Yjs 14

Verified package.json forensics on production Yjs editors:
- AFFiNE: `yjs@13.6.21` (patched)
- BlockSuite: `yjs@^13.6.18`
- Outline: `yjs@^13.6.30`
- Hocuspocus self: `yjs@^13.6.8`

**Zero production users on Yjs 14 identified.** Strongest negative signal: TipTap's freshest release (8 days ago) chose to stay on Yjs 13.

### NEW dimension — Loro now concretely competitive

Prior report touched Loro briefly via the `loro-ecosystem-readiness-assessment` cross-reference. Refreshed today:

- **`loro-prosemirror@0.4.3`** (Feb 2026) provides `LoroSyncPlugin` + `LoroUndoPlugin` + `LoroEphemeralCursorPlugin` — full parity with y-prosemirror's plugin model.
- **Loro has correct Peritext semantics** — solves the boundary anomaly Yjs 14 doesn't.
- **Pre-1.0 with active data-loss issue #77** from 2026-03-28 — material risk. Failure shape is an `init()`-race in `LoroSyncPlugin` (empty-mapping + early `docChanged` → all Loro content replaced with default empty PM doc), not a dual-view / tree-flat bug. See [evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md](evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md).
- **No canonical Loro server** — would have to build server-authoritative document-lifecycle from scratch (no `openDirectConnection` equivalent).
- **No Loro CodeMirror binding for dual-view — structurally confirmed 2026-04-16.** Source trace: `loro-codemirror@0.3.3` binds exclusively to `LoroText` (`utils.ts:6-8`), filters non-text diffs at observer entry (`sync.ts:64`: `if (diff.type !== "text") return`), and the sibling `loro-prosemirror@0.4.3` requires a disjoint `LoroMap<{nodeName, attributes, children: LoroList}>` shape (`lib.ts:19-37`) that `loro-codemirror` cannot consume. Same "bridge problem relocates" outcome as `@y/*`. SchoolAI's `loro-extended` wrapper (53⭐) has not built a tree-aware CM binding either. See [evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md](evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md).

**One more option in the field, with a different cost shape: better semantics + worse server tooling vs Yjs 14's mediocre semantics + (relatively) better tooling.** The dual-view binding gap is ecosystem-universal — not a Yjs-specific deficit — so the CRDT choice does not determine whether dual-view is solvable. Only greenfield binding work does.

### NEW dimension — MDX-on-Peritext is greenfield

- **No production MDX-Peritext editor exists in 2026.** MDX-Editor (mdxeditor.dev) uses Lexical 0.35.0 with no CRDT — single-user. BlockSuite/AFFiNE uses Y.Text-per-block (Yjs delta format, not Peritext) — no MDX semantics. Loro has Peritext + ProseMirror binding but no MDX-aware production user.
- **The architectural sketch is plausible but unvalidated.** Loro Rich Text + custom container types for void MDX nodes is the closest path. No reference implementation.
- **Open Knowledge has a moat opportunity** — gluing MDX semantics + Peritext CRDT semantics has no published prior art.

### Adjacent CRDTs ruled out

| CRDT | Status | Why ruled out |
|---|---|---|
| Diamond Types | Research-grade plain-text only | "Doesn't support … editor bindings" per Joseph Gentle |
| Cola | Plain-text Rust | No JS bindings published |
| y-octo | Production-grade YATA Rust impl (AFFiNE Cloud + Electron) | Yjs binary protocol compat — does NOT add Peritext. Performance/native story, not semantic upgrade. No npm package |
| Earthstar | Distributed sync | Wrong category (document database) |
| Tribles | Knowledge graph | Wrong category |

### Net practical implication

The prior report's strategic recommendation ("Architecture C in 2-4 weeks") **survives the framing change** but with materially different costs:

- **The package switch is bigger than implied.** `Hocuspocus + @tiptap/y-tiptap + y-codemirror.next` → `@y/websocket + @y/prosemirror + @y/codemirror` is a whole-stack swap, not a peer-dep bump.
- **2-4 weeks is the SPIKE estimate, not the production estimate.** No public dual-view dual-editor binding exists; this would be original work.
- **Pre-release churn is fresh.** `@y/y@rc.13` is yesterday's release; peer-dep mismatches between `@y/prosemirror` and `@y/codemirror` exist TODAY.
- **The Hocuspocus alternative is now: stay on `yjs@13` + fork to bump peerDep (1-2 days)** — but this gives up Yjs 14's unification entirely.
- **Loro is genuinely competitive** for the Peritext-correctness axis; weaker for the production-server axis.

The decision shape is:
- **Architecture C TODAY:** spike on `@y/*` stack, accept original-binding-work risk, accept rc churn. Zero production users to copy from.
- **Wait 6-12 months:** ecosystem stabilizes, production users appear, churn reduces.
- **Loro path:** swap entire CRDT, get correct Peritext semantics, build server tooling.
- **Stay on Yjs 13:** the dual-CRDT bridge is well-understood; correctness can be improved within the current architecture (per the active `bridge-correctness` spec).

---

## Limitations & Open Questions

### Not Fully Confirmed
- Whether y-prosemirror v14's delta protocol actually works when given a flat YType (no named children) -- requires empirical testing
- Whether Yjs 14's unified YType is stable enough for production (currently RC)
- Whether the boundary anomaly manifests in realistic editing patterns

### Out of Scope
- Designing the ProseMirror schema for the product
- MDX-specific round-trip fidelity (covered by mdx-crdt-roundtrip-fidelity report)
- Branch switching / context switching (covered by crdt-branching-namespacing-prior-art report)
- General TipTap/Hocuspocus architecture (covered by source-toggle-architecture report)

---

## References

### Evidence Files
- [evidence/ytext-formatting-api.md](evidence/ytext-formatting-api.md) -- Y.Text formatting internals, ContentFormat, boundary semantics
- [evidence/block-level-structure.md](evidence/block-level-structure.md) -- Quill Delta model, Automerge block markers, BlockSuite
- [evidence/existing-bindings.md](evidence/existing-bindings.md) -- y-prosemirror v14 delta protocol, automerge-prosemirror reference
- [evidence/peritext-reference.md](evidence/peritext-reference.md) -- Micromerge implementation, BoundaryPosition, ExpandMark
- [evidence/tiptap-hocuspocus-blast-radius.md](evidence/tiptap-hocuspocus-blast-radius.md) -- Component-by-component blast radius
- [evidence/void-nodes.md](evidence/void-nodes.md) -- ContentEmbed, ContentType, void nodes
- [evidence/implementation-effort.md](evidence/implementation-effort.md) -- Three architecture estimates
- [evidence/refresh-2026-04-16-yjs14-ecosystem.md](evidence/refresh-2026-04-16-yjs14-ecosystem.md) -- Yjs 14 RC.13 status, @y/* npm rebrand, Hocuspocus 4.0.0-rc.5 still pinning yjs@^13
- [evidence/refresh-2026-04-16-bindings-architecture-c.md](evidence/refresh-2026-04-16-bindings-architecture-c.md) -- @y/prosemirror v2 + @y/codemirror source-trace; Architecture C dual-view gap
- [evidence/refresh-2026-04-16-peritext-implementations.md](evidence/refresh-2026-04-16-peritext-implementations.md) -- Yjs 14 ContentFormat unchanged; Loro is only TipTap-compatible Peritext binding shipping today
- [evidence/refresh-2026-04-16-adjacent-crdts-and-server-alternatives.md](evidence/refresh-2026-04-16-adjacent-crdts-and-server-alternatives.md) -- Diamond Types/Cola/y-octo/Loro/Hocuspocus alternatives mapped
- [evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md](evidence/refresh-2026-04-16-loro-codemirror-tree-aware-check.md) -- Loro CodeMirror binding is flat-string-only (same limitation as `@y/codemirror`); dual-view binding gap is ecosystem-universal, not Yjs-specific. Cross-report: shared with `reports/yjs-14-ecosystem-adoption` D3

### External Sources
- [Peritext: A CRDT for Rich-Text Collaboration](https://www.inkandswitch.com/peritext/)
- [Automerge 2.2: Rich Text](https://automerge.org/blog/rich-text/)
- [Automerge Rich Text Schema](https://automerge.org/docs/reference/under-the-hood/rich-text-schema/)
- [Loro CRDT-richtext](https://loro.dev/blog/crdt-richtext)
- [Yjs GitHub (v14 RC)](https://github.com/yjs/yjs)
- [y-prosemirror GitHub](https://github.com/yjs/y-prosemirror)
- [y-quill GitHub](https://github.com/yjs/y-quill)
- [automerge-prosemirror GitHub](https://github.com/automerge/automerge-prosemirror)
- [inkandswitch/peritext GitHub](https://github.com/inkandswitch/peritext)
- [BlockSuite Document-Centric Architecture](https://block-suite.com/blog/document-centric.html)
- [Yjs Issue #291](https://github.com/yjs/yjs/issues/291)

### Related Research
- source-toggle-architecture -- 9 architectures for WYSIWYG/source toggle
- mdx-crdt-roundtrip-fidelity -- MDX round-trip through CRDT editors
- crdt-branching-namespacing-prior-art -- CRDT branching and document switching
- source-of-truth-persistence-collaboration -- collaboration architecture deep dive
