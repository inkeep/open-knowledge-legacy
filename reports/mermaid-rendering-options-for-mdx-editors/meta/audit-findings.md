# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/component-blocks-v2/reports/mermaid-rendering-options-for-mdx-editors/REPORT.md
**Audit date:** 2026-04-21
**Total findings:** 12 (1 high, 6 medium, 5 low)

The report is overwhelmingly well-sourced and stays within its factual-only stance. Most quantitative claims traced cleanly back to evidence files, and from evidence back to primary sources (local `node_modules/mermaid@11.14.0` for D1/D5 claims; local OSS clones for D3; GitHub for D2 + issues). Scope adherence is strong: no `we should / the best option` language leaked into report prose. The one HIGH finding is an internal inconsistency about whether beautiful-mermaid download figures were captured. The MEDIUM findings mostly concern lost precision between evidence-level qualifiers and report-level declarative prose.

---

## High Severity

### [H] Finding 1: Internal inconsistency in D2 evidence about whether beautiful-mermaid download figures were captured

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** `evidence/d2-alternative-renderers.md:66-72` vs `evidence/d2-alternative-renderers.md:134-137` vs `evidence/d2-alternative-renderers.md:297` vs `REPORT.md:53, 186, 425`
**Issue:** The D2 evidence file contains two directly contradictory statements about whether beautiful-mermaid's npm download figures were successfully retrieved. Finding D2.1.b (line 72) says: `Weekly npm downloads: npm registry WebFetch returned 403; number not captured`. Finding D2.1.i later in the same file (line 137) states: `**Monthly npm downloads: 748,069**`. The "Negative searches" footer at line 297 then says: `**npm registry data for beautiful-mermaid, mermaid-cli, mermaid.ink, kroki**: WebFetch returned HTTP 403 during this research pass on npm pages; weekly download counts not captured`. The REPORT's Limitations section at line 444 acknowledges only `mermaid` and `beautiful-mermaid` figures were captured — which contradicts the evidence's negative-searches footer.

The 748,069 monthly figure is load-bearing for the executive-summary claim `3% of mermaid's 24.7M`, repeated in three report locations (lines 53, 186, 425). The reader cannot tell from evidence whether this figure is (a) successfully retrieved from a different npm endpoint not subject to the 403, (b) cached from an earlier pass, or (c) retained despite the captured failure. The origin is not stated.

**Current text:** REPORT line 53: `748K monthly npm downloads (3% of mermaid's 24.7M).` Evidence line 72 (D2.1.b): `Weekly npm downloads: npm registry WebFetch returned 403; number not captured`. Evidence line 137 (D2.1.i): `Monthly npm downloads: 748,069 (vs mermaid's 24,722,045 — ~3% of mermaid's volume)`.
**Evidence:** Direct read of the two passages in the same evidence file and the REPORT's Limitations section.
**Status:** INCOHERENT
**Suggested resolution:** Reconcile the two passages in `d2-alternative-renderers.md`. Either (a) cite the specific endpoint / API that returned the 748,069 figure (e.g., `npm-stat.com`, `api.npmjs.org/downloads/`), or (b) flag the figure as UNVERIFIED and note its provenance. If the figure came from a different source than the blocked npm package page, record that source at the claim site so the reader can assess credibility.

---

## Medium Severity

### [M] Finding 2: Executive summary declarative claim drops "surveyed" qualifier present in evidence

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment), L3 (missing conditionality)
**Location:** `REPORT.md:83` vs `evidence/d3-sibling-editors.md:281`
**Issue:** The executive summary bullet reads: `**No editor auto-derives Mermaid theme from CSS custom properties.**` The evidence is scoped: `**No editor surveyed auto-derives Mermaid theme from CSS custom properties.**` The dropped word changes the claim from "none of the 10 editors we surveyed" to "no editor anywhere" — which overstates the evidence base. The follow-on sentence (`All surveyed implementations pass theme:...`) implicitly restores scope, but the bolded declarative statement is what the executive-summary reader retains.
**Current text:** `**No editor auto-derives Mermaid theme from CSS custom properties.** All surveyed implementations pass theme: 'default' | 'dark' | ... to mermaid.initialize()`
**Evidence:** Evidence file line 281: `**No editor surveyed auto-derives Mermaid theme from CSS custom properties.**`
**Status:** INCOHERENT
**Suggested resolution:** Insert "surveyed" into the bolded sentence: `**No surveyed editor auto-derives Mermaid theme from CSS custom properties.**` — matches the evidence and keeps the universal-sounding bolded claim honest.

