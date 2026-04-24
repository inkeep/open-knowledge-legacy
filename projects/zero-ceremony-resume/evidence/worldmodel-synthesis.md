# Worldmodel synthesis

TLDR: Per-root lockfile discovery is unclaimed-but-consistent across LSPs/Ollama/Hocuspocus. **Detached-spawn is canonical in Node.js** (`detached:true + stdio:'ignore' + unref()`). **MCP stdio spawning a sibling Node server is novel** — existing precedents (chrome-devtools-mcp, mobile-mcp) spawn foreign OS resources, not sibling Node servers. **Prior Open Knowledge research explicitly argued against MCP auto-spawning** — this bet supersedes that unless the user confirms otherwise. `get_preview_url` already surfaces URLs with typed provenance (`env|lock|config`); the "UI URL in responses" story is **extending existing partial coverage**, not inventing from scratch.

## Load-bearing observations

**O1. Open Knowledge's current posture is "discover, don't spawn."** `mcp.ts:32-74` has no `spawn` / `child_process` import; MCP connects to an existing Hocuspocus via lockfile or runs disk-only. `.claude/launch.json` is the only auto-start mechanism — Claude-Code-only.

**O2. **`get_preview_url`** already exists and surfaces URLs with provenance.** Returns `{previewUrl, previewUrlSource: 'env'|'lock'|'config'}`. `write_document` and `edit_document` also echo `previewUrl` in structured responses. Story 2's "UI URL in every response" is partial-already-done, not from-scratch.

