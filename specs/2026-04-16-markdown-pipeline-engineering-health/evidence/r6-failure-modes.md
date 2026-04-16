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

### Correction (US-009 iteration, 2026-04-16): Emphasis 1-3 root cause is NOT escape-cumulation

Double-round-trip probe on the 5 failing Emphasis examples + direct mdast inspection via `MarkdownManager.parse` revealed that the r1 → r2 instability of `***foo* bar**`-class inputs is NOT a safeText escape issue. It is a **structural loss in the PM → mdast mark-hydration algorithm** in `@handlewithcare/remark-prosemirror`.

**Trace for `***foo* bar**`:**
- Original mdast: `strong([emphasis([text "foo"]), text " bar"])` — strong wraps both; emphasis wraps only "foo".
- PM representation (schema-normalized): span "foo" with marks `[emphasis, strong]` + span " bar" with marks `[strong]`.
- PM → mdast via `hydrateMarks` (library internal `mdast-util-from-prosemirror.js`): partitions by `marks[0]`. Span "foo" has `emphasis` first, span " bar" has `strong` first → **different partitions** → wraps individually:
  - Partition 1: `emphasis(strong([text "foo"]))` (inside-out because emphasis is at `marks[0]`)
  - Partition 2: `strong([text " bar"])`
- Sibling emission: `[emphasis(strong("foo")), strong(" bar")]` — structurally different from original.
- Serialize: `***foo***` + `** bar**` = `***foo***** bar**`. 5 consecutive asterisks between "foo" and " bar" become a flanking-delimiter ambiguity on re-parse, which then parses as `[emphasis(strong("foo")), text("** bar**")]`, and the literal `**` in text re-serializes as `\*\*`. Hence r2 = `***foo***\*\* bar\*\*`.

**Why mark reorder doesn't fix it:** ProseMirror Schema normalizes mark order per `sharedExtensions` registration order (emphasis before strong), so setting `[strong, emphasis]` in PM JSON is silently renormalized to `[emphasis, strong]` on `Node.fromJSON`. There is no static order that works for both `***foo***` (strong-outer) and `*foo**bar**baz*` (emphasis-outer) cases — the "outerness" is context-dependent (who shares the mark with adjacent spans).

**Proper fix (out of US-009 / R6a scope):** Replace `fromProseMirror`'s mark hydration with an **outside-in greedy algorithm**:
```
build(spans):
  shared = intersect(span.marks for span in spans)
  if shared.length > 0:
    m = shared[0]
    stripped = spans.map(s => remove m from s.marks)
    return [wrap(m, build(stripped))]
  else partition into adjacent groups with any shared mark, recurse each.
```
For `["foo"[E,S], " bar"[S]]`: intersect = `[S]`, peel strong → `["foo"[E], " bar"[]]` → different groups → emphasis("foo") and text(" bar") → wrap strong → `strong([emphasis("foo"), text(" bar")])`. **Byte-identical to original mdast.**

Scope: this is 200-500 LOC + extensive PBT coverage. Proper story owner: a new R-item (follow-up) covering "PM mark hydration algorithm." Requires coordinated schema/handler audit.

### Correction (US-009 iteration): Emphasis cases 4-5 root cause is mark-exclusion (schema)

Examples: `*a \`*\`*`, `_a \`_\`_`. Original mdast: `emphasis([text "a ", inlineCode "*"])` — emphasis wraps both the text and the inline code. But ProseMirror's default `Code` mark (`@tiptap/extension-code`) declares `excludes: '_'` (excludes ALL other marks on the same text span). So the "*" span can only have the `code` mark — NOT emphasis. On PM → mdast, the spans are `["a "[emphasis], "*"[code]]` and the algorithm can't recover the original coverage: result is `[emphasis("a "), inlineCode("*")]` (siblings). Serialize: `*a *` + `` `*` `` = `*a *\`*\``; re-parse keeps the emphasis structure lost; r2 re-escapes `*` chars in text.

