# Evidence: automerge-prosemirror Binding

**Dimension:** D1 — automerge-prosemirror binding source code analysis
**Date:** 2026-04-07
**Sources:** https://github.com/automerge/automerge-prosemirror, https://www.npmjs.com/package/@automerge/prosemirror

---

## Key files referenced

- `src/traversal.ts` (1,016 lines) — Core flat-to-tree and tree-to-flat conversion
- `src/schema.ts` (314 lines) — SchemaAdapter mapping Automerge block markers + marks to PM schema
- `src/syncPlugin.ts` (147 lines) — ProseMirror plugin that syncs AM ↔ PM
- `src/pmToAm.ts` (~200 lines) — PM transaction steps → Automerge splice/mark operations
- `src/amToPm.ts` — Automerge patches → PM transactions
- `src/basicSchema.ts` (354 lines) — Default PM schema with AM block mappings
- `src/types.ts` (109 lines) — BlockMarker types, Span types
- **Total: 3,272 lines of TypeScript**

---

## Findings

### Finding: The binding maps flat text + block markers + marks to ProseMirror's tree via a traversal algorithm
**Confidence:** CONFIRMED
**Evidence:** src/traversal.ts lines 587-608, 47-103

The `traverseSpans()` generator iterates Automerge spans (from `A.spans(doc, path)`), producing TraversalEvents: `openTag`, `closeTag`, `leafNode`, `text`, `block`. The `pmDocFromSpans()` function consumes these events to build a PM Node tree using a stack-based approach.

Block structure is encoded via block markers with `type` (string like "paragraph", "heading"), `parents` (array of parent block types for nesting), and `attrs`. The `parents` array enables unlimited nesting depth (e.g., a list item inside a blockquote is `parents: ["blockquote"]`).

### Finding: The SchemaAdapter maps PM NodeSpecs and MarkSpecs to Automerge block names and mark names
**Confidence:** CONFIRMED
**Evidence:** src/schema.ts lines 65-206

Each PM NodeSpec gets an `automerge.block` property (string block name or `{ within: { outerNodeName: blockName } }` for context-dependent blocks like list items). Each PM MarkSpec gets `automerge.markName`. Custom attribute parsers (`fromProsemirror` / `fromAutomerge`) handle attribute conversion.

The SchemaAdapter also handles Peritext expand/contract semantics via `updateSpansConfig()` — marks with `inclusive: false` (like links) get `expand: "none"`, others get `expand: "both"`.

### Finding: Block-level nodes supported — headings, code blocks, lists, blockquotes, images (embeds)
**Confidence:** CONFIRMED
**Evidence:** src/basicSchema.ts lines 28-244

The basicSchema includes: `paragraph`, `heading` (with level attr), `code_block`, `blockquote`, `ordered_list`, `bullet_list`, `list_item` (context-dependent block mapping), `aside`, `image` (as embed/atom node).

**Tables are NOT supported** in the basic schema. No table node type exists. Custom schema extension would be required.

### Finding: Atom/void nodes are supported via the `isEmbed` flag
**Confidence:** CONFIRMED
**Evidence:** src/schema.ts line 25 (`isEmbed?: boolean`), src/traversal.ts lines 642-658

When a block marker has `isEmbed: true`, the traversal emits a `leafNode` event instead of `openTag`/`closeTag`. The image node demonstrates this pattern — it's inline, draggable, and stored as a block marker with `isEmbed: true` and attributes (`src`, `alt`, `title`).

For a jsxComponent void node, you would define a custom node spec with `automerge.block: "jsx-component"`, `automerge.isEmbed: true`, and attribute parsers to store the JSX string.

### Finding: ProseMirror version compatibility is modern (1.25+)
**Confidence:** CONFIRMED
**Evidence:** package.json

Dependencies: prosemirror-model ^1.25.2, prosemirror-state ^1.4.3, prosemirror-transform ^1.7.3, prosemirror-view ^1.40.1. Compatible with current ProseMirror versions used by TipTap.

### Finding: Last commit Feb 25, 2026. Version 0.2.0 (beta). Requires Automerge ^3.1.
**Confidence:** CONFIRMED
**Evidence:** git log, package.json

The package is actively maintained by the Automerge team (Ink & Switch). It requires `@automerge/automerge ^3.1` and is published as `@automerge/prosemirror`.

### Finding: No cursor/presence support in the binding itself
**Confidence:** CONFIRMED
**Evidence:** grep for "cursor", "awareness", "presence" in src/ returned zero results

The sync plugin handles document content only. Cursor/presence must be implemented separately using automerge-repo's Presence API (ephemeral messages).

---

## Gaps / follow-ups

- Table support requires custom SchemaAdapter extension — feasibility needs validation
- The binding is beta (0.2.0) — API stability is not guaranteed
- No cursor decorations — would need separate implementation using automerge-repo Presence
