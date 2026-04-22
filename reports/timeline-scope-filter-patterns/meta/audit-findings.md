# Audit findings — timeline-scope-filter-patterns

**Auditor:** cold-read subagent
**Date:** 2026-04-20

## Summary
- Total findings: 9
- High severity: 0 (blocking — would mislead reader)
- Medium severity: 5 (should fix if easy)
- Low severity: 4 (awareness only)

The report is factually well-grounded on the core technical claims (git mechanics, VS Code TimelineProvider signature, Google Drive Activity API consolidation, Figma date-bucket + "Show older", empirical `--follow` fatal error). All four high-stakes primary-source verifications passed. The findings below concern (a) a Notion-removal claim that the primary source does not corroborate, (b) minor cross-section drift between executive-summary wording and evidence-file hedges, and (c) small code-line / specific-word imprecisions.

## Findings

### [Medium] Finding 1: Notion "removed All/Following tabs" claim is under-evidenced
**Location:** REPORT.md Executive Summary lines 37, 108 ("Notion attempted a unified 'All / Following' updates tab and **removed it**"); Detailed Findings D2 lines 108-109; evidence/d1-d2-d4-d6-consumer-apps.md lines 60-61.
**Issue:** The report states as declarative fact that Notion removed "All" and "Following" tabs. The cited primary source for the current Inbox state (`notion.com/help/updates-and-notifications`) does NOT mention removal, and it lists "All workspace updates" as one of the four current filter modes — which directly contradicts the "removed All" framing. The only source for the "removed it" claim is the user petition on a Notion-hosted Kidonng subdomain; that URL returns essentially empty content when fetched (the petition page may be gated, JS-rendered, or deleted), so the report's key supporting evidence is unverifiable via primary source in this session.
**Evidence:** Fetched `notion.com/help/updates-and-notifications` directly: the current filter modes are "Unread and read," "Unread only," "Archived," "All workspace updates" — no mention of historical removal of "All"/"Following." The evidence file acknowledges "Kidonng petition" as a T3 source but the REPORT elevates it to declarative claim in Executive Summary.
**Recommendation:** Soften the Exec-Summary and D2 claims to hedged language: "Notion reportedly removed a unified 'All / Following' updates surface (per a user petition; not corroborated in current Notion docs)." Keep the mechanism-level caution ("unified workspace-wide views risk becoming walls-of-events") since it's still defensible as product-design intuition, but do not state removal as fact without a primary-source citation. Alternatively, re-verify the Kidonng petition URL from a different network path before re-asserting.

### [Medium] Finding 2: "10 products" count is shaky
**Location:** REPORT.md frontmatter `subjects:` (11 entries including Open Knowledge), Executive Summary line 35 ("Across 10 products surveyed"), line 41 ("across 10 products"), Research Rubric framing.
**Issue:** The frontmatter lists 11 subjects (Google Drive, Notion, Figma, Obsidian, Dropbox, GitHub, GitLab, VS Code, Linear, Jira, Open Knowledge). Counting only the external / non-1P products gives 10 if you treat "GitHub Desktop" and "Sourcetree" as bundled under "GitHub" and "desktop git clients" — but the evidence file `d1-d2-d4-developer-tools.md` clearly treats Sourcetree and GitHub Desktop as distinct products in its findings section. Google Drive and Google Docs are also treated separately in parts of the evidence. The number "10" is thus load-bearing in the Exec Summary but traceably ambiguous.
**Evidence:** evidence/d1-d2-d4-developer-tools.md has dedicated findings for GitHub (web), GitHub Desktop, Sourcetree, GitLab, VS Code, Linear, Jira — that's 7 developer tools; evidence/d1-d2-d4-d6-consumer-apps.md has Google Drive, Google Docs, Notion, Figma, Obsidian, Dropbox — 5–6 more depending on how you count. Total external products surveyed ≥ 12, not 10.
**Recommendation:** Either (a) lower the claim to "across ~10 products surveyed" with an asterisk, (b) bump to "across 11 consumer and developer products surveyed" and be explicit, or (c) enumerate the counted products. Pick one canonical count and use it consistently across Exec Summary and Rubric.

