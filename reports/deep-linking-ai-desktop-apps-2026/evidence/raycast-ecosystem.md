# Evidence: Raycast — URL Scheme, Extension API, and AI Handoff Ecosystem

**Dimension:** D6 — Raycast
**Date:** 2026-04-16
**Sources:** developers.raycast.com docs, manual.raycast.com docs, github.com/raycast/extensions, github.com/raycast/ray-so, `/Applications/Raycast.app` (v1.70.3, native Swift/AppKit)

---

## Key sources
- `/Applications/Raycast.app/Contents/Info.plist` — URL scheme registration (accessed 2026-04-16)
- `/Applications/Raycast.app/Contents/MacOS/Raycast` — main binary (native Swift; `strings` probe)
- https://developers.raycast.com/information/lifecycle/deeplinks — official deeplinks spec
- https://developers.raycast.com/api-reference/utilities — `open()` signature
- https://developers.raycast.com/api-reference/ai — `AI.ask()` signature
- https://developers.raycast.com/api-reference/clipboard — `Clipboard.{copy,paste,read}`
- https://developers.raycast.com/api-reference/user-interface/actions — `Action.Open`, `Action.CreateQuicklink`
- https://developers.raycast.com/utilities/functions/createdeeplink — `createDeeplink()` helper
- https://manual.raycast.com/deeplinks — user-manual deeplink reference
- https://manual.raycast.com/quicklinks — Quicklinks
- https://manual.raycast.com/dynamic-placeholders — placeholder syntax (`{clipboard}`, `{argument}`, …)
- https://www.raycast.com/changelog/1-47-0 — Deeplinks GA
- https://www.raycast.com/changelog/1-36-0 — Shared Quicklinks
- https://www.raycast.com/changelog/1-76-0 — Dynamic Placeholders in Quicklinks
- https://ray.so/quicklinks — Quicklink Explorer (official Raycast gallery)
- GitHub source for extensions: `raycast/extensions`, `korchasa/raycast-ask-anybody`

---

## Part 1: `raycast://` URL scheme

### Finding 1: Raycast registers `raycast://` and `com.raycast` as URL schemes
**Confidence:** CONFIRMED
**Evidence:** `/Applications/Raycast.app/Contents/Info.plist` (`PlistBuddy -c "Print :CFBundleURLTypes"`):

```text
Array {
    Dict {
        CFBundleURLName = com.raycast.macos
        CFBundleURLSchemes = Array {
            raycast
            com.raycast
        }
    }
}
```

Bundle id: `com.raycast.macos`; short version: `1.70.3`. Native Swift/AppKit (no Electron `app.asar`; the main executable is a compiled Mach-O with Swift metadata — e.g. `_TtC10RaycastApp9AppRouter`).

### Finding 2: Routing file is `AppRouter+Deeplinks.swift` (confirmed via Swift metadata)
**Confidence:** CONFIRMED
**Evidence:** `strings /Applications/Raycast.app/Contents/MacOS/Raycast` includes:

```
RaycastApp/AppRouter+Deeplinks.swift
_TtC10RaycastApp9AppRouter
makeAppRouter()
deeplink(for:)
registerAICommandDeeplink()
registerExtensionDeeplink()
```

Route-confirmation prompt strings also present:

```
alwaysAllowAICommandDeeplinking
alwaysAllowCommandDeeplinking
alwaysAllowQuickAIDeeplinking
alwaysAllowScriptCommandDeeplinking
```

These are the "Always allow" checkboxes on Raycast's deeplink confirmation dialog — confirming that commands launched via deeplink trigger a confirmation sheet by default (per `https://developers.raycast.com/information/lifecycle/deeplinks` security section).

### Finding 3: The full Raycast URL surface
**Confidence:** CONFIRMED — cross-referenced against docs, `ray-so` source, extension wild-use.

