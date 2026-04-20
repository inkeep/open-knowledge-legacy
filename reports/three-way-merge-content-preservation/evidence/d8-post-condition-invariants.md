# Evidence: D8 — Post-Condition Invariant Design

**Dimension:** Which content-preservation invariant (a/b/c/d) is correct for a three-way plaintext merge assertion? What do diff3 + DMP natively support? Precedent in git/Darcs/Pijul.
**Date:** 2026-04-16
**Sources:** Khanna-Kunal-Pierce 2007 (D3), node-diff3 source (D1), DMP source (D2), Pijul/Darcs theory (D7).

---

## Key sources referenced

- `d1-node-diff3-source-trace.md` — node-diff3 preserves content in classification; loss is in caller-resolver
- `d2-dmp-diff-main-and-patch-apply.md` — DMP `diff_main` is 2-way; cannot preserve 3-way content by itself
- `d3-academic-formal-characterization.md` — diff3 is not idempotent, not stable, not near-success
- `d7-production-systems-three-way-merge.md` — Pijul guarantees line-order, git does not

---

## The four candidate invariants

The user's prompt named four invariants (a) through (d). Re-stated precisely:

### (a) Character-multiset subset

> For every char c in mine or theirs, multiplicity in result ≥ multiplicity in (mine \ base) + multiplicity in (theirs \ base).

