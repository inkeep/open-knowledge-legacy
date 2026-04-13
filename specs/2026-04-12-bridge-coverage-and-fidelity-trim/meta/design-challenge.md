# Design Challenge Findings

**Artifact:** specs/2026-04-12-bridge-coverage-and-fidelity-trim/SPEC.md
**Challenge date:** 2026-04-12
**Total findings:** 6 (1 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: S2 commit will fail `bun run check` — unused `setupObservers` import after deletion

**Category:** DESIGN
**Source:** DC2
**Location:** SPEC.md §5 R2, §9 A3
**Issue:** Assumption A3 claims "agent-as-file-editor block (line 376+) also uses `setupObservers` (via `createTestClient`), so the import stays." This is factually wrong. Grep of `conversion-fidelity.test.ts` shows `setupObservers` is imported at line 20 and directly called at only two sites: line 215 (observer round-trip block) and line 263 (full-stack chain block) — both inside the blocks being deleted. The agent-as-file-editor block at line 376+ uses `createTestServer` and `createTestClient` from the test harness but never calls `setupObservers` directly. After deletion, the import at line 20 becomes unused. Biome's `noUnusedImports` rule (part of `bun run check`) will flag this as an error.

**Current design:** "Assumption A3: `agent-as-file-editor` block (line 376+) also uses `setupObservers` (via `createTestClient`), so the import stays."
**Alternative:** R2's acceptance criteria must include removing the `setupObservers` import from line 20 after deleting the two blocks. The agent constraints in §13 should note this as part of the S2 deletion scope.
**Trade-off:** None — this is a correctness fix. Without it, R4 (each commit passes `bun run check`) is violated on the S2 commit.
**Status:** CHALLENGED
**Suggested resolution:** Verify by running `biome check` on the file after the deletion. Update A3, R2 acceptance criteria, and the agent constraints SCOPE entry for conversion-fidelity.test.ts to include removing the unused import. Also: the file header comment (lines 6-9) enumerates all 4 conversion tiers including "Observer round-trip" and "Full-stack chain" — R2 should include updating this header to reflect only the 4 remaining tiers.

---

## Medium Severity

### [M] Finding 2: A4 inaccurately describes the synthetic generator mechanism — implementation approach needs adjustment

**Category:** DESIGN
**Source:** DC1
**Location:** SPEC.md §9 A4, §5 R3
**Issue:** A4 states "the current rotation uses modular `if/else` on `blockIdx % 6` (or similar). Adding a 7th case for wiki-links is a 5-line addition." The actual code (`synthetic.ts:130-183`) uses `posInBlock = i % BLOCK_SIZE` where `BLOCK_SIZE = 20`, with a switch statement covering all 20 positions (cases 0-19). There is no `blockIdx % N` rotation across block types — the block INDEX determines vertical position within a fixed 20-line repeating structure (heading → paragraphs → empty → bullets → empty → code fence → code → fence close → empty → short paragraphs).

Adding wiki-links requires one of: (a) replacing an existing position (e.g., swapping one of the three empty-line positions at cases 5/10/17 for a wiki-link line), (b) injecting wiki-link tokens inline within existing paragraph/list content, or (c) restructuring to a two-level rotation where every Nth block substitutes wiki-link content. Option (b) most naturally achieves the ~5% frequency goal without changing the block structure.

**Current design:** "the current rotation uses modular if/else on `blockIdx % 6` (or similar). Adding a 7th case for wiki-links is a 5-line addition."
**Alternative:** Describe the actual mechanism (20-position switch within fixed-size blocks) and specify the implementation approach. Since D3 is DIRECTED (implementer can tune), the inaccuracy in A4 doesn't change scope, but it sets wrong expectations.
**Trade-off:** A4 correction requires the implementer to make a structural judgment call instead of a trivial addition. The decision is still reversible and low-risk.
**Status:** CHALLENGED
**Suggested resolution:** Update A4 to accurately describe the switch-based mechanism and suggest option (b) — injecting `[[page-N]]` as inline content within existing paragraph lines at ~5% frequency (e.g., every 20th line appends a wiki-link token).

---

### [M] Finding 3: CONSTRUCTS count is 22, not 18 — test count drop estimate is off

**Category:** DESIGN
**Source:** DC2
**Location:** SPEC.md §5 R2 acceptance criteria
**Issue:** R2 states "Test count drops by ~40 (18 constructs x 2 blocks + overhead)." The CONSTRUCTS array (conversion-fidelity.test.ts lines 61-164) contains 22 items, not 18 (3 headings + paragraph + heading+paragraph + bullet list + numbered list + code block + 4 inline marks + link + 4 wikilink variants + image + blockquote + horizontal rule + hard break + nested list = 22). The actual test count drop is 22 x 2 = 44 test cases. The CI time savings may also be slightly larger than ~18s.

**Current design:** "Test count drops by ~40 (18 constructs x 2 blocks + overhead)."
**Alternative:** Correct to "Test count drops by 44 (22 constructs x 2 blocks)."
**Trade-off:** Minor factual correction. Does not change any decision.
**Status:** CHALLENGED
**Suggested resolution:** Update the count in R2 acceptance criteria. This is a documentation fix, not a scope change.

---

### [M] Finding 4: Determinism implications of synthetic generator change not addressed

**Category:** DESIGN
**Source:** DC2
**Location:** SPEC.md §5 R3, §10 Risk table
**Issue:** The synthetic generator is explicitly designed for deterministic output: "Line N always produces the same content given the same parameters" (synthetic.ts line 5). Adding wiki-link patterns changes what every affected line produces. While stress tests assert on convergence (not content), two implications are unaddressed:

1. **Existing stress test snapshots or golden files** — if any test compares generated output against a stored reference, it will break. The spec should confirm no such references exist.
2. **Test reproducibility** — if a stress test failure at commit C1 used the old generator and a re-run at commit C2 uses the new generator, the failure may not reproduce because the content changed. The spec doesn't mention this tradeoff.

The risk table covers timeouts but not determinism shift.

**Current design:** Risk table entry "TQ13's wiki-link patterns cause stress test timeouts" (Very low / Low).
**Alternative:** Add a risk entry: "TQ13 changes deterministic output of `generateMarkdown()` for all line counts. Any test that depends on specific generated content will break." Mitigation: "Stress tests assert convergence, not content. Verify no snapshot or golden-file comparisons exist before committing."
**Trade-off:** Low effort to verify; prevents a subtle CI break.
**Status:** CHALLENGED
**Suggested resolution:** Add the risk entry and include a pre-implementation verification step (grep for snapshot/golden references to `generateMarkdown` output).

---

## Low Severity

### [L] Finding 5: Single wiki-link multi-client test covers isolated insertion — mixed content untested

**Category:** DESIGN
**Source:** DC1
**Location:** SPEC.md §5 R1
**Issue:** R1's test case inserts a standalone `wikiLink` node into XmlFragment. Real documents embed wiki-links within paragraphs adjacent to text content (e.g., `"See [[Page#Section|here]] for details."`). The ProseMirror schema treats wiki-links as `atom: true` (non-editable inline nodes), which means Y.XmlFragment encodes them differently from text runs. A multi-client sync edge case specific to atom nodes adjacent to text — where Yjs must merge concurrent edits to the same paragraph containing both text and atom nodes — would not be caught by the isolated-insertion test.

The fidelity catalog's D6 dimension tested 30 constructs including wiki-links under multi-client sync, but used manual `Y.encodeStateAsUpdate`/`Y.applyUpdate` (not the full Hocuspocus WebSocket bridge). R1 adds genuine value by testing through the real transport, but the isolated test misses the adjacent-content merge scenario.

**Current design:** "Client A inserts a `wikiLink` node with `{target: 'test-page', anchor: 'Heading', alias: 'Display'}` into XmlFragment."
**Alternative:** Add a second test case (R1 says "add 1-2 test cases") where Client A inserts a paragraph containing text + wiki-link + text, and Client B concurrently appends text to the same paragraph. Assert convergence of the mixed content.
**Trade-off:** One additional test case (~10 lines). Catches the adjacent-content merge scenario that is closest to real editing behavior. The spec already allows "1-2 test cases" in R1.
**Status:** CHALLENGED
**Suggested resolution:** Consider adding the mixed-content test. D5 (DIRECTED) gives the implementer latitude to judge, but the spec could explicitly suggest it as the second test case.

---

### [L] Finding 6: Evidence directory is empty — investigation not persisted

**Category:** DESIGN
**Source:** DC2
**Location:** SPEC.md §Links, evidence/
**Issue:** The spec references "Agent B wiki-link audit + Agent C reports catalogue (in conversation context, 2026-04-12)" but the evidence directory is empty. The fidelity catalog report at `reports/markdown-construct-fidelity-catalog/REPORT.md` exists and is thorough, but the specific Agent B and Agent C outputs that drove the three items in this spec are not persisted. A future reader (or implementer) cannot verify the investigation chain that led to D1-D6 decisions.

This is a process gap, not a design gap — it doesn't affect the correctness of the spec's decisions, all of which are independently verifiable from the codebase and the fidelity catalog report.

**Current design:** "Evidence: Agent B wiki-link audit + Agent C reports catalogue (in conversation context, 2026-04-12)"
**Alternative:** Persist the key findings from Agent B and Agent C to evidence files (e.g., `evidence/agent-b-wiki-link-gaps.md`, `evidence/agent-c-fidelity-trim-basis.md`).
**Trade-off:** 10-15 minutes of work to extract and persist. Improves traceability for future readers.
**Status:** CHALLENGED
**Suggested resolution:** Extract the load-bearing findings from Agent B (GAP 1: no multi-client wiki-link test, GAP 2: resolved attr lossiness) and Agent C (Layer A = Layer B proof reference) into evidence files before finalization.

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative):**
- The trim itself IS the simplification — removing proven-redundant test chains. No credibly simpler alternative exists for the three items.
- D2's rejection of "skip/comment" in favor of "delete with citation" is well-reasoned: the fidelity catalog's proof is structural, not empirical. Preserving dead test code implies uncertainty that doesn't exist.

