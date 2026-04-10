---
type: adversarial-analysis
title: "Untested Seam: MDX Visual Editing + CRDT Collaboration"
date: 2026-04-03
parent_investigation: mdx-crdt-roundtrip-fidelity
status: complete
verdict: NO_PRIOR_ART_EXISTS -- the combination is genuinely untested and has 6 identified failure vectors
confidence: high
evidence_files:
  - evidence/prop-representation-in-yjs.md
  - evidence/concurrent-edit-traces.md
  - evidence/state-divergence-risk.md
  - evidence/nested-content-merge.md
  - evidence/prior-art-search.md
  - evidence/what-breaks-first.md
sibling_investigations:
  - ../slate-yjs/ (mapping architecture, concurrent semantics, known issues, operation flows)
  - ../y-prosemirror/
  - ../tinacms-plate-mdx/
  - ../remark-mdx/
  - ../milkdown-remark/
sources:
  - https://github.com/BitPhinix/slate-yjs
  - https://github.com/yjs/y-prosemirror
  - https://github.com/udecode/plate
  - https://github.com/Milkdown/milkdown
  - https://github.com/mdx-editor/editor
  - https://github.com/syntax-tree/mdast-util-mdx-jsx
  - https://docs.yjs.dev/api/shared-types/y.xmlelement
  - https://github.com/mdx-js/mdx/issues/1193
  - https://github.com/BitPhinix/slate-yjs/discussions/279
  - https://github.com/yjs/y-prosemirror/issues/116
  - https://github.com/yjs/y-prosemirror/issues/48
  - https://github.com/orgs/Milkdown/discussions/772
  - https://discuss.yjs.dev/t/best-way-to-store-deep-json-objects-js-object-or-y-map/2223
  - https://platejs.org/docs/yjs
  - https://platejs.org/docs/markdown
---

# Untested Seam: MDX Visual Editing + CRDT Collaboration

## Executive Summary

Nobody has built and validated MDX visual editing with CRDT-based real-time
collaboration. The individual legs are proven:

- MDX to Slate to MDX: Plate does this via @platejs/markdown with remark-mdx
- Slate to Yjs to Slate: slate-yjs does this
- MDX to ProseMirror to MDX: Milkdown is attempting this (incomplete)
- ProseMirror to Yjs to ProseMirror: y-prosemirror does this

The full chain -- MDX to Editor to Yjs to Editor to MDX -- has never been
demonstrated. This report identifies six failure vectors that will surface
when combining them. The most critical will appear before collaboration is
even testable (schema mapping), and the most insidious will appear only
after multiple editing sessions (state drift accumulation).

---

## 1. Prop Representation in Yjs

**Question**: How should MDX component props be stored in Yjs?

**Answer**: The binding determines this, not the developer. Both slate-yjs
and y-prosemirror use the same pattern:

- Each top-level node property becomes a separate `setAttribute(key, value)`
  call on the Yjs shared type
- Concurrent edits to DIFFERENT prop names merge cleanly (independent CRDT keys)
- Concurrent edits to the SAME prop name use last-writer-wins (deterministic
  by client ID, but one edit is silently lost)
- Nested objects within a single prop are OPAQUE to the CRDT -- the entire
  object is the LWW unit

**Critical implication**: If MDX component props are stored as a single nested
`props` object on the Slate/PM node, concurrent edits to different sub-props
conflict. The architectural fix is to flatten every MDX prop to a top-level
node property, but this risks name collisions with Slate/PM built-in
properties like `type` and `children`.

See: [evidence/prop-representation-in-yjs.md](evidence/prop-representation-in-yjs.md)

---

## 2. Concurrent Edit Behavior

Six scenarios were traced through the architecture:

| Scenario | Result | Risk |
|----------|--------|------|
| User A changes prop, User B edits text content | Clean merge | None |
| User A adds component, User B edits different component | Clean merge | None |
| Agent replaces section, human edits within section | Human's edits lost | HIGH |
| Two users edit different props on same component | Clean merge | None |
| Two users edit same prop on same component | LWW, one edit lost | MEDIUM |
| User A deletes component, User B edits its props | Delete wins, edit lost | HIGH |

