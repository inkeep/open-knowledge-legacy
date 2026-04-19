---
title: "Deep-linking into AI Desktop Chat Apps (2026)"
description: "Landscape of programmatic entry points — URL schemes, App Intents, CLI bridges, scripting, and launchers — for Claude Desktop, Codex Desktop, Cursor, ChatGPT Desktop, Perplexity, and Raycast, plus prior art on capture-and-handoff patterns (react-grab, Mintlify, bookmarklets, PopClip)."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Claude Desktop
  - Codex Desktop
  - Cursor
  - ChatGPT Desktop
  - Perplexity
  - Raycast
  - react-grab
  - Mintlify
topics:
  - deep linking
  - URL schemes
  - App Intents
  - AI chat handoff
  - macOS integration
---

# Deep-linking into AI Desktop Chat Apps (2026)

**Purpose:** Map the 2026 landscape of *programmatic entry points* into desktop AI chat applications — what URL schemes they register, what parameters those schemes accept, what CLI / App-Intents / Shortcuts bridges exist, and what the surrounding ecosystem (Raycast extensions, launchers, scripts, bookmarklets, tools like react-grab) does with them. Scoped to three primary apps (Claude Desktop, Codex Desktop, Cursor) plus comparative baselines (ChatGPT, Perplexity, Raycast) and the "capture-and-handoff" tool pattern.

---

## Executive Summary

**Every modern AI desktop chat app on macOS — Claude, Codex, Cursor, ChatGPT, Perplexity — registers a custom URL scheme, but only three are confirmed to accept a prompt-seed parameter.** Claude (`claude://claude.ai/new?q=<p>`), Codex (`codex://new?prompt=<p>&path=<abs>&originUrl=<git>`), and Cursor (`cursor://anysphere.cursor-deeplink/prompt?text=<p>&mode=<m>`) accept a prompt parameter in the URL. **ChatGPT explicitly does not** (binary probe + standing OpenAI Community feature request confirm `?q=` is ignored); **Perplexity's `perplexity-app://` grammar is undocumented and not recoverable from read-only probing** (`URLHandlerRegistry` + `OpenQueryDeepLinkIntent` strings suggest a working-but-hidden parser exists). For both ChatGPT and Perplexity, the documented prompt-seeding path is **macOS App Intents** (Shortcuts.app) instead. Codex is the only app of the five that also exposes a typed *workspace* parameter (`path=` or `originUrl=` — the `originUrl` matcher resolves the URL against known local clones). Cursor is the only one with a per-invocation confirmation modal (hardened after the September 2025 "CursorJack" disclosure) and the widest deep-link surface (10 routes: prompt, command, rule, MCP install, PR review, background agent, plugin install, settings, BugBot `createchat`, glass).

**The surrounding ecosystem is lopsided.** Six months after launch, **react-grab** has 6,983 stars and **zero** desktop-URL-scheme construction — it's a React-fiber-aware inspector that hands off by *clipboard* (three MIME types including a custom `application/x-react-grab`) or a *local MCP server* whose `get_element_context` tool the agent polls. It assumes the agent is already connected, not cold-launched. **Mintlify** (shipping for 10K+ docs sites) is the most thoroughly-engineered open reference for the cold-launch pattern, with a 7-provider switch-case that mostly targets **web URLs** (`claude.ai/new?q=`, `chat.openai.com/?q=`, `grok.com/?q=`, etc.), using a desktop scheme only for Windsurf (`windsurf://cascade?prompt=`) and for Cursor MCP install (`cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>`). **Raycast** is the most ergonomic creation surface: its `open(url, bundleId?)` API can launch any URL scheme including `claude://`, its Quicklinks feature gives end users a zero-code builder with dynamic placeholders (`{selection | raw}`), and at least three production extensions (`ask-anybody`, `prompts-chat`, `cursor-agents`) ship the handoff today.

**Five structural gaps stand out.** First: **no tool in the surveyed sample uses Codex's `path=` / `originUrl=` parameters** despite dev-server plugins and IDE extensions already knowing the local path. Second: **zero of the five apps register a macOS `NSServices` entry** — the "right-click → Send to Claude" UX slot is unused industry-wide. Third: **zero ship an AppleScript dictionary**; the AI-desktop category is AppleScript-hostile. Fourth: **canonical bookmarklets route through web URLs, not `claude://` schemes**, because browsers block `window.location = 'claude://...'` from bookmarklets. Fifth: **no first-party Alfred / Keyboard Maestro / Hammerspoon workflow ships for Desktop-app handoff** — the bindings exist, but no canonical one-click workflow was surfaced in extensive GitHub / forum / extension-gallery search (Confidence: MEDIUM — these are negative findings). The canonical pattern every user independently reinvents is the 6-line `ask-claude() { open "claude://claude.ai/new?q=$(printf '%s' "$1" | jq -sRr @uri)"; }` zsh function.

**Key Findings:**

