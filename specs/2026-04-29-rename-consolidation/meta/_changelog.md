# Changelog — rename-consolidation spec

Append-only process history. Each entry: timestamp, what changed, why.

---

## 2026-04-29 — Spec scaffolded

- Created `specs/2026-04-29-rename-consolidation/SPEC.md` from template.
- Foundation: world model report at `reports/rename-handling-gaps/REPORT.md` (restored from `rename-report` branch into worktree).
- Baseline commit stamped: `71517635`.
- Pre-resolved 6 of 8 open questions in SPEC §10 based on prior user-collaborative decisions:
  - OQ-1 (summary semantics) → D-A7 single folder-level summary.
  - OQ-2 (intra-folder rewrite algorithm) → D-A9 rename-map single-pass.
  - OQ-3 (journal v2 schema) → D-A5 discriminated union.
  - OQ-4 (MCP tool API shape) → D-A6 mirror `rename_document` identity fields with `fromFolder`/`toFolder`.
  - OQ-6 (D22 precedence agent vs principal) → D-A8 agent wins.
  - D-A1 — D22 amendment marked LOCKED 1-way door per user direction; needs explicit confirmation before finalize.
- Open questions remaining for investigation: OQ-5 (cheap aux guards), OQ-7 (principalId trust), OQ-8 (handleRollback symmetry).
- Workflow: skipped /worldmodel dispatch (already built); proceeding to Phase 4-5 of /spec workflow.

## 2026-04-29 — OQ-7 + OQ-8 closed; design pivot integrated

- Two background investigations completed and persisted to `evidence/`:
  - `oq-7-principal-trust-boundary.md` — server is single-principal; body-supplied `principalId` cannot be safely trusted; server uses `getPrincipal()` directly.
  - `oq-8-rollback-symmetry.md` — `handleRollback` shares D22's structural pattern with `handleRenamePath`; extends symmetrically with the same `extractActorIdentity` helper.
- User confirmed all open decisions: D-A1 supersede (not in-place), D-A6 `fromFolder`/`toFolder`, D-A7 single folder-level summary, D-A8 agent precedence, D-A9 single-pass with rename-map, pivot 7 server-side principal, pivot 8 rollback symmetry, D-A5 flat journal schema (no `kind`).
- Spec changes applied (cascade):
  - §1 Resolution: D22 superseded with D22-A; UI payloads explicitly unchanged.
  - §5 P1 happy path: removed `principalId` from POST body example.
  - §6 FR5 rewritten: server uses `getPrincipal()` fallback; FR6 reframed for null-principal edge case; FR7b added for rollback symmetry.
  - §9 Architecture diagram: actor-identity routing flow updated.
  - §9 Data model: journal v2 schema finalized — flat shape, no `kind`, `affectedDocs[]` drives recovery.
  - §9 API/transport: body shape no longer includes `principalId`.
  - §9 Auth/permissions: principal source of truth is `getPrincipal()`.
  - §9 Shadow paths: added "body `principalId` silently ignored" test case.
  - §9 Failure modes: replaced "both agentId and principalId" row with "body principalId silently ignored" row.
  - §10 Decision Log: D-A1, D-A5, D-A8, D-A9 reframed; D-A10 (rollback symmetry) and D-A11 (trust boundary) added; all marked LOCKED.
  - §11 Open Questions: OQ-1 through OQ-4, OQ-6, OQ-7, OQ-8 closed; OQ-5 still open (cheap aux guards, deferred to implementation).
  - §13 Deployment: principal wiring concern removed; `getPrincipal()` test bootstrap concern added.
  - §16 Agent constraints SCOPE: removed FileTree.tsx principalId work; updated TimelinePanel.tsx note. STOP_IF reorganized.
- One open question remains: OQ-5 (extension flip + content.include admission) — explicitly deferred to implementation; both bolt-on candidates if cheap, otherwise NG5/NG6.
- Next: dispatch audit + challenger subprocesses (Phase 6).

## 2026-04-29 — Audit + challenger findings folded in

Both subprocesses returned. Findings persisted at `meta/audit-findings.md` (12 findings) and `meta/design-challenge.md` (9 findings).

