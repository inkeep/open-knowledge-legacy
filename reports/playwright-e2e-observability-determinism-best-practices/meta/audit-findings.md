# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/e2e-observability/reports/playwright-e2e-observability-determinism-best-practices/REPORT.md
**Audit date:** 2026-04-16
**Total findings:** 14 (6 High, 5 Medium, 3 Low)

Scope note: this is a factual-stance research report; many findings concern verifiable claims about third-party APIs, config names, or OSS-project configurations.

---

## High Severity

### [H1] Finding: Config option is named `failOnFlakyTests`, not `flakyTestsFail`

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** REPORT.md §Dimension 5 (lines 233, 236); evidence/playwright-official-docs.md (lines 81-82)
**Issue:** Both the report and its evidence file repeatedly call the Playwright test-config option `flakyTestsFail`. The actual option is `failOnFlakyTests` (and the CLI flag is `--fail-on-flaky-tests`). This is a hallucinated API name; setting `flakyTestsFail: true` in a real `playwright.config.ts` is a no-op.
**Current text:**
- Line 233: "`flakyTestsFail` (Playwright setting):"
- Line 236: "Zero of the 7 surveyed projects use it"
- Evidence line 82: "Setting `flakyTestsFail: true` fails CI on any retry-success"
**Evidence:** Playwright docs + https://github.com/microsoft/playwright/issues/34397 confirm the real option is `failOnFlakyTests` (landed in v1.52). The `defineConfig({ failOnFlakyTests: ... })` shape and `--fail-on-flaky-tests` CLI flag are the documented surface.
**Status:** CONTRADICTED
**Suggested resolution:** Rename all occurrences from `flakyTestsFail` to `failOnFlakyTests` in REPORT.md §Dimension 5, §Executive Summary (if referenced), the Limitations section, and in evidence/playwright-official-docs.md. Add a version note: "available since Playwright v1.52."

---

### [H2] Finding: Biome Playwright rule PR #8960 has merged; Biome ships `noPlaywrightWaitForTimeout` today

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** REPORT.md §Executive Summary (line 42), §Dimension 8 (lines 316, 341); evidence/enforcement-mechanisms.md (lines 57-66, 92-99)
**Issue:** The report characterizes `biomejs/biome#8960` as "in-progress (not yet landed)" / "not yet merged." The PR **merged on 2026-02-16** (commit 4a5ff40), and Biome v2.4.2 ships `noPlaywrightWaitForTimeout` as a nursery rule (info severity by default). Because the report is dated 2026-04-17, this materially changes the enforcement-options analysis: "Option B: wait for PR #8960" is no longer a future-state choice.
**Current text:**
- Line 42: "Biome integration is in-progress ([biomejs/biome#8960](https://github.com/biomejs/biome/pull/8960))."
- Line 316: "[`biomejs/biome` PR #8960](https://github.com/biomejs/biome/pull/8960) is integrating Playwright lint rules into Biome (not yet landed)."
- Evidence line 93: "Searched for any native Biome Playwright rule already shipped: **NOT FOUND.** PR #8960 is in-progress, not merged."
**Evidence:** https://github.com/biomejs/biome/pull/8960 (merged 2026-02-16); https://biomejs.dev/linter/rules/no-playwright-wait-for-timeout/ (available since v2.4.2). Also see commit 4a5ff4034d8406d7de28aa6ce8095987c3fef547.
**Status:** STALE / CONTRADICTED
**Suggested resolution:** Rewrite §Dimension 8 option table and the Key Findings to reflect that Biome ships the rule natively today (nursery, v2.4.2+). Note that the rule is still marked experimental (nursery) and update the 3-option comparison to: (1) Biome native (nursery rule, available); (2) `eslint-plugin-playwright`; (3) grep test. Refresh evidence/enforcement-mechanisms.md to match.

---