- **Claude Desktop (`claude://`)** — 15-route enum (`td`); prompt seeding via `claude://claude.ai/new?q=<p>`; no workspace param; no CLI bridge; prompt param is `q` (Google-style). ([evidence](evidence/claude-desktop-deep-links.md))
- **Codex Desktop (`codex://`)** — richest URL router: `codex://new?prompt=<p>&path=<abs>&originUrl=<git>` seeds both prompt AND workspace; `codex://threads/<uuid>` reopens conversations; `codex app [PATH]` CLI bridge; "Copy deeplink" menu item. ([evidence](evidence/codex-desktop-deep-links.md))
- **Cursor (`cursor://`)** — widest surface (10 routes); prompt seeding via `cursor://anysphere.cursor-deeplink/prompt?text=<p>&mode=<ask\|agent\|debug\|plan>&workspace=<name>`; per-invocation confirmation modal with CursorJack-hardened obfuscation-aware input validation (decodes URL-once, URL-twice, base64, hex, base64-of-hex before keyword denylist); 10K-char cap; no URL route for existing local chats. ([evidence](evidence/cursor-desktop-deep-links.md))
- **ChatGPT & Perplexity** — custom URL schemes exist (`chatgpt://`, `openai://`, `perplexity-app://`) but **do NOT accept `?q=<prompt>`**. Prompt handoff goes through **macOS App Intents**: ChatGPT ships 4 intents (`AskIntent(prompt, newChat, continuous)`, etc.); Perplexity ships 8 (`AskPerplexityIntent(query)`). Claude/Codex/Cursor ship **zero** App Intents. ([evidence](evidence/handoff-prior-art.md) §2, §7)
- **react-grab** — 6,983-star React-fiber inspector with MCP + clipboard handoff only; no URL scheme construction anywhere in the repo. Architecturally suits "agent already connected"; not a cold-launch-chat-app tool. ([evidence](evidence/react-grab-and-similar-handoff-tools.md) §1)
- **Mintlify** — the most thoroughly-engineered *surveyed* implementation of "docs → AI chat". The public `docs.json` `contextual.options` schema exposes **14 built-in identifiers** (not just the 7 chat providers surfaced in the prior evidence pass): `copy`, `view`, `assistant`, 7 chat providers (`chatgpt`/`claude`/`perplexity`/`grok`/`aistudio`/`devin`/`windsurf`), plus 4 MCP-install identifiers (`mcp`, `cursor`, `vscode`, `devin-mcp`) each with a distinct URL shape — `cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>`, `vscode:mcp/install?<urlencoded-JSON>`, `https://app.devin.ai/settings/mcp-marketplace/setup/custom?config=<b64>`, plus `npx add-mcp <url>` as a clipboard copy. Custom options support `$page` (truncated to **200 chars** — Mintlify's measured URL-length compromise), `$path`, `$mcp` placeholders. ([evidence](evidence/docs-site-handoff-landscape.md), [evidence](evidence/react-grab-and-similar-handoff-tools.md) §Tool 1)
- **Raycast** — 6 first-segment hosts across 11 documented URL forms (`extensions/...`, `script-commands/...`, `ai-commands/...`, `quicklinks/import`, `snippets/{import,create}`, `confetti`); `open(url, bundleId?)` API can launch any scheme; Quicklinks give users a zero-code deep-link builder; three concrete production extensions demonstrate the Desktop-app handoff pattern. ([evidence](evidence/raycast-ecosystem.md))
- **Prompt-param naming is NOT standardized.** Claude uses `q`, Codex uses `prompt`, Cursor uses `text`, ChatGPT web uses `q`, AI Studio uses `prompt`, Windsurf uses `prompt`. In Raycast's `prompts-chat` extension (28-platform production registry), `?q=` is the most common default — used by 8 of 18 auto-fill platforms (ChatGPT, Claude, Perplexity, Phind, v0, You, Grok, others) — which makes `?q=` the **safe default** for any new tool's URL builder. Any cross-provider tool needs a per-provider URL builder (Mintlify's switch-case is the canonical shape; `prompts-chat`'s `buildUrl()` is the broader reference).
- **The architectural fork is "agent already connected" (react-grab, DevInspector) vs "cold-launch chat app" (Mintlify, Fumadocs, Starlight, Vercel AI Elements, ReadMe, bookmarklets, Raycast).** Structured / framework-rich payloads route through clipboard + MCP; thin text prompts route through URL params; no tool spans both clusters.
- **Docs-framework category is web-first, not desktop-first.** Exhaustive inspection of Mintlify, Fumadocs, Docusaurus, Starlight, Vercel AI Elements, ReadMe, GitBook, Nextra, VitePress, and Docs.page shows that **only Mintlify constructs any desktop URL scheme for chat handoff, and only for Windsurf** (`windsurf://cascade?prompt=`). Every other provider (Claude, ChatGPT, Perplexity, etc.) is reached via web URL. Zero frameworks use `navigator.userAgent` / `isElectron` / `isInstalled` install-detection. The implicit industry assumption: Claude Desktop / ChatGPT Desktop / Cursor register as OS handlers for `claude.ai` / `chatgpt.com` / `cursor.com`, and the browser bounces to the Desktop app if installed.
- **Zed Editor joins Codex and Cursor in first-class URL-based agent prompt seeding.** `zed://agent?prompt=<text>` shipped in PR #47959 (merged 2026-01-29) — verified from the Rust source in `crates/zed/src/zed/open_listener.rs`. This makes three OSS-visible editor-class prior references for the pattern (Codex `?prompt=`, Cursor `?text=` + confirmation modal, Zed `?prompt=`). Claude Desktop `?q=` is for the chat app, not Claude Code.
- **JetBrains + Junie deliberately chose IPC+CLI over URL schemes for agent invocation.** No `idea://ai/...` / `idea://chat?prompt=...` exists; Junie uses `junie --task "<prompt>" --project <path>` with an `--acp` flag (same Agent Client Protocol Zed pioneered). A meaningful product-design divergence worth studying as an alternative to URL-scheme handoff when you own both the source app and the destination agent.
- **Microsoft's `vscode:mcp/install?<json>` uses an opaque-URI form** (no `//`, no authority — parallel to `mailto:`/`data:`) — architecturally distinct from Cursor's `cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>` (authority URI, overlaid on extension routing). Both valid patterns; MS pattern gives cleaner agent-content/protocol-install separation, Cursor pattern is easier to extend post-hoc.
- **Codex 26.415 released today (2026-04-16) with major new capabilities** — Computer Use (Codex drives macOS apps with its own cursor), an in-app browser (Atlas technology integrated), 111 curated plugins, image generation, thread automations. The D2 binary probe is based on version 26.406 (6 days earlier); URL scheme is presumed unchanged but re-probing would verify. OpenAI also confirmed a "superapp" consolidation plan on 2026-03-19 (merging ChatGPT + Codex + Atlas into one desktop client) — near-term stability question for anything hardcoding the current scheme distinctions.
- **Linear has been shipping deep-link-to-AI-coding-tools since 2026-02-26** — we missed this in the initial prior-art pass. Linear supports 9 tools (Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed) with `{{issue.identifier}}` / `{{context}}` prompt-template variables. Broader than Mintlify's 7 and production-proven. Linear's per-tool URL templates aren't published — a runtime-bundle inspection of `linear.app` is the most actionable follow-up for OK's menu design.
- **Linear's registry binary-extracted (Addendum D.1): now 19 tools** (not 9 — grew ~1/week since launch). **5 of the 19 registry entries use shell-exec via Electron IPC** (`runTerminalCommand`): 4 built-in tools (Claude Code, Codex CLI, OpenCode, Amp) plus 1 user-defined hook (customTerminalScript). This is the strongest signal that **OK's own handoff registry must treat shell-exec as first-class**, peer to URL schemes — or lose coverage of terminal-native coding tools entirely. Other production details worth adopting: per-tool URL-length caps (2K default / 8K for Cursor+Copilot) with visible truncation footer, server-side `{{context}}` resolution via GraphQL, double percent-encoding for Cursor/Copilot/Windsurf, lz-string compression for Replit. No Claude Desktop entry at all — Linear chose to ship Claude Code (CLI) only. ([evidence](evidence/linear-ai-deeplinks-extraction.md))
- **Codex 26.415 fresh probe (Addendum D.2) confirms the `codex://` URL scheme is semantically stable** despite the 9-version jump to today's release — routing logic is byte-for-byte equivalent; Vite regenerated bundle hashes and minifier renamed helper functions, but no route kinds, parser branches, or param names changed. No new routes, no new params, plugin install still CLI+IPC-only (no `codex://install`), no App Intents added. Computer Use is **Apple-Events-driven, not accessibility-API-driven** (separate sub-app `com.openai.sky.CUAService` with `com.apple.security.automation.apple-events` entitlement). Integrators can safely target the original 7-URL surface. ([evidence](evidence/codex-26415-probe.md))
- **Zed's namespace-collision precedent has real security lessons (Addendum D.3).** Zed is the only editor with two URL routers sharing one scheme prefix, and its solution is STRUCTURAL (two separate parsers in two crates, never on the same code path, partitioning `/agent/` sub-paths disjointly by convention). **Zed's `ExternalSourcePrompt` newtype-at-boundary is a high-ROI security pattern worth adopting** — every external URL payload consumed by an LLM is wrapped in a newtype whose only constructor sanitizes (strips bidi controls per CVE-2021-42574, caps newlines, normalizes CRLF). Complementary but distinct security patterns elsewhere in the surveyed set: **Cursor's CursorJack-hardened per-invocation confirmation modal + obfuscation-aware keyword denylist** (D3), **Linear's binary-search truncator with visible truncation footer** (D.1), **Raycast's per-category opt-in confirmation toggles** (D6). Each targets a different trust-boundary risk; the full picture is the set, not a ranked winner. OK should AVOID Zed's two-parsers-in-different-crates architecture — safer greenfield options are separate schemes (`openknowledge://` external, `openknowledge-mention://` internal) or a single dispatcher returning an exhaustiveness-checked discriminated union. ([evidence](evidence/zed-mentionuri-acp-dive.md))

---

## Research Rubric

Ten dimensions across the named apps (D1-D4), react-grab specifically (D5), Raycast (D6), broader prior art (D7), protocol registration mechanics (D8), CLI patterns (D9), and AppleScript fallbacks (D10). Weighted toward D5 + D7 per user direction (primary use case: "react-grab-style trigger pattern for OK"). See evidence files for dimension coverage.

---

## Detailed Findings

### D1 — Claude Desktop

**Finding:** Claude Desktop (version 1.2581.0, `@ant/desktop`) registers `claude://` and routes via a 15-entry enum (`td` in the minified bundle). A single route — `claude://claude.ai/new?q=<prompt>` — seeds a new conversation with the `q` query param (Google-style convention). Other routes open existing conversations (`/chat/<id>`), projects (`/project/<id>`), settings, tasks, Customize plugin-install, SSO/MCP auth callbacks, and Claude-Code-Desktop mode. The URL dispatcher parses the known enum cases locally and forwards everything else to the embedded webview via `dispatchHandleDeepLink` IPC — so unknown paths still reach claude.ai's client-side router. No path accepts a workspace, file, or attachment. Prompt seeding is text-only.

**Evidence:** [evidence/claude-desktop-deep-links.md](evidence/claude-desktop-deep-links.md)

**Implications:**
- External process can invoke `open 'claude://claude.ai/new?q=<url-encoded-prompt>'` on macOS to open Claude Desktop and pre-fill a new conversation. Works from any source: shell, browser, bookmarklet, extension, Raycast, Shortcuts.
- `q` is the **only** prompt-seeding hook — no `model=`, no `system=`, no attachments.
- `claude://claude.ai/chat/<id>` reopens specific conversations — useful for share links that open in the app instead of the web.
- Claude Code (the terminal `claude [prompt]` CLI) is a *different product*; it does not route to Claude Desktop.

**Decision triggers:**
- If prompt-only handoff → URL scheme is sufficient.
- If workspace/repo context matters → URL scheme insufficient; Codex is the only comparable app that accepts this natively.

**Remaining uncertainty:**
- Whether `claude://claude.ai/code?q=<prompt>` seeds Claude-Code-Desktop mode. The router forwards to webview; webview behavior not verified from main-process bundle.

---

### D2 — Codex Desktop (OpenAI)

**Finding:** Codex Desktop (version 26.406.31014, `openai-codex-electron`) exposes the **richest per-URL semantics** of the three named apps — it is the only one whose deep link carries *workspace context* (`path=` / `originUrl=`) alongside a prompt. (Cursor has the *widest surface by route count* — 10 routes vs Codex's 7 — see D3.) `codex://new?prompt=<p>&path=<abs-path>&originUrl=<git-url>` opens a new thread with pre-filled prompt AND workspace context (the `originUrl` matcher resolves the URL against known local clones via the `Fp`→`Ip`→`Lp` pipeline in the main bundle). The CLI (`codex app [PATH]`) and argv flag `--open-project <path>` are secondary entry points. A "Copy deeplink" menu item treats deep-linking as a first-class product feature. `codex://threads/<uuid>` reopens existing conversations by ID.

**Evidence:** [evidence/codex-desktop-deep-links.md](evidence/codex-desktop-deep-links.md)

**Implications:**
- Codex is the only app of the three named ones that exposes **workspace-aware handoff** via URL — an external tool that knows the user's repo can hand off BOTH prompt AND working directory in one link.
- Prompt param name is `prompt` (not `q` like Claude) — callers that target both need per-target encoding.
- The `codex` Rust CLI is a superset: `codex exec` (non-interactive), `codex mcp-server` (exposes Codex via MCP), `codex app [PATH]` (launches Desktop with a workspace), `codex resume`, `codex fork`. `codex app` has no `--prompt` flag, so prompt seeding still requires the URL form.

**Decision triggers:**
- The `originUrl` → local-workspace matcher is the novel capability. Tools that already know the user's repo (dev-server plugins, IDE extensions, CI integrations) can target a specific workspace; tools that don't (docs sites, web bookmarklets) cannot exploit this.
- Multiple Codex flavors (`com.openai.codex`, `.beta`, `.nightly`, `.alpha`, `.agent`, `.dev`) all register `codex://` — first-installed wins on conflict.

---

### D3 — Cursor Desktop

**Finding:** Cursor's deep-link surface is the *widest* of all three — **ten distinct route buckets** handled by a bundled `anysphere.cursor-deeplink` extension: `/prompt`, `/command`, `/rule`, `/mcp/install`, `/background-agent`, `/settings`, `/pr-review`, `/plugin/add`, `/createchat` (BugBot), `/glass`. Prompt seeding works via `cursor://anysphere.cursor-deeplink/prompt?text=<p>&mode=<m>&workspace=<name>` with four modes (`ask`/`agent`/`debug`/`plan`) — unique vs Codex/Claude — but **every invocation triggers a user-facing confirmation modal** before the prompt runs. There is no silent-seed path. Input validation is obfuscation-aware (decodes the prompt through URL-once, URL-twice, base64, hex, and base64-of-hex) before applying a keyword denylist against `.env`, `.ssh/id_rsa`, `passwords.txt`, `dump.*token`, `exfiltrate.*credential` — hardening traceable to the September 2025 "CursorJack" disclosure. Prompt length cap: binary says 10,000 chars; docs say 8,000.

**Evidence:** [evidence/cursor-desktop-deep-links.md](evidence/cursor-desktop-deep-links.md)

**Implications:**
- Cursor's breadth is the state of the art in 2026: installing MCP servers, applying rules, invoking background agents, installing plugins, and opening PR review are all URL-reachable. No competitor exposes this many primitives.
- The confirmation modal is **a feature, not a bug** — it's the security layer that makes a wide URL surface safe. Any app offering prompt-pre-fill via URL at scale will likely need something similar.
- No way to re-open an existing *local* chat via URL (only cloud background agents via `bcId` param) — contrasts with Codex's `threads/<uuid>` and Claude's `chat/<id>`.
- CLI has Cursor-specific additions (`--chat`, `--add-mcp`, `agent` subcommand), but `--chat` is declared without a main-process consumer — scripts should not rely on it yet. `cursor agent` is a bash shim that shells out to a separately-distributed `cursor-agent` Rust CLI (auto-installs via curl-pipe-bash on first use).

**Decision triggers:**
- The confirmation modal + 10K-char cap + obfuscation-aware validation together define the 2026 "safe to expose a wide URL surface" playbook.

---

### D4 — ChatGPT Desktop & Perplexity Desktop

**Finding:** ChatGPT Desktop registers three URL schemes (`chatgpt://`, `openai://`, `com.openai.chat://`); Perplexity registers `perplexity-app://` plus a Google OAuth callback scheme. **None of these custom schemes accepts a `?q=<prompt>` parameter** — confirmed by binary-string probe (`strings` on the Mach-O surfaces routing strings but no prompt-param literals) and by a standing OpenAI Community feature request that explicitly states "the `?q=` parameter in URLs doesn't trigger the prompt or fill the input field inside the app." Instead, both apps ship **macOS App Intents** (Shortcuts.app integration). ChatGPT ships **4 intents** extracted from `/Applications/ChatGPT.app/Contents/Resources/Metadata.appintents/extract.actionsdata`:

| Identifier | `openAppWhenRun` | Parameters |
|---|---|---|
| `AskIntent` | **false** (headless) | `prompt` (required), `newChat` (bool), `continuous` (bool) |
| `OpenNewChatInAppShortcutIntent` | true | `useSearchGPT`, `temporaryChat`, `startAction` enum |
| `OpenNewChatInAppWidgetIntent` | true | widget-only |
| `OpenVoiceModeIntent` | true | — |

Perplexity ships **8 intents**: `AskPerplexityIntent(query)`, `NewQueryIntent`, `NewProQueryIntent`, `ImageSearchIntent`, `V2VIntent`, plus three internal `*DeepLinkIntent` handlers (`OpenQueryDeepLinkIntent`, `OpenImageQueryDeepLinkIntent`, `OpenV2VDeepLinkIntent`) marked `isDiscoverable:false`. The existence of those internal `*DeepLinkIntent` types plus `URLHandlerRegistry` and `handleDeepLink(_:originLocation:forwardedParams:)` in the Perplexity binary strongly suggests an undocumented `perplexity-app://` URL grammar that forwards into typed intents — but the exact path/parameter names are not recoverable from `strings` (likely stored in Swift read-only data sections). Imrat's October 2024 X post — *"Perplexity app has a deeplink URL schema — but right now its not documented, and i have not figured out how to use it"* — is still accurate in April 2026.

**Critically:** **Claude / Codex / Cursor ship ZERO App Intents.** No `Metadata.appintents` bundle in any of the three. Siri / Shortcuts-native invocation works only for ChatGPT and Perplexity.

**Evidence:** [evidence/handoff-prior-art.md §7 + §2](evidence/handoff-prior-art.md)

**Implications:**
- ChatGPT + Perplexity and Claude + Codex + Cursor chose **opposite integration philosophies**: OpenAI and Perplexity picked App-Intents-first (typed, introspectable by Shortcuts.app, Siri-accessible, but macOS-only); Anthropic, OpenAI-Codex, and Anysphere picked URL-scheme-first (any process can invoke; cross-platform; but untyped).
- For ChatGPT Desktop, URL-scheme-only callers must fall back to the PopClip pattern — clipboard + `open chatgpt://` + UI-scripted paste + Return. PopClip's `ChatGPTApp.popclipext/Config.ts` is the reference implementation.
- For Shortcuts.app users, ChatGPT and Perplexity are first-class automation targets; Claude/Codex/Cursor require the generic "Open URL" action wrapping their custom schemes.

---

### D5 — react-grab and similar capture-and-handoff tools

**Finding:** **react-grab is not a desktop-URL-scheme tool.** The canonical example the user called out turns out to be a framework-aware React inspector (built on `bippy`) whose handoff mechanisms are (a) **clipboard writes with three MIME types** — `text/plain`, `text/html`, and a custom `application/x-react-grab` metadata JSON — and (b) a **local MCP HTTP server** exposing `get_element_context` as an MCP tool that the agent polls once (TTL-expired after read). An exhaustive grep of the entire repo for `claude://`, `cursor://`, `chatgpt://`, `codex://`, `openai://`, `perplexity://`, `claude.ai/new`, and `chatgpt.com/?q=` returns **zero runtime hits**. The captured payload is a `<html-preview> + in <ComponentName> at <file>:<line>:<col>` owner-stack string; "open in editor" goes through Next.js `/__nextjs_launch-editor` or Vite `/__open-in-editor` dev-server endpoints, not OS protocol handlers. The `grab add mcp` CLI writes MCP config into **9 agent config files** (Claude Code, Codex, Cursor, OpenCode, VS Code, Amp, Droid, Windsurf, Zed) with per-client TOML/JSON quirks — but it configures *MCP tool access*, not URL-scheme handoff. Maturity: 6,983 stars / 317 forks / MIT / v0.1.32 at HEAD / created 2025-10-17 — ~1,200 stars/month sustained.

**The most thoroughly-engineered *surveyed* reference for the "cold-launch AI chat app" pattern is Mintlify**, whose production bundle contains a 7-provider switch-case:

```javascript
// Mintlify contextual menu — from prod bundle, deobfuscated
let r = current_url;
let a = encodeURIComponent(`Read from ${r}.md so I can ask questions about it.`);
let n = encodeURIComponent(`Read from ${r} so I can ask questions about it.`);
switch (provider) {
  case "chatgpt":    window.open(`https://chat.openai.com/?hints=search&q=${n}`, "_blank"); break;
  case "claude":     window.open(`https://claude.ai/new?q=${a}`,                 "_blank"); break;
  case "perplexity": window.open(`https://www.perplexity.ai/search?q=${a}`,      "_blank"); break;
  case "grok":       window.open(`https://grok.com/?q=${a}`,                     "_blank"); break;
  case "aistudio":   window.open(`https://aistudio.google.com/prompts/new_chat?prompt=${a}`, "_blank"); break;
  case "devin":      window.open(`https://app.devin.ai/?prompt=${a}`,            "_blank"); break;
  case "windsurf":   window.open(`windsurf://cascade?prompt=${a}`,               "_blank"); break;
}
// Cursor MCP install uses base64-encoded JSON config:
// cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64-of-JSON>
```

Every provider except Windsurf (and the Cursor MCP-install path) uses a **web URL** — the implicit bet is that Claude Desktop / ChatGPT Desktop / Cursor register `claude.ai` / `chatgpt.com` / etc. as OS default handlers so the browser "bounces" to the Desktop app if installed.

Five other similar tools round out the space: **DevInspector** (react-grab's direct architectural twin — framework-generic, richer payload with network/console/screenshots), **Vincent Schmalbach's bookmarklets** (minimal canonical web-URL pattern), **Element Inspector** (clipboard-only Chrome extension, DOM-based competitor), **LocatorJS / click-to-component** (prior art for alt-click → IDE-protocol URL, not AI), and **`give-me/bookmarklets`** (inverse direction — export *from* AI chat to local disk).

**The broader docs-framework landscape** (the closest prior-art category to Open Knowledge) shows a consistent pattern: all frameworks that ship "Open in AI" handoff use **web URLs only**, relying on OS-level protocol handlers to bounce into the Desktop app if installed.

| Framework | Shipped in-product? | Providers | URL shape | License |
|---|---|---|---|---|
| **Mintlify** | ✅ Built-in | 7 chat + 4 MCP-install + copy/view/assistant = 14 identifiers | Web URL for chat; `cursor://`, `vscode:mcp/install?`, `app.devin.ai/...` for MCP install (the only desktop schemes) | Proprietary SaaS |
| **Fumadocs** | ✅ Built-in (`MarkdownCopyButton` + `ViewOptionsPopover`) | 4 chat providers (Scira AI, ChatGPT, Claude, Cursor) + GitHub + "View as Markdown" | 100% web URLs; Cursor routes via `cursor.com/link/prompt` (NOT `cursor://`) | MIT |
| **Starlight** | Community plugin (`starlight-page-actions`) | 7 providers incl. **GitHub Copilot** (the only Copilot handoff observed anywhere) | 100% web URLs | MIT |
| **Vercel AI Elements** | Component library `<OpenIn>` | 7 providers | 100% web URLs; uses `prompt=` for ChatGPT (inconsistent with Mintlify's `q=`) | MIT |
| **ReadMe** | ✅ Built-in "Ask AI" | ChatGPT + Claude only | Web URLs + `.md` suffix convention (matches Mintlify) | Proprietary SaaS |
| **GitBook** | Proprietary in-page AI chat only | — | No multi-provider handoff observed | Proprietary SaaS |
| **Docusaurus** | ❌ Nothing built-in; 27-upvote feature request open | — | In-page chat plugins (Biel, Markprompt, CrawlChat, Inkeep) exist; no handoff dropdown | MIT |
| **Nextra, VitePress, Docs.page** | ❌ Nothing built-in or community | — | — | MIT |

Universal pattern: a dropdown-next-to-page-title → web URL with prompt-query-param → server serves raw markdown via `<page>.md` / `<page>.mdx` URL suffix. **ChatGPT param naming is inconsistent across the surveyed sample** (`q=` in Mintlify, Fumadocs, ReadMe; `prompt=` in Vercel AI Elements) — confirming implementers are independently reverse-engineering rather than consuming a shared spec.

**Evidence:** [evidence/react-grab-and-similar-handoff-tools.md](evidence/react-grab-and-similar-handoff-tools.md) + [evidence/docs-site-handoff-landscape.md](evidence/docs-site-handoff-landscape.md) (deep dive on all 10 frameworks above)

**Implications:**
- The tool space cleaves into two clusters: **"agent already connected"** (react-grab, DevInspector — clipboard + MCP, framework-rich payloads) and **"cold-launch AI chat app"** (Mintlify, bookmarklets, Raycast — web URL / protocol URL with prompt param, thin payloads, provider-explicit). No tool spans both clusters.
- For a wiki/KB tool like Open Knowledge that wants to let users "continue this page in Claude Desktop," Cluster B's patterns apply — and **Mintlify's code is the most complete open reference**, directly applicable.
- Mintlify's cleanest design decision: **web URLs by default, desktop scheme only when the web URL has no equivalent** (Windsurf has no web client; Cursor's MCP-install cannot be expressed as a web URL). This minimizes the install-detection burden on the docs site.
- react-grab's unique contribution is not handoff — it's **framework-awareness** (`bippy` + owner-stack + Next.js symbolication → real component names at real file:line:col) and a **pause-the-page-while-inspecting** primitive that freezes React renders, CSS animations, SMIL, WAAPI, GSAP, and pseudo-states.

**Decision triggers:**
- Choose clipboard+MCP (Cluster A) when you control or target the agent's runtime environment and want framework-rich context.
- Choose URL-scheme handoff (Cluster B) when the user's chat app may not be running and payload fits in a URL.
- Claim the unclaimed gap: **no tool in the surveyed sample uses Codex's `path=` / `originUrl=` params.** A react-grab plugin that constructs `codex://new?prompt=<context>&path=<abs-repo-root>` would be a novel cross-cluster synthesis.
- **Open Knowledge placement implications:** OK sits in the docs-framework category (Mintlify/Fumadocs/Starlight/ReadMe are direct peers). The industry pattern is unambiguous: ship web URLs, rely on OS-level install interception for the Desktop experience. The single exception — Mintlify's Windsurf entry via `windsurf://cascade?prompt=` — exists only because Windsurf has no web chat endpoint. For every provider with both a web chat and a Desktop app (Claude, ChatGPT, Perplexity, Cursor), the industry answer is the web URL. OK's differentiator vs these peers would come from either (a) the `.md` suffix / MCP-install coverage Mintlify has pioneered, or (b) leveraging Codex's `path=`/`originUrl=` — a capability Mintlify can't use (docs sites don't know the user's local repo) but OK can (it runs in the user's repo).

---

### D6 — Raycast ecosystem

**Finding:** Raycast's role in the handoff ecosystem is **threefold**:

1. **Its own `raycast://` scheme** exposes 6 first-segment hosts — `extensions/<author>/<ext>/<command>`, `script-commands/<slug>`, `ai-commands/<slug>`, `quicklinks/import`, `snippets/{import,create}`, `confetti` — across which the evidence file enumerates 11 documented URL forms (multiple `extensions/...` variants per host). The documented param set is `?arguments=<url-encoded-JSON>`, `?context=<url-encoded-JSON>`, `?fallbackText=<string>`, `?launchType=userInitiated|background`. The router is `AppRouter+Deeplinks.swift` (confirmed via Swift metadata strings in the native Mach-O); four per-category "always allow" confirmation toggles (`alwaysAllow{AICommand,Command,QuickAI,ScriptCommand}Deeplinking`) gate the invocation. Windows flavor uses `raycastinternal://` — `ray-so`'s `addToRaycast()` swaps based on `getRaycastFlavor()`.

2. **The `@raycast/api` extension API includes `open(target: string, application?: Application | string)`** — signature documented at `https://developers.raycast.com/api-reference/utilities`. The `target` is "file, folder or URL" with NO `http(s)` restriction; `application` accepts a bundle id (e.g. `com.anthropic.claudefordesktop`). This makes a single-line handoff trivial: `open("claude://claude.ai/new?q=...", "com.anthropic.claudefordesktop")`. Verified in the wild in `korchasa/raycast-ask-anybody/src/ask-claude-desktop.tsx`. The `AI.ask()` method is orthogonal — it goes API→API through Raycast's Pro backend and lands the response in the Raycast command; it does NOT populate any desktop app.

3. **Quicklinks are a zero-code user-facing URL-scheme builder.** Any user can create a Quicklink like `claude://claude.ai/new?q={selection | raw | percent-encode}` with `openWith: com.anthropic.claudefordesktop` — no extension, no code. Dynamic placeholders (`{Query}`, `{clipboard}`, `{selection}`, `{argument …}`, `{datetime}`) are percent-encoded by default; `| raw` opts out. Shareable via `raycast://quicklinks/import?quicklinks=<url-encoded-JSON>` (one repeat per Quicklink; JSON fields: `name`, `link`, `openWith`, `iconName`, `iconUrl`, `iconInvert`). ray.so hosts a public Quicklink Explorer.

Three production extensions demonstrate the Desktop-app handoff pattern:
- **`korchasa/raycast-ask-anybody`** — `ask-claude-desktop.tsx` cleanly calls `open("claude://claude.ai/new?q=..." , "com.anthropic.claudefordesktop")`.
- **`raycast/extensions/prompts-chat`** — registry of **28 platforms** (README rounds to "25+"; actual count is 17 chat + 9 code + 1 image + 1 video). Routing is via `buildUrl()` + `open()` with clipboard-paste fallback for 10 of 28 (36%) platforms that can't take prompt in URL. **Critical implementation detail:** the primary runtime branch is `platform.supportsQuerystring`, NOT the `isDeeplink` field that appears in the registry — `isDeeplink` is declared but never read at runtime (documentation metadata only). Only 5 platforms use desktop URL schemes: Cursor (`cursor://anysphere.cursor-deeplink/prompt?text=`), Goose (`goose://recipe?config=<base64-JSON>`), Windsurf / VS Code / VS Code Insiders (bare schemes with clipboard fallback — the schemes open the app but the prompt must still be pasted). Clipboard fallback mechanism is strictly **user-visible copy + open + paste ⌘V** — no AppleScript, no accessibility API, no simulated keystrokes, no bundle-id targeting (`open()` takes a URL; macOS `LSHandlers` picks the app). The picker UI shows `▶` or `📋` accessory icons so users see capability upfront.
- **`raycast/extensions/cursor-agents`** — `<Action.Open target={`cursor://anysphere.cursor-deeplink/background-agent?bcId=…`} />`.

Bonus: `chatgpt-atlas` uses `open(url, "com.openai.atlas")` (no URL scheme needed — just bundle-id-targeted browser open); `claude-code-launcher` + `claudecast` take the terminal-CLI route (`execFile("open", ["-na", "Ghostty.app", …])`).

**`prompts-chat` platform distribution (direct reference for any multi-provider URL builder):**

| Handoff mode | Count | Notes |
|---|---|---|
| Auto-fill via web URL (`?q=`, `?prompt=`, etc.) | 18 | Most common path — ChatGPT, Claude, Perplexity, Phind, v0, You, Grok, others |
| Desktop scheme with URL payload | 2 | Cursor (`?text=`), Goose (`?config=<base64-JSON>`) |
| Desktop scheme + clipboard fallback | 3 | Windsurf, VS Code, VS Code Insiders |
| Web URL + clipboard fallback | 7 | GitHub Copilot (web), DeepSeek, Gemini, Meta AI, Manus, Pi, Poe |

Only **3 platforms overlap** between `prompts-chat` (28) and Mintlify (7 chat providers): ChatGPT, Claude, Perplexity. Mintlify's remaining 4 (Grok, AI Studio, Devin, Windsurf) are docs-site-specific; `prompts-chat`'s other 25 are chat/code-gen-UI-specific. Different product shapes produce different registries — reading both gives near-complete coverage of the 2026 multi-provider URL-handoff space.

**Evidence:** [evidence/raycast-ecosystem.md](evidence/raycast-ecosystem.md) + [evidence/raycast-prompts-chat-registry.md](evidence/raycast-prompts-chat-registry.md) (full registry + `buildUrl()` verbatim + 28-platform table)

**Implications:**
- Raycast's AI ecosystem splits four ways: (a) desktop-app handoff via URL scheme, (b) desktop-app handoff via `open(url, bundleId)` for browser-like targets (Atlas), (c) terminal/CLI bridge via `execFile("open", ["-na", "<Terminal>.app", …])`, (d) in-Raycast API call (BYOK or `AI.ask()`). All four coexist; no single pattern dominates.
- **Raycast is the most ergonomic creation surface on macOS for deep-link handoff** — Quicklinks for users, `open()` + placeholders for extension authors, `raycast://quicklinks/import?...` for distribution.
- The confirmation-toggle model (`alwaysAllow*Deeplinking`) is similar to Cursor's per-invocation modal, implemented as a one-time opt-in rather than per-call.

---

### D7 — Handoff prior art: launchers, Services, scripting, bookmarklets

**Finding:** Across **macOS Services, Shortcuts.app, BetterTouchTool, Alfred, Keyboard Maestro, AppleScript, bookmarklets, browser extensions, and shell one-liners**, the ecosystem-wide picture is:

- **macOS Services (right-click "Send selection to …"):** **Zero** of the five apps (Claude/Codex/Cursor/ChatGPT/Perplexity) register an `NSServices` entry. No built-in Services-menu integration. Community workaround: author an Automator "Quick Action" wrapping `open 'claude://claude.ai/new?q=...'`. No canonical shared workflow exists.

- **BetterTouchTool / Alfred / Keyboard Maestro:** All three ship first-party AI integrations, but **API-direct** — BTT's "Transform & Replace Selection With ChatGPT" writes back via accessibility API; Alfred's official ChatGPT workflow + ChatFred + alfred-claude hit the API; Keyboard Maestro has no shipped AI integration at all. **None ships a canonical workflow that opens the Desktop app** via its URL scheme. The primitive exists (Alfred Universal Actions can target any URL scheme; BTT supports "Run Shell Script" triggers); the content gap is: nobody has published the one-click workflow. [alfredforum.com/topic/22487](https://www.alfredforum.com/topic/22487-workflow-to-open-chat-in-brand-new-claude-desktop-app/) is a standing community request.

- **AppleScript dictionaries:** **Zero** of the five apps ships one. No `.sdef` file, no `OSAScriptingDefinition` key, no `NSAppleScriptEnabled`. The AI-desktop category is AppleScript-hostile. Fallback is UI-scripting via `System Events keystroke`s (fragile; unnecessary for Claude/Codex/Cursor since their URL schemes accept prompts).

- **Bookmarklets:** The canonical form uses **web URLs**, not app schemes:
  ```javascript
  javascript:(() => {
    const selectedText = window.getSelection().toString();
    const prompt = `Please summarize:\n\n${selectedText}`;
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank');
  })();
  ```
  Browsers block or warn on `window.location = 'claude://...'` from a bookmarklet. Vincent Schmalbach's article is the widely-referenced blueprint.

- **Chrome extensions** for "Ask ChatGPT": **many exist** (ChatGPT Context Menu, RightClickGPT, ChatGPT Shortcut, ChatGPT Deeplink). All target `chatgpt.com` (web). **Zero target the `chatgpt://` desktop scheme.** No extension was found for "Open in Claude Desktop" or "Open in Cursor" right-click.

- **Terminal / CLI:** Canonical zsh one-liner: `open "claude://claude.ai/new?q=$(printf '%s' "$prompt" | jq -sRr @uri)"`. Brett Terpstra's `open(1)` reference is the primary source. **No published CLI tool wrapping this pattern was found in extensive GitHub / npm / Homebrew searches** — no `brew install pipe-to-claude`, no `npx open-in-chatgpt` (Confidence: MEDIUM for this negative claim). Every user appears to reinvent the 6-line shell function.

- **PopClip's `ChatGPTApp` extension** is the reference implementation of the "clipboard + URL scheme + UI-scripted paste" fallback pattern that ChatGPT Desktop's non-prompt URL scheme forces: `popclip.openUrl("chatgpt://")` + simulate `Cmd+N` + `Cmd+V` + `Return`. Keyboard Maestro and BTT users have reproduced the same recipe manually.

**Evidence:** [evidence/handoff-prior-art.md](evidence/handoff-prior-art.md)

**Implications:**
- Two structural gaps are the most interesting: **no vendor has registered NSServices** (a one-hour implementation that would give every macOS app a "right-click → Send to Claude" entry), and **no first-party Alfred / Keyboard Maestro / Hammerspoon workflow ships for Desktop-app handoff** despite the primitives being available.
- The AppleScript-hostile posture across the entire category reflects the industry-wide decline of AppleScript, but also a philosophical shift: Claude's "Computer Use" category arguably *supersedes* AppleScript by letting the AI observe and drive the UI rather than the app exposing a scripting surface.
- For Open Knowledge's purposes, **Raycast Quicklinks are the cleanest distribution vehicle** for a zero-extension, zero-code "Open this wiki page in Claude" workflow. A single shareable `raycast://quicklinks/import?...` URL gives users a one-click handoff with placeholder substitution, no code required.

---

### D8 — Protocol-handler registration mechanics

**Finding:** All three primary apps use the standard macOS `CFBundleURLTypes` declaration in Info.plist (declarative; Launch Services indexes on install/first-run). Windows requires explicit `setAsDefaultProtocolClient(scheme)` on first launch (both Claude and Codex do this; Claude additionally handles `-uninstall` argv to deregister). Linux uses `.desktop` files with `MimeType=x-scheme-handler/...` and `xdg-mime`. **What you can do via URL scheme is capped by what the app's URL router exposes** — the scheme itself is just a routing trigger.

**Evidence:** [evidence/claude-desktop-deep-links.md §Finding 7](evidence/claude-desktop-deep-links.md), [evidence/codex-desktop-deep-links.md §Finding 1](evidence/codex-desktop-deep-links.md)

**Implications:**
- Scheme registration is cheap and well-documented. What matters is the app's URL-dispatch table — the subject of D1-D4.
- On macOS, first-install-wins when multiple apps claim the same scheme. Codex flavors (`com.openai.codex`, `.codex.beta`, `.codex.nightly`, `.codex.alpha`, `.codex.agent`, `.codex.dev`) all register `codex://` — users with multiple flavors installed hit first-registered semantics.

---

### D9 — CLI and stdin handoff patterns

**Finding:** CLI support varies widely. **Codex is the most integrated** — `codex app [PATH]` launches the Desktop app; the `codex` binary also hosts `exec` (non-interactive), `mcp-server` (exposes Codex via MCP), `resume`, and `fork`. **Cursor's CLI** (`cursor`) is a VS Code-derived launcher with three Cursor-specific additions (`--chat`, `--add-mcp`, `agent` subcommand); its `cursor-agent` binary is a separately-distributed Rust CLI that auto-installs via curl-pipe-bash on first use and supports headless (`-p`) + stream-JSON output + session resume, but **cannot currently be deep-linked back into the IDE**. **Claude Desktop has no CLI bridge** — the `claude` CLI (Claude Code) is a separate terminal product. The canonical cross-app pipe-to-chat pattern is the 6-line zsh function; no tool wraps this as a `brew`-installable package.

**Evidence:** [evidence/claude-desktop-deep-links.md §6](evidence/claude-desktop-deep-links.md), [evidence/codex-desktop-deep-links.md §6](evidence/codex-desktop-deep-links.md), [evidence/cursor-desktop-deep-links.md](evidence/cursor-desktop-deep-links.md), [evidence/handoff-prior-art.md §6](evidence/handoff-prior-art.md)

**Implications:**
- For automation pipelines that need both terminal AND desktop output (e.g., CI that wants to queue a review in the user's Desktop app), **Codex is the only first-class CLI→Desktop bridge** in the sample.
- For everything else, the `open 'scheme://...'` macOS command is the universal bridge — which is really just URL-scheme invocation from a different launcher.
- Category observation: **no `brew`-installable or `npx`-runnable "pipe-to-desktop-AI" wrapper was found** after extensive search across GitHub/npm/Homebrew. This negative finding is CONFIDENCE: MEDIUM — the category is uncovered as of 2026-04-16 to the best of our searches, but cannot be definitively proven absent.

---

### D10 — AppleScript / accessibility-API fallbacks

**Finding:** None of the five apps ships an AppleScript dictionary (`.sdef` file, `OSAScriptingDefinition` key, or `NSAppleScriptEnabled` true). Running `osascript -e 'tell application "Claude" to get name'` returns just `"Claude"` because `get name` is universal — but no custom scripting commands exist. **Fallback for Claude/Codex/Cursor is unnecessary** — their URL schemes already accept prompt parameters. The UI-scripting fallback via `System Events` + keystroke simulation is only needed for ChatGPT Desktop (because `chatgpt://?q=` does not work) and for cases requiring richer prompt injection than URL-encodable text (attachments, system-prompt overrides). Peter Steinberger's key observation: *"URL schemes are fire-and-forget with no return value, so x-callback-url patterns need Shortcuts or another callback handler."* No known community tool injects prompts into a running Claude Desktop composer via accessibility APIs.

**Evidence:** [evidence/handoff-prior-art.md §4](evidence/handoff-prior-art.md)

**Implications:**
- The AX-injection niche is **open but unaddressed** — URL schemes are good enough for text-only prompt seeding, so the accessibility-API path has no well-lit reference implementation.
- Claude's "Computer Use" product category arguably supersedes AppleScript philosophically: AI observes and drives the UI rather than the app exposing a scripting surface.

---

## Cross-app comparison matrix

| Capability | Claude Desktop | Codex Desktop | Cursor | ChatGPT Desktop | Perplexity Desktop | Raycast |
|---|---|---|---|---|---|---|
| URL scheme registered | `claude://` | `codex://` | `cursor://` | `chatgpt://`, `openai://`, `com.openai.chat://` | `perplexity-app://` + Google OAuth | `raycast://` + `com.raycast` |
| Open + seed prompt (URL) | ✅ `claude://claude.ai/new?q=<p>` | ✅ `codex://new?prompt=<p>` | ✅ `cursor://anysphere.cursor-deeplink/prompt?text=<p>&mode=<m>` | ❌ **no prompt param** | ❌ undocumented grammar | N/A (launcher) |
| Workspace/path param | ❌ | ✅ `path=<abs>` or `originUrl=<git>` | ✅ `workspace=<name>` | ❌ | ❌ | N/A |
| Open existing conversation | ✅ `claude://claude.ai/chat/<id>` | ✅ `codex://threads/<uuid>` | ❌ (no URL route; only cloud `background-agent?bcId=`) | ❌ | ❌ | N/A |
| Per-invocation confirmation | No | No | **Yes** (security modal w/ obfuscation-aware validation) | N/A (no URL prompt) | N/A | Per-category opt-in (`alwaysAllow*`) |
| CLI → Desktop | ❌ | ✅ `codex app [PATH]` | Partial (`cursor <path>` opens dir; `--chat` declared but unconsumed) | ❌ | ❌ | N/A |
| macOS App Intents (Shortcuts.app) | ❌ | ❌ | ❌ | ✅ 4 intents (`AskIntent`, …) | ✅ 8 intents (`AskPerplexityIntent`, …) | N/A |
| AppleScript dictionary | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| macOS Services (`NSServices`) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| Copy-deeplink UI | ❌ not found | ✅ menu item | ❌ | ❌ | ❌ | ✅ Quicklinks + `ray.so` |
| Prompt param name | `q` | `prompt` | `text` | N/A (App Intents: `prompt`) | N/A (App Intents: `query`) | N/A |
| Total URL routes | 15 | 7 | 10 | — (launch-only) | — (undocumented) | 6 first-segment hosts |

### Secondary matrix — handoff mechanism availability

| Mechanism | Claude | Codex | Cursor | ChatGPT | Perplexity |
|---|---|---|---|---|---|
| Native URL-scheme prompt seed | ✅ `?q=` | ✅ `?prompt=` | ✅ `?text=` + mode | ❌ launch-only | ❌ undocumented |
| macOS Shortcuts (App Intents) | ❌ | ❌ | ❌ | ✅ `AskIntent` | ✅ `AskPerplexityIntent` |
| macOS Services menu | ❌ | ❌ | ❌ | ❌ | ❌ |
| AppleScript dictionary | ❌ | ❌ | ❌ | ❌ | ❌ |
| BTT/Alfred/KM canonical shipped workflow | None | None | None | PopClip ext (clipboard + UI-script) | PopClip ext |
| Bookmarklet (canonical) | `https://claude.ai/new?q=…` | None published | None published | `https://chatgpt.com/?q=…` | `https://www.perplexity.ai/search?q=…` |
| Terminal CLI wrapper (canonical shipped tool) | None | None | None | None | None |

---

## Limitations & Open Questions

### Dimensions covered at moderate depth that deserve deeper dives
- **Perplexity `perplexity-app://` URL grammar.** Recoverable by attaching `lldb` to the running Perplexity process and breakpointing on `Perplexity.URLHandlerRegistry.handleDeepLink(_:originLocation:forwardedParams:)` with candidate URLs (`/search?q=...`, `/query?text=...`, `/new?q=...`). Out of scope for read-only binary probing.
- **Whether `claude://claude.ai/new?q=...` supports additional params** (model, system prompt, attachment URI). Router source inspected only `q`, `marketplace`, `plugin`, `anon_id`; webview-side handling of forwarded paths was not traced.
- **Full enumeration of Raycast `ai-commands` built-in slugs** (e.g., `change-tone-to-friendly`, `summarize-youtube-video`). Documented in wild-use but not in a single canonical list.

### Out of scope (per rubric)
- Mobile (iOS / Android) apps and their URL-scheme surfaces.
- Browser URL parameter conventions for `claude.ai` / `chatgpt.com` / `perplexity.ai` beyond what was incidentally discovered.
- "How to build this for Inkeep/Open Knowledge" — this is a factual landscape report per stance.

### Open questions raised by findings
- **Is there room for a shared `@open-knowledge/open-in-ai` npm package** that wraps `open 'claude://...'` / `open 'codex://...'` / `open 'cursor://...'` / Shortcuts delegation for ChatGPT + Perplexity, handling the per-provider param-name differences (q/prompt/text)? Prior-art evidence suggests the "clipboard + URL scheme + fallback" fan-out logic is nontrivial across 5 apps × 3 mechanisms.
- **Would a react-grab plugin that uses Codex's `path=<abs-path>` or `originUrl=<git-url>` fill the identified gap?** react-grab already knows the file path of the captured component — constructing `codex://new?prompt=<context>&path=<repo-root>` would be the first published tool to leverage Codex's unique capability.
- **Would a vendor register `NSServices`** for "Send selection to <app>" if one existed as a Quick Action package? The primitive is low-cost; the content gap may be purely a coordination problem.

---

---

## Post-publication addenda (2026-04-16)

Extensions to the landscape after the initial report was published. Each addendum is grounded in a dedicated evidence file and extends the coverage in D1–D10 rather than modifying prior findings.

### Addendum A — Extended editor desktop coverage (Zed, JetBrains, VS Code, Windsurf, Dia)

The initial D1–D3 covered Claude, Codex, and Cursor — but the "editor-class AI desktop" category extends further. This addendum pulls four more targets into scope.

**Zed Editor** (Zed Industries). Native Rust editor, ACP-based external-agents architecture (Claude Agent / Codex / Gemini CLI all connect via Agent Client Protocol). **Registers `zed://` with 9 documented first-segment URL paths** (`file`, `ssh`, `extension`, `agent`, `agent/shared`, `schemas`, `settings`, `git/clone`, `git/commit`) plus a `https://zed.dev/channel/...` fallthrough — enumerated from `crates/zed/src/zed/open_listener.rs`. **`zed://agent?prompt=<url_encoded_text>` is a first-class prompt-seeding route** shipped in PR #47959 (merged 2026-01-29); parsed into `OpenRequestKind::AgentPanel { external_source_prompt: Option<ExternalSourcePrompt> }` and dispatched via `panel.new_external_thread_with_text(...)`. This is directly analogous to Codex's `codex://new?prompt=` and structurally the cleanest OSS prior art for a typed, single-param agent-prompt URL on an editor-class app. The `zed` CLI has no `--prompt` flag; prompt seeding via CLI is done by passing the URL as a positional argument. Internal `zed-cli://` IPC is separate. A namespace collision worth noting: `zed://agent/symbol/...` (internal ACP mention URIs, via `MentionUri::parse`) vs `zed://agent/shared/<uuid>` (external deep-link, via `OpenRequest::parse`) — two routers share one prefix, which is a precedent OK should avoid.

**JetBrains IDE family** (IntelliJ, WebStorm, PyCharm, RustRover, RubyMine, GoLand, CLion, DataGrip, Android Studio). Messy coexistence of two scheme layers: per-product natives (`idea://`, `webstorm://`, `pycharm://`, `phpstorm://`, `rubymine://`, etc.) registered since PhpStorm 8 EAP (2014) in `<product>://open?file=<abs-path>&line=<n>` shape; plus an umbrella `jetbrains://<toolTag>/...` intercepted by the Toolbox App's `jetbrainsd` daemon, with `checkout/git` and `navigate/reference` routes reverse-engineered from the Toolbox browser extension. Separate `jetbrains-gateway://` for Remote Dev. **YouTrack issue TBX-3965 ("Documentation for Toolbox Reference URL Scheme") has been open for years** — no authoritative JetBrains doc. **Critically: no `idea://ai/...` or `idea://chat?prompt=...` — AI Assistant URL handoff is NOT FOUND.** Junie (JetBrains' 2025 autonomous agent) also has no URL-scheme entry point; it uses local-IPC + CLI (`junie --task "<prompt>" --project <path>`) with an `--acp` flag strongly implying the same Agent Client Protocol Zed uses. **JetBrains has deliberately chosen IPC+CLI over URL schemes for their agent tooling** — a notable product-design divergence.

**VS Code.** Four distinct user-facing route families under `vscode://` — **file-opener, extension-authored (via `registerUriHandler`), settings, profile** — plus 29 internal `vscode://schemas/*` (Monaco validation, not deep links) and the separate `vscode-remote://` scheme. No `vscode://chat/...`, no `vscode://copilot/...`, no `vscode://agent/...` — **Copilot Chat has no deep-link entry point** (as of 1.96.4 and docs). The architecturally distinct `vscode:mcp/install?<url-encoded-JSON>` (Insiders: `vscode-insiders:mcp/install?...`) uses an **opaque-URI form** (no `//`, no authority — parallel to `mailto:`/`data:`) — shipped in VS Code 1.99 (April 2025), documented at [code.visualstudio.com/api/extension-guides/mcp](https://code.visualstudio.com/api/extension-guides/mcp). Paired with the `code --add-mcp "<json>"` CLI flag. **Cursor chose to overlay MCP install on extension routing** (`cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>`) — same capability, different architecture (flexible but conflates app-owned and extension-owned routes). For OK's own scheme design: the MS pattern gives cleaner separation (`openknowledge://page/<slug>` for content, `openknowledge:install?...` for protocol install); Cursor's pattern is easier to extend post-hoc.

**Windsurf** (Codeium). Exactly **one** confirmed deep-link route — `windsurf://cascade?prompt=<text>` — verified only via Mintlify's production bundle (shipping to 10K+ docs sites). **Undocumented in Windsurf's own docs/changelog.** No MCP install URL; MCP servers are added via UI marketplace or by editing `~/.codeium/windsurf/mcp_config.json`. No official CLI. Third-party `wsc` (staronelabs/windsurf-cli) bridges terminal → Cascade via private local IPC — not URL-based. Inherited VS-Code routes (`windsurf://file/...`, extension URLs) are highly plausible from the fork lineage but unverified without binary inspection.

**Dia** (Browser Company, native Swift AI browser, v1.8.0, bundle `company.thebrowser.dia`). **Does NOT register any custom URL scheme** in `CFBundleURLTypes` — only `http`/`https` (browser role). Internal `dia://` handling exists but is **address-bar-only** navigation to browser-chrome pages (`dia://settings`, `dia://bookmarks`, `dia://history`, `dia://extensions`, `dia://assistant/<uuid>`, `dia://memory-settings`, `dia://timestamp?`, `dia://attachment`) — architecturally equivalent to `chrome://`/`about:`. **Dia's AI is NOT URL-seedable from outside**; no external equivalent of `claude://claude.ai/new?q=`. Dia embeds outbound handoff to `claude.ai/new?q=`, `chatgpt.com/?q=`, `perplexity.ai/search?q=` — **it's a consumer of other AIs' deep-links, not a provider of its own**. Uses "Skills" (native format) not MCP.

**Cross-finding implications for OK:**
- Three AI-native editors now ship URL-based prompt seeding: **Codex** (`?prompt=`), **Cursor** (`?text=` with confirmation modal), **Zed** (`?prompt=`, PR-level primary-source-verified). Claude Desktop has `?q=` but for the chat app, not Claude Code's coding agent.
- JetBrains + Junie deliberately chose the **IPC+CLI path** over URL schemes for agent invocation — meaningful product-design divergence worth studying separately from the URL-scheme cluster.
- **`vscode:mcp/install?<json>` (opaque URI)** vs **`cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>` (authority URI)** is the cleanest architectural split in the ecosystem. OK's own scheme design gets to pick.
- AI browsers (Dia, likely Atlas) are **consumers not providers** of handoff. External tools can't seed their AI via URL — the browsers themselves construct outbound URLs to `claude.ai` / `chatgpt.com` / etc.

**Evidence:** [evidence/zed-and-jetbrains-deep-links.md](evidence/zed-and-jetbrains-deep-links.md) + [evidence/vscode-windsurf-dia-deep-links.md](evidence/vscode-windsurf-dia-deep-links.md)

---

### Addendum B — Codex 26.415 release + superapp consolidation plan (announcement 2026-04-16)

**Prior D2 probe staleness.** The D2 binary inspection (evidence/codex-desktop-deep-links.md) was based on Codex Desktop version `26.406.31014` from 2026-04-10. **A major update shipped today, 2026-04-16: Codex Desktop `26.415`**. The new release adds three capability categories (Computer Use, In-App Browser, Image Generation) plus Chats, Thread Automations, Pull Request Integration, Memory Preview, and first-time Intel Mac support. The URL scheme is presumed unchanged (no announcement of new `codex://` routes) but a fresh binary probe would verify.

**Plugin marketplace expansion.** Codex launched plugins on 2026-03-26 with ~20 partners (Slack, Figma, Notion, Sentry); today's release brings the curated collection to **111 plugins**. Installation is CLI-driven (`codex marketplace add <url>`) and app-driven (Plugins panel → Add to Codex) — **no `codex://` URL-scheme extension for plugin install was announced**, unlike Cursor's `cursor://anysphere.cursor-deeplink/mcp/install?...` and VS Code's `vscode:mcp/install?...`.

**Computer Use capability.** Codex can now "see, click, and type into your Mac apps, with its own cursor" — OpenAI's answer to Anthropic's Computer Use. This **inverts** one direction of the handoff analysis: external tools handing off TO Codex (URL-scheme pattern) vs Codex driving OTHER apps (accessibility pattern). The two are complementary, not competitive.

**Superapp consolidation.** On 2026-03-19 OpenAI confirmed it would merge ChatGPT + Codex + Atlas browser into a single desktop "superapp." Today's in-app-browser addition (Atlas technology integrated into Codex) is one step toward that. Implications for the report:
- Future scheme consolidation: `chatgpt://`, `openai://`, `com.openai.chat://`, `codex://` may unify or deprecate. Near-term stability question for any tool that hardcodes the distinction.
- Current D4 finding ("ChatGPT Desktop does not accept `?q=<prompt>`") could change if the unified app inherits Codex's `?prompt=` convention.

**Evidence:** [evidence/codex-recent-announcements.md](evidence/codex-recent-announcements.md)

---

### Addendum C — Missed prior art: Linear's "Deeplink to AI coding tools" (shipped 2026-02-26)

A significant gap in the initial D7 handoff-landscape pass: **Linear shipped a production deep-link-to-AI-coding-tools feature on 2026-02-26** supporting **9 tools**: Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed. Invocation surfaces include a keyboard shortcut (`Cmd+Option+.` Mac / `Ctrl+Alt+.` Win-Linux), `W → O` menu, and a UI button next to the issue identifier. The payload is "the issue ID and all relevant context: description, comments, updates, linked references, and images." Organizations can customize prompt templates via `{{issue.identifier}}` and `{{context}}` variables.

**Why this matters for OK:** Linear is a production SaaS product shipping the exact handoff pattern OK is evaluating — content entity → AI coding tool of user's choice. Their tool list (9) is broader than Mintlify's 7 and targets coding tools specifically (vs Mintlify's chat/MCP-install focus). The `{{issue.identifier}}` / `{{context}}` placeholder pattern is a direct product-level parallel to Raycast Quicklinks' `{Query}` / `{selection}`. **Linear's per-tool URL construction is not published** in the changelog — inspecting `linear.app`'s runtime bundle would give the specific URL templates (parallel to how we inspected Mintlify). This is the single most actionable follow-up direction surfaced by this addendum.

**Evidence:** [evidence/codex-recent-announcements.md](evidence/codex-recent-announcements.md) §5

---

### Addendum D — Deep probes: Linear registry, Codex 26.415 diff, Zed MentionUri/ACP (Path C round 3)

Three targeted follow-ups to close the strongest-ROI gaps identified after the round-2 exhaustion check.

#### D.1 — Linear's production AI-coding-tool registry (binary-level extraction)

Linear's "Deeplink to AI coding tools" feature (shipped 2026-02-26) was identified as the single most directly-applicable prior art for OK's design. A fresh inspection of Linear's production runtime bundle (`https://static.linear.app/client/assets/AIActions.B5r9dZjO.js`, 2.78 MB, last-modified 2026-04-17 00:40 UTC, registry at byte offset 1,519,683) produced the full verbatim per-tool URL template matrix.

**Registry has grown from 9 to 19 tools since launch** — ~1 tool added per week. The original 9 at launch per the 2026-02-26 announcement: Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed. Plus 8 post-launch built-in additions: Amp, Codex CLI, Devin, Factory, Lovable, Netlify, Warp, Windsurf. Plus 2 user-defined entries: customUrl, customTerminalScript. Total: **9 + 8 + 2 = 19**. The scalable registry architecture is the single most stealable design pattern — each tool is a ~6-line object with either `{buildPromptDeepLink(prompt)}` or `{command, commandArgs(prompt)}`, and all shared infrastructure (feature flag, user enablement, URL truncation, telemetry, unavailable-reason toasts) lives in helper functions.

**Tool distribution:**

| Mode | Count | Examples |
|---|---|---|
| Desktop URL scheme | 8 | `codex://`, `conductor://`, `cursor://anysphere.cursor-deeplink/`, `factory-desktop://`, `vscode://github.copilot-chat`, `warp://linear/work`, `windsurf://cascade`, `zed://agent` |
| Web URL | 5 | Devin, Lovable, Netlify, Replit, v0 |
| CLI via Electron IPC (`runTerminalCommand`) | 4 built-in + 1 user-defined = **5 total** | **Claude Code, Codex CLI, OpenCode, Amp** (built-in; no URL at all) + customTerminalScript (user-defined hook) |
| User-defined URL (customUrl) | 1 | customUrl (prompt template via `{{prompt}}`) |

**Critical architectural insights for OK:**

1. **Treat shell-exec as a first-class handoff channel equal to URL schemes.** 5 of 19 registry entries use shell-exec (4 built-in tools — Claude Code, Codex CLI, OpenCode, Amp — plus customTerminalScript as a user-defined hook). Those 4 built-in tools would all be unreachable if Linear had limited itself to URL-scheme handoff. OK's own registry should ship with the discriminated union `{buildPromptDeepLink} | {command, commandArgs}` from day 1.
2. **Server-side template substitution.** `{{issue.identifier}}` and `{{context}}` are resolved on the server via a GraphQL `IssuePromptContext($issueId: String!)` query — the client receives a pre-rendered flat string. Client-side template substitution exists only for `customUrl` and supports only `{{prompt}}`. Pragmatic tradeoff: gives Linear control over payload composition but forecloses per-tool customization.
3. **Per-tool URL-length caps with visible truncation footer.** Binary-search truncator (`RW` function) appends `\n\n[Truncated. Full issue available in Linear.]` when over the cap. Caps: **2000 bytes default, 8000 bytes for Cursor and GitHub Copilot, no cap for Conductor/Factory/Warp/Windsurf**.
4. **Double percent-encoding for Cursor, GitHub Copilot, Windsurf.** `encodeURIComponent(encodeURIComponent(e))` — Linear compensates for the first decode at OS protocol-handler hand-off and the second at the extension/app router. Cross-tool interop gotcha any handoff implementation will hit.
5. **Replit uses lz-string `compressToEncodedURIComponent` compression** instead of percent-encoding to fit large prompts under the 2 KB cap. Indicates Linear hit the URL limit hard enough to integrate a compression library.
6. **No Claude Desktop entry.** Linear's registry has no `claude://` scheme and no Claude Desktop target — Claude Code (the terminal CLI) is the only Anthropic-tool entry. An intentional product choice for an issue-tracker-to-coding-tool workflow, but notable as a negative finding.

**Evidence:** [evidence/linear-ai-deeplinks-extraction.md](evidence/linear-ai-deeplinks-extraction.md) — 407 lines with the full switch-case verbatim + per-tool URL templates

---

#### D.2 — Codex 26.415 fresh binary probe: URL scheme is semantically stable

Codex Desktop `26.415.20818` (released 2026-04-16, fresh DMG pulled from `persistent.oaistatic.com/codex-app-prod/Codex.dmg`, asar SHA256 `5e8423d4df65bc7af56701e76fc28c6431d5dcaf63c54cc60708675e315e7d8d`) was re-probed and diffed against the prior `26.406.31014` evidence. Despite three major new feature categories (Computer Use, In-App Browser, 111-plugin Marketplace) and a 9-version jump, **the `codex://` URL scheme is byte-for-byte equivalent in semantics**.

| Dimension | 26.406 | 26.415 | Verdict |
|---|---|---|---|
| URL parser (`Z9`) branches | 7 | 7 | Identical |
| Route kinds (dispatcher cases) | 6 | 6 | Identical |
| `$9` newThread param parser | `prompt` + `originUrl` + `path` | Same 3 params | Identical |
| `codex://` plugin-install URL | absent | **still absent** | No addition |
| `Metadata.appintents` bundle | absent | **still absent** | No addition |
| CLI flags on `codex app` | no `--prompt` | still no `--prompt` | Identical |
| CLI subcommands | (base set) | **+ `codex marketplace add <source>`** | One new subcommand |
| `https://` URL handling | `shell.openExternal` → OS browser | Same | Unchanged |

**Three architectural findings from the 26.415 probe worth flagging:**

1. **Plugin install is intentionally NOT URL-scheme-exposed.** Install flows through internal IPC (`plugin/install` / `marketplace/add` / `plugin/uninstall` JSON-RPC between Electron main and Rust app-server) plus the new `codex marketplace add <owner/repo>` CLI. **This is an explicit divergence from Cursor** (`cursor://anysphere.cursor-deeplink/mcp/install?config=<base64>`) **and VS Code** (`vscode:mcp/install?<urlencoded-JSON>`). Product-design choice: Codex treats plugin install as a privileged operation requiring auth-gated in-app UI, not a URL anyone can click.

2. **Computer Use is Apple-Events-driven, not accessibility-API-driven.** Ships as a separately-codesigned sub-app at `Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/`, bundle id `com.openai.sky.CUAService`, with the `com.apple.security.automation.apple-events` entitlement. Our round-2 `codex-recent-announcements.md` synthesis described this as "accessibility/visual interaction" — the 26.415 probe corrects that: the underlying mechanism is AppleScript/Apple Events (same substrate as `osascript -e 'tell application "Safari" to activate'`). No `NSAccessibilityUsageDescription`, no URL-scheme surface.

3. **In-app browser has NO URL-scheme interception.** `https://` URLs still flow through `shell.openExternal` to the OS default browser. The in-app browser is invoked by Codex's own UI affordances (the sidebar button + `openBrowserSidebarExternalUrl` IPC), not by intercepting OS-level URL delivery.

**Verdict for OK and other integrators:** the `codex://` 7-URL surface documented in the original D2 evidence is stable. Integrators can safely target it without fear of imminent breakage from the superapp consolidation rollout.

**Evidence:** [evidence/codex-26415-probe.md](evidence/codex-26415-probe.md) — 564 lines with verbatim parser diffs + the Computer Use entitlement probe

---

#### D.3 — Zed MentionUri + ACP: the two-router architecture and security lessons

Zed is the only editor in the surveyed sample with **two separate URL routers sharing a single scheme prefix** (`zed://agent/shared/<uuid>` external vs `zed://agent/{symbol,thread,rule,...}` internal). A deep dive into the Rust source, the Agent Client Protocol spec, and the disambiguation mechanism surfaced three patterns directly applicable to OK's own scheme design.

**Agent Client Protocol (ACP) — the transport layer underneath MentionUri.** JSON-RPC over stdio (stable) or streamable HTTP (draft proposal). Rust crate `agent-client-protocol@0.10.4` with 1.28M downloads on crates.io; TypeScript `@zed-industries/agent-client-protocol` with 14.4K weekly downloads; Python/Java/Kotlin libraries published. **Four ACP-compatible agents as of April 2026: Gemini CLI, Claude Agent, Codex CLI, GitHub Copilot** — a small but credible ecosystem. The protocol is the context-delivery channel; MentionUris are the typed-reference payload format that rides on top.

**MentionUri has 12 variants** (enum grew ~1 variant every 3 weeks since first commit 2025-08-12): `File`, `PastedImage`, `Directory`, `Symbol`, `Thread`, `Rule`, `Diagnostics`, `Selection`, `Fetch`, `TerminalSelection`, `GitDiff`, `MergeConflict`. Each has a structured URL shape (mostly `zed:///agent/<kind>?params…` with occasional `file://` forms for file-bound mentions). This is the "typed context API surface" an editor exposes to its connected agent.

**Disambiguation is STRUCTURAL, not code-level.** Two completely separate parsers in two different crates: `OpenRequest::parse` in `crates/zed/src/zed/open_listener.rs` handles external URLs (arriving via OS `open-url` + CLI), and `MentionUri::parse` in `crates/acp_thread/src/mention.rs` handles internal URIs (arriving via ACP JSON-RPC or composer paste). **They are never called from the same code path.** The two routers partition the `/agent/` subpath space disjointly by convention — no shared dispatcher, no type-level enforcement. `/agent/shared/<uuid>` is external-only; `/agent/{thread,rule,symbol,…}` is internal-only.

**Security model is newtype-at-boundary, not a trust flag.** The external boundary uses `ExternalSourcePrompt`, a Rust newtype whose only constructor (`::new`) runs mandatory sanitization: strips bidi control chars (Trojan-Source defense, CVE-2021-42574), removes disallowed control chars, collapses newline runs > 2, normalizes CRLF. **MentionUri has NO trust flag — trust is inherited from arrival path.** Defensible because MentionUri is never reachable from external URLs given the structural router separation.

**Two lessons for OK:**

1. **Adopt the newtype-at-boundary pattern.** Every external URL payload (query params, path segments) that will be consumed by LLM prompts should be wrapped in a newtype whose only constructor sanitizes (strip bidi overrides, strip control chars, cap newlines). This centralizes all trust-boundary logic in one compiler-enforced place. Highest-ROI security pattern surfaced across the entire research.

2. **Avoid Zed's two-parsers-in-different-crates structure for greenfield work.** Zed's namespace discipline is maintained by vigilance — a new contributor adding `zed://agent/thread-share/` could silently shadow an existing mention path. For a greenfield project like OK, safer options are (a) separate schemes (`openknowledge://` external, `openknowledge-mention://` internal — strong type-level separation), or (b) a single dispatcher returning a discriminated union with an exhaustiveness-checked test enumerating all variants. Zed's structure is defensible only because it grew organically; don't inherit it from day 1.

**ACP tool calls are NOT URL-shaped.** ACP tool invocation flows over JSON-RPC methods (`session/update`, `session/request_permission`), never through URI shapes. MentionUri is strictly *context*, not *action*. Slash commands were the nearest URL-ish action analog but are being removed (PR #52757, 2026-03-31) in favor of Agent Skills. Reinforces that URL schemes serve launch/handoff-with-payload; action dispatch belongs on a proper RPC layer.

**Evidence:** [evidence/zed-mentionuri-acp-dive.md](evidence/zed-mentionuri-acp-dive.md) — 444 lines with the 12-variant enum verbatim + `ExternalSourcePrompt::new` source + ACP spec references

---

## References

### Evidence Files
- [evidence/claude-desktop-deep-links.md](evidence/claude-desktop-deep-links.md) — Claude Desktop URL scheme, 15-entry route enum (`td`), `dispatchHandleDeepLink` IPC mechanism, CLI distinction
- [evidence/codex-desktop-deep-links.md](evidence/codex-desktop-deep-links.md) — Codex Desktop URL parser (`Z9`), `prefillPrompt` dispatcher (`Pp`), workspace-resolution pipeline (`Fp`→`Ip`→`Lp`), CLI bridge (`codex app`)
- [evidence/cursor-desktop-deep-links.md](evidence/cursor-desktop-deep-links.md) — Cursor ten-route surface, CursorJack hardening, four prompt modes, GlassDeeplinkHandler, CLI surface
- [evidence/react-grab-and-similar-handoff-tools.md](evidence/react-grab-and-similar-handoff-tools.md) — react-grab source analysis (no URL schemes, clipboard+MCP), Mintlify 7-provider switch-case, DevInspector/Schmalbach/Element Inspector/LocatorJS comparison
- [evidence/raycast-ecosystem.md](evidence/raycast-ecosystem.md) — `raycast://` URL scheme, `@raycast/api` `open()` / `AI.ask()` / `Clipboard`, 3 production handoff extensions, Quicklinks architecture
- [evidence/handoff-prior-art.md](evidence/handoff-prior-art.md) — ChatGPT/Perplexity App Intents, NSServices absence, BTT/Alfred/KM surveys, AppleScript absence, bookmarklets, PopClip pattern, shell one-liners
- [evidence/docs-site-handoff-landscape.md](evidence/docs-site-handoff-landscape.md) — Mintlify's full 14-identifier `contextual.options` schema, Fumadocs' `MarkdownCopyButton` + `ViewOptionsPopover`, Starlight `starlight-page-actions` (the only GitHub Copilot handoff found), Vercel AI Elements `<OpenIn>`, ReadMe Ask AI, Docusaurus/Nextra/VitePress/GitBook absence, desktop-vs-web verdict
- [evidence/raycast-prompts-chat-registry.md](evidence/raycast-prompts-chat-registry.md) — Full 28-platform production registry verbatim, `buildUrl()` function, clipboard-fallback mechanism, `supportsQuerystring` vs `isDeeplink` distinction, per-provider URL param inventory, comparison with Mintlify's 7
- [evidence/zed-and-jetbrains-deep-links.md](evidence/zed-and-jetbrains-deep-links.md) — Zed `zed://` full scheme (9 first-segment URL paths) + `zed://agent?prompt=` (PR #47959, Rust source verbatim); JetBrains per-product + `jetbrains://` + `jetbrains-gateway://` schemes; Junie IPC+CLI divergence from URL-scheme pattern
- [evidence/vscode-windsurf-dia-deep-links.md](evidence/vscode-windsurf-dia-deep-links.md) — VS Code 4 user-facing route families + `vscode:mcp/install?<json>` opaque-URI form (1.99 April 2025); `--add-mcp` CLI flag; Windsurf single-route (`windsurf://cascade?prompt=`) undocumented-in-vendor; Dia as handoff consumer-not-provider; opaque-vs-authority URI architectural split
- [evidence/codex-recent-announcements.md](evidence/codex-recent-announcements.md) — Codex 26.415 release 2026-04-16 (Computer Use + in-app browser + 111 plugins); 2026-03-19 superapp consolidation plan; 2026-02-26 Linear "Deeplink to AI coding tools" (9-tool registry) — missed prior art
- [evidence/linear-ai-deeplinks-extraction.md](evidence/linear-ai-deeplinks-extraction.md) — Full 19-tool Linear production registry from runtime bundle (AIActions.B5r9dZjO.js); per-tool URL templates verbatim; terminal-command-via-IPC for 4 tools; double-encoding for Cursor/Copilot/Windsurf; lz-string for Replit; per-tool URL-length caps; server-side `{{context}}` GraphQL resolution
- [evidence/codex-26415-probe.md](evidence/codex-26415-probe.md) — Fresh DMG probe of Codex Desktop 26.415.20818; verbatim parser diff vs 26.406 (byte-for-byte semantic equivalence); Computer Use is Apple-Events-driven sub-app with `com.apple.security.automation.apple-events` entitlement; plugin install is IPC+CLI only (no URL); `codex marketplace add` CLI subcommand new
- [evidence/zed-mentionuri-acp-dive.md](evidence/zed-mentionuri-acp-dive.md) — Zed's 12-variant MentionUri enum; ACP transport (JSON-RPC over stdio, Rust `agent-client-protocol@0.10.4` on crates.io); 4 ACP-compatible agents; structural two-parser disambiguation of `/agent/` subpath; `ExternalSourcePrompt` newtype-at-boundary security pattern (bidi-control strip, CVE-2021-42574 defense)

### Related Research
- [reports/web-to-macos-desktop-wrapping-2025/](../web-to-macos-desktop-wrapping-2025/REPORT.md) — architectural profile of the same apps (Electron vs native Swift). This report extends that with deep-linking as a distinct dimension.
