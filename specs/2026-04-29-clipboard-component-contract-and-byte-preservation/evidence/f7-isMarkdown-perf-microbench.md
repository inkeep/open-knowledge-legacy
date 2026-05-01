---
date: 2026-04-29
type: empirical
sources:
  - "Code: packages/app/src/editor/clipboard/is-markdown.ts:17-45 (signal-count heuristic, current production)"
  - "Code: packages/core/src/markdown/index.ts (MarkdownManager.parse — pre-built unified+remark pipeline)"
  - "Code: packages/server/src/md-manager.ts (sharedExtensions instantiation pattern)"
  - "Code: packages/core/src/extensions/shared.ts (sharedExtensions list)"
  - "Bench script: packages/server/src/_microbench-isMarkdown.ts (run from server package; deleted post-bench — committed to /tmp/microbench-isMarkdown.ts as portable copy)"
  - "Spec: ./SPEC.md D8 + §15 Future Work / Identified (50-150x claim)"
  - "Audit finding: ./meta/design-challenge.md F7 (try-parse rejection rationale thin)"
---

# F7 — `isMarkdown` perf microbench: signal-count vs try-parse-and-validate

**Goal.** Verify the perf claim in SPEC §10 D8 / §15: try-parse-and-validate is "50-150x slower" than signal-count regex heuristic. Audit finding F7 flagged this as unverified.

**TL;DR.**
- Measured aggregate ratio: **~1380x** (try-parse / signal-count). Roughly **10x worse than the spec's claimed range** in absolute speedup, but on much smaller absolute numbers — the claim was directionally right but understated by an order of magnitude.
- **Perf rejection holds — but barely, and not for the reason the spec gives.** Worst-case try-parse is 8.99ms on a 120-line synthetic README; aggregate average is 1.0ms/call. Both fit comfortably within OK's 250ms p95 paste budget (28x headroom worst-case, 250x average). The "perf budget" framing is technically wrong: try-parse fits.
- **The "same false-positive shape" claim is FALSIFIED on the corpus.** Signal-count and try-parse disagree on 2 of 10 fixtures, and the disagreement is exactly the cross-machine D4 cases D8 wants to recover via new regex signals: single-line `<img>` JSX and single-line `<Callout>` JSX. Try-parse classifies them as markdown (because mdManager.parse produces a `jsxComponent` node, which is non-trivial structure); signal-count rejects them.

This is non-trivial: D8 is adding 5 new regexes to recover behavior that try-parse gets for free via the canonical pipeline. The decision to keep signal-count is still defensible (constant-time, no allocation, no JIT cliff) but the rejection rationale should be rewritten — perf is not the load-bearing reason.

---

## Setup

Bench script wrapped two implementations:

**A. Signal-count** — the current production implementation copied verbatim from `packages/app/src/editor/clipboard/is-markdown.ts:17-45` (8 regex tests + line-count threshold).

**B. Try-parse** — invokes `MarkdownManager.parse(text)` and inspects the resulting JSONContent for non-trivial structure:

```ts
function isMarkdownByParse(text: string, manager: MarkdownManager): boolean {
  if (!text) return false;
  try {
    const json = manager.parse(text);
    const content = json.content ?? [];
    if (content.length === 0) return false;
    return content.some((node) => {
      if (node.type !== 'paragraph') return true;
      const inner = node.content ?? [];
      return inner.some((c) => {
        if (c.type !== 'text') return true;
        if (Array.isArray(c.marks) && c.marks.length > 0) return true;
        return false;
      });
    });
  } catch {
    return false;
  }
}
```

The "non-trivial structure" criterion mirrors the Milkdown / Keystatic / BlockSuite pattern: if the parsed mdast (rendered through `MarkdownManager.parse` → JSONContent) contains any block other than a plain paragraph, OR a paragraph with anything other than plain text (links, marks, jsxInline), classify as markdown.

**Manager construction.** Single shared `MarkdownManager` instance, built once outside the loop with `sharedExtensions`, mirroring the production singleton at `packages/server/src/md-manager.ts:27`. Pipeline pre-warmed with one call per fixture before timing (parse processor builds on first call; subsequent calls reuse the frozen processor per `parseProcessor`/`serializeProcessor` instance fields).

