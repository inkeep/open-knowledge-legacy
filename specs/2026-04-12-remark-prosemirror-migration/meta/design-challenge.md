# Design Challenge Findings

**Artifact:** specs/2026-04-12-remark-prosemirror-migration/SPEC.md
**Challenge date:** 2026-04-12
**Total findings:** 7 (3 high, 3 medium, 1 low)

---

## High Severity

### [H] Finding 1: Phantom evidence — the spec's primary cited report does not exist

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §1 (Problem Statement), §9 (Alternatives Considered), A3, A7, Decision Log D1
**Issue:** The spec cites `reports/tokenizer-comparison-micromark-vs-marked/REPORT.md` as primary evidence in 5 places — the "greenfield comparison that concluded remark wins." This report does not exist in this worktree, any other worktree, or anywhere in the repository (confirmed via recursive `find` across all worktrees and `reports/`). The spec treats the conclusion "architecturally better on every axis" as established fact, but the underlying evidence artifact is unverifiable.

**Current design:** "The comparison report concluded that in a **greenfield** frame, `unified + remark + @handlewithcare/remark-prosemirror + micromark` is architecturally better on every axis except empirically-tested fidelity-on-our-118-catalog." (§1, Complication)

**Alternative:** The only verifiable evidence for the ecosystem comparison is `reports/markdown-roundtrip-fidelity-tiptap/evidence/d2-ecosystem-comparison.md` — and that file concludes the **opposite**: "@tiptap/markdown v3 is the right choice for TipTap-based projects despite marginally lower fidelity" (confidence: INFERRED). The d2 evidence file explicitly lists remark-prosemirror weaknesses (not integrated with TipTap, smaller ecosystem, no live test, no published test suites, no production systems found) and recommends staying on @tiptap/markdown.

**Trade-off:** If the tokenizer-comparison report was generated in a conversation but never persisted to disk, the spec's central framing rests on evidence that cannot be reviewed, challenged, or re-verified. The only extant evidence supports the predecessor spec's rejection.

**Status:** CHALLENGED
**Suggested resolution:** Either locate and persist the tokenizer-comparison report (if it exists in a conversation transcript), or re-derive the greenfield conclusion from verifiable evidence. If the conclusion cannot be re-derived, the Complication's claim needs to be softened from "concluded architecturally better on every axis" to an honest assessment of what verifiable evidence actually shows.

---

### [H] Finding 2: remark-prosemirror maturity risk is understated — 0.1.5 with no production precedent for TipTap

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §10 D1, §12 A2, §14 Risks, §15 Future Work (vendor note)
**Issue:** The spec treats `@handlewithcare/remark-prosemirror` as a low-risk dependency: D1 says "confirmed small (~300 LOC) and forkable if needed; ex-NYT Oak maintainer; handler API fits our schema." But the library is version **0.1.5** with **~1K weekly npm downloads**, **29 GitHub stars**, **26 total commits**, and **no published round-trip fidelity test suite** (per d2-ecosystem-comparison.md negative searches). The spec's own prior evidence says "no production systems using remark-prosemirror with TipTap found." The claim "ex-NYT Oak maintainer" appears nowhere in the codebase's evidence files — it is unverifiable from the artifact.

The risk table lists "remark-prosemirror 0.x breaking change" as Low likelihood / Medium impact with mitigation "vendor the ~300 LOC library." But the library's npm size is **44.2 kB** (not ~300 LOC of vendorable logic) and it has **11 dependencies**. Vendoring means also vendoring or pinning its dependency tree.

**Current design:** "Pin exact version. Vendor the ~300 LOC library if upstream breaks us." (§14)

**Alternative:** The real mitigation portfolio should include: (a) exact version pinning (already planned), (b) a concrete assessment of what happens if remark-prosemirror's handler API changes in 0.2.0, (c) acknowledgment that vendoring means maintaining a fork of a library with 11 deps, not copying 300 lines, (d) a timeline for when vendoring would be triggered.

A skeptical SRE would flag: this migration replaces a battle-tested library (@tiptap/markdown, part of the TipTap ecosystem with active commercial backing) with a pre-1.0 library by a small collective. The spec's "forkable" claim understates the true maintenance surface.

**Trade-off:** The spec acknowledges this risk exists but calibrates it too optimistically. The actual risk profile is: you're betting the entire markdown pipeline on a library that has never been tested in production with TipTap, has no published test suites, and has a pre-1.0 semver contract (0.x means breaking changes without major bumps).

