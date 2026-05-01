# Audit Findings

**Artifact:** /Users/sarah/Desktop/inkeep/open-knowledge-1/reports/frontmatter-editing-ux-patterns/REPORT.md
**Audit date:** 2026-04-24
**Total findings:** 10 (3 high, 4 medium, 3 low)

---

## High Severity

### [H1] Finding 1: "Y.Map-based storage gives field-level merge for free" misrepresents current architecture

**Category:** COHERENCE + FACTUAL
**Source:** L1 (cross-finding contradiction), L4 (evidence-synthesis fidelity), T1 (own codebase)
**Location:** Executive Summary (key findings, bullet 3); Section 7 (Collaborative)
**Issue:** The executive summary presents Y.Map field-level merge as a current capability. The evidence file correctly notes the current architecture stores frontmatter as a single string in `Y.Map('metadata')['frontmatter']`, which gives document-level LWW, not field-level merge. The codebase confirms this: `packages/core/src/bridge/frontmatter-y.ts` stores and retrieves frontmatter as a single string value.
**Current text:** "Y.Map-based storage gives field-level merge for free -- concurrent edits to different properties merge automatically, unlike character-level CRDT merges on raw YAML text which can produce invalid syntax."
**Evidence:** Evidence file `collaborative-realtime.md` line 28: "The current string-valued storage would benefit from being decomposed to per-key Y.Map entries for field-level merge semantics." Codebase `frontmatter-y.ts`: `metaMap.get('frontmatter')` returns a single string. This is document-level LWW, not field-level merge.
**Status:** INCOHERENT
**Suggested resolution:** Reframe as aspirational architecture: "Y.Map per-key decomposition *would give* field-level merge -- the current string-valued storage is document-level LWW." Or clearly distinguish current vs. target state.

---

### [H2] Finding 2: "Both preserve raw YAML as source of truth" incorrectly includes Notion

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction), L4 (evidence-synthesis fidelity)
**Location:** Section 1 (Top-of-Document Property Table), line 77
**Issue:** The sentence groups Notion and Obsidian together as both preserving "raw YAML as source of truth with a bidirectional form projection." Notion does not use YAML. Notion uses a proprietary block/database storage model. Only Obsidian preserves raw YAML. The evidence file correctly describes these as distinct systems -- the synthesis incorrectly merges them.
**Current text:** "Both preserve raw YAML as source of truth with a bidirectional form projection."
**Evidence:** Evidence file `top-of-document-property-table.md` describes Notion as database-level properties with ~20+ field types and no mention of YAML. Obsidian is separately described as having "raw `---` fences replaced by styled key-value rows" with "Source ↔ Properties" toggle. These are fundamentally different storage models.
**Status:** CONTRADICTED
**Suggested resolution:** Split the sentence: "Obsidian preserves raw YAML as source of truth with a bidirectional form projection (form in Live Preview, YAML in Source mode). Notion uses a proprietary database model with no user-facing serialization format." Remove the "Both" grouping.

---

### [H3] Finding 3: 30-50% completion rate statistic has INFERRED confidence but is presented as established fact

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment), L7 (inline source attribution)
**Location:** Executive Summary (key findings, bullet 5); Section 4 (Settings Modal/Dialog), line 141
**Issue:** The statistic "30-50% lower completion rates" appears as a key finding in the executive summary with no hedging and no inline citation. The evidence file labels the underlying finding as INFERRED confidence (not CONFIRMED) and attributes it to "CMS metadata completeness research (WordPress SEO plugins, Contentful usage patterns)" without naming any specific study, paper, URL, or dataset. A quantitative claim used to anchor a key finding requires either a primary source citation or explicit confidence qualification.
**Current text:** "Optional metadata in separate panels has 30-50% lower completion rates than inline fields -- visibility drives metadata quality."
**Evidence:** Evidence file `inline-block-and-modal.md` Finding: "Optional metadata fields in separate panels have 30-50% lower completion rates" -- Confidence: INFERRED, Source: "CMS metadata completeness research (WordPress SEO plugins, Contentful usage patterns)." No specific study or URL cited.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) find and cite the specific study/dataset that produced this range, upgrading to CONFIRMED, or (b) hedge the prose: "CMS metadata completeness research suggests optional fields in separate panels *may* have materially lower completion rates (one practitioner estimate puts the gap at 30-50%), though no controlled study is cited." Remove from the executive summary key findings or qualify it there.

---

## Medium Severity

