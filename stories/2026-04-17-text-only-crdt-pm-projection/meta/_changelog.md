# Story meta changelog

Append-only process history. Human-readable story changes live in STORY.md's own Changelog section; this file tracks session-level process events for multi-session resume.

---

## 2026-04-17 — Story seed created

**Input source:** Multi-hour exploration session (not a project-level decomposition). User directed capture of architectural insight after research reports landed.

**Reports produced during exploration (feed this story):**
- `reports/yjs-14-ecosystem-adoption/` (new, full research — Opus subagents; 7 evidence files + 3 Path C follow-ups + 1 audit pass)
- `reports/peritext-on-yjs-feasibility/` (Path C refresh; 4 new evidence files)
- `reports/three-way-merge-content-preservation/` (referenced)
- `reports/loro-ecosystem-readiness-assessment/` (referenced)
- `reports/crdt-observer-bridge-latency-analysis/` (referenced)

**Specs cross-referenced:**
- `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md` (hard prerequisite)
- `specs/2026-04-14-component-blocks-v2/SPEC.md` (architectural alignment)
- `specs/2026-04-16-bridge-correctness/SPEC.md` (complementary; D4 points here)

**Initial artifact:** STORY.md written directly without /stories skill dispatch. User caught the gap ("wait so are we doing /stories? did we already write it?") and requested a proper refinement pass.

---

## 2026-04-17 — /stories refinement pass

**Trigger:** User request: "load /stories and ensure we have everything fully." Applied /stories skill against existing STORY.md with anti-sycophancy critical-pass posture per challenge-posture.md.

**Skill references loaded:**
- /structured-thinking: challenge-posture, extraction-protocol, session-discipline, decision-taxonomy, problem-framing, value-dimensions, disambiguation-protocol
- /stories: SKILL.md, references/quality-examples.md

**Critical-pass findings (ordered by severity):**

1. **HIGH — Milkdown-as-precedent claim was false.** Story initially asserted "Milkdown ships this pattern in production" in three locations (summary, §0 executive summary, §14 external precedent). Source-verified at `milkdown/milkdown` repo: `packages/plugins/plugin-collab/src/collab-service.ts` uses `doc.getXmlFragment('prosemirror')` + y-prosemirror's `ySyncPlugin` — tree-canonical Y.XmlFragment, NOT text-only Y.Text. Milkdown is markdown-canonical at the PRODUCT layer but uses the ecosystem-standard tree-canonical CRDT pattern. Milkdown is also single-editor (PM only) so does not face our dual-view requirement.

    **Fix applied:** removed all three claims; rewrote §14 External precedent with honest "No production precedent found" framing; cross-referenced accurate Milkdown source facts; added "Indirect precedent" paragraph citing y-prosemirror's `updateYFragment` as the load-bearing algorithmic prior art (same algorithm, applied in reverse direction); added pioneer-work risk entry to §12 Risks table.

2. **MEDIUM — No unified Items table per /stories format.** Story had separate Invariants / AC / Assumptions sections but no consolidated table tracking Decided/Assumed/Exploring/Parked with firmness + provenance per extraction-protocol.md §4.

    **Fix applied:** added §10b Items table between §10 Decision surfaces and §11 Interplay. Type-prefixed IDs (PQ/TQ/XQ). Grouped sections: Rejected alternatives (D1-D5), Assumptions (A1-A10), Open decision surfaces (Q1-Q10), Parked items (P1-P4), Constraints (C1, C5 surfaced to table).

3. **MEDIUM — Assumptions lacked explicit expiry.** A1-A9 had verification plans but no expiry trigger per decision-taxonomy.md assumption lifecycle.

    **Fix applied:** added explicit "**Expiry:**" line to each of A1-A9; introduced new A10 (dual-view product requirement persistence). Strengthened A1's verification plan to cover compound-component scenarios, prop edits, IME, paste — the bug shapes most likely to refute it.

4. **MEDIUM — No Constraints section (separate from Invariants).** Dependency/appetite/sequencing constraints were scattered across the story with no consolidated view. /stories criterion #3 calls for explicit Constraints.

    **Fix applied:** added new §4b Constraints with C1-C10 grouped by kind (dependency / appetite / sequencing) and a non-constraints subsection making scope boundaries explicit.

5. **LOW — Missing "Last verified" frontmatter + Novelty note.** Story is pioneer work with scarce prior art; frontmatter didn't flag this up front.

    **Fix applied:** added "Last verified: 2026-04-17" and an explicit Novelty note to the frontmatter pointing readers to §12 Risks and §9 A1.

6. **LOW — Two non-goal tags had vague triggers.**
    - `[NOT UNLESS infeasible] Yjs 14/Loro concurrent migration`: "infeasible" undefined.
    - `[NOT NOW] Server-side observers migration`: tag wrong — target architecture removes the subject, not the timing.

    **Fix applied:** sharpened first to `[NOT UNLESS Yjs 13 reaches EOL before text-only ships OR spike reveals a blocker solvable only by v14/Loro]` with explicit revisit triggers; re-tagged second to `[NEVER under text-only architecture]` with explanation.

