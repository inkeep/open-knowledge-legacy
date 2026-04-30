# Changelog — `api-design-hardening` spec

Append-only log of substantive changes (decisions made, scope shifts, evidence added, audit cycles run). Each entry is dated.

---

## 2026-04-30 — Spec scaffolded

- Created `SPEC.md` from template with placeholder sections for Step 3+ population.
- Created `evidence/` directory with `_user_outcomes.md` capturing user's intake framing ("code-health polish + general hardening before next-round capability work — defensible cut").
- Stamped baseline commit `5827e8c5` (cycle-49 fix from PR #270, the merge target's predecessor).
- Workflow tasks created (#145-#152) covering Steps 1-8.
- Step 1 (Light intake) completed — user direction: middle-ground hardening, not speculative future-proofing.

**Pending:** Step 2 dispatching `/worldmodel --depth full` to ground the contract-surface topology + scan for concretely-planned next-round capability work.

---

## 2026-04-30 — Step 2 (Worldmodel) completed

- `/worldmodel --depth full` dispatched via `general-purpose` Task subagent; full topology saved to `evidence/_init_worldmodel.md`.
- Topology surfaced 3 critical refinements over the prior audit:
  - **S3 (`ClassifiedLinkTarget`) is bidirectional** — both `app` (renderer) AND `server` (`backlink-index.ts`). Audit treated it as app-only.
  - **`UploadWriteReason` is type-erased at JSON boundary** — server throws typed class, client at `image-upload/index.ts:319` parses `e.message` substring back. No compile-time link.
  - **PR #354 (typed-IPC migration) is already seeded** as Nick's `worktree-typed-ipc-migration` branch — directly responding to S6's "Currently 22 — past the trigger" comment. S6 work in this hardening would be throwaway.
- Three concrete next-round work tracks identified: (a) typed-component-nodes Phase 2 viewers as S5's first registrar; (b) cb-v2 prop file-upload's server-endpoint split as S1's next consumer; (c) three open PRs on `JsxComponentMeta` (#380 placeholder, #374 Mermaid, #372 Math) — must NOT claim that surface in this spec.

## 2026-04-30 — `/type-safety` cross-reference loaded

- Read three load-bearing references: `discriminated-unions.md`, `validation-narrowing.md`, `zod-v4-patterns.md`.
- Findings extracted to `evidence/type-safety-cross-reference.md`.
- Sharpenings to In Scope items: Zod v4 footgun 7 (lazy DU member validation) drives FR9 (module-load smoke test); footgun 6 (.transform()) drives "use .overwrite() if normalization needed"; Standard Schema native `~standard` in v4 drives D7 (zero-cost export). Validation-narrowing's "narrow upstream" advice confirms IS5's fix shape exactly.
- No new In Scope items added; existing items refined.

## 2026-04-30 — Step 3 (Frame on topology) completed

- SCR drafted with worldmodel-grounded Situation + Complication + Resolution.
- Stress-tested across 5 probes (demand reality, status quo, narrowest wedge, observation, future-fit) — all pass; no probe lands false.
- Personas: P1 internal devs (primary); P2 LLM agents (already convergent on `{ ok, error }`); P3 operators (existing structured Pino logs); P4 future SDK consumers DEFERRED.
- Scope hypothesis confirmed: **In Scope** IS1-IS5 (Zod schema SSOT, assertNeverLinkTarget, ok/found rename, AssetViewerRegistry lifecycle, server-client union sharing). **Future Work** OS1-OS5 (open union, RFC 9457, Idempotency-Key, PropDef Zod, S6 IPC).
- 11 decisions LOCKED into Decision Log (D1-D10) + 1 DELEGATED (D11 rename).
- 4 assumptions captured (PR #354 sequencing, PR #380/#374/#372 sequencing, Zod v4 native Standard Schema stability, UUID correlation field cardinality).
- §1-§9 + §13-§15 of SPEC.md populated. §11 Open Questions intentionally empty pending Step 4. §16 Agent Constraints awaits Step 8.

**Pending:** Step 4 (systematic open-question extraction + prioritization). User has explicitly paused before this step.

---

## 2026-04-30 — Worktree migration: finalize/asset-embed-surface → spec/api-design-hardening

- Spec was scaffolded + Steps 1-3 completed inside the post-#270 worktree (`finalize/asset-embed-surface`, baseline `5827e8c5`). User flagged this as suboptimal — hardening of code that just shipped should branch from main (post-merge), not from the source branch.
- PR #270 confirmed merged on origin/main as `fbfe9673` (squash-merge).
- Spec committed locally on `finalize/asset-embed-surface` as `efdbfd8b` (5 files, 759 insertions).
- New worktree created at `.claude/worktrees/api-design-hardening/` on new branch `spec/api-design-hardening` branched off `origin/main` (`fbfe9673`).
- Spec commit cherry-picked onto new branch (became `16642759` post-amend).
- Baseline commit updated to `fbfe9673` (canonical post-#270 state; content-equivalent to investigation-time `5827e8c5`).
- AGENTS.md size hook gate passed cleanly on new worktree (39965 chars at HEAD vs the doubled-content artifact at 79933 chars in the source worktree, which was stashed before the source-worktree commit).
