---
title: Polish Engine Showcase
description: Every construct the polish engine decorates, in one file
tags: [showcase, polish-engine, source-view]
---

# Polish Engine Showcase

Open this file in **source mode** (toggle to "Markdown source" in the editor header) to see every construct the polish engine decorates. Below the heading hierarchy demo you'll find each construct labeled.

## H2: Headings with tuned size hierarchy

### H3: Scaled-back per D25 (≤1.25× base)

#### H4: Four

##### H5: Five

###### H6: Six (muted-foreground + 500 weight)

## Emphasis family (inline marks)

Text with *emphasis (italic)*, **strong (bold)**, ***both together***, and ~~delete (strikethrough)~~.

Inline code: use `Array.prototype.flat()` or `const x = { foo: 'bar' }` mid-sentence.

Mixed: a **paragraph** with `inline code`, some *em*, ~~deleted~~, and `more` code — each styled with the marker opacity at 0.65 so `*` / `**` / `~~` / `` ` `` recede.

## Blockquote family (depth-aware tinting)

> Depth 1: a single-level quote. Border at 50% muted-foreground, line tint at 4% muted, continuation text aligned under content (not under the `>` marker).
>
> Wrapped continuation: this is a much longer quoted line that should wrap to multiple visual lines — notice the hanging indent aligns the continuation under the start of the text, not flush with the `>` marker in the left gutter.

> > Depth 2: the border gets slightly more saturated (65% muted-foreground).

> > > Depth 3: maxed-out differentiation (80% muted-foreground). Deeper nesting visually collapses to depth-3 styling by design.

> > > > Depth 4: inherits depth-3 styling.

## Lists (hanging indent + markers)

- First bullet — markers use `tabular-nums` and muted foreground
- Second bullet with a wrapped continuation that should align under the text, not under the `-` marker — the `.cm-list-item-line` rule applies `padding-inline-start: calc(2ch * var(--list-depth, 1)); text-indent: -2ch`
  - Nested bullet at depth 2
    - Deeper nesting
- Back to depth 1

1. First numbered item
2. Second numbered item
3. Third — ordered-list markers are styled the same as bullets (muted, tabular-nums)

### Task items (visual-only in v1 — no click interaction)

- [ ] Unchecked task: border + transparent background
- [x] Checked task: border + `var(--accent)` background. The `[` `x` `]` chars remain in the document (addressability invariant D9).
- [ ] Another unchecked task for comparison
  - [x] Nested checked task (depth 2)
  - [ ] Nested unchecked task

## Fenced code with preserve-source-indent + language badge

```typescript
// Language badge appears as a side-widget at CodeInfo position.
// Syntax highlighting comes from @codemirror/lang-javascript (loaded lazily
// by the codeLanguages allowlist — NOT the 150+ chunks from @codemirror/language-data).
function resolveDecorations(view: EditorView, registry: Registry): DecorationSet {
  if (!syntaxTreeAvailable(view.state, view.viewport.to)) {
    return Decoration.none;
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(nodeRef) {
        // ... per-construct dispatch
      },
    });
  }
  return builder.finish();
}
```

```python
# Python language chunk is also in the allowlist
def preserve_source_indent(line: str) -> int:
    """Count leading whitespace (tabs count as 4 spaces)."""
    count = 0
    for ch in line:
        if ch == ' ':
            count += 1
        elif ch == '\t':
            count += 4
        else:
            break
    return count
```

```bash
# Bash uses StreamLanguage via @codemirror/legacy-modes
bun run dev                          # Start dev server
VITE_PORT=13580 bun run dev          # Start on custom port
bun run check                        # Quality gate (the canonical one)
```

```json
{
  "comment": "JSON syntax highlighting too",
  "codeLanguages": ["js", "ts", "tsx", "json", "yaml", "css", "html", "bash", "py", "rust", "go", "md"],
  "count": 12
}
```

```yaml
# YAML lang chunk
markdown:
  extensions: [GFM]
  codeLanguages: <allowlist>
  htmlTagLanguage: html({ matchClosingTags: false })
```

```rust
// Rust lang chunk
fn main() {
    let polish = "engine";
    println!("Hello, {}!", polish);
}
```

### Preserve-source-indent wrap demo

The following long single-line code block (~300 characters) demonstrates the preserve-source-indent hanging pattern. The wrapped continuation aligns under the code's own indentation, not under the `` ``` `` fence. Wait for this paragraph to wrap — resize the viewport narrower to exaggerate the wrap. **Note:** rectangular selection across wrapped preserve-indent lines has a documented visual quirk (ghost cells) but the clipboard output is correct (§3 Must-pass).

