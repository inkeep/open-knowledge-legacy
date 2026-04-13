# Audit Findings

**Artifact:** specs/2026-04-12-bridge-coverage-and-fidelity-trim/SPEC.md
**Audit date:** 2026-04-12
**Total findings:** 6 (0 high, 2 medium, 4 low)

---

## Medium Severity

### [M1] Finding 1: A3 rationale is wrong — `setupObservers` import becomes unused after trim

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Section 9 (Assumptions), A3
**Issue:** A3 claims the `setupObservers` import in conversion-fidelity.test.ts will remain needed after deleting blocks 3 and 4 because "agent-as-file-editor block (line 376+) also uses `setupObservers` (via `createTestClient`)." This is incorrect. The direct `import { setupObservers }` at line 20 of conversion-fidelity.test.ts is only called at lines 215 and 263 — both inside the blocks being deleted. The agent-as-file-editor tests use `createTestClient` from `./test-harness`, which has its own separate import of `setupObservers` (test-harness.ts:35). After deleting blocks 3 and 4, line 20's import becomes unused.
**Current text:** "The deleted blocks import `setupObservers` — check if remaining blocks also use it. `agent-as-file-editor` block (line 376+) also uses `setupObservers` (via `createTestClient`), so the import stays."
**Evidence:** `conversion-fidelity.test.ts:20` (import), `:215` and `:263` (only usages). `test-harness.ts:35` has its own independent import. Zero other references to `setupObservers` in the file outside blocks 3 and 4.
**Status:** CONTRADICTED
**Suggested resolution:** Update A3 to note the `setupObservers` import must be removed as part of the S2 trim. Add to R2's acceptance criteria: "Remove the unused `import { setupObservers }` — Biome will flag it as an unused import and `bun run check` will fail otherwise." Also update the agent constraints (section 13, SCOPE for conversion-fidelity.test.ts) to mention the import removal.

---

### [M2] Finding 2: R2 construct count is 22, not 18

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Section 5 (Requirements), R2
**Issue:** R2 estimates "Test count drops by ~40 (18 constructs x 2 blocks + overhead)." The CONSTRUCTS array at conversion-fidelity.test.ts:61-164 has 22 entries (h1, h2, h3, paragraph, heading+paragraph, bullet list, numbered list, fenced code block, bold, italic, code, strikethrough, link, wikilink:bare, wikilink:alias, wikilink:section, wikilink:section-alias, image, blockquote, horizontal rule, hard line break, nested list). The actual test drop is 22 x 2 = 44.
**Current text:** "Test count drops by ~40 (18 constructs x 2 blocks + overhead)."
**Evidence:** Counted all entries in CONSTRUCTS array at conversion-fidelity.test.ts:61-164. 22 distinct `{ name, input }` objects.
**Status:** CONTRADICTED
**Suggested resolution:** Update to "Test count drops by ~44 (22 constructs x 2 blocks)." The ~40 approximation happens to be close enough for planning, but the stated breakdown is wrong and could mislead an implementer verifying the trim worked correctly. An implementer who sees only 36 tests removed (expecting 18 x 2) and not 44 would think the deletion was incomplete.

---

## Low Severity

### [L1] Finding 3: D5 and R5 name the same helper function differently

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Section 7 (Decision log, D5) and Section 5 (Requirements, R5)
**Issue:** D5 says "R1 test uses `appendWikiLinkToFragment` helper pattern" while R5 says "Extract `insertWikiLink(client, target, anchor?, alias?)` helper." These describe the same function with different names. An implementer must choose one.
**Current text:** D5: "`appendWikiLinkToFragment` helper pattern (not raw XmlElement construction)" / R5: "Extract `insertWikiLink(client, target, anchor?, alias?)` helper"
**Evidence:** D5 and R5 both describe a helper that creates a wikiLink ProseMirror node and inserts it into a client's XmlFragment. The D5 name (`appendWikiLinkToFragment`) follows the existing `appendParagraphToFragment` naming convention at bridge-matrix.test.ts:50. The R5 name (`insertWikiLink`) is shorter but inconsistent with that convention.
**Status:** INCOHERENT
**Suggested resolution:** Pick one name. `appendWikiLinkToFragment` is more consistent with the existing `appendParagraphToFragment` helper. Update R5 to match D5's name, or vice versa.

---

### [L2] Finding 4: A4 misdescribes the synthetic generator mechanism

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Section 9 (Assumptions), A4
**Issue:** A4 says "The current rotation uses modular `if/else` on `blockIdx % 6` (or similar). Adding a 7th case for wiki-links is a 5-line addition." The actual code at synthetic.ts:130-183 uses a `switch (posInBlock)` where `posInBlock = i % 20` with a 20-position block structure (BLOCK_SIZE = 20). There are ~10 distinct case groups (0, 1-4, 5/10/17, 6-9, 11, 12-15, 16, 18-19). The "(or similar)" hedge partially mitigates, and the conclusion (easy to extend) is correct — but "blockIdx % 6" is wrong enough to confuse an implementer reading the assumption.
**Current text:** "The current rotation uses modular `if/else` on `blockIdx % 6` (or similar). Adding a 7th case for wiki-links is a 5-line addition."
**Evidence:** synthetic.ts:134 `const BLOCK_SIZE = 20;`, :138 `const posInBlock = i % BLOCK_SIZE;`, :139-178 switch statement with 20 positions.
**Status:** CONTRADICTED
**Suggested resolution:** Update to: "The current rotation uses a `switch (posInBlock)` over a 20-line block cycle. Adding wiki-links means repurposing one existing position or slightly extending BLOCK_SIZE. Small change either way." The "5-line addition" estimate is still reasonable.