The happy paths work. The dangerous cases are:

1. **Agent bulk writes**: Agents tend to write/replace entire blocks. This
   maps to delete+insert in Yjs, obliterating concurrent human edits.

2. **Same-prop conflicts**: No notification when LWW discards an edit. The
   user whose edit was discarded sees their change briefly appear then vanish.

3. **Delete-edit race**: When one user deletes a component while another
   edits it, the edit is silently lost. No tombstone notification, no
   conflict marker, no merge dialog.

See: [evidence/concurrent-edit-traces.md](evidence/concurrent-edit-traces.md)

---

## 3. State Divergence: Yjs to MDX to Yjs Round-Trip

**Verdict: The round-trip WILL drift on every session boundary.**

Seven drift vectors identified:

| Vector | Severity | Certainty |
|--------|----------|-----------|
| MDX whitespace normalization changes parse structure | HIGH | Near-certain for nested JSX |
| Expression attrs re-parse with different ESTree | LOW | Certain, semantically harmless |
| Boolean/numeric type coercion on attrs | MEDIUM | Likely for numeric props |
| JSX formatting preference changes | LOW | Cosmetic only |
| Empty text node injection for void components | MEDIUM | Certain |
| Doc-level attrs stripped (ProseMirror path) | HIGH | Certain if used |
| Yjs tombstone growth vs fresh parse | HIGH | Certain, architectural |

The tombstone vector is the most insidious: a Yjs document that has been
collaboratively edited contains edit history (tombstones). When the same
content is created fresh by parsing MDX, the Yjs state has zero tombstones.
The documents are logically identical but structurally different. This means
every session boundary forces a full Yjs re-sync, because state vectors
don't match.

**There is no clean solution that preserves both "MDX files are canonical"
and "Yjs state is persistent."** You must choose one as primary and derive
the other.

See: [evidence/state-divergence-risk.md](evidence/state-divergence-risk.md)

---

## 4. Nested Content Merge Behavior

For deeply nested MDX structures like Tabs > Tab > Heading > bold text:

- Each element level creates its own Y.XmlText (Slate path) or Y.XmlElement
  (ProseMirror path) instance
- Two users editing text in different Tab children modify independent Yjs
  shared types with zero contention
- The architecture handles nesting correctly for collaboration

