# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-29-clipboard-component-contract-and-byte-preservation/SPEC.md`
**Audit date:** 2026-04-30
**Total findings:** 11 (3 high, 4 medium, 4 low)

---

## High Severity

### [H] Finding 1: NG numbering in §6 FR-10 + §3 NG-S enumeration + Q1 matrix is non-canonical and contradicts the canonical NG list

**Category:** FACTUAL
**Source:** Lens L4 (evidence-synthesis fidelity), L8 (terminology consistency), Track T1 (own codebase)
**Location:** SPEC §3 NG-S8 (line 57), §3 NG-S9 (line 58), §3 NG-S10 (line 59), §6 FR-10 (line 125), §10 D14 (line 222), §11 Q1 resolution (line 266), `evidence/q1-byte-preservation-matrix.md` §"NG-CARVE-OUTs"

**Issue:** The SPEC's NG numbering — used in FR-10, NG-S8/NG-S9/NG-S10, D14, and the Q1 matrix evidence file — does not match the canonical NG enumeration in CLAUDE.md "Markdown pipeline" §"Irreducible gaps" or in the canonical sources `2026-04-16-markdown-pipeline-engineering-health/evidence/ng-coverage-audit.md` and `2026-04-29-.../evidence/byte-preservation-rationale.md`.

**Current text (FR-10, line 125):** `"byte identity excluding NG1 (blank-line counts), NG3 (Word lists), NG9 (table colspan / Sheets data attrs), NG10 (math + non-callout alerts), NG11 (doc-start "---"→"***")`"

**Current text (§3 NG-S8/NG-S9/NG-S10):**
- `"NG-S8: NG3 — CKEditor-grade Word list reconstruction"`
- `"NG-S9: NG4 — binary image paste, drag-drop image binary, RTF sibling-data extraction"`
- `"NG-S10: NG9 — complex table features (colspan/rowspan/Google Sheets data attrs)"`

**Evidence (canonical NG numbering from `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/ng-coverage-audit.md` lines 12-22, identical to `evidence/byte-preservation-rationale.md`):**
- NG1: Blank-line counts ✓ (matches SPEC)
- NG2: GFM table column widths
- NG3: Math, footnotes, alerts (NOT Word lists)
- NG4: No storage-layer HTML sanitization (NOT binary image paste)
- NG5: HTML entities decoded
- NG6: Non-ambiguous backslash escapes
- NG7: MDX `---` inside JSX is thematicBreak
- NG8: Block-level GFM inside inline `<Note>` flattens
- NG9: U+E000-U+E004 PUA sentinels (NOT table colspan/Sheets)
- NG10: Doc-start `---`→`***` (NOT math/alerts)
- NG11: ensureNonEmptyDoc synthesis (NOT doc-start)

