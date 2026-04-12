# Audit Findings

**Artifact:** specs/2026-04-11-server-bridge-hardening-now/SPEC.md
**Audit date:** 2026-04-11
**Baseline commit verified against:** 2d35736
**Total findings:** 6 (1 high, 4 medium, 1 low)

---

## High Severity

### [H1] U.R1 claim "callers already await the result or don't care" is factually wrong — unification changes error-path behavior at 6 call sites

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 U.R1; §1 resolution bullet 2; §8 "Dual-copy" section; §9 failure modes table
**Issue:** The spec claims the function signature change from `void` to `Promise<void>` is safe because "callers already `await` the result or don't care." Neither half is true. There are 6 call sites in `standalone.ts` — **none** use `await`, and **5 of 6** are wrapped in try/catch blocks that depend on synchronous throw propagation for error handling and conditional execution of follow-up operations.

**Current text:** "the function signature changes from `void` return to `Promise<void>` — callers already `await` the result or don't care" (§6 U.R1)

**Evidence:** Grep for `applyToDoc` in `standalone.ts` shows 6 call sites at lines 245, 258, 271, 554, 594, 599 — all synchronous, no `await`. Five of six are inside try/catch blocks:

```
// standalone.ts:244-253 (representative pattern, repeated at 256-267, 269-278)
case 'clean':
  try {
    applyToDoc(docName, result.newContent);   // synchronous today
    setReconciledBase(docName, result.newContent);
    incrementReconcile();
  } catch (e) {
    console.error(`[reconcile] Failed to apply clean content...`, e);
  }
```

After unification, `applyToDoc` becomes the async function returned by `createExternalChangeHandler`. Its inner try/catch (`external-change.ts:35-67`) swallows all errors. The behavioral change:

| Aspect | Before (sync `void`) | After (async `Promise<void>`, no `await` added) |
|---|---|---|
| Error in `applyToDoc` | Caller's `catch` fires | Inner try/catch swallows; caller's `catch` never fires |
| `setReconciledBase` after error | NOT called (skipped by catch) | CALLED (promise returned, execution continues) |
| `incrementReconcile` after error | NOT called | CALLED |
| Reconciliation base state | Stays at previous correct value | Updated to content that failed to apply |

The last row is a potential data integrity issue: the reconciliation base (`setReconciledBase`) would be updated to content that was never successfully applied to the Y.Doc. Future reconciliation would diff against a wrong base.

The spec's U.R2 safety net ("existing integration tests pass unchanged") would NOT catch this because integration tests don't exercise the malformed-input / parse-failure error path for `applyToDoc`.

**Status:** CONTRADICTED
**Suggested resolution:** The unification commit must either: (a) add `await` to all 6 call sites so callers' try/catch catches promise rejections — but this requires removing or restructuring `createExternalChangeHandler`'s inner try/catch since it currently swallows all errors, or (b) keep the inner try/catch but have it re-throw after logging so callers can still handle errors, or (c) create a synchronous wrapper that strips the async nature and preserves current throw semantics. Whichever path is chosen, update U.R1's acceptance criteria to specify the caller-side changes, and add a test case (or note in S1.R2) that verifies the error-path behavior is preserved post-unification.

---

## Medium Severity

### [M1] D3 implications column uses stale "NG1" label that conflicts with spec's own numbering

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §10 Decision Log, D3 row; §3 Non-goals
**Issue:** D3's implications column says "Promotes NG1 from deferred to In Scope." In the PROJECT.md and the spec's `meta/_changelog.md`, "NG1" referred to the Unification story. But in this spec's own numbering (§3), NG1 is redefined as "Wiring `server.degraded` into CLI user-facing output" — which is explicitly NOT in scope (§3, §13, §15). The same label means two different things within the same document.

**Current text:** "Promotes NG1 from deferred to In Scope; redefines S1 scope" (§10 D3 implications)

**Evidence:** §3 NG1: "Wiring `server.degraded` into CLI user-facing output (banner at `bun start` / `open-knowledge start`). Revisit if: a user report surfaces about silent degradation in production." `meta/_changelog.md:44`: "Unification (was NG1): Promoted to Now."

**Status:** INCOHERENT
**Suggested resolution:** Change D3 implications to "Promotes Unification from deferred to In Scope; redefines S1 scope." Alternatively, add a parenthetical: "Promotes NG1 (PROJECT.md numbering = Unification, not this spec's NG1) from deferred to In Scope."

---