**O6. Detached-spawn recipe is canonical.** `spawn(cmd, args, {detached: true, stdio: 'ignore'}); child.unref();` — all three pieces required, or the parent waits. Windows gotchas: [nodejs/node#5614](https://github.com/nodejs/node/issues/5614), [nodejs/node#51018](https://github.com/nodejs/node/issues/51018). macOS: `detached:true + stdio:'inherit'` broken since Node 0.12 ([nodejs/node#4348](https://github.com/nodejs/node/issues/4348)).

**O8. **`server-lock.ts`** already solves multi-project port isolation cleanly.** Per-contentDir lock, `port: 0` sentinel, `updateServerLockPort` ownership-guarded, `ServerLockCollisionError` on live-same-host PID, auto-replace on stale. No changes needed for Story 1's spawn path to handle multi-project.

**O9. Prior Open Knowledge research explicitly argued against MCP auto-starting Hocuspocus.** [reports/zero-config-bunx-cli-packaging/REPORT.md](../../../reports/zero-config-bunx-cli-packaging/REPORT.md) §D4: "Having mcp auto-start the collab server would fight the stdio lifecycle model (Claude Code kills child processes on session end — taking the server with it)." Recommendation at the time was `keep separate`. **This is the load-bearing tension for Story 1.** Detaching the spawn (O6) mitigates the specific "Claude Code kills child" concern, but the prior decision has not been explicitly revisited.

## Convergences

**C1.** Per-root lockfile discovery is unclaimed-but-consistent across LSP servers, Hocuspocus dev servers, and Ollama multi-instance. No contested design space.

**C2.** Detached-spawn canonical recipe is agreed across Node.js docs, Bun docs, every practitioner blog.

**C3.** MCP servers either discover backends (Open Knowledge today) or embed them in-process (filesystem-mcp, github-mcp, notion-mcp, mintlify-mcp — the dominant pattern). Sidecar-spawning MCPs are a minority.

**C4.** Tool-result URL surfacing converges on "structured content + plain text echo" — Open Knowledge's `textPlusStructured` pattern matches Mapbox, Amplitude, Figma MCP Apps.

**C5.** Three independent sources agree: an MCP stdio that spawns a backend should NOT take the backend down on stdio death. Detach + unref is the mechanism.

## Divergences

**D1 (load-bearing).** Auto-start philosophy:

- **Current code / prior §D4:** mcp stdio discovers; does NOT spawn. Keep separation.
- **User's bet / chrome-devtools-mcp / mobile-mcp / background-process-mcp:** MCP handshake alone should bring up backend. Precedent exists but manages foreign OS resources (Chrome, device sim, bash), not sibling Node servers.
- **Resolution:** the prior report's concern was "stdio death kills server." Detached spawn (O6) neutralizes that. Story 1 should explicitly supersede §D4 with the detached-spawn rationale.

**D3 (load-bearing).** Client lifecycle hooks vary:

- **Claude Code:** `launch.json` + `preview_start` builtin. Only MCP client with a true auto-start hook.
- **Cursor / Windsurf / Codex / VS Code:** no documented equivalent.
- **Implication:** "MCP handshake starts everything" is Claude-Code-specific TODAY. The hybrid model (client-launched preferred; MCP-stdio-spawns fallback) is the bet's answer; worldmodel confirms it's necessary, not optional.

**D4 (architectural).** MCP Apps iframe vs localhost browser as UI surface:

- **MCP Apps iframe:** renders inline in chat, ephemeral per message, cross-client. **Complex-editor-hostile** due to teardown (iframe destroyed on scroll/tab-switch, state lost).
- **Localhost browser panel (Claude preview / Cursor browser / external tab):** persistent, stateful, works with existing React app.
- **Bet decision:** user brief says "claude desktop browser pane or cursor browser pane" → localhost browser. MCP Apps is not on the table. CONFIRMED by user brief.

## Gaps / open research questions

**G1.** Does any MCP client fetch/follow `resource_link` URIs in tool results as a preview pane? MCP spec has the primitive but no "open in preview" verb. Whether Claude Desktop renders `type:"resource_link"` as clickable preview vs ignoring is undocumented.

**G2.** Claude Code's `preview_start` precise input schema and error surface is only documented by secondary sources — primary docs at `code.claude.com/docs/en/preview` returned 404 during this session. Whether `preview_start` can be invoked BY an MCP server (not just BY the agent via a tool-use-round-trip) is unknown.

**G3.** Can an MCP server detect that `preview_start` was already invoked by the client? Without this, an MCP-spawn-from-stdio path risks duplicating the server Claude Code's `preview_start` already launched.

**G5.** Cross-project/multi-root registry — Open Knowledge has per-root lock but no `~/.open-knowledge/servers.json`. **This is the sibling bet's territory** ([[stories/init-and-project-switching]] Part B), not this project's.

**G6.** Last-client-disconnect auto-shutdown policy is undefined for Open Knowledge. Relevant for Story 1: if MCP spawns a detached server and the IDE closes, does the server self-exit after idle timeout or run forever? Both are valid — this project must decide.

## Surprising findings (high salience)

**S1.** `get_preview_url` already returns typed source provenance. Story 2's "UI URL in responses" is extending partial coverage, not inventing.

**S3.** No direct precedent for "MCP stdio spawns a sibling Node server" — chrome-devtools-mcp and mobile-mcp spawn foreign OS resources (browsers, devices). Story 1 is mildly novel; risk indicator.

**S4.** Prior Open Knowledge report ([reports/zero-config-bunx-cli-packaging/REPORT.md §D4](../../../reports/zero-config-bunx-cli-packaging/REPORT.md)) explicitly argued against MCP auto-spawning. **Must be explicitly revisited in this project.** Not silently overridden.

**S5.** CC1 broadcaster (already shipped) could surface "backend-started" and "client-mounted" signals to an MCP stdio that participates in the `__system__` Y.Doc. Relevant for Story 1's "connect once up" logic — an alternative to polling the lockfile.

## Implications for the decomposition

1. **Story 1 must explicitly supersede §D4** with detached-spawn rationale. This is a load-bearing decision, not a side note.
2. **Story 1 must decide orphan-cleanup policy** (last-client-disconnect idle timeout vs heartbeat vs explicit kill on mcp exit). G6 frames the choices.
3. **Story 2 is scope-bounded by existing **`get_preview_url` — the work is generalizing the pattern to all docName-producing tool responses, not inventing the URL-surfacing mechanism.
4. **Story 3's GTM weight is higher than it looks** — without Cursor/Windsurf/VS Code MCP configs written by default, Story 1's hybrid spawn path only exercises for Claude Code users (the ones who already have `launch.json`). Story 3 is a precondition for Story 1 delivering its value to non-Claude clients.
5. **Windows platform support is a risk** (O6 gotchas). Either this project commits to Windows testing or scopes to macOS/Linux explicitly.
6. **MCP Apps iframe is OUT** per user brief. Localhost browser panel is the only UI surface considered.

## Pointers

- Source: worldmodel subagent invocation 2026-04-16 on "Zero-ceremony resume — MCP lifecycle + UI URL surfacing" (full transcript in background task output).
- Key cited reports: [[reports/zero-config-bunx-cli-packaging/REPORT]] §D4, [[reports/onboarding-multiproject-ux/REPORT]], [[reports/ai-coding-tools-embedded-browsers/REPORT]], [[reports/mcp-tool-interface-design-agent-performance/REPORT]].
- Key code: `packages/cli/src/commands/mcp.ts`, `packages/cli/src/commands/start.ts`, `packages/server/src/server-lock.ts`, `packages/cli/src/mcp/tools/get-preview-url.ts`.
- External: [MCP Tools spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [GitHub Issue #29315 — Claude Code preview URL field](https://github.com/anthropics/claude-code/issues/29315).
