# Changelog — deep-linking-ai-desktop-apps-2026

## 2026-04-16

### Initial report

- Created evidence files for D1 (Claude), D2 (Codex), D3 (Cursor) via primary binary inspection of `/Applications/{Claude,Codex,Cursor}.app` asar bundles.
- Dispatched parallel subagents for D5 (react-grab), D6 (Raycast), D4/D7/D9/D10 (handoff prior art).
- Synthesized findings into REPORT.md with 10-dimension coverage, cross-app comparison matrix, and secondary handoff-mechanism matrix.

### Audit resolutions (applied post-audit)

Audit findings file: [audit-findings.md](audit-findings.md). Resolutions applied to REPORT.md:

- **F1 [HIGH] resolved — `Sharpen`.** Changed "14-route enum" → "15-route enum" in three locations: Exec Summary Key Findings bullet, D1 Finding section, matrix "Total URL routes" row, and References evidence index. The verbatim `td` enum extract in `claude-desktop-deep-links.md` Finding 2 contains 15 keys (MagicLink, New, SSOCallback, McpAuthCallback, OpenConversation, OpenProject, Settings, AdminSettings, Customize, Create, Tasks, ClaudeCodeDesktop, Code, Resume, LocalSessions). Evidence file heading retained "~14" tilde but the report now matches the actual count.

- **F2 [HIGH] resolved — `Add conditions`.** Rewrote the exec-summary sentence about Perplexity to distinguish between ChatGPT (confirmed "does not accept `?q=`" via binary probe + OpenAI Community thread) and Perplexity ("undocumented grammar, not recoverable from read-only probing"). The D4 detail section was already careful; now the exec summary matches that register.

- **F3 [MEDIUM] resolved — `Sharpen`.** Distinguished Codex and Cursor in the D2 Finding heading: "Codex exposes the richest *per-URL semantics* (workspace-aware); Cursor has the *widest surface by route count* — 10 routes vs Codex's 7 — see D3." No more vocabulary drift between "richest" for both apps.

- **F4 [MEDIUM] not applied to REPORT.md** (the specific model-name claim only appears in the evidence file as an inline comment; the REPORT.md D6 discussion does not repeat specific model names, so the report is not exposed). Evidence file would benefit from an `AI.Model` enum extraction but this is a follow-up for a future update if the claim is ever cited downstream.

- **F5 [MEDIUM] accepted as-is.** Version strings (Claude 1.2581.0, Codex 26.406.31014) are stated in evidence prose with path references. Adding a verbatim `plutil -extract CFBundleShortVersionString` excerpt would upgrade CONFIRMED→CONFIRMED-with-shown-proof but was not critical for the report's conclusions. Noted for future probe refresh.

- **F6 [MEDIUM] resolved — `Add conditions`.** Softened "no `brew install pipe-to-claude` exists" claims in three locations (Exec Summary, D7, D9). Replaced with "no published CLI tool wrapping this pattern was found in extensive GitHub / npm / Homebrew searches" + explicit "Confidence: MEDIUM" label for the negative finding. Consistent with evidence's own confidence labeling.

- **F7 [LOW] resolved — `Sharpen`.** Added one-sentence narration to D6: "the evidence file enumerates 11 documented URL forms (multiple `extensions/...` variants per host)." Also changed matrix cell "6 hosts" → "6 first-segment hosts" for precision.

- **F8 [LOW] resolved — `Add conditions`.** Scoped "no tool in the ecosystem uses Codex's `path=`" to "no tool in the surveyed sample" in both Exec Summary Gap 1 and D5 Decision triggers. Matches evidence's "in my sample" scope.

- **F9 [LOW] resolved — `Sharpen`.** Added "surveyed" qualifier to "Mintlify most thoroughly-engineered open reference" in Exec Summary and D5 opening — matches evidence file's "in my sample" / "I surveyed" wording.

**Confirmed claims (per audit):** Claude `?q=` works; `chatgpt://?q=` does NOT work; Codex params (`prompt`, `path`, `originUrl`); Cursor params (`text`, `workspace`, `mode={ask,agent,debug,plan}`); CursorJack hardening (confirmation modal + 10K-char cap + obfuscation-aware denylist); react-grab has ZERO URL-scheme construction; react-grab 6,983 stars; ChatGPT 4 App Intents; Perplexity 8 App Intents; Claude/Codex/Cursor ship 0 App Intents; NSServices absent in all 5 apps; AppleScript dictionaries absent in all 5 apps; prompt-param naming matrix (all 6 entries); Codex 7 URL routes; Cursor 10 URL routes; Raycast 6 first-segment hosts.

