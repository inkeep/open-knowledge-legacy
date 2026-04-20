# Audit Findings (Round 3 — cumulative after four addenda)

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/deep-linking-ai-desktop-apps-2026/REPORT.md`
**Audit date:** 2026-04-16
**Evidence scope:** 14 evidence files, ~6,075 lines. Baseline audit was `meta/audit-findings.md` (9 findings, all resolved). This audit focuses on issues introduced by the Path C additions (Rounds 1-3, four addenda A/B/C/D) and cross-round consistency breaks.
**Total findings:** 8 (1 High, 4 Medium, 3 Low)

Scope note: the audit spot-checked the seven areas of scrutiny flagged by the requester plus cross-lens sweeps. Baseline D1-D10 findings were not re-audited — the 2026-04-16 baseline audit already covered them. This pass is net-new issues only.

---

## High Severity

### [H] Finding 1: "Launch set" tool list at line 429 includes Codex CLI, but Codex CLI was NOT in the launch announcement

**Category:** FACTUAL + COHERENCE
**Source:** L1 (cross-section contradictions) + L4 (evidence-synthesis fidelity)
**Location:** REPORT.md Addendum D.1 line 429: "Current entries: Claude Code, Codex, Codex CLI, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed (launch set)…"
**Issue:** The REPORT parenthetically labels **10 tools** as "launch set" — including Codex CLI — but:
  - The Linear 2026-02-26 changelog announcement lists **9 tools**: Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed (NO Codex CLI). This is quoted verbatim in `codex-recent-announcements.md:120`.
  - `linear-ai-deeplinks-extraction.md` Finding 6 says: "The announcement names 9 tools (Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed)" — same 9, no Codex CLI.
  - The changelog meta file (`_changelog.md:120`) contradicts the REPORT's framing by listing Codex CLI among "+3 user-defined: customUrl, customTerminalScript, codexCli" — treating it as post-launch.
**Current text (line 429):** "Current entries: Claude Code, Codex, **Codex CLI**, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed (launch set) plus Amp, Devin, Factory, Lovable, Netlify, Warp, Windsurf (post-launch) plus customUrl, customTerminalScript (user-defined)."
**Evidence:** `evidence/codex-recent-announcements.md:120` + `evidence/linear-ai-deeplinks-extraction.md:294` (9-tool announcement list) vs `meta/_changelog.md:120` (Codex CLI as post-launch addition).
**Status:** CONTRADICTED

The arithmetic also drifts. Evidence says "9 at launch + 10 post-launch = 19" (linear-ai-deeplinks-extraction.md:316). The REPORT's parenthetical accounting is "10 + 7 + 2 = 19" (launch set with 10, post-launch 7, user-defined 2). The changelog says "9 + 7 post-launch + 3 user-defined = 19". The evidence's own category breakdown in Finding 6 is "9 + 7 post-launch + 2 user-defined = 18" (which is off by 1, missing Codex CLI). Three separate summaries give three different decompositions of the same 19.

**Suggested resolution:** Move Codex CLI to post-launch in REPORT.md line 429 and reconcile the arithmetic. Correct framing: "Original 9 at launch (Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed) + 8 post-launch built-in tools (Amp, Codex CLI, Devin, Factory, Lovable, Netlify, Warp, Windsurf) + 2 user-defined (customUrl, customTerminalScript) = 19 total." This matches the verbatim registry extraction in `evidence/linear-ai-deeplinks-extraction.md:63-102`. Also refresh `meta/_changelog.md:120` to use this same split (currently says "+7 post-launch + +3 user-defined", incorrectly counting codexCli as user-defined).

---

## Medium Severity

### [M] Finding 2: "single most important security pattern surfaced across the whole research" overstates the evidence attribution

**Category:** CONFIDENCE CALIBRATION + STANCE
**Source:** L2 (confidence-prose misalignment) + L6 (stance consistency)
**Location:** REPORT.md Executive Summary line 56: "The **single most important security pattern surfaced across the whole research** is Zed's `ExternalSourcePrompt` newtype-at-boundary…"
**Issue:** The evidence file (`zed-mentionuri-acp-dive.md:396`) frames this as "the single cheapest and highest-ROI pattern to **steal from Zed**" — scoped to Zed-specific prior art. The REPORT Exec Summary escalates this to "across the whole research" — a superlative judgment across the 14 evidence files, which includes the CursorJack hardening (confirmation modal + obfuscation-aware validation + 10K-char cap), Linear's binary-search truncator with visible footer, and Raycast's per-category opt-in toggles. Those are all security-relevant patterns. Whether `ExternalSourcePrompt` is truly the single most important — vs, e.g., CursorJack's per-invocation modal — is a synthesis claim the evidence does not actually make. It's the cheapest + highest-ROI pattern *from Zed*, not necessarily from "the whole research."

Also, this is a prescriptive OK-relevance claim wrapped in factual-research framing. Per stance discipline (REPORT is described as "factual landscape report per stance" at line 356), prescriptive recommendations about which pattern OK should adopt belong flagged as synthesis, not as sourced-to-evidence facts.
**Current text (line 56):** "The **single most important security pattern surfaced across the whole research** is Zed's `ExternalSourcePrompt` newtype-at-boundary…"
**Evidence:** `evidence/zed-mentionuri-acp-dive.md:396` (frames claim as Zed-specific steal-from-Zed advice); CursorJack + Linear + Raycast security patterns sit in separate evidence files with no claim ranking them below Zed's.
**Status:** INCOHERENT (confidence drift Zed-local → research-wide)
**Suggested resolution:** Recalibrate to "Zed's `ExternalSourcePrompt` newtype-at-boundary is a high-ROI pattern worth adopting — centralizes trust-boundary sanitization in one compiler-enforced constructor (strips bidi, caps newlines, normalizes CRLF)." Drop the superlative "single most important across the whole research" framing. Cross-reference CursorJack's confirmation modal (D3) and Linear's binary-search truncator (D.1) as complementary-but-different security patterns, so a reader sees the full landscape rather than a ranked conclusion.

---

### [M] Finding 3: "byte-for-byte stable" is a tighter claim than the evidence itself makes

**Category:** CONFIDENCE CALIBRATION
**Source:** L2 (confidence-prose misalignment) + L4 (evidence-synthesis fidelity)
**Location:** REPORT.md Executive Summary line 55 ("byte-for-byte stable"); Addendum D.2 heading line 453 ("byte-for-byte stable"); Addendum D.2 body line 455 ("byte-for-byte equivalent in semantics").
**Issue:** The evidence file (`codex-26415-probe.md:528`) uses the more careful phrase "**meaningfully stable**" and "byte-for-byte equivalent in **semantics**" — explicitly acknowledging:
  - Vite regenerated bundle hashes (`main-BctBUwXr.js` → `main-BnI_RVTn.js`, `product-name-DH3nvCaM.js` → `product-name-BA584x_m.js`)
  - Helper functions renamed (`Qfe` → `Bxe`, `Fp` → `yg`, `Pp` → `vg`, `Vp` → `Tg`, `Ip` → `bg`, `Lp` → `xg`+`Cg`+`wg`)
  - Some minified noise removed (`$9(t) ?? null` → `$9(t)` — no-op minifier artifact)
  - `Bxe` helper accepts `stealFocus:!0` behavior change on OAuth callback (minor, but changed)

So "byte-for-byte stable" in the REPORT exec summary is imprecise — the bytes are literally different, but the routing semantics are equivalent. The Addendum D.2 body phrasing "byte-for-byte equivalent in semantics" is the honest one; the exec summary and section heading strip the "in semantics" qualifier.
**Current text (line 55):** "Codex 26.415 fresh probe (Addendum D.2) confirms the `codex://` URL scheme is **byte-for-byte stable**…"
**Current text (line 453):** "Codex 26.415 fresh binary probe: URL scheme is **byte-for-byte stable**"
**Evidence:** `evidence/codex-26415-probe.md:528` uses "meaningfully stable" and "byte-for-byte equivalent in semantics"; the diff tables at lines 101-111, 168-175 document renamed helpers and minor OAuth UX polish delta.
**Status:** INCOHERENT (confidence drift evidence → synthesis)
**Suggested resolution:** Soften to "semantically stable" or "byte-stable in route semantics" in both the exec summary bullet (line 55) and the Addendum D.2 heading (line 453). The Addendum D.2 body phrase "byte-for-byte equivalent in semantics" is the honest register; propagate that to the higher-level summaries.

