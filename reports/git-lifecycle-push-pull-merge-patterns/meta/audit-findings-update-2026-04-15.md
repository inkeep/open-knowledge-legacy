# Audit Findings — 2026-04-15 Update Pass

## Summary
- Total findings: 7
- High: 2 (correctness errors that would mislead)
- Medium: 3 (clarity issues, stance drift, omission)
- Low: 2 (minor sourcing, formatting)

---

## Findings

### H1: Theme 8 Tier 4 incorrectly attributes jitter to Temporal
**Section:** Cross-Cutting Themes → Theme 8: The Scheduler Maturity Gradient, line ~761
**Issue:** Tier 4 description reads: "Exponential backoff with configurable coefficient, max interval, **and jitter (Temporal, Prefect)**." This is factually wrong. Temporal does not have built-in jitter. The D6 retry table (line 508) correctly marks Temporal as "none built-in" for jitter. The c3 evidence finding says "Jitter: none built-in." The Limitations section (line 955) explicitly states "Temporal jitter: Confirmed absent from RetryPolicy schema — can only be added manually inside Activity code."
**Evidence:** c3-workflow-automation-retry-patterns.md (table, gaps); D6 retry table line 508; Limitations line 955 — all three consistently confirm Temporal jitter is absent.
**Suggested fix:** Change to "Exponential backoff with configurable coefficient, max interval, and jitter (Prefect only; Temporal: none built-in, must be added manually in Activity code)." Or restructure to separate Temporal and Prefect when describing jitter support.

---

### H2: Executive Summary "Non-editor sync dynamics" bullet misattributes "two-level retry" to workflow engines
**Section:** Executive Summary, new key finding bullet at line 100
**Issue:** The bullet reads: "File-sync tools (Syncthing, Rclone, Nextcloud) and workflow engines (n8n, Temporal) have converged on design patterns... two-level retry (per-operation + per-API-call)." Two-level retry (outer `--retries` + inner `--low-level-retries`) is exclusively a Rclone feature documented in c4. The c3 evidence (workflow tools including n8n and Temporal) contains no mention of two-level retry. Temporal retries at the Activity level only; n8n has a single fixed-count retry. The feature set described in the bullet conflates file-sync tool capabilities with workflow engine capabilities.
**Evidence:** c4-file-sync-tools-dynamics.md finding "Rclone has two-level retry: 3 outer (whole pass) + 10 inner (per-API-call)"; c3-workflow-automation-retry-patterns.md contains no two-level retry finding.
**Suggested fix:** Move "two-level retry (per-operation + per-API-call)" from the combined description to the file-sync tools clause only: "...file-sync tools (Syncthing, Rclone, Nextcloud) have adopted jittered scan intervals, configurable debounce windows, two-level retry (per-operation + per-API-call), and timetable-based rate limiting; workflow engines (n8n, Temporal) add typed retry classification and durable execution state."

---

### M1: Theme 8 Tier 1 SiYuan sentence is grammatically ambiguous — reads as denying SiYuan has counted backoff
**Section:** Cross-Cutting Themes → Theme 8 Tier 1, line ~755
**Issue:** The sentence reads: "No error backoff (Obsidian-Git, logseq/git-auto) or counted backoff after repeated failures (SiYuan)." The structure implies SiYuan also lacks counted backoff, which is the opposite of what the rest of the report (D8 section, evidence file, comparative table) documents. SiYuan has the most sophisticated backoff of any tool in Tier 1. The author likely intended to say "Obsidian-Git and logseq/git-auto have no error backoff; SiYuan has counted backoff," not that SiYuan lacks it.
**Evidence:** c1-git-editor-sync-dynamics.md: "After 7 consecutive auto-sync failures, auto-sync is blocked... After 8 failures, planSyncAfter(fixSyncInterval) schedules a 5-minute retry"; D8 table line 659 confirms counted backoff for SiYuan.
**Suggested fix:** Rewrite to: "No error backoff (Obsidian-Git, logseq/git-auto). SiYuan has counted backoff after repeated failures (7 fail → block; 8 → 5-min retry; 15 → 64-min) — the most sophisticated in this tier — but does not use exponential coefficients."

---

