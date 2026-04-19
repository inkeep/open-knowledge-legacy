# Changelog — Agent Identity & Attribution Foundation

Append-only process history. Each entry: date, summary, rationale when non-trivial.

## 2026-04-18 — Spec initialized

- Baseline commit stamped: `420f2b5e` (worktree `worktree-agent-identity-worldmodel`).
- Worldmodel REPORT already existed at `reports/agent-identity-attribution-worldmodel/REPORT.md` (commit `420f2b5e`); used as evidence floor.
- Evidence files copied into spec-local `evidence/`:
  - `crdt-to-git-translation.md` (CRDT → git pipeline trace, per-session commit mechanics, subsystem interactions)
  - `yjs-attribution-verification.md` (C1–C8 verification against yjs v13.6.30 + v14-rc.x)
- SPEC.md scaffolded with §1–§16 complete. 20 decisions locked (D1-D20). 11 open questions tracked (Q1-Q11).

### Intake framing (Step 1)

- Problem statement (SCR) drafted and confirmed with Nick.
- Stress-tested via 5 probes (demand reality, status quo, narrowest wedge, observation, future-fit).
- 5 F1-driving product questions answered during intake:
  - Q1 (Two-of-same-type): (b) distinct
  - Q2 (Persistent vs session-scoped): hybrid — UX-aggregated by type, storage-distinct by session
  - Q3 (Selective cross-agent undo): per-session
  - Q4 (Timeline primary unit): session-for-storage, burst-for-render
  - Q5 (Retroactive disavowal): undo whole stack + checkpoints

### Directive applied

Nick clarified: greenfield / no-deferred-debt / architecturally-best-not-expedient directive. Scope expanded accordingly:

- Shadow ref topology, git commit schema, project-repo attribution, multi-project identity UX, pass-boundary model, `isPairedWriteOrigin` hardening, transaction-effect capture — all promoted In Scope (were parked as Future Work under pragmatism).
- Attestation stays Future Work (Explored), because prerequisite (MCP protocol) doesn't exist.
- Per-session fan-out shadow refs adopted over single-writer funnel (greenfield waives backward compat).

### Key investigations

- **CRDT → git translation feasibility** (evidence/crdt-to-git-translation.md): Option A (doc-state-after-session's-write) feasible, Option B (isolated contributions) infeasible on Y.js v13, Option C (baseline-diff) costly. Result: D6 LOCKED on Option A.
- **Y.js attribution capabilities** (evidence/yjs-attribution-verification.md): Verified C1-C8 claims. Refined: `PermanentUserData` is a v13 partial mechanism but awkward for server-authoritative arch; v14 has proper `AttributionManager` + `IdMap` but RC-only. Result: D5 LOCKED on y-lite approach (transaction-effect capture) today; v14 native migration as Future Work.

### Naming semantics pressure-tested

Nick flagged "external" writer-ID as fuzzy. Resolved by splitting identity (writer) from action (subject-prefix):

- Writer-IDs (nouns, identity): `agent-<conn>`, `human-<principal>`, `file-system`, `git-upstream`, `git-branch-switch`, `openknowledge-service`
- Subject-prefixes (verbs, action): `wip:`, `checkpoint:`, `reconcile:`, `import:`, `park:`, `rollback:`, `rename:`

Result: D7 + D8 LOCKED.

### Items 1-5 batch decisions

All resolved under the directive + conversation:

1. **F1 implementation path**: (ii) per-session origin objects — D2 LOCKED
2. **Writer-ID for non-agent**: (γ)/(β) hybrid — D7 LOCKED
3. **Principal representation**: (b2) stable UUID + git-config display — D9 LOCKED
4. **Timeline unit**: session-storage + burst-render — D10 LOCKED
5. **Headless agent weight**: forward-looking — D14 LOCKED

### Current workflow state

- Task 5 (Intake): completed.
- Task 6 (Scaffold): completed.
- Task 7 (Backlog): completed — 54 candidate questions extracted via three probes.
- Task 8 (Iterate): in progress → substantially complete at this commit.
- Task 9 (Audit): pending — ready to spawn.
- Task 10 (Assess findings): pending.
- Task 11 (Verify + finalize): pending.

## 2026-04-18 — Iteration loop (D21-D54)

Dispatched 3 parallel Opus investigations covering 27 technical + design questions from Task 7's extraction. Evidence persisted to:

- `evidence/um-mechanics.md` — Y.UndoManager internals, effect-diff derivation, doc-op edge cases.
- `evidence/session-lifecycle.md` — Keepalive correlation, WS close grace, subprocess reconnect, `getSession` race, `onStoreDocument` threading, remote-origin dispatch.
- `evidence/shadow-git-and-sweep.md` — GPG split, ref cleanup, legacy migration, identity sanitization, L2 drain partitioning, park mutex, park ref conflict resolution, FR-5 enumeration, metadata UM scope, observability, testing, documentation.

34 additional decisions locked (D21-D54). Summary:

**UM mechanics (D21-D26):** Rely on UM auto-tracked origin; effect-diffs via `YTextEvent.delta`; `trackedOrigins` writes-only with `captureTransaction` defense; deep freeze origin; `captureTimeout = 500`; UM scope is `[ytext, metaMap, activityMap]`; explicit UM destroy on doc unload/delete/rename.

**Session lifecycle (D27-D32):** Keepalive correlation via URL query `?connectionId=<UUID>`; 30s cancellable grace on WS close; subprocess restart = always new session; `getSession` in-flight promise dedup (fixes latent race); `onStoreDocument` one-file threading; remote-arrived origin structured dispatch.

**Shadow git + sweep (D33-D48):** GPG/hooks split preserved (shadow plumbing, main-git porcelain); drop `human-` prefix; delete legacy `server` refs on first-run; `sanitizeGitIdentity()` utility; effect-diff fail-dev-throw + prod-swallow; L2 drain per-writer partition; park mutex moved; park on session refs (not `git-branch-switch`); `applyExternalChange` attributes to `file-system`; FR-5 covers 9 mutating endpoints + meta-test; observability conventions per-path; testing strategy per FR; docs land in AGENTS.md precedents + internals + inline.

**Product decisions (D43-D45, D49-D54):** AgentFocus fires on agent-undo + rollback, not rename (Q37); closed-session UI removes from presence post-grace (Q42); non-git mode shadow-only (Q50); activity-log storage = Y.Map('agent-activity') on doc with 30d/500-entry eviction (Q1/Q10/Q11); human browser principal hoisting via `onAuthenticate` (Q2); principal.json gitignored by default (Q5); `openknowledge-service` as narrow fallback (Q7); subject-prefix target format (Q8); 30d per-writer GC TTL (Q3); legacy migration = delete (Q9); effect-diff encoding = YTextEvent.delta (Q4); keepalive correlation locked (Q6).

All initial Q1-Q11 now CLOSED. New residual questions Q100-Q105 tracked for implementation-time resolution (mostly P2, one P0 empirical — Q104 on cross-session undo behavior, to be covered by fuzzer extension).

Updated FR-3 (UM scope extension), FR-5 (endpoint list expansion), §8.6 ref table (drop `human-` prefix) to reflect decisions.
