# Audit Findings

**Artifact:** `specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md`
**Audit date:** 2026-04-21
**Baseline declared in spec:** commit `420f2b5e` (2026-04-18)
**Codebase HEAD at audit:** worktree-agent-identity-worldmodel (post-round-2 adjudication)
**Total findings:** 10 (2 high, 6 medium, 2 low)

Context: Prior audit passes produced `audit-findings-batch-{a,b,c,d}.md` and `audit-findings-round2.md`, all resolved into D21-D58. This pass focuses on drift between the SPEC's concrete code citations and the current-worktree files, plus coherence between FR-5 and D42.

---

## High Severity

### [H] Finding 1: `persistence.ts:405` destructure citation is stale (~17-line drift)

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §1 "Complication" bullet 6; §7 bullet 1 (indirect, via §1); D31 "Rationale" column
**Issue:** Three separate SPEC sites cite `persistence.ts:405` as the line where `onStoreDocument` destructures only `{document, documentName}` and drops `lastTransactionOrigin` / `lastContext`. The actual destructure is at `persistence.ts:388`. Line 405 sits inside a comment block unrelated to the destructure.
**Current text:**

- §1: "`persistence.ts:405` destructures only `{document, documentName}` — drops `lastTransactionOrigin` and `lastContext`, severing the chain that could carry per-agent identity from Y.Doc transaction to history commit."
- D31: "Grep-verified: `persistence.ts:405` is the only runtime consumer."
  **Evidence:** `grep -n onStoreDocument packages/server/src/persistence.ts` returns:

```
388:    async onStoreDocument({ document, documentName }) {
405:      // baseline. Hocuspocus fires onStoreDocument after any Y.Doc mutation,
```

The substantive claim (only `{document, documentName}` destructured, `lastTransactionOrigin` / `lastContext` dropped) is CORRECT at line 388; only the cited line is stale.
**Status:** STALE
**Suggested resolution:** Rewrite all three citations to `persistence.ts:388` OR drop the line number and keep only the filename + function name (more stale-proof). The underlying motivation for FR-16 is unaffected.

---

### [H] Finding 2: D27 cites `start.ts:434-456` for keepalive close-handler wiring — keepalive handling lives in `boot.ts`, not `start.ts`

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** D27 Implications column
**Issue:** D27 says "Server change at `start.ts:434-456`" but the `/collab/keepalive` WS upgrade handler is in `packages/server/src/boot.ts:212-229`, not in `start.ts`. `packages/cli/src/commands/start.ts:430-460` is occupied by the `SIGINT`/`SIGTERM` shutdown wiring — nothing keepalive-related. `boot.ts` is where `bootServer()` attaches the upgrade listener; `start.ts` is a thin CLI wrapper that delegates to `bootServer()`.
**Current text:** "`evidence/session-lifecycle.md` Q17 | Refines FR-14. One-line client change at `keepalive.ts:137`. Server change at `start.ts:434-456`."
**Evidence:**

