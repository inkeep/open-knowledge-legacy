---
type: evidence
source: synthesis of all 7 sub-reports
date: 2026-04-03
---

# Blocking Issues: Source-Level Evidence

## Issue 1: Indentation Drift on Multiline Expressions (Does Not Converge)

**Severity**: CRITICAL -- blocks any system that round-trips MDX
**Source**: mdast-util-mdx-expression/lib/index.js line 112-118,
mdast-util-mdx-jsx/lib/index.js line 735-740

Two compounding indent operations:
1. `handleMdxExpression()` adds 2-space indent to continuation lines
2. `containerFlow()` adds parent-depth indent to child content

On each round-trip, expression values gain +2 spaces per nesting level.

```
Pass 0: {`line1\nline2`}
Pass 1: {`line1\n    line2`}     (+4)
Pass 2: {`line1\n      line2`}  (+2)
Pass 3: {`line1\n        line2`} (+2)
```

**GitHub**: mdx-js/mdx#2533 (closed, "expected behavior")

**Workaround**: Strip accumulated indent from expression values after
parsing, before the AST enters the editor. Must be applied on every load.

## Issue 2: slate-yjs Abandoned with Critical Bugs

**Severity**: CRITICAL for Slate path
**Source**: https://github.com/BitPhinix/slate-yjs

Last commit: July 2023 (nearly 3 years stale). 20 open issues.

Critical unfixed bugs:
- #390: `applyRemoteEvents` crashes on text + inline void in same delta.
  Impact: any inline MDX component mixed with text triggers this.
- #386: Null parent reference during `flushLocalChanges`. Intermittent
  crash during normal editing.
- #382: Content duplication on offline reconnection. Offline-first broken.
- #391: `move_node` forward within same parent miscalculates offsets.
  Impact: reordering MDX components produces wrong state.
- #332: Undo removes blocks with remote changes. Impact: undoing component
  creation loses collaborator edits.

**Implication**: Using slate-yjs in production requires forking and
patching at minimum #390, #386, and #391.

## Issue 3: Expression Props Not Supported in TinaCMS Pipeline

**Severity**: HIGH -- limits MDX expressiveness
**Source**: @tinacms/mdx/src/parse/acorn.ts line 108-118

TinaCMS's Acorn extraction requires `Literal`, `ArrayExpression`, or
`ObjectExpression` ESTree nodes. Variable references (`Identifier` nodes
like `chartData`) hit `assertType` failures and throw parse errors.

`data={chartData}`, `onClick={() => alert("hi")}`, and any computed
expression prop is rejected.

This is architectural, not a bug -- TinaCMS intentionally supports only
literal values that can be edited as form fields.

## Issue 4: Schema Mapping Explosion

**Severity**: HIGH -- architectural constraint
**Source**: untested-seam sub-report, evidence/what-breaks-first.md

Every MDX component must have a corresponding editor schema definition:
- Slate: Element type with constraints on children
- ProseMirror: NodeSpec with content expression and attribute definitions

Two approaches, both with failure modes:
a) Generic "mdx-component" node: loses structural validation, enables
   invalid nesting that breaks serialization.
b) Per-component schema: requires ahead-of-time configuration for every
   component, fails on unknown components.

This must be solved before collaboration testing can begin.

## Issue 5: Nested Object Props Get LWW Semantics

**Severity**: HIGH -- silent data loss
**Source**: slate-yjs sub-report section 3; y-prosemirror sub-report section 3

Both binding libraries store node attributes as individual CRDT keys.
But if MDX component props are stored as a single nested object
(`{ props: { variant: "warning", size: "lg" } }`), the entire object
is one CRDT key. Concurrent edits to different sub-props result in
last-writer-wins on the whole object. One user's changes are silently lost.

**Mitigation**: Flatten all MDX props to top-level node properties.
Risk: name collisions with editor-internal properties (type, children).

## Issue 6: YAML Frontmatter Lost in Both Pipelines

**Severity**: MEDIUM -- blocks common MDX pattern
**Source**: nested-mdx-trace sub-report, Steps A.2 and B.2

Plate: No yaml rule in defaultRules.ts. Frontmatter is silently dropped.
Milkdown: No remark-frontmatter plugin. `---` parsed as thematicBreak.

**Fix**: Both pipelines need remark-frontmatter in the remark chain and
a corresponding editor node type that stores the raw YAML string.

## Issue 7: Session Boundary Drift (Yjs State vs Fresh MDX Parse)

**Severity**: HIGH -- architectural tension
**Source**: untested-seam sub-report, section 3

A Yjs document with edit history (tombstones) cannot match a fresh parse
of the same MDX content. The state vectors differ. On every session start,
this forces a full Yjs re-sync. Seven independent drift vectors identified:

1. MDX whitespace normalization changes parse structure (HIGH, near-certain)
2. Expression attrs re-parse with different ESTree (LOW, certain)
3. Boolean/numeric type coercion on attrs (MEDIUM, likely)
4. JSX formatting preference changes (LOW, cosmetic)
5. Empty text node injection for void components (MEDIUM, certain)
6. Doc-level attrs stripped in ProseMirror path (HIGH, certain)
7. Yjs tombstone growth vs fresh parse (HIGH, architectural)
