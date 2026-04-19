# Evidence: Linear "Deeplink to AI Coding Tools" — Production URL Template Extraction

**Dimension:** Addendum to D7 (handoff prior art) — closes the gap identified in `codex-recent-announcements.md §5`
**Date:** 2026-04-17
**Sources:** Linear production runtime bundle (downloaded from `static.linear.app`, 2026-04-17), Linear changelog, Linear login page as app entry point

---

## Why this evidence file matters

Linear shipped "Deeplink to AI coding tools" on 2026-02-26 with an announced 9-tool registry — Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed. Linear does not publish the exact URL templates used per tool. This file extracts them verbatim from the production client bundle. It is the **single most directly applicable prior art for Open Knowledge's agent-handoff surface**: Linear is a production SaaS handing issue content to the user's preferred coding agent — the exact product pattern OK is evaluating for wiki-page-to-agent handoff.

Two surprises sit at the center of the finding. First, the registry has grown from 9 to 19 entries since launch (Amp, Devin, Factory, Lovable, Netlify, Warp, Windsurf, plus `customUrl` and `customTerminalScript`) — 10 tools added in seven weeks. Second, Claude Code and OpenCode are **not URL-based at all** — they are shipped as terminal commands invoked through the Linear desktop app's IPC bridge, not URL schemes. This inverts the prior-art expectation that "deep-link" means a URL, and reframes the design space: the effective surface is URL schemes **plus** a desktop-app-mediated shell-exec channel.

---

## Key sources

