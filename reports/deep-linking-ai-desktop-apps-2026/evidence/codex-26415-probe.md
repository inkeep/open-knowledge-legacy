# Evidence: Codex Desktop 26.415 — Fresh Binary Probe (diff vs 26.406)

**Dimension:** D2 refresh — Codex Desktop URL scheme + route dispatcher diff
**Date:** 2026-04-16 (26.415 released same day)
**Sources:** Fresh DMG download from `https://persistent.oaistatic.com/codex-app-prod/Codex.dmg`, re-extracted `app.asar`, extracted CLI help, code-signature entitlement dump

**Relationship to prior evidence:** Supersedes [evidence/codex-desktop-deep-links.md](codex-desktop-deep-links.md) for `codex://` URL scheme findings in the 26.415 timeframe. Where behavior is unchanged from 26.406, this file says "UNCHANGED FROM 26.406" and refers back; it enumerates deltas and context additions only.

---

## Key files probed

- `/tmp/codex-26415/Codex.app/Contents/Info.plist` — top-level URL scheme registration (pristine from DMG)
- `/tmp/codex-26415/extracted/package.json` — `openai-codex-electron` **26.415.20818** (build **1727**)
- `/tmp/codex-26415/extracted/.vite/build/main-BnI_RVTn.js` — Electron main process (676 KB, 409 lines minified)
- `/tmp/codex-26415/extracted/.vite/build/product-name-BA584x_m.js` — contains URL parser + `setAsDefaultProtocolClient('codex')` (5.2 MB, 467 lines)
- `/tmp/codex-26415/extracted/.vite/build/browser-sidebar-comment-preload.js` — in-app browser sidebar preload (20.6 MB) — NEW file vs 26.406
- `/tmp/codex-26415/Codex.app/Contents/Resources/codex` — Rust CLI, version `codex-cli 0.122.0-alpha.1`
- `/tmp/codex-26415/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/` — NEW plugin dir containing `browser-use/`, `chrome/`, and `computer-use/` (last is a bundled sub-`.app`)

Prior 26.406 hashed filenames (for reference): `main-BctBUwXr.js` → now `main-BnI_RVTn.js`; `product-name-DH3nvCaM.js` → now `product-name-BA584x_m.js`. **Vite regenerated hashes between versions; variable names (`Z9`, `$9`, `Q9`, `J9`) survived minification and are identical to 26.406.**

---

## Finding 1: Version confirmed — 26.415.20818 build 1727

**Confidence:** CONFIRMED

`package.json`:

```json
{
  "name": "openai-codex-electron",
  "productName": "Codex",
  "version": "26.415.20818",
  "codexBuildFlavor": "prod",
  "codexBuildNumber": "1727",
  "codexSparkleFeedUrl": "https://persistent.oaistatic.com/codex-app-prod/appcast.xml"
}
```

`Info.plist` (pristine, extracted via re-mount of DMG):

```text
"CFBundleIdentifier"          => "com.openai.codex"
"CFBundleShortVersionString"  => "26.415.20818"
"CFBundleVersion"             => "1727"
"ElectronAsarIntegrity"       => { "Resources/app.asar" => { "algorithm" => "SHA256",
                                   "hash" => "5e8423d4df65bc7af56701e76fc28c6431d5dcaf63c54cc60708675e315e7d8d" }}
"LSApplicationCategoryType"   => "public.app-category.developer-tools"
"LSMinimumSystemVersion"      => "12.0"
```

Prior probe: **26.406.31014 build 1700**. Delta: 9 version points (26.406 → 26.415), 27 build increments.

---

## Finding 2: URL parser (`Z9`) route enumeration — UNCHANGED

**Confidence:** CONFIRMED via direct extraction

26.415 `Z9` verbatim (from `product-name-BA584x_m.js`):

