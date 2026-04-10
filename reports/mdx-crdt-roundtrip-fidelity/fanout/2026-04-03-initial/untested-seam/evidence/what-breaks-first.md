---
type: evidence
source: synthesis of all evidence files in this investigation
date: 2026-04-03
confidence: high (architecture-level analysis, not empirical)
---

# What Breaks First? Failure Mode Analysis

## Ranked Failure Modes (Most Likely First)

### 1. MDX -> Slate Schema Mapping Explodes (FIRST FAILURE)

**Likelihood: Near-certain**
**When: Before you even get to collaboration**

To represent MDX components in Slate or ProseMirror, you need schema
definitions for every component type. A component like:

```mdx
<Tabs>
  <Tab title="API">
    ## Heading
    Some **bold** text
    <CodeBlock language="typescript">
      const x = 1;
    </CodeBlock>
  </Tab>
</Tabs>
```

Requires the editor to know:
- Tabs allows Tab children only
- Tab has a title prop and allows block content children
- CodeBlock has a language prop and allows only text children (no marks)

This must be defined as a Slate Element type (or ProseMirror NodeSpec)
with constraints. For an arbitrary MDX component library, this is either:

a) A generic "mdx-component" node type with any children (loses structural
   validation, enables invalid nesting that breaks serialization)
b) A per-component schema definition (requires ahead-of-time configuration
   for every component, fails on unknown components)

Both options have failure modes. The generic approach leads to Drift Vector 1
(serialization produces MDX that re-parses differently). The per-component
approach is an integration burden that scales linearly with component count.

This is the first thing to break because it must be solved before any
collaboration testing can even begin.

### 2. Nested Object Props Lose Concurrent Edits (MOST IMPACTFUL)

**Likelihood: Certain if nested props exist**
**When: First time two users edit props on the same component**

As documented in prop-representation-in-yjs.md:

If a Slate node stores component props as a single nested object:
```javascript
{ type: 'callout', props: { variant: 'warning', icon: 'alert', data: {...} } }
```

Then `props` is ONE Y.XmlText attribute. Concurrent edits to `props.variant`
and `props.icon` will both write the entire `props` object. LWW applies to
the whole object. One user's edit is silently lost.

**Mitigation**: Flatten all props to top-level Slate node properties.
Instead of `{ props: { variant: 'warning' } }`, use `{ variant: 'warning' }`.
This gives each prop its own CRDT key.

**But**: This interleaves MDX-specific props with Slate-internal properties
(type, children, id). Name collisions are possible. A component with a prop
named `type` or `children` would shadow Slate's built-in properties.

### 3. Session Boundary Drift Accumulates (HARDEST TO DEBUG)

**Likelihood: Certain**
**When: After the first session save + reload**

As documented in state-divergence-risk.md, the Yjs state after a fresh
MDX parse will not match the Yjs state from the previous session. The
tombstone growth vector alone guarantees this: Yjs state includes edit
history, fresh parse does not.

This means every session start triggers a full Yjs re-sync with every
connected client, because the state vectors don't match. For a document
that was edited and saved, the next session's "initial state" looks like
a completely new document to the Yjs sync protocol.

**Workaround**: Store the Yjs binary state alongside the MDX file (e.g.,
in a .yjs sidecar file). But this means git stores two representations
of the same document, and they can get out of sync if someone edits the
MDX file directly (which is the entire point of MDX).

### 4. Inline Void + Text Combination Crashes (KNOWN BUG)

**Likelihood: Certain for inline MDX components**
**When: First time an inline MDX component is near text content**

slate-yjs Issue #390: `applyRemoteEvents` breaks on text and inline void
combination. When a YEvent adds both text and an inline void node
simultaneously, the Slate operation generated targets a non-existent path.

This is a confirmed bug with no fix (project is abandoned). Any inline
MDX component (`<Badge>text</Badge>` or `<Icon name="star" />` inline)
mixed with adjacent text editing will trigger this.

### 5. MDX Expression Props Become Opaque Strings

**Likelihood: Certain for expression props**
**When: Any component uses JSX expression syntax for props**

MDX allows: `<Chart data={chartData} />` where `{chartData}` is a
JavaScript expression. In the mdast, this is stored as an
mdxJsxAttributeValueExpression with an ESTree AST.

When converted to Slate, this must be stored as... what? The Slate node
can store:
- The raw string `"{chartData}"` -- but then it is just a string, and
  no validation is possible
- The ESTree AST -- but this is a complex object that becomes an opaque
  LWW blob in Yjs

In either case, there is no meaningful collaboration on expression props.
Two users cannot concurrently edit `{chartData.filter(x => x > 0)}` at
the character level. The entire expression is an atomic unit.

### 6. Undo/Redo Crosses User Boundaries

**Likelihood: Certain with current slate-yjs**
**When: First time a user presses Ctrl+Z after a collaborator edited**

slate-yjs Issue #332: withYHistory undo removes blocks with remote changes.
Undoing a locally-created block also removes remote changes made to it.

For MDX components: if User A creates a `<Callout>` and User B edits its
content, then User A presses undo, both the component and User B's edits
are removed.

## Summary Ranking

| Rank | Failure Mode | Blocks Progress? | Workaround? |
|------|-------------|-------------------|-------------|
| 1 | Schema mapping explosion | YES - no collaboration without it | Generic node with validation loss |
| 2 | Nested prop LWW conflict | YES - silent data loss | Flatten all props to top-level |
| 3 | Session boundary drift | PARTIAL - works within session | Yjs sidecar file (breaks git workflow) |
| 4 | Inline void crash | YES - known unfixed bug | Avoid inline MDX (block-only) |
| 5 | Expression props opaque | NO - degrades gracefully | Accept atomic expression editing |
| 6 | Undo crosses boundaries | NO - UX issue only | Custom undo manager |
