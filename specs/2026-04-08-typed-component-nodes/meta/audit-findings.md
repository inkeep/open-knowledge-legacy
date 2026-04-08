# Audit Findings

**Artifact:** specs/2026-04-08-typed-component-nodes/SPEC.md
**Audit date:** 2026-04-08
**Total findings:** 10 (3 high, 4 medium, 3 low)

---

## High Severity

### [H1] D1 and D13 contradict each other on backward compatibility

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Decision Log (D1, D13)
**Issue:** D1 describes supporting the old fenced format via a dual-handler migration pattern. D13 explicitly cancels that — "No fenced-format backward compatibility handler." Both decisions exist in the same Decision Log table and give the implementer contradictory instructions.
**Current text (D1):** "Old fenced format supported for migration via dual-handler pattern."
**Current text (D13):** "Raw JSX only. No fenced-format backward compatibility handler. Simplifies Phase 0 implementation."
**Evidence:** D13 was revised after D1 was written. D1's description was not updated to reflect the revision. The spec body (Section 3.5, Scope Boundaries) consistently describes raw JSX only — D13 is authoritative.
**Status:** INCOHERENT
**Suggested resolution:** Update D1's Resolution text to remove the dual-handler/migration language. Replace with something like: "REVISED: Raw JSX on disk (valid MDX, fumadocs-compatible). Custom `markdownTokenizer` on the extension intercepts uppercase JSX tags before marked's HTML tokenizer. Greenfield — no fenced-format backward compatibility (see D13)."

---

### [H2] Tertiary success criterion describes the wrong serialization format

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions) + L5 (Summary coherence)
**Location:** Section 2, "Tertiary: Observer sync is transparent"
**Issue:** The success criterion states the serialization format is "fenced code blocks with `jsx-component` info string" and is "unchanged." This directly contradicts D1 (revised), which changed the on-disk format to raw JSX. An implementer using this criterion as a verification target would be testing the wrong format.
**Current text:** "The serialization format (fenced code blocks with `jsx-component` info string) is unchanged"
**Evidence:** D1 revised, Section 3.5, evidence/fumadocs-serialization-compatibility.md, evidence/raw-jsx-tokenizer-proof.md — all confirm raw JSX is the canonical format. The fenced format was explicitly abandoned for fumadocs compatibility.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite the Tertiary criterion to: "The serialization format (raw JSX on disk) works transparently with observer sync. Observer A serializes typed components to raw JSX in Y.Text. Observer B parses raw JSX via the custom markdownTokenizer and creates typed component nodes. Source mode, disk bridge, and agent writes continue to work."

---

### [H3] Evidence file children-parsing-strategy.md has stale code examples

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** evidence/children-parsing-strategy.md (code blocks in "The Solution" and "For renderMarkdown" sections)
**Issue:** The evidence file's code examples show: (1) `token.lang !== 'jsx-component'` — referencing the old fenced code block format; (2) `renderMarkdown` wrapping output in fenced code blocks with `fenceFor()`. Both predate the D1/D11/D13 revision to raw JSX + `jsxBlock` token type + custom tokenizer. An implementer referencing this evidence file would build the wrong parsing path.
**Current text (parseMarkdown):** `if (token.lang !== 'jsx-component') return [];`
**Current text (renderMarkdown):** `const fence = fenceFor(jsxString); return \`\${fence}jsx-component\n\${jsxString}\n\${fence}\`;`
**Evidence:** D11 specifies `jsxBlock` token type via custom `markdownTokenizer`. D13 eliminates fenced format. The parseMarkdown hook receives `jsxBlock` tokens (not `code` tokens with `lang: 'jsx-component'`). The renderMarkdown should output raw JSX (no fence). The "Why This Works" analysis in the same file is correct — only the code snippets are stale.
**Status:** STALE
**Suggested resolution:** Update the code examples to match D11/D13: (1) parseMarkdown should check token type `jsxBlock`, not `token.lang`. (2) renderMarkdown should output raw JSX string without fencing. The prose analysis is still valid — only the code blocks need updating.

---

## Medium Severity

