# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/zero-ceremony-resume-spec/specs/2026-04-16-zero-ceremony-resume/SPEC.md`
**Audit date:** 2026-04-16
**Baseline commit:** 5dab8683
**Auditor posture:** cold read — no conversational context

---

## Summary

**Total findings:** 15 (4 high, 7 medium, 4 low)

- 2 high factual issues: MCP tool count + baseline % math is wrong (tools = 21, not 17); `ok start`'s default port TODAY is 3000, not kernel-allocated — architectural implication not addressed in FRs.
- 2 high coherence issues: evidence files contradict each other on how Claude Code's preview_start routes port traffic; FR-3.1 misdescribes editor config locations.
- Several medium/low issues around line-ref off-by-ones, unverifiable MCP spec claims, and missed architectural implications of OQ-A7.

Core argument of the spec (hybrid client-launched + detached MCP spawn + UI/collab split + previewUrl coverage) is sound. The coherence / factual issues identified are fixable with small edits and do not invalidate the bet.

---

## High Severity

### [H] F-001: MCP tool count is 21, not 17 — baseline percentage and "14 additional" figures are wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §1 Problem Statement; §7 M2; §8 Current state; §9 User-experience; project evidence `current-state.md`
**Issue:** The spec claims "17 MCP tools total" with "3 of 17 tools" emitting `previewUrl` (baseline ~18%) and "~14 others don't." Count of `server.tool()` call sites in `packages/cli/src/mcp/tools/*.ts` (non-test) = **21 tools**. The 3-emit-today count is correct (`write-document.ts`, `edit-document.ts`, `get-preview-url.ts`). So the true deficit is 18, not 14. FR-2.1 (9 single-doc) + FR-2.2 (9 list-producing) = **18** tools to add, not "14" (§9, line 231: "14 additional tools emit previewUrl").
**Current text:** "~14 others don't" (§1); "~18% (3 of 17 tools)" (§7 M2); "14 additional tools emit `previewUrl`" (§9)
**Evidence:** `packages/cli/src/mcp/tools/index.ts:147-202` registers 21 tools via `registerAllTools`. Tool names: exec, init-content, ingest, research, consolidate, read_document, search, suggest_links, write_document, edit_document, rename_document, get_history, save_version, rollback_to_version, list_documents, get_backlinks, get_forward_links, get_orphans, get_hubs, get_dead_links, get_preview_url.
**Status:** CONTRADICTED (by codebase)
**Suggested resolution:** Update everywhere to "21 total, 3 emit, 18 to add". Baseline % is ~14% (3/21). FR-2.1 + FR-2.2 list counts are already correct; only derived narrative stats are off.

---

### [H] F-002: `ok start` binds port 3000 by default today — post-split default-port change is implicit, not specified

**Category:** FACTUAL + COHERENCE
**Source:** T1 (own codebase) / L1 (cross-section contradiction)
**Location:** §5 P1 journeys; §9 Architecture overview; evidence `launch-json-and-port.md`
**Issue:** Multiple spec passages state `ok start` uses "port 0 (kernel allocation) as today" or binds port via kernel — but `packages/cli/src/config/schema.ts:17,24` defaults `server.port` to **3000**, not 0. Port 0 in `server.lock` is a sentinel for "starting, not yet bound" per CLAUDE.md, not the bind port. Post-split, UI takes port 3000 (launch.json contract), so collab MUST change its bind default to something else (0 / kernel-allocated or a different fixed port). This is never called out as an FR. An implementer reading the spec strictly would leave `server.port` at 3000 in the config schema and then observe UI-vs-collab port collision in testing.
**Current text:** "ok start (collab) uses port 0 (kernel allocation) as today. Not exposed via launch.json." (evidence/launch-json-and-port.md line 85-86); "collab binds port (kernel)" (§5 P6 line 108); "acquireServerLock → port:0 → listen → updateServerLockPort" (§9 Architecture Overview)
**Evidence:** `packages/cli/src/config/schema.ts:17` — `port: z.number().int().min(1).max(65535).default(3000)`. Default is 3000, not 0. `packages/cli/src/commands/start.ts:222` calls `httpServer.listen(config.server.port, ...)` — uses configured default directly.
**Status:** CONTRADICTED (current code) + INCOHERENT (FR-1.1 says UI binds 3000; no corresponding FR changes collab default)
**Suggested resolution:** Add an explicit FR: "change `ConfigSchema.server.port` default from 3000 to 0 (or move the 3000 default to `ui.port`)." Update §8 "Current state" to clarify the today-state is "ok start defaults to port 3000." Update evidence/launch-json-and-port.md to correct the "as today" claim.

