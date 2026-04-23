# Audit Findings

**Artifact:** `/Users/timothycardona/inkeep/open-knowledge/reports/config-driven-folder-frontmatter/REPORT.md`
**Audit date:** 2026-04-16
**Total findings:** 7 (0 high, 4 medium, 3 low)

**Intake:**
- Artifact read (342 lines)
- 4 evidence files read (d1, d2, d3, d4)
- Git state: on `main` @ `5dab868`, clean apart from the new report
- Tracks run: T1 (own codebase), T2 (Fumadocs OSS source via local `node_modules`); T3/T4/T5 deferred because the report already self-reports unverifiable VitePress/Docusaurus/Starlight paraphrases (sandbox-denied WebFetch in the subagent — noted in §D4 and Limitations)

---

## High Severity

_None._

All load-bearing factual claims verified. The report's structure supports the primary question (`/spec` author needs landscape + options). Shape definitions are internally consistent. Evidence files contain primary-source quotes (D1/D2 quote repo code; D3 quotes `node_modules/fumadocs-mdx/dist/config/index.js:11-18` — verified independently).

---

## Medium Severity

### [M] Finding 1: "Factual" stance leaks into multiple prescriptive recommendations in §D5 and §D6

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** §D5 Axis 2 (line 224), §D5 Axis 3 "Recommendation shape" (line 236), §D6 "Implications for spec scope" (lines 262–264), §D5 "Precedence discipline (from Biome)" (line 202)
**Issue:** The report's stated stance is "Factual. Synthesis sections below surface option shapes and tradeoffs; the spec picks one." (line 76). However, later synthesis sections repeatedly slip into prescriptive language that pre-empts the spec's decision authority.

**Current text (representative):**
- Line 224: "For a `/spec`: the default should be **file frontmatter overrides folder defaults** with no exceptions."
- Line 236: "**Recommendation shape** (not a decision — just a defensible default the spec can accept or challenge): **first-match wins**, because OK's existing `ContentFilter` 4-step rule evaluation is already first-match-style."
- Line 262: "MVP should target consumers (1)–(3): sidebar rendering, MCP context enrichment, hub-file identification."
- Line 264: "Consumers (5)–(9) are natural follow-ons; the spec should NOT try to ship them all at once."
- Line 202: "whichever direction the spec picks (first-match or last-match), **document it loudly in the config.yml comment AND in the schema** `.describe()`."

**Evidence:** Stance line at line 76: "Stance: Factual. Synthesis sections below surface option shapes and tradeoffs; the spec picks one." The bullet items above are not surfacing options; they recommend one.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) rewrite these to present options neutrally with tradeoffs (e.g. "first-match wins aligns with the existing `ContentFilter` precedence; last-match wins aligns with `.gitignore` muscle memory — the spec picks"), or (b) change the stated stance to "Factual with defensible defaults called out" and mark recommendations explicitly (e.g. `[DEFAULT]` or a dedicated "Defensible defaults" sub-section). Option (a) preserves the user's intent; option (b) matches the actual prose.

---

### [M] Finding 2: §D6 Consumer #4 conflates "default frontmatter at file-create time" with cascade semantics

**Category:** COHERENCE
**Source:** L1 (cross-finding), L3 (missing conditionality)
**Location:** §D6 Consumer #4 (line 251)
**Issue:** The report describes Consumer #4 as: "New files in `specs/**/` could auto-receive `type: spec, status: draft` frontmatter. **Requires cascade semantics (Axis 1 position 2).**" But the described mechanism — writing default values into a new file's frontmatter at create time — is NOT cascade. Cascade (per §D5 Axis 1 and D3 Hugo evidence) is **read-time injection of folder-declared defaults into descendant files without the values being present in the file itself**. Writing defaults at create time is a separate mechanism: the values land in the file's own frontmatter and the reader doesn't need cascade to see them.

The distinction matters for the spec: a "default frontmatter at create time" feature does NOT force the cascade decision (Axis 1 position 2). It can coexist with the "no cascade" position (Axis 1 position 1) as long as the create-handler has access to the folder rule.

**Current text:** "**`write_document` / `create-page` default-frontmatter injection.** New files in `specs/**/` could auto-receive `type: spec, status: draft` frontmatter. Requires cascade semantics (Axis 1 position 2)."