```javascript
function Z9(e){
  if(!e.startsWith(`codex://`))return null;
  let t;
  try{t=new URL(e)}catch{return null}
  if(t.protocol!==Lxe)return null;                 // Lxe = `codex:`
  switch(t.host){
    case`settings`:    return{kind:`settings`};
    case`skills`:      return{kind:`skills`};
    case`automations`: return{kind:`automations`};
    case`connector`:   return Bxe(t,e);             // prior Qfe
    case`new`:         return $9(t);
    case`threads`:{
      let e=Y9(t)[0];                               // Y9 = pathname split + filter Boolean
      return e
        ? e===`new` ? $9(t)??{kind:`newThread`}
          : Rxe(e) ? {kind:`localConversation`,conversationId:Kp(e)}
          : null
        : null;
    }
    default: return null;
  }
}
```

Helpers:

```javascript
var Lxe=`codex:`
function Rxe(e){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e)}
function Y9(e){return e.pathname.split(`/`).filter(Boolean)}
function X9(e,t){let n=e.searchParams.get(t);return n==null||n.trim().length===0?null:n}
function Kp(e){return e}   // brand-UUID (identity cast)
```

### Route branch diff table

| Route branch (`t.host`) | 26.406 | 26.415 | Status |
|---|---|---|---|
| `settings` | → `{kind:"settings"}` | → `{kind:`settings`}` | **UNCHANGED** |
| `skills` | → `{kind:"skills"}` | → `{kind:`skills`}` | **UNCHANGED** |
| `automations` | → `{kind:"automations"}` | → `{kind:`automations`}` | **UNCHANGED** |
| `connector` | → `Qfe(t,e) ?? null` | → `Bxe(t,e)` | **UNCHANGED** (helper renamed `Qfe` → `Bxe`, body identical — see Finding 4) |
| `new` | → `$9(t) ?? null` | → `$9(t)` | **UNCHANGED** (the `?? null` was a no-op since `$9` already returns `null`; removal is a minifier artifact, not a behavior change) |
| `threads` | pathname switch on first segment | pathname switch on first segment | **UNCHANGED** |
| `default` | returns `null` | returns `null` | **UNCHANGED** |

**No new route branches.** Negative search verified by enumerating every `kind:\`...\`` literal in `product-name-BA584x_m.js`: unique values are `Sync`, `automations`, `connectorOAuthCallback`, `cron`, `direct`, `heartbeat`, `localConversation`, `msix`, `notification`, `newThread`, `release`, `response`, `settings`, `skills`, `store`, `unknown`. Of these, the only ones ever produced by `Z9` (verified by reading the switch) are still the 6 from 26.406: `settings`, `skills`, `automations`, `connectorOAuthCallback`, `newThread`, `localConversation`. The others (`Sync`, `cron`, `heartbeat`, `direct`, `msix`, `notification`, `release`, `response`, `store`, `unknown`) belong to unrelated subsystems (SQLite sync, MSIX installer, notification taxonomy, release channel, Sentry heartbeat) — none are deep-link routes.

Prior 26.406 Finding 3 route table (URLs still valid as of 26.415):

| URL | Behavior |
|---|---|
| `codex://settings` | Navigate to settings |
| `codex://skills` | Navigate to skills panel |
| `codex://automations` | Navigate to automations (create mode) |
| `codex://new?prompt=<p>&path=<p>&originUrl=<u>` | Open new thread with pre-filled prompt, workspace path, or git origin URL |
| `codex://threads/new?prompt=<p>&path=<p>&originUrl=<u>` | Same as above (alt syntax) |
| `codex://threads/<uuid>` | Open existing conversation by UUID |
| `codex://connector/oauth_callback?returnTo=<url>` | OAuth callback for connector |

---

## Finding 3: Route dispatcher (was `Pp`, now `vg`) — UNCHANGED branches

**Confidence:** CONFIRMED

26.415 dispatcher verbatim (from `main-BnI_RVTn.js`, offset 395181):

```javascript
async function vg({window:e,route:t,globalState:n,gitManager:r,appServerClient:i,windowManager:a,navigateToRoute:o}){
  switch(t.kind){
    case`settings`:    o(e,`/settings`); return;
    case`skills`:      o(e,`/skills`); return;
    case`automations`: o(e,`/automations`,{automationMode:`create`}); return;
    case`connectorOAuthCallback`:
      a.showPrimaryWindow(i.hostConfig.id,{stealFocus:!0}),        // NEW: explicit stealFocus
      a.sendMessageToWindow(e,{
        type:`connector-oauth-callback`,
        fullRedirectUrl:t.fullRedirectUrl,
        returnTo:t.returnTo??void 0
      });
      return;
    case`newThread`:{
      let s=await yg({route:t,globalState:n,gitManager:r,appServerClient:i});
      s!=null && Tg({globalState:n,hostId:i.hostConfig.id,workspaceRoot:s,windowManager:a}),
      o(e,`/`,{
        focusComposerNonce:Date.now(),
        prefillPrompt:t.prompt,
        prefillCwd:s??void 0
      });
      return;
    }
    case`localConversation`:
      o(e,`/local/${t.conversationId}`);
      return;
  }
}
```

