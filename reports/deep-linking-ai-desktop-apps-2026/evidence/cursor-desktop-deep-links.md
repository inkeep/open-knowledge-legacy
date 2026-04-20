# Evidence: Cursor Desktop — URL Scheme, Deep Links, and CLI Surface

**Dimension:** D3 — Cursor Desktop
**Date:** 2026-04-16
**Sources:** `/Applications/Cursor.app/` — Cursor 3.1.15, bundle id `com.todesktop.230313mzl4w4u92` (Anysphere, Inc.; VS Code fork). Files inspected: `Contents/Info.plist`, unpacked `Contents/Resources/app/` (Cursor ships un-packed, no `app.asar`), `extensions/cursor-deeplink/dist/main.js` (900 KB), `extensions/cursor-mcp/dist/main.js` (2.8 MB), `out/main.js` (1.4 MB, Electron main process), `out/vs/workbench/workbench.desktop.main.js` (50 MB, renderer/workbench). Plus `~/.local/bin/cursor-agent` 2025.09.18-7ae6800 (separate Rust binary pulled in by the `cursor agent` subcommand). Web cross-check: [cursor.com/docs/integrations/deeplinks](https://cursor.com/docs/integrations/deeplinks), [cursor.com/docs/context/mcp/install-links](https://cursor.com/docs/context/mcp/install-links), and the September 2025 Proofpoint/Hendry disclosure "CursorJack."

---

## Key files / pages referenced

- `/Applications/Cursor.app/Contents/Info.plist` — URL scheme registration
- `/Applications/Cursor.app/Contents/Resources/app/product.json` — product-level `urlProtocol`, trusted protocol handlers, bundled-extension lists
- `/Applications/Cursor.app/Contents/Resources/app/out/main.js` — Electron main: scheme registration via `setAsDefaultProtocolClient`, URL listener (`ElectronURLListener`), CLI argv parsing table
- `/Applications/Cursor.app/Contents/Resources/app/out/cli.js` — Node-mode CLI launcher (argv parse, subcommand dispatch)
- `/Applications/Cursor.app/Contents/Resources/app/bin/cursor` — bash shell launcher (routes `cursor agent` to `~/.local/bin/cursor-agent`, everything else to the Electron CLI)
- `/Applications/Cursor.app/Contents/Resources/app/extensions/cursor-deeplink/{package.json,dist/main.js}` — bundled Anysphere extension that owns `cursor://anysphere.cursor-deeplink/*` routing
- `/Applications/Cursor.app/Contents/Resources/app/extensions/cursor-mcp/{package.json,dist/main.js}` — bundled extension owning `cursor://anysphere.cursor-mcp/oauth/callback`
- `/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js` — workbench-side `GlassDeeplinkHandler` (parallel fast-path dispatcher) and the workbench command targets (`deeplink.prompt.prefill`, `deeplink.command.create`, `deeplink.rule.create`, `deeplink.prReview.open`, `mcp.deeplinkInstall`, `workbench.action.backgroundComposer.startSetup`, `deeplink.routeToWorkspaceName`)
- `~/.local/bin/cursor-agent` — separate Rust CLI invoked via `cursor agent`

---

## Findings

### Finding 1: Cursor registers a single top-level `cursor://` scheme

**Confidence:** CONFIRMED
**Evidence:** `/Applications/Cursor.app/Contents/Info.plist` (via `plutil -extract CFBundleURLTypes json -o -`):

```json
[{"CFBundleTypeRole":"Editor","CFBundleURLName":"Cursor","CFBundleURLSchemes":["cursor"]}]
```

Plus `product.json`: `"urlProtocol": "cursor"`, `"applicationName": "cursor"`, `"nameShort": "Cursor"`, `"dataFolderName": ".cursor"`. The scheme is asserted at Electron startup by the VS Code `ElectronURLListener` (`out/main.js`):

```javascript
// out/main.js, class y6 extends $ { constructor(t, e, i, r, s, n) { ...
if (V) {
  const c = r.isBuilt ? [] : [`"${r.appRoot}"`];
  c.push("--open-url", "--");
  w6.setAsDefaultProtocolClient(s.urlProtocol, process.execPath, c);
}
const o = R.map(R.fromNodeEventEmitter(w6, "open-url", (c, l) => ({ event: c, url: l })),
                ({ event: c, url: l }) => (c.preventDefault(), l));
this._register(o(c => { const l = this.uriFromRawUrl(c); l && this.urlService.open(l, {originalUrl: c}); }));
// ...
uriFromRawUrl(t) { try { return A.parse(t); } catch { return; } }
```

That's VS Code's stock protocol plumbing unchanged — the Cursor-specific work lives downstream of `urlService.open()` in the bundled extensions and the workbench's `GlassDeeplinkHandler`.

**Implication:** Cursor inherits VS Code's `cursor://<extension-id>/<path>?<query>` routing model. Any installed extension can register a `UriHandler` for its own extension id; Anysphere's first-party behavior is implemented in two bundled extensions with publisher `anysphere`.

---

### Finding 2: All Anysphere-owned deep links route through `cursor://anysphere.cursor-deeplink/...`

**Confidence:** CONFIRMED
**Evidence:** `extensions/cursor-deeplink/package.json`:

```json
{
  "name": "cursor-deeplink", "publisher": "anysphere",
  "description": "Handles deep-link URIs.",
  "activationEvents": ["onStartupFinished", "onUri"],
  "contributes": { "commands": [{ "command": "cursor-deeplink.debug.triggerDeeplink",
                                   "title": "Debug: Trigger Arbitrary Deeplink",
                                   "category": "Cursor Deeplink" }] },
  "main": "./dist/main"
}
```

`activationEvents: ["onUri"]` means VS Code activates the extension whenever any `cursor://anysphere.cursor-deeplink/*` URL is received. The activate function (verbatim from `dist/main.js` @ offset 143200, formatted for readability):

```javascript
t.activate = function (e) {
  const t = {
    async handleUri(e) {
      try {
        if      ("/createchat"                    === e.path) await handleBugBotFixInCursor(e);
        else if ("/mcp/install"                   === e.path) await handleMCPInstall(e);
        else if (e.path.startsWith("/background-agent")) await handleBackgroundAgentOpen(e);
        else if (e.path.startsWith("/settings"))         await handleSettingsOpen(e);
        else if ("/prompt"                         === e.path) await handlePromptDeeplink(e);
        else if ("/command"                        === e.path) await handleCommandDeeplink(e);
        else if ("/rule"                           === e.path) await handleRuleDeeplink(e);
        else if ("/pr-review"                      === e.path) await handlePrReviewDeeplink(e);
        else if ("/plugin/add"                     === e.path) await handlePluginAdd(e);
        else if ("/glass"                          === e.path) await commands.executeCommand("cursor.openOrFocusGlassWindow");
        else if ("/" === e.path || "" === e.path) { /* no-op */ }
        else {
          console.warn("Unrecognized deeplink", e);
          window.showWarningMessage("Unrecognized deep link. Try updating Cursor");
        }
      } catch (e) { /* showErrorMessage */ }
    }
  };
  const A = commands.registerCommand("cursor-deeplink.debug.triggerDeeplink", async () => {
    const e = await window.showInputBox({
      prompt:      "Enter a deeplink URL to test (e.g., cursor://anysphere.cursor-deeplink/command/create?name=test&content=...)",
      placeHolder: "cursor://anysphere.cursor-deeplink/...",
      validateInput: e => { /* must start with cursor://anysphere.cursor-deeplink/ */ }
    });
    /* ... */
  });
  e.subscriptions.push(window.registerUriHandler(t));
};
```

**Implication:** Ten route buckets, one URL scheme. `cursor-deeplink` is the authoritative router — and the in-product debug menu entry (`cursor-deeplink.debug.triggerDeeplink`, "Debug: Trigger Arbitrary Deeplink") confirms Anysphere treats this as a first-class integration surface.

---

### Finding 3: Complete enumerated Cursor URL surface (v3.1.15)

**Confidence:** CONFIRMED — every row below corresponds to a branch in Finding 2's `handleUri` switch plus the `cursor-mcp` OAuth callback and the workbench-side `GlassDeeplinkHandler` fast-path.

| URL | Handler | Behavior |
|---|---|---|
| `cursor://anysphere.cursor-deeplink/prompt?text=<p>&mode=<m>&workspace=<name>` | `handlePromptDeeplink` → `deeplink.prompt.prefill` | **Opens a new Composer chat with `text` pre-filled after a confirmation dialog.** `mode ∈ {ask, agent, debug, plan}` (default agent); `ask` is aliased to internal `chat` mode. `workspace` routes to a named workspace window if open; otherwise stays in current window. |
| `cursor://anysphere.cursor-deeplink/command?name=<n>&text=<t>` | `handleCommandDeeplink` → `deeplink.command.create` | Creates a new custom slash-command with name + body content; name max 100 chars, must be `[a-zA-Z0-9._-]+`. |
| `cursor://anysphere.cursor-deeplink/rule?name=<n>&text=<t>` | `handleRuleDeeplink` → `deeplink.rule.create` | Creates a new rule file in the user's `.cursor/rules/` directory. |
| `cursor://anysphere.cursor-deeplink/mcp/install?name=<n>&config=<base64-json>` | `handleMCPInstall` → `aiSettings.action.open("mcp")` + `mcp.deeplinkInstall` | **One-click MCP server install.** `config` is base64-encoded JSON matching `mcp.json` shape. Opens the MCP tab of AI Settings and invokes the install handler. |
| `cursor://anysphere.cursor-deeplink/background-agent/setup` | `handleBackgroundAgentOpen` | Runs `workbench.action.backgroundComposer.startSetup` — kicks off cloud-agent environment setup flow. |
| `cursor://anysphere.cursor-deeplink/background-agent?bcId=<uuid>` | `handleBackgroundAgentOpen` | Opens an existing cloud ("background") agent by id, with repo-match + "Checking repository..." progress toast; falls back to `openExternal` if the repo can't be located locally. The authority form `background-composer+<bcId>` is also recognized by an auxiliary parser in `main.js` (`Bs(t)` function). |
| `cursor://anysphere.cursor-deeplink/settings[/background-composer\|/plugins]` | `handleSettingsOpen` → `aiSettings.action.open(<tab>)` | Opens AI Settings (optionally on a specific tab). |
| `cursor://anysphere.cursor-deeplink/pr-review?url=<gh-pr-url>` | `handlePrReviewDeeplink` → `deeplink.prReview.open` | Opens Cursor's PR-review view on a remote GitHub PR URL. |
| `cursor://anysphere.cursor-deeplink/plugin/add?id=<ext-id>` | `handlePluginAdd` → `workbench.action.openMarketplaceEditor` | Opens the Cursor marketplace editor for `<ext-id>` with an install-confirmation modal (`{pluginId, openInstallModal: true, skipTracking: true}`). |
| `cursor://anysphere.cursor-deeplink/createchat?link=<b64>` or `?data=<jwt>` | `handleBugBotFixInCursor` | Internal "BugBot" flow — payload is either an unsigned v1 JSON (base64-encoded) or a signed JWT verified via `AuthService.listJwtPublicKeys` (RS256). Used for Cursor's own BugBot-style "fix error message" links. |
| `cursor://anysphere.cursor-deeplink/glass` | inline | `commands.executeCommand("cursor.openOrFocusGlassWindow")` — opens/focuses Cursor's new multi-workbench ("Glass") shell window. |
| `cursor://anysphere.cursor-mcp/oauth/callback?state=<jwt>&code=<code>` | `cursor-mcp` extension | MCP OAuth 2.0 authorization-code callback. `state` is a JWT-like token decoded via `decodeOAuthState` to identify the originating MCP server; `code` is fed to the server's MCP OAuth client provider via `mcp.updateStatus` + exchange. |

`product.json` confirms both handlers are pre-trusted (no "untrusted protocol handler" prompt):

```json
"trustedExtensionProtocolHandlers": ["vscode.git", "vscode.github-authentication",
  "vscode.microsoft-authentication", "anysphere.cursor-deeplink", "anysphere.cursor-mcp"]
```

**Implication:** Cursor's deep-link surface is the richest of the three apps studied in this report. Beyond the common "open-conversation-with-prompt" primitive (Claude's `?q=`, Codex's `?prompt=`), Cursor exposes four additional distinct capabilities via URLs: (i) installing MCP servers, (ii) creating persistent custom commands/rules in the user's profile, (iii) opening an existing cloud agent by id, and (iv) deep-linking into settings sub-tabs, PR review, marketplace install, and the Glass window.

---

### Finding 4: `/prompt` does NOT silently seed the composer — it requires a user confirmation dialog

**Confidence:** CONFIRMED
**Evidence:** `out/vs/workbench/workbench.desktop.main.js` @ offset 37701384 (formatted):

```javascript
Qs.registerCommand("deeplink.prompt.prefill", async (n, e) => {
  const t = n.get(_f), i = n.get(bw), r = n.get(TP), s = n.get(ah),
        o = n.get(My), a = n.get(QE),
        l = crypto.randomUUID(),
        u = e.text ?? "",
        h = e.mode?.trim().toLowerCase() || void 0,
        f = h === "ask" ? "chat"
          : (h && ["ask", "agent", "debug", "plan"].includes(h)) ? h
          : "agent",
        g = h === "ask" ? "Ask" : a.getMode(f)?.name ?? f,
        v = u.length,
        _ = await crypto.subtle.digest("SHA-256",
              new TextEncoder().encode(u))
            .then(R => Array.from(new Uint8Array(R))
              .map(P => P.toString(16).padStart(2, "0")).join(""));
  s.trackEvent("deeplink.opened", { type: "prompt", correlationId: l,
                                     promptLength: v, promptHash: _ });
  const S = [
    { message: f === "agent"
        ? "This will create a new chat with the following prompt:"
        : `This will create a new chat in ${g} mode with the following prompt:` },
    { message: u, className: gGn },
    { message: "Review this external prompt carefully before proceeding",
      type: "callout", icon: We.warningTwo,
      iconColor: "var(--vscode-editorWarning-foreground)" }
  ];
  if (await r.openDialog({
        title: f === "agent" ? "Create chat with prompt"
                             : `Create ${g} chat with prompt`,
        message: S, width: "min(520px, calc(100vw - 64px))",
        primaryButton: { id: "create", label: "Create Chat" },
        cancelButton:  { id: "cancel", label: "Cancel" }
      }) !== "create") {
    s.trackEvent("deeplink.declined", { type: "prompt", correlationId: l,
                                         promptHash: _ });
    return;
  }
  s.trackEvent("deeplink.accepted", { type: "prompt", correlationId: l,
                                       promptHash: _ });
  const A = await t.createComposer({
    unifiedMode: f,
    partialState: { unifiedMode: f, text: u, richText: u,
                    analyticsMetadata: { source: "deeplink",
                                          correlationId: l, promptHash: _ } },
    openInNewTab: true
  });
  /* ... */
});
```

And `extensions/cursor-deeplink/dist/main.js` @ offset 364321:

```javascript
t.handlePromptDeeplink = async function (e) {
  const t = a(e);  // parse text param
  if (!t) throw new Error("Missing text parameter for prompt deeplink");
  const A = validatePromptText(t);
  if (A) throw new Error(A);
  const i = l(e.query, "workspace");
  const c = i?.trim();
  if (c) {
    // ... try to route to a named workspace window
    if (await commands.executeCommand("deeplink.routeToWorkspaceName", c, e.toString())) return;
  }
  await commands.executeCommand("deeplink.prompt.prefill", {
    text: t,
    mode: l(e.query, "mode") ?? undefined
  });
};
```

The public docs at [cursor.com/docs/integrations/deeplinks](https://cursor.com/docs/integrations/deeplinks) corroborate this: *"All deeplinks require user review and confirmation before execution. Deeplinks never trigger automatic execution."*

**Implication:** An external process can open Cursor with a pre-filled prompt in the requested mode (`agent`/`ask`/`debug`/`plan`), but the user must click "Create Chat" in a confirmation modal. The prompt body is rendered inline in the dialog with a warning callout ("Review this external prompt carefully before proceeding"). Analytics are emitted at three lifecycle points (`deeplink.opened`, `deeplink.accepted`/`deeplink.declined`) with a SHA-256 `promptHash` and a `correlationId` — the composer is tagged `source: "deeplink"` for downstream tracking. This is the exact mitigation Proofpoint's "CursorJack" disclosure called for (see Finding 10).

---

### Finding 5: Prompt validation is non-trivial — content-keyword denylist plus 10,000-char cap

**Confidence:** CONFIRMED
**Evidence:** `extensions/cursor-deeplink/dist/main.js` @ offset 413320:

```javascript
t.MAX_URI_LENGTH   = 1e4;   // 10,000
t.ERR_INVALID_TEXT = "Invalid text for prompt";
t.ALLOWED_CHARS_PATTERN = /^(?!.*(?:\p{Cf}|\u007F))[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Z}\r\n\t !-~]+$/u;
const h = 100; // max command-name length
```

The `validatePromptText` function at offset 409228 runs four checks before accepting a prompt:

```javascript
t.validatePromptText = function (e) {
  return e && "" !== e.trim() && a(e)                    // containsOnlyAllowedChars
    ? c(e) > t.MAX_URI_LENGTH                            // calculateUriLength > 10000
      || (function (e) {                                 // keyword-denylist probe
        const t = e.toLowerCase(),
              A = l(t),    // URL-decode once
              r = l(A),    // URL-decode twice
              n = g(e),    // base64-decode attempt (joined tokens)
              o = u(e),    // hex-decode attempt
              s = g(u(o)),
              i = [t, A, r];
        n && i.push(n); s && i.push(s);
        for (const e of i) if (/\.env(\b|\W)/.test(e)) return true;
        const a = [
          /read.*\.env.*print/i,
          /cat.*\.ssh\/id_rsa/i,
          /upload.*passwords\.txt/i,
          /dump.*token/i, /dump.*password/i,
          /exfiltrate.*credential/i, /leak.*secret/i,
          /how.*extract.*credential/i
        ];
        for (const e of i) for (const t of a) if (t.test(e)) return true;
        return false;
      })(e)
      ? t.ERR_INVALID_TEXT
      : null
    : t.ERR_INVALID_TEXT;
};
```

Notably, the denylist is applied to **six variants** of the input — raw, single-URL-decoded, double-URL-decoded, base64-decoded, hex-decoded, and base64-of-hex-decoded — which defeats the common obfuscation chains used in the "CursorJack" paper.

The `validateCommandName` check also rejects directory-traversal segments, path separators, control characters, non-NFC-normalized forms that collapse to `..`, and limits names to `[a-zA-Z0-9._-]{1,100}`.

**Implication:** The public docs claim a 8,000-character limit but the binary enforces 10,000. Callers producing links should probe empirically; staying under 8 K is safe. The denylist is recent (post-CursorJack, Oct 2025) and has been explicitly hardened against encoding bypass — attackers cannot base64 or hex an `.env` lookup into a prompt deeplink.

---

### Finding 6: A second, parallel deeplink handler lives inside the workbench ("Glass" fast path)

**Confidence:** CONFIRMED
**Evidence:** `out/vs/workbench/workbench.desktop.main.js` @ offset ~48539632 contains a class called `GlassDeeplinkHandler` (minified as `CgC`) that mirrors the bundled-extension router but dispatches directly through workbench services instead of going through the extension host:

```javascript
// class GlassDeeplinkHandler {
async handleCommand(n) { /* ... deeplink.command.create ... */ }
async handleRule(n)    { /* ... deeplink.rule.create ... */ }
async handleSettings(n) {
  const e = hgC(n);
  return await this.commandService.executeCommand("glass.settings",
    e ? { defaultTab: e } : undefined), true;
}
async handleMCPInstall(n) {
  const e = vLe(n.query, "name"), t = vLe(n.query, "config");
  if (!e || !t) return false;
  let i;
  try { const r = atob(t); i = JSON.parse(r); } catch { return false; }
  if (typeof i !== "object" || i === null) return false;
  await this.commandService.executeCommand("glass.settings", { defaultTab: "mcp" });
  await this.commandService.executeCommand("mcp.deeplinkInstall", e, i);
  return true;
}
async handleBackgroundAgent(n) {
  if (n.path === "/background-agent/setup")
    return await this.commandService.executeCommand(
      "workbench.action.backgroundComposer.startSetup"), true;
  const e = vLe(n.query, "bcId");
  return e ? (this.commandBridgeService.emit({
    type: "selectAgentRequested", payload: { agentId: e }
  }), true) : false;
}
async handlePRReview(n) { /* deeplink.prReview.open */ }
async handleCreateChat(n) {
  return this.logService.trace(
    "[GlassDeeplinkHandler] /createchat requires extension host " +
    "(bugbot parsing); falling through"), false;
}
```

Plus a separate `GlassMcpOAuthCallbackRouter` (`xgC`) that re-routes MCP OAuth callbacks to the correct materialized workspace via `workspaceCollectionService`. And `deeplink.routeToWorkspaceName` at offset 50313751 that looks up a window by workspace name and forwards the URL there:

```javascript
Qs.registerCommand("deeplink.routeToWorkspaceName", async (n, e, t) => {
  const i = n.get(rp), r = n.get(ja);
  const s = e.trim();
  if (!s) return false;
  const a = await i.getWindows({ includeAuxiliaryWindows: false });
  const l = a.find(g => Uey(g.workspace) === s);
  const u = a.find(g => Uey(g.workspace)?.toLowerCase() === s.toLowerCase());
  const d = l ?? u;
  if (!d) return false;
  await i.focusWindow({ targetWindowId: d.id, force: true });
  const h = at.parse(t);
  const p = h.query ? `${h.query}&windowId=${d.id}` : `windowId=${d.id}`;
  const f = h.with({ query: p });
  return await r.open(f, { allowTunneling: true }), true;
});
```

**Implication:** When the Glass multi-workbench shell is active (Cursor 3.x's new windowing model), deep-link dispatch short-circuits the extension host for most routes — `/command`, `/rule`, `/settings`, `/mcp/install`, `/background-agent`, `/pr-review` — and only falls through to the `anysphere.cursor-deeplink` extension for `/createchat` (BugBot parsing). `/prompt` always goes through `deeplink.prompt.prefill` in the workbench. The `workspace=<name>` parameter is the mechanism for "open this prompt in that specific window" — a capability Codex and Claude lack.

---

### Finding 7: The `cursor` CLI exposes the full VS Code flag surface plus three Cursor-specific additions

**Confidence:** CONFIRMED
**Evidence:** `/Applications/Cursor.app/Contents/Resources/app/bin/cursor --help` (excerpts; full output captured during investigation):

```text
Cursor 3.1.15

Usage: cursor [options][paths...]

Options
  -d --diff <file> <file>                    Compare two files with each other.
  -m --merge <path1> <path2> <base> <result> Perform a three-way merge.
  -a --add <folder>                          Add folder(s) to the last active window.
     --remove <folder>                       Remove folder(s) from the last active window.
  -g --goto <file:line[:character]>          Open a file at the path on the specified line/char.
  -n --new-window                            Force to open a new window.
  -r --reuse-window                          Force to open a file or folder in an already opened window.
  -w --wait                                  Wait for the files to be closed before returning.
     --glass                                 Enable the multi-workbench architecture (dev-only).
     --classic                               Disable glass mode and force classic windows (dev-only).
     --add-mcp <json>                        Adds a Model Context Protocol server definition
                                             to the user profile, or workspace or folder when
                                             used with --mcp-workspace.
                                             Accepts JSON input in the form
                                             '{"name":"server-name","command":...}'
     --chat                                  Open a standalone chat window without the full IDE.
     --profile <profileName>                 Opens the provided folder with the given profile.
     --user-data-dir <dir>                   Specifies the directory that user data is kept in.

Subcommands
  tunnel       Make the current machine accessible from vscode.dev or other machines.
  serve-web    Run a server that displays the editor UI in browsers.
  agent        Start the Cursor agent in your terminal.
```

Three **Cursor-specific** additions vs stock VS Code CLI: `--glass` / `--classic` (Glass-window toggle), `--chat` (documented as "Open a standalone chat window without the full IDE"), `--add-mcp <json>` (profile-level MCP server install), and the `agent` subcommand. The argv-parser table confirms their declarations (`out/main.js` @ offset 511790):

```javascript
hmr:   { type: "boolean" },
chat:  { type: "boolean", cat: "o", description: S(1906, null) },  // "Open a standalone chat window"
_: { type: "string[]" }
// ... and, as a subcommand:
L4 = { agent: { type: "subcommand", description: "Start the Cursor agent in your terminal.", options: {} } }
```

**Implication:** `cursor .` opens the IDE. `cursor --add-mcp '<json>'` is the CLI equivalent of the `cursor://anysphere.cursor-deeplink/mcp/install` deeplink (different transport, same effect). `cursor --chat` is documented as opening a standalone chat window — see Finding 8 for a cross-check on whether this flag is fully wired in v3.1.15.

---

### Finding 8: `--chat` is declared but has NO main-process consumer in 3.1.15 (flag present, behavior latent)

**Confidence:** CONFIRMED
**Evidence:** Static search for `.chat` (word-boundary) accessor references in both `out/main.js` and `out/cli.js`:

```text
PAT[\.goto\b]  count=4
PAT[\.diff\b]  count=6
PAT[\.merge\b] count=10
PAT[\.wait\b]  count=10
PAT[\.chat\b]  count=0   <-- declared in argv table, never read
PAT[\.agent\b] count=4
```

The `chat:` argv descriptor is the only occurrence of "chat" in the CLI entry-point code path aside from icon-registration lookups for the UI. By contrast `goto`, `diff`, `merge`, `wait` — the flags whose semantics fire in the main process — all appear multiple times as property accesses on the parsed args. The `agent` subcommand dispatches correctly (bash launcher in Finding 9).

**Implication:** In v3.1.15 as shipped, `cursor --chat` parses cleanly (no "unknown flag" warning) and appears in `--help`, but it does **not** actually open a standalone chat window from the main process — no code reads the flag. This is likely pending completion (the option category `"cat: 'o'"` = "Other options" slot is populated but the wiring is in the workbench renderer, not the Electron main process). **Callers targeting this capability in scripts should verify behavior per version; it is not a stable CLI contract yet.** The cross-process equivalent that does work is the extension-host path via `workbench.action.chat.open` (8 references in `workbench.desktop.main.js`), reachable via `cursor://` only indirectly through `/prompt` → `deeplink.prompt.prefill`.

---

### Finding 9: The `cursor agent` subcommand is a thin bash-shim delegating to a separate Rust CLI at `~/.local/bin/cursor-agent`

**Confidence:** CONFIRMED
**Evidence:** `/Applications/Cursor.app/Contents/Resources/app/bin/cursor` (verbatim excerpt of the routing block):

```bash
elif [ "$1" = "agent" ] && [ "$CURSOR_CLI_BLOCK_CURSOR_AGENT" != "true" ]; then
  # Route to cursor-agent
  if ! command -v ~/.local/bin/cursor-agent >/dev/null 2>&1; then
    echo "cursor-agent not found, installing via https://cursor.com/install ..."
    curl -sS https://cursor.com/install | bash >/dev/null 2>&1
    # ...
  fi

  # Check current cursor-agent version meets minimum version requirement
  OUTPUT=$({ ~/.local/bin/cursor-agent --min-version=2025.10.01 status; } 2>&1)
  EXIT_CODE=$?
  # ... auto-update if too old ...

  export CURSOR_CLI_COMPAT=1
  exec ~/.local/bin/cursor-agent "$@"
else
  # Route to Cursor CLI
  use_cursor_cli "$@"
fi
```

And `elif [ "$1" = "editor" ]` — the `cursor editor <paths...>` form is the explicit "force IDE path, do not check for agent" alternate routing. `cursor-agent` is a separately-distributed CLI (symlinked here to `/Users/edwingomezcuellar/.local/share/cursor-agent/versions/2025.09.18-7ae6800/cursor-agent`) with its own option surface:

```text
Usage: cursor-agent [options] [command] [prompt...]

Options:
  --api-key <key>               CURSOR_API_KEY env var also accepted
  -p, --print                   Print responses to console (for scripts / non-interactive use).
                                 Has access to all tools, including write and bash.
  --output-format <format>      text | json | stream-json  (default: stream-json, only with --print)
  -b, --background              Start in background mode (open composer picker on launch)
  --resume [chatId]             Resume a chat session
  --model <model>               e.g., gpt-5, sonnet-4, sonnet-4-thinking
  -f, --force                   Force allow commands unless explicitly denied

Commands:
  install-shell-integration   Install shell integration to ~/.zshrc
  login / logout / status     Authentication management
  mcp                         Manage MCP servers
  create-chat                 Create a new empty chat and return its ID
  agent [prompt...]           Start the Cursor Agent
  ls                          List chat sessions
  resume                      Resume the latest chat session
  update|upgrade              Update Cursor Agent to the latest version
```

**Implication:** The real "Claude-Code-style terminal agent" surface is `cursor-agent`, not `cursor`. Two meaningful consequences for deep-linking: (a) `cursor agent "<prompt>"` bypasses the IDE entirely and runs in the terminal — no `cursor://` URL needed, no confirmation dialog, but also no IDE integration. (b) `cursor-agent create-chat` returns a chat id, which in principle could be combined with a future deeplink to rehydrate that chat in the IDE — but no `cursor://chat/<id>` or `cursor://threads/<id>` route exists in v3.1.15 (see Negative Searches). This is the major delta vs Codex, which exposes `codex://threads/<uuid>`.

---

### Finding 10: Deep-link security posture was hardened in direct response to the "CursorJack" disclosure (Sept 2025)

**Confidence:** CONFIRMED (binary evidence + published disclosure)
**Evidence:** Proofpoint / Hendry Adrian, "CursorJack: weaponizing Deeplinks to exploit Cursor IDE" ([proofpoint.com](https://www.proofpoint.com/us/blog/threat-insight/cursorjack-weaponizing-deeplinks-exploit-cursor-ide), [hendryadrian.com](https://www.hendryadrian.com/cursorjack-weaponizing-deeplinks-exploit-cursor-ide/)) documents the pre-hardening behavior where a crafted `cursor://anysphere.cursor-deeplink/prompt?text=...` could trick an agent into reading secrets. The current v3.1.15 binary shows three mitigations:

1. **Mandatory confirmation modal** — `openDialog` in `deeplink.prompt.prefill` with the exact string `"Review this external prompt carefully before proceeding"` (Finding 4).
2. **Multi-layer obfuscation-aware denylist** — prompt is decoded via six variants (raw, URL-once, URL-twice, base64, hex, base64-of-hex) before pattern-matching for `.env`, `.ssh/id_rsa`, `passwords.txt`, `dump.*token`, `exfiltrate.*credential`, etc. (Finding 5).
3. **Correlated analytics** — `deeplink.opened` / `accepted` / `declined` events with SHA-256 prompt hash and UUID correlationId enable post-hoc abuse detection.

The `createchat` (BugBot) handler additionally requires a v1-payload shape or an RS256-signed JWT whose kid matches a key fetched live from `AuthService.listJwtPublicKeys` (offset 893436 in `cursor-deeplink/dist/main.js`) — that path is not externally reachable without a valid signed payload.

**Implication:** Callers building new integrations on top of Cursor's deeplinks should assume: (a) user confirmation is unavoidable for prompt seeding, (b) prompts containing credential-style keywords will be rejected before the dialog appears (the rejection is enforced by `validatePromptText` inside `handlePromptDeeplink`, before the extension ever reaches `deeplink.prompt.prefill`), (c) there is no "trusted-origin" or "signed-deeplink" bypass for third parties — the signed-JWT path is reserved for Cursor's own BugBot infrastructure.

---

## Comparison: Claude vs Codex vs Cursor deep-link surface

Pulled against the sibling evidence files for quick context on the primary report.

| Capability | Claude (`claude://`) | Codex (`codex://`) | Cursor (`cursor://anysphere.cursor-deeplink/`) |
|---|---|---|---|
| Open new chat | `claude://claude.ai/new` | `codex://new` or `codex://threads/new` | `/prompt` |
| Pre-fill prompt | `?q=<p>` | `?prompt=<p>` | `?text=<p>` |
| Workspace/path hint | not supported | `?path=<abs>` or `?originUrl=<git>` | `?workspace=<name>` (window-match only; no path) |
| Choose mode (ask/agent/debug/plan) | not supported | not supported | `?mode=<m>` |
| Open existing conversation by id | `claude://claude.ai/chat/<id>` | `codex://threads/<uuid>` | **NOT SUPPORTED** |
| Settings | `claude://claude.ai/settings` | `codex://settings` | `/settings` (+ `/settings/background-composer`, `/settings/plugins`) |
| OAuth callback | `claude://claude.ai/mcp-auth-callback` | `codex://connector/oauth_callback` | `cursor://anysphere.cursor-mcp/oauth/callback` |
| **Install MCP server by URL** | not supported | not supported | **`/mcp/install?name=...&config=<b64-json>`** |
| **Create persistent command/rule** | not supported | not supported | **`/command`, `/rule` (named, stored in `.cursor/rules`)** |
| **Open existing cloud agent** | not supported | via `codex://threads/<uuid>` | `/background-agent?bcId=<uuid>` |
| Open PR review | not supported | not supported | `/pr-review?url=<gh-pr-url>` |
| Install extension | not supported | not supported | `/plugin/add?id=<ext-id>` |
| Confirmation dialog before seeding | implicit (webview form) | implicit (focusComposer) | **explicit modal with prompt body preview + warning callout** |
| Prompt denylist | unknown | unknown | explicit (Finding 5) |
| CLI bridge to Desktop | none | `codex app [PATH]`, `--open-project` | stock VS Code CLI (`cursor [paths...]`) + `--add-mcp`, `--chat` (latent), `cursor agent` (routes to separate Rust CLI) |

**Prompt param names differ three ways** — `q` (Claude), `prompt` (Codex), `text` (Cursor). Callers targeting all three must stringify three URLs.

**Cursor has a structurally richer surface** than Claude or Codex. It's the only one that lets a URL (a) install an MCP server, (b) create persistent agent rules/commands, (c) deep-link into settings tabs, (d) open a PR review, and (e) choose the chat mode. But it's also the most guarded: the user must approve every prompt-seeding link, and prompts are validated against an obfuscation-aware denylist before the dialog appears. None of the three supports injecting multi-message history, attaching files via URL, or bypassing the user's confirmation step.

---

## Negative searches

- **Searched:** `cursor://chat/<id>`, `cursor://threads/<id>`, `cursor://conversation/<id>` routes to re-open an existing Composer chat by id. `handleUri` switch has no such branch; `createchat` path accepts payloads but not an id. → **Not supported.** Existing chats can be re-opened via `cursor-agent resume` (terminal only), via the tray-menu "Recent Agents" list, or via `composer.openComposer` internal commands not exposed over URL. The `/background-agent?bcId=<uuid>` form addresses cloud agents, not local chats.

- **Searched:** `cursor://file/<path>`, `cursor://goto/<path>:<line>`, `cursor://open?path=...` — VS Code's official `vscode://file/<path>` convention. Not present in `cursor-deeplink`'s switch or `GlassDeeplinkHandler`. (Note: `vscode://` scheme itself may still work for a VS-Code-compatible fallback, but `cursor://file/*` is not wired.) → **File-open is not exposed via the `cursor://` URL scheme.** Use CLI `cursor --goto <file:line:col>` instead.

- **Searched:** `cursor://command?id=<cmd-id>` for invoking arbitrary registered commands (VS Code's command-URI pattern). `cursor-deeplink` has a `/command` route, but it's for *creating* a named custom command, not invoking one. → **No generic command-invocation URI.** The MCP OAuth callback is the only URI that executes a named workbench command (`mcp.updateStatus`) without a confirmation.

- **Searched:** `cursor://composer.fixerrormessage/...` — the pattern described in the investigation brief. No occurrence in any bundled extension or workbench bundle. The closest equivalent is the `/createchat` BugBot route, which is gated on a signed JWT or v1 payload. → **No standalone `composer.fixerrormessage` URI route; this was a speculative path the user brief asked us to probe, and it does not exist in v3.1.15.**

- **Searched:** file-attachment params on `/prompt` (local file path, URL). `handlePromptDeeplink` parses exactly two query keys: `text` and `workspace` (plus `mode` forwarded into `deeplink.prompt.prefill`). No attachment or context-injection surface. → **Not URL-exposed.** Agent tools access files via in-IDE context (editor, workspace, tool calls) — not from a URL parameter.

- **Searched:** `cursor://anysphere.cursor-retrieval/...`, `cursor://anysphere.cursor-agent-exec/...`, `cursor://anysphere.cursor-resolver/...` — other Anysphere-bundled extensions. Grep confirms only `cursor-deeplink` and `cursor-mcp` register `UriHandler`s. The other Anysphere extensions (`cursor-resolver`, `cursor-agent-exec`, `cursor-checkout`, `cursor-explorer`, `cursor-commits`, `cursor-retrieval`, `cursor-ndjson-ingest`, `cursor-browser-automation`, `cursor-polyfills-remote`, `cursor-shadow-workspace`, `cursor-socket`, `cursor-worktree-textmate`) do not activate on `onUri`. → **Those extension IDs are NOT deep-linkable.** Only two Anysphere extensions route URLs.

- **Searched:** primary documentation for the complete deeplink surface. [cursor.com/docs/integrations/deeplinks](https://cursor.com/docs/integrations/deeplinks) documents only `/prompt`, `/command`, and `/rule` — not `/mcp/install`, `/pr-review`, `/plugin/add`, `/background-agent`, `/settings`, `/glass`, or `/createchat`. MCP install is documented separately at [cursor.com/docs/context/mcp/install-links](https://cursor.com/docs/context/mcp/install-links). The other four are undocumented externally — binary is the only authoritative reference.

---

## Gaps / follow-ups

- **`--chat` behavior across versions:** `cursor --chat` is declared but unused in the main process at 3.1.15. Worth re-checking on point-releases; the flag name + `"Open a standalone chat window"` description strongly suggest an in-flight renderer path. If/when this flag activates, it becomes the lightweight local analog of `codex app` — worth calling out in the primary report.

- **How `deeplink.prompt.prefill`'s mode param interacts with "background":** the handler maps `{ask, agent, debug, plan}` but the background-composer route is a separate path. A `mode=background` param would be a natural extension; not present today.

- **Whether `cursor-agent` or `cursor agent` could be composed with a `cursor://` URL to produce "open IDE, pre-fill prompt, start agent in current window" in a single command.** No binary evidence of such composition. A shell script calling `cursor <path>` then `open 'cursor://anysphere.cursor-deeplink/prompt?text=...'` achieves the same user outcome in two hops.

- **Whether `/prompt` rendering preserves newlines and code fences** in the composer's pre-fill state. The dialog shows `{ message: u, className: gGn }` (monospace-ish class) but whether the actual composer receives markdown-structured or plain-text content is a renderer-behavior question not resolvable from the minified bundle without dynamic testing.

- **Whether signed JWT payloads for `/createchat` are Anysphere-only or broadly re-usable.** `listJwtPublicKeys` fetches from Cursor's backend (`api3.cursor.sh` path indicated in the transport setup); third parties cannot self-sign.

- **Whether the `workspace=<name>` param could be extended to open in a VS Code workspace by file path rather than name.** The current `deeplink.routeToWorkspaceName` command strictly matches window.workspace names, not paths — a natural follow-up if Cursor ever exposes a path-based routing param.

---

## Sources

- [Cursor Deeplinks documentation](https://cursor.com/docs/integrations/deeplinks) — official public reference (covers `/prompt`, `/command`, `/rule` only)
- [Cursor MCP install-links documentation](https://cursor.com/docs/context/mcp/install-links) — official reference for `/mcp/install`
- [CursorJack disclosure (Proofpoint)](https://www.proofpoint.com/us/blog/threat-insight/cursorjack-weaponizing-deeplinks-exploit-cursor-ide)
- [CursorJack disclosure (Hendry Adrian)](https://www.hendryadrian.com/cursorjack-weaponizing-deeplinks-exploit-cursor-ide/) — original Sept 2025 write-up
- [Cursor CLI overview](https://cursor.com/docs/cli/overview)
- [Cursor CLI headless mode](https://cursor.com/docs/cli/headless)
- [Cursor forum: "New Deep Link to Trigger Agent Requests"](https://forum.cursor.com/t/new-deep-link-to-trigger-agent-requests/108832) — community feature-request thread
- [aiengineerguide.com: One-Click MCP Install with Cursor Deeplinks](https://aiengineerguide.com/til/cursor-mcp-deeplink/) — community tutorial corroborating the `/mcp/install` format
- [Smithery: Deep Linking](https://smithery.ai/docs/use/deep-linking) — third-party MCP registry documenting the install-link integration
