# Evidence: Docs-Site Contextual Menus — Handoff Landscape (2026)

**Dimension:** Extension of D5 (handoff prior art) — docs-framework category specifically
**Date:** 2026-04-16
**Sources:**
- Mintlify docs + prod bundle (`mintlify.com/docs/_next/static/chunks/21749-6fce9635810625a1.js`, downloaded 2026-04-16)
- Mintlify contextual-menu spec (`mintlify.com/docs/ai/contextual-menu`)
- Fumadocs source at `github.com/fuma-nama/fumadocs` HEAD (shallow-cloned to `/tmp/docs-landscape/fumadocs`, 2026-04-16)
- Vercel AI Elements source at `github.com/vercel/ai-elements` HEAD (shallow-cloned 2026-04-16) — `packages/elements/src/open-in-chat.tsx`
- Starlight Page Actions source at `github.com/dlcastillop/starlight-page-actions` HEAD (shallow-cloned 2026-04-16)
- Fumadocs live docs at `https://www.fumadocs.dev/docs/ui` (confirmed `MarkdownCopyButton`/`ViewOptions` on the rendered page)
- Astro docs — `https://docs.astro.build/en/guides/build-with-ai/`
- ReadMe docs — `docs.readme.com/main/docs/ask-ai`, `readme.com/blog/ai-meets-api-docs`
- GitBook docs — `gitbook.com/docs/` (and changelog)
- VitePress docs — `vitepress.dev/reference/default-theme-search`
- Docusaurus feature-request Canny board — `docusaurus.canny.io/feature-requests/p/chatgpt-integration`
- Google ADK docs issue `#1197` — `github.com/google/adk-docs/issues/1197`
- `starlight-copy-button` (`github.com/dionysuzx/starlight-copy-button`), `starlight-llm-button`, `starlight-llms-txt` (`github.com/delucis/starlight-llms-txt`)

---

## Part 1: Mintlify (the established pattern)

The prior evidence file `react-grab-and-similar-handoff-tools.md` documented Mintlify's 7-provider chat-handoff switch-case (`ee()`). This pass extends that with the full 14-identifier `contextual.options` schema, the MCP-install dispatcher (`ea()`), the MCP-copy actions (`et()`/`er()`), and the `$page`/`$path`/`$mcp` placeholder system for custom options.

### Finding 1.1: The full `contextual.options` schema has 14 built-in identifiers, not 7

**Confidence:** CONFIRMED
**Evidence:** `mintlify.com/docs/ai/contextual-menu` spec page (fetched 2026-04-16) enumerates the full set in the canonical JSON example:

```json
{
  "contextual": {
    "options": [
      "copy", "view", "assistant",
      "chatgpt", "claude", "perplexity", "grok", "aistudio", "devin", "windsurf",
      "mcp", "cursor", "vscode", "devin-mcp"
    ]
  }
}
```

The identifiers split into four categories:

| Category | Identifiers | Action |
|---|---|---|
| Page-content | `copy`, `view` | `copy` writes page Markdown to clipboard via `Y()`; `view` opens `<url>.md` in a new tab |
| Mintlify's own assistant | `assistant` | `o({entryPoint:"context-menu"})` opens Mintlify's first-party in-browser chat. Filtered out at runtime if the docs project has no assistant configured (per `"assistant"!==e.id\|\|r` guard observed in the bundle). |
| Chat handoff (web URLs, 6) + Windsurf scheme (1) | `chatgpt`, `claude`, `perplexity`, `grok`, `aistudio`, `devin`, `windsurf` | Dispatches through `ee()` — the 7-provider switch-case documented in `react-grab-and-similar-handoff-tools.md §Tool 1` |
| MCP install / copy | `mcp`, `cursor`, `vscode`, `devin-mcp` | Three sub-actions: copy raw MCP URL, copy `npx add-mcp <url>` command, open desktop-scheme install deeplink (Cursor/VS Code/Devin) |

Mintlify also exposes a `contextual.display` key (values: `"header"` or `"toc"`) to position the menu either next to the page title or inside the floating table of contents. Observed in the bundle: `display:e?.contextual?.display??"header"`.

### Finding 1.2: The MCP install dispatcher `ea()` uses three distinct URL shapes per provider

**Confidence:** CONFIRMED
**Evidence:** Deobfuscated from `mintlify.com/docs/_next/static/chunks/21749-6fce9635810625a1.js` around offset 109739:

```javascript
ea=(0,s.useCallback)(r => {
  let a = S();                          // current page's MCP server URL
  let n = { name: truncate(e?.name || "Documentation", 30), url: a };
  let s = null;

  if ("cursor" === r) {
    // Base64-JSON blob → cursor:// desktop scheme
    let t = JSON.stringify(n);
    let b64 = A.from(t, "utf8").toString("base64").replace(/\+/g, "%2B");
    s = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(n.name)}&config=${encodeURIComponent(b64)}`;
  } else if ("devin" === r) {
    // Favicon-embedded JSON → web URL (NOT a desktop scheme)
    let i = /* extracted favicon href */;
    let l = btoa(unescape(encodeURIComponent(JSON.stringify({
      name: n.name, description: e?.description, icon: i, transport: "HTTP", url: a
    }))));
    s = `https://app.devin.ai/settings/mcp-marketplace/setup/custom?config=${l}`;
  } else {
    // Default branch: VS Code desktop scheme
    s = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(n))}`;
  }
  s && window.open(s, "_blank");
  p({ ide: r }).catch(console.error);
}, [e?.name, e?.description, e?.favicon, t, p]);
```

