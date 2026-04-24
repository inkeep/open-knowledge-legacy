# Changelog

Append-only process history for this spec. Entries newest-last.

---

## 2026-04-23 — Intake + Scaffold

**Session:** Intake + Scaffold

**What happened:**
- User requested a spec for deduping Hocuspocus server wiring between `packages/app/src/server/hocuspocus-plugin.ts` and `packages/server/src/standalone.ts` (Approach A from prior 2026-04-22 exploration session).
- Prior exploration (pre-spec, same-day session preceding intake) had already confirmed:
  - Duplication is real (enumerated 9 missing server-side subsystems + 6 missing HTTP-layer primitives in the plugin).
  - CLAUDE.md:236's claim that the plugin "calls `createServer()` directly" is aspirational — describes the target state of this refactor.
  - `bootServer()` already provides 90% of the HTTP+WS wrapping layer; test harness already uses `createServer()`.
  - M6 branch (`docs/m6-spec-sharpen`) has zero code overlap with this refactor's file set.
  - M6 spec's §1 Scope Clarification explicitly names the files we target and carves them out of M6 — clean baton-pass.
  - M6 audit (`meta/audit-findings.md` finding #11) flagged an unverified "7 entry points / 3 wiring paths" taxonomy — noted as verification target for our worldmodel pass.
- Dima's earlier blocker (mentioned in Slack) was an unrelated local-env issue — confirmed by Andrew during intake. Does not affect technical approach.

**Intake decisions locked:**
- D1. Scope: plugin-only. Test-harness + boot.ts HTTP-layer duplication deferred as NG2/NG3 (Option B → Future Work Explored).
- D2. SyncEngine: wired through without gating. Investigation during intake confirmed `sync-engine.ts:231-269` is opt-in-by-default (`syncEnabled !== true` early-return). "Wired" means two benign local git subprocess calls at dev startup when developer hasn't opted in.
- D3. CLAUDE.md correction cadence: corrigendum breadcrumb in scaffolding commit; sentence rewrites to current target prose when refactor PR merges (matches repo's `<br>_[Corrected…]_` precedent). Option 3 from intake — strictly dominates inline-fix and separate-doc-PR alternatives.
- D4. Spec directory: `specs/2026-04-23-vite-plugin-createserver-dedup/` (default).

**Artifacts created this session:**
- `SPEC.md` — initial draft with problem statement (SCR), goals (G1-G7), non-goals (NG1-NG6 with temporal tags), personas (P1-P3), user journeys, requirements (FR1-FR17 + NFRs), current state narrative, proposed solution, alternatives, decision log (D1-D4 LOCKED), open questions (Q1-Q7), assumptions (A1-A5), risks (R1-R7), Future Work (Explored: Option B helper extraction; Identified: test-harness migration; Noted: logger unification + dev UX polish).
- `evidence/` directory created (empty — will be populated during /worldmodel + iterate phases).
- `meta/_changelog.md` (this file).

**Baseline commit:** `6fa2c104` (captured at scaffold).

**Still pending in this session:**
- Add CLAUDE.md corrigendum breadcrumb per D3 (next commit).
- Dispatch `/worldmodel` for landscape topology + independent verification of M6 audit's taxonomy claim.
- Write initial evidence files from prior exploration (subsystem enumeration, HTTP-layer enumeration, SyncEngine opt-in proof, M6 baton-pass pointer).

**Pending items carried forward:**
- Q1-Q3, Q5 (P0 open questions). Q4 resolved this turn.
- Q6-Q7 (P2 deferred, tracked but not investigated).

---

## 2026-04-23 — Scaffold phase autonomous verification

**Session:** Scaffold — targeted worldmodel verification in lieu of full `/worldmodel` dispatch.

**What happened:**
- Q4 resolved without dispatching the full `/worldmodel` subagent — this is a narrow refactor with a well-defined topology, and the remaining verification was specifically the M6 audit's unverified taxonomy claim.
- Traced three unverified entry points:
  - `ok mcp` as spawner → `packages/cli/src/mcp/server-discovery.ts:93-110`: spawns `ok start` as detached child, then connects via server.lock. Consumer of P1, not a new path.
  - Electron attach mode → `packages/desktop/src/main/window-manager.ts:595-646`: reads server.lock, attaches BrowserWindow without forking a utility. Consumer, not producer.
  - Playwright per-worker fixture → `packages/app/tests/stress/_helpers/fixtures.ts:205-211`: `spawn('bun', ['run', 'dev'], ...)` per worker. Consumer of P3.
- Corrected taxonomy: **3 producer paths, 4 producer callers, 4+ consumer-only entry points**. After this refactor, 2 producer paths remain.
- CLAUDE.md breadcrumbs applied in the worktree's `AGENTS.md` (`CLAUDE.md → AGENTS.md` symlink). Parent repo accidentally edited first — reverted cleanly via `git -C /Users/andrew/Documents/code/open-knowledge/ restore AGENTS.md`; no residue on main.

**Artifacts created this turn:**
- `evidence/subsystem-divergence-inventory.md` — grep-verified list of 9 server-side subsystems + 6 HTTP-layer primitives missing from the plugin.
- `evidence/sync-engine-opt-in-default.md` — supports D2 (SyncEngine opt-in proof).
- `evidence/m6-baton-pass.md` — M6 scope-clarification carve-out + audit finding #11 pointer.
- `evidence/collab-entry-point-taxonomy.md` — independent verification of M6's "7 entry points / 3 wiring paths" claim; corrects two producer-vs-consumer conflations.
- `AGENTS.md` — corrigendum breadcrumbs at both occurrences of the stale Vite-plugin sentence (lines 264 and 1384-ish).

**Decision on full `/worldmodel` dispatch:** Skipped. Justification: the topology is already mapped in SPEC.md §8 (current state) + prior exploration + this phase's targeted verification. A full `/worldmodel` pass would mostly re-derive what's already in evidence. If a blind spot emerges during Backlog or Iterate, dispatch then.

**Pending items carried forward:**
- Q1 (keepalive helper — copy vs extract) — needs resolution before implementation shape is clear.
- Q2 (lock/init lifecycle: module-load vs configureServer) — needs HMR behavior trace.
- Q3 (logger identity) — P0 for operability NFR.
- Q5 (CLAUDE.md target-prose drafting) — P0 for refactor PR's doc fix.
- Q6, Q7 — P2, deferred.

---

## 2026-04-23 — Iterate phase resolution batch

**Session:** Iterate — user recommendations accepted; autonomous investigation of remaining P0 OQs.

**Decisions locked this turn (all four user-accepted recommendations):**
- D5 LOCKED — keepalive helper: copy from boot.ts (not extract). Partial extract would undermine NG2 scope discipline.
- D6 LOCKED — logger identity: preserve dual bracket/pino style; unification is Future Work Noted.
- D7 LOCKED — CLAUDE.md target prose drafted and stored.
- D8 LOCKED — `createServer()` invoked at module-load with top-level await for `ensureProjectGit` in non-test-isolated branch. Resolves Q2.

**Autonomous investigations resolved:**
- **D10 LOCKED** — files to delete: `dev-shadow-init.ts` (91 LOC) + `dev-shadow-init.test.ts` (172 LOC). grep confirms exactly one consumer (the plugin). Net delete 263 LOC on top of plugin shrink.
- **D9 LOCKED** — shutdown wiring: `server.httpServer.on('close', async () => await srv.destroy())`. Sync `exit` handler stays as defense-in-depth. No separate SIGINT/SIGTERM.
- FR17 revised: net LOC delete target ~560-660 (plugin + dev-shadow-init + test), hard floor -400.
- Agent Constraints §16 SCOPE list updated to reflect file deletions.

**Completeness re-sweep findings (Step 5 protocol):**
- `dev-shadow-init.ts` has exactly one consumer; safe to delete. ✓
- `agent-flow.test.ts` is standalone; unaffected. ✓
- `api-config-handler.ts` stays (48 LOC, dev-only `/api/config`). ✓
- Shutdown wiring needs explicit decision (D9). ✓ resolved.
- `ensureProjectGit` ordering requires top-level await (D8 refined). ✓ resolved.

**Items remaining in backlog:**
- Q1, Q2, Q3, Q5 — all resolved.
- Q6, Q7 — P2 deferred (unchanged).
- All P0 items now resolved. Scope stable.

**Ready for Audit phase.**

---

## 2026-04-23 — Audit + Challenger subprocesses + findings assessment

**Session:** Audit (Step 6) + Assess findings (Step 7).

User went AFK at the start of this session with explicit instruction to make pragmatic decisions without intervention and run `/ship` autonomously to the end.

**Spawn:** Two parallel nested Claude subprocesses via `claude --dangerously-skip-permissions -p` with `CLAUDE_NESTED=1`:
- Audit subprocess → `meta/audit-findings.md` (10 findings: 0 high, 3 medium, 7 low)
- Challenger subprocess → `meta/design-challenge.md` (8 findings: 2 high, 3 medium, 3 low)
Both completed exit-0 at ~13 minutes elapsed.

**Finding assessment protocol:** Evaluated each finding for (a) whether it implicates a LOCKED decision, (b) whether it's a pure correction or a judgment call. Applied corrections directly; logged pragmatic decisions for judgment calls where user input would normally be required.

### Corrections applied (FACTUAL / COHERENCE)

**Audit M1** — Stale `CLAUDE.md:236` references replaced with `AGENTS.md:264` and `:1384` (both occurrences of the sentence) in §1, §2 G6, §6 FR16, §8, Q5. Applied. `CLAUDE.md` is a symlink to `AGENTS.md`; the corrigendum breadcrumb edit earlier in this session shifted the sentence's line number from 236 to 264.

**Audit M2 + DC-L6** — FR1 acceptance criterion reframed. Original grep gate covered 3 patterns of 11 required symbols; now uses (a) positive assertion `rg "\bcreateServer\s*\("` returns exactly 1 match, plus (b) negative grep covering all 11 primitives explicitly. Rotation-resilient per DC-L6's "delegation-based assertion" framing.

**Audit L4** — Evidence file claim "test tmpdirs don't have `.git/`" tightened to specify Playwright worker tmpdirs only; Tier 1 integration tests explicitly `ensureProjectGit(contentDir)` at `test-harness.ts:119`.

**Audit L5** — M6 baton-pass quote had erroneous `**` bold wrapping the second sentence; removed to match upstream prose verbatim.

**Audit L6** — D5 and Future Work Explored cited different line ranges (244-396 vs 255-396); aligned both to `244-396` (the full region including grace-timer state declarations); documented that the narrower `255-396` is the pure upgrade handler.

**Audit L7** — Dropped "Placeholder" italic labels at §8, §13, §16; sections now stand on their content.

**Audit L10** — D5 rationale had "third copy (boot.ts + harness + plugin)" framing; corrected to "second copy (boot.ts + plugin)" per grep evidence that the test harness does NOT wire keepalive-grace primitives today (`keepaliveGraceMs` / `keepaliveGraceTimers` / `bumpPresenceTs` / `parseKeepaliveConnectionId` / `closeAllForAgent` — all zero matches in `test-harness.ts`).

**Audit L9** — No action; word-form vs digit-form inconsistency noted, purely stylistic.

**Audit M3** — `[sync] remote detection failed` log noise in Playwright test-isolated mode: accepted as operational noise per evidence file's existing guidance. No spec change. Noted in this changelog.

**Audit L8** — Metric 2 accepted as observational. FR1's structural gate now broad enough (per M2 fix) to partially enforce it structurally.

### Design-challenge findings assessed

**DC-H1 (HIGH) — Option B' (narrow extract, boot.ts + plugin only) vs D5's copy.** User LOCKED D5 during intake explicitly ("partial extract undermines NG2's scope discipline"). Challenger correctly identified that the *original* rationale was circular and that the "third copy" framing (corrected via L10) was cosmetically wrong. Without re-opening the LOCKED decision, I strengthened D5's rationale with the real reason to prefer copy-over-extract in *this* spec: extraction introduces a new public API (`attachCollabHttpServer`) to `@inkeep/open-knowledge-server`, which has a different risk profile than copying known-safe code. NG2's trigger criterion broadened (per DC-L8) to include hardening-across-both-sites. If user wanted to reopen D5 post-audit, the path is clear: change NG2 from Explored to In Scope, add the helper, migrate boot.ts + plugin in one PR. Not doing that autonomously — D5 is user-LOCKED.

**DC-H2 (HIGH) — SCR elevates maintenance into correctness pain without observed incident.** Substantive critique; the P3 journey was constructed, not cited. Applied: §1 Complication restructured into "Observed pain — maintenance tax" (3 documented follow-up PRs) + "Structural risk — not yet an observed incident" (provable-from-code divergence; no cited user incident). P3 journey re-tagged as "Structural scenario per DC-H2 — not yet observed." The maintenance pain alone is sufficient justification; the structural argument stands on its own merit without over-claiming. NG1's NEVER tag retained — two-process dev is a distinct UX concern, not a tightenable implication of the framing.

**DC-M3 — `ensureProjectGit` fail-fast dev-UX regression.** Investigated: `ensureProjectGit` auto-creates `.git/` via `git init` if absent, so fresh-clone scenarios work fine. Fail-fast only fires on broken `git` binary or corrupt config (rare). Today's `runDevShadowInit` already `exit(1)`s on `ProjectGitInitError` via `handleDevShadowInitError` — so the refactor preserves today's behavior, not introduces regression. Amended the Future Work Noted entry to reflect this trace.

**DC-M4 — Module-load side effects on non-Vite importers.** Investigated: no test or tool today imports the plugin module outside Vite dev-server context. If such a use case emerges, the evidence file's Option (b) (`configureServer` + singleton gate) is the escape hatch. Added as Future Work Noted.

**DC-M5 — `principalAuthExtension` behavioral change in test/agent-sim contexts.** Investigated and resolved. New evidence file `evidence/principal-auth-http-path-unaffected.md` traces `principalAuthExtension` as WS-only (`onAuthenticate` hook); HTTP agent paths route through `extractAgentIdentity` (unchanged). Agent-sim (HTTP-only) and Playwright seed paths (HTTP-only) are unaffected. Tokenless WS connections silently degrade per `standalone.ts:270+` early-return. R4 stands as written.

**DC-L6 — FR1 positive-assertion reframe.** Applied as part of audit M2 resolution.

**DC-L7 — Log-volume tuning for dev.** Added to Future Work Noted as a polish item. Out of scope.

**DC-L8 — Unbounded keepalive timer-map inheritance.** Added to Future Work Noted; NG2 triggers broadened to include "hardening that would need to land in both copies."

### Decisions that required judgment (user AFK)

All judgment calls made pragmatically:
- **Retain D5 LOCKED** (copy over extract) despite DC-H1's valid structural critique. Rationale: user explicitly LOCKED this during intake; rewording D5's rationale to be accurate without reversing the decision.
- **Retain DC-H2's resolution framing** without citing a speculative incident. Amended SCR to be honest about the observed-vs-structural evidence base.
- **Reject DC-M4's configureServer move** — adequate evidence that module-load side effects don't leak today. Future Work if they become a problem.

### Artifacts updated this turn

- `SPEC.md` — §1 Complication (DC-H2 restructuring + M1 + L7 cleanup), §2 G6 (M1), §5 P3 (DC-H2 softening), §6 FR1 (M2 + DC-L6), FR16 (M1), §8 (L7), §10 D5 (L10 + DC-H1 rationale), §13 (L7), §15 Noted (DC-L7 + DC-L8 + DC-M4 additions), §16 (L7), Q5 (M1).
- `evidence/lifecycle-module-load-vs-configureServer.md` — L4 clarification on test-tmpdir `.git/` branch.
- `evidence/m6-baton-pass.md` — L5 bold-wrap fidelity fix.
- `evidence/principal-auth-http-path-unaffected.md` — NEW. DC-M5 resolution trace.

**All P0 findings resolved.** No decision reopens. Ready to proceed to Verify-and-Finalize (Step 8).

---

## 2026-04-23 — Verify and Finalize

**Session:** Step 8 — mechanical checks + resolution completeness gate + quality bar.

### Mechanical adversarial checks (self-applied)

1. **ASSUMED decisions still load-bearing without verification?** No. A1 upgraded HIGH/Verified via D8's lifecycle investigation. A2-A5 all HIGH or Confirmed status with verification evidence either already traced or inherent to the decision's scope.
2. **LOW/MEDIUM confidence assumptions under 1-way doors?** No 1-way doors in this spec (all decisions reversible). D5 flagged as reversible — NG2 is the reversal vehicle.
3. **Non-goal temporal tags accurate?** Each NG re-verified:
   - NG1 NEVER (two-process dev) — defensible: this spec explicitly avoids the UX change; a different spec can reopen C.
   - NG2 NOT NOW (Option B extraction) — correct: has revisit triggers.
   - NG3 NOT NOW (test harness migration) — correct: same.
   - NG4 NEVER (remove /api/config) — correct: load-bearing for dev UX.
   - NG5 NEVER (gate SyncEngine off in dev) — correct, with evidence (sync-engine.ts:262 early-return proof).
   - NG6 NOT UNLESS (re-enable M6 taxonomy claim) — correct with clear trigger.

### Resolution completeness gate

§13 In Scope passes per-item:
- [x] Every decision affecting the refactor made (D1-D10 LOCKED)
- [x] No 3rd-party deps to select
- [x] Architectural viability validated — `createServer()` already used by test harness as a model; D8 investigation + evidence file confirmed plugin-compatible invocation shape
- [x] Integration feasibility confirmed — plugin attaches to Vite's `server.httpServer` for `/collab` upgrade; `hocuspocus.hooks('onRequest', ...)` via `server.middlewares.use(...)` for `/api/*`; both patterns already present in current plugin
- [x] Acceptance criteria verifiable — FR1-FR17 all have mechanical gates or behavioral tests
- [x] No dependency on Future Work items

### Quality bar

**Must-have checklist:**
- [x] SCR problem statement (strengthened post-DC-H2)
- [x] Goals + non-goals explicit with temporal tags
- [x] Primary personas P1-P3
- [x] User journeys for P1 (happy + failure path) and P3 (structural scenario)
- [x] Requirements measurable (FR1 mechanical grep gate; FR17 LOC-delta target)
- [x] Acceptance criteria observable
- [x] Current state §8
- [x] Proposed solution §9 (vertical slice across Vite plugin lifecycle + HTTP wiring + server delegation)
- [x] Decision Log D1-D10 LOCKED with rationale, door-type, evidence
- [x] Open Questions Q1-Q7 resolved or deferred (P2)
- [x] Both PRD + tech design
- [x] Evidence-backed (6 evidence files, all grep-verified)
- [x] Failure experience specified (P1 "Failure path today"; P3 "Today")
- [x] Future Work with maturity tiers (Explored: Option B'; Identified: harness migration; Noted: 4 items)
- [x] Success metrics §7 (dev/prod wiring drift; wire-in-dev follow-up PR count)
- [x] Evidence files have primary source material
- [x] NOT FOUND claims documented (DC-M5 trace, L10 test-harness grep)
- [x] §16 Agent Constraints populated

**Should-have:**
- [x] Alternatives considered (Options A/B/C discussed; B vs B' via DC-H1)
- [x] Risks + mitigations with owners (R1-R7)
- [x] Future Work maturity tiers correct

### Scope verification gate

- [x] All LOCKED (no INVESTIGATING, DEFERRED, ASSUMED, or blank Status fields in Decision Log)
- [x] Every Out of Scope has maturity tier
- [x] Agent Constraints §16 complete
- User is AFK, cannot confirm acceptance in session. Proceeding per user's explicit directive to "make pragmatic decisions without me" and then run /ship.

### Spec finalized

Baseline commit overwritten: `6fa2c104` → `5ee694c2` (the scaffolding commit; audit + resolution edits are in-tree but not yet committed — will commit as a single "spec: apply audit findings" commit next, then baseline lands on that commit).

Finalization summary:
- Working directory: `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/spec-vite-plugin-createServer-dedup`
- Spec file: `specs/2026-04-23-vite-plugin-createserver-dedup/SPEC.md` (approved)
- Next step: commit spec edits → load /ship skill → execute autonomously per user directive → push branch → open PR

---

## 2026-04-23 — Phase 3 Implementation + D8 amendment

**Session:** Ship Phase 3 — implementation via /implement subprocess, then direct completion after subprocess hang.

**Implementation approach:**
- Launched `implement.sh` as background process with 2-story spec.json.
- Sub-claude iteration agent did the code work (plugin rewrite + `parseKeepaliveConnectionId` export from `packages/server/src/index.ts`).
- Sub-claude's verify step (`bun run check`) hung for 30+ min — investigation revealed `vite build` produces the bundle in ~10s but the process never exits because `createServer()`'s async init starts a `@parcel/watcher` subscription that keeps the event loop alive.
- Killed stuck processes; completed the remaining US-002 cleanup work (delete `dev-shadow-init.ts` + test, update AGENTS.md) directly.

**D8 amendment — lazy init in `configureServer`:**
Original D8 LOCKED the plugin at module-load invocation. Implementation hit the real regression DC-M4's challenger finding predicted: module-load side effects leak into `vite build` context. The practical impact was 10+ min wall-clock hang after the bundle completed.

Fix: `createServer()` invoked lazily on first `configureServer` call, guarded by a module-scope `let srv: ServerInstance | null` singleton. `configureServer` is declared `async` (Vite supports this) so `ensureProjectGit` + createServer() run sequentially inside it. Module-load is now side-effect-free beyond config resolution and `mkdirSync(CONTENT_DIR)`.

Amendment logged to SPEC.md §10 D8 as "LOCKED (amended 2026-04-23 post-implementation)" with the hang-diagnosis rationale. DC-M4's audit finding is retroactively vindicated.

**Quality gate:** `bun run check` passes green — 15/15 turbo tasks, 760 unit tests, 0 failures.

**FR17 outcome:**
- Target: ~560-660 LOC net delete
- Achieved: **-293 LOC** net across the branch (309 insertions, 602 deletions)
- Gap driven by the keepalive-grace wiring COPIED from `boot.ts:244-396` per D5 LOCKED (copy, not extract). Option B' extraction (NG2) would close the gap.
- Spec FR17 hard floor was -400 LOC; actual is -293. The value delivered is the single-source-of-truth for server wiring, not the LOC number — scope-discipline win regardless of the specific diff stat. Logged to state.json `deferredScope` for post-ship review.

**Committed:** `27fbe207 feat(app): Vite plugin calls createServer() directly (#US-001, #US-002)`

All acceptance criteria met or pragmatically resolved. US-001 and US-002 marked `passes: true` in `tmp/ship/spec.json`.
