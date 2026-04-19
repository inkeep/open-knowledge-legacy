# Audit Findings

**Artifact:** `specs/2026-04-14-github-sync/SPEC.md`
**Audit date:** 2026-04-15
**Total findings:** 10 (3 high, 4 medium, 3 low)

---

## High Severity

### [H1] Stale P4 persona references withdrawn FR10 trust gate as active behavior

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §4 Personas / consumers — P4 description
**Issue:** P4 (AI agent author) states "The trust gate (FR10) blocks agent writes on untrusted repos; once trusted, agent writes flow through the same auto-sync pipeline as human writes." FR10 was WITHDRAWN (2026-04-15, D9 cascade). The persona describes a trust-gating behavior that no longer exists anywhere in the spec.
**Current text:** "The trust gate (FR10) blocks agent writes on untrusted repos; once trusted, agent writes flow through the same auto-sync pipeline as human writes."
**Evidence:** §6 FR10 explicitly marked `**WITHDRAWN 2026-04-15** — agent-write gating removed along with trust model.` §10 D9 WITHDRAWN. §13 "Trust gate consideration (rejected)."
**Status:** INCOHERENT
**Suggested resolution:** Rewrite P4 second sentence to: "Agent-authored commits reach origin alongside user-authored content via the same auto-sync pipeline." Remove FR10 reference entirely.

---

### [H2] Success metric M3 measures a withdrawn feature

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §7 Success metrics & instrumentation — M3
**Issue:** M3 is "Trust prompt completion rate. Trust / Keep read-only / Review config / dismiss distribution." The trust prompt was removed (D9 WITHDRAWN, FR9/FR10 WITHDRAWN). There is no trust prompt to measure. An implementer following §7 would try to instrument a non-existent surface.
**Current text:** "**M3: Trust prompt completion rate.** Trust / Keep read-only / Review config / dismiss distribution."
**Evidence:** D9 WITHDRAWN; FR9 + FR10 WITHDRAWN; §13 explicitly titled "Trust gate consideration (rejected)."
**Status:** INCOHERENT
**Suggested resolution:** Delete M3 entirely, or replace with a meaningful sync-related metric (e.g., "M3: Auto-sync activation rate — percentage of projects with detected remote that activate sync successfully on first startup"). Renumber M4–M8 → M3–M7, or leave gap and note "M3: WITHDRAWN with trust gate."

---

### [H3] Status line contradicts §10 body — says D27/D28 are pending, but both are LOCKED HIGH

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** Line 1 (Status field) vs. §10 Decision Log + "Decision uncertainty flags" section
**Issue:** The spec's Status line reads: `"Drafting (clone-path decisions LOCKED from approved precursor; sync-path decisions LOCKED with two MEDIUM-confidence items pending OSS research)"`. But the body of §10 shows D27 upgraded to **LOCKED HIGH** (with `evidence/codemirror-merge-controls-fitness.md`) and D28 upgraded to **LOCKED HIGH** (with `evidence/credential-helper-token-refresh.md`). The "Decision uncertainty flags" section explicitly says "ALL RESOLVED." The Status line was never updated after the D27/D28 resolution session.
**Current text:** "sync-path decisions LOCKED with two MEDIUM-confidence items pending OSS research"
**Evidence:** §10 D27: "**LOCKED**" with source-level evidence. §10 D28: "**LOCKED**" with source-level evidence. §10 "Decision uncertainty flags — ALL RESOLVED" subsection. Changelog Session 3: "D27 → LOCKED HIGH", "D28 → LOCKED HIGH."
**Status:** INCOHERENT
**Suggested resolution:** Update Status to: `"Drafting (all 29 active decisions LOCKED HIGH; D9 + D24 WITHDRAWN)"` or simply `"Approved"` if this audit's resolution completes the gate.

---

## Medium Severity

