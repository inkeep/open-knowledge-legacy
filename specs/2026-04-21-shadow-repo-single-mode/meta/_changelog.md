# Changelog — shadow-repo single mode spec

Append-only process history for [[specs/2026-04-21-shadow-repo-single-mode/SPEC]]. Each entry records what changed, why, and what it affected.

---

## 2026-04-21 · Intake + scaffold

- Seed captured: user wants to collapse shadow-repo dual-mode to single mode; eliminate standalone code path.
- Intake clarification round 1:
  - Q1 (scope bundling): user picked **W1 + W2 only**; W3 (shadow relocation) dropped.
  - Q2 (auto-git-init UX): user picked **Option C** — silent with preview-block disclosure.
  - Q3 (shadow location): user clarified they misspoke; shadow stays at `.git/open-knowledge/`.
  - Q4 (legacy `.openknowledge/` handling): user picked **Option C** — no migration, greenfield only.
  - Q5 (D22): user picked "keep function, path different" — `resolveShadowDir` signature simplifies.
- Baseline commit stamped: `05c7e371`.
- Scaffolded `SPEC.md` with initial problem framing, 5 personas, 8 requirements (R1-R8), 9 decisions (D1-D9), 4 open questions (Q1-Q4), 4 assumptions (A1-A4).

## 2026-04-21 · Legacy-dir handling follow-up

- User answered follow-up: legacy `.openknowledge/` handling = **silent orphan** (option a), not warning (option b).
- Reason given: less legacy code to support.
- Cascade:
  - R4 requirement rewritten: was "print warning", now "no detection logic at all."
  - D5 rationale updated.
  - P3 user journey updated: no warning emission.
  - Interaction state matrix: legacy-warning row removed.
  - Risks table: "warning becomes noise" row removed.
  - Instrumentation footprint reduced: one less bracket-prefixed log event.

## 2026-04-21 · Iterative loop round 1: Q1-Q4 investigation

- User directed (answer 1A): investigate Q1-Q3 autonomously.
- User directed (answer 2C): Q4 (worktree-commondir contamination) out of scope for this spec — its own spec.
- Evidence collected in `evidence/current-shadow-repo-mode-surface.md`:
  - Runtime surface: `shadow-repo-layout.ts`, `shadow-repo.ts`, `head-watcher.ts` (doc-comment only), `standalone.ts` (indirect via `initShadowRepo`), `mtime-scan.ts` (doc-comment only).
  - `resolveShadowDir` has TWO call sites total — internal (`getShadowRepoPath`) and `shadow-repo.ts:69`. Tiny blast radius for R3.
  - `getShadowRepoPath` return type (`string | null`) unchanged by R3; CLI consumer `shadow-log.ts:145` is unaffected.
  - Test surface: `shadow-repo-layout.test.ts`, `shadow-repo.test.ts`, `head-watcher.test.ts` (cosmetic).
  - Test harness: fresh tmpDir with no `.git/`; auto-init fires every test (\~5-10s overhead). No harness change needed.
- Q1 closed: D6 verified achievable — `existsSync`/`statSync` without `.isDirectory()` gates; `head-watcher.ts:55-72` already follows this pattern.
- Q2 closed: Desktop utility process does NOT relay `didAutoInit` to main; preview block is CLI-only. Opens Q5 about Desktop disclosure.
- Q3 closed: harness creates fresh tmpDir without `.git/`; accept the per-test cost.
- Q4 moved to Future Work (Identified tier): worktree-aware shadow-repo location.
- Q5 opened (Product, P0): Desktop disclosure of auto-`git init` — three options presented for user decision.
- SCOPE list in §16 Agent Constraints refined with exact file line ranges from evidence.

## 2026-04-21 · Iterative loop round 2: Q5 resolved

