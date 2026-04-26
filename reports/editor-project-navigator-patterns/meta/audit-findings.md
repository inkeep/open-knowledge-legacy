# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/reports/editor-project-navigator-patterns/REPORT.md`
**Audit date:** 2026-04-25
**Total findings:** 4 (0 high, 1 medium, 3 low)

---

## High Severity

None.

---

## Medium Severity

### [M] Finding 1: Cross-cutting axes table has 4 cells in a 3-column row (markdown malformation)

**Category:** COHERENCE
**Source:** L7 (inline source attribution / table structure) and reader-pass gestalt
**Location:** REPORT.md §D7 → "Cross-cutting axes" table, line 285
**Issue:** The table header declares three columns ("Position A", "Position B", "Position C"). The first two body rows correctly fill three cells. The third row ("First-launch surface") packs four values across what should be three columns, producing a malformed markdown row.
**Current text:**
```
| **First-launch surface** | Navigator first (Obsidian, JetBrains, Zed) | Single window with Welcome tab (VSCode, Cursor) | Demo content (Logseq) | None — empty state (Sublime) |
```
**Evidence:** The header row has only three position columns; this row attempts to express four mutually-exclusive first-launch surfaces (navigator-first, Welcome-tab, demo-content, empty-state) and overflows. Most renderers will either drop the trailing cell or render a ragged table. The substance is also internally interesting: the report's framing claims three positions exist for this axis, but the row itself implies four positions are needed to cover the surveyed apps.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) widen the table to four columns and add a "Position D" header for the empty-state case, or (b) merge "Demo content" + "None — empty state" into a single "Other (Logseq demo, Sublime empty)" cell to fit Position C, or (c) restructure the row as a separate two-column "First-launch surface taxonomy" sub-table. Option (a) is the most faithful to the underlying observation.

---

## Low Severity

### [L] Finding 2: Changelog says "4 patterns + 1 baseline"; report says "four patterns including no-navigator"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) — across artifacts in the same report directory
**Location:** `meta/_changelog.md` line 7 vs REPORT.md exec summary + D1
**Issue:** The changelog frames the taxonomy as "4 distinct patterns + 1 baseline (Welcome page, Welcome window, Vault Switcher with two presentation variants, No-navigator)" — implying no-navigator is a baseline rather than a pattern. The report itself consistently calls no-navigator "Pattern 4" and counts four patterns inclusive. Within the report this is consistent; the inconsistency lives between report and changelog.
**Current text (changelog):** "Identified 4 distinct patterns + 1 baseline (Welcome page, Welcome window, Vault Switcher with two presentation variants, No-navigator)."
**Current text (report exec summary):** "the field divides into **four distinct project-navigator patterns** — including 'no-navigator' as a viable design point."
**Evidence:** D1 enumerates four patterns and labels Sublime's no-navigator as "Pattern 4." The exec summary says four patterns inclusive. The changelog narration "4 + 1 baseline" reads as "4 patterns plus a no-navigator baseline" — which is five entities, not four.
**Status:** INCOHERENT
**Suggested resolution:** Update the changelog to match the report's framing: "Identified 4 distinct patterns (Welcome page, Welcome window, Vault Switcher with two presentation variants, No-navigator) including no-navigator as a viable design point." Report itself needs no change.

### [L] Finding 3: "Within one click of cold launch" oversells Cursor's sign-in and JetBrains' Import Settings dialog

**Category:** COHERENCE
**Source:** L5 (summary coherence) and L3 (missing conditionality)
**Location:** REPORT.md §D6 first-launch summary (line 167), echoed in exec summary (line 41)
**Issue:** The summary asserts "Six of seven apps surface a navigator (or stand-in) within one click of cold launch. Sublime is the exception." But the same table notes:
- Cursor: "Sign-in screen → then VSCode-equivalent Welcome tab" — sign-in is a multi-field auth flow, not "one click."
- JetBrains: "Import Settings dialog → Welcome screen window" — Import Settings is a one-time first-run modal, not the navigator itself.

For genuine cold start (no recents, no prior account), Cursor requires sign-in before any navigator surface, and JetBrains requires dismissing the Import Settings dialog. The "one click" framing reads as a tighter UX claim than the table substantiates.
**Current text:** "Six of seven apps surface a navigator (or stand-in) within one click of cold launch."
**Evidence:** Same-section first-launch table on lines 159-165 explicitly notes the sign-in and Import Settings preconditions.
**Status:** INCOHERENT (slight imprecision)
**Suggested resolution:** Soften to "Six of seven apps surface a navigator (or stand-in) on cold launch (some after a one-time setup dialog or sign-in). Sublime is the exception." Trades the punchy "one click" for accuracy.