---

### [M] Finding 4: 9to5Mac attribution for "accessibility framing" is uncited

**Category:** FACTUAL + L7 (inline source attribution)
**Source:** L4 (evidence-synthesis fidelity) + L7 (attribution)
**Location:** REPORT.md Addendum D.2 line 472: "**9to5Mac's 'accessibility' framing was imprecise**"; also `_changelog.md:140`.
**Issue:** The evidence (`codex-26415-probe.md:385`) quotes 9to5Mac only as: *"Codex can see, click, and type into your Mac apps."* — 9to5Mac does not actually use the word "accessibility" in what's quoted. The "accessibility/visual interaction" characterization comes from our own Round 2 synthesis in `codex-recent-announcements.md:38`, not from a 9to5Mac quote.

The technical correction is itself correct and well-supported: Computer Use carries `com.apple.security.automation.apple-events` entitlement on the sub-app, NOT `NSAccessibilityUsageDescription` — primary-source entitlement dump shown at `codex-26415-probe.md:391-400`. Apple Events ≠ accessibility API is a clean factual correction. But the error being corrected is attributed to 9to5Mac without a citation that 9to5Mac used "accessibility" framing.

This is a small but real issue — the correction stands on its own merits, but calling out "9to5Mac's 'accessibility' framing" names a specific third party as wrong without citing them making the error.
**Current text (line 472):** "**9to5Mac's 'accessibility' framing was imprecise**"
**Evidence:** `evidence/codex-26415-probe.md:385` quotes 9to5Mac saying "see, click, and type" (no "accessibility" word); `evidence/codex-recent-announcements.md:38` uses "accessibility/visual interaction" but this is our synthesis, not 9to5Mac's.
**Status:** UNVERIFIABLE as attributed (the correction is correct; the attribution is thin)
**Suggested resolution:** Reframe as: "Our earlier round-2 synthesis described Computer Use as accessibility-driven (`codex-recent-announcements.md:38`); the fresh 26.415 probe shows the mechanism is actually Apple Events…" This correctly attributes the error to our own Round 2 note rather than 9to5Mac, matching what the evidence actually supports. Or, if the 9to5Mac article does use "accessibility" somewhere, quote that passage explicitly in the evidence file.