**DC3 (Framing validity):**
- The SCR's complication bundles two independent issues (S7 coverage gap + redundant test time) discovered in the same audit. The intersection is coincidental timing rather than causal linkage, but this doesn't lead to wrong decisions — both issues are real, both are test-only, and bundling in one PR is appropriate for the scope.
- The D4 finding from the fidelity catalog ("Layer A = Layer B across all 118 constructs") is programmatically verified with a reproducible probe script. The structural argument (Observer A calls `mdManager.serialize`, Observer B calls `mdManager.parse`) is sound. The trim decision is well-grounded.

**DC2 (Stakeholder gap) — items that held up:**
- Commit ordering (D4: TQ1 → S2 → TQ13) is sound. New coverage first validates the bridge before the trim; generator enrichment last is lowest risk. The alternative (TQ1 → TQ13 → S2) is equivalent in safety but the spec's ordering front-loads the highest-signal change.
- D1 (most complex wiki-link variant) is correct — simpler variants are strict subsets, confirmed by the fidelity catalog's wiki-link fixtures (4 variants, all stable at `conversion-fidelity.test.ts:124-142`).
- D6 (no Playwright for wiki-links) is appropriate — bridge invariants are integration-tier concerns.
- The risk assessment for R1 revealing a real bridge bug is honest: "we have a bug to fix — not a test to skip."
