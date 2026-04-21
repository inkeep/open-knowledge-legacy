# Audit Findings — Pass 2 (2026-04-17 late scope pivot)

**Artifact:** `specs/2026-04-11-electron-desktop-app/SPEC.md` (1369 lines, 52 decisions)
**Audit date:** 2026-04-20
**Verification against:** origin/main at commit `757d9fb3` (32 commits past spec baseline `f17ad00`)
**Total findings:** 17 (4 High · 8 Medium · 5 Low)

---

## Summary

The spec's core architecture (§1–§8) is internally coherent and well-grounded; the five fanout research reports (T1–T5) cited throughout §8–§10 exist, and their conclusions are faithfully reproduced. The 52-decision chain (D1–D52 with D7/D11/D32 superseded) is logically consistent — every supersede reference resolves, and supersede chains (D7 → D32 → D51, D11 → D52) are transitively valid.

The findings below cluster into three groups:
1. **Factual drift against origin/main HEAD** (commitDebounceMs default, ServerInstance shape new field, EditorId union expansion, PR #166 merge status + shape numbers, OQ-E "bug" claim that no longer describes current code).
2. **Unresolved contradictions with newly-merged PRs** (PR #170's `ok` recommendation vs D52's "no `ok` alias"; PR #221's Claude Desktop editor vs spec's 4-editor list).
3. **Load-bearing references to as-yet-unbuilt primitives** (D35 cites `packages/server/src/boot.ts` which does not exist; §7.2 and §8.3 narrate `bootServer` as if shipped).

---

## High severity findings

### [H1] Finding: PR #166 merge-status claims are stale; shape numbers drifted

**Category:** FACTUAL
**Source:** T5 — spot-check of cited PR state
**Location:** §5 Locked → "GitHub collaboration round-trip substrate" bullet (line 138); D31 (line 1040); §12 Assumptions (line 1150)
**Issue:** Spec text treats PR #166 as "in-flight ... MERGEABLE as of 2026-04-17 at head `ad53dd3e`" with shape `9,558 LOC / 71 files / 15 endpoints` (D31) and `~8,700 LOC, 68 files` (§5 substrate bullet, line 138). PR #166 was **MERGED on 2026-04-17 at 19:57Z**; final head was `35c5244d`, merged to main as `986ebafe`, with **additions=10,474 / changedFiles=73**. Neither the §5 number nor the D31 number matches reality, and the ⚠️ "re-validation required when PR #166 merges" gate in §5 is now a gate that has fired without the re-validation being done.
**Current text (D31):** "Shape snapshot as-of-audit (9,558 LOC / 71 files / 15 endpoints at PR head `ad53dd3e`, `MERGEABLE` 2026-04-17) lives in `meta/audit-findings.md` as evidence — **not** in this decision as contract."
**Evidence:** `gh pr view 166 --json state,mergedAt,mergeCommit,additions,changedFiles,headRefOid` → `{"state":"MERGED","mergedAt":"2026-04-17T19:57:48Z","mergeCommit":{"oid":"986ebafe..."},"additions":10474,"changedFiles":73,"headRefOid":"35c5244d..."}`.
**Status:** STALE
**Suggested resolution:** Sharpen — replace "MERGEABLE" with "MERGED" and update numbers (or drop numbers entirely since D31 is now posture-based per its own text). Also execute the "re-validation required when PR #166 merges" gate spelled out in §5 and in §12 Assumptions row 7: verify (1) `@napi-rs/keyring` rebuilds in utilityProcess, (2) asarUnpack globs cover keyring, (3) CC8 `destroy()` phase ordering includes SyncEngine drain, (4) `/api/local-op/auth/*` endpoint inventory matches current state.

### [H2] Finding: PR #170 contradicts D52 "no `ok` alias in v0"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction) + T5 (PR status)
**Location:** D52 (line 1061), §8.12 (line 855)
**Issue:** D52 and §8.12 explicitly say: "**Binary name:** `open-knowledge` (no `ok` alias in v0 — users can add their own shell alias if desired)." But PR #170 (merged 2026-04-17 — same day as the spec edit pass) delivers a research report that **recommends shipping `ok` as the primary binary** with `@inkeep/open-knowledge` as the package name, and explicitly proposes `"bin": { "open-knowledge": ..., "ok": ... }` as a zero-breakage migration path. This is a direct conflict: the spec's v0 scope says one thing, a recommendation PR merged to main says another, and the spec does not acknowledge the tension.
**Current text (D52):** "No `ok` alias in v0 (user-level opt-in only — shell alias)."
**Evidence:** `gh pr view 170` body: *"Recommendation: Ship `ok` as the primary binary. Keep `@inkeep/open-knowledge` as the package name ... During transition, declare both `\"bin\": { \"open-knowledge\": ..., \"ok\": ... }` — zero breakage."*
**Status:** INCOHERENT
**Suggested resolution:** Acknowledge ambiguity — D52 was locked 2026-04-17; PR #170's recommendation report landed same day. Either (a) explicitly address PR #170 in D52's rationale ("spec stays at `open-knowledge` only; if/when the `ok` migration lands, Electron will inherit automatically via bundled CLI") or (b) reframe D52 to be agnostic to the binary name ("the bundled CLI's primary bin — currently `open-knowledge`, may evolve to `ok` per `reports/cli-command-name-ok-okb/`"). Without acknowledgment the spec reads like it rejected a recommendation it never considered.

### [H3] Finding: EditorId union grew from 4 to 6 values on origin/main — spec still quotes 4

**Category:** FACTUAL
**Source:** T1 — direct read of `packages/cli/src/commands/editors.ts` on origin/main
**Location:** §7.7 line 396, §8.11 line 830, M6 line 1257, J1 line 178, J7e line 246
**Issue:** Five places in the spec enumerate the editors that `runInit` / `detectInstalledEditors` supports as "**Claude Code, Cursor, VS Code, Windsurf**" (4 values). Origin/main's current `EditorId` union is `'claude' | 'cursor' | 'vscode' | 'codex' | 'windsurf' | 'claude-desktop'` — **6 values**. Codex landed via PR #209 (merged 2026-04-18); Claude Desktop via PR #221 (merged 2026-04-20, one day before this audit). Both are shipped. The spec's MCP consent dialog UI mockup (§8.2 line 477: "Add Open Knowledge to your AI tools? [Claude Desktop ☑] [Cursor ☑] [Continue ☐] [Skip]") *does* mention Claude Desktop, but it pairs Claude Desktop with **Continue**, which is not a supported EditorId on main — Continue's config path is not in `EDITOR_TARGETS`.
**Current text (§7.7):** "Supports **Claude Code, Cursor, VS Code, Windsurf**. Interactive TTY selection with `--editor` override..."
**Evidence:** `git show origin/main:packages/cli/src/commands/editors.ts` → `export type EditorId = 'claude' | 'cursor' | 'vscode' | 'codex' | 'windsurf' | 'claude-desktop';` and `ALL_EDITOR_IDS` array has the same 6 values.
**Status:** STALE
**Suggested resolution:** Sharpen — update all 5 enumerations to the full 6 editors, or stop enumerating and link to `packages/cli/src/commands/editors.ts` as the source of truth. Specifically flag §8.2's "[Continue ☐]" as wrong — Continue is not in `EDITOR_TARGETS` (removing, replacing with Claude Desktop + Codex). This is especially acute because the spec's R16 (line 998) + M5 keychain discussion is about *"Open Knowledge" wants to access your keychain* which is a CFBundleDisplayName prompt — the same UX applies to Claude Desktop, so the docs author persona (P1) is likely to care.

### [H4] Finding: D35's `bootServer` / `packages/server/src/boot.ts` is narrated as shipped but does not exist

**Category:** FACTUAL + COHERENCE
**Source:** T1 — direct check of `packages/server/src/` tree on origin/main
**Location:** §7.2 line 263, §8.3 line 485, D35 line 1044
**Issue:** §7.2 describes post-PR #173 CLI lifecycle as "via `bootServer` per D35"; §8.3 line 485 calls `bootServer(...)` as the Electron utility entry function. D35 itself (line 1044) says "Extract `bootServer` from CLI to `packages/server/src/boot.ts`." On origin/main the file `packages/server/src/boot.ts` does **not exist**; the actual wrapper `bootStartServer` lives at `packages/cli/src/commands/start.ts:249` (exactly as D35 describes, but in CLI not server). The spec narrates the *target* state of a refactor as if it were ambient, creating a reader-misleading impression that the Electron work plugs into a shipped primitive. The refactor is also an ASK_FIRST item per §16 ("Any change to `@inkeep/open-knowledge-server` public exports").
**Current text (§7.2 line 263):** "Post-PR #173 (Zero-Ceremony Resume, merged `d901f563`), the CLI lifecycle is split: `open-knowledge start` serves collab + `/api/*` only ... Electron does NOT run an `open-knowledge ui` equivalent — the BrowserWindow IS the UI surface (per D36)." (§7.2's bootServer claim is hedged "via `bootServer` per D35" — currently accurate only in present tense of D35, not of code.)
**Evidence:** `git ls-tree origin/main packages/server/src/` lists no `boot.ts`. `git show origin/main:packages/cli/src/commands/start.ts | grep bootServer` → zero matches; `bootStartServer` at line 249.
**Status:** INCOHERENT (prose overstates; code is not in place)
**Suggested resolution:** Add conditionality — §7.2 and §8.3 should qualify every `bootServer` reference as "per D35, which ships as part of this spec's implementation." Today §8.3 line 485 reads as if `bootServer` already exists; it should read "will call `bootServer(...)` once D35 lands (extracted from today's `bootStartServer` at `packages/cli/src/commands/start.ts:249`)." The M1 milestone (line 1191) correctly frames this, so update prose in §7 and §8 to match M1's framing.

---

## Medium severity findings

### [M1] Finding: `commitDebounceMs` default is 30_000 in `createServer`, not 15_000

**Category:** FACTUAL
**Source:** T1 — direct read of `packages/server/src/standalone.ts`
**Location:** §7.4 line 330, §7.2 line 285
**Issue:** §7.4 says: "**L2 (disk → git)** via shadow-repo commit. Debounced **15s idle** (default; was 30s at spec baseline). Overridable via `ServerOptions.commitDebounceMs`." §7.2 line 285 says: "`commitDebounceMs` (default **15_000** — was 30_000 at spec baseline)." Both are wrong for the authoritative layer. On origin/main, `createServer()` in `standalone.ts` line 142 has `commitDebounceMs = 30_000` (unchanged from baseline). The `persistence.ts` standalone fallback is 15_000 — but `createServer` always passes the 30_000 value down, so the effective default remains 30s, not 15s. Neither §7.2 nor §7.4 reflects this.
**Evidence:** `git show origin/main:packages/server/src/standalone.ts | grep commitDebounceMs` →  `commitDebounceMs = 30_000` at line 142, and `commitDebounceMs,` at line 193 (passed into persistence).
**Status:** CONTRADICTED
**Suggested resolution:** Sharpen — replace 15s with 30s in both §7.2 and §7.4, or remove the "was X at spec baseline" historical claim (it's pre-correct-now-also).

### [M2] Finding: `ServerInstance.syncEngine` field is on origin/main but absent from the quoted interface

**Category:** FACTUAL
**Source:** T1 — direct read of `standalone.ts` on origin/main
**Location:** §7.2 lines 268–283 (interface block)
**Issue:** The `ServerInstance` interface quoted in §7.2 includes `hocuspocus`, `sessionManager`, `cc1Broadcaster`, `agentFocusBroadcaster`, `contentFilter`, `destroy`, `ready`, `degraded`, `lockDir`. Post-PR #166 merge, origin/main's interface also includes `readonly syncEngine: SyncEngine | null;` as the final field. The Electron spec's §12 assumption ("CC8 `destroy()` phase ordering includes a SyncEngine drain ahead of agent drain") depends on the SyncEngine existing as a field — but §7.2 doesn't surface that it IS a field. This is a small fidelity gap now that PR #166 is merged.
**Current text (§7.2 line 282):** `readonly lockDir: string; }` (last field)
**Evidence:** `git show origin/main:packages/server/src/standalone.ts` lines 121–122: `readonly lockDir: string; /** Active sync engine instance, or null if dormant / no remote detected. */ readonly syncEngine: SyncEngine | null;`
**Status:** STALE
**Suggested resolution:** Sharpen — add `readonly syncEngine: SyncEngine | null;` to the interface block in §7.2, since the spec relies on `SyncEngine.destroy()` being wirable in the Electron utility's shutdown.

### [M3] Finding: OQ-E "real bug" claim is factually wrong on current origin/main

**Category:** FACTUAL
**Source:** T1 — direct read of `SystemDocSubscriber.tsx` on origin/main
**Location:** §11 OQ-E (lines 1088–1092)
**Issue:** OQ-E says (line 1089): *"Verified by reading `packages/app/src/components/SystemDocSubscriber.tsx`: `useEffect` deps are `[queryClient]`. The wsUrl is derived inside the closure from `defaultCollabWsUrl()` (reads `location.host`). In Electron, when project-switch changes the wsPort, the effect won't re-run because `queryClient` hasn't changed. **This is a real bug that the Electron implementation must fix.**"* On origin/main, the `SystemDocSubscriber`'s useEffect deps are `[queryClient, collabUrl]` (line 149), and `collabUrl` is read from `useDocumentContext()` — so the effect *does* re-fire on project-switch when `collabUrl` changes. The bug OQ-E asserts no longer exists; the "E-fix-1" implementation already shipped upstream.
**Current text (OQ-E line 1089):** "Verified by reading `packages/app/src/components/SystemDocSubscriber.tsx`: `useEffect` deps are `[queryClient]`."
**Evidence:** `git show origin/main:packages/app/src/components/SystemDocSubscriber.tsx` line 49 starts the effect; line 149 closes `}, [queryClient, collabUrl]);` — `collabUrl` is sourced from `useDocumentContext()` on line 17.
**Status:** STALE
**Suggested resolution:** Sharpen — OQ-E can be closed outright (not as "bug to fix" but as "already fixed upstream; verify in integration test"). Remove the "E-fix-1 required" addition to §8.3 / §15 SCOPE.

### [M4] Finding: §8.2 menu mockup lists "Continue" which is not a supported EditorId

**Category:** FACTUAL + COHERENCE (coupled to H3)
**Source:** L1 (internal contradiction with §7.7 editor list) + T1 (editors.ts)
**Location:** §8.2 MCP wiring orchestrator (line 477), §4 P1 persona (line 91), NG11 (line 82), J5 (line 220), §8.14 diagram (line 903)
**Issue:** §8.2 MCP orchestrator says: *"detect presence of `~/Library/Application Support/Claude/claude_desktop_config.json`, `~/.cursor/mcp.json`, `~/.config/Continue/config.json`. Prompt user once: '[Claude Desktop ☑] [Cursor ☑] [Continue ☐] [Skip]'."* But Continue is not in `EDITOR_TARGETS` on origin/main; there is no `continue` EditorId. Continue appears repeatedly in §4 (persona), NG11, J5 (user journey), §8.14 (diagram), §8.2, G4. The spec's "Continue integration" is vestigial — it's never listed in the 4-editor or 6-editor enumerations, and no code path exists. Either Continue support is planned but unscoped, or it's a residue that should be scrubbed.
**Current text (§8.2 line 477):** "[Claude Desktop ☑] [Cursor ☑] [Continue ☐] [Skip]"
**Evidence:** `git show origin/main:packages/cli/src/commands/editors.ts` → no Continue target in `EDITOR_TARGETS`; `ALL_EDITOR_IDS` has 6 values none of which is `'continue'`.
**Status:** INCOHERENT
**Suggested resolution:** Acknowledge ambiguity — either (a) declare "Continue integration" a non-goal for v0 explicitly under §3 (add NGn entry) and scrub every mention, or (b) file a follow-up spec for Continue support and note here that the §8.2 mockup uses aspirational UI. Pairing this with H3's 6-editor update.

### [M5] Finding: J1 step 6 spec text contradicts §8.11's runInit signature discipline

**Category:** COHERENCE
**Source:** L1 — cross-section contradiction
**Location:** §6 J1 step 6 (line 178) vs §8.11 (line 835, 839)
**Issue:** J1 step 6 says: "Main calls `runInit(projectPath, { editors: <detected>, source: 'desktop' })`." But §8.11 explicitly corrects this: *"Main process calls `runInit({ cwd: projectPath, editors: detectInstalledEditors(projectPath), force: false, mcp: true })` (per verified `InitCommandOptions` shape on main — see audit-findings.md; signature is **options-object only**, no positional `projectPath`)."* §8.11 also says: *"**No `source: 'desktop'` option.** The prior spec text proposed this but `InitCommandOptions` does not include a `source` field."* J1 line 178 is the *old* text that §8.11 disavows — but it was never updated. A reader following J1 top-to-bottom will internalize the wrong signature before reaching §8.11's correction.
**Current text (J1 line 178):** "Main calls `runInit(projectPath, { editors: <detected>, source: 'desktop' })`"
**Evidence:** `git show origin/main:packages/cli/src/commands/init.ts` line 420: `export function runInit(options: InitCommandOptions = {}): InitCommandResult` — options-object only, no `source` field in `InitCommandOptions` (lines 133–142).
**Status:** INCOHERENT
**Suggested resolution:** Sharpen — update J1 step 6 to: "Main calls `runInit({ cwd: projectPath, editors: detectInstalledEditors(projectPath), force: false, mcp: true })` (per §8.11)."

### [M6] Finding: §8.11 footnote still quotes `source: 'desktop'` as the rejected proposal

**Category:** COHERENCE (minor)
**Source:** L1
**Location:** §8.11 line 839
**Issue:** §8.11 explains that `source: 'desktop'` is not a valid option, but does not explicitly update J1 step 6 (M5 issue above) nor the audit-findings.md pointer. The pointer "see audit-findings.md" in §8.11 line 835 is to the earlier-pass audit-findings.md — the one being replaced by this pass-2 file. If pass-2 is the go-forward audit, the pointer is stale.
**Current text (§8.11 line 835):** "(per verified `InitCommandOptions` shape on main — see audit-findings.md; signature is **options-object only**, no positional `projectPath`)"
**Evidence:** Reference is narratively scoped to audit-findings.md; this pass-2 file may become the authoritative version.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Acknowledge ambiguity — if pass-2 becomes canonical, update the pointer to audit-findings-pass2.md. If audit-findings.md is preserved as the primary source, leave it.

### [M7] Finding: D29 "~140MB per-arch" stat appears twice with different magnitudes

**Category:** COHERENCE + L7 (inline source attribution)
**Source:** L1 + L7
**Location:** D29 (line 1038) and OQ-O (line 1067)
**Issue:** D29 says: "Size tradeoff (~250-280MB vs ~140MB per-arch)." OQ-O (the closed form of the same decision) says: "Size tradeoff (~100-140MB larger)." These are compatible if you read carefully: 250–280 − 140 ≈ 110–140MB. But the D29 phrasing reads as "~140MB per-arch is the per-arch size" whereas OQ-O phrasing reads as "Universal is ~140MB larger than per-arch." A reader cross-checking will notice the disparity.
**Current text (D29 line 1038):** "Size tradeoff (~250-280MB vs ~140MB per-arch) acceptable given broadband is the norm for P1."
**Current text (OQ-O line 1067):** "Size tradeoff (~100-140MB larger) acceptable for P1."
**Evidence:** Comparing the two.
**Status:** INCOHERENT
**Suggested resolution:** Sharpen — pick one phrasing and unify. "~250MB Universal vs ~140MB per-arch = ~110MB size cost" works.

### [M8] Finding: D31 "reframed to posture" text still carries the pre-reframing inventory language

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment) + L6 (stance consistency)
**Location:** D31 (line 1040)
**Issue:** D31 says it is "reframed to posture" — "decision is architectural stance, not shape-specific inventory." But the decision text still recites specific implementation details: `AuthModal`, `CloneDialog`, `ConflictBanner`, `ConflictResolver`, `SyncStatusBadge`, `DiffView.conflictMode`, `EditorHeader` auth button, `use-git-sync-status` hook; `SyncEngine` with decoupled pull (30s) / push (60s); `parentGitMutex`; plus the "9,558 LOC / 71 files / 15 endpoints at PR head `ad53dd3e`" snapshot. If the decision is about posture, most of this is commentary that contradicts the reframing intent. The contradiction is subtle but creates spec ambiguity about what is/isn't a pinned contract.
**Current text (D31 line 1040):** "Shape snapshot as-of-audit (9,558 LOC / 71 files / 15 endpoints at PR head `ad53dd3e`, `MERGEABLE` 2026-04-17) lives in `meta/audit-findings.md` as evidence — **not** in this decision as contract."
**Evidence:** Contrast this disclaimer with the 150+ words in the same D31 that quote specific component names, LOC counts, and endpoint counts.
**Status:** INCOHERENT (stance drift)
**Suggested resolution:** Re-research or recalibrate — either (a) truly shorten D31 to posture-only prose with a one-line reference to `audit-findings.md` for shape, or (b) acknowledge that D31 pins inventory and adjust the "not in this decision as contract" disclaimer.

---

## Low severity findings

### [L1] Finding: M7 calendar estimate doesn't pair with Apple Dev Program worst case

**Category:** COHERENCE
**Source:** L1 (internal consistency in §14)
**Location:** §14 line 1288
**Issue:** §14 says "Total calendar estimate (rough, assuming Apple Dev Program enrollment already complete): ~4-6 weeks from scope-freeze to M7." But §12 Assumption row 6 (line 1148) says enrollment is "1-6 weeks total." Combined worst case is 4+6=10 weeks, not 4–6. The estimate is fine for the optimistic case but doesn't signal the compound risk.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Sharpen — "~4–6 weeks from scope-freeze to M7, assuming Apple Dev Program enrollment already complete; worst-case compound timeline is ~10 weeks if enrollment + D-U-N-S procurement runs in parallel to M1."

### [L2] Finding: §5 Locked claims Electron 41.2.0 GA on 2026-04-07 with Chromium 146 / Node.js 24

**Category:** FACTUAL
**Source:** T4 — web verification of Electron 41 GA date
**Location:** §5 Locked line 118
**Issue:** The spec pins Electron 41 as target and cites "41.2.0 is GA as of 2026-04-07, Chromium 146, Node.js 24." This is hedged as a current-stable target, not a shipped claim, so low-severity; but the specific version bump (41.2.0 vs 41.0.0) should be re-verified at scope freeze. Also the cited "Electron 41 shipped an additional-defence hardening for ASAR-integrity-protected apps on macOS ([release notes #48587])" is plausible but the spec claims this "mitigates the class of attack described in CVE-2025-55305 (ToB, Sept 2025)" — the fidelity of this mapping is asserted without evidence inline.
**Status:** UNVERIFIABLE at audit time
**Suggested resolution:** Acknowledge ambiguity — label the CVE-2025-55305 / #48587 mitigation claim as INFERRED (release notes don't name-check the CVE per the spec's own text). Low priority.

### [L3] Finding: §7.2 endpoint list is illustrative, not exhaustive

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** §7.2 lines 297–308 + line 309 ("canonical, maintained endpoint table is in [`CLAUDE.md`](../../CLAUDE.md)")
**Issue:** §7.2 enumerates ~18 endpoints and then says the canonical table is in CLAUDE.md. CLAUDE.md's API Endpoints table has 13 endpoints. PR #166 added ~15 `/api/local-op/auth/*` endpoints that D31 references but that §7.2's enumeration omits. The §7.2 sidenote "**15 endpoints**" mentioned in the D31 shape snapshot does not appear in §7.2's enumeration. A reader who counts finds the counts don't line up. Acceptable because §7.2 points at CLAUDE.md as source of truth, but the discrepancy is there.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Acknowledge ambiguity — explicitly note "§7.2 lists the routes that existed at spec baseline + a representative sample; CLAUDE.md is the authoritative live list."

### [L4] Finding: §13 Future Work NG4 cross-reference reads as both NOT NOW and NEVER

**Category:** COHERENCE
**Source:** L1
**Location:** §13 line 1170–1172
**Issue:** §13 "Windows day-0" entry reads "(per D51, supersedes D32) — deferred while we ship macOS end-to-end first." Then the next bullet: "**Linux day-0** (per D51 NG4) — further deferred. Opportunistic once Windows lands." NG4 (line 75) is labeled "[NOT NOW] NG4: Windows and Linux desktop packaging." So the scope markers say "NOT NOW"; §13 says "deferred ... opportunistic once Windows lands" for Linux — this is NOT NOW. Fine. But the Linux-specific "AppImage explicitly out-of-scope for deep-linking ... deb/rpm for deep-link support" is an implementation note inside the NOT NOW block — makes the block feel more like "when Linux reappears, this is the shape" rather than "deferred." Consider whether this belongs in §13 or in a Linux-specific appendix when that spec opens.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Sharpen — move AppImage/deb/rpm detail to a subsection or inline callout marked "when Linux re-enters scope:".

### [L5] Finding: §8.8 D45 `open-knowledge ui` pattern is coherent with T5 but mentioned before T5 is defined

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** §8.8 line 775 (D45 claim that `open-knowledge ui` + Electron coexistence is supported)
**Issue:** D45 is coherent with §7.2's post-PR #173 lifecycle split narrative. But §8.8 says "proxies `/api/*` to Electron's utility port. A browser tab at `http://localhost:3000` becomes a parallel UI client." The `http://localhost:3000` is the CLI default port for `open-knowledge ui`. Spec doesn't explicitly state what port `open-knowledge ui` binds to in the Electron coexistence case; it's implied to be 3000 (CLI default) or something else the user runs. This is a minor under-specification of a coexistence pattern that's locked as supported (D45).
**Status:** INCOHERENT (minor — under-specified)
**Suggested resolution:** Add conditions — specify that `open-knowledge ui`'s port is the user's choice (config or --port flag), not controlled by Electron. A sentence in §8.8 D45 would do it.

---

## Verification log

| Claim | Source | Status | Evidence |
|-------|--------|--------|----------|
| Binary name `open-knowledge` | SPEC D52, §8.12 | CONFIRMED | `packages/cli/package.json` `bin: {open-knowledge: ./dist/cli.mjs}` |
| `runInit(options: InitCommandOptions)` options-only signature | SPEC §8.11 | CONFIRMED | `packages/cli/src/commands/init.ts:420` |
| `InitCommandOptions` fields `{cwd, mcp, force, editors, rootInstructions, home}` | SPEC §8.11 | CONFIRMED | `init.ts:133–142` |
| `InitCommandResult { contentCreated, contentSkipped, editors, rootInstructions, preview? }` | SPEC §8.11 | CONFIRMED | `init.ts:144–163` (with addition `launchJson?: LaunchJsonResult`) |
| EditorId = 4 editors (claude, cursor, vscode, windsurf) | SPEC §7.7, §8.11, M6 | CONTRADICTED (H3) | 6 values on main including codex + claude-desktop |
| PR #166 MERGEABLE as of 2026-04-17 | SPEC §5, D31 | CONTRADICTED (H1) | MERGED 2026-04-17T19:57Z at `986ebafe` |
| PR #166 shape: 9,558 LOC / 71 files / 15 endpoints | SPEC D31 | CONTRADICTED (H1) | additions=10,474 / files=73 |
| PR #173 merge commit `d901f563` | SPEC §7.2 | CONFIRMED | gh pr view 173 |
| PR #152 server-authoritative observer bridge | SPEC §7.5 | CONFIRMED | MERGED 2026-04-15, head 9ce56ee1 |
| PR #99 server-lock shipped | SPEC §5, §8.8 | CONFIRMED | MERGED 2026-04-13 |
| PR #106 CC1 shipped | SPEC §5, §7.5 | CONFIRMED | MERGED 2026-04-14 |
| PR #139 managed-rename-recovery | SPEC §7.2 | CONFIRMED | MERGED 2026-04-15; adds 4th `degraded` value |
| `ServerInstance` fields | SPEC §7.2 | PARTIALLY STALE (M2) | Missing `syncEngine: SyncEngine \| null` |
| `commitDebounceMs` default 15s | SPEC §7.2, §7.4 | CONTRADICTED (M1) | 30_000 in `standalone.ts:142` |
| Default port 0 post-PR #173 | SPEC §7.2 | CONFIRMED | `schema.ts:71`; `standalone.ts:161` |
| `SystemDocSubscriber` deps = `[queryClient]` (bug claim) | SPEC OQ-E | CONTRADICTED (M3) | Current deps `[queryClient, collabUrl]` |
| T1 `@napi-rs/keyring` fanout report exists | SPEC §5, §8.3, §8.9 | CONFIRMED | `reports/.../t1-keyring-utility-process/REPORT.md` |
| T2 preload bridge fanout exists | SPEC §8.4 | CONFIRMED | `reports/.../t2-preload-bridge-patterns/REPORT.md` |
| T3 multi-window subprocess lifecycle fanout exists | SPEC §8.3, D39, D40, D41 | CONFIRMED | `reports/.../t3-multi-window-subprocess-lifecycle/REPORT.md` |
| T4 deep-linking URL schemes fanout exists | SPEC §8.9, D43, D46, D47 | CONFIRMED | `reports/.../t4-deeplinking-url-schemes/REPORT.md` |
| T5 startup order matrix fanout exists | SPEC D44, D48, D49, D50 | CONFIRMED | `reports/.../t5-startup-order-matrix/REPORT.md` |
| D7 superseded → D32 | Decision chain | CONFIRMED | D7 line 1016 notes supersede, D32 line 1041 notes superseded-by-D51 |
| D11 superseded → D52 | Decision chain | CONFIRMED | Both D11 and D52 reference each other |
| D32 superseded → D51 | Decision chain | CONFIRMED | Both D32 and D51 reference each other |
| `bootServer` / `packages/server/src/boot.ts` exists | SPEC §7.2, §8.3, D35 | CONTRADICTED (H4) | No file on origin/main; `bootStartServer` in CLI only |
| PR #170 recommends `ok` as primary bin | — | CONFIRMED via gh pr view 170 | MERGED 2026-04-17 — contradicts D52 (H2) |
| PR #221 adds claude-desktop editor | — | CONFIRMED via gh pr view 221 | MERGED 2026-04-20; confirms H3 6-editor shape |
| PR #209 adds codex editor | — | CONFIRMED via gh pr view 209 | MERGED 2026-04-18 |
| `DiffView.conflictMode` prop | SPEC §5 substrate | CONFIRMED | `DiffView.tsx:32` |
| AuthModal, CloneDialog, ConflictBanner, ConflictResolver, SyncStatusBadge files | SPEC §5 | CONFIRMED | All present under `packages/app/src/components/` |
| `use-git-sync-status` at `packages/app/src/lib/...` | SPEC §5 | STALE (minor) | Lives at `packages/app/src/hooks/use-git-sync-status.ts` |
| D48 `processName?: string` optional field | SPEC D48 | CONFIRMED (proposed, not shipped) | `ProcessLockMetadata` has no processName; matches D48's "shipped V0-1 can ignore it" |

---

## Confirmed Claims (summary)

**Factual verification (T1/T2/T3/T4/T5) — largely clean:**
- Server factory + lock contracts (PR #99, #106, #152, #173) all match spec narrative.
- Research fanout reports under `reports/electron-ai-coding-agent-development/fanout/2026-04-17-audit-followups/` exist with the cited shapes (T1–T5).
- `runInit` options shape, `EditorMcpTarget` registry, `ALL_EDITOR_IDS` constant all verified.
- Binary name `open-knowledge` confirmed in package.json.
- Universal DMG / electron-builder config claims consistent with research.
- Deep-linking + CVE-2018-1000006 `--` sentinel claim matches T4 evidence.

**Coherence (L1–L7) — mostly clean:**
- Decision chain (D1–D52) is internally traceable; every supersede reference resolves.
- G-numbers, NG-numbers, D-numbers, OQ-letters consistently referenced.
- §5 Locked constraints align with §8 Proposed solution.
- Agent-first principle (D30) reproducible as the lens across D33, D34, D51.
- §14 Implementation Sequence (M1–M7) dependencies are well-ordered: M1 unblocks all; M2 gates user-facing milestones; M7 composes M2 + M3 + M6.

---

## Unverifiable claims (open questions the audit couldn't resolve)

1. **Exactly which Electron minor is stable at scope freeze?** §5 pins "Electron 41" and mentions 41.2.0 GA on 2026-04-07. If scope freeze slips, 41.x may have moved to 42+. This is flagged in §16 STOP_IF "Electron recommends `~41.0.N` with `N > 2`" — already conditional. No action needed; just flag for implementer.
2. **Whether Electron's `utilityProcess.fork()` has `windowLifecycleBound` flag in 41.2.0.** D39 cites this as VS Code precedent but the exact Electron 41 API surface isn't verified. The spec's §12 assumptions notes spike-needed for `prctl(PR_SET_PDEATHSIG)` / Job Objects — this flag might warrant similar spike language.
3. **Whether `runInit` bundled-CLI-path preference env var `OK_ELECTRON_BUNDLED_CLI` exists on origin/main.** §8.12 describes this as a forthcoming mechanism (fork-time env var). I didn't see it in `init.ts` on main, but the spec is forward-looking here; may be scoped into M6 implementation.
4. **Whether the audit-findings.md pass-1 file is the "evidence" that D31 shape snapshot cites.** The D31 pointer is `meta/audit-findings.md`. If the user intends pass-2 to supersede, a pointer update is required — but that's a user decision, not an audit finding.
5. **Exactly which PRs "#190, #192, #195" contribute to the desktop spec's verification.** The audit prompt listed these for spot-checking, but none appear cited in the spec text. Confirmed merged; no impact on spec coherence. If there's an expected spec dependency on one of them, it's not surfaced.
