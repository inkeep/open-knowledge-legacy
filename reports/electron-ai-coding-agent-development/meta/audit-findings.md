# Audit findings — electron-ai-coding-agent-development (2026-04-15)

## Summary

Overall verdict: the report is well-grounded. Load-bearing version claims (Electron 41.2.0 / 40.8.5 / 39.8.7, Node 24.14.0, Chromium 146, Electron-41 release date 2026-04-07, Spectron deprecation 2022-02-01, Electronegativity v1.10.0 2022-12-07, CVE-2025-55305 fixed-in set, Playwright min Electron v12.2.0+) all check out against primary sources. Evidence links resolve and referenced fanout sections contain the cited claims. The primary issue found is a single internal coherence gap between top-level REPORT and a fanout report, plus some low-severity framing inconsistencies and a prescriptive-leaning phrase or two. Stance is mostly factual with clear "decision triggers" — not a 1P recommendation doc. No 1P Open Knowledge analysis leaked in.

Counts: **5 findings** (H: 1, M: 2, L: 2).

## High-severity findings

### [H1] Playwright issue #11240 is characterized as "open" in REPORT but fanout and GitHub say "closed"

- Evidence in REPORT: Executive Summary (line 57) — "Playwright `electron.launch()` has no `userDataDir` option (feature request #11240 open)." Also D7 (line 210) — "(feature request #11240 open)".
- Fanout contradiction: `fanout/d-dev-loop/REPORT.md:45` correctly states "github.com/microsoft/playwright/issues/11240 (closed, P3) is the open feature request" (meaning "still-pending but closed"). The fanout itself is internally muddled ("closed, P3" then "is the open feature request") but does confirm CLOSED state.
- Primary-source check: WebFetch of `https://github.com/microsoft/playwright/issues/11240` — issue is Closed, labeled P3-collecting-feedback, feature-electron.
- Status: CONTRADICTED (status) / INCOHERENT (with fanout).
- Severity rationale: Misleads a reader triaging whether upstream is actively tracking the gap; changes the risk calculus on "workaround vs. wait for upstream."
- Recommendation: Change to "(feature request #11240 closed as P3-collecting-feedback; workaround remains canonical)" in both the executive summary and D7.

## Medium-severity findings

### [M1] D3 finding states WebdriverIO "auto-detects Forge/electron-builder/unpackaged" and implies feature-completeness vs. Playwright, but executive summary (line 53) says "Playwright for Electron `_electron.launch()` is experimental-but-stable"

- Evidence in REPORT: line 53 — "Playwright has broader production use and `_electron.launch()` is experimental-but-stable"; line 135 says Playwright "experimental label, minimum Electron v12.2.0+".
- Primary-source check: Playwright docs confirm "experimental support" and min `v12.2.0+, v13.4.0+, v14+`. The "experimental-but-stable" phrasing is editorial — not sourced. Primary source uses only "experimental."
- Status: INCOHERENT (confidence-prose alignment, lens L2) — "experimental-but-stable" softens an explicit "experimental" label from primary source without citation.
- Severity rationale: Reader may underweight the experimental risk. Surgical fix.
- Recommendation: Quote primary phrasing ("experimental support") and separately note production-use signal via reference-app evidence, rather than collapsing into a hyphenated hedge.

### [M2] Executive summary (line 43) contains a prescriptive bullet "Lock one in a repo-level instruction file" without a decision trigger

- Evidence in REPORT: line 45 — "Agents conflating them generate unusable configs. Lock one in a repo-level instruction file." Also line 243 (D8) "Do not mix. Document the choice in a repo-level instruction file agents read first."
- Stance check (lens L6): report's declared stance (line 88) is "factual / external. Findings land as 'X exists with tradeoff Y'; recommendations in decision-triggers tables, not prose." These two phrases are imperatives in prose, not in a decision-trigger block.
- Status: INCOHERENT with declared stance.
- Severity rationale: Most other prescriptive guidance is correctly in "Decision triggers:" blocks; these two are in body prose. A careful reader may perceive stance drift.
- Recommendation: Either move the imperative into a decision-trigger bullet ("If the repo will be touched by agents trained on mixed corpora: lock one toolchain in `AGENTS.md` or `CLAUDE.md`.") or reframe as an observation ("Teams that mix the two surface configs generate unusable hybrids; the 2026 convention is to lock one in a top-level instruction file.").

