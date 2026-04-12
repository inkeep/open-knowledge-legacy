# Audit Findings: affine-strategic-deep-dive

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/affine-strategic-deep-dive/REPORT.md`
**Audited:** 2026-04-11
**Auditor:** Cold-read audit agent
**Total findings:** 11 (2 High, 4 Medium, 5 Low)

## Summary

The report's central narrative (AI-KB pivot not executing; BlockSuite not reusable; no SKILL.md analog; 6/7 co-creation primitives absent) is well-supported by verified evidence. The load-bearing quantitative claims mostly check out against primary sources. However, two factual errors bear on the BlockSuite and y-octo findings and must be corrected before delivery: (1) BlockSuite's standalone repo had **zero** commits in the last 6 months, not "~20" — the true picture is worse than stated but the specific number is wrong, (2) y-octo **is** published to crates.io (at v0.0.2), contradicting a direct claim in D6 that it is not. A third issue — the v0.25.0 date — is newly verifiable (Oct 13, 2025) and should be pinned since the report itself flagged it as uncertain. Remaining findings are localized prose/evidence alignment issues that do not alter the synthesis.

---

## Findings by Severity

### High (must-fix before delivery)

#### [H1] BlockSuite commit-count claim is contradicted by the repo

**Category:** FACTUAL
**Source:** T4 (web verification against github.com/toeverything/blocksuite)
**Location:** REPORT.md Executive Summary (line 33); D2 finding (line 110); D2 evidence file line 30; strategic assessment line 141
**Issue:** The report repeatedly claims "~20 commits in the last 6 months" for the standalone `toeverything/blocksuite` repo. The GitHub API (`commits?since=2025-10-11`) returns **0 commits in the last 6 months**. The most recent commit on `main` is `2025-07-07` — over 9 months ago. Only renovate dependency-vulnerability branches show recent pushes; main is dormant.
**Current text (line 110):** "Last 6 months of blocksuite repo activity: ~20 commits, primarily `chore: sync affine blocksuite to packages` snapshot imports + renovate bot dependency bumps."
**Evidence:** `GET /repos/toeverything/blocksuite/commits?since=2025-10-11T00:00:00Z` returns `[]` (length 0). Top commits on main are all dated June–July 2025. This makes the "downstream mirror" verdict *stronger*, not weaker — the sync PRs stopped 9 months ago.
**Status:** CONTRADICTED
**Suggested resolution:** Change to "Zero commits on `main` in the last 9 months (last sync PR: 2025-07-07, #9149); only renovate vulnerability-bump branches show activity." Update the evidence file and re-state the directional verdict, which only strengthens.

#### [H2] "No crates.io publication" for y-octo is contradicted

**Category:** FACTUAL
**Source:** T4 (verified against crates.io API)
**Location:** REPORT.md D6 finding (line 237); D6 evidence file line 73 ("No y-octo crate on crates.io")
**Issue:** The report states as a key evidence point: "no crates.io publication, no public npm package." y-octo **is** published to crates.io at version `0.0.2`, last updated `2026-01-10`. The y-octo README itself includes a `[![crates]](https://crates.io/crates/y-octo)` badge pointing to the published crate. The npm claim holds (`y-octo-node` returns 404 on the npm registry).
**Current text (line 237):** "Distribution: no crates.io publication, no public npm package, no Swift/Kotlin bindings in-repo despite Mysc using them in production."
**Evidence:** `GET https://crates.io/api/v1/crates/y-octo` returns `max_version: 0.0.2, updated_at: 2026-01-10T14:59:51Z`.
**Status:** CONTRADICTED
**Suggested resolution:** Change to "crates.io publication stalled at `0.0.2` (last update 2026-01-10), never reached 0.1.0; no public npm package for `y-octo-node` (package.json marks it `private: true`); no Swift/Kotlin bindings in-repo." The underlying claim (external-dependency viability is weak) survives — the fix actually adds nuance (someone cargo-installing can technically use it, but it's still sub-0.1.0).

---

### Medium (should-fix, surgical edits)

#### [M1] v0.25.0 release date is now verifiable; should be pinned

**Category:** FACTUAL
**Source:** T4 (GitHub releases API)
**Location:** REPORT.md Section 6 Limitations (line 307); D1 evidence file footnote (line 56)
**Issue:** The report flags v0.25.0's date as uncertain (Oct 2024 vs Oct 2025). GitHub's releases API returns `published_at: 2025-10-13T14:24:12Z`. The "October 2025" hypothesis is now confirmed. This is flagged for Path C propagation but should also be pinned in this report since it's trivially verifiable.
**Current text (line 307):** "v0.25.0 exact release date uncertain. Subagent data conflicted on whether it shipped October 2024 or October 2025..."
**Evidence:** `GET /repos/toeverything/AFFiNE/releases/tags/v0.25.0` → `published_at: 2025-10-13`.
**Status:** UNVERIFIABLE → now CONFIRMED as Oct 2025
**Suggested resolution:** Replace the Limitations bullet with a confirmed date. The adjacent timeline (v0.25.5: Nov 16, 2025; v0.25.7: Dec 9, 2025; v0.26.0: Feb 6, 2026) is internally consistent with Oct 13, 2025. Update D1 evidence footnote accordingly.

#### [M2] `@blocksuite/blocks` age is "~a year" but is actually ~16 months

**Category:** FACTUAL
**Source:** T4 (npm registry)
**Location:** REPORT.md line 33 (Exec Summary); D2 finding line 111; D2 evidence file line 54
**Issue:** The report states `@blocksuite/blocks@0.19.5` was last published "~1 year ago (April 2025)" — but the actual publish date on the npm registry is `2024-12-19`. From April 2026, that's ~16 months (~1.3 years), not ~1 year. The staleness is *worse* than stated.
**Current text (line 33):** "`@blocksuite/blocks` at 0.19.5, last publishes 9–12 months stale"
**Current text (evidence file line 54):** "`@blocksuite/blocks` | 0.19.5 | ~a year ago (April 2025)"
**Evidence:** `GET https://registry.npmjs.org/@blocksuite/blocks` → `time[0.19.5]: 2024-12-19T10:05:01.511Z`.
**Status:** STALE (rounded the wrong direction; underestimates staleness)
**Suggested resolution:** Change to "~16 months ago (Dec 2024)" and widen the Executive Summary range to "9–16 months stale."

#### [M3] Issue #6043 state labeled "open, unresolved" is stale

**Category:** FACTUAL
**Source:** T4 (GitHub issues API)
**Location:** D5 evidence file line 40: `#6043: "Broken formatting when exporting as markdown" — open, unresolved`
**Issue:** The D5 evidence file claims issue #6043 is "open, unresolved." The GitHub API reports its state as `closed`. Issue #2854 is also closed (created in 2023). Only #6291 and #2872 are actually still open per the GitHub API.
**Current text:** "#6043: 'Broken formatting when exporting as markdown' — open, unresolved"
**Evidence:** `GET /repos/toeverything/blocksuite/issues/6043` → `state: closed`. `GET .../issues/2854` → `state: closed`.
**Status:** CONTRADICTED
**Suggested resolution:** Correct issue states in the D5 evidence file. The overall finding (practical fidelity bugs exist) is still supported by #6291 (open) + #2872 (open) + the documented data-loss language, but specific issue-state labels should be accurate. Closed issues may have been fixed; check resolution commits before re-citing.

#### [M4] Arithmetic rounding: "0.6%" from 140/22,000 is 0.636%, and 22K vs 21K inconsistency

**Category:** COHERENCE (L1) + FACTUAL
**Source:** L1 cross-section check; T4 verification of obsidian-skills stars
**Location:** REPORT.md line 39, 183-188 (D4 table), 194 (point 3); D4 evidence file lines 60-62, 96-97
**Issue:** Two small inconsistencies: (a) The report uses "22K stars" for `kepano/obsidian-skills` in four places but "21K-star" when characterizing @kepano's personal brand (line 194). Both reference the same repo — actual count today is **22,662**. (b) 140/22,000 = 0.636%, not "0.6%." Rounding is fine but stating "157× larger" in the evidence (line 61) is tightly arithmetic — the true 22,662/140 = 161.9×.
**Evidence:** `GET /repos/kepano/obsidian-skills` → `stargazers_count: 22662`.
**Status:** INCOHERENT (internal) + STALE (numbers)
**Suggested resolution:** Standardize to "22,662" (or "22.6K") throughout. Update "157×" to "~162×." Accept 0.6% as a reasonable round of 0.64%.

---

### Low (note for awareness)

#### [L1] y-octo commit count is 13, not 14

**Category:** FACTUAL
**Source:** T4 (GitHub commits API since 2025-10-11)
**Location:** REPORT.md D6 finding line 236; D6 evidence file line 36
**Issue:** Report states "14 commits in last 6 months" with "DarkSky accounts for 11 of 14." GitHub API returns 13 commits since 2025-10-11, with DarkSky authoring 11. The "11 of X" proportion is close; X is 13, not 14.
**Status:** CONTRADICTED (minor)
**Suggested resolution:** Change to "13 commits; DarkSky authored 11 of 13." Directionally identical.

#### [L2] DAWNCR0W v1.13.0 publication date label

**Category:** FACTUAL
**Source:** T4
**Location:** REPORT.md line 37 Exec Summary
**Issue:** Report says "v1.13.0, April 10, 2026." GitHub release tag shows `published_at: 2026-04-10T05:11:55Z`. Verified.
**Status:** CONFIRMED
**Suggested resolution:** None — flagged only to confirm this high-visibility claim passes.

#### [L3] Ambiguous "last 6 months" framing

**Category:** COHERENCE (L3 — missing conditionality)
**Location:** Multiple locations (D2, D6, D7)
**Issue:** The report uses "last 6 months" as an unanchored window. For a report dated 2026-04-11, this means ~2025-10-11. Making this date explicit (and then citing exact commit counts via API) prevents the H1-type drift where a window accidentally includes older activity. A one-line "all windows measured as [2025-10-11, 2026-04-11]" in Section 1 or Methods would lock this.
**Status:** Structural improvement, not an error
**Suggested resolution:** Add a methods line to Section 1 or the rubric section.

#### [L4] "67,178 stars 2026-04-11" — minor drift

**Category:** FACTUAL
**Location:** REPORT.md line 337 References; D4 evidence line 55
**Issue:** Report says 67,178. GitHub API at time of audit returns 67,179. One-star drift; immaterial.
**Status:** CONFIRMED (essentially)
**Suggested resolution:** None; acceptable drift.

#### [L5] Blog paywall framed as "HTTP 402 to independent fetchers" — still accurate

**Category:** FACTUAL
**Location:** REPORT.md Section 6 Limitations line 304; D1 evidence file line 101
**Issue:** Verified during audit: `WebFetch https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter` returned HTTP 402 to the auditor too, but `curl` bypasses this (the docs are publicly fetchable via `curl` — the 402 appears to be a bot-challenge response specific to certain user agents). The adapter data-loss quote was successfully extracted via `curl` and matches **verbatim**. The blog paywall claim is directionally fine but the mitigation (use `curl` with a normal UA) is cheaper than the report implies.
**Status:** CONFIRMED with footnote
**Suggested resolution:** In a future pass, a non-WebFetch retrieval path (curl/Wayback) could close this. Low priority since the verdict does not depend on unverified blog posts.

---

## Verified / no issue (key claims that stand up)

The following load-bearing claims were independently verified and survive the audit unchanged:

- **`@blocksuite/store@0.22.4`** last publish 2025-07-01 (~9 months old) — CONFIRMED (npm registry).
- **`@blocksuite/store` 1337 total versions** — CONFIRMED exactly.
- **y-octo `0.0.2` in Cargo.toml** — CONFIRMED (raw Cargo.toml fetched).
- **"538 MB" memory claim** in `yrs-is-unsafe/README.md` — CONFIRMED verbatim (actual value `538050560` bytes → 538.05 MB).
- **Adapter data-loss quote** — CONFIRMED verbatim on `docs.affine.pro/blocksuite-wip/store/transformer-and-adapter`: "Unlike transformers, adapters may result in data loss during the conversion process, as the target format might not support all the structures present in the original data. For example, background colors cannot be represented in a plain text editor like VS Code."
- **v0.26.3 release 2026-02-25** — CONFIRMED (GitHub releases API).
- **v0.26.0 release 2026-02-06** — CONFIRMED.
- **v0.26.x changelog categorization** (infra-heavy, 0 new AI features, 1 MCP bug fix "Fix MCP token cannot display") — CONFIRMED verbatim from release notes.
- **Daily canary through `v2026.4.10-canary.928`** — CONFIRMED (exact tag exists, published 2026-04-10).
- **AFFiNE stars 67,178** — CONFIRMED (67,179 at audit time).
- **DAWNCR0W/affine-mcp-server 140 stars, v1.13.0** — CONFIRMED.
- **kepano/obsidian-skills ~22K stars** — CONFIRMED (actually 22,662).
- **No `y-octo-node` on npm** (private) — CONFIRMED (404).
- **BlockSuite repo not archived** — CONFIRMED (still public, still has renovate activity).
- **y-octo maintainers DarkSky + forehalo + Brooooooklyn listed** — CONFIRMED (README).
- **BlockSuite is Lit/Web-Components, no ProseMirror deps** — structurally CONFIRMED (from package.json sightings in evidence; architecturally consistent).

## Framing integrity

- **Stance (Factual, not recommendation-oriented):** Generally respected. Section 5 (Competitive Positioning Implications) is correctly framed as observations with a caveat ("Decisions about how open-knowledge should act on these findings flow through derivative updates..."). No sneaky 1P recommendations in the report proper.
- **Vendor-bias flags:** Present and honest in D1 ("Vendor-bias flag" section in evidence, D1 release-note reliance called out). The synthesis appropriately notes vendor-source reliance and cross-corroborates via DAWNCR0W MCP findings.
- **Confidence labels vs prose certainty:** Aligned in most places. D1 appropriately uses INFERRED for "no new model integrations in 2026" (absence-based). D3 uses NOT FOUND consistently for negative searches. D6 uses CONFIRMED for version/commit-count claims that survive verification (except L1 count drift).

## Unverifiable Claims

- **Negative searches** for `SKILL.md`, `.claude-plugin`, cursor-rules, `@blocksuite/agent-skills`: GitHub code search requires authentication and could not be independently confirmed from the audit context. The claims are plausible and consistent — no agent-skill registry entries surfaced through the npm/crates searches I ran — but a definitive authenticated code search would be needed to be fully rigorous. Flagged as UNVERIFIABLE.
- **AFFiNE funding history ($18M total, no post-Oct-2023 round)**: Cited from PitchBook/Tracxn/Crunchbase. Not re-verified in this audit pass (would require paywalled access). Triangulated across three sources per the evidence file — accept as INFERRED.
- **AFFiNE team size ~21 employees**: LinkedIn/Tracxn triangulation in evidence file. Not re-verified.
- **AFFiNE "no named enterprise customers"**: Absence-based claim; not re-verified but plausible.

---

## Structural checks

- Every rubric dimension (D1–D7) has a matching findings section: **YES**.
- Every finding links to an evidence file: **YES** (all 7 evidence files exist at claimed paths).
- Limitations & Open Questions surfaces gaps honestly: **YES**, and the specific gap flagged for v0.25.0 date is now trivially closable (see M1).
- Synthesis (Section 4) integrates dimensions coherently: **YES** — the three-constraint framing (capital / architecture / strategy) is not cherry-picked; each supporting finding maps back to a dimension.

---

## Recommended action

Apply H1 and H2 surgical corrections before delivery (both are load-bearing factual errors in the evidence claims, though neither flips the synthesis). Apply M1–M4 in the same pass since they are cheap and directly improve accuracy. L1–L5 are optional nits. After these edits, the report is delivery-ready and its findings should propagate to the landscape report per Path C without further rework.
