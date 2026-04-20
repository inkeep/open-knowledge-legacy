# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/deep-linking-ai-desktop-apps-2026/REPORT.md`
**Audit date:** 2026-04-16
**Total findings:** 9 (2 High, 4 Medium, 3 Low)

Audit scope covered all seven areas flagged by the author plus a full-document coherence + factual pass. Evidence files at `evidence/{claude,codex,cursor}-desktop-deep-links.md`, `evidence/react-grab-and-similar-handoff-tools.md`, `evidence/raycast-ecosystem.md`, `evidence/handoff-prior-art.md` were read in full.

---

## High Severity

### [H] Finding 1: Claude "14-route enum" claim contradicts the enum listed in its own evidence file (15 keys)

**Category:** FACTUAL + COHERENCE
**Source:** L1 (cross-finding contradictions) + L4 (evidence-synthesis fidelity)
**Location:** REPORT.md §Executive Summary Key Findings bullet (line 39), §References evidence index (line 331), and matrix "Total URL routes" row (line 293, which says `14`).
**Issue:** The report asserts Claude Desktop has a "14-route enum (`td`)" in three places. The evidence file `claude-desktop-deep-links.md` Finding 2 extracts the `td` enum verbatim from the minified bundle — it contains **15 keys**: `MagicLink`, `New`, `SSOCallback`, `McpAuthCallback`, `OpenConversation`, `OpenProject`, `Settings`, `AdminSettings`, `Customize`, `Create`, `Tasks`, `ClaudeCodeDesktop`, `Code`, `Resume`, `LocalSessions`. The evidence heading itself says "~14 endpoints" with a hedging tilde, suggesting the subagent already sensed the ambiguity.
**Current text:** "Claude Desktop (`claude://`) — 14-route enum …" (line 39) and `| Total URL routes | 14 | 7 | 10 | …` (line 293).
**Evidence:** `evidence/claude-desktop-deep-links.md:36-54` (verbatim enum listing, 15 keys).
**Status:** CONTRADICTED
**Suggested resolution:** Change to "15-route enum" (or "15-entry enum") in the Key Findings bullet, matrix, and references index. Alternatively, if the report intends "14 *user-reachable* routes" (excluding the internal `Create` key), make that qualification explicit and keep the count.

---

### [H] Finding 2: "ChatGPT and Perplexity do not — their schemes launch the app only" overstates Perplexity's confirmed behavior

**Category:** FACTUAL
**Source:** L2 (confidence-prose misalignment) + L3 (missing conditionality)
**Location:** REPORT.md §Executive Summary paragraph 1 (line 31), §D4 detail (lines 116–134).
**Issue:** The executive summary claims both ChatGPT and Perplexity "do not [accept a prompt parameter] — their schemes launch the app only." For ChatGPT this is well-supported (binary probe + OpenAI Community thread quoted). For **Perplexity**, the evidence file explicitly disclaims this: Finding 7.3 is labeled "Confidence: PARTIAL," states "the exact path/parameter names are not recoverable from `strings`," and cites Imrat's 2024-10 X post that "Perplexity app has a deeplink URL schema — but right now its not documented, and i have not figured out how to use it." The evidence also notes `URLHandlerRegistry` and `OpenQueryDeepLinkIntent` strongly suggest a working (but undocumented) grammar. So "launch-only" is an overreach; the honest claim is "undocumented — not recoverable from read-only probing." The D4 detail section is more careful ("undocumented grammar") but the exec summary collapses this nuance.
**Current text (exec summary, line 31):** "ChatGPT and Perplexity do not — their schemes launch the app only, and prompt handoff goes through macOS App Intents (Shortcuts.app) instead."
**Evidence:** `evidence/handoff-prior-art.md` Finding 7.3 (Confidence: PARTIAL); `evidence/handoff-prior-art.md:402-432` narrative + `URLHandlerRegistry` strings; Imrat X post citation.
**Status:** CONTRADICTED (for Perplexity portion)
**Suggested resolution:** Rewrite the exec summary sentence to "ChatGPT does not [supported by probe]; Perplexity's `perplexity-app://` grammar is undocumented and not recoverable from read-only probing." The matrix already uses "— (undocumented)" for Perplexity's URL route count, which is the right register; propagate that register to the exec summary and D4 opening.