---

### [M] Finding 5: "4 of 19 tools are CLI-invoked via Electron IPC" undercounts — 5 registry entries use the terminal path

**Category:** FACTUAL
**Source:** L4 (evidence-synthesis fidelity)
**Location:** REPORT.md Exec Summary line 54 ("4 of the 19 are CLI-invoked via Electron IPC"); Addendum D.1 line 437 ("CLI via Electron IPC | 4"); Addendum D.1 line 442 ("4 of 19 tools are reachable ONLY via terminal command").
**Issue:** The Linear evidence file's own Finding 2 table (`linear-ai-deeplinks-extraction.md:159`) lists **5 terminal-command tools**: Amp, Claude Code, Codex CLI, OpenCode, *customTerminalScript*. All 5 route through `Ku.bridge.runTerminalCommand(...)` (same shared plumbing) per evidence line 122. The REPORT's distribution table (line 437) categorizes 4 as "CLI via Electron IPC" and 2 as "User-defined", implicitly excluding customTerminalScript from the "CLI via Electron IPC" count. This is technically defensible (user-defined scripts are a separate UX category), but the load-bearing claim "shell-exec must be first-class, peer to URL schemes" is *strengthened* not weakened by including customTerminalScript: 5 of 19 Linear registry entries use shell-exec, not 4.

