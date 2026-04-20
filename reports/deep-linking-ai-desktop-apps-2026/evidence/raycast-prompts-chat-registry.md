# Evidence: Raycast prompts-chat Extension — 28-Platform Registry Deep Dive

**Dimension:** D6 extension — Raycast ecosystem deep dive (continuation of `raycast-ecosystem.md`)
**Date:** 2026-04-16
**Sources:** `github.com/raycast/extensions/tree/main/extensions/prompts-chat` @ commit `870667f` (HEAD of `main` as of this evidence pass)

---

## Key sources

- Registry + buildUrl: `github.com/raycast/extensions/blob/main/extensions/prompts-chat/src/utils.ts`
- Handoff UI + clipboard fallback: `github.com/raycast/extensions/blob/main/extensions/prompts-chat/src/components/run-prompt.tsx`
- Manifest (commands, preferences): `github.com/raycast/extensions/blob/main/extensions/prompts-chat/package.json`
- Changelog (initial ship date, recent fixes): `github.com/raycast/extensions/blob/main/extensions/prompts-chat/CHANGELOG.md`
- Commits touching the extension: `gh api repos/raycast/extensions/commits?path=extensions/prompts-chat`
  - `ee79688` 2026-01-26 — initial ship by Fatih Kadir Akın (author of `awesome-chatgpt-prompts`, ~100K GitHub stars on upstream)
  - `6773e34` 2026-03-30 — API field rename fix (`content → contentPreview`)
  - `870667f` 2026-04-03 — vulnerability sweep across all extensions (not prompts-chat-specific)

---

## Finding 1: The extension's manifest and surface area

**Confidence:** CONFIRMED
**Evidence:** `extensions/prompts-chat/package.json`

Five commands, all `mode: "view"`, no command-level arguments. The handoff picker is an internal navigation destination (`PlatformList`), not a top-level command:

```json
{
  "name": "prompts-chat",
  "title": "Prompts.chat",
  "author": "fka",
  "platforms": ["macOS"],
  "commands": [
    { "name": "search-prompts",    "title": "Search Prompts",    "mode": "view" },
    { "name": "browse-prompts",    "title": "Browse Prompts",    "mode": "view" },
    { "name": "random-prompt",     "title": "Random Prompt",     "mode": "view" },
    { "name": "download-prompts",  "title": "Download All Prompts", "mode": "view" },
    { "name": "browse-categories", "title": "Browse Categories", "mode": "view" }
  ],
  "preferences": [
    {
      "name": "baseUrl",
      "title": "Base URL",
      "type": "textfield",
      "default": "https://prompts.chat",
      "required": false
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.104.1",
    "@raycast/utils": "^1.19.1"
  }
}
```

Notable: the only preference is the **prompts.chat instance URL** (for self-hosted forks). There is **no "default AI platform" preference** — every handoff goes through the full 28-platform picker every time. Raycast Action history provides the "sticky selection" UX.

`platforms: ["macOS"]` — macOS-only. This matches Raycast's platform scope; it's not a prompts-chat choice per se but limits where deep links are exercised.

---

## Finding 2: The full platform registry — all 28 entries, verbatim

**Confidence:** CONFIRMED
**Evidence:** `extensions/prompts-chat/src/utils.ts:45-205`

The registry is split into four arrays. **Actual count: 28 platforms** (17 chat + 9 code + 1 image + 1 video). The README's "25+" and CHANGELOG's "25+" are marketing rounding; the exact count on `main` @ 870667f is 28. Only 4 entries carry `isDeeplink: true`.

### The `Platform` shape

```typescript
export interface Platform {
  id: string;
  name: string;
  baseUrl: string;
  supportsQuerystring: boolean;
  isDeeplink?: boolean;
}
```

`supportsQuerystring` is the **primary branching flag** — it determines whether the handoff goes through `buildUrl()` or falls back to "copy + open". `isDeeplink` is metadata only (carried for the 4 custom-scheme entries); it is **never read** anywhere in the codebase (`grep isDeeplink` in `src/` returns only the type-definition site and the four assignments). In practice `isDeeplink` is a documentation marker, not a runtime branch — the runtime branch is `supportsQuerystring`.

### 2a. `chatPlatforms` — 17 entries (utils.ts:47-122)

