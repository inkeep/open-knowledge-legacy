# Audit Findings — Update Pass 2026-04-14

## Summary

8 findings across the new content added in the update pass. Distribution: 0 High, 4 Medium, 4 Low. No factual stance violations (no recommendations). No 1P framing. No non-goals violations. The new content is well-structured and maintains the report's factual register. The issues found are precision/consistency matters, not structural problems.

## Findings

### [M1]: Exec summary "never" overstates GitHub OAuth token behavior
**Section:** Executive Summary, third new bullet (line 83)
**Severity:** Medium
**Issue:** The exec summary says "Token expiry varies from 1 hour (GitHub App installation) to never (GitHub OAuth)." The detail section (D5 Sustained Auth Lifecycle, line 361) correctly states "No expiry (auto-revoke after 1yr inactivity)." Auto-revocation after 1 year of inactivity is not "never" -- it is "no scheduled expiry with an inactivity-based revocation policy." The exec summary loses this nuance.
**Evidence:** D5 table row for GitHub OAuth: "No expiry (auto-revoke after 1yr inactivity)." Evidence file d5-sustained-auth-lifecycle.md, Finding 1: "no expiry."
**Suggested fix:** Change exec summary to: "Token expiry varies from 1 hour (GitHub App installation) to no scheduled expiry (GitHub OAuth, with 1-year inactivity auto-revoke)."

### [M2]: Dugite "GH001-GH006" range not fully supported by evidence
**Section:** D6 Error-Class Taxonomy (line 442)
**Severity:** Medium
**Issue:** The report says "GH001-GH006, secret detection" implying 6 sequential server error codes plus a separate secret detection code. The evidence file (d6-failure-taxonomy.md, line 47) explicitly names only GH001 (`PushWithFileSizeExceedingLimit`), GH002 (`HexBranchNameRejected`), GH003 (`ForcePushRejected`), GH004 (`ProtectedBranchRequiresReview`), and `PushWithSecretDetected` without a GH label. GH005 and GH006 are not enumerated in the evidence. The range "GH001-GH006" may be correct per dugite source, but the evidence file does not verify codes GH005 or GH006.
**Evidence:** d6-failure-taxonomy.md line 47 lists 4 explicit GH codes (GH001-GH004) plus an unlabeled `PushWithSecretDetected`.
**Suggested fix:** Either verify GH005 and GH006 in dugite source and add them to the evidence file, or change the report to "GH001-GH004 and server-specific codes including secret detection."

### [M3]: INFERRED finding stated as declarative fact in report
**Section:** Sync-Engine Apps as Prior Art, "Cross-domain progress patterns" (line 733)
**Severity:** Medium
**Issue:** Evidence file sync-engine-prior-art.md marks the finding "Cross-domain progress patterns converge on single aggregate indicator with phase labels" as **INFERRED** (line 112). The report states this declaratively: "Cross-domain progress patterns converge on three properties: (1) a single aggregate indicator (not per-subsystem), (2) phase labels (downloading/extracting/indexing), and (3) determinate percentage when possible." Per audit criterion 4, INFERRED claims should use hedged language.
**Evidence:** sync-engine-prior-art.md line 112: "Confidence: INFERRED."
**Suggested fix:** Add a hedge: "Cross-domain progress patterns appear to converge on three properties..." or "Evidence suggests cross-domain progress patterns converge on..."

