---
name: Audit findings — Vite plugin createServer dedup spec
description: Independent verification pass over SPEC.md + evidence/. Reads cold, checks coherence and factual accuracy against the codebase at baseline commit 6fa2c104 (spec commit 5ee694c2 on top).
audit_date: 2026-04-23
artifact: specs/2026-04-23-vite-plugin-createserver-dedup/SPEC.md
auditor: /audit (nested Claude via /spec Step 6)
---

# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/spec-vite-plugin-createServer-dedup/specs/2026-04-23-vite-plugin-createserver-dedup/SPEC.md`
**Audit date:** 2026-04-23
**Total findings:** 10 (0 high, 3 medium, 7 low)

**Baseline:** SPEC's stated baseline commit `6fa2c104` exists in `git log`; scaffolding commit `5ee694c2 "spec: Vite plugin — call createServer() directly (Approach A)"` is HEAD. Grep-verified claims checked against HEAD.

---

## High Severity

*None. The spec's central factual claims (9 missing subsystems, 6 missing HTTP-layer primitives, the M6 baton-pass, the LOC counts, every cited file:line in standalone.ts / boot.ts / plugin.ts / sync-engine.ts / process-lock.ts) all verify cleanly against the codebase. No contradictions to any shipped invariant. No decision hangs on a refuted claim.*

---

## Medium Severity

### [M] Finding 1: Stale line reference — SPEC repeatedly cites `CLAUDE.md:236`, but the claim has moved to `AGENTS.md:264`