```typescript
      const configuration = { mode: 'wysiwyg', theme: 'dark', extensions: [basicSetup, markdown({ base: markdownLanguage, extensions: [GFM], codeLanguages }), yCollab(ytext, provider.awareness), createPolishEngineExtension(), EditorView.lineWrapping, EditorView.theme({ '&': { height: '100%' } })] };
```

### Unknown language (graceful fallback, no error)

```haskell
-- This language is not in the allowlist; the fenced block still renders
-- cleanly with the .cm-code-block tint and first/last borders — just no
-- nested syntax coloring. No console error.
map :: (a -> b) -> [a] -> [b]
map _ [] = []
map f (x:xs) = f x : map f xs
```

### Code block with no language

```
Plain fenced code — no CodeInfo node, no language badge.
Still gets .cm-code-block + first/last borders.
```

## Tables (Tier 1 + Tier 2 + Tier 3 stack)

The core value prop — long tables no longer wrap into indistinguishable pulp.

| ID | Construct | Kind | CSS Class | Addressability |
|----|-----------|------|-----------|----------------|
| 1  | Blockquote | line | `cm-blockquote-line` | ✓ |
| 2  | Table (header / row / delimiter / cell) | line + mark | `cm-table-row` + `cm-table-cell-band-{0-3}` | ✓ |
| 3  | Fenced code | line + widget | `cm-code-block` + `cm-code-language-badge` | ✓ |
| 4  | List + listItem | line + mark | `cm-list-item-line` + `cm-list-mark` | ✓ |
| 5  | Task marker | mark | `cm-task-mark` + `-checked` | ✓ |
| 6  | Heading (H1–H6) | line | `cm-heading-{1..6}` + `cm-header-mark` | ✓ |
| 7  | YAML frontmatter | line (customDetect) | `cm-frontmatter-line` + `-fence-open/close` | ✓ |
| 8  | Emphasis / strong / delete / inline code | mark | `cm-em`, `cm-strong`, `cm-del`, `cm-inline-code` | ✓ |
| 9  | Link / image / URL / LinkMark / LinkReference | mark | `cm-link-text`, `cm-link-url`, `cm-link-mark`, `cm-link-ref-def-label` | ✓ |
| 10 | Thematic break | line | `cm-thematic-break` (text faded to transparent) | ✓ (chars remain in doc) |
| 11 | HTML block | line | `cm-html-block` | ✓ |
| 12 | Broken link-reference `[text][missing]` | cross-scan mark | `cm-link-ref-broken` | ✓ |
| 13 | Broken wikilink `[[Missing]]` | mark (in plugin, not engine) | `cm-wiki-link-broken` | ✓ |

### Narrow-viewport wrap demo

Resize the editor pane narrower to force per-cell wrapping — the `box-decoration-break: clone` rule on `.cm-table-cell-band-*` keeps the cell background color continuous across both visual lines, with no 1px gap at the wrap boundary.

| Column A (shortish) | Column B (medium-length cell content) | Column C (the really quite long cell that will wrap across multiple visual lines when the viewport narrows, demonstrating that Tier 2 per-cell bands survive the wrap via box-decoration-break: clone — no 1px gap, color stays consistent) |
|---|---|---|
| 1 | two | three |
| alpha | beta | gamma |
| foo | bar | baz quux corge grault garply waldo fred plugh xyzzy thud |

### Wide table (the spec's headline use case — PROJECT.md table pathology)

| Decision ID | Short label | Status | Scope / blast radius | Evidence |
|---|---|---|---|---|
| D1 | Declarative per-construct registry + ViewPlugin/StateField dispatch | LOCKED | packages/app/src/editor/polish-engine/ | §6.1–§6.3; evidence/technical-validation-crossscan-perf-yjs.md |
| D2 | Always-on; no user toggle, no settings UI, no keyboard shortcut | LOCKED | Product surface | §9; user directive |
| D3 | Internal Compartment + auto-bail (doc.lines>5000 OR first-paint>200ms → reconfigure([])) | DIRECTED | packages/app/src/editor/polish-engine/auto-bail.ts | §6.5–§6.6; Design Challenge #1 |
| D4 | S2 (per-line/per-mark decoration) only. Decoration.replace({block:true}) forbidden. No atomicRanges. | LOCKED | Engine primitive set | §6.3; §1 addressability invariant |
| D9 | Invariant framing: "source always addressable" (cursor-reachable, Cmd+A→copy byte-identical, find-replace/multi-cursor/column-select parity) — NOT "source always visible" | LOCKED | Whole engine | §1, §3, §5; Design Challenge #5 |

## Definitions (block-level reference definitions)