---

## Medium Severity

### [M] Finding 3: "Richest URL scheme" is attributed to both Codex and Cursor, creating reader confusion

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) + L6 (stance consistency)
**Location:** REPORT.md §D2 heading assertion (line 82: "Codex Desktop ... has the **richest** URL scheme of the three named apps") vs §D3 + Exec Summary (line 31: Cursor has "widest deep-link surface (10 routes)") and §D3 line 104 ("Cursor's breadth is the state of the art in 2026").
**Issue:** The evidence file `cursor-desktop-deep-links.md` Finding 3 explicitly states "Cursor's deep-link surface is the richest of the three apps studied in this report." The report uses "richest" for Codex (D2) but "widest" / "state of the art" for Cursor (D3 + Exec Summary). A careful reader will see the vocabulary drift: "richest" is claimed both ways in the artifact set (Codex per the report; Cursor per the evidence file). If the intended distinction is "Codex = richest *per-route* (workspace params)" vs "Cursor = widest *by count*," the report should state this explicitly. As written, the two adjectives are near-synonyms and create a contradiction.
**Current text (D2, line 82):** "Codex Desktop ... has the **richest** URL scheme of the three named apps."
**Current text (evidence cursor file):** "Cursor's deep-link surface is the richest of the three apps studied in this report."
**Evidence:** `evidence/cursor-desktop-deep-links.md:140` ("deep-link surface is the richest").
**Status:** INCOHERENT
**Suggested resolution:** Pick one distinction and state it precisely. Option A: "Codex exposes the richest *per-URL semantics* (workspace-aware handoff via `path=` / `originUrl=`); Cursor exposes the *widest surface by route count* (10 routes covering MCP install, rules, commands, PR review, settings, plugins, Glass)." Option B: Drop "richest" for Codex and say "most workspace-aware" instead.

---

### [M] Finding 4: "AI.ask() proxies ... including 'Claude 4.6 Opus' and 'GPT-5.x'" is asserted without citation evidence

**Category:** FACTUAL
**Source:** L7 (inline source attribution) + T3/T5 (3P verification)
**Location:** `evidence/raycast-ecosystem.md:238` (comment in a TS signature: `// 80+ variants: GPT-5.x, Claude 4.6 Opus/Sonnet, Gemini 3.1 Pro, Grok, Mistral, DeepSeek…`). The model-name list is repeated implicitly in REPORT.md §D6 discussion (line 188–189) — "The `AI.ask()` method is orthogonal — it goes API→API through Raycast's Pro backend and lands the response in the Raycast command."
**Issue:** Specific versioned model-name claims ("Claude 4.6 Opus/Sonnet", "Gemini 3.1 Pro", "GPT-5.x") are stated in the evidence file as a free-form inline comment with no citation to a specific page of Raycast's docs, no screenshot, and no enum dump from `@raycast/api`. The cited URL is `https://developers.raycast.com/api-reference/ai` but no quoted text or retrieval is shown. These exact model names are not independently verifiable from the evidence as captured. The report's D6 does not repeat the specific model names (so the report is less exposed), but the author flagged this in the audit brief as worth verifying — and it is indeed UNVERIFIABLE from the evidence package alone.
**Current text (evidence):** "80+ variants: GPT-5.x, Claude 4.6 Opus/Sonnet, Gemini 3.1 Pro, Grok, Mistral, DeepSeek…"
**Evidence:** `evidence/raycast-ecosystem.md:238` inline comment. No supporting quote from Raycast docs, no extracted `AI.Model` enum listing.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either (a) replace the speculative comment with a quoted excerpt from Raycast's `AI.Model` enum (readily extractable from `@raycast/api`'s TypeScript definitions via `cat node_modules/@raycast/api/types/*.d.ts | grep "Model ="`), or (b) generalize to "80+ variants across major providers" without naming specific versions. The report's D6 wording is already safer; only the evidence file needs the fix if this claim is ever cited downstream.

---

### [M] Finding 5: Claude version "1.2581.0" and Codex version "26.406.31014" are stated as facts but not shown verbatim from package.json in evidence

