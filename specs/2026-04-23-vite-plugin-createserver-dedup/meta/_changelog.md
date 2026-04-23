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