- Linear login page entry HTML: `https://linear.app/login` (retrieved 2026-04-17 03:37:30 UTC; 17 486 bytes; CSP served from `static.linear.app` + `static.linear.dev`).
- Entry JS chunk: `https://static.linear.app/client/assets/html.DUrSLOZ8.js` (150 925 bytes; sha-1 prefix `d55b55c682df…`). Contains the lazy-chunk manifest (305 chunk references) for the SPA.
- **Primary evidence chunk**: `https://static.linear.app/client/assets/AIActions.B5r9dZjO.js` (2 781 730 bytes; sha-1 prefix `918d26c327fd…`; `Last-Modified: Fri, 17 Apr 2026 00:40:11 GMT`; `ETag: "a6677c7e4054765c8e1839c9aaacf3d3"`; uploaded by `x-guploader-uploadid: AMNfjG0l1-tHIqpjztPTlB4UzVIS7s6qgHNzJ4Dlk5s2bULVaCnjYJZH1btziIDxGiBJ0Eah`). This chunk houses the full external-app registry at offset `1,519,683`.
- Linear changelog: [linear.app/changelog/2026-02-26-deeplink-to-ai-coding-tools](https://linear.app/changelog/2026-02-26-deeplink-to-ai-coding-tools) (access 2026-04-17). The article body lists 9 tools; the surrounding page navigation has since been updated with references to later additions.
- `vendor-lz-string.etZhLdV2.js` (imported by `AIActions` as `WDe`) — confirms the Replit path uses `lz-string`'s `compressToEncodedURIComponent`.

No per-tool API documentation exists on Linear's public help center; the `{{issue.identifier}}`/`{{context}}` variables are user-settings-stored templates resolved **server-side** through the `issuePromptContext` GraphQL query, not client-side. See Finding 3.

---

## Finding 1: The external-app registry lives in `AIActions.B5r9dZjO.js` at offset 1,519,683

**Confidence:** CONFIRMED
**Evidence:** Extracted verbatim from `https://static.linear.app/client/assets/AIActions.B5r9dZjO.js` (sha1 prefix `918d26c327fd…`). The registry is an array assigned to minified identifier `QW`, iterated via `Cmt(user)` which filters by `user.settings.enabledExternalApps`, user availability (`xmt`), and feature flag (`Smt`). The `VW({...})` wrapper indicates a terminal-command entry (requires Linear Electron desktop app + runs through `Ku.bridge.runTerminalCommand`); inline object literals indicate URL-based entries (opened via `B.navigateExternal(url)`).

```javascript
// Helper: template substitution for customUrl (double-brace only)
function kmt(e,t){return e.replace(/{{(.*?)}}/g,(e,n)=>t[n]??e)}

// Helper: URL-length-preserving binary truncation with "[Truncated. Full issue available in Linear.]" marker
function RW(e, t, n) {
  let r = t(e);                         // e = prompt string, t = url-builder, n = max URL bytes
  if (r.length <= n) return r;
  let i = 0, a = e.length, o = t(eG);   // eG = truncation footer
  for (; i < a;) {
    let r = Math.floor((i + a + 1) / 2);
    try {
      let s = t(e.slice(0, r) + eG);
      s.length <= n ? (i = r, o = s) : a = r - 1;
    } catch { a = r - 1; }
  }
  return o;
}

// Truncation footer (appended when prompt exceeds URL cap)
eG = `\n\n[Truncated. Full issue available in Linear.]`;

// Default URL byte cap
YW = 2e3;                               // 2000-byte cap for most tools

// Keyboard shortcut: Cmd+Option+. (Mac) / Ctrl+Alt+. (Win/Linux)
ZW = { key: `.`, mod: !0, alt: !0 };

// Registry — 19 entries (filtered by user.settings.enabledExternalApps)
QW = [
  VW({ id: `amp`,           name: `Amp`,        command: `amp`,      commandArgs: e => [`-x`, e], isCommandSupported: Omt }),
  VW({ id: `claudeCode`,    name: `Claude Code`, command: `claude`,   commandArgs: e => [e] }),
  VW({ id: `codexCli`,      name: `Codex CLI`,   command: `codex`,    commandArgs: e => [e], isCommandSupported: Dmt }),
  { id: `codex`,       name: `Codex desktop`,    available: !0, description: `Opens in the Codex desktop app`,
    buildPromptDeepLink: e => RW(e, e => `codex://new?prompt=${encodeURIComponent(e)}`, YW) },
  { id: `conductor`,   name: `Conductor`,        available: !0, description: `Opens in the Conductor desktop app`,
    buildPromptDeepLink: e => `conductor://prompt=${encodeURIComponent(e)}` },
  { id: `cursor`,      name: `Cursor`,           available: !0, description: `Opens in the Cursor desktop app`,
    buildPromptDeepLink: e => RW(e, e => `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(encodeURIComponent(e))}`, 8e3) },
  VW({ id: `customTerminalScript`, name: `Custom script`, command: umt, commandArgs: () => [] }),
  { id: `customUrl`,   name: `Custom link`,      available: !0,
    label: e => { let t = e.user.settings.customDeepLinkUrlTemplate; return (t && Amt(t)) ?? `Custom link` },
    buildPromptDeepLink: (e, t) => {
      let n = t.user.settings.customDeepLinkUrlTemplate;
      if (!n) { /* toast: "Custom link template not configured" */ return; }
      return RW(e, e => kmt(n, { prompt: encodeURIComponent(e) }), YW);
    } },
  { id: `devin`,       name: `Devin`,            available: !0, description: `Opens on devin.ai`,
    buildPromptDeepLink: e => RW(e, e => `https://app.devin.ai/?prompt=${encodeURIComponent(e)}`, YW) },
  { id: `factory`,     name: `Factory`,          available: !0, description: `Opens in the Factory desktop app`,
    buildPromptDeepLink: e => `factory-desktop://new?prompt=${encodeURIComponent(e)}` },
  { id: `githubCopilot`, name: `GitHub Copilot`, available: !0, description: `Opens in VS Code`,
    buildPromptDeepLink: e => RW(e, e => `vscode://github.copilot-chat?mode=agent&prompt=${encodeURIComponent(encodeURIComponent(e))}`, 8e3) },
  { id: `lovable`,     name: `Lovable`,          available: !0, description: `Opens on lovable.dev`,
    buildPromptDeepLink: e => RW(e, e => `https://lovable.dev/?autosubmit=true#prompt=${encodeURIComponent(e)}`, YW) },
  { id: `netlify`,     name: `Netlify Agent Runners`, available: !0, description: `Opens on netlify.com`,
    buildPromptDeepLink: e => RW(e, e => `https://app.netlify.com/run?prompt=${encodeURIComponent(e)}&utm_source=linear_deeplink`, YW) },
  VW({ id: `opencode`, name: `OpenCode`,         command: `opencode`, commandArgs: e => [`--prompt`, e] }),
  { id: `replit`,      name: `Replit`,           available: !0, description: `Opens on replit.com`,
    buildPromptDeepLink: e => RW(e, e => `https://replit.com/?stack=Build&connectorNames=linear&prompt=${Mmt.default.compressToEncodedURIComponent(e)}&referrer=Linear`, YW) },
  { id: `v0`,          name: `v0`,               available: !0, description: `Opens on v0.app`,
    buildPromptDeepLink: e => RW(e, e => `https://v0.app/?q=${encodeURIComponent(e)}`, YW) },
  { id: `warp`,        name: `Warp`,             available: !0, description: `Opens in the Warp desktop app`,
    buildPromptDeepLink: e => `warp://linear/work?prompt=${encodeURIComponent(e)}` },
  { id: `windsurf`,    name: `Windsurf`,         available: !0, description: `Opens in the Windsurf desktop app`,
    buildPromptDeepLink: e => `windsurf://cascade?prompt=${encodeURIComponent(encodeURIComponent(e))}` },
  { id: `zed`,         name: `Zed`,              available: !0, description: `Opens in the Zed desktop app`,
    buildPromptDeepLink: e => RW(e, e => `zed://agent?prompt=${encodeURIComponent(e)}`, YW) }
];
```

**Decoding the wrappers.** `VW({...})` is defined (also verbatim) as:

```javascript
function VW({ isCommandSupported: e, ...t }) {
  let n = ul.isWindows || (ul.isMac && !ul.isiPad);
  // ...
  return Ku.isElectron
    ? ([`darwin`, `win32`].includes(Ku.bridge.platform)
        ? (e?.() ?? Emt() ? { ...t, available: !0 }
          : { ...t, available: !1, unavailableReason: `Please update the Linear desktop app to use ${t.name}` })
        : { ...t, available: !1, unavailableReason: `${t.name} is only available on macOS and Windows in the Linear desktop app.` })
    : (n ? { ...t, available: !0, description: i } : { ...t, available: !1, ... });
}
function WW(e) { return `command` in e && `commandArgs` in e; }    // terminal-command entry
function wmt(e) { return `buildPromptDeepLink` in e; }             // URL entry
```

The terminal-command path routes through `BW(...) → Ku.bridge.runTerminalCommand(command, commandArgs, dir, terminalApp, extraEnv)` — i.e., the Linear desktop Electron shell spawns a child process. Non-Electron (web) users never see the terminal-command entries as available.

**Decoding `Cmt`/`xmt`/`Smt` (filter order).**

```javascript
function Smt(e) { return e.id !== `customTerminalScript` || E.isEnabled(E.deepLinkCustomCli); }
function xmt(e, t) { return e.id === `customUrl` && !t.settings.customDeepLinkUrlTemplate ? !1 : Smt(e) && e.available && t.settings.enabledExternalApps.includes(e.id); }
function Cmt(e) { return QW.filter(t => xmt(t, e)).sort((t, n) => e.settings.defaultExternalAppId === t.id ? -1 : t.name.localeCompare(n.name)); }
```

The menu presents tools the user has **explicitly enabled** (`user.settings.enabledExternalApps`), with `defaultExternalAppId` pinned to the top.

---

## Finding 2: Per-tool URL template matrix

**Confidence:** CONFIRMED (verbatim from registry above)

### URL-scheme tools (15 entries, built via `buildPromptDeepLink`)

| ID | Display name | URL template (prompt placeholder = `${PROMPT}`) | Encoding | Cap |
|---|---|---|---|---|
| `codex` | Codex desktop | `codex://new?prompt=${PROMPT}` | single `encodeURIComponent` | 2000 |
| `conductor` | Conductor | `conductor://prompt=${PROMPT}` | single `encodeURIComponent` | **no cap** (no `RW` wrapper) |
| `cursor` | Cursor | `cursor://anysphere.cursor-deeplink/prompt?text=${PROMPT}` | **double** `encodeURIComponent(encodeURIComponent(e))` | 8000 |
| `customUrl` | Custom link | `<user-template>` with `{{prompt}}` replaced via `kmt()` | single `encodeURIComponent` | 2000 |
| `devin` | Devin | `https://app.devin.ai/?prompt=${PROMPT}` | single `encodeURIComponent` | 2000 |
| `factory` | Factory | `factory-desktop://new?prompt=${PROMPT}` | single `encodeURIComponent` | **no cap** |
| `githubCopilot` | GitHub Copilot | `vscode://github.copilot-chat?mode=agent&prompt=${PROMPT}` | **double** `encodeURIComponent` | 8000 |
| `lovable` | Lovable | `https://lovable.dev/?autosubmit=true#prompt=${PROMPT}` | single (hash-fragment, not querystring) | 2000 |
| `netlify` | Netlify Agent Runners | `https://app.netlify.com/run?prompt=${PROMPT}&utm_source=linear_deeplink` | single `encodeURIComponent` | 2000 |
| `replit` | Replit | `https://replit.com/?stack=Build&connectorNames=linear&prompt=${LZSTRING}&referrer=Linear` | **lz-string** `compressToEncodedURIComponent` | 2000 |
| `v0` | v0 | `https://v0.app/?q=${PROMPT}` | single `encodeURIComponent` | 2000 |
| `warp` | Warp | `warp://linear/work?prompt=${PROMPT}` | single `encodeURIComponent` | **no cap** |
| `windsurf` | Windsurf | `windsurf://cascade?prompt=${PROMPT}` | **double** `encodeURIComponent` | **no cap** |
| `zed` | Zed | `zed://agent?prompt=${PROMPT}` | single `encodeURIComponent` | 2000 |

