---
title: "Nested MDX Roundtrip Trace: Plate (Slate) vs Milkdown (ProseMirror)"
date: 2026-04-03
type: trace-analysis
status: initial
test_case: deployment-guide-nested-jsx
pipelines: [plate-slate-yjs, milkdown-prosemirror-yjs]
verdict: both-lossy
---

# Nested MDX Roundtrip Fidelity Trace

This report traces a single MDX document with nested JSX (Tabs > Tab > Callout),
YAML frontmatter, expression props, and self-closing components through two
collaborative editing pipelines. Each step is traced at the code level to identify
exactly where fidelity breaks.

## Test Case Summary

The input document contains:
- YAML frontmatter (`---\ntitle: Deployment Guide\ntags: [devops]\n---`)
- Standard markdown (heading, paragraph with bold/link)
- 3-level nested JSX: `<Tabs>` > `<Tab title="Docker">` > `<Callout type="info">`
- Markdown inside JSX children (headings, bold, code blocks, links)
- Expression attribute props: `data={chartData}`, `responsive={true}`
- Self-closing component: `<Chart data={chartData} responsive={true} />`

---

## Pipeline A: Plate (Slate-based)

### Step A.1: Parse with remark-mdx to MDAST

**Code path**: `deserializeMd()` in `plate/packages/markdown/src/lib/deserializer/deserializeMd.ts`
calls `markdownToSlateNodes()` which first runs `htmlToJsx(data)` preprocessing, then
creates a unified pipeline with `remarkParse` + configured remark plugins.

**Preprocessor (`htmlToJsx`)** at `plate/packages/markdown/src/lib/deserializer/utils/htmlToJsx.ts`:
This function converts raw HTML attributes to JSX-compatible form (e.g., `class=` to `className=`).
For our test case, the JSX components (`<Tabs>`, `<Tab>`, `<Callout>`, `<Chart>`) are
already valid JSX, so `htmlToJsx` is essentially a no-op here. Expression attributes
like `data={chartData}` pass through the regex unmodified because the regex
`/([a-zA-Z0-9_-]+)=([^{ \t\n\r"'>]+?)/` explicitly excludes `{` from unquoted
attribute value matching.

**remark-mdx parsing**: The `remarkMdx` plugin (at `plate/packages/markdown/src/lib/plugins/remarkMdx.ts`)
wraps the base `remark-mdx` package. This invokes `micromark-extension-mdxjs` which
tokenizes MDX syntax, then `mdast-util-mdx` (at `oss-repos/mdast-util-mdx/lib/index.js`)
combines three extensions:
- `mdxExpressionFromMarkdown()` - handles `{expression}` nodes
- `mdxJsxFromMarkdown()` - handles JSX elements
- `mdxjsEsmFromMarkdown()` - handles ESM import/export

**Resulting MDAST** (pseudocode):

```
root
  yaml { value: "title: Deployment Guide\ntags: [devops]" }
  heading { depth: 1 }
    text { value: "Deployment" }
  paragraph
    text { value: "Regular paragraph with " }
    strong
      text { value: "bold" }
    text { value: " and a " }
    link { url: "https://example.com" }
      text { value: "link" }
    text { value: "." }
  mdxJsxFlowElement { name: "Tabs", attributes: [], children: [...] }
    mdxJsxFlowElement { name: "Tab", attributes: [{name:"title", value:"Docker"}], children: [...] }
      heading { depth: 2 }
        text { value: "Using Docker" }
      paragraph
        text { value: "First, " }
        strong
          text { value: "build" }
        text { value: " the image:" }
      code { lang: "bash", value: "docker build -t myapp ." }
      mdxJsxFlowElement { name: "Callout", attributes: [{name:"type", value:"info"}], children: [...] }
        paragraph
          text { value: "See the " }
          link { url: "https://docs.docker.com" }
            text { value: "Docker docs" }
          text { value: " for more details." }
    mdxJsxFlowElement { name: "Tab", attributes: [{name:"title", value:"Podman"}], children: [...] }
      heading { depth: 2 }
        text { value: "Using Podman" }
      paragraph
        text { value: "Similar to Docker but rootless:" }
      code { lang: "bash", value: "podman build -t myapp ." }
  mdxJsxFlowElement { name: "Chart", attributes: [
      {name:"data", value:{type:"mdxJsxAttributeValueExpression", value:"chartData"}},
      {name:"responsive", value:{type:"mdxJsxAttributeValueExpression", value:"true"}}
    ], selfClosing: true, children: [] }
  paragraph
    text { value: "Final paragraph." }
```

