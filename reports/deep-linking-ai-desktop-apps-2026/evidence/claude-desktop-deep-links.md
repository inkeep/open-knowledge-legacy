# Evidence: Claude Desktop — URL Scheme and Deep Links

**Dimension:** D1 — Claude Desktop
**Date:** 2026-04-16 (initial); updated 2026-04-21 (Findings 8–12 from live-testing round)
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

## Findings from 2026-04-21 live-testing round (corrects the "no atomic combo" gap)

> **Header-level correction.** The 2026-04-16 initial probe characterized only the `claude://claude.ai/*` branch of the host enum and concluded "no URL route seeds prompt + workspace in one call." Live testing on 2026-04-21 — firing candidate URLs against the installed Claude.app 1.2581.0 while watching the app settle — revealed that the **`claude://cowork/*`** and **`claude://code/*`** host routes are atomic prompt+folder+file primitives, handled in the main process (not forwarded to the webview) via a direct IPC dispatch. Both are documented below with verbatim bundle code.
>
> The same binary, different minifier pass: the host enum was named `Tx` in Finding 2 above but `Jb` in the cases quoted below. The identifiers are equal (`Jb.Cowork === Tx.Cowork === "cowork"`, `Jb.Code === Tx.Code === "code"`, etc.) — only the minified wrapper name differs across builds.

### Finding 8: `claude://cowork/new?q=&folder=&file=` — atomic prompt + folders + files, routed to the Cowork (Code) surface via IPC
**Confidence:** CONFIRMED (bundle code + live behavioral observation on 2026-04-21)
**Evidence:** `index.js` — switch case for `Jb.Cowork`:

```javascript
case Jb.Cowork: {
  if (t.pathname !== "/new") { M.warn("claudeURLHandler: unrecognized cowork path"); return; }
  const s = yu.getDispatcher(A.webContents);
  if (!s) { M.warn("claudeURLHandler: cowork dispatcher not available"); return; }
  s.dispatchOnCoworkFromMain({
    prompt: ((i = t.searchParams.get("q")) == null ? void 0 : i.slice(0, QqA)) ?? void 0,
    selectedDirectories: t.searchParams.getAll("folder"),
    selectedFiles: t.searchParams.getAll("file"),
    prefillOnly: true,
    source: "external"
  });
  return;
}
```

**URL form:**

```
claude://cowork/new?q=<url-encoded-prompt>&folder=<abs-path>&folder=<abs-path-2>&file=<abs-file>
```

**Parameter semantics:**
- `q` — pre-fills the Cowork composer with this prompt (truncated to `QqA` chars — same cap applied elsewhere in the bundle; bound not extracted in this pass but likely shares the 8K-ish ceiling used on other surfaces).
- `folder` — **repeatable**; each value is an absolute path added to the session's "selected directories" (i.e., the workspace roots the user chose to expose to Cowork). The signature is `URLSearchParams.getAll("folder")`, so `?folder=/a&folder=/b` passes both.
- `file` — **repeatable**; absolute file paths pre-attached to the composer as context.
- `prefillOnly: true` — does NOT auto-send the prompt; just populates the composer. The user must explicitly confirm/submit.
- `source: "external"` — analytics + trust-boundary label. External-origin content flows through whatever CursorJack-equivalent validation Claude applies (unverified in this pass; worth a follow-up probe).

**Implication:** This is the Claude-Desktop equivalent of Codex's `codex://new?prompt=&path=&originUrl=` atomic handoff. It was missed in the initial probe because Finding 2 only enumerated the `td` path-enum (`MagicLink`, `New`, `SSOCallback`, …) without tracing the host-enum branches through the handler switch. The `Tx`/`Jb` host enum has its own set of first-class routes that do NOT forward to the webview; they dispatch directly via the Electron main process to the Cowork UI.

**Live-tested behavior (2026-04-21):** Fired `open 'claude://cowork/new?q=<prompt>&folder=<abs-path>'` from a shell; Claude.app opened into the Cowork (user-facing "Code") tab with the prompt text pre-filled in the composer and the folder listed in the selected-directories strip. No confirmation modal. One browser-level "open with Claude?" system prompt if invoked from a URL bar (expected macOS Launch Services behavior on first use per scheme).

### Finding 9: `claude://code/new?q=&folder=&file=` — navigates webview to `/epitaxy` with composed params, routed via `jk`
**Confidence:** CONFIRMED
**Evidence:** `index.js` — switch case for `Jb.Code`:

