# Audit Findings: PROJECT.md Post-Merge (cherry-pick 25967a6)

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/PROJECT.md
**Audit date:** 2026-04-08
**Audit type:** Post-merge regression audit. Verifies logical consistency and structural compliance against the /projects skill after a cherry-pick from feat/init-spike onto main (commit 7ab812c -> 25967a6) that resolved 13 findings on the source branch but was applied atop a main that had already diverged with team-planning items, a 48-report catalogue, and a new S-L8 Later story.
**Prior audit:** `meta/_audit-project-md-vs-projects-skill.md` (2026-04-08, 14 findings: 4H/6M/4L)
**Total findings:** 10 (3 High, 4 Medium, 3 Low)

The audit verifies each prior finding's resolution status and surfaces new regressions introduced by the merge. Overall, most prior findings are resolved, but **two high-severity prior findings re-surfaced or regressed** (H1 S2 stale architecture, H4 Items table bloat — actually worsened from 55 to 60), **one new high-severity regression** was introduced (S8 story is now duplicated inside the Next section), and several minor stale claims landed.

---

## Resolution status of prior audit findings

| Prior ID | Prior severity | Status in HEAD (25967a6) | Note |
|---|---|---|---|
| H1 | High | NOT RESOLVED | S2 story body still describes serialize-on-toggle. Re-raised as [H1'] below. |
| H2 | High | OVER-RESOLVED (regression) | The fix moved S8 to Next but S8 was already in Next on main. Result: S8 duplicated. Raised as [H3'] below. |
| H3 | High | RESOLVED | S6 Constraints now says "simple-git for git operations (TQ20, validated by init-spike V5)". |
| H4 | High | WORSENED | Items table was 55 rows at the prior audit; HEAD has 60. Re-raised as [H2'] below. |
| M1 | Medium | RESOLVED | S1 says "TipTap + y-prosemirror, confirmed in TQ4". |
| M2 | Medium | RESOLVED | CC3 says "React web app on Vite dev server (TQ12, locked — validated by init-spike V2, browser-confirmed)". |
| M3 | Medium | RESOLVED | S4 reconciles 10 core + 6 link-graph = 16 with namespace gating language. (Design tension with S10 in Now remains — see [M2'] below.) |
| M4 | Medium | RESOLVED | Phasing rationale now assigns a heuristic per Now story with evidence and includes an explicit barrel count check. |
| M5 | Medium | RESOLVED | S3 and S7 both have `Promote when:` triggers. |
| M6 | Medium | RESOLVED | Later rationale says "S-L1 through S-L8". |
| L1 | Low | MOSTLY RESOLVED | Evidence & References section now has Upstream Artifacts, Evidence Files, Code Repositories, External Sources, Research Reports subsections. Minor text contradiction raised as [L1'] below. |
| L2 | Low | PARTIALLY RESOLVED | Prior-flagged S-L stories now have intersection reasoning except S-L8 (new on main, terser than rewrites). Raised as [L2'] below. |
| L3 | Low | RESOLVED | Later stories are sequential S-L1..S-L8. |
| L4 | Low | PARTIALLY RESOLVED | Last verified date bumped to 2026-04-08, but artifact still contains stale S2 content — see [H1']. |

---

## High Severity

### [H1'] S8 story is duplicated inside the Next section

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L5 (summary coherence), reader pass
**Location:** Next section — S8 headings at lines 422 and 451
**Issue:** The Next section contains **two** `#### S8: Semantic search for humans and agents` story blocks. The first (line 422) lacks a `Promote when:` trigger; the second (line 451) has one ("KBs reach 100+ articles AND walkable catalog + grep discovery shows diminishing returns, OR when S3 promotes"). Their bodies differ slightly: the first includes the sentence "Team framing: nice to have for humans at P0, optional for agents (walkable catalog files + grep cover agent needs at P0 scale)," which is absent from the second. Everything else is byte-identical.

This is a direct regression from the cherry-pick: commit 25967a6 attempted to resolve prior finding H2 ("S8 physically under Now, but rationale says Next") by **adding** a new S8 block under `### Next`. But by then, main (via commit 2c89b6c — "account for 12 team planning items in PROJECT.md") had already moved S8 into the Next section. The cherry-pick added a duplicate instead of relocating the existing one.

**Current text (line 422):** "#### S8: Semantic search for humans and agents\n...Team framing: nice to have for humans at P0, optional for agents (walkable catalog files + grep cover agent needs at P0 scale)."
**Current text (line 451):** "#### S8: Semantic search for humans and agents\n...(no team framing sentence)...\n**Promote when:** KBs reach 100+ articles AND walkable catalog + grep discovery shows diminishing returns, OR when S3 promotes (shared sidebar search surface)."
**Evidence:** `grep -nE '^#### S8' PROJECT.md` returns two matches at lines 422 and 451. `awk '/^### Next/,/^### Later/' PROJECT.md | grep -E '^#### S'` lists: S8, S3, S7, S8. `git show 25967a6 -- PROJECT.md | grep -c "^+#### S8"` returns 1 (only the new block was added). `git show 25967a6^:PROJECT.md | grep -nE '^#### S8'` returns line 422. The phasing rationale correctly lists `Next: S3 + S7 + S8` (singular S8).
**Status:** INCOHERENT
**Suggested resolution:** Delete one of the two S8 blocks. The preferred candidate to keep is the second block (line 451) because it carries the `Promote when:` trigger that prior finding M5 requires for every Next item. If the "Team framing" sentence from the first block is load-bearing, splice it into the second block before deleting the first. After deletion, re-verify that `Next: S3 + S7 + S8` matches the one remaining S8 story.

---

### [H2'] S2 story architecture is stale — still describes serialize-on-toggle despite TQ25/CC1/codebase saying bidirectional observer sync

**Category:** COHERENCE + FACTUAL
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity), T1 (own codebase)
**Location:** S2 Architecture (line 325), S2 Constraints (line 333), S2 Forward (line 335) vs TQ25 (line 108), TQ26 (line 109), CC1 (lines 152-165)
**Issue:** This finding was raised as H1 in the prior audit and is **not resolved** by commit 25967a6. The S2 story body still describes the serialize-on-toggle architecture as the current design, directly contradicting the updated TQ25, TQ26, CC1 content and the codebase at `init_spike/src/editor/observers.ts`. An engineer picking up the S2 story would implement the wrong architecture.

- **TQ25 (line 108)** says: "CONFIRMED by PR #6 (browser E2E). `src/editor/observers.ts`: bidirectional observers between Y.XmlFragment('default') and Y.Text('source'). Observer A (tree→text): incremental diff via `diffLines`. Observer B (text→tree): parse → `updateYFragment`. Origin guards prevent loops. 22 server-side + 6 Playwright E2E tests pass. Full sync matrix green. Toggle simplified to instant show/hide (no serialize-on-toggle)."
- **CC1 (line 154)** says: "Source mode (TQ25 observer sync): Bidirectional observers between Y.XmlFragment and Y.Text('source'). CodeMirror binds to Y.Text via y-codemirror.next. WYSIWYG edits → serialize → incremental diff → Y.Text. Source edits → parse → updateYFragment. Transaction origin guards prevent loops. **CONFIRMED — 22 server-side + 6 Playwright E2E tests pass (PR #6).** V4b (serialize-on-toggle) is the fallback."
- **S2 Architecture (line 325)** still says: "Architecture (validated by init_spike V4b): Source mode is NOT CRDT-bound (V7 unified YType failed — Yjs v14 doesn't have it). Instead: serialize-on-toggle. Toggle to source: serialize Y.Doc → markdown → CodeMirror buffer. Toggle back: diff user's source edits → apply via `updateYFragment()` ..."
- **S2 Constraints (line 333)** still says: "Source mode is an independent text buffer — no CRDT sync while in source mode. Edits only reach Y.Doc on toggle-back. Agent writes during source mode arrive via Y.Doc observer (one-way re-serialization, cursor may jump)."
- **S2 Forward (line 335)** still says: "Collaborative source editing requires either Yjs v14 unified YType (not ready) or y-codemirror.next bound to a separate Y.Text with observer-based sync from Y.XmlFragment (no production precedent)."

**Current text:** Quoted above — the S2 body is unchanged from the pre-audit state on main.
**Evidence:** Codebase verification (T1): `init_spike/src/editor/observers.ts` header docstring reads "Bidirectional observers between Y.XmlFragment('default') and Y.Text('source'). Observer A (tree→text): Serializes XmlFragment to markdown, writes incrementally to Y.Text. Observer B (text→tree): Parses Y.Text markdown, applies to XmlFragment via updateYFragment. Transaction origin guards prevent infinite loops." The file is committed and tests (`observer-sync.test.ts`, 22 tests) and E2E (`tests/e2e/sync.spec.ts`) exist. `git log -- init_spike/src/editor/observers.ts` shows the file was introduced in commit 5597eb7 (PR #6). The S2 Forward statement that collaborative source editing has "no production precedent" is contradicted by the same repository's init_spike having exactly that.
**Status:** STALE / CONTRADICTED (in-artifact contradiction)
**Suggested resolution:** Rewrite S2's Architecture paragraph to reflect bidirectional observer sync (TQ25/CC1). Rewrite Constraints to remove "no CRDT sync while in source mode" — source mode is now CRDT-bound through Y.Text. Rewrite Forward to note that collaborative source editing exists in init_spike and the remaining forward work is (for example) multi-tab source-editing UX or richer diff-view integrations; drop the "no production precedent" clause. Keep the three-way-merge mention as a fallback utility per CC1's "V4b (serialize-on-toggle) is the fallback". Align the text density with the rest of the Now stories.

---

### [H3'] Items table has 60 entries — bloat worsened from 55 (prior H4)

**Category:** COHERENCE (structural compliance)
**Source:** /projects anti-pattern: "Items table bloat" (40+ items threshold)
**Location:** Items table (lines 63-123)
**Issue:** The prior audit flagged 55 rows against the /projects anti-pattern threshold of 40+ and suggested triage to under 35. HEAD now has **60 rows** (`awk -F'|' '/^\| (PQ|TQ|XQ)[0-9]+/ {count++} END {print count}'` returns 60). The team-planning items commit (2c89b6c) added more items (PQ20, PQ21, PQ22, PQ23, XQ6, TQ29, TQ30, TQ31, XQ4 are present in HEAD but not all were in the prior audited state) without retiring any. Many items remain factual findings or implementation details rather than load-bearing questions/decisions (e.g., TQ17 regex performance, TQ19 structuredContent, TQ23 runtime, TQ24 catalog portability, TQ16 agent edit patterns, TQ18 index complementarity). TQ2 is still present as a zombie "Subsumed by TQ4" row. The ID sequence has visible gaps/interleaving: TQ25 → TQ26 → TQ28 → TQ27 (28 and 27 reversed), TQ9 appearing between XQ3 and TQ6, PQ17 between TQ22 and TQ24, TQ24 before TQ23.

**Current text:** 60 items spanning PQ1..PQ23, TQ1..TQ31 (minus TQ2 which is marked Subsumed), XQ1..XQ6.
**Evidence:** `awk -F'|' '/^\| (PQ|TQ|XQ)[0-9]+/ {print $2}' PROJECT.md | wc -l` returns 60. The /projects anti-pattern rule: "Apply the load-bearing heuristic: track formally only when the item creates precedent, is customer-facing, is foundational tech, is a one-way door, is cross-cutting, or creates divergence." Items like TQ17 ("JS regex on CRDT content: 2-8ms at 1000 files") are resolved factual benchmarks better inlined or moved to evidence.
**Status:** INCOHERENT (anti-pattern match, degraded)
**Suggested resolution:** Triage as per the prior audit's H4 suggestion, now with a larger scope. Move resolved factual findings (TQ16, TQ17, TQ18, TQ19, TQ24) into evidence files or directly into the cross-cutting concerns where they're referenced. Retire TQ2. Consider whether PQ20-PQ23, XQ4-XQ6, TQ29-TQ31 each hit a load-bearing criterion or whether some can live inline in the stories/CC sections they touch. Target: under 35 items.

---

## Medium Severity

### [M1'] "Code Repositories" says 43 research reports but the Research Reports section says 48

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L5 (summary coherence)
**Location:** Code Repositories bullet (line 595) vs Research Reports intro (line 603) vs the report table (lines 606-653)
**Issue:** The Code Repositories bullet says the submodule contains "43 research reports with evidence files", but ten lines below, the Research Reports section opens with "48 research reports inform the architectural decisions in this document" and the table that follows has 48 rows. This is a stale count in Code Repositories that should have been bumped during commit b93ff77 ("add 5 missing reports to submodule + table, update count 43→48"). The bump was applied to the Research Reports intro but not to the Code Repositories bullet.

**Current text (line 595):** "[inkeep/nick-reports](https://github.com/inkeep/nick-reports) — `reports/` submodule containing 43 research reports with evidence files."
**Current text (line 603):** "48 research reports inform the architectural decisions in this document."
**Evidence:** `grep -n "43 research" PROJECT.md` returns line 595. `grep -n "48 research" PROJECT.md` returns line 603. `awk '/^\| \[/ {count++} END {print count}' PROJECT.md` returns 48 (table rows).
**Status:** STALE
**Suggested resolution:** Update the Code Repositories bullet to "48 research reports with evidence files" or reference the count indirectly ("the research reports submodule — see Research Reports section below for the full table"). Preferred: reference indirectly so the count lives in exactly one place.

---

### [M2'] S10 is in Now but S4's "10-tool ceiling" narrative treats S10's link tools as a separate-namespace expansion that ships later

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** S4 (line 352) vs S10 placement in Now (line 399) vs phasing rationale (line 513)
**Issue:** The M3 fix added language to S4 saying "The 6 link-graph tools added by S10 ... are a separate opt-in namespace registered only when S10 ships — keeping the core MCP surface at 10. Total-when-S10-lands: 16 tools across two namespaces." This reads as though S10 ships at a later phase where the link namespace is introduced as an opt-in expansion. But S10 is in the **Now** phase and the Now phasing rationale's internal sequence says "S1+S4 (CRDT+MCP foundation) → S6 (persistence) → S5+S10 (presence + knowledge graph) → S2+S9 (source mode + embeddability as polish)". So S10 and its 6 link tools are expected to ship in the same Now delivery group as S4 — at which point the "core MCP surface at 10" ceiling is only preserved if the link namespace is actually gated behind a capability flag, which the S4 text calls "spec-time decision" (i.e. not yet decided). The prose implies a future-tense separation ("when S10 ships") that doesn't match the phasing reality (S10 ships alongside S4 in Now).

This is a residual incoherence from the M3 resolution — a temporal ambiguity. It doesn't change scope but it leaves the tool-count claim ("10 tools") loose: a reader of S4 in isolation will believe the Now delivery exposes 10 MCP tools; a reader of S10 and the phasing rationale will believe it exposes 16 unless the capability flag is added.

**Current text (S4):** "Core P0 surface: 5 filesystem-compatible + 5 knowledge-specific = 10 tools. The 6 link-graph tools added by S10 (`get_backlinks`, ...) are a separate opt-in namespace registered only when S10 ships — keeping the core MCP surface at 10."
**Current text (phasing rationale):** "Now: S1 + S2 + S4 + S5 + S6 + S9 + S10 ... internal sequencing: S1+S4 (CRDT+MCP foundation) → S6 (persistence) → S5+S10 (presence + knowledge graph) ..."
**Evidence:** S10 appears under `### Now` (line 399), confirmed by `awk '/^### Now/,/^### Next/'` listing S10 inside Now. The phasing rationale sequence explicitly includes S10 inside the Now delivery group.
**Status:** INCOHERENT (minor — residual M3 ambiguity)
**Suggested resolution:** Option A: Replace "when S10 ships" with "when the `links` namespace is activated" and commit to the capability-flag design (make S10's 6 tools opt-in behind a flag by default, documented here). Option B: Accept that Now ships 16 tools in two namespaces and update S4 to say so. Option C: Drop the "10-tool ceiling" framing entirely and document the actual shipped surface. Any of these resolves the contradiction.

---

### [M3'] CC1 says "23 Playwright tests" but TQ25 and TQ26 together add to 11

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L5 (summary coherence)
**Location:** CC1 (line 157) vs TQ25 (line 108) vs TQ26 (line 109)
**Issue:** CC1's Cross-mode sync matrix header reads "E2E verified by PR #6, 23 Playwright tests". TQ25 says "22 server-side + **6** Playwright E2E tests pass". TQ26 says "10 unit tests + **5** Playwright E2E tests pass". 6 + 5 = 11, not 23. Either CC1 is counting differently (all Playwright tests across both sync.spec.ts and qa-scenarios.spec.ts, which currently hold ~12 + ~12 = ~24 cases per `grep -cE "^\s*test\("` against each file) or TQ25/TQ26 under-report. In either case the numbers don't line up, which is a minor but visible inconsistency for a reader who sanity-checks claims.

**Current text (CC1):** "Cross-mode sync matrix (E2E verified by PR #6, 23 Playwright tests):"
**Current text (TQ25):** "22 server-side + 6 Playwright E2E tests pass."
**Current text (TQ26):** "10 unit tests + 5 Playwright E2E tests pass."
**Evidence:** `grep -cE "^\s*test\(" init_spike/tests/e2e/sync.spec.ts` returns 12. `grep -cE "^\s*test\(" init_spike/tests/e2e/qa-scenarios.spec.ts` returns 12. Total Playwright cases ≈ 24. CC1's 23 is directionally correct for the total; TQ25/TQ26's 6 and 5 are a different decomposition or under-report.
**Status:** INCOHERENT (minor count inconsistency)
**Suggested resolution:** Either (a) update TQ25/TQ26 to reflect the actual test counts per-feature and have CC1's "23" equal their sum, or (b) drop the specific numbers entirely and say "E2E-verified against the Playwright test suite" without counts.

---

### [M4'] S-L8 Value lacks intersection reasoning (merge-preserved regression)

**Category:** COHERENCE (quality gate)
**Source:** /projects anti-pattern: "Dimension lists without intersection reasoning"
**Location:** S-L8 Value (line 508)
**Issue:** S-L8 was added on main (not on feat/init-spike) so it did not receive the intersection-reasoning rewrite the feat/init-spike branch applied to S-L1/S-L3/S-L5/S-L6. Its Value is three short sentences that name benefits as independent bullets without AND/BUT/because reasoning connecting dimensions: "Power users and teams get consistent KB quality. Skills can declare what frontmatter they expect. Editor can auto-scaffold frontmatter on new file creation." This is the exact pattern the /projects anti-pattern table labels "dimension lists without intersection reasoning" — the three sentences touch three different dimensions (customer, platform, customer) but don't connect them. Compare S-L1's Value: "Team knowledge bases become agent-native (customer ...) AND the Yjs awareness infrastructure ... extends naturally to multi-human without architectural rework (platform ...), BUT only after IC adoption validates ... (GTM — monetization trigger)." S-L8 should follow that pattern.

**Current text:** "Value: Power users and teams get consistent KB quality. Skills can declare what frontmatter they expect. Editor can auto-scaffold frontmatter on new file creation."
**Evidence:** quality-examples.md: "Dimensions are connected with AND/BUT/because." Other Later stories (S-L1, S-L3, S-L5, S-L6) do this well; S-L2, S-L4, S-L7, S-L8 are terser and inconsistent with the pattern.
**Status:** INCOHERENT (anti-pattern match, low-severity on its own but visible next to the stronger Later stories)
**Suggested resolution:** Rewrite S-L8 Value to connect dimensions with intersection reasoning. Example: "Declared schemas give teams consistent KB quality (customer) AND provide skills a shared contract so ingest/compile/lint can enforce invariants across any KB that adopts them (platform ecosystem), BUT only becomes load-bearing once the reference skill ecosystem is mature enough that schema drift is a real failure mode (trigger)." The same polish applies to S-L2, S-L4, and S-L7 to the degree these were not rewritten on feat/init-spike.

---

## Low Severity

### [L1'] Cross-mode sync matrix claims "Agent → Source ✅" and "Agent → Disk ✅" as PR #6 E2E-verified — worth a spot check

**Category:** COHERENCE / FACTUAL (spot-check)
**Source:** L4 (evidence-synthesis fidelity)
**Location:** CC1 Cross-mode sync matrix (lines 157-164)
**Issue:** The matrix asserts all 11 source→destination cells are green ("E2E verified by PR #6"). The verifiable existence of `init_spike/src/editor/observers.ts`, `init_spike/src/server/file-watcher.ts`, and the Playwright specs establishes the architecture is in place. But reading the actual test files was not part of this audit's scope — the specific claims "Agent → Source ✅" (agent writes reach source mode in real time) and "Agent → Disk ✅" (agent writes reach the disk bridge) were not individually verified against the test assertions. TQ28 describes this as "agent writes are visible in source mode in real-time (Y.Doc observer → re-serialize → push to CodeMirror) AND preserved on toggle-back." If the Playwright tests cover these exact flows, the matrix is fine; if they cover a subset, the matrix is overclaiming slightly.

**Current text:** Cross-mode sync matrix (11 green cells), "All critical paths green."
**Evidence:** `observers.ts`, `file-watcher.ts`, and the e2e specs exist and are committed (PR #6). Per-cell assertion verification not performed in this audit.
**Status:** UNVERIFIABLE (at this audit depth)
**Suggested resolution:** During the next QA pass, open `init_spike/tests/e2e/sync.spec.ts` and `qa-scenarios.spec.ts`, map each of the 11 matrix cells to a specific test case, and either confirm the ✅s or caveat the cells not directly covered. Add test-case IDs to the matrix (e.g., `✅ (sync.spec.ts: "agent writes reach source mode")`) for traceability.

---

### [L2'] Items table ID sequence has gaps and interleaving from historical insertions

**Category:** COHERENCE (minor)
**Source:** L6 (stance / convention consistency)
**Location:** Items table (lines 63-123)
**Issue:** The items table IDs are not monotonically ordered by their numeric suffix. Visible interleaving: TQ9 appears between XQ3 and TQ6 (lines 76-78); PQ17 appears between TQ22 and TQ24 (lines 103-104); TQ25 → TQ26 → TQ28 → TQ27 (TQ28 and TQ27 swapped, lines 108-111); TQ24 before TQ23 (lines 105-106). This is the same convention mismatch as prior finding L3 (which was about S-L stories), now at the Items table level. It doesn't break anything — the IDs are stable identifiers — but the non-monotonic order makes scanning for a specific ID harder than it should be.

**Current text:** See raw ID sequence via `awk -F'|' '/^\| (PQ|TQ|XQ)[0-9]+/ {print $2}'`.
**Evidence:** Direct observation of ID sequence in HEAD.
**Status:** INCOHERENT (convention)
**Suggested resolution:** Either re-sort the Items table rows by (type, numeric suffix) during the next H4/H3' triage pass, or explicitly document that Items table order is insertion-order (stable IDs, non-sequential rows). The insertion-order convention is defensible but should be called out in a one-line note at the top of the Items table.

---

### [L3'] TQ2 zombie row: marked Subsumed by TQ4 but still counted against the Items table

**Category:** COHERENCE (minor)
**Source:** L6 (stance consistency)
**Location:** TQ2 row (line 65)
**Issue:** TQ2 reads `~~Rich markdown editor technology choice~~ | Technical | P0 | Subsumed by TQ4 | Merged into TQ4. TQ4 has the refined candidate set.` The row is struck through and flagged as Subsumed — a dead item — but it is still part of the 60-row Items table. The prior audit's H4 suggestion included "Remove the subsumed TQ2 row"; this was not applied. It contributes to the bloat in H3' above.

**Current text:** Line 65 as above.
**Evidence:** Direct observation.
**Status:** INCOHERENT (minor, but contributes to the Items table bloat)
**Suggested resolution:** Delete the TQ2 row as part of the H3' triage. The historical subsumption is already captured in TQ4's description ("TipTap confirmed as foundation" implies the choice was resolved).

---

## Confirmed Claims (summary)

**T1 (own codebase verification against HEAD at 34ff8da):**
- TQ25 bidirectional observer sync architecture: CONFIRMED. `init_spike/src/editor/observers.ts` header docstring matches the TQ25 description verbatim (Observer A tree→text via diffLines, Observer B text→tree via updateYFragment, origin guards `sync-from-tree` / `sync-from-text`).
- TQ26 disk↔CRDT bridge: CONFIRMED. `init_spike/src/server/file-watcher.ts` uses @parcel/watcher, has writeTracker content-hash layer, skipStoreHooks origin layer — matches the two-layer feedback prevention claim.
- TQ28 three-way merge: CONFIRMED. `init_spike/src/editor/three-way-merge.ts` docstring describes snapshot-on-toggle + diff-based merge that matches TQ28 text.
- TQ20 simple-git: CONFIRMED. `init_spike/node_modules/simple-git/` present; S6 text uses simple-git; no isomorphic-git references in source code or PROJECT.md.
- PR #6 (commit 5597eb7 "feat: bidirectional observer sync — collaborative source mode + disk bridge") is in the git log and is the single commit that introduces observers.ts, file-watcher.ts, and the related Playwright specs.
- 22 server-side observer-sync tests: CONFIRMED. `grep -cE "^\s*(test|it)\(" init_spike/src/editor/observer-sync.test.ts` returns 22.

**Structural compliance (confirmed passes):**
- Every Now story passes the "named beneficiary + observable change" quality gate.
- Every Next story has a `Promote when:` trigger (S3, S7, S8 — though see H1' for the S8 duplication).
- Every Later story has a `Trigger to promote:` field.
- Phasing rationale assigns a heuristic per Now story with evidence.
- Explicit barrel count check is present.
- SCR format in strategic context: passes.
- Bet-level non-goals with temporal tags (NEVER / NOT NOW / NOT UNLESS): passes.
- Rabbit holes have the three-part (why tempting / why rabbit hole / what to do) structure: passes.
- Pre-mortem: passes.
- Evidence & References section has all five template subsections (Upstream Artifacts, Items, Cross-cutting, Evidence Files, Research Reports, Code Repositories, External Sources).
- Walking skeleton test passes (explicitly called out in phasing rationale).
- Now-phase story list in phasing rationale (S1+S2+S4+S5+S6+S9+S10) exactly matches the actual stories in the Now section.
- Later-phase count (S-L1 through S-L8) matches the eight Later stories.

**Phasing coherence after merge:**
- The per-story heuristic assignments reference only stories that exist (S1, S4, S2, S5, S6, S9, S10).
- No orphaned references to dropped commits or items in the phasing rationale.
- S-L ordering is sequential S-L1..S-L8 (prior L3 resolved).

## Unverifiable Claims

- **CC1 "23 Playwright tests" vs TQ25 "6" vs TQ26 "5"** — see [M3']. The absolute number depends on which spec files are counted as "sync tests" vs "QA scenario tests" and whether assertion clusters or `test(...)` calls are the unit. Not verified beyond `grep -cE "^\s*test\("` counts.
- **CC1 cross-mode sync matrix per-cell verification** — see [L1']. Each green cell is a promise that a specific transition is E2E-tested. Cell-level verification against the Playwright spec assertions was not performed.
- **S4 "Microsoft: 85% degradation as tools increase"** — carried forward from the prior audit. Still not independently verified.
- **CC6 "RAPTOR (ICLR 2024) validated hierarchical summaries outperform flat retrieval" / "97% token savings from GraphRAG"** — carried forward from the prior audit. Still not independently verified.
- **Phasing rationale "Amazon Science found keyword search achieves 94.5% of RAG performance"** — carried forward from the prior audit. Still not independently verified.

---

## Summary

The cherry-pick applied 13 audit fixes from feat/init-spike onto main successfully for most findings (H3, M1, M2, M3, M4, M5, M6, L3, L1 mostly). Two high-severity prior findings were **not** resolved or **worsened** by the merge (H1 S2 stale architecture remains; H4 Items table bloat grew from 55 to 60), and **one new high-severity regression** was introduced (S8 story duplicated in the Next section — the H2 fix added a new block without recognizing that main had already moved the existing S8).

**Recommended next pass:** (1) delete the duplicate S8 block keeping the one with the promotion trigger (H1'), (2) rewrite S2 story body to match TQ25/CC1/codebase (H2'), (3) triage Items table to under 35 rows including removing TQ2 (H3'/L3'), (4) fix the 43/48 report count mismatch (M1'), (5) clarify the 10-vs-16 MCP tool narrative or commit to a capability flag (M2'), (6) reconcile the Playwright test count numbers (M3'), (7) rewrite S-L8 Value with intersection reasoning (M4').
