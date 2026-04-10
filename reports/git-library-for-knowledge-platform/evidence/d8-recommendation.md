# Evidence: Recommendation Analysis

**Dimension:** D8 — Recommendation for specific use case
**Date:** 2026-04-02
**Sources:** Synthesis of D1-D7 findings

---

## Key files / pages referenced

- evidence/d1-in-memory-index.md — in-memory index capability
- evidence/d2-custom-refs.md — custom ref support
- evidence/d3-branch-operations.md — merge, squash, branch, tag
- evidence/d4-performance.md — latency data
- evidence/d5-ecosystem-health.md — maintenance status
- evidence/d6-production-systems.md — what others use
- evidence/d7-hybrid-approach.md — compatibility analysis

---

## Option Analysis

### Option A: isomorphic-git only
**Strengths:**
- In-memory tree building (critical safety property) — CONFIRMED
- Custom refs — CONFIRMED
- Annotated tags — CONFIRMED
- No subprocess overhead — best Windows performance
- No external dependency (no git binary required)
- Browser-compatible (not needed but nice)

**Weaknesses:**
- Merge implementation is broken for complex cases (no recursive strategy, issue open 7+ years)
- No native squash merge — must build from plumbing
- Performance issues with large repos without cache management
- Checkout can be slow for many files
- Smaller ecosystem, fewer contributors
- Building squash merge from plumbing on a broken merge foundation adds risk

**Dealbreaker potential:** Merge reliability. If the knowledge platform grows to have complex branching patterns (multiple merge bases), isomorphic-git will fail.

### Option B: simple-git only
**Strengths:**
- Full git CLI feature coverage (merge --squash, all strategies)
- 12M weekly downloads, production-proven
- TypeScript types, ergonomic API
- `.raw()` escape hatch for any git command
- Chosen by industry (VS Code pattern, GitHub Desktop pattern)

**Weaknesses:**
- Cannot do in-memory index manipulation natively
- Subprocess spawn overhead (1.5ms Linux, 10-161ms Windows)
- Requires git binary installed
- Achieving the critical safety property requires plumbing: `.raw(['hash-object', ...])` etc.

**Dealbreaker potential:** None, if plumbing commands are used for the hot path (WIP auto-commits).

### Option C: Hybrid (isomorphic-git hot path + simple-git cold path)
**Strengths:**
- Best of both: isomorphic-git for WIP auto-commits (in-memory, no spawn, no index)
- simple-git for branch operations (full merge support, squash, checkout)
- Each library used for its strength
- Graceful degradation: if isomorphic-git fails, simple-git plumbing is a fallback

**Weaknesses:**
- Two dependencies instead of one
- No documented precedent for this combination
- Must ensure both libraries' operations don't interfere
- Slightly more complex codebase

**Dealbreaker potential:** None identified. Both operate on the same .git format.

### Option D: Native git CLI (child_process directly)
**Strengths:**
- Maximum control
- No library dependency (just git binary)
- Full plumbing access

**Weaknesses:**
- Must build all ergonomics from scratch
- Error parsing, TypeScript types, etc. — all manual
- simple-git provides this with better DX

**Dealbreaker potential:** Development effort. simple-git already wraps this.

### Option E: nodegit / wasm-git / libgit2 bindings
**Strengths:**
- In-memory index via libgit2 (the gold standard)
- In-process, no subprocess

**Weaknesses:**
- nodegit: abandoned, build issues, no Node 20+ support
- wasm-git: niche, no TypeScript types, C-style API
- Both: poor ecosystem health

**Dealbreaker potential:** Maintainability. Using either is a liability.

---

## Decision Matrix

| Requirement | ig-only | sg-only | Hybrid | Native | libgit2 |
|------------|---------|---------|--------|--------|---------|
| In-memory index (critical) | YES | YES* | YES | YES* | YES |
| Custom refs | YES | YES | YES | YES | YES |
| Merge --squash | PARTIAL | YES | YES | YES | YES |
| Annotated tags | YES | YES | YES | YES | YES |
| Performance hot path | BEST | GOOD | BEST | GOOD | BEST |
| Performance cold path | POOR | GOOD | GOOD | GOOD | GOOD |
| Ecosystem health | OK | BEST | OK+BEST | N/A | DEAD |
| Maintenance risk | MED | LOW | LOW | LOW | HIGH |
| Windows compat | BEST | GOOD | BEST | GOOD | POOR |
| Dev complexity | MED | LOW | MED | HIGH | HIGH |

*YES with plumbing commands (hash-object + mktree + commit-tree + update-ref)

---

## Findings

### Finding: The hybrid approach (Option C) optimizes for both safety and reliability
**Confidence:** INFERRED
**Evidence:** Synthesis of D1-D7

The hybrid approach uses each library for what it does best:
- isomorphic-git: WIP auto-commits (runs every 30-60s, needs in-memory tree building, custom refs)
- simple-git: Draft lifecycle (user-triggered, needs reliable merge --squash, branch management)

This eliminates isomorphic-git's merge reliability risk while preserving its in-memory advantage.

### Finding: simple-git only (Option B) is the lowest-risk choice if Windows performance is acceptable
**Confidence:** INFERRED
**Evidence:** Synthesis of D1-D7

Using only simple-git with plumbing commands for WIP auto-commits achieves the critical safety property and provides full merge support. The trade-off is subprocess spawn overhead, which is negligible on Linux/macOS (<10ms) but potentially noticeable on Windows (<200ms). For a 30s interval, even the Windows overhead is acceptable.

**Implications:** If simplicity is valued over optimization, simple-git only is sufficient. The hybrid approach is an optimization, not a necessity.

---

## Gaps / follow-ups

* Prototype the isomorphic-git WIP auto-commit pipeline and measure actual latency
* Prototype the simple-git plumbing pipeline for comparison
* Test the hybrid approach with concurrent operations