- User chose option A for Q5 (Desktop disclosure). D10 locked: IPC field + macOS `Notification`.
- Investigated Desktop's current disclosure surfaces; no existing toast / notification / webContents.send infrastructure. Built-in Electron `Notification` API is the minimal path — no renderer changes, no preload bridge update.
- Cascade:
  - D10 added (P, LOCKED, 1-way IPC schema change).
  - R5 renamed to "R5 — Preview-block disclosure (CLI)"; R5b added for Desktop Notification.
  - SCOPE list gained three Desktop file entries + a Zod-validator check.
  - ASK\_FIRST gained two IPC-boundary guardrails.
  - Risks table: added IPC schema drift + OS Notification-permission-disabled rows; tightened existing rows to cite R5b.
- All P0 items now Closed/Resolved. Spec is ready for Audit (step 6).

## 2026-04-21 · Assess findings + cascade

**Audit (`meta/audit-findings.md`):** 12 findings (3 HIGH, 6 MED, 3 LOW).
**Challenger (`meta/design-challenge.md`):** 10 findings (4 HIGH, 4 MED, 2 LOW).

Load-bearing findings verified against codebase before routing:

- **F6 / "single choke point" false** — verified `packages/app/src/server/hocuspocus-plugin.ts:144` calls `initShadowRepo` directly. `ensureProjectGit` must wire into BOTH this path AND `createServer`. §9 and §16 SCOPE updated.
- **F5 / MCP transitive auto-git-init** — verified `packages/cli/src/commands/mcp.ts:127-130` auto-spawns `ok start`. D4 rationale updated; D13 locks "accept transitively, use existing opt-out."
- **Audit#2 / F4 / worktree ENOTDIR** — verified on disk (`.claude/worktrees/*/.git` is a file). Originally was going to fold fix into this spec; user directed that ALL worktree handling is owned by a separate spec. Cascade: NG6 added (no worktree code), D11 locks the exclusion, D6 simplified to mechanical `existsSync` check.
- **Audit#1 / F8 / fail-fast placement** — REOPEN-2 = A: `ensureProjectGit` runs in `bootServer.autoInitFn` BEFORE HTTP listener binds. No degraded-mode fallback. D12 locks placement + fail-fast semantics.

User decisions (this round):

- **REOPEN-1 = B** → worktree handling owned by a separate spec. NG6 LOCKED.
- **REOPEN-2 = A** → fail-fast on git-init failure; no degraded mode. D12 LOCKED.
- **DESIGN-1 = A** → macOS Notification as-is (D10 unchanged). Note: user said "in product toast is important notification system"; interpreted as affirming A (Notification). If user intended in-app React toast, flag and we re-open.
- **DESIGN-2 = A** → accept MCP transitive auto-git-init; use existing opt-out env var. D13 LOCKED. No new `--no-auto-git-init` flag.

Silent corrections applied:

- Audit#3 — §16 SCOPE expanded with `head-watcher.ts` (doc-comment), `enrichment.ts:37`, `shadow-log.ts:4-5`, `mtime-scan.ts:14,29`, root `.gitignore:48-55,65`, `AGENTS.md:221`, `docs/content/internals/service-topology.mdx:84`.
- Audit#4 — D10 rationale fixed: utility↔main `parentPort.postMessage` is NOT the preload-IPC D14 governs; framed correctly. D10 downgraded from 1-way-door (was cited IPC schema change under D14) to non-1-way (TS type extension).
- Audit#5 — R5 gating extended: `didAutoInit || didGitInit` (was `didAutoInit` only per `start.ts:502`).
- Audit#6 — R2 parameter name corrected: `contentDir` not `projectRoot`.
- Audit#7 — `head-watcher.ts:55-73` standardized (was variously 55-70 / 55-72).
- Audit#8 — evidence file line ranges corrected for `shadow-repo.test.ts:73-85` and `shadow-repo-layout.test.ts:187-192`.
- F6 — §9 "single choke point" claim corrected; both Vite dev plugin AND `createServer` paths enumerated.