**Iterations.** 1000 per fixture. 50-iteration warmup before each timed run. Bun 1.3.11, Node 24.3.0, macOS arm64.

**Run command.**

```bash
cd packages/server && bun run --conditions=development src/_microbench-isMarkdown.ts
```

(Run from `packages/server` so the `@inkeep/open-knowledge-core` workspace symlink resolves. Bench script copy retained at `/tmp/microbench-isMarkdown.ts`.)

---

## Per-fixture results

Two consecutive runs produced near-identical numbers; the table below averages them.

| # | Fixture | Signals (ms/call) | Parse (ms/call) | Ratio | Signals→ | Parse→ | Agree |
|---|---------|-------------------|-----------------|-------|----------|--------|-------|
| 1 | plain prose | 0.28μs | 0.115ms | ~410x | false | false | yes |
| 2 | single-line `<img>` JSX | 0.09μs | 0.077ms | ~900x | false | true | **NO** |
| 3 | multi-line markdown w/ strong signals | 0.09μs | 0.214ms | ~2280x | true | true | yes |
| 4 | AI-chat copy-button output | 0.13μs | 0.271ms | ~2110x | true | true | yes |
| 5 | single-line `<Callout>` JSX | 0.08μs | 0.103ms | ~1270x | false | true | **NO** |
| 6 | Linear-style markdown | 0.09μs | 0.166ms | ~1770x | true | true | yes |
| 7 | outline-style markdown | 0.10μs | 0.153ms | ~1470x | true | true | yes |
| 8 | Notion-degraded text/plain | 0.09μs | 0.104ms | ~1170x | false | false | yes |
| 9 | mixed with raw HTML inline | 0.09μs | 0.085ms | ~940x | false | false | yes |
| 10 | long markdown doc (~120 lines) | 6.4μs | 8.93ms | ~1400x | true | true | yes |

**Aggregate.** 7.4ms total / 10 000 calls (signals) = **0.74μs/call avg**. 10 220ms total / 10 000 calls (parse) = **1.02ms/call avg**. Aggregate ratio ≈ **1380x**.

**Worst-case try-parse.** 8.99ms on the 120-line synthetic README. Paste budget 250ms p95 → **28x headroom worst-case**.

---

## Findings

### F7-1. Measured ratio is ~1380x, not 50-150x

The spec's "50-150x slower" claim understates by ~10x. The actual cost ratio is dominated by per-fixture parse cost (0.08-9ms) divided by per-fixture regex cost (0.08-6μs), and the geometric mean is closer to 1300x.

This is not load-bearing — the absolute parse cost is what matters for the budget question, not the ratio — but the rejection rationale should record the **actual** number, not an asserted ratio.

### F7-2. Try-parse fits in OK's paste budget

| Metric | Try-parse cost | OK paste budget (250ms p95) |
|---|---|---|
| Aggregate avg | 1.02ms/call | 0.4% |
| Worst-case (120-line doc) | 8.99ms/call | 3.6% |
| Signal-count aggregate | 0.74μs/call | 0.0003% |

Try-parse on the worst-case synthetic 120-line README still leaves ~241ms of the 250ms paste budget for the rest of the dispatcher (htmlToMdast, mdastToMarkdown, Y.Text chunking, PM tree construction, etc.). The "perf budget" framing in the D8 rejection ("50-150x slower") implies a perf cliff that does not exist on the corpus.

The genuine perf objection is one the spec doesn't make: **sub-millisecond constant-time vs millisecond JIT-dependent**. Signal-count's 0.74μs/call is allocation-free regex work that the JS engine optimizes to near-native; try-parse exercises the unified+remark pipeline with allocation per parse (mdast trees, PM nodes, position-slice walker, MDX scan). On low-power devices or under GC pressure the constant-factor advantage matters even when the absolute budget allows headroom. That is a real reason to keep signal-count, just not the one the Decision Log cites.

### F7-3. "Same false-positive shape" is empirically false on the corpus

Two of ten fixtures disagree, and the disagreement is exactly the cross-machine D4 case D8 is supposed to fix:

| Fixture | Signals | Parse | Why parse wins |
|---|---|---|---|
| `<img src="x.png" />` | false | true | mdManager parses to `jsxComponent(componentName='img')` — non-trivial mdast |
| `<Callout type="note">body</Callout>` | false | true | mdManager parses to `jsxComponent(componentName='Callout')` — non-trivial mdast |

