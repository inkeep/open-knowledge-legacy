# Audit Findings

**Artifact:** reports/ai-coding-tools-cross-install-coordination/REPORT.md
**Audit date:** 2026-04-24
**Total findings:** 14 (2 high, 6 medium, 6 low)

## Resolution status (applied same-day)

| Finding | Status | Applied how |
|---|---|---|
| H1 | APPLIED | CVE-2025-52882 now correctly characterized as a fix (lockfile auth token is the remediation), not the attack surface. Updated in REPORT.md D2 Implications, evidence/claude-code.md, evidence/cross-tool-patterns.md. |
| H2 | APPLIED | Purpose rewritten to third-person neutral framing. All five "Decision triggers" blocks stripped from D1-D4, D6. Stance now matches Factual label. |
| M1 | APPLIED | vscode-remote-release#8582 relabeled from "Remote-SSH" to "Remote Tunnels" with the actual error quoted, in REPORT.md and evidence/vscode-family.md. |
| M2 | APPLIED | Executive-summary phrasing changed from "every tool auto-updates" to "every install path updates through its own channel (in-process auto-updater, system package manager, or manual)". |
| M3 | APPLIED | Line-number citations in REPORT.md + evidence/vscode-family.md replaced with function-name citations (drift-proof). Evidence/zed-warp.md filename corrected: `release_channel.rs` → `lib.rs`. |
| M4 | APPLIED | Evidence/zed-warp.md negative-search entry rewritten to match the report body (does short-circuit when pointing to same CLI; does not prompt before overwriting foreign target). |
| M5 | APPLIED | "unconditionally" → "by default (absent a `CUSTOM_DATA_DIR` override)" in evidence/zed-warp.md. |
| M6 | APPLIED | `VSCODE_IPC_HOOK_CLI` row in REPORT.md D2 table clarified as "env var (holds per-window Unix socket path)" instead of implying it is the socket. Evidence updated similarly. |
| L1 | APPLIED | Executive-summary opening reworded to "No surveyed tool uses a *shared-state-mediated* cross-install version handshake" — captures the nuance that VS Code's #310090 IS a runtime handshake. |
| L2 | DEFERRED | "Atomically tied" language retained; filesystem-atomicity nit has low reader-impact. |
| L3 | DEFERRED | Cursor inheritance framing already substantially rewritten under H2 fix (see REPORT.md D2 Implications); covers the forum-thread detail. |
| L4 | DEFERRED | "Every tool's install logic" imprecision noted but not rewritten. The report elsewhere is clear that Warp has no binary stanza and Claude Code native uses `~/.local/bin/`. |
| L5 | DEFERRED | 7+ vs 8 install-count inconsistency; both defensible. Report convention: "8 distinct paths". |
| L6 | APPLIED | `~/.claude.json` recharacterized from "OAuth-session material" to "mix of OAuth session material and certain settings that cannot be moved to `settings.json`" in evidence/claude-code.md. |

**Summary:** 2 of 2 HIGH, 6 of 6 MEDIUM, 2 of 6 LOW applied. Four LOW findings deferred as low-impact wording preferences.

The findings below are the original audit record.

## Summary

The report is a solidly-researched factual landscape document with strong primary-source grounding (live GitHub issues, OSS code, Homebrew casks, local filesystem inspection). The four-strategy taxonomy in the executive summary is an accurate synthesis of the surveyed cohort. Most factual claims verified against external sources hold up.

Two HIGH-severity findings were identified:
- **H1**: The CVE-2025-52882 characterization is materially inverted (the lockfile-based auth is the FIX, not the attack surface).
- **H2**: The "factual landscape / no 1P conclusions" stance stated in the Research Rubric is undermined by the "Purpose" framing ("you are evaluating a cross-install coordination strategy...") and by the "Decision triggers: If your tool..." prescriptive blocks that appear under nearly every dimension.