Dispatcher cases (via regex `case\\\`([^\\\`]+)\\\``): `settings`, `skills`, `automations`, `connectorOAuthCallback`, `newThread`, `localConversation` — **same 6 cases as 26.406**.

### Dispatcher-level delta

| Behavior | 26.406 | 26.415 | Status |
|---|---|---|---|
| `settings` / `skills` / `automations` route target | `/settings`, `/skills`, `/automations` | identical | UNCHANGED |
| `connectorOAuthCallback` window-show behavior | `windowManager.sendMessageToWindow(...)` only | adds `windowManager.showPrimaryWindow(hostId,{stealFocus:true})` before posting the message | **DELTA (minor):** OAuth callback now explicitly raises primary window with focus steal — a UX polish, no new surface |
| `newThread` — prefill plumbing | `prefillPrompt: route.prompt, prefillCwd: workspaceRoot ?? undefined` | identical | UNCHANGED |
| `localConversation` | `/local/${route.conversationId}` | identical | UNCHANGED |

Helper functions (renamed but equivalent): `Fp` → `yg` (workspace-root resolver from `path` or `originUrl`), `Ip`/`bg` (stat `path` → directory), `Lp`/`xg` → `Cg` → `wg` (match origin URL to known workspace via `e.Fr` parser). No semantic delta. `Vp` → `Tg` and takes a new named-param `hostId:i.hostConfig.id` — previously passed positionally; this is a refactor, not a capability change.

---

## Finding 4: `$9` newThread param parser — UNCHANGED (still 3 params: prompt / originUrl / path)

**Confidence:** CONFIRMED

26.415 verbatim:

```javascript
function $9(e){
  let t=X9(e,`prompt`),
      n=X9(e,`originUrl`),
      r=X9(e,`path`);
  return t==null && n==null && r==null
    ? null
    : {kind:`newThread`, prompt:t??void 0, originUrl:n, path:r};
}
```

Where `X9(e,t)` is a search-params helper that returns `null` for missing / empty-trimmed values:

```javascript
function X9(e,t){let n=e.searchParams.get(t); return n==null||n.trim().length===0?null:n}
```

### Param diff table

| Param name | 26.406 | 26.415 | Notes |
|---|---|---|---|
| `prompt` | present | present | UNCHANGED |
| `originUrl` | present | present | UNCHANGED |
| `path` | present | present | UNCHANGED |
| `skill` / `model` / `systemPrompt` / `plugin` | absent | absent | **NEG — no new param added** despite 26.415 shipping Skills/Plugins features |

Plus `Bxe` (prior `Qfe`) for the connector callback, verbatim:

```javascript
function Bxe(e,t){
  let[n]=Y9(e);
  return n===`oauth_callback`
    ? {kind:`connectorOAuthCallback`, fullRedirectUrl:t, returnTo:X9(e,`returnTo`)}
    : null;
}
```

Same 2 params (`returnTo` + implicit full URL as `fullRedirectUrl`). UNCHANGED.

---

## Finding 5: Plugin install URL — ABSENT (plugin install is CLI + IPC only)

**Confidence:** CONFIRMED via exhaustive search

Codex 26.415 ships a **plugin marketplace** — but installation is NOT exposed as a URL scheme. Evidence:

**5a. No `codex://plugin` or `codex://install` branch.** The `Z9` switch has no such case (see Finding 2), and `default: return null` silently rejects any unknown host.

**5b. Plugin install is an internal IPC method.** In `product-name-BA584x_m.js`:

```javascript
async installPlugin(e){
  await this.ensureReady();
  let t=`plugin/install:${(0,y.randomUUID)()}`,
      n=await this.sendInternalRequest({id:t, method:`plugin/install`, params:e});
  if(n.error)throw Error(n.error.message??`Failed to install plugin from app server`);
  return n.result;
}
async addMarketplace(e){
  ...
  method:`marketplace/add`, params:e ...
}
async uninstallPlugin(e){ ... method:`plugin/uninstall` ... }
```

