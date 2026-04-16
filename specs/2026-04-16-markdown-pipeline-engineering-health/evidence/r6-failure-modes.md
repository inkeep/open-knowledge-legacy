# Evidence: R6 Serialization Bug Root Causes

**Dimension:** CommonMark corpus idempotence failures — specific root causes
**Date:** 2026-04-16
**Sources:** Double round-trip diagnostic probe against current main @ 2de299b
**Method:** Throwaway diagnostic script run via bun; results cross-referenced with `packages/core/src/markdown/to-markdown-handlers.ts` and `packages/core/src/markdown/index.ts` handler code.

---

## Scope

Closes the 3 "(Specific failure TBD during Iterate phase)" entries from `commonmark-corpus-gaps.md`. Each root cause is characterized so R14's PBT arbitraries can target a specific bug shape.

## Previously characterized (from corpus-gaps evidence)

1. **Emphasis and strong emphasis** — delimiter run instability. Example: `***foo* bar**` → Round1: `***foo***** bar**` → Round2: `***foo***\*\* bar\*\*` (escaping grows each round).
2. **Backslash escapes** — cumulative escaping. Example: `\*not emphasized*` accumulates escape characters each round-trip.
3. **Lists** — nested code block handling. `1. ` with nested code: first round normalizes nesting, second round destroys structure.

## Newly characterized (this evidence)

### 4. HTML blocks — CDATA fallthrough + safeText over-escaping

**Input shape (from corpus):**
```
<![CDATA[
function matchwo(a,b)
{
  if (a < b && a < 0) then {
    return 1;
  }
}
]]>
okay
```

**After r1:** `<!\[CDATA\[\n... \{ ... } else \{ ... }\n]]>\nokay`

**After r2:** `<!\\\[CDATA\\\[\n... \\\{ ... }\n]]>\nokay` (backslash doubling)

**Root cause:** CDATA-style HTML blocks are NOT recognized as HTML blocks by remark-parse's CommonMark HTML block matcher (which expects `<script>`, `<style>`, `<!--`, etc., not `<![CDATA[`). The content falls through to text-level handling. The `safeText()` path in `to-markdown-handlers.ts` escapes `{` and `}` as "unsafe" (per mdast-util-to-markdown's default unsafe-char rules). On re-parse, the already-escaped `\{` is treated as literal text; on re-serialize, the backslash itself gets re-escaped. Compounds on each round-trip.

**Fix target:** Either (a) extend HTML block recognition to include `<![CDATA[...]]>` pattern, or (b) make the text-level escape handler idempotent — test `safeText(safeText(x)) === safeText(x)` and fix the re-escaping of already-escaped backslashes.

### 5. Links — URL parenthesis escaping lost

**Input shape (from corpus):**
```
[link](foo\(and\(bar\))
```

**After r1:** `[link](foo(and(bar))` — link still parses as link, parens deserialized correctly

**After r2:** `\[link]\(foo(and(bar))` — parens in URL confuse re-parse; the whole thing becomes plain text; `safeText()` then escapes `[` and `(`

**Root cause:** The link handler's serialize path outputs `node.url` verbatim when it contains parens. Micromark can't disambiguate `[link](foo(and(bar))` — the unbalanced parens in the URL body break the link parser. On re-parse the construct is consumed as plain text, which then gets the full unsafe-char escape treatment on re-serialize.

**Fix target:** Link handler must either (a) re-escape literal parens in the URL body on serialize (`foo\(and\(bar\)`), (b) wrap the URL in angle brackets when it contains parens (`<foo(and(bar)>`), or (c) detect paren imbalance and apply the escape. Pattern: serialize must produce output that re-parses as the same mdast structure.

### 6. Images — angle-bracket URL + default handler re-escaping

**Input shape (from corpus):**
```
![foo](<url>)
```

**After r1:** `![foo](\<url>)` — `<` escaped

**After r2:** `![foo](\\\\<url>)` — backslash doubling

**Root cause:** No custom `image` handler in `toMarkdownHandlers`. The default mdast-util-to-markdown image handler applies `state.safe()` to the URL, escaping `<` to `\<`. On re-parse, the escaped sequence is stored verbatim in the image's `url` attr (backslash consumed). Next serialize re-applies safe escaping to the now-literal backslash. Compounds.

**Fix target:** Add a custom `image` handler to `toMarkdownHandlers` that mirrors the Link handler's URL output discipline. Specifically: when URL contains `<` or `>`, either wrap in angle brackets `<url>` or escape consistently with parse-side expectations.

## Shared root cause across 4, 5, 6

All three bugs share the pattern **"serialize produces output that fails to re-parse as the same mdast structure."** The specific flavor differs:

- HTML blocks: unrecognized block type → text fallthrough → over-escape
- Links: URL content escaping lost on parse → re-escape on re-serialize
- Images: default handler escaping not reversed on re-parse

The consolidation-fix-where-shared-root-cause approach (user direction during Iterate) may reduce this to 2 fixes:
- Fix A: escape-idempotency at the text handler layer (addresses HTML blocks + reduces severity of Links/Images)
- Fix B: URL-handler parity between parse and serialize for links and images (fixes Links + Images)

## Implication for R14

Per-bug PBT arbitraries:
- `invariant-emphasis-cumulation.test.ts`: `fc.string()` wrapped in `fc.oneof(*, _)` delimiters of varying run lengths.
- `invariant-backslash-idempotence.test.ts`: `fc.string()` with random backslash placement at structurally-ambiguous and non-ambiguous positions.
- `invariant-list-nesting.test.ts`: nested list arbitraries with mixed ordered/unordered and optional code block children.
- `invariant-html-block-edge.test.ts`: structured HTML arbitraries — CDATA, comments, script/style/pre, processing instructions.
- `invariant-link-edge.test.ts`: URL arbitraries containing parens, angle brackets, unicode, backslashes.
- `invariant-image-edge.test.ts`: same URL space as link-edge but in image context; also alt-text with special chars.

## Implication for R6 scope

Existing spec text "Fixed such that all 19 formerly-NORMALIZE sections reach 100% CommonMark idempotence" is load-bearing and achievable — but requires either:
- 6 surgical fixes (one per bug), or
- 2-3 consolidated fixes (if shared root causes land together — most likely scenario).

Evidence supports MEDIUM confidence in the 2-3 consolidated path; the escape-cumulation pattern visibly appears in 4 of 6 bugs.
