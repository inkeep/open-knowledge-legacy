## 2026-04-16 (Session 1)

### Changes
- **SPEC created:** `Graph Demo Iteration Loop`
  - Established the problem statement, goals, requirements, current state, and proposed solution for a demo-first phase ladder.
- **Phase ladder created:** Stage 0 through Stage 7
  - Added a runnable current-product baseline plus successive failing-demo phases for:
    - metadata-aware graph rendering
    - frontmatter mutation
    - graph inspection
    - batch graph planning
    - auto-link repair
    - live agent attribution
    - graph timeline / diff
- **Smoke/hero prompt structure created**
  - Added a consistent contract for every phase: unlock, why it fails today, required functionality, smoke prompt, hero prompt, green condition, and sub-step decomposition.
- **Evidence file created:** `evidence/demo-capability-baseline.md`
  - Captured current MCP registry capability, current graph UI state, missing graph/metadata tools, and existing agent identity plumbing.

### Pending (carried forward)
- Decide whether to promote approved phase prompts into checked-in `demo/` assets.
- Decide which green conditions should become machine-assertable versus human-visual acceptance.
- Choose whether the public-facing hero topic remains `AI memory systems` or shifts to a more product-native topic.

## 2026-04-16 (Session 2 — full rethink pass)

### Changes
- **D5 confirmed:** Restructured spec around prompt packs as primary deliverable (D1=B from session). Implementation requirements now derived from what makes each prompt succeed/fail.
- **D4 updated → confirmed:** Phase ordering revised to: colors (S1) → graph inspector (S2) → retaxonomy (S3) → auto-link (S4) → batch plan (S5) → agent theater (S6) → timeline (S7). Swapped S2/S3 vs. original: graph inspector before frontmatter mutation (architectural foundation enables smarter retag demos). Moved auto-link before batch plan (matches `demo.md` priority; intelligence > speed for demo impressiveness).
- **D6 confirmed:** Corpus reuse strategy — Stage 0 builds the fixture, Stages 1+ test against it. Enables ~60-90s smoke loops for later stages.
- **D7 created:** Dual corpus strategy — both synthetic "AI memory systems" corpus AND existing repo (~1500+ docs) as demo corpora. Hero prompts can use whichever is most impressive for that stage.
- **D8 confirmed:** Canonical topic remains "AI memory systems" with 5 clusters.
- **D9 confirmed:** Green conditions use machine-assertable checks for structural properties + human-visual for UI properties.
- **demo.md resolved:** File exists at repo root. Contains single-agent hero prompt, 4-agent parallel script, recording sequence, and feature priority list. Previous session's phantom reference is now valid.
- **Evidence file updated:** `evidence/demo-capability-baseline.md`
  - Added Finding 7 (demo.md content), Finding 8 (existing repo as ~1500+ doc corpus), Finding 9 (frontmatter mutation partially achievable via edit_document), Finding 10 (suggest_links returns precise offsets usable by edit_document).
- **Stage 0 prompts expanded:** Detailed smoke prompt (10-doc tiny corpus), hero prompt (from `demo.md`), multi-agent hero script (Architect + Cluster Builder A + Cluster Builder B + Gardener), recording sequence.
- **All phases rewritten** with literal copy-paste prompt text, machine-assertable green conditions, visual green conditions, and sub-step decompositions.
- **Q1-Q3 from Session 1 replaced** with updated Q1-Q4 reflecting new structure.

### Pending (carried forward)
- Q1: Decide whether to promote prompts into checked-in `demo/` directory.
- Q2: Validate graph rendering performance at ~1500 node scale.
- Q3: Verify multi-agent concurrent MCP connections work correctly.
- Q4: Decide whether Stage 1 color-by field should be configurable.
- Run Stage 0 smoke prompt to validate it produces a clip-worthy graph.
- Choose the first red phase to implement (likely Stage 1).