This paragraph has [a reference-style link][example-ref] and [another one][another-ref] — both resolve via definitions at the bottom of the section.

This paragraph has a [BROKEN reference link][this-label-does-not-exist-anywhere] — should show the `.cm-link-ref-broken` wavy red underline after the polish engine's cross-scan StateField runs.

[example-ref]: https://example.com "An example site"
[another-ref]: https://openknowledge.dev "Open Knowledge"

## Links, images, and wikilinks

Regular autolink: <https://codemirror.net/docs/ref/>. Inline link with title: [CodeMirror 6 docs](https://codemirror.net/docs/ref/ "Reference manual"). Bare URL inside prose: https://github.com/codemirror/dev is autolinked by GFM.

Image (inline, not thumbnailed — WYSIWYG's job): ![A placeholder image](https://via.placeholder.com/150 "Alt text title").

Wikilinks: [[Polish Engine Showcase]] (self-reference, valid) and [[This Page Does Not Exist]] (broken — should get `.cm-wiki-link-broken` wavy red underline within 5s of page load via `wiki-link-source.ts` plugin's pagesCache).

## Thematic breaks (three syntactic variants — all same rendering)

Before the first rule.

---

Between the first and second. The `---` characters above are still in the document and cursor-walkable (try ArrowRight across the faded line) — D9 LOCKED addressability invariant.

***

Between the second and third.

___

After the last thematic break.

## HTML block (nested @codemirror/lang-html syntax highlighting)

<div class="example-container" id="demo" data-variant="showcase">
  <header class="example-header">
    <h2>Polish Engine HTML Block Demo</h2>
    <p class="subtitle">Nested HTML parsing via <code>htmlTagLanguage: html({ matchClosingTags: false })</code></p>
  </header>
  <section>
    <article data-role="body">
      <!-- Comment nodes should get their own highlight token -->
      Attributes, tag names, and values each get distinct highlight classes.
    </article>
  </section>
</div>

<details>
<summary>Self-closing and void elements</summary>
<p>Inline &lt;br/&gt;, &lt;hr/&gt;, &lt;img/&gt; should all render cleanly.</p>
</details>

## Composition — nested constructs inline

Below: a blockquote containing a fenced code block containing strikethrough, demonstrating that parent + child construct classes coexist on nested lines (R10 nested-composition verification).

> Outer blockquote context.
>
> ```ts
> // Inside a fenced code block, inside a blockquote.
> // The line has BOTH `.cm-blockquote-line` AND `.cm-code-block` per R10.
> const result = compute(input).filter(x => ~~x.deprecated~~ && x.active);
> ```
>
> Still inside the quote.

A list with code in it:

- First item with `inline code`.
- Second item containing a fenced block:
  ```bash
  # shell inside a list item
  bun run check
  ```
- Third item with a [link](https://example.com), **bold**, and *italic*.

## Addressability invariant demo

Every character in this file is `Cmd+A`-selectable, `Cmd+C`-copyable (byte-identical to the source), `Cmd+F`-findable, and reachable by `ArrowRight`/`ArrowLeft` keyboard walk — including:

- The `#` markers at heading starts
- The `---` chars in the faded thematic breaks above
- The `[` `x` `]` inside task markers
- The `*` / `**` / `~~` marker characters around inline text
- The fence lines of fenced code blocks
- The `` `` `` and `~~` marker characters around inline styling

No `Decoration.replace({ block: true })`. No `EditorView.atomicRanges`. No widget hides a character. This is D4 LOCKED + D9 LOCKED — verified by `polish-engine/engine-invariants.test.ts`.

## Performance targets (R9)

- First-paint ≤ 30 ms on a 2000-line doc with ≥100 constructs
- Per-keystroke p95 ≤ 5 ms at viewport-typical decoration count
- Scroll frame budget p95 ≤ 16 ms across 60 rAF frames

Test seams: `window.__polishFirstPaintMs()` and `window.__activeEditorView`.

## Auto-bail (silent safety net)

If a document exceeds **5000 lines** OR first-paint **exceeds 200 ms**, the polish-engine Compartment silently reconfigures to `[]` and the doc renders as plain CodeMirror source with the agent-flash + wiki-link + md-link plugins still active. No user UI. No toast. Not reversible in-session — subsequent reloads re-evaluate the predicate fresh.

## End of showcase

~~Strikethrough~~ works. `Inline code` works. **Bold** and *italic* work. [Link](#) works. `[[Wikilinks]]` work. Tables, blockquotes, fenced code, lists, headings, frontmatter, definitions, thematic breaks, HTML blocks — all render via the engine's declarative construct registry.