### [H3] Finding: Issue #19904 claim is inverted — the browser with CORS-failure on `setExtraHTTPHeaders` is Chromium, not WebKit/Firefox

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** REPORT.md §Dimension 6 (line 258, table row line 270); evidence/webkit-headless-cors.md (lines 18, 67-68, 78)
**Issue:** The report repeatedly states `setExtraHTTPHeaders` "ignores CORS in WebKit/Firefox" per #19904. The actual issue reports the opposite: Chromium enforces stricter CORS preflight when `setExtraHTTPHeaders` adds a custom header, while Firefox and WebKit work fine. The report's Dimension-6 fix table row therefore misadvises: `setExtraHTTPHeaders` is not a non-starter on WebKit — on that surface it works. The problem the report is solving (WebKit localhost CORS) is unrelated to the mechanism in #19904.
**Current text:**
- Line 258: "[#19904](https://github.com/microsoft/playwright/issues/19904) — `setExtraHTTPHeaders` ignores CORS in WebKit/Firefox."
- Line 270: "`setExtraHTTPHeaders` for Origin | Documented as ignored on WebKit/Firefox ([#19904](https://github.com/microsoft/playwright/issues/19904)). | Doesn't work."
- Evidence line 68: "`setExtraHTTPHeaders` for Origin | Issue #19904 | Documented as ignored by WebKit/Firefox"
**Evidence:** https://github.com/microsoft/playwright/issues/19904 — title is "setExtraHTTPHeaders does not work as expected with CORS" but the body describes Chromium-specific preflight failures; the maintainer-labeled thread notes WebKit/Firefox accept the extra header without CORS errors.
**Status:** CONTRADICTED
**Suggested resolution:** Rewrite the #19904 row and line 258 bullet. Either remove the reference entirely (it's not an authoritative source for "WebKit CORS doesn't work") or reword to: "Chromium enforces stricter CORS preflight than WebKit/Firefox when `setExtraHTTPHeaders` adds a custom header." If the claim the report wants is "header-based origin injection won't fix our WebKit localhost race," cite a different thread or remove this row from the fix table.

---