**Key observation**: The MDAST is structurally correct. `mdxJsxFromMarkdown()` at
line 422-442 of `mdast-util-mdx-jsx/lib/index.js` creates `mdxJsxFlowElement` nodes
with a `children` array. The children contain full MDAST (headings, paragraphs,
code blocks) because remark-mdx enables markdown parsing inside JSX flow content.
Expression attribute values are preserved as `MdxJsxAttributeValueExpression` objects
with the raw string value (`"chartData"`, `"true"`).

### Step A.2: MDAST to Slate Nodes

**Code path**: `mdastToSlate()` at `plate/packages/markdown/src/lib/deserializer/mdastToSlate.ts`
calls `convertNodesDeserialize()`.

For each `mdxJsxFlowElement` / `mdxJsxTextElement`, the converter dispatches to
`customMdxDeserialize()` at `plate/packages/markdown/src/lib/deserializer/utils/customMdxDeserialize.ts`.

**CRITICAL BREAKPOINT #1 - Unknown JSX tags fall back to plain text**:

At line 17-21 of `customMdxDeserialize.ts`:
```typescript
const customJsxElementKey = mdastNode.name;
const key = getPluginKey(options.editor!, customJsxElementKey as any) ?? mdastNode.name;
```

Then at line 23-29, it tries to find a registered deserializer for this key.
For `<Tabs>`, `<Tab>`, `<Callout>`, `<Chart>` -- unless the consuming application
has registered Plate plugins for these exact component names, **there is no matching
deserializer**.

**Fallback behavior** (lines 38-76):

For **inline** (`mdxJsxTextElement`): flattens to literal text string
`"<Badge>New</Badge>"` -- complete structural loss.

For **block** (`mdxJsxFlowElement`): wraps in a paragraph with tag strings:
```typescript
return [{
  children: [
    { text: `<${tagName}>\n` },
    ...convertChildrenDeserialize(mdastNode.children, deco, options),
    { text: `\n</${tagName}>` },
  ],
  type: getPluginType(options.editor!, KEYS.p),
}];
```

**What this means for our test case**:

The 3-level nesting `Tabs > Tab > Callout` produces a SINGLE paragraph element
containing interleaved text fragments:
```
paragraph
  text: "<Tabs>\n"
  text: "<Tab>\n"
  heading_children... (but these become text because they're inside a paragraph)
  text: "\n</Tab>"
  text: "\n</Tabs>"
```

**LOSSES at this step**:
1. All JSX component structure is DESTROYED -- flattened into paragraph(s) with
   literal tag strings mixed with content.
2. JSX attributes are LOST entirely -- `title="Docker"`, `type="info"` disappear.
3. Expression props `data={chartData}` and `responsive={true}` are LOST.
4. The self-closing `<Chart ... />` becomes: `{ text: "<Chart>\n" }, { text: "" },
   { text: "\n</Chart>" }` in a paragraph -- self-closing form is lost AND
   attributes are stripped.
5. Markdown inside JSX children (headings, code blocks) is recursively converted
   but placed inside a flat paragraph, violating Slate's schema (headings cannot
   be inside paragraphs).

**YAML frontmatter**: The MDAST `yaml` node type maps to plate type `'yaml'` via
`MDAST_TO_PLATE` at types.ts line 322. However, there is **NO yaml rule** in
`defaultRules.ts` (confirmed by grep). The `getDeserializerByKey` call returns
`undefined`, and `buildSlateNode` returns `[]` (empty array). **YAML frontmatter
is silently dropped.**

### Step A.3: Slate to Yjs (via slate-yjs)

**Code path**: `slateElementToYText()` at `slate-yjs/packages/core/src/utils/convert.ts`
line 36-48.

Each Slate `Element` becomes a `Y.XmlText`. The element's properties (type, etc.)
are set as attributes via `yElement.setAttribute(key, value)`. Children are
converted to an insert delta via `slateNodesToInsertDelta()`:
- `Text` nodes become string inserts with formatting attributes
- `Element` children become nested `Y.XmlText` inserts

For our degraded Slate tree (single paragraphs with literal tag text), this step
faithfully represents the already-degraded data. The literal strings like
`"<Tabs>\n"` become Yjs text inserts. No additional information loss occurs at
this specific conversion step -- the damage was already done in Step A.2.

