# Changelog

## 2026-04-07 — Bidirectional file-CRDT sync analysis (Path C update)
**Update type:** Additive
**Why this pass happened:** Investigate updateYFragment behavior under concurrent mutations, feedback loop prevention, and CRDT → disk latency floor for the bidirectional file sync architecture (CC1 Path 3).

### Scope (delta only)
- Dimension 8: updateYFragment concurrent mutation behavior (source code trace)
- Dimension 9: Feedback loop prevention (CRDT → disk → watcher → CRDT)
- Dimension 10: CRDT → disk persistence latency floor (<500ms feasibility)

### What changed (current-state)
- REPORT.md — sections added: Dimensions 8, 9, 10 in Detailed Findings; rubric table extended; executive summary updated with three new key findings; limitations section expanded with three-way merge gap, serialization benchmarks, and y-prosemirror v2 note; references expanded with 7 new external sources
- Evidence — added: `updateyfragment-concurrent-mutations.md`, `crdt-disk-latency-floor.md`, `feedback-loop-prevention.md`
- Frontmatter — updatedAt set to 2026-04-07; subjects added: y-prosemirror, @parcel/watcher; topics added: bidirectional file sync, concurrent mutation safety; description expanded

### Notes on confidence / contradictions
- The clobber finding (Dimension 8) is CONFIRMED via source code analysis of updateYFragment
- Serialization cost estimates (Dimension 10) are INFERRED — no published benchmarks exist for prosemirror-markdown serialization throughput
- The y-prosemirror v2.0.0 (in local oss-repos) uses a fundamentally different delta-based approach. Whether it has the same clobbering characteristics is an open question.

### Open questions / gaps
- Three-way merge for ProseMirror documents: no off-the-shelf solution exists. Building one is the highest-complexity mitigation for the clobber problem.
- y-prosemirror v2.0.0 concurrent behavior: untested for the clobber scenario
- Actual serialization benchmarks needed before committing to sub-200ms persistence