### [M2] Agent constraint "line 138" points to wrong location in current codebase

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §16 Agent Constraints, EXCLUDE bullet 1; evidence/pr39-conflict-surface-analysis.md
**Issue:** Section 16 EXCLUDE says: "`packages/server/src/standalone.ts:138` — Miles's PR #39 addition line. Do not touch even incidentally." In the current codebase at baseline `2d35736`, line 138 is an empty line between `const sessionManager = new AgentSessionManager(hocuspocus);` (line 137) and a comment block (line 139). Miles's actual insertion target — adding `flushGitCommit` to the `createApiExtension({...})` object — maps to lines 143-152 in the current file (specifically after `contentRoot,` at line 152). The "line 138" number comes from Miles's PR diff context header (`@@ -137,6 +137,7 @@`), which was anchored to the pre-PR-38 version of the file.

**Current text:** "`packages/server/src/standalone.ts:138` — Miles's PR #39 addition line. Do not touch even incidentally."

**Evidence:** `standalone.ts:137-153` reads:
```
137  const sessionManager = new AgentSessionManager(hocuspocus);
138
139  // Add API extension — push directly onto the extensions array ...
143  const apiExtension = createApiExtension({
...
151    contentRoot,
152  });  ← Miles's insertion lands inside this object
153  hocuspocus.configuration.extensions.push(apiExtension);
```

The conflict surface conclusion (zero overlap with our edits) remains correct. But the line-level constraint is misleading.

**Status:** STALE
**Suggested resolution:** Change the agent constraint to: "`packages/server/src/standalone.ts` lines 143-153 (the `createApiExtension({...})` call object) — Miles's PR #39 adds a property here. Do not touch even incidentally." This references the region, not a stale line number.

---

### [M3] Q4 is answerable from current code — not a blocking open question

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §11 Open Questions Q4; §14 Risks row 2; §12 Assumptions; evidence/s3-degraded-signal-design.md "head-watcher wrinkle"
**Issue:** Q4 asks "Does `startHeadWatcher` throw on missing `.git` or return cleanly?" and is marked "Yes (S3)" blocking. The answer is in the codebase at `head-watcher.ts:141-144`:

```typescript
const resolvedGitDir = resolveGitDir(projectRoot);
if (!resolvedGitDir) {
    // Standalone mode — no .git to watch
    return { unsubscribe: async () => {}, getLastKnownBranch: () => null };
}
```

`startHeadWatcher` returns a no-op handle when `.git` is absent — it does **not** throw. Consequences:
- The `initAsync` catch block at line 680 never fires in the no-git case
- `degraded` would NOT spuriously include `'head-watcher'` for standalone/no-git setups
- The "attempted vs absent-by-design" design complexity is unnecessary
- Risk row 2 ("S3's head-watcher push spuriously fires on no-git setups") is moot
- The evidence file's assumption ("startHeadWatcher throws gracefully when `.git` is absent") is wrong — it returns, not throws

**Current text:** "Does `startHeadWatcher` throw on missing `.git` or return cleanly? ... Read `packages/server/src/head-watcher.ts` during S3 implementation." (§11 Q4)

**Evidence:** `packages/server/src/head-watcher.ts:136-144` — `startHeadWatcher` calls `resolveGitDir(projectRoot)` and returns a no-op `HeadWatcherHandle` if the result is falsy.

**Status:** CONTRADICTED (the assumption, not the question — the question is answered)
**Suggested resolution:** Close Q4 as resolved: `startHeadWatcher` returns cleanly on missing `.git`. Remove the blocking flag. Update Risk row 2 to "Moot — `startHeadWatcher` handles missing `.git` by returning a no-op handle." Update evidence/s3-degraded-signal-design.md to remove the "wrinkle" section and the implementation-time verification plan for head-watcher. The S3 implementation can simply add `degraded.push('head-watcher')` in the catch block without any guard — the catch only fires on real errors, never on absent-by-design.

---

### [M4] Section 1 undercounts try/catch blocks for S3 degraded pushes

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §1 Resolution bullet 4; §6 S3.R2; §8 "ServerInstance init error handling"
**Issue:** Section 1 says S3 is "Populated in `initAsync()` by push-on-catch in the **three** existing try/catch blocks (shadow repo init, file watcher, HEAD watcher)." But S3.R2 correctly specifies **four** edits: shadow repo init (line 434), shadow repo reinit (line 450), file watcher (line 462), HEAD watcher (line 680). Section 8 correctly identifies four catch blocks (three in lines 428-464 plus the HEAD watcher). Section 1 conflates the two shadow repo catches into one subsystem.

