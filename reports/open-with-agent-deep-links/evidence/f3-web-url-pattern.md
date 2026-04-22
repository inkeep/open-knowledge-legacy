# Evidence: F3 — Web-URL "Open in Claude" Pattern + Docs-Site Adoption (2026-04-21 follow-up)

**Dimension:** `https://claude.ai/new?q=...` and analogous web-URL prompt-pass patterns across LLM chat surfaces + docs-site adoption (Inkeep, Mintlify, etc.).
**Date:** 2026-04-21
**Sources:** anthropics/claude-code issues, OpenAI community forum, Mintlify docs, Oasis Security disclosure, Google AI Developers Forum, Anthropic Support docs, llmstxt.org

---

## Why this matters (product framing)

The user flagged `https://claude.ai/new?q=I%27d%20like%20to%20discuss%20the%20content%20from%20https%3A%2F%2Fdocs.inkeep.com%2Foverview.md` as a canonical example — a docs site (Inkeep) emits a plain HTTPS URL that opens claude.ai with a pre-filled prompt. This is a **universal** launch vector: works on mobile, desktop, any browser, no SDK, no custom scheme.

**The initial pass missed this class entirely** — we focused on desktop URL schemes (`cursor://`, `claude://`) and CLIs. The web URL is a separate, simpler, and more portable path. It also explains the "three-button dropdown" (Copy / View / Ask Claude) that's become standard on docs sites.

---

## 1. `claude.ai/new?q=<encoded>` contract