**Pure corrections applied directly:**
- Audit-1: §9 routes table fixed — Restore payload `{docName, commitSha}` (was incorrectly `{principalId}`).
- Audit-2: §7 Metric 2 target rewritten — UI rename attribution keys off "no `agentId` in body, principal loaded," not off "principalId in body."
- Audit-3: oq-8-rollback-symmetry evidence file — appended supersession note pointing to OQ-7/D-A11.
- Audit-4: §10 "Decisions still open" subsection refreshed — only OQ-5 remains.
- Audit-5: D-A9 corrected — `runSerialized` is the actual concurrency primitive (not `writeTracker`, which is the file-watcher self-write detection map).
- Audit-6: A3 marked Obsolete; A3b added — server's loaded principal at HTTP request time.
- Audit-7: §14 risks table — `principalId` spoofing risk replaced with `principal.json` corruption (the residual real risk).
- Audit-8: §9 v2 schema — added explicit pseudocode for multi-destination cleanup.
- Audit-9: D-A4 line cite corrected — `_performManagedRename` at api-extension.ts:1114-1244.
- Audit-10: §9 FileTree dispatch updated — TWO sites at lines 753 + 812, not just 687.
- Audit-11: §8 folder branch row — clarified backlink index updates persist on-disk too.
- Audit-12: oq-7 evidence file — verification gate is `onAuthenticate` at `standalone.ts:450`, not `resolveWriterFromOrigin`.
- Challenger M4: D-A11 rationale softened — multi-principal future requires call-site changes regardless; body-trust rejection stands on its own.
- Challenger M5: D-A9 extended — explicit handling for collisions (409), swap cycles (placeholder-substitute), case-only renames (400, out of scope).
- Challenger M7: FR3 + D-A4 — auto-create destination parent directory pinned (preserves current behavior at api-extension.ts:1199 / 4035).
- Challenger L8: D-A5 rationale reframed — leads with "recovery doesn't need it"; v3 schema bump path noted.

**Decision-implicating findings — surfaced to user (NOT yet applied):**
- Challenger H1: D-A8 may silently demote principal context under MCP (preserve `actor.principalId` in metadata even on agent-wins?).
- Challenger H2: D-A2 side-effect anonymity may be wrong invariant for principal-driven renames.
- Challenger H3: Bundle thesis — un-bundle principal attribution from consolidation?
- Challenger L9: D-A3 atomic deletion — localhost HTTP exposure consideration.

These four await user judgment before further updates.

## 2026-04-29 — User judgment on 4 decision-implicating items; spec finalized

User decisions on the four items surfaced post-audit:

1. **Challenger H1 — D-A8 refinement: ACCEPT.** `extractActorIdentity` MUST populate `actor.principalId` from `getPrincipal()` even when an agent wins on writer ID. Symmetric with `buildAgentActor()` for non-rename writes. D-A8 row in §10 updated; codified as test in §17 SCOPE.
2. **Challenger H2 — D-A2 anonymity: REJECT (keep as drafted).** Side-effect docs stay anonymous for BOTH agent and principal renames. D-A2 row + NG8 updated with explicit rationale: a rename's intent is moving one doc, not editing N. The renamed doc itself records the actor; cascading backlink rewrites are mechanical side effects. User explicitly chose this over the asymmetric alternative.
3. **Challenger H3 — un-bundle: ACCEPT.** New §16 "Phased delivery" added. Phase 1 (rename attribution) and Phase 2 (consolidation + folder + journal v2 + MCP) ship as separate PRs. Phase 1 first because it's small, server-side, and provides Phase 2's `extractActorIdentity` helper. §17 Agent constraints split into PHASE 1 SCOPE / PHASE 2 SCOPE / EXCLUDE / phase-specific STOP_IF.
4. **Challenger L9 — D-A3 atomic deletion: ACCEPT.** No deprecation shim. Two active users; localhost HTTP exposure breakage acceptable. Note added to D-A3: document the deletion in published `@inkeep/open-knowledge` changelog so external `localhost:<port>/api/rename` callers (browser extensions, scripts) are notified.

Spec verification (Phase 7):
- Mechanical adversarial checks pass: no ASSUMED decisions; 1-way doors (D-A1, D-A11, D-A3) all LOCKED with evidence + user confirmation; non-goal temporal tags accurate.
- Resolution completeness gate passes for In Scope items.
- Future Work classified into Explored / Identified / Noted tiers.
- Quality bar checks pass.

**Spec finalized.** Authoritative baseline commit: `71517635` (worktree HEAD; spec was authored on this commit).