---

### [H] F-003: FR-3.1 misdescribes editor config paths — Cursor writes to `.cursor/mcp.json`, NOT project-root `.mcp.json`

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 FR-3.1 acceptance criteria
**Issue:** FR-3.1 AC says "Non-TTY: writes `.mcp.json` (project root — Claude + Cursor) + per-editor paths for Windsurf + VS Code." But `packages/cli/src/commands/editors.ts:42-48` shows Cursor writes to `.cursor/mcp.json`, not project-root `.mcp.json`. Only Claude uses `.mcp.json` at project root. VS Code uses `.vscode/mcp.json`. Windsurf uses `~/.codeium/windsurf/mcp_config.json` (user-global, not project-local).
**Current text:** "Non-TTY: writes `.mcp.json` (project root — Claude + Cursor) + per-editor paths for Windsurf + VS Code."
**Evidence:**
- `editors.ts:36` Claude: `join(cwd, '.mcp.json')` — project-root
- `editors.ts:44` Cursor: `join(cwd, '.cursor', 'mcp.json')` — project-local but separate file
- `editors.ts:52` VS Code: `join(cwd, '.vscode', 'mcp.json')` — project-local
- `editors.ts:60` Windsurf: `join(home, '.codeium/windsurf/mcp_config.json')` — user-global, scope:'global'
**Status:** CONTRADICTED
**Suggested resolution:** Rewrite FR-3.1 AC to: "Non-TTY writes to: `.mcp.json` (Claude, project root), `.cursor/mcp.json` (Cursor), `.vscode/mcp.json` (VS Code), `~/.codeium/windsurf/mcp_config.json` (Windsurf, user-global)."

---

### [H] F-004: Evidence files contradict each other on how Claude Code's `preview_start` port routing works

**Category:** COHERENCE
**Source:** L1 (cross-artifact contradiction) / L4 (evidence-synthesis fidelity)
**Location:** evidence/current-state.md vs evidence/launch-json-and-port.md — both feed the same spec
**Issue:** Two evidence files assert different mental models of Claude Code's `preview_start`:

1. `evidence/current-state.md:17` (also parent-project-level evidence): "Port `3000` is hardcoded in `scaffoldLaunchJson` (init.ts:145) — this is Claude Code's preview\_start port, not the server's actual port. Claude Code intercepts requests on 3000 and proxies to `ok start`'s actual listening port."
2. `evidence/launch-json-and-port.md:40`: "Claude Code expects the subprocess to listen on `port` and proxies its built-in preview browser pane to `localhost:<port>`. If the subprocess binds a different port, the preview pane connects to the wrong port and shows an error."

Model (1) says Claude Code has a proxy layer in front of an arbitrary `ok start` port. Model (2) says the subprocess MUST bind exactly `launch.json.port`. These can't both be true. The spec's design implicitly trusts model (2) (D-021 "matches existing launch.json port contract"), but the parent-project current-state.md evidence still carries model (1). A downstream reader landing on the wrong evidence file will build the wrong mental model.