### [M4]: Exec summary omits Google Docs from offline-capable sync-engine list
**Section:** Executive Summary, second new bullet (line 82)
**Severity:** Medium
**Issue:** The exec summary lists "(Linear, Figma, Notion, Obsidian Sync)" as apps that "have solved offline queues, reconnection UX, and conflict avoidance." The detail section surveys six apps including Google Docs and Replit. Replit has no offline mode (correct to exclude). Google Docs does have offline mode with OT reconciliation (documented in the detail section's table, line 706), so its omission from the exec summary parenthetical is inconsistent. The exec summary presents a subset without indicating it is a subset.
**Evidence:** Sync-Engine Apps table (lines 701-708) includes Google Docs with "Browser local cache (Chrome extension)" and "4-step OT reconciliation."
**Suggested fix:** Either add Google Docs to the parenthetical list, or add "among others" to signal the list is illustrative.

### [L1]: "cannot" overstates structural barrier in Theme 7 Observation
**Section:** Theme 7: The Failure-Mode Gradient, Observation (line 689)
**Severity:** Low
**Issue:** "without structured error codes, editors cannot implement the retry classification, documentation linking, or adaptive backoff that API clients take for granted." Editors can and do build structured layers on top of stderr parsing (VS Code's 48 codes, dugite's 59 codes). The barrier makes it harder, not impossible. "cannot" is too strong; "do not" or "have not" is factually precise.
**Evidence:** The same paragraph acknowledges VS Code and dugite regex-based classification exists.
**Suggested fix:** Change "editors cannot implement" to "editors have not implemented" or "editors lack the foundation to easily implement."

### [L2]: SiYuan "15-step" count not fully enumerable from evidence prose
**Section:** D8 Sync Button Decomposition (line 592)
**Severity:** Low
**Issue:** The report and evidence both claim SiYuan/Dejavu sync is a "15-step" protocol, citing `sync.go`. However, the evidence file's prose enumeration (d8-sync-button-anatomy.md, lines 43-44) lists approximately 11-12 named steps. The "15" may be accurate per the Go source, but the evidence prose does not enumerate all 15, making independent verification from the evidence file alone impossible.
**Evidence:** d8-sync-button-anatomy.md line 42-44 enumerates: lock, retrieve indexes, compare IDs, download, upload, three-way diff, semantic conflict detection, generate conflict history, merge index, restore files, update references, release lock (~12 steps).
**Suggested fix:** Either expand the evidence enumeration to list all 15 steps from `sync.go`, or soften to "~15-step" in both evidence and report.

### [L3]: Azure DevOps OAuth deprecation claim lacks inline citation
**Section:** Dimensions Added in Update Pass (line 785)
**Severity:** Low
**Issue:** "Scheduled for removal in 2026" is stated as fact but the evidence file (d5-sustained-auth-lifecycle.md, line 91) places this in the "Gaps / follow-ups" section rather than a CONFIRMED finding. No specific Microsoft Learn URL or announcement is cited in either the evidence file or report.
**Evidence:** d5-sustained-auth-lifecycle.md line 91 mentions it as a gap/follow-up, not a verified finding.
**Suggested fix:** Add a citation to the official Azure DevOps OAuth deprecation announcement, or soften to "reportedly scheduled for removal in 2026."

### [L4]: Sync Button table omits iCloud and Dropbox present in evidence
**Section:** D8 Sync Button Decomposition table (lines 587-594)
**Severity:** Low
**Issue:** The evidence file d8-sync-button-anatomy.md (lines 68-78) includes iCloud and Dropbox in the decomposition summary table. The report's table omits both. This is likely an intentional editorial choice (iCloud and Dropbox don't have "buttons"), but it creates a discrepancy between report and evidence. The evidence file's Decomposition Summary table has 8 rows; the report's table has 6 rows.
**Evidence:** d8-sync-button-anatomy.md "Decomposition Summary" table includes all 8 tools.
**Suggested fix:** Either add iCloud/Dropbox to the report table (they appear in the D8 vocabulary map section already), or note that the table covers tools with explicit user-facing sync actions.

---

## Checks Passed (No Findings)

- **Factual stance (Criterion 1):** No recommendations, no "should" or "builders should" statements in any new section. All new content maintains observational register.
- **Non-goals adherence (Criterion 6):** Clone/init references in D6 recovery are about error recovery, not clone UX design. CRDT references in Sync-Engine section are factual observations about conflict models, not CRDT branching internals. Progress reporting covers library APIs factually, not as selection guidance.
- **3P framing (Criterion 7):** Zero mentions of Open Knowledge, Inkeep, or any first-party product in any new section.
- **Cross-section consistency (Criterion 3):** Five-class taxonomy count, five-tier vocabulary model, 4-stage Linear pipeline, 7 Joplin sync targets, 30+ Obsidian-Git commands -- all consistent between exec summary, detail sections, and evidence files.