**Current text:** "push-on-catch in the three existing try/catch blocks (shadow repo init, file watcher, HEAD watcher)" (§1)

**Evidence:** `standalone.ts:428-464` has 3 try/catch blocks (shadow repo init, shadow repo integrity/reinit with nested catch, file watcher). `standalone.ts:466-682` adds the HEAD watcher catch. S3.R2 lists 4 edits with correct line numbers for all 4.

**Status:** INCOHERENT
**Suggested resolution:** Change section 1 to "push-on-catch in the **four** existing catch blocks (shadow repo init, shadow repo reinit, file watcher, HEAD watcher)" to match S3.R2.

---

## Low Severity

### [L1] `observers.ts` JSDoc range is one line off (cosmetic)

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 S7.R1; §8 "observers.ts applyUserDelta JSDoc"
**Issue:** Spec says "Edit `observers.ts:170-183`" and "Current (lines 170-183)." The JSDoc block actually starts at line 169 (`/**`) and ends at line 183 (`*/`). The content that the implementer needs to edit starts at line 170 — so the edit range is functionally correct, but the "current state" description omits the opening delimiter.

**Current text:** "Current (lines 170-183)" (§8)

**Evidence:** `observers.ts:169` is `/**`, line 170 is ` * Apply ONLY the user's delta...`, line 183 is ` */`.

**Status:** STALE (minor)
**Suggested resolution:** Change to "lines 169-183" in the current-state description. The S7.R1 edit range of 170-183 is fine as-is since the opening `/**` doesn't need editing.

---

## Confirmed Claims (summary)

### T1 — Own codebase verification

**All critical line references verified against `2d35736`:**
- `standalone.ts`: ServerInstance interface (82-88) ✅, `applyToDoc` inline function (177-205) ✅, `initAsync` catch blocks (434, 450, 462, 680) ✅, factory return (685-687) ✅
- `external-change.ts`: 69-line factory, only called from `hocuspocus-plugin.ts:196` ✅, outer try/catch at line 65 ✅
- `provider-pool.ts`: `onSynced` handler (92-111) ✅, `destroyEntry` (193-198) ✅, setActive error format (line 147) ✅
- `observers.ts`: `applyUserDelta` JSDoc content (170-183) ✅
- `observers.test.ts`: divergence describe header (1236-1260) ✅
- `CLAUDE.md`: Testing section (172-182) ✅

**Structural claims confirmed:**
- `external-change.ts` is zero-test-coverage ✅ (no `external-change.test.ts` exists)
- `standalone.test.ts` does not exist ✅ (Q3 default to new file is correct)
- `DUMMY_WS` is used in all 17 provider-pool test instances ✅ (no `onSynced` coverage)
- Dual-copy drift: `external-change.ts` has try/catch + success log + `Promise<void>` return; `standalone.ts` copy has none ✅
- Behavioral equivalence of happy path between the two copies ✅

**PR references verified via `gh pr list`:**
- PR #38 ("feat: test isolation & parallelism...") — MERGED ✅
- PR #39 ("feat: Timeline with rollbacks") — OPEN ✅
- PR #43 ("Fix per-document observer typing state for multi-client sync") — MERGED ✅, title confirms multi-client sync context matching spec's S7 narrative

**Evidence-synthesis fidelity (L4 spot-check):**
- `evidence/external-change-dual-copy.md` — all grep results, diff table, and implications match current code ✅
- `evidence/pr39-conflict-surface-analysis.md` — PR #39 metadata and diff conclusions match (conflict surface is zero for our edit regions) ✅
- `evidence/provider-pool-setupobservers-path.md` — call site analysis, failure mode trace, and destroyEntry pattern all match ✅
- `evidence/s3-degraded-signal-design.md` — ServerInstance type, initAsync structure, and consumer patterns match ✅ (except head-watcher wrinkle — see M3)

## Unverifiable Claims

- **"~20 deferred items" from PR #38 review loop (§1).** Not verifiable from git history alone; requires reading the review conversation. Non-load-bearing — the spec lists the specific items it acts on.
- **"40% of `/review-cloud` drift" (PROJECT.md:29, referenced in spec context).** Percentage claim about review drift. Not verifiable without access to the specific review sessions.
- **PR #39 diff stability (A7).** The spec assumes Miles won't push new commits. Verified as of audit time (`gh pr view 39` shows OPEN), but inherently temporal — could change.
