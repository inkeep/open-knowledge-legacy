# Evidence: react-grab and Similar Context-Handoff Tools

**Dimension:** D5 + D7 — react-grab (primary subject) + similar "capture page context → hand off to AI chat" tools
**Date:** 2026-04-16
**Sources:** `github.com/aidenybai/react-grab` source at HEAD (`/tmp/react-grab`, cloned 2026-04-16), GitHub API (`gh api repos/aidenybai/react-grab`), Mintlify `docs.json` runtime bundle (`mintlify.com/docs/_next/static/chunks/21749-6fce9635810625a1.js`, downloaded 2026-04-16), web searches for comparable tools

---

## Key sources referenced

- `github.com/aidenybai/react-grab` — MIT, **6,983 stars / 317 forks**, created 2025-10-17, last push 2026-04-16 (v0.1.32). Author: Aiden Bai (also `react-scan`, `million`).
- `/tmp/react-grab/packages/react-grab/src/utils/copy-content.ts` — clipboard writer
- `/tmp/react-grab/packages/react-grab/src/core/context.ts` — element → source-location resolution
- `/tmp/react-grab/packages/mcp/src/server.ts` — MCP stdio/HTTP bridge
- `/tmp/react-grab/packages/mcp/src/client.ts` — in-page auto-submit of grabbed context to localhost MCP
- `/tmp/react-grab/packages/cli/src/utils/install-mcp.ts` — list of target MCP clients (9 agents)
- `/tmp/react-grab/packages/react-grab/docs/architecture.md` — plugin-pipeline rationale
- `https://chromewebstore.google.com/detail/element-inspector/kihgokmdhbgpbgleeigipcjpnfohkghc` — comparable clipboard-only element inspector
- `https://github.com/mcpc-tech/dev-inspector-mcp` — comparable MCP-based visual inspector
- `https://github.com/give-me/bookmarklets` — multi-chatbot export bookmarklets (DOM scraping, not handoff)
- `https://www.vincentschmalbach.com/claude-chatgpt-bookmarklets/` — `https://claude.ai/new?q=` / `https://chatgpt.com/?q=` bookmarklet pattern
- `https://www.mintlify.com/docs/ai/contextual-menu` — docs-site contextual menu spec (provider list)
- `mintlify.com/docs/_next/static/chunks/21749-6fce9635810625a1.js` (prod bundle) — **actual URL templates Mintlify constructs per provider**

---

## Part 1: react-grab deep dive

### Finding 1: react-grab is an MCP + clipboard tool — it does NOT use desktop-app URL schemes
**Confidence:** CONFIRMED
**Evidence:** Exhaustive grep for `claude://`, `cursor://`, `chatgpt://`, `codex://`, `openai://`, `perplexity://`, `claude.ai/new`, `chatgpt.com/?q=` across the entire repo (`packages/`, `apps/`) returns **zero matches** inside runtime code (only incidental mentions in `AGENTS.md` style docs, unrelated to handoff).

```bash
$ rg "claude://|cursor://|chatgpt://|codex://|claude\\.ai/new|chatgpt\\.com/\\?q" packages/ apps/
# (no runtime hits; 1 unrelated match in apps/website/AGENTS.md about nuqs)
```

The two handoff mechanisms react-grab ships are (a) **clipboard writes with a custom MIME type**, and (b) a **local MCP server** that the running coding-agent CLI connects to over stdio/HTTP. No `window.open()`, no `<a href="claude://...">`, no protocol handler.

**Implication:** react-grab operates entirely under the assumption that the coding agent is *already running* either (i) as a CLI on the same box reading the clipboard/MCP, or (ii) as an IDE extension with MCP wired into the editor — **not as a Desktop chat app the user hasn't opened yet.** This is a distinctly different mental model from "Codex Desktop / Claude Desktop deep-link": react-grab's handoff is *already-connected agents*, not *cold-launch a GUI*.

### Finding 2: Clipboard writer uses three MIME types, including a custom one for structured metadata
**Confidence:** CONFIRMED
**Evidence:** `packages/react-grab/src/utils/copy-content.ts:29-82`