### Terminal-command tools (4 entries, built via `command` + `commandArgs`)

| ID | Display name | Shell invocation | Gating |
|---|---|---|---|
| `amp` | Amp | `amp -x <prompt>` | requires Linear desktop `1.28.12`+ / `1.29.3`+ |
| `claudeCode` | Claude Code | `claude <prompt>` | Electron + macOS/Windows only |
| `codexCli` | Codex CLI | `codex <prompt>` | version-gated per `Dmt` |
| `opencode` | OpenCode | `opencode --prompt <prompt>` | Electron + macOS/Windows only |
| `customTerminalScript` | Custom script | `<user-script> []` | feature-flag `deepLinkCustomCli` |

**Notable shape anomalies I expected to see and did not.**

- **`claude://` scheme: NOT USED.** I expected Linear would ship a fallback web URL (`https://claude.ai/new?q=...`) for non-Electron users. It does not. Claude Code is strictly `claude <prompt>` invoked via `Ku.bridge.runTerminalCommand`. On web and on Linux, Claude Code is unavailable.
- **`codex://` + CLI `codex`: SHIPS BOTH.** `codex` (desktop URL scheme) and `codexCli` (terminal command) are separate registry entries — users enable whichever they have.
- **`conductor://prompt=`: MALFORMED URL-ish syntax.** `conductor://prompt=${encodeURIComponent(e)}` is missing the `?` that would make `prompt` a query parameter — this is almost certainly by design because the Conductor URL handler parses `://prompt=` as a literal. This diverges from every other `<scheme>://<host>?prompt=...` shape in the registry.
- **No `copilot://` scheme — routes through VS Code.** `githubCopilot` maps to `vscode://github.copilot-chat?mode=agent&prompt=...`, piggybacking on the VS Code protocol handler and the Copilot Chat extension. This means: (a) the user must have VS Code installed with Copilot Chat enabled, and (b) the `mode=agent` parameter triggers Copilot's agent mode rather than ask mode.
- **Double-encoding idiosyncrasy on exactly three tools: Cursor, GitHub Copilot, Windsurf.** The prompt is wrapped in `encodeURIComponent(encodeURIComponent(e))`. This is Linear compensating for the first decode happening at OS-protocol-handler hand-off and the second at the extension/app level — if you single-encode, `%20` in the prompt survives OS handling but then gets eaten by the app's second decode. Zed, Codex, Conductor, and Factory don't need it because their apps handle the URL directly with a single decode pass.
- **Replit uses `lz-string` compression**, not percent-encoding — because Replit's prompt-input payload is a full scaffolding-instruction doc and the 2 KB cap would be wildly insufficient if base64/percent-encoded. lz-string-to-URI gives ~40–60% size reduction on natural-language text.
- **`lovable.dev` uses the URL fragment (`#prompt=...`) with `autosubmit=true`.** Fragment-based prompts never hit the server; Lovable's client-side JS reads `location.hash` and submits. This is the same pattern the Claude/ChatGPT bookmarklet community uses (`claude.ai/new?q=` is querystring but Lovable chose fragment).
- **No cap on `conductor`, `factory`, `warp`, `windsurf`** — the URL builder doesn't wrap in `RW`. This implies the tool authors believed their URL handlers handle arbitrary-length inputs (or Linear hadn't hit the limit in testing).
- **`warp://linear/work?prompt=...`** is namespaced per-originator (`/linear/work`), suggesting Warp has explicit Linear-specific handling rather than a generic prompt entrypoint.

