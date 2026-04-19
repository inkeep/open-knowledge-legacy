# R15 R23-guard complexity audit

**Story:** US-005
**Target file:** `packages/core/src/markdown/autolink-void-html-guard.ts` (`protectFromMdx`)
**Date:** 2026-04-16
**Result:** O(n·m) catch-all replaced with O(n log n) indexed lookups. All other passes remain linear.

---

## Per-pass complexity, before and after

`protectFromMdx` runs eight sequential passes against the source string. The table below classifies each pass in terms of `n = source.length` and `m = <number of matches>`.

| Pass | Pattern / loop | Pre-fix complexity | Post-fix complexity | Notes |
|------|----------------|--------------------|---------------------|-------|
| 1 | `HTML_COMMENT_RE.replace` | O(n) | unchanged | Single regex sweep. Inner `.replace(/</g, ...).replace(/>/g, ...)` runs on each comment body, bounded by total comment chars ≤ n. Total O(n). |
| 2 | `AUTOLINK_RE.replace` | O(n) | unchanged | Single regex sweep. Inner `replaceAll(':', …).replaceAll('@', …)` on the URI body is bounded by total URI chars ≤ n. Total O(n). |
| 3 | `HTML_CLOSE_TAG_RE.replace` | O(n) | unchanged | Single regex sweep. Inner `replace(/</g, …).replace(/>/g, …)` on each match is bounded by match length. Total O(n). |
| 4 | `LOWERCASE_HTML_TAG_RE.replace` | O(n) | unchanged | Same shape as pass 3. Total O(n). |
| 5 | `/<>/g` catch-all | O(n) | unchanged | Single regex sweep. |
| 6 | **Uppercase JSX catch-all** (the problem) | **O(n · m)** | **O(n log n)** | See detailed analysis below. |
| 7 | Brace stack loop | O(n) | unchanged | Single character-by-character pass with push/pop stack. |

Every pass except the uppercase-JSX catch-all is linear.

---

## Pass 6 — uppercase JSX catch-all

### Pre-fix

```ts
result = result.replace(/</g, (match, offset) => {
  const rest = result.slice(offset);                       // O(n) per call under V8;
                                                           // JSC cons-string makes this O(1)
  // ...
  const nextBlankLine = rest.search(/\n\s*\n/);            // O(n) per call
  const searchRegion = nextBlankLine === -1 ? rest : rest.slice(0, nextBlankLine);
  const selfCloseIdx = searchRegion.lastIndexOf('/>');     // O(region) per call
  // ...
  const closeTag = `</${tagName}>`;
  if (rest.includes(closeTag)) return match;               // O(rest) per call — the main offender
  // ...
});
```

The dominant cost is `rest.includes(closeTag)` — for each of `m` uppercase `<` tokens, the search scans up to `n` characters of source. Worst case: O(n · m).

### Pre-fix measurement