```typescript
export const chatPlatforms: Platform[] = [
  { id: "chatgpt",     name: "ChatGPT",            baseUrl: "https://chatgpt.com",                supportsQuerystring: true  },
  { id: "claude",      name: "Claude",             baseUrl: "https://claude.ai/new",              supportsQuerystring: true  },
  { id: "copilot",     name: "Microsoft Copilot",  baseUrl: "https://copilot.microsoft.com",      supportsQuerystring: false },
  { id: "deepseek",    name: "DeepSeek",           baseUrl: "https://chat.deepseek.com",          supportsQuerystring: false },
  { id: "fal",         name: "fal.ai Sandbox",     baseUrl: "https://fal.ai/sandbox",             supportsQuerystring: true  },
  { id: "gemini",      name: "Gemini",             baseUrl: "https://gemini.google.com/app",      supportsQuerystring: false },
  { id: "goose-chat",  name: "Goose",              baseUrl: "goose://recipe",                     supportsQuerystring: true, isDeeplink: true },
  { id: "grok",        name: "Grok",               baseUrl: "https://grok.com/chat?reasoningMode=none", supportsQuerystring: true },
  { id: "huggingface", name: "HuggingChat",        baseUrl: "https://huggingface.co/chat",        supportsQuerystring: true  },
  { id: "llama",       name: "Meta AI",            baseUrl: "https://www.meta.ai",                supportsQuerystring: false },
  { id: "manus",       name: "Manus",              baseUrl: "https://manus.im/app",               supportsQuerystring: false },
  { id: "mistral",     name: "Le Chat",            baseUrl: "https://chat.mistral.ai/chat",       supportsQuerystring: true  },
  { id: "perplexity",  name: "Perplexity",         baseUrl: "https://www.perplexity.ai",          supportsQuerystring: true  },
  { id: "phind",       name: "Phind",              baseUrl: "https://www.phind.com",              supportsQuerystring: true  },
  { id: "pi",          name: "Pi",                 baseUrl: "https://pi.ai",                      supportsQuerystring: false },
  { id: "poe",         name: "Poe",                baseUrl: "https://poe.com",                    supportsQuerystring: false },
  { id: "you",         name: "You.com",            baseUrl: "https://you.com",                    supportsQuerystring: true  },
];
```

Note contradiction: `grok` is declared with `supportsQuerystring: true` but its `baseUrl` already ends in `?reasoningMode=none`. The `buildUrl` branch for `grok` uses `&q=${encoded}` (ampersand, not `?`) — a deliberate pre-existing query-string extension. This is the **only** platform that pre-specifies a URL parameter in its `baseUrl` and relies on `buildUrl` appending with `&`.

### 2b. `codePlatforms` — 9 entries (utils.ts:124-165)

```typescript
export const codePlatforms: Platform[] = [
  { id: "windsurf",         name: "Windsurf",         baseUrl: "windsurf://",
    supportsQuerystring: false, isDeeplink: true },
  { id: "cursor",           name: "Cursor",           baseUrl: "cursor://anysphere.cursor-deeplink/prompt",
    supportsQuerystring: true,  isDeeplink: true },
  { id: "vscode",           name: "VS Code",          baseUrl: "vscode://",
    supportsQuerystring: false, isDeeplink: true },
  { id: "vscode-insiders",  name: "VS Code Insiders", baseUrl: "vscode-insiders://",
    supportsQuerystring: false, isDeeplink: true },
  { id: "github-copilot",   name: "GitHub Copilot",   baseUrl: "https://github.com/copilot",
    supportsQuerystring: true  },
  { id: "bolt",             name: "Bolt",             baseUrl: "https://bolt.new",
    supportsQuerystring: true  },
  { id: "lovable",          name: "Lovable",          baseUrl: "https://lovable.dev",
    supportsQuerystring: true  },
  { id: "v0",               name: "v0",               baseUrl: "https://v0.dev/chat",
    supportsQuerystring: true  },
  { id: "ai2sql",           name: "AI2SQL",           baseUrl: "https://builder.ai2sql.io/dashboard/builder-all-lp?tab=generate",
    supportsQuerystring: true  },
];
```

`ai2sql` has the same "pre-existing query string" trick as `grok`: its `baseUrl` already carries `?tab=generate`, and `buildUrl` appends `&prompt=` rather than `?prompt=`.

### 2c. `imagePlatforms` — 1 entry (utils.ts:168-174)

```typescript
export const imagePlatforms: Platform[] = [
  { id: "mitte-image", name: "Mitte.ai (Image)", baseUrl: "https://mitte.ai", supportsQuerystring: true },
];
```

### 2d. `videoPlatforms` — 1 entry (utils.ts:177-183)

```typescript
export const videoPlatforms: Platform[] = [
  { id: "mitte-video", name: "Mitte.ai (Video)", baseUrl: "https://mitte.ai", supportsQuerystring: true },
];
```

`imagePlatforms` and `videoPlatforms` are conditionally rendered based on `prompt.type === "IMAGE" | "VIDEO"` (see Finding 4). Both delegate to `mitte.ai?prompt=` — a third-party image/video model playground.

### 2e. Consolidated registry table