**Category:** FACTUAL
**Source:** L7 (inline source attribution)
**Location:** REPORT.md §D1 (line 61: "version 1.2581.0, `@ant/desktop`"); §D2 (line 82: "version 26.406.31014, `openai-codex-electron`"). Evidence files `evidence/claude-desktop-deep-links.md:5` and `evidence/codex-desktop-deep-links.md:5` state these versions in prose (sources block) but do not show the `package.json` `"version"` field verbatim; they reference the path but do not cat it. The evidence files do cite paths that would contain the version (`extracted/package.json`).
**Issue:** The specific version strings are used in the report without a raw excerpt. For a reader who wants to reproduce the probe or trust the version, the evidence package doesn't include a literal `grep "version"` output or `plutil -extract CFBundleShortVersionString …` command result. These are facts that either hold or don't — a one-line excerpt would upgrade them to CONFIRMED.
**Current text:** "Codex Desktop (version 26.406.31014, `openai-codex-electron`)" (REPORT.md D2).
**Evidence:** `evidence/codex-desktop-deep-links.md:5` (prose assertion with path reference but no verbatim excerpt).
**Status:** UNVERIFIABLE from evidence as packaged (likely CONFIRMED from the underlying files but not proven in the artifact set).
**Suggested resolution:** Add a one-line excerpt to each evidence file: `$ plutil -extract CFBundleShortVersionString raw -o - /Applications/Claude.app/Contents/Info.plist → 1.2581.0` and the equivalent for Codex. This is a low-effort verification step that converts the claim from "stated" to "shown."

---

### [M] Finding 6: "no `brew install pipe-to-claude` exists" in report is stated as fact; evidence has confidence MEDIUM (negative)

**Category:** FACTUAL
**Source:** L3 (missing conditionality) + L4 (evidence-synthesis fidelity)
**Location:** REPORT.md §Executive Summary (line 35: "Every user reinvents the 6-line `ask-claude()`...") and §D9 (line 256: "no tool wraps this as a `brew`-installable package") and §D7 (line 229: "**No published CLI tool wraps this** — no `brew install pipe-to-claude`, no `npx open-in-chatgpt`").
**Issue:** The report states this as a flat fact in three places. The evidence file `handoff-prior-art.md` Finding 6.2 is labeled "Confidence: MEDIUM (negative; exhaustive `github.com` search)" — i.e., the subagent explicitly flagged this as a best-effort negative search, not an exhaustive proof. Negative claims about the absence of any such tool on `brew`, `npm`, or GitHub cannot be definitively confirmed — only confirmed-not-found-in-searches-performed. The prose certainty ("no tool exists") exceeds the evidence confidence ("none found in exhaustive search").
**Current text:** "no `brew install pipe-to-claude` exists" (implicit framing across D7, D9, and Exec Summary).
**Evidence:** `evidence/handoff-prior-art.md` Finding 6.2, "Confidence: MEDIUM (negative; exhaustive github.com search)."
**Status:** STALE / INCOHERENT (confidence drift between evidence and synthesis)
**Suggested resolution:** Soften to "no widely-distributed `brew install pipe-to-claude` or equivalent has been found after exhaustive search" or "the category appears uncovered as of 2026-04-16 based on GitHub + npm + Homebrew search." This is consistent with the evidence's own confidence label and preserves the load-bearing point (gap in the ecosystem) without overclaiming non-existence.

---

## Low Severity

### [L] Finding 7: Raycast "6 hosts" — evidence lists 11 URL form rows which could confuse a reader not counting by first-segment

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** REPORT.md matrix (line 293: "6 hosts") and §D6 (line 185: "exposes 6 load-bearing hosts (`extensions/<author>/<ext>/<command>`, `script-commands/<slug>`, `ai-commands/<slug>`, `quicklinks/import`, `snippets/{import,create}`, `confetti`)").
**Issue:** The count of 6 is correct when counting first-segment hosts (`extensions`, `script-commands`, `ai-commands`, `quicklinks`, `snippets`, `confetti`). But the evidence file Finding 3 table shows 11 rows (5 variants of `extensions/...`, 1 `script-commands/`, 1 `ai-commands/`, 1 `quicklinks/import`, 2 `snippets/{import,create}`, 1 `confetti`). A careful reader cross-referencing the matrix to the evidence table may get confused without explicit narration.
**Current text:** "6 hosts" (matrix); "6 load-bearing hosts" (D6).
**Evidence:** `evidence/raycast-ecosystem.md:77-88` (11-row table).
**Status:** INCOHERENT (minor — reader-side)
**Suggested resolution:** In D6, add one sentence clarifying: "(11 documented URL forms across 6 first-segment hosts.)" — matches the evidence count AND preserves the cleaner number in the matrix.