---

## Finding 3: Template variable substitution happens **server-side**, not client-side

**Confidence:** CONFIRMED
**Evidence:** The client makes a GraphQL query `IssuePromptContext($issueId: String!)` that returns a **pre-rendered** prompt string:

```javascript
// Chunk AIActions.B5r9dZjO.js offset 86,400:
function ike(e, t) { return e.query(ake, { issueId: t }); }
var ake = dl`
  query IssuePromptContext($issueId: String!) {
    issuePromptContext(issueId: $issueId)
  }
`;

async function gmt(e, t) {                 // called by every tool path
  let { issuePromptContext: n } = await ike(t, e);
  return n;
}
```

The `{{issue.identifier}}` and `{{context}}` variables described in Linear's settings UI and changelog are **not client-side string replacements**. Linear's backend holds the org's prompt-template text, materializes it with the issue's rendered context, and returns a flat string to the client. The client's only template substitution is for `customUrl`:

```javascript
function kmt(e, t) { return e.replace(/{{(.*?)}}/g, (e, n) => t[n] ?? e); }
// ... used only as:
buildPromptDeepLink: (e, t) => RW(e, e => kmt(n, { prompt: encodeURIComponent(e) }), YW)
```

Even for `customUrl`, the only variable exposed to the user's template is `{{prompt}}` (the pre-rendered prompt from the server) — not `{{issue.identifier}}` or `{{context}}`. Those two variables are only available in the org-level prompt template configured server-side.