## Low-severity findings

### [L1] Executive-summary bullet (line 52) rounds "~80% of dev-green/prod-red regressions" as a quantitative claim with no primary-source citation

- Evidence in REPORT: line 52 — "catches ~80% of dev-green/prod-red regressions (asar misses, native rebuild failures, isPackaged branches, missing extraResources) in ~1 CI minute."
- Fanout check: `fanout/b-testing-parity` does not contain a quantified 80% figure I could find; it describes the taxonomy of divergences but not a percentage.
- Lens L7 (inline source attribution): a quantitative claim without source context.
- Status: UNVERIFIABLE externally; likely synthesized.
- Recommendation: Either attribute ("in GitHub Desktop's migration commit log ~X/Y incidents reproduce only against packaged builds") or soften ("catches the majority of…") and drop the numeric.

### [L2] D6 finding's evidence anchor "fanout/a-structure-ops §D6" — fanout report does include D6, confirmed; but no specific line range is provided

- Evidence link integrity lens (L7 / track-none): the REPORT's D6 links to `fanout/2026-04-15-initial/a-structure-ops/REPORT.md` without section anchor. Fanout a-structure-ops §D6 content matches (three-tier build loop + Sentry three-module split). Non-material.
- Status: minor imprecision, not incorrect.
- Recommendation: Add `#d6` anchor or line range to match the crispness of other D-level citations (e.g., D2 cites `ci.yml:213-266`).

## Spot-check verification log

| Claim (REPORT location) | Primary source | Result |
|---|---|---|
| Electron 41.2.0 GA 2026-04-07, Chromium 146, Node 24.14.0 (line 56, 230) | releases.electronjs.org | PASS |
| Electron 40.8.5 latest; 39.8.7 latest (line 232, 242) | releases.electronjs.org | PASS |
| Spectron deprecated 2022-02-01 (line 135) | github.com/electron-userland/spectron | PASS |
| CVE-2025-55305 fix in 35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6 (fanout e, line 13) | advisories/GHSA-vmqv-hx8q-j7mg | PASS |
| Electron 41.0.2 recommended install floor (line 239) | electronjs.org/blog/electron-41-0 | PASS |
| Playwright `_electron.launch()` experimental, min Electron v12.2.0+ (line 135) | playwright.dev/docs/api/class-electron | PASS (note: min reads "v12.2.0+, v13.4.0+, v14+" — REPORT abbreviates to v12.2.0+, acceptable) |
| Playwright userDataDir feature request #11240 "open" (line 57, 210) | github.com/microsoft/playwright/issues/11240 | **FAIL — issue is Closed** (see H1) |
| Electronegativity v1.10.0 2022-12-07, unmaintained (line 273) | github.com/doyensec/electronegativity | PASS |
| ASAR integrity digest requires @electron/asar ≥ 4.1.0 + re-sign (line 242, fanout e §81) | electronjs.org/blog/electron-41-0 | PASS |

## Meta

- Total findings: 5 (H: 1, M: 2, L: 2)
- Audit method:
  - Coherence lenses L1–L7 across REPORT.md and cross-referenced against each cluster fanout
  - Factual track T4/T5 spot-checks on 9 load-bearing external claims via WebFetch (Electron releases, Spectron deprecation, GH Advisory, Playwright docs + issue #11240, Electronegativity repo, Electron 41 blog)
  - Evidence-link integrity walk: each D1–E3 evidence pointer resolves to a cluster fanout that contains the cited finding
  - Stance-consistency check (L6) for factual-vs-prescriptive drift
  - 3P/1P scope check: no Open Knowledge-internal analysis leaked; "CRDT editor" is mentioned only as a generalized example class (acceptable per scope line 86)
- Time spent: ~25 min