- `grep -rn "collab/keepalive" packages/server/src packages/cli/src/commands` → only hits are `packages/server/src/boot.ts:212`, `start.test.ts:597/603/613`.
- `sed -n '430,460p' packages/cli/src/commands/start.ts` → shows the SIGINT/SIGTERM shutdown block, not keepalive code.
- `keepalive.ts:137` claim IS correct: `const url = \`$\{baseUrl}/collab/keepalive?pid=$\{process.pid}\`;`is at line 137. **Status:** STALE (the correct file moved since spec drafting —`bootServer`extraction landed in CLAUDE.md's`bootServer`canonical entry-point section). **Suggested resolution:** Change "Server change at`start.ts:434-456`" to "Server change at `boot.ts`(upgrade handler, currently line 212-229)" or drop the line range and name only`boot.ts\`. The substance of D27 (keepalive → connectionId correlation via URL query param) is unaffected.

---

## Medium Severity

### [M] Finding 3: `parseWriterId` + `WRITER_ID_RE` do not recognize new taxonomy — load-bearing for FR-18 GC preservation but not called out as a prerequisite

**Category:** FACTUAL
**Source:** T1
**Location:** FR-18, D35, D54; missing call-out entirely
**Issue:** `packages/core/src/shadow-repo-layout.ts:51` defines `WRITER_ID_RE = /^(human-[^/]+|agent-[^/]+|upstream|server)$/` and `parseWriterId` (line 281) returns `classification: 'unknown'` for any writer-id not matching that regex. `shadow-branch-gc.ts:68` gates preservation on `parseWriterId(writerId).classification !== 'unknown'`.

Under the new taxonomy introduced by D6/D34/D52:

- `principal-<UUID>` (D34, replaces `human-<principalId>`) → `unknown` → GC deletes
- `file-system` (D6) → `unknown` → GC deletes
- `git-upstream` (D6) → `unknown` → GC deletes
- `openknowledge-service` (D6/D52) → `unknown` → GC deletes

FR-18 says classified writers (`file-system`, `git-upstream`, `openknowledge-service`) are "not GC'd (per D54)." That semantic only holds if `parseWriterId` + `WRITER_ID_RE` are extended to recognize them. D35 round-2 correction explicitly called out this hazard for the first-run sweep (hence the allowlist-based approach), but the same hazard applies to the GC preservation gate in `shadow-branch-gc.ts:68` — and the SPEC doesn't surface that `parseWriterId` extension is a prerequisite of FR-18.
**Current text:** FR-18: "Classified writers (`file-system`, `git-upstream`, `openknowledge-service`) not GC'd (per D54)."
**Evidence:**

```
packages/core/src/shadow-repo-layout.ts:51: WRITER_ID_RE = /^(human-[^/]+|agent-[^/]+|upstream|server)$/
packages/core/src/shadow-repo-layout.ts:281-291: parseWriterId — only recognizes old taxonomy
packages/server/src/shadow-branch-gc.ts:68: if (parseWriterId(writerId).classification !== 'unknown')
```

**Status:** INCOHERENT — FR-18 invariant cannot hold without an explicit prerequisite that the SPEC does not state.
**Suggested resolution:** Add a sentence to FR-18 and D54 noting that `WRITER_ID_RE` + `parseWriterId` classifications must be extended to recognize `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service` (new `classification` variants or a coarse `classified` variant). Alternative: track this as a scope bullet under §16 SCOPE (currently lists `history-branch-gc.ts` but doesn't flag the core-package `shadow-repo-layout.ts` change).

---

### [M] Finding 4: FR-5 enumerates 9 handlers; D42 says 12 — three sync/* POST handlers missing from FR-5 text

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) + L5 (summary coherence)
**Location:** FR-5 vs D42
**Issue:** FR-5's "To thread (per D42)" list contains 9 handlers: `handleSaveVersion`, `handleRollback`, `handleCreatePage`, `handleRename`, `handleRenamePath`, `handleDeletePath`, `handleUploadImage`, `sync/resolve-conflict`, future `handleApplyLinks`. D42 authoritatively lists **12** handlers, adding `handleSyncTrigger`, `handleSyncSetEnabled`, `handleSyncAbortMerge`.

D42's Implications column says "Expands FR-5 beyond the initial SPEC text" — so the expansion is intentional, and D42 is declared the canonical source. But a reader following FR-5 without cross-referencing D42 will implement against the 9-handler list and fail the meta-test on day one.
**Current text:**

- FR-5: "`handleSaveVersion` (…), `handleRollback`, `handleCreatePage`, `handleRename`, `handleRenamePath`, `handleDeletePath`, `handleUploadImage`, `sync/resolve-conflict` handler, future `handleApplyLinks`."
- D42: "…covers **12 mutating handlers**: …, `handleSyncTrigger` (api-extension.ts:4012), `handleSyncSetEnabled` (4040), `handleSyncAbortMerge` (4165), `sync/resolve-conflict`, future `handleApplyLinks`."
  **Evidence:** Count of items in each list. D42 also acknowledges the discrepancy in its own Rationale: "Original D42 missed the three sync/\* POST handlers. Meta-test would fail on day one without this fix."
  **Status:** INCOHERENT
  **Suggested resolution:** Append the three sync handlers to FR-5's enumeration OR replace FR-5's enumeration with a pointer ("see D42 for the full 12-handler list, which supersedes this text"). The simpler fix is to copy D42's enumeration into FR-5, keeping D42 as rationale.

---

### [M] Finding 5: D42 line-number citations off by 1 (api-extension.ts:4012, 4040, 4165); route-registry line off by ~12

**Category:** FACTUAL
**Source:** T1
**Location:** D42
**Issue:** D42's inline line annotations for the three sync handlers and the route-registry anchor are all shifted.
**Current text:** "`handleSyncTrigger` (api-extension.ts:4012), `handleSyncSetEnabled` (4040), `handleSyncAbortMerge` (4165), `sync/resolve-conflict`, future `handleApplyLinks`. GET-only handlers + test-reset + local-op/\* excluded. Meta-test scans route registry (api-extension.ts:4185+)…"
**Evidence:**

```
4013:  async function handleSyncTrigger(...)
4041:  async function handleSyncSetEnabled(...)
4166:  async function handleSyncAbortMerge(...)
4197:    '/api/suggest-links': handleSuggestLinks,   (first route-registry entry)
4216:    '/api/sync/trigger': handleSyncTrigger,
4221:    '/api/sync/abort-merge': handleSyncAbortMerge,
```

All three handler lines are off by 1 (likely a whitespace nudge since audit-batch-c). The "route registry (api-extension.ts:4185+)" citation is off by 12 — actual first entry at 4197. The "api-extension.ts:4215-4220" breadcrumb implicit in D42's prose also shifts to 4216-4221.
**Status:** STALE
**Suggested resolution:** Update the four numbers (4012→4013, 4040→4041, 4165→4166, 4185+ → 4197+). Or drop the inline line annotations entirely — "the three `handleSync*` handlers and the route registry near the bottom of `api-extension.ts`" survives drift.

---

### [M] Finding 6: §7 cites `getSession` at `agent-sessions.ts:179-219` — actual is 188-219

**Category:** FACTUAL
**Source:** T1
**Location:** §7 bullet 3
**Issue:** The `async getSession(…)` method starts at line 188, not 179. Line 179 is inside `sessionKey()`, the helper method before it. The claim "per-`(docName, agentId)` DirectConnection" and "`closeAllForAgent` has no production callers" are both correct substantively.
**Current text:** "`AgentSessionManager.getSession(docName, agentId)` at `agent-sessions.ts:179-219` — per-`(docName, agentId)` DirectConnection, but `closeAllForAgent` has no production callers."
**Evidence:** `agent-sessions.ts:188` opens `async getSession(docName, agentId = 'claude-1', identity?: AgentSessionIdentity,)`. Function body continues through line 219.
**Status:** STALE (small drift)
**Suggested resolution:** Change `179-219` → `188-219` or `~188`. Low-risk cosmetic.

---

### [M] Finding 7: D57 inline line citations in §7 and D57 itself are stale — `TiptapEditor.tsx:236` → actual 257; `test-harness.ts:538` → actual 635

**Category:** FACTUAL
**Source:** T1
**Location:** §7 bullet 5, D57
**Issue:** D57 enumerates 7 code sites for the `Y.Map('activity')` → `Y.Map('agent-flash')` rename. Two of the seven are substantially drifted:

- SPEC: `TiptapEditor.tsx:236` → actual `TiptapEditor.tsx:257` (21-line drift)
- SPEC: `test-harness.ts:538` → actual `test-harness.ts:635` (97-line drift)

The other three `api-extension.ts` line citations (`1089`, `1174`, `1707`) are each off by 1 (actuals `1090`, `1175`, `1708`). `agent-flash-source.ts:67` and `observers.test.ts:338` are correct.

The substantive claim that there are 7 code sites still holds (grep confirms exactly seven `Y.Map('activity')` / `getMap('activity')` occurrences across those files). Only the line anchors are stale.
**Current text:**

- §7: "`Y.Map('activity')` (current code at `api-extension.ts:1089, 1174, 1707` + 4 other sites; will rename to `Y.Map('agent-flash')` per D57)"
- D57: "7 code sites — `api-extension.ts:1089, 1174, 1707`; `TiptapEditor.tsx:236`; `agent-flash-source.ts:67`; `test-harness.ts:538`; `observers.test.ts:338`."
  **Evidence:** `grep -n "Y.Map\('activity'\)\|getMap\('activity'\)"` across packages returns all seven occurrences with the actual line numbers above.
  **Status:** STALE
  **Suggested resolution:** Update all five stale line numbers OR drop line numbers from D57 entirely. Given D57 is an implementation checklist, keeping only filenames + symbol names ("the `getMap('activity')` call site in `TiptapEditor.tsx`") is stale-proof and equally actionable.

---

### [M] Finding 8: FR-20 listed in §6 (Requirements) but omitted from §13 (In scope) roll-up enumeration

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** §13 In scope list
**Issue:** §6 defines FR-20 (Agent-type aggregation render contract). §13 enumerates items 1-15 mapping each to FRs, but the FR-20 aggregation contract is not referenced in any of the 15 items. The closest proximate (item 6 "UX aggregation rules: per-session storage → agent-type render projection") cites only D10 + FR-12 (burst-grouping utility), not FR-20.

Either FR-20 is in scope (and §13 should cite it), or FR-20 is effectively a render-layer contract that §13 intentionally elides. The SPEC is silent on which.
**Current text:** §13 item 6 — "**UX aggregation rules: per-session storage → agent-type render projection.** (D10, FR-12)"
**Evidence:** Text match. §6 defines FR-20; §13's 15 items reference FR-1 through FR-18 but skip FR-20.
**Status:** INCOHERENT
**Suggested resolution:** Append FR-20 to §13 item 6 → "(D10, FR-12, FR-20)". Or add a new item 16 for FR-20 alone. Low-cost fix.

---

## Low Severity

### [L] Finding 9: Decision log numbering has gaps (D19, D40 missing; D56 lands AFTER D57 out of sequence) — deliberate per D58 but unsignposted

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** §10 decision log table
**Issue:** The decision-log table order is D1…D18, D20…D39, D41…D55, D57, D56, D58. FR-19 / D19 / D40 are documented as retired by D58 ("Drops FR-19, D19, D40, Q100 from scope"). D56/D57 are out of sequence in the table because D57 was locked before D56 per the iteration order. Neither is a correctness issue, but a reader scanning the table has no immediate signal that the gaps are deliberate.
**Current text:** (no inline signpost)
**Evidence:** Table row ordering in §10; D58 text.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Either (a) insert placeholder rows "D19 — withdrawn (see D58)", "D40 — withdrawn (see D58)" for discoverability, or (b) add a note above the table: "Row ordering follows iteration; D19 and D40 were withdrawn by D58. D56/D57 are out of numeric order by locking sequence." Very low urgency.

---

### [L] Finding 10: D45 "silently skipped with non-fatal warning" is precise only inside the try/catch branch — a null `projectDir` skips silently with no warning at all

**Category:** FACTUAL
**Source:** T1
**Location:** D45 Rationale / §8.8 framing
**Issue:** D45 says "Parent-git commit + `ok/v<N>` tag is best-effort: attempted when `projectDir` points to a git repo; silently skipped with non-fatal warning otherwise."

Reading `api-extension.ts:1877-1897`:

```
if (projectDir) {
  try {
    versionTag = await withParentLock(async () => { ... });
  } catch (e) {
    console.warn('[checkpoint] parent-git commit failed (non-fatal):', e);
  }
}
```

If `projectDir` is null/undefined (no parent git at all), the entire block is skipped — no warning emitted, response returns `versionTag: undefined`. The warning only fires when `projectDir` IS set but the internal git ops throw (e.g., dirty working tree, detached HEAD). The SPEC language implies a warning in both cases.
**Current text:** D45: "silently skipped with non-fatal warning otherwise."
**Evidence:** Code at api-extension.ts:1877-1897 shows the conditional structure.
**Status:** INCOHERENT (minor — the framing slightly misrepresents the code path)
**Suggested resolution:** Rephrase to "silently skipped (no warning when `projectDir` is unset; non-fatal warning logged when `projectDir` is set but git ops throw)." Or simply "silently skipped; failures mid-flow produce a non-fatal warning." The substance of D45 (graceful no-op) is correct.

---

## Confirmed Claims (summary)

Spot-checked against the worktree; no drift detected:

- `AGENT_WRITE_ORIGIN` at `agent-sessions.ts:57-61` ✓ exact match (lines 57-61)
- `server-observers.ts:124-128` structural `isPairedWriteOrigin` check (`context.paired === true`) ✓ exact match
- `shadow-repo.ts:126-203` `commitWip(shadow, writer, contentRoot, message, branch)` ✓ function at line 126
- `shadow-repo.ts:847-951` `saveVersion` per-writer iteration ✓ function at line 847
- `save-version.ts:45-47` writer = `agent-<connectionId>` ✓ lines 45-47 match
- `mcp/server.ts:290` connectionId = randomUUID ✓ exact match
- `agent-sessions.ts:199` `openDirectConnection(docName)` (no context passed) ✓ D32's premise holds
- `keepalive.ts:137` keepalive URL with `?pid=` param ✓ exact match
- §7 note about D55 rename pending (shadow-repo.ts still on disk) ✓ confirmed by grep: 163 "shadow\*" occurrences, 0 "history\*" new-taxonomy
- D49 bounded Y.Map ring-buffer (50 entries, paired-write eviction) — design-level claim; no code yet
- D56 unified `.open-knowledge/` directory — design-level claim; no code yet
- D42 route-registry anchors handled the full POST set per current `api-extension.ts` route table — the 12-handler list is exhaustive for mutating POSTs in the current code (sync/resolve-conflict confirmed at `4220`)
- §1 substantive claim that `persistence.ts` `onStoreDocument` drops `lastTransactionOrigin` / `lastContext` ✓ (at line 388, not 405)
- Evidence files (`um-mechanics.md`, `session-lifecycle.md`, `history-and-sweep.md`, `yjs-attribution-verification.md`) exist and align with the decisions they're cited against in the §10 Evidence column (no spot-check mismatches surfaced)

## Unverifiable Claims

- **UndoManager.js:181 / UndoManager.js:269-271 / Hocuspocus.ts:551, 580, 593-610 / MessageReceiver.ts:188-220.** These reference node\_modules source (yjs, hocuspocus, y-protocols) that varies by pinned version. Not re-checked in this pass — the audit-batch-a and audit-round-2 passes already verified these against the pinned versions and locked them into the Evidence column. If a Y.js or Hocuspocus version bump lands, these anchors need re-verification, but that's a future hazard, not a current drift.
- **`clientInfo.name` self-reported is spoofable** (NG2, D15). Not empirically verified; MCP protocol-level claim, consistent with the cited `evidence/yjs-attribution-verification.md`.
- **`ACTIVITY_MOUNT_LIMIT = 3` relationship to Y.js observer CPU cost** — not material to this spec; belongs to precedent #18.

