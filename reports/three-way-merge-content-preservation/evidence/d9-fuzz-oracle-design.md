# Evidence: D9 — Fuzz-Oracle Design and Relationship to Post-Condition

**Dimension:** How does the existing fuzz oracle (substring "marker prefix" check) relate to invariant (c) at the post-condition level? Should the post-condition match the oracle, or be stronger/weaker?
**Date:** 2026-04-16
**Sources:** Property-based testing literature; D8 evidence on invariants; bridge convergence test patterns.

---

## Findings

### Finding F9.1: The fuzz oracle is invariant (d) at token granularity

**Confidence:** CONFIRMED
**Evidence:** D8 finding F8.4 — the fuzz oracle's "marker prefix preservation" is invariant (d) realized at token granularity.

The fuzz test injects N writers, each producing edits tagged with a unique prefix (`M0-`, `M1-`, ..., `MN-`). After convergence, the oracle asserts every prefix appears at least once in the converged state.

This is invariant (d):
- Each writer's `Mk-` prefix is a "line/word present in mine and absent in base."
- The oracle requires the prefix to appear in result.
- Same set-subtraction structure as (d).

### Finding F9.2: The post-condition (c) implies the fuzz oracle (d)

**Confidence:** CONFIRMED
**Evidence:** Logical strength relationship: (c) is finer-grained than (d).

If invariant (c) holds — every maximal unique substring is present in result — then in particular the markers (which are unique substrings) are present. So **(c) ⇒ (d) at any common granularity**.

Conversely, (d) does NOT imply (c): you can have markers preserved while sub-marker content is lost (F8.4).

**Implication:** if the post-condition (c) is added inside `mergeThreeWay` and it never fires, the fuzz oracle (d) cannot fire either. But (d) may fire if the test setup doesn't trigger (c) — e.g., test that loses sub-marker content but not the marker itself.

### Finding F9.3: They should be the SAME invariant at different granularities — not different invariants

**Confidence:** INFERRED
**Evidence:** Test-design + production-assertion design discipline.

Recommendation:
- **Inside `mergeThreeWay` (post-condition):** invariant (c) at character-substring granularity. Computes maximal unique substrings of mine and theirs vs. base, asserts each is a substring of result. Fires whenever ANY content is lost.
- **In fuzz oracle (test assertion):** invariant (c) at token granularity for the SPECIFIC tokens the test injected. The test knows what tokens it injected; it can check exactly those.

This is the standard "test-design contract" pattern: the post-condition is general; the test makes specific instances. They check the same property at different granularities.

### Finding F9.4: An overly-narrow oracle hides regressions

**Confidence:** INFERRED
**Evidence:** Fuzz testing best practice — coverage gates and oracle expressiveness.

If the fuzz oracle ONLY checks marker prefixes, it can pass while sub-marker content is silently lost. Example: writer M5 inserts `M5-foo bar baz`. After merge, result contains `M5-foo` but not `bar baz`. Oracle (d) passes; (c) would catch the loss.

**Recommendation:** the fuzz oracle should ALSO check the full payload of each marker, not just the prefix. This narrows the gap between (d) and (c) at test-time.

### Finding F9.5: There's value in BOTH a post-condition AND a fuzz oracle, even if they check the same property

**Confidence:** INFERRED
**Evidence:** Defense-in-depth testing patterns.

The post-condition (c) inside `mergeThreeWay` fires on EVERY merge call in production and tests. The fuzz oracle fires only in fuzz tests with specific seeded inputs.

Both are useful:
- **Post-condition:** catches production bugs nobody designed a test for. Can be disabled in hot paths if perf matters; should NEVER be disabled in tests.
- **Fuzz oracle:** explores the input space the post-condition's runtime check can't reach (because no one ever ran that input).

If they're aligned to the same invariant, neither is redundant — they have different coverage.

### Finding F9.6: Property-based testing literature supports invariant convergence

**Confidence:** CONFIRMED
**Evidence:** PBT references — Hypothesis (Python), Hedgehog (Haskell), fast-check (TypeScript).

PBT best practice: define ONE invariant, then test it on shrunk inputs across many seeds. The invariant is the contract; the seeds are the exploration. If the invariant is too weak (only checks markers), the PBT explores ineffectively (passes inputs that should fail). If the invariant is appropriately strong (checks all unique content), PBT finds counter-examples reliably.

For this bridge: invariant (c) is the right PBT invariant to drive seed exploration. The current "marker prefix" oracle is a subset that explores the input space less efficiently.

---

## Negative searches

- Searched fast-check / Hypothesis docs for "merge property" patterns → NOT FOUND a canonical pattern; the literature trends toward "invariant + shrinker" not "merge-specific oracle."
- Searched bridge / CRDT testing literature for similar patterns → Y-tests, Automerge property tests use convergence-only invariants (every replica reaches same state) rather than content-preservation. Those tests assume the underlying CRDT preserves content structurally; they verify convergence atop that.

---

## Gaps / follow-ups

- The bridge fuzz tests today have an oracle that's at marker-prefix granularity. Tightening it to full-marker-payload would converge the fuzz oracle's strength toward invariant (c). This is a small change with significant coverage value.
- An alternative: the fuzz oracle could be derived FROM the post-condition — instead of hard-coding marker checks, the test could capture A's edit, B's edit, and assert (c) directly. This is more general but requires the test to understand the merge's semantic input.
