# Evidence: Ecosystem Completeness — What Each Stack Gives Us

**Dimension:** D3, D4, D9 — what each ecosystem provides out-of-the-box vs what we'd write ourselves
**Date:** 2026-04-12
**Sources:** npm package pages, official docs, GitHub repos, our existing codebase.

---

## Findings

### Finding: remark ecosystem provides first-class MDX support; marked does not
**Confidence:** CONFIRMED
**Evidence:** [remark-mdx docs](https://mdxjs.com/packages/remark-mdx/), [micromark-extension-mdx-jsx](https://github.com/micromark/micromark-extension-mdx-jsx), [mdast-util-mdx](https://github.com/syntax-tree/mdast-util-mdx); our `packages/core/src/extensions/jsx-tokenizer.ts`

**remark MDX stack** (one `.use(remarkMdx)` call):
- `micromark-extension-mdx-jsx` — JSX tokenization, JS-aware via acorn
- `micromark-extension-mdx-expression` — `{expression}` via acorn
- `micromark-extension-mdxjs-esm` — `import`/`export` blocks
- `micromark-extension-mdx-md` — turns off conflicting CommonMark features (indented code, HTML blocks)
- `mdast-util-mdx-jsx` — 7 mdast node types: `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxFlowExpression`, `mdxTextExpression`, `mdxjsEsm`, `mdxJsxAttribute`, `mdxJsxExpressionAttribute`

Round-trip status per our own `reports/mdx-crdt-roundtrip-fidelity/REPORT.md`: 22/23 MDX edge cases converge after one normalization pass. One open issue ([mdx-js/mdx#2533](https://github.com/mdx-js/mdx/issues/2533) — multiline expression indentation drift, closed as expected, ~5 LOC workaround).

**marked MDX stack:** NONE. No community marked-mdx exists. Our `jsx-tokenizer.ts` is ~370 LOC of custom regex + tag-counting + brace-depth tracking (three versions because the first two failed on nested same-name tags). Every MDX edge case (member expressions `<Foo.Bar>`, spreads, expression attributes, nested fragments) is our bug to own.

### Finding: remark provides first-class frontmatter; @tiptap/markdown requires a custom wrapper
**Confidence:** CONFIRMED
**Evidence:** [remark-frontmatter](https://github.com/remarkjs/remark-frontmatter); our `packages/core/src/extensions/frontmatter.ts`

**remark-frontmatter** — one `.use(remarkFrontmatter, ['yaml', 'toml'])`. Frontmatter becomes a first-class mdast node with type `yaml`/`toml`. Nothing to strip/prepend.

**@tiptap/markdown** — no frontmatter support. We maintain `frontmatter.ts` (strip + prepend wrapper with a regex `FRONTMATTER_RE`) and call `stripFrontmatter` before parse, `prependFrontmatter` after serialize, everywhere in our observers/persistence/agent-sessions code paths.

### Finding: remark-gfm is one package; equivalent marked coverage is 3-4 packages
**Confidence:** CONFIRMED
**Evidence:** [remark-gfm](https://github.com/remarkjs/remark-gfm)

**remark-gfm** bundles: autolink literals, footnotes (`[^1]`), strikethrough (`~~x~~`), tables with alignment, task lists (`- [x]`). Single install.

**marked ecosystem** equivalents (per-feature packages):
- `marked-footnote` — footnotes
- `marked-gfm-heading-id` — heading anchor slugs
- `marked-extended-tables` — tables
- Strikethrough + task lists + autolinks are in marked core via options

### Finding: marked has no mature definition-list, directive, or alert extension equivalent to remark
**Confidence:** CONFIRMED
**Evidence:** [marked-directive](https://www.npmjs.com/package/marked-directive), [marked-alert](https://www.npmjs.com/package/marked-alert); [remark-directive](https://github.com/remarkjs/remark-directive), [remark-definition-list](https://www.npmjs.com/package/remark-definition-list)

| Feature | marked ecosystem | remark ecosystem |
|---|---|---|
| Directives (`:::`) | marked-directive (basic, ~300 LOC) | remark-directive (mature, 3 directive types, round-trip verified) |
| Alerts (`> [!NOTE]`) | marked-alert | remark-github-blockquote-alert |
| Definition lists | None | remark-definition-list |
| Math | marked-katex-extension (render-only) | remark-math (AST + serialize) |
| Mermaid | None (render concern) | Via remark-mdx fenced block pattern or directives |

### Finding: Our 118-case fidelity probe shows marked-as-tokenizer is cleanest at the tokenizer layer; @tiptap/markdown's bugs are in the dispatch/encoding layer
**Confidence:** CONFIRMED
**Evidence:** `reports/markdown-roundtrip-fidelity-tiptap/evidence/d2-ecosystem-comparison-118.md`

Of 118 constructs tested:
- **marked-only** (tokenize + detokenize): 91/118 whitespace-only diffs (best tokenizer)
- **@tiptap/markdown** (marked + MarkdownManager dispatch): 77/118 whitespace-only (14 new bugs introduced by the wrapper)
- **prosemirror-markdown** (markdown-it): 74/118 whitespace-only

The @tiptap/markdown wrapper introduces the entity corruption and escape consumption bugs we patch. Marked alone doesn't have these bugs — they're in the encoding layer `@tiptap/markdown` adds on top.

### Finding: remark's mdast-util-to-markdown `unsafe` table is extensible; @tiptap/markdown's escape policy is baked in
**Confidence:** CONFIRMED
**Evidence:** [mdast-util-to-markdown readme](https://github.com/syntax-tree/mdast-util-to-markdown); `node_modules/@tiptap/markdown/src/MarkdownManager.ts:901-911`

mdast-util-to-markdown exposes `unsafe` — a table of character escape rules that extensions can modify. If an equivalent entity-corruption bug appeared in this stack, we'd patch it by editing a rule array, not by monkey-patching library code.

@tiptap/markdown's `encodeTextForMarkdown` is hardcoded in a private method. Our fix is a bun patch maintained against upstream source.

### Finding: industry adoption heavily favors remark ecosystem
**Confidence:** CONFIRMED
**Evidence:** package.json files of major projects

Docusaurus, Next.js MDX (`@mdx-js/mdx`), Astro (`@astrojs/markdown-remark`), Prettier, Milkdown (README: "built on ProseMirror, Y.js, and Remark"), BlockNote (uses `unified@^11`, `remark-parse@^11`, `remark-stringify@^11`, `remark-gfm@^4`, `remark-rehype@^11`, `rehype-remark@^10`) all standardize on unified/remark.

TipTap's use of marked is the ecosystem outlier — the fact that `@tiptap/markdown` is the official path rather than a remark-based integration is notable.

### Finding: remark-rehype bridge enables HTML AST interop; marked has no equivalent
**Confidence:** CONFIRMED
**Evidence:** [remark-rehype](https://github.com/remarkjs/remark-rehype)

`remark-rehype` + `rehype-remark` cross mdast ↔ hast (HTML AST) in the same unified pipeline. This means we can share plugins with Shiki highlighting, Astro, Fumadocs, and any rehype-based tool. For a docs platform that might consume this same markdown downstream, this is a real capability.

---

## Custom-code debt scorecard

Separated into stack-specific code and shared fidelity logic (the extraction/storage of per-node source form that either stack would require):

**marked + @tiptap/markdown stack-specific (~475 LOC):**
- bun patch for entity encoding + escape handler (src-level source changes): ~15 LOC (dist copies bring the patch file to ~25 LOC total but they're compiler output, not logic we write)
- Frontmatter strip/prepend wrapper (`frontmatter.ts`): ~30 LOC
- `jsx-tokenizer.ts` (custom MDX/JSX tokenizer): ~370 LOC
- Tight/loose list preservation: ~50 LOC
- `parseMarkdown`/`renderMarkdown` boilerplate per extension: absorbed into the ~370 LOC above

**unified + remark + remark-prosemirror stack-specific (~380 LOC):**
- Position-slice delimiter recovery helper: ~30 LOC (walk mdast, slice source at `position.start.offset`)
- Custom handlers for per-node delimiter preservation (emphasis, strong, code, list, thematicBreak): ~150 LOC (copy default handlers, swap delimiter source)
- Handler registration glue for our ProseMirror schema: ~200 LOC (equivalent volume to current extension parseMarkdown/renderMarkdown)
- **Zero MDX code** — remark-mdx handles it
- **Zero frontmatter wrapper** — remark-frontmatter handles it

**Shared fidelity logic (~200 LOC, either stack):**
- Per-node source-form extraction (delimiter, marker, fence char, setext vs ATX, etc.): 11 fidelity extensions × ~20 LOC each. The mechanism differs (marked `token.raw` field vs mdast `position.offset` source slicing) but the volume and logic is equivalent.

**Net delta (stack-specific):** ~475 LOC vs ~380 LOC = ~95 LOC difference in stack-specific code, *dominated by the MDX ~370 LOC custom tokenizer on the marked side*. Without MDX ambition, the two stacks are nearly equal in custom-code volume. With MDX ambition (our case), remark has the clear advantage.

Plus: the remark stack has no upstream source patches to maintain (workarounds live in handler overrides via exposed extension API, not vendor-source modifications). The mechanism difference matters for maintainability even if the LOC count is similar.

---

## Gaps / follow-ups

- **Not yet probed:** the 118-case fidelity suite through a full unified + remark pipeline. This is the single highest-value next research step — would replace one theoretical estimate with empirical data.
- **Not assessed:** how hard to adapt our wiki-link tokenizer (`[[Page]]`) to micromark. Likely straightforward as a micromark extension (state machine with well-defined start/end).