### [M1] Finding 4: "Colored tag pills and date ranges are Notion-exclusive" lacks survey-scope qualification

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** Executive Summary (key findings, bullet 4)
**Issue:** The claim "Notion-exclusive" is an unconditional universal negative. Tools outside the survey set (ClickUp, Airtable, Monday.com, Fibery, Coda) also support colored tag pills. Date range support exists in Airtable and ClickUp. The claim is true within the surveyed product set but reads as a universal statement.
**Current text:** "Colored tag pills and date ranges are Notion-exclusive -- every other tool renders tags as plain text chips and dates without range support."
**Evidence:** The evidence file `field-type-affordances.md` correctly scopes its findings to the products surveyed. The synthesis in the executive summary drops the scoping.
**Status:** INCOHERENT
**Suggested resolution:** Add qualifier: "Among the products surveyed, colored tag pills and date ranges are Notion-exclusive." Or expand the survey to include project-management tools that also support these features and note them as out-of-scope.

---

### [M2] Finding 5: "Type inference from existing YAML data is unique to Obsidian" lacks survey-scope qualification

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** Section 5 (Field Type Affordances), line 152
**Issue:** Same pattern as M1. The claim "unique to Obsidian" is presented without bounding. Within the surveyed CMS/editor tools this appears correct, but the absence of the qualifier "among surveyed products" makes it read as a universal claim. Some static site generators and build tools have YAML inference behavior (e.g., Hugo's front matter parsing).
**Current text:** "Type inference from existing YAML data is unique to Obsidian -- all CMS tools require explicit schema definitions."
**Evidence:** Evidence file correctly scopes: "Cross-product comparison" header. But the second clause ("all CMS tools") is actually well-bounded since it refers to CMS tools specifically.
**Status:** INCOHERENT
**Suggested resolution:** Add qualifier: "Among the products surveyed, type inference from existing YAML data is unique to Obsidian."

---

### [M3] Finding 6: Obsidian property collapse behavior described inaccurately

**Category:** FACTUAL
**Source:** T5 (external claims)
**Location:** Section 1 (Top-of-Document Property Table), lines 76-77
**Issue:** The report says "Both Notion and Obsidian hide properties behind a disclosure when there are many. 3-5 visible + 'show more' is the standard threshold." In Obsidian, the Properties section collapses as a whole (the entire properties block can be collapsed/expanded), but it does NOT implement a "show 3-5, hide the rest behind 'show more'" pattern like Notion does. Obsidian shows all properties when expanded, or none when collapsed. The "3-5 visible + show more" partial-disclosure pattern is Notion's behavior, not Obsidian's.
**Current text:** "Both implementations collapse properties behind a disclosure at scale (3-5 visible + 'show more')."
**Evidence:** Obsidian Properties UI shows a full collapse/expand toggle for the entire properties section. The "N more properties" chevron with partial visibility is a Notion pattern. The evidence file says "3-5 visible + 'show more' is the standard threshold" but this characterization conflates Notion's partial-show pattern with Obsidian's full-section collapse.
**Status:** CONTRADICTED
**Suggested resolution:** Distinguish the two collapse models: "Notion shows a configurable number of visible properties with a 'N more properties' chevron for the rest. Obsidian collapses the entire Properties section as a unit (all visible or all hidden)."

---

### [M4] Finding 7: Factual stance declared but prescriptive recommendation made

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** Research Rubric (line 61) vs. Executive Summary (line 38)
**Issue:** The rubric declares "Stance: Factual (landscape survey)." The executive summary then makes an explicit prescriptive recommendation: "The most transferable pattern for a collaborative markdown editor is the Obsidian Properties model." This is a stance shift from factual to prescriptive that is not flagged.
**Current text:** Rubric: "Stance: Factual (landscape survey)." Summary: "The most transferable pattern for a collaborative markdown editor is the Obsidian Properties model."
**Evidence:** A factual landscape survey catalogs patterns and trade-offs. Recommending a specific pattern as "most transferable" is prescriptive. Both can coexist but the shift should be acknowledged.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) change stance to "Factual with recommendation" or "Factual + prescriptive coda," or (b) reframe the summary as "For a collaborative markdown editor, the Obsidian Properties model *appears* to be the closest analog" and let the decision triggers speak for themselves.

---

## Low Severity

### [L1] Finding 8: YAML header subjects list incomplete relative to actual product coverage

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** YAML frontmatter (lines 7-15)
**Issue:** The `subjects` list in the YAML header names 9 products. The report covers 24 products across evidence files (Notion, Obsidian, Craft, Linear, Capacities, Logseq, Tana, TinaCMS, Sanity, Front Matter CMS, WordPress, Ghost, MDXEditor, Milkdown, Typora, Zettlr, GitBook, Hashnode, Dev.to, Medium, Docusaurus, Keystatic, Contentlayer, Anytype). The description says "15+ products" which is also understated. This is a metadata completeness issue.
**Current text:** `subjects: [Notion, Obsidian, TinaCMS, Sanity, MDXEditor, Front Matter CMS, WordPress Gutenberg, Ghost, Keystatic]`
**Evidence:** Count from evidence files yields 24 distinct products.
**Status:** INCOHERENT
**Suggested resolution:** Either list all primary products in `subjects` or add a note that `subjects` lists only deep-coverage products. Update description to "24 products" or "20+ products."

