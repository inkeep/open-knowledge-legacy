You are conducting deep technical research as a sub-instance of a larger fanout.

## PARENT REPORT CONTEXT

**Purpose:** What testing techniques and edge-case corpora should an iron-clad md ⇄ PM TS pipeline carry today to surface latent bugs before a Rust migration?

**Primary question:** What are the BOM, line-ending, and tab-handling edge cases historically known to cause divergence across markdown parsers that are applicable to a unified/remark-based TS pipeline today?

**Stance:** Factual/Landscape — layout of edge cases + historical bug reports, NOT recommendations.

**Non-goals (do not investigate):**
- No analysis of the user's codebase — external findings only
- No Rust-specific research — the question is "what edge cases affect our remark-based TS pipeline today"
- No recommendation rankings

## EXISTING FINDINGS ON THIS TOPIC (from parent worldmodel pass)

- `corpus-commonmark.test.ts` in the target repo has `SKIP_SECTIONS = ["Tabs", "Indented code blocks"]`. The skip was done per US-017 for unspecified historical reasons — the parent report needs to understand WHY these sections are ambiguous.
- `arbitraries.ts` hardcodes `\n` line endings; no CRLF or mixed generation.
- No BOM (U+FEFF) input is ever tested.
- `remark-frontmatter` is configured with `['yaml']` only (hardcoded in `pipeline.ts`).
- `ensureNonEmptyDoc` handles empty inputs (`pipeline.ts` line 100-113).
- Parent's current parser stack: remark-parse + remark-gfm + remark-frontmatter + remark-mdx-agnostic + remark-wiki-link.

## YOUR RESEARCH TASK

Research the historical record of BOM, CRLF/LF, and tab-handling edge cases in the markdown-parser ecosystem, with emphasis on cases that affect remark / markdown-it / micromark / unified TODAY. Produce concrete snippet-level test vectors where possible — the parent report will use these to expand its test arbitraries.

## DIMENSIONS TO INVESTIGATE

### D3 — BOM (U+FEFF) handling (P0)

- What does CommonMark 0.31.2 spec say about BOM? (Search spec.commonmark.org, talk.commonmark.org)
- How each major parser handles BOM-prefixed input: remark-parse, micromark, markdown-it, marked — observable behavior from their source or test fixtures
- BOM + YAML frontmatter interactions: YAML 1.2 spec says BOM is allowed at the start, but some YAML parsers reject it. `js-yaml` specifically — does it strip, reject, or fail silently?
- Real bug reports in unified/remark repos about BOM (search issues: `site:github.com unified/unified BOM OR \uFEFF` and same for remark-frontmatter)
- Editor emitters: VS Code (setting `files.encoding` with BOM), PowerShell redirects, some Word-export paths — which editors emit BOM by default or when configured?
- Interop with the `text/markdown` MIME type vs content sniffing

### D4 — CRLF / LF / mixed line endings (P0)

- CommonMark §2.2 exact rule on `\r\n` and `\r` (paraphrase the spec language)
- Per-parser behavior on CRLF input: remark-parse, micromark, markdown-it — do they normalize pre-parse?
- Hard-break rules with CRLF: does `"text  \r\n"` (two-space + CRLF) still produce a hard break?
- Trailing-on-last-line edge cases: file ending with `\n` vs no trailing newline, CRLF at EOF
- Mixed line-endings in a single document: does remark-parse normalize or preserve?
- Real bug reports about line-ending handling in the unified ecosystem
- Windows-git-checkout implications: if `core.autocrlf` is true, files may be CRLF on disk and LF in memory; does this matter for round-trip identity tests?

### D5 — Tab handling and "Indented code blocks" (P0)

- CommonMark §2.2 on tab expansion (tab-stop 4, column-based — the exact rule that confuses parsers)
- Why the parent repo's `SKIP_SECTIONS` includes "Tabs" and "Indented code blocks" — which idempotence property fails?
- Historical CommonMark talk.commonmark.org threads discussing tab ambiguity (search: "tab stops" OR "indented code" site:talk.commonmark.org)
- Per-parser divergence on tab-containing input: remark-parse vs markdown-it behavior
- Interaction between tabs inside list items (`- <TAB>item`) and tab-stop column calculation
- Real bug reports about tab handling in the unified or remark ecosystem
- Indented code block detection: 4 spaces OR 1 tab expanded to column 4 — known ambiguities

### D3+D4+D5 — Concrete test vectors (P0)

- Produce a consolidated list of snippet-level test cases that exercise each edge case. These should be markdown literal strings suitable for lifting into an arbitrary or a fixture file. Example shape:
  ```
  - name: "BOM before YAML frontmatter"
    input: "\uFEFF---\ntitle: test\n---\n\nbody"
    expected_behavior: "BOM stripped, frontmatter parsed"
    parsers_known_to_diverge: [remark-parse, micromark]  # if known
    source: <URL of bug report or spec discussion>
  ```
- Aim for 15-30 concrete snippets across D3+D4+D5

## CONSTRAINTS

- All citations must be external primary sources: CommonMark spec (spec.commonmark.org), talk.commonmark.org, GitHub issues in unified/remark/micromark/markdown-it, YAML parser issue trackers, editor documentation
- Do NOT reference sibling fanout directories
- Frame all findings as edge cases affecting A TS PIPELINE USING remark + remark-gfm + remark-frontmatter + remark-mdx-agnostic TODAY
- Training-data claims flagged as "unverified" if no real source — historical CommonMark discussions in particular need cited URLs
- **Output location:** `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-initial/whitespace-edge-cases-commonmark/`
- **Filename:** `REPORT.md` (uppercase)
- **Evidence files:** in `evidence/` with frontmatter — one file per D3/D4/D5 recommended, plus one for the test-vector corpus
- Target: 2000-4000 words. Evidence files longer with snippet details.

Depth: deep — THREE P0 Deep dimensions bundled (BOM, CRLF, Tabs).
