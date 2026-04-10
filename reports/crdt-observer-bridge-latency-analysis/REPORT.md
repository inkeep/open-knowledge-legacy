---
title: "CRDT Observer Bridge Latency Analysis — Architecture Review & Best Practices Audit"
description: "Why bidirectional Y.XmlFragment↔Y.Text synchronization in Open Knowledge takes 400ms-7s per cycle. Compares against Yjs/TipTap ecosystem patterns, identifies architectural deviations, and ranks optimization opportunities by impact."
createdAt: 2026-04-09
updatedAt: 2026-04-09
subjects:
  - Yjs
  - TipTap
  - Hocuspocus
  - ProseMirror
  - Open Knowledge
topics:
  - CRDT latency analysis
  - observer bridge architecture
  - bidirectional sync performance
---

# CRDT Observer Bridge Latency Analysis

**Purpose:** Identify why the observer bridge in Open Knowledge takes 400ms-7s+ per sync cycle, whether the architecture follows Yjs ecosystem best practices, and what can be optimized.

---

## Executive Summary

The Open Knowledge editor maintains **two synchronized CRDT structures** — Y.XmlFragment (WYSIWYG) and Y.Text (source mode) — with bidirectional observers propagating changes between them. Stress testing reveals **non-linear scaling**: propagation takes 500ms at 2K lines but 7.4s at 10K lines (14.8x), with rapid sequential writes at 10K lines taking 37s per 5-write cycle.

**This dual-structure pattern is unique in the Yjs ecosystem.** No production Yjs editor (BlockSuite, Tiptap Collab, Outline, Milkdown) maintains a parallel Y.Text alongside Y.XmlFragment. They all use a single source of truth. The bidirectional sync introduces complexity — and performance costs — that the ecosystem has explicitly avoided.

**Key Findings:**
- **The dual-structure architecture is the root cause.** Every edit triggers a full markdown parse→serialize→tree-rebuild pipeline that no single-structure editor pays.
- **`updateYFragment` is O(N) per call** — full tree traversal, not incremental. At 10K nodes, this dominates.
- **`diffLines` (jsdiff) has catastrophic worst-case behavior** — documented 20,000x slower than diff-match-patch on pathological inputs.
- **The 300ms TYPING_DEFER_MS is NOT the primary bottleneck at scale** — it's <5% of the 7s large-realistic cycle. The serialization pipeline dominates.
- **Quick wins exist** without architectural change: swap diff library, eliminate redundant diffLines call, lazy re-serialize.

---

## Research Rubric

| Dimension | Priority | Depth |
|-----------|----------|-------|
| Latency pipeline breakdown (per-stage timing) | P0 | Deep |
| Ecosystem comparison (dual-structure vs single-structure) | P0 | Deep |
| updateYFragment scaling characteristics | P0 | Moderate |
| diffLines (jsdiff) scaling + alternatives | P0 | Deep |
| Debounce/defer best practices | P1 | Moderate |
| Markdown round-trip cost at scale | P1 | Moderate |
| Optimization recommendations ranked by impact | P0 | Deep |

---

## Detailed Findings

### 1. The Latency Pipeline (5 serial stages)

Every agent write or user edit triggers this sequence:

```
Agent write → Y.Text mutation (~0ms)
  → Observer B debounce (50ms wait)
    → Typing defer check (0-300ms wait)
      → mdManager.parse() — full markdown tokenization
        → schema.nodeFromJSON() — ProseMirror node construction
          → updateYFragment() — full tree diff + CRDT mutations
            → Re-serialize to update lastSyncedXmlMd
              → Observer A debounce (50ms wait)
                → mdManager.serialize() — tree→markdown
                  → diffLines() — Myers LCS for user delta
                    → Y.Text incremental update
```

**Evidence:** [evidence/stress-test-timing-data.md](evidence/stress-test-timing-data.md)

**Empirical timing by scale:**

| Scale | S1 propagation | S5 (5 rapid writes) | Dominant cost |
|-------|---------------|---------------------|---------------|
| 500 lines | 506ms | ~2.5s | Wait time (debounce + defer) |
| 2,000 lines | 504ms | ~5s | Wait time + parse/serialize |
| 10,000 lines | 7,449ms | 37,386ms | **Computation** (parse + tree rebuild + diff) |

The 14.8x jump from 2KL→10KL confirms non-linear scaling in the pipeline. At small scale, the architecture is fine (sub-500ms). At production scale (10K+ lines), it breaks down.