---

### [M] Finding 3: "Ten sibling editors surveyed (five from local OSS, five from docs/remote)" mis-characterizes the survey composition

**Category:** COHERENCE / FACTUAL
**Source:** L4 (evidence-synthesis fidelity), L5 (summary coherence)
**Location:** `REPORT.md:58`, table at lines 228-241
**Issue:** Executive summary states: `**Ten sibling editors surveyed** (five from local OSS source reads, five from docs/remote)`. Evidence file `d3-sibling-editors.md` lists 10 numbered sections, but:
- Section 8 is titled "ProseMirror plugin patterns in the wild" (a cross-cutting observation, not a distinct editor)
- Docmost (§6b) is a sub-entry under TipTap (§6)
- VS Code has three sub-entries: 9a core (negative), 9b `mermaid-chat-features` (bundled in VS Code repo), 9c `bierner.markdown-mermaid` (community extension)
- AFFiNE appears only inside §8's cross-cutting subsection

Local OSS source reads per the evidence are actually: Outline, BlockNote, MDXEditor, Docmost, AFFiNE, VS Code extensions, TipTap (negative), Lexical (negative) — that's 6 local-clone reads (plus two negatives). Remote reads are: Notion, Obsidian, mermaid-live-editor, md2docx TipTap ext, bierner marketplace, waka/lexical-mermaid, BlockNote community plugin — 7+. The "5+5" split does not cleanly match either the section-count or the local/remote division. The table at lines 228-241 itself shows 13 rows (including the `VS Code core MD preview` negative row, `VS Code mermaid-chat-features`, and `bierner.markdown-mermaid` as three separate entries).

**Current text:** REPORT line 58: `**Ten sibling editors surveyed** (five from local OSS source reads, five from docs/remote). Among those with native Mermaid:`
**Evidence:** Section numbering in `d3-sibling-editors.md` + table rows at `d3-sibling-editors.md:255-268`.
**Status:** INCOHERENT (summary does not match the detailed composition)
**Suggested resolution:** Either (a) reframe as "Ten-plus editor surfaces surveyed — six local OSS source reads (Outline, BlockNote, MDXEditor, Docmost, AFFiNE, vscode/extensions), two OSS negative searches (TipTap core, Lexical core), and several docs/remote surfaces (Notion, Obsidian, mermaid-live-editor, bierner.markdown-mermaid, md2docx, waka/lexical-mermaid)", or (b) keep "ten" and adjust the local/remote split to match the actual distribution. The current 5+5 split is neat but doesn't describe the evidence.

---

### [M] Finding 4: Selkie diagram-type count inconsistent between evidence passages

**Category:** FACTUAL
**Source:** L4 (evidence-synthesis fidelity), T4 (web verification)
**Location:** `evidence/d2-alternative-renderers.md:165`
**Issue:** Evidence file D2.2.b says: `Claimed 22-type coverage (flowchart, sequence, class, state, ER, Gantt, pie, architecture, git graph, requirement, quadrant, mindmap, timeline, Sankey, XY chart, C4, journey, radar, block, packet, treemap, kanban)` — the list after "22" enumerates **22** items. However, the selkie README's leading claim currently reads "20 diagram types" (per WebFetch of github.com/btucker/selkie), with the same 22-item list following the claim. The evidence reports "22" in one spot while the primary source says "20". The REPORT itself does not cite a number for selkie ("experimental" at line 55), so the report prose is safe — but the evidence claim is unreliable. Audit cannot confirm whether selkie actually supports 20, 22, or some other count; both numbers exist in the primary source.
**Current text (evidence):** `Claimed 22-type coverage (flowchart, sequence, class, state, ER, Gantt, pie, architecture, git graph, requirement, quadrant, mindmap, timeline, Sankey, XY chart, C4, journey, radar, block, packet, treemap, kanban) — README self-report`
**Evidence:** WebFetch of https://github.com/btucker/selkie returned `"Selkie supports 20 diagram types" followed by the 22-item list`.
**Status:** UNVERIFIABLE / primary-source contradicts itself
**Suggested resolution:** Update evidence to note: "README header claims 20 types, but the enumerated list contains 22 entries — count is self-contradictory." This preserves transparency for downstream readers.