### [M1] OQ6 resolution text describes a pre-revision version of D13

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 12, Open Questions table, OQ6
**Issue:** OQ6's resolution says "D13 dual-format migration. Old fenced content parses via fenced handler, saves as raw JSX." This describes D13 before it was revised to "Raw JSX only." OQ6 gives the implementer the impression that a fenced format handler exists.
**Current text:** "**Resolved** -> D13 dual-format migration. Old fenced content parses via fenced handler, saves as raw JSX. Greenfield spike -- no Y.Doc migration concern."
**Evidence:** D13 (revised): "Greenfield spike -- no legacy content to migrate. Single extension with `markdownTokenName: 'jsxBlock'` + custom tokenizer. No fenced-format backward compatibility handler."
**Status:** INCOHERENT
**Suggested resolution:** Update OQ6 resolution to: "**Resolved** -> D13 (revised): Greenfield spike -- no legacy content to migrate. Raw JSX only. Single extension with `markdownTokenName: 'jsxBlock'` + custom tokenizer."

---

### [M2] OQ11 references @babel/parser — spec chose acorn (D7)

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 12, Open Questions table, OQ11
**Issue:** OQ11's answer says "@babel/parser handles these natively" for whitespace fragments. But D7 selected acorn+acorn-jsx, not @babel/parser. The OQ11 answer was written before D7 was resolved and never updated. An implementer reading OQ11 would expect @babel/parser to be available.
**Current text:** "@babel/parser handles these natively"
**Evidence:** D7: "acorn + acorn-jsx (~23KB gzipped). 6x smaller than @babel/parser with identical JSX parsing correctness."
**Status:** INCOHERENT
**Suggested resolution:** Update OQ11 to reference acorn+acorn-jsx: "acorn+acorn-jsx handles these natively — `{" "}` parses as a JSXExpressionContainer with a StringLiteral value." Or if acorn's behavior hasn't been verified for this pattern, mark as needing verification.

---

### [M3] Phase 0 step 10 references nonexistent backward-compat handler

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 4, Phase 0, step 10
**Issue:** Phase 0 step 10 says "All existing tests pass (old fenced content opens via backward-compat handler)." But D13 (revised) explicitly eliminates the backward-compat handler. This is a leftover from the pre-revision implementation plan.
**Current text:** "**Verify:** All existing tests pass (old fenced content opens via backward-compat handler). `bun run check` green."
**Evidence:** D13: "No fenced-format backward compatibility handler. Simplifies Phase 0 implementation." Scope section: "Fenced-format backward compatibility -- greenfield spike, no legacy content. Raw JSX only."
**Status:** INCOHERENT
**Suggested resolution:** Remove the backward-compat handler reference. Replace with: "**Verify:** All existing tests pass. `bun run check` green."

---

### [M4] ASK_FIRST agent constraints reference already-resolved decisions

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** Section 13, Agent Constraints, ASK_FIRST
**Issue:** Two ASK_FIRST items direct the implementer to pause and ask about decisions that are already resolved in the Decision Log:
- "Before choosing a JSX parser (OQ7)" — resolved as D7 (acorn+acorn-jsx)
- "Before deciding on prop panel UX (OQ9)" — resolved as D14 (popover)
An AI agent following these constraints would waste a round-trip asking about already-decided items.
**Current text:** "Before choosing a JSX parser (OQ7) -- evaluate bundle size and parsing correctness" and "Before deciding on prop panel UX (OQ9) -- may want user input on interaction pattern"
**Evidence:** D7 and D14 in the Decision Log, both at High confidence.
**Status:** STALE
**Suggested resolution:** Remove the two resolved items from ASK_FIRST. Replace with constraints about genuinely open decisions or areas where the implementer should check before proceeding (e.g., "If react-docgen-typescript fails to extract props from a component pattern not covered in evidence/react-docgen-typescript-behavior.md").

---

## Low Severity

### [L1] AW01 test scenario uses old format terminology

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 7, Agent Write Path tests, AW01
**Issue:** AW01 description says "Agent writes markdown with jsx-component block" — this references the old fenced code block format. Should say "raw JSX component."
**Current text:** "Agent writes markdown with jsx-component block"
**Evidence:** D1 revised, D13 — on-disk format is raw JSX.
**Status:** INCOHERENT
**Suggested resolution:** Update to: "Agent writes markdown with raw JSX component (e.g., `<Callout type="warning">...</Callout>`)"