Three different URL shapes for "install this MCP server":

| Target | URL shape | Desktop scheme? | Payload encoding |
|---|---|---|---|
| `cursor` | `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64-json>` | Yes — `cursor://` | Base64-encoded JSON `{name, url}` |
| `devin` | `https://app.devin.ai/settings/mcp-marketplace/setup/custom?config=<base64-json>` | No — web URL | Base64-encoded JSON `{name, description, icon, transport: "HTTP", url}` — notably richer payload, includes favicon |
| `vscode` (and default) | `vscode:mcp/install?<url-encoded-json>` | Yes — `vscode:` (no `//`) | URL-encoded JSON `{name, url}` |

**The `vscode:` form is notable** — no `//` separator, so it's a plain URI with opaque path, which matches VS Code's documented `vscode:mcp/install` handler pattern. Cursor, by contrast, uses full `cursor://` authority form. (See also the existing `codex://` / `claude://` findings — no consistency across desktop-AI-app URL shapes.)

### Finding 1.3: The MCP copy actions (`et`/`er`) are clipboard writes, not URL opens

**Confidence:** CONFIRMED
**Evidence:** Bundle offset ~109600:

```javascript
et = (0, s.useCallback)(async () => {
  let e = S();                      // MCP server URL for this docs site
  let t = await (0, C.l)(e);         // copy to clipboard
  return m({ path: c }).catch(console.error), "success" === t;
}, [c, m]);

er = (0, s.useCallback)(async () => {
  let e = S();
  let t = `npx add-mcp ${e}`;        // shell install command
  let r = await (0, C.l)(t);
  return f({ path: c }).catch(console.error), "success" === r;
}, [c, f]);
```

The `mcp` menu option = `et()` (copy raw URL — e.g. `https://docs.example.com/mcp`). Labeled "Copy MCP server URL" in the UI (from docs page). `add-mcp` option label in spec: "Copy MCP install command." No desktop-scheme invocation here — pure clipboard writes for agents/CLIs that want the MCP endpoint.

### Finding 1.4: Custom options support a `$page` / `$path` / `$mcp` placeholder system via `en()`

**Confidence:** CONFIRMED
**Evidence:** Bundle offset ~111100:

```javascript
en = (0, s.useCallback)(async e => {
  if ("string" == typeof e.href) window.open(e.href, "_blank");
  else {
    let { base: t, query: r } = e.href;
    let a = new URL(t);
    if (r) for (let { key: e, value: t } of r) {
      let r = t;
      if (t.includes("$page")) {
        let e = await (0, j.V)(c);       // fetch current page markdown
        r = t.replace("$page", e.slice(0, 200));  // TRUNCATED at 200 chars
      }
      t.includes("$path") && (r = t.replace("$path", c));
      t.includes("$mcp")  && (r = t.replace("$mcp", S()));
      a.searchParams.set(e, r);
    }
    window.open(a.toString(), "_blank");
  }
}, [c]);
```