### [M1] Evidence files for D27 and D28 referenced but missing from spec evidence directory

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §10 D27 references `evidence/codemirror-merge-controls-fitness.md`; §10 D28 references `evidence/credential-helper-token-refresh.md`
**Issue:** Neither file exists in `specs/2026-04-14-github-sync/evidence/`. The spec's evidence directory contains only 3 files: `editor-integration-surfaces.md`, `shadow-pipeline-reusability.md`, `upstream-sync-flow.md`. The referenced files exist at `reports/git-lifecycle-push-pull-merge-patterns/evidence/codemirror-merge-controls-fitness.md` and `reports/git-lifecycle-push-pull-merge-patterns/evidence/credential-helper-token-refresh.md` — they're in the research report's evidence directory, not the spec's. An implementer following the spec's evidence pointers would get 404s.
**Current text:** D27: `evidence/codemirror-merge-controls-fitness.md`; D28: `evidence/credential-helper-token-refresh.md`
**Evidence:** `glob **/codemirror-merge-controls-fitness.md` returns only `reports/git-lifecycle-push-pull-merge-patterns/evidence/codemirror-merge-controls-fitness.md`. Spec evidence dir glob returns only 3 files.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) copy the two evidence files into `specs/2026-04-14-github-sync/evidence/` and keep the relative references, or (b) update the spec references to use full repo-relative paths: `reports/git-lifecycle-push-pull-merge-patterns/evidence/codemirror-merge-controls-fitness.md`.

---

### [M2] Operability NFR lists `[trust]` structured log tag — trust is withdrawn

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §6 Non-functional requirements — Operability bullet
**Issue:** The operability line lists `[trust]` as one of the structured log tags: `[clone], [auth], [trust], [head-drift], [sync], [sync-error]`. Since the trust gate was withdrawn (D9), there is no trust surface to log. The changelog (Session 2) explicitly notes "`[trust]` log line removed" under "Removed content (trust machinery)" but the actual spec text still contains it.
**Current text:** "`[clone]`, `[auth]`, `[trust]`, `[head-drift]`, `[sync]`, `[sync-error]` structured logs."
**Evidence:** Changelog Session 2: "§9 Observability: `[trust]` log line removed" — but §6 NFR Operability is a different location that was missed. D9 WITHDRAWN removes the surface.
**Status:** INCOHERENT
**Suggested resolution:** Remove `[trust]` from the operability log tag list. Should read: `[clone]`, `[auth]`, `[head-drift]`, `[sync]`, `[sync-error]`.

---

### [M3] §8 Current state references "Trust-pending" as a new project-level state — trust is withdrawn

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §8 Current state — final paragraph
**Issue:** The last line of §8 says "Trust-pending and conflict-pending are new project-level states orthogonal to these document-level modes." Trust-pending is withdrawn (D9). Only conflict-pending is a new state.
**Current text:** "Trust-pending and conflict-pending are new project-level states orthogonal to these document-level modes."
**Evidence:** D9 WITHDRAWN; FR9/FR10 WITHDRAWN; §13 "Trust gate consideration (rejected)."
**Status:** INCOHERENT
**Suggested resolution:** Rewrite to: "Conflict-pending is a new project-level state orthogonal to these document-level modes."

---

### [M4] Journey numbering has gap: J4 missing (deleted trust journey, not renumbered)

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** §5 User journeys
**Issue:** Journeys are numbered J1, J2, J3, J5, J6, J7, J8, J9, J10. J4 was the "untrusted repo" journey deleted with D9 withdrawal (confirmed in changelog: "J4 (untrusted repo) deleted entirely"). The numbering was not compacted, leaving a gap that could confuse implementers or reviewers looking for J4.
**Current text:** Journey headers jump from J3 to J5.
**Evidence:** Changelog Session 2: "§5 User Journeys: J4 (untrusted repo) deleted entirely."
**Status:** INCOHERENT
**Suggested resolution:** Either (a) renumber J5–J10 to J4–J9 and update all cross-references, or (b) add a one-line placeholder: `### J4 — WITHDRAWN (trust-pending journey removed with D9)` for audit trail consistency (matching the FR9/FR10/D9/D24 preservation pattern used elsewhere).