| # | ID | Name | Group | baseUrl | Scheme | `supportsQuerystring` | `isDeeplink` | buildUrl branch |
|---|---|---|---|---|---|---|---|---|
| 1 | `chatgpt` | ChatGPT | chat | `https://chatgpt.com` | https | true | — | `${baseUrl}/?q=${encoded}` |
| 2 | `claude` | Claude | chat | `https://claude.ai/new` | https | true | — | `${baseUrl}?q=${encoded}` |
| 3 | `copilot` | Microsoft Copilot | chat | `https://copilot.microsoft.com` | https | **false** | — | clipboard fallback |
| 4 | `deepseek` | DeepSeek | chat | `https://chat.deepseek.com` | https | **false** | — | clipboard fallback (but `deepseek` *has* a buildUrl case — **dead code**, see §3 note) |
| 5 | `fal` | fal.ai Sandbox | chat | `https://fal.ai/sandbox` | https | true | — | `${baseUrl}?prompt=${encoded}` |
| 6 | `gemini` | Gemini | chat | `https://gemini.google.com/app` | https | **false** | — | clipboard fallback |
| 7 | `goose-chat` | Goose | chat | `goose://recipe` | **goose://** | true | **true** | base64 JSON config in `?config=` |
| 8 | `grok` | Grok | chat | `https://grok.com/chat?reasoningMode=none` | https | true | — | `${baseUrl}&q=${encoded}` (ampersand) |
| 9 | `huggingface` | HuggingChat | chat | `https://huggingface.co/chat` | https | true | — | `${baseUrl}/?prompt=${encoded}` |
| 10 | `llama` | Meta AI | chat | `https://www.meta.ai` | https | **false** | — | clipboard fallback |
| 11 | `manus` | Manus | chat | `https://manus.im/app` | https | **false** | — | clipboard fallback |
| 12 | `mistral` | Le Chat | chat | `https://chat.mistral.ai/chat` | https | true | — | `${baseUrl}?q=${encoded}` |
| 13 | `perplexity` | Perplexity | chat | `https://www.perplexity.ai` | https | true | — | `${baseUrl}/search?q=${encoded}` |
| 14 | `phind` | Phind | chat | `https://www.phind.com` | https | true | — | `${baseUrl}/search?q=${encoded}` |
| 15 | `pi` | Pi | chat | `https://pi.ai` | https | **false** | — | clipboard fallback |
| 16 | `poe` | Poe | chat | `https://poe.com` | https | **false** | — | clipboard fallback (but `poe` *has* a buildUrl case — **dead code**) |
| 17 | `you` | You.com | chat | `https://you.com` | https | true | — | `${baseUrl}/search?q=${encoded}` |
| 18 | `windsurf` | Windsurf | code | `windsurf://` | **windsurf://** | **false** | **true** | clipboard fallback (scheme opens the app, user pastes) |
| 19 | `cursor` | Cursor | code | `cursor://anysphere.cursor-deeplink/prompt` | **cursor://** | true | **true** | `${baseUrl}?text=${encoded}` |
| 20 | `vscode` | VS Code | code | `vscode://` | **vscode://** | **false** | **true** | clipboard fallback |
| 21 | `vscode-insiders` | VS Code Insiders | code | `vscode-insiders://` | **vscode-insiders://** | **false** | **true** | clipboard fallback |
| 22 | `github-copilot` | GitHub Copilot | code | `https://github.com/copilot` | https | true | — | `${baseUrl}?prompt=${encoded}` |
| 23 | `bolt` | Bolt | code | `https://bolt.new` | https | true | — | `${baseUrl}?prompt=${encoded}` |
| 24 | `lovable` | Lovable | code | `https://lovable.dev` | https | true | — | `${baseUrl}/?autosubmit=true#prompt=${encoded}` (fragment, not query) |
| 25 | `v0` | v0 | code | `https://v0.dev/chat` | https | true | — | `${baseUrl}?q=${encoded}` |
| 26 | `ai2sql` | AI2SQL | code | `https://builder.ai2sql.io/dashboard/builder-all-lp?tab=generate` | https | true | — | `${baseUrl}&prompt=${encoded}` (ampersand) |
| 27 | `mitte-image` | Mitte.ai (Image) | image | `https://mitte.ai` | https | true | — | `${baseUrl}?prompt=${encoded}` |
| 28 | `mitte-video` | Mitte.ai (Video) | video | `https://mitte.ai` | https | true | — | `${baseUrl}?prompt=${encoded}` |

**Tallies:**
- **Web URL with query/fragment autofill:** 20 of 28 (71%)
- **Custom desktop scheme with URL payload:** 2 of 28 — `cursor://` (text param), `goose://recipe` (base64 config)
- **Custom desktop scheme that opens app only, clipboard fallback:** 3 of 28 — `windsurf://`, `vscode://`, `vscode-insiders://`
- **Web URL that opens landing page only, clipboard fallback:** 6 of 28 — `copilot`, `deepseek`, `gemini`, `llama`, `manus`, `pi`, `poe` (actually 7 — so total fallback is **10 of 28**; see §4)
- **Param name distribution:** `q` (8 platforms) > `prompt` (8) > none/clipboard (10) > `text` (1 — Cursor) > `config` (1 — Goose, base64)

