---
title: "MDX conversion chain risk analysis"
type: synthesis
created: 2026-04-03
---

## TLDR
If MDX is the canonical format, there are four conversion boundaries in the editing pipeline. Each can lose information. The hardest unsolved problem is nested markdown-in-JSX round-trip through a CRDT-backed block editor. Plate (via TinaCMS) is the only framework with production evidence for MDX round-trip, but nobody has validated it with CRDT collaboration.

## Resolution (2026-04-03)
**This risk analysis drove the void-node architecture decision.** The four-boundary conversion chain is sidestepped entirely: JSX components are stored as raw strings in void nodes (no conversion at boundaries 2-4). Standard markdown content uses the proven WYSIWYG pipeline (boundary 2 only, low risk). Registered components get visual preview + auto-generated prop panel from TypeScript interfaces. Unregistered components get a mini CodeMirror showing the raw JSX with syntax highlighting. Full research: `/reports/mdx-crdt-roundtrip-fidelity/` (7 sub-reports, 9 repos). The analysis below is preserved as the evidence that informed this decision.

## The four conversion boundaries

```
MDX text on disk
  ↓ Boundary 1: remark-mdx parse
MDAST (with JSX nodes)
  ↓ Boundary 2: convert to editor blocks ← HARDEST
Editor block model (ProseMirror or Slate)
  ↓ Boundary 3: bind to CRDT
Yjs (XmlFragment via y-prosemirror, or Yjs types via slate-yjs)
  ↓ Boundary 4: serialize back
MDAST → remark-mdx stringify → MDX text → git
```

## Risk per boundary

### Boundary 1 (MDX → MDAST): LOW risk
remark-mdx is well-tested, adds JSX node types to MDAST. Handles component tags, expression props, nested content.

### Boundary 2 (MDAST → editor blocks): HIGHEST risk
Must convert every MDAST node type to an editor block type. Standard markdown nodes are straightforward. JSX component nodes have specific failure modes:

1. **Expression props** (`data={chartData}`): Must be stored as opaque strings, not parsed/evaluated
2. **Nested markdown in JSX children**: `<Callout>Some **bold** [link](url)</Callout>` — recursive structure, markdown inside JSX inside markdown. Editor must handle nested rich text editing within component blocks.
3. **Mixed inline JSX**: `Text with <Badge>label</Badge> more text` — inline elements within paragraphs
4. **Import/export statements**: `import { Chart } from './Chart'` — code, not visual content. Must be preserved as opaque blocks.
5. **Whitespace between JSX and markdown**: MDX parsing is sensitive to blank lines. Serializer must preserve exact whitespace patterns.

### Boundary 3 (editor blocks ↔ Yjs): MEDIUM risk
y-prosemirror and slate-yjs handle custom node types. The question: how are JSX component props stored in Yjs?
- String attribute → concurrent prop edits can interleave characters
- Structured map (one entry per prop) → concurrent edits to different props are conflict-free
Architecture decision needed.

### Boundary 4 (editor blocks → MDAST → MDX text): MEDIUM risk
Reverse of Boundary 2. Specific risks: attribute quoting normalization, self-closing vs explicit close, whitespace between blocks.

## Who has validated what

| Combination | Who proved it | Status |
|---|---|---|
| MDX ↔ MDAST (remark-mdx) | remark ecosystem | Production, well-tested |
| MDAST ↔ Slate blocks (MDX round-trip) | TinaCMS (Plate) | Production, proven for registered components |
| MDAST ↔ Lexical blocks (MDX round-trip) | MDXEditor | Production, proven for supported constructs |
| MDAST ↔ ProseMirror blocks (MDX round-trip) | Nobody | Untested for MDX specifically |
| Slate + Yjs (CRDT collab) | slate-yjs, various apps | Production |
| ProseMirror + Yjs (CRDT collab) | Outline, Milkdown, TipTap | Production (5+ years for Outline) |
| MDX round-trip + CRDT collab | **Nobody** | The specific untested combination |

## The hardest test case

```mdx
<Tabs>
  <Tab title="Docker">
    ## Using Docker
    First, **build** the image:
    ```bash
    docker build -t myapp .
    ```
    <Callout type="info">
      See the [Docker docs](https://docs.docker.com) for more.
    </Callout>
  </Tab>
</Tabs>
```

Three levels of nesting: JSX → markdown → JSX → markdown. With rich formatting (heading, bold, code block, link) inside JSX children. Nobody has validated this round-trips through a CRDT-backed editor.

## Implications for TQ3 spike

The spike should test:
1. Standard markdown round-trip (low risk, sanity check)
2. YAML frontmatter handling (custom pre/post-processing)
3. Simple MDX components with string props (`<Callout type="warning">text</Callout>`)
4. MDX components with expression props (`<Chart data={chartData} />`)
5. Nested markdown-in-JSX (the hard case above)
6. All of the above with Yjs collaboration (two simulated writers)

Test with Plate (strongest MDX evidence) AND Milkdown or TipTap (strongest markdown/CRDT evidence).

## Fallback path

If MDX round-trip fails: standard markdown with YAML frontmatter. Custom blocks via markdown extensions (GitHub-flavored callouts `> [!NOTE]`, fenced divs `:::callout`) rather than JSX. Less expressive but simpler round-trip. Still a viable product — Obsidian doesn't have MDX and it's the benchmark.
