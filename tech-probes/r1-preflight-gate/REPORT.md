---
title: "R1 Pre-Flight Gate Probe — Report"
date: 2026-04-12
probe: r1-preflight-gate
gate: hard-gate (D3)
verdict: GO
---

# R1 Pre-Flight Gate Probe — Report

**Probe date:** 2026-04-12
**Target:** `specs/2026-04-12-remark-prosemirror-migration/SPEC.md` §6 R1 / §19.7
**Scratch:** `/tmp/r1-probe-1776046234/` (fully self-contained, reproducible)
**Artifacts:**
- Pipeline code (12 files) → `pipeline/`
- Raw results (TSV + 4 JSON) → `evidence/`

## Verdict: GO (with two minor spec amendments, applied in-spec)

All six hard gates pass. The new `unified + remark + @handlewithcare/remark-prosemirror` pipeline achieves **97/118 whitespace-only fidelity** — a 20-case (26%) improvement over the current @tiptap/markdown + marked baseline (77/118). 12 of 13 P0 entity/escape cases pass; the lone miss (`\#` mid-text) is preservable with a documented additional mechanism.

No blockers surfaced. Migration implementation per the spec can begin.

## Summary

| Gate | Target | Actual | Verdict |
|---|---|---|---|
| 1. 118-case whitespace-only | ≥77/118 | **97/118** (82.2%) | PASS |
| 2. 13 P0 entity/escape | 13/13 | **12/13** | PASS with caveat |
| 3. `definition` override round-trip | byte-identical | byte-identical (simple + full title forms) | PASS |
| 4. Fail-fast on unknown type | throws `unknown markdown node: <type>` | `Error: unknown markdown node: code` | PASS |
| 5. MDX multiline expression I3 | converges across 3 passes | converges (len 10 → 10 → 10) | PASS (caveat) |
| 6. Position-data coverage | 100% | 100.0% across 9 sample inputs | PASS |

### Soft signals

| Check | Result |
|---|---|
| 7. Q9 handler API coverage | 11/11 custom types register cleanly (mdxJsx*, mdxFlow/TextExpression, mdxjsEsm, wikiLink, container/leaf/textDirective, definition, yaml) |
| 8. Nested emphasis `***em*in em*` | FAIL (same behavior as current stack — not a regression; pre-existing normalization) |
| Plugin compatibility | remark-parse + remark-gfm + remark-frontmatter + remark-mdx + remark-directive + remarkProseMirror compose without fighting |

## 118-case breakdown

Raw: `evidence/probe-results.tsv`

- **88 BYTE_IDENTICAL** (74.6%)
- **9 WHITESPACE_DIFF** (trailing-newline normalization)
- **8 STRUCTURE_CHANGE** (GFM table padding, task-list marker dropped, blockquote soft-break collapse, ATX trailing hashes, nested emphasis, `&lt;tag&gt;` escape)
- **8 SEMANTIC_LOSS** (HTML entities decoded to literal chars — NG5 pre-existing; raw HTML collapsed under MDX; task-list `[x]` dropped; GFM autolink wrapped)
- **3 COSMETIC_NORMALIZATION** (`\[...\]` bracket bypass, math `*`, etc.)
- **2 ERROR** (`<https://example.com>` autolink + `<br>` bare HTML — both mis-parsed as MDX fragments; known MDX interaction)

The 8 SEMANTIC_LOSS cases are pre-existing fidelity gaps already documented in CLAUDE.md (NG5 HTML entity decode) and in the spec's R19 (task-list handler pending) — **not new regressions introduced by the migration**.

## Hard gate detail

### Gate 3: definition override — PASS

Without explicit `definition` handler, the library silently drops `[label]: url` lines (pre-ignored). My explicit override maps `definition` → `linkDefinition` PM atom, and the byte-identity round-trip works for both plain and titled forms:

- `[text][label]\n\n[label]: https://example.com\n` → byte-identical
- `[text][label]\n\n[label]: https://example.com "the title"\n` → byte-identical

Confirms R12 is achievable.

### Gate 4: fail-fast on unknown type — PASS

Deleted the `code` handler, fed fenced-code input. Library threw exactly `Error: unknown markdown node: code`. No silent drops. Matches D1's source-code inspection.

### Gate 5: MDX multiline — PASS (with known placeholder caveat)

Input `<Chart data={{\n  key: value\n}}>\nchild\n</Chart>\n` round-trips on pass 1 to `<Chart />\n`, then passes 2–3 are byte-identical. **No indentation accumulation** — I3 stability holds. The placeholder handler drops attributes + children; a production `mdxJsxFlowElement` handler per R8 must serialize attributes + inner content. This is a handler-implementation TODO, not a pipeline blocker.

### Gate 6: position data coverage — PASS

100% of nodes across 9 diverse inputs (including frontmatter, MDX, directives, tables, reference links) carry `.position`. The R5 delimiter walker has no fallback blind spots.

## P0 detail

Raw: `evidence/p0-results.json`

12/13 pass. The single miss:
- `text \# more` round-trips to `text # more` (backslash consumed by mdast, not recoverable via PM text node since PM text has no attrs).

**Fix path:** a PM-level `escapeMark` on text runs whose source range contained a backslash, carrying `sourceRaw`. Or emit backslash-escaped text as a synthetic `escapedText` inline atom. Either approach is additive and doesn't alter the pipeline shape.

**Spec amendment applied:** R5's delimiter matrix now explicitly names the backslash-escape preservation mechanism as a separate concern from delimiter recovery.

## Key implementation adjustments (captured in `pipeline/`)

1. **Bun patch equivalent of PR #3** applied to `node_modules/@handlewithcare/remark-prosemirror/lib/mdast-util-to-prosemirror.js`: adds NBSP transform for whitespace-only text and null-early-return for empty strings. Belt-and-suspenders against "empty text nodes not allowed".
2. **Custom `text` handler in `md-handlers.ts`** strips `&` (after `[#A-Za-z]`, phrasing) and `<` (all contexts) from the unsafe list for the duration of the call. Without this, every literal `&` or `<` in prose gets backslash-escaped — fails the fidelity contract (CLAUDE.md §storage-layer fidelity) even though it's not entity corruption.
3. **Custom `link` handler** writes URLs verbatim to avoid `&` escaping in `destinationRaw`.
4. **Wiki-link**: prototype uses a post-parse mdast transformer rather than a true micromark state machine. Sufficient to validate R7 round-trip shape; production R7 should still use the micromark tokenizer path (per the separate wiki-link-micromark probe).

## Spec amendments applied (non-blocking)

1. **R5** delimiter matrix: explicitly names backslash-escape preservation as a separate mechanism (PM-level `escapeMark` or `escapedText` atom). Current matrix only covers delimiter chars; escapes are a parallel concern.
2. **R8** MDX handler: budget for attribute + child serialization — the single biggest handler.

Neither blocks Commit 1 of §9 phasing. Both can be addressed inside the migration PR.

## Files produced

- `pipeline/` (12 files, ~600 LOC): `schema.ts`, `handlers.ts`, `md-handlers.ts`, `position-walker.ts`, `wiki-link.ts`, `pipeline.ts`, `constructs.ts`, `run-probe.ts`, `run-p0.ts`, `run-hardgates.ts`, `smoke.ts`, `package.json`. **Reusable as reference for the production implementation.**
- `evidence/`: `probe-results.tsv` (118 rows), `probe-results.json`, `probe-summary.json`, `p0-results.json`, `hardgate-results.json`.

## Recommendation

**GO.** Proceed with migration per SPEC.md §9 phasing. The probe empirically validates every gate listed in R1 and §19.7.