---

### [M] Finding 5: Report lists `#6146` as a "known open issue relevant to live-editor use" in the executive summary but labels it "race condition in dimension calculation" — the open-issue filter elides the scope

**Category:** COHERENCE / FACTUAL
**Source:** L2 (confidence-prose misalignment), L3 (missing conditionality)
**Location:** `REPORT.md:90, 152`, `evidence/d1-mermaid-package.md:230-235`
**Issue:** The executive summary at line 90 lists #6146 as directly relevant with the terse label `calculateDimensionsWithPadding race condition affecting ViewBox`. The D1 detailed finding at line 152 notes Outline explicitly works around #6146 with a hidden off-DOM container for `getBBox()`. The evidence file at line 234 quotes the issue's title: `CSS Animations edge case: Race Condition in calculateDimensionsWithPadding Affecting ViewBox Calculation`. The issue title itself scopes this to "CSS Animations edge case" — the executive summary drops that qualifier, making it sound like any `getBBox()` use triggers the race. That overstates the evidence.
**Current text (REPORT line 90):** `[#6146](https://github.com/mermaid-js/mermaid/issues/6146) — calculateDimensionsWithPadding race condition affecting ViewBox`
**Evidence:** Evidence file line 234: `"CSS Animations edge case: Race Condition in calculateDimensionsWithPadding Affecting ViewBox Calculation"`
**Status:** INCOHERENT (evidence qualifier elided in synthesis)
**Suggested resolution:** Restate the executive-summary bullet with the original qualifier: `[#6146](https://...) — calculateDimensionsWithPadding race under CSS animations (getBBox() pre-layout)`. Alternatively, note that Outline's workaround is for the `getBBox()`-before-layout class of which this issue is one manifestation.

---

### [M] Finding 6: Report states `bundlephobia gives 153 KB gzipped … matches the executive summary's ~100-150 KB gzipped` but the 5-eager-chunks measurement is not additive in the way presented

**Category:** FACTUAL
**Source:** L7 (inline source attribution), L4 (evidence fidelity)
**Location:** `REPORT.md:48, 416-420`, `evidence/d5-bundle-sizes.md:175-181`
**Issue:** Executive summary says: `the default ESM entry (mermaid.core.mjs) is 11 KB gzipped, and every diagram type lazy-loads from dist/chunks/mermaid.core/ as a separate chunk (24-45 KB gzipped each) … the cost at first insert is ~100-150 KB gzipped (matching bundlephobia's figure for the entry graph)`. The evidence file at D5.5 provides the breakdown: entry = 11 KB gzip + 5 eager chunks (`chunk-ENJZ2VHE`, `chunk-BSJP7CBP`, `chunk-5FUZZQ4R`, `chunk-ZZ45TVLE`, `chunk-X2U36JSP`) with measured largest at ~31 KB and `chunk-ICPOFSXX` at ~26 KB. Only two of the five eager chunks are measured in the evidence. Summing 11 + 31 + 26 = 68 KB gives a lower bound; to reach 100-150 KB requires roughly three more eager-chunk sizes that are not individually measured. The report treats "100-150 KB" as confidently derived from `11 KB + eager chunks`, but the evidence explicitly only measures two of the five eager chunks and asserts the total as a "conservative initial-graph estimate" that "matches bundlephobia's 153 KB number". The evidence itself notes (line 246 gap list): `Exact per-chunk gzipped measurements for all 51 mermaid.core chunks — representative figures captured; full per-chunk table not assembled`.

Net: the 100-150 KB figure is traceable to bundlephobia's API, not independently measured from the eager-chunk sum. The claim is correct, but the executive-summary framing makes it sound locally measured.
**Current text (REPORT line 48):** `the cost at first insert is ~100-150 KB gzipped (matching bundlephobia's figure for the entry graph); each additional unique diagram type adds 15-40 KB. Math labels add ~106 KB if used.`
**Evidence:** `d5-bundle-sizes.md:178-181` confirms only two of the five eager chunks have measured sizes; total is an "estimate" that reconciles with bundlephobia. Gap list at line 246 acknowledges the incomplete per-chunk table.
**Status:** STALE qualifier — claim is approximately correct but the confidence framing overstates measurement precision
**Suggested resolution:** In the executive summary, keep the 100-150 KB figure but phrase it as "approximately 100-150 KB gzipped per bundlephobia's entry-graph figure (local measurement: 11 KB entry + at least 57 KB of eager-imported chunks; full eager-chunk table not assembled)". Or push the measurement caveat into the Detailed Findings and leave the executive bullet at the bundlephobia number.

