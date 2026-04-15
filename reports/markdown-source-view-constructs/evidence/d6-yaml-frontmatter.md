# Evidence: D6 — YAML frontmatter

**Dimension:** D6 — Source-view rendering of YAML frontmatter
**Date:** 2026-04-14

---

## Key references

- `remark-frontmatter` — emits `yaml` mdast nodes (T1)
- `@lezer/markdown` — grammar extension points for frontmatter (T1)
- https://github.com/codemirror/lang-yaml — nested YAML parser (T1)

---

## Parser

**Finding D6-1:** `@lezer/markdown` does NOT include a frontmatter parser by default. Consumers integrate frontmatter via:
- A custom markdown extension (`MarkdownConfig` with a `parseBlock` rule for frontmatter fences)
- Or via the higher-level remark pipeline (`remark-frontmatter`), which produces mdast `yaml` nodes but requires separate syntax tree exposure in CM6

**Confidence:** CONFIRMED (T1)
**Evidence:** @lezer/markdown README — no built-in frontmatter rule

---

## Pathology

Minimal. Frontmatter lines are typically short key-value pairs (`title: foo`, `tags: [a, b]`). Long values are rare (e.g., multi-line descriptions that should use block-scalar `|` or `>`).

The "problem" is presentation: frontmatter should feel visually distinct from body content so readers recognize it as metadata, not prose.

---

## CM6 primitive fit

### Line-level styling

```css
.cm-frontmatter-line {
  background: color-mix(in oklab, var(--accent) 6%, transparent);
  font-family: var(--font-mono);
  font-size: 0.95em;
}
.cm-frontmatter-fence {
  border-top: 1px solid var(--border);
}
.cm-frontmatter-fence-close {
  border-bottom: 1px solid var(--border);
}
```

Detect frontmatter range by syntax tree match on the custom `FrontMatter` node (if using a custom @lezer extension), OR by regex scan of the first lines for opening `---` fence.

### Nested YAML syntax highlighting

Via `parseMixed` (or `parseCode({ codeParser })`):

```ts
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { parseMixed } from '@lezer/common';
// Wire yaml parser to FrontMatter node via parseMixed mountpoint
```

Produces proper YAML token types (`Pair`, `Key`, `Value`, `FlowSequence`, etc.) inside the frontmatter region.

### Folding / collapse

Via CM6's `foldService` or `foldNodeProp`:

```ts
import { foldNodeProp } from '@codemirror/language';
foldNodeProp.add({ FrontMatter: (node) => ({ from: node.from, to: node.to }) });
```

Adds a fold gutter toggle next to the opening fence. Users can collapse the whole frontmatter block.

---

## Per-product findings

### Obsidian

**Source Mode:**
- Frontmatter lines have subtle gray background (some builds; varies by theme)
- `---` fences get dim coloring
- Basic YAML syntax coloring: keys bold, values with quotes
- No fold/collapse toggle in base Obsidian (community plugins add it)
**Confidence:** INFERRED (T2)

**Live Preview:**
- Frontmatter renders as a "Properties" panel in the newer Obsidian builds (field-based editor with typed values), replacing raw YAML visually
- In Source Mode, raw YAML stays visible
**Confidence:** CONFIRMED (T2)

### SilverBullet

Prior report (`codemirror-markdown-source-view-rendering/evidence/d5-silverbullet.md`) noted `client/codemirror/frontmatter.ts` with styled lines + clickable link widgets (for frontmatter fields that contain URLs like `permalink:`).
**Confidence:** CONFIRMED (T2 via prior report)

### Dendron / Foam

Frontmatter-heavy products (Dendron schemas encode hierarchy via frontmatter). In-editor view relies on VS Code's YAML language server for syntax + schema-validation assistance. No CM-layer decoration; leverages Monaco + LSP.
**Confidence:** CONFIRMED (T1 via repo inspection)

### Zettlr

Academic-oriented markdown editor; frontmatter used for citation metadata. Source-view styling unclear from public docs at this pass.
**Confidence:** UNRESOLVED

### VS Code

Default markdown grammar doesn't specifically treat frontmatter — it's captured by the `markdown.fenced_code.block.yaml` injected scope when the file uses Jekyll/Hugo-style extensions. Results in YAML syntax coloring inside the `---` fences.
**Confidence:** CONFIRMED (T1)

### MDXEditor / Marktext / HedgeDoc

Typical baseline: frontmatter visible as raw YAML with basic coloring. No widget, no fold.
**Confidence:** INFERRED (T2/T3)

---

## Folding / collapse pattern

Observed only in:
- Obsidian (via community plugins like "Property Fold")
- VS Code (generic YAML language fold provider works inside `---` fences if the grammar injection is set up)

**Not observed as default** in any CM6-based markdown product's core.

---

## Gaps / follow-ups

- **Custom @lezer/markdown frontmatter extension:** no canonical implementation — each product rolls its own
- **YAML schema validation inside source view:** VS Code has this via YAML LSP; CM6-based products do not typically ship schema validation
- **"Properties panel" UX:** Obsidian's typed-field editor (replacing raw YAML in Live Preview) is a distinct UX direction; no CM6 OSS equivalent