---

### [L3] Finding 5: Evidence directory is empty — no spec-local evidence files

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** Spec header (Links section)
**Issue:** The spec header says "Evidence: Agent B wiki-link audit + Agent C reports catalogue (in conversation context, 2026-04-12)" but the evidence/ directory contains no files. The spec's claims about Layer A = Layer B equivalence, the wiki-link parse/serialize symmetry, and the bridge-matrix gap analysis all depend on evidence that exists only in conversation context or in a separate report (`reports/markdown-construct-fidelity-catalog/REPORT.md`), which is an untracked file in the main repo (not committed at baseline `39fcd87`).
**Current text:** "Evidence: Agent B wiki-link audit + Agent C reports catalogue (in conversation context, 2026-04-12)"
**Evidence:** `ls` of evidence/ directory returns empty. `reports/markdown-construct-fidelity-catalog/REPORT.md` exists in the main worktree as an untracked file. Not present at baseline `39fcd87`.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) persist the key findings from Agent B and Agent C as evidence files (e.g., `evidence/wiki-link-audit.md`, `evidence/fidelity-catalog-summary.md`), or (b) ensure the fidelity catalog report is committed before or alongside this PR. R2's deletion comment cites the report by path — if the report doesn't exist in the repo, the citation is a dead reference.

---

### [L4] Finding 6: R2 block comment cites a report that is untracked at baseline

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** Section 5 (Requirements), R2 acceptance criteria
**Issue:** R2's prescribed block comment includes `// The markdown-construct-fidelity-catalog report (reports/markdown-construct-fidelity-catalog/REPORT.md)`. This report exists in the main worktree as an untracked file but is not committed at the spec's baseline commit `39fcd87`. If the PR implementing this spec ships before the report is committed, the code comment cites a non-existent file.
**Current text:** "// The markdown-construct-fidelity-catalog report (reports/markdown-construct-fidelity-catalog/REPORT.md)"
**Evidence:** `git rev-parse --short HEAD` in audit worktree returns `39fcd87`. `reports/markdown-construct-fidelity-catalog/REPORT.md` is listed as untracked (`??`) in git status of main worktree.
**Status:** STALE
**Suggested resolution:** Add a STOP_IF or prerequisite: "The fidelity catalog report must be committed before R2's commit." Alternatively, update R2's comment to cite the report's key finding inline rather than by file path: `// Layer A (mdManager) === Layer B (Y.Doc observer path) on all 118 constructs (fidelity-catalog probe, 2026-04-12).`

---

## Confirmed Claims (summary)

**T1 — Own codebase (all line number claims verified):**
- bridge-matrix.test.ts: multi-client describe block at line 459 with 5 tests, all plain text, zero wiki-link content. `appendParagraphToFragment` helper at line 50. `assertClientsConverged` at line 66. Block spans lines 459-592.
- conversion-fidelity.test.ts: all 6 describe blocks at claimed lines (168, 191, 208, 256, 305, 376). Observer round-trip spans 208-252. Full-stack chain spans 256-301.
- synthetic.ts: `generateMarkdown()` at line 130. Block types confirmed: headings, paragraphs, bullet lists, code blocks, trailing paragraphs. No wiki-links, images, blockquotes, or inline marks.
- wiki-link.test.ts: 4 round-trip fixtures at lines 70-98 confirm parse/serialize symmetry for all content attr combinations (bare, alias, section, section+alias).

**T1 — Fidelity catalog report (external to spec worktree but verified):**
- Layer A (mdManager) = Layer B (Y.Doc observer path) equivalence confirmed on 118/118 cases with zero divergences (REPORT.md line 49, audit-findings.md line 84, probe-summary.txt "Layer A != Layer B: 0 cases").
- The "structurally impossible to fail" characterization is well-supported: the observer bridge is a proven pass-through.

**Coherence (lenses L1-L7):**
- L1: One naming inconsistency (D5/R5) noted above. No logical contradictions.
- L2: Confidence labels match evidence appropriately (all assumptions rated HIGH with cited verification).
- L3: Claims are appropriately scoped (no unconditional claims that should be conditional).
- L5: Problem statement accurately reflects the detailed findings and requirements.
- L6: Consistent prescriptive stance throughout.
- L7: Not applicable (no quantitative claims requiring inline attribution).

## Unverifiable Claims

- **~18s CI wall-clock reduction (R2):** Cannot verify without running the test suite before and after. The claim is plausible given 44 async observer-based tests being removed, but the exact timing is unverifiable from code alone.
- **Baseline commit `39fcd87` matches the state investigated by Agents B and C:** The spec says three Opus agents audited the codebase at this commit. Cannot verify what those agents actually saw; verified only that the current worktree HEAD is `39fcd87`.