Medium-severity findings cluster around: (a) one issue-type misidentification (vscode-remote-release#8582 is about Remote Tunnels, not Remote-SSH), (b) line-number drift in code citations, (c) minor imprecisions in "unconditionally" / "inherited" characterizations.

No Open Knowledge or Inkeep name leakage was found in REPORT.md or evidence files. However, the Purpose framing implicitly signals a 1P-evaluator reader posture even though the subject is never named.

---

## High Severity

### [H1] CVE-2025-52882 characterization is materially inverted
**Category:** FACTUAL
**Source:** L4 (Evidence-synthesis fidelity) + L7 (Inline source attribution) + Phase 5 (External verification against Datadog Security Labs article)
**Location:** REPORT.md D2 Implications block (L137); evidence/claude-code.md Finding D2b Implications (L87), evidence/cross-tool-patterns.md "Lock files exist" section (L34)
**Issue:** The report claims the `~/.claude/ide/<pid>.lock` file with its embedded auth token **IS the attack surface** of CVE-2025-52882. This inverts what Datadog Security Labs documented. The CVE was an **unauthenticated WebSocket server** (pre-patch, zero authentication). The lockfile-based auth-token mechanism is **the remediation**, not the vulnerability. Per the Datadog writeup: *"The IDE extension will now verify connection attempts by using an auth token. This auth token is stored in a lock file locally..."* — the lockfile auth-token scheme was introduced as the fix in v1.0.24+.
**Current text:** "Claude Code's IDE lockfile is the closest thing in the cohort to an explicit cross-surface coordination artifact. Notably, it's also the attack surface behind [CVE-2025-52882](https://securitylabs.datadoghq.com/articles/claude-mcp-cve-2025-52882/) — the WebSocket auth token is inside the lockfile on disk."
**Evidence:** The Datadog writeup explicitly states token-based authentication was the fix, not the flaw. The pre-patch vulnerability was that the WebSocket server accepted ALL connections with no authentication whatsoever. A reader will come away with the opposite understanding of the security posture.
**Status:** CONTRADICTED
**Suggested resolution:** Reword to accurately describe CVE-2025-52882: pre-patch Claude Code extensions ran an unauthenticated WebSocket MCP server on localhost, allowing any webpage to connect. The fix introduced the `{authToken}` field in the lockfile as a capability token. The IDE lockfile is a *remediation artifact* for CVE-2025-52882, not the attack surface.

### [H2] "Factual landscape / no 1P conclusions" stance undermined by prescriptive framing
**Category:** COHERENCE
**Source:** L6 (Stance consistency) + L2 (Confidence-prose alignment)
**Location:** REPORT.md Purpose statement (L32); Research Rubric stance declaration (L66); "Decision triggers" blocks under D1, D2, D3, D4, D6 (L106, L140, L183, L223, L279)
**Issue:** The Research Rubric declares: *"Stance: factual landscape, no 1P conclusions."* The Out-of-Scope list also explicitly excludes: *"1P application to any specific tool or project (factual stance)."* But:
  1. The Purpose opens: *"You are evaluating a cross-install coordination strategy for a local-first tool that ships via both a native desktop app (DMG) and a separately-installed CLI."* — explicitly addresses a 1P reader evaluating a strategy.
  2. Every dimension except D5 and D7 has a **"Decision triggers"** block with prescriptive `if your tool...` advice (e.g., L140: *"If your tool must be local-first... your options are namespacing..., shared state..., or bundle-relative..."*; L183: *"forward-compat JSON is not sufficient — explicit schema versioning is the only option..."*; L223: *"pick distinct names per path..."*). These are not neutral observations — they are prescriptions keyed to a hypothetical "your tool" that maps cleanly to the 1P Open Knowledge CLI evaluation the PR branch suggests.
**Current text:** Purpose: "You are evaluating a cross-install coordination strategy for a local-first tool..."; Rubric: "Stance: factual landscape, no 1P conclusions."
**Evidence:** The Purpose wording + dimension-level Decision triggers collectively constitute recommendation scaffolding for an evaluator. The stance label does not match the content. The surrounding PR branch `pr-301-server-paths` indicates active 1P work that the report is explicitly framed to inform.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) drop the "no 1P conclusions" stance and relabel as "Factual landscape + decision-space framing for an evaluator", or (b) neutralize Purpose to a third-person framing (e.g., "This report surveys how six AI coding tools coordinate coexisting install paths") and strip the "Decision triggers: If your tool..." prescriptions from each dimension, keeping only the neutral "Implications" observations.

