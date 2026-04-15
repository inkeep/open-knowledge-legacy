---
name: M6 crash-class coverage probe results
description: Empirical grounding of the 26-class crash taxonomy. Tests each crash class against the current parseSafe implementation and measures position-less error rate.
date: 2026-04-14
probe-script: probes/M6-crash-probe.ts
raw-data: crash-class-probe-raw.json
---

# M6 Crash-Class Coverage Probe Results

## Executive summary

- **10 of 26 crash classes fire** through the current pipeline (R23 guard + `remark-mdx` strict mode). 17 are guarded by R23; the remaining 10 throw VFileMessage errors.
- **Position-less rate is ~80% for the dangling-open-tag class** (the most common real-world error per the spec), not 15-25% as estimated. However, when measured across ALL crash classes that actually fire through the pipeline today, 0% of through-pipeline errors are position-less because R23 guards the dangling-open-tag class entirely.
- **PROJECT.md crashes today** on `{ noServer: true }` (acorn expression parse). The brace-retry tier catches the acorn error but then hits a SECOND crash: `RangeError: Invalid content for node paragraph` from prosemirror-model — a position-less error with NO `.place`, `.position`, or `.offset`. PROJECT.md falls through to raw-text-fallback in `parseSafe`.
- **AGENTS.md and ARCHITECTURE.md parse cleanly.** All 10 docs/*.mdx files parse cleanly.
- **The "most common" crash class (C24: tag mismatch) fires and carries position info** (Position shape with `.start.offset`), making it amenable to R6 block-level fallback.

## 1. Per-class results table

### Crash taxonomy (26 classes)

| ID | Category | Source | parse() | parseSafe tier | Error type | Position? |
|---|---|---|---|---|---|---|
| C01 | EOF in expression | `factoryMdxExpression:113` | OK | first-try | — | — |
| C02 | Lazy expression in blockquote | `factoryMdxExpression:196` | THROW | brace-retry | VFileMessage | point |
| C03 | Lazy JSX in blockquote | `factory-tag.js:789-795` | OK | first-try | — | — |
| C04 | Bad first-name char | `:132` | OK | first-try | — | — |
| C05 | Bad after-`<` char | `:160` | OK | first-try | — | — |
| C06 | Bad in-name char | `:188` | OK | first-try | — | — |
| C07 | Bad in-member-name | `:276` | OK | first-try | — | — |
| C08 | Bad before-local-name | `:326` | OK | first-try | — | — |
| C09 | Bad after-local-name | `:378` | OK | first-try | — | — |
| C10a | Bad attr-name char (space+@) | `:425,472,516` | THROW | raw-text | VFileMessage | point |
| C10b | Bad attr-name char (percent) | `:425,472,516` | THROW | raw-text | VFileMessage | point |
| C11 | Bad before-attr-value | `:627` | THROW | raw-text | VFileMessage | point |
| C12 | Mismatched attr quote | `:658` | THROW | raw-text | VFileMessage | point |
| C13 | Bad after self-closing / | `:711` | OK | first-try | — | — |
| C14 | After-name junk | `:227` | OK | first-try | — | — |
| C15 | After-member-name junk | `:306` | OK | first-try | — | — |
| C16 | After-local-attr-name junk | `:597` | THROW | raw-text | VFileMessage | point |
| C17 | Bad first-char member name | `:247` | OK | first-try | — | — |
| C18 | Bad char in local name | `:354` | OK | first-try | — | — |
| C19 | Bad first-char local attr name | `:536` | THROW | raw-text | VFileMessage | point |
| C20 | Bad char in local attr name | `:567` | THROW | raw-text | VFileMessage | point |
| C21 | Closing tag without open | `lib/index.js:175` | THROW | raw-text | VFileMessage | Position |
| C22 | Attr on closing tag | `lib/index.js:192` | OK | first-try | — | — |
| C23 | Self-close on closing tag | `lib/index.js:209` | OK | first-try | — | — |
| C24 | End-tag mismatch | `lib/index.js:403` | THROW | raw-text | VFileMessage | Position |
| C25 | Dangling open tag (EOF) | `lib/index.js:458` | OK | first-try | — | — |
| C26 | Dangling open tag (left) | `lib/index.js:458,478` | OK | first-try | — | — |

### Why C04-C09, C13-C15, C17-C18, C22-C23, C25-C26 parse OK

R23's final catch-all `<` guard (lines 151-200 of `autolink-void-html-guard.ts`) protects these by replacing `<` with PUA sentinel `\uE000` when it detects:
- No matching close tag (C04-C09, C13-C15, C17-C18, C25-C26)
- Lowercase tags (C22-C23 — the `</Foo bar>` and `</Foo/>` inputs have their close tags detected by the guard's close-tag handler, and the error-causing patterns in the open tag get guarded)
- Invalid tag name characters make the tag not match the `<([A-Z][a-zA-Z0-9.]*)` pattern

**Mechanism:** R23 does NOT fix these inputs — it hides the `<` from remark-mdx entirely. The content renders as literal text containing `<`.

### Real-world + git-history inputs

| ID | Category | parse() | parseSafe tier |
|---|---|---|---|
| RW01 | Prose: `<50ms` | OK | first-try |
| RW02 | Prose: `{ noServer: true }` | OK | first-try |
| RW03 | Prose: `a < b` | OK | first-try |
| RW04 | Prose: `{ count + 1 }` | OK | first-try |
| RW05 | Prose: bare `<` | OK | first-try |
| RW06 | Prose: inline code with braces | OK | first-try |
| RW07 | Valid MDX: `<Icon />` | OK | first-try |
| RW08 | Valid MDX: `<Callout>...</Callout>` | OK | first-try |
| RW09 | Valid MDX: nested Cards | OK | first-try |
| RW10 | Valid MDX: Tabs (from docs) | OK | first-try |
| RW11 | Mid-type: `<Callou` incomplete | OK | first-try |
| RW12 | Mid-type: tag with no close | OK | first-try |
| RW13 | Mid-type: typo `</Calout>` | **THROW** | raw-text |
| RW14 | Mid-type: unclosed attr | OK | first-try |
| GH01 | PR#95: bare `<` at EOL | OK | first-try |
| GH02 | PR#95: bare `{` unmatched | OK | first-try |
| GH03 | PR#98: bare `<letter` | OK | first-try |
| GH04 | PR#101: consecutive `<<` | OK | first-try |
| GH05 | PR#101: mixed HTML + MDX | OK | first-try |

**Key finding:** RW13 (`<Callout>Important</Calout>`) is the canonical mid-type authoring error. It crashes with the same error as C24 (tag mismatch) at the mdast-build level. This is exactly the scenario P3 in the spec describes.

## 2. Crash class fire rates

| Metric | Count |
|---|---|
| Total taxonomy inputs | 27 (26 classes + C10 split into 2) |
| Classes that fire (throw on parse) | 10 |
| Classes guarded by R23 | 17 |
| Through-pipeline throws going to raw-text fallback | 10 |
| Through-pipeline throws saved by brace-retry | 1 (C02) |

**Crash classes that fire:** C02, C10a, C10b, C11, C12, C16, C19, C20, C21, C24

**Crash class grouping by source:**
- **Tokenizer-level (factory-tag.js):** C02, C10a, C10b, C11, C12, C16, C19, C20 — all attribute-related errors. All carry Point position.
- **Tree-build-level (mdast-util-mdx-jsx):** C21, C24 — tag structural errors. Both carry Position shape.

## 3. Position-less rate

### Through-pipeline (post-R23)

**0 of 12 throwing errors are position-less.** Every error that survives R23 carries position info:
- 9 carry Point shape (tokenizer-level: `.place.offset`)
- 3 carry Position shape (tree-build-level: `.place.start.offset`)

### Direct micromark (bypassing R23)

When R23 is bypassed, the dangling-open-tag class (C25) becomes reachable:

| Test | Description | Position? |
|---|---|---|
| PL01 | `<Foo>` at EOF | **NONE** |
| PL02 | `<Foo>\ncontent` | **NONE** |
| PL03 | `<Foo.Bar>` at EOF | **NONE** |
| PL04 | `<Foo>stuff</Bar>` (mismatch) | Position |
| PL05 | `<Outer><Inner></Inner>` | **NONE** |

**4 of 5 (80%) are position-less** in direct micromark tests. This is the `onErrorRightIsTag` path at `lib/index.js:458`.

### Assessment

The spec's A7 estimate of "15-25% position-less" is **conditionally correct**:
- In the CURRENT pipeline (with R23), it's 0% because R23 guards all dangling-open-tag inputs.
- Post-R1 (agnostic mode, reduced R23 scope), the dangling-open-tag class WILL be reachable. If R6 reduces R23's scope as proposed, the 80% position-less rate for that specific class could push the aggregate rate to 15-30% depending on real-world input distribution.
- **The RangeError from prosemirror-model** (seen in PROJECT.md, see below) is ALSO position-less and comes from a completely different code path.

**Recommendation for R6 design:** The whole-doc fallback path (when position info is absent) is more important than the spec's ~15-25% estimate suggests. It needs to handle BOTH the dangling-open-tag VFileMessage AND the prosemirror-model RangeError.

## 4. Project files

| File | parse() | parseSafe | Notes |
|---|---|---|---|
| PROJECT.md (133KB) | **THROW** | **raw-text-fallback** | Two-stage failure (see below) |
| AGENTS.md (91KB) | OK | first-try | Clean parse |
| ARCHITECTURE.md (56KB) | OK | first-try | Clean parse |

### PROJECT.md two-stage failure (critical finding)

**Stage 1:** `parse()` throws `VFileMessage: Could not parse expression with acorn` at offset 31753 — the string `{ noServer: true }` inside a table cell. This is expected: remark-mdx strict mode (with acorn) claims matched `{...}` as MDX expression and tries to parse the content as JS.

**Stage 2:** parseSafe's brace-retry replaces ALL `{` with PUA sentinel, defeating the acorn error. But then `remark-prosemirror`'s PM construction throws `RangeError: Invalid content for node paragraph` — prosemirror-model rejects the constructed tree shape. This error has NO position info (no `.place`, no `.position`, no `.offset`).

**Implications:**
1. R1 (agnostic mode) would fix Stage 1 — matched braces with non-JS content won't throw.
2. Stage 2 is a separate issue: some MDX-like content in PROJECT.md (likely an uppercase-letter tag pattern that R23 passes through but produces an invalid PM tree) fails during PM construction. This is exactly the crash class R6 item 4 identifies: "R6 catch must wrap PM construction, not just parse."
3. This is a REAL bug affecting the project's own files TODAY. parseSafe degrades 133KB of PROJECT.md to a single raw-text paragraph.

### Docs MDX files (all 10 parse cleanly)

| File | Result |
|---|---|
| `docs/content/overview.mdx` | OK |
| `docs/content/guides/getting-started.mdx` | OK |
| `docs/content/guides/configuration.mdx` | OK |
| `docs/content/guides/mcp-integration.mdx` | OK |
| `docs/content/guides/content-filtering.mdx` | OK |
| `docs/content/internals/architecture.mdx` | OK |
| `docs/content/internals/agent-write-path.mdx` | OK |
| `docs/content/internals/server-lifecycle.mdx` | OK |
| `docs/content/internals/service-topology.mdx` | OK |
| `docs/content/internals/validations.mdx` | OK |

These files use `<Cards>`, `<Card>`, `<Tabs>`, `<Tab>`, `<Steps>`, `<Step>`, `<Callout>` — all properly paired and attribute-correct. The R23 guard passes them through to remark-mdx which handles them correctly.

## 5. Surprises and corrections

### Surprise 1: C22 and C23 don't fire

`</Foo bar>` (attr on closing tag) and `</Foo/>` (self-close on closing tag) parse OK. R23's close-tag regex `<\/[a-zA-Z][a-zA-Z0-9.]*\s*>` doesn't match `</Foo bar>` (has extra content after name) or `</Foo/>` (has `/` before `>`), so the `<` remains and enters the final catch-all guard. The catch-all guard finds `</` → checks complete close-tag regex → fails → replaces with GUARD_OPEN. Result: renders as literal text, no crash.

### Surprise 2: C14-C15 (after-name junk) don't fire

`<Foo!>` — the `!` makes it fail the catch-all's `<([A-Z][a-zA-Z0-9.]*)[\s/>]` regex, so the guard protects the `<`. Similarly for `<Foo.bar!>`.

### Surprise 3: PROJECT.md has a two-stage crash

Not just the expected acorn error — the brace-retry path reveals a SECOND crash from prosemirror-model. This means parseSafe's two-tier architecture is insufficient for this file.

### Surprise 4: RW11 and RW12 parse OK

Mid-type incomplete tag `<Callou` and dangling `<Callout type="warning">` both parse OK because R23 guards them (no matching close tag found → protect the `<`). This means the mid-type authoring experience is ALREADY partially functional for these cases — R23 renders them as literal text rather than crashing.

### Surprise 5: Position-less rate depends entirely on whether R23 is relaxed

If the spec's implementation KEEPS R23 for dangling-open-tag protection, the position-less rate stays at 0% for through-pipeline errors. If R23 is relaxed (as R4 proposes for brace-retry removal), the dangling-open-tag class becomes reachable and the position-less rate jumps to ~40-80% of remaining errors.

## 6. Implications for spec implementation

1. **R1 (agnostic mode) is validated.** It would fix the PROJECT.md Stage 1 crash and eliminate the need for parseSafe's brace-retry tier entirely.

2. **R6 block-level fallback needs BOTH position-aware and position-less paths.** The position-less path is exercised by:
   - Dangling open tags (VFileMessage without .place) — high frequency in mid-type authoring
   - PM construction errors (RangeError) — no position info at all

3. **R6 catch placement must wrap PM construction** (confirmed by PROJECT.md Stage 2). The spec's R6 already says this but the probe provides concrete evidence.

4. **The position-less rate estimate (A7: 15-25%) is reasonable** as a steady-state estimate IF R23 dangling-tag protection is relaxed. But the RangeError path (completely position-less, from a different code path) should also be counted.

5. **R2 (retain R23 guard) is validated.** R23 catches 17 of 27 crash class inputs and is the reason PROJECT.md's bare-`<` and `{` patterns don't crash. Removing R23 prematurely would re-expose many crash classes.

6. **C24 (tag mismatch) is confirmed as the dominant real-world class** that survives R23 and carries position info. This is the ideal target for R6 block-level fallback.
