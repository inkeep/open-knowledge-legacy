---
name: MDX crash taxonomy post-agnostic-mode post-R23
description: Enumerates every throw site in micromark-extension-mdx-jsx + mdast-util-mdx-jsx that survives agnostic-mode swap and R23 guard pre-processing. Grounds R6 test fixtures and sizes the coverage gap honestly.
date: 2026-04-13
sources:
  - node_modules/micromark-extension-mdx-jsx/lib/factory-tag.js
  - node_modules/micromark-factory-mdx-expression/index.js
  - node_modules/mdast-util-mdx-jsx/lib/index.js
  - node_modules/vfile-message/lib/index.js
---

# MDX crash taxonomy

## Agnostic mode coverage (honest accounting)

Agnostic mode (`micromark-extension-mdx`) differs from strict mode (`micromark-extension-mdxjs`) by **removing acorn**. The acorn-specific throws eliminated are gated on the `acorn` argument inside `mdxExpressionParse` (factory-mdx-expression line 129):

| Line | Message | Triggered by |
|---|---|---|
| `micromark-factory-mdx-expression/index.js:265` | Acorn error: spread shape check | `{...props}` shape |
| `:275` | Acorn error: spread shape check | `{...a, b}` |
| `:285` | Acorn error: spread shape check | `{...spread, more}` |
| `:295` | "Could not parse expression with acorn" | Any malformed JS expression |

**That's it.** Agnostic mode removes 4 throws. Every other throw site remains.

**Important framing correction (per P4 source verification):** the EOF-in-expression (`:113`) and lazy-line-in-expression (`:196`) throws in factory-mdx-expression are **NOT** acorn-specific — they fire under agnostic mode too. The taxonomy below correctly lists them as residual sites, but the prose framing should distinguish "acorn-specific" (4) from "expression-parser general" (which still applies under agnostic).

## Residual crash surface (26 throw sites — corrected count)

Updated from 21 to 26 after P4 source verification surfaced 4 additional `crash()` sites in factory-tag.js (lines 247, 354, 536, 567) plus accurate accounting that line 478 (`onErrorLeftIsTag`) is distinct from line 458 (`onErrorRightIsTag`). The original 21-count was an under-count.

### micromark-extension-mdx-jsx/lib/factory-tag.js (20 sites, tokenizer level)

All funnel through `crash()` at lines 806–810. Each carries `err.place` as a Point (has `.offset`).

| # | Source line | Category | Example | R23 guard covers? | Throws post-guard? |
|---|---|---|---|---|---|
| 1 | `factoryMdxExpression:113` | EOF in expression | `{unclosed` no `}` | Yes (GUARD_OPEN_BRACE) | No |
| 2 | `factoryMdxExpression:196` | Lazy line in expression in container | `> {a\nb}` | Partial | Yes (lazy JSX in blockquote) |
| 3 | `factory-tag.js:789-795` | Lazy line in flow JSX tag | `<Foo\nattr>` in blockquote | Partial (guard only bare `<letter`, not `<Component`) | **Yes** |
| 4 | `:132` | Bad first-name char | `<?xml>`, `<!foo>` | Partial (HTML comment regex only) | Yes for `<?xml ?>` |
| 5 | `:160` | Bad after-`<` char | `< 1>` | No | Yes |
| 6 | `:188` | Bad in-name char | `<Foo@bar>` | No | Yes |
| 7 | `:276` | Bad in-member-name | `<Foo.bar@>` | No | Yes |
| 8 | `:326` | Bad before-local-name (`:`) | `<svg: />` | No | Yes |
| 9 | `:378` | Bad after-local-name | `<svg:path%>` | No | Yes |
| 10 | `:425,472,516` | Bad attribute-name char | `<Foo @bar>`, `<Foo a%b>` | No | Yes |
| 11 | `:627` | Bad before-attr-value | `<Foo a=>` | No | Yes |
| 12 | `:658` | Mismatched attr-value quote | `<Foo a="b'` | No (guard only autolink-URL-shaped) | Yes |
| 13 | `:711` | Bad after-self-closing-`/` | `<Foo /x>` | Partial | Yes for arbitrary garbage |
| 14 | `:227` | After-name junk | `<Foo!>` | No | Yes |
| 15 | `:306` | After-member-name junk | `<Foo.bar!>` | No | Yes |
| 16 | `:597` | After-local-attr-name junk | `<Foo a:b!>` | No | Yes |
| **17** | **`:247`** | **Bad first char of member name** | **`<Foo.@bar>`** | **No** | **Yes — newly catalogued** |
| **18** | **`:354`** | **Bad char inside local name** | **`<svg:p%th>`** | **No** | **Yes — newly catalogued** |
| **19** | **`:536`** | **Bad first char of local attr name** | **`<Foo a:@>`** | **No** | **Yes — newly catalogued** |
| **20** | **`:567`** | **Bad char inside local attr name** | **`<Foo a:b%c>`** | **No** | **Yes — newly catalogued** |