```typescript
const REACT_GRAB_MIME_TYPE = "application/x-react-grab";

export const copyContent = (content: string, options?: CopyContentOptions): boolean => {
  // ...
  const copyHandler = (event: ClipboardEvent) => {
    event.preventDefault();
    event.clipboardData?.setData("text/plain", content);
    event.clipboardData?.setData(
      "text/html",
      `<meta charset='utf-8'><pre><code>${escapeHtml(content)}</code></pre>`,
    );
    event.clipboardData?.setData(REACT_GRAB_MIME_TYPE, JSON.stringify(reactGrabMetadata));
  };
  // ... uses execCommand("copy") for synchronous key-handler compatibility
};
```

Three clipboard payloads per grab:
1. `text/plain` — the pasteable snippet (primary target: any editor / chat box)
2. `text/html` — a `<pre><code>` block for rich-text sinks (Notion, Google Docs)
3. `application/x-react-grab` — full metadata JSON (`{version, content, entries[], timestamp}`) for *compatible* paste targets

**Implication:** The design bets that the destination is a CLI or editor with its own paste handling, not a desktop app URL intent. The `application/x-react-grab` MIME is a *forward-compatibility seed* — a hypothetical future agent could read structured metadata from clipboard without string parsing. As of 2026-04-16, no agent in `install-mcp.ts`'s list reads this custom MIME.

### Finding 3: The captured payload is structurally "HTML preview + React owner-stack trace"
**Confidence:** CONFIRMED
**Evidence:** `packages/react-grab/src/core/context.ts:492-505` + `formatStackContext()` at `:423-471`

```typescript
export const getElementContext = async (element, options) => {
  const resolvedElement = findNearestFiberElement(element);
  const html = getHTMLPreview(resolvedElement);          // <tag attr="...">text</tag>
  const stackContext = await getStackContext(resolvedElement, options);
  return stackContext ? `${html}${stackContext}` : getFallbackContext(resolvedElement);
};
```

Example output (from README):
```
<a class="ml-auto inline-block text-sm" href="#">
  Forgot your password?
</a>
in LoginForm at components/login-form.tsx:46:19
```

Each `in <ComponentName> at <file>:<line>:<col>` line is emitted by `formatStackContext` walking the React owner stack produced by `bippy`'s `getOwnerStack(fiber)`. The `(at ...)` format is intentionally the **same format React prints to the dev-tools console on warnings** — React's builtin parser already recognizes it.

Notable engineering details:
- **Next.js App Router server-component symbolication** (`symbolicateServerFrames`, `:154-224`) — POSTs unresolved virtual frames (`rsc://React/...`) to `/__nextjs_original-stack-frames` to recover real file paths via the dev server's source-map endpoint.
- **Line/column only included for Next.js** (`:455-459`), because Vite owner stacks produce unreliable coordinates:
  ```typescript
  // HACK: bundlers like Vite produce unreliable line/column numbers from
  // owner stacks, so we only include them for Next.js where the dev
  // server symbolicates frames via source maps.
  if (isNextProject && frame.lineNumber) { line += `:${frame.lineNumber}`; ... }
  ```
- **Internal-component filtering** (`NEXT_INTERNAL_COMPONENT_NAMES`, `REACT_INTERNAL_COMPONENT_NAMES` at `:45-79`) — skips `InnerLayoutRouter`, `Suspense`, `ErrorBoundary`, etc. so the user sees their own components, not framework scaffolding.

**Implication:** The payload is *authored* to be legible both to humans and to the coding agent — it intentionally mirrors React's own devtools output.

### Finding 4: The MCP bridge is a localhost HTTP server with a single tool + TTL'd context slot
**Confidence:** CONFIRMED
**Evidence:** `packages/mcp/src/server.ts:17-75`

```typescript
const agentContextSchema = z.object({
  content: z.array(z.string()).describe("Array of context strings (HTML + component stack traces)"),
  prompt: z.string().optional().describe("User prompt or instruction"),
});

let latestContext: StoredContext | null = null;

// One MCP tool:
server.registerTool("get_element_context",
  { description: "Get the latest React Grab context that was submitted..." },
  async () => {
    if (!latestContext) return textResult("No context has been submitted yet.");
    const isExpired = Date.now() - latestContext.submittedAt > CONTEXT_TTL_MS;
    if (isExpired) { latestContext = null; return textResult("No context has been submitted yet."); }
    const result = textResult(formatContext(latestContext.context));
    latestContext = null;  // single-read semantics — context is consumed on fetch
    return result;
  },
);
```