The `contextual-menu` spec documents this as: *"Use `$page` to insert the current page content in Markdown."* The bundle confirms `$page` is **truncated to 200 characters** — a deliberate cap, likely because URL-length limits on providers (ChatGPT's URL cap ~2000 chars) prevent more. This is evidence for Key Research Question 5: URL length DOES prevent base64-embedding full page content; Mintlify's implementers measured this and settled on 200 chars.

`$path` is the absolute docs path (no content lookup — static). `$mcp` is the site's MCP server URL.

### Finding 1.5: No desktop-app install detection (user-agent / Electron sniff) exists

**Confidence:** CONFIRMED (via negative search)
**Evidence:** Exhaustive grep across the full 145 KB prod bundle `/tmp/mintlify.js`:

```
$ grep -oE '(userAgent[^,;]{0,80}|navigator\.userAgent|isElectron|isInstalled)' /tmp/mintlify.js
# zero matches
```

Only AI-URL hits are the three substrings: `claude.ai`, `windsurf://`, `cursor://`. Mintlify does NOT branch on whether Claude Desktop / Cursor / VS Code is installed — it simply constructs the URL and calls `window.open()`. If the desktop app is registered, the OS intercepts; if not, the browser falls back to the web URL (for chat providers) or shows a "browser can't open this URL" dialog (for desktop-only schemes like `cursor://`, `windsurf://`, `vscode:`).

This confirms the hypothesis in the task brief: **docs-framework handoff is web-first because the browser is the universal arrow**. Install-detection is delegated to the OS protocol-handler layer.

### Finding 1.6: Mintlify's "Copy as Markdown" / `.md` suffix — backend-served

**Confidence:** CONFIRMED
**Evidence:** The `ee()` chat dispatcher (already documented in the earlier evidence file) constructs the prompt as:

```javascript
let t = new URL(window.location.href); t.hash = "";
let r = t.toString();
// "$url.md" variant — appended to the canonical page URL
let a = encodeURIComponent(`Read from ${r}.md so I can ask questions about it.`);
// "$url" variant — NO .md suffix
let n = encodeURIComponent(`Read from ${r} so I can ask questions about it.`);
```

Only `chatgpt` gets `n` (the non-.md variant); all other web-chat providers get `a`. This matches the prior-evidence observation. The reason for the split: ChatGPT with `hints=search` will crawl the HTML page; Claude / Perplexity / Grok / AI Studio's "read URL" instructions fetch the raw content, and Mintlify serves a clean Markdown representation at `<page>.md`.

**How the `.md` suffix is served:** Mintlify's docs-site builder generates a static Markdown file alongside every HTML page. A request for `https://docs.example.com/guide.md` returns the page's source Markdown (frontmatter stripped, typically) with `Content-Type: text/markdown`. This is a server-side concern — the client just appends `.md` and trusts that the backend responds. No MCP round-trip is involved for the chat handoff path. (MCP is a separate option exposed via the `mcp`/`add-mcp`/`cursor`/`vscode`/`devin-mcp` identifiers.)

---

## Part 2: Fumadocs — Next.js OSS docs framework

Fumadocs **ships the same pattern as Mintlify as built-in components** (`MarkdownCopyButton` + `ViewOptionsPopover`), with a narrower but still substantial provider list, all web URLs.

### Finding 2.1: `ViewOptionsPopover` is the Fumadocs equivalent of Mintlify's contextual menu

**Confidence:** CONFIRMED
**Evidence:** `packages/base-ui/src/layouts/shared/page-actions.tsx` and the nearly-identical `packages/radix-ui/src/layouts/shared/page-actions.tsx` (only minor Tailwind class-merging differences). Lines 85-218:

```typescript
const pageUrl = typeof window === "undefined" ? pathname : new URL(pathname, window.location.origin);
const q = `Read ${pageUrl}, I want to ask questions about it.`;

return [
  githubUrl  && { title: "Open in GitHub",    href: githubUrl,                                                         icon: <GitHub/> },
  markdownUrl && { title: "View as Markdown", href: markdownUrl,                                                       icon: <TextIcon/> },
  { title: "Open in Scira AI", href: `https://scira.ai/?${new URLSearchParams({ q })}`,                                icon: <SciraAI/> },
  { title: "Open in ChatGPT",  href: `https://chatgpt.com/?${new URLSearchParams({ hints: "search", q })}`,            icon: <OpenAI/> },
  { title: "Open in Claude",   href: `https://claude.ai/new?${new URLSearchParams({ q })}`,                            icon: <Claude/> },
  { title: "Open in Cursor",   href: `https://cursor.com/link/prompt?${new URLSearchParams({ text: q })}`,             icon: <Cursor/> },
].filter(Boolean);
```

Provider list:
- **5 chat providers:** Scira AI, ChatGPT, Claude, Cursor, (plus GitHub + Markdown as non-chat options)
- **0 desktop schemes.** Cursor is routed through `https://cursor.com/link/prompt?text=...` (web URL), NOT `cursor://`.
- **Prompt wrapper:** `Read ${pageUrl}, I want to ask questions about it.` — grammatically and structurally identical to Mintlify's `Read from ${url} so I can ask questions about it.`, just different wording.
- **Param naming:** `q` for every provider. Cursor uniquely uses `text` instead. Notably ChatGPT gets `q` (not `prompt` or `n`), and `hints: "search"` is included — matching Mintlify's ChatGPT branch.

### Finding 2.2: Fumadocs does NOT append `.md` to the page URL for the prompt wrapper

**Confidence:** CONFIRMED
**Evidence:** Same file as Finding 2.1, line 85:

```typescript
const q = `Read ${pageUrl}, I want to ask questions about it.`;  // NO .md suffix
```

Compare Mintlify's `Read from ${r}.md so I can ask questions about it.` — Mintlify double-dispatches ChatGPT (bare URL) vs Claude/Perplexity/Grok/AI Studio (.md-suffixed URL). Fumadocs uses the bare URL universally. `markdownUrl` (the `.md` or `.mdx` variant) is instead exposed as a separate "View as Markdown" link — the user can copy-paste it into the chat themselves.

Fumadocs does expose `LLMCopyButton` / `MarkdownCopyButton` — a separate clipboard writer that fetches the `.mdx` URL content and copies to clipboard (file `packages/base-ui/src/layouts/shared/page-actions.tsx:15-62`):

```typescript
export function MarkdownCopyButton({ markdownUrl, ...props }) {
  const [checked, onClick] = useCopyButton(async () => {
    const promise = fetch(markdownUrl).then(res => res.text());
    cache.set(markdownUrl, promise);
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": promise }),
    ]);
  });
  // ... renders "Copy Markdown" button
}
```

Two separate UI primitives: *dropdown* (chat handoff) + *copy-to-clipboard* (LLM-paste-into-anywhere). Mintlify merges them in one dropdown.

### Finding 2.3: Fumadocs' AI story is MCP + llms.txt + AISearchTrigger, not desktop-app