---

## 2026-04-16 (Path C additions — OK-relevance deep dives)

Two follow-up research directions added per user request:

### Added: `evidence/docs-site-handoff-landscape.md` (530 lines)

Deep dive on the docs-framework category — OK's closest peer set. Covers Mintlify (full 14-identifier `contextual.options` schema), Fumadocs (`MarkdownCopyButton` + `ViewOptionsPopover`), Docusaurus (no feature; 27-upvote Canny request open), Starlight (`starlight-page-actions` — only GitHub Copilot handoff found anywhere), Vercel AI Elements `<OpenIn>` (uses `prompt=` for ChatGPT — inconsistent with Mintlify's `q=`), ReadMe Ask AI (ChatGPT + Claude only), GitBook (in-page chat only, no handoff), Nextra / VitePress / Docs.page (nothing). **Verdict: web-first industry-wide; Mintlify-Windsurf is the only desktop URL scheme used for chat handoff across all frameworks surveyed. Zero install-detection code found.**

**Factual update to report:** Mintlify's full schema has **14 identifiers**, not just the 7-provider chat dispatcher (`ee()` function) that the prior evidence pass characterized. The full set is 7 chat providers + 4 MCP-install targets + `copy` / `view` / `assistant`. The prior report text wasn't wrong (7 providers *for chat*) but undersold the breadth. REPORT.md §Executive Summary and §D5 Mintlify findings updated to reflect the 14-identifier schema.

### Added: `evidence/raycast-prompts-chat-registry.md` (390 lines)

Full extraction of the `prompts-chat` Raycast extension registry — actual count is **28 platforms, not "30"** (README rounds to "25+"). Three structural findings:

1. **Primary runtime branch is `platform.supportsQuerystring`, not `isDeeplink`.** The `isDeeplink` field is declared in the registry but never read at runtime — it's documentation metadata only. Critical implementation detail for anyone building a similar registry.
2. **Clipboard fallback is strictly user-visible "copy + open + paste ⌘V"** — no AppleScript, no accessibility API, no bundle-id targeting. Scheme/app routing relies on macOS `LSHandlers`.
3. **`?q=` is the safe default URL param** — used by 8 of 18 auto-fill platforms. `prompt=` is second at 8 of 18 (predominantly code-gen tools). `text=` is Cursor-specific.

**Overlap with Mintlify's 7:** only ChatGPT, Claude, Perplexity. Different product shapes (chat-launcher vs docs-site) produce different registries; reading both gives near-complete coverage of the 2026 multi-provider space.

### REPORT.md updates (surgical, not a rewrite):

- Exec Summary: added two new bullets — (i) docs-framework category is web-first industry-wide, (ii) `?q=` is the safe default URL param.
- §D5 (prior-art tools): added "broader docs-framework landscape" table with 10 frameworks + per-framework shape / provider list / license; added OK placement implications (situates OK in the docs-framework cluster with Mintlify/Fumadocs/Starlight as direct peers).
- §D6 (Raycast): corrected platform count from "~30" to 28; added `supportsQuerystring` vs `isDeeplink` distinction; added clipboard-fallback mechanism description; added 28-platform distribution table.
- §References: added pointers to both new evidence files.

No Path C audit was run — the additions are primary-source extractions (Mintlify bundle + `prompts-chat` repo) with high-fidelity citations rather than synthesis that would benefit from an audit pass.

---

## 2026-04-16 (Path C round 2 — exhaustion check: extended editors + Codex news)

User asked: "did we fully exhaust the desktop options?" plus specific request to cover Zed + JetBrains + Windsurf + VS Code full surface AND to check for recent Codex announcements. Three parallel subagents + one Codex news review.

### Added: `evidence/zed-and-jetbrains-deep-links.md` (279 lines)

**Key findings:**
- Zed has full `zed://` scheme with ~10 documented subpaths verified from Rust source
- **`zed://agent?prompt=<text>` is first-class** — PR #47959 merged 2026-01-29; parsed into `OpenRequestKind::AgentPanel`; dispatches via `new_external_thread_with_text`. Third editor (after Codex + Cursor) with URL-based agent prompt seeding.
- JetBrains: per-product (`idea://` since 2014) + umbrella `jetbrains://<tool>/<route>` via Toolbox `jetbrainsd` daemon + `jetbrains-gateway://`. YouTrack TBX-3965 still open (no official docs).
- **JetBrains AI Assistant + Junie both chose IPC+CLI over URL schemes** — meaningful product-design divergence. Junie uses ACP (same protocol Zed pioneered).

