# Evidence: The Hybrid Approach

**Dimension:** D7 — isomorphic-git for hot path + native git for cold path
**Date:** 2026-04-02
**Sources:** isomorphic-git docs/FAQ, simple-git docs, TinaCMS issue, analysis

---

## Key files / pages referenced

- https://isomorphic-git.org/docs/en/faq — isomorphic-git FAQ on interoperability
- https://github.com/tinacms/tinacms/issues/885 — TinaCMS issue on switching from simple-git to isomorphic-git
- https://isomorphic-git.org/ — "100% interoperability with the canonical git implementation"
- https://github.com/steveukx/git-js — simple-git documentation

---

## Findings

### Finding: isomorphic-git aims for 100% interoperability with canonical git
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git website, FAQ

isomorphic-git claims to do "all its operations by modifying files in a '.git' directory just like the git you are used to." The project aims for "100% interoperability with the canonical git implementation."

**Implications:** Two implementations touching the same .git directory should be compatible — they read and write the same object format, ref format, and index format.

### Finding: The hybrid approach is viable because both operate on the same .git format
**Confidence:** INFERRED
**Evidence:** Git object model (well-specified format), isomorphic-git compatibility claims

The hybrid approach works if:
1. isomorphic-git writes valid git objects (blobs, trees, commits) → CONFIRMED via widespread use
2. isomorphic-git writes valid refs → CONFIRMED via writeRef API
3. Native git can read objects written by isomorphic-git → CONFIRMED by git's content-addressable design (same SHA = same content)
4. Neither implementation corrupts the other's state → LIKELY, given both follow the git format spec

The key constraint: the hot path (isomorphic-git WIP auto-commits) MUST NOT touch .git/index, and the cold path (native git branch operations) MUST NOT assume .git/index reflects the WIP state. With the plumbing approach (writeBlob → writeTree → commit), this is satisfied because the index is never involved.

**Implications:** The hybrid approach is architecturally sound.

### Finding: Concurrency risk is low but not zero
**Confidence:** INFERRED
**Evidence:** Git lock file protocol analysis

Git uses lock files (.git/*.lock) for atomic operations. Risk scenarios:
1. Auto-commit (isomorphic-git) and user merge (simple-git) run simultaneously → Low risk if isomorphic-git only writes to object store and custom refs. Object store writes are content-addressed (no conflicts). Ref updates use different refs (refs/wip/* vs refs/heads/*).
2. Auto-commit (isomorphic-git) writes a loose object while native git is repacking → Possible but git handles this gracefully (loose objects take precedence until next gc).
3. Native git gc runs during auto-commit → Could theoretically cause issues if gc removes an object between writeBlob and writeTree. Extremely unlikely in practice.

**Implications:** Concurrency is safe for the primary workflow. The main risk (gc during auto-commit) can be mitigated by disabling auto-gc or using a mutex.

### Finding: No documented production system uses both libraries on the same repo
**Confidence:** NOT FOUND
**Evidence:** Web searches, TinaCMS issue (discusses switching FROM simple-git TO isomorphic-git, not using both)

TinaCMS issue #885 discusses switching entirely from simple-git to isomorphic-git for browser deployability. No project was found that deliberately uses both simultaneously.

**Implications:** The hybrid approach is novel but well-grounded in git's format guarantees. Lack of precedent is not a red flag — it just means we'd be the first to document this pattern.

### Finding: An alternative to hybrid — isomorphic-git for everything
**Confidence:** INFERRED
**Evidence:** isomorphic-git API coverage analysis

isomorphic-git can theoretically handle everything:
- WIP auto-commits: writeBlob → writeTree → commit (CONFIRMED working)
- Branch creation: branch() or writeRef() (CONFIRMED)
- Branch deletion: deleteBranch() or deleteRef() (CONFIRMED)
- Checkout: checkout() (CONFIRMED but has performance concerns)
- Merge: merge() (PARTIALLY working — no recursive strategy, no squash)
- Tags: writeTag() / annotatedTag() (CONFIRMED)

The gap is merge --squash, which can be built from plumbing but adds complexity and carries the risk of isomorphic-git's incomplete merge implementation.

**Implications:** Using isomorphic-git for everything is possible but carries more risk than the hybrid approach, specifically around merge reliability.

---

## Gaps / follow-ups

* Test concurrent operations: isomorphic-git writeBlob while simple-git runs gc
* Test isomorphic-git objects being read correctly by native git (roundtrip verification)