### Step A.4: Concurrent Edit Simulation

**User A edits "build" to "create" in Docker Tab**:
Since the original JSX structure was flattened into a single paragraph, the word
"build" is just part of a text string. The user would edit the text node containing
`"First, **build** the image:"` -- but wait, this was inside a JSX child that
got recursively deserialized. The bold node survived as a Slate text node with
`bold: true` mark. Changing "build" to "create" is a simple text operation on the
Yjs text content.

**Agent adds a new Tab**:
This is where it gets catastrophic. The agent would need to insert a new `<Tab>`
block, but the structure is completely flat. The agent would have to:
1. Find the literal text `"\n</Tab>"` before `"\n</Tabs>"`
2. Insert raw text `"\n<Tab title=\"Kubernetes\">\n## Using Kubernetes\n</Tab>"`

This is raw string manipulation, not structural editing. There is no CRDT-level
protection for structural integrity.

**Conflict scenario**: If User A's edit of "build"->"create" and the agent's tab
insertion target overlapping text regions in the same Yjs text node, character-level
CRDT merging would interleave the edits. Since the JSX tags are just characters in
a text blob, the merge could produce malformed JSX like:
`"<Tab title=\"Kub</Tab>\nernetes\">"`

### Step A.5: Serialize Back

**Code path**: `serializeMd()` at `plate/packages/markdown/src/lib/serializer/serializeMd.ts`
calls `convertNodesSerialize()` to build MDAST, then `remark-stringify` to produce text.

The degraded Slate tree produces paragraph nodes with literal tag text. The paragraph
serializer emits the text content. The literal `<Tabs>` etc. strings are emitted
as-is. However, `mdxJsxToMarkdown()` in `mdast-util-mdx-jsx` only handles actual
`mdxJsxFlowElement` MDAST nodes -- it never sees these because they were flattened
to paragraphs.

### Step A.6: Input vs Output Comparison

| Feature | Input | Output | Status |
|---------|-------|--------|--------|
| YAML frontmatter | `---\ntitle: ...\n---` | **GONE** | LOST - no yaml rule in defaultRules |
| `# Deployment` heading | Present | Preserved | OK |
| Bold text in paragraph | `**bold**` | Preserved | OK |
| Link in paragraph | `[link](url)` | Preserved | OK |
| `<Tabs>` structure | Nested JSX element | Literal text `<Tabs>\n...` in paragraph | DESTROYED |
| `<Tab title="Docker">` | JSX with attribute | Literal text `<Tab>`, title attr LOST | DESTROYED |
| Heading inside Tab | `## Using Docker` | Potentially OK if recursion works, but inside paragraph | SCHEMA VIOLATION |
| Code block inside Tab | ````bash ... ``` `` | Recursively deserialized but inside paragraph | SCHEMA VIOLATION |
| `<Callout type="info">` | 3rd-level nested JSX | Literal text, type attr LOST | DESTROYED |
| `<Chart ... />` | Self-closing with expression props | `<Chart>...</Chart>` paragraph, all props LOST | DESTROYED |
| `{chartData}` expression | Expression attribute value | **GONE** | LOST |
| `{true}` expression | Expression attribute value | **GONE** | LOST |
| Final paragraph | Present | Preserved | OK |
| Whitespace between sections | Specific line breaks | Partially preserved via remark-stringify | ALTERED |

**Verdict for Pipeline A**: Without application-specific Plate plugins registered for
`<Tabs>`, `<Tab>`, `<Callout>`, and `<Chart>`, the pipeline DESTROYS all JSX structure,
STRIPS all attributes and expression props, and DROPS YAML frontmatter. Only plain
markdown content survives the roundtrip. After concurrent edits on the flattened
text representation, valid MDX reconstruction is impossible.

---

## Pipeline B: Milkdown (ProseMirror + remark)

### Step B.1: Parse to MDAST

Milkdown's parser at `milkdown/packages/transformer/src/parser/state.ts` uses a
remark instance configured by the editor's plugins. The `ParserState.create()`
static method (line 41-47) creates a parser that:
1. Runs `remark.parse(markdown)` to get MDAST
2. Runs `remark.runSync()` for any remark transform plugins
3. Walks the MDAST via `state.next(tree)` to build ProseMirror nodes

**The critical question**: Does Milkdown include `remark-mdx` in its remark pipeline?

**Answer: NO.** Milkdown's preset-commonmark uses standard remark (commonmark spec).
The `remark-html-transformer` plugin at
`milkdown/packages/plugins/preset-commonmark/src/plugin/remark-html-transformer.ts`
handles `html` nodes by wrapping them in paragraphs -- this is the raw HTML
handling, not JSX/MDX.

Without `remark-mdx`, the remark parser treats `<Tabs>`, `<Tab>`, `<Callout>`,
`<Chart>` as **raw HTML** nodes. The standard remark parser produces:

```
root
  heading { depth: 1 }
    text { value: "Deployment" }
  html { value: "---\ntitle: Deployment Guide\ntags: [devops]\n---" }
  ... (wait, actually frontmatter is not handled either)
