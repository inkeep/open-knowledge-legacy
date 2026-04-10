# Evidence: Multi-Agent Concurrent Update (D3)

**Dimension:** What happens when two agents update the same entry? Merge strategy for compiled truth.
**Date:** 2026-04-07
**Sources:** GBrain spec, ByteRover paper, distributed systems literature, CRDT research

---

## Findings

### Finding: GBrain defers entirely to SQLite WAL serialized writes
**Confidence:** CONFIRMED
**Evidence:** "SQLite handles concurrent reads and serialized writes at the scale of a personal knowledge base without breaking a sweat." WAL mode enabled. No application-level conflict resolution. Contradiction detection is handled by the maintain skill using temporal ordering of timeline evidence as tiebreaker.

**Implications:** For a single-user personal KB, serialized writes are sufficient. For multi-agent concurrent access, this is a bottleneck.

### Finding: ByteRover uses a sequential task queue to eliminate write-write conflicts
**Confidence:** CONFIRMED
**Evidence:** "A sequential, deduplicated task queue serializes all operations, eliminating write-write conflicts without file-level locking." Acknowledged tradeoff: "sequential task queue limits write throughput under concurrent load."

### Finding: CRDTs solve data-level consistency but not semantic coherence
**Confidence:** CONFIRMED
**Evidence:** CRDTs guarantee eventual consistency for data structures (sets, counters, registers). For prose-form compiled truth, CRDT merge may produce "syntactically valid but semantically incoherent output — two sentences that each make sense individually but contradict when placed together." CRDTs are best suited for compiled-truth metadata (version vectors, claim confidence scores) rather than prose content.

### Finding: Optimistic locking (CAS) is the pragmatic choice for knowledge systems
**Confidence:** INFERRED
**Evidence:** CAS pattern: read version N, synthesize, write if version still N, retry otherwise. Works well when concurrent writes are rare — which is the typical case for knowledge compilation (infrequent recompilation, not continuous editing). The ABA problem is mitigated by monotonically increasing version numbers.

### Finding: Three-way merge works for structured compiled truth, degrades for prose
**Confidence:** INFERRED
**Evidence:** Git's three-way merge auto-merges non-overlapping section changes. For free-form prose, two agents rewriting the same paragraph produce semantically distinct outputs that aren't diff-mergeable at the character level. This argues for heavily structured compiled-truth formats (sections with explicit headers, not flowing prose).

---

## Gaps / follow-ups

- No production system found that implements three-way merge on compiled truth
- Letta's MemFS (git-backed memory versioning) is the closest to branch-and-merge for agent memory, but specifics of merge conflict handling are undocumented