The architecture:
- Browser page auto-detects a local MCP server at `http://localhost:<DEFAULT_MCP_PORT>/health` (client.ts:49-61, caches result in `sessionStorage`).
- On every grab, `onCopySuccess` POSTs the content array to `http://localhost:<port>/context` (client.ts:27-34).
- The coding agent (Claude Code, Cursor, Codex, etc.) — which has been reconfigured via `grab add mcp` to launch `npx react-grab-mcp --stdio` — fetches via MCP tool call `get_element_context`.
- Context is **single-use** (`latestContext = null` after read) and **TTL-expired** (`CONTEXT_TTL_MS`) to avoid stale grabs.

**Implication:** The MCP path bypasses the clipboard entirely. The user's flow is: point-grab → press shortcut → next CLI turn, the agent pulls the latest grab via MCP without the user pasting. This is the **intended agentic workflow**; clipboard is the fallback for agents that haven't installed the MCP server or when pasting into a GUI chat.

### Finding 5: The CLI writes to 9 different MCP client config files
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/utils/install-mcp.ts:60-138`

| Target | Config path | Config key | Format |
|---|---|---|---|
| Claude Code | `~/.claude.json` | `mcpServers` | JSON |
| Codex | `~/.codex/config.toml` (or `$CODEX_HOME`) | `mcp_servers` | TOML |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | JSON |
| OpenCode | platform-specific | `mcp` | JSON |
| VS Code | `~/Library/.../Code/User/mcp.json` | `servers` | JSON |
| Amp | `~/.config/amp/settings.json` | `amp.mcpServers` | JSON |
| Droid | `~/.factory/mcp.json` | `mcpServers` | JSON |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | JSON |
| Zed | platform-specific | `context_servers` | JSON |

All clients get the same stdio config (`npx -y @react-grab/mcp --stdio`) with per-client key-name and type-tag variations (some need `"type": "stdio"`, Zed needs `"source": "custom"`, etc.).

**Implication:** react-grab is MCP-provider-agnostic — the author explicitly does NOT pick one AI provider. The **target audience is whichever coding agent the user already runs**. This is a *different bet* from Mintlify's "Open in ChatGPT/Open in Claude" (which names web-URL providers by name and opens each in a new tab; see Part 2).

### Finding 6: File-open uses Next.js `/__nextjs_launch-editor` and Vite `/__open-in-editor` — NOT protocol URLs
**Confidence:** CONFIRMED
**Evidence:** `packages/react-grab/src/utils/open-file.ts:8-41`

```typescript
const tryDevServerOpen = async (filePath, lineNumber) => {
  const isNextProject = checkIsNextProject();
  const params = new URLSearchParams({ file: filePath });
  const lineKey = isNextProject ? "line1" : "line";
  const columnKey = isNextProject ? "column1" : "column";
  if (lineNumber) params.set(lineKey, String(lineNumber));
  params.set(columnKey, "1");
  const endpoint = isNextProject
    ? `${getNextBasePath()}/__nextjs_launch-editor`
    : "/__open-in-editor";
  const response = await fetch(`${endpoint}?${params}`);
  return response.ok;
};
```

Open-in-editor goes through the **dev server's own launch-editor endpoint** — the Next.js and Vite convention — which then spawns `$EDITOR` server-side. A `vscode://file/...` protocol URL is a documented extension point via `transformOpenFileUrl` (comment at primitives.ts:118), but **no such URL is constructed by default**.

**Implication:** react-grab's "open in IDE" feature leverages existing dev-server infrastructure rather than the OS protocol handler. For desktop AI chat apps, a parallel "transformAgentOpenUrl" hook would be the natural extension point — but it doesn't exist in v0.1.32.

### Finding 7: The plugin pipeline is explicitly the hook where desktop-app handoff *could* live
**Confidence:** INFERRED
**Evidence:** `packages/react-grab/src/core/copy.ts:21-79` + `architecture.md:§ Design principles`:

> "Implement all user-facing actions as plugins — Every user-facing action — copy snippet, copy HTML, copy styles, add comment, open in editor — is implemented as a plugin that registers context-menu entries and hooks. The core doesn't hardcode any clipboard behavior. When the user triggers a copy, the content passes through a pipeline of plugin transforms (`onBeforeCopy`, `transformSnippet`, `transformCopyContent`) before it reaches the clipboard."