```javascript
case Jb.Code: {
  if (t.pathname !== "/new") { M.warn("claudeURLHandler: unrecognized code path"); return; }
  const s = t.searchParams.get("q") ?? t.searchParams.get("prompt"),
        o = s == null ? void 0 : s.slice(0, QqA),
        a = t.searchParams.getAll("folder"),
        c = t.searchParams.getAll("file"),
        g = new URLSearchParams;
  o && g.set("q", o);
  for (const E of a) g.append("folder", E);
  a.length > 0 && g.set("src", "external");
  const I = g.toString() ? `/epitaxy?${g.toString()}` : "/epitaxy";
  Mt("desktop_code_deeplink_received", { has_prompt: !!o, has_folder: a.length > 0, has_file: c.length > 0 });
  jk(I, A);
  return;
}
```

**URL form:**

```
claude://code/new?q=<prompt>&folder=<abs-path>&file=<abs-file>
```

**What's different from `cowork/new`:**
- Accepts both `q` and `prompt` as the prompt param name (first-one-wins: `q` preferred). `cowork/new` accepts only `q`.
- Composes a webview path `/epitaxy?q=<p>&folder=<a>&src=external` and navigates to it via `jk(I, A)` (webview navigation helper). The Cowork branch goes through IPC (`dispatchOnCoworkFromMain`) rather than webview nav.
- The composed URL only carries `q` + `folder` (no `file=`); a probed asymmetry, though `c` (files) is still read and counted in the `desktop_code_deeplink_received` analytics event.
- `src=external` is only set when at least one folder was passed — the analytics/trust label is folder-gated, not prompt-gated.

**`/epitaxy` = Claude Desktop's internal path for the "Code" surface.** "Cowork" and "Code" are the same user-facing tab (the left-sidebar "Code" item) but are represented by distinct sidebar-mode identifiers and two distinct dispatch paths in the main process. The internal codename is `epitaxy`.

**Live-tested behavior (2026-04-21):** Fires open the Code tab with prompt + folder pre-filled. Same two-path split observed empirically as in the source: Cowork goes through the `dispatchOnCoworkFromMain` IPC and lands in the Cowork pre-fill state; Code goes through webview nav to `/epitaxy?...`. Both end up in the same user-visible tab; which one to use from an external tool depends on whether you want the IPC-level prefill-only semantics (Cowork) or the webview-nav semantics (Code).

### Finding 10: `CjA` — the `public.folder` Launch Services handler back-end (resolves the "where does `open -a Claude.app /path` go" open question)
**Confidence:** CONFIRMED
**Evidence:** `index.js` — the `CjA` function, called from the `open-file` event handler that Electron fires when macOS dispatches a folder via `CFBundleDocumentTypes`:

```javascript
async function CjA(e) {
  if (M.info(`Handling folder drop: ${e}`), !ye?.webContents?.isDestroyed()) {
    const A = yu.getDispatcher(ye.webContents);
    if (!A) { M.warn("LocalAgentModeSessions dispatcher not available"); return; }
    A.dispatchOnCoworkFromMain({ selectedDirectories: [e] });
    Ct && !Ct.isDestroyed() && (Ct.show(), Ct.focus());
  }
}
```

`open -a Claude.app /path` → macOS Launch Services → Electron `open-file` event → `CjA("/path")` → `dispatchOnCoworkFromMain({ selectedDirectories: ["/path"] })`. The Cowork UI receives a single-folder `selectedDirectories` param with no prompt. This is the same IPC the `claude://cowork/new` URL route fires (Finding 8) — the only difference is that `CjA` passes no `prompt`, no `file`, and `source` is not set (the IPC layer defaults apply).

**Why this matters:** the previously-open question in Addendum E of `project-scoping-on-launch.md` was "what does `open -a Claude.app /path` do end-to-end" — now resolved. It routes specifically to the Cowork/Code tab, not to a blank app-open, not to the chat tab. The folder drop is handled by the same dispatcher that handles the URL-scheme Cowork route.

### Finding 11: `Info.plist` registers `public.folder` as an `Editor`-role document type
**Confidence:** CONFIRMED
**Evidence:** `plutil -extract CFBundleDocumentTypes raw /Applications/Claude.app/Contents/Info.plist` (pre-existing evidence consolidated from `project-scoping-on-launch.md`):