**Implications:** The spec's NFR target of "< 60s for observer stress suite" was missed (427s actual). This is not a test issue — it reflects genuine architectural cost.

### 2. Ecosystem Comparison: No One Else Does This

**Finding:** The dual-structure pattern (Y.XmlFragment + Y.Text with bidirectional observers) is unique to Open Knowledge. No production Yjs editor maintains a parallel Y.Text.

| Editor | CRDT Structure | Source Mode | Markdown |
|--------|---------------|-------------|----------|
| **BlockSuite/AFFiNE** | Y.Doc as sole source | No raw source mode | Export only |
| **Tiptap Collab** | Y.XmlFragment only | No raw source mode | Export only |
| **Outline** | Y.XmlFragment via y-prosemirror | No raw source mode | Import/export |
| **Milkdown** | Y.XmlFragment via y-prosemirror | No raw source mode | Parse/serialize layer |
| **Open Knowledge** | Y.XmlFragment + Y.Text + bidirectional observers | **Live source editing** | **Live bidirectional sync** |

**Evidence:** [evidence/ecosystem-best-practices.md](evidence/ecosystem-best-practices.md)

**Implications:** The dual structure exists because Open Knowledge offers live source mode editing (CodeMirror on Y.Text) alongside WYSIWYG (TipTap on Y.XmlFragment). This is a genuine product differentiator — but it comes with a unique performance cost that no one else has solved because no one else has tried.

**Decision trigger:** If source mode is dropped or made read-only, the entire observer bridge + Y.Text + diffLines pipeline can be removed. If source mode is a core feature (per spec: "PQ11 is LOCKED — batch mode is the product"), the dual structure is necessary and optimization must happen within it.

### 3. updateYFragment Scaling

**Finding:** `updateYFragment` from `@tiptap/y-tiptap` performs a full recursive tree comparison on every call. It is not incremental — it walks the entire document tree.

At 10K lines (~5K ProseMirror nodes), each `updateYFragment` call traverses all nodes, creates a fresh mapping (`new Map()`), and applies the minimal CRDT mutations. This is O(N) in document size per call.

