You are conducting deep technical research as a sub-instance of a larger fanout.

## PARENT REPORT CONTEXT

**Purpose:** What testing techniques should an iron-clad md ⇄ PM TS pipeline carry today to surface latent bugs before a Rust migration?

**Primary question:** What is the landscape of mutation testing applicable to a unified/remark-based TS md ⇄ PM pipeline using fast-check PBT oracles today?

**Stance:** Factual/Landscape (not Conclusions) — layout of options with tradeoffs, NOT recommendations.

**Non-goals (do not investigate these):**
- No analysis of the user's codebase — external findings only
- No Rust-specific pre-work (cargo-mutants, markdown-rs NAPI bindings) — excluded from the rubric
- No broader PBT tooling alternatives — fast-check is pinned
- No recommendation rankings; layout of options + tradeoffs only

## EXISTING FINDINGS ON THIS TOPIC (from parent worldmodel pass)

- The target codebase has `fast-check` v4.6.0 in `packages/app/package.json` and 20+ PBT-oracle tests in `packages/app/tests/fidelity/` (invariant-i1 through i10 + conversion-PBT Chains A/B/C/D in `bridge-observer-conversion.test.ts`).
- PR #213 validated ONE oracle manually via planted-regression (QA-010): injected `text.slice(0, -1)` into `applyFastDiff`'s insert path; PBT caught 5 failures across Chain B and Chain C with shrunk counterexamples `'A'`, `'0\n'`, `'> a\n\n0\n'`. Reverted; 41 tests pass.
- The other ~20 oracles have never been mutation-tested. Whether they catch injected bugs is unknown.
- Stryker-js not in repo; standard TS ecosystem tool per web findings.
- PBT seeds rotation: `PBT_SEEDS = [42, 137, 2718]` with 1000 runs/seed default (scaled 10000 with `STRESS_FIDELITY=1`).

## YOUR RESEARCH TASK

Research the landscape of mutation testing for TypeScript parser/serializer code using Stryker-js (stryker-js/core + typescript-checker plugin) combined with fast-check property-based testing. The target is a round-trip markdown ↔ ProseMirror pipeline with many identity-style oracles (`parse(serialize(md)) === md`), so the mutation-testing research should focus on how mutation testing interacts with this specific oracle shape.

## DIMENSIONS TO INVESTIGATE

### D1.1 — Stryker-js + TypeScript integration (P0)
- `@stryker-mutator/typescript-checker` plugin: what it does, how it filters type-invalid mutants, configuration patterns (stryker.conf.json or .mjs)
- "Mutation switching" (v4+): how Stryker avoids full rebuilds per mutant
- Compatibility with bun test runner (Stryker typically targets jest/vitest/mocha — bun runner compatibility is the key question)
- Real adopter repo configurations (find via github search: "stryker.conf" language:typescript)

### D1.2 — Mutation operators on parser-shaped code (P0)
- Which default Stryker mutators produce highest signal on identity/round-trip oracles (ArithmeticOperator, LogicalOperator, BooleanLiteral, ConditionalExpression, etc.)
- Parser-specific mutations that matter: off-by-one in slicing, string-concatenation reordering, branch inversion in tokenizer switch statements, array-index mutations
- Mutation-score benchmarks for parser/serializer code across published case studies — what's "good coverage" in this domain?
- Where mutations are typically swallowed (equivalent mutants) — regex, constant comparisons, style-only differences

### D1.3 — Runtime cost strategies (P0)
- Incremental mode (`--incremental`, `--since`) — how Stryker detects changed files and skips unaffected mutants
- Diff-only mode for PR runs: `--mutate` with glob filtering against `git diff`
- Sampling strategies: percentage-based, priority-based, dirty-file-only
- CI tier placement patterns: nightly full runs, per-PR diff runs, ad-hoc developer invocation
- Typical wall-clock times for mutation testing on a ~4000-LOC test suite with ~500-LOC parser core

### D1.4 — Interaction with seeded property-based tests (P0)
- Does Stryker re-run fast-check tests with the same seeds per mutant, or re-seed? (Critical for reproducibility of caught mutations)
- Are fast-check's shrunk counterexamples stable across mutants or do they shift?
- How Stryker handles flaky tests — does it mark as timeout or survived?
- Known issues between Stryker and fast-check specifically (search GitHub issues in stryker-js/stryker and dubzzz/fast-check)

### D1.5 — Concrete adopter examples (P0)
- Find 3-5 real repositories applying Stryker to parser/serializer/codec code with evidence files (snippets, configs, CI workflow YAML)
- Blog posts or case studies with mutation-score numbers
- The unified (remark/rehype/retext) and markdown-it ecosystems — do any of them use Stryker? What do they use?
- Cross-check with downloads/stars trends to assess whether Stryker is still maintained and widely adopted in 2026

## CONSTRAINTS

- All citations must be external primary sources (GitHub repos, npm, stryker-mutator.io docs, blog posts with dates, GitHub issues)
- Do NOT reference sibling reports or other fanout directories
- Frame all findings as applicable TO A TS MD↔PM PIPELINE USING fast-check TODAY (not Rust — Rust-specific research is excluded)
- Use `--headless` mode for any nested skill invocations
- Training-data claims MUST be flagged as "unverified" if you cannot find a real source
- **Output location:** Write your report to `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-initial/mutation-testing-ts-parsers/`. This is mandatory.
- **Filename:** The report MUST be named `REPORT.md` (uppercase).
- **Evidence files:** Create evidence files in `fanout/2026-04-19-initial/mutation-testing-ts-parsers/evidence/` with frontmatter — do not put all findings inline in REPORT.md.
- Target report length: 1500-3500 words. Evidence files can be longer with snippets/configs.

Depth: deep — this is a P0 Deep dimension in the parent rubric.