---

### [M] Finding 7: `beautiful-mermaid` v1.1.2 vs v1.1.3 provenance inconsistency carried into the report

**Category:** FACTUAL
**Source:** L1 (cross-finding contradictions)
**Location:** `REPORT.md:53, 185`, `evidence/d2-alternative-renderers.md:60, 77, 118`, `evidence/d5-bundle-sizes.md:147`
**Issue:** The evidence repeatedly references two different versions for beautiful-mermaid:
- Evidence `d2-alternative-renderers.md:60`: `Current: v1.1.3 on main branch (package.json), v1.1.2 latest tagged release (Feb 26, 2026)`
- Evidence `d5-bundle-sizes.md:147`: `/tmp/beautiful-mermaid/package/ (npm tarball v1.1.3 unpacked)`

The REPORT at line 53 says `v1.1.2 Feb 2026` in the executive summary, but the D2 detailed section at line 184 says `(v1.1.2 / 1.1.3)`. Bundle measurements were made against v1.1.3 (per d5 evidence), but the executive summary identifies v1.1.2 as the published version. If bundle sizes (68 KB gzip, etc.) are version-sensitive, the report mixes versions without flagging it to the reader. Impact low in absolute terms (two consecutive patch versions are unlikely to differ meaningfully) but the precision/provenance is weak.
**Current text (REPORT line 53):** `**beautiful-mermaid** (lukilabs / Craft Docs, v1.1.2 Feb 2026)`
**Evidence:** Evidence files show both versions referenced without explicit "measured against X, executive summary refers to Y" reconciliation.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Pick one version for all report-level claims and note where measurement/tarball vs. release tag differ. E.g., "beautiful-mermaid v1.1.2 (Feb 26, 2026 release tag; v1.1.3 on main; measurements taken against v1.1.3 npm tarball)".

---

## Low Severity

### [L] Finding 8: Theme enum "11 named themes" — 12 values in the union (including `'null'`)