### [H4] Finding: Issue #2661 is about Chromium, not WebKit

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** REPORT.md §Dimension 6 fix-table row (line 269); evidence/webkit-headless-cors.md (line 67)
**Issue:** The report claims `--disable-web-security` is "Documented as 'does not work' in WebKit ([#2661])." Issue #2661 is about Chromium's `--disable-web-security` flag failing to enable cross-origin iframes. It has nothing to do with WebKit. Chrome-specific flags like `--disable-web-security` are not meaningful arguments to WebKit in the first place; citing #2661 as proof that this flag "doesn't work in WebKit" mischaracterizes both the issue and the mechanism.
**Current text:**
- Line 269: "`--disable-web-security` arg | Documented as "does not work" in WebKit ([#2661](https://github.com/microsoft/playwright/issues/2661)). | Doesn't work."
**Evidence:** https://github.com/microsoft/playwright/issues/2661 — issue body launches Chromium with `args: ['--disable-web-security']`; the WebKit launcher does not accept arbitrary Chromium args, so the flag is a Chromium-only mechanism.
**Status:** CONTRADICTED
**Suggested resolution:** Either remove the `--disable-web-security` row from the WebKit fix table (it's a Chromium flag and never was a WebKit option), or rewrite to say "Chromium-only flag; not a meaningful mechanism on WebKit." Update the one-line citation at line 269 and evidence line 67 accordingly.

---

### [H5] Finding: `no-wait-for-timeout` rule text is paraphrased/fabricated in multiple quotes

**Category:** FACTUAL
**Source:** T2 (direct source read) via curl of raw rule doc
**Location:** REPORT.md §Dimension 1 table (line 88 "explicitly banned"); §Dimension 8 (lines 328-331); evidence/condition-wait-primitives.md (line 59); evidence/enforcement-mechanisms.md (lines 44, 50)
**Issue:** The report repeatedly attributes a quote to the `no-wait-for-timeout` rule doc: "Prevents developers from using `page.waitForTimeout()`, which is considered an anti-pattern in test automation." The actual rule doc (curl https://raw.githubusercontent.com/playwright-community/eslint-plugin-playwright/main/docs/rules/no-wait-for-timeout.md) contains no such sentence. Full rule text is "Disallow usage of `page.waitForTimeout` (`no-wait-for-timeout`)" with short incorrect/correct code examples; the "recommended alternatives" list (waitForLoadState, waitForURL, waitForFunction) is factual but is given as code examples, not prose. The "considered an anti-pattern" wording appears nowhere in the doc.
**Current text:**
- Line 329: "**Rule definition (from [no-wait-for-timeout docs]):** > 'Prevents developers from using `page.waitForTimeout()`, which is considered an anti-pattern in test automation.'"
- Evidence enforcement line 44: same quote.
- Evidence condition-wait line 59-61: "The rule text is blunt: > 'Prevents developers from using `page.waitForTimeout()`, which is considered an anti-pattern in test automation. Use signals such as network events, selectors becoming visible and others instead.'"
**Evidence:** Raw rule doc contents (verified): short 12-line document, no paragraph containing the quoted language. The actual doc only shows incorrect/correct code examples with a single-comment-line: `// Use signals such as network events, selectors becoming visible and others instead.` (which is a JavaScript comment in the "correct code" block, not prose).
**Status:** CONTRADICTED (hallucinated quote)
**Suggested resolution:** Remove the fabricated blockquote in §Dimension 8 and the two evidence files. Replace with either (a) the actual rule-doc sentence ("Disallow usage of `page.waitForTimeout`"), or (b) paraphrase without attributing the made-up wording. A faithful summary: "Rule simply disallows `page.waitForTimeout()`; alternatives shown in example code are `waitForLoadState()`, `waitForURL()`, `waitForFunction()`." The rationale the report wants ("anti-pattern") is better attributed to community guides (BrowserStack, the Laichenkov post) that actually use that framing.

---

### [H6] Finding: Retries-count statistic "5 of 7 surveyed OSS projects" is arithmetically inconsistent with the cited projects, and the Penpot row is wrong

**Category:** COHERENCE + FACTUAL
**Source:** L1/L4 + T2 (direct source read of OSS configs)
**Location:** REPORT.md §Dimension 5 (line 218), §Executive Summary bullet "retries: 2"; evidence/oss-config-survey.md lines 44-49; REPORT.md body lines 223-227
**Issue:** Two stacked problems:
1. The body (line 218) and summary say "5 of 7 surveyed OSS projects" use `retries: 2` on CI. The report enumerates BlockNote, Milkdown, GitButler (both), Plasmic — that is either 4 projects (counting GitButler once) or 5 configs (counting GitButler's two configs). The evidence-file list (line 47) uses the latter reading but the body says "projects."
2. **The Penpot line at REPORT.md line 224 ("`retries: 0` — Penpot. Zero tolerance for flakes") is factually wrong.** Verified: `~/.claude/oss-repos/penpot/frontend/playwright.config.js` contains `retries: process.env.CI ? 2 : 0`. Penpot uses `retries: 2` on CI, same as the mainstream cluster.
3. Separately, BlockNote uses unconditional `retries: 2` (not `process.env.CI ? 2 : 0` as evidence line 47 claims).
**Current text:**
- Line 218: "`retries: 2` on CI is the dominant convention (5 of 7 surveyed OSS projects)."
- Line 224: "**`retries: 0`** — Penpot. Zero tolerance for flakes; every failure must be real."
- Evidence line 47: "BlockNote, Milkdown, GitButler (both), Plasmic all use `retries: 2` on CI (via `process.env.CI ? 2 : 0`). Cline uses `retries: 1`. Penpot uses `retries: 0`."
**Evidence:**
- `blocknote/tests/playwright.config.ts` line 27: `retries: 2,` (unconditional)
- `penpot/frontend/playwright.config.js`: `retries: process.env.CI ? 2 : 0,`
- So on CI: BlockNote=2, Milkdown=2, GitButler/e2e=2, GitButler/web=2, Cline=1, Plasmic=2, Penpot=2 → 6 of 7 projects (or 6 of 7 configs if GitButler counted as 2).
**Status:** CONTRADICTED / INCOHERENT
**Suggested resolution:** Correct Penpot's row to `retries: 2` (CI), remove it from the "zero tolerance" bucket. Restate the summary as "6 of 7 surveyed OSS projects use `retries: 2` on CI; Cline is the sole `retries: 1`." Fix BlockNote's description: unconditional `retries: 2`, not env-conditional. Recount the main claim and update the Executive Summary bullet accordingly.

---

## Medium Severity

### [M1] Finding: `trace: 'on-first-retry'` as "dominant" glosses over two projects that use `retain-on-failure`

**Category:** FACTUAL
**Source:** T2 (direct source read)
**Location:** REPORT.md §Executive Summary (line 34); §Dimension 3 (line 131); evidence/oss-config-survey.md line 26
**Issue:** The report characterizes `trace: 'on-first-retry'` as "dominant" / "convergent" across 7 projects. Verified configs show: BlockNote/Milkdown/GitButler-web use `on-first-retry`; GitButler/e2e uses `on`; Plasmic uses `retain-on-failure`; Penpot uses `retain-on-failure`; Cline's value was not inspected in this audit but evidence summary did not include it. Actual split is roughly 3 on-first-retry / 2 retain-on-failure / 1 on. Still a plurality for on-first-retry, but calling it "dominant convergence" overstates it.
**Current text:**
- Line 34: "The convergent CI config across 7 mature OSS projects is `retries: 2` (on CI), `trace: 'on-first-retry'`"
- Line 131: "The convergent community config is `trace: 'on-first-retry'`"
- Evidence line 26: "BlockNote, Milkdown, Plasmic, GitButler/web all use `trace: 'on-first-retry'`" — but Plasmic uses `retain-on-failure` (verified).
**Evidence:**
- `plasmic/platform/wab/playwright/playwright.config.ts`: `trace: "retain-on-failure"` and `video: "retain-on-failure"`
- `penpot/frontend/playwright.config.js`: `trace: 'retain-on-failure'` and `video: 'retain-on-failure'`
**Status:** CONTRADICTED (Plasmic mis-classification) + overstated convergence
**Suggested resolution:** Remove Plasmic from the "on-first-retry" set in evidence file. Restate the trace summary as: "Plurality — 3–4 of 7 use `on-first-retry`; 2 use `retain-on-failure`; 1 forces `on` with an inline bug comment." Keep the "on-first-retry OR retain-on-failure — both valid" guidance that already exists in the config-shape block (lines 139-144).

---

### [M2] Finding: Penpot claim "no explicit e2e artifact upload" contradicts config showing `video: 'retain-on-failure'`

**Category:** FACTUAL / COHERENCE
**Source:** T2 (direct source read)
**Location:** evidence/oss-config-survey.md line 99
**Issue:** Evidence file says "Penpot: no explicit e2e artifact upload." But the Penpot `playwright.config.js` has `video: 'retain-on-failure'` and `trace: 'retain-on-failure'` — it does capture artifacts locally. The evidence claim is narrowly correct if interpreted as "no CI workflow step that uploads them," but the absence of a GHA upload wasn't verified in this audit; the phrasing currently reads as if Penpot has no artifact capture at all.
**Current text:** "Penpot: no explicit e2e artifact upload"
**Evidence:** penpot/frontend/playwright.config.js shows both trace and video capture enabled.
**Status:** INCOHERENT (ambiguous) — may be technically accurate about GHA upload, but the phrasing conflates with local capture
**Suggested resolution:** Reword to "Penpot: captures trace + video on failure locally; no GHA artifact-upload step surveyed in this audit" or verify the CI workflow and correct either way.

---

### [M3] Finding: `actions/upload-artifact@v4` is presented as canonical; current stable is v7

**Category:** FACTUAL / STALE
**Source:** T4 (web verification) + T2 (direct source read)
**Location:** REPORT.md §Dimension 4 (lines 178, 187); evidence/ci-artifact-patterns.md (lines 31, 40)
**Issue:** The report's canonical workflow templates pin `actions/upload-artifact@v4`. Per GitHub's 2026-02-26 changelog, v7 is the current stable and ships non-zip support. Mature surveyed projects (BlockNote, Milkdown) actually use v7. v4 is still supported but is the minimum viable version, not canonical / current.
**Current text:**
- Line 178: "uses: actions/upload-artifact@v4"
- Line 187: "uses: actions/upload-artifact@v4"
**Evidence:** https://github.com/actions/upload-artifact (current release v7); BlockNote `.github/workflows/build.yml` uses `actions/upload-artifact@v7`; Milkdown `.github/workflows/ci.yml` uses `actions/upload-artifact@v7`.
**Status:** STALE
**Suggested resolution:** Update the canonical YAML template to `@v7` (or note "v4 minimum; v7 is current"). Adjust both sites in REPORT.md and evidence/ci-artifact-patterns.md.

---

### [M4] Finding: Playwright annotation "reporting" column is unverified against docs

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** REPORT.md §Dimension 10 table (lines 393-397); evidence/skip-vs-filter-vs-fix-patterns.md (lines 25-29)
**Issue:** The annotation-semantics table presents a "Reporting" column with values "Skipped," "Fixme," and "Expected failure." Per the Playwright test-annotations doc spot-check, the docs describe functional behavior of each annotation but do not guarantee the specific reporter labels. "Fixme" as a reporter status specifically may not be a documented canonical term — reporters have historically used "skipped" for both `.skip` and `.fixme` with a separate annotation-metadata marker. The distinction the report asserts may be reporter-specific (HTML reporter vs list vs JSON) rather than canonical.
**Current text:**
- Line 393-397: table row "`test.fixme(cond, reason)` | Broken but fix coming | Fixme | ..."
- Evidence line 28: "Reported as fixme. **Implies a pending fix.**"
**Evidence:** Playwright `test-annotations.mdx` describes behaviors but doesn't define a separate "fixme" reporting status. The docs say `test.fixme` "marks the test as failing. Playwright will not run this test" — functionally it is a skip with annotation metadata. The HTML reporter displays annotation labels but the reporter-status bucket may still be "skipped."
**Status:** UNVERIFIABLE / potentially INCOHERENT
**Suggested resolution:** Verify against a recent Playwright HTML report what label appears. If the distinction is reporter-specific, add a caveat. If "Fixme" is not a distinct reporter status, rewrite to "reported as skipped with annotation metadata" or similar.

---

### [M5] Finding: Issue #4031 characterized as WebKit/localhost CORS is actually a Chromium CORS thread

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** REPORT.md §Dimension 6 (line 256); evidence/webkit-headless-cors.md lines 12, 46-48
**Issue:** The report cites #4031 as evidence that "`Access-Control-Allow-Origin` issues arise uniquely in headless mode for some browsers" supporting the WebKit-headless-CORS narrative. The actual issue (from 2020) is a Chromium CORS report where a user adds `--disable-web-security` to the Chromium launcher. It is not specifically a WebKit localhost issue.
**Current text:**
- Line 256: "[#4031](https://github.com/microsoft/playwright/issues/4031) — Access-Control-Allow-Origin differences."
- Evidence line 48: "[Issue #4031](https://github.com/microsoft/playwright/issues/4031) documents that `Access-Control-Allow-Origin` issues arise uniquely in headless mode for some browsers."
**Evidence:** https://github.com/microsoft/playwright/issues/4031 — Chromium-configured issue body. Not a WebKit localhost case. #20124 (also cited) is WebKit-CORS but has empty body.
**Status:** CONTRADICTED (weak citation; wrong browser)
**Suggested resolution:** Remove #4031 from the "WebKit headless CORS" supporting list, or requalify as "cross-browser CORS variance example (Chromium thread)." The stronger citations for the WebKit/headless argument are #32429, #12975, and #20124 — the report should foreground those.

---

## Low Severity

### [L1] Finding: Helper-suite-size thresholds are inconsistent across sections

**Category:** COHERENCE
**Source:** L1
**Location:** REPORT.md §Executive Summary (line 40), §Dimension 9 (lines 346-349, 353-357), §Key Findings (line 49)
**Issue:** Threshold ranges for "when to graduate from functional helpers to fixtures" differ:
- Line 40: "~20-30 E2E files" (functional→fixture threshold)
- Line 49: "Functional helpers win for medium suites (~10-20 files); fixtures win at 20-30+; POM class at 40+"
- Line 347: "Functional helpers for small-to-medium suites (~5-20 files); `test.extend` fixtures for mid-size (~15-40 files); POM class for large (~40+ files)"
- Line 353 table: "Functional helpers: Small-to-medium suites (~5-20 files)"; "Fixtures: Mid-size suites (~15-40 files)"
These ranges overlap and don't line up. The 5-20 / 15-40 / 40+ band is the most internally consistent; the summary's 10-20 / 20-30+ is a different framing.
**Current text:** see locations above
**Evidence:** Same artifact, cross-section comparison.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Pick one set of ranges (probably 5-20 / 15-40 / 40+) and use it consistently in summary, key findings, and Dimension 9.

---

### [L2] Finding: BlockNote retries config described as CI-conditional but is actually unconditional

**Category:** FACTUAL (minor)
**Source:** T2 (direct source read)
**Location:** evidence/oss-config-survey.md line 47
**Issue:** Evidence says "BlockNote... all use `retries: 2` on CI (via `process.env.CI ? 2 : 0`)." Actual config is `retries: 2` unconditionally — both locally and on CI get 2 retries. Minor but contributes to the overall OSS-config-survey precision problem.
**Current text:** "BlockNote, Milkdown, GitButler (both), Plasmic all use `retries: 2` on CI (via `process.env.CI ? 2 : 0`)"
**Evidence:** `~/.claude/oss-repos/blocknote/tests/playwright.config.ts:27` → `retries: 2,`
**Status:** CONTRADICTED (minor)
**Suggested resolution:** Split the enumeration: "`process.env.CI ? 2 : 0`: Milkdown, GitButler (both), Plasmic, Penpot. Unconditional `retries: 2`: BlockNote. `retries: 1` unconditional: Cline."

---

### [L3] Finding: Milkdown hook count understated (6 listed; actually ~18)

**Category:** FACTUAL (minor)
**Source:** T2 (direct source read)
**Location:** evidence/oss-config-survey.md line 64; evidence/test-hooks-patterns.md line 58
**Issue:** Evidence lists 6 Milkdown hooks ("window.__getMarkdown__, window.__setMarkdown__, window.__view__, window.__milkdown__, window.__crepe__, window.__macros__"). Actual count via `grep` on e2e/tests/ is 18 distinct `window.__*__` names. Doesn't change any conclusion ("Milkdown exposes hooks unconditionally") but the enumeration is incomplete.
**Current text:** "window.__getMarkdown__(), window.__setMarkdown__(), window.__view__, window.__milkdown__, window.__crepe__, window.__macros__ — exposed unconditionally"
**Evidence:** `grep -rn "window.__" ~/.claude/oss-repos/milkdown/e2e/tests/` shows 18 distinct names (acceptAll, acceptChunk, afterCrepeCreated, applyDiff, beforeCrepeCreate, clearDiff, CodeMirrorBlock, commandsCtx, crepe, getMarkdown, imageBlockMaxHeight, imageBlockMaxWidth, macros, milkdown, rejectAll, rejectChunk, setMarkdown, view).
**Status:** INCOMPLETE (minor)
**Suggested resolution:** Either reword to "numerous window.__* hooks (at least 18 distinct names across Milkdown's e2e suite)" or expand the enumeration. Doesn't change the finding.

---

## Confirmed Claims (summary)

These verifications landed as CONFIRMED and need no action:
- `'networkidle'` is DISCOURAGED in Playwright docs. Exact wording verified (T4).
- `trace: 'on-first-retry'` as the Playwright-docs recommendation for CI. Exact wording verified (T4).
- `import.meta.env.DEV` static replacement + tree-shaking in Vite. Verified via Vite docs (T4).
- Playwright best-practices page names trace viewer as the canonical CI debug surface. Verified (T4).
- `forbidOnly: !!process.env.CI` is universal across all 7 surveyed OSS configs. Verified (T2, all 7 configs).
- GitHub Actions `retention-days` default of 90 days. Verified (T4).
- Issue #32429: WebKit headless test failures with `networkidle` workaround discussed. Verified (T4).
- Issue #12975: WebKit forces HTTPS on localhost; closed issue. Verified (T4).
- Issue #8279: WebKit-headless-in-Docker behavior diff; closed. Verified (T4).
- Functional helpers vs fixtures vs POM taxonomy. Verified against Playwright POM + Fixtures docs and Checkly/Ozcan guides (T4).
- `eslint-plugin-playwright` existence + rule list (including `no-wait-for-timeout`, `missing-playwright-await`, `no-useless-await`, `no-page-pause`, `no-element-handle`). Verified (T4).

---

## Unverifiable Claims

- **"150MB per failing CI run is the reasonable upper bound"** (REPORT.md line 160, evidence/ci-artifact-patterns.md lines 76-77). The 150 MB number is attributed to "community guides" but the citation chain is vague. Could not verify a specific primary source with that number.
- **"For a project with an existing Biome-only stack and ~10 E2E files, the cost/benefit leans toward hand-rolled grep test"** (REPORT.md line 340, evidence/enforcement-mechanisms.md line 87). This is a subjective recommendation shaded as factual — not verifiable one way or the other, but the stance guideline says "factual, not prescriptive." Consider whether it belongs in a factual-stance research report at all.
- **"The size trigger isn't about what 'feels object-oriented'"** (evidence/helpers-organization.md line 35). Community assertion; no canonical source was surfaced.
- **Claim that `test.fixme` should not linger beyond 2 sprints** (REPORT.md line 386, evidence/skip-vs-filter-vs-fix-patterns.md line 62). Attributed to "Platform Development Playbook" — a single third-party playbook's convention, not a Playwright-official guidance. The citation is real and legitimate, but presenting it as "the community's decision" overstates the consensus.

---

## Cross-cutting observations

1. **Citation drift.** Several GitHub issues are pressed into roles they don't support (#19904, #2661, #4031 all wound up in a WebKit-CORS narrative despite actually being Chromium-centric). A pre-submit pass that reopens each cited issue and re-reads its body would catch most of these. This is the single highest-impact fix.
2. **Quote fabrication.** The `no-wait-for-timeout` rule quote appears to have been hallucinated (real doc is far shorter and says something different). Any blockquote attributed to a docs URL deserves a raw-fetch verification.
3. **Stance slippage.** The report is labeled factual, but Dimension 6 tables use normative labels ("Recommended," "Best outcome") and Dimension 8's "Implications" (line 340) makes a project-specific recommendation ("For a project with Biome... leans toward hand-rolled grep test"). The factual stance would say "the grep-test option exists and has precedent," not "for your stack, it wins." These are minor slips to watch in the downstream spec.
4. **Evidence-to-synthesis drift.** The evidence files are generally good but have their own factual errors (Penpot retries, Plasmic trace). The synthesis inherits them. A closer re-read of the evidence files against real configs would catch these.
5. **Staleness window.** The report is dated 2026-04-17. Two of the high-severity findings (H2 Biome PR merged, M3 upload-artifact v7) are staleness caused by research conducted against cached assumptions. A short "verified as of" note at the top of each dimension would help readers calibrate.