```

**Actually**, without `remark-frontmatter`, the YAML block `---` delimiters are
parsed as `thematicBreak` nodes (horizontal rules). The content between them
becomes a paragraph or heading depending on interpretation.

**CRITICAL BREAKPOINT #1 - No MDX support at all**:

Without `remark-mdx`, the following happens to JSX:
- `<Tabs>` becomes an `html` MDAST node with `value: "<Tabs>"`
- Content between JSX tags is parsed as regular markdown
- `</Tabs>` becomes another `html` node with `value: "</Tabs>"`
- Expression props `{chartData}` trigger a parse error or are treated as literal text

The MDAST would look something like:
```
root
  thematicBreak  (from first ---)
  heading { depth: 2 }  (from "title: Deployment Guide")
  ... malformed content from YAML interpretation ...
  thematicBreak  (from second ---)
  heading { depth: 1 }
    text { value: "Deployment" }
  paragraph (with bold and link - OK)
  html { value: "<Tabs>" }
  html { value: "<Tab title=\"Docker\">" }
  heading { depth: 2 }
    text { value: "Using Docker" }
  paragraph (First, **build** the image:)
  code { lang: "bash", value: "docker build -t myapp ." }
  html { value: "<Callout type=\"info\">" }
  paragraph (See the Docker docs...)
  html { value: "</Callout>" }
  html { value: "</Tab>" }
  html { value: "<Tab title=\"Podman\">" }
  ... similar ...
  html { value: "</Tab>" }
  html { value: "</Tabs>" }
  html { value: "<Chart data={chartData} responsive={true} />" }
  paragraph (Final paragraph.)
```

**Note**: The `{chartData}` inside `<Chart data={chartData}>` is ambiguous without
MDX parsing. Standard HTML parsing keeps it as part of the html node value string.

### Step B.2: MDAST to ProseMirror Nodes

**Code path**: `ParserState` at `milkdown/packages/transformer/src/parser/state.ts`.
The `#runNode()` method (line 82-87) matches each MDAST node against schema specs
via `#matchTarget()` (line 67-79), which iterates over all registered node types
and mark types checking `spec.parseMarkdown.match(node)`.

For `html` MDAST nodes, the `htmlSchema` at
`milkdown/packages/plugins/preset-commonmark/src/node/html.ts` matches:
```typescript
parseMarkdown: {
  match: ({ type }) => Boolean(type === 'html'),
  runner: (state, node, type) => {
    state.addNode(type, { value: node.value as string })
  },
},
```

This creates an **atom** (non-editable) **inline** node with the raw HTML string
stored in `attrs.value`.

**CRITICAL BREAKPOINT #2 - HTML schema is atomic inline**:

The HTML node definition (line 13-16):
```typescript
atom: true,
group: 'inline',
inline: true,
```

Each `<Tabs>`, `</Tabs>`, `<Tab ...>`, `</Tab>`, etc. becomes a separate inline
atom node containing just the tag string. They are NOT structural -- they are
opaque blobs.

**Resulting ProseMirror tree** (pseudocode):
```
doc
  horizontal_rule                     (from first ---)
  heading(2) "title: Deployment Guide"  (YAML mangled)
  ... (more YAML mangling)
  horizontal_rule                     (from second ---)
  heading(1) "Deployment"
  paragraph "Regular paragraph with **bold** and [link](...)"
  paragraph
    html_inline { value: "<Tabs>" }
  paragraph
    html_inline { value: '<Tab title="Docker">' }
  heading(2) "Using Docker"
  paragraph "First, **build** the image:"
  code_block(bash) "docker build -t myapp ."
  paragraph
    html_inline { value: '<Callout type="info">' }
  paragraph "See the Docker docs for more details."
  paragraph
    html_inline { value: "</Callout>" }
  paragraph
    html_inline { value: "</Tab>" }
  ... (Podman tab similar)
  paragraph
    html_inline { value: "</Tabs>" }
  paragraph
    html_inline { value: '<Chart data={chartData} responsive={true} />' }
  paragraph "Final paragraph."
```