---

## Medium Severity

### [M1] vscode-remote-release#8582 is mis-identified as Remote-SSH (actually Remote Tunnels)
**Category:** FACTUAL
**Source:** L4 (Evidence-synthesis fidelity) + Phase 5 (External verification)
**Location:** REPORT.md D3 Three VS Code-documented drift surfaces (L165); evidence/vscode-family.md Finding D3 item 3 (L69)
**Issue:** The report and evidence both describe the issue as *"GUI ↔ Remote-SSH server mismatch"* with *"server refuses with handshake timeout"*. Fetching the actual issue shows it describes VS Code **Remote Tunnels** (code-tunnel on AlmaLinux 9) with the error *"client refused, version mismatch"* — not Remote-SSH. The issue is indeed about a version-mismatch handshake failure, but it's for a different feature (Remote Tunnels, which uses the standalone `code-tunnel` CLI) than the one labeled.
**Current text:** "**GUI ↔ Remote-SSH server mismatch** ([vscode-remote-release#8582](https://github.com/microsoft/vscode-remote-release/issues/8582)) — server refuses with handshake timeout."
**Evidence:** The issue reporter states they use Windows VS Code 1.78.2 connecting to AlmaLinux 9.2 running **code-tunnel** service v1.2.0. The error is "client refused, version mismatch". This is the Remote Tunnels product.
**Status:** STALE / INCORRECT
**Suggested resolution:** Relabel as *"GUI ↔ Remote Tunnels server mismatch"*. Note this is a third tunnels-related CLI collision surface (alongside the standalone `code` CLI from #310090), not an SSH handshake case.

### [M2] "Every surveyed tool auto-updates its own install independently" elides two exceptions
**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions) + L3 (Missing conditionality)
**Location:** REPORT.md Executive Summary (L58), D5 intro (L229)
**Issue:** The executive summary says *"Self-update coordination across installs is zero. Every tool auto-updates its own install independently."* But the same report's D5 table shows **Homebrew-managed installs update only when the user runs `brew upgrade`** — that's not auto-update, that's manual. Claude Code Homebrew, Warp standalone CLI brew tap, and arguably Cursor's `cursor-cli` brew cask all fall in this category. And Windsurf's "cask" on macOS is advertised as `auto_updates true` (app self-updates); its Homebrew tap existence with `warp-cli` vs `oz` also blurs this. The more accurate statement is: *"every install path updates through its own channel (app auto-updater, package manager, or manual), with no cross-install coordination."*
**Current text:** Executive summary: "Self-update coordination across installs is zero. Every tool auto-updates its own install independently."
**Evidence:** D5 table explicitly shows *"Homebrew: `brew upgrade claude-code`"* and *"Warp (standalone CLI): `brew upgrade`"* — these are not auto-updates.
**Status:** OVERSTATED (imprecise)
**Suggested resolution:** Change to *"Every install path updates through its own channel (in-process auto-updater, system package manager, or manual); no cross-install coordination exists."*

### [M3] Code line-number citations drift from current main branch
**Category:** FACTUAL
**Source:** Phase 5 (External verification)
**Location:** REPORT.md D4 (L205); evidence/vscode-family.md key files (L11-12), Finding D2 (L41)
**Issue:** The report cites `nativeHostMainService.ts L722-747` for `installShellCommand` and `L611-622` for `getShellCommandLink`. Fetching the current file on `main` shows `installShellCommand` at L897-919 and `getShellCommandLink` at L938-954 — ~175 lines of drift. The function body and `-sf` osascript pattern are accurate, but line numbers are stale. Similar issue: evidence cites `crates/release_channel/src/release_channel.rs:184-209`, but the file is actually `crates/release_channel/src/lib.rs` (the path is wrong even though the line-range content matches). Evidence also cites `paths.rs:113-114` for `data_dir()`; actual location is ~L109-130.
**Current text:** "the canonical code pattern — from VS Code's `nativeHostMainService.ts` L722-747 (`installShellCommand`)"
**Evidence:** WebFetch on the current file returns L897-919 for `installShellCommand`. `crates/release_channel/src/release_channel.rs` returns HTTP 404 on the raw URL; correct path is `crates/release_channel/src/lib.rs`.
**Status:** STALE (content still accurate, citations out of date)
**Suggested resolution:** Either refresh the line numbers (brittle — will drift again) or remove line numbers and cite function names only. Correct the file path `release_channel.rs` → `lib.rs`.