**Proper fix (out of US-009 / R6a scope):** Remove `excludes: '_'` from the Code mark extension (widening per precedent #9, arguably allowed, but needs editor-render audit: italic-within-code rendering implications). Combine with outside-in mark hydration above.

### US-009 resolution

US-009's specified fix (`safeText(safeText(x)) === safeText(x)`) was implementable, and DID fix Finding 4 (HTML blocks CDATA) in full. The remaining Emphasis 1-5 failures and Backslash Example 1 (context-sensitive mdast-util-to-markdown escape state) and Example 2 (HTML entity decode — NG5-adjacent) are **not safeText bugs** — the evidence file's prior framing was incorrect. Actual per-section R6a deltas:
- HTML blocks: 43/44 → 44/44 ✓ (US-009 success)
- Emphasis: 127/132 → 127/132 (blocked on structural PM mark hydration + Code mark exclusion)
- Backslash: 11/13 → 11/13 (blocked on mdast-util-to-markdown context sensitivity + HTML entity decode)

The safeText idempotency invariant is now empirically satisfied for all AC-listed §2.4 chars (backslash, *, _, #, <, >, {, }) via the R23 escape-aware brace-stack change (`autolink-void-html-guard.ts:protectFromMdx`). Locked in via `autolink-void-html-guard.test.ts` idempotency suite (21 new tests).

### R24 resolution (US-017 iteration, 2026-04-16)

US-009's correction section above was diagnostically correct but called the closing fixes "out of scope" — the orchestrator extended SPEC.md with R24 (US-017) to land them in the same spec per the greenfield directive. Three coupled changes shipped:

**(a) `hydrateMarks` rewrite — outside-in greedy nesting.** Extended `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch`. The new algorithm intersects marks across all spans, peels one shared mark, and recurses on stripped spans; falls back to max-length adjacent-shared-mark partitioning when no global intersection exists. Termination: each recursion either reduces total mark count (peel) or strictly reduces span count per group (partition produces ≥2 groups). For `[foo[E,S], " bar"[S]]`: shared=[S], peel S → [foo[E], " bar"[]] → partition → [emphasis(foo), text(" bar")] → wrap S → `strong([emphasis(foo), text(" bar")])` byte-identical to original mdast.

**(b) `Code` mark `excludes: '_'` removal.** New `CodeMarkFidelity` extension at `packages/core/src/extensions/code-mark-fidelity.ts` extends `@tiptap/extension-code` and overrides `excludes: ''` (empty). Code mark from `StarterKit` is disabled via `code: false` in `StarterKit.configure`. Schema widening per precedent #9 (add-only schema means widening allowed, narrowing forbidden). Editor render: `<em><code>` and `<strong><code>` use browser default styling — no NodeView changes needed.

**(c) Position-slice + entity-escape policy.** `ESCAPABLE_CHARS` widened from a structurally-ambiguous-only subset to the full CommonMark §2.4 ASCII-punctuation set (added `"'`,;=?`). Plus a value-consistency guard: `value[valIdx] === raw[rawIdx + 1]` before tagging an escape — catches the R23-PUA-substitution case where source `\<` becomes `\<PUA>` and the `\` stays literal (PUA isn't §2.4-escapable). Without the guard, position-slice would tag `\<` as escaped at the wrong offset and corrupt downstream chars. The `safeText` post-pass `escapeEntityAmpersands` prepends `\` to any `&` followed by entity-shaped tail — fixes Backslash Example 2's `\&ouml;` → `&ouml;` → `ö` HTML-entity-decode loss on r2.

**Per-section deltas:**
- Emphasis and strong emphasis: 127/132 → **132/132** ✓
- Backslash escapes: 11/13 → **13/13** ✓
- HTML blocks: 44/44 (unchanged from US-009)
- Lists, Links, Images: 26/26, 90/90, 22/22 (unchanged from US-010/011)

Full CommonMark corpus: **652/652 with 0 crashes, 0 failures across all 19 formerly-NORMALIZE sections.** US-012's `NORMALIZE_SECTIONS` set is now empty. US-014's two skip-guarded PBTs (emphasis-cumulation + backslash-idempotence) are unskipped and green at 1K samples (seed 42).

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