**Evidence:** y-prosemirror [issue #113](https://github.com/yjs/y-prosemirror/issues/113) documents that remote edits produce transactions replacing the entire document. Community reports confirm "updates the mapping pretty aggressively."

**Implications:** Each Observer B fire at 10K lines pays full O(N) tree traversal cost. With 5 rapid writes (S5), that's 5 × O(10K nodes) = significant computation. This is inherent to the y-tiptap binding — not something we can optimize without forking the library.

### 4. diffLines (jsdiff) at Scale

**Finding:** The `diff` library's `diffLines` function uses Myers O(ND) algorithm where N = sequence length and D = edit distance. For mostly-aligned inputs, it's near-linear. For highly divergent inputs, it approaches O(N²).

A [documented benchmark](https://github.com/kpdecker/jsdiff/issues/239) showed jsdiff taking **133 seconds** where Google's diff-match-patch took **6.8ms** — a 20,000x difference on a pathological input.

Our `applyUserDelta` calls `diffLines` on the full markdown text every Observer A cycle. At 10K lines with small edits, this is likely near-linear. But the S5 rapid-write scenario (full document replacement 5× in quick succession) may trigger closer to worst-case behavior.

**Alternatives:**
- **google/diff-match-patch**: Character-level diff with pre-diff speedups. 20,000x faster on worst case. Well-maintained.
- **fast-myers-diff**: Optimized Myers for JS. Better constant factors than jsdiff.
- **Custom line-level diff**: Since we know the delta is "user typed a few characters," we could diff only the changed region using `lastSyncedXmlMd` as a hint.

### 5. Debounce and Typing Defer

**Finding:** No canonical debounce recommendation exists in the Yjs ecosystem. y-prosemirror applies changes synchronously (no internal debounce). Community uses 50-200ms for serialization tasks.

Our constants:
- **DEBOUNCE_MS = 50ms**: Conservative. Within ecosystem norms.
- **TYPING_DEFER_MS = 300ms**: Necessary to prevent `updateYFragment` from replacing the XmlFragment tree mid-typing. This is architecturally required by the dual-structure pattern — without it, user cursor position and in-flight edits are lost.

**At small scale (500L):** The 300ms defer + 50ms debounce dominate latency (~70% of the 506ms total).
**At large scale (10KL):** Computation dominates (~93% of the 7,449ms total). The defer is noise.

### 6. Markdown Round-Trip Cost

**Finding:** Prior research ([yjs-dual-key-shimmer-analysis](../yjs-dual-key-shimmer-analysis/)) measured markdown round-trip at <30ms for 50KB documents. Our stress tests at 10K lines (~200KB+) show the full pipeline (not just serialize, but serialize + parse + tree rebuild + diff) takes 7+ seconds.

The discrepancy: prior research measured **single function** cost. The actual pipeline chains **5 functions in sequence**, and `updateYFragment`'s O(N) tree walk compounds with `diffLines`'s O(ND) text diff.

---

## Optimization Recommendations (Ranked by Impact)

### Tier 1: Quick wins (no architectural change)

| # | Optimization | Estimated Impact | Effort | Risk |
|---|-------------|-----------------|--------|------|
| 1 | **Swap `diffLines` for `diff-match-patch`** | 2-100x on large content | Low (drop-in) | Low — same API shape |
| 2 | **Eliminate redundant `diffLines` call** — Observer A calls diff twice (incremental + user delta) | ~5-10ms per cycle | Low | Low |
| 3 | **Lazy re-serialize** — skip re-serialization when early-exit matches | Variable | Low | Low |
| 4 | **Reduce TYPING_DEFER_MS** from 300ms → 150ms | 150ms per cycle at small scale | Low | Medium — needs empirical validation |

### Tier 2: Medium effort (targeted refactoring)

| # | Optimization | Estimated Impact | Effort | Risk |
|---|-------------|-----------------|--------|------|
| 5 | **Regional diff** — use `lastSyncedXmlMd` to narrow diff to changed region only | 5-50x on large documents | Medium | Medium — correctness-sensitive |
| 6 | **Incremental updateYFragment** — fork y-tiptap to apply only changed nodes | 2-10x on large documents | High | High — custom CRDT binding |

### Tier 3: Architectural (requires design decision)

| # | Optimization | Estimated Impact | Effort | Risk |
|---|-------------|-----------------|--------|------|
| 7 | **Make source mode read-only** (display-only CodeMirror, no Y.Text writes) | Eliminates entire Observer B pipeline | Medium | Product decision — removes live source editing |
| 8 | **Modal architecture** (only one mode active at a time, pause observers) | Eliminates concurrent sync cost | Medium | Already recommended by prior research |
| 9 | **Migrate to Peritext/flat-text model** (Automerge 2.2 or Loro) | Eliminates dual-structure entirely | Very High | Full rewrite of CRDT layer |

---

## Limitations & Open Questions

### Not Measured
- Per-function profiling (`mdManager.serialize` vs `mdManager.parse` vs `updateYFragment` vs `diffLines`) — would require `performance.now()` instrumentation inside observers.ts
- Memory pressure at 10K+ lines (Y.Doc state vector growth)

### Out of Scope
- Multi-client stress (only single-client bridge tested)
- Disk bridge latency contribution
- Production deployment performance (dev mode only)

---

## References

### Evidence Files
- [evidence/stress-test-timing-data.md](evidence/stress-test-timing-data.md) — Layer A + Layer B timing data from stress suite
- [evidence/ecosystem-best-practices.md](evidence/ecosystem-best-practices.md) — Yjs ecosystem comparison + diffLines benchmarks

### External Sources
- [BlockSuite CRDT-native data flow](https://blocksuite.io/blog/crdt-native-data-flow.html) — single Y.Doc source of truth
- [y-prosemirror #113](https://github.com/yjs/y-prosemirror/issues/113) — updateYFragment full-tree replacement
- [jsdiff #239](https://github.com/kpdecker/jsdiff/issues/239) — diffLines 20,000x slower than diff-match-patch
- [diff-match-patch](https://github.com/google/diff-match-patch) — faster diff alternative
- [CommonMark round-trip discussion](https://talk.commonmark.org/t/can-ast-markdown-ast-round-trip-always-reproduce-the-original/3959)

### Related Research
- [yjs-dual-key-shimmer-analysis/](../yjs-dual-key-shimmer-analysis/) — shimmer dampening, round-trip stability proof
- [yjs-constrained-observer-sync/](../yjs-constrained-observer-sync/) — observer pattern best practices
- [source-toggle-architecture/](../source-toggle-architecture/) — modal architecture recommendation
- [markdown-roundtrip-fidelity-tiptap/](../markdown-roundtrip-fidelity-tiptap/) — @tiptap/markdown fidelity analysis