**Category:** FACTUAL
**Source:** L7 (inline source attribution), T1 (own codebase)
**Location:** `REPORT.md:136`, `evidence/d1-mermaid-package.md:109-120`
**Issue:** The report says: `**11 named themes in 11.14.0** (config.type.d.ts:61)`. The actual theme enum is `'default' | 'base' | 'dark' | 'forest' | 'neutral' | 'neo' | 'neo-dark' | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color' | 'null'` — 12 string-literal values. The `'null'` value is arguably not a "named theme" (it's a sentinel for "no theme"), so "11 named" is defensible — but the evidence is silent on the reader interpreting `'null'` as a 12th option. A careful reader counts 12.
**Current text:** `**11 named themes in 11.14.0** (config.type.d.ts:61): 'default' | 'base' | 'dark' | 'forest' | 'neutral' | 'neo' | 'neo-dark' | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color' | 'null'`
**Evidence:** Direct `grep theme?` against local install — 12 values total.
**Status:** UNVERIFIABLE (interpretation call)
**Suggested resolution:** Clarify: `11 named themes + null (12 enum values total in 11.14.0)`, or keep "11" and add a parenthetical: `11 named themes (plus 'null' sentinel)`.

---

### [L] Finding 9: `react-mermaid2` download figure presented as ~10K/month but the earlier measurement was 9,923

**Category:** FACTUAL
**Source:** L1 (cross-finding contradictions)
**Location:** `REPORT.md:426`, `evidence/d4-rerender-patterns.md:68`, `evidence/d5-bundle-sizes.md:211`
**Issue:** Evidence `d4-rerender-patterns.md:68` says `react-mermaid2 (npm v0.1.4, ~10K downloads/month)`. Evidence `d5-bundle-sizes.md:211` says `react-mermaid2: ~9,923/month`. REPORT line 426 says `~9,923`. These are directionally the same and use "~" for the tilde prefix, but the evidence's inline claim at D4 contradicts its later quantitative claim at D5.5. Cosmetic-level only.
**Current text:** `react-mermaid2: ~9,923`
**Evidence:** Two inline evidence numbers disagree: "~10K" in D4 vs "9,923" in D5.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Pick one representation (either ~10K or 9,923/month) and use it consistently, or explicitly flag "≈9.9K/month (9,923 precise)".

---

### [L] Finding 10: Evidence file cites "mermaid-js Discussion #4789" but the discussion URL format is `/discussions/`, not `/issues/`

**Category:** FACTUAL / L7
**Source:** T5 (external claims)
**Location:** `REPORT.md:51, 198`, `evidence/d2-alternative-renderers.md:20, 151`
**Issue:** The report at line 51 says `Discussion #4789, maintainer: "a browser environment is required..."`. The evidence link is formatted correctly: `https://github.com/orgs/mermaid-js/discussions/4789`. The quoted maintainer statement actually appears in Issue #3650 per the evidence file D7.a line 283 (`Maintainer statement in #3650: "a browser environment is required to precompute widths/heights."`). The same quote is attributed to Discussion #4789 in the executive summary at REPORT line 51. Two different sources are cited for the same quote across report sections. The executive summary attributes the quote to Discussion #4789, but the evidence says the canonical source is Issue #3650. Discussion #4789 contains a similar but not identical statement per evidence D2.2.a: `Mermaid not only requires a DOM, but it also requires a layout engine, which currently, only browser engines support.`

The reader is given two different attributions for the "browser environment required" claim. The executive summary picks Discussion #4789; the D7 finding picks Issue #3650.
**Current text (REPORT line 51):** `mermaid is not compilable to WASM per the mermaid-js team (Discussion #4789, maintainer: "a browser environment is required to precompute widths/heights")`
**Evidence:** Evidence D7.a line 283 attributes that exact quote to Issue #3650.
**Status:** INCOHERENT — minor misattribution
**Suggested resolution:** Reattribute the "browser environment is required" quote to #3650 in the executive summary, or use the Discussion #4789 quote exactly (`only browser engines support` phrasing).

---

### [L] Finding 11: Report claims "Used by 102 repos" without flagging the evidence's noise disclaimer

**Category:** L7 (inline source attribution)
**Location:** `REPORT.md:53`, `evidence/d2-alternative-renderers.md:136`
**Issue:** The REPORT at line 53 states: `Used by 102 repos`. The evidence at line 136 qualifies: `Notable consumers surfaced: eslint-react (532 stars), opencow (375 stars). react-pdf entry is suspicious (predates beautiful-mermaid by years) — GitHub dependents-graph attribution is noisy`. The executive summary drops the noise caveat. A reader working with the figure to size "adoption" will take 102 at face value without knowing the attribution is unreliable.
**Current text:** `Used by 102 repos; 748K monthly npm downloads`
**Evidence:** Evidence file explicitly flags the dependents-graph as "noisy".
**Status:** INCOHERENT (evidence's caveat elided)
**Suggested resolution:** Add a parenthetical: `Used by 102 repos (per GitHub dependents-graph; attribution noise documented in evidence)`. Or phrase it as `dependents-graph count: 102 repos`.

---

### [L] Finding 12: "No editor surveyed uses a shared in-memory cache across React mounts" — claim is precise but appears in executive summary and cross-cutting observations without evidence cross-reference

**Category:** L7 (inline source attribution)
**Location:** `REPORT.md:77`, `evidence/d3-sibling-editors.md:290`, `evidence/d4-rerender-patterns.md:225`
**Issue:** The executive summary bullet at REPORT line 77 says: `**No editor surveyed uses a shared in-memory cache across React mounts.**`. The evidence supports this via two negative findings (d3 line 290, d4 line 225) but the report prose does not cross-reference where this negative finding was established. A reader who wants to confirm needs to cross-search both D3 and D4 evidence. Consolidating the single negative into one cite-able location in evidence would tighten attribution. This is cosmetic (the claim is traceable, just not anchored).
**Current text:** `**No editor surveyed uses a shared in-memory cache across React mounts.**`
**Evidence:** Evidence d3 line 290: `**No editor surveyed uses a shared in-memory cache across mounts.**` and d4 line 225: `**Shared in-memory SVG cache across React tree mounts (beyond the process-level module cache)** — not observed in any surveyed package`.
**Status:** INCOHERENT (evidence is present but not anchored at claim site)
**Suggested resolution:** Add an inline cross-reference after the bullet, e.g., `**No editor surveyed uses a shared in-memory cache across React mounts.** (see D3 cross-cutting observations + D4.2 negative search)`.

---

## Confirmed Claims (summary)

Spot-checked the following and they were traceable to evidence and primary sources:

- **mermaid 11.14.0 published 2026-04-01** — confirmed via web search
- **mermaid 11.14.0 has 21 dependencies in package.json** — confirmed via direct read of local `node_modules/mermaid/package.json`
- **mermaid.core.mjs entry = 11,074 bytes gzipped (11 KB)** — confirmed (evidence lists `45,712 B raw / 11,074 gzipped`)
- **mermaid.core chunks pool = 51 files, 458 KB gzipped** — confirmed (evidence line 49)
- **maxTextSize default = 50000** — confirmed via direct grep of `chunk-ICPOFSXX.mjs:4197: "maxTextSize": 5e4`
- **Theme enum values** (neo, neo-dark, redux, redux-dark, redux-color, redux-dark-color are new in 11.14.0) — confirmed via release-note web search
- **ELK moved to separate `@mermaid-js/layout-elk` in v11** — confirmed via web search of v11.0.0 release notes
- **GitHub issue numbers** #1945 (theme reinit), #3650 (SSR), #5307 (React re-render), #7094 (langium) — all confirmed existence + subject via web verification
- **Outline `MAX_STORAGE_ENTRIES = 20` sessionStorage LRU** — confirmed via direct grep of local `~/.claude/oss-repos/outline/shared/editor/extensions/Mermaid.ts:30`
- **Outline cache key `${isDark ? "dark" : "light"}-${text}`** — confirmed via direct grep line 151 of same file
- **beautiful-mermaid 8.8k stars, 289 forks, v1.1.2 Feb 26 2026 release** — confirmed via WebFetch
- **mermaid-rs-renderer 1.2k stars, 42 forks, README claims "100-1400× faster than mermaid-cli"** — confirmed via WebFetch
- **selkie 20 stars, 3 forks, Rust-with-WASM-build, not on npm** — confirmed via WebFetch
- **mermaid.ink 235 stars, v15.0.0 Dec 31 2025 release** — confirmed via WebFetch
- **Kroki does not bundle Mermaid in core image (requires `yuzutech/kroki-mermaid` companion)** — confirmed across evidence + Kroki install docs
- **`@mermaid-js/mermaid-cli` v11.12.0 Sep 25 2025, 4.4k stars, Puppeteer peer dep at `^23`** — traceable to evidence; not independently re-verified in audit
- **Scope adherence / no-recommendations stance** — grep for "we should / recommend / best option / prefer / choose / pick" against the report produced zero hits in the stance-violating sense; all matches were stance declarations in non-goals sections
- **Arithmetic check:** 748,069 / 24,722,045 = 3.03% — confirms the "~3%" claim
- **R&D rubric coverage** — D1, D2, D3, D4, D5 each have dedicated detailed section; D7 (theme + SSR + use-after-unmount) is folded across D1/D4 as declared at rubric line 104; no dimension lacks substantive evidence

---

## Unverifiable Claims

- **Weekly npm downloads for `@mermaid-js/mermaid-cli`, `mermaid.ink`, `Kroki`** — evidence and report both declare these as not captured (403 from npm). Downstream comparison claims in executive summary do not depend on these figures.
- **`@toeverything/mermaid-wasm` lineage / Mermaid version relationship** — evidence-acknowledged gap at D3 line 328.
- **Obsidian mermaid version pin** — evidence-acknowledged gap at D3 line 327.
- **Whether `@mermaid-js/parser@1.1.0` (pinned by 11.14.0) resolves #7094's langium deep-import chain** — evidence acknowledges as UNCERTAIN at D1 line 246; report faithfully preserves the uncertainty.
- **Whether #1945 reproduces at 11.14.0 specifically** — evidence acknowledges not re-tested; report preserves the caveat at line 176.
- **`beautiful-mermaid` error-handling semantics** — evidence acknowledges README-only skim, source not read in this pass; report restates at D2 detailed section.
- **Mermaid version pinned inside `mermaid.ink` and `kroki-mermaid` container images** — evidence-acknowledged gap; report preserves.