### Status
- **Historical CONFIRMED:** the `?q=` parameter on `claude.ai/new` was a working prompt pre-fill. Documented in user reports on [anthropics/claude-code#8827](https://github.com/anthropics/claude-code/issues/8827) where users flagged it broke around 2025-10-03 (later restored).
- **Security incident CONFIRMED:** [Oasis Security, Mar 18 2026 / updated Apr 6 2026](https://www.oasis.security/blog/claude-ai-prompt-injection-data-exfiltration-vulnerability) disclosed a prompt-injection / data-exfil vuln — HTML tags inside `q=` were invisible in the textarea but processed by Claude on submit. Anthropic fixed per their Responsible Disclosure Program.
- **Current status UNCERTAIN:** The user's own example (2026-04-21) implies it works. `curl -I https://claude.ai/new?q=test` returns 403 Cloudflare challenge, not a content response — cannot directly verify headless. Assume it works post-sanitization. Anthropic has **never publicly documented** the `?q=` parameter in docs.claude.com, support.claude.com, or platform.claude.com.

### Behavior (as known)
- **Pre-fill vs. auto-submit:** Historically auto-submitted per Oct 2025 regression reports. Post-Oasis-fix behavior is likely pre-fill only, unconfirmed.
- **Other params:** None documented. [anthropics/claude-code#19023](https://github.com/anthropics/claude-code/issues/19023) proposes `prompt=`, `repo=`, `branch=`, `env=` for *Claude Code on the Web* — that's speculative for that feature, not shipped.
- **URL length cap:** Undocumented. Browser practical caps: Chrome ~2MB, Firefox ~65K. Intermediate proxies / Cloudflare (which fronts claude.ai) typically truncate/reject at 2K–16K.
- **Login-flow persistence:** Unauthenticated user → claude.ai login → post-auth landing. The `?q=` persistence is unconfirmed; community anecdote is mixed.

### Implication for `openWithAgent`
- This is the **first truly universal prompt-pass mechanism** — works everywhere claude.ai works (any browser, mobile, desktop). Encodes prompt as URL query string; no dependency on native app or OS handler.
- Does NOT carry a directory (unlike `openWithAgent`'s full contract). But CAN carry a URL reference to the content the agent should read (see Inkeep pattern below).
- No auth / install / allowlist plumbing needed. Pure HTTPS outbound.

---

## 2. Does `https://claude.ai/new?q=...` deep-link into Claude Desktop?

**UNCERTAIN** — leaning **NO** based on absence of evidence.

- Official Claude Desktop install docs ([support.claude.com 10065433](https://support.claude.com/en/articles/10065433-install-claude-desktop), [deploy-claude-desktop-for-macos 12611117](https://support.claude.com/en/articles/12611117-deploy-claude-desktop-for-macos)) make no mention of `https://claude.ai/*` universal links or `apple-app-site-association`.
- The Claude Code CLI installer ships a URL-handler helper at `~/Applications/Claude Code URL Handler.app` registering only **`claude://`** (custom scheme for OAuth + `/desktop` handoff, per [#41015](https://github.com/anthropics/claude-code/issues/41015) and [#26197](https://github.com/anthropics/claude-code/issues/26197)). Confirmed in Andrew's `/Applications/` scan.
- [#26952](https://github.com/anthropics/claude-code/issues/26952): "Claude Desktop's Electron shell does not pass custom URL schemes to the OS" — narrow URL-handler surface.
- No `apple-app-site-association` reference confirming `claude.ai` as an associated domain.

**Working assumption:** `https://claude.ai/new?q=...` opens in default browser (not Claude Desktop) on macOS/Windows. Same behavior as Slack Desktop, Discord Desktop — they don't claim `https://` for arbitrary web routes.

If Anthropic later ships universal-link interception, it'd be transparent. Users on Desktop effectively get the browser path today.

**Implication for `openWithAgent`:** Even with Claude Desktop installed, the `claude.ai/new?q=` route opens a browser — which may be the desired UX anyway (no seating of the user in a native-app modal).

---

## 3. ChatGPT analog — `chatgpt.com/?q=` / `?prompt=`

**CONFIRMED both work** (community-discovered, not OpenAI-documented):
- [OpenAI Community — Query parameters in ChatGPT](https://community.openai.com/t/query-parameters-in-chatgpt/1027747) documents:
  - `?q={searchTerms}` — pre-fills textarea
  - `?prompt=...` — same behavior
  - `&hints=search` — routes to SearchGPT for Plus users
  - `&temporary-chat=true` — ephemeral chat
  - `&model=<name>` — **ignored when combined with `q=`** (falls back to gpt-4o) — see [this thread](https://community.openai.com/t/using-the-q-url-parameters-defaults-the-model-to-gpt4o-even-if-you-explicitly-pass-a-model-via-the-url-using-model/1074025)
- **Auto-submit:** NO — textarea populates; user must press Enter.
- `chat.openai.com` redirects to `chatgpt.com`; both accept `?q=`.

---

## 4. Other LLM chat surfaces

| Service | URL shape | Status |
|---|---|---|
| **Gemini** (`gemini.google.com/app`) | none native | Feature-requested, [77309](https://discuss.ai.google.dev/t/set-prompt-to-aistudio-via-url-query-parameter/77309), [73828](https://discuss.ai.google.dev/t/can-the-gemini-api-enable-a-website-to-open-the-gemini-site-with-a-text-prompt-pre-filled-by-that-website/73828). [Chrome extension](https://github.com/elliot79313/gemini-url-prompt) workaround. |
| **Google AI Studio** (`aistudio.google.com`) | `?model=<name>`, `?grounding=true`, `?temperature=` | No prompt pre-fill. |
| **Perplexity** (`perplexity.ai/search?q=`) | Works to prefill search query | Not officially documented but widely used (browser search engines). |
| **Mistral** | none documented | NOT FOUND. |
| **Grok** | `https://x.com/i/grok?text=<encoded>` | Per [@512x512 on X](https://x.com/512x512/status/1855674088666337301). `grok.com` does NOT support `?q=`. |

**Implication for `openWithAgent`:** The matrix has a clean subset that works universally — **Claude, ChatGPT, Perplexity, Grok** all accept a prompt via URL. Gemini requires a separate path (extension or Android app intent). Mistral has no surface.

---

## 5. Docs-site adoption — Mintlify ships this as a first-class feature

### Mintlify (CONFIRMED first-class)
- [Mintlify contextual menu docs](https://www.mintlify.com/docs/ai/contextual-menu) — config via `docs.json`:

```json
{
  "contextual": {
    "options": ["copy", "view", "chatgpt", "claude", "perplexity",
                "grok", "aistudio", "assistant", "devin",
                "windsurf", "cursor", "vscode", "mcp"]
  }
}
```

Thirteen built-in options covering: file actions (`copy`, `view`), LLM chat surfaces (`chatgpt`, `claude`, `perplexity`, `grok`, `aistudio`, `assistant`), agent-launcher (`devin`), editor/IDE launch (`windsurf`, `cursor`, `vscode`), and `mcp` (MCP server registration).

Custom entries: `{ title, description, icon, href: { base, query } }`.

Placeholders: `$page` (full page as markdown), `$path` (current path), `$mcp` (hosted MCP server URL).

Exact default URL templates aren't in the documentation prose — baked into Mintlify frontend JS. By community convention from custom configs: `chatgpt.com/?q=$page`, `claude.ai/new?q=$page`, `perplexity.ai/search?q=$page`.

### Inkeep (CONFIRMED URL-reference pattern)
From the user's sample URL: `https://claude.ai/new?q=I'd like to discuss the content from https://docs.inkeep.com/overview.md`.

Inkeep's pattern is a lighter variant of Mintlify's:
- Inkeep passes a **URL reference** to the docs page (`.md` suffix for the llms.txt plain-markdown variant) inside `q=`. Claude fetches the doc via its own web tooling.
- Mintlify passes the **full page markdown** inline.

**Trade-off:**
- URL-reference pattern (Inkeep): short URL; works for arbitrarily long docs; requires docs site to serve `.md` / llms.txt so Claude can fetch.
- Inline-content pattern (Mintlify): no fetch dependency; hits URL length caps on docs >~1500 chars.

For Open Knowledge specifically — which serves markdown-native content — the URL-reference pattern is natural fit.

### Origin
- [llmstxt.org](https://llmstxt.org/) — proposed 2024 — standardized the `.md` / `llms.txt` URL-suffix convention that enables the URL-reference approach.
- Mintlify documented the contextual-menu pattern formally in 2025.
- Inkeep and other docs vendors followed. Fumadocs, Docusaurus, GitBook don't ship this as a native feature as of 2026-04 (NOT FOUND).

---

## 6. Security + UX

- **Prompt-injection risk CONFIRMED.** Oasis disclosure proves `q=` was a real attack surface (HTML-hiding injection → exfiltration via tool calls). Anthropic fixed the specific vector. Any user-gen `q=` URL remains a social-engineering risk.
- **Feature request #19023** explicitly argues future URL-param support should pre-fill only, never auto-execute, with user confirmation. Matches Cursor's security posture (user confirms prompt URLs).
- **Long URL failure mode:** Cloudflare (fronts claude.ai) typically rejects >16K with 414. Browser practical caps: Chrome ~2MB, Firefox ~65K. Intermediate proxies often truncate at 2K–8K.
- **Inkeep's URL-reference pattern sidesteps length cap** — a short query like `"discuss https://docs.inkeep.com/overview.md"` lets Claude fetch the doc. Better for long docs than Mintlify's inline-markdown approach.

---

## 7. Reverse direction — Open Knowledge embedding "Ask Claude / ChatGPT" buttons

- A markdown renderer can trivially emit `https://claude.ai/new?q=${encodeURIComponent(prompt)}`. No SDK, no OAuth, no domain allowlist; plain HTTPS URL.
- Two canonical patterns:
  - **URL-reference (Inkeep):** `q="Discuss ${docUrl}.md"` — short, fetch-delegated.
  - **Inline-content (Mintlify):** `q=${encodeURIComponent(markdown)}` — zero fetch dependency; URL-length-bound.
- **UX placement (observational):** dominant shape is a **dropdown in page header or right-side TOC** labeled "Copy" or "Ask AI", listing ChatGPT / Claude / Perplexity / Copy-Markdown / View-Markdown. Inline buttons and context-menus are rare; dropdown is convergent.
- **Open Knowledge implication:** Emitting this button in the editor toolbar or docs renderer is a one-line addition per assistant. Security posture is "user-initiated navigation to a third-party chat with pre-filled prompt" — low-risk relative to MCP wire-up.

---

## Sources

- [anthropics/claude-code#8827 — claude.ai/new?q= broke Oct 2025](https://github.com/anthropics/claude-code/issues/8827) — accessed 2026-04-21
- [anthropics/claude-code#19023 — URL parameters for Claude Code on the Web (feat req)](https://github.com/anthropics/claude-code/issues/19023) — accessed 2026-04-21
- [anthropics/claude-code#26952 — Custom URL schemes](https://github.com/anthropics/claude-code/issues/26952) — accessed 2026-04-21
- [anthropics/claude-code#41015 — URL Handler app install location](https://github.com/anthropics/claude-code/issues/41015) — accessed 2026-04-21
- [Oasis Security — Claude AI Prompt Injection Data Exfiltration Vulnerability (Mar 18 / Apr 6 2026)](https://www.oasis.security/blog/claude-ai-prompt-injection-data-exfiltration-vulnerability) — accessed 2026-04-21
- [OpenAI Community — Query parameters in ChatGPT](https://community.openai.com/t/query-parameters-in-chatgpt/1027747) — accessed 2026-04-21
- [OpenAI Community — URL query param with initial message](https://community.openai.com/t/url-query-param-to-open-chat-with-initial-message/64167) — accessed 2026-04-21
- [OpenAI Community — q= defaults model to gpt-4o even with model= param](https://community.openai.com/t/using-the-q-url-parameters-defaults-the-model-to-gpt4o-even-if-you-explicitly-pass-a-model-via-the-url-using-model/1074025) — accessed 2026-04-21
- [combinatrix-ai/prompt-chatgpt-via-url-parameter](https://github.com/combinatrix-ai/prompt-chatgpt-via-url-parameter) — accessed 2026-04-21
- [Google AI Dev Forum — Gemini URL query param](https://discuss.ai.google.dev/t/can-the-gemini-api-enable-a-website-to-open-the-gemini-site-with-a-text-prompt-pre-filled-by-that-website/73828) — accessed 2026-04-21
- [Google AI Dev Forum — aistudio.google.com prompt via URL](https://discuss.ai.google.dev/t/set-prompt-to-aistudio-via-url-query-parameter/77309) — accessed 2026-04-21
- [elliot79313/gemini-url-prompt](https://github.com/elliot79313/gemini-url-prompt) — accessed 2026-04-21
- [Mintlify — Contextual menu documentation](https://www.mintlify.com/docs/ai/contextual-menu) — accessed 2026-04-21
- [llmstxt.org — /llms.txt proposal](https://llmstxt.org/) — accessed 2026-04-21
- [@512x512 on X — Grok URL template](https://x.com/512x512/status/1855674088666337301?lang=en) — accessed 2026-04-21
- [Anthropic Support — Install Claude Desktop](https://support.claude.com/en/articles/10065433-install-claude-desktop) — accessed 2026-04-21
- [LinkMyPrompt — Run a Prompt Through a URL](https://linkmyprompt.com/how-to-run-a-prompt-through-a-url-in-chatgpt-perplexity-grok-gemini-claude/) — accessed 2026-04-21
