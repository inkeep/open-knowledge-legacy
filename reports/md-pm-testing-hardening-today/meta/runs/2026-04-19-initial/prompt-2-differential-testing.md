You are conducting deep technical research as a sub-instance of a larger fanout.

## PARENT REPORT CONTEXT

**Purpose:** What testing techniques should an iron-clad md ⇄ PM TS pipeline carry today to surface latent bugs before a Rust migration?

**Primary question:** What is the landscape of differential testing within the JS markdown-parser ecosystem applicable to a unified/remark-based TS pipeline today?

**Stance:** Factual/Landscape (not Conclusions) — layout of options with tradeoffs, NOT recommendations.

**Non-goals (do not investigate these):**
- No analysis of the user's codebase — external findings only
- No Rust-specific pre-work — the question is explicitly "what can we do in JS TODAY" without waiting for a Rust port. The Rust migration is motivation, not research subject.
- Bindings for markdown-rs (NAPI/WASM) are OUT OF SCOPE — the user does not want to invest in that until the Rust port actually happens
- No recommendation rankings

## EXISTING FINDINGS ON THIS TOPIC (from parent worldmodel pass)

- The target pipeline uses `remark-parse` + `remark-gfm` + `remark-frontmatter` + `remark-mdx-agnostic` + `remark-wiki-link` + custom post-parse walker plugins (`pipeline.ts`).
- All fidelity tests use identity oracles (`serialize(parse(md)) === md`) — same parser on both sides of the round trip.
- No differential-testing harness exists (identified as gap U4 in parent worldmodel).
- From OSS channel: `markdown-rs` (wooorm's Rust parser) has a "cross-verified against cmark" harness with 1000+ extra tests asserting behavior against the cmark C reference parser. But the user's stance: markdown-rs bindings are Rust pre-work, excluded. Focus on JS-vs-JS comparison today.
- JS parsers available: `remark-parse` (used), `markdown-it`, `micromark` (wooorm's lower-level JS tokenizer, underlies remark-parse — so may not be independent enough), `marked`.

## YOUR RESEARCH TASK

Research the landscape of differential testing for markdown parsers within the pure-JS ecosystem — running the same input through multiple implementations and comparing outputs to catch bugs in any single parser. Focus on patterns that could be adopted TODAY in a TS/Bun test suite without requiring Rust bindings, WASM modules, or native code dependencies.

## DIMENSIONS TO INVESTIGATE

### D2.1 — Differential harness patterns in the JS markdown ecosystem (P0)
- How do `remark`, `markdown-it`, `micromark`, `marked` cross-validate against each other today?
- Shared corpora: does a community-maintained cross-parser fixture set exist (beyond the CommonMark spec tests)?
- Babelmark3 (https://babelmark.github.io/) as a cross-parser diff tool: how it works, whether it's scriptable, what parsers it covers, whether results are queryable
- Per-parser test vectors reused across implementations — any examples?
- AST shape differences across parsers — do they share an AST dialect (mdast) or diverge?

### D2.2 — CommonMark spec test suite as differential fixture (P0)
- Structure of the CommonMark spec test suite (`commonmark/commonmark-spec` repo): ~652 examples, YAML or JSON format?
- Which parsers run it directly: `commonmark-java`, `commonmark.js`, `markdown-it`, `remark`, `markdown-rs`, `comrak` — how they adapt the fixture
- Extensions: GFM spec tests (GitHub's), MDX, wiki-link — do they have similar fixture suites?
- Running the same CommonMark corpus through remark-parse + markdown-it + micromark simultaneously — is this pattern documented in any real repo?

### D2.3 — AST-diff normalization strategies (P0)
- How projects handle expected-divergence when diffing ASTs: source positions, raw source text attrs, comment handling, whitespace intrinsics, soft-break vs hard-break representation
- Typical AST-diff libraries: `deep-equal`, `jest-diff`, custom mdast normalizers
- Round-trip-by-round-trip comparison: running each parser's output back through each serializer
- Known "always differ" categories across parsers that should be excluded from diff assertions

### D2.4 — Concrete harness examples (P0)
- Real GitHub repos containing a test file that loads 2+ JS markdown parsers and asserts equivalence on a corpus
- Search queries: `"markdown-it" "remark-parse"` in test files, `"compareAst"`, `"astEqual"` in mdast contexts
- Blog posts or conference talks about building cross-parser equivalence harnesses
- If such patterns are rare or absent, document the negative result clearly

### D2.5 — Applicability to fast-check arbitraries (P0)
- Can arbitraries generate markdown → feed both remark and markdown-it → assert AST equivalence? What's the cost?
- Precedent for PBT + differential testing in any domain (regex, JSON parsers, CSS parsers, etc.) — transferable patterns
- Shrinker behavior when divergence is found: does fast-check shrink to minimal divergent input?
- AST representation differences that need pre-normalization vs. divergences that are real bugs

## CONSTRAINTS

- All citations must be external primary sources (GitHub repos, npm, talks.commonmark.org, blogs, parser issue trackers)
- Do NOT reference sibling fanout directories
- Frame all findings as applicable TO A TS MD↔PM PIPELINE USING remark + fast-check + bun TEST TODAY — JS-only, no Rust, no WASM
- Training-data claims flagged as "unverified" if no real source
- **Output location:** `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-initial/differential-testing-js-parsers/`
- **Filename:** `REPORT.md` (uppercase)
- **Evidence files:** in `evidence/` with frontmatter
- Target: 1500-3500 words, evidence files longer

Depth: deep — P0 Deep in the parent rubric.