**Implication.** The design separates concerns cleanly: (a) prompt composition (org-wide standing instructions + issue rendering) lives server-side as a single authored template, (b) URL construction lives client-side per-tool. Organizations cannot customize per-tool URL shapes; they can only customize the prompt text.

One caveat: `bmt(issue, prompt)` attaches extra metadata (`issueIdentifier`, `issueBranchName`, `projectName`) that is passed to the **terminal-command** path as environment variables (`KW()`-gated behind Linear desktop `1.28.13`+/`1.29.4`+ via the `deepLinkCustomCli` flag) but **not** to the URL-deeplink path:

```javascript
function bmt(e, t) {
  return {
    prompt: t,
    issueIdentifier: e.identifier,
    issueBranchName: e.branchNames[0]?.name,
    projectName: e.project?.value?.name
  };
}
```

URL-scheme tools get only the `${prompt}` parameter — no separate issue-identifier field, no branch name, no project. Whatever context is needed must be embedded inside the prompt text by the server-side `issuePromptContext` resolver.

---

## Finding 4: Payload composition — what goes in "context"

**Confidence:** HIGH (inferred from client-side consumer shape + changelog)
**Evidence:** The client queries `issuePromptContext` (opaque string) and passes it verbatim into `buildPromptDeepLink`. The changelog lists the payload as "the issue ID and all relevant context: description, comments, updates, linked references, and images." The client does not participate in composition; it only enforces the URL length cap via `RW`'s binary-search truncation.

**What the `issuePromptContext` resolver almost certainly emits** (reconstructed from the `bmt` sibling `issueDataForExport` function in the same chunk):

- `identifier` (e.g. `ENG-1234`)
- `title`
- `url` (Linear web URL, e.g. `https://linear.app/<workspace>/issue/ENG-1234/slug`)
- `description` (markdown)
- `status` (workflow state name)
- `priority` (name)
- `labels[]` (names)
- `assignee`, `delegate`, `creator` (display names)
- `project` (name + URL + description)
- `projectMilestone` (name + target date)
- `dueDate`, `slaBreachesAt`, `createdAt`, `updatedAt`
- `subIssues[]` (identifier + title + URL)
- `relatedIssueIdentifiers`, `blockingIssueIdentifiers`, `blockedByIssueIdentifiers`, `duplicateIssueIdentifiers`
- `videoTranscripts` (transcripts of attached videos)
- **(implied)** `comments` and `projectUpdates` referenced in the changelog

**Images.** Linear does not include image binary data in the URL. Images are referenced by their Linear-hosted URL (`https://uploads.linear.app/...` per the CSP) inside the markdown description. The receiving tool must fetch them — which means:
- Tools with visionable chat windows (Codex Desktop, Claude via desktop, Cursor, Copilot Chat in VS Code) can fetch and render.
- Web-URL tools (Replit, v0, Lovable, Netlify) may or may not follow Linear-hosted URLs depending on CORS and auth — Linear's asset URLs require signed access, so there is a high likelihood that **attached images in the deeplink prompt are broken for external recipients** unless the uploader set them to public. Linear's bundle does not rewrite image URLs to public-share variants.

**URL-length truncation.** The binary search in `RW` ensures the total URL (scheme + host + path + encoded prompt + footer) fits under the per-tool cap, and appends the footer `\n\n[Truncated. Full issue available in Linear.]`. This is a key UX quality: **the handoff is never silent on truncation** — the agent always sees the footer and can explicitly ask the user to reference back to Linear for the full issue.

---

## Finding 5: Customer customization UI — settings fields

**Confidence:** CONFIRMED (settings field names extracted verbatim)
**Evidence:** The `user.settings` record surface (extracted from `AIActions.B5r9dZjO.js` references):

| Field | Purpose |
|---|---|
| `enabledExternalApps: string[]` | List of tool IDs the user has enabled (checkboxes in settings UI) |
| `defaultExternalAppId: string` | Pinned-to-top tool; invoked by the `Cmd+Option+.` / `Ctrl+Alt+.` shortcut |
| `customDeepLinkUrlTemplate: string` | User-authored URL template for `customUrl`; `{{prompt}}` is the only supported variable |
| `localDevRepoPaths: string[]` | Recent-directory picker for terminal-command tools |
| `defaultTerminalAppName: string` | Which terminal app to spawn (Terminal.app, iTerm, Warp, Windows Terminal, etc.) |

The changelog also references an **org-wide prompt template** configured at the workspace level (containing `{{issue.identifier}}` and `{{context}}`). This is not exposed in any client-side settings field I found — it's configured through the web settings UI and persisted server-side, then baked into `issuePromptContext` at query time.

