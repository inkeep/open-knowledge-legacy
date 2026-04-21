You are conducting deep technical research as a sub-instance of a larger fanout.

## PARENT REPORT CONTEXT

**Purpose:** What testing techniques and edge-case corpora should an iron-clad md ⇄ PM TS pipeline carry today to surface latent bugs before a Rust migration?

**Primary question:** What pathological inputs (CVEs, DoS patterns, nesting/blowup bugs) and cross-parser divergence snippets exist today that should inform test coverage for a unified/remark-based TS pipeline?

**Stance:** Factual/Landscape — catalogue of documented issues + curated snippet corpus, NOT recommendations.

**Non-goals (do not investigate):**
- No analysis of the user's codebase — external findings only
- No Rust-specific research — focus on JS parser ecosystem (remark, markdown-it, micromark, marked, unified)
- No recommendation rankings

## EXISTING FINDINGS ON THIS TOPIC (from parent worldmodel pass)

- The target pipeline runs `remark-parse` in a server context (`packages/server/` with Hocuspocus).
- `arbitraries.ts` generates documents of 1-5 blocks, max ~100 chars per block — nothing pathological.
- No stack-depth guards or timeout wrappers surveyed around `parseMd`.
- Pipeline has a static 2000-line / 75KB `large-realistic.md` fixture but no PBT-scale or stress-scale coverage.
- No coverage for deeply nested MDX: `<A><B><C>...100 levels...</C></B></A>`.
- From OSS channel: `markdown-rs` uses `cargo-fuzz` and `honggfuzz`; equivalent JS parsers DON'T ship fuzz corpora.
- Fast-check shrinker depends on reasonable input sizes — large-input coverage is an arbitrary gap.

## YOUR RESEARCH TASK

Research two related things:

1. **D6 — Pathological inputs and DoS history:** CVEs, GHSAs, documented stack-overflow bugs, quadratic-blowup findings in the major JS markdown parsers. What classes of pathological input have parsers been vulnerable to?

2. **D7 — Concrete divergence snippets corpus:** Curated markdown snippets that produce different AST across major JS parsers (or between JS and the CommonMark reference implementation). Suitable for lifting directly into a test fixture.

Together these form an edge-case fixture library the parent report can reference.

## DIMENSIONS TO INVESTIGATE

### D6.1 — Published CVEs and GHSAs (P1 Moderate)
- Search GitHub Security Advisories (https://github.com/advisories) for: remark, markdown-it, micromark, marked, unified, commonmark, remark-parse
- CVE databases (cve.mitre.org, nvd.nist.gov) for the same
- What CWE classes appear: ReDoS (CWE-1333), stack exhaustion (CWE-674), integer overflow, prototype pollution?
- Which versions were affected + which versions patched — focus on advisories from 2020+ since earlier patches are likely already rolled into modern versions
- Specific payloads that triggered the issues (if disclosed)

### D6.2 — Deep-nesting and pathological-structure bugs (P1)
- Reports of stack-overflow from deeply nested blockquotes, lists, MDX, or inline emphasis in any JS parser
- Issue tracker searches: `site:github.com remarkjs stack overflow`, `maximum call stack`, `deep nesting crash`
- The `micromark` tokenizer's design (state machine vs recursive descent) — what structure could blow its stack?
- Known mitigations: max-depth parameters, input-size caps, tokenizer state machines. Which parsers expose these knobs?

### D6.3 — Regex backtracking / quadratic patterns (P1)
- Plugin ecosystems (remark-*, rehype-*, markdown-it plugins) have historically had ReDoS vulnerabilities — any catalogued?
- Known pathological inputs like `"a".repeat(10000) + "*"` or `"[".repeat(1000) + "]".repeat(1000)`
- Parser-level vs plugin-level — are the base parsers themselves ReDoS-safe?

### D6.4 — Giant-document scaling (P1)
- Published benchmarks for remark, markdown-it, micromark on 1MB / 10MB / 100MB inputs
- Memory-pressure findings — do any parsers have O(n²) memory growth?
- Real-world incidents from docs sites (Hugo, Jekyll, Gatsby, Next.js with MDX) — has anyone reported markdown parsing causing OOM?

### D7.1 — Babelmark3 divergence mining (P0)
- Babelmark3 (https://babelmark.github.io/) shows cross-parser output for the same markdown input.
- Known pages or threads that surface snippets where parsers disagree — search CommonMark talk forum for "babelmark" threads
- Specific snippet categories known to produce divergence:
  - Emphasis operator precedence: `*foo**bar**baz*`, `***foo***`, `_a_b_c_`
  - Link reference resolution: label matching rules, case folding
  - HTML block vs inline HTML detection
  - Setext heading vs thematic break ambiguity: `---` under text
  - Autolink rules: bare URLs, email-shaped strings
  - List tightness: blank lines inside list items
  - Fenced code block closing: mismatched fence lengths

### D7.2 — CommonMark forum reconciled test vectors (P0)
- `talk.commonmark.org` has threads where specific snippets were discussed and expected behavior agreed upon
- Search for threads with titles like "What should <input> produce?", "Parser X disagrees with Y"
- Extract the agreed reference output where documented

### D7.3 — GFM-specific divergences (P0)
- GitHub's GFM spec (https://github.github.com/gfm/) has its own test cases, but GFM implementations diverge
- Tables, task lists, strikethrough, autolinks — specific divergence examples
- `remark-gfm` vs `@github/markdown-core` vs `markdown-it-task-lists` — known behavioral differences

### D7.4 — Curated snippet corpus (P0)
- Produce a consolidated snippet corpus — 20-40 entries. Each entry:
  ```
  - name: "Triple emphasis ambiguity"
    input: "***foo***"
    divergence: "remark parses as <em><strong>, markdown-it parses as <strong><em>"
    reference_source: <URL of discussion>
    test_family: "emphasis-precedence"
  ```
- Prioritize snippets that are short, reproducible, and have documented reference behavior

## CONSTRAINTS

- All citations must be external primary sources: CVE databases (cve.mitre.org, nvd.nist.gov), GitHub advisories (github.com/advisories), parser issue trackers, talk.commonmark.org, Babelmark3, CommonMark spec
- Do NOT reference sibling fanout directories
- Frame all findings as edge cases affecting THE PARENT'S CURRENT REMARK-BASED PIPELINE TODAY — not hypothetical future Rust port
- Training-data claims flagged as "unverified" — CVE specifics MUST have a real advisory URL
- **Output location:** `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-initial/pathological-inputs-divergence-corpus/`
- **Filename:** `REPORT.md` (uppercase)
- **Evidence files:** in `evidence/` with frontmatter — one file per D6/D7 sub-cluster recommended, plus a standalone `divergence-corpus.md` with the snippet library
- Target: 2500-5000 words. Evidence files longer with snippet inventories.

Depth: deep — D7 is P0 Deep; D6 is P1 Moderate but bundled because bug-tracker research shares surface with divergence mining.
