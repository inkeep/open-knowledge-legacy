# Evidence: Codex Desktop — URL Scheme, Deep Links, and CLI Bridge

**Dimension:** D2 — Codex Desktop
**Date:** 2026-04-16
**Sources:** `/Applications/Codex.app/` (version 26.406.31014, OpenAI) — Info.plist, `app.asar`, Electron main-process bundle, bundled `codex` Rust CLI

---

## Key files / pages referenced
- `/Applications/Codex.app/Contents/Info.plist` — URL scheme registration
- `/Applications/Codex.app/Contents/Resources/app.asar` (extracted to `/tmp/codex-asar-dump/extracted`)
- `extracted/package.json` — `openai-codex-electron` v26.406.31014
- `extracted/.vite/build/main-BctBUwXr.js` — Electron main process
- `extracted/.vite/build/product-name-DH3nvCaM.js` — contains `setAsDefaultProtocolClient('codex')` and the URL parser
- `/Applications/Codex.app/Contents/Resources/codex` — 137 MB Rust CLI binary (Mach-O arm64)

---

## Findings

### Finding 1: Codex.app registers the `codex://` scheme
**Confidence:** CONFIRMED
**Evidence:** `Info.plist` → `CFBundleURLTypes`:

```text
[{"CFBundleURLName":"Codex","CFBundleURLSchemes":["codex"]}]
```

`product-name-DH3nvCaM.js` contains `setAsDefaultProtocolClient('codex')`. Protocol registration happens via `I.deepLinks.registerProtocolClient()` in the main process startup.

### Finding 2: Codex ships a complete URL parser with a typed route shape
**Confidence:** CONFIRMED
**Evidence:** `product-name-DH3nvCaM.js` — function `Z9` (the URL → route shape converter), extracted verbatim:

```javascript
function Z9(e) {
  if (!e.startsWith("codex://")) return null;
  let t;
  try { t = new URL(e); } catch { return null; }
  if (t.protocol !== "codex:") return null;
  switch (t.host) {
    case "settings":    return { kind: "settings" };
    case "skills":      return { kind: "skills" };
    case "automations": return { kind: "automations" };
    case "connector":   return Qfe(t, e) ?? null;   // -> connectorOAuthCallback
    case "new":         return $9(t) ?? null;       // -> newThread
    case "threads": {
      let e = t.pathname.split("/").filter(Boolean)[0];
      return e
        ? (e === "new" ? ($9(t) ?? { kind: "newThread" })
          : UUID_REGEX.test(e) ? { kind: "localConversation", conversationId: ... }
          : null)
        : null;
    }
    default: return null;
  }
}
```

Where `$9` parses the query string for a new thread:

```javascript
function $9(e) {
  let t = searchParams.get("prompt"),
      n = searchParams.get("originUrl"),
      r = searchParams.get("path");
  return (t == null && n == null && r == null)
    ? null
    : { kind: "newThread", prompt: t ?? undefined, originUrl: n, path: r };
}
```

### Finding 3: Full Codex URL surface (enumerated from the parser)
**Confidence:** CONFIRMED

| URL | Behavior |
|---|---|
| `codex://settings` | Navigate to settings |
| `codex://skills` | Navigate to skills panel |
| `codex://automations` | Navigate to automations (create mode) |
| `codex://new?prompt=<p>&path=<p>&originUrl=<u>` | **Open new thread with pre-filled prompt, workspace path, or git origin URL** |
| `codex://threads/new?prompt=<p>&path=<p>&originUrl=<u>` | Same as above (alt syntax) |
| `codex://threads/<uuid>` | Open existing conversation by UUID |
| `codex://connector/oauth_callback?returnTo=<url>` | OAuth callback for connector |

Case `default` returns `null` (unknown paths silently ignored).

### Finding 4: `newThread` dispatches to `prefillPrompt` — the full capability we're looking for
**Confidence:** CONFIRMED
**Evidence:** `main-BctBUwXr.js` — the route dispatcher:

```javascript
async function Pp({window, route, globalState, gitManager, appServerClient, windowManager, navigateToRoute}) {
  switch (route.kind) {
    case "settings":   navigateToRoute(window, "/settings"); return;
    case "skills":     navigateToRoute(window, "/skills"); return;
    case "automations":navigateToRoute(window, "/automations", {automationMode: "create"}); return;
    case "connectorOAuthCallback":
      windowManager.sendMessageToWindow(window, {
        type: "connector-oauth-callback",
        fullRedirectUrl: route.fullRedirectUrl,
        returnTo: route.returnTo ?? undefined
      });
      return;
    case "newThread": {
      let workspaceRoot = await Fp({route, globalState, gitManager, appServerClient});
      if (workspaceRoot != null) Vp({...});
      navigateToRoute(window, "/", {
        focusComposerNonce: Date.now(),
        prefillPrompt: route.prompt,
        prefillCwd: workspaceRoot ?? undefined,
      });
      return;
    }
    case "localConversation":
      navigateToRoute(window, `/local/${route.conversationId}`);
      return;
  }
}
```

**The dispatcher flows `route.prompt` into `prefillPrompt`, which the webview composer consumes to seed the chat.** `originUrl` and `path` both resolve to a `workspaceRoot` via `Fp` → `Ip` (filesystem stat) → `Lp` (match git origin URL to known workspaces).

**Working example:**

```bash
open 'codex://new?prompt=Summarize%20this%20file&path=/Users/me/my-project'
open 'codex://new?prompt=Fix%20the%20failing%20test&originUrl=git@github.com:acme/widget.git'
```

### Finding 5: CLI argv flag `--open-project` is a second entry point
**Confidence:** CONFIRMED
**Evidence:** `product-name-DH3nvCaM.js`:

```javascript
var J9 = "--open-project";
function Q9(e, {allowBareWindowsProjectPathArg: t = false} = {}) {
  let n = [];
  for (let r = 0; r < e.length; r += 1) {
    let i = e[r];
    if (i === J9) {
      let path = e[r+1]?.trim();
      r += 1;
      if (path) n.push({kind: "newThread", path});
      continue;
    }
    if (i.startsWith(`${J9}=`)) {
      let path = i.slice(15).trim();  // "--open-project=" length 15
      if (path) n.push({kind: "newThread", path});
      continue;
    }
    let parsed = Z9(i);  // try as codex:// URL
    if (parsed) { n.push(parsed); continue; }
    if (t /* Windows */ && r > 0 && isWindowsAbsolutePath(i)) {
      n.push({kind: "newThread", path: i});
    }
  }
  return n;
}
```

Accepts both:
- `Codex.app --open-project /path/to/repo`
- `Codex.app --open-project=/path/to/repo`
- Plus bare positional args on Windows (for Explorer "Open With" integration).

Multiple URLs/paths in one argv list produce multiple queued deep links.

### Finding 6: `codex app [PATH]` CLI command launches the Desktop app with a workspace
**Confidence:** CONFIRMED
**Evidence:** `codex app --help`:

```text
Usage: codex app [OPTIONS] [PATH]

Arguments:
  [PATH]    Workspace path to open in Codex Desktop  [default: .]

Options:
  --download-url <DOWNLOAD_URL>
            Override the macOS DMG download URL (advanced)
            [default: https://persistent.oaistatic.com/codex-app-prod/Codex.dmg]
```

Notes:
- This is a *separate binary* (`/Applications/Codex.app/Contents/Resources/codex`, a 137 MB Rust Mach-O). The full CLI supports `codex exec`, `codex resume`, `codex fork`, `codex mcp-server`, `codex cloud`, etc.
- `codex app` launches the Desktop app — and because the CLI inherits the `--open-project` convention, the most likely implementation is that `codex app <path>` spawns `Codex.app --open-project=<path>`. This was not directly verified by binary inspection, but is the natural bridge.
- No `--prompt` flag exists on `codex app`; to seed a prompt you still need the `codex://new?prompt=...` URL form.

### Finding 7: Menu affordances for deep-link debugging
**Confidence:** CONFIRMED
**Evidence:** `main-BctBUwXr.js` — developer/debug menu:

```javascript
_e = {
  label: "Open Deeplink from Clipboard",
  click: () => {
    d(clipboard.readText().trim()) ||
      dialog.showMessageBox({
        type: "info",
        title: "Invalid Deeplink",
        message: "Clipboard does not contain a valid codex:// deeplink.",
        detail: "Copy a codex:// URL to the clipboard and try again.",
      });
  }
};
```

Also a "Copy deeplink" menu item (`type:'copy-deeplink'`) that copies the current conversation's deeplink to clipboard. **This reveals Codex treats deep-linking as a first-class feature, not a hidden mechanism** — users can copy-and-paste deeplinks to share conversations.

### Finding 8: Bundle identifier varies by build flavor (for registrations)
**Confidence:** CONFIRMED
**Evidence:** `product-name-DH3nvCaM.js`:

```javascript
function Yfe(e) {
  switch (e) {
    case IM.Agent:         return "com.openai.codex.agent";
    case IM.Dev:           return "com.openai.codex.dev";
    case IM.Nightly:       return "com.openai.codex.nightly";
    case IM.InternalAlpha: return "com.openai.codex.alpha";
    case IM.PublicBeta:    return "com.openai.codex.beta";
    case IM.Prod:          return "com.openai.codex";
  }
}
```

Public Codex.app uses `com.openai.codex` as bundle id. All flavors register the same `codex://` scheme (could cause first-registered-wins conflicts on machines with multiple flavors installed).

---

## Comparison: Claude vs Codex deep-link surface

| Capability | Claude Desktop (`claude://`) | Codex Desktop (`codex://`) |
|---|---|---|
| Open new conversation | `claude://claude.ai/new` | `codex://new` or `codex://threads/new` |
| Pre-fill prompt | `?q=<prompt>` | `?prompt=<prompt>` |
| Workspace/path hint | ❌ not supported by main-process router | `?path=<abs-path>` or `?originUrl=<git-url>` |
| Open existing conversation | `claude://claude.ai/chat/<id>` | `codex://threads/<uuid>` |
| Settings | `claude://claude.ai/settings` | `codex://settings` |
| OAuth callback | `claude://claude.ai/mcp-auth-callback` + `.../sso-callback` | `codex://connector/oauth_callback` |
| Copy-deeplink UI | Not found | "Copy deeplink" menu item present |
| CLI bridge to Desktop | None (CLI is terminal TUI) | `codex app [PATH]` launches Desktop |
| CLI argv flag for Desktop | N/A | `--open-project <path>` |

**Prompt param name differs:** Claude uses `q` (like Google search); Codex uses `prompt`. Callers must write two versions if targeting both.

---

## Negative searches

- **Searched:** `codex://` with `message=`, `text=`, `chat=`, `input=` params. Parser only reads `prompt`, `path`, `originUrl`, `returnTo`, `fullRedirectUrl`. → **Only `prompt` seeds the composer.**
- **Searched:** multi-message history injection via URL (e.g., seeding a conversation with past exchange). Parser has no such parameter. → **Not supported via URL scheme.**
- **Searched:** file-attachment via URL (local file path or URL to attach). Parser does not extract attachment paths. → **Not URL-exposed;** the `-i, --image <FILE>...` flag on the CLI attaches images to a CLI-started session, not a Desktop-forwarded one.
- **Searched:** official OpenAI documentation for `codex://` scheme. No in-binary `docs/` or `README.md` found in app.asar. → **Deep-link syntax is undocumented publicly** (to the best of binary inspection); app menu exposes it via Copy deeplink.

---

## Gaps / follow-ups

- Whether the webview composer applies additional cleaning/filtering to `prefillPrompt` (length cap, markdown stripping). Not visible from main-process bundle — in the webview assets (`webview/assets/*.js`).
- Whether `codex app <path>` and `codex --open-project=<path>` both produce identical deeplink queueing (mild distinction — CLI might do workspace validation first).
- Whether future Codex builds add file-attachment params to the URL scheme. Worth re-probing periodically.