**Mismatches:**
- SPEC NG3 ↔ canonical NG ?  ("Word lists" doesn't appear in canonical NG list at all)
- SPEC NG4 ↔ canonical NG ?  ("binary image paste" doesn't appear in canonical NG list)
- SPEC NG9 ↔ canonical NG2 (table column widths)
- SPEC NG10 ↔ canonical NG3 (math/footnotes/alerts)
- SPEC NG11 ↔ canonical NG10 (doc-start)

The SPEC's canonical NG10 ("math + non-callout alerts") would actually be canonical NG3. The SPEC's canonical NG11 ("doc-start `---`→`***`") would actually be canonical NG10.

**Status:** CONTRADICTED

**Suggested resolution:** Either (a) realign the SPEC to canonical CLAUDE.md NG numbering (rewrite FR-10, NG-S8/S9/S10, D14, Q1 resolution, and the Q1 matrix's "NG-CARVE-OUTs that surface on the clipboard path" section), OR (b) explain that this SPEC introduces a new/different numbering convention (but this option creates persistent ambiguity and likely violates CLAUDE.md's canonical reference). Option (a) is strongly preferred. This affects multiple cross-references in §3, §6, §10, §11, and `evidence/q1-byte-preservation-matrix.md`. Note: the evidence file `byte-preservation-rationale.md` already uses canonical numbering, so it's the SPEC + Q1 matrix that drift.

**Implicates decision:** D7, D14 (NG carve-out enumeration). The decisions are conceptually correct (carve out structural normalizations) but the specific NG citations are wrong. This is a labeling error, not a substance error.

---

### [H] Finding 2: §11 Q27 entry is stale relative to D16 reframe

**Category:** STALE / COHERENCE
**Source:** Lens L1 (cross-finding contradictions), L5 (summary coherence)
**Location:** SPEC §11 Q27 entry (line 259)

**Issue:** Per the audit guidance, the user explicitly flagged that Q27 was reframed: "initial framing was 'build new transformer'; later reframed to 'stale build / 0 LoC code change.'" The §10 D16 entry and §6 FR-11 correctly reflect the reframe. But the §11 Q27 entry **still contains the original framing**.

**Current text (§11 Q27, line 259):**
> `"Fix locked as D16: extend tag set + add `details-transformer.ts` mirroring `callout-transformer.ts`. Implementation design pending in Track C-Design."`
> Status column: `"Decision LOCKED (D16); implementation design open"`

**Evidence — §10 D16 (line 224, post-reframe):**
> `"Q27 HtmlDetailsAccordion fix — STALE BUILD (RESOLVED 2026-04-30, 0 LoC code change)... Fix: bun run build in packages/core."`

**Evidence — §6 FR-11 (line 126, post-reframe):**
> `"Implementation: 0 LoC code change. **One-time mechanical action: run `bun run build` in `packages/core` before merge.**"`

**Evidence — `evidence/q27-root-cause-analysis.md` (post-reframe analysis):**
> `"Source `pipeline.ts` is correct. The runtime behavior on dist is exactly what the dist code says: a processor that never registered detailsAccordionPromoterPlugin... LoC: 0 (the source is already correct). The fix is a build-system action, not a code change."`

**Status:** STALE

**Suggested resolution:** Rewrite §11 Q27's resolution column to: `"RESOLVED (D16): stale-dist root cause; transformer already exists in source. Fix is one-time `bun run build` in `packages/core`. 0 LoC code change. See FR-11."` Update the Status column to `"Resolved"`.

**Implicates decision:** D16 (the decision is correctly reframed but the Q27 entry still describes the rejected original framing — a future implementer reading §11 Q27 would think there's a transformer to build).

---

### [H] Finding 3: SPEC line 264 lists Q1/Q4/Q6/Q7/Q8 as "RESOLVED (2026-04-30)" but the §11 OQ table marks them "Open"

**Category:** COHERENCE
**Source:** Lens L1 (cross-finding contradictions)
**Location:** SPEC §11 OQ table rows for Q1 (line 232), Q4 (line 235), Q6 (line 237), Q7 (line 238), Q8 (line 239); resolution summary at line 264

**Issue:** The SPEC has explicit resolution-summary text below the OQ table:
> `"**Q1 / Q4 / Q6 / Q7 / Q8 / Q14 / Q15 / Q16 RESOLVED (2026-04-30):**"`

…followed by detailed resolutions for each. But the OQ table's status column for Q1/Q4/Q6/Q7/Q8 still reads `"Open"` (or `"Open — first P0 investigation"` for Q1).

**Current text (Q1, line 232):** `"Status: Open — first P0 investigation"`
**Current text (Q4, line 235):** `"Status: Open"`
**Current text (Q6, line 237):** `"Status: Open"`
**Current text (Q7, line 238):** `"Status: Open"`
**Current text (Q8, line 239):** `"Status: Open"`

**Evidence (line 264-271, summary):**
> `"Q1 — 36-cell matrix at evidence/q1-byte-preservation-matrix.md..."`
> `"Q4 — Contract signature + per-descriptor emissions + cascade locked at evidence/q4-q6-q8-toclipboardhast-contract.md."`
> `"Q6 — Compat descriptor clipboard semantics resolved per descriptor table..."`
> `"Q7 — NO RISK..."`
> `"Q8 — Three-layer cascade locked..."`

**Status:** INCOHERENT

**Suggested resolution:** Update the Status column for Q1/Q4/Q6/Q7/Q8 to reflect the resolution (e.g., "Resolved — see summary below" or copy a one-line resolution into the column matching how Q11/Q12/Q13/Q14/Q15/Q16 are resolved in-row).

**Implicates decision:** None directly — the resolutions are all consistent with downstream decisions; the staleness is purely in the table.

---

## Medium Severity

### [M] Finding 4: §6 has two "### Non-functional requirements" subsections with conflicting LoC estimates

**Category:** COHERENCE / COMPLETENESS
**Source:** Lens L1 (cross-finding contradictions)
**Location:** SPEC §6 lines 129-135 (first NFR section) and lines 137-143 (second NFR section)

**Issue:** The SPEC has TWO `### Non-functional requirements` subsections within §6, with overlapping but not identical content. Most importantly, they give conflicting LoC estimates.

**First NFR section (line 135):**
> `"Cost: Implementation surface ~250-300 LoC across 7 files."`

**Second NFR section (line 143):**
> `"Cost: Implementation surface ~50-150 LoC."`

The 250-300 LoC figure aligns with the FR breakdown (FR-7 alone is ~120 LoC; FR-3+FR-4 = ~28 LoC; FR-1+FR-2 = ~6 LoC; FR-5+FR-6+FR-9 ≈ 45 LoC). The 50-150 LoC figure is significantly lower and contradicts the totals.

**Status:** INCOHERENT

**Suggested resolution:** Delete the duplicate second `### Non-functional requirements` section (lines 137-143). The first version is more accurate based on the FR breakdown. If something specific to merge from the second version, fold it in.

**Implicates decision:** None — implementation effort estimate is informational, not a decision input.

---

### [M] Finding 5: §11 Q25 appears twice in the OQ table with conflicting statuses

**Category:** COHERENCE / COMPLETENESS
**Source:** Lens L1, L8 (terminology — duplicate entries)
**Location:** SPEC §11 lines 251 and 257

**Issue:** Q25 appears twice with identical question text (`"A11y verification..."`) but different status:
- Line 251: Resolved (`"**RESOLVED — folded into FR-7 acceptance criteria.** A11y verification on FR-7 hast outputs..."`)
- Line 257: Open

**Current text (line 251):** `"| Q25 | A11y verification... | T | P0 | Yes | Iterate Track C — fold into Q11 test strategy. | **RESOLVED — folded into FR-7 acceptance criteria...** |"`
**Current text (line 257):** `"| Q25 | A11y verification... | T | P0 | Yes | Iterate Track C — fold into Q11 test strategy. | Open |"`

**Status:** INCOHERENT

**Suggested resolution:** Delete the duplicate Q25 row at line 257 (keep the resolved version at line 251). The duplicate appears to be an editing leftover.

**Implicates decision:** None — duplicate is purely organizational.

---

### [M] Finding 6: SPEC §1 evidence-file count mismatch ("7 granular files" but 9 substantive files exist)

**Category:** FACTUAL / COMPLETENESS
**Source:** Lens L4 (evidence-synthesis fidelity), Track T1 (own codebase)
**Location:** SPEC §1 line 15

**Issue:** The Links section claims `"Evidence: ./evidence/ — 7 granular files (worldmodel, user-outcomes, precedent analysis, structural-payload mechanism, byte-preservation rationale, Branch C disk-outcome trace, peer heuristic survey)"` — but the evidence directory contains 9 substantive evidence files plus 2 meta files (`_init_worldmodel.md`, `_user_outcomes.md`).

**Evidence:** `ls evidence/` shows:
- `_init_worldmodel.md` (meta)
- `_user_outcomes.md` (meta)
- `branch-c-disk-outcome-trace.md`
- `byte-preservation-rationale.md`
- `precedent-and-d14-analysis.md`
- `q1-byte-preservation-matrix.md`
- `q27-htmldetails-accordion-implementation.md`
- `q27-root-cause-analysis.md`
- `q4-q6-q8-toclipboardhast-contract.md`
- `q9-q10-q28-track-c-verify.md`
- `structural-payload-mechanism.md`

Of these, 9 are substantive evidence files. The SPEC enumeration in line 15 lists 7 evidence types and omits `q1-byte-preservation-matrix.md`, `q4-q6-q8-toclipboardhast-contract.md`, `q9-q10-q28-track-c-verify.md`, `q27-htmldetails-accordion-implementation.md`, and `q27-root-cause-analysis.md` — i.e., five of the most load-bearing iterate-phase artifacts.

**Status:** STALE / INCOHERENT

**Suggested resolution:** Update the Links list in §1 to match the actual evidence directory, e.g.: `"Evidence: ./evidence/ — 11 files: 2 meta (worldmodel, user-outcomes); precedent analysis, structural-payload mechanism, byte-preservation rationale, Branch C disk-outcome trace, Q1 byte-preservation matrix, Q4/Q6/Q8 toClipboardHast contract, Q9/Q10/Q28 Track-C verification, Q27 implementation design (superseded), Q27 root-cause analysis."`. The current `"7 granular files"` undersells the spec's evidence base.

**Implicates decision:** None — informational, but undermines the spec's appearance of completeness.

---

### [M] Finding 7: FR-1 acceptance criterion claim ("OK→OK paste of `<img>` JSX preserves descriptor identity") relies implicitly on FR-3 (D8 heuristic extension), but FR-1 is presented as standalone

**Category:** COHERENCE
**Source:** Lens L1 (cross-finding contradictions), Track T1 (codebase)
**Location:** SPEC §6 FR-1 (line 116)

**Issue:** FR-1's acceptance criterion says `"OK→OK paste of <img> JSX preserves descriptor identity"`. Mechanically, for the FR-13-first reorder to recover descriptor identity, `isMarkdown(text/plain)` must return `true` on the source's text/plain output (which for a single `<img src="x.png" />` JSX paste is `<img src="x.png" />`).

Verifying against the actual `is-markdown.ts` heuristic (verified at `packages/app/src/editor/clipboard/is-markdown.ts:31-45`):
- For `"<img src=\"x.png\" />"` (single line, lineCount = 1)
- threshold = `Math.min(3, Math.floor(1/5)) = 0`
- floor = `Math.max(1, 0) = 1`
- Existing signals: FENCE (no), HEADING (no), BULLET (no), NUMBERED (no), INLINE_LINK (no), TABLE (no), MATH (no) → 0 signals
- 0 ≥ 1 is false → `isMarkdown` returns false → FR-13 does NOT fire → falls to Branch C → Image extension wins → BUG

So FR-1's acceptance criterion as written is only satisfied when **D8 (FR-3) lowercase JSX-with-attr signal extension** is also in effect. The Q1 evidence file confirms this in J1.C.1: `"post-D8 BYTE-PRESERVING; post-D5-only single-line `<img />` fails FR-13 → Branch C → BUG (Image extension wins)"`.

The FR-1 entry in §6 doesn't explicitly tie its acceptance to FR-3, and the Q1 matrix sometimes uses "post-D5" loosely to mean "post-D5+D8" (e.g., J1.A.1 vs J1.C.1). A reader implementing FR-1 alone would believe the `<img>` regression is fixed when it's not.

**Status:** INCOHERENT

**Suggested resolution:** Either (a) reword FR-1 acceptance to explicitly require FR-3 (e.g., `"With FR-3 also applied, OK→OK paste..."` or add a Notes column entry `"Depends on FR-3 lowercase JSX-with-attr signal for single-line <img> bytes"`), OR (b) add an explicit cross-reference somewhere in the FR table that FR-1 + FR-3 + FR-4 ship as an indivisible bundle.

**Implicates decision:** D5 (the dispatcher-reorder decision is correct in concept; the dependency on D8 should be made explicit in acceptance criteria).

---

## Low Severity

### [L] Finding 8: FR-3 in this spec collides with FR-3 in the predecessor 2026-04-16 spec (terminology overload)

**Category:** COHERENCE / TERMINOLOGY
**Source:** Lens L8 (terminology consistency)
**Location:** SPEC §6 FR-3 (line 118), §10 D9 (line 217), §11 Q19 (line 250), §6 FR-12 (line 127)

**Issue:** This SPEC defines FR-3 as `"is-markdown.ts heuristic extension per D8"`. The predecessor `2026-04-16-clipboard-mdast-canonical/SPEC.md` defines FR-3 as `"WYSIWYG paste routes via 5-branch dispatcher..."`. The same identifier "FR-3" refers to entirely different requirements in the two specs.

The SPEC references both: e.g., `D9` says `"Same pattern for FR-3 dispatcher (call out FR-13-first reorder cascading)"` — referring to the predecessor's FR-3 (dispatcher), while this spec's FR-3 is the heuristic extension. A reader unfamiliar with the cross-spec citation conventions could conflate them.

**Status:** INCOHERENT (terminology)

**Suggested resolution:** When referencing the predecessor spec's FRs, use a qualifier (e.g., `"predecessor 2026-04-16 SPEC FR-3"` or `"2026-04-16 FR-3"`). FR-12 and D9 both reference predecessor FRs without qualification.

**Implicates decision:** None — cosmetic.

---

### [L] Finding 9: FR-11 lists three "additional" transformers restored by rebuild but evidence says four were missing

**Category:** COHERENCE
**Source:** Lens L4 (evidence-synthesis fidelity)
**Location:** SPEC §6 FR-11 (line 126); evidence `q27-root-cause-analysis.md` lines 89-95

**Issue:** FR-11 says: `"The same rebuild also restores remarkGithubAlerts, calloutTransformerPlugin, imagePromoterPlugin to production parse path"` — three plugins listed. But the evidence file `q27-root-cause-analysis.md` line 89-95 says the dist literal was missing **four** registrations:
- remarkGithubAlerts
- calloutTransformerPlugin
- detailsAccordionPromoterPlugin
- imagePromoterPlugin

The fourth (`detailsAccordionPromoterPlugin`) is the primary subject of FR-11 itself, so the wording "also restores" implicitly excludes it (the FR-11 verifies HtmlDetailsAccordion specifically). But a careful reader could miss that.

**Status:** INCOHERENT (minor)

**Suggested resolution:** Reword to: `"The same rebuild restores all four post-Apr-27 transformer registrations (`detailsAccordionPromoterPlugin` for this FR; `remarkGithubAlerts`, `calloutTransformerPlugin`, `imagePromoterPlugin` for sibling fidelity invariants — verify each via existing fidelity invariants)."`

**Implicates decision:** None — labeling clarity.

---

### [L] Finding 10: SPEC §1 line 26 simplifies Image extension parseDOM to `tag: 'img[src]'` but actual rule is `'img[src]:not([src^="data:"])'`

**Category:** FACTUAL (minor imprecision)
**Source:** Track T1 (own codebase), Track T3 (3P dependency)
**Location:** SPEC §1 line 26

**Issue:** SPEC §1 says: `"PR #310's lowercase pivot makes TipTap's built-in Image extension parseDOM rule (tag: 'img[src]', priority 50) win..."`. The actual TipTap rule (verified at `node_modules/@tiptap/extension-image/dist/index.js:43`) with default `allowBase64=false` is `'img[src]:not([src^="data:"])'`.

The SPEC §8 line 161 gets it right: `"TipTap built-in Image.configure({inline: true}) matches img[src]:not([src^="data:"]) at priority 50"`. Only §1 simplifies. This is a minor imprecision — not technically wrong (an `img[src]` selector is a superset including `:not(data:)`), and the precise rule is correct elsewhere — but the inconsistency could mislead readers comparing §1 and §8.

**Status:** INCOHERENT (minor — version of the same fact)

**Suggested resolution:** Update §1 line 26 to use the precise rule: `"tag: 'img[src]:not([src^=\"data:\"])'"` matching §8's wording.

**Implicates decision:** None — substance is the same.

---

### [L] Finding 11: D5 mentions "pre-D5" claim about Linear's text/plain encoding being verified, but Q7 entry doesn't fully cite primary sources

**Category:** COMPLETENESS
**Source:** Lens L7 (inline source attribution)
**Location:** SPEC §10 D5 (line 213); §11 Q7 (line 238); Q1 matrix evidence

**Issue:** D5's rationale says `"verified 2026-04-30 against primary source"` for Linear/Outline/BlockNote text/plain emission. The Q1 matrix at J3.4 says `"text/plain = markdown (per 2026-04-30 verification — closed-source default `Cmd+C` UNCERTAIN; explicit `Cmd+Opt+C` confirmed markdown)"`. The "UNCERTAIN" qualifier on Linear's default Cmd+C is potentially load-bearing — if a Linear user's default copy doesn't emit markdown to text/plain, FR-13-first could miss for that case.

The Q7 OQ entry doesn't surface this UNCERTAIN nuance — it just says `"Linear / Outline / BlockNote all emit canonical markdown to text/plain (verified)"`. A reader of §11 Q7 wouldn't know that Linear's default behavior is unverified.

**Status:** UNVERIFIABLE / minor stale

**Suggested resolution:** Either (a) verify Linear's default Cmd+C empirically (Playwright test, screenshot of clipboard contents) and remove the UNCERTAIN qualifier, OR (b) propagate the UNCERTAIN qualifier to D5 / Q7 so readers know what was actually confirmed. The Q1 matrix already has the right qualifier; the SPEC text should match.

**Implicates decision:** D5 (potentially — if Linear's default Cmd+C doesn't emit markdown, FR-13 will miss for non-power-users).

---

## Confirmed Claims (summary)

**Code-grounded claims that checked out:**
- `handle-paste.ts:50-147` is the WYSIWYG dispatcher body (verified)
- `source-clipboard.ts:119-187` is the Source dispatcher body (verified)
- `is-markdown.ts:17-45` heuristic structure: signal-count, threshold `min(3, floor(lineCount/5))` with `Math.max(1, threshold)` floor (verified)
- Current dispatcher order is `A / B / C / FR-13 / D / E` (verified — FR-13 is at line 108, AFTER Branch C at line 96)
- `mdast-to-hast-handlers.ts:72-104` contains `HTML_PRIMITIVE_TAGS` + `tryNativeHtmlPrimitive` (verified)
- `autolink-void-html-guard.ts:95` defines `LOWERCASE_JSX_CANONICAL_TAGS = {img, video, audio}` (verified)
- TipTap Image extension priority 50 (default), parseDOM rule `img[src]:not([src^="data:"])` (verified at node_modules)
- CodeBlockFidelity priority 60, `tag: 'pre'` (verified at `packages/core/src/extensions/code-block-fidelity.ts:15`)
- JsxComponent parseHTML matches only `div[data-jsx-component]` (verified at `packages/core/src/extensions/jsx-component.ts:55`)
- `packages/core/src/markdown/pipeline.ts:170` registers `detailsAccordionPromoterPlugin` (verified — D16 reframe is grounded)
- `packages/core/src/markdown/details-accordion-promoter.ts` exists (verified — Q27 root cause traces back to dist staleness, not missing code)
- Predecessor 2026-04-16 SPEC FR-3, FR-5, FR-13, FR-14 references match (verified)

**External claims that checked out:**
- GitHub markdown alerts use `<div class="markdown-alert markdown-alert-{type}"><p class="markdown-alert-title">{label}</p>` taxonomy (verified via WebSearch — github.blog 2023-12-14 announcement + antfu/markdown-it-github-alerts)
- W3C Clipboard API mandatory MIME types are text/plain, text/html, image/png — text/markdown not in WebKit allowlist (verified via WebSearch — webkit.org/blog Async Clipboard API)

**Decision-implicating findings:** None of the findings undermine a LOCKED decision's substance:
- D1, D2, D3, D5, D6, D7, D8, D10, D11, D12, D13, D15, D16, D17, D18 — all still hold under audit.
- The NG numbering error (Finding 1) is labeling-only; the spirit of D7/D14 (carve out structural normalizations) is sound.
- Q27 reframe to D16 (Finding 2) is correctly captured in §6 FR-11 + §10 D16; only the OQ-table entry is stale.
- D5/D13 dispatcher reorder claim has a hidden FR-3 dependency (Finding 7) but the conceptual claim is sound; this is a labeling/acceptance-criterion clarification.

---

## Unverifiable Claims

- **`<u>foo</u>` cross-view paste — D18/Q28 fix.** The evidence `q9-q10-q28-track-c-verify.md` is described as a "mental runtime trace, not executed" — runtime verification is pending. The FR-4 acceptance criterion `"Source-view round-trip of Some <u>foo</u> text content preserves <u> bytes byte-for-byte through OK→OK paste in both views"` is a testable claim but not yet tested in this spec; would require Playwright fixture coverage to confirm.
- **Q9 drag-and-drop scenarios under FR-13-first reorder.** The evidence claims drag-out, drag-in, and internal-drag are all preserved through analysis of `prosemirror-view/src/input.ts`. Existing E2E coverage at `paste-fidelity.e2e.ts:507-540` and `:791-834` is cited but new E2E coverage for the reorder is not yet written. Would require fixture E2E to confirm.
- **Linear default Cmd+C emits markdown to text/plain.** Marked UNCERTAIN in Q1 matrix but stated as verified in D5 — see Finding 11.
