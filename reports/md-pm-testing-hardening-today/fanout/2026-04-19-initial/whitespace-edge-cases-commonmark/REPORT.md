---
title: "Whitespace Edge Cases in a Remark-Based Markdown Pipeline (BOM, Line Endings, Tabs)"
description: "Historical record and current-day landscape of BOM (U+FEFF), CRLF/LF/CR line ending, and tab-handling edge cases across CommonMark parsers — with emphasis on observable divergences in a unified/remark/micromark TypeScript stack. Includes a 28-vector test corpus suitable for fast-check arbitraries or fixture files."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - CommonMark
  - micromark
  - remark-parse
  - remark-frontmatter
  - markdown-it
  - commonmark.js
  - js-yaml
  - mdast-util-to-markdown
topics:
  - markdown parsing
  - whitespace edge cases
  - round-trip idempotence
  - parser divergence
  - test vector design
---

# Whitespace Edge Cases in a Remark-Based Markdown Pipeline

**Purpose:** Surface the BOM, line-ending, and tab-handling edge cases that historically cause parser divergence, with focus on what affects a `remark-parse + remark-gfm + remark-frontmatter + remark-mdx-agnostic + remark-wiki-link` pipeline TODAY. The parent report uses this as the edge-case corpus for expanding test arbitraries.

---

## Executive Summary

The CommonMark 0.31.2 specification is **silent** on BOM, defines LF / CR / CRLF as three equivalent line endings (§2.1), and mandates a virtual-column tab-expansion rule with tab stops of 4 (§2.2). Every other parser behavior is implementation-defined — and implementations diverge in observable, testable ways.

For the parent's unified/remark pipeline the current-day hazard landscape breaks down as follows. On **BOM** (U+FEFF), `micromark` strips only a single leading BOM; every other BOM (mid-text, double, post-concatenation) survives and can break frontmatter detection or yield silently-corrupted YAML keys. `js-yaml` does not strip BOM and has refused to do so since [issue #179](https://github.com/nodeca/js-yaml/issues/179) was closed `wontfix` in 2015. On **line endings**, micromark preserves CR/LF/CRLF as distinct tokenizer codes but the `mdast` tree exposes no distinction, and `remark-stringify` emits LF only — [remark #660](https://github.com/remarkjs/remark/issues/660) confirmed this is intentional. Byte-level round-trip of CRLF input is therefore architecturally impossible under the default stack. On **tabs**, the `SKIP_SECTIONS` decision in `corpus-commonmark.test.ts` is explained by two compounding architectural properties: `mdast-util-to-markdown` defaults `fences: true` (every indented code input round-trips as fenced output), and micromark discards the column-offset context needed to reconstruct original tab/space layouts by the time serialization runs.

These are not bugs the parent report can "fix" by switching plugins. They are structural trade-offs in the unified ecosystem, and the parent pipeline must either (a) assert AST equivalence instead of byte equality for round-trip tests, or (b) configure stringify options (`fences: false`, etc.) and accept a narrower set of byte-preservable cases, or (c) pre-normalize inputs through a parse-stringify pass to reach a fixed point before testing.

