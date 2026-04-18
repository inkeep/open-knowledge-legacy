# Evidence: Claude Desktop — URL Scheme and Deep Links

**Dimension:** D1 — Claude Desktop
**Date:** 2026-04-16
**Sources:** `/Applications/Claude.app/` (version 1.2581.0, Anthropic PBC) — Info.plist, `app.asar`, Electron main-process bundle

---

## Key files / pages referenced
- `/Applications/Claude.app/Contents/Info.plist` — URL scheme registration
- `/Applications/Claude.app/Contents/Resources/app.asar` (extracted to `/tmp/claude-asar-dump/extracted`) — Electron app bundle
- `extracted/package.json` — app metadata (`@ant/desktop` v1.2581.0)
- `extracted/.vite/build/index.js` — minified main process; contains protocol handler + route table
- `/Users/edwingomezcuellar/.local/bin/claude` — Claude Code CLI (different product; positional prompt)

---

## Findings

### Finding 1: Claude.app registers the `claude://` URL scheme
**Confidence:** CONFIRMED
**Evidence:** `Info.plist` → `CFBundleURLTypes`:

```text
[{"CFBundleURLName":"Claude","CFBundleURLSchemes":["claude"]}]
```

On first launch, the app calls `Se.app.setAsDefaultProtocolClient("claude")` (Electron API). A `-uninstall` argv flag triggers `removeAsDefaultProtocolClient("claude")`.

**Implication:** Any macOS process can invoke `open 'claude://...'` (or a browser can navigate to `claude://...`) and the OS will route to Claude.app.

### Finding 2: Claude has a formal deep-link route table with ~14 endpoints
**Confidence:** CONFIRMED
**Evidence:** `index.js` — the `td` enum (extracted verbatim from minified bundle):

```javascript
td = (t) => (
  t.MagicLink            = "magic-link",
  t.New                  = "new",
  t.SSOCallback          = "sso-callback",
  t.McpAuthCallback      = "mcp-auth-callback",
  t.OpenConversation     = "chat",
  t.OpenProject          = "project",
  t.Settings             = "settings",
  t.AdminSettings        = "admin-settings",
  t.Customize            = "customize",
  t.Create               = "create",
  t.Tasks                = "tasks",
  t.ClaudeCodeDesktop    = "claude-code-desktop",
  t.Code                 = "code",
  t.Resume               = "resume",
  t.LocalSessions        = "local_sessions",
  t
)(td || {});
```

The URL router also recognizes a set of hosts via the `Tx` enum:

```javascript
Tx = (t) => (
  t.Hotkey    = "hotkey",
  t.Login     = "login",
  t.ClaudeAI  = "claude.ai",
  t.Preview   = "preview",
  t.Cowork    = "cowork",
  t.Code      = "code",
  t
)(Tx || {});
```

So URLs have the general form `claude://<host>/<path>`, where `<host>` routes to a windowing mode and `<path>` maps to one of the enum values above.

### Finding 3: `claude://claude.ai/new?q=<prompt>` pre-fills a new conversation with a prompt
**Confidence:** CONFIRMED
**Evidence:** `index.js` — switch case for `td.New`:

```javascript
case td.New: {
  const c = tLe(r.searchParams.get("q"));
  xsr(r.searchParams, c);
  D2(c.pathname + c.search, e);
  return;
}
```

The handler reads the `q` query parameter (conventional "query" parameter) from the `claude://` URL, merges other search params into the resulting URL, and navigates the webview (`D2`) to the computed path on `https://claude.ai`. The web app then pre-fills the composer with that query and/or starts a new conversation.

**URL form (verified syntax from the router):**

```
claude://claude.ai/new?q=<url-encoded-prompt>
```

**Implication:** This is the exact equivalent of what the user is asking about. Any external process — a bookmarklet, an extension, a CLI, a script — can invoke `open 'claude://claude.ai/new?q=Summarize%20this%20article'` and Claude Desktop will open to a fresh conversation with that text pre-filled.

### Finding 4: Deep links dispatch as IPC to the web view via `dispatchHandleDeepLink`
**Confidence:** CONFIRMED
**Evidence:** `index.js`:

```javascript
// IPC binding (Claude's EIPC layer — "eipc" = electron-ipc codegen)
dispatchHandleDeepLink(n) {
  if (typeof n !== "string") throw new Error('... validation failed');
  t.send("$eipc_message$_62e7211c-f2d4-4555-8e45-81ccc5b34930_$_claude.web_$_DeepLink_$_handleDeepLink", n);
}
// Invocation from the main-process router:
(s = j4e.getDispatcher(e.webContents)) == null || s.dispatchHandleDeepLink(c);
```

The main process parses `claude://` URLs, recognizes which enum case they map to, and for routes that don't need custom main-process logic (e.g., `McpAuthCallback`, `default`) simply forwards the URL to the embedded web view as an IPC message. The web view (claude.ai inside the Electron window) handles the specific client-side logic.

**Implication:** The route enum ≠ the full capability surface. `td.McpAuthCallback`, `td.default`, and `td.ClaudeCodeDesktop` forward to the web app, which means any path the web app understands is reachable — but also means the behavior of those routes depends on claude.ai's current implementation, which can change without an app update.