Additionally, worldmodel-synthesis and evidence/launch-json-and-port.md both note that primary Claude Code preview_start docs 404'd (G2), so neither model is fully verified — both are inferred from secondary sources.
**Current text:** See above; identified across two evidence files.
**Status:** INCOHERENT (between evidence files); UNVERIFIABLE (primary docs 404'd)
**Suggested resolution:** Pick one model (the subprocess-binds-its-own-port model is the one the spec assumes) and mark the other evidence claim as stale/superseded. Add a VERIFY bullet to OQ-1.4 capturing "which model is correct — preview_start proxy vs direct port bind." This is what the implementation test against a real Claude Code install will answer.

---

## Medium Severity

### [M] F-005: `standalone.ts` does NOT currently wire Hocuspocus `onConnect`/`onDisconnect` hooks — evidence claim is wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/ui-client-tracking.md line 24 ("CONFIRMED — `standalone.ts` wires these hooks to reconciliation / shadow repo")
**Issue:** The evidence file asserts as CONFIRMED that `standalone.ts` wires `onConnect`/`onDisconnect` to subsystems. Grep across `packages/server/src/` finds zero matches for `onConnect` or `onDisconnect` in server code. The API surface exists in Hocuspocus (`node_modules/@hocuspocus/server/dist/index.d.ts:464,480`) but Open Knowledge doesn't currently consume it. This doesn't break the spec's design (the idle-shutdown primitive is NEW, so wiring these hooks for the first time is fine), but it does mean the "load-bearing semantics match" claim in evidence/ui-client-tracking.md §"Why (d) is the right choice" is hollow — there's no pre-existing hook plumbing for the new primitive to ride on.
**Current text:** "Hocuspocus WebSocket (`/collab`) handles CRDT sync + provides `onConnect`/`onDisconnect` hooks for client counting (CONFIRMED — `standalone.ts` wires these hooks to reconciliation / shadow repo; adding idle-shutdown tracking is additive)."
**Evidence:** `grep -rn "onConnect\|onDisconnect" packages/server/src/` returns zero matches at baseline commit 5dab8683. Hocuspocus hooks exist at `Hocuspocus.ts:108` (`onConnect: this.configuration.onConnect`) but OK doesn't configure them.
**Status:** CONTRADICTED (evidence overstates "CONFIRMED")
**Suggested resolution:** Amend evidence to: "Hocuspocus exposes `onConnect`/`onDisconnect` hooks (Hocuspocus.ts:108, node_modules/@hocuspocus/server/dist/index.d.ts:464,480); OK does not currently consume them. The new idle-shutdown primitive (FR-1.6) will be the first consumer." This makes the work more load-bearing, not less.

---

### [M] F-006: OQ-A7 is partially pre-answered by codebase inspection — DirectConnection tracking is more nuanced than stated

**Category:** FACTUAL + COHERENCE
**Source:** T2 (OSS source read: @hocuspocus/server)
**Location:** §11 OQ-A7; §12 A7; §14 risks table; SPEC §6 FR-1.6
**Issue:** OQ-A7 asks whether `openDirectConnection` fires `onConnect`/`onDisconnect`. Code inspection of `@hocuspocus/server/src/DirectConnection.ts:26,48,73` and `Hocuspocus.ts:593-611` and `Document.ts:152-154` reveals three concrete facts:

1. `new DirectConnection()` increments `directConnectionsCount` via `addDirectConnection()` — BUT does NOT fire `onConnect` hook.
2. `DirectConnection.disconnect()` fires `onDisconnect` hook — BUT **only when** `getConnectionsCount() === 0` AND `saveMutex.isLocked() === false`. It's conditional, not unconditional.
3. `Document.getConnectionsCount()` returns `connections.size + directConnectionsCount` — i.e., polling-based checks (vs. hook-based) DO see DirectConnections.

So OQ-A7's true answer is: "DirectConnections are visible via `getConnectionsCount()` polling but invisible via `onConnect` hooks; `onDisconnect` is only fired when the DirectConnection was the last connection." This means a hook-based idle-shutdown would be blind to DirectConnection opens, leading to the exact false-idle risk OQ-A7 worries about. A polling-based idle-shutdown (e.g., `setInterval(() => check(hocuspocus.documents.get(doc).getConnectionsCount()))`) would be accurate.

The spec presents OQ-A7 as fully open and P0-blocking for FR-1.6, but the investigation work is already done — just needs to be transcribed from Hocuspocus source into the spec. This would downgrade OQ-A7 from "needs investigation" to "design decision: polling-based `getConnectionsCount` check per-doc."
**Current text:** OQ-A7: "Does Hocuspocus' `onConnect`/`onDisconnect` client-count reflect `openDirectConnection` usage (used by CC1 broadcaster + agent writes) or only WebSocket clients?"
**Evidence:**
- `node_modules/@hocuspocus/server/src/DirectConnection.ts:26` — constructor calls `addDirectConnection()` (no hook)
- `DirectConnection.ts:69-82` — `onDisconnect` hook fires **only** when `getConnectionsCount() === 0`
- `Document.ts:152-154` — `getConnectionsCount` sums both pools
- `server-observer-extension.ts:5` comment (existing OK code): "This avoids openDirectConnection's connection-count increment" — OK maintainers already know openDirectConnection increments the count
**Status:** UNVERIFIABLE-UNTIL-READ (code has the answer; spec doesn't reflect it)
**Suggested resolution:** Rewrite OQ-A7 answer based on codebase inspection. Recommend polling-based `getConnectionsCount()` check (per-doc aggregation) as the primary signal, with `onConnect`/`onDisconnect` hooks as supporting breadcrumbs. Move OQ-A7 from "Open" to "Resolved via code inspection" with a D-028-ish decision. Downgrade the "High impact" risk row in §14 accordingly.

---

### [M] F-007: D-003 §D4-supersession conflates "embed Hocuspocus internally" with "detached-spawn sibling"

**Category:** COHERENCE + FACTUAL
**Source:** T1 (cited research report)
**Location:** §1 Problem Statement; §10 D-003; §11 (noting "answers Open Question #1")
**Issue:** The spec claims D-003 "answers §D4's Open Question #1" with the detached-spawn rationale. Re-reading `reports/zero-config-bunx-cli-packaging/REPORT.md` Open Question #1:

> "Should the `mcp` command also be able to auto-start Hocuspocus internally (embedding it in the MCP process) for environments where running a separate `start` process isn't practical?"

This question asks about **embedding** Hocuspocus IN the MCP process. The spec's answer is **detached sibling spawn**, not embedding. These are different architectures. The spec's answer addresses the **spirit** of OQ #1 (cases where no separate `start` is practical) but not the specific mechanism it proposed.

§D4's stated concern was narrower: "Having `mcp` auto-start the collab server would fight the stdio lifecycle model (Claude Code kills child processes on session end — taking the server with it)." Detached spawn does neutralize this concern — so the supersession IS defensible.

But the framing "answers Open Question #1" is slightly off. The answer is "We don't embed (OQ #1's specific suggestion); we detach-spawn (a different path §D4 didn't consider)." Both are reasonable, but future readers should understand the distinction so nobody tries to re-open §D4 by proposing embedding.
**Current text:** D-003: "Detached-spawn neutralizes §D4's kill-on-session-end concern; answers Open Question #1"
**Evidence:** `reports/zero-config-bunx-cli-packaging/REPORT.md` lines 162, 306 — §D4 text about stdio lifecycle; Open Question #1 explicitly asks about "embedding it in the MCP process."
**Status:** INCOHERENT (framing)
**Suggested resolution:** Reframe D-003's rationale: "Detached-spawn is a third path §D4 did not evaluate — neither 'always-separate `start`' (§D4's chosen posture) nor 'embed Hocuspocus in MCP process' (§D4's Open Question #1 suggestion). Sibling detached spawn retains §D4's lifecycle separation while answering OQ #1's 'what if separate start isn't practical?' need."

---

### [M] F-008: A2 / XQ3 "MCP clients ignore unknown fields in structuredContent" is not clearly documented in MCP 2025-11-25

**Category:** FACTUAL / UNVERIFIABLE
**Source:** T3/T4 (web)
**Location:** §12 A2; §14 risks "MCP response schema reject"
**Issue:** The spec asserts A2 with HIGH confidence: "MCP clients ignore unknown fields in `structuredContent` (MCP spec 2025-11-25)." The MCP 2025-11-25 spec at `https://modelcontextprotocol.io/specification/2025-11-25/server/tools` discusses structuredContent and optional outputSchema validation — but does NOT explicitly state "clients ignore unknown fields." Without an `outputSchema` declared on a tool, clients SHOULD validate (per spec) but there's no explicit "unknown fields must be ignored" clause. An active SEP (SEP-1624) is being discussed to CLARIFY structuredContent usage — so the field's behavior across implementations is not yet stable consensus.

Effect: A2 should be downgraded to MEDIUM confidence. The "100% backward compat" expectation hinges on implementations choosing permissive parsing (which is common in practice for JSON content with no explicit schema, but not formally required).
**Current text:** A2: "MCP clients ignore unknown fields in `structuredContent` (MCP spec 2025-11-25)" (HIGH)
**Evidence:** https://modelcontextprotocol.io/specification/2025-11-25/server/tools — no explicit "clients ignore unknown fields" clause for structuredContent. https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1624 (SEP-1624) shows structuredContent-vs-content usage is still being clarified.
**Status:** UNVERIFIABLE (stronger claim than spec supports)
**Suggested resolution:** Downgrade A2 from HIGH to MEDIUM. Amend wording to: "No output schemas are declared for OK tools, so clients parsing `structuredContent` without strict validation should accept unknown fields. Confirmed via FR-2.5 smoke-test across the 3 target clients." Keep the smoke-test action item.

---

### [M] F-009: §9 "Failure modes" table claim about Claude Code preview_start tolerating exit-0 subprocess is unverified

**Category:** FACTUAL / COHERENCE
**Source:** L2 (confidence-prose alignment)
**Location:** §9 Failure modes, final row ("Claude Code's `preview_start` spawns `ok ui` after MCP already spawned"); OQ-1.4
**Issue:** OQ-1.4 is marked "Open (implementation-deferred)" — i.e., we don't know whether Claude Code's preview_start treats a rapid exit-0 subprocess as success or error. Yet §9's failure-modes table asserts the recovery is "`ok ui` exits 0; preview pane connects to port 3000 regardless" — presenting the fallback as known-good. The parenthetical "(if preview pane tolerates exit-0 subprocess — see OQ-1.4)" hedges weakly.

§5 P1 line 67 is more confident: "Claude Code's preview pane connects to port 3000 regardless (port is fixed by launch.json, not pid-tied)." This overstates certainty for an unverified claim. The user journey leans on A5 (MEDIUM confidence) as if it were HIGH.

If A5 turns out false (Claude Code treats exit-0 subprocess as error), D-022's "exit 0 on lock collision" breaks the Claude Code preview pane path — which is the most-used path.
**Current text:** §5 P1: "Claude Code's preview pane connects to port 3000 regardless (port is fixed by launch.json, not pid-tied)."; §9 Failure modes: "preview pane connects to port 3000 regardless"
**Evidence:** OQ-1.4 P0 priority "No — Open (implementation-deferred)"; A5 MEDIUM confidence "Claude Code current version's preview_start ... tolerates the target process exiting code 0 (lock-collision path)"
**Status:** INCOHERENT (certainty mismatch between hedged OQ and confident prose)
**Suggested resolution:** Soften §5 P1 wording: "If Claude Code's preview_start tolerates subprocess exit-0 (A5 — verify at implementation time), the preview pane connects to port 3000 regardless." Also elevate OQ-1.4 from "No — implementation-deferred" to "P0 blocking before merge" since the Claude Code journey is the primary one.

---

### [M] F-010: Server-lock shape in §1 drops `startedAt` — inconsistent with NG10 and FR-1.1

**Category:** FACTUAL
**Source:** T1 (own codebase) / L1 (internal inconsistency)
**Location:** §1 Problem Statement line 19
**Issue:** §1 describes `server.lock` as `{pid, port, hostname, worktreeRoot}` (4 fields). NG10 lists it as `{pid, port, hostname, startedAt, worktreeRoot}` (5 fields). FR-1.1 says `ui.lock` contains `{pid, port, hostname, startedAt, worktreeRoot}`. Actual `ServerLockMetadata` in `packages/server/src/server-lock.ts:19-26` has 5 fields: `{pid, hostname, port, startedAt, worktreeRoot}`. The §1 summary is missing `startedAt`.
**Current text:** "`<contentDir>/.open-knowledge/server.lock` (`{pid, port, hostname, worktreeRoot}`)"
**Evidence:** `packages/server/src/server-lock.ts:19-26` — `ServerLockMetadata { pid; hostname; port; startedAt; worktreeRoot }`
**Status:** CONTRADICTED (by own codebase)
**Suggested resolution:** Add `startedAt` to the §1 description: `{pid, hostname, port, startedAt, worktreeRoot}`.

---

### [M] F-011: D-011 is marked "Superseded by D-020" but remains in the Decision Log without a supersession banner

**Category:** COHERENCE
**Source:** L1 (internal structure)
**Location:** §10 D-011
**Issue:** D-011 says `.claude/launch.json` updated to start BOTH UI + collab. D-020 says single UI entry, UI only. The row for D-011 notes "Superseded by D-020 (single UI entry)" in the Implications column, but the row itself remains in the decisions table with a DIRECTED resolution. A reader skimming could miss the implications column and think both D-011 and D-020 are active. Convention should be: strike-through D-011 or move it to an "Archived decisions" section, or at minimum put the supersession note in the Rationale column.
**Current text:** "D-011 | `.claude/launch.json` updated to start both UI + collab | T | **DIRECTED** | No | Claude Code preview_start | PROJECT TQ7 | Superseded by D-020 (single UI entry)"
**Status:** INCOHERENT (structural)
**Suggested resolution:** Either (a) mark D-011's status column as "SUPERSEDED" rather than "DIRECTED", (b) move to an Archived subsection, or (c) strike through the row. Pick one and apply consistently.

---

## Low Severity

### [L] F-012: Line references for init.ts hardcodes are off-by-one

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 Known gaps ("init.ts:145 hardcode"); D-021 evidence ("init.ts:145 hardcode"); FR-1.8 ("init.ts:138-190")
**Issue:** The `port: 3000` hardcode is at `init.ts:144`, not `init.ts:145`. The `scaffoldLaunchJson` function spans `init.ts:138-190`, which is correct. Minor off-by-one in the port-line reference only.
**Current text:** "init.ts:145 hardcode" (used in multiple places)
**Evidence:** `packages/cli/src/commands/init.ts:144` — `port: 3000,`
**Status:** CONTRADICTED (minor)
**Suggested resolution:** Change "init.ts:145" references to "init.ts:144" throughout spec + evidence files.

---

### [L] F-013: evidence/current-state.md also cites "init.ts:555-556" for the `['claude']` default — actual lines 554-556

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/current-state.md:14 ("Non-interactive fallback — defaults to `['claude']` (init.ts:555-556)")
**Issue:** The else-branch defaulting to `['claude']` begins at `init.ts:554` with the `else {` keyword; the assignment is on line 556. Spec says 555-556, code is 554-556.
**Evidence:** `packages/cli/src/commands/init.ts:554-556`
**Status:** CONTRADICTED (minor)
**Suggested resolution:** Update line range to 554-556.

---

### [L] F-014: init.ts:530-541 editor detection range is a 1-off

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/current-state.md:13; PROJECT.md referenced similarly
**Issue:** The interactive prompt editor-detection block spans `init.ts:525-540` (choices construction) or more broadly `521-546` (including the multiselect call). The "530-541" range is approximate but not precise.
**Evidence:** `packages/cli/src/commands/init.ts:521-546`
**Status:** CONTRADICTED (minor)
**Suggested resolution:** Optional — amend to exact range or accept approximate. Not material.

---

### [L] F-015: G4 / G5 measurability is asserted but NG9 explicitly defers telemetry infrastructure

**Category:** COHERENCE
**Source:** L1 (cross-section alignment)
**Location:** §2 Goals (G1, G4, G5); §3 NG9; §7 M3
**Issue:** G4 says "3+ `ok mcp` spawns in different `contentDir`s each produce live `{server,ui}.lock` pairs" (measurable via manual). G5 says "zero processes after idle-shutdown threshold passes" (measurable via ps). G1 says "Measurable: time-to-first-successful-tool-call from editor open, with zero shell activity." NG9 explicitly defers telemetry infrastructure. M1 in §7 is marked DEFERRED per NG9 but M3 (orphan process count) is listed with target=0 and no instrumentation-deferred note — implying it's manually measured, which is fine, but the spec doesn't state this distinction explicitly. A reader might wonder why M1 is deferred but M3 is not.
**Current text:** G1 claims "Measurable: time-to-first-successful-tool-call from editor open" but offers no mechanism absent telemetry.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Add a note: "Goals G1/G4/G5 are measurable via manual testing (no telemetry infra per NG9); the acceptance-criteria checklists in §13 are the measurement mechanism." Optional polish.

---

## Confirmed Claims

The following claims were independently verified against the codebase / docs and check out:

- **preview-url.ts helper shape** — confirmed at `packages/cli/src/mcp/tools/preview-url.ts:18-23,52-90`. Returns `{url, source: 'env'|'lock'|'config'}` exactly as described. D-015/D-016 line refs (33-56 / 61,70,86) are accurate.
- **3 tools emit `previewUrl` today** — `write-document.ts`, `edit-document.ts`, `get-preview-url.ts` (verified via grep). Matches spec baseline.
- **Default editor in non-TTY is `['claude']`** — `init.ts:556`. Matches claim.
- **4 editor targets** — Claude, Cursor, VS Code, Windsurf at `editors.ts:32-65`. Matches §6 FR-3 scope.
- **server.lock shape (ServerLockMetadata)** — 5 fields including startedAt at `server-lock.ts:19-26`. Matches NG10 and FR-1.1 descriptions (only §1 summary drops startedAt — F-010).
- **ServerLockCollisionError, isProcessAlive, updateServerLockPort** — all exist as described at `server-lock.ts:28-41,58-102,109-138` and `process-alive.ts`. D-012 and FR-1.4 behavior descriptions match.
- **Vite plugin (`bun run dev`) participates in server.lock** — `packages/app/src/server/hocuspocus-plugin.ts:107-130` — acquires server lock, releases on signals. FR-1.12 concerns are grounded.
- **`ok mcp` does NOT currently spawn `ok start`** — `packages/cli/src/commands/mcp.ts:32-74` has no `spawn`/`child_process` import. Evidence and spec correct on this.
- **Claude Code `.claude/launch.json` runtimeArgs = `['open-knowledge', 'start']`, port 3000** — confirmed at `init.ts:140-145`. Matches spec.
- **§D4 concern text** — `reports/zero-config-bunx-cli-packaging/REPORT.md:162` — "Having `mcp` auto-start the collab server would fight the stdio lifecycle model..." Verified.
- **Open Question #1 text** — `reports/zero-config-bunx-cli-packaging/REPORT.md:306` — "Should the `mcp` command also be able to auto-start Hocuspocus internally (embedding it in the MCP process)..." Verified. (See F-007 for framing concern.)
- **nodejs/node#5614 is about Windows detached-spawn bugs** — verified via web fetch. Claim in NG5 is accurate.
- **Hocuspocus onConnect/onDisconnect hooks exist as Extension APIs** — `node_modules/@hocuspocus/server/dist/index.d.ts:464,480`. Primitive exists even if OK doesn't currently use it (F-005).
- **DirectConnection increments connection count** — `node_modules/@hocuspocus/server/src/DirectConnection.ts:26,48`. `Document.getConnectionsCount()` includes `directConnectionsCount` at `Document.ts:152-154`. Relevant to OQ-A7 (see F-006).
- **SIGTERM cross-process via `process.kill(pid, 'SIGTERM')` works on macOS and Linux** — standard Node.js behavior; D-017's mechanism is sound.
- **`doc-hash.ts` parser exists at `packages/app/src/lib/doc-hash.ts`** — D-015 cross-reference valid; `hashFromDocName` decodes per-segment via `decodeURIComponent`, matching preview-url.ts encoding.
- **Sibling artifacts exist**: `stories/init-and-project-switching/STORY.md`, `specs/2026-04-11-electron-desktop-app/SPEC.md`, `projects/zero-ceremony-resume/PROJECT.md` — all present at claimed paths.
- **Claude Code primary docs 404** — `https://code.claude.com/docs/en/preview` returned 404 (verified this audit session, matches evidence file claims).

---

## Unverifiable Claims

- **Claude Code `preview_start` precise behavior** — primary docs 404; behavior is inferred from secondary Medium article + GitHub issue. OQ-1.4 correctly acknowledges this.
- **Claude Code accepts exit-0 subprocess from preview_start** — A5 MEDIUM confidence is appropriate (F-009 flags overclaim in surrounding prose).
- **MCP clients will ignore unknown fields in structuredContent** — A2 claim is stronger than the MCP 2025-11-25 spec supports (F-008).
- **Detached-spawn p50 ≤ 3s with bunx cache warm** — A6 MEDIUM; untested here, reasonable assumption.
- **Field crash telemetry / M1 terminal-free resume rate** — NG9 correctly defers this; no measurement without telemetry infra.

---

## Audit coverage notes

- Read: SPEC.md (end-to-end), both local evidence files, both project-level evidence files, superseded report (full).
- Verified against code: `packages/cli/src/commands/{init,start,mcp}.ts`, `packages/cli/src/commands/editors.ts`, `packages/cli/src/mcp/tools/` (counting + preview-url + write-document sampling), `packages/cli/src/config/schema.ts`, `packages/server/src/server-lock.ts`, `packages/server/src/server-observer-extension.ts`, `packages/server/src/standalone.ts` (hook wiring check), `packages/app/src/server/hocuspocus-plugin.ts`, `packages/app/src/editor/provider-pool.ts`, `packages/app/src/lib/doc-hash.ts`.
- Verified against OSS: `node_modules/@hocuspocus/server/src/{DirectConnection,Hocuspocus,Document,ClientConnection}.ts`; type defs in `dist/index.d.ts`.
- Web-verified: nodejs/node#5614 issue, MCP 2025-11-25 spec page, MCP SEP-1624 issue (via search), Claude Code preview docs (404 verified).
- Did not verify: PROJECT.md parent evidence dependencies transitively; Electron spec adjacent; stories/init-and-project-switching Part B.
- Deliberately did not challenge: the core decomposition rationale (3 stories as a coherent bundle) — looks consistent with product-level PROJECT.md.
