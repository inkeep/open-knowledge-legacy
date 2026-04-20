# Changelog

## 2026-04-18 — post-audit resolution

Audit returned 9 findings (2 High, 4 Medium, 3 Low). All resolved in the same session via surgical edits. No findings declined, no escalations.

**Resolutions applied:**

- **F1+F2 (High, factual + coherence):** Removed the composite user-setup quote from ws#2148 in both `evidence/b3-tcp-async-race.md` and `REPORT.md §B3`. Retained the verbatim lpinca quote and rewrote surrounding context to describe the reporter's premise without fabricating the reporter's words. The underlying claim ("userspace `readyState` pre-check is insufficient") remains supported by the maintainer's own statements across ws#1017, #1172, and #2148.
- **F3 (Medium):** Added an explicit "Relationship to in-process integration test harnesses" subsection in Track A's Option A analysis, clarifying that programmatic in-process test harnesses (common pattern for CRDT-server projects) operate at a different layer than the child-process Vite spawn this report recommends. The two patterns share only the port-allocation primitive, not the process model.
- **F4 (Medium):** Added explicit decision criteria in §B5 for choosing Pattern A vs Pattern B. Criteria cover: #1017 awareness-recursion exposure (diagnosed from stack traces), multi-instance deployment, v5+ migration alignment. Default to Pattern A for single-instance consumers whose failure path is broadcaster-timer-driven (not awareness-driven).
- **F5 (Medium):** Hedged the exec-summary language. Replaced "manifests as residual test flakes even after test-logic fixes (the PR-206-class residual)" with the more-measured "is the structural source of cross-worker CPU contention; whether per-worker isolation eliminates a specific observed flake is empirical (measurable only after migration), but the architectural premise is well-precedented."
- **F6 (Medium):** Added GitHub permalinks for the "#1032 is inapplicable" + "recursion still present on main" claims. Linked directly to [Connection.ts:154-168 on main](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Connection.ts#L154-L168).
- **F7 (Low):** Subsumed by F4 + F6 fixes; no separate action needed.
- **F8 (Low):** Added derivation of "~1-2% CI overhead" inline: 8s / 420s ≈ 1.9% on a 7-minute baseline; 0.9% on a 15-minute nightly tier. Flagged as illustrative, not measured.
- **F9 (Low):** Added explicit Pattern A vs Pattern B cost comparison table in Track B's ranked recommendation section. Covers LOC, affected files, test surface, recursion-class coverage, migration alignment, rollback cost.

**Verification (post-edit):**

- Primary-source quote at `evidence/b3-tcp-async-race.md` is now verbatim-only.
- Report's exec summary confidence language matches evidence strength throughout.
- All CONFIRMED claims link to either evidence files or primary-source URLs.
- Decision criteria in §B5 give readers a checklist to adjudicate Pattern A vs B against their own stack traces — no project-specific 1P content.