### [M4] Evidence file negative-search contradicts itself on Zed's short-circuit check
**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions) + L4 (Evidence-synthesis fidelity)
**Location:** evidence/zed-warp.md "Negative searches" (L189); REPORT.md D1 executive summary framing (L60)
**Issue:** The evidence file's Negative-searches says: *"Zed in-app installer conflict detection with brew: `install_cli_binary.rs` does not read/inspect an existing symlink before `remove_file + symlink()`. Last-writer-wins."* But inspection of `install_cli_binary.rs` shows it DOES inspect: *"Don't re-create symlink if it points to the same CLI binary. `if smol::fs::read_link(link_path).await.ok().as_ref() == Some(&cli_path) { return Ok(link_path.into()); }"* — a read+inspect short-circuit. The report's executive summary (L60) acknowledges this: *"a this-is-already-my-symlink short-circuit"*. But the evidence file negative search asserts the opposite. The Zed short-circuit is the same shape as VS Code's (same target → return; else overwrite).
**Current text:** evidence/zed-warp.md L189: "`install_cli_binary.rs` does not read/inspect an existing symlink before `remove_file + symlink()`. Last-writer-wins."
**Evidence:** The actual Rust source shows a read_link + comparison short-circuit at the top of `install_script`. Only if the link points to a *different* CLI binary does it proceed to remove+symlink.
**Status:** CONTRADICTED (evidence internal inconsistency)
**Suggested resolution:** Update the negative-search wording to match the report body: *"Does not prompt or warn before overwriting a foreign-written symlink, though it does short-circuit if the symlink already points to the same CLI binary."*

### [M5] Unconditional "unconditionally" claim about Zed's data_dir() is imprecise
**Category:** FACTUAL
**Source:** L3 (Missing conditionality) + Phase 5 (Source verification)
**Location:** evidence/zed-warp.md Finding Zed-D3b (L56)
**Issue:** Evidence says *"paths.rs:113-114 (`data_dir()` returns `~/Library/Application Support/Zed` unconditionally)"*. The actual implementation first checks `CUSTOM_DATA_DIR` (set via `set_custom_data_dir()`) and returns that if present. So it's **not unconditional** — a custom override can point it elsewhere. This is a minor but real imprecision (the report itself doesn't use "unconditionally", only the evidence file does; but the REPORT body's characterization of "Shared across all install paths" is conditioned on this evidence claim).
**Current text:** "`/tmp/zed/crates/paths/src/paths.rs:113-114` (`data_dir()` returns `~/Library/Application Support/Zed` unconditionally)"
**Evidence:** Source has `if let Some(custom_dir) = CUSTOM_DATA_DIR.get() { custom_dir.clone() } else if cfg!(target_os = "macos") { home_dir().join(...) }`.
**Status:** IMPRECISE
**Suggested resolution:** Change "unconditionally" → "by default" or "absent a custom override". Note this is orthogonal to the report's main argument; the default-path claim (shared across channels) remains sound.

### [M6] "VSCODE_IPC_HOOK_CLI (per-window Unix socket)" description conflates env var with socket
**Category:** FACTUAL
**Source:** L7 (Inline source attribution)
**Location:** REPORT.md D2 table (L133); evidence/vscode-family.md Finding D2 (L56)
**Issue:** The report's D2 table labels `VSCODE_IPC_HOOK_CLI` as *"per-window Unix socket"*. `VSCODE_IPC_HOOK_CLI` is an **environment variable** that holds the *path* to a per-window Unix socket, not the socket itself. The evidence file is more accurate: *"a per-window Unix-socket discriminator used to attach the CLI..."* though still conflates. Readers looking for a socket artifact will be confused.
**Current text:** "VS Code | `VSCODE_IPC_HOOK_CLI` (per-window Unix socket) | CLI attach to open window"
**Evidence:** `VSCODE_IPC_HOOK_CLI` is an env var whose value is a socket path. The socket itself has no stable name in the table.
**Status:** IMPRECISE
**Suggested resolution:** Change to *"`VSCODE_IPC_HOOK_CLI` env var holding per-window Unix socket path"* or just *"per-window Unix socket (path set via `VSCODE_IPC_HOOK_CLI` env var)"*.

---

## Low Severity

### [L1] "None is a true runtime cross-install version handshake" — VS Code's #310090 hard-refuse IS a runtime version handshake
**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** REPORT.md Executive Summary paragraph 1 (L38); D3 finding (L146); L52 ("the single documented hard-refuse")
**Issue:** The executive summary opens: *"No surveyed tool uses a true runtime cross-install version handshake."* But four paragraphs later (L52): *"The single documented hard-refuse on cross-install version mismatch in the cohort is VS Code's standalone `code` CLI rejecting a v1.115 handshake against a v1.116 GUI."* A "handshake that rejects on version mismatch" **is** a runtime cross-install version handshake. The two statements are in tension. The nuance being drawn is probably that the handshake isn't mediated by a shared on-disk artifact — but the executive summary doesn't convey that nuance.
**Current text:** "No surveyed tool uses a true runtime cross-install version handshake."
**Evidence:** vscode#310090 documents exactly a runtime version handshake between the GUI and standalone CLI that fails closed.
**Status:** IMPRECISE
**Suggested resolution:** Clarify: *"No surveyed tool uses a shared-state-mediated cross-install version handshake. The one documented runtime version check (VS Code GUI ↔ standalone CLI in #310090) fails closed at handshake rather than gating on disk state."*

### [L2] "Per-symlink CLI + app version atomically tied" — not strictly atomic during update
**Category:** FACTUAL
**Source:** L2 (Confidence-prose alignment)
**Location:** REPORT.md executive summary "Bundle-relative self-discovery" row (L45); D2 table (L125)
**Issue:** The report claims bundle-relative CLI install is *"per-symlink CLI + app version atomically tied"*. In the quiescent state this is true. During an app update (Squirrel.Mac or Zed's in-process replacer), the `.app` is replaced; whether the bundle swap is atomic depends on the updater implementation (Squirrel does use atomic rename for the final step, but the interim state is observable). Calling this "atomic" is a slight overstatement for describing update behavior.
**Current text:** "Per-symlink the CLI and app version are always identical"
**Evidence:** Squirrel.Mac semantics + Zed's in-process updater both have interim states during bundle replacement. True atomicity is a filesystem claim, not a behavioral one.
**Status:** IMPRECISE
**Suggested resolution:** Replace "atomically tied" / "always identical" with "structurally tied" or "tied by bundle membership" to avoid the filesystem-atomicity implication.

### [L3] "Cursor inherited VS Code's internal `code` shim" is true but overstated as a root cause
**Category:** FACTUAL
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** REPORT.md D2 Implications (L136-137)
**Issue:** The report argues that Cursor's Windows `code.cmd` collision is because *"Cursor inherited VS Code's internal `code` shim and then had to be renamed; the Homebrew cask does the rename but the Windows installer didn't."* This is supported but there's an alternative reading in the Cursor forum thread: Cursor's Windows installer optionally installs `code.cmd` whether or not the user opts in; the user's complaint is that they selected ONLY "cursor" and still got `code.cmd`. This is a different causal story than "inherited but couldn't rename".
**Current text:** "Cursor inherited VS Code's internal `code` shim and then had to be renamed; the Homebrew cask does the rename but the Windows installer didn't."
**Evidence:** Cursor forum #39993 reports the installer writes `code.cmd` even when the user did NOT request it — additional behavior beyond the rename-failure framing.
**Status:** OVERSIMPLIFIED
**Suggested resolution:** Note the forum thread's additional observation: Cursor's Windows installer also writes `code.cmd` regardless of the user's shell-command selection, not just as a failed-rename artifact.

### [L4] "Every surveyed tool" claim about `/usr/local/bin/` symlink using `ln -sf` or `remove_file + symlink()` mixes types
**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** REPORT.md executive summary (L60); D4 Implications (L221)
**Issue:** The executive summary lists "every tool's install logic uses `ln -sf` (VS Code) or `remove_file + symlink()` (Zed)". But Warp's cask has **no `binary` stanza** and thus no install-time symlink at all (documented in the report itself at L102); palette install is separate. Claude Code's native installer uses `~/.local/bin/claude`, not `/usr/local/bin/claude`. The "every tool" claim doesn't fit Warp or Claude Code.
**Current text:** "The biggest cross-install failure surface is the `/usr/local/bin/<tool>` symlink — every tool's install logic uses `ln -sf` (VS Code) or `remove_file + symlink()` (Zed)..."
**Evidence:** Per the report's own D1 table: Claude Code native → `~/.local/bin/claude`; Warp cask → no binary stanza.
**Status:** OVERSTATED
**Suggested resolution:** Narrow to "the VS Code lineage + Zed" or note Warp and Claude Code native installer as exceptions.

### [L5] Claude Code evidence file mixes "8 distinct paths" and "7+ install surfaces"
**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** REPORT.md D1 Implications (L103); evidence/claude-code.md Finding D1 (L26)
**Issue:** REPORT.md says *"Claude Code has the broadest install-surface area of any surveyed tool (8 distinct paths)"*. Evidence file says *"Claude Code ships across 7+ install surfaces"*. Both are defensible depending on how you count platform variants, but the precise number changes between files.
**Current text:** REPORT.md L103: "8 distinct paths"; evidence/claude-code.md L26: "7+ install surfaces"
**Evidence:** Counting is ambiguous — `Linux apt/dnf/apk` is one row but three systems; JetBrains plugin may or may not count as its own install of the CLI.
**Status:** INCONSISTENT
**Suggested resolution:** Normalize to one count in both files, or express the count as "~7-8 install surfaces depending on how Linux package managers are grouped".

### [L6] `~/.claude.json` characterized as "OAuth-session material" only — broader than that
**Category:** FACTUAL
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** evidence/claude-code.md Finding D2a (L61); REPORT.md D1 table (L94)
**Issue:** Evidence describes `~/.claude.json` as *"OAuth-session material"*, but Claude Code's setup docs (as cited in the evidence at L120) note *"Some settings are stored in `~/.claude.json` rather than `settings.json`"*. It contains settings too, not just OAuth. Not just OAuth tokens — various user-level preferences.
**Current text:** evidence L61: "deleting `~/.claude/` plus the peer file `~/.claude.json` (OAuth-session material)"
**Evidence:** Per Anthropic setup docs: `~/.claude.json` stores a mix of settings (including some that can't be moved to settings.json) and OAuth material.
**Status:** IMPRECISE
**Suggested resolution:** Characterize `~/.claude.json` as *"mixed OAuth + certain settings that can't live in settings.json"* rather than "OAuth-session material".

---

## Confirmed Claims (summary — group by what you checked)

**GitHub Issues — all verified as described:**
- microsoft/vscode#310090 (CLI v1.115 vs GUI v1.116 mismatch, milestone 1.117.0, code-cli label) — CONFIRMED
- anthropics/claude-code#25075 (Claude Desktop hijacks `claude` on Windows, closed "not planned") — CONFIRMED
- microsoft/vscode#209356 (macOS app translocation → broken `/usr/local/bin/code` symlink) — CONFIRMED
- Cursor forum #39993 (Cursor Windows installer places `code.cmd` that shadows VS Code) — CONFIRMED

**Homebrew Casks — all binary/zap stanzas verified:**
- `visual-studio-code` (two binary stanzas: `code` + `code-tunnel`) — CONFIRMED
- `visual-studio-code@insiders` (`binary ".../bin/code", target: "code-insiders"`) — CONFIRMED
- `cursor` v3.2.10 (`binary ".../bin/code", target: "cursor"`) — CONFIRMED
- `cursor-cli` v2026.04.17-787b533 (separate binary, three zap dirs) — CONFIRMED
- `windsurf` v2.0.67 (`binary ".../bin/windsurf"`, no rename; `com.exafunction.windsurf.ShipIt` launchd agent) — CONFIRMED
- `zed` (`binary ".../cli", target: "zed"`) — CONFIRMED
- `zed@preview` (`binary ".../cli", target: "zed-preview"`; zap includes unsuffixed `~/Library/Application Support/Zed`) — CONFIRMED
- `warp` (no binary stanza, auto_updates true, channel-suffixed zap paths) — CONFIRMED

**OSS Source Code — verified:**
- Zed `crates/cli/src/main.rs` is 1433 lines — CONFIRMED (off-branch line count correction noted in M3)
- Zed `locate_bundle()` at L1252 walks parents until `.app` suffix — CONFIRMED
- Zed `install_cli_binary.rs` uses `remove_file + unix::symlink` with osascript fallback — CONFIRMED
- Zed has short-circuit when existing symlink points to same CLI — CONFIRMED (contradicts the negative-search; see M4)
- Zed bundle identifiers `dev.zed.Zed`, `dev.zed.Zed-Preview`, `dev.zed.Zed-Nightly`, `dev.zed.Zed-Dev` — CONFIRMED in release_channel/src/lib.rs (evidence cites wrong filename; see M3)
- VS Code `installShellCommand` uses `ln -sf` via osascript elevation — CONFIRMED (line numbers drifted; see M3)
- VS Code `product.json` on main shows OSS values (`code-oss`, `.vscode-oss`, `com.visualstudio.code.oss`) — CONFIRMED; evidence correctly marks Stable/Insiders values as INFERRED

**Vendor Docs — verified:**
- VS Code Settings Sync docs explicitly state Stable auto-disables on Stable when schema incompatibility detected — CONFIRMED exact wording
- CVE-2025-52882 is a WebSocket auth issue in Claude Code IDE extensions — EXISTS but characterization inverted (see H1)

---

## Unverifiable Claims (what couldn't be confirmed and why)

- **Claude Code desktop auto-updater mechanism** — evidence correctly marks as INFERRED (Electron Squirrel presumed, not confirmed). No further public source surfaced.
- **Warp bundled-CLI install mechanism (symlink vs copy)** — evidence correctly flags as UNCERTAIN; Warp docs do not specify.
- **Warp standalone Homebrew formula contents** — evidence reports `curl` 404 against `main`; could not confirm independently. The `warpdotdev/homebrew-warp` tap exists but formula inspection was blocked.
- **Local filesystem claims about the authoring machine** — e.g., `~/.claude.json`, `~/.local/share/claude/versions/{2.1.117,2.1.118,2.1.119}/`, six concurrent `~/.claude/sessions/<pid>.json` files. These are first-person observations; cannot be verified externally but are internally consistent with Claude Code's documented layout.
- **Zed schema-drift consequences between Stable/Preview** — evidence correctly flags as UNCERTAIN (not documented in the wild).
- **Windsurf canonical state dir (`~/.windsurf` vs `~/.codeium/windsurf`)** — evidence correctly flags as UNCERTAIN; cask zaps `~/.windsurf`, docs mention `~/.codeium/windsurf`; no live install verified.
- **`cursor-agent` env-var delegation intentionality** — evidence correctly flags as UNCERTAIN; gist describes observed behavior in closed-source binary.
- **ToDesktop packaging claim for Cursor** — evidence cites `com.todesktop.*` in zap stanzas. Not independently verified in this audit.
- **Claude Code ships across 7+ OR 8 install paths** — count disagreement between files (see L5); both are defensible under different grouping conventions.
