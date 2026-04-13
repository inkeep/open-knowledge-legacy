# E3: Mark Hydration Algorithm Deep Dive

**Source:** `mdast-util-from-prosemirror.ts`, lines 47-92 (TypeScript source on GitHub)

## Problem Statement

ProseMirror stores marks as a flat array on each text node. mdast represents marks as nested tree structures. Converting between these representations is non-trivial.

Example:
```
ProseMirror: [text("This ", []), text("is ", [em]), text("bold", [em, strong])]
mdast:       paragraph > [text("This "), emphasis > [text("is "), strong > [text("bold")]]]
```

## The `hydrateMarks` Algorithm

### Step 1: Partition by shared outermost mark

```typescript
function hydrateMarks(children: PmMarkedNode[], parent: PmNode): MdastNodes[] {
  // PmMarkedNode = { node: PmNode, marks: readonly PmMark[] }
  
  // Partition: group consecutive children that share the same marks[0]
  const partitioned = children.reduce<PmMarkedNode[][]>((acc, child) => {
    const lastChild = lastPartition[lastPartition.length - 1];
    
    // Group if:
    // - Both have no marks, OR
    // - Both have marks and marks[0] are equal (via Mark.eq())
    if (
      (!child.marks.length && !lastChild.marks.length) ||
      (child.marks.length && lastChild.marks.length &&
       child.marks[0]?.eq(lastChild.marks[0]!))
    ) {
      // Same partition
    } else {
      // New partition
    }
  }, []);
  
  // Process each partition
  return partitioned
    .flatMap((nodes) => processChildPartition(nodes, parent))
    .filter(Boolean)
    .flat();
}
```

### Step 2: Process each partition

```typescript
function processChildPartition(nodes: PmMarkedNode[], parent: PmNode) {
  const firstMark = nodes[0]?.marks[0];
  
  if (!firstMark) {
    // No marks — just convert each node directly
    return nodes.map((node) => state.one(node.node, parent));
  }
  
  // Recursive: strip the outermost mark, hydrate remaining
  const children = hydrateMarks(
    nodes.map(({ node, marks }) => ({ node, marks: marks.slice(1) })),
    parent,
  );
  
  // Apply mark handler to wrap children
  const handler = state.markHandlers[firstMark.type.name];
  if (!handler) return children;  // No handler → pass children through unwrapped
  return handler(firstMark, parent, children, state);
}
```

### Step 3: Mark handler wraps children

A typical mark handler (via `fromPmMark`):

```typescript
function fromPmMark(type, getAttrs) {
  return (mark, _, mdastChildren) => ({
    type,
    ...getAttrs?.(mark),
    children: mdastChildren,  // Already-converted mdast nodes
  });
}
```

## Worked Example

**Input:** ProseMirror nodes:
```
text("plain")        marks: []
text("italic")       marks: [em]
text("bold-italic")  marks: [em, strong]
text("just-bold")    marks: [strong]
```

**Step 1 — Partition by marks[0]:**
```
Partition 1: [("plain", [])]           — no mark
Partition 2: [("italic", [em]), ("bold-italic", [em, strong])]  — em
Partition 3: [("just-bold", [strong])] — strong
```

**Step 2 — Process partition 1:** No marks → `state.one()` each → `[text("plain")]`

**Step 2 — Process partition 2:**
- Strip marks[0] (em): `[("italic", []), ("bold-italic", [strong])]`
- Recurse hydrateMarks:
  - Sub-partition A: `[("italic", [])]` → `text("italic")`
  - Sub-partition B: `[("bold-italic", [strong])]` → strong handler wraps → `strong(text("bold-italic"))`
- Apply em handler: `emphasis([text("italic"), strong(text("bold-italic"))])`

**Step 2 — Process partition 3:**
- Strip marks[0] (strong): `[("just-bold", [])]`
- Recurse → `text("just-bold")`
- Apply strong handler: `strong([text("just-bold")])`

**Result mdast:**
```
paragraph
├── text("plain")
├── emphasis
│   ├── text("italic")
│   └── strong
│       └── text("bold-italic")
└── strong
    └── text("just-bold")
```

## Key Properties

1. **Mark ordering matters:** ProseMirror's `Mark.eq()` comparison determines partition boundaries. Marks with the same type but different attrs create separate partitions.

2. **Recursive stripping:** Each recursion peels off one mark layer, building the nesting bottom-up.

3. **Missing handler → passthrough:** If no mark handler exists for a mark type, children are returned unwrapped (the mark is silently dropped).

4. **`pmNode.children` accessor:** The `all()` function uses `pmNode.children` which is the ProseMirror `Fragment` iterator — this maps each PM child to a `PmMarkedNode`.

## Edge Cases

- **Empty mark set:** Unmarked children go through `state.one()` directly — standard node handler path.
- **Single mark:** One recursion strips it, wraps children.
- **Overlapping marks with different attrs:** e.g., two different links on adjacent text — creates separate partitions because `Mark.eq()` checks attrs.
- **No mark handler registered:** Mark is silently stripped — children appear unwrapped in the output.