**Status:** CHALLENGED
**Suggested resolution:** (1) Verify the "~300 LOC" and "ex-NYT Oak maintainer" claims against the actual source. (2) Document the full dependency tree of remark-prosemirror. (3) Add a pre-flight probe step that exercises the handler registration API for all 14+ node types to validate A2 before committing to migration code. (4) Explicitly accept the risk that you're replacing commercial-backed infrastructure with a community 0.x library, or document a concrete fallback path that's more detailed than "vendor it."

---

### [H] Finding 3: The MDX indentation-drift defect (mdx-js/mdx#2533) is acknowledged in prior research but absent from the spec's risk table and acceptance criteria

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 R8, §14 Risks, §7 Success metrics
**Issue:** The `mdx-crdt-roundtrip-fidelity` report documents a **CRITICAL DEFECT** in remark-mdx: multiline expression values gain +2 spaces of indentation per parse/serialize cycle. This does NOT converge — it's the only non-converging defect among 23 MDX edge cases tested. The upstream issue (mdx-js/mdx#2533) was closed as "expected behavior."

The spec makes MDX an explicit sprint goal (D13) and lists R8 (MDX support via remark-mdx) as P0. Yet the risk table (§14) does not mention the indentation-drift defect at all. The acceptance criteria for R8 say "Verify existing JSX round-trip tests pass" but don't address whether multiline expressions are in the test set.

This matters because: (a) the fidelity invariants I1 (identity) and I4 (idempotence) should catch non-converging constructs, and (b) if multiline JSX expressions appear in real user content (e.g., `<Chart data={{\n  key: value\n}}>`) every save cycle will silently corrupt them. The spec's own fidelity contract says "I3: Normalization canonicality — f(f(x)) === f(x)" — the drift defect violates I3.

**Current design:** R8 acceptance: "Delete `jsx-tokenizer.ts` (all 3 version variants). Verify existing JSX round-trip tests pass."

**Alternative:** Add the indentation-drift defect to the risk table with specific mitigation (custom mdast-util-mdx-expression handler that strips accumulated indent before serializing, or a pre-normalization pass on load). Add an acceptance criterion to R8: "multiline JSX expression attributes do not accumulate indentation across round-trips." Add test cases covering multiline expressions from the MDX report's 23-case edge set.

**Trade-off:** If the defect is left unaddressed, the fidelity invariant I3 will fail for multiline MDX expressions, and user content with complex JSX props will silently corrupt. If addressed with a custom handler, it adds implementation scope to what the spec frames as "delete custom code, use library defaults."

**Status:** CHALLENGED
**Suggested resolution:** Add the indentation-drift defect to §14 with explicit mitigation strategy. Add "multiline JSX expression round-trip stability" to the 118-case probe or as a separate MDX-specific invariant test. Decide whether the mitigation is a custom serialization handler (in scope) or a documented NG (which would need user sign-off given MDX is a sprint goal).

---

## Medium Severity

### [M] Finding 4: The "simpler alternative" — targeted remark-stringify-only swap — was not evaluated

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §9 (Alternatives Considered), §10 Decision Log
**Issue:** The predecessor spec's I1 survey recommended remark as a "REFERENCE for test oracle" and noted that remark-stringify "solves our P0 entity bug — but only if we replace the entire serialize layer." The current spec frames the choice as binary: either stay on the patched @tiptap/markdown stack or replace the **entire** parse+serialize pipeline with unified+remark+remark-prosemirror.