**Scope check:** Single-artifact invariant respected — refinement applied to this story only, no sibling STORY.md files created. The architectural direction, rejected alternatives, and evidence trail are unchanged. The pass strengthens the artifact for downstream /spec consumption without altering any decisions.

**Load-bearing content gate:** All content changes either (a) removed a demonstrably false claim (Milkdown), (b) made implicit judgments explicit (expiry, triggers, constraints), or (c) reorganized existing content into /stories-conforming structure. No agent-inferred synthesis added to STORY.md without explicit evidence from source verification or existing story content.

**Remaining:** Phase 5 validate — run resolution completeness gate + implementer's veto (task #184).

---

## 2026-04-17 — Canonicality cross-flow analysis + rejection of Y.XmlFragment-canonical single-CRDT

**Trigger:** User question — "help me understand the Y.Text vs Y.XmlFragment-canonical tradeoff across all our flows, not just PM typing." Deep-reasoning pass.

**Findings and STORY.md updates:**

1. **New value dimension D7 — Disk-boundary alignment.** The original six value dimensions captured source-mode CM (D3) as the decisive asymmetry but missed a second independent win cluster: disk-boundary operations. Markdown on disk is source-of-truth; every operation that crosses the disk/API/git/reconciliation boundary (initial load, persistence, API reads, file-watcher, conflict markers, branch-switch reconciliation, frontmatter handling) is ~4 LOC in Y.Text-canonical and requires serialize/parse at every boundary in Y.XmlFragment-canonical. This cluster is independent of D3 — even if source-mode CM were dropped, Y.Text-canonical would still win on 6 disk-boundary flows. Added to §2.

2. **Intersection matrix updated.** Seven dimensions now (was six). Added Milkdown-style Y.XmlFragment-canonical row — matches on 5/7 but fails on D3+D7.

3. **New §7.5 — Explicit rejection of Milkdown-style Y.XmlFragment-canonical single-CRDT.** Prior version of story didn't explicitly reject this as an alternative — rejected alternatives were Yjs 14, Loro, CM-only, stay-dual-CRDT. The Milkdown-style option (single-CRDT but Y.XmlFragment-shape) deserved explicit treatment because (a) it's the ecosystem default, (b) it's a viable single-CRDT path, (c) the rejection rationale is non-obvious (two independent losses, D3 and D7, each sufficient alone). §7.5 lays out the three sub-options for how Y.XMLcanonical could handle CM (read-only / parse-diff / parallel Y.Text) and why each fails, then the D7 reconciliation argument.

4. **New §11b — Flow-by-flow matrix.** 27 flows mapped, tallied 12 Y.Text wins / 4 Y.XML wins / 11 ties. Cross-flow pattern analysis shows Y.XML wins cluster in PM-internal concurrency semantics; Y.Text wins cluster in D3 (source-mode) + D7 (disk-boundary).

5. **New assumption A11 — Tree-level three-way merge tractability.** D7's reconciliation leg depends on a claim: tree-level 3-way merge is unsolved ecosystem-wide. Formalized as MEDIUM-confidence assumption with research-backed verification plan. If refuted, D7 narrows but doesn't fully dissolve.

6. **Extended A2 with A2b** — char-RGA acceptance for MDX attr concurrent edits (distinct from mark composition). Both tie into the concurrent-mark-prop research commission.

7. **Items table updated** — D6 (Milkdown rejection), A2b, A11 added.

**Research commissions launched in parallel (headless /research):**
- `reports/concurrent-mark-prop-crdt-semantics/` — A2 + A2b verification. Production editor survey (Notion, Linear, Google Docs, Figma, Confluence, TipTap, Quill) on concurrent mark + structured-attr semantics.
- `reports/tree-level-three-way-merge-prior-art/` — A11 verification. Automerge, y-prosemirror, Loro, academic literature, production editors reconciling tree-CRDT against disk.

Both reports are 3P-factual research (no OK-specific recommendations). OK-specific implications flow back into this story's §7.5 D7 rationale + §9 A2/A2b/A11 confidence.

**Outcome:** story is now more defensible pre-graduation. The Y.Text-canonical direction is justified by two independent win clusters (D3 + D7), not only by source-mode CM. The Milkdown-style alternative is explicitly rejected with mechanism-level evidence. Two open empirical questions (concurrent-edit semantics, tree-3-way tractability) are in flight with dedicated research, not hand-waved.

---

## 2026-04-17 — Research returns, A11 verified HIGH; A2 sharpened

**Both research commissions completed.** Evidence files + REPORT.md written for both.

**A11 verification — tree-level three-way merge prior art (`reports/tree-level-three-way-merge-prior-art/`).**