### [Medium] Finding 3: "Drive Activity API is the only documented product with first-class run-collapse" overreach
**Location:** REPORT.md Executive Summary line 42 ("Google's Drive Activity API is the only documented product with first-class run-collapse").
**Issue:** The evidence file marks this claim as "CONFIRMED at API level, INFERRED at UI level" — meaning the API supports consolidation but it is not confirmed that Google's UI actually renders it. The Exec Summary drops the "API level" qualifier, making it sound like Google's product surfaces consolidation. The primary-source fetch confirms consolidation is an API option (caller-requestable, not always-on), but says nothing about UI rendering.
**Evidence:** Primary-source verification confirmed: "you can choose to have the activity consolidated in the response" — it's a caller opt-in. evidence/d1-d2-d4-d6-consumer-apps.md line 41 explicitly tags this as INFERRED at UI level.
**Recommendation:** Tighten the Exec-Summary sentence: "Google's Drive Activity API is the only documented product that exposes first-class run-collapse as an API-level primitive (consolidated mode, caller opt-in); whether Google's UI actually renders consolidated entries is inferred, not confirmed."

### [Medium] Finding 4: `TimelinePanel.tsx` line reference off by one
**Location:** REPORT.md D6 line 223 (`TimelinePanel.tsx:427-430`).
**Issue:** The actual empty-state block starts at line 426 (`{!loading && !error && entries.length === 0 && (`) and the text "No history yet" is at line 428. The report cites `:427-430` which excludes the conditional start.
**Evidence:** Direct read of packages/app/src/components/TimelinePanel.tsx lines 425-430.
**Recommendation:** Change to `TimelinePanel.tsx:425-430` (or `:426-430` if you want to start at the conditional). Minor, but the D5 report takes pride in line-accurate code references; inconsistency weakens the pattern.

### [Medium] Finding 5: Evidence file line numbers for `shadow-repo-layout.ts` cited in REPORT are not quite right
**Location:** REPORT.md D5 line 192 ("`packages/core/src/shadow-repo-layout.ts:46-52`").
**Issue:** At lines 46-52, the file contains a JSDoc comment plus the `WRITER_ID_RE` regex declaration. The evidence file D5 cites the same `:46-52`. The ref-naming convention (`refs/wip/<project-branch>/<writer-id>`) is mentioned inside the JSDoc comment block (line 49 in my read) — but the line range is slightly off; the JSDoc comment starts earlier than line 46 and the regex declaration is at line 51. Checking more precisely: lines 46-52 cover the JSDoc + regex, so the range is close but the claim that these lines define the refs-are-writer-scoped fact is mechanically correct (the regex lists writer-id enum values) — not a factual error, just a range that could be wrong by ±2 lines.
**Evidence:** Direct read of packages/core/src/shadow-repo-layout.ts lines 40-60.
**Recommendation:** This is borderline — leave as-is if the surrounding 1-2 lines still contain the claim, or tighten to a specific line range. Low impact.

### [Low] Finding 6: Dropbox account-wide activity path described imprecisely
**Location:** REPORT.md Exec Summary line 37 ("account-wide Activity feed via the `All files` gear icon"); evidence/d1-d2-d4-d6-consumer-apps.md line 127 ("account-wide activity (gear icon next to 'All files' → feed)").
**Issue:** Dropbox's primary help doc describes the account-wide path as "Next to **All files**, click the gear icon. Click **Folder activity**" — so the feature you land in is called "Folder activity," not a separate "Activity feed." The account-wide scope is achieved by invoking the same "Folder activity" menu item from the root `All files` context. The REPORT wording "Activity feed via the gear icon" implies a third distinct feature name.
**Evidence:** Dropbox help primary source confirms: three different entry points but all land in "Folder activity" view with different scope preselected (specific file vs. folder vs. root). This is actually a nice technical detail that slightly strengthens the "one surface, three scopes via entry points" framing — so the tweak would sharpen, not soften, the Dropbox-as-closest-template claim.
**Recommendation:** Reword to match primary source: "account-wide Folder activity reached via the `All files` gear icon → Folder activity" — clarifies that Dropbox itself uses a single feature name, strengthening the "three entry points, one surface" observation.

### [Low] Finding 7: Bloom-filter "2-10× speedups" claim repeated in Exec Summary without the caveat
**Location:** REPORT.md Exec Summary line 44 ("Community-cited 2-10× speedups are qualitative rather than confirmed first-party numbers"); Critical caveats line 51 (explicit hedging); D3 line 126 (hedged).
**Issue:** The Exec Summary on line 44 flags the number as unverified, which is good practice. But the phrasing "community-cited 2-10× speedups" still anchors the reader to a specific numeric range. The evidence file D3.3 is more honest: "specific URLs returned 404 in this research session" — i.e., the numbers aren't just "qualitative," they're actively unconfirmed. Minor risk of anchoring bias.
**Evidence:** evidence/d3-git-mechanics.md line 81 ("specific speedup numbers should be re-verified before quoting"). Primary source (git-commit-graph man page) confirmed: says only "significant performance gains," no number.
**Recommendation:** Consider removing the "2-10×" number entirely from Exec Summary line 44 (keep in D3 where the caveat is more prominent), OR reword to "community sources anecdotally cite speedups in the single- to low-double-digit multiple range, but no primary-source numeric benchmark was confirmed in this session."