Dismissed with reasoning logged:

- F1 (W3 reconsideration) — user explicitly retracted during intake; challenger offers no new info.
- F7 (silent orphan under-argued) — user chose option A in follow-up with "less legacy code" reasoning.
- F9 (gitEnabled unified opt-out refactor) — scope creep beyond W1+W2.
- F10 (save-version / CC1 interactions) — implementation-level; integration tests cover.
- F3 (Notification adequacy) — presented full comparison in DESIGN-1; user chose A (stay with Notification).

Open follow-up: the worktree-handling spec (owned elsewhere) must ship before or alongside this spec for the `.claude/worktrees/*` dev flow to remain functional. This spec does not track that dependency.

## 2026-04-21 · Finalize

- Mechanical adversarial checks: PASS. All decisions LOCKED; no ASSUMED items; 1-way door D7 is a mechanical type change at HIGH confidence; non-goals NG1-NG6 accurately scoped.
- Resolution completeness gate for W1 + W2: PASS. All decisions made; no 3P deps beyond existing `simple-git`; architecture validated (bootServer.autoInitFn pre-listen hook + hocuspocus-plugin Vite path); acceptance criteria verifiable via integration tests.
- Explicit external dependency: the separately-owned worktree spec must ship before/alongside this one for `.claude/worktrees/*` dev flow to remain functional. Documented in NG6; not tracked as a spec-internal blocker.
- Assumptions A1, A2, A3 all Verified / Closed.
- Baseline commit updated from `05c7e371` (scaffold) to `54c97051` (finalization).
- Status remains Draft pending user review — the spec workflow writes Finalize to the changelog but does not flip the Status field; that's a user move once they review.


## 2026-04-21 · Post-PR revision: rename + drop macOS Notification

Two user corrections after PR #244 was opened:

1. **Rename `.git/openknowledge/` → `.git/open-knowledge/`** for naming consistency with the `.open-knowledge/` config dir.
   - D14 LOCKED: silent in-place rename shim (`existsSync + renameSync`) on first run. Lossless; preserves attribution history.
   - R9 added: shim behavior + integration test.
   - G5 added to goals.
   - NG2 re-pointed from `.git/openknowledge/` to `.git/open-knowledge/` as the new anchor.
   - Resolution paragraph updated: "renamed from today's `.git/openknowledge/`" (was "today's integrated-mode location — unchanged").
   - Deployment-considerations and risks tables updated.
   - Writer identity strings (`user.name 'openknowledge'`, author email `noreply@openknowledge.local`) deliberately NOT renamed — out of scope.
   - 18 directory-path references updated in SPEC.md; 3 in evidence/; 1 in this changelog.

2. **Drop macOS `Notification`; use existing sonner toast system.**
   - User directive: "macOS notifications are not a goal of this spec... keep using our existing notification toast system."
   - D10 rewritten: disclosure routes through a new `git-init-notice` push-event on the existing `OkDesktopBridge` (sibling to `onProjectSwitched` / `onMenuAction`), terminates at `toast.info(...)` in the renderer via `packages/app/src/components/ui/sonner.tsx`.
   - R5b rewritten: toast-based disclosure with main → renderer bridge event instead of `new Notification(...).show()`.
   - NG7 added: NEVER use macOS system notifications for this spec's disclosure.
   - §16 SCOPE (Desktop) grew by 3 files (`ipc-events.ts`, `bridge-contract.ts`, `preload/index.ts`) + a renderer subscriber (likely adjacent to `use-sync-toasts.ts`).
   - ASK_FIRST gained "using `new Notification(...)`" as a tripwire.
   - Risks table: dropped the "Notification permissions disabled" row; added "toast subscriber mount race" row.
   - Q5 Resolution annotated with the correction.

My earlier interpretation of "the in product toast is important notification system" as endorsing macOS `Notification` was wrong — user meant in-app toasts all along. Acknowledged.