Formally: let `Δa = mine - base` (characters added by A above what's in base, as a multiset) and `Δb = theirs - base`. Then: `multiset(result) ⊇ base + Δa + Δb`. "Every character added by either side is preserved at least as many times as it was added."

### (b) Character-set subset

> For every unique char in (mine \ base) ∪ (theirs \ base), that char appears at least once in result.

Formally: let `chars(Δa ∪ Δb) = set of distinct chars newly inserted`. Then: for every c in that set, result contains c somewhere. Multiplicity doesn't matter.

### (c) Maximal-unique-substring subset

> Every maximal contiguous unique-to-mine (or -theirs) substring appears as a substring in result.

Formally: let `U_a = { s : s is a maximal contiguous substring of mine, s does not appear in base }`. Similarly `U_b`. Then: for every s in `U_a ∪ U_b`, s is a substring of result.

### (d) Three-way line/word identity

> For every line/word present in mine and absent in base, result contains it; same for theirs.

Formally: `lines(mine) \ lines(base) ⊆ lines(result)` and `lines(theirs) \ lines(base) ⊆ lines(result)`.

---

## Findings

### Finding F8.1: Invariant (a) — multiset — is too permissive for meaningful correctness

**Confidence:** CONFIRMED
**Evidence:** Counter-example construction.

Consider:
- `base = "Hello"`
- `mine  = "Hello, world!"`  (added ", world!")
- `theirs = "Hello! hi"`     (added "! hi")

Naive concatenation: `result = "Hello!, world! hi"`. Multiset check: `base + Δa + Δb = {H,e,l,l,o} + {',', ' ', 'w', 'o', 'r', 'l', 'd', '!'} + {'!', ' ', 'h', 'i'}`. The concatenation's multiset is a *superset* of this. Multiset (a) passes.

But: rearrange to `result = "Hello hi, world!"` (no `!` after hi). The multiset check fails by 1 `!`. Pass/fail is driven by *character count*, not *structure*.

**Problem:** multiset preserves total count but allows arbitrary rearrangement that's not structurally meaningful. A bridge that accidentally moves characters around without losing any would pass. This is useful as a *floor* (detects outright deletion) but too coarse to catch the interleaving failures we want to detect.

**Git/Darcs/Pijul precedent:** None of these systems test a multiset invariant. Git tests by conflict-marker emission; Darcs/Pijul by structural patch composition. Multiset is an academic-style weak invariant.

### Finding F8.2: Invariant (b) — character-set — is too weak

**Confidence:** CONFIRMED
**Evidence:** Counter-example construction.

Consider:
- `base = ""`
- `mine = "foo bar"`
- `theirs = "foo baz"`

Invariant (b) requires: every char in `{'f','o',' ','b','a','r','z'}` appears somewhere in result. A result of just `"foo bar z"` passes — but has lost the full structure. A result of `"z"` would fail (missing most chars), but `"fobarz"` would pass despite losing "o " structure.

**Problem:** character-set doesn't preserve order, multiplicity, or structure. It's trivially satisfied by almost any non-empty output. Only detects the most extreme content loss (complete removal of a character class).

**Git/Darcs/Pijul precedent:** Not used anywhere. Too weak for practical correctness assertion.

### Finding F8.3: Invariant (c) — maximal-unique-substring — is the right level of abstraction

**Confidence:** CONFIRMED
**Evidence:** Synthesis of fuzz oracle semantics + Pijul line-order guarantee + Peritext tombstone preservation.

Invariant (c) says: any contiguous block of text that's **unique to one side of the merge** (not present in base, not present in the other side) must appear verbatim in the result.

This maps to the natural "content the user wrote" notion:
- If A typed "A-only added " (a 14-character contiguous span that's nowhere in O or B), that span must be substringed in the merged result.
- Similarly for B's unique content.
- Common content from base doesn't need special preservation — it's in the result via the stable chunks.
- Common content present in both A and B (a false conflict) is trivially preserved (both sides have it).

**Why this is the right invariant:**
1. It catches the Bug-A / Bug-D class: if the bridge's `diff_main(mine, theirs)` collapses A's unique content by discarding it, then A's maximal unique substring (e.g., "A-only added ") is NOT a substring of result, and the invariant fires.
2. It's agnostic to *position*: A's unique substring can appear anywhere in result. This matches git's tolerance (line-order-swap produces content at different positions — Pijul considers this a bug, but if we're downstream of LCS-based merge, position shifts are part of the diff3 family's normal behavior).
3. It's verifiable in O(n) time: compute maximal unique substrings via suffix-array diff, then substring-search in result.

**Git/Darcs/Pijul precedent:** Pijul's line-order guarantee (F7.3) is a *stronger* form of (c) — Pijul preserves the maximal unique substring AND its relative order with surrounding context. (c) is the weakening that's achievable in state-based merge.

### Finding F8.4: Invariant (d) — line/word identity — is what the fuzz oracle currently tests

**Confidence:** CONFIRMED
**Evidence:** Fuzz oracle semantics — "marker prefixes (e.g., M5-) are preserved" corresponds to unique tokens.

The current fuzz oracle tests that specific line-level or word-level markers (like `M5-` that identify a specific write operation) appear in the final converged state. This is invariant (d) at word-level.

Invariant (d) is a *discretization* of (c): treat each line or word as atomic, require that every line unique to one side appears in result. Granularity is coarser than (c).

**Trade-off:**
- (d) is cheaper to compute (split to lines, set-subtract, check membership).
- (d) may miss sub-line content loss: if A changes line 5 from "foo bar" to "foo bar BAZ" and B changes it to "foo QUX bar", a merge that produces "foo bar" has lost both "BAZ" and "QUX" — but (d) at line-level only sees "foo bar" as a line that's in base and in result, so passes.
- (c) at substring-level would catch "BAZ" and "QUX" as unique substrings; they'd need to be in result.

**Git/Darcs/Pijul precedent:** Git's line-level merge operates at line granularity, and that's the natural granularity of line-oriented source code. For free-form markdown, (c) at character-substring granularity is strictly stronger.

### Finding F8.5: (c) is the strongest invariant that state-based merge can natively support

**Confidence:** INFERRED
**Evidence:** D3 evidence on diff3's locality theorem + Pijul's pushout structural guarantee.

State-based merge operates on snapshots. Given (A, O, B), the algorithm can compute:
- `diff(O, A)` — LCS-based diff identifies what A added vs. removed.
- `diff(O, B)` — similarly for B.

The content "A added" is well-defined in the diff output (the INSERT operations). An invariant at the "A added → present in result" level is **trivially checkable** post-merge. This is precisely invariant (c): A's unique added substrings must be in result.

But state-based merge cannot natively guarantee (c) under ALL interleavings — per D3 evidence F3.5 / F3.6, diff3 is not stable and not near-success. Adjacent interleavings can produce divergent results.

**So (c) is the RIGHT post-condition ASSERTION — not because state-based merge guarantees it, but because when (c) fails, we want to know.** The assertion fires exactly in the cases where state-based merge lost content, giving us an observable signal that the algorithm has reached its expressive limit.

### Finding F8.6: The post-condition and fuzz oracle should be the same invariant at different granularities

**Confidence:** INFERRED
**Evidence:** F8.3 + F8.4.

The fuzz oracle at word/line level (d) is a *coarser check* than the post-condition at substring level (c). If (c) passes, (d) passes (coarser is implied by finer). If (d) passes, (c) may or may not pass.

**Recommended design:**
- **Post-condition inside `mergeThreeWay`:** invariant (c) — maximal-unique-substring. Fires loudly when merge lost content, regardless of test setup.
- **Fuzz oracle:** invariant (d) — token-level markers. Easier to set up in tests, catches regressions at operational granularity.

These are **compatible**: (c) as the runtime safety net; (d) as the test-design contract. When the fuzz fires, (c) would also fire and give the precise substring that was lost.

### Finding F8.7: Pijul's pushout is the theoretical upper bound; (c) is the achievable floor

**Confidence:** CONFIRMED
**Evidence:** F7.3 + F7.4 — Pijul preserves line ORDER, not just line presence.

Pijul's guarantee is: lines appear in result in the same relative order they had in their source document. A purely state-based merge (including our hybrid) cannot guarantee order — Khanna-Kunal-Pierce Fig. 4 (D3 F3.4 / F3.6) shows state-based merge permutes content deterministically based on LCS choices.

**So the hierarchy is:**
- **Weakest:** (b) character-set (useless floor).
- **Weak:** (a) character-multiset (detects outright deletion).
- **Right level for plaintext three-way:** (c) maximal-unique-substring (detects contiguous content loss).
- **Fuzz operational:** (d) token/line presence (discretization of c).
- **Pijul theoretical upper bound:** (c) + order preservation (requires patch theory / CRDT).

**For the bridge:** asserting (c) is the ceiling of what's checkable. If (c) fails, we've hit the state-based merge's limit; the only structural escape is going to patch theory / CRDT-op-based merge (per D4, D5).

### Finding F8.8: The post-condition design choice — hard assertion vs. counter + log

**Confidence:** INFERRED
**Evidence:** Bridge assertion patterns in the broader codebase (e.g., `assertBridgeInvariant` in harness).

Two design options for the post-condition:
1. **Hard assertion:** throw on violation. Makes the bug impossible to miss; may cause test failures in fuzz runs.
2. **Counter + structured log:** emit `{event: 'content-loss', missing: substring, base, mine, theirs, result}` structured warnings; count occurrences. Keeps the bridge running but provides observability.

**Recommendation (for spec work, not this report):** start with **hard assertion** in dev builds / tests, counter + log in production. The assertion gives us the signal that state-based merge has reached its limit at a specific interleaving; the counter gives the production incidence rate.

---

## Negative searches

- Searched for formal correctness proofs of invariant (c) for diff3 outputs → NOT FOUND in the literature. The Khanna-Kunal-Pierce paper doesn't state an invariant in this form; they focus on locality / idempotence / stability.
- Searched for library-level support of post-merge content invariants → NOT FOUND. Neither node-diff3 nor DMP nor Yjs provides a built-in "verify no content lost" check. The application must compute it.

---

## Gaps / follow-ups

- The exact computational complexity of invariant (c): naive is O(n²) (substring search for each maximal unique substring). With suffix arrays, O(n log n). For bridge assertion, n is the document size — practical for typical markdown documents.
- Whether to check (c) at character level vs. grapheme-cluster level vs. Unicode-NFC-normalized — for our bridge, char-level is fine since we already normalize via trailing-whitespace stripping in `bridge invariant 1`. Grapheme-cluster would be needed for emoji/combining-mark correctness, but diff3 already has its own emoji normalization issues (D8 out of scope).