### Finding 5: Known specific routes (synthesized from router switch-case + web app implementations)
**Confidence:** CONFIRMED (route target) / INFERRED (web-app behavior for forwarded paths)
**Evidence:** `index.js` switch cases + `desktop_code_deeplink_received` analytics event:

```javascript
tr("desktop_code_deeplink_received", { ... })
```

Known working URL forms (path + behavior inferred from router code):

| URL | Behavior | Router-side or web-side |
|---|---|---|
| `claude://claude.ai/new?q=<prompt>` | New conversation pre-filled with `q` | Router (CONFIRMED) |
| `claude://claude.ai/chat/<conversation-id>` | Open existing conversation by ID | Router (CONFIRMED) |
| `claude://claude.ai/project/<project-id>` | Open project | Router (CONFIRMED) |
| `claude://claude.ai/settings` | Open settings page | Router (CONFIRMED) |
| `claude://claude.ai/admin-settings` | Admin settings | Router (CONFIRMED) |
| `claude://claude.ai/tasks` | Tasks view | Router (CONFIRMED) |
| `claude://claude.ai/customize/plugins/new?marketplace=<m>&plugin=<p>` | Install plugin from marketplace | Router (CONFIRMED — explicit param handling) |
| `claude://claude.ai/claude-code-desktop` | Claude Code Desktop mode | Router (CONFIRMED) |
| `claude://claude.ai/code` | Code view | Router (CONFIRMED) |
| `claude://claude.ai/resume` | Resume previous session | Router (CONFIRMED) |
| `claude://claude.ai/local_sessions` | Local sessions list | Router (CONFIRMED) |
| `claude://claude.ai/magic-link?...` | Magic-link sign-in | Router (CONFIRMED) |
| `claude://claude.ai/sso-callback?anon_id=<id>` | SSO callback with cookie-setting | Router (CONFIRMED — has explicit cookie.set() code) |
| `claude://claude.ai/mcp-auth-callback?<params>` | MCP OAuth callback | Router→web (CONFIRMED — forwards to web view) |
| `claude://<other-host>/...` | Forwarded to web view as-is | Router (CONFIRMED default branch) |

### Finding 6: Claude Desktop bundles Claude Code, and the CLI is a SEPARATE product
**Confidence:** CONFIRMED
**Evidence:** Two distinct binaries/products:

1. **Claude.app (Claude Desktop)** — Electron GUI at `/Applications/Claude.app`; registers `claude://` URL scheme; has embedded Claude Code ("cowork") plus chat. Package name `@ant/desktop`, version 1.2581.0.
2. **Claude Code CLI** — `/Users/edwingomezcuellar/.local/bin/claude` (Mach-O arm64). CLI interface: `claude [options] [command] [prompt]`. Starts an interactive TUI session by default; accepts a prompt as a positional argument; `-p/--print` for non-interactive mode.

The embedded `claude-code-desktop` route in Claude Desktop opens Claude Code *inside* the desktop app (Cowork). This is different from the `claude` CLI which runs in the terminal.

**Implication for deep-linking:**
- To open **Claude Desktop** with a pre-filled chat prompt: `open 'claude://claude.ai/new?q=...'`
- To run **Claude Code** with a prompt: `claude "your prompt"` (but this spawns a new terminal TUI; there is no CLI flag to route into Claude Desktop's embedded Code mode with a seeded prompt — the `claude-code-desktop` deep-link route is a navigation signal, not a prompt-seeding one, based on the router code).

### Finding 7: Windows uninstall flag exposes the protocol registration lifecycle
**Confidence:** CONFIRMED
**Evidence:** `index.js`:

```javascript
_s && !fu() && /-uninstall/.test(Qo.argv[1])
  ? (Se.app.removeAsDefaultProtocolClient("claude"), LVe.setStartupOnLoginEnabled(!1))
  : Se.app.setAsDefaultProtocolClient("claude");
```

The app self-manages protocol registration — register on launch, de-register on uninstall. macOS (via Info.plist) handles registration declaratively and persistently; Windows requires the explicit registry write on first launch.

---

## Negative searches

- **Searched:** any form of `claude://...?prompt=...`, `claude://...?message=...`, `claude://...?text=...` in `index.js`. The router code only reads `q` (in `td.New`) and specific params (`marketplace`, `plugin`, `anon_id`) in other routes. → **Only `q` is the prompt-seeding param.**
- **Searched:** any `claude://` URL that attaches a file or image. Router does not extract file paths from the URL. → **File attachment via URL is not supported in the main process;** the web app may or may not support it via its own URL params.
- **Searched:** CLI subcommand on `claude` that opens Claude.app. `claude --help` output does not include an equivalent of `codex app`. → **No CLI-to-Desktop bridge** for Claude; use `open 'claude://...'` instead.

---

## Gaps / follow-ups

- Whether `claude.ai/new?q=<prompt>` (the browser URL) also supports model selection, system-prompt injection, or attachment pre-fill — worth checking via the web app's URL param documentation / reverse engineering of the claude.ai frontend.
- Whether `claude://claude.ai/code?q=<prompt>` seeds Claude Code Desktop with a prompt — the router forwards this path to the web view; behavior depends on the web app's handling and is not verifiable from the main-process bundle alone.
- Public documentation for the `claude://` scheme from Anthropic — searched nothing found in-repo; need to web-search for any official docs.
