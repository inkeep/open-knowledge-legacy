---
title: "launch.json runtimeArgs + port hardcode — investigation"
description: "Investigation of OQ-1.2 (launch.json runtimeArgs shape) and OQ-1.3 (port 3000 hardcode). Result: single launch.json entry pointing at `ok ui` (UI only); MCP stdio handles collab spawn separately. Port 3000 remains hardcoded but now applies to `ok ui`'s bind port, not `ok start`."
sources: packages/cli/src/commands/init.ts, https://medium.com/@dan.avila7/claude-code-desktop-has-a-built-in-preview-mcp-heres-how-it-works-774809ff676f, https://github.com/anthropics/claude-code/issues/29315
created: 2026-04-16
last-updated: 2026-04-16
baseline-commit: 5dab8683
type: synthesis
tags:
  - evidence
  - launch-json
  - claude-code
  - investigation
---

# launch.json runtimeArgs + port hardcode — investigation

**TLDR.** Claude Code's `preview_start("open-knowledge")` reads `.claude/launch.json` and spawns the `runtimeArgs` command, then proxies its preview browser pane to `localhost:<port>`. The hardcoded `port: 3000` in `init.ts:145` means Claude Code expects OK to listen on 3000. Post-split, `ok ui` should bind port 3000 by default (configurable); MCP stdio handles `ok start` (collab) spawn separately. One launch.json entry, one preview target = the UI.

## Detail

### Current `launch.json` entry scaffolded by init

```json
{
  "name": "open-knowledge",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["open-knowledge", "start"],
  "port": 3000
}
```

Source: `packages/cli/src/commands/init.ts:140-145` (CONFIRMED).

### How Claude Code's preview_start uses it

From secondary sources (primary docs 404'd during worldmodel investigation — G2):
- `preview_start("open-knowledge")` = launch the entry named `"open-knowledge"` from `.claude/launch.json`.
- Claude Code spawns `runtimeExecutable` with `runtimeArgs` as a subprocess.
- Claude Code expects the subprocess to listen on `port` and proxies its built-in preview browser pane to `localhost:<port>`.
- If the subprocess binds a different port, the preview pane connects to the wrong port and shows an error.

Source: [Claude Code Desktop has a built-in preview MCP (Medium, Mar 2026)](https://medium.com/@dan.avila7/claude-code-desktop-has-a-built-in-preview-mcp-heres-how-it-works-774809ff676f), [GitHub Issue #29315 — url field support](https://github.com/anthropics/claude-code/issues/29315).

### What the preview pane ACTUALLY needs

The preview pane renders a browser view. Browser view needs HTTP URL → UI (static React app). It does NOT need to see the WebSocket collab traffic. Collab traffic happens in the background between `HocuspocusProvider` (in the preview pane's JS) and Hocuspocus server.

**Therefore:** `preview_start` should launch `ok ui` — the static-asset server. `ok start` (Hocuspocus) is NOT a visible UI; it's an API + WebSocket endpoint. Putting it in `launch.json` is confusing (what would preview pane show? raw `/collab` 400 responses?).

### Post-split design

**launch.json entry (unchanged shape, updated args):**

```json
{
  "name": "open-knowledge",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["@inkeep/open-knowledge", "ui"],   // was: ["open-knowledge", "start"]
  "port": 3000
}
```

**`ok ui` binds port 3000 by default** (configurable via `--port` or config). This is a BREAKING CHANGE from current `ok start`'s port-0 default — but `ok ui` is new, so no compat break.

**`ok start` (collab) uses port 0** (kernel allocation) as today. Not exposed via launch.json.

**MCP stdio handles collab:**
- On handshake: read `server.lock` → if absent, spawn `ok start` detached → poll lock → connect.
- Parallel to Claude Code's `preview_start` launching `ok ui`.
- Two processes spawned from different parents (Claude Code → ok ui; MCP stdio → ok start), both coordinate via their respective lockfiles.

### Why one entry, not two or an aggregator

- **Two entries** (option c from SPEC): `preview_start("open-knowledge-collab")` vs `preview_start("open-knowledge-ui")`. Rejected: users don't want to pick; preview pane's job is "show me the UI," not "show me the raw collab API."
- **Aggregator** (option a): `["open-knowledge", "up"]` spawns both internally. Rejected: Claude Code tracks the top-level pid; if `ok up` terminates but spawned children survive (or vice versa), Claude Code's lifecycle assumptions break. Worldmodel A5 flagged this.
- **One entry pointing at UI** (chosen): simpler. Claude Code's preview pane targets the UI. MCP stdio manages collab separately via its own spawn path. Lifecycle responsibilities are cleanly separated.

### Port 3000 — is it still correct?

**YES** — for `ok ui`. Claude Code's preview pane needs a known port to connect to; `launch.json.port` is the contract. Hardcoding 3000 in init scaffold is fine; users who want a different port edit `launch.json` manually AND pass `--port` to `ok ui` via `runtimeArgs`.

If we wanted to make port configurable from day 1, we could add a `--port ${port}` template expansion in `runtimeArgs`. Defer to Future Work.

### Collab port (what users never see directly)

`ok start`'s port is kernel-allocated (port 0). Advertised via `server.lock`. MCP stdio reads the lock; React app (running in preview pane) reads the same lock via a boot-time endpoint OR receives it via provider config.

**OPEN**: how does the React app know which `ws://localhost:<port>/collab` to connect to? Today (one-HTTP-server), it's same-origin; post-split, collab is on a DIFFERENT port. The React app must discover the collab port. Options:

- (a) UI server queries `server.lock` at request time and injects `<script>window.__OK_COLLAB__ = "ws://localhost:51234"</script>` into index.html before serving.
- (b) UI server proxies `/collab` WebSocket upgrades to the collab server.
- (c) React app fetches `/api/collab-url` from UI server; UI server reads `server.lock` and returns the URL.

Lean: **(a)** — injected at index.html serve time. Simplest, no proxy, no new endpoint.

This surfaces as **FR-1.13** (new requirement, post-investigation).

## Implications for spec

- **OQ-1.2 resolved**: one launch.json entry, pointing at `ok ui`. Removes the "aggregator vs flag vs two entries" ambiguity.
- **OQ-1.3 resolved**: port 3000 is correct, but now for `ok ui` (not `ok start`).
- **New FR-1.13**: `ok ui` injects collab URL into index.html from `server.lock`. Required for React app to connect to collab on a different port.
- **FR-1.8 (launch.json update) sharpened**: `runtimeArgs: ["@inkeep/open-knowledge", "ui"]`, not `"start"`.
- **FR-1.1 (`ok ui`) sharpened**: default bind port 3000 (not port 0) — matches launch.json contract.

## Pointers

- `packages/cli/src/commands/init.ts:138-190` — `scaffoldLaunchJson`.
- [Medium — Claude Code preview MCP](https://medium.com/@dan.avila7/claude-code-desktop-has-a-built-in-preview-mcp-heres-how-it-works-774809ff676f).
- [GitHub Issue #29315](https://github.com/anthropics/claude-code/issues/29315) — url field request (not relevant here since we're localhost).

## Gaps / follow-ups

- Verify Claude Code's preview_start behavior when the subprocess writes to stdout/stderr (does it capture? passthrough?). If captures, our WARN logs from idle-shutdown approach threshold might appear in preview console — could be fine or annoying.
- Confirm `--port ${variable}` template expansion in launch.json runtimeArgs is NOT supported (if it is, a cleaner config shape exists). Searched: not found in secondary docs.