**But wait** -- the remark-html-transformer wraps HTML nodes in paragraphs only when
they're in block containers. This means each HTML tag gets its own paragraph wrapper.
The content between tags (headings, code blocks) remains as top-level block nodes.

### Step B.3: ProseMirror to Yjs (via y-prosemirror)

**Code path**: Milkdown's collab service at
`milkdown/packages/plugins/plugin-collab/src/collab-service.ts` uses `y-prosemirror`'s
`ySyncPlugin()` which binds a `Y.XmlFragment` to the ProseMirror doc.

In `y-prosemirror/src/sync-utils.js`, the `pmToFragment()` function (line 134-139)
converts the ProseMirror doc to Yjs delta format via `nodeToDelta()` (line 181-188):

```javascript
export const nodeToDelta = (n, nodeName = n.type.name) => {
  const d = delta.create(nodeName, $prosemirrorDelta)
  d.setAttrs(n.attrs)
  n.content.content.forEach(c => {
    d.insert(c.isText ? (c.text ?? []) : [nodeToDelta(c)], ...)
  })
  return d.done(false)
}
```

Each ProseMirror node becomes a named delta with attrs. Text nodes become text
inserts. Block nodes become nested delta inserts. The inline atomic `html` nodes
become nested deltas with their `value` attr.

**The Yjs representation** preserves the ProseMirror structure faithfully -- each
paragraph, heading, code block, and inline html atom has its own delta entry.
The html atoms are opaque named deltas with a single `value` attribute.

### Step B.4: Concurrent Edit Simulation

**User A edits "build" to "create"**:
The word "build" is inside a `strong` mark within a paragraph. In Yjs, this is a
text insert with formatting attributes. Editing "build" to "create" is a standard
text delta operation: delete 5 chars at offset, insert "create". This works
cleanly because the content between HTML tag atoms is regular ProseMirror content.

**Agent adds a new Tab**:
The agent needs to insert several new nodes between the existing `</Tab>` html atom
paragraph and the `</Tabs>` html atom paragraph:
1. A paragraph containing `html_inline { value: '<Tab title="Kubernetes">' }`
2. A heading "Using Kubernetes"
3. Content paragraphs
4. A paragraph containing `html_inline { value: '</Tab>' }`

This is structural insertion at the block level in ProseMirror/Yjs. The delta
representation supports this -- each new block is a new insert in the doc's child
delta. **No character-level conflicts** because the edits target different structural
locations in the delta tree.

**HOWEVER**: There is no structural validation that open/close tags match. If the
agent inserts `<Tab>` without `</Tab>`, or inserts them at the wrong nesting
level, the serialized output will have broken HTML/JSX. The CRDT provides
convergence but not semantic correctness.

### Step B.5: Serialize Back

**Code path**: `SerializerState` at `milkdown/packages/transformer/src/serializer/state.ts`.
The `run()` method (line 350) walks the ProseMirror tree. For each node, `#runNode()`
finds the matching serializer spec.

For `html` nodes, the serializer at `preset-commonmark/src/node/html.ts`:
```typescript
toMarkdown: {
  match: (node) => node.type.name === 'html',
  runner: (state, node) => {
    state.addNode('html', undefined, node.attrs.value)
  },
},
```

This emits MDAST `html` nodes with the raw string value. Remark-stringify then
outputs these as raw HTML lines.

### Step B.6: Input vs Output Comparison

| Feature | Input | Output | Status |
|---------|-------|--------|--------|
| YAML frontmatter | `---\ntitle: ...\n---` | Two `---` horizontal rules + mangled content | DESTROYED |
| `# Deployment` heading | Present | Preserved | OK |
| Bold text | `**bold**` | Preserved | OK |
| Link | `[link](url)` | Preserved | OK |
| `<Tabs>` open tag | JSX element start | `<Tabs>` as raw HTML in paragraph | FLATTENED but preserved as string |
| `title="Docker"` attr | JSX attribute | Preserved inside html atom value | OK (as opaque string) |
| `## Using Docker` | Heading inside JSX | Top-level heading (lost nesting context) | NESTING LOST |
| Code block inside Tab | Fenced code in JSX | Top-level code block | NESTING LOST |
| `<Callout type="info">` | Nested JSX | HTML atom in paragraph | FLATTENED but tag preserved |
| `</Callout>` closing | JSX closing tag | HTML atom in paragraph | PRESERVED as string |
| `<Chart ... />` | Self-closing with expressions | HTML atom: `<Chart data={chartData} responsive={true} />` | PRESERVED as opaque string |
| `{chartData}` | Expression attribute | Inside html atom value string | PRESERVED (opaque) |
| `{true}` | Expression attribute | Inside html atom value string | PRESERVED (opaque) |
| Final paragraph | Present | Preserved | OK |
| Nesting structure | 3-level: Tabs>Tab>Callout | Flat sequence of atoms + blocks | LOST |
| Whitespace/indentation | 2-space indented JSX children | Lost (blocks are top-level) | LOST |

