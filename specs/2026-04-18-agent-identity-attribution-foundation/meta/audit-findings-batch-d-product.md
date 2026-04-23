---
title: Audit findings — Batch D (product + observability + testing + docs + naming + unified dir)
scope: D43-D56 + FR-5, FR-9, FR-10, FR-12, FR-13
artifact: specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md
audit_date: 2026-04-18
findings: 10 (3 high, 5 medium, 2 low)
stance: flag-and-propose only; no fixes applied
---

# Audit Findings — Batch D

**Artifact:** `specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md`
**Scope:** D43-D56 + FR-5, FR-9, FR-10, FR-12, FR-13.
**Total findings:** 10 (3 high, 5 medium, 2 low)

---

## High Severity

### [H] Finding 1: SPEC §7 references `history-repo.ts` as if D55 rename has already shipped

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) + T1 (own codebase)
**Location:** SPEC §7 "Current state (code-verified, brief)" lines 154, 157; §16 line 546; evidence `history-and-sweep.md` `sources:` front-matter.
**Issue:** §7 is labeled "code-verified, brief" — it is supposed to anchor claims to actual current code. But lines 154 and 157 cite `history-repo.ts:126-203` and `history-repo.ts:847-951`, while the actual file on disk is `packages/server/src/shadow-repo.ts`. D55 (the rename) is in the decision log as a LOCKED TARGET, not a past action. A cold reader trying to verify §7 hits `No such file` and has to guess that the SPEC pre-names it. The evidence file (`history-and-sweep.md`) is internally inconsistent for the same reason — its `sources:` frontmatter claims `shadow-repo.ts` but Q34 locks `commit-tree (shadow-repo.ts:126-203)` while the SPEC D55 paragraph (line 456) lists `shadow-repo.ts` in the "old" column.
**Current text:**
> "`commitWip(history, writer, contentRoot, message, branch)` at `history-repo.ts:126-203` — already takes `WriterIdentity`, but auto-save hardcodes `defaultWriter = {id:'server', ...}`."
**Evidence:** `ls packages/server/src/ | grep -E "(shadow|history)"` returns only `shadow-*.ts` files. The first variable the reader meets in `shadow-repo.ts` is `export interface ShadowHandle` (line 27) and `export function shadowGit(...)` (line 48). §16 "Agent constraints" at line 546 also lists `history-repo.ts` + `history-branch-gc.ts` in the SCOPE file list, the same pre-rename fiction.
**Status:** INCOHERENT (between §7's code-verification framing and the D55 decision log entry).
**Suggested resolution:** Pick one convention and apply it uniformly. Either (a) §7 cites today's names (`shadow-repo.ts`) + adds a footnote "renamed under D55", or (b) §7 cites target names + every reference is explicit that this is post-D55. Prefer (a) — §7's purpose is code-verification; readers should be able to open the file at the cited line and see the claim. §16 SCOPE can list either, but must match §7.

---

### [H] Finding 2: FR-11 effect-diff derivation text contradicts D22 (which supersedes it)

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions); L4 (evidence-synthesis fidelity).
**Location:** SPEC §6 FR-11 (line 123) vs §10 D22 (line 423) vs evidence `um-mechanics.md` Q13.
**Issue:** FR-11 says "effect (inserted ranges + deleted ranges via `transaction.changed` + `stack-item-added` event payload) is captured". D22 explicitly locks "Effect-diff derivation via `YTextEvent.delta` (Yjs-native observer event). NOT via `transaction.changed` (wrong shape)". The evidence at `um-mechanics.md` Q13 calls `transaction.changed` "NOT the right API" (`Map<AbstractType, Set<String|null>>` — keys only, no content). FR-11 is load-bearing for implementers — they will wire to the wrong API following its text.
**Current text (FR-11):**
> "Each agent transaction's effect (inserted ranges + deleted ranges via `transaction.changed` + `stack-item-added` event payload) is captured and persisted to an activity-log side-channel"
**Evidence:** `evidence/um-mechanics.md:24-34` explicitly flags `transaction.changed` as wrong and prescribes `YTextEvent.delta`.
**Status:** CONTRADICTED (FR-11 text predates D22 lock).
**Suggested resolution:** Update FR-11 to read "via `YTextEvent.delta` (Yjs-native observer event, per D22)". Mirror the same update in §8.9 "Transaction-effect capture (y-lite)" (line 293), which also says "Effect-diff is derived from `transaction.changed` + `stack-item-added` event payload".