---

### [L] Finding 8: "zero tools use Codex's `path=` param" is supported but the evidence scope is bounded to the reviewed sample

**Category:** FACTUAL
**Source:** L3 (missing conditionality)
**Location:** REPORT.md §Executive Summary paragraph 3 (line 35), §D5 Decision trigger (line 177), §D5 evidence gap 1 text (line 401 in evidence file).
**Issue:** The report claims "no tool in the ecosystem uses Codex's `path=` / `originUrl=` parameters." The evidence file `react-grab-and-similar-handoff-tools.md` Gap 1 correctly scopes the claim: "not leveraged by any handoff tool I found" — i.e., bounded to the reviewed sample (Mintlify, bookmarklets, react-grab, Raycast extensions, 6 comparable tools). A GitHub grep for `codex://new` with `path=` is shown in the negative search as "Zero matches" but the sample set is not exhaustive across npm/brew/all-github. The report's "no tool in the ecosystem" framing is slightly stronger than the evidence "no tool I found."
**Current text:** "no tool in the ecosystem uses Codex's `path=` / `originUrl=` parameters" (Exec Summary).
**Evidence:** `evidence/react-grab-and-similar-handoff-tools.md:399-401, 426` (scoped to "in my sample").
**Status:** STALE (minor)
**Suggested resolution:** Change to "no tool in our surveyed sample uses Codex's `path=` / `originUrl=` parameters" or "no widely-distributed tool appears to use..." This costs nothing in rhetorical force and is honest about the search scope.

---

### [L] Finding 9: "Mintlify most thoroughly-engineered open reference" — evidence caveats "in my sample" but report drops it

**Category:** FACTUAL
**Source:** L2 (confidence-prose misalignment)
**Location:** REPORT.md §Executive Summary paragraph 2 (line 33: "Mintlify ... is the most thoroughly-engineered open reference for the cold-launch pattern"), §D5 Finding text (line 170), and §D5 Implications (line 171: "Mintlify's code is the most complete open reference I surveyed").
**Issue:** The evidence file `react-grab-and-similar-handoff-tools.md` uses the qualifier "in my sample" when making this claim (line 255: "the **most thoroughly-engineered per-provider URL builder** in my sample" + line 416: "most thoroughly-engineered open reference I surveyed"). The D5 Implications line correctly preserves "I surveyed." But the Executive Summary drops the qualifier, presenting it as a category-wide claim. Given that the sample explicitly excluded full docs-as-code frameworks outside the survey (Docusaurus, Fumadocs custom plugins were not exhaustively inspected), the category-wide framing is slightly stronger than the evidence base supports.
**Current text:** "the most thoroughly-engineered open reference for the cold-launch pattern, with a 7-provider switch-case..." (Exec Summary).
**Evidence:** `evidence/react-grab-and-similar-handoff-tools.md:255, 416` (qualified "in my sample").
**Status:** INCOHERENT (confidence drift between evidence and exec summary)
**Suggested resolution:** Add "surveyed" to the exec summary: "Mintlify is the most thoroughly-engineered open reference *surveyed* for the cold-launch pattern..." One word; preserves the claim's usefulness while respecting sample bounds.

---

## Confirmed Claims (summary)

The following claims were verified against the evidence files and found to match:

- **Claude `?q=` works** — confirmed in `claude-desktop-deep-links.md` Finding 3 (switch case `r.searchParams.get("q")` → webview navigation).
- **`chatgpt://?q=` does NOT seed the composer** — confirmed in `handoff-prior-art.md` Finding 7.1 via binary probe + quoted OpenAI Community thread.
- **Codex prompt param = `prompt`, path param = `path`, git origin = `originUrl`** — confirmed in `codex-desktop-deep-links.md` Finding 2 (`$9` function verbatim).
- **Cursor prompt param = `text`, workspace param = `workspace`, mode enum = `{ask, agent, debug, plan}`** — confirmed in `cursor-desktop-deep-links.md` Finding 4 (`handlePromptDeeplink` + `deeplink.prompt.prefill`).
- **Cursor confirmation modal + 10K-char cap + obfuscation-aware denylist** — confirmed in `cursor-desktop-deep-links.md` Findings 4–5 (verbatim code from `validatePromptText` + `openDialog`).
- **react-grab has ZERO `claude://` / `codex://` / `cursor://` / `chatgpt://` constructions** — confirmed in `react-grab-and-similar-handoff-tools.md` Finding 1 (explicit grep command + result).
- **react-grab star count = 6,983** — confirmed via `gh api repos/aidenybai/react-grab` output quoted verbatim.
- **react-grab `grab add mcp` writes 9 MCP client configs** — confirmed in Finding 5 with config path table.
- **ChatGPT = 4 App Intents; Perplexity = 8 App Intents** — confirmed in `handoff-prior-art.md` Findings 2.1–2.2 (extracted from `Metadata.appintents/extract.actionsdata` with verbatim JSON snippets).
- **Claude / Codex / Cursor ship ZERO App Intents** — confirmed in Finding 2.3 (empty `find` output).
- **NSServices = 0 across all 5 apps** — confirmed in Finding 1.1 (empty `plutil -extract NSServices`).
- **AppleScript dictionaries = 0 across all 5 apps** — confirmed in Finding 4.1 (empty `.sdef` probe).
- **Prompt param naming matrix** — all six entries (Claude=`q`, Codex=`prompt`, Cursor=`text`, ChatGPT web=`q`, AI Studio=`prompt`, Windsurf=`prompt`) cross-checked against evidence:
  - Claude=`q`: `claude-desktop-deep-links.md` Finding 3.
  - Codex=`prompt`: `codex-desktop-deep-links.md` Finding 2.
  - Cursor=`text`: `cursor-desktop-deep-links.md` Finding 4.
  - ChatGPT web=`q`: `react-grab-and-similar-handoff-tools.md` Mintlify switch-case (`chat.openai.com/?hints=search&q=...`) + `handoff-prior-art.md` Finding 5.2.
  - AI Studio=`prompt`: Mintlify switch-case (`aistudio.google.com/prompts/new_chat?prompt=...`).
  - Windsurf=`prompt`: Mintlify switch-case (`windsurf://cascade?prompt=...`).
- **Cursor `workspace=<name>` param exists** — confirmed in `cursor-desktop-deep-links.md` Finding 4 (`handlePromptDeeplink` reads `l(e.query, "workspace")`) and the workbench command `deeplink.routeToWorkspaceName`.
- **Codex = 7 URL routes** — confirmed in `codex-desktop-deep-links.md` Finding 3 (7-row enum).
- **Cursor = 10 URL routes** — confirmed in `cursor-desktop-deep-links.md` Finding 2 (`handleUri` switch has exactly 10 branches: `/createchat`, `/mcp/install`, `/background-agent`, `/settings`, `/prompt`, `/command`, `/rule`, `/pr-review`, `/plugin/add`, `/glass`).
- **Raycast = 6 first-segment hosts** — confirmed in `raycast-ecosystem.md` Finding 3 (counting by first URL segment).
- **"CursorJack" hardening (Sept 2025)** — confirmed in `cursor-desktop-deep-links.md` Finding 10 with Proofpoint / Hendry Adrian citations.

## Unverifiable Claims

- **Raycast AI.ask() model list ("Claude 4.6 Opus", "GPT-5.x", "Gemini 3.1 Pro")** — stated only in an evidence-file inline comment without a quoted source. See Finding 4.
- **Claude app version `1.2581.0` and Codex app version `26.406.31014`** — stated in prose in the evidence Sources block with path references, but no `plutil`/`cat` output is quoted. See Finding 5.
- **"no `brew install pipe-to-claude` exists"** — claimed based on exhaustive-but-not-definitive GitHub search (evidence Confidence: MEDIUM). See Finding 6.
- **Perplexity `perplexity-app://` accepts no prompt** — evidence says "undocumented, not recoverable" which is different from "does not accept." See Finding 2.