The 4-vs-5 distinction is small but factually off. Also creates a subtle coherence issue: `customUrl` is categorized as "user-defined" (url-builder) while `customTerminalScript` is categorized as "user-defined" (terminal-command) — the REPORT's table groups them under one label, flattening the mechanism distinction.
**Current text (line 437):** "CLI via Electron IPC (`runTerminalCommand`) | 4 | **Claude Code, Codex CLI, OpenCode, Amp** — no URL at all"
**Current text (line 442):** "4 of 19 tools are reachable ONLY via terminal command — Claude Code, Codex CLI, OpenCode, and Amp would all be unreachable if Linear had limited itself to URL-scheme handoff."
**Evidence:** `evidence/linear-ai-deeplinks-extraction.md:159-167` (5-entry terminal-command table including customTerminalScript); line 122 (`Ku.bridge.runTerminalCommand` shared plumbing).
**Status:** CONTRADICTED (minor — undercount by 1)
**Suggested resolution:** Clarify the split: "5 of 19 registry entries use shell-exec (`runTerminalCommand`): 4 built-in tools (Claude Code, Codex CLI, OpenCode, Amp) + 1 user-defined script hook (customTerminalScript)." Or keep the 4 headline count but footnote the customTerminalScript inclusion. Either resolution strengthens the "shell-exec is first-class" conclusion the Exec Summary is already drawing.

---

## Low Severity

### [L] Finding 6: Raycast "6 URL hosts" Exec Summary bullet doesn't match the "6 first-segment hosts" wording the prior audit (F7) tightened elsewhere