**Verdict for Pipeline B**: Without `remark-mdx`, all JSX is treated as raw HTML atoms.
The tag strings themselves are preserved as opaque values (including attributes and
expression props), but ALL structural nesting is flattened. YAML frontmatter is
destroyed by being interpreted as thematic breaks. After concurrent edits, the
interleaved html atoms and content blocks can be serialized back to *syntactically
valid* HTML/JSX (since the atom strings are emitted verbatim), but the indentation
and whitespace relationships are lost.

---

## Comparative Analysis

### What breaks at each layer

| Layer | Pipeline A (Plate/Slate) | Pipeline B (Milkdown/ProseMirror) |
|-------|--------------------------|-----------------------------------|
| **Parse** | remark-mdx correctly builds nested MDAST | No remark-mdx; JSX becomes raw html nodes |
| **MDAST Quality** | Structurally perfect tree | Flat sequence of html atoms + content |
| **Editor Model** | Unknown JSX tags flatten to paragraph text, attrs LOST | HTML atoms preserve tag strings opaquely |
| **YAML** | Parsed by remark-frontmatter (if enabled), but no defaultRule -- DROPPED | No remark-frontmatter -- becomes hr + mangled text |
| **Expression Props** | LOST in MDAST-to-Slate (no deserializer for unknown JSX) | PRESERVED inside html atom value string |
| **Self-closing** | LOST (fallback wraps in open+close text) | PRESERVED (atom contains full tag string) |
| **Nesting** | DESTROYED (recursive flatten into single paragraph) | DESTROYED (flat atom sequence) |
| **CRDT Safety** | Dangerous: JSX is character-level text, merge can break syntax | Safer: atoms are opaque, content blocks merge normally |
| **Roundtrip Validity** | MDX likely INVALID after roundtrip | HTML/JSX syntax preserved but nesting/indent lost |

### The fundamental problem

Both pipelines share the same root cause: **neither editor schema has first-class
support for arbitrary JSX components as structural elements**. The editor schemas
are designed for a fixed set of known block/inline types (paragraphs, headings,
lists, code blocks, etc.). Arbitrary JSX components like `<Tabs>` or `<Callout>`
are not part of any standard editor schema.

**Pipeline A** (Plate) has the better parser (remark-mdx produces a correct MDAST),
but the MDAST-to-Slate conversion has a destructive fallback for unknown tags.
If applications register custom Plate plugins for each JSX component, the conversion
would work. But the generic/default path is catastrophically lossy.

**Pipeline B** (Milkdown) has the worse parser (no MDX support), but paradoxically
preserves more information in the opaque html atom strings. The expression props
survive because they are never parsed -- just stored as-is.

### Recommendations

1. **For Pipeline A**: The `customMdxDeserialize` fallback (lines 57-76 in
   `customMdxDeserialize.ts`) should preserve the full MDAST node as a structured
   Slate element with `type: mdastNode.name`, storing attributes as element
   properties, and recursively converting children. This would allow roundtrip
   fidelity for unknown JSX components.

2. **For Pipeline B**: Add `remark-mdx` to the remark pipeline and create a
   ProseMirror node schema for `mdxJsxFlowElement` that is a block container
   node (not atom) with name/attributes stored as node attrs and children as
   ProseMirror content.

3. **For both**: YAML frontmatter requires `remark-frontmatter` in the remark
   pipeline and a corresponding editor node type that preserves the raw YAML
   string and round-trips it back.

4. **For CRDT safety**: JSX structural elements should be represented as Yjs/CRDT
   container nodes (not text), so that concurrent structural edits (adding/removing
   tabs) are handled as tree operations, not text character interleaving.