### M2: Executive Summary D8 (extended) bullet loses the 8-failure intermediate step, creating inconsistency with D8 body
**Section:** Executive Summary, D8 (extended) key finding bullet at line 98
**Issue:** The bullet compresses SiYuan's backoff as "7 failures → block auto-sync, 5-min retry, escalating to 64-min." This implies the 5-min retry occurs immediately at the 7-failure block, but the D8 body (line 670) and c1 evidence are both explicit that the block occurs at >7 and the 5-min retry fires at 8 failures. Omitting the 8-failure step makes the bullet internally inconsistent with the detail section and the evidence, and misrepresents when the retry kicks in.
**Evidence:** c1-git-editor-sync-dynamics.md line 63: "After 7 consecutive auto-sync failures, auto-sync is blocked... **On 8th failure**, planSyncAfter(fixSyncInterval) schedules a 5-minute retry. After 15 failures total, backoff extends to 64 minutes." D8 body line 670 matches.
**Suggested fix:** Change to "7 failures → block auto-sync; 8 failures → 5-min retry; 15 failures → 64-min."

---

### M3: Airflow `retry_exponential_backoff` parameter presented as numeric in evidence file without version qualification
**Section:** evidence/c3-workflow-automation-retry-patterns.md, finding at line 63; propagated to REPORT.md D6 section
**Issue:** The c3 evidence file states `retry_exponential_backoff=2.0` as if the parameter accepts a numeric multiplier. Prior to Airflow 3.2.0, `retry_exponential_backoff` is a boolean (`True`/`False`) with a hardcoded multiplier of 2.0 — not a configurable float. Airflow 3.2.0 changed the schema from boolean to number, but this is a very recent change (as of April 2026, Airflow 3.2.0 is not yet in wide production deployment). Presenting `=2.0` as a parameter value without version context misrepresents the historical and dominant API. The evidence file gap note (line 106) acknowledges uncertainty about "multiplier values other than 2.0" but doesn't surface the boolean→numeric type change.
**Evidence:** Apache Airflow 3.2.0 release notes (confirmed via web search): "Previously, this parameter only accepted boolean values (True or False)... In Airflow 3.2, the REST API schema for retry_exponential_backoff has changed from type: boolean to type: number."
**Suggested fix:** Update the evidence finding to: "`retry_exponential_backoff=True` (boolean; pre-3.2.0) or numeric multiplier (3.2.0+). Prior to 3.2.0, multiplier is hardcoded at 2.0. `max_retry_delay=timedelta(...)`." Add the version note to the gaps section. The REPORT.md Airflow row in the D6 table (line 510) omits the `retry_exponential_backoff` parameter name and is not affected, but the characterization "equivalent configurability" to Temporal/Prefect should note that the multiplier was only configurable as of Airflow 3.2.0.

---

### L1: Theme 7 and Theme 8 are numbered out of order
**Section:** Cross-Cutting Themes — ordering
**Issue:** The themes appear in the document as: Theme 1, Theme 2, Theme 3, Theme 4, Theme 5, Theme 6, **Theme 8**, **Theme 7**. Theme 8 (Scheduler Maturity Gradient, the new addition) appears before Theme 7 (Failure-Mode Gradient, the 2026-04-14 addition). The changelog or new content insertion placed Theme 8 before Theme 7 without renumbering.
**Evidence:** REPORT.md line 751 (Theme 8), line 771 (Theme 7) — verified via grep.
**Suggested fix:** Either swap the section order so Theme 7 precedes Theme 8, or renumber so the newly added section becomes Theme 7 and the existing "Failure-Mode Gradient" becomes Theme 8.

---

### L2: Airbyte circuit-breaker description omits two of three halt thresholds, presenting incomplete picture
**Section:** D6 retry table (line 511) and Theme 8 Tier 4 (line 761)
**Issue:** Both the D6 table and Theme 8 describe Airbyte's halt condition as "5 zero-data failures → halt." The c3 evidence documents three distinct halt thresholds: 5 consecutive zero-data → halt; 10 total zero-data → halt; 20 total partial-data → halt. Presenting only the first threshold as the complete circuit-breaker picture understates the system's sophistication and could mislead readers modeling their own threshold-based logic.
**Evidence:** c3-workflow-automation-retry-patterns.md line 51: all three thresholds documented with CONFIRMED confidence.
**Suggested fix:** Expand D6 table Non-Retryable column to: "threshold (5 consec. zero-data = halt; 10 total zero-data = halt; 20 partial-data = halt)." Update Theme 8 Tier 4 parenthetical similarly.