---

## Finding 3: buildUrl() function verbatim

**Confidence:** CONFIRMED
**Evidence:** `extensions/prompts-chat/src/utils.ts:185-244`

```typescript
export function buildUrl(
  platformId: string,
  baseUrl: string,
  promptText: string,
  promptTitle?: string,
  promptDescription?: string,
): string {
  const encoded = encodeURIComponent(promptText);

  switch (platformId) {
    // IDE deeplinks
    case "cursor":
      return `${baseUrl}?text=${encoded}`;
    case "goose":
    case "goose-chat": {
      const config = JSON.stringify({
        version: "1.0.0",
        title: promptTitle || "Prompt",
        description: promptDescription || "",
        instructions:
          "This is a prompt imported from prompts.chat. Follow the instructions below to complete the task.",
        prompt: promptText,
        activities: [
          "message:This prompt was imported from prompts.chat. Follow the instructions below to complete the task.",
          "Do it now",
          "Learn more about the instructions",
        ],
      });
      const base64Config = Buffer.from(config).toString("base64");
      return `${baseUrl}?config=${base64Config}`;
    }
    // Web platforms
    case "ai2sql":       return `${baseUrl}&prompt=${encoded}`;
    case "bolt":         return `${baseUrl}?prompt=${encoded}`;
    case "chatgpt":      return `${baseUrl}/?q=${encoded}`;
    case "claude":       return `${baseUrl}?q=${encoded}`;
    case "copilot":      return `${baseUrl}/?q=${encoded}`;
    case "deepseek":     return `${baseUrl}/?q=${encoded}`;
    case "github-copilot": return `${baseUrl}?prompt=${encoded}`;
    case "grok":         return `${baseUrl}&q=${encoded}`;
    case "fal":          return `${baseUrl}?prompt=${encoded}`;
    case "huggingface":  return `${baseUrl}/?prompt=${encoded}`;
    case "lovable":      return `${baseUrl}/?autosubmit=true#prompt=${encoded}`;
    case "mistral":      return `${baseUrl}?q=${encoded}`;
    case "perplexity":   return `${baseUrl}/search?q=${encoded}`;
    case "phind":        return `${baseUrl}/search?q=${encoded}`;
    case "poe":          return `${baseUrl}/?q=${encoded}`;
    case "v0":           return `${baseUrl}?q=${encoded}`;
    case "you":          return `${baseUrl}/search?q=${encoded}`;
    case "mitte-image":
    case "mitte-video":  return `${baseUrl}?prompt=${encoded}`;
    default:             return `${baseUrl}?q=${encoded}`;
  }
}
```

**Shape observations:**

1. **Per-platform case branching, single shared encoder.** Every branch uses the same `encodeURIComponent(promptText)` and differs only in (a) which param name to use, (b) path suffix (`/search`, `/`), (c) query prefix (`?` vs `&`), and (d) special encoders (Goose's base64 JSON).

2. **Signature carries title + description as optional extras.** Only Goose uses them today — they're encoded into its `config` JSON blob so the recipe has human-readable metadata when it loads in the Goose desktop app.

3. **The `default` fallback is `?q=`.** This is the de-facto convention. Any new platform added to the array without a case added to the switch will work as long as the target site accepts `?q=`. ChatGPT, Claude, Gemini, Bing, and Kagi all use `?q=`, making this a reasonable default.

4. **Dead-code cases.** `deepseek` and `poe` are both declared with `supportsQuerystring: false` in their Platform definitions, so control flow in `run-prompt.tsx` never reaches `buildUrl` for them — their case branches never execute. Likely historical: at some point they supported a query-string API and the flag was flipped when that stopped working, but the case branches were left. Similarly the `case "goose":` fallthrough label is unused (no Platform has `id: "goose"`; it's `"goose-chat"`).

5. **No URL-length logic in `buildUrl`.** No `if (url.length > N) return null` branch. No server-side size check. The function unconditionally emits the URL regardless of prompt size. URL-length handling is **not** a concern in this registry — see §5.

6. **No special handling of newlines, quotes, or markdown.** `encodeURIComponent` percent-encodes everything including `\n` → `%0A`, `"` → `%22`, `#` → `%23`. Each target site is expected to decode these back. The `lovable` fragment variant (`#prompt=`) does the same.