### Added: `evidence/vscode-windsurf-dia-deep-links.md` (558 lines)

**Key findings:**
- VS Code: 4 user-facing route families (file, extension-authored via `registerUriHandler`, settings, profile) + 29 internal `schemas/*` + separate `vscode-remote://` scheme. No Copilot Chat deep-link.
- **`vscode:mcp/install?<url-encoded-JSON>`** — opaque URI form (no `//`, no authority — parallel to `mailto:`/`data:`). Shipped VS Code 1.99 (April 2025). Paired with `code --add-mcp "<json>"` CLI.
- Architectural split surfaced: **MS opaque-URI pattern vs Cursor's authority-URI overlay on extension routing.** Both valid; different tradeoffs documented.
- Windsurf: only `windsurf://cascade?prompt=<text>` confirmed (via Mintlify bundle); undocumented in vendor docs. No official CLI.
- Dia: does NOT register any custom scheme externally (only http/https browser role). Internal `dia://` is address-bar-only browser-chrome navigation. Dia is a **consumer** of AI handoff, not a provider — it constructs outbound `claude.ai/new?q=`, `chatgpt.com/?q=`, `perplexity.ai/search?q=` URLs but its own AI isn't URL-seedable.

### Added: `evidence/codex-recent-announcements.md` (172 lines)

**Key findings:**
- **Codex Desktop 26.415 released 2026-04-16** — the D2 binary probe captured 26.406 (April 10); 9 days / 1 major release stale. New capabilities: Computer Use (macOS app driving via accessibility), In-App Browser (Atlas integration), 111 curated plugins (up from ~20 at March 26 launch), Chats (projectless threads), Thread Automations, Pull Request Integration, Memory Preview, Image Generation (gpt-image-1.5), first Intel Mac support. URL scheme presumed unchanged — no announcement of new `codex://` routes. Plugin install is CLI-driven (`codex marketplace add <url>`), NOT URL-scheme-driven — contrasts Cursor and VS Code.
- **2026-03-19: OpenAI confirmed "superapp" consolidation plan** — merging ChatGPT + Codex + Atlas into one desktop client. Implies future scheme consolidation/deprecation.
- **2026-02-26: Linear shipped "Deeplink to AI coding tools"** — supports 9 tools (Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed) with customizable `{{issue.identifier}}` / `{{context}}` prompt-template variables. Missed in initial D7 pass. Linear's per-tool URL templates are not published; runtime-bundle inspection of linear.app would extract them. This is the single most actionable follow-up for OK's menu design.

### REPORT.md updates (surgical):

- **Exec summary: 4 new bullets** added — (i) Zed joins Codex + Cursor in URL-based agent prompt seeding; (ii) JetBrains + Junie's IPC+CLI divergence from URL-scheme pattern; (iii) Microsoft's `vscode:mcp/install?<json>` opaque-URI vs Cursor's authority-URI architectural split; (iv) Codex 26.415 + superapp plan; (v) Linear prior-art gap.
- **New section "Post-publication addenda"** inserted between §"Limitations & Open Questions" and §"References" — three addenda (A: extended editors, B: Codex 26.415 + superapp, C: Linear missed prior art). Addenda extend coverage rather than modifying D1-D10 (which remain intact).
- **References section:** four new evidence files added with one-line descriptions.

**Cross-cutting observations from this round:**
- The URL-scheme-with-prompt-param pattern is converging across editor-class apps (Codex, Cursor, Zed all accept it). ChatGPT and Perplexity chose App Intents. JetBrains and Junie chose IPC+CLI. Three distinct product philosophies.
- The architectural split between opaque-URI MCP install (`vscode:mcp/install?...`) and authority-URI MCP install (`cursor://.../mcp/install?...`) is a concrete design decision OK will face if it ships its own scheme.
- Linear's 9-tool deep-link feature is functionally parallel to what OK would ship — its URL templates would be direct references.

**No Path C audit run** in this round either — primary-source extractions with full citations; audit pass would catch synthesis errors but this round is heavy on raw-evidence capture with light synthesis in the addenda.

---

## 2026-04-17 (Path C round 3 — strongest-ROI follow-ups executed at max effort)