The JavaScriptCore engine (Bun's runtime) optimizes `String.prototype.includes` aggressively on typical content, which hides the quadratic term on normal corpora. A pathological corpus (unique unclosed uppercase tags; no close tag exists anywhere) forces the search to scan to EOF every time and makes the asymptotic cost visible:

| Unclosed tags | Source length (chars) | p50 protectFromMdx latency |
|---------------|-----------------------|----------------------------|
| 200 | 6,979 | 0.38 ms |
| 1,000 | 35,779 | 5.99 ms |
| 5,000 | 187,779 | 137.47 ms |
| 10,000 | 377,779 | 568.88 ms |

5K → 10K doubles the workload and produces 4.1× the latency — this is the quadratic term dominating.

### Post-fix

One O(n) sweep at the top of the pass builds three indexes:

1. **`closeTagOffsets: Map<string, number[]>`** — absolute offsets of every uppercase-initial `</TagName>`, grouped by tag name, in ascending order.
2. **`paragraphBreaks: number[]`** — absolute offsets of every `/\n\s*\n/` match, ascending.
3. **`selfCloseOffsets: number[]`** — absolute offsets of every `/>`, ascending.

The per-`<` callback then resolves in O(log n):

- Next paragraph break after `offset`: `lowerBound(paragraphBreaks, offset)` → O(log n).
- Last `/>` in `(offset, nextBlankLine)`: `lowerBound(selfCloseOffsets, nextBlankLine)` → O(log n).
- Matching close tag after `offset`: `lowerBound(closeTagOffsets.get(tagName) ?? [], offset)` → O(log n).

Extracting `betweenContent` between tag-end and `/>` is still O(content-length), but that content is strictly bounded by the paragraph region it lives in. Across all `<` callbacks, the total content scanned is at most `n`, so this work stays O(n) aggregate — not O(n²).

### Post-fix measurement

Same pathological corpus, post-fix:

| Unclosed tags | Source length (chars) | p50 protectFromMdx latency | Speedup vs pre-fix |
|---------------|-----------------------|----------------------------|--------------------|
| 200 | 6,979 | 0.20 ms | 1.9× |
| 1,000 | 35,779 | 0.71 ms | 8.4× |
| 5,000 | 187,779 | 2.61 ms | 52× |
| 10,000 | 377,779 | 4.76 ms | **119×** |

Scaling 5K → 10K is 1.8× (not 4.1×) — consistent with O(n log n).

On the non-pathological MDX-heavy corpus (uppercase tags interspersed with prose, tag names tending to repeat, close-tag search fast-pathed by JSC), the pre-fix and post-fix latencies are within noise. The fix does not regress typical content; it only fixes the algorithmic foot-gun on adversarial shapes.

---

## Behavior preservation

The post-fix implementation preserves the pre-fix semantics byte-identically:

- **Close-tag match:** `rest.includes('</TagName>')` was byte-literal (no whitespace tolerance before `>`). The post-fix regex `/<\/([A-Z][A-Za-z0-9.]*)>/g` matches the same literal shape.
- **Paragraph-break scope:** `rest.search(/\n\s*\n/)` found the first paragraph break ≥ offset. `lowerBound(paragraphBreaks, offset)` returns the same position (paragraph-break offsets are strictly > `offset`, which is always a `<` character).
- **Self-close window:** `searchRegion.lastIndexOf('/>')` returned the largest `/>` offset < the paragraph break, within `searchRegion`. The indexed equivalent uses `lowerBound(selfCloseOffsets, nextBlankLine) - 1` and checks the resulting absolute offset is > `offset`. Same semantics.
- **Between-content extraction:** `result.slice(tagEndAbs, lastSelfCloseAbs)` produces the same substring as the pre-fix `searchRegion.slice(tagMatch[0].length - 1, selfCloseIdx)` because `searchRegion` begins at `offset`.
- **Bounded lookahead (`result.slice(offset, offset + 256)`)** replaces the pre-fix `result.slice(offset)` for regex prefix testing. JSX tag names are bounded (`[A-Z][a-zA-Z0-9.]*[\s/>]`) — 256 characters is far beyond the longest dotted JSX name we would encounter, so every regex that matched pre-fix matches post-fix.

The full test suite — 88 tests across `autolink-void-html-guard.test.ts`, `autolink-void-html-guard.precision.test.ts`, `autolink-void-html-guard.consistency.test.ts` (including PBT coverage with ≥3K `expect()` calls) — remains green, confirming no false positives or false negatives were introduced.

---

## Pinned regression test

`packages/core/src/markdown/autolink-void-html-guard.perf.test.ts` pins the post-fix speedup:

- 5K unclosed uppercase tags must complete in < 50 ms median (observed: ~2.6 ms).
- 10K unclosed uppercase tags must complete in < 100 ms median (observed: ~4.8 ms).

A regression that reintroduced O(n·m) scanning would overshoot these bounds by an order of magnitude. The bounds are deliberately generous (≈ 20× observed p50) so CI runner variance does not cause flakes.

---

## Untouched complements

- The fix is confined to `protectFromMdx`. The symmetric `restoreFromMdx` traversal and `hasSentinels` helper are unchanged — they were already O(n) via `unist-util-visit` + `replaceAll`.
- No PUA sentinel semantics changed. NG9 continues to reserve U+E000–U+E004; no source bytes outside the reserved range are touched.
- The fuzz suite (`packages/app/tests/stress/bridge-convergence.fuzz.test.ts`) continues to exercise the guard indirectly through the bridge; no guard-specific fuzz shape was added by this story because the existing tests already provide high coverage (3011 expect() calls from 4 fast-check tests and 79 precision-PBT tests).