**Evidence:** §D5 Axis 1 defines cascade as "descendant-frontmatter injection" (line 218: "Implicit deep cascade. All folder metadata cascades to descendants"). D3 evidence file describes Hugo cascade as runtime inheritance (values exist in the folder file, not the descendant). A create-time injection writes into the descendant's own frontmatter — fundamentally different.

**Status:** INCOHERENT
**Suggested resolution:** Change the Consumer #4 description to distinguish the two mechanisms explicitly:

> **`write_document` / `create-page` default-frontmatter injection.** New files in `specs/**/` could auto-receive `type: spec, status: draft` written into their own frontmatter at create time. This is distinct from cascade (Axis 1): cascade injects defaults at read-time, create-time injection writes values into the file. The two can coexist or be chosen independently.

---

### [M] Finding 3: Exec Summary promises "three concrete shapes" but §D7 introduces a fourth (hybrid) shape without previewing it

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** Exec Summary (lines 46–50), §D7 (line 285)
**Issue:** The Exec Summary says: "The design space reduces to three concrete shapes, each with a clean intellectual precedent" and lists Shapes A/B/C. §D7 line 285 introduces "**Hybrid option (Shape D, emerges naturally)**: config-driven rules provide defaults for bulk cases; optional sibling `meta.json` overrides per folder." A reader skimming only the Exec Summary will miss a materially different option that the later synthesis treats as equal-weight ("90% of the ergonomic benefit of both approaches").

**Current text (Exec Summary, line 46):** "The design space reduces to three concrete shapes…"
**Current text (§D7, line 285):** "**Hybrid option (Shape D, emerges naturally):** config-driven rules provide defaults for bulk cases; optional sibling `meta.json` overrides per folder… This would mean 90% of the ergonomic benefit of both approaches, at the cost of two places users might look."

**Evidence:** Docusaurus is cited in §D7 as already doing this implicitly (`sidebars.js` + `_category_.json` coexist) — strong prior-art backing for Shape D. The Exec Summary's bullet list doesn't hint at this option.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) add Shape D to the Exec Summary bullet list with a one-line description, or (b) rewrite the §D7 hybrid as a *combination* of Shapes A and C rather than a new Shape D. Option (a) is more honest to the synthesis — it IS a distinct shape; option (b) reduces the count mismatch but loses the clarity that this is a separate choice.

---

### [M] Finding 4: Key Finding bullet includes VitePress in "shallow per-field merge with file-overrides-folder" synthesis, but VitePress has no folder-metadata to merge with

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** Key Findings bullet (line 56)
**Issue:** The bullet reads: "Shallow per-field merge with file-overrides-folder is the near-universal pattern across Fumadocs, Docusaurus, Nextra, Hugo (non-cascade), **VitePress**. Arrays always replace." But VitePress's model (per §D4 line 62 and evidence/d4-config-driven-prior-art.md §VitePress) is "None [merge]. Page frontmatter… controls the current page's rendering; the `themeConfig.sidebar` controls the *tree structure*. A page can hide itself from the sidebar (`sidebar: false`) but cannot inject new tree nodes from frontmatter. **Config tree is the only source of tree structure.**" VitePress doesn't have the kind of folder-metadata-that-merges-with-file-frontmatter the bullet describes — it has a centralized config tree and standalone per-page frontmatter, with no merge surface.

**Current text (line 56):** "Shallow per-field merge with file-overrides-folder is the near-universal pattern across Fumadocs, Docusaurus, Nextra, Hugo (non-cascade), VitePress."

**Evidence:** evidence/d4-config-driven-prior-art.md §VitePress: "Merge with page frontmatter: None. Page frontmatter … controls the current page's rendering; the `themeConfig.sidebar` controls the *tree structure*. … Config tree is the only source of tree structure."

**Status:** INCOHERENT (claim in synthesis overstates what evidence supports)
**Suggested resolution:** Remove VitePress from the bullet. Replace with: "… across Fumadocs, Docusaurus, Nextra, Hugo (non-cascade), Starlight." Starlight is a legitimate addition per §D4 line 185 ("Per-page `sidebar.label` / `sidebar.order` frontmatter overrides config"). Or keep the list to the 4 systems that clearly demonstrate file-overrides-folder merge and drop the trailing VitePress.

---

## Low Severity

### [L] Finding 5: "5 sibling-file and 8 config-driven systems surveyed" double-counts Docusaurus and Obsidian