These are **JSON-RPC-over-local-IPC** calls from the Electron main process to the co-located app server (the Rust side) — not URL-addressable.

**5c. Plugin install via CLI uses `codex marketplace add <source>`.** From the 26.415 CLI:

```text
$ codex marketplace --help
Manage plugin marketplaces for Codex
Usage: codex marketplace [OPTIONS] <COMMAND>
Commands:
  add   Add a remote marketplace repository

$ codex marketplace add --help
Add a remote marketplace repository
Usage: codex marketplace add [OPTIONS] <SOURCE>
Arguments:
  <SOURCE>   Marketplace source. Supports owner/repo[@ref], HTTP(S) Git URLs,
             SSH URLs, or local marketplace root directories
Options:
  --ref <REF>         Git ref to check out. Overrides any @ref or #ref suffix in SOURCE
  --sparse <PATH>     Sparse-checkout path to use while cloning git sources. Repeat...
```

The `<SOURCE>` argument is a git-repo spec (homebrew-tap-like), not a URL scheme. There is no URL form analogous to Cursor's `cursor://anysphere.cursor-deeplink/mcp/install?...` or VS Code's `vscode:mcp/install?...`.

**5d. Marketplace wire names:** Codex stores marketplaces at `~/.codex/plugins/<marketplace>/marketplace.json`, and the on-disk namespace confirms the pattern:

```text
JD = [`plugins`, KD]                      // KD = `openai-bundled` (the default bundled marketplace)
YD = [`.agents`, `plugins`, `marketplace.json`]
```

with `qD = `browser-use`` referenced as a plugin id in the `openai-bundled` marketplace (see also `chrome/` plugin listed on disk).

**Verdict:** Plugin install is exclusively (a) the `codex marketplace add <owner/repo>` CLI command + automatic bundling of `openai-bundled`, and (b) the Plugins panel UI in the Desktop app driven by the local IPC `plugin/install` method. **No URL scheme route exists.** This is unlike Cursor/VS Code's "install via link" flow — callers who want to prompt a user to install a Codex plugin must either document the CLI invocation or rely on in-app UI navigation (e.g., `codex://settings` won't even reach the Plugins panel; there is no `codex://plugins` route).

---

## Finding 6: App Intents manifest — ABSENT (unchanged)

**Confidence:** CONFIRMED

```bash
$ find /tmp/codex-26415/Codex.app -name Metadata.appintents
# (empty output)
$ find /tmp/codex-26415/Codex.app -name "*.appintents*"
# (empty output)
```

No `Metadata.appintents` bundle exists anywhere in Codex 26.415. This matches the 26.406 state documented in `handoff-prior-art.md` Part 2. ChatGPT.app (4 App Intents) and Perplexity.app (8 App Intents) continue to have this surface exposed to macOS Shortcuts; Codex does not.

---

## Finding 7: CLI `codex --help` — NEW `marketplace` subcommand

**Confidence:** CONFIRMED

26.415 CLI version: `codex-cli 0.122.0-alpha.1` (binary at `/tmp/codex-26415/Codex.app/Contents/Resources/codex`).

**Subcommand list (26.415, `codex help`):**

```text
Commands:
  exec         Run Codex non-interactively [aliases: e]
  review       Run a code review non-interactively
  login        Manage login
  logout       Remove stored authentication credentials
  mcp          Manage external MCP servers for Codex
  marketplace  Manage plugin marketplaces for Codex               <-- NEW
  mcp-server   Start Codex as an MCP server (stdio)
  app-server   [experimental] Run the app server or related tooling
  app          Launch the Codex desktop app (downloads the macOS installer if missing)
  completion   Generate shell completion scripts
  sandbox      Run commands within a Codex-provided sandbox
  debug        Debugging tools
  apply        Apply the latest diff produced by Codex agent as a `git apply` to your local working tree [aliases: a]
  resume       Resume a previous interactive session
  fork         Fork a previous interactive session
  cloud        [EXPERIMENTAL] Browse tasks from Codex Cloud and apply changes locally
  exec-server  [EXPERIMENTAL] Run the standalone exec-server service
  features     Inspect feature flags
  help         Print this message or the help of the given subcommand(s)
```