### [Low] Finding 8: "Figma's named versions are first-class (inline)" overstates what the doc says
**Location:** REPORT.md D2 line 106 ("named versions (Open Knowledge `checkpoint`) are first-class"); evidence/d1-d2-d4-d6-consumer-apps.md line 91 ("Named versions are inline with timestamps and contributor names").
**Issue:** The primary-source Figma help doc describes naming as a menu action ("Name This Version") reached via the right-sidebar "..." menu. It does NOT explicitly describe named versions as "inline with timestamps and contributor names" — the evidence file has interpolated this. The "first-class" framing in the REPORT is a reasonable design-read of how Figma treats named versions vs. autosaves, but it's hedged as product intuition rather than documented-behavior.
**Evidence:** Primary-source fetch: the Figma help article explains naming as a creation action but doesn't use "inline" or "first-class" language.
**Recommendation:** Leave the general Figma-as-template claim as-is (it IS the closest template based on doc'd date-bucket + Show-older behavior), but consider softening the evidence-file wording from "first-class" to "named versions are promoted above autosaves in the panel" — closer to what the doc actually says. REPORT's D2 line 106 is defensible as a design-read.

### [Low] Finding 9: Linear filter claim "AND/OR combinators available in 2026-era 'advanced filters'" uncorroborated in Exec Summary
**Location:** REPORT.md Exec Summary line 46 ("Linear's chip-bar with AND/OR boolean combinators is the richest filter UX"); D4 line 161 (Linear ~20 filters, Full boolean).
**Issue:** The evidence file d1-d2-d4-developer-tools.md line 131 says "boolean AND/OR combinators available in 2026-era 'advanced filters,'" but does not directly quote this from Linear's filter docs — it's an assertion in the evidence body. The only direct quote from Linear's docs in the evidence file is filter-removal ergonomics ("click the X on a filter to remove it"). Without a primary-source quote that Linear has boolean AND/OR, the claim is asserted rather than evidenced.
**Evidence:** evidence/d1-d2-d4-developer-tools.md lines 130-133. The filter-mechanics section describes chips and categories but does not quote text affirming AND/OR combinators.
**Recommendation:** Either (a) pull a direct quote from linear.app/docs/filters that says "AND/OR" in the evidence file, OR (b) soften to "Linear's chip bar + category composition is the richest filter UX in the surveyed set; AND/OR within-category composition is commonly reported but not quoted from primary docs in this session." Impact is low since Linear-as-north-star is framed as an upper bound rather than a target.

## Summary by section

- **Executive Summary:** Two overreaches (findings 1, 3), one number-consistency risk (finding 2), one hedge-consistency issue (finding 7). All fixable with one-line edits.
- **Detailed Findings D1-D6:** Logically coherent. Each dimension has evidence coverage. Line-reference precision could be 1-2 lines tighter in places (finding 4).
- **Synthesis:** Logically follows from findings. Three-model taxonomy + context-bound-with-explicit-overrides recommendation is well-grounded. Novel-UX-surface framing for restore semantics is defensible.
- **Limitations & Open Questions:** The report honestly flags its own gaps (GitLab Events API, Bloom-filter numbers, density perception) — appropriate hedging.

## Factual verification track — all passed

- **Google Drive Activity API consolidation:** CONFIRMED. "you can choose to have the activity consolidated in the response" — caller-opt-in mode exists. ✓
- **Figma Version History "Show older" + date-bucket:** CONFIRMED. Help doc: "Click **Show older** to explore more of a file's history" and "Figma will group autosave versions." ✓
- **VS Code TimelineProvider signature:** CONFIRMED. `provideTimeline(uri: Uri, options: TimelineOptions, token: CancellationToken): ProviderResult<Timeline>` — exactly as reported. ✓
- **`fatal: --follow requires exactly one pathspec`:** CONFIRMED empirically in this repo at git 2.39.5. ✓
- **Notion "removed All/Following tabs":** NOT CORROBORATED by primary source; petition URL returns empty. See Finding 1.

## No findings on

- Research rubric coverage (D1-D6 all addressed).
- Cross-section consistency (claims align across Exec Summary ↔ Detailed Findings ↔ Synthesis for all dimensions except the Notion claim in Finding 1).
- Internal structure / scope creep.
- Arithmetic beyond finding 2 (filter counts in D4 table trace to evidence).