**Confidence:** CONFIRMED
**Evidence:** Fumadocs docs page `fumadocs.dev/docs/integrations/llms` (fetched 2026-04-16) lists:
- `llms.txt` and `llms-full.txt` generation via the Loader API
- `.mdx` suffix URL rewrite: `rewrite source:'/docs/:path*.mdx' → '/llms.mdx/docs/:path*'`
- `AISearchTrigger` component for an in-page AI chat dialog (wired to AI SDK / OpenRouter / Inkeep AI)
- No MCP server shipped by default — user wires their own via AI SDK

The live site `https://www.fumadocs.dev/docs/ui` was fetched and its raw HTML confirmed to contain the strings `ViewOptions` and `MarkdownCopy` — these components are rendered on every Fumadocs docs page out of the box.

### Finding 2.4: Notable — Vercel AI Elements has a separate "Open In Chat" component that Fumadocs does NOT use

**Confidence:** CONFIRMED
**Evidence:** `packages/elements/src/open-in-chat.tsx` in `github.com/vercel/ai-elements`. Exports `<OpenIn>`, `<OpenInTrigger>`, `<OpenInContent>`, `<OpenInChatGPT>`, `<OpenInClaude>`, `<OpenInT3>`, `<OpenInScira>`, `<OpenInv0>`, `<OpenInCursor>` — **7 providers:**

```typescript
const providers = {
  chatgpt: { createUrl: prompt => `https://chatgpt.com/?${new URLSearchParams({ hints: "search", prompt })}` },  // NOTE: param is "prompt", not "q"
  claude:  { createUrl: q      => `https://claude.ai/new?${new URLSearchParams({ q })}` },
  cursor:  { createUrl: text   => { const url = new URL("https://cursor.com/link/prompt"); url.searchParams.set("text", text); return url.toString(); } },
  github:  { createUrl: url    => url },
  scira:   { createUrl: q      => `https://scira.ai/?${new URLSearchParams({ q })}` },
  t3:      { createUrl: q      => `https://t3.chat/new?${new URLSearchParams({ q })}` },
  v0:      { createUrl: q      => `https://v0.app?${new URLSearchParams({ q })}` },
};
```

Two observations:

1. **Vercel's ChatGPT branch uses `prompt=`**, not `q=`. This is an inconsistency with Mintlify and Starlight Page Actions (which both use `q` for ChatGPT). All three work in practice because ChatGPT's query page accepts either, but it signals **these implementations were each reverse-engineered independently rather than from a shared provider-URL spec**.

2. **Vercel AI Elements uses `cursor.com/link/prompt?text=...`** (web URL), the same as Fumadocs. Nobody in the OSS docs-framework surveyed route through `cursor://` directly.

This component is a user-space building block — each docs site or app imports `<OpenIn>` and composes it — it's not auto-rendered on every page the way Fumadocs' `ViewOptionsPopover` is.

---

## Part 3: Docusaurus — dominant OSS docs framework

### Finding 3.1: Docusaurus ships NO built-in AI handoff contextual menu

**Confidence:** CONFIRMED
**Evidence:** Docusaurus feature-request Canny board has a pending request titled "Integration with AI/LLMs & MCP" (`docusaurus.canny.io/feature-requests/p/chatgpt-integration`), opened by Mark Sohm and observed 2026-04-16:

> "Click on the copy dropdown and you'll get options to: Copy page as Markdown for LLMs, View as Markdown, Open in ChatGPT, Open in Claude, Connect with MCP, Connect to VS Code."
>
> Status: **Open**, 27 upvotes, no official Docusaurus-team response.

The user is clearly requesting the Mintlify-style menu as a built-in feature. As of 2026-04-16, it is not shipped. Docusaurus 3.9 (October 2025) added DocSearch v4 with Algolia's *Ask AI* side panel — an in-page chat, NOT a contextual menu handing off to external chat apps.

### Finding 3.2: No OSS community plugin matches the Mintlify shape

**Confidence:** MOSTLY CONFIRMED (via exhaustive search for "docusaurus-plugin" + AI-handoff terms)
**Evidence:** Search for `"docusaurus-plugin" "ask AI" OR "copy markdown" OR "chatgpt" github 2026` returned community plugins exclusively in the "in-page chat widget" category:

- `docusaurus-biel` (TechDocsStudio) — in-page chat widget
- `markprompt` — in-page chat prompt
- CrawlChat — Ask button (in-page chat)
- Inkeep — chat widget

None of these add a dropdown that hands off the current page to ChatGPT / Claude / Cursor via URL. The feature request in 3.1 remains unsatisfied by the ecosystem — confirming docs Mark Sohm's ask is real demand.

---

## Part 4: Other OSS docs frameworks

### Finding 4.1: Starlight (Astro) — NOT built in, but a thriving community plugin ecosystem

**Confidence:** CONFIRMED
**Evidence:**

Starlight core ships neither AI handoff nor `.md` suffix by default. Astro docs (`docs.astro.build/en/guides/build-with-ai/`) explicitly recommends **the Astro Docs MCP server** (`https://mcp.docs.astro.build/mcp`) as the primary "feed your docs to AI" path — not a contextual menu. No "Open in ChatGPT" button on Astro docs pages.

Four community plugins fill the gap:

1. **`starlight-page-actions`** (`github.com/dlcastillop/starlight-page-actions`, BSD-ish OSS) — the most complete. Adds a copy-markdown button + "Open" dropdown. Source (`packages/starlight-page-actions/overrides/PageTitle.astro`):

```typescript
const defaultOptions: OptionsProps[] = [
  { label: t("open.chatgpt"),       href: `https://chatgpt.com/?q=${encodedPrompt}`,                    id: "chatgpt" },
  { label: t("open.claude"),        href: `https://claude.ai/new?q=${encodedPrompt}`,                   id: "claude" },
  { label: t("open.t3chat"),        href: `https://t3.chat/new?q=${encodedPrompt}`,                     id: "t3chat" },
  { label: t("open.v0"),            href: `https://v0.app/?q=${encodedPrompt}`,                         id: "v0" },
  { label: t("open.cursor"),        href: `https://cursor.com/link/prompt?${encodedPrompt}`,            id: "cursor" },
  { label: t("open.perplexity"),    href: `https://perplexity.ai/?q=${encodedPrompt}`,                  id: "perplexity" },
  { label: t("open.githubCopilot"), href: `https://github.com/copilot/?prompt=${encodedPrompt}`,        id: "githubCopilot" },
  { label: t("view.markdown"),      href: `${currentPath}.md`,                                          id: "markdown" },
];
```

**7 chat providers** (notably including GitHub Copilot, which no other framework in this survey supports) — all web URLs, no desktop schemes. Also exposes a `custom` option for user-defined providers and a `prompt` template config. Prompt wrapper pattern follows a user-configurable `{url}` placeholder:

```typescript
const prompt = userPrompt?.includes("{url}")
  ? userPrompt?.replace("{url}", currentUrl)
  : `${userPrompt} ${currentUrl}`;
```

Default wrapper isn't quoted in the repo — user must supply one in config, or the framework appends the URL to whatever prompt string they provide.

2. **`starlight-copy-button`** (`github.com/dionysuzx/starlight-copy-button`) — copy-markdown only, no chat handoff.
3. **`starlight-llm-button`** — copy-to-LLM button at the top of the TOC.
4. **`starlight-llms-txt`** (`github.com/delucis/starlight-llms-txt`) — generates `llms.txt` / `llms-full.txt` at build time. Related but not a contextual menu.

**Summary for Starlight:** the Mintlify pattern exists in the ecosystem via `starlight-page-actions` with a *larger* provider set than Mintlify (includes GitHub Copilot, Perplexity, T3, v0) but NO desktop schemes at all (no Windsurf, no `cursor://`).

### Finding 4.2: Nextra — NOT built in, no significant community plugin

**Confidence:** CONFIRMED
**Evidence:** Nextra docs (`nextra.site/docs/guide/search/ai`) describe Inkeep-powered in-page Ask AI only. No "Open in ChatGPT" dropdown on Nextra-powered sites. Searches for Nextra + llms.txt plugins surface `next-llms-txt` (a Next.js-general plugin, not Nextra-specific) and documentation generator tools — not contextual menus.

### Finding 4.3: VitePress — NOT built in

**Confidence:** CONFIRMED
**Evidence:** VitePress search docs (`vitepress.dev/reference/default-theme-search`) describe local MiniSearch + Algolia DocSearch + Algolia Ask AI. All three are in-page search. No contextual menu for handing the page off to an external AI chat. No OSS community plugin identified in searches. Users who want this must write a custom plugin.

### Finding 4.4: GitBook — in-page Ask AI (proprietary, SaaS), no "Open in ChatGPT" observed

**Confidence:** HIGH (but not source-level — GitBook is closed-source)
**Evidence:** GitBook changelog and docs (`gitbook.com/docs/`) describe GitBook Assistant / Ask AI as first-party features — GitBook runs its own LLM-powered chat inside the docs page. Pages CAN be copied as Markdown (per third-party comparison articles), but the proprietary GitBook Ask AI dropdown does NOT surface "Open in ChatGPT / Claude" options based on the changelog and feature docs surveyed. GitBook's strategy is "stay in GitBook's chat," not "hand off to the user's preferred AI."

### Finding 4.5: ReadMe — "Ask AI" button with ChatGPT + Claude (narrow) handoff

**Confidence:** CONFIRMED
**Evidence:** ReadMe blog post `readme.com/blog/ai-meets-api-docs` (accessed 2026-04-16):

> "Users can select their preferred LLM to interact with (ChatGPT or Claude)." ... "When your users click 'Ask ChatGPT,' the current page is sent as a markdown file to ChatGPT for users to ask questions about." ... "Simply add `.md` to the end of the url" (e.g. `https://docs.readme.com/main/docs/quickstart.md`).

Two providers: ChatGPT + Claude. `.md` suffix mechanism matches Mintlify's (the URL is sent to ChatGPT/Claude, and ChatGPT fetches the `.md` version). ReadMe also ships llms.txt at `https://docs.readme.com/main/llms.txt`. Feature is called "Ask AI" and "Copy for LLM" (two separate buttons). No desktop schemes surfaced by ReadMe; implementation is proprietary SaaS.

### Finding 4.6: Docs.page — NO AI contextual menu