---

## Low Severity

### [L1] Changelog Session 3 FR count ("45 FRs") is inconsistent with actual count

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** `meta/_changelog.md` — Session 3 "Spec state post-cascade"
**Issue:** Changelog says "45 FRs (41 Must/Should/Could + 2 WITHDRAWN + 2 new: FR21b, FR21c)" which totals 45. But this doesn't account for FR20a, FR21a, and FR28a added in Session 2 (the same changelog). Actual count: FR1–FR41 base (41) + FR20a + FR21a + FR21b + FR21c + FR28a (5 sub-IDs) = 46 total IDs, 44 active (minus 2 WITHDRAWN).
**Current text:** "**45 FRs** (41 Must/Should/Could + 2 WITHDRAWN + 2 new: FR21b, FR21c)"
**Evidence:** Session 2 changelog: "new FR20a (identity resolution chain), FR21a (sync follows HEAD), FR28a (rollback creates parent commit)." Session 3 changelog: "FR21b (new), FR21c (new)." §6 contains all five sub-IDs.
**Status:** INCOHERENT
**Suggested resolution:** Update to: "46 FR IDs (44 active + 2 WITHDRAWN). Base FR1–FR41 + sub-IDs FR20a, FR21a, FR21b, FR21c, FR28a."

---

### [L2] Four P2 tuning questions from changelog never added to §11 Open Questions

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** `meta/_changelog.md` Session 3 vs. §11 Open Questions
**Issue:** Changelog Session 3 says "4 new P2 tuning questions (Q-new-12 jitter %, Q-new-13 backoff thresholds, Q-new-14 state schema details, Q-new-15 idle detection)" but grep for `Q-new-1[2-5]` in SPEC.md returns zero matches. These open questions were mentioned in the changelog as created but never actually written into §11.
**Current text:** (absent from §11)
**Evidence:** Changelog Session 3 line 248: "4 new P2 tuning questions (Q-new-12 jitter %, Q-new-13 backoff thresholds, Q-new-14 state schema details, Q-new-15 idle detection)." §11 has no such entries.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) add the four P2 tuning questions to §11 with Status "Open — P2 deferred to implementation," or (b) remove the changelog reference (less preferred — changelog should be append-only). Since they're P2, adding brief entries is preferred for completeness.

---

### [L3] STOP_IF references resolved Q-M1 instead of the decision (D27) or evidence

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction, minor)
**Location:** §15 Agent Constraints — STOP_IF bullet 7
**Issue:** STOP_IF says "`@codemirror/merge mergeControls` proves unworkable and custom controls are needed beyond a simple wrapper (Q-M1)". Q-M1 is resolved (§11 marks it "RESOLVED 2026-04-15" with source-level evidence). An implementer might wonder why a STOP_IF references a resolved question. Should reference D27 and the verification evidence.
**Current text:** "... (Q-M1)"
**Evidence:** §11 Q-M1: "RESOLVED 2026-04-15: source-level analysis of @codemirror/merge v6.12.1 confirmed..."
**Status:** INCOHERENT
**Suggested resolution:** Update parenthetical to "(D27 — verified viable via source-level analysis; STOP_IF retained as implementation safety net)."

---

## Confirmed Claims (summary)