**Category:** COHERENCE
**Source:** L7 (source attribution precision)
**Location:** Exec Summary (line 38)
**Issue:** The report surveys 5 sibling-file systems (Fumadocs, Docusaurus, Nextra, Hugo, Obsidian) in §D3 and 8 config-driven systems (VitePress, Docusaurus, Starlight, Astro, Mintlify, Turborepo, Biome, Obsidian Bases) in §D4. Docusaurus and Obsidian appear in both buckets. The phrasing "5 sibling-file and 8 config-driven systems" is defensible (there are genuinely 5 sibling-file surfaces and 8 config-driven surfaces), but a reader may parse it as "13 distinct systems," when the unique-systems count is 11.
**Current text (line 38):** "Across 5 sibling-file and 8 config-driven systems surveyed, three findings dominate:"
**Evidence:** §D3 table (line 139) lists 5; §D4 table (line 181) lists 8; Docusaurus appears in both, Obsidian appears as "Obsidian (Folder Notes)" in D3 and "Obsidian Bases" in D4.
**Status:** INCOHERENT (minor precision)
**Suggested resolution:** Rewrite as "Across 11 unique systems surveyed (5 examined as sibling-file approaches, 8 as config-driven approaches; Docusaurus and Obsidian appear in both buckets)…" Or drop the count entirely: "Across the sibling-file and config-driven landscape, three findings dominate…"

---

### [L] Finding 6: §D5 Axis 3 says "Two viable conventions" then presents a 3-row table

**Category:** COHERENCE
**Source:** L5 (internal wording consistency)
**Location:** §D5 Axis 3 (lines 228–234)
**Issue:** Line 228 says "If OK uses globs, multiple rules can match the same folder. **Two viable conventions:**" followed by a table with 3 rows: First-match wins, Last-match wins, and Most-specific wins (the third explicitly marked "Avoid without a strong reason"). The "Avoid" row is still *presented* — it's visually equal-weight with the other two even though the prose dismisses it. Either the count should be "three options (one not recommended)" or the third row should be moved to a sentence-level footnote.

**Current text (line 228):** "Two viable conventions:" followed by a 3-row table.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Change to "Two viable conventions (with a third pattern noted for completeness):" OR move the "Most-specific wins" row out of the table into a trailing sentence: "A third pattern — most-specific wins, CSS-specificity-style — appeared in no surveyed system and has specification-complexity footguns; avoid."

---

### [L] Finding 7: "Hugo is the only shipped system with true deep cascade" — add "within the surveyed set" qualifier

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** Key Findings bullet (line 57), §D3 divergence #1 (line 155)
**Issue:** The claim "Hugo is the only shipped system with true deep cascade" is accurate for the surveyed 5 sibling-file + 8 config-driven systems, but not necessarily true across every static-site generator or knowledge tool. Jekyll (`_config.yml` `defaults:` with `scope:`) and Zola (section-level cascade) are plausible counterexamples that weren't in scope. Adding "within the surveyed systems" would protect the claim without weakening it.
**Current text (line 57):** "**Hugo is the only shipped system with true deep cascade** (descendant-frontmatter injection)."
**Evidence:** §D3 surveys 5 systems; §D4 surveys 8. Jekyll, Zola, Eleventy (11ty) `data cascade` were not surveyed.
**Status:** INCOHERENT (minor precision; claim is likely still broadly true but narrower scope is safer)
**Suggested resolution:** "Hugo is the only shipped system **among those surveyed** with true deep cascade…" Or "Hugo is the most-shipped cascade model; Jekyll `defaults` + `scope` and Eleventy data cascade are adjacent patterns not surveyed here."

---

## Confirmed Claims (summary)