---

### [H] Finding 3: "Activity" terminology collides across three distinct concepts (D49 vs D25 vs legacy Y.Map('activity'))

**Category:** COHERENCE
**Source:** L1, L2 (confidence-prose misalignment), L6 (stance consistency).
**Location:** SPEC §6 FR-3 (line 115) + D25 (line 426) + D49 (line 450) + §8.9 (line 293) + §16 line 548 `activity-log.ts (NEW)`.
**Issue:** The SPEC uses "activity" for three different things and does not explicitly distinguish them:
  1. **`Y.Map('activity')`** — the existing per-doc attribution-flash side-channel used for write-flash CSS animation. Declared in `AwarenessState`/`ActivityEntry` at `packages/core/src/types/awareness.ts:43`.
  2. **"activity log"** (D49, D55) — a NEW server-side store (file-based / embedded KV) keyed by `(docName, session_id, transact_index)`, NOT a Y.Map. Replicated to clients via CC1 signal + REST re-fetch. 30 d / 500-entry eviction.
  3. **`activityMap` in UM scope (D25)** — the per-session UM's tracked types `[ytext, metaMap, activityMap]`. This is concept #1 (the Y.Map), included in the undo scope so that undoing a write reverts its flash-attribution entry atomically.
  D49's "Name distinction vs D55" note distinguishes *activity log* from *history*, but not from the existing Y.Map. D25's prose says `activityMap` without qualification and a reader could plausibly read it as #2. They are different write paths with different lifetimes (CRDT-replicated vs server-only), different undo semantics (#1 is in UM scope, #2 is not), and different storage (Y.Doc vs KV).