```
=== Claude ===
  [Viewer] Desktop Extension — ext:['dxt', 'mcpb'] types:[]
  [Viewer] Skill File — ext:['skill'] types:[]
  [Editor] Folder — ext:[] types:['public.folder']     ← the LS folder handler
  [Viewer] All Files — ext:[] types:['public.data']
```

The `public.folder` UTI + `CFBundleTypeRole: Editor` combination is what tells macOS Launch Services: "this app can be the target of `open -a Claude.app <folder>`." The Electron `open-file` event fires on the main process when LS dispatches the folder. `CjA` is the registered handler for that event.

Cross-reference: Cursor uses the same combination (per `project-scoping-on-launch.md` Finding E1). Codex does NOT — no `CFBundleDocumentTypes` at all, so `open -a Codex.app /path` opens Codex without the folder context.

### Finding 12: Sidebar-mode enum + session-route shape — `"chat" | "code" | "task" | "epitaxy" | "operon"`, sessions at `/epitaxy/<id>`
**Confidence:** CONFIRMED
**Evidence:** `index.js` bundle probe:

```javascript
sidebarMode: Ya([Lr("chat"), Lr("code"), Lr("task"), Lr("epitaxy"), Lr("operon")])
// …
getSessionRoute(A) = "/epitaxy/${encodeURIComponent(A)}"
```

- **Five sidebar modes**, default `"chat"` (the claude.ai web chat surface).
- `"code"` and `"epitaxy"` both exist as distinct modes — suggests the UI may treat them as separate tabs OR there is a migration in flight where `code` is the user-facing label and `epitaxy` the internal path. In live testing, the user-visible tab is labeled "Code" but its route is `/epitaxy/<session-id>`.
- `"operon"` and `"task"` — not explored in this pass; likely internal Anthropic features not yet user-facing on this build.
- Session route shape: `/epitaxy/<encodeURIComponent(sessionId)>` — relevant if a future Claude release adds a `claude://cowork/session/<id>` or `claude://code/session/<id>` primitive to reopen existing Code sessions by ID (would be the Code analog of `claude://claude.ai/chat/<conversation-id>`).

**Implication:** "Cowork" is Anthropic's internal codename; "Code" is the user-visible label; "Epitaxy" is the internal session-store path. An external tool that wants to integrate with the Code surface should:
1. Use **`claude://cowork/new?q=&folder=&file=`** for atomic prompt+folder handoff (Finding 8) — preferred; lands directly via IPC with `prefillOnly: true`.
2. Fall back to `claude://code/new?q=&folder=&file=` if IPC-based prefill is for some reason unavailable (Finding 9) — lands via webview nav to `/epitaxy?...`.
3. Use `open -a Claude.app /path` (Finding 10) if only a folder is known (no prompt); lands via the same IPC as (1) with no prompt param.

---

## Summary: the full atomic-handoff surface on Claude Desktop

| What you have | Best URL / invocation | Lands where | Mechanism |
|---|---|---|---|
| Prompt only | `claude://claude.ai/new?q=<p>` | Chat tab | Webview forward (Finding 3) |
| Prompt + folder + files | `claude://cowork/new?q=<p>&folder=<abs>&file=<abs>` | Code (Cowork) tab | Main-process IPC (Finding 8) |
| Prompt + folder + files (webview variant) | `claude://code/new?q=<p>&folder=<abs>&file=<abs>` | Code (Epitaxy path) tab | Webview nav via `jk` (Finding 9) |
| Folder only | `open -a Claude.app /path` **or** `claude://cowork/new?folder=<abs>` | Code (Cowork) tab | LS → `open-file` → `CjA` IPC (Finding 10) |
| Existing chat | `claude://claude.ai/chat/<id>` | Chat tab | Webview forward (Finding 5) |
| Existing project | `claude://claude.ai/project/<id>` | Chat tab | Webview forward (Finding 5) |

**Correction to earlier Finding 6 implication:** The initial probe stated "no CLI flag to route into Claude Desktop's embedded Code mode with a seeded prompt — the `claude-code-desktop` deep-link route is a navigation signal, not a prompt-seeding one." That framing is accurate for the `td.ClaudeCodeDesktop` route specifically but misses the existence of the separate `Jb.Cowork` / `Jb.Code` host-routes, which ARE prompt-seeding (plus folder- and file-seeding). The fuller statement: `claude://claude.ai/claude-code-desktop` is a pure navigation signal; `claude://cowork/new?...` and `claude://code/new?...` are the atomic seeding primitives.

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