**T1 (Own Codebase) — 10 claims verified, all CONFIRMED:**
- `scheduleGitCommit()` at `persistence.ts:275-292` ✓ (exact lines: 275-293)
- Commit message `"WIP auto-save ${ISO}"` at `persistence.ts:183` ✓
- Shadow hardcoded identity (`openknowledge` / `noreply@openknowledge.local`) at `shadow-repo.ts:76-77, 180-183, 345-348, 486-489` ✓
- `cc1-broadcast.ts` with `isSystemDoc()` and existing channels (`files`, `backlinks`, `graph`) ✓
- `DiffView.tsx` uses `@codemirror/merge` (`MergeView`, `unifiedMergeView` imports) ✓
- `cli.ts` registers `start`, `init`, `mcp`, `preview`; no clone/sync/push/pull/auth ✓
- `config/schema.ts` has `content`, `server`, `persistence`, `mcp` only; no `github.*` or `sync.*` ✓
- EditorMode = `'wysiwyg' | 'source' | 'diff'` at `EditorPane.tsx:16` ✓
- `createServer()` factory in `standalone.ts`; `destroy()` CC8 ordering matches CLAUDE.md ✓
- `shadow-repo-layout.ts` exports `resolveShadowDir` + `parseWriterId` ✓
- `server-lock.ts` exports `acquireServerLock`, `updateServerLockPort`, `readServerLock`, `releaseServerLock` ✓
- `defaultWriter = {id:'server', name:'openknowledge-server', email:'noreply@openknowledge.local'}` at `persistence.ts:161-165` ✓

**L1 cross-finding coherence (clone-path D1-D19 vs sync-path D20-D31):**
- D22 "main only" wording vs D31 "follows HEAD" — internally consistent. D31 explicitly addresses D22: "D22's 'main only' wording was product intent about scope (no branch-picker UI in v1), not a code-level restriction." No contradiction.
- D26 dual-write vs D25 auto-commit message — consistent: same message, two targets, shadow-first ordering.
- D29 parent identity vs shadow identity — explicitly different by design: parent uses git config (public-facing), shadow keeps hardcoded (internal journal). Documented.

**Shadow-parallel principle consistency:**
- FR21b, FR21c, FR22, FR23, FR27, FR31, FR41 all document shadow-parallel analysis ✓
- §14 Future Work explicitly calls out F10–F13 as shadow gaps surfaced by sync design ✓
- The lens is systematically applied across sync-path FRs ✓

**Architecture diagram accuracy (§9):**
- Boot sequence matches FR ordering (lock → shadow → HEAD-drift → watchers → remote detection → SyncEngine) ✓
- Shutdown sequence matches CC8 + SyncEngine stop inserted between L2 flush and last-known-head write ✓
- Clone flow correctly shows subprocess relay pattern ✓
- Sync flow correctly shows in-process pattern ✓

**Agent Constraints (§15):**
- SCOPE covers all new files from both clone-path and sync-path ✓
- EXCLUDE correctly protects shadow internals, core, observers, pipeline ✓
- STOP_IF conditions are reasonable safety nets ✓
- ASK_FIRST covers dependency, API, config, lock, and shutdown changes ✓

**Non-functional requirements alignment:**
- Performance targets (clone <30s, fetch <2s, DiffView <500ms, dual-write <10ms) are reasonable for the described architecture ✓
- Reliability (no partial state, bounded drift, no auto-force-push) matches D26/NG2 decisions ✓
- Security matches FR18 contract ✓

## Unverifiable Claims

- **D27 source-level `@codemirror/merge` v6.12.1 analysis**: The spec references `evidence/codemirror-merge-controls-fitness.md` for the verification. The file exists at the research report path (`reports/git-lifecycle-push-pull-merge-patterns/evidence/`) but not in the spec's evidence directory. Could not read and verify the content of the analysis (file read returned "does not exist" at the spec-relative path). The claim itself (custom `mergeControls` render function with per-hunk granularity) is architecturally plausible per `@codemirror/merge` API surface.
- **D28 credential-helper token refresh analysis**: Same situation — evidence file exists in research report directory but not in spec evidence directory. The claim (GitHub `gho_` tokens don't expire; non-GitHub forges have short-lived tokens) is consistent with known OAuth behavior but could not be verified from the spec's own evidence.
- **A7 (dual-write overhead <10ms)**: No benchmark data available; listed as pre-merge verification gate (Active status). Reasonable estimate given git plumbing ops.
- **A8 (protected-branch stderr patterns)**: No test data against real GitHub protection. Listed as pre-merge gate (Active).