### [L] Finding 4: Zed welcome page in stable vs Preview channel not noted

**Category:** FACTUAL
**Source:** T4 (web verification of version-pinned claim)
**Location:** REPORT.md §D6 first-launch table (line 163), Pattern 1 (line 80), evidence file d5
**Issue:** PR #44048 (the change cited in the report as "since PR #44048, 2025") merged on 2025-12-16 and shipped to Zed's Preview channel as of 2025-12-29. Today's date is 2026-04-25. The launchpad/welcome page has subsequently shipped to stable channels (verified via 2026 Zed release notes). The report's "since PR #44048, 2025" framing is correct but loses the channel-promotion detail. A reader checking against an older stable Zed (pre-promotion) might find the welcome page missing.
**Current text:** "Welcome page in editor (since PR #44048, 2025)"
**Evidence:** PR #44048 page says merged Dec 16, 2025; "Available in Zed's Preview channel" comment from 2025-12-29. April 2026 release notes confirm the welcome/launchpad is in stable.
**Status:** STALE (technically correct but undertells the version dependency)
**Suggested resolution:** No change required for a 3P factual report; if a precision pass is desired, append "(merged 2025-12-16, promoted to stable in early 2026)" to the table cell. Alternatively, document the channel detail in the d5 evidence file's gaps section.

---

## Confirmed Claims (summary)

The following load-bearing claims were spot-checked and confirmed:

- **VSCode `closeFolder` and `closeWorkspace` share command id `workbench.action.closeFolder` (CloseWorkspaceAction).** Verified directly against `microsoft/vscode/src/vs/workbench/browser/actions/workspaceActions.ts` — both menu entries map to the same action class with conditional labels via `WorkbenchStateContext`. (D2 finding, exec summary, D6 table)
- **VSCode `Ctrl+K F` keybinding gated by `when: focusedView != ''`.** Verified against issue #245078 — issue body explicitly identifies the restrictive context clause.
- **Cursor 3.0 changelog is agent-UI-focused with no project-navigator changes.** Verified against `cursor.com/changelog/3-0` — covers Agents Window, Agent Tabs, Design Mode, MCP plugin support; no welcome/folder UI changes.
- **JetBrains "Reopen projects on startup" default enabled.** Verified via JetBrains help docs + community/support consensus — default checked.
- **Obsidian `obsidian://choose-vault` introduced in Desktop v1.11.7 on 2026-01-28.** Verified directly against `obsidian.md/changelog/2026-01-28-desktop-v1.11.7/`.
- **Obsidian first-launch shows two options (Create new vault / Open folder as vault).** Verified against `obsidiansmd/obsidian-help` Create-a-vault page.
- **Logseq swap-in-place via `:graph/switch` event handler.** Verified against deepwiki — handler clears query state, sets repo, restores config, redirects to home. Report's "swap-in-place" framing is consistent with the handler's behavior in the report's window-management taxonomy (no new OS window).
- **Zed PR #44048 added launchpad/welcome page on no-workspace cold start.** Verified — PR title is "Launchpad page", merged 2025-12-16, replaces prior empty-tab behavior.
- **Zed `projects::OpenRecent` bound to both `alt-cmd-o` and `ctrl-r` on macOS.** Verified against `zed-industries/zed/assets/keymaps/default-macos.json`.
- **Logseq demo-graph banner reads "This is a demo graph, changes will not be saved until you open a local folder."** Verified via discuss.logseq.com forum testimony.

Coherence lenses L2 (confidence-prose alignment), L4 (evidence-synthesis fidelity), L6 (stance consistency) all passed without findings. INFERRED claims in evidence files (e.g., JetBrains exact dialog button labels, VSCode globalStorage path) are correctly flagged in the report's Limitations & Open Questions section.

## Unverifiable Claims

- **Cursor 3.0 "Welcome page bug" (forum thread).** The report attributes the missing-welcome-page bug to a specific T3 forum post; the post exists but per-user reproducibility could not be independently confirmed. The report correctly labels this as T3 evidence with a vendor caveat.
- **JetBrains exact button labels in the New/This/Ask dialog.** The report's Limitations section already flags this as a known gap. No false claim, no audit finding.