---

### [L2] OQ14 references old code fence format

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 12, Open Questions table, OQ14
**Issue:** OQ14's resolution text says "Both jsxComponentEditable and jsxComponentVoid parse the same `jsx-component` code fence." They now parse `jsxBlock` tokens from the custom tokenizer, not `jsx-component` code fences.
**Current text:** "parse the same `jsx-component` code fence"
**Evidence:** D11: `jsxBlock` token type via custom `markdownTokenizer`.
**Status:** INCOHERENT
**Suggested resolution:** Update to: "Both jsxComponentEditable and jsxComponentVoid handle the same `jsxBlock` token from the custom markdownTokenizer."

---

### [L3] A5 confidence label is stale — issue is resolved by D10

**Category:** COHERENCE
**Source:** L2 (Confidence-prose misalignment)
**Location:** Section 10, Assumptions table, A5
**Issue:** A5 is marked "PARTIALLY CONFIRMED" with "Partially validated -- design implications." But D10 and evidence/children-parsing-strategy.md fully resolve the design implications with `marked.lexer()` + `helpers.parseBlockChildren()`. The assumption should be CONFIRMED with a note about the workaround.
**Current text:** "**PARTIALLY CONFIRMED** -- ... **Option C is likely the pragmatic path**"
**Evidence:** D10 resolution uses Option B (direct marked.lexer), not Option C. evidence/children-parsing-strategy.md confirms this works. The assumption text references Option C from the markdown-manager-fragment-serialization evidence, which was superseded.
**Status:** INCOHERENT
**Suggested resolution:** Update A5 to CONFIRMED: "Confirmed via D10. `h.renderChildren()` works for serialization. Parsing uses `marked.lexer()` + `helpers.parseBlockChildren()` (not MarkdownManager.parse()). See evidence/children-parsing-strategy.md."

---

## Confirmed Claims (summary)

**T1 (Own codebase):**
- Layer 1 architecture (atom: true, single content attribute, regex parser in JsxComponentView.tsx): CONFIRMED from init_spike/src/editor/extensions/jsx-component.ts and JsxComponentView.tsx
- Tokenizer prototype (24 tests): CONFIRMED — init_spike/src/editor/extensions/jsx-tokenizer-prototype.test.ts exists with the markdownTokenizer API pattern
- Baseline commit 5597eb7 exists and matches PR #6 description
- @tiptap/markdown ^3.22.0 in package.json: CONFIRMED

**T4 (Web verification):**
- marked v17 as transitive dependency: CONFIRMED — marked latest is v17.0.6
- acorn+acorn-jsx being substantially smaller than @babel/parser: directionally CONFIRMED (widely documented)

**Evidence files vs spec:**
- tiptap-dynamic-attributes.md: findings faithfully represented in D6
- nodeviewcontent-feasibility.md: findings faithfully represented in A2, R1 (mitigated)
- jsx-parser-comparison.md: findings faithfully represented in D7, A3
- react-docgen-typescript-behavior.md: findings faithfully represented in A1
- node-type-split-architecture.md: findings faithfully represented in D8
- cms-prior-art-synthesis.md: findings faithfully represented in D9, D14
- fumadocs-serialization-compatibility.md: findings faithfully represented in D1 (revised)
- raw-jsx-tokenizer-proof.md: findings faithfully represented in D11, D12
- component-inventory-and-gaps.md: findings faithfully represented in D15, Future Work

## Unverifiable Claims

| Claim | What was checked | Why unverifiable |
|---|---|---|
| "23KB gzipped" for acorn+acorn-jsx | Directional comparison confirmed via evidence file. Exact gzipped size not independently measured. | Would require running actual bundling + gzip. Directionally correct. |
| "Storybook's attempt to show children in panels has 4+ open bugs since 2020" (D9) | Referenced in evidence/cms-prior-art-synthesis.md. Not independently verified via web search. | Spot-check priority is low — this is supporting evidence for a well-grounded decision (D9), not a load-bearing claim. |
| "23 E2E tests + 22 server-side tests" in SCR | Not counted. Test files exist in init_spike/tests/e2e/ and init_spike/src/. | Would require running test suite. Not load-bearing for the spec's design decisions. |
