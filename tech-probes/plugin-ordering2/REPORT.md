---
title: "Plugin Ordering Empirical Probe — Report"
date: 2026-04-12
probe: plugin-ordering
gate: soft-signal
verdict: ORDER-INDEPENDENT for parser extensions
---

# Plugin Ordering Probe — Report

## TL;DR — key empirical finding

**Ordering of `.use()` calls for remark syntax-extension plugins does not affect the mdast parse tree.** All six tested orderings produced identical trees for every one of the 15 ambiguous inputs (A1–E2). The only thing that matters is **which plugins are present**, not their order.

**Why:** the four plugins (`remark-frontmatter`, `remark-gfm`, `remark-mdx`, `remark-directive`) are all micromark syntax-extension registrars — they push onto extension arrays read at parse time. Micromark dispatches constructs via a fixed precedence table keyed on tokenizer character + type, **not** plugin registration order. `.use()` order among these four is a style convention, not a correctness lever.

Ordering becomes significant only for *transformer* plugins, of which none of the four probed plugins are examples.

## Recommended order

```js
unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])   // 1. frontmatter first — ecosystem convention
  .use(remarkMdx)                      // 2. MDX structural layer (JSX containers)
  .use(remarkDirective)                // 3. directives — alternative container syntax
  .use(remarkGfm)                      // 4. GFM — content inside containers
  .use(remarkWikiLink)                 // 5. wiki-link (our micromark extension)
  .use(remarkProseMirror, { schema, handlers })  // transformer
  .use(remarkStringify);
```

## Rationale

Since parse-tree ordering is empirically a no-op, the recommendation is a **readability convention**:

1. `remarkFrontmatter` first — document-level; mirrors ecosystem examples (`xdm`, `@mdx-js/mdx`).
2. `remarkMdx` second — structural "container" layer (JSX blocks host other content).
3. `remarkDirective` third — alternative container syntax, pairs with MDX conceptually.
4. `remarkGfm` fourth — content constructs that nest inside containers.
5. Wiki-link last among syntax extensions — custom/local; easier to find when reading.
6. `remarkProseMirror` is the last transformer before `remarkStringify`.

## Evidence table (ordering vs. parse tree)

For every input containing the relevant syntax, the parse tree was **identical across O1–O4 and O6**. O5 (no-mdx, no-directive) is the negative control to verify mdx/directive are genuinely active.

| Input | Stresses | O1–O4,O6 parse | O5 (no mdx/dir) |
|---|---|---|---|
| A1 `---\ntitle\n---\n\n# Body` | YAML + heading | yaml + h1 | yaml + h1 |
| A2 `---\n# H\n---` | YAML w/ md-looking body | yaml | yaml |
| A3 `---\nkey:v\n---\n<C />` | YAML + MDX | yaml + mdxJsxFlow | yaml + html |
| A4 `<C>\n---\nbody\n---\n</C>` | `---` inside JSX | jsx{break + h2} | html (opaque) |
| B1 `<Note>~~d~~</Note>` | GFM strike in JSX | jsxText/delete | html + delete + html |
| B2 JSX wrapping table lines | GFM table in inline JSX | jsxText/text (flat) | html + text + html |
| B3 `<S>\n- [ ] t\n</S>` | GFM tasklist in JSX | jsx/list(tasklist) | html (opaque) |
| C1 `[[Page]] and <C />` | wiki + JSX | text + jsxText | text + html |
| C2 `[[Component]]` | wiki-like only | text | text |
| C3 `<Link to="[[P]]" />` | wiki inside JSX attr | mdxJsxFlow (attr opaque) | html |
| D1 `:::note\n<C />\n:::` | directive + JSX | container/jsx | paragraph (opaque) |
| D2 `<S>\n:::note\n...\n</S>` | JSX wraps directive | jsx/container | html (opaque) |
| D3 `<Note>:note[x]</Note>` | textDirective in inline JSX | jsxText/textDirective | html + escaped text |
| E1 `:::note\ntable\n:::` | directive + GFM table | container/table | broken (table eats `:::`) |
| E2 `:::note\n- [ ] t\n:::` | directive + GFM tasklist | container/list | broken (`:::` in listItem) |