**But**: MDX components that need editable children cannot be modeled as
Slate voids or ProseMirror atom nodes. They must be regular elements with
custom rendering. This has cascading effects on cursor navigation, selection
behavior, and the schema mapping explosion (Failure Mode #1).

See: [evidence/nested-content-merge.md](evidence/nested-content-merge.md)

---

## 5. Prior Art: Nobody Has Done This

Exhaustive search across:
- TinaCMS (no CRDT support, uses GraphQL sync)
- Plate (has both MDX and Yjs, never combined)
- Milkdown (MDX support incomplete, collab separate)
- slate-yjs (no MDX-related issues in 50 reviewed)
- y-prosemirror (no MDX-related issues)
- mdx-editor (Lexical-based, no collab)
- Dhub (claims both, no architecture published)
- Holocron (claims both, likely raw-text CRDT not structured AST)
- Academic papers, conference talks, blog posts (zero results)

**Plate is the closest**: it has @platejs/markdown (MDX serialization) and
Yjs collaboration in the same framework. But no integration test, demo,
or documentation shows them combined. They are documented independently.

See: [evidence/prior-art-search.md](evidence/prior-art-search.md)

---

## 6. What Breaks First

Ranked failure modes from most to least likely:

**#1: Schema mapping explosion** -- Before collaboration even starts, you
must define Slate/PM schemas for every MDX component type. A generic
"mdx-component" node loses structural validation. Per-component schemas
require ahead-of-time configuration for every component. Either way, you
hit a wall immediately.

**#2: Nested prop LWW conflicts** -- The first time two users edit different
sub-properties of the same component's props object, one edit is silently lost.
Mitigation (flatten props) introduces name collision risks.

**#3: Session boundary drift** -- After the first save-and-reload cycle,
the Yjs state diverges from what a fresh MDX parse produces. This forces
full re-sync and may cause duplicate content on reconnection (slate-yjs
Issue #382).

**#4: Inline void crash** -- slate-yjs has a confirmed, unfixed bug (#390)
where inline void elements mixed with text content generate invalid operations.
Any inline MDX component triggers this.

**#5: Expression props become opaque** -- JSX expression props like
`data={chartData}` cannot be collaboratively edited at sub-expression
granularity. They are atomic LWW units.

**#6: Undo crosses user boundaries** -- slate-yjs undo system removes
remote changes along with local ones. Undoing component creation loses
collaborator edits.

See: [evidence/what-breaks-first.md](evidence/what-breaks-first.md)

---

## Architectural Recommendations

### If MDX files must be canonical (git-first)

Accept that Yjs state is ephemeral. On every session start, parse MDX fresh
and initialize a new Y.Doc. This means:

- No persistent collaboration state across sessions
- No offline editing with sync-on-reconnect
- Collaboration is session-scoped only
- Tombstone drift is eliminated (fresh parse every time)

Trade-off: Lose offline collaboration capability entirely.

### If collaboration state must be persistent (CRDT-first)

Store Yjs binary state as the canonical representation. Generate MDX on
demand (for preview, git export, build). This means:

- MDX files in git are derived artifacts, not source-of-truth
- Direct MDX edits in git must be merged back into Yjs state (hard)
- Yjs state includes full edit history (large binary files in git)

Trade-off: Lose the "MDX is the source" property that makes MDX valuable.

### The hybrid approach (unexplored territory)

On session start: parse MDX, diff against stored Yjs state, merge. This
requires a three-way merge between:
1. The MDX file (possibly edited directly in git)
2. The last-known Yjs state (from previous session)
3. Any pending offline edits from disconnected clients

This is approximately as hard as building a three-way merge for structured
documents, which is an active research problem.

### For the Slate path specifically

- Flatten MDX props to top-level node properties (avoid nested object LWW)
- Prefix all MDX props with a namespace (e.g., `mdx_variant` instead of
  `variant`) to avoid Slate property collisions
- Model MDX components as regular elements, not voids (enables content editing)
- Block inline MDX components (avoids slate-yjs bug #390)
- Build a custom undo manager that respects user boundaries

### For the ProseMirror path specifically

- Define a permissive ProseMirror schema for MDX components (content: "block+")
- Accept that attribute changes on MDX nodes may require delete+recreate
  at the Y.XmlElement level (concurrent edit hazard)
- Test y-prosemirror's handling of setAttribute on complex attr values
  (Issue #116 is "closed as not planned" -- the bug may still exist)
- Use Tiptap as the ProseMirror framework (has the most mature Yjs integration)

---

## Open Questions for Empirical Testing

1. Does Plate's @platejs/markdown MDX serialization survive a Yjs round-trip?
   (Write a test: MDX -> Plate -> Yjs -> Plate -> MDX, compare input/output)

2. How does y-prosemirror handle `setAttribute` with a plain JavaScript object?
   (Does it silently store it? Does it JSON.stringify? Does it throw?)

3. What happens when slate-yjs receives a remote event for a void element's
   content? (Does Slate reject the operation? Does it crash? Does it apply it?)

4. Can Yjs's relative positions correctly track MDX component boundaries
   across concurrent edits? (Insert component A while deleting component B
   at adjacent positions)

5. What is the byte-size ratio of Yjs binary state vs MDX text for a
   realistic document after 100 collaborative edits?

---

## Conclusion

The MDX + CRDT combination is not merely untested -- it has architectural
tensions that require explicit design decisions. The core tension is:

**MDX is a text format optimized for human readability and git diffing.
CRDTs are binary structures optimized for concurrent merge semantics.
Converting between them is lossy in both directions.**

The conversion from CRDT to MDX loses edit history and tombstones. The
conversion from MDX to CRDT loses whitespace semantics and formatting
preferences. Every round-trip through this conversion introduces drift.

Building this system requires accepting one representation as canonical
and treating the other as a derived view. There is no lossless bidirectional
mapping.
