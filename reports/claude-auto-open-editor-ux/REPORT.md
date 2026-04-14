# Auto-opening the Open Knowledge editor from MCP

**Date:** 2026-04-14

## Problem framing

Open Knowledge ships a local-first CRDT editor at `http://localhost:<port>` and an MCP server that Claude Code, Claude Desktop, and Cursor call to edit markdown. Two modes:

- **Co-authoring.** One user + one Claude on one doc. Want the editor open on that doc, live.
- **Batch runs.** Claude writes ten files; user watches. Want the editor focused on a declared "primary artifact" without tab-hijacking.

Today the agent has to tell the user "open http://localhost:3000." That instruction is easy to miss, goes stale when the port changes, and the user may not know to refresh. We want it to just happen.

## What MCP can actually do

**The core MCP spec (2025-06-18) has no primitive for opening a URL on the user's machine.** No `client/openURL`, no `launchBrowser` capability, no `{type: "open_url"}` content. Surveyed surfaces:

| Mechanism | Surface a URL? | Force-open? |
|---|---|---|
| Tool result `content: [{type:"text"}]` markdown link | Yes | No — user clicks |
| Tool result `resource_link` | Yes | No — host decides rendering |
| `elicitation/create` with `format:"uri"` | Yes (as *input* prompt) | No — asks user to type a URL |
| Server notifications | Progress/log/list-changed only | No |
| MCP Apps (`_meta.ui.resourceUri`, 2026-01-26 extension) | Renders an iframe in chat on tool-call | Only on tool-call, ephemeral, not on Claude Code CLI |

Two non-spec routes matter:

1. **OS-level launch from our own process.** The `open-knowledge mcp` stdio process is a regular Node/Bun process with FS access; it can call `open` (macOS), `xdg-open` (Linux), `start` (Windows), or the [`open`](https://www.npmjs.com/package/open) npm package. The MCP client never enters the loop. Bypasses MCP but works on every host.
2. **Delegated browser-control MCP servers** (Chrome DevTools MCP, Claude in Chrome, browser-tools-mcp). User must have them installed; opens a separate Chrome window, not an embedded panel.

## How hosts render a URL returned by a tool

| Host | URL in tool output | MCP Apps iframe | Embedded browser preview |
|---|---|---|---|
| Claude Code CLI | OSC 8 hyperlink (terminal-dependent); user clicks → system browser | Not supported (terminal) | None |
| Claude Desktop | Clickable link → system browser. Native preview panel bound to `.claude/launch.json` dev-server configs only | Inline iframe, ephemeral | Localhost-only, launch.json-configured |
| Cursor | Clickable link → system browser. Built-in browser (any URL) exists but opening is a user action | Inline iframe, v2.6+ | Any URL, requires explicit user action |
| Codex desktop | Clickable link → system browser | Not confirmed | None |

**Nowhere is a URL in a tool response auto-opened into an embedded panel.** Cursor's panel is richest but opt-in. Claude Desktop's refuses anything not in `launch.json`.

## Analogous patterns

- **Vite / CRA / Streamlit:** auto-open-on-start (once per process). HMR updates the already-open tab; never reopens.
- **GitHub Codespaces:** port-forward detection → toast with "Open in Editor" / "Open in Browser." Configurable via `devcontainer.json` with `onAutoForward: "notify" | "openBrowser" | "openPreview" | "silent"`.
- **Lovable / v0 / Bolt / Cursor composer:** persistent side-by-side preview pane. Updates in place; no focus change.
- **macOS `open -g`:** launch URL without stealing focus.
- **Browser same-URL dedup:** opening `http://localhost:5173/doc/x.md` twice focuses the existing tab — free focus-follow if URLs are deterministic.

Distilled principles:

1. Open once, update in place.
2. Toast over forced navigation.
3. Deterministic URLs per document so the browser's own dedup does focus-following.
4. Respect user opt-out — persist "don't auto-open again" for the repo.

## The focus-following problem

Three compatible strategies:

- **A: Single URL + in-app "currently editing" indicator.** Editor URL stable; opens once; inside the SPA an activity lane surfaces "Claude is writing `report.md`" with click-to-follow. Aligns with existing `Y.Map('activity')`.
- **B: Per-document URLs with agent-declared "primary artifact."** Open URL for first doc in burst, never re-navigate.
- **C: Background-only opens.** `open -g` so editor opens behind current window.

## Three concrete proposals

### Proposal 1 — Auto-launch once per MCP session, stable URL, background

- **Trigger.** First successful `write_document` / `edit_document` in a stdio session, after server lock confirms a live editor.
- **Surface.** MCP server shells out to `open -g http://localhost:<port>/?docName=<path>` via the `open` npm package. Background flag avoids focus theft. Tool response also emits `[Open editor →](…)` markdown link.
- **Scope.** Once per stdio session, keyed on session ID. Subsequent writes don't relaunch. Editor's existing file sidebar + CC1 `ch:'files'` signal handles in-app routing.
- **Per-host:** works on CLI, Desktop, Cursor (OS launch). Fallback link visible everywhere.
- **Failure modes:** user closed tab → relaunch once after presence drop + next write; server not running → disk-only mode, launch skipped with helpful message; port change → already tracked by `server.lock`; SSH/CI → `open` fails silently, link still there; opt-out via `~/.open-knowledge/config.yml: ui.autoOpen: never | background | foreground`.
- **Cost:** ~100 lines. No protocol changes.

### Proposal 2 — MCP App inline iframe as "live preview card"

- **Trigger.** Every write tool carries `_meta.ui.resourceUri`; MCP-Apps hosts render an iframe.
- **Surface.** Thin shell loads `http://localhost:<port>/?docName=<path>&mode=embed` via declared `_meta.ui.csp`. Compact view with "Pop out to full editor" button using `sendOpenLink`.
- **Scope.** Per tool-call, ephemeral (spec constraint). One card per write — acceptable for co-authoring, noisy for batch.
- **Per-host:** Claude Code CLI no-op (terminal); Desktop + Cursor 2.6+ render; Codex unconfirmed.
- **Failure modes:** batch writes fill chat; CSP may refuse cross-origin localhost inside `https://claude.ai` sandbox; size constraints force compact view.
- **Cost:** New `ui://` resource, embed-mode route in `packages/app`, `_meta.ui.*` wiring. ~1-2 weeks. Buys nothing for Claude Code CLI.

### Proposal 3 — Hybrid (recommended)

Tiered:

1. **Session start / first write.** Proposal 1's OS launch (background, stable URL, once-per-session).
2. **Every write.** Response carries markdown link + terse activity line (`"Claude edited report.md (line 42-58)"`).
3. **MCP App-supporting hosts only.** `_meta.ui.resourceUri` points to a tiny **status card** (~60px) — "Editor live at localhost:5173. Currently editing: report.md." — NOT a full editor embed. Sidesteps iframe persistence/CSP/sizing problems entirely.

**Surface matrix:**

| Host | Primary | Secondary | Tertiary |
|---|---|---|---|
| Claude Code CLI | OS-launched browser (bg) | OSC 8 hyperlink | — |
| Claude Desktop | OS-launched browser (bg) | Clickable link | Status MCP App card |
| Cursor | OS-launched browser (bg) | Clickable link | Status MCP App card |

## Comparison

| | P1 (OS launch) | P2 (MCP App editor embed) | P3 (hybrid) |
|---|---|---|---|
| Claude Code CLI | Works | N/A | Works |
| Claude Desktop | Works | Works (ephemeral) | Works, richest |
| Cursor | Works | Works (ephemeral) | Works, richest |
| Focus theft risk | Low (bg flag) | Zero (in-chat) | Low |
| Eng cost | Small | Medium-large | Small-medium |
| Batch-write noise | None (stable URL) | High (card per write) | Low |
| Works pre-MCP-Apps | Yes | No | Yes |

## Recommendation

**Ship Proposal 3.** Only option that works across all three hosts including Claude Code CLI today, respects focus-follow best practice, and degrades cleanly when MCP Apps or OS launch is unavailable.

Implementation order:

1. **Phase 1 (~1 week):** OS-launch-once-per-session behind `ui.autoOpen: background` default. Deterministic `http://localhost:<port>/?docName=<path>` URL. Opt-out + first-run prompt. Fallback markdown link every response.
2. **Phase 2 (~3 days):** Activity line in every write response.
3. **Phase 3 (~3-5 days):** Status-card MCP App (not editor embed) behind feature flag, Desktop + Cursor only.

Explicitly **not** recommended: Proposal 2's full-editor MCP App. Iframe ephemerality, CSP mess, size constraints make it worse than an already-open browser tab. Revisit when MCP Apps gains stable-persistent-pane semantics.

Non-goals: Cursor built-in browser panel auto-route (no MCP hook exists); Codex desktop (no browser panel); remote/cloud (out of scope — local-first).

## Key findings

1. **MCP has no URL-open primitive, core or extension.** Elicitation, sampling, and notifications can't force a client to navigate. MCP Apps can render an iframe but only on tool-call, ephemeral, and not in terminal hosts.
2. **The OS shell bypass is the only universal channel.** The `open-knowledge mcp` process can call `open -g` directly; works identically on Claude Code CLI, Claude Desktop, and Cursor because it never touches the MCP client.
3. **No host auto-routes an MCP-tool URL into its embedded browser panel.** Cursor's panel and Claude Desktop's launch.json preview both require user action or pre-declared launch configs.
4. **Focus-theft is solved by stable deterministic URLs + `open -g` + browser same-URL dedup**, not by clever MCP plumbing.
5. **The batch-writes problem dissolves** if the editor opens once per session to a stable URL and the already-shipped CC1 `ch:'files'` signal updates the in-app sidebar.

## Evidence

- `evidence/mcp-spec-elicitation.md`
- `evidence/mcp-spec-tools-result.md`
- `evidence/mcp-apps-spec.md`
- `evidence/host-url-rendering-behavior.md`
- `evidence/analogous-patterns.md`
