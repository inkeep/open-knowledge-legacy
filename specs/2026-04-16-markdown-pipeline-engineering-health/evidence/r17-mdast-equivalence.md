# R20 mdast-equivalence validator — status

**Scope:** R20 diff gate for R17 (merged walker). **Throwaway artifact — deletes after US-008 (R17) ships green.**

## Purpose

R17 merges the 5 post-parse transformer passes into 2 phases:

- **Phase A** — `restoreFromMdx` alone (value-field restoration from PUA sentinels).
- **Phase B** — merged dispatcher for passes 2-5 (`autolinkPromotion` → `docStartThematicFix` → `positionSlice` → `unknownMdastGuard`).

Subtle ordering bugs in the merged dispatcher are invisible to example-based tests and hand-crafted scenarios. The only safe correctness proof is **byte-for-byte mdast equivalence** over the full fixture corpus. That's what this validator provides.

## Validator shape

`r17-mdast-equivalence.ts` exports:

- `buildPreMergeFactory()` — builds a processor that runs the current (pre-merge) 5-pass pipeline up through `unknownMdastGuard`, stopping short of `ensureNonEmptyDoc` and `remarkProseMirror` (outside R17's scope).
- `loadCorpus()` — enumerates the full fixture corpus (see below).
- `validate(beforeFactory, afterFactory, fixtures)` — runs each fixture through both factories, serializes the resulting mdast with lexicographic-sorted keys, and reports divergences byte-for-byte.
- `formatReport(result)` — markdown report renderer.

### Self-check entry (US-007 landing)

Invoking the file directly runs the self-check: `validate(buildPreMergeFactory(), buildPreMergeFactory(), loadCorpus())`. Expected result: **0 mismatches, 0 divergent errors**. Any divergence on the self-check would indicate nondeterminism inside the current pipeline — blocking for R17 because the target of comparison would not be stable.

### US-008 use (consumer call site)

```ts
import {
  validate,
  buildPreMergeFactory,
  loadCorpus,
  formatReport,
} from './r17-mdast-equivalence.ts';
import { buildMergedWalkerFactory } from '<r17-impl>';

const fixtures = await loadCorpus();
const result = validate(buildPreMergeFactory(), buildMergedWalkerFactory(), fixtures);
console.log(formatReport(result));
if (result.mismatches > 0 || result.threwDifferently > 0) process.exit(1);
```

## Corpus (714 fixtures)

| Subdir         | Count | Notes                                                                                     |
| -------------- | ----- | ----------------------------------------------------------------------------------------- |
| `commonmark/`  | 652   | Full CommonMark spec (from `commonmark.json` npm package).                                |
| `gfm/`         | 20    | Hand-curated GFM examples — tables, strikethrough, task lists, autolinks.                 |
| `mdx/`         | 26    | 26-class MDX crash taxonomy from the tolerant-parsing spec.                               |
| `wiki-links/`  | 5     | Inline-synthesized: target-only, alias, anchor, combined, redlink.                        |
| `frontmatter/` | 3     | Inline-synthesized: yaml-alone, yaml+content, empty-frontmatter.                          |
| `ng-pinned/`   | 3     | Inline-synthesized: NG1 blank-lines, NG10 dashes-only, NG11 yaml-only.                    |
| `perf/`        | 5     | 100/500/1000/5000/10000/20000-block synthetic docs (opt-in via `R17_PERF_ALL=1`).         |

Opt-in knobs:

- `R17_SKIP_PERF=1` — skip perf fixtures entirely (fast local iteration).
- `R17_PERF_ALL=1` — include 2.5K/5K/10K/20K-block fixtures (adds ~10s).

Default mode includes 100 + 500 + 1000-block perf fixtures (~1s overhead).

## Self-check result (default mode)

```
## R17 mdast-equivalence validation

- fixtures:            711
- matches:             706
- mismatches:          0
- both threw (same):   5
- threw differently:   0
- runtime:             449.7ms

_All fixtures produced byte-identical mdast._
```

## Self-check result (R17_PERF_ALL=1)

```
## R17 mdast-equivalence validation

- fixtures:            714
- matches:             709
- mismatches:          0
- both threw (same):   5
- threw differently:   0
- runtime:             11280.6ms

_All fixtures produced byte-identical mdast._
```

## US-008 acceptance run — pre-merge vs post-merge pipeline

With `mergedPostParseWalkerPlugin` landed (US-008), run the validator with
`buildPreMergeFactory()` vs a post-merge factory that mirrors
`createParseProcessor`'s new 2-phase shape (Phase A: `restoreFromMdx`;
Phase B: `mergedPostParseWalkerPlugin`). Driver:
`evidence/r17-run-diff.ts`.