**These are not edge cases.** The spec's D8 adds two new regexes (`/<[A-Z]\w*[\s\/>]/` for capitalized JSX, `/<[a-z]+\s+\w+="[^"]*"/` for lowercase JSX-with-attr) specifically to recover these classifications. Try-parse gets them for free because the canonical pipeline already understands JSX shape — the heuristic is duplicating semantic knowledge the parser already encodes.

The "same false-positive shape" claim is the inverse of what the corpus shows: signal-count has **false negatives** (rejects markdown shapes the parser accepts), and D8 is patching those false negatives by adding more regexes per shape. Each new descriptor introduces another false-negative class signal-count must absorb; try-parse absorbs them automatically.

### F7-4. False-positive shape on plain-prose-with-stray-syntax

The eight fixtures that agreed (1, 3, 4, 6, 7, 8, 9, 10) include both directions: plain prose (1, 8, 9) where both reject, and authored markdown (3, 4, 6, 7, 10) where both accept. The corpus didn't include adversarial inputs — e.g., `"Tom's *favorite* movie has 3. star ratings"` (false-positive risk for signal-count's emphasis + numbered-list signals; try-parse would also classify as paragraph-with-emphasis-mark, so true on both).

A more thorough false-positive investigation would need adversarial-input fixtures specifically designed to trip each side (signal-count's threshold edges; try-parse's mark-detection edges). That's outside this microbench's scope — the bench was sized to verify the perf claim, and the "same false-positive shape" claim falsified opportunistically on the corpus.

---

## Does the perf rejection hold?

**Verdict: NUANCED.**

- ❌ **Not on raw budget.** Try-parse fits (28x headroom worst-case, 250x headroom aggregate). The "50-150x slower" framing implies a perf cliff that doesn't exist.
- ✅ **On constant-factor / allocation discipline.** Signal-count is sub-microsecond, allocation-free, JIT-stable. Try-parse is millisecond-scale, allocation-heavy, JIT-dependent. On battery-constrained devices or under GC pressure, the constant-factor advantage still matters. That is a real argument the spec doesn't make.
- ❌ **"Same false-positive shape" is empirically false** on the corpus. Try-parse correctly classifies the two single-line JSX fixtures D8 is recovering via new regexes. The heuristic is duplicating semantic knowledge already encoded in the canonical parse pipeline.

**Recommendation.** Do not reopen try-parse based on this evidence — but **rewrite the D8 rejection rationale**:

1. **Drop the "50-150x slower" claim.** Replace with measured numbers: "0.74μs vs 1.02ms aggregate (~1380x), well within the 250ms paste budget."
2. **Drop the "same false-positive shape" claim.** It's empirically false. Replace with the actual reason: "every new descriptor adds a false-negative class signal-count must absorb via a new regex (D8 adds 2; D18 adds 1; future descriptors add N more). Try-parse absorbs these automatically because the canonical pipeline already understands the shapes. Trade-off: regex maintenance burden vs. JIT-stable constant-time discrimination."
3. **Surface the constant-factor argument.** Sub-microsecond regex on the paste hot path costs nothing on any device; millisecond parse cost is fine on a development laptop but under-tested on phones and under heap pressure.

If the constant-factor argument is acceptable for the v1 ship, signal-count remains the right choice — but the spec should record the rationale that actually holds, not the one that doesn't.

---

## Reproduction

The bench script is at `/tmp/microbench-isMarkdown.ts`. To re-run:

```bash
cp /tmp/microbench-isMarkdown.ts packages/server/src/_microbench-isMarkdown.ts
cd packages/server && bun run --conditions=development src/_microbench-isMarkdown.ts
rm packages/server/src/_microbench-isMarkdown.ts
```

The `--conditions=development` flag is required so the workspace's `development` export condition (raw TS) resolves instead of the prebuilt dist. Bench script lives in `packages/server/src/` (not `/tmp/`) so Bun's workspace resolver finds `@inkeep/open-knowledge-core`.

Two consecutive runs produced ratios 1378.1x and 1383.9x — variance under 0.5%. Numbers are stable enough for the rejection-rationale rewrite this evidence file recommends.