### mdast-util-mdx-jsx/lib/index.js (5 sites, mdast-build level)

Throws at tree-build finalization, AFTER tokenization succeeds. Carry `err.place` as a Position (has `.start.offset` AND `.end.offset`).

| # | Source line | Category | Example | R23 covers? | Throws post-guard? |
|---|---|---|---|---|---|
| 17 | `lib/index.js:175` | Closing slash without open | `</Foo>` standalone (JSX-shaped) | Partial (lowercase only) | Yes for `</Foo>` |
| 18 | `:192` | Attribute on closing tag | `</Foo bar>` | No | Yes |
| 19 | `:209` | Self-close on closing tag | `</Foo/>` | No | Yes |
| 20 | `:403` | End-tag mismatch | `<Foo>...</Bar>` | **No** | **Yes — MOST COMMON** |
| 21 | `:458,478` | Dangling open tag at EOF | `<Foo>` with no close | Partial | Yes |

### Also: position-less error path

`lib/index.js:458` `onErrorRightIsTag` fires with `closing === undefined` when the parser reaches EOF inside an open flow element. `err.place` is `undefined` in this case. **Note** (per P4 source verification): only the right-tag path (`:458`) is position-less; `:478` (`onErrorLeftIsTag`) DOES carry position. Original 5% estimate likely undercounts — `onErrorRightIsTag` fires whenever a user opens `<Foo>` and saves before closing (very common authoring state). Real-world rate may be 15-25% of crash cases. M6 probe will ground this.

### Serialize-side throws (informational — not user-input driven)

`mdast-util-mdx-jsx/lib/index.js:528, 577, 590` throw plain `Error` (no position) for programming errors in our PM→mdast handlers (fragment with attrs, attr without name). These fire only if our handler code is wrong, not on user content. Safe under our extension set.

## Key implications for R6 design

1. **Tag mismatch (`<Foo>...</Bar>`) is the dominant real-world failure — and it throws at mdast finalization, not tokenization.** R23 cannot pre-empt it. R6's split-then-rejoin handles it.

2. **R23's coverage is narrower than prior "~95%" claim implied.** R23 covers the most frequent unguarded patterns (bare `<` with text, autolinks, HTML voids, unmatched `{`), but **every malformed attribute and every tag-name mismatch still crashes.** Expected real-world residual after R23+agnostic: 10-30% of user content with components will hit at least one crash class if they make authoring errors. The M6 probe will produce the actual numbers.

3. **VFileMessage `.place` has dual shapes.** Point (tokenizer: `err.place.offset`) OR Position (mdast-build: `err.place.start.offset`). R6's algorithm must normalize both shapes.

4. **R6 catch must wrap PM construction, not just parse.** Some throws (`RangeError: Invalid content for node` from `prosemirror-model/schema.ts:201`) surface during `remark-prosemirror`'s tree construction, not during `processor.parse()`. The `parseSafe` try/catch must wrap the entire mdast→PM materialization chain.

5. **Common user authoring errors are in the residual crash list:**
   - Typing `<Callout` and pausing mid-tag (sites #5, #14, #21)
   - Copy-paste tag mismatch (site #20)
   - Unclosed attribute quote (site #12)
   - Typo in component name closing (site #20)
   - Member-name and local-attr typos (sites #17–20, newly catalogued)

   R6 must handle these gracefully — they're not edge cases; they're active-editing states.

6. **Position-less error rate is higher than initially estimated** (15-25% real-world per P4 source-grounded estimate, not 5-10%). R6's whole-doc fallback path fires more often than expected, making R14 observability more valuable for early signal on real-world rates.

7. **Removed: `:textDirective` crash class.** Originally listed but resolved by D14 (remove remark-directive). The `1:1s`-in-table crash and broader `:` collision class are eliminated at the root.

## Reference: error shape normalization for R6

```typescript
function extractErrorOffset(err: VFileMessage): number | undefined {
  const place = err.place;
  if (!place) return undefined;
  // Point: { line, column, offset }
  if (typeof place.offset === 'number') return place.offset;
  // Position: { start: Point, end: Point }
  if (place.start && typeof place.start.offset === 'number') return place.start.offset;
  return undefined;
}
```