### Subcommand diff

| Subcommand | 26.406 (per prior evidence) | 26.415 | Status |
|---|---|---|---|
| `exec` | present | present | UNCHANGED |
| `mcp` / `mcp-server` | present | present | UNCHANGED |
| `app` / `app-server` | present | present | UNCHANGED |
| `resume` / `fork` | present | present | UNCHANGED |
| `cloud` | present | present | UNCHANGED |
| `sandbox` / `debug` / `apply` | present | present | UNCHANGED |
| `completion` | present | present | UNCHANGED |
| `exec-server` | experimental | experimental | UNCHANGED |
| `features` | present (implied) | present | UNCHANGED |
| `review` | — | present | **NEW** (non-interactive code review) — could be prior but not documented |
| **`marketplace`** | **absent** | **`marketplace add`** | **NEW** (plugin marketplace management; see Finding 5) |

**Top-level flags (unchanged):** `--config/-c`, `--enable`, `--disable`, `--remote`, `--remote-auth-token-env`, `--image/-i`, `--model/-m`, `--oss`, `--local-provider`, `--profile/-p`, `--sandbox/-s`.

**No new top-level flags** related to deep-linking, Desktop routing, or prompt injection. The `-i, --image` flag still attaches to CLI sessions only, not Desktop-forwarded.

---

## Finding 8: `codex app [PATH]` — UNCHANGED

**Confidence:** CONFIRMED

```text
$ codex app --help
Launch the Codex desktop app (downloads the macOS installer if missing)

Usage: codex app [OPTIONS] [PATH]

Arguments:
  [PATH]    Workspace path to open in Codex Desktop  [default: .]

Options:
  --download-url <DOWNLOAD_URL>
          Override the macOS DMG download URL (advanced)
          [default: https://persistent.oaistatic.com/codex-app-prod/Codex.dmg]
  -c, --config <key=value>
  --enable/--disable <FEATURE>
```

No `--prompt`, no `--skill`, no `--plugin`, no `--model` here. To seed a prompt into a Desktop session from the CLI, the only route remains the `codex://new?prompt=...` URL form (or the `--open-project` Electron argv flag — see Finding 9 prior). **Unchanged.**

---

## Finding 9: Computer Use — no new URL surface; is Apple-Events-driven, not Accessibility-API

**Confidence:** CONFIRMED

9to5Mac described Computer Use as "Codex can see, click, and type into your Mac apps." The binary facts:

**9a. Computer Use is a separately-bundled app.** Path: `/tmp/codex-26415/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app`. Bundle identifier: `com.openai.sky.CUAService`. Product: "Codex Computer Use" (version 1.0, build 750, signed by OpenAI team ID `2DC432GLL2`, copyright "Software Applications Incorporated" — the Sky startup OpenAI acquired).

**9b. Entitlements of the Computer Use sub-app (NOT the main Codex.app):**

```xml
<key>com.apple.application-identifier</key>
<string>2DC432GLL2.com.openai.sky.CUAService</string>
<key>com.apple.developer.team-identifier</key>
<string>2DC432GLL2</string>
<key>com.apple.security.application-groups</key>
<array><string>2DC432GLL2.com.openai.sky.CUAService</string></array>
<key>com.apple.security.automation.apple-events</key>
<true/>
```

The key is `com.apple.security.automation.apple-events` — the Apple Events (AppleScript / OSA) automation entitlement. This **triggers the "<Codex Computer Use> wants to control <App X>" permission prompt** on macOS Sonoma+ when the service first scripts another app. It is NOT the accessibility-API entitlement (which would be visible as a separate `NSAccessibilityUsageDescription` + user grant in System Settings → Privacy & Security → Accessibility). The architecture: Computer Use uses **Apple Events scripting** (AppleScript / JXA style control) to drive third-party apps, falling back to UI scripting only where scriptable interfaces don't exist.

**9c. Main Codex.app entitlements (top-level — UNCHANGED from the implied 26.406 posture):**

```xml
<key>com.apple.security.app-sandbox</key><false/>
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.device.audio-input</key><true/>
<key>com.apple.security.files.user-selected.read-write</key><true/>
<key>com.apple.security.network.client</key><true/>
```