**Category:** COHERENCE
**Source:** L1 (cross-finding consistency within the same session's artifacts)
**Location:** SPEC.md §1 Complication (line 30), §2 G6 (line 43), §6 FR16 (line 102), §8 Known gaps (line 147). Also referenced in §10 D3 rationale (line 199).
**Issue:** The SPEC claims *"CLAUDE.md:236 claims the plugin 'calls `createServer()` directly'"* in multiple places. `CLAUDE.md` is a symlink to `AGENTS.md` (verified: `lrwxr-xr-x CLAUDE.md -> AGENTS.md`). The stale Vite-plugin sentence sat near `AGENTS.md:236` **before** the scaffolding commit (per the `_changelog.md` 2026-04-23 entry: "corrigendum breadcrumbs at both occurrences"). The breadcrumb, once added, shifted the sentence to `AGENTS.md:264` (confirmed via `grep -n "Vite dev plugin" AGENTS.md`). The SPEC was drafted with pre-breadcrumb line numbers and not re-synced.
**Current text:** "CLAUDE.md:236 claims the plugin 'calls `createServer()` directly' — a statement that was aspirational at the time of writing …" (line 30)
**Evidence:** Line 236 of AGENTS.md is now a row of the Writer-ID taxonomy table, not the Vite-plugin claim. The actual sentence + its breadcrumb are at AGENTS.md:264 and AGENTS.md:1384 (two occurrences, both correctly breadcrumbed). Verified by `sed -n '234,240p' AGENTS.md` (shows Writer ID table) and `grep -n "Vite dev plugin"` (264, 1384).
**Status:** INCOHERENT
**Suggested resolution:** Replace "CLAUDE.md:236" with "AGENTS.md:264 (and :1384 — same sentence duplicated in the doc's two bootServer sections)" at every occurrence, OR drop the line number entirely and say "the `Vite dev plugin … Calls `createServer()` directly` sentence in AGENTS.md's bootServer section." D7's target prose is unaffected — only the discoverability pointer is wrong.

---

### [M] Finding 2: FR1 grep gate is weaker than FR1's own body text

**Category:** COHERENCE
**Source:** L1 (cross-finding within a single requirement)
**Location:** SPEC.md §6 FR1 (line 87, table row "Must | FR1 | …").
**Issue:** FR1's body enumerates **eleven** symbols that must not be imported into the plugin (`createPersistenceExtension`, `createApiExtension`, `createServerObserverExtension`, `AgentSessionManager`, `AgentFocusBroadcaster`, `AgentPresenceBroadcaster`, `CC1Broadcaster`, `BacklinkIndex`, `createContentFilter`, `startWatcher`, `createLiveDerivedIndexExtension`). The grep gate, given as the mechanical acceptance criterion, only probes **three** of these patterns: `rg "new Hocuspocus\|createApiExtension\|AgentSessionManager\(" packages/app/src/server/hocuspocus-plugin.ts`. A regression in which, say, `AgentFocusBroadcaster` or `createPersistenceExtension` is retained would pass the gate.
**Current text:** "Grep gate: `rg \"new Hocuspocus\|createApiExtension\|AgentSessionManager\(\" packages/app/src/server/hocuspocus-plugin.ts` returns zero matches."
**Evidence:** Current plugin imports (grep-verified): `createApiExtension` (line 19), `createLiveDerivedIndexExtension` (22), `createPersistenceExtension` (23), `createServerObserverExtension` (24), `new AgentSessionManager` (219), `new CC1Broadcaster` (220), `new AgentFocusBroadcaster` (226), `new AgentPresenceBroadcaster` (227), `new BacklinkIndex` (195), `createLiveDerivedIndexExtension` (228), `new Hocuspocus` (212). All eleven are present today; any that survive the refactor would fail FR1's intent but might pass the narrow gate.
**Status:** INCOHERENT
**Suggested resolution:** Broaden the grep pattern to the full list, e.g.:

```bash
rg "new Hocuspocus\b|createApiExtension\b|createServerObserverExtension\b|createPersistenceExtension\b|createLiveDerivedIndexExtension\b|createContentFilter\b|AgentSessionManager\b|AgentFocusBroadcaster\b|AgentPresenceBroadcaster\b|CC1Broadcaster\b|BacklinkIndex\b|\bstartWatcher\(" packages/app/src/server/hocuspocus-plugin.ts
```

Or replace the grep with a knip-clean / dep-cruiser check that enforces "no direct import of the extension/broadcaster primitives from `@inkeep/open-knowledge-server` in this file" — the existing knip gate mentioned in the FR1 note can be extended to cover this.

---

### [M] Finding 3: D2's "no surprising side effects" guarantee has a test-isolated-mode gap that the SPEC acknowledges only obliquely

**Category:** COHERENCE
**Source:** L3 (missing conditionality) cross-referenced with L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §3 NG5 (line 52), §10 D2 (line 198), evidence/sync-engine-opt-in-default.md.
**Issue:** NG5/D2 asserts SyncEngine wiring is benign because `sync-engine.ts:262`'s early-return covers the opt-out case with *"two benign git subprocess calls at startup"*. The evidence file's §"Test harness note" acknowledges a subtlety: SyncEngine's `start()` always runs `git remote -v` + `git rev-parse` against `projectDir` regardless of `gitEnabled`, and only catches the error if `createGitInstance` / `git.raw` throws. For the Vite plugin's test-isolated branch (D8 skips `ensureProjectGit`), the Playwright fixture's tmpdir has no `.git/` (seed helper at `fixtures.ts:170-174` only writes `.md` files). SyncEngine will throw inside the try/catch at `sync-engine.ts:243` and log `[sync] remote detection failed` on every Playwright worker. Current dev mode (pre-refactor) is silent here because SyncEngine isn't wired. Post-refactor, Playwright log output gains a worker × N "remote detection failed" noise line per boot — not a correctness gap, but a new log signal the spec doesn't budget for.
**Current text:** NG5 (line 52): "SyncEngine is already opt-in by default (`syncEnabled !== true` early-return at `sync-engine.ts:262`) — 'wire it through' means two benign `git` subprocess calls at dev startup when the developer has not opted in"
**Evidence:** `sync-engine.ts:238-256` — the `createGitInstance` + `handle.git.raw('remote', '-v')` call is wrapped in `try/catch`. When the projectDir has no `.git/`, the git subprocess errors out before the opt-in check at line 262 runs, and the warning line `[sync] remote detection failed` logs via `log.warn`. Playwright runs 4 workers (`fixtures.ts:205-211`), each spawning `bun run dev`, so 4 warn-log lines per Playwright run.
**Status:** INCOHERENT — the metric-1 "log-line parity with `ok start`" goal in §7 Observability is achieved, but §3 NG5's framing "two benign git subprocess calls" under-specifies what happens in the test-isolated branch where `.git/` is absent by design.
**Suggested resolution:** Tighten NG5 wording (or add a note under §6 Non-functional / Operability) to distinguish: (a) developer's real repo (has `.git/`) → two benign local git calls + info log; (b) Playwright worker tmpdir (no `.git/`) → one `[sync] remote detection failed` warn log per boot. Either accept this as Operability noise or add a spec-time option to skip the SyncEngine block when `gitEnabled: false` (the evidence file mentions this exact fix as "a separate small change to `standalone.ts` (gate the SyncEngine block). Not needed for this spec — current behavior is fine."). If kept as-is, update FR6's acceptance criterion to note that the log line in test-isolated mode is `[sync] remote detection failed`, not `[sync] sync not enabled — staying inactive`.

---

## Low Severity

### [L] Finding 4: evidence/lifecycle-module-load-vs-configureServer.md overstates absence of `.git/` in "test tmpdirs"

**Category:** FACTUAL
**Source:** T1 (own codebase verification)
**Location:** `evidence/lifecycle-module-load-vs-configureServer.md` §"ensureProjectGit ordering" (line 90), §"Implementation sketch" comment (line 107).
**Issue:** The evidence file asserts *"test tmpdirs don't have `.git/`"* as an absolute rationale for the D8 `isTestIsolated` branch. This is true for Playwright fixtures (`seedRequiredFixtureFiles` at `fixtures.ts:170-174` only seeds `.md` files) but NOT for Tier 1 integration tests — `test-harness.ts:119` explicitly `await ensureProjectGit(contentDir)` before `createServer()`. Both codepaths exist today.
**Current text:** "For `isTestIsolated` mode, step 3 is skipped — test tmpdirs don't have `.git/` and tests don't need shadow." (line 92-93)
**Evidence:** `packages/app/tests/integration/test-harness.ts:119` — `await ensureProjectGit(contentDir);`. Only Playwright's per-worker tmpdirs lack `.git/`.
**Status:** CONTRADICTED (overgeneralization — true for the Playwright path only)
**Suggested resolution:** Clarify the evidence file: "Playwright worker tmpdirs don't have `.git/` (fixtures only seed `.md` files); Tier 1 integration tests explicitly init it via `ensureProjectGit`. The Vite plugin's `isTestIsolated` branch is only driven by Playwright, so the skip is correct for that caller." Not load-bearing — D8's actual branching logic (`isTestIsolated = Boolean(process.env.OK_TEST_CONTENT_DIR)`) is correct; only the rationale string is loose.

---

### [L] Finding 5: evidence/m6-baton-pass.md quote adds bold not present in the M6 source

**Category:** FACTUAL (evidence fidelity)
**Source:** T1 / L4 (evidence-synthesis fidelity)
**Location:** `evidence/m6-baton-pass.md` §"Scope carve-out in the sharpened M6 spec" (line 17).
**Issue:** The evidence file quotes the M6 §1 "Scope clarification" paragraph with `**…**` bold wrapping the entire second sentence (*"The runtime server model — the existing set of collab-server entry points …"*). In the actual `origin/docs/m6-spec-sharpen:specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`, only the opening phrase *"Scope clarification — what M6 does not touch."* is bolded; the rest runs in plain prose.
**Current text:** (evidence) "**The runtime server model — the existing set of collab-server entry points and Hocuspocus composition paths in `packages/cli/src/commands/`, `packages/server/src/boot.ts`, `packages/server/src/standalone.ts`, and `packages/app/src/server/hocuspocus-plugin.ts` — is out of scope and untouched. Reviewers should not expect entry-point consolidation or composition-path unification from this spec.**"
**Evidence:** `git show origin/docs/m6-spec-sharpen:specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` — the second sentence is NOT bold in the upstream text.
**Status:** INCOHERENT (quotation fidelity)
**Suggested resolution:** Remove the trailing `**` from the evidence quote so it matches M6 verbatim. Non-blocking — the semantic content is identical and the baton-pass reading is correct.

---

### [L] Finding 6: D5 and Future Work Explored cite slightly different line ranges in boot.ts for the "copy target" region

**Category:** COHERENCE
**Source:** L1 (internal consistency)
**Location:** SPEC.md §10 D5 (line 201: "copied from `boot.ts:244-396`") vs §15 Explored (line 264: "Extract the `httpServer.on('upgrade', ...)` block from `boot.ts:255-396` into a new `packages/server/src/collab-http-attach.ts`").
**Issue:** Two slightly different line ranges appear in the same document for the same underlying code region. `grep -n` shows: `KEEPALIVE_GRACE_MS` at boot.ts:245 (just before the upgrade handler's supporting state); `httpServer.on('upgrade', ...)` begins at boot.ts:255. Both references are plausibly correct depending on whether one counts the grace-timer constants + map declarations (244-254) as part of the copy target. Inconsistency is stylistic, not substantive.
**Current text:** D5: "copied from `boot.ts:244-396`"; Future Work: "from `boot.ts:255-396`"
**Evidence:** `grep -n "httpServer.on('upgrade'\|KEEPALIVE_GRACE_MS" packages/server/src/boot.ts` → 255, 245.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Pick one range convention. D5's "244-396" is the broader region (includes grace-timer state); Future Work's "255-396" is the pure upgrade handler. Align to whichever the implementer will actually copy, and note the distinction once.

---

### [L] Finding 7: §8 and §13 and §16 carry "Placeholder" labels that are now stale

**Category:** COHERENCE
**Source:** L5 (summary coherence) / L6 (stance consistency)
**Location:** SPEC.md §8 Current state (line 131 "*To be populated in scaffold phase*"), §13 In Scope (line 232 "*Detailed scope populated during iterate / verify-and-finalize phases. High-level placeholder:*"), §16 Agent constraints (line 278 "*Derived during Verify-and-Finalize phase. Placeholder.*").
**Issue:** Per `_changelog.md`, scaffold is complete and iterate has resolved all P0 decisions. The "Placeholder" labels on sections that now contain substantive content (§13 with bullet requirements pointing to §6; §16 with concrete SCOPE/EXCLUDE/STOP_IF/ASK_FIRST entries) signal a template residue not a real gap. §8's "Summary of current behavior (high-level)" section is actually populated with the key facts; only the leading placeholder italic lingers.
**Current text:** §16 line 278: "*Derived during Verify-and-Finalize phase. Placeholder.*"
**Evidence:** Section bodies are filled in (§13 with 7 bullets, §16 with 4 explicit SCOPE/EXCLUDE/STOP_IF entries + 2 ASK_FIRST). Changelog shows scaffold + iterate completed 2026-04-23.
**Status:** INCOHERENT
**Suggested resolution:** Drop the "placeholder" labels at §8/§13/§16 — or, if the sections will still grow in verify-and-finalize, mark them explicitly as "draft — will be tightened in verify-and-finalize" rather than "placeholder." The content is there; the framing undersells it.

---

### [L] Finding 8: §7 Metric 2 "zero 'wire in dev' follow-up PRs post-refactor" is not directly measurable

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** SPEC.md §7 (line 119 "Metric 2: 'Wire in dev' follow-up PRs after merging server-side features"). Target: "zero post-refactor. If one appears, the refactor has regressed."
**Issue:** The metric's signal depends on observer judgment ("if we see such a PR, retrospect on why `createServer()` didn't handle it") rather than a mechanical trigger. The baseline citations (#272, #280, and the PR #246 multi-agent-presence follow-up via commit `fc80318a`) all verify — but the forward-looking check is ad-hoc. Combined with Finding 2's weak grep gate, this makes dev-prod parity a judgment call rather than a CI-level invariant.
**Evidence:** `git log --grep="presence"` confirms `fc80318a "[US-008] multi-agent presence E2E + wire AgentPresenceBroadcaster in dev"`; PRs #272 and #280 verified via `git log --grep="#272\|#280"`. All three represent the "wire in dev" pattern the spec cites.
**Status:** UNVERIFIABLE (forward-looking metric without a hard gate)
**Suggested resolution:** Either (a) accept this as a directional metric (observational) and explicitly tag it as such in §7, or (b) strengthen Finding 2's grep gate to a knip-clean rule that fires at CI time, making Metric 2 structurally enforced rather than observational. Option (b) is the more robust path since the whole spec's premise is "structural grep in CI or knip-style check" (SPEC.md §7 Metric 1).

---

### [L] Finding 9: §8 claims "9 subsystems + 6 HTTP-layer primitives missing" but the SPEC §1 phrasing says "nine server-side subsystems … plus six HTTP-layer primitives"

**Category:** COHERENCE
**Source:** L1 (internal consistency — trivial)
**Location:** SPEC.md §1 Complication (line 25 "missing nine server-side subsystems (…) and six HTTP-layer primitives (…)"), §8 Known gaps/bugs (line 147 "9 subsystems + 6 HTTP-layer primitives missing").
**Issue:** §8's shorthand says "9 subsystems"; §1's full list is "nine server-side subsystems". Both resolve to the same symbol enumeration and both are grep-verified against standalone.ts and boot.ts. Purely stylistic — word-form vs digit-form — and the counts match.
**Current text:** (§1) "nine server-side subsystems"; (§8) "9 subsystems + 6 HTTP-layer primitives missing"
**Evidence:** All 9 + 6 symbols grep-verified (standalone>0, plugin=0 for the 9; boot>0, plugin=0 for the 6 except `ensureProjectGit` which shows `plugin=1` due to a comment reference).
**Status:** CONFIRMED (counts are correct and internally consistent)
**Suggested resolution:** None required. Noting for completeness. The `ensureProjectGit plugin=1` hit is a comment reference, not an import — `grep -n "ensureProjectGit" packages/app/src/server/hocuspocus-plugin.ts` shows the single hit is in prose explaining what `runDevShadowInit` does.

---

### [L] Finding 10: D5 rationale says "Third copy (boot.ts + harness + plugin) is explicit tech-debt" — but the test harness doesn't currently duplicate the keepalive grace logic

**Category:** FACTUAL
**Source:** T1 (own codebase verification)
**Location:** SPEC.md §10 D5 rationale (line 201).
**Issue:** D5 frames the post-refactor state as three copies of the keepalive-grace + presence-ts-refresh + parseKeepaliveConnectionId logic: `boot.ts` + harness + plugin. Grep of the test harness shows NO uses of `keepaliveGraceMs`, `keepaliveGraceTimers`, `bumpPresenceTs`, `parseKeepaliveConnectionId`, or `closeAllForAgent` (`grep -c "keepaliveGrace..." packages/app/tests/integration/test-harness.ts` → 0). The test harness hand-rolls HTTP but does NOT wire the keepalive grace primitives today. The post-refactor state is therefore: one copy in boot.ts, one copy in plugin. Two copies, not three. D5's "third copy" framing is cosmetically wrong.
**Current text:** "Third copy (boot.ts + harness + plugin) is explicit tech-debt the Future Work plan owns"
**Evidence:** `grep -c "keepaliveGrace\|bumpPresenceTs\|parseKeepaliveConnectionId\|closeAllForAgent" packages/app/tests/integration/test-harness.ts` returns 0 for each. The test harness connects via raw `HocuspocusProvider` WebSocket, doesn't simulate the MCP keepalive WS surface.
**Status:** CONTRADICTED (off-by-one on copy count)
**Suggested resolution:** Clarify D5 rationale: "Second copy (boot.ts + plugin) is explicit tech-debt the Future Work plan owns; the test harness is already on P2 (createServer) and does not wire these primitives — it's a candidate for migration under NG3 without a copy step." Does not change D5's LOCKED outcome (copy over extract) — only the framing of the debt.

---

## Confirmed Claims (coverage summary)

**Factual claims verified against codebase (HEAD = 5ee694c2, spec baseline = 6fa2c104):**

- LOC counts (standalone.ts 1452; boot.ts 514; plugin 594; dev-shadow-init 91; dev-shadow-init.test 172; api-config-handler 48) — exact match via `wc -l`.
- Nine missing server-side subsystems — all 9 grep-verified as `standalone > 0, plugin = 0`.
- Six missing HTTP-layer primitives — all 6 grep-verified (only `ensureProjectGit` has a single plugin match; it's a comment, not an import).
- `packages/server/src/standalone.ts:164` `createServer` export — verified.
- `packages/server/src/standalone.ts:270-311` `principalAuthExtension` definition + push — verified.
- `packages/server/src/standalone.ts:973+` `initAsync` function — verified.
- `packages/server/src/standalone.ts:1408-1432` SyncEngine block — verified.
- `packages/server/src/sync-engine.ts:262` `if (this.syncEnabled !== true)` — verified (exact line, exact source).
- `packages/server/src/boot.ts:141` `bootServer` export — verified.
- `packages/server/src/boot.ts:245` `KEEPALIVE_GRACE_MS`; `255` `httpServer.on('upgrade', ...)` — verified.
- `packages/server/src/process-lock.ts:138-143` same-pid idempotent rewrite — verified (exact phrasing match).
- `packages/app/src/server/hocuspocus-plugin.ts:212` `new Hocuspocus(...)` — verified.
- `packages/app/src/server/hocuspocus-plugin.ts:517` `createExternalChangeHandler(hocuspocus)` — verified.
- `packages/app/src/server/hocuspocus-plugin.ts:48-52` configureServer-runs-once comment — verified (exact prose).
- `packages/cli/src/commands/start.ts:408` `await bootServer({...})` — verified (line 408).
- `packages/app/tests/integration/test-harness.ts:119` `await ensureProjectGit(contentDir)` — verified.
- `packages/desktop/src/utility/server-entry.ts:~230` `server.bootServer({...})` — verified (line 229-230 area).
- `packages/app/tests/stress/_helpers/fixtures.ts:205` `spawn('bun', ['run', 'dev'], ...)` — verified.
- `packages/cli/src/mcp/server-discovery.ts:93-110` spawn-ok-start logic — verified.
- `AGENTS.md` breadcrumb applied at two occurrences — verified via `grep -c "Corrected 2026-04-23"` → 2.
- M6 baton-pass quote (semantic content) matches `origin/docs/m6-spec-sharpen:specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` §1 — verified.
- M6 branch has 0 LOC in `packages/server/src` or `packages/app/src/server` — verified via `git diff main..origin/docs/m6-spec-sharpen --stat`.
- PR history claims (#272, #280, PR #246 + follow-up commit `fc80318a`) — all three verified via `git log`.
- `agent-flow.test.ts` uses `@hocuspocus/server` directly and is standalone — verified (line 15, 41, 67, 130, 173, 217, 264 — 6 separate tests each instantiating `new Hocuspocus`).
- D10 grep claim that `dev-shadow-init` is imported only by the plugin — verified: the only source import is in `hocuspocus-plugin.ts`, and `dev-shadow-init.test.ts` is the lone test consumer.

**Decision consistency checks:**

- D1 (scope plugin-only) — coherent with NG2/NG3.
- D2 (SyncEngine opt-in default) — evidence file accurately traces the `sync-engine.ts:262` early-return; see Finding 3 for the nuance.
- D5 (copy keepalive over extract) — see Finding 10 for the "third copy" framing nit.
- D6 (logger dual-style preserved) — coherent.
- D7 (target prose) — exact string drafted and stored, ready for atomic PR edit.
- D8 (module-load + top-level await `ensureProjectGit`) — evidence file's lifecycle trace is thorough; see Finding 4 for the "test tmpdirs" overgeneralization.
- D9 (shutdown via `srv.destroy()` inside `httpServer.on('close')`) — coherent.
- D10 (delete `dev-shadow-init.ts` + test) — grep-verified, supports the FR17 LOC-delta target.

---

## Unverifiable Claims

- **`packages/desktop/src/main/window-manager.ts:595-646` Electron attach mode** (from `evidence/collab-entry-point-taxonomy.md`). Spot-check confirms the file has attach-mode logic (`readServerLock` branch at line 194, attach branch at 344-351) but the specific range 595-646 was not walked line-by-line. Spec does not rely on this range being exact — the claim is "attach mode reads server.lock and doesn't construct Hocuspocus," and that is confirmed by the `readServerLock` plumbing and the file's own JSDoc describing `(attach mode) just owns the BrowserWindow`. Sufficient for the evidence's purpose.
- **FR9 "Process observation smoke (`ps aux` at dev startup shows one Vite-rooted process tree)"** — operational claim; cannot verify without running `bun run dev`. The plugin's source structure (no `child_process.spawn`, no `utilityProcess.fork` beyond Vite's own) supports the claim, but the metric is observational.
- **NFR "Dev-server startup latency must not regress by more than 500ms p50"** — forward-looking perf claim; baseline not captured in evidence. Will need to be measured at PR time.

---

## Notes for the parent `/spec` step 7 evaluator

- No finding is **decision-implicating** in the strict sense (no verified fact undermines a LOCKED decision's rationale). Findings 1, 2, 3 are the medium-value items; each is a **pure correction** or **tightening** in the FACTUAL/COHERENCE sense and can be applied without re-opening decisions.
- Finding 3 deserves a judgment call from the user: accept the `[sync] remote detection failed` warn-log-per-Playwright-worker as test-mode noise, or gate the SyncEngine block on `gitEnabled`. The evidence file explicitly notes this as "not needed for this spec — current behavior is fine," so default to accept-as-noise unless the user flags it.
- Findings 4-10 are low-severity precision/framing items; fix-in-place does not affect scope or timeline.
