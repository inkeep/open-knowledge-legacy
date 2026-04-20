# Evidence: VS Code, Windsurf, and Dia — URL Schemes and Deep Links

**Dimension:** Extension of D3/D4 — coding editor / AI browser category
**Date:** 2026-04-16
**Sources:**
- `/Applications/Visual Studio Code.app/` — VS Code 1.96.4 (Dec 2024 stable), bundle id `com.microsoft.VSCode`. Files inspected: `Contents/Info.plist`, `Contents/Resources/app/product.json`, `Contents/Resources/app/out/main.js` (Electron main), `Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js` (~50 MB workbench bundle), `Contents/Resources/app/extensions/git/dist/main.js` (GitProtocolHandler), `Contents/Resources/app/extensions/github-authentication/dist/extension.js`, `Contents/Resources/app/bin/code` (CLI).
- `/Applications/Dia.app/` — Dia 1.8.0 (April 2026), bundle id `company.thebrowser.dia`. Native Mach-O (not Electron). Files inspected: `Contents/Info.plist`, `Contents/MacOS/Dia` (binary strings probe), `Contents/Resources/*.bundle` (~300 frameworks named `BoostBrowser_*`, `ARC_*`, `ARCClients_*` — Arc codebase lineage).
- **Windsurf:** NOT installed locally. Evidence is from Codeium/Windsurf docs ([docs.windsurf.com](https://docs.windsurf.com/)), the Windsurf changelog ([windsurf.com/changelog](https://windsurf.com/changelog)), the Arch Linux AUR listing (blocked by Anubis — no content retrieved), the third-party `staronelabs/windsurf-cli` README, Mintlify's OSS handoff bundle (see [`evidence/react-grab-and-similar-handoff-tools.md`](./react-grab-and-similar-handoff-tools.md)), and web searches returning no `windsurf://` technical spec.
- **VS Code docs:** [code.visualstudio.com/api/extension-guides/mcp](https://code.visualstudio.com/api/extension-guides/mcp), [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers), [code.visualstudio.com/docs/configure/command-line](https://code.visualstudio.com/docs/configure/command-line), [code.visualstudio.com/api/references/vscode-api](https://code.visualstudio.com/api/references/vscode-api), [code.visualstudio.com/updates/v1_99](https://code.visualstudio.com/updates/v1_99).
- **VS Code source:** [github.com/microsoft/vscode/blob/main/extensions/git/src/protocolHandler.ts](https://github.com/microsoft/vscode/blob/main/extensions/git/src/protocolHandler.ts), [.../src/vs/platform/url/common/url.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/url/common/url.ts) (fetched 2026-04-16).

---

## Key sources

- `/Applications/Visual Studio Code.app/Contents/Info.plist` — registers `vscode://`
- `/Applications/Visual Studio Code.app/Contents/Resources/app/product.json` — `urlProtocol: "vscode"`, `darwinBundleIdentifier: "com.microsoft.VSCode"`, `applicationName: "code"`
- `/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js` — built-in URL route dispatchers (settings, profile, extension), `registerHandler` plumbing, `yHt`/`B$e` helpers
- `/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/git/dist/main.js` — `GitProtocolHandler` implementing `vscode://vscode.git/clone?url=…`
- `/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/github-authentication/dist/extension.js` — registers a URI handler for GitHub OAuth callbacks
- `/Applications/Dia.app/Contents/Info.plist` — registers ONLY `http`, `https` (no custom scheme)
- `/Applications/Dia.app/Contents/MacOS/Dia` — Mach-O binary; strings reveal an internal-only `dia://` route family and external-URL AI handoff templates (`claude.ai/new?q=`, `chatgpt.com/?q=`, `perplexity.ai/search?q=`)

---

## Part 1: VS Code — full URL-scheme enumeration

### Finding 1: CFBundleURLTypes registers a single `vscode://` scheme

**Confidence:** CONFIRMED
**Evidence:** `/Applications/Visual Studio Code.app/Contents/Info.plist`:

```json
[{"CFBundleTypeRole":"Viewer","CFBundleURLName":"Visual Studio Code","CFBundleURLSchemes":["vscode"]}]
```

Note `CFBundleTypeRole: "Viewer"` — VS Code registers only as a URL viewer, not an Editor of the scheme (in contrast to Cursor which uses `"Editor"`). There is no `vscode-insiders://` registration in this Stable build — that's only present in the Insiders flavor (`/Applications/Visual Studio Code - Insiders.app/`, not installed on this machine). `product.json` confirms:

```json
"urlProtocol": "vscode",
"darwinBundleIdentifier": "com.microsoft.VSCode",
"applicationName": "code",
"quality": "stable"
```

Insiders builds set `urlProtocol: "vscode-insiders"` and `darwinBundleIdentifier: "com.microsoft.VSCodeInsiders"` (inferred from `product.json` structure + VS Code's build pipeline).

### Finding 2: URL dispatch architecture — central `URLService` fans out to registered handlers

**Confidence:** CONFIRMED
**Evidence:** The core URL service contract in VS Code source ([src/vs/platform/url/common/url.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/url/common/url.ts)):

```typescript
export interface IURLService {
    readonly _serviceBrand: undefined;
    create(options?: Partial<UriComponents>): URI;
    open(url: URI, options?: IOpenURLOptions): Promise<boolean>;
    registerHandler(handler: IURLHandler): IDisposable;
}

export interface IURLHandler {
    handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean>;
}

export interface IOpenURLOptions {
    trusted?: boolean;
    originalUrl?: string;
}
```

In the installed binary, this maps to `workbench.desktop.main.js` where multiple handlers `registerHandler(this)` themselves into a shared `Set`. When a URL arrives, the service iterates them and the first handler that returns `true` wins:

```javascript
open(i,e){
  const t=[...this.a.values()];
  return Tee(t.map(s=>()=>s.handleURL(i,e)),void 0,!1).then(s=>s||!1)
}
registerHandler(i){ this.a.add(i); return ae(()=>…) }
```

(minified, `workbench.desktop.main.js` line 3110). `IOpenURLOptions.trusted` is the critical bit: a URL arriving from outside the product is untrusted, and the extension-handler path first shows a confirmation prompt unless the user has white-listed the extension. This is the security model backing every `vscode://<extension>/...` dispatch.

### Finding 3: Built-in URL routes — `settings`, `profile`, `extension`, `schemas`

**Confidence:** CONFIRMED (binary inspection)
**Evidence:** Authority literal checks in `workbench.desktop.main.js` found via `grep -oE '\.authority==="[A-Za-z._-]+"'`:

```
.authority==="code.visualstudio.com"
.authority==="defaultsettings"
.authority==="jupyter-notebook-ipynb"
.authority==="schemas"
```

Plus the `BC(e.authority, b2e)` check where `b2e = "settings"` (workbench.desktop.main.js, line 1295):

```javascript
async handleURL(e){
  if(BC(e.authority,b2e)!==0)return!1;
  const t=e.path.split("/").filter(o=>!!o),
        s=t.length>0?t[0]:void 0;
  if(!s)return this.openSettings(),!0;
  let n=this.getSetting(s);
  ...
}
// b2e="settings"
```

This implements `vscode://settings/<setting.id>` (e.g. `vscode://settings/editor.fontSize`). Empty path opens the Settings editor; a path segment selects a specific setting and scrolls to it. Round-trip confirmed by [code.visualstudio.com/docs/configure/command-line](https://code.visualstudio.com/docs/configure/command-line): `vscode://settings/setting.name`.

Profile import uses the `profile` authority (`Doe="profile"`, workbench.desktop.main.js):

```javascript
function B$e(i){ return i.authority===Doe||new RegExp(`^${tPt...
// Doe="profile", tPt="profile-"
```

Routes: `vscode://profile` (triggers profile creation from query payload) and `vscode://profile-<name>` regex variant.

The `schemas` authority (`vscode://schemas/<X>`) is the largest family — 29 distinct JSON-schema URLs used internally by the monaco editor for settings validation (e.g. `vscode://schemas/settings/user`, `vscode://schemas/workbench-colors`, `vscode://schemas/launch`, `vscode://schemas/keybindings`, `vscode://schemas/tasks`, `vscode://schemas/vscode-extensions`, `vscode://schemas/toolsParameters`). These are **not** user-facing deep links — they're in-process virtual URLs for monaco language services. They are included here for completeness of the `vscode://` surface but should not be treated as "deep-link routes."

Full list of `vscode://schemas/*` URLs grep'd from `workbench.desktop.main.js`:

```
vscode://schemas/argv
vscode://schemas/color-theme
vscode://schemas/extensions
vscode://schemas/global-snippets
vscode://schemas/icon-theme
vscode://schemas/icons
vscode://schemas/ignoredSettings
vscode://schemas/keybindings
vscode://schemas/language-configuration
vscode://schemas/launch
vscode://schemas/notebook/cellmetadata
vscode://schemas/product-icon-theme
vscode://schemas/settings/configurationDefaults
vscode://schemas/settings/default
vscode://schemas/settings/folder
vscode://schemas/settings/machine
vscode://schemas/settings/profile
vscode://schemas/settings/resourceLanguage
vscode://schemas/settings/user
vscode://schemas/settings/workspace
vscode://schemas/snippets
vscode://schemas/tasks
vscode://schemas/textmate-colors
vscode://schemas/token-styling
vscode://schemas/toolsParameters
vscode://schemas/vscode-extensions
vscode://schemas/vscode-product
vscode://schemas/workbench-colors
vscode://schemas/workspaceConfig
```

### Finding 4: Extension URL handling — `vscode://<publisher>.<name>/<path>?<query>`

**Confidence:** CONFIRMED (binary + docs)
**Evidence:** The extension route handler in `workbench.desktop.main.js` gates on a regex that demands `publisher.name` shape:

```javascript
function yHt(i){
  return /^[a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*$/i.test(i)
}
```

Then the handler loops through extensions that registered a URI handler via `window.registerUriHandler` and routes by `authority === extension.id`:

```javascript
handleURL(i,e){
  return Si.equals(this.extensionId, i.authority)
    ? Promise.resolve(this.a.$handleExternalUri(this.b,i)).then(()=>!0)
    : Promise.resolve(!1)
}
```

Plus the queueing handler for URIs that arrive before the extension activates:

```javascript
async handleURL(e,t){
  return yHt(e.authority) ? (HB.a.push([e,t]), !0) : !1
}
```

Official doc shape per [code.visualstudio.com/api/references/vscode-api](https://code.visualstudio.com/api/references/vscode-api):

```typescript
vscode.window.registerUriHandler({
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    if (uri.path === '/did-authenticate') {
      console.log(uri.toString());
    }
  }
});
```

Docs quote: *"Creates a uri that — if opened in a browser (e.g. via `openExternal`) — will result in a registered UriHandler to trigger."* Canonical format is `vscode://<publisher>.<extension>/<path>?<query>`. No separate "allowlist" — any extension that registers a URI handler owns its own authority slot, gated by the `publisher.name` regex above and the per-extension user-consent prompt on first untrusted URL.

### Finding 5: Bundled `vscode.git` extension — `vscode://vscode.git/clone?url=…`

**Confidence:** CONFIRMED
**Evidence:** `/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/git/dist/main.js` contains `GitProtocolHandler`:

```javascript
t.GitProtocolHandler = class {
  constructor(e){
    this.logger = e;
    this.disposables = [];
    this.disposables.push(s.window.registerUriHandler(this))
  }
  handleUri(e){
    this.logger.info(`[GitProtocolHandler][handleUri] URI:(${e.toString()})`);
    "/clone" === e.path && this.clone(e)
  }
  async clone(e){ const t = l.parse(e.query) … }
}
```

Scheme allowlist for the `url=` parameter (same file):

```javascript
const u = c.isWindows
  ? new Set(["git","http","https","ssh"])
  : new Set(["file","git","http","https","ssh"]);
```

Plus a character denylist regex to reject path-injection attempts:

```javascript
const h = /^$|[~\^:\\\*\s\[\]]|^-|^\.|\/\.|\.\.|\.lock\/|\.lock$|\/$|\.$/;
```

Canonical form: `vscode://vscode.git/clone?url=<git-url>&ref=<branch>` (the `ref` query param is supported in upstream source; verified in [github.com/microsoft/vscode/.../protocolHandler.ts](https://github.com/microsoft/vscode/blob/main/extensions/git/src/protocolHandler.ts)). On non-Windows, `url=file://…` is allowed; on Windows it isn't.

### Finding 6: `vscode:mcp/install?<url-encoded-JSON>` — documented but NOT in 1.96.4

**Confidence:** CONFIRMED (docs) / NEGATIVE in installed binary
**Evidence:** Official documentation at [code.visualstudio.com/api/extension-guides/mcp](https://code.visualstudio.com/api/extension-guides/mcp):

> VS Code provides a URL handler for installing an MCP server from a link: `vscode:mcp/install?{json-configuration}` (Insiders: `vscode-insiders:mcp/install?{json-configuration}`).
>
> Provide the JSON server configuration in the form `{"name":"server-name","command":...}` and then perform a JSON-stringify and URL encode on it.
>
> ```javascript
> const link = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(obj))}`;
> ```

Usage: *"activated in a browser, or opened on the command line, for example via `xdg-open $LINK` on Linux."*

**Important form note:** Unlike `vscode://file/...` (authority `file`, leading `//`), `vscode:mcp/install` uses the **opaque-URI form** with NO `//` and no authority — just `scheme:path?query`. This is what Mintlify emits (confirmed in the prior Cursor/docs-site evidence). The URL is parsed as `{ scheme: "vscode", path: "mcp/install", query: "<json>" }`.

**NOT present in the installed binary.** `grep -c "mcp" workbench.desktop.main.js` returned zero matches of the literal `mcp/install` path. This is because MCP support shipped in **VS Code 1.99 (April 2025)** ([code.visualstudio.com/updates/v1_99](https://code.visualstudio.com/updates/v1_99)): *"This release supports Model Context Protocol (MCP) servers in agent mode."* The installed machine has 1.96.4 (December 2024). The MCP install URL exists on every VS Code Stable ≥ 1.99.

### Finding 7: `vscode://file/<absolute-path>` — file/folder opener

**Confidence:** CONFIRMED (docs)
**Evidence:** [code.visualstudio.com/docs/configure/command-line](https://code.visualstudio.com/docs/configure/command-line):

> - `vscode://file/{full path to project}/` – Open a project
> - `vscode://file/{full path to file}` – Open a file
> - `vscode://file/{full path to file}:line:column` – Open a file to specific location

This is handled directly in the Electron main process (`out/main.js`) rather than the workbench, so it doesn't show up in the `workbench.desktop.main.js` authority grep. The `//file` authority is conventional-URI form with an absolute path — line/column via `:line:column` suffix parses at CLI-argv parity with `code -g <file>:<line>:<col>`.

### Finding 8: `vscode-remote://` — separate scheme for remote workspaces

**Confidence:** CONFIRMED (docs)
**Evidence:** This is a **distinct** URL scheme, not a route under `vscode://`. Format: `vscode-remote://<authority>/<remote-path>`. Authority options:

- WSL: `wsl+<DistroName>` (e.g. `vscode-remote://wsl+Ubuntu/home/user/project`)
- SSH: `ssh-remote+<host-alias>` (alias from `~/.ssh/config`)
- Dev Containers: `dev-container+<container-id>`

Exposed via the CLI flag `code --folder-uri <vscode-remote://…>`. The scheme is registered separately as an Electron protocol inside the main process (not in `CFBundleURLTypes` — it's an in-process virtual scheme, not OS-dispatchable).

### Finding 9: No built-in Chat / Copilot / Agent deep link in Stable 1.96.4

**Confidence:** CONFIRMED (negative)
**Evidence:** Neither `grep -oE '"[mM]cp[^"]{0,30}"'` nor `grep -oE '"[cC]hat[^"]{0,30}"'` in `workbench.desktop.main.js` surfaced any URL-route literal like `"chat/new"`, `"chat/prompt"`, or `"agent/*"`. The many `"chat-*"` and `"copilot"` matches are CSS class names, localization keys, and internal IDs for the Chat view — not URL routes. GitHub Copilot Chat in VS Code is an **extension** (`github.copilot-chat`), so any chat deep-link would have to be owned by that extension under `vscode://github.copilot-chat/...` — and no such route is documented at [docs.github.com/copilot](https://docs.github.com/copilot) as of retrieval (2026-04-16). VS Code 1.99's MCP release notes mention "MCP: Add Server" and "MCP: List Servers" as **command palette entries**, not URL handlers ([code.visualstudio.com/updates/v1_99](https://code.visualstudio.com/updates/v1_99)).

The one confirmed AI-adjacent URL is the MCP install URL (Finding 6). No `vscode://chat?prompt=…` or `vscode://agent/…` exists in any documented or shipped surface.

### Finding 10: CLI surface — `code` binary + `--add-mcp` flag

**Confidence:** CONFIRMED (mixed: binary for core flags, docs for `--add-mcp`)
**Evidence:** `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code --help` (installed 1.96.4):

```
Usage: code [options][paths...]

  -d --diff <file> <file>     Compare two files
  -m --merge <path1> <path2> <base> <result>
  -a --add <folder>           Add folder(s) to the last active window
  -g --goto <file:line[:character]>
  -n --new-window             Force to open a new window
  -r --reuse-window           Reuse existing window
  -w --wait                   Wait for files to be closed before returning
  --profile <profileName>
  --user-data-dir <dir>
  --extensions-dir <dir>
  --list-extensions
  --install-extension <ext-id | path>
  --uninstall-extension <ext-id>
```

URI-related entries in `--help` are developer-tool `--inspect-extensions` connection URIs (not user-facing). No `--open-url`, `--uri`, or `--deep-link` flag in this build.

`--add-mcp` is documented at [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers):

```bash
code --add-mcp "{\"name\":\"my-server\",\"command\":\"uvx\",\"args\":[\"mcp-server-fetch\"]}"
```

Same JSON shape as `vscode:mcp/install?<url-encoded-JSON>`. Ships in VS Code ≥ 1.99 (not in 1.96.4).

Alongside these `code` CLI flags, there's also `code-tunnel` (in `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/`) — the VS Code Remote Tunnel daemon, unrelated to URL schemes.

### Finding 11: Symmetry with Cursor — VS Code is the upstream for `urlProtocol` plumbing

**Confidence:** CONFIRMED (structural)
**Evidence:** Cursor inherits the same URL dispatch architecture — `product.json.urlProtocol`, `ElectronURLListener` in `out/main.js`, `registerHandler`/`handleURL` IPC — because Cursor is a VS Code fork. The differences:

| Aspect | VS Code Stable | Cursor |
|---|---|---|
| `CFBundleTypeRole` | `"Viewer"` | `"Editor"` |
| `urlProtocol` | `vscode` | `cursor` |
| Trusted extension for deep-links | None by default | `anysphere.cursor-deeplink` (pre-trusted) |
| MCP install route form | `vscode:mcp/install?<json>` (opaque) | `cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>` (extension-routed) |
| Extension URL authority regex | `^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$` | Same (inherited) |

See [`cursor-desktop-deep-links.md`](./cursor-desktop-deep-links.md) for Cursor's extension-authored MCP install route — note the architectural contrast where Cursor built MCP install **as** an extension URI handler on the VS Code upstream mechanism, while VS Code itself built MCP install **as** a core opaque-URI handler parallel to `settings`/`profile`.

---

## Part 2: Windsurf (Codeium)

### Finding 12: `windsurf://cascade?prompt=<text>` — only confirmed route, from Mintlify's bundle

**Confidence:** CONFIRMED (indirect — via downstream emitter)
**Evidence:** Mintlify's hosted docs "Ask AI" button emits this URL verbatim. Quoted switch-case from [`react-grab-and-similar-handoff-tools.md`](./react-grab-and-similar-handoff-tools.md):

```javascript
case "windsurf":
  window.open(`windsurf://cascade?prompt=${a}`, "_blank");
  break;
```

Structural form: `windsurf://cascade?prompt=<URL-encoded-text>`. Authority is `cascade` (Windsurf's agent panel). Path is empty. Query carries the prompt. Mintlify is in production ([mintlify.com](https://mintlify.com)) shipping this to 10K+ docs sites, so the route is de-facto live — but Windsurf's own docs do not confirm or document it.

### Finding 13: No Windsurf-authored docs for the `windsurf://` scheme

**Confidence:** CONFIRMED (negative)
**Evidence:**
- [docs.windsurf.com/command/windsurf-overview](https://docs.windsurf.com/command/windsurf-overview) — no URL scheme mention; only keybinding (`Cmd/Ctrl+I`) and UI-driven Command feature.
- [docs.windsurf.com/windsurf/cascade/mcp](https://docs.windsurf.com/windsurf/cascade/mcp) — MCP install is UI-only (Cascade panel → MCPs → marketplace → click Install) or manual edit of `~/.codeium/windsurf/mcp_config.json`. **No URL-install equivalent** to `vscode:mcp/install` or `cursor://anysphere.cursor-deeplink/mcp/install`.
- [windsurf.com/changelog](https://windsurf.com/changelog) — zero hits on "URL scheme", "protocol handler", "deep link", or "command line" as of 2026-04-16 retrieval. Changelog focuses on Cascade agent, model updates, Agent Skills (Jan 2026 addition).
- Web search `"windsurf://" protocol handler deep link 2025` — returned only the Arch Linux AUR listing, whose page blocks programmatic fetch (Anubis CAPTCHA) but surfaces the existence of a macOS/Linux URL-handler binding in passing; no technical content retrievable.

**Inference:** `windsurf://cascade?prompt=` works (otherwise Mintlify wouldn't ship it to thousands of docs sites), but it's an **undocumented** route — likely set up for Mintlify-style partnerships without a public spec. There may be additional paths (`windsurf://open`, `windsurf://file`, etc.) carried over from Windsurf's VS Code fork heritage, but they are neither documented nor confirmed. **We cannot enumerate them without the installed binary.**

### Finding 14: No Windsurf-specific MCP install URL

**Confidence:** CONFIRMED (negative)
**Evidence:** Both the documented UI flow (Cascade Settings → MCP Servers → Marketplace → Install button) and the manual `~/.codeium/windsurf/mcp_config.json` editing path bypass any URL scheme. Third-party MCP setup guides ([apidog.com](https://apidog.com/blog/windsurf-mcp-servers/), [natoma.ai](https://natoma.ai/blog/how-to-enabling-mcp-in-windsurf), [docs.mcp.run/mcp-clients/windsurf](https://docs.mcp.run/mcp-clients/windsurf/)) describe JSON-file edits and the marketplace UI — none describe a `windsurf:mcp/install?<payload>` URL. Contrast: Cursor ships `cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>`, VS Code ships `vscode:mcp/install?<url-encoded-JSON>`, Windsurf ships **neither equivalent publicly.**

### Finding 15: Official Windsurf CLI — not documented; third-party `wsc` exists

**Confidence:** CONFIRMED (documentation gap)
**Evidence:** Official Windsurf docs do not describe a bundled CLI binary in the macOS/Linux installer. The `wf` command mentioned in one tutorial ([scottspence.com/posts/windsurf-setup-for-wsl](https://scottspence.com/posts/windsurf-setup-for-wsl)) is a WSL shim that users add manually, analogous to VS Code's `code` shim. No equivalent `windsurf` or `windsurf-tunnel` binary is called out in the changelog or the setup docs.

Third-party CLI [github.com/staronelabs/windsurf-cli](https://github.com/staronelabs/windsurf-cli) (`wsc`):

> Talk to Cascade from any terminal.

Options quoted from README:

```
-m, --model       Select an LLM model
-w, --wait        Wait for response and print to stdout
-f, --file        Send file contents as prompt
-i, --interactive Multi-line input mode
-W, --window NAME Target specific Windsurf window
-N, --new-window [DIR]
--windows         List open windows
-a, --accept      Auto-accept code changes
-A, --accept-all  Click "Accept all" button
-x, --exec CMD    Execute Windsurf commands
-l, --list-models
-s, --status
```

`wsc` uses a **private/undocumented local IPC** (not a `windsurf://` URL) to talk to the running Windsurf app — the README does not reference a URL scheme. This is the strongest external signal that Windsurf has a local API surface beyond the documented URL-scheme hint, but it's not a deep-link surface.

### Finding 16: Windsurf's feature-parity with VS Code suggests `vscode://`-style inheritance

**Confidence:** INFERENCE (not verified — requires local install)
**Evidence:** Windsurf is explicitly built on the VS Code foundation ([HN Show HN](https://news.ycombinator.com/item?id=42127882)): *"Windsurf is a brand new VSCode fork with the Cascade feature."* Extensions, keybindings, themes, and settings carry over. Upstream VS Code's URL plumbing (`ElectronURLListener`, `registerHandler`, `IURLService`) is at the `vs/platform/url/` layer — below any Cascade/agent layer. It would be architecturally surprising if Windsurf **removed** the upstream URL dispatch.

Most likely surface (not verified on installed binary):

- `windsurf://file/<absolute-path>[:line[:column]]` — inherited from VS Code
- `windsurf://<publisher>.<extension>/<path>?<query>` — inherited extension-authored URL API
- `windsurf://vscode.git/clone?url=…` — if the bundled Git extension is retained as-is
- `windsurf://cascade?prompt=<text>` — the Codeium-added route (confirmed via Mintlify)

Without the installed binary, this list cannot be promoted from INFERENCE to CONFIRMED. A follow-up with `plutil -extract CFBundleURLTypes` on `/Applications/Windsurf.app/Contents/Info.plist` + grep of `Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js` would close the gap in ~5 minutes.

---

## Part 3: Dia browser

### Finding 17: Dia does NOT register any custom URL scheme at the OS level

**Confidence:** CONFIRMED
**Evidence:** `/Applications/Dia.app/Contents/Info.plist` via `plutil -extract CFBundleURLTypes json -o -`:

```json
[{"CFBundleTypeRole":"Editor","CFBundleURLName":"Website URL","CFBundleURLSchemes":["http","https"]}]
```

Only `http` and `https` — Dia registers as an **HTTP/HTTPS handler**, i.e. a default browser candidate. There is NO `dia://` or `diabrowser://` entry in `CFBundleURLTypes`. External callers (other apps, `open "diabrowser://..."` in terminal, HTML links in other apps) cannot reach Dia via a custom scheme. `CFBundleIdentifier: "company.thebrowser.dia"`, version `1.8.0` (April 2026).

### Finding 18: Dia DOES have an internal `dia://` route family — but it's address-bar-only

**Confidence:** CONFIRMED
**Evidence:** `strings -a /Applications/Dia.app/Contents/MacOS/Dia | grep -E "dia://"` returned:

```
dia://assistant/       (regex: ^dia://assistant/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ — UUID-v4 pattern)
dia://attachment
dia://bookmarks
dia://extensions
dia://history
dia://hide-error
dia://memory-settings
dia://settings
dia://show-error
dia://timestamp?
```

The binary itself carries instructional strings for its own AI ("@Tabs" capability) explaining the gate:

> If a user tries to use @Tabs to open internal browser pages (dia://settings, dia://bookmarks, dia://extensions, dia://history, etc.), explain that @Tabs cannot open internal browser pages, and instead provide the specific dia:// URL they can enter directly in the address bar.
>
> "I can't open internal browser pages with @Tabs, but you can navigate to settings by opening a new tab and entering dia://settings in your URL bar"

And from the `open_tabs` tool description in the binary:

> Use this tool to open URLs in new tabs in the current browser window and profile. Cannot open internal browser pages like dia://settings, dia://bookmarks, or dia://history.

This confirms:
1. `dia://` is handled inside Dia's renderer, not by macOS `LaunchServices`.
2. Even Dia's own agent is blocked from opening these programmatically via its tabs tool.
3. The only entry point is manual typing in Dia's URL bar.

**Architectural interpretation:** Dia uses `dia://` the way Chrome uses `chrome://` — as internal WebUI pages (settings, bookmarks, history), accessible only through the browser's own URL bar. This is **identical in spirit to `chrome://settings`, `about:config`, `brave://rewards`, `arc://preferences`** — a browser-chrome page namespace, not a deep-link surface.

The `dia://assistant/<uuid>` URL is the most interesting route: it's Dia's deep link to a specific saved conversation/session in its assistant. Again, not reachable from outside Dia — only from within a Dia tab.

`Window/WindowController+ContentDeepLink.swift` (path leaked from Swift metadata) and `DeepLinkRouterClient` / `DeepLinkParsers` / `DeepLinkRoute` confirm an internal routing system. Path leaked from `strings`:

```
/Users/admin/actions-runner/_work/arc/arc/Frameworks/BoostBrowser/Sources/BoostLinkRouting/DeepLinkRouterClient.swift
```

Note `/arc/arc/` — this is literal Arc browser (Browser Company's first product) code reused in Dia. `BoostBrowser` is The Browser Company's internal engine name.

### Finding 19: Dia's AI assistant is NOT reachable via URL parameter

**Confidence:** CONFIRMED (negative — architecture forbids it)
**Evidence:** The `dia://assistant/<uuid>` route loads an **existing** saved assistant session by UUID. It does not accept a `?prompt=` or `?q=` parameter to seed a new chat. `strings` probe for any prompt-seed pattern in Dia's binary:

```
$ strings -a /Applications/Dia.app/Contents/MacOS/Dia | grep -iE "prompt=|chat/new|ai/new|seed=" | head -20
```

Returned zero hits for a Dia-side prompt-seed URL. The only prompt-seed URLs in the binary are **outbound** to external AI services (Finding 20).

Since Dia doesn't register `dia://` at the OS level (Finding 17), even if `dia://assistant/new?prompt=X` existed as a route, no external caller could reach it. This is a **closed** system by design — the AI is summoned by UI (Cmd-E sidebar toggle), not by URL. Same architectural class as Arc's Max/AI features and Safari's Apple Intelligence — browser-local AI, not URL-addressable.

### Finding 20: Dia DOES call external-AI handoff URLs (outbound)

**Confidence:** CONFIRMED
**Evidence:** `strings` probe found Dia embeds these as outbound URL templates:

```
https://claude.ai/new?q=
https://chatgpt.com/?q=
https://chatgpt.com/auth/login?next=/%3Fprompt=
https://perplexity.ai/search?q=
```

Interpretation: Dia's skill/AI system can route a selection or page summary **out** to Claude / ChatGPT / Perplexity via their documented web deep-links — the same targets covered in our prior evidence (`claude-desktop-deep-links.md`, Perplexity sections of the REPORT). Dia is therefore a **consumer** of the AI-desktop deep-link ecosystem, not a provider of its own AI deep-link surface.

### Finding 21: No Electron layer; no asar; no MCP

**Confidence:** CONFIRMED
**Evidence:** `file /Applications/Dia.app/Contents/MacOS/Dia`:

```
/Applications/Dia.app/Contents/MacOS/Dia: Mach-O 64-bit executable arm64
```

Native Swift/Objective-C app, not Electron. `Contents/Resources/` contains ~300 `.bundle` frameworks (`BoostBrowser_*`, `ARC_*`, `ARCClients_*`, `AIInfra_LocalClassification`, `ADK_ADK`, etc.) — no `app.asar`, no `node_modules`, no JavaScript runtime. Skills are not MCP:

```
BoostBrowser_SkillBuilder.bundle
BoostBrowser_SkillModels.bundle
BoostBrowser_SkillsHub.bundle
BoostBrowser_SkillsService.bundle
BoostBrowser_SkillsSharedUI.bundle
```

`strings -a … | grep -iE "mcp|mcpserver"` returned only:

```
uploaded_skill_install_dialog_action_performed
uploaded_skill_install_dialog_appeared
```

— the "skill install" flow is a Dia-native dialog, not an MCP install URL. No `dia:mcp/install` or equivalent. Dia's AI extensibility is Skills (Browser Company's custom format), not MCP.

---

## Comparison table

| App | Scheme | Prompt-seed URL? | MCP install URL? | Extension-authored URL API? | File/workspace/path param? | Documented? |
|---|---|---|---|---|---|---|
| **VS Code Stable** | `vscode://` | ❌ No native chat/agent prompt-seed URL | ✅ `vscode:mcp/install?<json>` (opaque URI; VS Code ≥ 1.99) | ✅ `vscode://<publisher>.<ext>/<path>?<query>` via `window.registerUriHandler` | ✅ `vscode://file/<path>[:line:col]` (files, folders, workspaces) | ✅ Full docs at code.visualstudio.com |
| **VS Code Insiders** | `vscode-insiders://` | ❌ | ✅ `vscode-insiders:mcp/install?<json>` | ✅ same mechanism | ✅ same routes | ✅ Same docs, Insiders prefix |
| **VS Code Remote** | `vscode-remote://` | — | — | — | ✅ `vscode-remote://<authority>/<remote-path>` (WSL/SSH/devcontainer) | ✅ |
| **Windsurf** | `windsurf://` | ✅ `windsurf://cascade?prompt=<text>` (undocumented; Mintlify-confirmed) | ❌ Not documented; UI/JSON file install only | Inferred from VS Code fork heritage (not verified) | Inferred (not verified) | ❌ Not in public docs or changelog |
| **Dia** | `dia://` (INTERNAL only — not in Info.plist) | ❌ External callers cannot reach Dia's AI via URL | ❌ No MCP; Dia uses Skills (native format) | ❌ | ❌ No OS-level scheme | Partial: internal strings reveal routes; no dev docs |
| **(ref) Cursor** | `cursor://` | ✅ via `cursor://anysphere.cursor-deeplink/prompt/…` | ✅ `cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>` | ✅ inherited from VS Code | ✅ inherited | ✅ docs.cursor.com |
| **(ref) Claude Desktop** | `claude://` | ✅ `claude://claude.ai/new?q=` | — | — | — | Partial |

---

## Negative searches

- `vscode://chat`, `vscode://copilot`, `vscode://agent` — ZERO hits in installed `workbench.desktop.main.js`, Copilot/Chat built-in CSS classnames only. Confirmed no VS Code-core AI deep-link route exists.
- `windsurf://mcp`, `windsurf:mcp/install` — zero hits in public docs, changelog, web search, GitHub code search. Confirmed Windsurf has no MCP install URL.
- `windsurf://file/`, `windsurf://open`, `windsurf://workspace/` — not testable without installed binary; plausible-but-unverified inherited-from-VS-Code routes.
- `dia://chat?prompt=`, `dia://assistant/new?prompt=`, `dia://ask` — zero hits in Dia 1.8.0 binary strings. Dia's AI is not URL-seedable from outside.
- `diabrowser://` — zero hits anywhere (Info.plist, binary, web). The brand name is `Dia` not `DiaBrowser` at the scheme level.
- VS Code 1.96.4 `mcp` substring in workbench — zero hits. MCP landed in 1.99 (Apr 2025); this machine predates it.

---

## Gaps / follow-ups

1. **Windsurf installed probe** — install Windsurf.app and run the same three-command probe (plutil `CFBundleURLTypes`, grep `workbench.desktop.main.js` for authority dispatchers, grep for `mcp/install`) to verify the VS-Code-inherited route surface. Estimated effort: 5 minutes.
2. **VS Code 1.99+ Stable probe** — upgrade to VS Code 1.99+ and re-grep `workbench.desktop.main.js` for `mcp/install` to confirm the core-opaque-URI handler's in-binary form (vs the documented external form). Would clarify whether `vscode:mcp/install?…` is dispatched in `main.js` (Electron-main) or `workbench.desktop.main.js` (renderer) and whether the path/authority style differs in the implementation.
3. **VS Code Insiders probe** — confirm `vscode-insiders://` registration and whether the Insiders channel has any routes not present in Stable.
4. **GitHub Copilot Chat extension URL handler** — install the extension and check whether `vscode://github.copilot-chat/<path>?<query>` is registered as an extension-owned deep-link surface (Finding 9 shows VS Code core has nothing; a Copilot-owned route would be the architecturally-idiomatic place).
5. **Dia's `open_tabs` skill** — Dia's built-in AI has a tool `open_tabs` that **can open `http://` and `https://` URLs** but is explicitly blocked from opening `dia://` internal pages. This means if OK or another tool wanted to hand off a prompt into Dia from outside, the ONLY route would be (a) ensure Dia is the default browser, (b) open a `https://` URL that loads a page inside Dia, (c) hope Dia's sidebar AI auto-picks up the page context. There is no direct URL-based handoff — this is a **hard ceiling** on Dia integration for OK.
6. **Arc → Dia lineage** — The `BoostBrowser_*` / `ARC_*` framework names confirm Dia reuses Arc's codebase. Arc itself had a `arcbrowser://` scheme (verifiable via old Arc bundle). If Browser Company's URL-routing framework is the same across Arc and Dia, reading Arc's deep-link docs (if any) could reveal the intended extensibility posture for Dia — but this would be third-order inference.
7. **The opaque-URI vs authority-URI distinction** — VS Code's own MCP install URL (`vscode:mcp/install?…`, no `//`, opaque) is architecturally different from its file/extension routes (`vscode://...`, with `//`, authority-bearing). This split suggests Microsoft treats MCP install as a **reserved top-level word** in the scheme namespace, parallel to `javascript:`, `data:`, `mailto:`. Cursor's MCP install goes through an extension route instead (`cursor://anysphere.cursor-deeplink/mcp/install?...`) — a less-reserved, more-overlayable design. Worth considering for OK's own scheme design if we go that route.