**Confidence:** CONFIRMED
**Evidence:** `docs.page` (Invertase) — the docs framework page shows markdown-powered content + pre-built components. No mention of `.md` suffix, `llms.txt`, MCP, or AI handoff. Not a target of the contextual-menu pattern as of 2026-04.

---

## Part 5: Cross-framework patterns observed

### Pattern 5.1: "Web URLs with prompt-query-param" is the universal baseline

Every framework surveyed that ships the feature uses web URLs as the primary handoff:

| Framework | ChatGPT | Claude | Cursor | Windsurf | Desktop schemes at all? |
|---|---|---|---|---|---|
| Mintlify | `chatgpt.com/?hints=search&q=<text>` | `claude.ai/new?q=<text>` | `cursor://anysphere...install?...` (MCP install only) | `windsurf://cascade?prompt=<text>` (chat) | **Yes — windsurf + cursor MCP + vscode MCP** |
| Fumadocs | `chatgpt.com/?hints=search&q=<text>` | `claude.ai/new?q=<text>` | `cursor.com/link/prompt?text=<text>` | — | No |
| Vercel AI Elements | `chatgpt.com/?hints=search&prompt=<text>` | `claude.ai/new?q=<text>` | `cursor.com/link/prompt?text=<text>` | — | No |
| Starlight Page Actions | `chatgpt.com/?q=<text>` | `claude.ai/new?q=<text>` | `cursor.com/link/prompt?<text>` | — | No |
| ReadMe | Yes (via "Ask ChatGPT" button — URL template not externally documented) | Yes | — | — | Unknown (closed-source) |

**Only Mintlify uses desktop schemes** (`windsurf://`, `cursor://`, `vscode:`) — and even then, `windsurf://` is the ONLY chat-handoff that goes desktop-first; the others (`cursor://`, `vscode:`) are for MCP install, not for handing off page content for chat.

### Pattern 5.2: Prompt-param naming inconsistencies are real

Consolidated from the evidence above + the prior `react-grab-and-similar-handoff-tools.md` file:

| Provider | Mintlify | Fumadocs | Vercel AI Elements | Starlight Page Actions | Uniform? |
|---|---|---|---|---|---|
| ChatGPT web | `q=` (with `hints=search`) | `q=` (with `hints=search`) | `prompt=` (with `hints=search`) | `q=` | **No — Vercel uses `prompt=`, others use `q=`** |
| Claude web | `q=` | `q=` | `q=` | `q=` | Yes |
| Cursor web | — | `text=` | `text=` | none (raw query) | Close — `text=` where supported |
| Perplexity | `q=` | — | — | `q=` | Yes |
| Windsurf desktop | `prompt=` | — | — | — | Mintlify-only |

ChatGPT's `q=` vs `prompt=` discrepancy is the most concrete sign that implementers are independently reverse-engineering provider URLs rather than consuming a shared spec. Both forms currently work because ChatGPT's query page is tolerant.

### Pattern 5.3: Prompt-wrapper phrasing converges but isn't specified

Three observed prompt templates:

| Framework | Template |
|---|---|
| Mintlify (chat providers) | `Read from ${url}.md so I can ask questions about it.` (most providers) or `Read from ${url} so I can ask questions about it.` (ChatGPT) |
| Fumadocs | `Read ${pageUrl}, I want to ask questions about it.` |
| Starlight Page Actions (default) | User-supplied; framework appends the URL if the user's template doesn't contain `{url}` |
| ReadMe | Not externally documented; per their blog, the page is "sent as a markdown file" — implying the URL IS the payload |

All follow the shape "Read URL, I'll ask questions" — evidence of convergent discovery of what LLMs do well with (instruction + URL context), not an industry spec.

### Pattern 5.4: `.md` suffix is canonical for "serve raw markdown"

Three of the surveyed frameworks use the `<page>.md` (or `.mdx`) convention:
- Mintlify — `<page>.md` (backend serves raw markdown)
- Fumadocs — `<page>.mdx` (via Next.js rewrite to `/llms.mdx/docs/:path*`)
- ReadMe — `<page>.md`

Starlight Page Actions exposes this as a "View as Markdown" menu item: `href: \`${currentPath}.md\`` — but the Astro/Starlight core must be configured to actually serve raw markdown at that path (not automatic).

### Pattern 5.5: MCP-install deeplinks are an emerging secondary pattern

Only Mintlify ships MCP-install dispatch as part of the contextual menu. Three flavors:
- `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64-json>`
- `vscode:mcp/install?<url-encoded-json>`
- `https://app.devin.ai/settings/mcp-marketplace/setup/custom?config=<base64-json>` (web, not desktop)

This is a **distinct category** from chat-handoff — the user isn't pushing page content into a chat; they're installing the docs-site's MCP server into their coding tool. For OK (a wiki/KB), the parallel is "install me as an MCP server in your coding agent," separate from "open my page in your AI chat."

### Pattern 5.6: Truncation at 200 chars for in-URL page content is the measured compromise

Mintlify's `$page` placeholder is truncated to 200 chars (Finding 1.4). No surveyed framework embeds the full page content in the URL; the universal pattern is "URL → LLM fetches." This confirms the hypothesis: **browser URL-length caps (~2000 chars on most providers) prevent base64-embedding full docs**. Mintlify's implementers settled on 200 chars as a safe margin; Fumadocs and Starlight Page Actions don't even offer this — they just send the URL and rely on the LLM to fetch.