The built-in plugins are: `copy`, `comment`, `open` (file in editor), `copy-html`, `copy-styles`. A hypothetical "open-in-claude-desktop" plugin would register a context-menu action with `onAction` that constructed `claude://claude.ai/new?q=<generated content>` and called `window.open()`. Nothing in the plugin API prevents this — it just isn't built-in.

### Finding 8: Maturity signal — 6,983 stars in 6 months, active weekly releases
**Confidence:** CONFIRMED
**Evidence:** `gh api repos/aidenybai/react-grab`:

```json
{
  "stargazers_count": 6983,
  "forks_count": 317,
  "watchers_count": 6983,
  "created_at": "2025-10-17T10:08:55Z",
  "pushed_at": "2026-04-16T06:00:30Z",
  "license": {"spdx_id": "MIT"},
  "open_issues_count": 93,
  "topics": ["ai", "coding", "react", "react-grab"]
}
```

Package version `0.1.32` at HEAD, created 2025-10-17 — **~1,200 stars/month sustained**, directly comparable to kepano's `obsidian-skills` pace (221/day) referenced in CLAUDE.md. The author previously shipped `react-scan` (21.1K) and `million` (17.6K) — this is the third hit from the same author on React devtooling.

---

## Part 2: Similar tools

### Tool 1: Mintlify contextual menu (docs sites → AI chat apps) — THE URL-scheme counterexample to react-grab

- URL: `https://www.mintlify.com/docs/ai/contextual-menu` (spec) + `mintlify.com/docs/_next/static/chunks/21749-6fce9635810625a1.js` (implementation)
- License + adoption: Proprietary SaaS. Powers docs for 10K+ companies (Anthropic, OpenAI, Cursor, etc., per Mintlify marketing)
- **URL scheme targets:** Every provider uses a **web URL**, except Windsurf (`windsurf://`) and Cursor (`cursor://`). **None uses `claude://` or `codex://` or `chatgpt://` desktop schemes.**
- Capture payload: The current doc page URL (`.md` suffix appended for Claude/Perplexity/Grok/AI Studio variants — Mintlify auto-serves `<page>.md`) wrapped in a natural-language prompt: `"Read from <url>.md so I can ask questions about it."`
- UX: Dropdown menu in the docs page header. User clicks "Open in Claude" → new tab opens in the browser → (if user has Claude Desktop installed with `claude.ai` handler registered — see `claude-desktop-deep-links.md`) Claude Desktop *may* intercept. But Mintlify itself always constructs a web URL, not a protocol URL.

**Verbatim code (from Mintlify prod bundle, deobfuscated):**