**Category:** COHERENCE
**Source:** L1 (cross-section consistency)
**Location:** REPORT.md Executive Summary line 45 ("6 URL hosts"); matrix line 330 ("6 first-segment hosts"); D6 line 210 ("6 first-segment hosts").
**Issue:** The baseline audit's F7 resolution tightened "6 hosts" → "6 first-segment hosts" in the matrix and in D6 — good. The Exec Summary Key Findings bullet on line 45 was not similarly tightened; it still reads "6 URL hosts" without the "first-segment" qualifier. The evidence file enumerates 11 URL forms across 6 first-segment hosts (multiple `extensions/...` variants) — the precision added to the matrix/D6 was there to prevent exactly that reader confusion. The Exec Summary bullet is the place a reader most likely enters the report.
**Current text (line 45):** "**Raycast** — 6 URL hosts (`extensions/...`, `script-commands/...`, `ai-commands/...`, `quicklinks/import`, `snippets/{import,create}`, `confetti`)…"
**Evidence:** `meta/audit-findings.md:F7` (prior audit resolution); `evidence/raycast-ecosystem.md:77-88` (11-row table across 6 first-segment hosts).
**Status:** INCOHERENT (prior resolution didn't propagate to exec summary)
**Suggested resolution:** Change "6 URL hosts" to "6 first-segment hosts" in the Key Findings bullet. One-word fix; consistency with matrix + D6.

---

### [L] Finding 7: "Zed has ~10 documented subpaths" is imprecise — list has 9 unique subpaths

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** REPORT.md Addendum A line 375 ("Registers `zed://` with ~10 documented subpaths"); References line 517 ("Zed `zed://` full scheme (~10 subpaths)").
**Issue:** The enumeration in REPORT.md Addendum A line 375 lists 9 subpaths — `file`, `ssh`, `extension`, `agent`, `agent/shared`, `schemas`, `settings`, `git/clone`, `git/commit`. The tilde ("~10") hedges, but the count is actually 9 unique subpaths if you count `agent` and `agent/shared` as one, or 10 if you count them separately; and the underlying evidence table (`zed-and-jetbrains-deep-links.md:57-69`) has ~11 rows depending on how you count `settings` vs `settings/<path>` and the passthrough `https://zed.dev/channel/...` fallthrough. The tilde is defensible but the prior audit's F7 precedent (tightening "6 hosts" to "6 first-segment hosts") applies here too — exact counts beat tildes for stat-heavy claims.
**Current text (line 375):** "Registers `zed://` with **~10 documented subpaths**: `file`, `ssh`, `extension`, `agent`, `agent/shared`, `schemas`, `settings`, `git/clone`, `git/commit`"
**Evidence:** `evidence/zed-and-jetbrains-deep-links.md:56-69` (verbatim table of 11 rows across 9-10 distinct prefixes).
**Status:** INCOHERENT (minor — imprecise count)
**Suggested resolution:** Either (a) enumerate precisely: "9 first-segment URL paths (`file`, `ssh`, `extension`, `agent`, `agent/shared`, `schemas`, `settings`, `git/clone`, `git/commit`), plus a `https://zed.dev/channel/...` fallthrough" or (b) drop the numeric claim and just list them. Same hygiene as the F7 resolution.

---

### [L] Finding 8: "accessibility/visual interaction" in the Round 2 codex-recent-announcements evidence is internally inconsistent with the Round 3 Apple-Events-driven correction

**Category:** FACTUAL (cross-evidence)
**Source:** L4 (evidence-synthesis fidelity across evidence files)
**Location:** `evidence/codex-recent-announcements.md:38` (says "Codex can now drive OTHER desktop apps via **accessibility/visual interaction**"); `evidence/codex-26415-probe.md:381` (corrects this to Apple-Events-driven).
**Issue:** Round 2 evidence file contains a now-incorrect synthesis ("accessibility/visual interaction") that Round 3 evidence corrects. The REPORT itself only cites the Round 3 correction, so the REPORT's primary claims are fine. But if a downstream consumer reads both evidence files, they'll hit the contradiction. The Round 2 evidence should either be annotated with a "superseded by `codex-26415-probe.md` Finding 9" pointer or corrected in place.

This isn't a REPORT issue per se, but it's a package-coherence issue — the full evidence bundle (14 files) is inconsistent on this one point, and the ExecSummary (REPORT line 55) inherits the Round 3 version without the consumer knowing the Round 2 evidence has the older framing.
**Current text (Round 2 evidence line 38):** "Codex can now drive OTHER desktop apps via **accessibility/visual interaction** ('see, click, and type into your Mac apps, with its own cursor')"
**Evidence:** `evidence/codex-recent-announcements.md:38` vs `evidence/codex-26415-probe.md:381`.
**Status:** INCOHERENT (cross-evidence drift — earlier synthesis contradicted by later probe)
**Suggested resolution:** Add a one-line note at the top of `codex-recent-announcements.md` Finding 1 saying "Computer Use mechanism corrected in follow-up probe — see `codex-26415-probe.md` Finding 9: the substrate is Apple Events / OSA entitlement, not the accessibility API." Or strike the "accessibility/visual interaction" phrase in place.

---

## Confirmed Claims (summary)

Spot-checks that passed — these are the stat-heavy or security-relevant claims most at risk of error, and all held up:

- **Linear registry count = 19 (binary-extracted)** — confirmed verbatim at `linear-ai-deeplinks-extraction.md:63-102`. Registry identifier `QW`, byte offset 1,519,683 in `AIActions.B5r9dZjO.js`. Source bundle sha1 `918d26c327fd…` cited; `Last-Modified: 2026-04-17 00:40 UTC` cited.
- **`claude://` scheme absent from Linear registry (exhaustive grep)** — confirmed by explicit negative-search block at `linear-ai-deeplinks-extraction.md:387`. Primary-source: grep of the runtime bundle. Well-supported as a negative finding.
- **Computer Use Apple-Events entitlement** — confirmed verbatim at `codex-26415-probe.md:391-400` (plist dump). Sub-app bundle id `com.openai.sky.CUAService` confirmed at line 387. `com.apple.security.automation.apple-events` entitlement confirmed on sub-app; main Codex.app entitlements separately dumped at line 404-414 and show this entitlement NOT present on the top-level app.
- **Codex 26.415 URL parser same 7 branches** — confirmed via verbatim parser source quoted at `codex-26415-probe.md:65-86` + diff table at lines 101-111. No new route kinds.
- **Codex 26.415 `$9` param parser unchanged (prompt / originUrl / path)** — confirmed at `codex-26415-probe.md:185-219` with verbatim source.
- **Plugin install is CLI+IPC only in Codex 26.415** — confirmed by JSON-RPC method names `plugin/install` / `marketplace/add` / `plugin/uninstall` at `codex-26415-probe.md:236-249` + CLI help text at line 254-271.
- **App Intents still absent in Codex 26.415** — confirmed by empty `find` output at `codex-26415-probe.md:293-298`.
- **MentionUri 12 variants** — confirmed verbatim at `zed-mentionuri-acp-dive.md:69-90` with source-code enum listing from `mention.rs:17-64`.
- **4 CLI-invoked tools in Linear registry (narrow headline count)** — Amp, Claude Code, Codex CLI, OpenCode confirmed at evidence lines 64-66, 91. (Finding 5 above notes this undercounts by 1 if you also include customTerminalScript, but the 4 named tools ARE all verified.)
- **Double-encoding on Cursor / Copilot / Windsurf** — confirmed verbatim at `linear-ai-deeplinks-extraction.md:71, 86, 99`. `encodeURIComponent(encodeURIComponent(e))` literal visible in each.
- **Replit uses lz-string** — confirmed at `linear-ai-deeplinks-extraction.md:93` + imported chunk `vendor-lz-string.etZhLdV2.js` at line 23. Primary-source.
- **URL-length caps per tool (2K default / 8K Cursor+Copilot)** — confirmed at evidence line 57 (`YW = 2e3`) + lines 72, 86 (8000 constants in Cursor + Copilot builders).
- **Binary-search truncator + visible footer** — confirmed verbatim at `linear-ai-deeplinks-extraction.md:38-54` with the `RW` function.
- **`{{context}}` server-side substitution via GraphQL** — confirmed verbatim at `linear-ai-deeplinks-extraction.md:189-201` with the GraphQL query literal.
- **ACP transport JSON-RPC over stdio (stable) + streamable HTTP (draft)** — confirmed against `agentclientprotocol.com/protocol/transports` quote at `zed-mentionuri-acp-dive.md:22`. Matches the ACP spec.
- **Rust crate `agent-client-protocol@0.10.4` with 1.28M downloads** — confirmed at `zed-mentionuri-acp-dive.md:30`.
- **`zed://agent?prompt=` shipped in PR #47959** — confirmed at `zed-mentionuri-acp-dive.md:5` (linked in sources) and cross-referenced against `zed-and-jetbrains-deep-links.md:20`. PR description quoted verbatim at `zed-and-jetbrains-deep-links.md:76`.
- **`ExternalSourcePrompt` newtype sanitization** — confirmed verbatim at `zed-mentionuri-acp-dive.md:336-361` with the Rust source of the constructor + `sanitize` function + `is_bidi_control_character` function.
- **Mintlify 14-identifier schema** — consistent across `_changelog.md:45`, `REPORT.md:179`, `evidence/docs-site-handoff-landscape.md:26`, `docs-site-handoff-landscape.md:330`. Not a Round-3 addition; carried forward consistently.
- **`prompts-chat` 28 platforms** — consistent across `_changelog.md:49`, `REPORT.md:234`, `evidence/raycast-prompts-chat-registry.md:69` (primary source says "Actual count: 28 platforms"). Minor cross-evidence drift: Round 1 `evidence/raycast-ecosystem.md:337` uses informal "~30 AI platforms" but REPORT cites the corrected 28 throughout — OK.
- **All 14 evidence files are referenced in REPORT.md References section** — confirmed lines 509-522. Each description accurately summarizes the file's contents (with one minor imprecision called out in Finding 7 for the Zed entry).
- **ChatGPT 4 / Perplexity 8 / Claude-Codex-Cursor 0 App Intents** — baseline claim still holds in Round 3 probe per `codex-26415-probe.md:288-299`. No drift.

## Unverifiable Claims

Claims where evidence packaging is thin but the underlying fact may still be true:

- **"Registry grows ~1 tool/week"** — stated at REPORT line 429 + evidence line 308. Math: 9 at launch (2026-02-26) → 19 now (2026-04-17) = 10 added in 7 weeks. Roughly consistent (~1.4/week), and the claim "roughly one tool per week" is defensible as rounding. CONFIRMED in spirit; the wording is slightly loose but not audit-blocking.
- **"MentionUri enum grew ~1 variant every 3 weeks since 2025-08-12"** — REPORT line 488 + `zed-mentionuri-acp-dive.md:139`. Math: 12 variants in ~8 months = 1.5/month ≈ 1 per 3 weeks. Consistent.
- **Linear tool count at launch (9 vs 10)** — the 2026-02-26 announcement lists 9; Linear's own bundle is likely to have evolved between 2026-02-26 and the 2026-04-17 bundle capture. Whether Codex CLI was added on Day 0+1 or 3 weeks later isn't recoverable from the static bundle inspection. The announcement quote is the authoritative source for the launch count; the REPORT's treatment of Codex CLI as "launch set" (Finding 1 above) is incompatible with the announcement.
- **"9to5Mac's 'accessibility' framing"** — see Finding 4. The correction of the underlying Apple-Events vs accessibility distinction is verified; the attribution to 9to5Mac specifically is not verifiable from the quoted text in the evidence.
- **"No first-party Alfred / Keyboard Maestro / Hammerspoon workflow"** — carried forward from baseline audit. Baseline audit labeled this MEDIUM (negative). Still MEDIUM in Round 3 — no new positive evidence found to disprove, but the category is uncovered-in-surveyed-sample rather than definitively absent.
- **"no `NSServices` entry"** — baseline claim; still holds (the Round 3 probes didn't re-verify but didn't contradict either).

---

## Overall assessment

The report is in **ship-ready shape with one High finding to resolve** (Finding 1 — the launch-set listing contradicts the Linear announcement quote). Rounds 1-3 were primary-source-heavy and the evidence bundle is strong; the issues flagged are mostly of two kinds:

1. **Confidence-register drift** — the prose escalated during synthesis ("byte-for-byte", "single most important", "across the whole research") in ways the evidence wording does not actually support. Findings 2, 3.
2. **Arithmetic / categorization precision** — small undercounts (Finding 5), count drift (Finding 1), lingering imprecise prior-audit-resolved wording (Finding 6, 7). Cumulative but individually small.

The load-bearing architectural claims — Linear's 19-tool registry with 4 CLI-invoked entries, Codex 26.415 semantically-stable URL scheme, Computer Use is Apple-Events-driven, no `claude://` in Linear's bundle, MentionUri 12 variants, `ExternalSourcePrompt` sanitization at the boundary — all check out against primary-source evidence. The report can be passed to a downstream consumer (spec, design discussion, product decision) after Finding 1 is reconciled. Findings 2-5 should be addressed before the report is cited in authoritative cross-referencing contexts.