Findings that VERIFY A11 at HIGH confidence:
- Zero production CRDT editors implement tree-level 3-way merge against external non-CRDT state.
- `updateYFragment` in y-prosemirror@1.3.7 is explicitly 2-way (4-arg signature, no common-ancestor parameter — confirmed by direct source read).
- Automerge, Loro, Yjs "merge" all mean CRDT-op-history only, not against external state.
- Milkdown's `collab-service.ts` has NO disk integration; reconciliation = destroy & recreate editor.
- Git-backed markdown editors (Obsidian, Dendron, Foam) fall back to line-level diff3 with manual resolution.
- SemanticMerge (most advanced structured-merge tool) explicitly hybrid — tree at structural layer, text at leaves.
- Academic literature (Chawathe 1996, Lindholm 2001, Apel 2012-2023, Kleppmann 2022) — 25+ years of research; tree matching is NP-hard; none absorbed into production CRDT editors.
- KKP 2007 impossibility is list-specific; tree structure raises theoretical ceiling but not production ceiling.

Upgrades: A11 confidence MEDIUM → HIGH. §7.5 D7 reconciliation argument now HIGH-confidence. Serialize-merge-parse is the universally-documented fallback — and §2 D7 correctly observed that serialize-merge-parse IS Y.Text-canonical-at-the-reconciliation-boundary.

**A2/A2b verification — concurrent mark + attr CRDT semantics (`reports/concurrent-mark-prop-crdt-semantics/`).**

Findings that SHARPEN (don't simply confirm/refute) A2:
- **Positive precedent for char-RGA on serialized markdown: HedgeDoc 2 + Obsidian Relay/Peerdraft.** Both ship Yjs + Y.Text holding raw markdown source + CodeMirror binding. `**bold**` is literal `*` chars in a shared Y.Text. No widespread forum complaints.
- **Negative: commercial editors unanimously DO NOT ship this.** Notion, Linear, Google Docs, Figma, Confluence, TipTap+y-prosemirror, Quill+y-quill — all use structured marks or whole-value LWW.
- **Academic consensus is explicit: char-RGA on serialized marks is formally incorrect.** Peritext 2022 Example 3 (Alice bolds "The fox", Bob bolds "fox jumped" → naive merge produces `**The **fox** jumped.**` rendering "fox" non-bold) is the canonical artifact. Fugue 2023, Eg-walker 2024 reinforce.
- **Peritext Example 3 artifact is persistent, not self-healing.** Relies on asterisk-count parity which is unreliable.
- **Structured-attribute concurrent edits (A2b): LWW unanimous.** ZERO editors surveyed merge attr values character-by-character. Figma "simultaneous editing of the same text value doesn't work in Figma ... ok with us because Figma is a design tool, not a text editor" — first-party commercial statement that atomic-LWW is acceptable.
- **No "semantic mark emitter" as a named pattern**, but the entire ProseMirror ecosystem implicitly implements one: addMark/removeMark → typed ops, NOT char-level decomposition.

Implications (captured in updated A2 text + §10 Q1):
- HedgeDoc/Relay is the closest production precedent for OUR CM source-mode side (Y.Text + CM + markdown). The CM side of the architecture has shipped precedent.
- The PM-projection side (serializing PM addMark → `diff_main` → Y.Text char ops) is the genuinely pioneer part — and it DOES decompose mark ops to chars, unlike the ProseMirror ecosystem's semantic addMark pattern.
- Q1 in §10 ("binding write model: generic `diff_main` vs op-aware semantic emitter") gains sharper stakes. Semantic-emitter option is the industry-standard PM pattern, not an exotic mitigation.
- For MDX attrs specifically: A2b remains MEDIUM, but the rationale flips — no precedent for char-level attr merging anywhere suggests we'd be pioneering the wrong direction. Semantic-emitter for attr edits is likely mandatory.

Updated:
- §9 A2 rewritten with research citations + sharpened verification plan (explicitly construct Peritext Example 3 in spike).
- §9 A11 upgraded MEDIUM → HIGH with enumerated findings.
- §10b Items table A2, A11, A2b status updated.
- §14 Evidence trail: both new reports added with one-line summaries.

**REPORT.md authoring:** both subagents returned findings as text (skill policy prevents subagents from writing report files). Parent agent wrote both REPORT.md files from the returned synthesis. Evidence files (9 + 12) and meta RUN.md were written directly by subagents.

**Outcome:** both open empirical gaps closed. A11 moved to HIGH confidence on strong negative finding (25+ years, zero production, confirmed). A2 sharpened — the architecture has partial precedent (CM-side shipped in HedgeDoc/Relay, PM-projection-side pioneer). The known-bad artifact (Peritext Example 3) is characterized with a specific test in spike Phase 0 and a named fallback (semantic emitter per Q1). Story is now graduation-defensible on evidence across D3, D7, A1, A2, A11.