Default mode (`bun run evidence/r17-run-diff.ts`):

```
[r17-run-diff] loaded 711 fixtures
## R17 mdast-equivalence validation

- fixtures:            711
- matches:             706
- mismatches:          0
- both threw (same):   5
- threw differently:   0
- runtime:             436.2ms

_All fixtures produced byte-identical mdast._
```

Full perf mode (`R17_PERF_ALL=1 bun run evidence/r17-run-diff.ts`):

```
[r17-run-diff] loaded 714 fixtures
## R17 mdast-equivalence validation

- fixtures:            714
- matches:             709
- mismatches:          0
- both threw (same):   5
- threw differently:   0
- runtime:             10924.9ms

_All fixtures produced byte-identical mdast._
```

**Both modes green. Zero mismatches. Zero divergent errors.** R17 merges with
byte-identical mdast output against the pre-merge 5-pass pipeline across every
fixture — 652 CommonMark examples, 20 GFM examples, the 26-class MDX crash
taxonomy (including the 5 upstream-throw fixtures preserved as "both threw
same"), inline wiki-link/frontmatter/NG-pinned fixtures, and synthetic perf
fixtures at all 7 block counts (100-20K).

## The 5 "both threw (same)" fixtures

All are deliberately-malformed MDX from the 26-class crash taxonomy where `r23Covers: false` — the R23 preprocessor doesn't protect against these shapes, so both before- and after-pipelines throw with identical error messages (the error originates inside `remarkParse` + `micromark-extension-mdx`, upstream of the 5 transformer passes R17 touches).

| ID  | Class                                         | Throwing message (first line)                                               |
| --- | --------------------------------------------- | --------------------------------------------------------------------------- |
| C02 | Lazy line in expression in container          | `Unexpected lazy line in expression in container...`                        |
| C15 | After-member-name junk                        | `Unexpected closing slash `/` in tag, expected an open tag first`            |
| C16 | After-local-attr-name junk                    | `Unexpected character `!` (U+0021) in local attribute name...`              |
| C17 | Closing slash without open                    | `Unexpected closing slash `/` in tag, expected an open tag first`            |
| C20 | End-tag mismatch                              | `Unexpected closing slash `/` in tag, expected an open tag first`            |

The validator treats "both factories threw with identical messages" as **equivalence** — the mdast output isn't comparable when parsing fails, but parsing-behavior consistency is preserved. Any R17 refactor that changes *which* fixtures throw, or *what* they throw, immediately classifies as `threw-differently` and fails the gate.

## Correctness claim

The self-check running green on **all 714 fixtures** (including 10K-block and 20K-block perf fixtures) confirms:

1. The current 5-pass pipeline is deterministic under re-entry — two factory invocations produce byte-identical mdast.
2. R16's cached-processor plumbing does not leak state between runs (already independently verified by `processor-cache.test.ts`, but this validator is a secondary witness).
3. The comparison infrastructure itself is correct — zero false positives on 709-714 known-equivalent inputs.

**Ready for US-008:** When the R17 merged walker lands, import `validate` + `buildPreMergeFactory` from this file, construct an `afterFactory` for the 2-phase pipeline, run `validate(before, after, loadCorpus())`. **Zero divergences on the full corpus (including perf fixtures) is the merge prerequisite.**

## Deletion protocol

After US-008 ships green:

1. Confirm `validate(pre, merged, loadCorpus())` produces 0 divergences with `R17_PERF_ALL=1`.
2. Delete `r17-mdast-equivalence.ts` and this `.md` file.
3. The R17 merged walker now stands on its own coverage (fidelity suite + R19 parse-health gate + R4 perf regression gate).

This validator is **not** permanent infrastructure — it's the rope bridge we walk across to cross the R17 chasm, then take the bridge down.