7. **Cursor's deep link is `cursor-deeplink/prompt?text=...`.** Not the `cursor://prompt?text=...` variant seen in some docs. This matches Cursor's published URL-scheme spec (anysphere is Cursor's publisher).

8. **Goose uses base64-encoded JSON configs.** Unique in the registry — Goose treats the deep link as a *recipe import*, not just a prompt. The JSON carries `version`, `title`, `description`, `instructions`, `prompt`, and `activities[]` (a suggested-action list the Goose UI renders as quick replies). This is closer to an MCP-install URL in spirit than to a `?q=` prompt handoff.

---

## Finding 4: Clipboard-paste fallback mechanism

**Confidence:** CONFIRMED
**Evidence:** `extensions/prompts-chat/src/components/run-prompt.tsx:98-121`

The fallback is **user-visible "copy + open + paste yourself"** — not PopClip-style simulated paste. Exact code:

```typescript
async function handleRun(platform: Platform) {
  if (platform.supportsQuerystring) {
    const url = buildUrl(
      platform.id,
      platform.baseUrl,
      content,
      prompt.title,
      prompt.description || undefined,
    );
    await open(url);
    await showToast({
      style: Toast.Style.Success,
      title: `Opening in ${platform.name}`,
    });
  } else {
    await Clipboard.copy(content);
    await open(platform.baseUrl);
    await showToast({
      style: Toast.Style.Success,
      title: "Prompt copied!",
      message: `Opening ${platform.name}... Paste with ⌘V`,
    });
  }
  await popToRoot();
}
```

**Key observations:**

1. **Three-step sequence on the fallback path:** `Clipboard.copy(content)` → `open(baseUrl)` → toast with instruction to press ⌘V. No `accessibility API` calls, no AppleScript, no `osascript -e 'tell application ... keystroke ...'`. The user performs the final paste.

2. **Compare against PopClip model (see `react-grab-and-similar-handoff-tools.md`).** PopClip's "Send to app" actions use an AppleScript/Accessibility API bridge to simulate ⌘V after a focus window is detected. `prompts-chat` deliberately avoids that — likely because Raycast extensions can't request Accessibility permissions, and because the user's active window after `open()` is racy on slow-launching apps.

3. **Bundle-id launching is NOT used.** The `open()` call is passed `baseUrl` as-is — a `windsurf://` URL, not `-na Windsurf`. macOS `open` handles URL-scheme-to-app lookup via `LSHandlers`. There is no `execFile("open", ["-na", appName, url])` anywhere in the codebase. For `vscode://` with no path, this launches VS Code to its default state (last-opened folder or welcome screen) — the prompt is on the clipboard awaiting manual paste into the chat panel.

4. **The `isDeeplink` metadata is NEVER consulted in this logic.** The branch purely reads `platform.supportsQuerystring`. This means Windsurf (deeplink, no querystring) and Microsoft Copilot (web URL, no querystring) flow through the exact same clipboard-fallback code path — only the opened URL differs.

5. **`popToRoot()` at the end.** After the handoff, the Raycast window dismisses and returns to root. No post-action tracking, no telemetry. This is the standard Raycast handoff pattern.

6. **Accessory icons communicate the capability to the user** (`run-prompt.tsx:136-139`):

```typescript
accessories={[
  platform.supportsQuerystring
    ? { icon: Icon.Play, tooltip: "Auto-fill supported" }
    : { icon: Icon.Clipboard, tooltip: "Will copy to clipboard" },
]}
```

Every row in the platform picker carries either a ▶ (auto-fill) or 📋 (copy) badge. This is a nice UX primitive — the user sees *before* hitting Enter which platforms will fully auto-populate vs. which will require manual paste.

### 4a. Platforms that fall back to clipboard (`supportsQuerystring: false`)

10 of 28 platforms use this path:

| Platform | baseUrl on open | Why fallback |
|---|---|---|
| Microsoft Copilot | `https://copilot.microsoft.com` | Landing page — no documented prompt query param |
| DeepSeek | `https://chat.deepseek.com` | Landing page — auth-gated |
| Gemini | `https://gemini.google.com/app` | Google's chat UI ignores `?q=` |
| Meta AI | `https://www.meta.ai` | Landing page |
| Manus | `https://manus.im/app` | App shell, no prompt param |
| Pi | `https://pi.ai` | Landing page — stateful session model |
| Poe | `https://poe.com` | Bot-selector landing page |
| Windsurf | `windsurf://` | Scheme launches app; no URL params supported |
| VS Code | `vscode://` | Scheme launches VS Code; no generic "paste into chat" URL |
| VS Code Insiders | `vscode-insiders://` | Same as VS Code |

The fallback is the *graceful degradation* path. It's not a "we're not sure if it works" fallback — it's what you ship when a target platform genuinely has no URL-level prompt API. Every one of these 10 entries required a deliberate `false` decision by the maintainer.

---

## Finding 5: URL-length handling + encoding details

**Confidence:** CONFIRMED
**Evidence:** `extensions/prompts-chat/src/utils.ts` (entire file); absence grep for length/limit/truncate

**There is no URL-length cap.** No `MAX_URL_LENGTH` constant, no `if (url.length > 8192)` branch, no `truncate(content, N)` anywhere in the extension. `buildUrl` emits whatever `encodeURIComponent` produces. Prompts on prompts.chat are typically paragraph-length so this rarely hits a practical limit, but there is no safety net.

**Practical limits on the targets (from prior-art reports):**
- Safari: ~80k URL cap
- Chrome: ~32k URL cap
- macOS `open` via `LaunchServices`: no documented hard cap, but custom URL schemes typically buffer ~2KB
- Windsurf/Cursor/VS Code: document this varies; Cursor's `?text=` has been reported to accept 50+ KB

**Encoding strategy:**
- Single `encodeURIComponent` pass — encodes RFC 3986 reserved characters (`! * ' ( ) ; : @ & = + $ , / ? # [ ]`) and UTF-8 bytes
- Percent-encoding only; no base64 variant except for Goose's config blob
- No smart detection of "does this prompt contain chars that would break" — uniform encoding for every platform
- Newlines become `%0A`, which web sites generally handle (ChatGPT, Claude, Perplexity all reconstitute them). IDE schemes may not — e.g. Cursor has been reported to strip newlines on some versions

**Goose's special case:**
```typescript
const base64Config = Buffer.from(config).toString("base64");
return `${baseUrl}?config=${base64Config}`;
```
Uses Node's `Buffer.from(...).toString("base64")` — standard base64, not URL-safe (contains `+ /`). Goose's deep-link scheme evidently accepts standard base64 without URL-safe substitution. The base64 payload is not further `encodeURIComponent`'d, meaning a `+` in the base64 would be interpreted as a space by a strict parser. This is likely fine for Goose's specific parser but is a latent bug if any consumer uses standard RFC 3986 decoding.

---

## Finding 6: Related Raycast extensions (one-line inventory)

**Confidence:** PARTIAL (inventory only, not deep-dive)
**Evidence:** `github.com/raycast/extensions` directory listing + code search

Searches for `isDeeplink` and `cursor-deeplink` in the Raycast extensions monorepo yielded only two matches outside `prompts-chat`:

- `extensions/open-path/src/utils/` — utility for opening paths; uses the word "deeplink" but for a VS Code-family file-open feature, not a prompt handoff registry. Not a multi-AI registry.
- `extensions/cursor-agents/src/list-agents.tsx` — Cursor background-agents viewer. Mentions `cursor-deeplink` because it builds `cursor://anysphere.cursor-deeplink/open-agent?id=...` URLs. Single-platform, agent-list-specific. Not a multi-AI registry.

Broader AI-extension inventory via directory listing (non-exhaustive, trigger-word filter):

| Extension | One-line |
|---|---|
| `chatgpt` | Official Raycast-integrated ChatGPT chat; not a multi-AI handoff registry — runs ChatGPT inline |
| `chatgpt-search` | ChatGPT web-search flavor; single-platform |
| `chatgpt-quick-actions` | Preset ChatGPT prompts; single-platform |
| `chatgpt-atlas` | OpenAI Atlas browser handoff (see `raycast-ecosystem.md` §OpenAI-Atlas) — one platform |
| `browser-ai` | Opens a URL in the AI-enabled "The Browser Company" Arc/Atlas-family app; one platform |
| `ai-gen` | Raycast AI one-shot text generator; not a registry |
| `chatwith` | Third-party Chatwith platform; single-platform |
| `alice-ai` | Alice (open-source AI desktop); single-platform |
| `bibigpt-summarize-audiovideo-with-ai` | One-tool BibiGPT summarizer; single-platform |
| `charming-chatgpt` | ChatGPT variant; single-platform |
| `chatgpt3-prompt` | Older ChatGPT/GPT-3 prompt collection; possibly registry-like but unmaintained |
| `chatgo`, `chatbase` | Third-party platforms; single-platform each |

None of these other extensions carry a multi-provider registry comparable to `prompts-chat`. The closest known neighbor is **`ask-anybody`** (covered in `raycast-ecosystem.md`), which from the prior evidence had ~10 platforms. `prompts-chat` at 28 is the largest registry in the Raycast store by a substantial margin.

---

## Comparison with Mintlify's 7-provider switch

| Provider | Mintlify (`setInChat.tsx`) | prompts-chat | Notes |
|---|---|---|---|
| ChatGPT | ✓ `chatgpt.com/?hints=...&prompt=...` | ✓ `chatgpt.com/?q=` | Mintlify uses `hints+prompt`, prompts-chat uses `q`. Both work. |
| Claude | ✓ `claude.ai/new?q=` | ✓ `claude.ai/new?q=` | Identical |
| Perplexity | ✓ `perplexity.ai/search?q=` | ✓ `perplexity.ai/search?q=` | Identical |
| Copy-MD (clipboard) | ✓ | — | Mintlify exposes raw MD copy as an option; prompts-chat doesn't (it copies compiled prompt when falling back) |
| Copy Page (URL) | ✓ | — | Mintlify-specific — copies the page URL |
| View Markdown | ✓ | — | Mintlify-specific — opens `/.md` view |
| MCP (install) | ✓ (deep link to register MCP) | — | Mintlify targets docs MCP install; prompts-chat has no MCP-install path |
| Cursor | — | ✓ `cursor://anysphere.cursor-deeplink/prompt?text=` | prompts-chat only |
| Windsurf | — | ✓ `windsurf://` (clipboard fallback) | prompts-chat only |
| VS Code / Insiders | — | ✓ `vscode://` / `vscode-insiders://` | prompts-chat only |
| Goose | — | ✓ `goose://recipe?config=<base64>` | prompts-chat only — unique base64-JSON recipe pattern |
| GitHub Copilot | — | ✓ `github.com/copilot?prompt=` | prompts-chat only |
| Bolt, Lovable, v0 | — | ✓ (three code-gen platforms) | prompts-chat only |
| Gemini, DeepSeek, Grok, Meta AI, Pi, Poe, HuggingChat, You.com, Le Chat, Phind, Manus, fal.ai, AI2SQL | — | ✓ (13 more chat platforms) | prompts-chat only |
| Mitte (image/video) | — | ✓ `mitte.ai?prompt=` | prompts-chat only |

**Overlap:** 3 platforms (ChatGPT, Claude, Perplexity).
**Mintlify-unique:** 4 actions — but 3 of those are docs-site-centric (copy page URL, view MD, copy raw MD), and 1 (MCP install) is a genuinely different *kind* of handoff.
**prompts-chat-unique:** 25 platforms, including all IDE deep links, most "second-tier" chat models, and all code-gen platforms.

**Pattern divergence:**
- **Mintlify bakes platform-specific hints into the URL** (`hints=...&prompt=...` for ChatGPT, likely contextualizing the conversation with "you are viewing Mintlify docs"). `prompts-chat` treats the prompt as **opaque** — whatever content the user selected flows verbatim.
- **Mintlify ships ChatGPT/Claude/Perplexity as *default UX affordances*** — not an arbitrary long list. A docs site only needs a handful of destinations; a prompt-library tool wants breadth. This is a shape choice driven by product purpose.
- **Mintlify has MCP-install URLs; prompts-chat doesn't.** Mintlify's handoff target includes "install the docs MCP server in your Claude/Cursor/Windsurf" — a structurally different deep-link shape than "paste this prompt into the chat." `prompts-chat` has no analog because its unit of handoff is a prompt, not a server/tool.

---

## Patterns applicable to Open Knowledge

1. **Follow the `supportsQuerystring` boolean pattern as the primary branch.** Every platform entry should have an explicit flag that says "can I auto-fill this target?" — not inferred from URL shape or attempted and caught. The user sees the capability *upfront* via an accessory icon (▶ vs 📋). This is the most important UX primitive in the extension; we should replicate it verbatim.

2. **`?q=` is the safe default.** Of 18 querystring-capable platforms in `prompts-chat`, 8 use `q` (ChatGPT, Claude, Copilot, DeepSeek, Grok, Mistral, Perplexity, Phind, Poe, v0, You) — including every one of the big four chat UIs. `prompt` is the second-most-common (8 platforms: Bolt, fal, GitHub Copilot, Hugging Face, Lovable, Mitte image/video, AI2SQL). Open Knowledge should canonicalize **`?q=` as the default** and list the two-name convention explicitly — a `buildUrl(platform, content)` fallback of `${baseUrl}?q=${encodeURIComponent(content)}` will work for any target that follows this standard.

3. **Use clipboard+open as the degradation path, not the primary.** When a target genuinely lacks URL-level prompt support, `Clipboard.copy + open(app) + toast("paste with ⌘V")` is the strictly more conservative choice than "simulate paste via Accessibility API." The user knows the app has the content; the user performs the final gesture. No focus races, no permission prompts, no AppleScript. Ship this for OK's fallback to Copilot/Gemini/Meta/Pi.

4. **Categorize the registry by domain, not a flat list.** `prompts-chat` splits into `chatPlatforms / codePlatforms / imagePlatforms / videoPlatforms` and conditionally renders based on the prompt's `type`. For OK, the equivalent grouping is "AI assistants" vs "IDEs" vs "code-gen tools" — and OK wiki pages would map predominantly to the chat platforms group. This enables the future "Open in…" picker to show *relevant* options per context.

5. **Store the registry as a TypeScript array of objects, not a switch-heavy buildUrl.** The `prompts-chat` pattern of "declarative array + per-id switch in `buildUrl`" has the classic problem of two drift-prone sources of truth (the array entry and the switch case). Put the URL template *in the object* as a function: `urlBuilder: (prompt: string) => string`. Make the switch go away. Concrete shape:
   ```ts
   {
     id: "claude",
     name: "Claude",
     supportsQuerystring: true,
     urlBuilder: (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
   }
   ```
   This would also have prevented the dead-code bug where `deepseek` and `poe` have `buildUrl` cases that can never execute.

6. **Carry title + description through to buildUrl.** Even if only one platform uses them today (Goose for recipe import), the signature that accepts them is forward-compatible for future platforms that want structured handoff. OK wiki pages have natural title/summary metadata that'd be wasted if the handoff API only accepts `prompt: string`. Borrow the Goose precedent.

7. **Goose's base64-JSON recipe is the right precedent for richer handoffs.** If Open Knowledge wants to build a deeper integration with a partner AI app (e.g., "open this wiki page as context + agent instructions"), the pattern to copy is: JSON-serialize a structured import payload → base64 → deep-link scheme `?config=`. This is much richer than a prompt query string without being a full MCP server install. It's the intermediate tier we've been missing in the Mintlify-vs-MCP polarity.

8. **Declare every platform's `isDeeplink` flag even if only documentation.** In `prompts-chat` the field is never read at runtime but is useful for operator-readable auditing — at a glance, you can filter the registry for "which entries rely on custom URL schemes." This metadata-for-humans pattern is worth replicating; we should flag our MCP-install variants similarly.

9. **No URL-length handling is acceptable for prompt-sized payloads — but document it.** The registry gets away with no cap because prompts are small. OK wiki pages are typically larger (full markdown files) and could legitimately hit browser URL caps. We should measure: what's the p99 wiki-page-as-prompt size, and does it bust Safari's 80k cap? If yes, add a length gate + clipboard fallback to the URL path for `q=`-capable platforms on oversized content. If no, skip it — don't over-engineer.

10. **Don't build a "default platform" preference — use accessory-based UX instead.** `prompts-chat` shows the full 28-platform list every time; the user's recent selection surfaces via Raycast's own Action history. This is a deliberate design choice, and correct for a diverse-choice interaction. For OK's "Open in …" menu we should do the same — rank by recent use, not by a user-set default. The preferences pane would bloat; the recency-sort is free.

---

## Negative searches

Things I looked for and did NOT find in `prompts-chat`:

- **No `createDeeplink()` utility use.** Raycast's `@raycast/utils` exports a `createDeeplink` helper for *inbound* deep links into a Raycast extension. `prompts-chat` builds outbound URLs by hand with template strings — `createDeeplink` does not apply. grep confirms zero references.
- **No `Action.Open` with bundle id.** `prompts-chat` uses bare `open(url)` from `@raycast/api`, not `Action.Open` with an `application` prop. There is no bundle-id-based app targeting.
- **No `execFile` / `spawn` to shell out to `/usr/bin/open` with flags.** The extension uses the JS `open()` wrapper exclusively.
- **No per-platform URL-length check.** Zero `.length >` comparisons in `utils.ts` or `run-prompt.tsx`.
- **No telemetry / analytics of handoff clicks.** No `fetch` to a metrics endpoint after `open()`. Raycast provides its own handoff instrumentation if any.
- **No preferences for platform enable/disable.** The registry is hard-coded; users can't hide a platform. (The only preference is `baseUrl` for self-hosted prompts.chat.)
- **No "wait then simulate paste" AppleScript path.** Zero `osascript`, `runAppleScript`, or `child_process` imports. The clipboard path is strictly user-visible paste.
- **No MCP-install URLs.** Unlike Mintlify, `prompts-chat` does not include any `mcp://install` or equivalent deep link.

## Gaps / follow-ups

- **Mitte.ai is a niche outlier.** Both `mitte-image` and `mitte-video` delegate to the same `https://mitte.ai` base — worth checking if this is the single correct path or if the upstream API has per-media endpoints. Not blocking, but curious.
- **Dead-code `deepseek` and `poe` cases in `buildUrl` deserve a one-line follow-up** to either restore their querystring capability (if upstream now supports it) or remove the dead branches. A PR candidate for a Raycast contributor pass.
- **`goose` fallthrough label in the switch is unused.** No `Platform.id === "goose"` exists — only `"goose-chat"`. Minor hygiene cleanup.
- **The `isDeeplink` field is never read at runtime.** Either wire it into the branching logic (e.g., for bundle-id-based targeting on non-macOS ports) or remove it as cognitive-load. Can be addressed in OK's own implementation — don't repeat this metadata-drift risk.
- **No documented URL-length ceiling per platform.** If Open Knowledge ends up with larger payloads than prompts.chat's average, the registry should carry a `maxPromptBytes` field (or a `truncateStrategy: "clipboard-fallback" | "head" | "error"`). This is a shape choice the prior art doesn't help with — document as an explicit OK extension.
- **No test suite in `prompts-chat` for buildUrl.** `src/` has no `*.test.ts` files. Any refactor to a function-per-entry shape (as recommended in Patterns #5) should land with unit tests for each URL template — OK's implementation should bake tests in from day one.