```javascript
// L = new URL(window.location.href); t.hash = "";
let r = t.toString();
let a = encodeURIComponent(`Read from ${r}.md so I can ask questions about it.`);
let n = encodeURIComponent(`Read from ${r} so I can ask questions about it.`);
switch (e) {
  case "chatgpt":    window.open(`https://chat.openai.com/?hints=search&q=${n}`, "_blank"); break;
  case "claude":     window.open(`https://claude.ai/new?q=${a}`,                 "_blank"); break;
  case "perplexity": window.open(`https://www.perplexity.ai/search?q=${a}`,      "_blank"); break;
  case "grok":       window.open(`https://grok.com/?q=${a}`,                     "_blank"); break;
  case "aistudio":   window.open(`https://aistudio.google.com/prompts/new_chat?prompt=${a}`, "_blank"); break;
  case "devin":      window.open(`https://app.devin.ai/?prompt=${a}`,            "_blank"); break;
  case "windsurf":   window.open(`windsurf://cascade?prompt=${a}`,               "_blank"); break;
}
```

And for the MCP-install deeplink flow (Cursor specifically):

```javascript
// Cursor deeplink builder
if ("cursor" === r) {
  try {
    let t = JSON.stringify(e);
    let r = A.from(t, "utf8").toString("base64").replace(/\+/g, "%2B");
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(e.name)}&config=${encodeURIComponent(r)}`;
  } catch (e) { console.error("Error generating Cursor deep link:", e); return null; }
}
```

**Key observation:** Mintlify **distinguishes prompt param names per provider** — ChatGPT and Claude/Perplexity/Grok get separate URL variants (`n` has `.md` omitted so ChatGPT fetches the HTML page with search hints; `a` has `.md` appended so MCP-aware agents fetch raw markdown). Only Windsurf gets a desktop protocol URL. This is the **most thoroughly-engineered per-provider URL builder** in my sample.

### Tool 2: Vincent Schmalbach bookmarklets — minimal canonical pattern

- URL: `https://www.vincentschmalbach.com/claude-chatgpt-bookmarklets/`
- License: blog post with inline `javascript:` URL snippets (copy-paste)
- URL scheme targets: `https://claude.ai/new?q=<encoded>` and `https://chatgpt.com/?hints=search&q=<encoded>` — web URLs only; no desktop scheme
- Capture payload: `window.getSelection().toString()` (selected text on the current page), optionally combined with `window.location.href` and a hard-coded prompt wrapper
- UX: Drag-to-bookmarks-bar bookmarklet. One click → new tab → user still has to press Enter in the chat (prompt is pre-filled but typically not auto-submitted — depends on chat app)

**Pattern (paraphrased from the article):**

```javascript
javascript:(() => {
  const selectedText = window.getSelection().toString();
  if (selectedText) {
    const prompt = `Please summarize the following:\n\n${selectedText}`;
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank');
  }
})()
```

**Implication:** This is the **lowest-friction, zero-install pattern in the ecosystem**. Every competing docs-site / inspector / dev tool is, at heart, a more-structured-payload wrapper around this three-line skeleton. The query parameter name `q` for Claude is confirmed here and matches the binary-inspection finding in `claude-desktop-deep-links.md`.

### Tool 3: Element Inspector (Chrome extension) — clipboard-only competitor to react-grab

- URL: `https://chromewebstore.google.com/detail/element-inspector/kihgokmdhbgpbgleeigipcjpnfohkghc`
- License: Proprietary (Chrome Web Store)
- URL scheme target: **None**. Pure clipboard.
- Capture payload: "Element tag, selector, and DOM path; complete HTML markup; all attributes; computed styles (intelligently filtered); position and dimensions; inner text content; page URL and timestamp" — output formatted as clean Markdown.
- UX: Browser extension, click icon → click element → payload on clipboard → user pastes into any AI chat (web or desktop)
- Evidence snippet (from store listing, via WebFetch):
  > "Output is formatted in clean Markdown, ready to paste into ChatGPT, Claude, or any AI assistant"

**Implication:** Same mental model as react-grab's **fallback clipboard path** (structured markdown payload, provider-agnostic), but framework-unaware — captures DOM, not React owner stack. Weaker for React apps, stronger for generic pages.

### Tool 4: DevInspector (`@mcpc-tech/dev-inspector-mcp`) — direct MCP competitor to react-grab

- URL: `https://github.com/mcpc-tech/dev-inspector-mcp`
- License: (unspecified in WebFetch; likely MIT — typical for mcpc-tech repos)
- URL scheme target: **None**. MCP + ACP (Agent Client Protocol).
- Capture payload: Source-code location, DOM state, styles, network requests (headers/body/timing), console messages, terminal output, and screenshots — exposed as MCP tools `capture_element_context` and `get_page_info`.
- UX: `npm i -D @mcpc-tech/unplugin-dev-inspector-mcp` + `npx ... setup` auto-configures Vite/Webpack/Next.js and installs MCP config for the user's detected editor.
- Targeted agents: Cursor, VS Code, Windsurf, Claude Code, Antigravity, Codex CLI, Gemini CLI, Goose, Opencode, Kimi CLI, CodeBuddy Code
- Evidence (from GitHub readme via WebFetch):
  > "Automatically updates MCP configuration files for detected editors when the dev server starts"
  > "Source code location, DOM state, styles, network, console, terminal output, and screenshots"

**Implication:** Same architecture as react-grab's MCP package (auto-wire editor's MCP config, expose context over local MCP server), but framework-generic (Vue/Svelte/SolidJS/Preact beyond React) and carries *much* richer payload (network + console + screenshots). Neither targets desktop AI chat apps — both assume an agent CLI or IDE extension.

### Tool 5: LocatorJS / click-to-component / Click-To-Component — IDE-handoff, not AI-handoff