User invoked max effort and asked to execute all three ranked follow-ups: (1) Linear runtime-bundle extraction, (2) Codex 26.415 fresh probe, (3) Zed MentionUri/ACP deep dive. Three parallel subagents dispatched; all three produced primary-source evidence files.

### Added: `evidence/linear-ai-deeplinks-extraction.md` (407 lines)

Binary-level extraction of Linear's production AI-coding-tool registry from `https://static.linear.app/client/assets/AIActions.B5r9dZjO.js` (2.78 MB bundle, last-modified 2026-04-17 00:40 UTC, sha1 prefix `918d26c327fd`). Full switch-case verbatim + per-tool URL templates.

**Major findings:**
- Registry grew from 9 tools at launch to **19 tools** (+7 post-launch additions: Amp, Devin, Factory, Lovable, Netlify, Warp, Windsurf; +3 user-defined: customUrl, customTerminalScript, codexCli)
- **4 of 19 tools are CLI-invoked via Electron IPC** (`runTerminalCommand`), not URL-based: Claude Code, Codex CLI, OpenCode, Amp — OK's registry must treat shell-exec as first-class peer to URL schemes or lose these tools
- 8 desktop schemes (`codex://`, `conductor://`, `cursor://anysphere.cursor-deeplink/`, `factory-desktop://`, `vscode://github.copilot-chat`, `warp://linear/work`, `windsurf://cascade`, `zed://agent`) + 5 web URLs (Devin, Lovable, Netlify, Replit, v0)
- Server-side `{{issue.identifier}}` / `{{context}}` substitution via GraphQL `IssuePromptContext`; client receives pre-rendered string
- Per-tool URL-length caps (2000 default, 8000 for Cursor + GitHub Copilot, uncapped for Conductor/Factory/Warp/Windsurf) with binary-search truncator + visible footer `[Truncated. Full issue available in Linear.]`
- **Double `encodeURIComponent(encodeURIComponent(e))` for Cursor, GitHub Copilot, Windsurf** — compensating for nested OS + extension-router handlers
- Replit uses **lz-string `compressToEncodedURIComponent` compression** to fit under 2 KB cap
- **No Claude Desktop entry** — Claude Code (CLI) is the only Anthropic-tool entry. Intentional product choice.

### Added: `evidence/codex-26415-probe.md` (564 lines)

Fresh DMG probe of Codex Desktop 26.415.20818 (released 2026-04-16, asar SHA256 `5e8423d4df65bc7af56701e76fc28c6431d5dcaf63c54cc60708675e315e7d8d`) with byte-level diff against the prior 26.406 evidence.

**Verdict: `codex://` URL scheme byte-for-byte stable.**

- `Z9` URL parser — same 7 branches (`settings`, `skills`, `automations`, `connector`, `new`, `threads`, default→null)
- `$9` newThread param parser — same 3 params (`prompt`, `originUrl`, `path`). Zero additions.
- Dispatcher — same 6 route kinds
- Plugin install URL: **STILL ABSENT** (CLI + IPC only via `codex marketplace add` + Rust app-server JSON-RPC). Explicit divergence from Cursor + VS Code.
- App Intents: **STILL ABSENT** (unchanged from 26.406 — Codex + Cursor + Claude all lack them; only ChatGPT and Perplexity have them)
- **Computer Use is Apple-Events-driven, not accessibility-API-driven** as 9to5Mac implied — separate sub-app at `Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/` with bundle id `com.openai.sky.CUAService` and `com.apple.security.automation.apple-events` entitlement
- In-app browser has no URL-scheme interception; `https://` still goes to `shell.openExternal` → OS default browser
- New CLI: `codex marketplace add <owner/repo>` subcommand
- Only dispatcher delta: `connectorOAuthCallback` now calls `showPrimaryWindow(hostId, {stealFocus:true})` as UX polish

### Added: `evidence/zed-mentionuri-acp-dive.md` (444 lines)

Deep dive into Zed's dual-router architecture (external `OpenRequest::parse` + internal `MentionUri::parse`), the Agent Client Protocol, and security patterns.

