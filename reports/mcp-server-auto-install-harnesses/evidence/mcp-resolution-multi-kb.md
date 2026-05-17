# Evidence: MCP Resolution Across Multi-KB / Session Directory Changes

**Dimension:** Can a single MCP subprocess serve multiple KBs across mid-session directory changes? How do harnesses handle multi-root workspaces and `roots/list_changed`?
**Date:** 2026-04-18
**Sources:** modelcontextprotocol.io spec, code.claude.com, docs.cursor.com, developers.openai.com/codex, github.com/anthropics/claude-code issues, github.com/openai/codex issues, forum.cursor.com, github.com/microsoft/vscode, github.com/anysphere/cursor-wiki

**Vendor-bias flag:** Each harness is the vendor for its own behavior. Primary sources are vendor-authored docs + open GitHub issues.

---

## Bottom-line answer

**No harness currently supports mid-session "switch to a different project" for MCP purposes.** Startup cwd / workspace is **hard-bound** for the session's lifetime.

| Harness | Mid-session cwd switch? | Multi-root workspace? | Sends `roots/list_changed`? |
|---|---|---|---|
| Claude Code terminal | **NO** — security-constrained to child dirs only; `/add-dir` adds, doesn't switch | YES (via `/add-dir`) | **Yes** (inferred from VSCode-lineage behavior) |
| Claude Code Desktop (Code tab) | NO (same config as CLI) | Same as CLI | Same |
| Claude Cowork | **NO** — mid-session folder-add was REMOVED ~Feb 8-9 2026 (regression) | No UI to add folders mid-session anymore | N/A (no dynamic folders) |
| Codex terminal | **NO** — `/add-dir` feature requested ([#11747](https://github.com/openai/codex/issues/11747)) but not shipped; `/cwd` command also requested ([#12464](https://github.com/openai/codex/issues/12464)) | Partial via `--add-dir` at startup | UNCERTAIN |
| Codex desktop | Same as CLI | Same | Same |
| Cursor CLI + Desktop | **NO** — workspace fixed at launch | **YES** (multi-root workspaces, VS Code-inherited) | **NO** — `list_changed: false` in Cursor's ClientCapabilities ([forum #77248](https://forum.cursor.com/t/mcp-client-does-not-support-roots-list/77248)) |

**Parallel sessions (different harnesses, different KBs)** = **YES, works naturally** — separate MCP subprocesses, separate `server.lock` files per KB, no coordination needed.

---

## Findings

### Finding 1: Claude Code CLI — no mid-session cwd switch; `/add-dir` is add-only
**Confidence:** CONFIRMED
**Evidence:** [anthropics/claude-code issue #1628](https://github.com/anthropics/claude-code/issues/1628) — open FR; [ClaudeLog --add-dir guide](https://claudelog.com/faqs/--add-dir/)

> "Claude Code restricts directory changes for security reasons, only allowing changes to child directories of the original working directory for the session."

`/add-dir` slash command exists and was added in v1.0.18:
- **Adds** a directory to the workspace — does NOT switch the active cwd
- Makes additional directories accessible to Claude's tools
- CLI equivalent: `claude --add-dir /path/to/other/project`

**Implication for MCP:** The MCP subprocess's `process.cwd()` remains the startup directory forever. If user starts `claude` in `~/kb1` and runs `/add-dir ~/kb2`, the MCP subprocess still has `cwd = ~/kb1`. The additional directory is a Claude-level concept, not something that re-spawns or re-initializes MCP servers.

**CLAUDE.md note:** `CLAUDE.md` files are NOT automatically read from directories added via `--add-dir` ([issue #3146](https://github.com/anthropics/claude-code/issues/3146)).

### Finding 2: Claude Code `/add-dir` does NOT emit `roots/list_changed` (CORRECTED 2026-04-18 post-source-audit)
**Confidence:** CONFIRMED (source-level audit of `@anthropic-ai/claude-code@2.1.114` binary)
**Evidence:** See [claude-code-roots-source-audit.md](claude-code-roots-source-audit.md) Finding 3

**Initial inference was WRONG.** Source audit confirms:
1. Claude Code declares `roots` capability as `{}` (NOT `{listChanged: true}`) — schema rejects list_changed notifications
2. `roots/list` returns exactly one entry: `file://${originalCwd}` (session-startup cwd, captured once in `m_.originalCwd`, never reassigned)
3. `/add-dir` updates only internal `additionalWorkingDirectories` Map + persists to `localSettings` — **zero call path to `sendRootsListChanged()`**
4. The `sendRootsListChanged()` method exists on the bundled SDK class but has **zero application-level callers**

**Implication for PR #207:** Claude Code always returns exactly one root. PR #207's `MULTIPLE_ROOTS_ERROR` path is **unreachable** from Claude Code. The single-root path (`return roots[0]`) always wins. `/add-dir` is invisible to MCP — tool calls still route to the session-startup project only.

### Finding 3: Cursor multi-root workspaces — spawns multiple MCP instances, not one
**Confidence:** CONFIRMED (bug report)
**Evidence:** [forum.cursor.com #144003](https://forum.cursor.com/t/mcp-multi-root-workspace-causes-duplicate-mcp-server-initialization-4x-createclient-actions/144003)

> "When using a multi-root workspace configuration with 4 workspaces, the MCP client initialization triggers 3 simultaneous CreateClient actions"

Cursor's multi-root implementation spawns **N MCP instances for N workspace roots**, not one instance with multiple roots. This is documented as a bug (initialization happens 3x instead of 4x due to a race condition) but the fundamental architecture is "per-root MCP instance."

**Implication:** PR #207's "exactly one advertised root" assumption works naturally for Cursor multi-root — each MCP instance sees exactly one root (its workspace folder). No multi-root-per-MCP to worry about.

### Finding 4: Cursor sets `list_changed: false` on roots capability
**Confidence:** CONFIRMED
**Evidence:** [forum.cursor.com #77248](https://forum.cursor.com/t/mcp-client-does-not-support-roots-list/77248)

> "Cursor's MCP implementation claims to have roots ClientCapabilities but without the list_changed feature, with list_changed set to false."

Cursor declares the `roots` capability during initialization but does NOT emit `notifications/roots/list_changed` when its workspace folders change.

**Implication:** PR #207's `invalidateRoots()` on `roots/list_changed` will fire correctly on Claude Code (where Claude sends the notification) but not on Cursor. On Cursor, the MCP's root cache stays stale across workspace changes. In practice, Cursor workspace changes require MCP re-init anyway (each root spawns a new MCP), so the stale cache never materializes.

### Finding 5: Codex CLI — no cwd switch, no `/add-dir`
**Confidence:** CONFIRMED
**Evidence:** [openai/codex #14025](https://github.com/openai/codex/issues/14025) ("Allow switching/adding working directories within a Codex CLI session"), [#12464](https://github.com/openai/codex/issues/12464) (`/cwd` command), [#11747](https://github.com/openai/codex/issues/11747) (`/add-dir` slash command)

> "Currently in Codex CLI the working directory is fixed after starting a session. If you want to switch to another project directory, you have to exit Codex and start it again."

Workarounds exist at startup only:
- `codex --cd <path>` — set working root at launch
- `codex --cd <main> --add-dir <aux1> --add-dir <aux2>` — expose additional access roots

No mid-session equivalent shipped. All three FRs are open.

### Finding 6: Claude Cowork — mid-session folder-add REMOVED
**Confidence:** CONFIRMED
**Evidence:** [anthropics/claude-code #25163](https://github.com/anthropics/claude-code/issues/25163)

Until approximately **February 8-9, 2026**, Cowork had a tool for Claude to request folder access mid-session — the UI presented a file browser to select and mount a folder. **This was removed** in a recent build. The agent no longer has a tool to request folder access, and no UI mechanism exists to add a folder to an in-progress session. **Users must end the session and start a new one**, losing all conversational context.

**Implication:** Cowork is effectively "one workspace folder per session." Our MCP, bridged from host via SDK proxy, sees the session-start mount and nothing more. PR #207's roots-based routing should work IF Cowork advertises the mounted folder as a root — UNCERTAIN but plausible given the rest of the VM-lineage behavior.

### Finding 7: MCP spec — `roots/list_changed` is standard; servers cache + invalidate
**Confidence:** CONFIRMED
**Evidence:** [modelcontextprotocol.io/specification/2025-06-18/client/roots](https://modelcontextprotocol.io/specification/2025-06-18/client/roots)

Protocol:
1. Client declares `roots.listChanged: true` at init (opt-in)
2. Server calls `roots/list` to get initial roots
3. When client's roots change, client MUST send `notifications/roots/list_changed` (if declared listChanged)
4. Server invalidates cache, re-fetches via `roots/list`

**Best practice for servers:** cache roots on first `roots/list` response; listen for `notifications/roots/list_changed`; invalidate on receipt; re-fetch lazily on next tool call. PR #207 implements this exact pattern in `server-discovery.ts`.

### Finding 8: VS Code is the reference implementation; Cursor forks but diverges
**Confidence:** CONFIRMED
**Evidence:** [anysphere/cursor-wiki — Adopting Multi-Root Workspace APIs](https://github.com/anysphere/cursor-wiki/blob/main/Adopting-Multi-Root-Workspace-APIs.md), [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

VS Code provides full `roots` + `listChanged` support. Cursor inherits most of VS Code's workspace-folder API surface but diverges on MCP: fewer dynamic-update features, multi-root spawns multiple MCP instances.

VS Code also supports `${workspaceFolder}` variable interpolation in MCP server configs — Cursor does NOT ([forum #74861](https://forum.cursor.com/t/allow-workspacefolder-in-mcp-project-configration/74861)).

### Finding 9: `${workspaceFolder}` variable interpolation support
**Confidence:** CONFIRMED
**Evidence:** [code.visualstudio.com/docs/copilot/reference/mcp-configuration](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration), [forum.cursor.com #74861](https://forum.cursor.com/t/allow-workspacefolder-in-mcp-project-configration/74861)

| Harness | `${workspaceFolder}` in MCP config args? |
|---|---|
| VS Code | YES |
| Cursor | NO (open FR) |
| Claude Code | NO (uses `${VAR}` env-var interpolation, different concept) |
| Codex | NO |

**Implication:** Can't use `"args": ["mcp", "--project", "${workspaceFolder}"]` as a universal project-pinning mechanism. Only VS Code resolves it.

---

## Multi-KB scenarios — verdict per pattern

### Pattern A: Parallel sessions on one machine (Claude Code in `~/kb1`, Cursor in `~/kb2`)

**WORKS.** Each harness spawns its own MCP subprocess. Each MCP reads its respective `<kb>/.open-knowledge/server.lock`. Each kicks off (or connects to) its own Hocuspocus instance. Totally independent — no coordination needed beyond each Hocuspocus holding its own server-lock.

**Confirmed by the existing architecture:** `server.lock` is per-contentDir; `server-lock.ts` enforces "one `createServer()` per content directory"; different contentDirs → different locks → no collision.

### Pattern B: Single session, user wants to "switch" to another KB

**DOES NOT WORK on any harness.** All 7 harnesses require ending the session and starting a new one. `/add-dir` (Claude Code) and `--add-dir` (Codex) add access to additional paths but don't re-home the session.

### Pattern C: Single session, multi-root workspace (Cursor with `~/kb1` + `~/kb2` as co-equal roots)

**WORKS — but spawns 2 MCP instances, one per root.** Each MCP gets one root (its workspace folder). Each MCP writes/reads its own Hocuspocus. User sees the KB of whichever root the agent's tool call is scoped to.

### Pattern D: Claude Code `/add-dir` to bring `~/kb2` into a session started in `~/kb1`

**Partially works.** Claude sees `~/kb2` as a workspace member. MCP spawned from startup cwd = `~/kb1` (still there). If Claude sends `roots/list_changed`, our MCP (via PR #207) would then see TWO roots (`~/kb1` + `~/kb2`) and throw `MULTIPLE_ROOTS_ERROR` unless the tool call passes explicit `cwd`.

**Workflow:** User does `/add-dir ~/kb2`, then calls an MCP tool. If our MCP is post-PR-#207, the tool error says "Multiple roots available; pass cwd explicitly." Agent passes `cwd: "~/kb2"` on the next attempt. Clunky but functional.

---

## Implications for the spec

1. **"One MCP per project" holds in practice.** Every harness binds an MCP subprocess to its startup cwd / one workspace root. Multi-root harnesses (Cursor) spawn MULTIPLE MCP instances, not one-serving-many.

2. **Parallel multi-KB works naturally.** The user's concern (multiple KBs on one machine) is already solved by the existing `server.lock`-per-contentDir architecture. No coordination work needed.

3. **PR #207's "exactly one root" assumption is architecturally correct** for the common case:
   - Claude Code CLI spawns MCP with `cwd = project`, Claude Code advertises `project` as the one root
   - Cursor spawns N MCPs for N multi-root workspaces; each gets its one root
   - Codex spawns MCP with `cwd = project`, advertises that

4. **The `MULTIPLE_ROOTS_ERROR` path in PR #207 is rare but reachable** (Claude Code `/add-dir` case). Users with tools that need it will need to pass `cwd` explicitly or tolerate the error message.

5. **Cursor's `list_changed: false` limits PR #207's dynamic invalidation.** Not a blocker — Cursor's multi-root model already spawns fresh MCPs for new workspaces, so stale-root-cache never materializes in practice.

6. **Cowork's removed mid-session folder-add is a regression-risk.** If Anthropic restores it (issue #25163 is open), behavior changes. Our spec should not depend on its current absence nor its future return — just follow roots as advertised.

7. **The "Claude Desktop has no project" problem from earlier research remains unique.** All other harnesses at least advertise one root; Claude Desktop Chat advertises zero. PR #207's error path is the UX for that specific case.

---

## Negative searches / NOT FOUND

- No harness shipped mid-session cwd-switch support (all FRs open across Claude Code + Codex + Cursor)
- No "universal MCP server pooling" pattern across harnesses — each harness owns its subprocess lifecycle independently
- No explicit docs on whether Claude Code's `/add-dir` triggers `roots/list_changed` notification — inferred from spec + VSCode-lineage
- No explicit docs on Cowork workspace-folder-to-MCP-roots mapping — UNCERTAIN whether Cowork advertises the mounted folder as a root via `roots/list`

---

## Gaps / still UNCERTAIN

- **Cowork roots advertisement:** Does Claude Cowork (the in-VM Claude Code) advertise its mounted workspace folder as a root via `roots/list`? Likely yes (VS Code-lineage Claude Code behavior) but unverified.
- **Claude Code `/add-dir` notification semantics:** Does `/add-dir` actually trigger `notifications/roots/list_changed`? Inferred yes; would take an empirical probe to confirm.
- **Codex `roots` capability:** Does Codex advertise roots capability at all? None of the sources explicitly confirmed. UNCERTAIN.
- **Whether `--add-dir` at Codex startup advertises ALL the dirs as roots or just one:** UNCERTAIN.

---

## Sources (all accessed 2026-04-18)

- [MCP Roots spec](https://modelcontextprotocol.io/specification/2025-06-18/client/roots)
- [VSCode MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [VSCode MCP configuration reference](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration)
- [Cursor MCP Extension API](https://cursor.com/docs/context/mcp-extension-api)
- [Anysphere cursor-wiki — Multi-Root Workspace APIs](https://github.com/anysphere/cursor-wiki/blob/main/Adopting-Multi-Root-Workspace-APIs.md)
- [forum.cursor.com #77248 — Cursor list_changed: false](https://forum.cursor.com/t/mcp-client-does-not-support-roots-list/77248)
- [forum.cursor.com #144003 — multi-root spawns N MCP instances](https://forum.cursor.com/t/mcp-multi-root-workspace-causes-duplicate-mcp-server-initialization-4x-createclient-actions/144003)
- [forum.cursor.com #74861 — `${workspaceFolder}` not supported in Cursor](https://forum.cursor.com/t/allow-workspacefolder-in-mcp-project-configration/74861)
- [Claude Code CLI mid-session cwd FR #1628](https://github.com/anthropics/claude-code/issues/1628)
- [Claude Code `/cd` command FR #19903](https://github.com/anthropics/claude-code/issues/19903)
- [ClaudeLog `--add-dir` guide](https://claudelog.com/faqs/--add-dir/)
- [Codex CLI cwd switch FR #14025](https://github.com/openai/codex/issues/14025)
- [Codex `/cwd` command FR #12464](https://github.com/openai/codex/issues/12464)
- [Codex `/add-dir` FR #11747](https://github.com/openai/codex/issues/11747)
- [Cowork mid-session folder FR #25163](https://github.com/anthropics/claude-code/issues/25163)
