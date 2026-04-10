---
title: "Source Toggle Architecture: WYSIWYG ↔ Raw Markdown in a TipTap + Yjs CRDT Editor"
description: "Complete technical assessment of all viable architectures for a source toggle (WYSIWYG ↔ raw markdown) in a TipTap + Yjs CRDT editor. Evaluates 9 options across collaboration, agent visibility, performance, and round-trip fidelity. Recommends serialize-on-toggle with awareness-based mode locking."
createdAt: 2026-04-07
updatedAt: 2026-04-07
subjects:
  - Yjs
  - TipTap
  - ProseMirror
  - CodeMirror 6
  - y-prosemirror
  - y-codemirror.next
  - Hocuspocus
  - Obsidian
  - AFFiNE
  - Automerge
  - Peritext
topics:
  - source toggle architecture
  - CRDT dual representation
  - collaborative markdown editing
  - editor mode switching
---

# Source Toggle Architecture: WYSIWYG ↔ Raw Markdown in a TipTap + Yjs CRDT Editor

**Purpose:** Determine all viable architectures for switching between a WYSIWYG editor (TipTap via y-prosemirror binding to Y.XmlFragment) and a raw markdown source view (CodeMirror 6) backed by the same Yjs CRDT document. The reader cares about: which approaches are technically feasible, what product constraints each creates (especially for AI agent co-editing), and what the spike should validate.

---

## Executive Summary

We investigated 9 architectures for implementing a WYSIWYG ↔ raw markdown source toggle in a TipTap + Yjs editor. The core constraint is a type-system incompatibility: y-prosemirror binds to `Y.XmlFragment` (structured tree), y-codemirror.next binds to `Y.Text` (flat string). These are incompatible Yjs shared types — they cannot share the same CRDT key. No built-in bridge, computed type mechanism, or ecosystem solution exists or is on any roadmap.

Only 3 of the 9 options are viable for a shipping product:

- **Option A (Serialize-on-toggle):** Convert between formats on each toggle. Simple, bounded risk. Source view is non-collaborative.
- **Option B (Dual keys + observer sync):** Maintain both Y.XmlFragment and Y.Text with bidirectional conversion on every keystroke. Source view is collaborative. But continuous round-trip fidelity is the fundamental unsolved problem — no production system has achieved this.
- **Option I (Toggle-with-lock):** Option A plus awareness-protocol mode locking. One user in source mode at a time, others notified. Eliminates the concurrent-mode problem entirely.

**Recommendation: Option I (Toggle-with-lock) for P0. The spike validates the serialize-on-toggle core (Option A's mechanism) AND the awareness lock pause/resume pattern (Option I's extension). Ship Option I as the P0 architecture.** Option I extends A with ~50 lines of awareness protocol code. It provides a clear UX model, bounded risk, and doesn't foreclose the ideal path (Option B or a future Peritext-model migration could be layered on later).

**Key Findings:**

- **No block-canonical editor has ever shipped a source toggle.** AFFiNE, Outline, and BlockNote all either never attempted or explicitly rejected it. We'd be the first — this is differentiation, not table stakes.
- **The industry direction is "flat text + annotations" (Peritext model).** Automerge and Loro both adopted this. It naturally supports dual views. But Yjs's Y.XmlFragment architecture has no migration path to this model without rebuilding the data layer.
- **Performance is not a concern.** Full round-trip at 50KB is estimated at <30ms (extrapolated from parser benchmarks; spike should benchmark). The risk is correctness (round-trip fidelity, cursor mapping), not speed.
- **Agent writes don't show live in source view** under Options A/I. The agent writes to Y.XmlFragment; the source view shows a serialized snapshot. On toggle-back, the agent's changes are incorporated via diff-based update. This is an acceptable P0 trade-off — the agent's changes ARE visible the moment the user toggles back to WYSIWYG.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Yjs shared type system internals | Deep | P0 |
| D2 | Complete option inventory | Deep | P0 |
| D3 | Per-option assessment matrix | Deep | P0 |
| D4 | Product implications | Deep | P0 |
| D5 | Competitor implementations | Moderate | P0 |
| D6 | Yjs ecosystem trajectory | Moderate | P0 |
| D7 | Performance characteristics | Deep | P0 |