**Major findings:**
- **MentionUri has 12 variants**: `File`, `PastedImage`, `Directory`, `Symbol`, `Thread`, `Rule`, `Diagnostics`, `Selection`, `Fetch`, `TerminalSelection`, `GitDiff`, `MergeConflict`. Enum started 2025-08-12, grows ~1 variant every 3 weeks.
- **ACP transport**: JSON-RPC over stdio (stable), streamable HTTP (draft). Rust crate `agent-client-protocol@0.10.4` with 1.28M crates.io downloads; TS package 14.4K weekly. **4 ACP-compatible agents** as of April 2026: Gemini CLI, Claude Agent, Codex CLI, GitHub Copilot.
- **Disambiguation is STRUCTURAL, not code-level** — two separate parsers in two crates (`OpenRequest::parse` in `open_listener.rs`, `MentionUri::parse` in `acp_thread/mention.rs`); never called from the same code path. Sub-path partition `/agent/shared/<uuid>` (external-only) vs `/agent/{thread,rule,symbol,…}` (internal-only) maintained by convention, not type system.
- **Security: `ExternalSourcePrompt` newtype with sanitizing constructor** — strips bidi control chars (CVE-2021-42574 Trojan-Source defense), removes disallowed control chars, collapses newline runs > 2, normalizes CRLF. Single highest-ROI pattern surfaced across the whole research for OK to adopt.
- Slash commands being removed (PR #52757, 2026-03-31) in favor of Agent Skills — ACP action dispatch is on JSON-RPC (`session/update`, `session/request_permission`), never URL-shaped

### REPORT.md updates (surgical):

- **Exec summary: 3 new bullets** capturing the headline findings from Linear (19-tool registry with 4 CLI-via-IPC entries), Codex 26.415 (byte-stable), and Zed (ExternalSourcePrompt security pattern + anti-pattern warning against two-parsers-in-different-crates)
- **New "Addendum D" inserted** with three subsections (D.1 Linear, D.2 Codex 26.415, D.3 Zed MentionUri/ACP) after Addendum C — each subsection has its own mini-synthesis pointing to the detailed evidence file
- **References section:** four new evidence-file pointers

### Cross-cutting observations from this round

1. **The full tool universe for AI coding handoff in 2026 is ~19–28 tools**, depending on how you count. Linear's 19 + `prompts-chat`'s 28 + Mintlify's 14 + Raycast's production extensions catalog the majority of the visible ecosystem. Most overlap; the additive combined set is ~30 tools.
2. **Three handoff mechanisms coexist in production**: URL scheme (most tools), web URL (where the tool has a web client), CLI via IPC (terminal-native tools). OK's registry must support all three from day 1.
3. **Codex is stable; don't over-weight the superapp consolidation announcement.** Despite 9 point releases and major feature additions, the URL scheme is literally unchanged. The superapp plan is multi-quarter; integrators don't need to gate shipping on it.
4. **The security story is underdeveloped in most of the surveyed tools.** Cursor has the CursorJack-hardened confirmation modal + obfuscation-aware validation; Zed has ExternalSourcePrompt sanitization. Most other tools (Codex, Claude Desktop, Linear's 19 entries, Raycast prompts-chat) have no documented prompt-injection or bidi-control defense. If OK ships a handoff payload builder, **adopt Zed's `ExternalSourcePrompt` pattern proactively** — single-newtype-at-boundary, constructor-enforced sanitization.
5. **URL-scheme registration volume has stopped growing by adding new routes to existing schemes.** Instead: new features ship as IPC-only (Codex plugin marketplace), separate sub-apps (Codex Computer Use), or JSON-RPC methods (ACP). URL schemes are becoming "launch + handoff-with-payload" primitives, not general action-dispatch layers. OK should design the scheme for that narrow purpose.

**Still no Path C audit run** — three rounds of primary-source-heavy additions. If the report is going into a spec-driving workflow, an audit against the cumulative synthesis (including all four addenda) would catch any cross-evidence inconsistencies introduced during integration.

---

## 2026-04-17 (Cumulative audit + resolutions for round-3 synthesis drift)

User requested an audit after the three rounds of Path C additions. Nested audit agent loaded `/gtm:audit` and produced [audit-findings-round3.md](audit-findings-round3.md) with 8 findings (1 High, 4 Medium, 3 Low). All High + Medium + Low findings resolved with surgical edits:

- **F1 [HIGH] resolved — `Sharpen`.** Linear launch-set listing contradicted the 2026-02-26 announcement quote. REPORT.md Addendum D.1 reconciled: "Original 9 at launch (Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed) + 8 post-launch built-in additions (Amp, Codex CLI, Devin, Factory, Lovable, Netlify, Warp, Windsurf) + 2 user-defined (customUrl, customTerminalScript) = 19 total." Matches the verbatim registry extraction at `linear-ai-deeplinks-extraction.md:63-102` and the announcement quote at `codex-recent-announcements.md:120`.

- **F2 [MED] resolved — `Recalibrate`.** Exec Summary line 56 "single most important security pattern surfaced across the whole research" recalibrated to "Zed's `ExternalSourcePrompt` newtype-at-boundary is a high-ROI security pattern worth adopting." Added cross-references to complementary-but-different security patterns (CursorJack confirmation modal, Linear binary-search truncator, Raycast per-category opt-in toggles) so readers see the full security landscape instead of a ranked conclusion. Matches the more scoped framing in the source evidence file.

- **F3 [MED] resolved — `Add conditions`.** "Byte-for-byte stable" for Codex 26.415 softened to "semantically stable" in exec summary bullet and D.2 section heading. Exec summary bullet also clarified: "routing logic is byte-for-byte equivalent; Vite regenerated bundle hashes and minifier renamed helper functions, but no route kinds, parser branches, or param names changed." Matches evidence-file phrasing "byte-for-byte equivalent in semantics" at `codex-26415-probe.md:528`.

- **F4 [MED] resolved — `Sharpen`.** "9to5Mac's 'accessibility' framing was imprecise" reframed to attribute the correction to our own Round 2 synthesis rather than 9to5Mac: "Our round-2 `codex-recent-announcements.md` synthesis described this as 'accessibility/visual interaction' — the 26.415 probe corrects that…" Matches what the evidence actually supports.

- **F5 [MED] resolved — `Sharpen`.** "4 of 19 tools are CLI-invoked" corrected to "5 of 19 registry entries use shell-exec: 4 built-in tools (Claude Code, Codex CLI, OpenCode, Amp) + 1 user-defined hook (customTerminalScript)." Applied in Exec Summary, Addendum D.1 distribution table, and the "architectural insights" numbered list. Strengthens (not weakens) the "shell-exec must be first-class" conclusion.

- **F6 [LOW] resolved — `Sharpen`.** Exec Summary Key Findings bullet tightened: "Raycast — 6 URL hosts" → "6 first-segment hosts across 11 documented URL forms." Matches the precision already applied in the matrix + D6 per the baseline audit's F7 resolution.

- **F7 [LOW] resolved — `Sharpen`.** Zed "~10 documented subpaths" tightened to "9 documented first-segment URL paths (file, ssh, extension, agent, agent/shared, schemas, settings, git/clone, git/commit) plus a `https://zed.dev/channel/...` fallthrough." Applied in Addendum A and in the References section description.

- **F8 [LOW] resolved — `Acknowledge ambiguity`.** `codex-recent-announcements.md` Finding 1 annotated with an Update block at the top pointing to the Round 3 correction: "Computer Use mechanism corrected in follow-up probe — see `codex-26415-probe.md` Finding 9: substrate is AppleScript / Apple Events, not the accessibility API." The original round-2 synthesis phrasing is preserved below the annotation (auditable history) but the contradiction is surfaced to any reader traversing both evidence files.

**Confirmed claims (per cumulative audit — held across all three rounds):** Linear registry count 19 (binary-verified); `claude://` absent from Linear bundle (exhaustive negative search); Computer Use Apple-Events entitlement verified at `codex-26415-probe.md:391-400`; Codex 26.415 URL parser same 7 branches + same 3 params in `$9`; plugin install is IPC+CLI only; App Intents still absent; MentionUri 12 variants (Rust enum verbatim); 4 CLI-invoked tools in Linear registry (narrow headline count — Amp, Claude Code, Codex CLI, OpenCode); double-encoding for Cursor/Copilot/Windsurf; Replit uses lz-string compression; 2K default / 8K for Cursor+Copilot URL length caps; binary-search truncator with visible footer; server-side GraphQL `{{context}}` resolution; ACP JSON-RPC over stdio (stable); Rust crate 1.28M crates.io downloads; `zed://agent?prompt=` via PR #47959; `ExternalSourcePrompt` newtype sanitization (Rust source verbatim); Mintlify 14-identifier schema consistent across files; `prompts-chat` 28 platforms consistent; all 14 evidence files accurately referenced.

Report state after resolution: ship-ready for downstream consumption (spec, design discussion, product decision). Full audit-findings file preserved at [audit-findings-round3.md](audit-findings-round3.md).