**Key Findings:**
- **BOM is implementation-defined, and only micromark strips it (partially).** Leading BOM → stripped; internal BOM → survives. Bug [commonmark-spec talk 1832](https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832) closed without resolution in 2015.
- **CRLF round-trip is architecturally impossible** under `remark-parse → remark-stringify` defaults; [remark #660](https://github.com/remarkjs/remark/issues/660) closed `no/wontfix`.
- **SKIP_SECTIONS for Tabs and Indented code blocks has a concrete cause**: `mdast-util-to-markdown`'s `fences: true` default forces every indented code input to round-trip as fenced output.
- **One OPEN upstream bug is directly applicable**: [cmark #550](https://github.com/commonmark/cmark/issues/550) — list-marker CRLF detection broken in the C reference implementation. remark/micromark handles correctly, so this is a divergence the parent pipeline depends on, not a bug affecting it.
- **One OPEN spec ambiguity is directly applicable**: [commonmark-spec #777](https://github.com/commonmark/commonmark-spec/issues/777) — Unicode whitespace trimming in paragraphs; cmark, commonmark.js, and micromark all behave differently with no spec guidance.

---

## Research Rubric

| ID | Dimension | Priority | Depth |
|---|---|---|---|
| D3 | BOM (U+FEFF) handling: CommonMark position, per-parser behavior, YAML + BOM, editor emitters, real bug reports | P0 | Deep |
| D4 | CRLF / LF / mixed line endings: spec definition, per-parser behavior, hard-break edge cases, round-trip serialization, Git/editor implications | P0 | Deep |
| D5 | Tab handling and indented code blocks: spec's column-based expansion rule, per-parser divergence, SKIP_SECTIONS root cause, known ambiguities | P0 | Deep |
| TV | Consolidated test vectors (28 snippets across D3 + D4 + D5) | P0 | Deep |

**Stance:** Factual/Landscape — layout of edge cases + bug reports, not recommendations.
**Non-goals (honored):** No codebase analysis of the user's repo; no Rust-specific research; no recommendation rankings.

---

## Detailed Findings

### D3 — BOM (U+FEFF) Handling

**Finding:** CommonMark does not address BOM. Only `micromark` (remark-parse's engine) strips a single leading BOM; every other parser in the ecosystem preserves it. `js-yaml` preserves BOM as key-name content. `remark-frontmatter` requires `---` at column 1 of line 1, which is vulnerable to BOMs that survive the micromark strip (doubled BOMs, BOMs past position 0).

**Evidence:** [evidence/d3-bom-handling.md](evidence/d3-bom-handling.md)

**Per-parser behavior summary:**

| Parser | Leading BOM | Mid-text BOM (string input) | Mid-text BOM (stream/TextDecoder) |
|---|---|---|---|
| micromark / remark-parse | Stripped | Preserved | Stripped by TextDecoder |
| markdown-it | Preserved | Preserved | — |
| marked | Preserved | Preserved | — |
| commonmark.js | Preserved (inferred) | Preserved (confirmed) | — |

Source: [micromark/test/io/misc/bom.js](https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js), [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs), [marked issue #1133](https://github.com/markedjs/marked/issues/1133), [commonmark.js regression.txt](https://github.com/commonmark/commonmark.js/blob/master/test/regression.txt).

**Implications for the parent pipeline:**

The pipeline gets leading-BOM tolerance "for free" from micromark. Every other BOM case is a silent hazard:

- A **double BOM** (produced by `cat a.md b.md > combined.md` on Windows, or Windows PowerShell 5.1's default UTF-16LE+BOM redirection per [Microsoft docs](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)) strips only the first. The second survives mid-text and breaks both ATX-heading and frontmatter-fence detection by pushing the sigil off column 1.
- A **BOM inside YAML values** (`title: hello\uFEFFworld`) propagates through `js-yaml` to the runtime object unchanged. Downstream code comparing `frontmatter.title === "helloworld"` fails in a way no type checker catches.
- A **BOM inside a YAML key** (from a malformed concatenation) produces a key named `"\uFEFFkey"` rather than `"key"`. Lookups silently miss. [js-yaml #179](https://github.com/nodeca/js-yaml/issues/179) is closed `wontfix` since 2015.
- **String vs stream input paths diverge on internal BOMs.** `fs.readFileSync(path, 'utf8')` preserves internal BOMs; `createReadStream` piped through a parser via `TextDecoder` strips them. Same input file, same parser, two different ASTs.

**Decision triggers (when this matters):**
- The pipeline ingests files authored on Windows PowerShell 5.1 or legacy Notepad (pre-Windows 10 1903).
- The pipeline concatenates markdown files before parsing.
- The pipeline uses both streaming and string-based parsing paths (e.g., CLI vs HTTP endpoint).
- The pipeline trusts `frontmatter[key]` lookups for routing or dispatch decisions.

**Remaining uncertainty:**
- No bug report specifically documents the remark-frontmatter + double-BOM failure. It is inferred from source reading; a minimal reproducer would confirm.
- Microsoft Word's "Save as .md" export path is NOT FOUND — no authoritative source documents its BOM emission behavior.

---

### D4 — Line Ending Handling (CRLF / LF / CR / mixed)

**Finding:** CommonMark §2.1 treats LF, CR, and CRLF as three equivalent single line endings. The parent's stack preserves this distinction at the tokenizer layer (micromark's `carriageReturn`, `lineFeed`, `carriageReturnLineFeed` codes) but discards it at the AST layer. `remark-stringify` emits only LF. One upstream OPEN bug ([cmark #550](https://github.com/commonmark/cmark/issues/550)) and one OPEN spec ambiguity ([commonmark-spec #640](https://github.com/commonmark/commonmark-spec/issues/640)) remain.

**Evidence:** [evidence/d4-line-endings.md](evidence/d4-line-endings.md)

**Per-parser behavior summary:**

| Parser | CRLF handling | CR alone | Mixed endings |
|---|---|---|---|
| micromark / remark-parse | Distinct tokenizer code; mdast AST indistinguishable | Distinct tokenizer code | All three preserved at tokenizer, collapsed at AST |
| markdown-it | Normalized to LF by core rule | Normalized to LF | All collapsed to LF before parse |
| commonmark.js | Split on `/\r\n\|\n\|\r/` regex | Same | Same |

Source: [micromark codes.js](https://github.com/micromark/micromark/blob/main/packages/micromark-util-symbol/lib/codes.js), [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs), [commonmark.js blocks.js](https://github.com/commonmark/commonmark.js/blob/master/lib/blocks.js).

**Hard-break rules:** The spec (§6.7) uses the abstract "line ending" from §2.1, so `"foo  \r\n"` (two-space + CRLF) should produce a hard break identically to `"foo  \n"`. Empirically validated by the fix for [remark-lint #55](https://github.com/remarkjs/remark-lint/issues/55), which previously treated `\r` as a third trailing space and false-flagged CRLF hard breaks.

**Round-trip impossibility:** `mdast-util-to-markdown` has no `lineEnding` / `eol` option ([docs](https://github.com/syntax-tree/mdast-util-to-markdown)). [remark #660](https://github.com/remarkjs/remark/issues/660) was closed `no/wontfix` with the explicit position that LF-only output is intentional. Byte-level idempotence of CRLF input is therefore architecturally impossible under the default pipeline.

**OPEN upstream issues (2026-04-19):**

- [commonmark/cmark #550](https://github.com/commonmark/cmark/issues/550) (2024-06, **OPEN 22 months**): `parse_list_marker` compares directly against `'\n'` and misses CRLF. Affects the C reference implementation, not remark — but if the parent pipeline were to compare outputs against cmark for validation, this is a known-divergence point. remark/micromark is spec-conformant here.
- [commonmark/commonmark-spec #640](https://github.com/commonmark/commonmark-spec/issues/640) (2020-03, **OPEN 6+ years**): spec ambiguity on whether CRLF inside fenced code content must survive or may be normalized. commonmark.js strips `\r`; the spec isn't definitive. A pipeline test fixture using CRLF-in-code-fence has no single correct answer.

**Git autocrlf matters.** Per [git-scm.com/docs/gitattributes](https://git-scm.com/docs/gitattributes):

```
core.autocrlf=true:    commit: CRLF → LF;  checkout: LF → CRLF
core.autocrlf=input:   commit: CRLF → LF;  checkout: preserve
core.autocrlf=false:   no conversion either direction
```

A markdown file committed on macOS (LF) appears on a Windows developer's disk as CRLF if `autocrlf=true`. Filesystem-based test fixtures therefore test different bytes depending on checkout config — test arbitraries must generate line-ending variants **in memory** to get deterministic coverage.

**Decision triggers (when this matters):**
- Round-trip tests use byte-equality on any CRLF-containing fixture.
- Users author on Windows and the pipeline must tolerate mixed-ending input.
- The pipeline is intended to preserve authored line endings on output (it cannot, today).

**Remaining uncertainty:**
- Whether the parent's `ensureNonEmptyDoc` (pipeline.ts:100-113) handles `"\r\n"` and `"\r"` identically to `"\n"`. Source reading required.
- Whether any remark plugin in the stack (`remark-mdx-agnostic`, `remark-wiki-link`) introduces its own line-ending sensitivity.

---

### D5 — Tab Handling and Indented Code Blocks

**Finding:** The parent's `SKIP_SECTIONS = ["Tabs", "Indented code blocks"]` is architecturally forced by two compounding properties: `mdast-util-to-markdown` defaults `fences: true` (indented code round-trips as fenced output), and micromark discards the column-offset context needed to reconstruct original tab/space layouts before the AST is emitted.

**Evidence:** [evidence/d5-tabs-indented-code.md](evidence/d5-tabs-indented-code.md)

**Spec rule (§2.2):**
> "Tabs in lines are not expanded to spaces. However, in contexts where spaces help to define block structure, tabs behave as if they were replaced by spaces with a tab stop of 4 characters." ([spec source](https://spec.commonmark.org/0.31.2/#tabs))

The rule is dual-layered: tabs remain tab bytes, but their "width" for structure detection is column-based. A tab at column 3 fills columns 3→4 (width 2), not 3→7 (width 4). This is the conceptual source of every downstream divergence.

**Per-parser tab handling:**

| Parser | Strategy |
|---|---|
| micromark / remark-parse | Virtual-space tokens (`tab = -2, vs = -1`). `\ta` → `[tab, vs, vs, vs, 'a']`. Structure tokenizers consume column-by-column. ([README](https://github.com/micromark/micromark)) |
| markdown-it | No preprocessing; each block rule does ad-hoc column arithmetic. ([normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs)) |
| commonmark.js | Historical tab regressions in 0.20→0.21 ([issue #59](https://github.com/commonmark/commonmark.js/issues/59)); spec-divergent dingus behavior on `#\ttest` ([commonmark-spec #678](https://github.com/commonmark/commonmark-spec/issues/678)). |

**Why SKIP_SECTIONS exists — evidence-backed explanation:**

**Primary cause: fences: true default.** [`format-code-as-indented.js`](https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/format-code-as-indented.js) emits indented code **only if** `fences === false` is explicitly set AND the content has no leading/trailing whitespace-only lines. Every indented code block in the CommonMark test corpus therefore round-trips as a fenced block under default settings — the `mdast` tree is preserved but the bytes diverge. This is a *whole-section* idempotence failure, which explains why the whole section is skipped rather than individual examples.

**Compounding cause: tab-column context loss.** micromark's tokenizer preserves tab vs. virtual-space distinctions, but by the time `mdast-util-from-markdown` builds a `code` node, the token stream has collapsed into a string value. The serializer has no way to distinguish "this code block's indent came from `\t`" from "this code block's indent came from four spaces." The default `code` handler emits 4-space indentation unconditionally. For spec Examples 1-3 and 5-7 — all of which mix structural tabs with literal-content tabs — byte-level round-trip fails independent of any pipeline code.

**Secondary consideration: AST-level idempotence usually holds.** Because `stringify(parse(x))` normalizes to fenced output with space indentation, the *second* parse consumes clean, unambiguous input. `parse(parse_output) === parse(x)` typically succeeds. The failure is byte-identity on the first round-trip, not AST divergence on subsequent ones. This distinction matters for how the parent's test assertions are structured.

**OPEN upstream issues (2026-04-19):**

- [commonmark-spec #777](https://github.com/commonmark/commonmark-spec/issues/777) (2024-09, **OPEN**): Unicode whitespace trimming in paragraphs. cmark preserves NBSP (U+00A0) but strips U+000B / U+000C; commonmark.js trims everything matching `String.prototype.trim()`; micromark strips only U+0020 and U+0009. Three parsers, three behaviors, no spec guidance. Directly affects any pipeline that uses obscure whitespace in content.
- [commonmark-spec #363](https://github.com/commonmark/commonmark-spec/issues/363) (open): indented code blocks have no info-string mechanism — language-aware downstream tooling is structurally blocked.

**Decision triggers (when this matters):**
- The parent attempts to remove SKIP_SECTIONS from the test corpus — it will fail deterministically on byte-equality.
- The parent's round-trip assertion is changed from byte-equality to AST-equivalence — most of the skipped section becomes testable.
- Users author content with tab indentation preferences that must round-trip preserved.

**Remaining uncertainty:**
- Exact `fences: false` behavior map for all content-starts-with-blank-line edge cases (the regex in `format-code-as-indented.js` has 3 disjoint branches; full behavior matrix not collected).
- Whether `remark-mdx-agnostic` or `remark-wiki-link` introduce tab-handling quirks specific to JSX/wikilink boundaries — would need targeted probe.

---

### Test Vector Corpus (TV)

**Finding:** 28 concrete snippet-level test vectors spanning D3/D4/D5, each citing the primary CommonMark example or bug report that motivates it. Designed for lifting into fast-check arbitraries or fixture files.

**Evidence:** [evidence/test-vector-corpus.md](evidence/test-vector-corpus.md)

Breakdown: 8 BOM vectors, 10 line-ending vectors, 10 tab vectors. Every vector includes `input`, `expected_behavior`, `parsers_known_to_diverge`, and a primary-source URL.

The corpus also proposes three extensions to `arbitraries.ts`:
1. `lineEndingChoice` (`fc.constantFrom('\n', '\r\n', '\r')`) — per-line selection to generate mixed-ending documents.
2. `bomPrefix` (`fc.constantFrom('', '\uFEFF', '\uFEFF\uFEFF')`) — whole-document prefix.
3. `whitespaceIndent` (`fc.stringOf(fc.constantFrom(' ', '\t'), 0, 8)`) — for indented line starts.

A `midTextBom` generator (5% U+FEFF sprinkle per word) is also proposed for D3 coverage.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D3 — remark-frontmatter + BOM interaction**: No direct bug report exists. The double-BOM failure mode is inferred from source reading but unverified. A minimal reproducer would confirm.
- **D3 — Microsoft Word .md export**: NOT FOUND — no authoritative source on BOM emission. Third-party tools (Writage, word-to-markdown) vary.
- **D4 — remark-parse + plugin-level line-ending sensitivity**: Whether `remark-mdx-agnostic` or `remark-wiki-link` introduce their own CR/LF/CRLF sensitivity was not tested.
- **D5 — full `fences: false` behavior matrix**: The regex in `format-code-as-indented.js` forces fenced output for several edge cases even when `fences: false` is set. Full matrix not collected.

### Out of Scope (per Rubric)

- First-party codebase analysis of the parent's pipeline.
- Rust-specific research (markdown-rs behavior beyond the TODO comment in micromark).
- Recommendation rankings across the edge-case findings.

---

## References

### Evidence Files
- [evidence/d3-bom-handling.md](evidence/d3-bom-handling.md) — BOM edge cases, parser behavior matrix, js-yaml interaction
- [evidence/d4-line-endings.md](evidence/d4-line-endings.md) — CRLF/LF/CR handling, stringify limitations, git/editor implications
- [evidence/d5-tabs-indented-code.md](evidence/d5-tabs-indented-code.md) — SKIP_SECTIONS root cause, tab expansion algorithm, spec examples
- [evidence/test-vector-corpus.md](evidence/test-vector-corpus.md) — 28 concrete test vectors spanning all three dimensions

### External Sources (primary references)

**CommonMark spec:**
- [CommonMark 0.31.2 §2.1 Characters and lines](https://spec.commonmark.org/0.31.2/#characters-and-lines)
- [CommonMark 0.31.2 §2.2 Tabs](https://spec.commonmark.org/0.31.2/#tabs)
- [CommonMark 0.31.2 §4.4 Indented code blocks](https://spec.commonmark.org/0.31.2/#indented-code-blocks)
- [CommonMark 0.31.2 §6.7 Hard line breaks](https://spec.commonmark.org/0.31.2/#hard-line-breaks)

**CommonMark discussion forum (talk.commonmark.org):**
- [Treatment of Unicode BOM (U+FEFF)](https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832) — unresolved
- [Tab-related issues](https://talk.commonmark.org/t/tab-related-issues/1831) — jgm resolution
- [Tab expansion with indented code](https://talk.commonmark.org/t/tab-expansion-with-indented-code/2442) — 2017 clarification
- [Preserve tabs in code blocks as they are semantic](https://talk.commonmark.org/t/preserve-tabs-in-code-blocks-as-they-are-semantic/1165)
- [Abandon indented code blocks](https://talk.commonmark.org/t/we-should-abandon-indented-code-blocks/182) — rejected 2021

**Parser source / tests:**
- [micromark preprocess.js](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/preprocess.js)
- [micromark codes.js](https://github.com/micromark/micromark/blob/main/packages/micromark-util-symbol/lib/codes.js)
- [micromark BOM test fixtures](https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js)
- [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs)
- [commonmark.js blocks.js](https://github.com/commonmark/commonmark.js/blob/master/lib/blocks.js)
- [commonmark.js regression.txt](https://github.com/commonmark/commonmark.js/blob/master/test/regression.txt)
- [mdast-util-to-markdown format-code-as-indented.js](https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/format-code-as-indented.js)

**OPEN upstream bugs (2026-04-19):**
- [commonmark/cmark #550](https://github.com/commonmark/cmark/issues/550) — list marker CRLF detection
- [commonmark/commonmark-spec #640](https://github.com/commonmark/commonmark-spec/issues/640) — CRLF in code block content
- [commonmark/commonmark-spec #777](https://github.com/commonmark/commonmark-spec/issues/777) — Unicode whitespace in paragraphs

**Closed historical bugs:**
- [remarkjs/remark #660](https://github.com/remarkjs/remark/issues/660) — LF-only output (wontfix)
- [remarkjs/remark #195](https://github.com/remarkjs/remark/issues/195) — CR infinite loop
- [remarkjs/remark-lint #55](https://github.com/remarkjs/remark-lint/issues/55) — CRLF hard-break false flag
- [markedjs/marked #1133](https://github.com/markedjs/marked/issues/1133) + [#2139](https://github.com/markedjs/marked/issues/2139) — BOM issues
- [nodeca/js-yaml #179](https://github.com/nodeca/js-yaml/issues/179) — BOM in YAML (wontfix)
- [commonmark/commonmark.js #59](https://github.com/commonmark/commonmark.js/issues/59) — tab regressions
- [remarkjs/remark #198](https://github.com/remarkjs/remark/issues/198) + [#315](https://github.com/remarkjs/remark/issues/315) + [#402](https://github.com/remarkjs/remark/issues/402) — tab-indented list/code block parsing

**YAML / Editor:**
- [YAML 1.2.2 §5.2 Character Encodings](https://yaml.org/spec/1.2.2/#52-character-encodings)
- [Microsoft Learn — PowerShell about_Character_Encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)
- [git-scm.com — gitattributes](https://git-scm.com/docs/gitattributes)
