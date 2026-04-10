---
title: "Evidence: Concurrent Edit CRDT Safety Analysis"
step: A.4 / B.4 (Concurrent edit simulation)
severity: high
---

# Concurrent Edit CRDT Safety

## Scenario

Two concurrent edits:
1. **User A**: Edits "build" to "create" inside the Docker Tab's paragraph
2. **Agent B**: Adds a new `<Tab title="Kubernetes">` section after the Podman Tab

## Pipeline A (Plate/Slate + slate-yjs)

### Yjs State Before Edits

The document root is a `Y.XmlText` containing the degraded Slate tree.
The Docker Tab content is somewhere inside a paragraph:

```
Y.XmlText (root, type="editor")
  Y.XmlText (type="p", children=[
    text: "<Tabs>\n<Tab>\n",
    text: "## Using Docker\n\nFirst, ",
    Y.XmlText (type="text", bold=true, text="build"),
    text: " the image:\n\n```bash\ndocker build -t myapp .\n```\n...",
    text: "\n</Tab>\n<Tab>\n...\n</Tab>\n</Tabs>"
  ])
```

Note: This is a simplification. The actual structure depends on how deeply
the recursive `convertChildrenDeserialize` processes the MDAST children
before they get flattened. Some children (like bold text) may survive as
properly typed Slate nodes, while the JSX wrapper becomes literal text.

### Edit 1: "build" -> "create"

The bold "build" text node is a Slate Text node that maps to a specific
segment in the Yjs delta. The edit translates to:
- `retain(N)` to reach the bold text segment
- `delete(5)` to remove "build"
- `insert("create", { bold: true })` to add "create"

This operation is well-defined and safe.

### Edit 2: Add new Tab (Agent)

The agent needs to add content that looks like a new tab. Since the JSX
structure is flattened to character-level text, the agent would need to:
1. Find the position of `"</Tab>\n</Tabs>"` in the text
2. Insert before `"</Tabs>"`: `"\n<Tab title=\"Kubernetes\">\n## Using Kubernetes\n</Tab>"`

This is a TEXT INSERTION within a Yjs text segment. The agent is performing
character-level string manipulation on what SHOULD be structural content.

### Conflict Analysis

If both edits are applied concurrently:

**Case 1: Non-overlapping positions** (likely in this scenario)
- Edit 1 targets characters in the "build" text node
- Edit 2 targets characters in the closing tags text
- Yjs CRDT resolves by applying both: the text "build" becomes "create"
  AND the new tab text is inserted. Result is correct.

**Case 2: Same text node, overlapping offsets** (possible if structure is more flat)
- If "build" and "</Tabs>" are in the same Yjs text segment, both operations
  target the same Y.XmlText
- Yjs CRDT handles this at character level: both inserts/deletes are applied
  with position adjustments
- The result converges but may interleave incorrectly if the offset calculations
  cross JSX tag boundaries

**DANGER**: The fundamental risk is that JSX tags are CHARACTER DATA, not
structural boundaries. A CRDT text merge cannot distinguish between:
- "create" (content text that should be edited)
- "</Tab>" (structural markup that should not be split)

A badly-timed concurrent edit could produce:
```
"</Ta</Tab>\nb>"  <-- interleaved tag fragments
```

This is unlikely for the specific scenario (edits are far apart), but is a
systemic risk for any edits near tag boundaries.

## Pipeline B (Milkdown/ProseMirror + y-prosemirror)

### Yjs State Before Edits

The document is a named delta tree:
```
doc (delta)
  insert: [
    paragraph_delta { insert: [html_atom("<Tabs>")] }
    paragraph_delta { insert: [html_atom('<Tab title="Docker">')] }
    heading_delta(2) { insert: "Using Docker" }
    paragraph_delta { insert: ["First, ", "build"(strong), " the image:"] }
    code_block_delta { insert: "docker build -t myapp ." }
    paragraph_delta { insert: [html_atom('<Callout type="info">')] }
    paragraph_delta { insert: ["See the ", "Docker docs"(link), " for more details."] }
    paragraph_delta { insert: [html_atom("</Callout>")] }
    paragraph_delta { insert: [html_atom("</Tab>")] }
    paragraph_delta { insert: [html_atom('<Tab title="Podman">')] }
    heading_delta(2) { insert: "Using Podman" }
    paragraph_delta { insert: ["Similar to Docker but rootless:"] }
    code_block_delta { insert: "podman build -t myapp ." }
    paragraph_delta { insert: [html_atom("</Tab>")] }
    paragraph_delta { insert: [html_atom("</Tabs>")] }
    paragraph_delta { insert: [html_atom('<Chart data={chartData} responsive={true} />')] }
    paragraph_delta { insert: ["Final paragraph."] }
  ]
```

### Edit 1: "build" -> "create"

The edit targets the paragraph containing "First, **build** the image:".
In the delta tree, this is a `modify` operation on that specific paragraph,
with a `retain(7)` to skip "First, ", then `delete(5)` and `insert("create")`.

This is STRUCTURALLY ISOLATED from all other nodes. No other delta entry is
affected.

### Edit 2: Add new Tab (Agent)

The agent needs to insert new block-level nodes. In the delta tree, this is:
```
retain(podman_close_tab_paragraph)  -- skip to after </Tab> for Podman
insert([
  paragraph_delta { children: [html_atom('<Tab title="Kubernetes">')] },
  heading_delta(2) { children: ["Using Kubernetes"] },
  paragraph_delta { children: ["Kubernetes content"] },
  paragraph_delta { children: [html_atom("</Tab>")] },
])
```

This is a BLOCK-LEVEL INSERT between existing top-level nodes. It does not
modify any existing node's content.

### Conflict Analysis

**These edits CANNOT conflict.** They operate at different levels:
- Edit 1: character-level modification INSIDE a specific paragraph delta
- Edit 2: block-level insert BETWEEN top-level delta entries

Yjs CRDT resolves this trivially: the `modify` and `insert` operations
target non-overlapping positions in the delta tree.

### Safety Comparison

| Risk Factor | Pipeline A | Pipeline B |
|-------------|-----------|-----------|
| Tag splitting by concurrent text edit | YES (tags are text chars) | NO (tags are opaque atoms) |
| Content interleaving across tag boundary | YES | NO |
| Block-level insert conflicts | N/A (no block structure) | Handled by delta tree |
| Malformed JSX after merge | HIGH RISK | LOW RISK (tags preserved) |
| Invalid nesting after merge | HIGH (no nesting info) | MEDIUM (no nesting validation) |
| Position calculation errors | Higher (flat text) | Lower (tree structure) |

## Conclusion

Pipeline B is significantly safer for concurrent editing of documents containing
JSX components. The block-level delta tree structure prevents the most dangerous
class of merge errors (tag splitting). Pipeline A's character-level representation
of JSX tags creates systemic risk for any concurrent edits near tag boundaries.

Neither pipeline validates JSX nesting correctness after merge. Both would
benefit from a post-merge validation pass that checks tag balance.