**T1 (own codebase) — all verified against current main @ `5dab868`:**
- `packages/cli/src/config/schema.ts` — 5 top-level Zod blocks (content, server, persistence, preview, mcp) with `.default({...})` on each ✓
- `packages/cli/src/config/loader.ts` — user→workspace deep-merge with arrays-replace ✓
- `packages/server/src/content-filter.ts` — uses `picomatch` (line 13) + `ignore` (line 12) ✓
- `packages/core/src/bridge/frontmatter-y.ts:14-19` — `getFrontmatter(doc)` reads `metadata.frontmatter` as a string ✓
- `packages/cli/src/utils/frontmatter.ts` — `parseFrontmatter<Schema>()` Zod-aware ✓
- `docs/content/meta.json` + `docs/content/guides/meta.json` + `docs/content/internals/meta.json` — each has `{ title, icon, pages }` ✓
- `packages/server/src/hub-candidates.ts` — hardcodes `['INDEX', 'README', 'REPORT', 'SPEC']` + folder-name-match fallback ✓
- `packages/cli/src/mcp/tools/read-document.ts:15` — comment references D19 deprecation of INDEX.md-frontmatter ✓
- `FileSidebar.tsx` / `FileTree.tsx` — no frontmatter/metadata reads ✓
- `docs/source.config.ts` — uses `frontmatterSchema.extend({ sidebarTitle, keywords })` ✓

**T2 (OSS, Fumadocs) — verified in local `node_modules/fumadocs-mdx/dist/config/index.js`:**
- `metaSchema` fields at lines 11-18: `title`, `pages: z.array(z.string())`, `description`, `root`, `defaultOpen`, `icon` — all `.optional()`. Exact match with §D3 table row and Exec Summary claim about docs/ meta.json field set. ✓
- `frontmatterSchema` at lines 19-26: `title` (required), `description`, `icon`, `full`, `_openapi` — matches prior `frontmatter-schema-conventions` report's Fumadocs findings ✓

---

## Unverifiable Claims

Already flagged by the report itself in §D4 Remaining Uncertainty (line 204) and Limitations (line 303):
- **VitePress** exact type-file field names (`SidebarMulti`, `SidebarItem` shape) — D4 subagent's WebFetch/curl/gh-api were denied; schemas paraphrased from doc-page excerpts
- **Docusaurus** `SidebarItemCategoryConfig` / `SidebarItemAutogeneratedConfig` exact field names — same sandbox constraint
- **Starlight** sidebar Zod schema — same constraint
- **Biome** precedence-direction documentation (first-match for `overrides`, last-match for `files.includes`) — description is consistent with Biome's published behavior, but the audit didn't independently verify the official doc URLs; if the spec cites the behavior directly, verification against https://biomejs.dev is warranted

If the spec locks in specific external field names (not just patterns), a follow-up verification pass is recommended before finalization — especially for VitePress's `SidebarItem`/`SidebarMulti` exact shape and Docusaurus's `_category_.json` field list.

---

## Resolution Log

All 7 findings resolved on 2026-04-16 via direct edits to REPORT.md:

- **[M] Finding 1 (stance slip):** Rewrote §D5 Axis 2, §D5 Axis 3 Consistency consideration, §D5 Precedence-direction observation, §D6 Scope observations, and exec-summary precedence-direction key finding to surface tradeoffs neutrally rather than recommend. Prose now presents the decision space without preempting the spec.
- **[M] Finding 2 (cascade misattribution):** §D6 Consumer #4 now distinguishes create-time injection (values written into the file's own frontmatter) from read-time cascade (§D5 Axis 1) and explicitly calls them independent mechanisms.
- **[M] Finding 3 (Shape D missing from Exec Summary):** Added Shape D as the fourth shape in the Exec Summary bullet list; updated the count from "three concrete shapes" to "four"; moved the out-of-scope Hugo `_index.md` reference to "fifth shape" for count consistency.
- **[M] Finding 4 (VitePress in file-overrides-folder list):** Replaced VitePress with Starlight in the near-universal-pattern bullet; added an explicit line noting VitePress is a deliberate exception with no merge surface.
- **[L] Finding 5 (system-count double-counting):** Rewrote the "5 sibling-file and 8 config-driven" phrasing to "11 unique systems surveyed (5 as sibling-file, 8 as config-driven; Docusaurus and Obsidian appear in both buckets)".
- **[L] Finding 6 (Axis 3 "Two viable" with 3 rows):** Changed to "Two viable conventions (with a third pattern noted for completeness)" and rewrote the third row's description to frame it as noted-for-completeness rather than advice.
- **[L] Finding 7 (Hugo cascade scope):** Added "among those surveyed" qualifier and a sentence naming Jekyll/Eleventy/Zola as adjacent non-surveyed cascade systems that would deserve their own probe before the spec locks cascade semantics.

The report's stated stance ("Factual. Synthesis sections below surface option shapes and tradeoffs; the spec picks one.") now holds uniformly across §D5 and §D6. All 1P claims remain verified.