But there's a middle path not evaluated: keep `@tiptap/markdown` for **parse** (which works well — marked tokenizer achieves 91/118 on the probe), and swap only the **serialize** layer to `remark-stringify` via an mdast intermediary. This would:
- Solve the entity encoding problem (remark-stringify doesn't encode entities)
- Keep the existing TipTap extension integration for parsing (no handler rewrite)
- Keep the battle-tested marked tokenizer for custom syntax
- Still benefit from remark-stringify's configurable output
- Reduce the blast radius to the serialize path only

The Alternatives Considered section (§9) lists "Hybrid: marked for tokenization, custom serializer" as rejected because it "splits the pipeline, creates two maintenance surfaces, doesn't unblock MDX." But marked-parse + remark-serialize is not the same as a "custom serializer" — it uses two mature libraries, each doing what they're best at. And remark-mdx can still be registered on the serialize side.

**Current design:** "Migrate to prosemirror-markdown (markdown-it): Rejected. Hybrid: marked for tokenization, custom serializer: Rejected — splits the pipeline." (§9)

**Alternative:** Evaluate: keep @tiptap/markdown parse layer, add a ProseMirror-JSON → mdast → remark-stringify serialize path. This would be ~50% of the migration scope (serialize only), maintain TipTap extension compatibility for parsing, and still enable remark-stringify benefits. If the parse side later needs replacement, it can be done as a separate migration.

**Trade-off:** This approach retains the bun patch for the parse side (escape token handler) and the jsx-tokenizer for parse. It doesn't fully "delete" the custom code — it replaces about half of it. But it halves the blast radius, halves the timeline, and doesn't require betting on remark-prosemirror.

**Status:** CHALLENGED
**Suggested resolution:** Either evaluate this hybrid path and reject it with specific evidence (e.g., "the parse→serialize boundary can't be cleanly split at the mdast level because X"), or acknowledge it as a viable incremental path and explain why the full replacement is still preferred despite higher risk.

---

### [M] Finding 5: Position-slice delimiter recovery (R5/D8) assumes mdast positions are always available and correct — no fallback specified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 R5, §10 D8, §12 A1
**Issue:** The delimiter recovery strategy (R5) relies on slicing the original markdown source string at `node.position.start.offset` to recover authoring-form delimiters (emphasis marker `*` vs `_`, bullet char `*` vs `-` vs `+`, fence char backtick vs tilde, etc.). D8 locks this as the approach ("Lowest-code path; mdast exposes position info per node; slicing is ~30 LOC").

However, A1 acknowledges this assumption is only MEDIUM confidence. Several scenarios where position data might be unreliable or absent are not addressed:

1. **Synthetic mdast nodes** — nodes created by remark plugins (not from parsing source) won't have position data.
2. **remark-mdx rewrite** — the MDX report shows remark-mdx can normalize constructs (inline-to-block expansion, self-closing normalization). If a plugin modifies a node's content without updating positions, the slice will return wrong data.
3. **Nested constructs** — emphasis inside strong (`***bold italic***`) produces nested nodes where position slicing from the outer source may not isolate the correct delimiter character.
4. **Agent-write path** — when an agent writes markdown that gets parsed and immediately re-serialized, the source string used for position slicing must be the agent's input, not a previously-cached version.

The spec says "falls back to remark-stringify default when attr missing" (R4) but doesn't specify the fallback behavior for R5 (the position-slice walker itself). If position data is missing, does the walker silently skip? Log a warning? Fall back to defaults?

**Current design:** "Position-slice delimiter recovery works for all our fidelity attributes" (A1, MEDIUM confidence)

**Alternative:** Specify explicit fallback behavior: when `node.position` is undefined or `node.position.start.offset` is out of bounds, the walker should fall back to remark-stringify defaults (not crash, not emit incorrect delimiters). Add this as a test case in the pre-flight probe: parse markdown through a remark plugin chain that includes remark-mdx + remark-frontmatter + remark-gfm, verify that all nodes in the resulting mdast have valid position data for the constructs we need to slice.

**Trade-off:** The fallback path means some constructs may normalize (e.g., `_emphasis_` becomes `*emphasis*`). This is acceptable degradation vs. a crash, but should be documented as an expected gap.

**Status:** CHALLENGED
**Suggested resolution:** (1) Add a pre-flight probe test that verifies position data availability across all 14 node types after full plugin chain processing. (2) Specify fallback behavior in R5: "if position data is absent, fall back to remark-stringify defaults; log a warning in debug mode." (3) Test the nested-delimiter case specifically (`***text***`, `> - item`, etc.).

---

### [M] Finding 6: The "greenfield" framing may be post-hoc rationalization — the project has 695 fidelity tests, a shipping product, and users

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §1 (Problem Statement, Complication), §9 (Alternatives Considered)
**Issue:** The Complication's central pivot is: the predecessor spec operated under a "brownfield" frame, but the current spec re-frames the project as "greenfield" to justify a more aggressive migration. The spec uses "greenfield" to mean "no production data to migrate" (A6 struck as N/A) and "no-deferred-tech-debt."

But the project is not greenfield in the meaningful architectural sense:
- There are **695 passing fidelity tests** that encode the current pipeline's behavior as the correctness specification
- There are **7 invariants** (I1-I7) verified at 1000 PBT runs
- There is an **118-case catalog** that serves as the empirical ground truth
- The **observer sync mechanics**, **persistence layer**, and **CRDT bridge** are all built and tested against the current pipeline's behavior
- Users (P1-P5) exist and have expectations grounded in current behavior
- The predecessor spec explicitly shipped a 1800-LOC PR (#65) that established the current fidelity contract

"Greenfield" in the spec means "no data migration concern." But data migration is not the only reason to prefer incremental change. The real question is: **how much behavioral surface area has been encoded against the current pipeline's specific behavior?** The answer is: substantial. Every fidelity test that passes is an implicit contract with the current pipeline.

The spec acknowledges this by gating on "≥77/118 whitespace-only round-trips" — but that gate only covers the 118-case catalog, not the 695 test suite or the 7 invariants or the bridge-matrix integration tests. If any of those encode marked-specific or @tiptap/markdown-specific behavior (e.g., how marked tokenizes a specific edge case differently from micromark), they'll break.

**Current design:** "The prior architectural decision chose the patch path under a **brownfield** frame. [...] greenfield means no data to migrate in either direction." (§1, §9)

**Alternative:** Re-frame the project honestly: this is a **brownfield migration with no data migration concern.** The "no deferred tech debt" principle justifies the migration's ambition, but doesn't make the project greenfield. The risk profile of replacing the markdown engine in a project with 695 passing tests is materially different from replacing it in a project with 0 tests.

**Trade-off:** Honest framing doesn't change the decision — the migration may still be the right call. But it changes the risk calibration: the pre-flight probe should exercise not just the 118-case catalog but the full `bun run check` suite (which R13 already requires). The framing should acknowledge that passing tests may encode pipeline-specific behavior that won't survive the swap.

**Status:** CHALLENGED
**Suggested resolution:** Soften the "greenfield" framing to "greenfield data, brownfield behavior contracts." Ensure R13 (all 695 tests pass) is given equal weight to the 118-case probe in the pre-flight gate decision. Explicitly address: if 695 tests pass but the 118-case probe shows <77, what happens? And conversely: if the 118-case probe shows ≥77 but 20 fidelity tests fail, does the migration proceed?

---

## Low Severity

### [L] Finding 7: Agent Constraints §16 EXCLUDE list contradicts NG8 / D12

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §16 (Agent Constraints), §3 NG8, §10 D12
**Issue:** The EXCLUDE list in §16 says "Adding remark-rehype, remark-lint, remark-math, remark-directive (beyond NOT UNLESS) — NG6, NG7, NG8." But D12 (LOCKED) says "Register `remark-directive` from day one" and NG8 explicitly carves out remark-directive as IN SCOPE: "Note: `remark-directive` is IN SCOPE from day one per D12." The EXCLUDE list still names remark-directive alongside the NOT UNLESS plugins.

**Current design:** EXCLUDE: "Adding remark-rehype, remark-lint, remark-math, remark-directive (beyond NOT UNLESS)"

**Alternative:** Remove `remark-directive` from the EXCLUDE list or add a parenthetical: "remark-directive is IN SCOPE per D12; the others remain NOT UNLESS."

**Trade-off:** Minor documentation inconsistency. An implementer reading §16 in isolation would be confused about whether to register remark-directive.

**Status:** CHALLENGED
**Suggested resolution:** Edit §16 EXCLUDE to remove `remark-directive` or clarify it's excluded from the exclusion per D12.

---

## Confirmed Design Choices (summary)

### DC1 coverage
- **Single atomic PR (D2):** Sound. Git-revert rollback is clean, and the predecessor's #65 mega-PR precedent validates the approach.
- **Pre-flight probe as hard gate (D3):** Strong design. Gates the biggest empirical uncertainty (fidelity pass rate) before committing implementation effort.
- **Preserving parse()/serialize() public API (D9):** Correct. Call-site inventory confirms 100% coverage of the integration surface through these two methods.

### DC2 coverage
- **Call-site containment (A5):** Thoroughly verified via evidence/call-site-inventory.md. The blast radius is genuinely limited to packages/core/src/extensions/ and the new packages/core/src/markdown/ directory.
- **Test infrastructure reuse:** The decision to keep all 695 test assertions unchanged and only rewire the `mdRoundTrip` helper is architecturally sound — it tests behavior, not implementation.
- **Performance assessment (A7):** 13x slower tokenizer on a 50ms-debounced off-critical-path operation is acceptably bounded.

### DC3 coverage
- **The "no-deferred-tech-debt" principle as motivation:** Legitimate driver for choosing a cleaner architecture over incremental patching. The principle doesn't manufacture urgency — it changes the cost calculus by making tech debt a first-class cost.
- **MDX as sprint goal (D13):** Sound framing. The jsx-tokenizer limitations (no nested fragments, no member expressions, no spread attributes) are real and well-documented gaps that remark-mdx closes.
