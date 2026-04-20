# Evidence: Codex Recent Announcements (March 26 — April 16, 2026)

**Dimension:** Post-publication update to D2 (Codex Desktop) + D5 (prior-art ecosystem)
**Date:** 2026-04-16 (same day as major announcement)
**Sources:** OpenAI Codex changelog (`developers.openai.com/codex/changelog`), 9to5Mac, VentureBeat, Linear, community coverage

**Staleness note:** The prior D2 binary inspection (evidence/codex-desktop-deep-links.md) was based on Codex Desktop version `26.406.31014` from 2026-04-10. Today's release is version **`26.415`** (2026-04-16) — the binary probe findings in the prior evidence file may be stale for new features introduced between 26.406 and 26.415. Re-probing would verify whether the `codex://` URL scheme surface has been extended. This evidence file captures announcement-level deltas only.

---

## Key sources referenced

- [OpenAI Codex changelog](https://developers.openai.com/codex/changelog) — official release notes (access 2026-04-16)
- [9to5Mac — Codex app adds three key features](https://9to5mac.com/2026/04/16/openais-codex-app-adds-three-key-features-for-expanding-beyond-agentic-coding/) — same-day analysis (access 2026-04-16)
- [VentureBeat — Codex desktop for macOS multiple agents](https://venturebeat.com/orchestration/openai-launches-a-codex-desktop-app-for-macos-to-run-multiple-ai-coding) — launch analysis
- [Engadget — Codex update builds superapp groundwork](https://www.engadget.com/ai/openais-latest-codex-update-builds-the-groundwork-for-its-upcoming-super-app-170000019.html)
- [DevOps.com — OpenAI autonomous team model with Codex Desktop Launch](https://devops.com/openai-shifts-toward-autonomous-team-model-with-codex-desktop-launch/)
- [Linear changelog — Deeplink to AI coding tools](https://linear.app/changelog/2026-02-26-deeplink-to-ai-coding-tools) (access 2026-04-16)
- [OpenAI plugin marketplace launch — Codex Plugins docs](https://developers.openai.com/codex/plugins)

---

## Finding 1: Codex Desktop version `26.415` shipped 2026-04-16 with three new capability categories

**Confidence:** CONFIRMED
**Evidence:** OpenAI Codex changelog + 9to5Mac reporting:

> "The primary update expanded Codex's capabilities as a comprehensive workspace tool. Key features include:
> - In-App Browser: early in-app browser allowing users to preview local or public pages without sign-in and comment directly on rendered output
> - Computer Use: Enables Codex to operate macOS applications through visual perception and interaction capabilities
> - Chats: Projectless threads for research and planning work outside codebases
> - Thread Automations: wake up the same thread on a schedule while preserving conversation context
> - Pull Request Integration: Direct inspection and review of GitHub PRs within the app sidebar"
> — Codex changelog, April 16 2026

> **Update (2026-04-17 — superseded by 26.415 binary probe):** The phrase "accessibility/visual interaction" in the bullet below was our synthesis from announcement coverage. The fresh 26.415 binary probe in [codex-26415-probe.md](codex-26415-probe.md) Finding 9 corrects this: Computer Use is implemented as a separately-codesigned sub-app (`com.openai.sky.CUAService`) with the `com.apple.security.automation.apple-events` entitlement — the substrate is **AppleScript / Apple Events**, not the accessibility API. No `NSAccessibilityUsageDescription` is declared on either the main Codex app or the CUAService sub-app. The high-level characterization (Codex can drive other macOS apps) is correct; the mechanism description ("accessibility") was imprecise.

**Implications for the report:**
- The **In-App Browser** is Atlas technology integrated into Codex. Codex can now route `https://` URLs internally (to preview localhost / public pages) instead of bouncing to the external browser.
- **Computer Use** inverts part of the deep-link analysis: instead of external tools handing off TO Codex, Codex can now drive OTHER desktop apps via accessibility/visual interaction ("see, click, and type into your Mac apps, with its own cursor"). This is OpenAI's answer to Anthropic's Computer Use.
- Thread Automations + Memory Preview introduce persistence semantics that mean a deep link could, in principle, target a specific automated thread by ID. The current `codex://threads/<uuid>` route (confirmed in prior evidence) likely covers this.
- This release is also **first to support Intel Macs** — prior builds were Apple Silicon only.

### Quote: Computer Use capability description

> "Computer use lets Codex operate macOS apps by seeing, clicking, and typing, which helps with native app testing, simulator flows, low-risk app settings, and GUI-only bugs."
> — Codex changelog

---

## Finding 2: OpenAI announced a ChatGPT + Codex + Atlas "superapp" consolidation on 2026-03-19

**Confidence:** CONFIRMED
**Evidence:** Multiple outlets confirm OpenAI's March 19, 2026 confirmation of a Wall Street Journal report that it would merge the ChatGPT application, the Codex coding platform, and the Atlas browser into a single desktop "superapp." From engadget.com:

> "OpenAI's latest Codex update builds the groundwork for its upcoming super app"
> — Engadget headline, 2026-04-16

The superapp plan aligns with today's announcement: Codex gaining an in-app browser (Atlas technology integration) and Computer Use (ChatGPT-Desktop-style GUI interaction) is incremental movement toward one unified desktop client.

**Implications for the report:**
- In some future version, the current `codex://`, `chatgpt://`, `openai://`, `com.openai.chat://` schemes may consolidate or deprecate into a single scheme.
- The "ChatGPT Desktop does not accept `?q=<prompt>`" finding from D4 could change if a unified app adopts Codex's (`?prompt=`) convention.
- Near-term stability question for any tool OK builds that hardcodes `chatgpt://` vs `codex://` vs `openai://` — expect churn.

---

## Finding 3: Codex Plugin Marketplace launched 2026-03-26 with enterprise controls added 2026-03-31

**Confidence:** CONFIRMED
**Evidence:** [The New Stack — OpenAI's Codex gets plugins](https://thenewstack.io/openais-codex-gets-plugins/) + [Unite.AI — Codex plugin marketplace](https://www.unite.ai/openai-adds-plugin-marketplace-to-codex/) + [WinBuzzer — enterprise controls](https://winbuzzer.com/2026/03/31/openai-launches-plugin-marketplace-codex-enterprise-controls-xcxwbn/):

> "OpenAI launched plugins for Codex on March 26, 2026, packaging skills, MCP servers, and app integrations into shareable, installable bundles across the Codex app, CLI, and IDE extensions."

> "More than 20 plugins from partners including Slack, Figma, Notion, and Sentry are available at launch, working across Codex's desktop app, CLI, and VS Code extension."

By today's 2026-04-16 release, this has grown to 111 curated plugins (per 9to5Mac):

> "OpenAI is releasing a curated collection of 111 additional Codex Plugins that combine skills, app integrations, and MCP servers to extend Codex's capabilities."

Plugin catalog priority order (per OpenAI docs):
1. Official OpenAI directory
2. Repo-scoped marketplace
3. User-level marketplace

Installation paths added in April 2026: `codex marketplace add` supporting GitHub URLs, git URLs, local directories, and direct `marketplace.json` URLs.

Enterprise plugin governance via JSON policy files with three states per plugin: `INSTALLED_BY_DEFAULT`, `AVAILABLE`, `NOT_AVAILABLE`.

**Implications for the report:**
- The plugin system is analogous to (and structurally parallels) Raycast Quicklinks + Claude's Customize/plugins/new URL route covered in D1 + D6.
- **No `codex://` URL scheme extension for plugin install was identified** as of 2026-04-16. Installation is CLI-driven (`codex marketplace add <url>`) and app-driven (Plugins panel → Add to Codex), not URL-scheme-driven. This is a structural difference from Cursor (which has `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<b64>` — see prior evidence `docs-site-handoff-landscape.md`).
- Third-party tools targeting Codex plugins should use the CLI `codex marketplace add <URL>` path, not a URL scheme.

---

## Finding 4: Codex CLI additions in April 2026 include marketplace + WebRTC voice + remote control

**Confidence:** CONFIRMED
**Evidence:** Codex changelog April 10 and April 15 entries:

> "**April 15, 2026 — Codex CLI 0.121.0**: Notable additions included marketplace plugin management, memory mode controls, MCP Apps tool calls, and symlink-aware filesystem metadata."

> "**April 10, 2026 — Codex CLI 0.119.0**: Major updates covered realtime WebRTC voice sessions, MCP Apps support with resource reads, and remote control capabilities via websocket transport."

New CLI flags / subcommands identified:
- `codex marketplace add` — plugin marketplace installation (documented above)
- `codex exec-server` — experimental subcommand (new)
- `--remote <ADDR>` — existing flag (already documented in prior evidence) now supports richer websocket transport

**Implications for the report:**
- The prior evidence D9 (CLI bridge) remains accurate: `codex app [PATH]` launches Desktop; `codex exec` is non-interactive; `codex mcp-server` runs MCP. Added: `codex marketplace add` for plugin installation.
- The `--remote` websocket flag enables remote control of a running Codex session — this is NOT a URL-scheme entry point but a complementary programmatic surface. Could be relevant for automation pipelines.

---

## Finding 5: Linear has shipped deep-link handoff to 9 AI coding tools since 2026-02-26 (prior-art gap we missed)

**Confidence:** CONFIRMED
**Evidence:** Linear changelog entry 2026-02-26, [linear.app/changelog/2026-02-26-deeplink-to-ai-coding-tools](https://linear.app/changelog/2026-02-26-deeplink-to-ai-coding-tools):

> "Supported AI Tools: Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, and Zed."

Invocation surfaces:
- Keyboard shortcut: `Cmd+Option+.` (Mac) or `Ctrl+Alt+.` (Win/Linux) for most-recent tool
- Menu: `W → O` to pick enabled tool
- UI button next to issue identifier

Payload: "the issue ID and all relevant context: description, comments, updates, linked references, and images."

Customization: Organizations can customize prompt templates using variables like `{{issue.identifier}}` and `{{context}}` to add standing instructions for coding agents.

**Implications for the report:**
- **This is major prior art we missed in the D7 handoff landscape pass.** Linear is a production SaaS product shipping the exact handoff pattern Open Knowledge is evaluating — issue content → AI coding tool of user's choice. 9 tools supported (broader than Mintlify's 7 or `prompts-chat`'s desktop-scheme subset).
- The `{{issue.identifier}}` / `{{context}}` variable pattern is a direct parallel to Raycast Quicklinks' `{Query}` / `{selection}` placeholders and is a *product-level* pattern worth studying for OK's wiki-content-to-AI-chat payload design.
- Linear does NOT publish its exact URL construction per tool (we couldn't confirm from the changelog post whether Linear uses `cursor://` vs `cursor.com/link/prompt`, `codex://` vs other), so this is a gap for follow-up probing. The feature exists; the specific URL templates would require inspecting the Linear web app's runtime bundle.

---

## Comparison table — what's new since prior D2 probe

| Capability | Codex 26.406 (April 10 — prior probe) | Codex 26.415 (April 16 — today) |
|---|---|---|
| `codex://` scheme | 7 routes (settings, skills, automations, connector, new, threads/new, threads/<uuid>) | Likely same (no changes reported) |
| Prompt seed via URL | `codex://new?prompt=<p>&path=<abs>&originUrl=<git>` | Same |
| CLI → Desktop | `codex app [PATH]`; `--open-project <path>` argv | Same + new `codex marketplace add <url>` for plugin install |
| Plugin marketplace | Existed (March 26 launch); ~20 plugins | **111 plugins curated; marketplace UI + enterprise policies** |
| In-app browser | Not present | **Yes — Atlas technology integrated; localhost + public page preview** |
| Computer Use | Not present | **Yes — Codex can drive macOS apps with its own cursor** |
| Thread automations | Not present | **Yes — scheduled thread wake-up** |
| Memory | Not present | **Memory preview — cross-session context retention** |
| Image generation | Not present | **Yes — gpt-image-1.5 built in** |
| Intel Mac support | Apple Silicon only | **First release with Intel Mac support** |

**No URL scheme additions** surfaced in announcement coverage. Plugin install is CLI-driven, not URL-driven.

---

## Negative searches

- **Searched:** `"codex://plugin"`, `"codex://install"`, `"codex://marketplace"` — zero results.
- **Searched:** Any new `codex://` route for Computer Use invocation (e.g., `codex://computer-use?app=...`) — zero results.
- **Searched:** Any unified scheme for the superapp (e.g., `openai://` unified with `codex://`) — no announcement.
- **Searched:** Linear's per-tool URL construction for its deep-link feature — not published; would require separate bundle inspection of `linear.app`.
- **Searched:** Any change to `codex://threads/<uuid>` semantics with the new Thread Automations feature — not addressed in changelog.

---

## Gaps / follow-ups

1. **Re-probe Codex Desktop 26.415's binary** (`/Applications/Codex.app/Contents/Resources/app.asar`) to verify whether the `Z9` URL parser (documented in prior evidence) has new route branches added for Computer Use, in-app browser, or plugin install. The prior evidence's URL parser extraction is from version `26.406.31014`; today's release is 9 days / 1 major release later.
2. **Inspect Linear's runtime bundle** to extract the per-tool URL construction for its "Deeplink to AI coding tools" feature. Linear supports 9 tools (Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed) — this is a broader registry than anything we've surveyed except `prompts-chat`, and the `{{issue.identifier}}` placeholder pattern is a direct product-level parallel to OK's needs. This could be the single most relevant prior-art addition to the report.
3. **Characterize the "superapp" transition risk.** If OpenAI merges `chatgpt://` + `codex://` + Atlas into a single scheme, tools targeting today's `codex://` will need migration guidance. Monitor for consolidation announcement.
4. **Verify whether `codex://` gained a plugin-install URL** analogous to Cursor's `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<b64>`. 26.415 binary probe would confirm/deny.
