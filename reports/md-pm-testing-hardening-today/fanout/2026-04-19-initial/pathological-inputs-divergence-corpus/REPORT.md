---
title: "Pathological Inputs and Cross-Parser Divergence in the JS Markdown Ecosystem"
description: "Catalogue of CVEs, GHSAs, stack-overflow bugs, ReDoS patterns, giant-document scaling failures, and concrete cross-parser divergence snippets that should inform test coverage for a unified/remark-based TS markdown↔ProseMirror pipeline today."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - remark
  - micromark
  - markdown-it
  - marked
  - commonmark
  - mdx
  - dompurify
  - cmark-gfm
topics:
  - markdown parser security
  - DoS testing
  - cross-parser divergence
  - test fixture corpus
  - ReDoS
---

# Pathological Inputs and Cross-Parser Divergence in the JS Markdown Ecosystem

**Purpose:** A factual landscape — what pathological inputs (CVEs, ReDoS patterns, stack-overflow bugs, scaling failures) and cross-parser divergence snippets exist in the public record today. Intended as an edge-case fixture library that a unified/remark-based TS pipeline can lift into its test coverage to surface latent bugs before any future Rust migration.

**Stance:** Catalogue, not recommendation. The report describes what is documented in primary sources (GitHub Security Advisories, NVD, parser issue trackers, talk.commonmark.org, Babelmark3, CommonMark/GFM specs). It does not rank fixes or prescribe an architecture.

---

## Executive Summary

Between 2018 and 2026, the JS markdown parser ecosystem has accumulated **20+ published CVEs/GHSAs**, dozens of issue-tracker stack-overflow reports, multiple documented quadratic-time pathologies, and ~45 documented cross-parser divergence snippets that an iron-clad pipeline should test against. The findings cluster into six failure surfaces:

1. **ReDoS / catastrophic backtracking dominates published CVEs** — 9 of 20 advisories. Recurring offenders: link-reference, autolink/linkify, newline, and emphasis grammars in `marked`, `markdown-it`, and their plugins. Concrete reproducer payloads are public (e.g., `marked.parse(\`[x]:${' '.repeat(1500)}x ${' '.repeat(1500)} x\`)` for [CVE-2022-21680](https://github.com/markedjs/marked/security/advisories/GHSA-rrrm-qjm4-v8hf)). **micromark and remark have zero direct CVEs** in this period — the state-machine architecture eliminates the ReDoS class by construction, but does not eliminate algorithmic-complexity bugs (see #2).

2. **Stack-overflow / deep-nesting crashes are not in CVE databases but are well-documented in issue trackers.** [marked#1462](https://github.com/markedjs/marked/issues/1462) crashes Node on `marked(">".repeat(5000))` (~5 KB input). [micromark#20](https://github.com/micromark/micromark/issues/20) crashes on `[](`.repeat(35_000) via `unravelLinkedTokens` post-processor recursion. The micromark README **explicitly recommends a 500 KB input cap** and out-of-process execution. Among major parsers, **only markdown-it ships a `maxNesting` knob** (default 100; commonmark preset 20).

3. **The `unified`/`remark`/`micromark` family has no published CVEs against the parser core but inherits real risk from its plugin and rendering pipeline** — `remark-html` shipped with [CVSS 10.0 unsafe defaults](https://github.com/advisories/GHSA-9q5w-79cv-947m) until late 2021, and `mdast-util-to-hast` had a [class-attribute injection CVE](https://github.com/advisories/GHSA-4fh9-h7wg-q85m) as recently as Dec 2025. DOMPurify, the de facto sanitizer downstream of `remark-rehype`, accumulated [four 2024–2026 advisories](https://github.com/cure53/DOMPurify/security/advisories) of its own (prototype pollution, mXSS).

4. **MDX is the real-world scaling failure point.** Docusaurus, Astro, and Gatsby OOMs cluster around MDX builds. Default Node 2 GB heap is routinely exhausted; Babel's [500 KB code-generator deopt](https://github.com/ChristopherBiscardi/gatsby-mdx/issues/411) is the documented phase shift. **No published 1 MB / 10 MB / 100 MB head-to-head benchmark exists** for any of the JS parsers — this gap is itself a finding that argues for the pipeline running its own scaling probes.

5. **Cross-parser divergence is densest around emphasis precedence, reference links, HTML blocks, and GFM tables.** Spec-silent edge cases like `[foo][ ]` (whitespace-only label) split JS family (no link) from Rust/Go (link). The "openers_bottom" optimization in CommonMark emphasis is over-applied across cmark, MD4C, and commonmark.js, producing counterintuitive ASTs for inputs like `*****Hello*world****`.

6. **GFM compatibility is three different targets**: the GFM written spec, cmark-gfm behavior (which includes documented bugs like [escaped backslash in cells](https://github.com/github/cmark-gfm/issues/277)), and GitHub.com behavior (which adds layers cmark-gfm does not — sanitization, `javascript:` scrubbing, mention/emoji autolinks). Strikethrough is the binary forced choice: spec requires `~~text~~`; cmark-gfm/GitHub accept `~text~`; markdown-it (default) follows the spec; remark-gfm defaults to cmark-gfm behavior.

**Key Findings:**
- **Pipeline using `remark-parse` in a Hocuspocus server today is most exposed to:** (a) deep-nesting crashes from MDX/JSX nesting and unbalanced micromark constructs, (b) plugin-side XSS regressions (`remark-html`-class defaults, `mdast-util-to-hast`-class injection), (c) DOMPurify chain CVEs, (d) algorithmic-complexity DoS from unbalanced emphasis/links/tables.
- **The 45-entry divergence corpus** ([evidence/divergence-corpus.md](evidence/divergence-corpus.md)) is lift-and-shift-ready as fixture data — each entry has an exact input, documented divergence, spec/forum reference, and a `test_family` tag for grouping.
- **`marked` and `markdown-it` carry the most concrete published reproducer payloads** (CVE PoCs include exact strings); these are the highest-value seed corpus inputs for fuzzing the pipeline.

---

## Research Rubric

**Primary question:** What pathological inputs (CVEs, DoS patterns, nesting/blowup bugs) and cross-parser divergence snippets exist today that should inform test coverage for a unified/remark-based TS pipeline?

**Stance:** Factual / Landscape — catalogue, not recommendations.

**Dimensions investigated:**
| ID | Dimension | Depth |
|---|---|---|
| D6.1 | Published CVEs and GHSAs in JS markdown parsers (2020+) | P1 Moderate |
| D6.2 | Deep-nesting and stack-overflow bugs | P1 Moderate |
| D6.3 | ReDoS and quadratic-time pathological inputs | P1 Moderate |
| D6.4 | Giant-document scaling and memory pressure | P1 Moderate |
| D7.1 | Babelmark3 divergence mining | P0 Deep |
| D7.2 | CommonMark forum reconciled test vectors | P0 Deep |
| D7.3 | GFM-specific divergences | P0 Deep |
| D7.4 | Curated snippet corpus (consolidated test fixture library) | P0 Deep |

**Non-goals (per parent prompt):**
- No analysis of the user's codebase
- No Rust-specific research
- No recommendation rankings

---

## Detailed Findings

### D6.1 — Published CVEs and GHSAs (2020+)

**Finding:** 20 advisories captured across the npm markdown parsing/rendering surface in the 2020+ window. ReDoS is the dominant class (~9), followed by XSS (~6), prototype pollution / mXSS (~4 in DOMPurify), and one infinite-loop control-flow bug.

**Evidence:** [evidence/d6.1-cves-ghsas.md](evidence/d6.1-cves-ghsas.md)

**Most consequential for a remark-based server pipeline today:**

- **[CVE-2021-39199 / GHSA-9q5w-79cv-947m](https://github.com/advisories/GHSA-9q5w-79cv-947m)** — `remark-html` shipped with documentation claiming safe defaults but actually allowed raw HTML pass-through. **CVSS 10.0.** Patched in 13.0.2 / 14.0.1. Pipeline implication: any `remark-html` predating these versions is a critical XSS gateway, regardless of input.
- **[CVE-2025-66400 / GHSA-4fh9-h7wg-q85m](https://github.com/advisories/GHSA-4fh9-h7wg-q85m)** — `mdast-util-to-hast` < 13.2.1: triple-backtick code fence with character-reference injection (e.g., `` ```js&#x20;xss ``) leaks extra unprefixed classnames into rendered code blocks. Pipeline implication: anything that converts mdast → hast → HTML through this util is exposed.
- **DOMPurify chain CVEs** — Four 2024–2026 advisories: [CVE-2024-48910](https://github.com/advisories/GHSA-p3vf-v8qc-cwcr) (prototype pollution, CVSS 9.3), [CVE-2024-45801](https://github.com/advisories/GHSA-mmhx-hmjr-r674) (depth-check bypass + pollution), [CVE-2025-26791](https://github.com/advisories/GHSA-vhxf-7vqr-mrjg) (SAFE_FOR_TEMPLATES regex), [GHSA-h8r8-wccr-v5f2](https://github.com/advisories/GHSA-h8r8-wccr-v5f2) (re-contextualization mXSS via `<xmp>` and friends). Pipeline implication: a remark-rehype-DOMPurify chain inherits these windows.
- **No CVEs against `commonmark.js`, `micromark`, `unified` core, `rehype-raw`, `rehype-stringify`** — confirmed via direct GitHub Advisory Database queries. The architectural choice of state-machine tokenization correlates with this absence.

**Implications:**
- The pipeline should pin known-good versions of every plugin in the unified pipeline and re-audit on every dependency bump.
- The "abandoned plugin" risk is real — `markdown-it-decorate`, npm `markdown`, and `markdown-pdf` all have advisories with **no available patch**, fixed only by migrating away.

---

### D6.2 — Deep-Nesting and Stack-Overflow Bugs

**Finding:** Documented `RangeError: Maximum call stack size exceeded` failures exist for every major JS parser at modest input sizes (a few KB). JS-engine call-stack ceilings are surprisingly low: ~3,842 frames in Node, ~3,931 in Chrome, ~49,392 in Firefox.

**Evidence:** [evidence/d6.2-stack-overflow-bugs.md](evidence/d6.2-stack-overflow-bugs.md)

**Concrete reproducers from the public record:**

```js
// marked#1462: blockquote bomb (~5KB input → Node crash)
marked(">".repeat(5000));

// marked#1471: indented list bomb
let s = ''; for (let i = 0, sp = 0; i < 300; i++, sp += 2) s += ' '.repeat(sp) + '- a\n';
marked(s);

// micromark#20: unclosed link bomb
parseMarkdown("[](".repeat(35000));
```

**Mitigation knob inventory:**
| Parser | Depth-limit option | Default |
|---|---|---|
| markdown-it (default) | `maxNesting` | **100** |
| markdown-it (commonmark preset) | `maxNesting` | **20** |
| marked | none | n/a |
| micromark | none | n/a (README recommends 500 KB input cap, worker thread) |
| mdast-util-from-markdown | none | n/a (uses JS-array stack, not call stack) |
| MDX | none | n/a |

**Implications:**
- A remark/micromark pipeline has **no built-in depth defense**. The README's explicit recommendation — cap input at ~500 KB and process in a worker — should be treated as a hard requirement.
- **No public issue exists for deeply-nested MDX `<A><B><C>...` (~thousands of levels)**. This is a plausible undisclosed reproducer worth seeding the pipeline's PBT corpus with.
- The post-processing `unravelLinkedTokens` recursion in micromark (issue #20) is the canonical example that "tokenizer-based ≠ recursion-free."

**Remaining uncertainty:** No CVE has ever been assigned to a JS markdown parser stack-overflow bug, even though crashes are well-documented. This may reflect classification practices (DoS via crash vs DoS via slow operation) more than absence of risk.

---

### D6.3 — ReDoS and Quadratic-Time Pathologies

**Finding:** ReDoS is the dominant published vulnerability class. The `marked` and `markdown-it` packages both have multiple confirmed ReDoS CVEs with public PoC payloads. `micromark` has zero direct ReDoS CVEs because its character-by-character state-machine architecture does not use backtracking regexes in the parse hot path.

**Evidence:** [evidence/d6.3-redos-quadratic.md](evidence/d6.3-redos-quadratic.md)

**Concrete pathological input patterns from the public record:**

| # | Pattern | Targets | Complexity | Source |
|---|---|---|---|---|
| P1 | `'[x]:' + ' '.repeat(1500) + 'x ' + ' '.repeat(1500) + ' x'` | marked `block.def` | Cubic | [CVE-2022-21680](https://github.com/markedjs/marked/security/advisories/GHSA-rrrm-qjm4-v8hf) |
| P2 | `'[x]: x\n' + '[]('.repeat(N)` | marked `inline.reflinkSearch` | Exponential | [CVE-2022-21681](https://github.com/markedjs/marked/security/advisories/GHSA-5v2h-r2cx-5xgj) |
| P3 | `' '.repeat(150_000) + '\n'` | markdown-it `/\s+$/` | Quadratic | [CVE-2022-21670](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-6vfc-qv3f-vr6c) |
| P4 | `'*'.repeat(N) + 'x'` | markdown-it linkify (v13.x) | Quadratic+ | [CVE-2026-2327](https://github.com/advisories/GHSA-38c4-r59v-3vqw) |
| P5 | `'!['.repeat(100_000)` (MarkdownTime) | cmark-gfm autolink ext | Polynomial | [GHSA-c2pc-g5qf-rfrf](https://www.legitsecurity.com/blog/dos-via-software-supply-chain-innumerable-projects-exposed-to-a-markdown-library-vulnerability) |
| P6 | `'***' + 'a'.repeat(10_000) + '***...'` | markdown-it emphasis (pre-12.3.0) | Quadratic | [markdown-it CHANGELOG 12.3.0](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md) |

**Quadratic-time non-regex bugs (separate class):**
- CommonMark emphasis delimiter run — markdown-it logged "quadratic complexity in pathological `***...***a***...***`" (12.3.0).
- Reference-link lookup without dedup/hashing — markdown-it 14.1.0 fix.
- Table output explosion — markdown-it 14.1.0.
- MarkdownTime — affects every cmark-gfm-derived renderer.

**Mitigations available:**
- `marked` — no built-in timeout. Official guidance: run on a worker, terminate on slowness.
- `markdown-it` — no built-in timeout. Refactors hot algorithmic paths as bugs surface.
- `micromark` — architectural: no backtracking regex in parse hot path.
- Static analysis: [`recheck`](https://makenowjust-labs.github.io/recheck/) (the same tool that filed CVE-2022-21670/21680/21681).

**Implications for a remark-based pipeline:**
- ReDoS class is mitigated by architecture for the parser core itself.
- Quadratic-time non-regex bugs are still a risk — emphasis with many opener/closer interleavings, reference-link lookup at scale.
- Plugins are the soft underbelly: any `remark-*` or `rehype-*` plugin that uses regex (e.g., for highlight, custom syntax) can re-introduce the class.

---

### D6.4 — Giant-Document Scaling and Memory Pressure

**Finding:** All popular JS markdown parsers buffer the whole document. Even micromark's "streaming" interface internally buffers because reference-style links require lookaround. **No published 1 MB / 10 MB / 100 MB head-to-head benchmark exists.** Maintainers explicitly recommend sub-megabyte input caps. The MDX pipeline is the real-world OOM hotspot.

**Evidence:** [evidence/d6.4-giant-document-scaling.md](evidence/d6.4-giant-document-scaling.md)

**Throughput data from talk.commonmark.org/16 (CommonMark spec corpus):**
- markdown-it: 986 ops/sec
- marked: 729 ops/sec
- commonmark.js: 709 ops/sec
- showdown.js: 248 ops/sec
- micromark (community bench): 229 ops/sec — **~50% slower than remark-parse used to be** per maintainer

**Super-linear regime data:**
- Pro Git × 1: ~47 ops/sec
- Pro Git × 20: ~1–2 ops/sec → **20× input → ~25–47× slower**

**Real-world OOM cluster:**
- [Docusaurus #4785 / #8329 / #7410 / #1782](https://github.com/facebook/docusaurus/issues/4785) — webpack + MDX OOM at 1.95 GB heap
- [Astro #4894](https://github.com/withastro/astro/issues/4894) — server hangs to OOM
- [gatsby-mdx #411](https://github.com/ChristopherBiscardi/gatsby-mdx/issues/411) — crash threshold at >1590 MDX lines + PrismJS, Babel emits "code generator deoptimised the styling of undefined as it exceeds the max of 500KB"
- [react-markdown #289](https://github.com/remarkjs/react-markdown/issues/289) — large markdown pegs CPU 100%, blocks event loop
- [remarkjs discussion #1027](https://github.com/orgs/remarkjs/discussions/1027) — virtualization debunked at parse layer (lookahead/lookbehind prevent splitting)

**Implications:**
- Default Node 2 GB heap is the de facto ceiling for MDX-heavy workloads.
- The pipeline should test parsing at 1 MB, 10 MB, and 100 MB explicitly — no ecosystem source has this data.
- Server-side parsing for large inputs is the maintainer-recommended posture (vs client-side react-markdown).

---

### D7.1 + D7.2 — Babelmark3 + CommonMark Forum Divergences

**Finding:** Cross-parser divergence is concentrated in 7 categories: emphasis precedence, reference link resolution, HTML block boundaries, setext-vs-thematic-break ambiguity, autolinks, list tightness, and fenced-code closing rules. The CommonMark spec acknowledges multiple silent or under-specified areas.

**Evidence:** [evidence/d7.1-d7.2-babelmark-commonmark-divergences.md](evidence/d7.1-d7.2-babelmark-commonmark-divergences.md)

**Spec-silent edge cases worth fixture coverage:**
1. Emphasis "openers_bottom" mod-3 over-application (`*****Hello*world****`) — [forum #3866](https://talk.commonmark.org/t/i-dont-understand-how-emphasis-is-parsed/3866)
2. `[foo][ ]` whitespace-only label — JS family (no link) vs Rust/Go (link) — [forum #4581](https://talk.commonmark.org/t/reference-links-followed-by-space-only-pair-of-brackets/4581)
3. Code span vs link title precedence — undocumented but consistent — [forum #8982](https://talk.commonmark.org/t/precedence-of-link-title-over-code-span/8982)
4. HTML block end-conditions inside other HTML blocks (`<pre>` inside `<table>`) — [forum #2388](https://talk.commonmark.org/t/end-conditions-within-end-conditions/2388)
5. List tightness propagation across nesting — [forum #4622](https://talk.commonmark.org/t/tightness-and-looseness-of-nested-lists/4622)
6. `<textarea>` HTML block type — fixed in spec 0.31, but older parsers diverge — [forum #3550](https://talk.commonmark.org/t/textarea-as-multi-line-html-block/3550)
7. Hard break: `\\` (kramdown) vs `\` (CommonMark) — both forms in the wild

**Forum threads with reconciled answers** are catalogued in the evidence file — these are reference test vectors with documented expected behavior.

**Implications:**
- A pipeline running `remark-parse` will produce specific, predictable outputs for these snippets. Asserting on those outputs as regression tests catches drift if the upstream parser changes behavior to follow a non-JS-family interpretation (e.g., the `[foo][ ]` case).

---

### D7.3 — GFM-Specific Divergences

**Finding:** GFM compatibility is three subtly different targets — written spec, cmark-gfm behavior (includes bugs), GitHub.com behavior (adds sanitization layers cmark-gfm doesn't have). Strikethrough single-tilde, table list-vs-table precedence, and pipe-in-code-span-in-table are the most common divergence sources.

**Evidence:** [evidence/d7.3-gfm-divergences.md](evidence/d7.3-gfm-divergences.md)

**The 5 GFM extension areas with their documented divergences:**

1. **Tables** — list-vs-table precedence undefined ([cmark-gfm #333](https://github.com/github/cmark-gfm/issues/333)); escaped backslash bug ([cmark-gfm #277](https://github.com/github/cmark-gfm/issues/277)); pipe-inside-code-span-in-cell contradicts CommonMark code-span literal-backslash rule ([cmark-gfm #24](https://github.com/github/cmark-gfm/issues/24)); trailing whitespace creates extra empty `<td>` in remark-gfm only ([remark-gfm #11](https://github.com/remarkjs/remark-gfm/issues/11)); blockquote lazy continuation diverges ([remark-gfm #3](https://github.com/remarkjs/remark-gfm/issues/3)).

2. **Strikethrough** — Spec requires `~~text~~`. cmark-gfm/GitHub also accept `~text~` ([cmark-gfm #71](https://github.com/github/cmark-gfm/issues/71)). markdown-it default rejects single tilde. remark-gfm defaults to single-tilde-true.

3. **Autolinks** — Trim set excludes quotes per spec; pre-PR-#2673 marked incorrectly trimmed; `www.` autolinks default to `http://` not `https://` per spec ([example 622](https://github.github.com/gfm/#example-622)); position constraints differ across parsers.

4. **Task lists** — All major aligned on `[X]`/`[x]`/`[ ]`. NBSP-in-marker not recognized ([cmark-gfm #192](https://github.com/github/cmark-gfm/issues/192)). Task lists inside table cells: GitHub renders interactively, remark-gfm doesn't ([remark-gfm #27](https://github.com/remarkjs/remark-gfm/issues/27)).

5. **Disallowed raw HTML (tagfilter)** — Nine tags. Application is opt-in for some wrappers. Older marked was case-sensitive (regression). pulldown-cmark (Rust) skipped the extension entirely.

**Implications:**
- A pipeline targeting "GFM compatibility" must pick its compatibility target and document it.
- The list-vs-table precedence case is silently exploitable for content-smuggling tests where intent is ambiguous.
- DOMPurify is downstream of GFM tagfilter; the two together form the security perimeter.

---

### D7.4 — Curated Snippet Corpus (Lift-and-Shift Fixture Library)

**Finding:** A consolidated YAML-formatted corpus of ~45 divergence snippets across 13 test families is captured in [evidence/divergence-corpus.md](evidence/divergence-corpus.md). Each entry has exact input, documented divergence behavior, spec/forum reference, and a `test_family` tag.

**Test families:**
- `emphasis` (7 entries) — `***foo***`, `*b**a***`, `_a_b_c_`, etc.
- `links` (6 entries) — case fold, Unicode fold, `[foo][ ]`, parens-in-destination, etc.
- `html-blocks` (4 entries) — script-inside-list, pre-inside-table, textarea, inline `<del>`
- `setext-vs-hr` (2 entries)
- `autolinks` (10 entries) — bare URL, www, backslash, parens, trailing punctuation
- `lists` (5 entries) — paragraph interruption, nested numeric, blank lines, tight/loose
- `fenced-code` (4 entries) — mismatched lengths, unclosed, indented closing
- `code-spans` (1 entry) — leading/trailing space
- `hard-breaks` (3 entries) — backslash vs spaces vs end-of-paragraph
- `gfm-strikethrough` (3 entries) — single, double, triple tilde
- `gfm-tables` (7 entries) — list precedence, mismatch, code spans, blockquote
- `gfm-tasks` (3 entries) — case, NBSP, in-table
- `disallowed-html` (3 entries) — script, uppercase, plaintext

**Implications:**
- The corpus is structured for direct lift into a fixture file. Three usage patterns:
  1. Where all major JS parsers agree, the documented behavior is the regression baseline.
  2. Where divergence is documented, lift to a "known-divergence" suite — assert that the pipeline produces ONE of the documented behaviors and flag drift.
  3. Where a CVE/forum thread documents a *bug* in the pipeline's chosen parser, treat as "currently-broken, do-not-regress-toward-fix" cases.
- Babelmark3 (https://babelmark.github.io/) reproduces every snippet across ~25 parsers live; the URL is dynamic but the snippets above are stable inputs.

---

## Cross-Cutting Synthesis

Three patterns emerge across D6 and D7:

1. **The unified/remark/micromark family has won the architectural-safety battle (no ReDoS in core, state-machine tokenization)** but inherits substantial risk from its plugin layer (`remark-html` defaults, `mdast-util-to-hast` injection) and from its sanitization downstream (DOMPurify CVEs). The parser core's clean security record is real but does not transitively cover the pipeline.

2. **Stack-overflow and giant-document scaling are documented gaps in the public record.** No CVE for any micromark/remark stack-overflow despite the README acknowledging the failure mode. No published 1MB/10MB/100MB benchmark for any major parser. These are areas where the pipeline's own coverage exceeds the ecosystem's.

3. **Cross-parser divergence concentrates in spec-silent areas.** The CommonMark spec is excellent on positive examples but quiet on edge cases — and parsers split across language families (JS vs Rust vs Go) on those silent cases. A pipeline that locks its expected behavior to the JS-family interpretation gets predictable but ecosystem-divergent output; a pipeline that treats divergence as drift catches upstream changes early.

---

## Limitations and Open Questions

### Dimensions Not Fully Confirmed
- **Exact per-parser HTML for every snippet** — Several entries in the divergence corpus document "what the spec says" and "which parsers were noted to differ" without exact current output for every parser. Running each input through commonmark.js, markdown-it, marked, and remark in a harness would convert these to assertion-grade fixtures.
- **MDX deep-nesting reproducer** — No public issue captures `<A><B><C>...` to thousands of levels. Likely undisclosed; worth proactive testing.
- **GitHub.com renderer's full behavior** — closed source, observable only. GitHub adds sanitization, URL scrubbing, mention/emoji autolinking on top of cmark-gfm. The exact diff is not catalogued in any public source surveyed.

### Out of Scope (per Rubric)
- Analysis of the user's codebase (remark-parse usage in `packages/server/`)
- Rust-specific parser comparison (`markdown-rs`, `pulldown-cmark`, `comrak`)
- Recommendation rankings on which parser to adopt or which fixtures to prioritize

### Known Gaps in Available Sources
- markdown-it's `docs/security.md` URL referenced in older docs returns 404; current security guidance is folded into the README.
- No public benchmark of micromark/remark-parse on documents >500 KB.
- No published benchmark comparing memory growth O(n) vs O(n²) across parsers on adversarial inputs.

---

## References

### Evidence Files
- [evidence/d6.1-cves-ghsas.md](evidence/d6.1-cves-ghsas.md) — 20 CVEs/GHSAs with PoC payloads, CWE classes, and patch versions
- [evidence/d6.2-stack-overflow-bugs.md](evidence/d6.2-stack-overflow-bugs.md) — Issue-tracker reports and architectural notes per parser
- [evidence/d6.3-redos-quadratic.md](evidence/d6.3-redos-quadratic.md) — ReDoS catalog + 11 pathological input patterns
- [evidence/d6.4-giant-document-scaling.md](evidence/d6.4-giant-document-scaling.md) — Benchmarks, OOM incident reports, MDX scaling notes
- [evidence/d7.1-d7.2-babelmark-commonmark-divergences.md](evidence/d7.1-d7.2-babelmark-commonmark-divergences.md) — Spec ambiguity inventory and forum-reconciled threads
- [evidence/d7.3-gfm-divergences.md](evidence/d7.3-gfm-divergences.md) — GFM extension-by-extension divergence notes
- [evidence/divergence-corpus.md](evidence/divergence-corpus.md) — **45-entry curated snippet corpus, lift-and-shift-ready**

### External Primary Sources

**CVE / Advisory databases:**
- [GitHub Advisory Database](https://github.com/advisories) — primary source for all 20 cataloged CVEs/GHSAs
- [NVD search](https://nvd.nist.gov/vuln/search) — CVSS scoring corroboration
- [Snyk vulnerability DB](https://security.snyk.io) — supplementary for plugins

**Parser issue trackers:**
- [marked issues](https://github.com/markedjs/marked/issues) — #1462, #1471, #2220, #3379
- [micromark issues](https://github.com/micromark/micromark/issues) — #20
- [markdown-it CHANGELOG](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md) — quadratic-time fixes
- [mdx-js/mdx issues](https://github.com/mdx-js/mdx/issues) — #1152, #1202, #1318, #1476, #2172
- [Docusaurus issues](https://github.com/facebook/docusaurus/issues) — OOM cluster

**Specs:**
- [CommonMark spec 0.31.2](https://spec.commonmark.org/0.31.2/)
- [GFM spec](https://github.github.com/gfm/)

**Forums and reference tools:**
- [talk.commonmark.org](https://talk.commonmark.org/) — ~25 forum threads cited in evidence
- [Babelmark3](https://babelmark.github.io/) — cross-parser comparison harness
- [markedjs.com](https://marked.js.org/using_advanced) — official ReDoS guidance

---

## Recap

**What we investigated:** The complete public record of CVEs/GHSAs (2020+), stack-overflow bugs, ReDoS payloads, scaling failures, and cross-parser divergence snippets in the JS markdown parser ecosystem — framed as edge-case coverage for a unified/remark-based pipeline.

**Key findings:**
- 20 advisories cataloged; ReDoS dominates (9 of 20). micromark/remark have no direct CVEs (architectural mitigation works).
- Stack overflow crashes at single-digit-KB inputs are documented for marked and micromark. Only markdown-it ships a depth-limit knob.
- The unified pipeline's risk lives in plugins (remark-html CVSS 10.0, mdast-util-to-hast Dec-2025 injection) and DOMPurify (4 CVEs in 2024–2026).
- MDX is the real-world OOM hotspot; default Node 2 GB heap is the de facto ceiling.
- 45 divergence snippets curated into a lift-and-shift fixture library covering 13 test families.

**Confidence gaps:**
- Exact per-parser HTML for every divergence snippet is documented from spec/forum references, not from current parser execution. Running the corpus through a live harness would convert these to assertion-grade fixtures.
- No published benchmark exists for any JS parser at 1 MB / 10 MB / 100 MB markdown.
- Deep-nested MDX (`<A><B><C>...` × thousands) is plausibly undisclosed in the public record.

**Where this fits in the parent fanout:** This report supplies the edge-case fixture inventory (D6 + D7) that complements the parent's testing-techniques/PBT-strategy and Rust-migration-readiness dimensions.