## Observed failure modes

### Ordering-induced failures — none observed
5 permutations of {frontmatter, mdx, directive, gfm} all produced the same mdast.

### Plugin-presence failures (O5 control)
- **Without `remark-mdx`**: JSX blocks fall back to opaque `html` nodes; GFM/directive constructs nested inside JSX are **not recursed into and are lost**.
- **Without `remark-directive`**: `:::note` parses as paragraph text; closing `:::` gets absorbed by adjacent tables/lists (E1/E2 show catastrophic failure).

### Round-trip (stringify) diffs observed regardless of ordering — not ordering concerns
- **A3**: blank line inserted between frontmatter and `<Component />` (stringifier convention).
- **A4**: `<Component>\n---\nbody\n---\n</Component>` round-trips to `<Component>\n  ***\n\n  ## body\n</Component>` — `---` inside JSX is parsed as `thematicBreak` and re-serialized as `***`. **Genuine data loss, MDX semantics issue, not fixable by ordering.**
- **B2**: Table inside an *inline* `mdxJsxTextElement` — content parsed as inline text only, `|` escaped to `\|` on stringify. Lossy.
- **C1, C2**: Wiki-link brackets escape to `\[\[Page]]` on stringify (expected — resolves when wiki-link plugin is added).
- **E1, E2**: Table/tasklist inside directive — cell widths normalize, `-` lists become `*`. Stringifier normalization.

## Plugin-level notes

**remark-frontmatter** (`['yaml']`): triggers only at doc start; A2 still parses as yaml (doc-start anchor wins). No interaction with other plugins.

**remark-mdx**:
- `mdxJsxFlowElement` children parsed as **block** content — directive/GFM nest correctly (D2, B3).
- `mdxJsxTextElement` (inline JSX like `<Note>…</Note>`) children parsed as **inline only** — block constructs (full tables) silently flatten to text (B2).
- Without it, JSX → opaque `html`; nested constructs lost.

**remark-directive**: emits `containerDirective` / `leafDirective` / `textDirective`. Text directives nest cleanly inside inline JSX (D3). Without it, `:::` sequences corrupt adjacent blocks (E1/E2).

**remark-gfm**: tables, `delete`, tasklists, autolink literals. Works inside `containerDirective` and `mdxJsxFlowElement`; **does not parse blocks inside `mdxJsxTextElement`** — only inline constructs like `delete` survive.

## Open questions for spec

1. **Transformer plugin ordering (untested, still relevant)**: Ordering of *transformers* (position-slice walker, wiki-link resolver if implemented as transformer, `remark-prosemirror`) DOES matter — they run sequentially on the mdast. Spec should fix: parser extensions can be any order; transformer stack runs after, with `remark-prosemirror` last before `remark-stringify`.

2. **Wiki-link implementation choice**: If wiki-link is a **micromark extension**, it is order-insensitive like the others. If wrapped as a **remark transformer** (regex over text nodes), it becomes order-sensitive AND interacts badly with escaping (C1/C2 show brackets escape on stringify — a transformer would have to run before stringify-escape is computed). **Recommend micromark-extension approach for parity** (aligns with D7).

3. **MDX-in-markdown `---` ambiguity (A4)**: `---` inside a JSX block parses as `thematicBreak`. Known MDX semantics irregularity; no ordering fix. **Spec should document escape requirement** as a user-facing limitation.

4. **Block content inside inline JSX (B2)**: Block-level GFM inside `<Note>…</Note>` (text-element form) is silently flattened. Spec should document: use `<Note>\n\nblock\n\n</Note>` (blank lines promote to flow element) for block content.

5. **`remark-prosemirror` order sensitivity**: Out of probe scope. Recommend follow-up probe once the bridge skeleton lands — specifically whether it must run before or after any post-parse cleanup transformers we add.

## Scratch artifacts

- Probe source: `/tmp/plugin-ordering-probe-1776046249/probe.ts`
- Full raw output: `/tmp/plugin-ordering-probe-1776046249/probe-output.txt`