- URLs: `https://www.locatorjs.com/`, `https://github.com/ericclemmons/click-to-component` (and community ports)
- License: MIT
- URL scheme target: **Editor protocol URLs** — `vscode://file/<path>:<line>:<col>`, `cursor://file/...`, `idea://open?file=...`, `subl://open?url=file:...`. These predate the AI-desktop-URL-scheme era and target IDEs, not chat.
- Capture payload: `__source` babel-plugin metadata — file, line, column. No HTML, no component tree.
- UX: Alt+click (or Ctrl+Shift+X) on a rendered component → editor opens to that line. Pure developer tool, no AI loop.

**Implication:** Prior art for "point at a component → deep-link to its origin," but the destination is an **IDE**, not an AI chat. react-grab updates the target from IDE to coding-agent CLI; a hypothetical "Grab-to-Claude-Desktop" plugin would move the target again to the desktop chat app. All three sit on the same axis of the space (alt-click → somewhere), differing only in the destination.

### Tool 6: `give-me/bookmarklets` — inverse pattern (chat export, not handoff)

- URL: `https://github.com/give-me/bookmarklets`
- License: (unspecified; typical MIT)
- URL scheme target: **None**. Operates on the ChatGPT/Claude/Grok/Gemini page itself, scraping the DOM.
- Capture payload: Selectors like `div[data-testid="user-message"]` to extract a conversation → convert to PDF or text file locally.
- UX: Drag-to-bookmarks-bar; click inside an AI chat → file downloads.

**Implication:** This is *inverse* to the handoff direction — it's **export from AI chat to local disk**, not **push page context into AI chat**. Worth noting as counter-example when mapping the space: the "AI chat ↔ rest of desktop" boundary has traffic in both directions, and the tools on the inbound side (into-AI) vastly outnumber the outbound side (out-of-AI).

### Tool 7: Raycast / Alfred Claude extensions — command-bar → desktop app

- URLs: `https://www.raycast.com/qazi0/claudecast`, `https://github.com/ammonhaggerty/alfred-claude`, community forum `https://www.alfredforum.com/topic/22487-workflow-to-open-chat-in-brand-new-claude-desktop-app/`
- License: typically MIT for community extensions
- URL scheme target: **Varies by extension.** Some hit Claude's API directly (no desktop involvement); the Alfred "brand-new Claude desktop app" workflow (as titled) is reportedly built around `claude://claude.ai/new?q=<prompt>` but was not directly verified in this investigation (see Gaps below). A sibling report in this series covers the Raycast/Alfred surface area in depth.
- Capture payload: Whatever Raycast/Alfred has in context — typically user-typed query, clipboard, or Alfred universal-action selection.
- UX: Spotlight-replacement keystroke → type → answer appears (either in the command-bar UI for API-based extensions, or by launching Claude Desktop with a prompt for URL-scheme extensions).

**Implication:** This category is the *only* ecosystem I identified where users explicitly want to target the desktop app (because they press a global hotkey while *not* in the browser). Every browser-based tool in this list either targets the web (Mintlify, bookmarklets) or targets an already-running CLI/IDE (react-grab, DevInspector) — Raycast/Alfred is where `claude://` / `codex://` schemes most obviously pay off.

---

## Part 3: Patterns observed

### Pattern 1: Web URLs dominate by default; desktop URL schemes are a deliberate upgrade