**Version gates.** Several tools are gated on Linear desktop-app version:
```javascript
function Emt() { return Ku.isElectron ? GW(`1.28.11`, `1.29.2`) : !1; }
function Dmt() { return Ku.isElectron ? ???                      : !1; }   // codexCli gate
function Omt() { return Dmt(); }                                            // amp gate (delegated)
function KW()  { return Ku.isElectron && E.isEnabled(E.deepLinkCustomCli) && GW(`1.28.13`, `1.29.4`) : !1; }
// XW = new Date(`2026-08-13`) — "stop tracking at" for anonymous analytics
```

The `GW(minor, minor-patch)` helper compares `Ku.bridge.version` against thresholds on both the `1.28.x` (stable) and `1.29.x` (pre-release) Linear desktop tracks. The telemetry event name is `openInExternalApp` with `externalApp: t.id` and `error` field; analytics stop being collected after **2026-08-13** (implied sunset of the current telemetry schema).

---

## Finding 6: Registry has grown from 9 to 19 entries since 2026-02-26 announcement

**Confidence:** CONFIRMED
**Evidence:** The announcement names 9 tools (Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed). The 2026-04-17 production bundle contains 19 entries total: the original 9 + Amp (Sourcegraph's agent CLI), Devin, Factory, Lovable, Netlify Agent Runners, Warp, Windsurf, plus two "user-defined" entries (customUrl, customTerminalScript). The bundle's `Last-Modified` is today (2026-04-17 00:40:11 UTC), so these additions are cumulative over ~7 weeks of post-launch iteration.

**Category breakdown of the post-launch additions:**

| Added tool | Category | Added mechanism |
|---|---|---|
| Amp | Terminal (Sourcegraph CLI) | `amp -x <prompt>` |
| Devin | Web URL | `https://app.devin.ai/?prompt=...` |
| Factory | Desktop scheme | `factory-desktop://new?prompt=...` |
| Lovable | Web URL (hash) | `https://lovable.dev/?autosubmit=true#prompt=...` |
| Netlify | Web URL | `https://app.netlify.com/run?prompt=...&utm_source=linear_deeplink` |
| Warp | Desktop scheme | `warp://linear/work?prompt=...` |
| Windsurf | Desktop scheme | `windsurf://cascade?prompt=...` |

Linear is adding **roughly one tool per week** to this registry. The architectural investment pays for itself: each new integration is ~5 lines of registry data, because the prompt-rendering infrastructure (`issuePromptContext` resolver + `RW` truncator + `buildPromptDeepLink` protocol) is stable and reused.

---

## Comparison: Linear vs Mintlify vs Raycast prompts-chat

| Dimension | Linear (this evidence) | Mintlify (evidence/react-grab-and-similar-handoff-tools.md) | Raycast prompts-chat (evidence/raycast-prompts-chat-registry.md) |
|---|---|---|---|
| Tool count | **19** (9 at launch, +10 post-launch as of 2026-04-17) | 7 chat + 4 MCP install | 28 |
| Product category | SaaS issue tracker | Docs-site renderer (customer's site) | Command-bar launcher |
| Distribution | Customer-level feature, server-rendered prompt | Build-time config injection | Open-source per-extension TypeScript |
| Source of truth | **Closed (runtime bundle only)** | Open (bundle accessible) | Open (github.com/raycast/extensions) |
| URL-template extraction | This evidence file | `docs-site-handoff-landscape.md` | Documented per extension in `raycast-prompts-chat-registry.md` |
| Terminal-command tools | **Yes — 4 (Amp, Claude Code, Codex CLI, OpenCode) via Electron IPC** | No | Clipboard-only fallback for some extensions |
| URL-scheme tools | 15 | 11 total (7 chat + 4 install) | ~23 (web) + ~5 (desktop scheme) |
| Prompt customization | Org-wide template with `{{issue.identifier}}` + `{{context}}` | None (fixed per-provider) | Per-extension TypeScript (most flexible) |
| Attribution parameter | `utm_source=linear_deeplink` (Netlify only); `referrer=Linear` (Replit only); `connectorNames=linear` (Replit only) | `?ref=<docs-site>` on some | Varies per extension |
| URL-length cap | **Explicit 2000 or 8000 byte cap with binary-search truncation + "Truncated" footer** | None observed | None observed |
| Compression | lz-string for Replit only | None | None |
| Double-encoding | 3 tools (Cursor, Copilot, Windsurf) | Not observed | Not observed |
| Origin gating | Linear desktop app version + feature flag + user enablement | Build-time opt-in | Raycast extension install |

**Linear is the most engineered** of the three. Mintlify's list is largely a static switch. prompts-chat's 28 is bigger but each is a hand-crafted extension owned by the extension author. Linear's registry is **one team's 19 integrations**, server-consistent prompt rendering, and version-gated fallback behavior. It is the strongest prior art for a handoff UX that needs to work across (a) tools the user has installed, (b) tools the user has configured, (c) tools with varying context-intake capabilities.

---

## Patterns applicable to Open Knowledge

### 1. Server-rendered prompt, client-rendered URL

**Observation.** Linear pre-renders the prompt text on the server (`issuePromptContext` GraphQL query). The client only does URL construction and truncation. This cleanly separates "what context should the prompt contain?" (a server-side business rule, editable by the org admin) from "which tool is the user invoking?" (a client-side ephemeral choice).

**For OK.** A wiki-page-to-agent handoff has the same shape: the page's render is a stable, server-composable artifact (markdown + frontmatter + backlinks + related pages), and the per-tool URL is ephemeral. If OK ships an MCP tool like `handoff_to_agent(page: string, agent: string)`, the prompt rendering should happen at MCP-tool level (so an MCP-connected agent gets the same payload an IDE deep-link user does) while per-tool URL construction lives in one small client-side (or CLI-side) table.

### 2. URL-length truncation with visible footer is non-negotiable

**Observation.** Linear's `RW` function does binary-search truncation and **appends a visible footer** (`[Truncated. Full issue available in Linear.]`). The receiving agent always knows when it has partial context and has a pointer back to the canonical source.

**For OK.** Any wiki-page-to-agent deep link should assume 2 KB as the lower-bound URL cap (Windows, Linux, some older Chrome variants), truncate to fit, and append a `[Truncated. Full page at <OK URL>.]` footer. Silent truncation is a bug.

### 3. Double-encode for URL handlers that decode twice

**Observation.** Cursor, GitHub Copilot, Windsurf receive `encodeURIComponent(encodeURIComponent(e))`. The OS-level protocol handler decodes once; the app's router decodes again. Single-encoding results in `%20` → ` ` at OS level → ` ` at app level, which is fine for ASCII but breaks everything else (`%7B` → `{` → `{` works, but `%20%20` → `  ` → `  ` is mangled because double-spaces get collapsed by some URL parsers en route). OK should test against each target tool and tabulate the decoding behavior before assuming single-encoding works.

**For OK.** The specific list of tools OK plans to ship with (Claude Code, Claude Desktop, Cursor, Codex, Zed, VS Code, etc.) should each be tested with a payload containing `%20`, `%0A`, `%2B`, `%26`, `%2F`, `%23`, emoji, and leading whitespace. The result is a per-tool encoding column in OK's registry.

### 4. Terminal-command channel expands the design space beyond URL schemes

**Observation.** Linear ships 4 of its 19 tools as shell-exec (Claude Code, Codex CLI, Amp, OpenCode). This matters because those four are **terminal-first CLIs with no URL scheme**. If Linear had restricted itself to URL schemes, it would have shipped 0 Claude Code support. Instead, the Electron desktop app mediates: Linear asks the user for a working directory, then runs `claude "<prompt>"` in a user-selected terminal emulator.

**For OK.** If OK ships a desktop app (or embeds in one that has shell-exec capability, e.g., an IDE extension), the handoff surface is URL schemes **union** shell-exec. This doubles the tool support ceiling. Claude Code is not going to ship a URL scheme — its product model is terminal-native. Any OK integration story that ignores shell-exec handoff ships as "nothing" for Claude Code.

### 5. Linear's architecture is trivial to extend — steal it

**Observation.** Adding a new tool is ~5 lines of registry data:
```javascript
{ id: `foo`, name: `Foo`, icon: ..., available: !0, description: `...`,
  buildPromptDeepLink: e => RW(e, e => `foo://prompt?q=${encodeURIComponent(e)}`, 2e3) }
```
All the plumbing (feature flag, user enablement, URL truncation, telemetry, analytics, unavailable-reason toasts, keyboard-shortcut promotion) lives in shared functions. Ten tools added in seven weeks post-launch is direct empirical evidence that the registry pattern scales.

**For OK.** OK's registry should ship with the same shape: `{ id, name, icon, availableWhen, description, buildPromptDeepLink(prompt) }` or `{ id, name, icon, availableWhen, description, command, commandArgs(prompt) }` as a discriminated union. No per-tool bespoke flow. The single most valuable post-launch feedback loop is "user asks for tool X, engineer adds row to registry."

### 6. `utm_source` / `referrer` parameters are the only cross-tool telemetry

**Observation.** Netlify gets `&utm_source=linear_deeplink`; Replit gets `&referrer=Linear&connectorNames=linear`. The other tools do not. This means Linear only knows about Netlify + Replit handoff success via the receiving tool's analytics; for everything else, Linear's own telemetry (`Action Invoked` event with `externalApp: t.id`) is the signal.

**For OK.** OK should send `utm_source=<ok-deployment-id>` (or similar) to every web-URL target, and accept that desktop-scheme targets will report back via their own channel. This is the cheapest way to get ecosystem-level signal on "which tools are users actually handing off to?"

### 7. Org-wide prompt customization dominates per-tool URL variation

**Observation.** Linear lets org admins set a workspace-wide prompt template with `{{issue.identifier}}` and `{{context}}`. Users cannot customize per-tool prompts. This is a deliberate choice: most orgs want "every Linear → agent handoff includes our standing instructions about test coverage, PR formatting, and security review." Per-tool variation is rarely useful.

**For OK.** The simpler product shape is: one org-wide prompt template (rendered server-side), one per-tool URL table (shipped in code). Let the registry grow. Do not ship a per-tool prompt-customization UI unless a user explicitly asks for one.

---

## Negative searches

- **`claude://` scheme in `AIActions.B5r9dZjO.js`:** NOT FOUND. Linear does not use the Claude Desktop URL scheme; Claude Code is strictly a terminal command.
- **`chatgpt://` / `openai://` scheme:** NOT FOUND. Linear does not target ChatGPT Desktop.
- **`https://claude.ai/new?q=` web fallback:** NOT FOUND. Linear does not ship a Claude web-UI fallback for non-Electron users; those users see Claude Code as unavailable.
- **`https://chatgpt.com/?q=` web fallback for Codex:** NOT FOUND. Codex on web is not a fallback in the registry — users must have Codex Desktop installed.
- **Per-tool customization UI** (e.g., a setting for "Cursor-specific prompt prefix"): NOT FOUND. Only one workspace-wide template.
- **Image upload via data URL / base64 in prompt:** NOT FOUND. Images are referenced as `https://uploads.linear.app/...` URLs inside the markdown payload; no binary inlining.
- **MCP-specific URL targets** (e.g., `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=...`): NOT FOUND in deep-link registry. Linear's MCP install flow is a separate feature (`workspaceMcpServerConnectionsQuery.KWzeCwxY.js` chunk), not co-located with the deep-link registry.
- **Jetbrains / IntelliJ scheme:** NOT FOUND. No `jetbrains://` or `idea://` entries; Jetbrains AI Assistant is not in the registry.
- **Zed MCP install URL** (e.g., `zed://extension/...`): NOT FOUND; only `zed://agent?prompt=` is used.

---

## Gaps / follow-ups

1. **Inspect the org-settings UI to capture the exact default prompt template.** The workspace prompt template (with `{{issue.identifier}}` and `{{context}}`) is server-persisted and only visible through the web settings UI. A fully-logged-in Linear account is required to dump the default value. The changelog's screenshot shows a partial template ("You are working on {{issue.identifier}}. {{context}}...") but the full default is elided.
2. **Verify what the `issuePromptContext` GraphQL resolver actually emits.** An authenticated `POST https://api.linear.app/graphql` with the query body from this evidence file would return the flat prompt string for a known issue. The structural composition (field ordering, markdown formatting, comment serialization) is useful for OK's own prompt-rendering pass.
3. **Test double-encoding behavior per target tool.** I documented which tools Linear double-encodes, but did not verify Linear's choice matches the tool's actual decoding behavior (i.e., whether Cursor, Copilot, Windsurf would break with single encoding). A test matrix of payload fixtures per tool would confirm.
4. **Compare `codex://new?prompt=` vs Open Knowledge's findings in `codex-desktop-deep-links.md`.** The prior evidence file captured `codex://new?prompt=<p>&path=<abs>&originUrl=<git>`. Linear omits `path` and `originUrl`. For OK, this is a product decision: if OK can supply a repo path (e.g., "this wiki page is about the repo at `~/projects/foo`"), passing `path` to Codex primes the Codex session with the repo mounted.
5. **Track future registry changes.** The `AIActions.B5r9dZjO.js` bundle is content-hashed; Linear ships a new hash per deploy. Monitoring bundle changes would track Linear's tool-registry evolution over time. A simple cron hitting `linear.app/login` + grepping the HTML for the hash would suffice.
6. **Audit the `runTerminalCommand` IPC surface** in Linear's Electron app. The shell-exec channel is the most surprising find; understanding its sandbox (does it run in the user's `$PATH` context? does it set `$PWD`? does it forward env vars?) clarifies what OK would need to expose if OK ships similar functionality.
7. **Measure truncation frequency.** Linear's binary-search truncation exists — but how often is it hit? An org with large issue descriptions + many comments would hit 2 KB constantly. This is a product-health signal Linear must have internal metrics for; OK should ship analytics on truncation rate from day 1.