---

### [L2] Finding 9: Section 7 collaborative evidence file makes a claim about "Open Knowledge's current architecture" that leaks internal context into an external-facing evidence file

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** Evidence file `collaborative-realtime.md`, line 24
**Issue:** The evidence file says "Y.Map (Open Knowledge's current architecture)" -- referencing the product by name. If this report is intended as a reusable external landscape survey, the internal product reference is misplaced. If it's an internal research report, this is fine but worth noting for reuse.
**Current text:** "Y.Map (Open Knowledge's current architecture): Each frontmatter key becomes a Y.Map entry."
**Evidence:** This is a factual accuracy issue (the current architecture stores frontmatter as a single string, not per-key entries) combined with a scope-leaking issue.
**Status:** INCOHERENT
**Suggested resolution:** If the report is internal-only, keep the reference but fix the factual claim (per-key is aspirational, single-string is current). If external, remove the product name reference.

---

### [L3] Finding 10: Pattern Selection Matrix says Inline Block has "Low" writing distraction but only when collapsed

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** Pattern Selection Matrix, line 215
**Issue:** The matrix cell reads "Low (collapsed)" for Inline Block writing distraction. But Section 3 notes that MDXEditor and Typora collapse by default while Zettlr does NOT collapse. The "(collapsed)" qualifier is accurate for MDXEditor/Typora but not for the pattern in general. The conditional is embedded in a parenthetical that a reader scanning the matrix might miss.
**Current text:** `| Writing distraction | Medium | Low | Low (collapsed) | None |`
**Evidence:** Section 3: "Zettlr shows styled YAML with no collapse." The "Low" rating is conditional on collapse behavior which not all implementations provide.
**Status:** INCOHERENT
**Suggested resolution:** Change to "Low-Medium (depends on collapse)" or add a footnote.

---

## Confirmed Claims (summary)

**T1 (own codebase):** Frontmatter stored as single string in `Y.Map('metadata')['frontmatter']` -- confirmed via `packages/core/src/bridge/frontmatter-y.ts`. The evidence file's description of current architecture is accurate; the REPORT's executive summary overstates it.

**T5 (external claims, from training knowledge):**
- Obsidian v1.4 released mid-2023 with Properties feature -- CONFIRMED
- Notion has ~20+ property types, database-schema-level -- CONFIRMED
- MDXEditor built on Lexical, frontmatter as DecoratorNode -- CONFIRMED
- TinaCMS `isBody: true` field designation, `ui.component` extensibility, `wrapFieldsWithMeta` -- CONFIRMED
- Sanity "everything is a form field" with no privileged body position -- CONFIRMED
- Ghost gear-icon-triggered settings drawer -- CONFIRMED
- WordPress Gutenberg tabbed Block/Post sidebar with SlotFill plugin architecture -- CONFIRMED
- Notion standalone pages (not in database) have no property table -- CONFIRMED
- No mainstream tool back-fills existing documents on template update -- CONFIRMED
- Front Matter CMS uses `frontmatter.json` for config -- CONFIRMED
- Dev.to uses raw inline YAML frontmatter -- CONFIRMED

**L-series (coherence):** Section 2 (Sidebar/Panel Form) and Section 5 (Field Type Affordances) are internally consistent. The cross-product comparison tables in evidence files faithfully match the synthesis in the REPORT. Decision triggers in each section are well-grounded in the preceding findings.

## Unverifiable Claims

1. **"30-50% lower completion rates"** (H3 above) -- No specific study, paper, or dataset cited. The evidence file attributes this to general "CMS metadata completeness research" without a primary source. Could not verify via web search (tool unavailable). This claim is the weakest link in the report's evidence chain and anchors a key finding.

2. **Obsidian "Aliases" as a built-in property type** -- Obsidian has special handling for `aliases`, `tags`, and `cssclasses` as reserved property names. Whether these count as distinct "types" vs. special-cased property names affects the "7 types" count. Minor, but the boundary is fuzzy.

3. **Keystatic field type names** (`relationship`, `multiRelationship`, `pathReference`) -- Specific API names could not be verified without web access. The general capability is confirmed from training knowledge but exact names may have changed.