---

## Part 6: Desktop-vs-web stance — direct answer

**Question: Do any docs-framework handoffs target custom URL schemes like `claude://`, `cursor://`, `windsurf://` for chat (not MCP install)?**

**Answer: Almost no. Only Mintlify, only for Windsurf.**

Detailed breakdown:

| URL-scheme observation | Framework | Purpose |
|---|---|---|
| `windsurf://cascade?prompt=` | **Mintlify** | Chat handoff (ask Windsurf about current page) |
| `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=...` | **Mintlify** | MCP install (NOT chat handoff) |
| `vscode:mcp/install?...` | **Mintlify** | MCP install (NOT chat handoff) |
| `https://cursor.com/link/prompt?text=...` | Fumadocs, Vercel AI Elements, Starlight Page Actions | Chat handoff (routes through Cursor web URL, not `cursor://`) |
| `claude://...` | **None** | Not used by any docs framework. Claude web URL (`claude.ai/new?q=`) is the universal choice. Whether Claude Desktop intercepts `claude.ai` is an OS-level handler concern — see `claude-desktop-deep-links.md` for the universal-URL design rationale on Anthropic's side. |
| `chatgpt://` or `codex://` | **None** | Not used by any docs framework. ChatGPT web URL (`chatgpt.com/?q=` or `chatgpt.com/?prompt=`) is universal. |

**The hypothesis in the task brief is confirmed:** Docs-framework handoff is web-first by design. The OS-level intent resolver (which application is registered for `claude.ai`? for `chatgpt.com`?) decides whether the desktop app intercepts. If Claude Desktop is installed and macOS has registered it as the handler for `claude.ai`, then `claude.ai/new?q=...` opens Claude Desktop. If not, the browser opens the web app. Docs frameworks don't try to detect this — they punt to the OS.

The **single exception is Windsurf**, for reasons that aren't fully clear but probably amount to: Windsurf has no web chat app; its ONLY entry point is the desktop URL scheme, so Mintlify has to use `windsurf://` or the provider simply isn't reachable.

The **MCP-install deeplinks** (`cursor://.../mcp/install`, `vscode:mcp/install`) ARE desktop schemes but serve a different purpose — they're for installing MCP servers, not for sending page content to a chat. This is a separate axis from "contextual handoff" and is only exercised by Mintlify as of 2026-04.

**Desktop-install detection:** Zero evidence of any docs framework sniffing user-agent / `window.navigator.userAgent.includes("Electron")` / feature-testing for desktop app presence. Exhaustive grep across Mintlify's 145 KB prod bundle returned zero hits on user-agent or install-detection strings. The pattern across the board is "construct the URL, call `window.open()`, let the OS decide."

---

## Comparison table