**Non-goals:** General TipTap architecture, MDX-specific round-trip, branch switching, MCP write path (all covered by existing reports).

---

## Detailed Findings

### D1: Yjs Shared Type System Internals

**Finding: Y.XmlFragment and Y.Text are fundamentally incompatible types with no bridge mechanism.**

**Evidence:** [evidence/yjs-shared-type-internals.md](evidence/yjs-shared-type-internals.md)

Yjs has been refactored to a unified `YType` class parameterized by `DeltaConf`, but the delta configurations for text (flat character sequence) and XML (nested tree) are structurally different. A Y.Doc key is permanently typed once created. No computed/derived type mechanism exists, and there is no RFC or roadmap item proposing one.

However, dual keys in the same Y.Doc ARE fully supported: `doc.get('prosemirror')` and `doc.get('source')` can coexist as independent CRDT structures sharing sync infrastructure.

**Critical implementation detail:** y-prosemirror's `updateYFragment` function is diff-based (matches children left-to-right and right-to-left, only generates CRDT operations for changed content). The separate `prosemirrorJSONToYDoc` function creates a NEW Y.Doc and would destroy collaboration state. Toggle-back MUST use `updateYFragment`, never `prosemirrorJSONToYDoc`.

**Additional finding:** y-prosemirror ships a `configureYProsemirror` command (commands.js line 38-66) that supports pausing sync and switching the bound Y.Type at runtime. Originally designed for document switching, this enables the toggle-with-lock pattern (Option I).

**Decision triggers:**
- If Yjs adds a computed/derived type mechanism in a future version, Option B becomes dramatically simpler
- If the product moves to Automerge or Loro, the Peritext model would make dual views native

---

### D2+D3: Architecture Options — Inventory and Comparison

**Finding: 9 architectures investigated. 3 viable. 6 eliminated.**

**Evidence:** [evidence/option-inventory.md](evidence/option-inventory.md)

#### Viable Options

**Option A — Serialize-on-toggle (non-collaborative source view)**

On toggle to source: `Y.XmlFragment` → ProseMirror JSON → markdown string → write to `.md` file on disk → CodeMirror loads from file. While in source: CodeMirror edits save to `.md` file (debounced). On toggle back: read `.md` file from disk → parse markdown → ProseMirror Node → `updateYFragment()` (diff-based writeback to existing Y.XmlFragment).

**Update (2026-04-07, spec session):** The original framing described source mode as "local buffer only" (in-memory serialize-on-toggle). During spec development, we identified that source mode should write to disk — the same `.md` file that Cursor/VS Code would also edit. This means: (a) source mode edits are crash-safe (file on disk), (b) source mode edits are visible in external editors, (c) the toggle mechanism is a synchronous disk write/read (NOT file-watcher-mediated), and (d) the same `.md` file ↔ CRDT sync path needed for Cursor interop also serves source toggle.

- Source view is non-collaborative — edits go to disk, not CRDT, until toggle-back
- Agent writes to Y.XmlFragment → CRDT persistence pipeline → .md file on disk (2-10s lag). Source view can detect and reload, but this is eventual, not instant.
- Round-trip happens once per toggle (bounded risk)
- ~200 lines of implementation
- Conversion functions already exist in the ecosystem

**Option B — Dual keys with observer-based sync**

Two Y.Type instances in the same Y.Doc: `doc.get('prosemirror')` (tree) + `doc.get('source')` (text). Observers on each trigger bidirectional markdown ↔ tree conversion. Transaction origin guards prevent infinite loops.