Of the tools surveyed, **Mintlify is the only one that routes any provider through a desktop scheme** (and only one provider: Windsurf's `windsurf://cascade?prompt=`). Every other "Open in Claude / Open in ChatGPT" surface uses the web URL:

- `https://claude.ai/new?q=<prompt>`
- `https://chat.openai.com/?hints=search&q=<prompt>` (alt: `https://chatgpt.com/?q=<prompt>`)
- `https://www.perplexity.ai/search?q=<prompt>`
- `https://grok.com/?q=<prompt>`
- `https://aistudio.google.com/prompts/new_chat?prompt=<prompt>`

The likely reason: **the web URL always works** (any browser user can click it; fallback to the web app if desktop isn't installed), and **Claude Desktop / Codex Desktop register themselves as handlers for `claude.ai` / `chatgpt.com`** (per `claude-desktop-deep-links.md` — Claude Desktop claims the `claude.ai` domain via macOS associated domains; Codex is more explicit). So `claude.ai/new?q=...` ends up opening Claude Desktop *if installed*, and the web app otherwise. The web URL is effectively a "tries desktop first, falls back to web" universal URL.

Explicit `claude://` / `codex://` schemes are reserved for cases where **the caller knows the app is installed** (Raycast, macOS Services, app-side deeplink menus like Codex's own "Copy deeplink" command).

### Pattern 2: Prompt-seeding dominates payload design; structured metadata is rare

The universal payload shape is a single natural-language prompt string — sometimes as a pre-written template (Mintlify's `"Read from <url>.md so I can ask questions about it"`), sometimes as user-selected text with a summarization wrapper (bookmarklets), sometimes as an HTML+stack-trace blob (react-grab's clipboard fallback).

**Only two tools ship structured payloads:**
- react-grab's `application/x-react-grab` clipboard MIME (JSON with component names, file paths, line numbers) — but no consumer reads it as of v0.1.32
- DevInspector's MCP tool schemas (`capture_element_context` returns typed context objects)

Neither structured payload round-trips through a URL — both require either clipboard compatibility or an MCP channel. The URL parameter channel is firmly stuck on `q`/`prompt`/`text` string params across all providers.

### Pattern 3: The architectural divide is "agent already connected" vs "cold-launch the chat app"

Two clusters emerge:

**Cluster A — "Agent already connected" (react-grab, DevInspector, click-to-component)**
- Assumes a coding CLI or IDE extension is running on the same machine
- Handoff is **clipboard + MCP + editor-protocol URL**
- Framework-rich context (React fiber stack, DOM screenshots, network waterfall)
- Provider-agnostic by design

**Cluster B — "Cold-launch AI chat app" (Mintlify, bookmarklets, Raycast)**
- Assumes the user wants to continue in their preferred chat GUI (possibly not open yet)
- Handoff is **web URL with prompt query param** (with desktop-app interception as a nicety)
- Thin payload (prompt string, maybe doc URL)
- Provider-explicit by design (separate button per provider)

**react-grab sits squarely in Cluster A.** For a wiki / KB tool that wants to let users "ask Claude about this page," Cluster B's patterns apply — and Mintlify's code is the most complete open reference.

### Pattern 4: The `?q=` + `?prompt=` naming split is real and forces per-provider builders

From `claude-desktop-deep-links.md` + `codex-desktop-deep-links.md` + this report, the universe of prompt param names is:

| Provider | Param | Extra params |
|---|---|---|
| Claude (web + desktop) | `q` | — |
| ChatGPT (web) | `q` | `hints=search` or `hints=canvas` or `model=<m>` |
| Codex Desktop | `prompt` | `path`, `originUrl` |
| Cursor Desktop | `text` | `mode=<m>` (via `cursor://anysphere.cursor-deeplink/prompt`) |
| Perplexity | `q` | — |
| Grok | `q` | — |
| AI Studio | `prompt` | — |
| Devin (web) | `prompt` | — |
| Windsurf (desktop) | `prompt` | — |

**Any tool that targets multiple providers needs a per-provider URL builder** (Mintlify's switch-case is the canonical shape). There's no universal "open-in-ai-chat" URI scheme; the ecosystem has simply picked two inconsistent names (`q` and `prompt`). An OS-level intent resolver or a proposed `openai-chat:` registered scheme could unify this in the future but does not exist in 2026-04.

### Gap 1: No tool in the sample uses Codex Desktop's `path` / `originUrl` params

Codex's unique deep-link feature — seeding a new thread with both a prompt AND a workspace path or git origin URL (`codex://new?prompt=...&path=/abs/path&originUrl=git@github.com:org/repo.git`, per `codex-desktop-deep-links.md`) — is **not leveraged by any handoff tool I found**. react-grab has file paths in hand (it's building `in LoginForm at components/login-form.tsx:46:19` strings already); it could trivially construct `codex://new?prompt=<captured-context>&path=<abs-repo-root>` and get Codex to open with both the prompt and the correct workspace focused. Mintlify's docs site has none of this because it doesn't know the user's local repo path. **This is a greenfield gap for tools that *do* know the local path** (dev-mode browsers, IDE-adjacent extensions, dev-server plugins).

### Gap 2: No standard for "which desktop app is the user's preferred AI chat?"

If a user has both Claude Desktop and Codex Desktop installed, there is no OS-level "default AI chat app" setting. Mintlify's answer is *ask the user per-request* (the dropdown shows every provider as a separate entry). Bookmarklets hardcode one provider. react-grab punts by not routing to any chat at all. A future tool would either (a) let the user pick a default in settings, or (b) emit to all and let the OS's default-scheme handler decide — but as of 2026-04, no tool I inspected does either.

### What react-grab uniquely contributes

Compared to the rest of the sample:

1. **Framework-aware context derived from React internals** — `bippy` + owner-stack + Next.js dev-server symbolication → the captured payload names real components at real file:line:col, not DOM selectors. Only `click-to-component` had React-specific metadata (via `__source`), and only at a frame, not a tree.
2. **Pause-the-page-while-inspecting UX primitive** (`docs/architecture.md`) — freezes React renders, CSS animations, SMIL, WAAPI, GSAP, and pseudo-states so the user can inspect a transient state. Every other inspector in the sample lets animations keep running. This is the big UX novelty.
3. **Dual handoff paths (clipboard + auto-MCP) with shared plugin pipeline** — same transformer hooks (`transformSnippet`, `transformCopyContent`, `transformAgentContext`) feed both destinations. A third destination (a URL-scheme plugin) would drop into the same pipeline without touching the core.
4. **9-target MCP config writer CLI** — the `grab add mcp` command handling TOML vs JSON, per-client key names, Codex's alternate config location, Zed's `context_servers` key, etc. This is the largest "wire an MCP server to *every* popular agent at once" helper I found in the wild.

**What react-grab does NOT contribute:** any novel work on the "capture context → hand off to a desktop AI chat app" axis. On that specific axis, Mintlify's contextual-menu implementation is the most thoroughly-engineered open reference I surveyed.

---

## Negative searches

- **Searched:** `claude://`, `chatgpt://`, `cursor://`, `codex://`, `openai://`, `perplexity://` across the entire `aidenybai/react-grab` repo (packages + apps + docs). → **Zero runtime hits.** react-grab does not construct any AI-chat desktop protocol URL.
- **Searched:** `claude.ai/new` or `chatgpt.com/?q=` across react-grab. → **Zero hits.** No web-URL handoff either.
- **Searched:** the react-grab plugin API for any `transformAgentOpenUrl` / `onOpenInChat` / `handoffToAgent` hook. → **Does not exist.** Only `transformOpenFileUrl` (for IDE-protocol URL) exists as extension point.
- **Searched:** Chrome extensions + macOS Services + Raycast extensions that explicitly construct `claude://claude.ai/new?q=` by that literal string. → Found only the Vincent Schmalbach bookmarklet article as a direct, documented reference. Many Raycast extensions likely do this internally but the full matrix wasn't verified in source.
- **Searched:** tools that use Codex's `path=<abs-path>` or `originUrl=<git-url>` deep-link params. → **Zero matches.** This entire Codex capability appears unused by third-party tools as of 2026-04.
- **Searched:** a docs-framework alternative to Mintlify with "Open in Claude" (Fumadocs, Docusaurus, Nextra). → None found as built-in feature. Fumadocs emphasizes MCP over URL handoff; Docusaurus/Nextra require custom plugins.

---

## Gaps / follow-ups

- The Alfred workflow reportedly built for "new Claude desktop app" (`alfredforum.com/topic/22487`) was not inspected source-level — confirming its exact URL construction (`claude://` vs `https://claude.ai/new`) would validate whether any OSS macOS Services-adjacent tool uses the pure desktop scheme. Raycast's `ClaudeCast` and Alfred's `alfred-claude` likely use the API directly (not a URL scheme), but this wasn't verified in source.
- Mintlify's production bundle was downloaded at 2026-04-16; their `docs.json` provider list may evolve. The `"mcp"` and `"assistant"` options in the contextual menu spec (per `mintlify.com/docs/ai/contextual-menu`) were not traced to specific URL templates — only the 7 providers in the switch-case above were confirmed.
- react-grab issue #75 ("Add Kiro Support") and issue #45 ("Agents integration doesn't works") may indicate user demand for additional MCP targets; whether any request the desktop-URL path was not audited.
- A future react-grab plugin or Mintlify-style contextual menu *inside* a dev-mode page could combine the strengths of both clusters: capture framework-aware payload (Cluster A's strength) and hand off to a user-chosen desktop AI chat app via URL scheme (Cluster B's strength, incl. Codex's `path` / `originUrl`). No such tool exists as of 2026-04-16 — this is the clear novel synthesis in the space.
