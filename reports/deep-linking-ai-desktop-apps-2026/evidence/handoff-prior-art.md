# Evidence: Handoff Prior Art — Launchers, Services, Scripting, Bookmarklets

**Dimensions:** D4 (ChatGPT / Perplexity supplements) + D7 (prior-art ecosystem) + D9 (CLI / stdin) + D10 (AppleScript / accessibility)
**Date:** 2026-04-16
**Sources:** macOS native probing of `/Applications/{Claude,Codex,Cursor,ChatGPT,Perplexity}.app` + community forums (BTT, Alfred, Keyboard Maestro, PopClip, OpenAI Community) + web gists and extension stores.

Cross-references: sibling evidence files in the same directory — `claude-desktop-deep-links.md`, `codex-desktop-deep-links.md`, `cursor-desktop-deep-links.md` (authoritative on `claude://`, `codex://`, `cursor://`). A separate subagent covers Raycast; findings here deliberately avoid duplicating Raycast-specific coverage.

---

## Key sources

- `/Applications/ChatGPT.app/Contents/Resources/Metadata.appintents/extract.actionsdata` — ChatGPT's on-disk App Intents manifest (probed 2026-04-16).
- `/Applications/Perplexity.app/Contents/Resources/Metadata.appintents/extract.actionsdata` — Perplexity's on-disk App Intents manifest (probed 2026-04-16).
- `/Applications/{Claude,Codex,Cursor,ChatGPT,Perplexity}.app/Contents/Info.plist` — URL schemes + NSServices + OSAScriptingDefinition keys (all probed 2026-04-16).
- BetterTouchTool blog + community — "ChatGPT + BetterTouchTool" series ([folivora.ai/blog/post/13300](https://folivora.ai/blog/post/13300), accessed 2026-04-16), docs at [docs.folivora.ai/docs/other-triggers/text-selection/](https://docs.folivora.ai/docs/other-triggers/text-selection/).
- Alfred Gallery — official ChatGPT workflow ([alfred.app/workflows/alfredapp/openai/](https://alfred.app/workflows/alfredapp/openai/)); ChatFred ([alfred.app/workflows/chrislemke/chatfred/](https://alfred.app/workflows/chrislemke/chatfred/), [github.com/chrislemke/ChatFred](https://github.com/chrislemke/ChatFred)); `ammonhaggerty/alfred-claude` ([github.com/ammonhaggerty/alfred-claude](https://github.com/ammonhaggerty/alfred-claude)); accessed 2026-04-16.
- Keyboard Maestro forum — "Integrating ChatGPT into Keyboard Maestro" ([sayzlim.net/chatgpt-keyboard-maestro/](https://sayzlim.net/chatgpt-keyboard-maestro/)); "Popclip to ChatGPT client" ([forum.keyboardmaestro.com/t/macro-popclip-to-chatgpt-client/38268](https://forum.keyboardmaestro.com/t/macro-popclip-to-chatgpt-client/38268)); accessed 2026-04-16.
- PopClip ChatGPT App extension source: [github.com/pilotmoon/PopClip-Extensions/blob/master/source/ChatGPTApp.popclipext/Config.ts](https://github.com/pilotmoon/PopClip-Extensions/blob/master/source/ChatGPTApp.popclipext/Config.ts) (verified download 2026-04-16); Perplexity App extension listing [popclip.app/extensions/x/4ctkcx](https://www.popclip.app/extensions/x/4ctkcx).
- Vincent Schmalbach, "Claude & ChatGPT Bookmarklets" — [vincentschmalbach.com/claude-chatgpt-bookmarklets/](https://www.vincentschmalbach.com/claude-chatgpt-bookmarklets/) (accessed 2026-04-16).
- OpenAI Community feature request — "Support custom URL schemes or intent handlers" ([community.openai.com/t/.../1255168](https://community.openai.com/t/support-custom-url-schemes-or-intent-handlers-to-trigger-specific-behaviors-in-the-chatgpt-mobile-app/1255168)), accessed 2026-04-16.
- Imrat on X — undocumented `perplexity-app://` schema ([x.com/imrat/status/1850487864179491090](https://x.com/imrat/status/1850487864179491090)).
- 9to5Mac — "Apple Shortcuts and ChatGPT for Mac" ([9to5mac.com/2024/05/23/apple-shortcuts-and-chatgpt-for-mac/](https://9to5mac.com/2024/05/23/apple-shortcuts-and-chatgpt-for-mac/)); Matthew Cassinelli ChatGPT Shortcuts library ([matthewcassinelli.com/new-shortcuts-library-chatgpt-for-mac/](https://matthewcassinelli.com/new-shortcuts-library-chatgpt-for-mac/)).
- Peter Steinberger — "Making AppleScript Work in macOS CLI Tools" ([steipete.me/posts/2025/applescript-cli-macos-complete-guide](https://steipete.me/posts/2025/applescript-cli-macos-complete-guide)).
- Brett Terpstra — "Shell tricks: the OS X `open` command" ([brettterpstra.com/2014/08/06/shell-tricks-the-os-x-open-command/](https://brettterpstra.com/2014/08/06/shell-tricks-the-os-x-open-command/)).
- `aidenybai/react-grab` — [github.com/aidenybai/react-grab](https://github.com/aidenybai/react-grab), [react-grab.com](https://www.react-grab.com/) (accessed 2026-04-16; covered in detail by the sibling `react-grab-and-similar-handoff-tools.md` subagent).

---

## Part 1: macOS Services (right-click "Send selection to …")

### Finding 1.1: None of Claude / Codex / Cursor / ChatGPT / Perplexity register a macOS Service
**Confidence:** CONFIRMED
**Evidence:** `plutil -extract NSServices xml1 -o - Info.plist` run against each of the five apps returns empty output. Raw probe:

```
$ for app in Claude Codex Cursor ChatGPT Perplexity; do
    echo "=== $app NSServices ==="
    plutil -extract NSServices xml1 -o - "/Applications/$app.app/Contents/Info.plist" 2>/dev/null
  done
=== Claude NSServices ===
=== Codex NSServices ===
=== Cursor NSServices ===
=== ChatGPT NSServices ===
=== Perplexity NSServices ===
```

No `NSServices` key is set in any `Info.plist`. Nothing appears in `/Applications/*.app/Contents/Resources/` matching `service` or `Services`.

**Implication:** There is **no built-in** "Send selection to Claude / ChatGPT / Cursor …" entry in the system Services menu. A user who wants a Services-menu entry must author their own Automator "Quick Action" that wraps the app's URL scheme or a shell one-liner.

### Finding 1.2: The community workaround is an Automator "Quick Action"
**Confidence:** CONFIRMED (pattern exists; no canonical widely-shared bundle)
**Evidence:** Gregory Zem — ["Enhancing Text Processing Efficiency on MacOS: Leveraging Automator and ChatGPT"](https://medium.com/@mne/experience-mind-blowing-in-context-text-processing-on-macos-using-automator-and-chatgpt-82b4ab7d5254) (via Medium, 2024) documents the blueprint: Automator → "Quick Action" → "Input: text from any app" → "Run Shell Script" that invokes either the OpenAI API or, more relevant here, `open 'claude://claude.ai/new?q=...'` / `open 'codex://new?prompt=...'` with the selection URL-encoded. WWT's ["Using MacOS Services to Integrate AI into Everyday Tasks"](https://www.wwt.com/blog/using-macos-services-to-integrate-ai-into-everyday-tasks) covers the same shape.

**Implication:** Services-menu integration for these desktop AI apps is a DIY construct built on top of the URL scheme + `open(1)`. None of the vendors ship one.

### Negative search (Part 1)
- `find /Applications/{Claude,Codex,Cursor,ChatGPT,Perplexity}.app -name '*.service' -o -name '*Services*'` — no hits.
- No `NSServices` entries in any `Info.plist`.
- No widely-distributed Quick-Action `.workflow` bundle on GitHub named "Send-to-Claude" / "Send-to-ChatGPT" / "Send-to-Cursor". Community posts show individuals building their own.

---

## Part 2: Shortcuts.app and App Intents

### Finding 2.1: ChatGPT Desktop ships 4 App Intents — `AskIntent(prompt)` is the seed-a-prompt intent
**Confidence:** CONFIRMED
**Evidence:** `/Applications/ChatGPT.app/Contents/Resources/Metadata.appintents/extract.actionsdata` (raw JSON blob, 14 KB). Extracted intents:

| Identifier | `openAppWhenRun` | Parameters | Shortcuts auto-phrases |
|---|---|---|---|
| `AskIntent` | **false** | `prompt` (required String), `newChat` (Bool, default false), `continuous` (Bool, default false) | "Ask ChatGPT", "Send a question to ChatGPT", "Query ChatGPT", "Tell ChatGPT" |
| `OpenNewChatInAppShortcutIntent` | true | `useSearchGPT` (Bool), `temporaryChat` (Bool), `startAction` (Enum: whisper/camera/photoLibrary, optional) | "Open ChatGPT with a new chat", "Open Search in ChatGPT", "Start dictation in ChatGPT" |
| `OpenNewChatInAppWidgetIntent` | true | same + `source` enum (shortcut / controlWidget / homeScreenWidget) | widget-only; not user-discoverable |
| `OpenVoiceModeIntent` | true | — | "Start voice conversation with ChatGPT", "Talk to ChatGPT" |

Relevant snippet (from the raw actionsdata):

```json
"AskIntent": {
  "actionConfiguration": {"actionSummary": {"wrapper": {"summaryString": {
    "formatString": "Ask ChatGPT ${prompt}",
    "parameterIdentifiers": ["prompt"]
  }}}},
  "descriptionMetadata": {"descriptionText": {"key":
    "This action will send a single message to a chat with ChatGPT and return the response."}},
  "parameters": [
    {"name":"prompt", "isOptional":false, "parameterDescription":{"key":"Message to send to ChatGPT"}},
    {"name":"newChat", "isOptional":false, "title":{"key":"Start new chat"}},
    {"name":"continuous", "isOptional":false, "title":{"key":"Continuous chat"}}
  ],
  "openAppWhenRun": false
}
```

**Implication:** Shortcuts.app (macOS 14+) can send a prompt to ChatGPT Desktop via the `AskIntent` without a URL scheme at all. `openAppWhenRun:false` means the app is invoked headlessly — the return value is a `MessageEntity { conversationId, messageId, content }`. This is the **only** desktop AI chat app in this corpus that supports a structured, App-Intents-first prompt handoff. Reports by 9to5Mac and Matthew Cassinelli confirm the Shortcuts action is discoverable from the Shortcuts app picker and works without API-key configuration.

### Finding 2.2: Perplexity Desktop ships 8 App Intents; `AskPerplexityIntent(query)` is the seed-a-query intent
**Confidence:** CONFIRMED
**Evidence:** `/Applications/Perplexity.app/Contents/Resources/Metadata.appintents/extract.actionsdata` (11 KB). Extracted intents:

| Identifier | `openAppWhenRun` | Parameters | Notes |
|---|---|---|---|
| `AskPerplexityIntent` | **false** | `query` (required String) | "Search for ${query}"; returns streaming result |
| `NewQueryIntent` | true | — | "Start a new thread in Perplexity" |
| `NewProQueryIntent` | true | — | "Make a new Pro Search in Perplexity" |
| `ImageSearchIntent` | true | — | "Snap to ask Perplexity" |
| `V2VIntent` | true | — | "Start Voice Mode" |
| `OpenQueryDeepLinkIntent` | true | — | iOS 18.1+; `isDiscoverable:false` (internal deep-link bridge) |
| `OpenImageQueryDeepLinkIntent` | true | — | iOS 18.1+; internal |
| `OpenV2VDeepLinkIntent` | true | — | iOS 18.1+; internal |

Relevant snippet:

```json
"AskPerplexityIntent": {
  "actionConfiguration":{"actionSummary":{"wrapper":{"summaryString":{
    "formatString":"Search for ${query}", "parameterIdentifiers":["query"]
  }}}},
  "descriptionMetadata": {"descriptionText": {"key": "Concise and quick responses."}},
  "parameters": [{"name":"query", "isOptional":false, "title":{"key":"Query"}}],
  "openAppWhenRun": false, "outputFlags": 6
}
```

**Implication:** Like ChatGPT, Perplexity exposes a Shortcuts / App-Intents seam for prompt handoff (`query` parameter). The three `*DeepLinkIntent` identifiers — `OpenQueryDeepLinkIntent`, `OpenImageQueryDeepLinkIntent`, `OpenV2VDeepLinkIntent` — have `isDiscoverable:false`, meaning they are internal bridges the app uses to forward its undocumented `perplexity-app://` URL scheme into App-Intents handlers. Their existence plus the "Ask Anything" title string is strong circumstantial evidence of an undocumented `perplexity-app://...?query=...` form, but the exact URL path is not emitted in any binary-string probe (see Part 7).

### Finding 2.3: Claude / Codex / Cursor ship NO App Intents
**Confidence:** CONFIRMED
**Evidence:**

```
$ for app in Claude Codex Cursor; do
    echo "=== $app ==="
    find /Applications/$app.app -name Metadata.appintents 2>/dev/null
  done
=== Claude ===
=== Codex ===
=== Cursor ===
```

None of the three has a `Metadata.appintents` bundle. Shortcuts.app has no native action for any of them.

**Implication:** For Claude, Codex, and Cursor, the only way Shortcuts.app can drive them is the generic "Open URL" action wrapping `claude://claude.ai/new?q=...`, `codex://new?prompt=...`, or `cursor://anysphere.cursor-deeplink/prompt?text=...` (all confirmed in the sibling evidence files). Shortcuts users must understand URL schemes; there's no discoverable action in the action picker.

### Finding 2.4: Routinehub has community ChatGPT/Claude shortcuts, but they target the API, not the desktop app
**Confidence:** CONFIRMED
**Evidence:** [routinehub.co/shortcut/17797](https://routinehub.co/shortcut/17797/) "Anthropic Claude", [routinehub.co/shortcut/20878](https://routinehub.co/shortcut/20878/) "Claude via API", [routinehub.co/shortcut/21476](https://www.routinehub.co/shortcut/21476/) "Claude AI" — all three route through `https://api.anthropic.com` with a user-supplied API key, not into Claude Desktop.

**Implication:** The Shortcuts community has NOT converged on a canonical "open-Claude-Desktop-with-prompt" shortcut; publicly shared shortcuts either hit the hosted API (bypassing the desktop app entirely) or target the ChatGPT App Intents (which only exists on ChatGPT Desktop).

---

## Part 3: BetterTouchTool, Alfred, Keyboard Maestro

### Finding 3.1: BetterTouchTool ships a first-class "Transform & Replace Selection with ChatGPT" predefined action
**Confidence:** CONFIRMED
**Evidence:** BTT's official blog "Blog Series: #1 ChatGPT + BetterTouchTool" ([folivora.ai/blog/post/13300](https://folivora.ai/blog/post/13300)) and docs ([docs.folivora.ai/docs/other-triggers/text-selection/](https://docs.folivora.ai/docs/other-triggers/text-selection/)) describe the predefined action `Transform & Replace Selection With ChatGPT (Or compatible AI API)`. Features:

- Works on any selected text in any app (via the `Text Selection Did Change` trigger and accessibility API).
- BYO API key (supports OpenAI, Anthropic Claude via compatible endpoints, local models via `http://localhost:PORT` URL).
- Free tier with built-in 4o-mini calls.
- Outputs directly replace the selection via the accessibility API — **does not** open a desktop chat app.

**Implication:** BTT is structurally a *different category* — it calls LLM APIs inline and writes the response back into the active app. It does NOT "hand off to Claude/ChatGPT Desktop." Users who want the desktop-app handoff must build a custom BTT "Run Shell Script" trigger that wraps `open 'claude://claude.ai/new?q='"$(pbpaste | jq -rR @uri)"` or similar — see the community thread at [community.folivora.ai/t/chatgpt-shortcut-with-prompt-from-selection/30986](https://community.folivora.ai/t/chatgpt-shortcut-with-prompt-from-selection/30986).

### Finding 3.2: Alfred Gallery has an official first-party ChatGPT workflow plus 3+ third-party Claude workflows
**Confidence:** CONFIRMED
**Evidence:**

- **Official ChatGPT / DALL-E workflow** — [alfred.app/workflows/alfredapp/openai/](https://alfred.app/workflows/alfredapp/openai/). Alfred keyword, Universal Action, and Fallback Search integration. Uses OpenAI API (BYO key). Does not open ChatGPT Desktop; renders output in Alfred's own Text View.
- **ChatFred** ([alfred.app/workflows/chrislemke/chatfred/](https://alfred.app/workflows/chrislemke/chatfred/)) — multi-provider wrapper (ChatGPT, Claude, Gemini, Cohere, DALL-E, local models); keyword `cf`, clipboard-send support.
- **alfred-claude** ([github.com/ammonhaggerty/alfred-claude](https://github.com/ammonhaggerty/alfred-claude)) — community modification of the official OpenAI workflow that targets Anthropic's API instead; keyword `claude` + Universal Action.
- **Kiki** ([afadingthought.substack.com/p/kiki-ai-for-alfred](https://afadingthought.substack.com/p/kiki-ai-for-alfred)) — multi-model (Claude, offline, Whisper).

All of the above are **API-direct**; none of them hand off to `claude://` or `chatgpt://` to open the Desktop app.

Request-for-Claude-Desktop-workflow thread: [alfredforum.com/topic/21638-request-for-claudeai-workflow/](https://www.alfredforum.com/topic/21638-request-for-claudeai-workflow/) — community members have asked for a workflow that opens claude.ai (presumably the web / desktop app) with the query as a starting chat; no canonical implementation has shipped.

**Implication:** The Alfred Gallery precedent reveals a product-design pattern: launcher workflows default to API-direct rendering (answer stays in Alfred). The handoff-to-desktop-app form is a *less-explored* branch of the design space.

### Finding 3.3: Alfred Universal Actions CAN target any URL scheme handler
**Confidence:** CONFIRMED (by Alfred's Universal Action contract)
**Evidence:** Alfred's docs describe Universal Actions as targeting "URL Schemes, Bookmarks, Search, Scripts, Terminal Commands, and Snippets." A user can trivially construct a Universal Action that runs `open "claude://claude.ai/new?q={query}"` on the selected text. This is the canonical 3-step construction:

```
Alfred → Preferences → Features → Universal Actions → Create Action
→ Title: "Ask Claude Desktop"
→ Kind: Shell Script
→ Script: open "claude://claude.ai/new?q=$(printf '%s' "$1" | jq -rR @uri)"
```

**Implication:** Alfred has the right primitives for desktop-app handoff; the *absence* of a shipped Universal Action for Claude / Codex / Cursor Desktop is purely a community-content gap. Raycast has closed this gap faster — see the sibling `raycast-ecosystem.md`.

### Finding 3.4: Keyboard Maestro has no built-in AI integration — users bolt it on via clipboard + `open` or PopClip delegation
**Confidence:** CONFIRMED
**Evidence:** Keyboard Maestro community threads ([forum.keyboardmaestro.com/t/keyboard-maestro-and-chatgpt/31014](https://forum.keyboardmaestro.com/t/keyboard-maestro-and-chatgpt/31014), [forum.keyboardmaestro.com/t/macro-popclip-to-chatgpt-client/38268](https://forum.keyboardmaestro.com/t/macro-popclip-to-chatgpt-client/38268)) show users implementing the handoff via:

- **Pattern A:** `Copy` → `Execute Shell Script: open 'chatgpt://'` → `Pause 0.5` → `Paste` → `Return`. Same pattern as the PopClip ChatGPT extension (Part 5 below).
- **Pattern B:** `Execute Shell Script` wrapping `curl` against the OpenAI API; response piped back to clipboard.
- **Pattern C:** Delegate to Shortcuts.app via `Execute a Shortcut` — then use the ChatGPT `AskIntent` (Part 2.1).

There is no published canonical Keyboard Maestro `.kmmacros` bundle for "Open selection in Claude Desktop."

**Implication:** The pattern is: **clipboard + URL-scheme + UI-scripting is the fallback** when a URL scheme doesn't accept a prompt parameter (e.g. `chatgpt://` — see Part 7). For Claude Desktop and Codex, the URL scheme *does* accept a prompt parameter, so the handoff is cleaner — yet no canonical Keyboard Maestro macro has been published.

### Summary (Part 3)
| Tool | First-party AI integration | How it opens *the desktop AI chat app* |
|---|---|---|
| BTT | ✅ "Transform & Replace Selection With ChatGPT" (API-direct) | User-built `Run Shell Script` → `open 'claude://...'` |
| Alfred | ✅ Gallery workflows (API-direct, BYO key) | User-built Universal Action → `open 'claude://...'` |
| Keyboard Maestro | ❌ None shipped | User-built macro: copy → `open 'chatgpt://'` → UI-script paste |
| PopClip (Part 5) | ✅ ChatGPT App + Perplexity App extensions (desktop-handoff) | Clipboard + `popclip.openUrl("chatgpt://")` + `command n` + paste |

---

## Part 4: AppleScript / JXA / Accessibility

### Finding 4.1: None of the five apps ships an AppleScript dictionary
**Confidence:** CONFIRMED
**Evidence:** Exhaustive probe:

```
$ for app in Claude Codex Cursor ChatGPT Perplexity; do
    plutil -extract OSAScriptingDefinition raw -o - /Applications/$app.app/Contents/Info.plist
    plutil -extract NSAppleScriptEnabled   raw -o - /Applications/$app.app/Contents/Info.plist
    ls /Applications/$app.app/Contents/Resources/*.sdef 2>/dev/null
  done
# All commands return empty / nonexistent for all five apps.
```

No `.sdef` file, no `OSAScriptingDefinition` key, no `NSAppleScriptEnabled`. Running `osascript -e 'tell application "Claude" to get name'` returns just `"Claude"` — because `get name` is a universal property every app supports — but no custom scripting commands are exposed.

**Implication:** There is **no native AppleScript automation seam** for any of these apps. `tell application "Claude" to open chat with "Hi"` — and equivalents — do NOT work. This is a significant departure from the productivity-app tradition (OmniFocus, BBEdit, Drafts, Things all ship rich scripting dictionaries). The AI-desktop category is AppleScript-hostile.

### Finding 4.2: The fallback is UI scripting via `System Events` + accessibility
**Confidence:** CONFIRMED (established pattern; fragile)
**Evidence:** The canonical UI-script fallback is:

```applescript
tell application "ChatGPT" to activate
delay 0.5
tell application "System Events"
  keystroke "n" using command down      -- open new chat
  delay 0.3
  keystroke (the clipboard as text)
  keystroke return
end tell
```

Discussion threads: [discussions.apple.com/thread/254831035](https://discussions.apple.com/thread/254831035), [apidog.com/blog/claude-computer-use/](https://apidog.com/blog/claude-computer-use/) (Claude's "Computer Use" feature mimics this pattern at a higher level). Peter Steinberger's [Making AppleScript Work in macOS CLI Tools](https://steipete.me/posts/2025/applescript-cli-macos-complete-guide) documents the footguns — accessibility permission prompts, foreground-app ambiguity, keystroke-timing flakiness. His key quote: **"URL schemes are fire-and-forget with no return value, so x-callback-url patterns need Shortcuts or another callback handler."**

**Implication:** For Claude, Codex, and Cursor — all of which already accept a prompt parameter in their URL scheme (`?q=`, `?prompt=`, `?text=`) — UI scripting is an unnecessary detour. The UI-script pattern is only needed for ChatGPT Desktop today (because `chatgpt://` does NOT accept `?q=`; see Part 7) and for any prompt-injection that needs to be richer than URL-encodable text (attachments, system-prompt overrides).

### Finding 4.3: No community tool is known that injects text into a running Claude Desktop composer via AX APIs
**Confidence:** MEDIUM (negative finding based on GitHub + gist search)
**Evidence:** Searches for "Claude Desktop accessibility inject", "claude-desktop AX script", "HammerSpoon claude-desktop" — no matches that do production-grade injection. Hammerspoon (Lua-based macOS scripting) could do it, but no published script targets Claude Desktop specifically. Cross-reference: the existing evidence file `claude-desktop-deep-links.md` also documents the URL scheme route, which is preferred over AX.

**Implication:** The AX-injection niche is open but unaddressed — the URL scheme is good enough for most plausible uses (text-only prompt seeding), and the AX path has no well-lit reference implementation for this category.

---

## Part 5: Bookmarklets and browser extensions

### Finding 5.1: The canonical "Open in Claude" bookmarklet uses the web URL `claude.ai/new?q=`
**Confidence:** CONFIRMED
**Evidence:** Vincent Schmalbach, ["Claude & ChatGPT Bookmarklets"](https://www.vincentschmalbach.com/claude-chatgpt-bookmarklets/) (accessed 2026-04-16). The canonical "Summarize selection with Claude" bookmarklet:

```javascript
javascript:(() => {
  const selectedText = window.getSelection().toString();
  if (selectedText) {
    const prompt = `Please summarize the following text in 3-5 key points:\n\n${selectedText}`;
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank');
  } else {
    alert('Please select some text first!');
  }
})();
```

Note it uses the **web URL** `https://claude.ai/new?q=...`, NOT the app scheme `claude://claude.ai/new?q=...`. On macOS this opens the default browser which then (if ChatGPT Atlas or Arc Boost is configured) may redirect into Claude Desktop; otherwise it stays in the browser. Only `window.location = 'claude://...'` (app scheme) would force the OS URL handler to route into Claude Desktop directly — but many browsers block or warn on navigation to non-http(s) schemes from a bookmarklet.

### Finding 5.2: The ChatGPT bookmarklet variant uses `chatgpt.com/?q=` with optional `&hints=`
**Confidence:** CONFIRMED
**Evidence:** Same Schmalbach article — the ChatGPT Web Page Analyzer bookmarklet:

```javascript
javascript:(() => {
  const currentUrl = window.location.href;
  window.open(`https://chatgpt.com/?hints=search&q=${encodeURIComponent(
    `Please visit and analyze this web page: ${currentUrl}...`
  )}`, '_blank');
})();
```

Parameter set: `q=` (prompt), `hints=search|canvas` (mode hint). Discoverable via the "Prompt ChatGPT via URL param" Chrome extension [chromewebstore.google.com/detail/prompt-chatgpt-via-url-pa/ebnjcbckimmadkpjkpkgfiobinjmmdjb](https://chromewebstore.google.com/detail/prompt-chatgpt-via-url-pa/ebnjcbckimmadkpjkpkgfiobinjmmdjb).

**Implication:** The **web** `chatgpt.com/?q=` works for the browser; the **app** `chatgpt://?q=` (custom scheme) does NOT — a direct contradiction that pushes the entire bookmarklet ecosystem toward `https://` URLs, which in turn means they open the browser, not the desktop app.

### Finding 5.3: Chrome-extension ecosystem for "Ask ChatGPT" context menu
**Confidence:** CONFIRMED
**Evidence:** Multiple extensions ship a right-click "Ask ChatGPT" menu:

- **ChatGPT Context Menu** — [chromewebstore.google.com/detail/chatgpt-context-menu/dgoglcakombnlehdkdoekncmcganjjid](https://chromewebstore.google.com/detail/chatgpt-context-menu/dgoglcakombnlehdkdoekncmcganjjid) — opens `chatgpt.com/?q=...` in a new tab with the selection.
- **RightClickGPT** — [github.com/SwiftHustle/RightClickGPT](https://github.com/SwiftHustle/RightClickGPT) — same pattern.
- **ChatGPT Shortcut — Open from the Address Bar** — [chromewebstore.google.com/detail/chatgpt-shortcut-open-fro/ppjhahkjaabkjgaoelbokpgleaoeeboa](https://chromewebstore.google.com/detail/chatgpt-shortcut-open-fro/ppjhahkjaabkjgaoelbokpgleaoeeboa) — address-bar keyword shortcut.
- **ChatGPT Deeplink** — [chrome-stats.com/d/bmkbpmkcppdmkdbpihmijgeilchgeapo](https://chrome-stats.com/d/bmkbpmkcppdmkdbpihmijgeilchgeapo).

All target `chatgpt.com` (web). None target the `chatgpt://` desktop scheme. A search for "open in claude desktop" Chrome extension returned zero matches; for "open in Cursor" context menu — also zero. This is an unfilled niche.

### Finding 5.4: react-grab uses clipboard handoff, not URL schemes
**Confidence:** CONFIRMED
**Evidence:** From the [react-grab README](https://github.com/aidenybai/react-grab) and [Better Stack guide](https://betterstack.com/community/guides/scaling-nodejs/react-grab-ai/): the user hovers an element, presses Cmd+C, and react-grab populates the clipboard with a structured `<selected_element>` block containing HTML frame + file/line/column Code Location. Users then manually paste into Cursor, Claude Code, Copilot — whichever coding agent they prefer.

**Implication:** react-grab is positioned differently from this report's subject: it's a *codebase-context-capture* tool that leaves the destination-app choice to the user via clipboard, not a *URL-scheme-driven desktop-app launcher*. The sibling subagent file `react-grab-and-similar-handoff-tools.md` covers this dimension in depth; referenced here to distinguish it from the bookmarklet + context-menu pattern.

---

## Part 6: Terminal / CLI handoff

### Finding 6.1: The canonical macOS `open` + URL-scheme one-liner
**Confidence:** CONFIRMED (widely documented pattern)
**Evidence:** `open(1)` on macOS dispatches to the registered URL-scheme handler. Brett Terpstra's ["Shell tricks: the OS X open command"](https://brettterpstra.com/2014/08/06/shell-tricks-the-os-x-open-command/) is the canonical reference. For the apps in scope:

```sh
# Claude Desktop — pipe stdin to a new chat
ask-claude() {
  local prompt
  if [ -t 0 ]; then prompt="$*"; else prompt="$(cat)"; fi
  local encoded
  encoded=$(printf '%s' "$prompt" | jq -sRr @uri)
  open "claude://claude.ai/new?q=$encoded"
}

# Codex Desktop — same pattern, different scheme + param
ask-codex() {
  local prompt; if [ -t 0 ]; then prompt="$*"; else prompt="$(cat)"; fi
  open "codex://new?prompt=$(printf '%s' "$prompt" | jq -sRr @uri)"
}

# Cursor — requires a confirmation dialog (hardened after CursorJack disclosure)
ask-cursor() {
  local prompt; if [ -t 0 ]; then prompt="$*"; else prompt="$(cat)"; fi
  open "cursor://anysphere.cursor-deeplink/prompt?text=$(printf '%s' "$prompt" | jq -sRr @uri)"
}
```

Real-world usage:

```sh
git diff HEAD | ask-claude "Review this diff"
echo "Explain ownership in Rust" | ask-codex
pbpaste | ask-cursor
```

### Finding 6.2: No canonical `pipe-to-chat` CLI tool has been published for this category
**Confidence:** MEDIUM (negative; exhaustive `github.com` search)
**Evidence:** Searches for `pipe-to-claude-desktop`, `stdin to chatgpt desktop`, `open-in-claude-cli`, `pipechat-desktop` returned no published tool as of 2026-04-16. `johnlindquist/a22d4171e56107b55d60db4a0e929fb3` is a gist for loading zsh functions into **Claude Code CLI** (terminal-binary), not the desktop app. `shellChatGPT` ([github.com/mountaineerbr/shellChatGPT](https://github.com/mountaineerbr/shellChatGPT)) and `gpt-cli` ([github.com/kharvd/gpt-cli](https://github.com/kharvd/gpt-cli)) wrap the OpenAI/Anthropic API directly and print to the terminal — they don't open the Desktop app.

**Implication:** The "pipe a file or git diff into Claude Desktop via stdin" ergonomic is a 6-line shell function every user reinvents. Nobody has wrapped it as a first-class `brew install pipe-to-claude` or `npx open-in-chatgpt` tool.

### Finding 6.3: Terminal CLI tools `claude` and `codex` are a different product category
**Confidence:** CONFIRMED
**Evidence:** `/Users/edwingomezcuellar/.local/bin/claude` (noted in the sibling `claude-desktop-deep-links.md` key-files list) is the **Claude Code CLI** — a terminal binary that takes a positional prompt and stays in the terminal. OpenAI's `codex` CLI ([cursor.com/docs/cli/overview](https://cursor.com/docs/cli/overview) is Cursor's CLI; OpenAI's is distinct) similarly stays in the terminal. Neither routes to the Desktop chat app by default. The Codex Desktop sibling file notes that `codex app` opens the desktop but has no `--prompt` flag; to seed a prompt, the `codex://new?prompt=...` URL form is still required.

---

## Part 7: ChatGPT Desktop and Perplexity Desktop URL-scheme details

### Finding 7.1: ChatGPT Desktop registers 3 URL schemes; none accepts a `?q=` prompt parameter
**Confidence:** CONFIRMED
**Evidence:** `Info.plist` probe:

```
$ plutil -extract CFBundleURLTypes xml1 -o - /Applications/ChatGPT.app/Contents/Info.plist
CFBundleURLSchemes:
  - "com.openai.chat"   (Auth0 callback, per Info.plist URL name)
  - "openai"
  - "chatgpt"
```

Binary-string probe for prompt-seeding patterns:

```
$ strings -a /Applications/ChatGPT.app/Contents/MacOS/ChatGPT | grep -E '\?q=|\?prompt=|newConversation|start-action'
_conversationId
_startAction
_temporaryChat
_useSearchGPT
performShortcutAction(source:useSearchGPT:startAction:temporaryChat:)
```

These strings correspond to the App Intents parameters (Part 2.1), not URL-scheme parameters. OpenAI Community thread [community.openai.com/t/.../1255168](https://community.openai.com/t/support-custom-url-schemes-or-intent-handlers-to-trigger-specific-behaviors-in-the-chatgpt-mobile-app/1255168) explicitly states: **"Currently, the ?q= parameter in URLs doesn't trigger the prompt or fill the input field inside the app"** — this is a standing **feature request** still open in April 2026.

**Implication:** For ChatGPT Desktop, the URL-scheme seam is useful ONLY for launching the app (not seeding a prompt). The only structured seed-a-prompt path is **App Intents / Shortcuts** (Part 2.1). Non-Shortcuts callers must fall back to the PopClip pattern (Part 5) — clipboard + `chatgpt://` + UI-scripted paste.

### Finding 7.2: ChatGPT's web URL `chatgpt.com/?q=<prompt>` does NOT auto-forward to ChatGPT Desktop
**Confidence:** CONFIRMED
**Evidence:** By observation and by the OpenAI Community feature-request thread. `https://chatgpt.com/?q=...` works inside the browser (populates the composer), but the OS does not automatically hand off `https://chatgpt.com/*` URLs to the Desktop app — that would require ChatGPT Desktop to register as a default handler for Universal Links to `chatgpt.com`, which `Info.plist` probing of `NSUserActivityTypes` / `com.apple.developer.associated-domains` would reveal, and which is not configured.

### Finding 7.3: Perplexity Desktop's `perplexity-app://` scheme is undocumented; format is not recoverable by binary probe
**Confidence:** PARTIAL
**Evidence:** `Info.plist` registers `perplexity-app` plus a Google OAuth callback scheme:

```
CFBundleURLSchemes:
  - "com.googleusercontent.apps.60244564555-tj0qf3ai5r6t8haufipuiqkt2ca6psr3"   (Google OAuth)
  - "perplexity-app"
```

Binary probe extracts URL-routing references but no `?q=` / `?query=` parameter literals that a host/path parser would normally embed:

```
$ strings -a /Applications/Perplexity.app/Contents/MacOS/Perplexity | grep -iE 'deeplink|handleDeepLink|newQuery|UberDeepLinkTool'
deeplink
deepLink
Failed to handle deeplink
handleDeepLink(_:originLocation:forwardedParams:)
handleSignInDeepLink(authToken:showOnboarding:)
isNewQuery
liveActivityLaunchedViaDeeplink
nativeDeepLinkURL(for:)
NewQueryIntent
OpenQueryDeepLinkIntent
OpenImageQueryDeepLinkIntent
OpenV2VDeepLinkIntent
UberDeepLinkTool                  ← note: this is an outbound handler (Perplexity deep-linking TO Uber)
URLHandlerRegistry
```

The `Open*DeepLinkIntent` identifiers + `isNewQuery` + `handleDeepLink` + `URLHandlerRegistry` are the App-Intents-backed handlers that the `perplexity-app://` scheme forwards into. But the path and parameter grammar is not emitted as raw string literals in the binary — it's almost certainly constructed via string interpolation from route literals that Swift stores in read-only data sections not picked up by `strings(1)`. Imrat's X post from 2024-10 ([x.com/imrat/status/1850487864179491090](https://x.com/imrat/status/1850487864179491090)) corroborates: **"Perplexity app has a deeplink URL schema — but right now its not documented, and i have not figured out how to use it."** Still accurate as of April 2026.

**Implication:** The practical path for driving Perplexity Desktop with a query is **App Intents / Shortcuts.app** (`AskPerplexityIntent(query)`), not the URL scheme. The URL scheme surface is reserved for internal launches, sign-in callbacks, and Apple Live Activities. Cross-reference: the same constraint is documented in the sibling file [routinehub/Raycast ecosystem](raycast-ecosystem.md) (created by another subagent) where Raycast's own Perplexity extension routes through Shortcuts, not a URL.

### Finding 7.4: Neither ChatGPT nor Perplexity ship a Desktop-app CLI
**Confidence:** CONFIRMED
**Evidence:** No `/usr/local/bin/chatgpt`, no `/usr/local/bin/perplexity`, no `chatgpt` / `perplexity` brew formulas for Desktop-forwarding CLI wrappers. OpenAI ships `codex` CLI (different product — stays in terminal); Anthropic ships `claude` CLI (Claude Code; different product). There is no `chatgpt` or `perplexity` binary that shells out to the Desktop app.

---

## Summary comparison table

| App | URL scheme | Prompt param in URL? | AppleScript dict | App Intents (Shortcuts) | CLI → Desktop |
|---|---|---|---|---|---|
| Claude Desktop | `claude://claude.ai/new?q=<prompt>` | **Yes** (`q`) | None | None | No |
| Codex Desktop | `codex://new?prompt=<p>&path=<p>&originUrl=<u>` | **Yes** (`prompt`) | None | None | `codex app` opens app but no `--prompt` flag |
| Cursor | `cursor://anysphere.cursor-deeplink/prompt?text=<p>&mode=<m>` | **Yes** (`text`), with confirmation dialog | None | None | Limited (`cursor .` opens a dir; no prompt flag) |
| ChatGPT Desktop | `chatgpt://`, `openai://`, `com.openai.chat://` (Auth0) | **No** (confirmed via binary probe + OpenAI Community) | None | **Yes — `AskIntent(prompt, newChat, continuous)`** | No |
| Perplexity Desktop | `perplexity-app://` + Google OAuth callback | **Undocumented** (path not recoverable) | None | **Yes — `AskPerplexityIntent(query)`** | No |

### Secondary matrix — handoff mechanism availability

| Mechanism | Claude | Codex | Cursor | ChatGPT | Perplexity |
|---|---|---|---|---|---|
| Native URL-scheme prompt seed | ✅ `?q=` | ✅ `?prompt=` | ✅ `?text=` (+ mode) | ❌ (URL scheme is launch-only) | ❌ (undocumented) |
| macOS Shortcuts (App Intents) | ❌ | ❌ | ❌ | ✅ `AskIntent` | ✅ `AskPerplexityIntent` |
| macOS Services menu (built-in) | ❌ | ❌ | ❌ | ❌ | ❌ |
| AppleScript dictionary (native) | ❌ | ❌ | ❌ | ❌ | ❌ |
| BTT/Alfred/KM shipped workflow that targets *the Desktop app* | None canonical | None canonical | None canonical | PopClip ext. (clipboard + UI-script) | PopClip ext. (same pattern) |
| Bookmarklet (canonical) | `https://claude.ai/new?q=...` | None published | None published | `https://chatgpt.com/?q=...` | `https://www.perplexity.ai/search/?q=...` |
| Terminal wrapper (canonical shipped tool) | None | None | None | None | None |

---

## Cross-file observations

- **URL-scheme-first vs App-Intents-first is the primary architectural fork.** Anthropic (Claude), OpenAI (Codex), and Anysphere (Cursor) all chose URL-scheme-first with a prompt parameter. OpenAI (ChatGPT) and Perplexity chose App-Intents-first — parseable, typed parameters; introspectable by Shortcuts.app; invokable via Siri. The URL-scheme path is broader (any process can invoke), but untyped; the App-Intents path is narrower (macOS-only, Shortcuts-visible) but typed and Siri-accessible.
- **None of these apps integrate with the macOS Services menu.** This is a surprising omission for a category whose UX centers on "work with the selection the user already has." The design pattern has existed since Mac OS X 10.0; registering via `NSServices` in `Info.plist` is a one-hour implementation.
- **None of these apps ships an AppleScript dictionary.** The AppleScript ecosystem is in decline industry-wide, but the absence is still notable — BBEdit, OmniFocus, Things, Drafts all ship rich dictionaries. Claude's "Computer Use" product category (apidog.com/blog/claude-computer-use/) arguably *supersedes* AppleScript as a philosophy (AI observes + drives the UI rather than the app exposing a scripting surface).
- **The "clipboard + URL scheme + UI-scripted paste" pattern is the canonical fallback** when the URL scheme doesn't accept a prompt parameter (ChatGPT today; likely Perplexity too until `perplexity-app://` is documented). See the PopClip ChatGPT App extension's `Config.ts` (Part 5 / Finding 3.4).
- **Bookmarklets overwhelmingly target the web URL (`https://…/?q=`) not the app scheme (`app://…/?q=`).** This is a browser-security tradeoff — many browsers block or warn on `window.location = 'claude://...'` triggered from a bookmarklet. The side effect is that bookmarklets open the browser, not the Desktop app, even when the Desktop-app scheme exists.

---

## Negative searches (documented absences)

- **No NSServices entry in any of the five apps' Info.plist.** Probed via `plutil -extract NSServices xml1 -o - …`; all returned empty.
- **No `.sdef` AppleScript dictionary in any of the five apps' Resources directory.** Probed via `ls /Applications/*.app/Contents/Resources/*.sdef`; no matches.
- **No canonical `brew`-installable CLI tool `pipe-to-claude-desktop` / `pipe-to-chatgpt-desktop`.** Searched GitHub and npm registries.
- **No Chrome / Firefox extension that adds "Open in Claude Desktop" right-click.** All found extensions target the web (`chatgpt.com/?q=` / `claude.ai/new?q=`).
- **No widely-distributed Automator `.workflow` bundle** for "Send selection to Claude/ChatGPT/Cursor Desktop." Only how-to blog posts.
- **No Alfred Gallery workflow** named "Open in Claude Desktop" / "Open in Codex" / "Open in Cursor". The gallery has API-wrapping workflows instead.
- **No Keyboard Maestro canonical `.kmmacros` bundle** for the same handoff. Forum posts share inline copy-paste patterns.
- **No Hammerspoon / AppleScript script that injects prompts into a running Claude Desktop composer via accessibility APIs.**
- **No public documentation of `perplexity-app://` URL path + parameter grammar.** Imrat's X post (2024-10) still accurate in April 2026.
- **`chatgpt://?q=<prompt>` does NOT seed the composer** — confirmed by binary probe and standing OpenAI Community feature request.

---

## Gaps and follow-ups

1. **Perplexity URL-scheme path reverse-engineering.** The `perplexity-app://` URL grammar is recoverable by attaching `lldb` to the running Perplexity process, breakpointing on `Perplexity.URLHandlerRegistry.handleDeepLink(_:originLocation:forwardedParams:)`, and calling `open 'perplexity-app://'` with candidate paths (`/search?q=...`, `/query?text=...`, `/new?q=...`). Out of scope for this read-only probe.
2. **Does `claude://claude.ai/new?q=` accept attachments or a system prompt?** The router code only parses `q`. Richer seeding (file URI, model=, system=) is unaddressed. Worth testing `&system=...` / `&model=opus-4-6` in a separate probe.
3. **Is there a product opportunity to ship a canonical `@open-knowledge/open-in-ai` npm package** that wraps `open 'claude://...'` / `open 'codex://...'` / `open 'cursor://...'` / Shortcuts delegation for ChatGPT + Perplexity? The "clipboard + URL scheme + fallback" fan-out logic is sufficiently nontrivial (5 apps, 3 mechanisms, parameter-name mismatch) that a shared lib would amortize across consumers — our own `react-grab`-style tools, any third-party "hand off to my agent" tool.
4. **macOS Services menu as the missing category-standard UX.** Adding `NSServices` with `NSSendTypes: [NSStringPboardType]` + a route into `claude://claude.ai/new?q=%selection%` would take any of these vendors ~1 hour to ship and permanently unify the "right-click → Send to Claude" UX across every macOS app. No vendor has done this; it's a low-cost high-leverage gap.
5. **Shortcuts.app as a second-best surface for Claude/Codex/Cursor.** Implementing 2-3 App Intents (`OpenNewChatIntent(prompt, systemPrompt, attachment)`) would give Claude/Codex/Cursor the same Siri / automation surface ChatGPT and Perplexity already have. The absence is an interoperability gap worth flagging in any spec that aims at category-wide handoff standards.