- Both views are collaborative — CRDT conflict resolution in both
- Agent writes to Y.XmlFragment propagate to Y.Text source view in real-time
- Round-trip happens on EVERY keystroke (continuous, unbounded risk)
- ~800+ lines, fragile sync guards, ongoing maintenance
- **The bidirectional lossless markdown ↔ tree conversion is the fundamental unsolved problem.** No production system has achieved continuous lossless bidirectional conversion. Concrete examples of lossy round-trips through ProseMirror:
  1. **Indented code blocks → fenced code blocks.** ProseMirror normalizes all code blocks to fenced (``` syntax). Source written with 4-space indented code blocks comes back as fenced.
  2. **Reference-style links → inline links.** ProseMirror's link model stores URL + text. Reference definitions (`[1]: url`) are destroyed; all links become inline `[text](url)`.
  3. **Tight vs loose lists.** ProseMirror normalizes list item paragraph wrapping. A tight list (`- item\n- item`) may come back as loose (`- item\n\n- item`) depending on schema config.
  4. **Trailing whitespace.** ProseMirror strips trailing whitespace from text nodes. Markdown hard line breaks (`  \n`) are lost unless the schema explicitly handles them.
  5. **HTML blocks.** Raw HTML in markdown (`<div class="custom">`) passes through ProseMirror as an opaque block or is stripped entirely, depending on schema configuration.
  6. **Whitespace between blocks.** ProseMirror doesn't preserve the number of blank lines between paragraphs — `\n\n\n` becomes `\n\n`.
  In Option B, each keystroke triggers a conversion cycle. These normalizations compound: one user's source edits are "corrected" by the tree, the correction propagates back to source as a spurious change, which triggers another cycle. This is the "shimmer" problem — edits appear to rewrite themselves.

**Option I — Toggle-with-lock (awareness-based mode exclusion)**

Option A + Yjs awareness protocol broadcasting the active editor mode. When a user enters source mode, other connected clients see a "User X is in source mode" indicator and the document appears in a light read-only or "updates paused" state for them. On toggle-back, diff-based writeback syncs the changes.

- Same implementation as A, plus ~50 lines of awareness code
- Eliminates the concurrent-mode problem (only one user in source at a time)
- Clear UX model — "editing source" is a visible, intentional action
- y-prosemirror's `configureYProsemirror` command supports pausing sync

**Option J — Read-only source view (acknowledged, scoped out)**

Toggle to source shows a non-editable syntax-highlighted markdown rendering. Zero round-trip risk, ~100 lines, simplest possible implementation. However, PROJECT.md story S2 explicitly requires "Edits in either mode reflect in the other" — editable source is a stated product requirement. The primary motivation for source view is editing content that WYSIWYG cannot represent (frontmatter, MDX imports, complex restructuring). A read-only view satisfies inspection but not the editing use case. Option J could serve as a fast-follow fallback if editable source proves problematic, or as an interim P0 deliverable while A/I is validated in the spike.

#### Eliminated Options

| Option | Why eliminated |
|--------|---------------|
| C (Y.Text-canonical + custom PM binding) | Requires rewriting y-prosemirror — multi-month effort |
| D (Server-side mirror) | Same conversion problem as B + added latency + operational complexity |
| E (Subdocuments) | Adds Hocuspocus complexity without solving conversion |
| F (Shared Y.Text + PM rendering) | Equivalent to C — same multi-month effort |
| G (CM on Y.XmlFragment.toString()) | toString() produces XML, not markdown; also read-only |
| H (Hybrid Y.Text + PM on commit) | Degrades to Option A for WYSIWYG side; no advantage |
| J (Read-only source view) | Product requirement (S2) demands editable source. Acknowledged as fallback. |

#### Comparison Matrix

| Criterion | A (Serialize) | B (Dual keys) | I (Toggle-lock) |
|-----------|:---:|:---:|:---:|
| Source view collaborative | No | Yes | No |
| Agent writes visible in source | No | Yes | No |
| Round-trip risk | Bounded (1x per toggle) | Continuous (every keystroke) | Bounded (1x per toggle) |
| Implementation complexity | ~200 lines | ~800+ lines | ~250 lines |
| Maintenance burden | Low | High (sync guards, edge cases) | Low |
| Cursor preservation | Approximate (custom mapping) | Native (CRDT positions) | Approximate (custom mapping) |
| Undo across modes | Broken (separate contexts) | Possible (shared UndoManager) | Broken (separate contexts) |
| Forecloses future collab in source | No (B can be layered on) | N/A — already collaborative | No (B can be layered on) |
| Performance at 50KB | <30ms per toggle | Continuous ~5-20ms per keystroke | <30ms per toggle |

---

### D4: Product Implications

**Finding: Non-collaborative source view is an acceptable P0 trade-off. No competitor has solved this either.**

#### What happens when an agent writes while the user is in source mode?

Under Options A/I: The agent writes to `Y.XmlFragment` via Hocuspocus DirectConnection. The source view (plain CodeMirror, not connected to CRDT) doesn't update. The user sees a stale snapshot. When they toggle back to WYSIWYG, the WYSIWYG view shows the agent's changes (it was always connected to the CRDT). When they toggle to source again, the new snapshot reflects the agent's work.

**UX mitigation:** The awareness protocol can show "Agent wrote to this document" while the user is in source mode — a notification badge that prompts them to toggle back to see changes, or an automatic refresh of the source view's markdown snapshot.

#### What UX constraints does each approach create?

**Option A:** Source mode is "offline editing" — the user makes local changes to a serialized snapshot. If another user (or agent) edits the same paragraph while they're in source mode, the toggle-back applies the diff and may merge. The user doesn't see the conflict until toggle-back. This is the same UX as Obsidian (single-player, local file) — acceptable for P0's single-player target.

**Option B:** Both views are live. But continuous round-trip creates a "shimmer" risk — user types in source, conversion to tree changes some formatting (e.g., trailing whitespace, list marker normalization), that change propagates back to source as a spurious edit. This is the fundamental problem with bidirectional live sync.

**Option I:** Same as A, plus a clear "I'm in source mode" signal to collaborators. When we add multi-human (Later), this becomes important — you don't want two users in source mode simultaneously. The awareness lock is forward-compatible.

#### Which options foreclose future paths?

**None of the viable options are one-way doors.** Option A and I are the simplest starting points that don't prevent later migration to:
- Option B (add bidirectional sync when/if the conversion problem is solved)
- A Peritext-model migration (if we ever switch to Automerge or a Y.Text-canonical architecture)

Option B, if chosen now, would be very hard to undo — the dual-key architecture would create coupling throughout the codebase.

#### Concurrent edit conflict on toggle-back

Under Options A/I, `updateYFragment` performs a structural diff (left-to-right, right-to-left child matching) — NOT a three-way merge. It has no concept of a common ancestor. If the user edits paragraph 3 in source mode while the agent simultaneously edits paragraph 3 in Y.XmlFragment, `updateYFragment` will overwrite the agent's version with the user's. This is a data loss scenario.

**Mitigations:**
- Option I's awareness lock prevents HUMAN concurrent editing (other users see the lock). But it does NOT prevent AGENT writes — the agent writes via DirectConnection regardless of awareness state.
- UX mitigation: when the agent writes while a user is in source mode, show a notification ("Agent edited this document — toggle back to see changes before editing the same sections"). The notification uses the awareness protocol's custom state fields.
- Spike should validate: what happens when `updateYFragment` encounters a structurally different tree than expected (i.e., the agent added a new paragraph while the user was in source mode)?

#### Awareness lock considerations (Option I)

The Yjs awareness protocol has a built-in timeout (default 30 seconds). If a client disconnects ungracefully while holding the source-mode lock, the lock expires after the timeout. Other clients see "User X was in source mode" transition to "User X disconnected." Edge cases to address:
- **Stale lock recovery:** After timeout, any client can enter source mode. The orphaned source edits (if any were in progress) are lost — they were local and never committed to the CRDT.
- **Lock contention UX:** When User B wants source mode while User A holds it, show "User A is editing source — you'll be notified when they're done" rather than a hard block.
- **`configureYProsemirror` pause/resume:** This command has NOT been tested for the pause-on-same-Y.Type-and-resume pattern needed for Option I. It may have been designed for switching between different Y.Types (document switching). The spike must validate this specifically.

#### Is non-collaborative source view a competitive disadvantage?

No. No block-canonical editor has collaborative source editing. The only editor with collaborative source editing (HedgeDoc) is text-canonical — a fundamentally different architecture. We're not behind competitors; we're offering something no block-canonical editor offers at all.

---

### D5: Competitor Implementations

**Finding: Text-canonical editors toggle via CM6 decoration swaps. Block-canonical editors don't have source toggle at all.**

**Evidence:** [evidence/competitor-implementations.md](evidence/competitor-implementations.md)

The competitive landscape reveals a clean split:

| Pattern | Examples | Mechanism | Toggle cost |
|---------|----------|-----------|-------------|
| Text-canonical, CM6 decoration swap | Obsidian, Zettlr | Same editor, different decorations | Zero |
| Text-canonical, split view | HedgeDoc | Show/hide panels | Zero |
| Block-canonical, no source view | AFFiNE, Outline, BlockNote | N/A | N/A |

Obsidian's approach (CM6 with decoration toggling) is the gold standard for toggle UX — instant, zero conversion cost. But it's only possible because markdown text is the canonical representation. For our TipTap + Y.XmlFragment architecture, we can't replicate this — conversion is unavoidable.

The good news: at <30ms for 50KB, the conversion cost is imperceptible. The UX gap versus Obsidian is in cursor/scroll preservation, not speed.

**Obsidian itself has cursor/scroll position jumps** on mode toggle — this is a known pain point even with their zero-conversion approach. Our approximate cursor mapping will be in the same ballpark.

---

### D6: Yjs Ecosystem Trajectory

**Finding: "Wait for Yjs" is not a viable option. The industry is moving toward a different canonical model (Peritext/flat-text) that Yjs's architecture doesn't support.**

**Evidence:** [evidence/yjs-ecosystem-trajectory.md](evidence/yjs-ecosystem-trajectory.md)

The broader CRDT ecosystem is converging on the Peritext model — flat text with formatting stored as annotations. [Automerge 2.2](https://automerge.org/blog/2024/04/06/richtext/) productionized this. [Loro](https://loro.dev/blog/loro-richtext) adopted the same pattern. This model naturally supports both plain-text and rich-text views of the same CRDT.

Yjs stores structure IN the CRDT (Y.XmlFragment). There is no migration path to Peritext-model without rebuilding the data layer. No Yjs RFC, no Kevin Jahns commentary, and no community solution addresses the dual-representation problem.

**Decision triggers:**
- If Yjs v14+ introduces annotation-based rich text, dual views become native
- If the product considers switching to Automerge, the Peritext model would make this problem disappear
- If Loro's ecosystem matures sufficiently, its fork/merge + Peritext model could be a better foundation for source toggle specifically

**Remaining uncertainty:** Yjs's refactoring to a unified YType with DeltaConf MIGHT eventually enable cross-type observation, but there's no signal this is planned.

---

### D7: Performance Characteristics

**Finding: Toggle cycle performance is not a concern at any realistic document size. The critical correctness requirement is using updateYFragment (diff-based), never prosemirrorJSONToYDoc (destructive).**

**Evidence:** [evidence/performance-characteristics.md](evidence/performance-characteristics.md)

Full round-trip performance (based on markdown-it benchmarks and y-prosemirror source analysis):

| Document size | Full round-trip |
|---------------|----------------|
| 1KB (~250 words) | <2ms |
| 10KB (~2,500 words) | <5ms |
| 50KB (~12,500 words) | <30ms |

All within a single frame at 60fps. The performance concern was overweighted in prior discussions.

**Critical correctness requirement:** `prosemirrorJSONToYDoc` (y-prosemirror/src/lib.js) creates a new Y.Doc — using it for toggle-back would destroy all CRDT state, cursor positions, and undo history for every connected client. The correct function is `updateYFragment` (sync-plugin.js lines 1145-1298), which diffs and applies only the changes.

**Cursor mapping:** No off-the-shelf library exists. [Quarto](https://deepwiki.com/quarto-dev/quarto/4.1-codemirror-integration) is the best prior art — they track SourcePos with line mappings during serialization. For the spike, approximate cursor mapping (snap to nearest block boundary) is sufficient.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **updateYFragment performance under high-nesting scenarios** (tables with many cells, deeply nested lists): The 5-20ms estimate at 50KB is extrapolated from algorithm structure, not measured. The spike should benchmark this.
- **UndoManager behavior across mode toggles:** When the user toggles to source, edits, and toggles back, the WYSIWYG UndoManager has a gap. The exact UX impact (what does Cmd+Z do?) needs spike validation.
- **MDX/JSX round-trip fidelity as source toggle prerequisite:** The source toggle's primary value is editing content that WYSIWYG cannot represent (MDX components, imports, frontmatter). Round-trip fidelity for these content types is a prerequisite for the feature's utility. If the round-trip for JSX void nodes is lossy, source toggle would corrupt the content types users most need it for. See [reports/mdx-crdt-roundtrip-fidelity/](../mdx-crdt-roundtrip-fidelity/) for the current state of this dependency. The spike's validation #6 (void node round-trip) directly tests this.

### Future UX Enhancement: Split View

A side-by-side split view (WYSIWYG leader + read-only source follower, continuously updated) could provide constant markdown visibility without any toggle. The one-way serialization (tree → markdown, read-only) has zero correctness risk and trivial implementation. If combined with Option A/I (clicking into the source panel makes it editable), this provides a superior UX to a pure toggle. This is a P1 enhancement, not P0 scope — noted here as a natural extension of the serialize-on-toggle architecture.

### Out of Scope (per Rubric)

- General TipTap architecture assessment (see `reports/tiptap-2026-direction-overlap/`)
- MDX/JSX-specific round-trip issues (see `reports/mdx-crdt-roundtrip-fidelity/`)
- CRDT branching and document namespacing (see `reports/crdt-branching-namespacing-prior-art/`)
- MCP write path through CRDT (see `reports/crdt-mcp-filesystem-bridge/`)

---

## References

### Evidence Files
- [evidence/yjs-shared-type-internals.md](evidence/yjs-shared-type-internals.md) — Yjs type system, observeDeep, updateYFragment, configureYProsemirror
- [evidence/option-inventory.md](evidence/option-inventory.md) — 9 architectures assessed with mechanisms and feasibility
- [evidence/competitor-implementations.md](evidence/competitor-implementations.md) — Obsidian, AFFiNE, Outline, Milkdown, BlockNote, Zettlr, HedgeDoc
- [evidence/yjs-ecosystem-trajectory.md](evidence/yjs-ecosystem-trajectory.md) — Peritext model, Automerge, Loro, Yjs roadmap
- [evidence/performance-characteristics.md](evidence/performance-characteristics.md) — Serialize/deserialize benchmarks, updateYFragment analysis, cursor mapping

### External Sources
- [Peritext (Ink & Switch)](https://www.inkandswitch.com/peritext/) — Rich text annotations on flat text CRDTs
- [Automerge 2.2 Rich Text](https://automerge.org/blog/2024/04/06/richtext/) — Production implementation of Peritext model
- [Loro Rich Text](https://loro.dev/blog/loro-richtext) — Peritext + Fugue on flat text
- [Yjs Y.Text vs Y.XmlFragment discussion](https://discuss.yjs.dev/t/structure-design-y-text-vs-y-xmlfragment/1662) — Architectural choice framing
- [Quarto CodeMirror Integration](https://deepwiki.com/quarto-dev/quarto/4.1-codemirror-integration) — SourcePos cursor mapping prior art
- [markdown-it benchmarks](https://github.com/markdown-it/markdown-it) — Parsing performance data
- [Outline source view rejection](https://github.com/outline/outline/discussions/3326) — Product decision rationale
- [Obsidian scroll position issue](https://forum.obsidian.md/t/toggle-live-preview-source-mode-does-not-preserve-scroll/74379) — Even text-canonical editors have cursor issues

### Related Research
- [reports/mdx-text-editor-preview-approach/](../mdx-text-editor-preview-approach/) — CodeMirror + preview progression path (partially overlapping; covers the text-canonical approach stages)
- [reports/mdx-crdt-roundtrip-fidelity/](../mdx-crdt-roundtrip-fidelity/) — Round-trip fidelity through WYSIWYG editors (covers why void nodes were chosen)