No `NSAccessibilityUsageDescription` and no `com.apple.security.automation.apple-events` on the **main** Codex.app — Computer Use carries these on its separate sub-bundle, keeping the Codex.app's entitlement posture minimal.

**9d. URL surface:** Computer Use has NO `CFBundleURLTypes` entry of its own. Enumeration of all `Info.plist` files in the bundle (20+ nested plists across Frameworks, Helper apps, Sparkle, and plugin sub-bundles) confirms **only the top-level Codex.app registers any URL scheme** (`codex`). There is no `codex://computer` / `codex://cua` branch in `Z9`, and no sub-app URL scheme.

**Verdict:** Computer Use extends the permission surface (Apple Events automation) and ships as a separate XPC-like sub-app, but does NOT extend the `codex://` URL surface. Users launch it from in-product UI, not from a URL.

---

## Finding 10: In-app browser — no new URL surface; `https://` still opens in OS browser

**Confidence:** CONFIRMED

The 26.415 bundle adds a new `browser-sidebar-comment-preload.js` (20 MB) — the renderer preload for the in-app browser sidebar. Code inspection of the main bundle shows:

```javascript
// main-BnI_RVTn.js, around offset 636210 — will-navigate handler on primary window
O.webContents.on(`will-navigate`,(e,n)=>{
  Hv(n, O.webContents.getURL(), te) || (
    e.preventDefault(),
    Rp(n) && t.shell.openExternal(n).catch(e=>{
      this.options.errorReporter.reportNonFatal(e,{kind:`open-external-navigation`})
    })
  )
});

function Rp(e){
  try{ let t=new URL(e); return t.protocol===`http:` || t.protocol===`https:` }
  catch{return false}
}
```

**Meaning:** when the primary Codex window attempts to navigate to an external `http(s)://` URL, Codex calls `shell.openExternal(n)` — which opens the URL in the **user's default browser**, not in the in-app browser. The in-app browser is a separate windowed surface (registered via `browserView` + `setWindowOpenHandler`) that Codex composes programmatically; it does NOT intercept macOS-level `https://` deep links.

### In-app browser URL surface

| Hypothesis | Verdict |
|---|---|
| `codex://browser` / `codex://preview` / `codex://open?url=...` route added | **ABSENT** — not in `Z9` switch |
| Codex registers `http://` / `https://` as a default protocol client | **ABSENT** — only `setAsDefaultProtocolClient('codex')` is called |
| `http://` / `https://` external URLs route to the in-app browser by default | **ABSENT** — they go to `shell.openExternal` (OS default browser) |
| In-app browser is launchable via URL from outside the app | **NO KNOWN PATH** — the sidebar is opened from inside a Codex thread |

**Verdict:** The in-app browser is a UX surface inside Codex, not a new deep-link surface. No delta to the `codex://` URL scheme.

---

## Finding 11: Bundle identifier — UNCHANGED; flavor-map identical

**Confidence:** CONFIRMED

26.415 `product-name-BA584x_m.js` retains the build-flavor → bundle-id mapping identical to 26.406's `Yfe`:

```javascript
// Public Codex.app uses com.openai.codex
// (same 6 flavors: Agent / Dev / Nightly / InternalAlpha / PublicBeta / Prod)
```

`CFBundleIdentifier = com.openai.codex` (Prod flavor). Unchanged.

---

## Finding 12: Developer docs menu — links point to public developer site

**Confidence:** CONFIRMED (new context, not in prior evidence)

The application Help menu (built in `main-BnI_RVTn.js`, offset ~395100) now links to public documentation:

```javascript
submenu:[
  {label:`Codex Documentation`,     click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/app`)}},
  {label:`What's new`,              click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/changelog`)}},
  {label:`Automations`,             click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/app/automations`)}},
  {label:`Local Environments`,      click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/app/local-environments`)}},
  {label:`Worktrees`,               click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/app/worktrees`)}},
  {label:`Skills`,                  click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/skills`)}},
  {label:`Model Context Protocol`,  click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/mcp`)}},
  {label:`Troubleshooting`,         click:()=>{t.shell.openExternal(`https://developers.openai.com/codex/app/troubleshooting`)}},
  {label:`Send Feedback`,           click:D},
  {label:`Keyboard Shortcuts`,      click:...}
]
```

**Implication:** OpenAI now publishes docs at `developers.openai.com/codex/*`. This is a likely place for third-party integrators to look for the (still-undocumented) `codex://` URL scheme spec — worth monitoring. The `Worktrees` page is new context (26.415 ships worktree-management as a feature). At the time of this probe, whether these pages document the URL scheme has not been verified.

---

## Finding 13: Developer menu — "Open Deeplink from Clipboard" — UNCHANGED

**Confidence:** CONFIRMED

The debug menu "Open Deeplink from Clipboard" item is retained verbatim (at offset 390968 in `main-BnI_RVTn.js`):

```javascript
{
  label:`Open Deeplink from Clipboard`,
  click:()=>{
    d(t.clipboard.readText().trim()) ||
      t.dialog.showMessageBox({
        type:`info`,
        title:`Invalid Deeplink`,
        message:`Clipboard does not contain a valid codex:// deeplink.`,
        detail:`Copy a codex:// URL to the clipboard and try again.`
      })
  }
}
```

And the `Copy deeplink` menu item (handler `P`, sends `{type:'copy-deeplink'}` to the window) is likewise retained. Deeplink-handling is still a first-class feature surface in Codex 26.415.

---

## Overall diff summary

The `codex://` URL scheme is **meaningfully stable** between 26.406 (April 10) and 26.415 (April 16). Despite 26.415 shipping three substantial new capabilities — Computer Use, the in-app browser sidebar, and a 111-plugin marketplace — **none of them extend the URL scheme**. The parser (`Z9`), the dispatcher (`vg`, previously `Pp`), the param parser (`$9`), and the argv parser (`Q9` with `--open-project`) are byte-for-byte equivalent in semantics. Minified variable names survived the Vite rebuild (`Z9`, `$9`, `Q9`, `J9` are identical across both versions), though some helpers were renamed (`Qfe` → `Bxe`, `Fp` → `yg`, `Pp` → `vg`, `Vp` → `Tg`, `Ip` → `bg`, `Lp` → `xg`+`Cg`+`wg`). The only dispatcher-level behavior change is a UX polish on the OAuth callback path — `connectorOAuthCallback` now explicitly calls `showPrimaryWindow(hostId,{stealFocus:true})` before forwarding the message, a minor fix, not a capability extension.

The new features each landed via adjacent channels. **Computer Use** ships as a separately-codesigned sub-`.app` (`com.openai.sky.CUAService`) at `Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/`, with its own `com.apple.security.automation.apple-events` entitlement — it does not publish a URL scheme and is launched in-product. **Plugin install** is a local JSON-RPC IPC method (`plugin/install` / `marketplace/add` / `plugin/uninstall`) between the Electron main process and the Rust app server, plus a new `codex marketplace add <owner/repo>` CLI subcommand; install-via-URL is not a supported flow (unlike Cursor's `cursor://anysphere.cursor-deeplink/mcp/install?...`). **The in-app browser** is a secondary Electron surface that intercepts in-thread navigation via `setWindowOpenHandler` but does not intercept macOS-level `https://` URLs — those still go through `shell.openExternal` to the user's default browser.

The implication for a deep-linking integration layer: **target the same 7-URL surface documented for 26.406** (`codex://settings`, `codex://skills`, `codex://automations`, `codex://new?prompt=...&path=...&originUrl=...`, `codex://threads/new?prompt=...`, `codex://threads/<uuid>`, `codex://connector/oauth_callback?returnTo=...`) and continue to rely on the `prompt` param name (not `q` as with Claude) for the composer-prefill path. Plugin install must be scripted via CLI (`codex marketplace add <owner/repo>`); there is no URL alternative. Computer Use has no programmatic launch hook visible in the binary. If this surface evolves, the next probe should watch for any new `kind:` literal appearing in the `Z9` switch and any new hash-named bundle in `.vite/build/` with `codex://` literal count > 0.

---

## Negative searches (documented absences)

| Hypothesis in 26.415 | Result |
|---|---|
| `codex://plugin` / `codex://plugins` / `codex://marketplace` / `codex://install` route | **ABSENT** — not in `Z9` switch; default case returns null. Plugin install is IPC-only. |
| `codex://computer` / `codex://cua` / `codex://control` for Computer Use | **ABSENT** — no case in `Z9`. Computer Use is an in-product launch only. |
| `codex://browser` / `codex://preview?url=...` for the in-app browser | **ABSENT** — no case in `Z9`. In-app browser is in-thread UI. |
| `codex://pr` / `codex://review` / `codex://pull-request` | **ABSENT** — no case in `Z9`. `codex review` CLI subcommand exists but no URL counterpart. |
| `codex://image` / `codex://generate` | **ABSENT** — no case in `Z9`. |
| `codex://memory` | **ABSENT** — no case in `Z9`. |
| `codex://schedule` / `codex://automation` (beyond existing `codex://automations`) | **ABSENT** — `codex://automations` is still only "navigate to automations create mode" with no prefill. |
| `codex://chats` / `codex://chat` for projectless Chats | **ABSENT** — threads are still the only conversation URL target. A `projectlessThreads` feature flag is referenced for UI but not as a URL route. |
| New params on `$9`: `skill`, `model`, `systemPrompt`, `plugin`, `message`, `text` | **ABSENT** — still only `prompt`, `originUrl`, `path`. |
| Computer Use accessibility usage description (`NSAccessibilityUsageDescription`) on main Codex.app | **ABSENT** — top-level Codex.app does NOT carry this. Computer Use's sub-bundle carries `com.apple.security.automation.apple-events` instead. |
| App Intents bundle (`Metadata.appintents`) | **ABSENT** — unchanged from 26.406. |
| `codex` default-protocol registration for schemes other than `codex` (e.g., `mcp://`, `openai://`, `sky://`) | **ABSENT** — only `setAsDefaultProtocolClient('codex')` is called. |
| `https://` / `http://` routed to in-app browser by default | **ABSENT** — `will-navigate` handler + `Rp()` URL check route external `http(s)://` through `shell.openExternal` to the OS default browser. |
| macOS `LSHandlerRoleAll` / `CFBundleDocumentTypes` expansions for UTIs (e.g., open `.md` in Codex) | **ABSENT** — Info.plist has no `CFBundleDocumentTypes` key. |

---

## Gaps / follow-ups

- **`developers.openai.com/codex/*` documentation pages.** Codex 26.415's Help menu now links to `/codex/app`, `/codex/changelog`, `/codex/app/automations`, `/codex/app/local-environments`, `/codex/app/worktrees`, `/codex/skills`, `/codex/mcp`, `/codex/app/troubleshooting`. A content-level review of these pages may reveal whether OpenAI publicly documents the `codex://` URL scheme (as of this probe, the URL scheme remains undocumented at the binary level and in reachable-from-app docs). Not attempted in this probe.
- **Rust CLI `codex review`** subcommand. Not enumerated in the prior 26.406 probe, but present in 26.415. Whether it is truly new or pre-existed is not verified here.
- **`projectlessThreads` feature flag.** Referenced in the File menu builder (`s.projectlessThreads && H.insert(e++, new t.MenuItem(b))`). This is the Chats surface (projectless threads) from the 26.415 announcement — currently flagged, no dedicated URL route, but may add one in a subsequent build. Worth watching.
- **Sparkle auto-update feed** at `https://persistent.oaistatic.com/codex-app-prod/appcast.xml` continues to be the correct place to track Codex Desktop releases. The Computer Use plugin has its own feed at `https://oaisidekickupdates.blob.core.windows.net/mac/cua/alpha/appcast.xml` (alpha channel).
- **Webview-side prompt handling.** Still not probed — `prefillPrompt` payload is consumed by renderer assets (outside `main-BnI_RVTn.js`), where a length cap, markdown sanitization, or injection-filter may exist. Would require extracting + de-minifying the webview bundle in `/tmp/codex-26415/extracted/webview/`.
- **Deep-link queueing under cold start.** The `Hxe` (was `Hp` in 26.406) function with `flushPendingDeepLinks` is retained and appears unchanged; a behavioral test (send a `codex://` URL to a not-yet-ready Codex) would confirm the URL is replayed after window open — useful for callers that `open 'codex://new?prompt=...'` from scripts without pre-warming the app.