| URL form | What it does | Source |
|---|---|---|
| `raycast://extensions/<author>/<extension>/<command>` | Launch any installed extension command | [official deeplink docs](https://developers.raycast.com/information/lifecycle/deeplinks) |
| `raycast://extensions/<author>/<extension>/<command>?launchType=userInitiated\|background` | Control execution context | docs |
| `raycast://extensions/<author>/<extension>/<command>?arguments=<url-encoded-JSON>` | Pass typed command arguments (max 3) | docs |
| `raycast://extensions/<author>/<extension>/<command>?context=<url-encoded-JSON>` | Pass a free-form `LaunchContext` object | docs |
| `raycast://extensions/<author>/<extension>/<command>?fallbackText=<string>` | Seed the command's first text input / search bar | docs |
| `raycast://script-commands/<slug>?arguments=<value>&arguments=<value>` | Launch a user-installed Script Command; `arguments` repeats per positional arg | manual.raycast.com/deeplinks |
| `raycast://ai-commands/<slugified-name>` | Launch a saved AI Command by slug | manual.raycast.com/deeplinks + wild-use (`better-aliases/assets/examples/config.json`) |
| `raycast://quicklinks/import?quicklinks=<url-encoded-JSON>[&quicklinks=<json>…]` | Import one or more Quicklinks (each repeats the param) | `raycast/ray-so` source below |
| `raycast://snippets/import?snippet=<url-encoded-JSON>[&snippet=<json>…]` | Import one or more Snippets | `raycast/ray-so` snippets/shared.tsx |
| `raycast://snippets/create?name=<e>&keyword=<e>&text=<e>` | Open the Create Snippet sheet pre-filled | wild-use (`YanivGabay/mcp-snippet-raycast-creator`) |
| `raycast://confetti` | Trigger a confetti animation (easter-egg / tadaa feature) | manual.raycast.com/deeplinks + many wild users (`TahaTesser/CommitConfetti`, `sindresorhus.github.com/apps/hyperduck`) |

Native binary also references (from `strings`) the host-level keywords: `extensions`, `quicklinks`, `snippets`, `confetti`, `preferences`, `actions`, `settings`. Windows builds also register a `raycastinternal://` flavored scheme (see `ray-so/app/(navigation)/quicklinks/utils/actions.ts`) — `addToRaycast()` swaps the protocol based on `getRaycastFlavor()`.

### Finding 4: `?arguments=...` and `?context=...` are URL-encoded JSON objects
**Confidence:** CONFIRMED
**Evidence:** [developers.raycast.com/information/lifecycle/deeplinks](https://developers.raycast.com/information/lifecycle/deeplinks) — table lists both `arguments` and `context` as "URL-encoded JSON object." Values populate `props.arguments` / `props.launchContext` on the receiving command:

```ts
export default function MyCommand(props: LaunchProps<{ arguments: Arguments.MyCommand }>) {
  const { title, subtitle } = props.arguments;
}
```

Maximum of 3 arguments per command is enforced by the command manifest schema (`developers.raycast.com/information/lifecycle/arguments`).

### Finding 5: Script-command deeplinks use repeated `arguments` params (not JSON)
**Confidence:** CONFIRMED
**Evidence:** From `manual.raycast.com/deeplinks`, verbatim:

```
raycast://script-commands/color-conversion?arguments=%23FF0000&arguments=rgb
```

Each positional argument is a separate `arguments=` entry; values are plain URL-encoded strings (not JSON).

### Finding 6: Shared Quicklinks / Snippets use base64-alternative: repeated URL-encoded JSON params
**Confidence:** CONFIRMED
**Evidence:** `raycast/ray-so` monorepo, `app/(navigation)/quicklinks/utils/actions.ts` — the `addToRaycast` handler on ray.so/quicklinks:

```ts
function makeQueryString(quicklinks: Quicklink[], isRaycastImport?: boolean): string {
  const queryString = quicklinks
    .map((selectedQuicklink) => {
      const { name, link, openWith, icon } = selectedQuicklink;
      return `quicklinks=${encodeURIComponent(
        JSON.stringify({
          name, link, openWith,
          iconName: isRaycastImport ? getRaycastIconName(icon?.name) : icon?.name,
          iconUrl: icon?.link,
          iconInvert: icon?.invert,
        }),
      )}`;
    })
    .join("&");
  return queryString;
}

export async function addToRaycast(router, quicklinks, isTouch) {
  const raycastProtocol = await getRaycastFlavor();
  const protocolToUse = isTouch ? "raycast" : raycastProtocol;
  const url = `${protocolToUse}://quicklinks/import?${queryString}`;
  ...
}
```

Snippets use the same pattern at `app/(navigation)/snippets/shared/shared.tsx`:

```ts
const url = `raycast://snippets/import?${queryString}`;
// where each entry is `snippet=${encodeURIComponent(JSON.stringify({ name, text, keyword, type }))}`
```

One community extension (`ramirlm/raycast-skill-manager-plugin`) uses a base64 variant (`raycast://snippets/import?payload=<base64-encoded-JSON>`), but the ray.so-canonical form is repeated per-item URL-encoded JSON params.

### Finding 7: Raycast warns before launching a deeplinked command (security gate)
**Confidence:** CONFIRMED
**Evidence:** developers.raycast.com docs state "Whenever a command is launched using a Deeplink, Raycast will ask you to confirm that you want to run the command." The native binary surfaces per-category "Always allow" checkboxes (`alwaysAllow{Command,AICommand,ScriptCommand,QuickAI}Deeplinking`) and a user-facing "Copy Deeplink" + "Open Deeplink from Clipboard" menu item — deeplinks are explicitly a first-class user feature in Raycast, not a hidden mechanism.

### Finding 8: `createDeeplink()` utility builds the URL for you from inside an extension
**Confidence:** CONFIRMED
**Evidence:** [developers.raycast.com/utilities/functions/createdeeplink](https://developers.raycast.com/utilities/functions/createdeeplink) — three overloads:

```ts
// same-extension command
createDeeplink(options: {
  type?: DeeplinkType.Extension,
  command: string,
  launchType?: LaunchType,
  arguments?: LaunchProps["arguments"],
  fallbackText?: string,
}): string;

// external-extension command
createDeeplink(options: {
  type?: DeeplinkType.Extension,
  ownerOrAuthorName: string,
  extensionName: string,
  command: string,
  launchType?: LaunchType,
  arguments?: LaunchProps["arguments"],
  fallbackText?: string,
}): string;

// script command
createDeeplink(options: {
  type: DeeplinkType.ScriptCommand,
  command: string,
  arguments?: string[],
}): string;
```

`DeeplinkType` enum exposes `Extension` and `ScriptCommand`. No helper exists for `quicklinks/import` or `confetti` — those remain hand-built.

---

## Part 2: `@raycast/api` extension API

### Finding 9: `open()` accepts any URL string and optionally names a receiving app
**Confidence:** CONFIRMED
**Evidence:** [developers.raycast.com/api-reference/utilities](https://developers.raycast.com/api-reference/utilities):

```ts
async function open(
  target: string,
  application?: Application | string
): Promise<void>;
```

- `target` is "The file, folder or URL to open." — no restriction to `http(s)`.
- `application` accepts "application name, app identifier, or absolute path to the app."

**Implication (verified in the wild — see Part 3):** a Raycast extension can do

```ts
await open("claude://claude.ai/new?q=Summarize%20this", "com.anthropic.claudefordesktop");
```

and hand the user off to Claude Desktop with a seeded prompt. No entitlement, no manifest opt-in, no extra permission prompt — it is the same code path as `Action.Open` (utility + action are both built on macOS `NSWorkspace.open`).

### Finding 10: `Action.Open` and `Action.OpenInBrowser` expose the same capability declaratively
**Confidence:** CONFIRMED
**Evidence:** `developers.raycast.com/api-reference/user-interface/actions` —

```ts
<Action.Open title="Open in Cursor" target={`cursor://anysphere.cursor-deeplink/prompt?text=${q}`} />
<Action.Open title="Open in Atlas"  target={row.url} application="com.openai.atlas" />
```

`target: string` is unconstrained; `application: string | Application` accepts an app identifier (bundle ID), app name, or absolute path.

### Finding 11: `AI.ask()` is an API→API proxy, NOT a desktop-app handoff
**Confidence:** CONFIRMED — important distinction for the D6 question.
**Evidence:** [developers.raycast.com/api-reference/ai](https://developers.raycast.com/api-reference/ai):

```ts
async function ask(prompt: string, options?: AskOptions): Promise<string> & EventEmitter;

interface AskOptions {
  creativity?: "none" | "low" | "medium" | "high" | "maximum" | number;
  model?: AI.Model;              // 80+ variants: GPT-5.x, Claude 4.6 Opus/Sonnet, Gemini 3.1 Pro, Grok, Mistral, DeepSeek…
  signal?: AbortSignal;
}
```

- Requires Raycast Pro; users without access are offered an upgrade prompt.
- Check access: `environment.canAccess(AI)`.
- Default: `AI.Model["OpenAI_GPT-4o_mini"]`.
- Streaming via EventEmitter `"data"` event.
- Rate-limited: 10 req/min, 100 req/hour.

**Key architectural distinction:** `AI.ask()` dispatches the prompt to Raycast's backend, which in turn calls OpenAI / Anthropic / Google. The text response lands inside the Raycast command. **It does NOT launch or populate Claude Desktop, ChatGPT Desktop, or any other app.** That pattern requires `open(<url-scheme>)` (Finding 9). `AI.ask()` and the desktop-app handoff pattern are orthogonal — authors pick one based on intent: execute-in-Raycast vs. hand-off-to-the-user's-primary-AI-app.

### Finding 12: `Clipboard` is the universal handoff fallback for apps without a URL scheme
**Confidence:** CONFIRMED
**Evidence:** [developers.raycast.com/api-reference/clipboard](https://developers.raycast.com/api-reference/clipboard):

```ts
async function copy(content: string | number | Content, options?: CopyOptions): Promise<void>;
async function paste(content: string | Content): Promise<void>;
async function read(options?: { offset?: number }): Promise<ReadContent>;
async function readText(options?: { offset?: number }): Promise<string | undefined>;

type Content =
  | { text: string }
  | { file: PathLike }
  | { html: string; text?: string };
```

`copy(..., { concealed: true })` marks the item as secret (hidden from Clipboard History). `paste()` simulates a ⌘V into the frontmost app.

**Pattern:** when a target AI app has no URL scheme but has a web UI, the canonical dance is `Clipboard.copy(prompt) → open("https://…") → user pastes ⌘V`. The `prompts-chat` extension (Part 3) uses this exact fallback for platforms with `supportsQuerystring: false`.

---

## Part 3: AI-adjacent extensions in the wild

### Extension 1: Ask Anybody (`korchasa/raycast-ask-anybody`) — the canonical handoff example
- URL: https://github.com/korchasa/raycast-ask-anybody
- Install count: not listed on raycast.com/korchasa/ask-anybody (404 at the time of fetch — listed but page 404'd; extension lives at the GitHub source of truth).
- What it does: 6 commands (`ask-chatgpt`, `ask-claude`, `ask-claude-desktop`, `ask-gemini`, `ask-grok`, `ask-mistral`). Each takes a required `query` argument from the Raycast root, then hands off to the chosen AI via URL scheme. Notable: `ask-claude-desktop` is a distinct command from the web `ask-claude`.
- How it does it: thin wrapper around `open()` with per-AI URL templates. Claude Desktop version uses the `claude://` scheme AND names the bundle id as the receiving application.

**Evidence — `src/open-chat.ts` (the shared utility):**

```ts
import { open, closeMainWindow, popToRoot, showToast, Toast, LaunchProps } from "@raycast/api";

export async function openChat(
  props: LaunchProps<{ arguments: { query: string } }>,
  name: string,
  urlTemplate: (query: string) => string,
  application?: string,
) {
  const { query } = props.arguments;
  try {
    await open(urlTemplate(query), application);
    await closeMainWindow();
    await popToRoot({ clearSearchBar: true });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: `Failed to open ${name}`,
      message: String(error),
    });
  }
}
```

**Evidence — `src/ask-claude-desktop.tsx`:**

```ts
import { LaunchProps } from "@raycast/api";
import { openChat } from "./open-chat";

export default async function Command(props: LaunchProps<{ arguments: Arguments.AskClaudeDesktop }>) {
  await openChat(
    props,
    "Claude",
    (q) => `claude://claude.ai/new?q=${encodeURIComponent(q)}`,
    "com.anthropic.claudefordesktop",
  );
}
```

**Evidence — `src/ask-chatgpt.tsx` (web-only sibling):**

```ts
export default async function Command(props: LaunchProps<{ arguments: Arguments.AskChatgpt }>) {
  await openChat(props, "ChatGPT", (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`);
}
```

This extension is the cleanest single-file demonstration that the pattern works end-to-end: **Raycast root → hotkey → `?q=` query seed → `open("claude://...", "com.anthropic.claudefordesktop")` → Claude Desktop opens with the prompt pre-filled.**

### Extension 2: Prompts.chat (`raycast/extensions/prompts-chat`) — multi-AI dispatcher with deeplink awareness
- URL: https://github.com/raycast/extensions/tree/main/extensions/prompts-chat
- Install count: 335 (per https://www.raycast.com/fka/prompts-chat)
- Author: Fatih Kadir Akın (`fka`)
- What it does: browse community prompts from prompts.chat, then run them against any of ~30 AI platforms. Platforms are declared with a `supportsQuerystring` + `isDeeplink` flag pair so the extension can pick the right handoff strategy.
- How it does it: URL template table + per-platform `buildUrl()` encoder + `open(url)` dispatcher.

**Evidence — `src/utils.ts`, the `Platform` registry (excerpt):**

```ts
export interface Platform {
  id: string;
  name: string;
  baseUrl: string;
  supportsQuerystring: boolean;
  isDeeplink?: boolean;
}

export const chatPlatforms: Platform[] = [
  { id: "chatgpt",  name: "ChatGPT",           baseUrl: "https://chatgpt.com",            supportsQuerystring: true  },
  { id: "claude",   name: "Claude",            baseUrl: "https://claude.ai/new",          supportsQuerystring: true  },
  { id: "goose-chat", name: "Goose",           baseUrl: "goose://recipe",                 supportsQuerystring: true, isDeeplink: true },
  { id: "gemini",   name: "Gemini",            baseUrl: "https://gemini.google.com/app",  supportsQuerystring: false },
  ...
];

export const codePlatforms: Platform[] = [
  { id: "windsurf", name: "Windsurf", baseUrl: "windsurf://",                            supportsQuerystring: false, isDeeplink: true },
  { id: "cursor",   name: "Cursor",   baseUrl: "cursor://anysphere.cursor-deeplink/prompt", supportsQuerystring: true, isDeeplink: true },
  { id: "vscode",   name: "VS Code",  baseUrl: "vscode://",                              supportsQuerystring: false, isDeeplink: true },
  { id: "vscode-insiders", name: "VS Code Insiders", baseUrl: "vscode-insiders://",     supportsQuerystring: false, isDeeplink: true },
  ...
];
```

**Evidence — `src/utils.ts`, per-platform encoder (excerpt):**

```ts
export function buildUrl(platformId, baseUrl, promptText, promptTitle?, promptDescription?) {
  const encoded = encodeURIComponent(promptText);
  switch (platformId) {
    case "cursor":   return `${baseUrl}?text=${encoded}`;                 // cursor://anysphere.cursor-deeplink/prompt?text=...
    case "claude":   return `${baseUrl}?q=${encoded}`;                    // https://claude.ai/new?q=...  (web, not Desktop)
    case "chatgpt":  return `${baseUrl}/?q=${encoded}`;
    case "grok":     return `${baseUrl}&q=${encoded}`;
    case "goose":
    case "goose-chat": {
      const config = JSON.stringify({ version: "1.0.0", title: promptTitle, description: promptDescription, instructions: "...", prompt: promptText, activities: [...] });
      return `${baseUrl}?config=${Buffer.from(config).toString("base64")}`; // goose://recipe?config=<base64-JSON>
    }
    ...
  }
}
```

**Evidence — `src/components/run-prompt.tsx`, the dispatch:**

```ts
async function handleRun(platform: Platform) {
  if (platform.supportsQuerystring) {
    const url = buildUrl(platform.id, platform.baseUrl, content, prompt.title, prompt.description || undefined);
    await open(url);
    await showToast({ style: Toast.Style.Success, title: `Opening in ${platform.name}` });
  } else {
    await Clipboard.copy(content);
    await open(platform.baseUrl);
    await showToast({ title: "Prompt copied!", message: `Opening ${platform.name}... Paste with ⌘V` });
  }
}
```

**Why this is load-bearing:** the extension demonstrates the full typology of handoff strategies in a single codebase — URL-scheme deep link (Cursor, Windsurf, Goose), HTTPS query-string (ChatGPT web, Claude web, Perplexity), and clipboard-fallback (Gemini, Pi, Meta AI, Poe — apps/sites that don't accept a URL-seeded prompt). It is the best single file to cite when evidencing "cross-AI handoff pattern in 2026."

### Extension 3: Cursor Agents (`raycast/extensions/cursor-agents`) — background agent deeplink
- URL: https://github.com/raycast/extensions/tree/main/extensions/cursor-agents
- Install count: not extracted (page not fetched)
- What it does: list Cursor background agents, open one in Cursor Desktop.
- How it does it: declarative `<Action.Open>` to Cursor's deeplink.

**Evidence — `src/list-agents.tsx`:**

```tsx
<Action.Open
  icon={{ source: "icon-mono.svg", tintColor: Color.PrimaryText }}
  title="Open in Cursor"
  target={`cursor://anysphere.cursor-deeplink/background-agent?bcId=${encodeURIComponent(props.agent.id)}`}
/>
```

Note the deeplink namespace: `cursor://anysphere.cursor-deeplink/...`. Anysphere registered a namespace-qualified host inside their own scheme — a pattern Raycast authors mirror when they own the target app.

### Extension 4: Cursor Recent Projects (`raycast/extensions/cursor-recent-projects`) — per-user deeplink
- URL: https://github.com/raycast/extensions/tree/main/extensions/cursor-recent-projects
- What it does: list Cursor's recent projects; open one back in Cursor Desktop.
- How it does it: author-namespaced deeplink.

**Evidence — `src/utils.ts`:**

```ts
return `cursor://tonka3000.raycast/${uri}`;
```

And `src/index.tsx`:

```ts
const uri = props.uri.replace("vscode-remote://", "cursor://vscode-remote/");
```

This shows Cursor Desktop accepts a `vscode-remote://` translation path inside its own scheme — handy for SSH/WSL projects.

### Extension 5: ChatGPT Atlas (`raycast/extensions/chatgpt-atlas`) — native bundle-id handoff, no URL scheme
- URL: https://github.com/raycast/extensions/tree/main/extensions/chatgpt-atlas
- Install count: 1,398 (per https://www.raycast.com/thomas/chatgpt-atlas)
- Author: Thomas Paul Mann (a Raycast founder)
- What it does: search ChatGPT Atlas (OpenAI's Chromium-based browser) history + bookmarks via direct SQLite read, then open a result.
- How it does it: `Action.Open` with the target URL PLUS `application="com.openai.atlas"` — the bundle-id form.

**Evidence — `src/search-history.tsx`:**

```tsx
<Action.Open
  icon={Icon.Globe}
  title="Open in Browser"
  target={row.url}
  application="com.openai.atlas"
/>
<Action.OpenWith icon={Icon.AppWindow} path={row.url} />
```

Pattern-shape: when the target app has no URL scheme for "open URL X in me" (ChatGPT Atlas is a browser — `open <url>` would hit the default browser instead), Raycast's `open(url, bundleId)` forces the right app. Same tactic would work for any desktop AI app whose URL scheme is limited — you can still route a regular URL at it.

### Extension 6: Claude Code Launcher (`raycast/extensions/claude-code-launcher`) — terminal bridge, no URL scheme
- URL: https://github.com/raycast/extensions/tree/main/extensions/claude-code-launcher
- Install count: 2,172 (per https://www.raycast.com/stephendolan/claude-code-launcher)
- Author: Stephen Dolan
- What it does: save project paths, open them in Claude Code (CLI) via the user's preferred terminal (Terminal.app, iTerm, Warp, Ghostty, Alacritty).
- How it does it: `execFile("open", ["-na", "Ghostty.app", "--args", "-e", shell, "-l", "-c", command])` where `command` is `cd <path> && clear && claude ; exec $SHELL -l`.

**Evidence — `src/terminal-adapters/adapters/ghostty.ts`:**

```ts
async open(directory: string, options?: TerminalOpenOptions): Promise<void> {
  const userShell = process.env.SHELL || "/bin/zsh";
  const command = `cd ${this.shellEscape(directory)} && clear && claude ; exec ${userShell} -l`;
  if (options?.ghosttyOpenBehavior === "tab") {
    await this.openInTab(command);
  } else {
    await this.openInNewWindow(userShell, command);
  }
}

private async openInNewWindow(shell: string, command: string): Promise<void> {
  await execFileAsync("open", ["-na", "Ghostty.app", "--args", "-e", shell, "-l", "-c", command]);
}
```

**Why this matters:** for Claude *Code* (the CLI, not the desktop app), there is no URL scheme. The bridge is terminal-spawn. The extension abstracts five terminal apps behind a `TerminalAdapter` interface. This is the shape most agent-CLI handoffs take in the Raycast ecosystem (same pattern in `claudecast` at `extensions/claudecast/src/lib/terminal.ts`).

### Extension 7: ClaudeCast (`raycast/extensions/claudecast`) — context-capture + CLI exec
- URL: https://github.com/raycast/extensions/tree/main/extensions/claudecast
- Author: qazi0
- What it does: "Quick prompts, session management, and agentic workflows" — capture context from VS Code, then either (a) call the `claude` CLI directly (`executePrompt`) or (b) hand off to a terminal (`launchClaudeCode`).
- How it does it: Raycast command receives a form submission, captures context (`captureContext`), formats prompt, and either `execFile("claude", ...)` headlessly or spawns a terminal session. No URL scheme.

**Evidence — `src/ask-claude.tsx`:**

```ts
import { executePrompt, isClaudeInstalled, ClaudeResponse } from "./lib/claude-cli";
import { captureContext, formatContextForPrompt, CapturedContext } from "./lib/context-capture";
import { launchClaudeCode, expandTilde } from "./lib/terminal";
```

This is the "CLI bridge" variant of the handoff — the extension still acts as the launch surface, but the target is a CLI rather than a desktop-app URL scheme.

### Extension 8: ChatGPT (`raycast/extensions/chatgpt`, `abielzulio/chatgpt-raycast`) — direct API, no handoff
- URL: https://github.com/raycast/extensions/tree/main/extensions/chatgpt
- Install count: 223,451 (per https://www.raycast.com/abielzulio/chatgpt) — **highest-install AI extension**
- Author: Abiel Zulio M
- What it does: chat UI inside Raycast. Does NOT open ChatGPT Desktop or web.
- How it does it: user supplies OpenAI API key; extension calls `openai.chat.completions.create(...)` from the `openai` SDK; chat lives in Raycast's `List` UI.

**Evidence — `extensions/chatgpt-quick-actions/src/api.ts`:**

```ts
import OpenAI from "openai";
export const openai = new OpenAI({ apiKey: getPreferenceValues().apikey });
```

**Evidence — `extensions/chatgpt-quick-actions/src/execute.ts` (paste-back flow):**

```ts
export default async function Command() {
  const selectedText = await getSelectedText();
  await showHUD(`Connecting to OpenAI with model ${model}...`);
  const res = await openai.chat.completions.create({
    model: model,
    messages: [{ role: "user", content: selectedText }],
  });
  const text = res.choices[0]?.message?.content?.trim() || "";
  if (text) {
    await showHUD("Response pasted to the current application.");
    await Clipboard.paste(text);
  } else {
    await showHUD("No response from OpenAI.");
  }
}
```

**Pattern distinction:** this is the "in-Raycast LLM call" variant — BYOK (bring-your-own-key) to the API, display in Raycast or `Clipboard.paste()` back to the user's foreground app. Same category as `AI.ask()` (Finding 11), just with a user-provided key instead of Raycast Pro. No desktop-app handoff.

### Extension 9: Claude (`raycast/extensions/claude`) — Anthropic API, no handoff
- URL: https://github.com/raycast/extensions/tree/main/extensions/claude
- Author: florisdobber (+ 9 contributors)
- What it does: same pattern as Extension 8 but for Anthropic's API; chat UI + saved answers + history + conversations inside Raycast.
- How it does it: direct `@anthropic-ai/sdk` calls; does not invoke Claude Desktop.

**Evidence — `package.json` metadata:**

```json
{
  "name": "claude",
  "title": "Claude",
  "description": "Interact with Anthropic's Claude API directly from Raycast",
  "keywords": ["anthropic", "claude", "chat", "ai"],
  "commands": [
    { "name": "ask", "title": "Ask Question", "mode": "view" },
    { "name": "saved", "title": "Saved Answers", "mode": "view" },
    { "name": "history", "title": "History", "mode": "view" },
    { "name": "conversation", "title": "Conversations", "mode": "view" },
    ...
  ]
}
```

### Three-way taxonomy of Raycast AI extensions

| Pattern | Example | Target | Handoff? |
|---|---|---|---|
| **Desktop-app handoff via URL scheme** | `ask-claude-desktop` (korchasa) | Claude Desktop, Cursor, Windsurf | YES — `open("<scheme>://...")` |
| **Desktop-app handoff via `open(url, bundleId)`** | `chatgpt-atlas` (thomas) | Atlas browser | YES — named app receives a regular URL |
| **Terminal / CLI bridge** | `claude-code-launcher` (stephendolan), `claudecast` (qazi0) | `claude` CLI | YES — `execFile("open", ["-na", "<Terminal>.app", "--args", …])` |
| **In-Raycast API call** | `chatgpt` (abielzulio), `claude` (florisdobber), `chatgpt-quick-actions` (alanzchen) | OpenAI/Anthropic API | NO (stays in Raycast or paste-back) |
| **Raycast Pro built-in** | `AI.ask()` | Raycast's AI backend | NO (stays in Raycast) |

---

## Part 4: Quicklinks — the universal URL launcher

### Finding 13: Quicklinks can target ANY URL scheme, including custom app schemes
**Confidence:** CONFIRMED
**Evidence:** ray.so/quicklinks catalog shows pre-built Quicklinks with mixed schemes: `https://…`, `raycast://extensions/raycast/file-search/search-files?…`, `slack://channel?team=…&id=…`, `imessage://+1234567890`. The Quicklink URL field is a free-text template; macOS `NSWorkspace.open` handles dispatch to the registered URL-scheme handler.

A Quicklink targeting Claude Desktop looks like:

```
claude://claude.ai/new?q={Query}
```

— the exact same URL korchasa's extension builds at runtime (Extension 1), but as a Raycast built-in surface instead of an extension.

### Finding 14: Dynamic Placeholders — `{argument}`, `{clipboard}`, `{selection}`, `{query}`, `{datetime}`
**Confidence:** CONFIRMED
**Evidence:** https://manual.raycast.com/dynamic-placeholders + raycast.com/changelog/1-76-0 (1.76.0 shipped "Dynamic Placeholders in Quicklinks"):

| Placeholder | Where it works | What it inserts |
|---|---|---|
| `{clipboard}` | Snippets, AI Commands, Quicklinks | Last copied text. `{clipboard offset=1}` = previous. |
| `{selection}` | AI Commands (+ via modifier in other contexts) | Selected text in the frontmost app |
| `{argument}` | AI Commands, Quicklinks, Snippets | Prompts user to type; up to 3 |
| `{argument name="word"}` | same | Named arg |
| `{argument name="tone" options="happy, sad, professional"}` | same | Dropdown arg |
| `{argument name="src" default="en"}` | same | Default value |
| `{date}` / `{time}` / `{datetime}` | Quicklinks | Current date/time |
| `{day}` | Quicklinks | Weekday name |
| `{uuid}` | Quicklinks | Random UUID |
| `{cursor}` | Snippets only | Paste cursor position |
| `{browser-tab}` | AI Commands (with Browser Extension) | Focused tab content |

**Modifiers:** `uppercase`, `lowercase`, `trim`, `percent-encode`, `json-stringify`, `raw`. Chainable: `{clipboard | trim | uppercase}`. **Default behavior in Quicklinks is to percent-encode** — use `{… | raw}` to opt out.

`Action.CreateQuicklink` uses TitleCase `{Query}` as the single-argument shorthand — e.g. `https://duckduckgo.com/?q={Query}`. This is a distinct syntax from the fuller `{argument name="…"}` form and is the convention ray.so renders in its UI.

### Finding 15: Quicklinks are shareable via `raycast://quicklinks/import?...`
**Confidence:** CONFIRMED
**Evidence:** `raycast/ray-so/app/(navigation)/quicklinks/utils/actions.ts` (Finding 6 above). Reconstructed URL shape:

```
raycast://quicklinks/import?quicklinks=%7B%22name%22%3A%22Ask%20Claude%22%2C%22link%22%3A%22claude%3A%2F%2Fclaude.ai%2Fnew%3Fq%3D%7BQuery%7D%22%7D
```

Decoded JSON payload per `quicklinks=`:

```json
{
  "name": "Ask Claude",
  "link": "claude://claude.ai/new?q={Query}",
  "openWith": "com.anthropic.claudefordesktop",  // optional
  "iconName": "...",                             // optional
  "iconUrl": "...",                              // optional
  "iconInvert": true                             // optional
}
```

Multiple Quicklinks in one URL: repeat `&quicklinks=...&quicklinks=...`. Clicking such a link invokes Raycast's import confirmation sheet.

### Worked example: "Quicklink that takes selected text and opens Claude Desktop"

User creates a Quicklink named "Ask Claude (Selection)" with link template:

```
claude://claude.ai/new?q={selection | raw | percent-encode}
```

…and Application set to `Claude.app` / bundle id `com.anthropic.claudefordesktop`. When the user triggers it (by name, from the Raycast root), Raycast resolves `{selection}` against the previously-focused app, percent-encodes it, and `open()`s the resulting URL at Claude Desktop. Zero extension code required — the entire pipeline is user-configurable inside Raycast.

Shareable form (pack into a `raycast://quicklinks/import?...` URL with the JSON payload above) lets one user send this Quicklink to a teammate via any chat app.

---

## Part 5: Cross-reference to other dimensions

Raycast is one of several macOS hotkey launchers that can `open('<scheme>://...')` on a key chord; others (Alfred, BetterTouchTool, Keyboard Maestro, LaunchBar, skhd, LeaderKey) offer functionally-equivalent primitives. Empirical wild-use sample from the `claude://` GitHub search:

- `mikker/LeaderKey` — `{ "key": "p", "type": "url", "value": "raycast://confetti" }` (LeaderKey routing to Raycast)
- `jellydn/dotfiles:macos/.skhdrc` — `ctrl + alt - p : open "raycast://confetti"` (skhd routing to Raycast)
- `jacobwgillespie/dotfiles` — `alias tada="open -g raycast://confetti"` (shell alias)
- `loganlinn/dotfiles:bin/claude-desktop` — `printf 'claude://claude.ai/%s' "$stripped"` (shell script wrapping `open`)

All of these are the same shape: **hotkey / alias / shell script → `open <scheme>://...` → OS LaunchServices → target desktop app**. Raycast's contribution is (a) a more ergonomic creation surface (Quicklinks UI, extension TypeScript API), (b) dynamic placeholder substitution, and (c) a shareable `raycast://quicklinks/import?...` distribution format. The underlying OS mechanism is identical.

Deeper comparison of these launchers is deferred to the handoff-prior-art sibling evidence (not yet present under `evidence/` at the time of this writing — verify when authored).

---

## Negative searches

- **Searched:** `raycast://ai-commands` with `?arguments=…` or `?context=…` params. Official docs describe the `<slug>` form only; `better-aliases` config.json examples use the bare form. → **AI-command deeplinks appear to be slug-only; arg-passing is via `{argument}` placeholders inside the AI-command prompt template, not URL query strings.**
- **Searched:** `raycast://` native binary strings for `chatgpt`, `claude`, `openai`, `anthropic`, `gemini`. → None match. Raycast does not hard-code any AI app identities; all handoffs are extension-owned.
- **Searched:** an official Raycast extension (`author: raycast`) that launches Claude Desktop or ChatGPT Desktop. → None exists. The `raycast/extensions/claude` is community-authored (`florisdobber`), targets the Anthropic API, and has no Desktop-handoff command. The official Raycast AI surface is `AI.ask()` + ray.so/presets (the in-Raycast path), not third-party desktop-app handoff.
- **Searched:** `createDeeplink({ type: "Quicklink" })` or a helper for `raycast://quicklinks/import`. → Not in the `createDeeplink` signature; ray.so hand-builds the URL. No first-party TS helper for importing Quicklinks from extension code.
- **Searched:** macOS entitlement / sandbox restriction on `open(customScheme)` from Raycast extensions. → None found. Extensions run in a Node.js subprocess spawned by Raycast; `open()` goes through macOS LaunchServices the same way any other process would. No special privilege beyond "Raycast has Accessibility permission" (required for `getSelectedText()`, not for `open()`).

---

## Gaps / follow-ups

- The exact URL parsing code lives in `RaycastApp/AppRouter+Deeplinks.swift`, visible only in Swift metadata strings — a more thorough static-analysis pass (Hopper / Ghidra on the Mach-O) could extract the full route enum and any undocumented surfaces. Not pursued here because docs + wild-use covered every format the question asked about.
- Whether Raycast honors a full JSON body for `raycast://quicklinks/import?quicklinks=<json>` when the JSON contains `application: "com.anthropic.claudefordesktop"` (the field is named `openWith` in ray.so's serializer; need to verify the Quicklink engine reads `openWith` and translates to the `application` arg on `open()`).
- Whether Raycast's "Focus" / "Quick AI" surface (accessible via `raycastAI_*` binary symbols like `raycastAI_copyChatDeeplink`) exposes a user-targetable deeplink like `raycast://quick-ai?prompt=…`. Symbols exist in the binary but no documented `raycast://quick-ai/...` host was found — likely internal.
- `raycast://extensions/raycast/raycast/create-quicklink?raycast=<url>` was found in a MacStories article as an example; worth verifying its current canonicality (this is a command-launch deeplink that pre-fills the Create Quicklink sheet, not a separate host).