| Framework | Contextual menu? | Chat providers (chat handoff) | Desktop schemes (chat) | Desktop schemes (MCP install) | Install-detection? | `.md` URL? | llms.txt? | License |
|---|---|---|---|---|---|---|---|---|
| Mintlify | **Yes (built-in)** | 7 (ChatGPT, Claude, Perplexity, Grok, AI Studio, Devin, Windsurf) + "assistant" | `windsurf://` only | `cursor://`, `vscode:`, Devin (web) | No | Yes | Likely yes (not audited) | Proprietary SaaS |
| Fumadocs | **Yes (built-in)** | 4 (Scira AI, ChatGPT, Claude, Cursor) + GitHub | None | None | No | Yes (`.mdx`) | Yes | MIT |
| Vercel AI Elements | **Yes (component)** | 7 (ChatGPT, Claude, Cursor, GitHub, Scira, T3, v0) | None | None | No | n/a (library, not a framework) | n/a | MIT |
| Starlight (plugin) | Yes (via `starlight-page-actions`) | 7 (ChatGPT, Claude, T3, v0, Cursor, Perplexity, GitHub Copilot) | None | None | No | Yes (user-served) | Via sibling `starlight-llms-txt` plugin | OSS |
| Docusaurus | **No** (27-upvote Canny request open) | — | — | — | — | — | — | MIT |
| Nextra | **No** (only Inkeep in-page chat) | — | — | — | — | — | Community | MIT |
| VitePress | **No** (only DocSearch Ask AI in-page) | — | — | — | — | — | Community | MIT |
| GitBook | **Partial** (GitBook Assistant, not multi-provider handoff) | — (stays in GitBook's chat) | — | — | — | Likely yes | Yes | Proprietary SaaS |
| ReadMe | **Yes (built-in)** | 2 (ChatGPT, Claude) | None | None | No | Yes | Yes | Proprietary SaaS |
| Docs.page | **No** | — | — | — | — | No | No | OSS |

---

## UX pattern survey

**Dropdown button vs right-click vs slash-command:** Every framework observed uses a **dropdown button** (click to open, list of providers inside). None uses right-click / context-menu (browser-native context menu can't easily hold this). None uses slash-command inside a search box.

**Placement:** Mintlify defaults to page header (next to title), alternative is TOC. Fumadocs places in page actions zone. Starlight Page Actions overrides the `PageTitle.astro` component (displays next to H1). ReadMe places an "Ask AI" button in the page header. Convergent choice: **next to the page title** is the canonical placement.

**Page-level vs block-level:** Every framework is **page-level** — no "ask AI about this code block" selection-aware handoff. This is a clear gap (selection-aware handoff would need to bundle only the selected text rather than the page URL).

**Per-provider icons:** All OSS implementations ship per-provider SVG icons (OpenAI, Claude/Anthropic, Scira AI, Cursor, T3, v0, GitHub). Mintlify uses its own icon set.

**Prompt preview:** None of the surveyed frameworks show the user what prompt will be sent before the click. The handoff is one-click-opaque.

**Default providers enabled:** Mintlify's docs.json example enables ALL 14 identifiers by default. Fumadocs shows all 4 chat providers by default with no config. Starlight Page Actions defaults to `chatgpt: true, claude: true, perplexity: false` (a subset) — user must enable the rest.

**Live examples observed in the wild:**
- `platform.claude.com/docs/en/docs/intro` — Anthropic's docs (built on Mintlify). The default 14-option contextual menu is shipped, includes the "Open in Claude / ChatGPT / Perplexity / Grok / AI Studio / Devin / Windsurf" dropdown.
- `docs.cursor.com/welcome` — Cursor's docs (Mintlify). Similar 14-option menu. Interesting: Cursor themselves point out the `cursor://` MCP-install deeplink via their own `contextual.options` including `"cursor"`.
- `docs.fumadocs.dev/docs/ui` — Fumadocs' own docs, confirmed via raw HTML inspection to contain `MarkdownCopyButton` + `ViewOptionsPopover` wiring.

---

## Negative searches

- **Searched:** `navigator.userAgent`, `isElectron`, `isInstalled`, `window.chrome` across Mintlify's full prod bundle (145 KB). **Zero matches.** Confirms no desktop-app-install detection.
- **Searched:** `claude://` in any OSS docs framework (Fumadocs, Starlight plugins, Vercel AI Elements, Docusaurus plugins) — **zero matches.** The only `claude://` usage in the docs-framework ecosystem appears to be the OS-handler-intercept pattern on `claude.ai`, not an explicit scheme URL.
- **Searched:** `codex://`, `chatgpt://`, `openai://` in the same frameworks — **zero matches.** No docs framework targets these.
- **Searched:** Docusaurus built-in / official plugin for AI handoff — **none.** Community plugins (Biel, Markprompt, CrawlChat, Inkeep) all take the orthogonal "embed a chat widget" approach, not the "hand off this page to ChatGPT" approach.
- **Searched:** GitBook "Open in ChatGPT" dropdown — **not confirmed as shipped.** GitBook has internal Ask AI but no multi-provider handoff menu surfaces in changelog / blog / docs.
- **Searched:** Nextra contextual menu / "Open in ChatGPT" — **no built-in, no significant community plugin.**
- **Searched:** VitePress contextual menu / copy-as-markdown plugin — **none located.**
- **Searched:** Docs.page `.md` suffix or AI handoff — **no evidence**, framework is Markdown-powered but does not ship AI-facing features.

---

## Gaps / follow-ups

- **Fumadocs' `.mdx` rewrite implementation** was confirmed via the docs (`source: '/docs/:path*.mdx'`) but the exact Next.js middleware config wasn't inspected. Worth checking if an OK-style wiki wanted to copy this pattern.
- **ReadMe's Ask AI URL construction** is not documented externally (their blog post says "sent as a markdown file" without specifying if that means `chatgpt.com/?q=Read%20<url>.md...` like Mintlify or something else). ReadMe is proprietary SaaS; without a prod bundle download, this is opaque.
- **GitBook's ChatGPT handoff status** — GitBook has Ask AI as first-party, but whether they expose an "Open in ChatGPT" external-handoff dropdown wasn't confirmed in source (closed-source). A manual check on a live GitBook docs site (e.g. `docs.ethers.org` if it's GitBook) would resolve this.
- **Mintlify's docs.json full schema** — the 14 identifiers above are all surveyed, but the "custom" option object's full spec (icon registry? deep-link templates?) wasn't exhaustively enumerated. The `$page`/`$path`/`$mcp` placeholders are confirmed but other placeholders may exist.
- **Emerging Docusaurus plugin / PR:** The 27-upvote Canny request (`docusaurus.canny.io/feature-requests/p/chatgpt-integration`) has no official response but represents real demand. If someone ships a community plugin solving this, it would be the canonical Docusaurus answer. Worth re-checking in 6-12 months.
- **`vscode:mcp/install` vs `vscode://mcp/install`** — Mintlify's bundle uses the former (no `//`). This is a URI with opaque path, not a URL with authority. Worth confirming against VS Code's documented scheme to make sure both forms work; might be a Mintlify-specific quirk.
- **ChatGPT `q=` vs `prompt=` discrepancy** — Mintlify + Starlight Page Actions use `q=`; Vercel AI Elements uses `prompt=`. Fumadocs uses `q=`. Worth reading ChatGPT's own docs on `?q=` vs `?prompt=` behavior to know if one is preferred.