**Current text (D25):** "Per-session UM scope: `new UndoManager([ytext, metaMap, activityMap], ...)`. All Y-types written in an agent transact become one undo step."
**Current text (D49):** "Activity log is a **server-side store** ... matches existing `backlink-index` pattern ... Y.Doc state is NOT bloated with per-transact metadata. ... Name distinction vs D55: 'activity log' = short-term stream; 'history' = durable record."
**Evidence:** `packages/core/src/types/awareness.ts:24-54` defines both `agentFocus` and `ActivityEntry` fields; `packages/server/src/api-extension.ts:1097, 1182, 1715` are the three write call sites. `backlink-index.ts` uses file-based `.open-knowledge/cache/<branch>/backlinks.json` (line 767).
**Status:** INCOHERENT (term "activity" without qualifier, across three concepts).
**Suggested resolution:** Adopt a three-name taxonomy and apply it uniformly:
  - **"activity-flash map"** or retain `Y.Map('activity')` with the literal parenthetical — for the Y.Map on-doc side-channel (concept #1).
  - **"activity log store"** (already used in D49) — for the server-side KV (concept #2). Possibly rename to **"effect-diff log"** to unstick the collision entirely.
  - **UM scope** — explicitly write `[Y.Text('source'), Y.Map('metadata'), Y.Map('activity')]` in D25 and FR-3, not the shorthand `activityMap`, so the reader sees concept #1.
  Add to D49 a sentence: "Distinct from `Y.Map('activity')` which is the CRDT-replicated write-flash side-channel (undo-scoped per D25)." Consider renaming D49's store to `effect-diff.ts` (/ `effect-diff-log.ts`) — it would also resolve the D22 lineage (effect-diff via `YTextEvent.delta`).

---

## Medium Severity

### [M] Finding 4: D55 claims "UI 'History panel' ... three of four existing terms" but the UI surface is literally labeled "Timeline"

**Category:** FACTUAL
**Source:** T1 (own codebase).
**Location:** SPEC §10 D55 (line 456).
**Issue:** D55's rationale says "'shadow' is accidental drift; 'history' maps to API + UI + user model". The `/api/history` endpoint and `get_history` MCP tool exist and verify cleanly. But the UI component is `packages/app/src/components/TimelinePanel.tsx` and the user-visible heading is `<SheetTitle className="text-sm">Timeline</SheetTitle>` at line 371 — not "History panel". There is no `HistoryPanel` component in the repo (grep: no matches). This weakens one of the three pillars D55 cites; the decision's *other* justifications (API name, MCP tool name, no-deferred-debt) still stand independently, but the prose overstates current alignment.
**Current text:** "Aligns with the existing `/api/history` endpoint + UI 'History panel' + user mental model + three of four existing terms."
**Evidence:** `grep -n SheetTitle packages/app/src/components/TimelinePanel.tsx` → `line 371: <SheetTitle className="text-sm">Timeline</SheetTitle>`. `grep HistoryPanel` → no matches.
**Status:** CONTRADICTED (minor, prose-only — decision rationale still holds on independent grounds).
**Suggested resolution:** Edit D55's rationale to reflect reality: "Aligns with the existing `/api/history` endpoint + `get_history` MCP tool + user mental model. (The UI surface is currently named 'Timeline' — consider whether to rename to 'History' as part of D55 or keep Timeline as a view name over the history store.)" Decide whether renaming the UI surface is in D55's scope or is a separate product naming decision for a later spec.

---

### [M] Finding 5: D43 underspecifies the `writeKind` enum extension required to support `agent-undo` and `rollback-apply`

**Category:** COHERENCE
**Source:** L3 (missing conditionality) + T1.
**Location:** D43 (line 444) + `packages/core/src/types/awareness.ts:38`.
**Issue:** D43 says AgentFocus "fires on `agent-undo` origins AND `rollback-apply` origins. Does NOT fire on `managed-rename`." The abstraction supports per-agent focus entries, but the transport-level enum is `writeKind: 'write' | 'edit' | null`. To carry D43's new semantics, `writeKind` must be widened to `'write' | 'edit' | 'undo' | 'rollback-apply' | null`. D43 doesn't mention this — a reader implementing D43 might keep the current enum and lose information at the client end (what triggered the focus — a write or an undo?).
**Current text:** D43 is a one-sentence LOCK: "Agent-undo matches 'Claude corrected itself' UX. Rollback is a user-triggered action. Rename is structural — noise."
**Evidence:** `packages/core/src/types/awareness.ts:32-41`: `writeKind: 'write' | 'edit' | null`.
**Status:** INCOHERENT (decision locked without specifying the type-level extension needed for its consumers).
**Suggested resolution:** Append to D43: "Requires widening `AgentFocusEntry.writeKind` at `packages/core/src/types/awareness.ts` to `'write' | 'edit' | 'undo' | 'rollback-apply' | null` (precedent #9 schema-is-add-only: add-only widening is safe)." Cross-link from §8 / §16 SCOPE.

---

### [M] Finding 6: D49 says backlink-index uses "file-based or embedded KV" but backlink-index is file-based JSON; the parallel needs pinning

**Category:** FACTUAL
**Source:** T1.
**Location:** D49 (line 450).
**Issue:** D49 says activity-log is "a **server-side store** (file-based or embedded KV — matches existing `backlink-index` pattern)". The backlink-index IS file-based JSON at `.open-knowledge/cache/<branch>/backlinks.json` (per `packages/server/src/backlink-index.ts:767`). The "or embedded KV" clause is a hedge — the cited precedent is one specific path, not two. An implementer may pick a sqlite / leveldb / indexed-fs shape and cite D49, producing drift.
**Current text:** "Activity log is a **server-side store** (file-based or embedded KV — matches existing `backlink-index` pattern)."
**Evidence:** `packages/server/src/backlink-index.ts:767`: `return resolve(this.projectDir, '.open-knowledge', 'cache', branch, 'backlinks.json');`.
**Status:** UNVERIFIABLE (the "or embedded KV" half is unanchored — no existing pattern for KV in this repo).
**Suggested resolution:** Either (a) lock to "file-based (matches backlink-index pattern) — `.open-knowledge/cache/<branch>/activity-log/<docName>.json` or similar", or (b) open a focused sub-question asking whether KV is appropriate and defer the choice to implementation with explicit criteria. Prefer (a) under the greenfield+no-deferred-debt directive.

---

### [M] Finding 7: D45 prose is clean on greenfield/no-deferral grounds — minor note on transition healing

**Category:** COHERENCE / PRAGMATISM check
**Source:** L6 (stance consistency) + directive check.
**Location:** D45 (line 446).
**Issue:** The audit directive specifically asks to re-verify D45 does NOT contain any deferral. The corrected D45 (the version in the SPEC) is clean:
  - History checkpoint always lands (regardless of project git state).
  - Parent-git commit is "best-effort, attempted when `projectDir` points to a git repo; silently skipped with non-fatal warning otherwise."
  - Response returns `versionTag: undefined` when skipped.
  - "Transitions (user runs `git init` later) heal forward — next save-version tags normally. No retroactive backfill of past history-only checkpoints. No user-facing 'run git init' prompt."
  - Code-anchored at `api-extension.ts:1871-1897`, which I verified: `try { ... } catch (e) { console.warn('[checkpoint] parent-git commit failed (non-fatal):', e); }` — exactly matches the claim.
  One minor friction: the "heal forward" phrase does not specify what "heal forward" means at the shadow/history-repo level. If a checkpoint was written history-only at time T1, and the user runs `git init` at T2 and calls save-version at T3, does the T3 save-version's parent-git tag `ok/v1` start counting from the pre-`git init` history-only checkpoints, or from T3? The current code (`pg.tags(['--list', 'ok/v*']).length + 1`) starts counting from T3 because no `ok/v*` tags exist pre-`git init`. This may or may not match user expectation.
**Current text (D45):** "Transitions (user runs `git init` later) heal forward — next save-version tags normally. No retroactive backfill of past history-only checkpoints."
**Evidence:** `packages/server/src/api-extension.ts:1881-1883`: counts `ok/v*` tags in project git (which starts empty post-`git init`), derives `n = existing.length + 1`.
**Status:** CONFIRMED (no deferral). Prose slightly underspecifies the tag-numbering semantic across the transition.
**Suggested resolution:** Append one sentence: "Tag numbering (`ok/v<N>`) derives N from the count of existing `ok/v*` tags in the project repo — post-`git init` transitions start from `ok/v1`; history-only checkpoints from the pre-`git init` window are not re-tagged."

---

### [M] Finding 8: D56 migration protocol is mechanically sound — one-and-only minor edge

**Category:** FACTUAL / PRAGMATISM
**Source:** T1.
**Location:** D56 (line 457) + `packages/server/src/shadow-repo.ts:1-11, 60-80`.
**Issue:** The current `shadow-repo.ts` comment header (lines 1-11) documents two modes: integrated (`.git/openknowledge/`) and standalone (`.openknowledge/`). The split is driven by `resolveShadowDir(projectRoot)` in `@inkeep/open-knowledge-core/shadow-repo-layout` (line 21 of shadow-repo.ts, line 69). D56's migration says "if either legacy location exists, atomically move its contents to `<root>/.open-knowledge/history/` via `rename()`". Three small concerns:
  1. `rename()` across filesystems fails with `EXDEV`. On typical single-FS repos this is fine, but `.git/` is sometimes mounted differently (tmpfs, smb, nfs). The migration prose doesn't specify fallback — is `rename()` EXDEV a fatal error that blocks startup, or does it fall back to `copy+unlink`?
  2. When both legacy dirs exist simultaneously (rare but possible after manual surgery), which wins? Prose says "either legacy location exists" — not which.
  3. The unified `<root>/.open-knowledge/history/` path embeds the history dir *inside* the config dir. If the user gitignores `.open-knowledge/principal.json` (D51) but not the parent dir, the `.open-knowledge/history/` git objects are preserved as desired — but if they gitignore the whole `.open-knowledge/`, that also hides `config.yml` from the project repo. D51 says "ok init adds `.open-knowledge/principal.json` to .gitignore" — so only the principal is gitignored by default. D56 says "Auto-added to project `.gitignore` on first run (single entry `.open-knowledge/`)." The two statements conflict on gitignore granularity: D51 gitignores the one file, D56 gitignores the entire dir.
**Current text (D51):** "`ok init` adds `.open-knowledge/principal.json` to `.gitignore`."
**Current text (D56):** "Auto-added to project `.gitignore` on first run (single entry `.open-knowledge/`)."
**Evidence:** `packages/server/src/shadow-repo.ts:9-10` — integrated mode adds to `.gitignore` but standalone adds `.openknowledge/` (no hyphen). Today's gitignore entry depends on mode.
**Status:** INCOHERENT (D51 vs D56 on gitignore scope).
**Suggested resolution:** Reconcile D51 + D56. Pick one:
  - **Option A (simpler):** D56 adds `.open-knowledge/` to gitignore. D51 is redundant — drop D51 or restate as "subsumed by D56". Downside: `config.yml` is also gitignored; users lose shared-project config semantics unless they carve out exceptions (`!/.open-knowledge/config.yml`).
  - **Option B (surgical):** D56 adds `.open-knowledge/history/` + `.open-knowledge/*.lock` to gitignore (the machine-specific parts). D51 separately adds `.open-knowledge/principal.json`. `config.yml` stays commit-able.
  Also append to D56: "Migration uses `rename()` first; on `EXDEV` or other atomic-move failure, falls back to `copyFileSync`/`rmSync` loop and logs `[history-migration] non-atomic fallback on <reason>`. If both legacy locations exist, integrated (`.git/openknowledge/`) wins; standalone is archived to `.open-knowledge/_archive-standalone-<timestamp>/` and logged."

---

## Low Severity

### [L] Finding 9: D47 names `bridge-matrix.test.ts` for integration but fuzzer surface update is under D18 coverage-gate — SPEC §9 doesn't echo this back in the D47 entry

**Category:** L5 (summary coherence).
**Location:** D47 (line 448).
**Issue:** D47 says "unit per new module, integration in `bridge-matrix.test.ts` + new `session-cleanup.test.ts` + `persistence-fan-out.test.ts`, fuzzer extension (FR-17 adds `agent-undo` op + `AGENT_UNDO_ORIGIN` surface to `WRITE_SURFACE_TO_OP_KIND`)." This is correct but dense. A reader skimming D47 alone might not realize `WRITE_SURFACE_TO_OP_KIND` is a real `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` const referenced in CLAUDE.md §STOP V0-14 rule item 3. Minor discoverability, not a correctness issue.
**Current text:** "fuzzer extension (FR-17 adds `agent-undo` op + `AGENT_UNDO_ORIGIN` surface to `WRITE_SURFACE_TO_OP_KIND`)"
**Evidence:** CLAUDE.md §"STOP (V0-14 agent-undo, future spec)" item 3 explicitly says: "Extend the FR-17 fuzzer op set (`packages/app/tests/stress/bridge-convergence.fuzz.test.ts`) with an `agent-undo` op kind."
**Status:** LOW — readable as-is.
**Suggested resolution:** Optional: inline-link the file path in D47 for grep anchors: "fuzzer extension (FR-17: extend `ALL_OP_KINDS` + `WRITE_SURFACE_TO_OP_KIND` in `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`)".

---

### [L] Finding 10: D48 documentation plan enumerates 2 precedent entries; verify no collision with existing AGENTS.md precedents

**Category:** L5 (summary coherence) + T1.
**Location:** D48 (line 449).
**Issue:** D48 proposes two new AGENTS.md precedent entries: "Per-session actor identity at origin" and "Classified writer IDs + subject-prefix action encoding". The existing precedent list in CLAUDE.md (precedents 1-21) includes "Typed transaction origins" (precedent #1) — D48's first entry is an extension of precedent #1, not a replacement. The SPEC doesn't clarify: is this a NEW precedent #22, or an amendment to precedent #1? If NEW, the entry must cross-reference #1 so future readers don't think they conflict. D55 (line 456) also says "Add AGENTS.md precedent entry: 'History = durable git-backed edit record; Activity log = short-term per-transact stream.'" — that is a 3rd new entry, not mentioned in D48.
**Current text (D48):** "add 2 AGENTS.md precedent entries — 'Per-session actor identity at origin' and 'Classified writer IDs + subject-prefix action encoding'"
**Current text (D55):** "Add AGENTS.md precedent entry: 'History = durable git-backed edit record; Activity log = short-term per-transact stream.'"
**Evidence:** CLAUDE.md §"Architectural precedents" entry #1: "Typed transaction origins."
**Status:** LOW (count mismatch — 2 in D48, 3 total including D55's).
**Suggested resolution:** Update D48 to say "three new precedents": (1) per-session actor identity at origin [extension of precedent #1 — cross-reference], (2) classified writer IDs + subject-prefix action encoding, (3) history/activity-log semantic layer naming (from D55). Confirm the layering with precedent #1 in the new entry body.

---

## Confirmed Claims (summary)

- **D45 non-fatal wrap**: `api-extension.ts:1877-1897` matches the claim (`try { withParentLock(...) } catch (e) { console.warn('[checkpoint] parent-git commit failed (non-fatal):', e); }`); `versionTag` response-shape matches `json(res, 200, { ok: true, checkpointRef, ...(versionTag ? { versionTag } : {}) })`.
- **D43 AgentFocus surface**: `agent-focus.ts` `setFocus`/`clearFocus` supports extension cleanly; only new HTTP handler call-points needed (see Finding 5 for companion enum widening).
- **D49 CC1 pattern**: `standalone.ts:175` union extension; `cc1-broadcast.ts:21` accepts any channel string. Backlink-index precedent = file JSON at `backlink-index.ts:767` (see Finding 6).
- **D55 `/api/history` + `get_history`**: confirmed at `api-extension.ts:1910, 4207` and `cli/src/mcp/tools/get-history.ts:44, 90`.
- **D56 current layout**: `shadow-repo.ts:8-10, 63-64` documents integrated vs standalone split; D56 unification is sound modulo EXDEV (Finding 8).
- **D42 FR-5 handlers**: all cited line numbers verified (handleSaveVersion 1811, handleRollback 2127, handleCreatePage 2532, handleRename 2654, handleRenamePath 2723, handleDeletePath 2830, handleUploadImage 2965, handleSuggestLinks 2928 GET-only per line 2929).
- **D52**: no existing `openknowledge-service` caller — reserved for future, as claimed.
- **D53**: all 7 FR-13 prefixes have D53 target-format rows.
- **D54**: 30d extends existing 24h grace in `shadow-branch-gc.ts` — additive.
- **D46**: matches CLAUDE.md §"Logging conventions" (line 762).
- **D50**: consistent with §1 Resolution + P7 persona + P6 journey.
- **D44**: consistent with D28 30s grace.

## Unverifiable Claims

- **D49 "500 entries per session"**: no repo precedent for per-session capacity bounds — reasonable default, not load-measured.
- **D54 "30 days"**: product judgment without telemetry; review criteria unstated.
- **D56 migration atomicity**: `rename()` can fail cross-volume; per-environment (Finding 8).

---

*Cold-read against SPEC @ `420f2b5e` + worktree HEAD. No fixes applied.*
