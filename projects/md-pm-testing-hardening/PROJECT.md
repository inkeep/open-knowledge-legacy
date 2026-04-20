# Project: Harden md ⇄ PM pipeline testing ahead of Rust bridge migration

**Last verified:** 2026-04-19
**Traces to:** Research report at [`reports/md-pm-testing-hardening-today/REPORT.md`](../../reports/md-pm-testing-hardening-today/REPORT.md) (1514 lines, audit-resolved 2026-04-19); user-stated goal from conversation: "make our stuff iron clad for when we do [Rust bridge migration]"
**Appetite:** Unbounded — drive to iron-clad, evidence-based. Standing principle for this greenfield project: "no deferred tech debt, optimize for what two staff engineers would decide is architecturally correct, clean codebase that sets or fixes precedents, best product experience without over-engineering. Don't optimize for expediency / scope / pragmatism that isn't well-justified."

## Strategic context

### SCR

**Situation.** The TS md⇄PM pipeline (unified/remark + custom handlers + `@tiptap/y-tiptap` + `@handlewithcare/remark-prosemirror`) has a 4410-LOC fidelity test suite — 20+ property-based test oracles (invariants I1–I10 + unknown-mdast guard), 19/19 CommonMark spec sections idempotent, PR #213's `bridge-observer-conversion.test.ts` covering Chain A/B/C/D of the server-authoritative observer bridge, and a two-script measurement system (`measure-fuzz.sh`, `measure-stress.sh`) producing a JSONL residual-evidence trail. All current PBT oracles are same-parser identity checks (`serialize(parse(md)) === md`). No mutation-testing baseline exists. No cross-parser differential check exists. Arbitraries generate `\n`-only line endings with ASCII-only link/wiki targets; BOM / CRLF / tab / non-ASCII edge classes are uncovered despite documented CommonMark-community divergence on all four (see research report §III). Plugin dependencies (remark-html, mdast-util-to-hast, DOMPurify) carry published CVEs (CVSS up to 10.0) and are untracked against GHSA. Pipeline bugs currently can't be bisected to a layer — every test composes md→mdast→PM JSON→Y.XmlFragment.

**Complication.** A Rust bridge migration will replace `md↔mdast` with markdown-rs + vendored `mdast_util_to_markdown` while keeping `mdast↔PM` in JS (`@handlewithcare/remark-prosemirror`, per Rust bridge SPEC NG3). If the TS side enters Rust equivalence testing with oracles that are only provably self-consistent — never provably sensitive to injected bugs, never cross-validated against an independent parser, never exposed to the edge-case classes the CommonMark community has catalogued — the equivalence suite becomes "silent pass on silent coverage." Existing JS bugs migrate to Rust invisibly; new Rust divergences can't be distinguished from pre-existing JS latent bugs. The Rust migration degrades from a confident layer swap into a step into uncertainty. Independent of Rust, the same weak-oracle problem means the bridge-correctness spec's `mergeThreeWay` content-preservation post-condition is validated against the same JS parser that produced the content — a self-referential check that can't catch parser-level correctness drift.

**Resolution.** Drive the TS md⇄PM test infrastructure to iron-clad. Iron-clad means every claim the test suite makes is evidence-backed: every oracle is demonstrably load-bearing (mutation-score baseline with surviving-mutant remediation), every known ecosystem edge case has a fixture with explicit expected behavior (lift the 28-whitespace + 59-divergence corpora; implement BOM/CRLF/tab/wiki-link-URL policy decisions), every cross-parser behavior we depend on is validated (remark + markdown-it + micromark differential harness), every plugin dependency is audited against GHSA, every architectural decision the research surfaced is made explicitly with evidence rather than inherited as a silent default, and every pipeline layer has isolated tests so bugs are bisectable to their originating seam. The Rust migration then lands against a known-strong oracle, and the bridge-correctness guarantees stop being self-referential.

### Multi-dimensional value

**Customer / product.** End-user markdown in Open Knowledge is trusted across the real ecosystem of sources — CRLF files from VSCode-on-Windows don't silently corrupt; BOM-prefixed imports from Word don't break frontmatter detection; tab-containing content behaves deterministically; non-ASCII content in wiki-link targets round-trips per a documented policy. The round-trip claim is truthful rather than "tested only on the narrow inputs our arbitraries generate." **AND** — the entire Open Knowledge positioning ("your files stay yours in git") rests on the pipeline's fidelity claim; investing ahead of user-visible failure is the staff-engineer posture because discovering fidelity bugs post-launch via user reports is much more expensive than surfacing them via tests.

**Platform / technology.** The md⇄PM pipeline is the backbone of Observer A and Observer B in the server-authoritative bridge. Its correctness is load-bearing for CRDT convergence, paired-write integrity, agent write paths, and the `bridge-correctness` spec's `mergeThreeWay` content-preservation post-condition (which can only mean something if the inputs it operates on are themselves correct). **AND** — the pipeline is exactly the seam the Rust bridge migration cuts along; this project's oracle-strength work becomes the Rust equivalence-test oracle strength. **BUT** — current oracles are structurally unable to catch a whole class of bugs: any bug where the parser systematically mis-normalizes in a reversible way (BOM strip-that-should-preserve, tab expansion drift, CRLF collapse) passes identity round-trip oracles silently. Differential harness + fixture corpora close that structural gap.

**Internal / engineering.** Sets the precedent for how testing is done in this greenfield codebase. Stryker + differential harness + layer-isolated tests + policy documents + audit scripts become the template the rest of the codebase is held to. "Staff-engineer correctness" becomes a testable claim — mutation score, cross-parser agreement, explicit policy docs, evidence artifacts — rather than an asserted aesthetic. **AND** — the differential harness architecture, if designed to accept any mdast-producing parser, becomes the scaffolding for Rust equivalence testing once the port lands; no new harness needed when markdown-rs drops in.

**GTM.** Weakly connected. A markdown platform that can't handle BOM-prefixed or CRLF files from Windows users at launch is a credibility liability once users hit it. Not the forcing function, but a visible risk to the "works with real markdown" positioning.

**Intersection reasoning.** Customer correctness (markdown fidelity) depends on platform correctness (bridge reliability) depends on internal correctness (oracle strength). One investment, three value streams that strengthen together. The Rust migration is the forcing function that binds them — iron-clad TS today means Rust port confidence tomorrow AND customer correctness today AND bridge reliability today.

### Iron-clad gate (definition of done for this bet)

Five concrete gates, each evidence-backed:

1. **Oracle-strength baseline.** Mutation-score baseline captured for the md⇄PM pipeline via a one-off `measure-mutation.sh` script. Every surviving mutant is either killed by a new test or documented as an equivalent mutant with evidence. Baseline is a committed JSONL artifact (matching the `residual-measurements.jsonl` precedent from PR #213), re-runnable by any developer.
2. **Edge-case fixture coverage.** Every entry in the research report's Appendix A (28-vector whitespace corpus) and Appendix B (59-snippet cross-parser divergence corpus) is present as a fidelity fixture with documented expected behavior. The fixtures run inside the existing in-PR `test:fidelity` tier.
3. **Cross-parser differential validation.** remark + markdown-it + micromark are run against the CommonMark spec corpus (and optionally GFM spec) via a differential harness wired into the existing in-PR `test:fidelity` tier. Documented expected divergences are explicit allowlist entries; unacknowledged divergence fails the test. Harness architecture accepts any mdast-producing parser so the Rust port plugs in later with no harness changes.
4. **Plugin security posture.** Plugin security audit runs via a one-off `audit-plugins.sh` utility script checking current plugin versions (remark-html, mdast-util-to-hast, DOMPurify, markdown extension chain) against GHSA. Audit result at project completion is a committed evidence artifact with status per-plugin; no published advisory affecting the pipeline is unpatched without documented rationale.
5. **Architectural policy documentation with tests.** BOM, CRLF, tab, and wiki-link-URL-encoding handling decisions are documented as explicit policies (`docs/pipeline-policies.md` or equivalent) with evidence-backed rationale for each choice. Each policy is backed by tests in the fidelity tier demonstrating the stated behavior. Pipeline bugs are bisectable to a layer (md↔mdast, mdast↔PM, PM↔Y.XmlFragment) via isolated test suites, so policy failures point at the right code surface.

### Bet-level non-goals

Temporal tags per `decision-taxonomy.md`:

- **NEVER in this project:** Rust-specific implementation (cargo-mutants setup, markdown-rs NAPI packaging, JS↔Rust differential runner, equivalence-test fixtures for markdown-rs). Those belong to the Rust bridge project. This project's differential harness *architecture* must accept any mdast-producing parser so Rust plugs in later, but does not integrate that port.
- **NEVER in this project:** Stryker or mutation testing on non-pipeline code (UI, MCP server, CLI, server observer logic outside the pipeline). The precedent is set here; propagation to other modules is a separate decision.
- **NEVER in this project:** Scheduled / nightly / cron-based CI tiers. Matches the architectural precedent established by PR #213 (CI signal quality): deterministic testing in the existing in-PR fidelity tier; anything non-deterministic, expensive, or measurement-oriented lives as a one-off developer-invocable script with a committed JSONL / Markdown evidence artifact. No new scheduled infrastructure.
- **NOT UNLESS evidence changes:** Coverage-guided fuzzing for micromark. Research evidence (report §IV.8, followup FU2): IJON-style transition-pair instrumentation has no JS port; standard JS coverage tools (c8, nyc, V8 Inspector, Jazzer.js Babel) miss the state-pair edges that matter for a state machine; Zest 2019 empirics show plain byte-mutation CGF does not beat smart generators on tokenizer-stage coverage anyway. This is evidence-based not-doing, not deferral. Revisit condition: a JS port of IJON-style transition instrumentation emerges, OR PBT + Stryker + differential surface gaps that only CGF could plausibly close.
- **NOT UNLESS customer-facing behavior demands it:** Byte-identity CRLF preservation. `mdast-util-to-markdown` has no `lineEnding` option; this is a deliberate design choice reflecting the CommonMark §2.1 equivalence rule. The architecturally correct oracle is AST-equivalence, not byte-identity. A CRLF-preserving post-processor would be a custom layer with no CommonMark mandate backing it. What IS in scope: documenting the AST-equivalence choice as an explicit policy with tests. What's out of scope: building a post-processor that reconstructs original line endings unless a concrete user-visible failure demands it.

## Items

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|---|---|---|
| D1 | Bet scope: one bet (not two), unbounded appetite, evidence-based, no deferred tech debt | Strategic | P0 | Decided | User directive 2026-04-19. See Strategic context § SCR. |
| D2 | No scheduled / nightly / cron-based CI; in-PR deterministic tier + one-off scripts with committed evidence artifacts | Architectural | P0 | Decided | User directive 2026-04-19. Matches PR #213 precedent. See CC5. |
| D3 | Rust-specific implementation work excluded from this project; harness architecture must be Rust-compatible | Architectural | P0 | Decided | User directive earlier in conversation. See bet-level non-goals. See CC3. |
| D4 | Coverage-guided fuzzing for micromark excluded (evidence-based not-doing, not deferral) | Technical | P0 | Decided | Research followup FU2 §IV.8. Revisit conditions documented in non-goals. |
| D5 | Byte-identity CRLF preservation excluded unless customer-facing failure observed; AST-equivalence is the oracle | Architectural | P0 | Decided | `mdast-util-to-markdown` no `lineEnding` option by design; CommonMark §2.1 equivalence rule backs AST-equivalence. See non-goals. |
| D6 | Stryker mutation testing delivered as a one-off script + JSONL evidence artifact, not a CI gate | Architectural | P0 | Decided | Derived from D2 + CC5. Precedent: PR #213 `measure-fuzz.sh`. |
| D7 | Plugin security audit delivered as a one-off script + committed audit artifact, not a scheduled workflow | Architectural | P0 | Decided | Derived from D2 + CC5. |
| D8 | Differential harness runs inside existing in-PR `test:fidelity` tier (if deterministic and fast enough) OR as one-off script; no new CI tier | Architectural | P0 | Decided | Derived from D2 + CC5. Fast-enough-check is part of implementation story. |
| D9 | BOM handling policy = strip-on-input at pipeline boundary | Architectural | P0 | Decided | Firmness: revisable if user-visible failure observed. Rationale: (a) collapses the micromark string-vs-stream divergence (report §III.1) by normalizing input modes before parsing; (b) CommonMark is silent so there's no spec violation; (c) users importing BOM-prefixed files (Word, VSCode-with-BOM setting, PowerShell redirects) expect invisible handling. Counter-argument (preserve mid-text BOMs as content) is weak without evidence of users intentionally embedding U+FEFF. |
| D10 | Tab handling policy = fenced-output is canonical (`mdast-util-to-markdown` default `fences: true`) | Architectural | P0 | Decided | Firmness: LOCKED. Rationale: (a) fenced code blocks are the modern markdown norm that writers produce; (b) `fences: true` is the `mdast-util-to-markdown` default for a reason; (c) indented-code-blocks are a legacy CommonMark construct; normalizing to fenced on round-trip is architecturally defensible. The tradeoff — lossy transformation of imported files using tab/indent syntax — is acceptable because indented → fenced is semantically equivalent (same code block, different marker). |
| D11 | Mutation-score acceptance bar = "every non-equivalent mutant killed, remaining documented as equivalent" (no percentage target) | Technical | P0 | Decided | Firmness: LOCKED. Rationale: a percentage gate (80%, 90%) is consensus-knowledge. A greenfield pipeline under staff-engineer correctness gets held to "kill everything that can be killed." Sentry's 0.62 is a multi-package SDK baseline; parser code with `ignoreStatic: true` and the identity-oracle shape should push substantially higher. The bar is a pattern (kill-or-document), not a number. |
| Q3 | Wiki-link-URL-encoding policy for non-ASCII targets | Architectural | P0 | Exploring | Research report noted arbitraries use ASCII-only `safeWord`. Non-ASCII wiki-link targets (`[[Москва]]`, `[[München]]`) are unexercised. `remark-wiki-link` behavior not directly investigated yet. Decision deferred to story S10 where `remark-wiki-link` source will be read. |
| Q4 | Layer boundaries for isolated tests — md↔mdast, mdast↔PM, PM↔Y.XmlFragment granularity | Technical | P0 | Exploring | Worldmodel U1+U2 identified both as absent. Decision on whether mdast↔PM splits further into node-handler vs mark-handler sub-suites. Deferred to stories S11–S13. |
| A1 | `stryker-mutator-bun-runner@0.4.0` is stable enough to pin exactly | Technical | P0 | Assumed | HIGH confidence from FU1 source-read 2026-04-19. If flaky in practice, fallback to Option 3b hybrid per report §I.6. Verification: actually run Stryker against a test suite. |
| A2 | Differential harness runtime on CommonMark corpus (652 examples × 3 JS parsers) is fast enough for in-PR CI | Technical | P0 | Assumed | Estimate from parser throughput data in report IV.4 (markdown-it 986 ops/s, marked 729, commonmark.js 709, micromark 229). Verification: measure actual harness runtime in a prototype. If slower than budget, falls back to one-off script. |
| A3 | bun-runner 0.4.0 "2-3× vs Node" claim holds on parser-shaped suites | Technical | P2 | Assumed | Maintainer-self-report; not independently validated. Informs Option-1-vs-Option-3 economic analysis in report §I.6. Verification would be a one-off `measure-bun-runner.sh` benchmark — but the outcome doesn't change the bet, only the implementation path. P2 because not strategically load-bearing. |

## Cross-cutting concerns

These aren't stories; they're dependencies or constraints that thread through multiple stories.

### CC1 — Shared fidelity test harness infrastructure

**What:** `packages/app/tests/fidelity/helpers.ts` (PBT seed rotation `[42, 137, 2718]`, `NUM_RUNS`, `PBT_TIMEOUT_MS`, `STRESS_FIDELITY` env switch, `mdRoundTrip`, `normalize`), `arbitraries.ts` (60+ markdown-construct generators).

**Touches:** Every story that adds or modifies fidelity tests (edge-case fixtures, differential harness, policy tests, layer-isolated tests).

**Constrains:** Any story changing these must preserve existing PBT determinism (3-seed × 1000-run rotation must stay reproducible). Extensions to arbitraries must compose cleanly with the existing block/mark/MDX/wiki-link generators, not replace them.

### CC2 — Measurement-script infrastructure

**What:** `packages/app/scripts/_measure-lib.sh` (flock-based atomic JSONL append with stale-lock recovery, portable epoch-ms, jq + git pre-flight, host detection), JSONL schema from PR #213 (`timestamp`, `commit`, `script`, `seedCount`, `seedsFailed`, `rate`, `invokedBy`, `context`, `failingSeeds`, `durationMs`, `host`, `bunVersion`, `extra`), residual-evidence log at `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl`.

**Touches:** All one-off measurement/audit scripts this project adds (`measure-mutation.sh`, `audit-plugins.sh`, optional `measure-bun-runner.sh`).

**Constrains:** New scripts must source `_measure-lib.sh` for atomic JSONL append (no reinventing flock or mutex fallback), conform to the JSONL schema (new fields go in `extra`, not top-level), and produce evidence logs in a parallel directory structure (e.g., `projects/md-pm-testing-hardening/evidence/*.jsonl`). This sets the precedent: every measurement-style deliverable in this project follows one pattern.

### CC3 — Rust-migration forward compatibility

**What:** The differential harness and the layer-isolated test split must be designed so markdown-rs (or any alternative mdast-producing parser) drops in without architectural rework.

**Touches:** Differential harness story (directly); layer-isolated tests story (the md↔mdast layer is the Rust-swap boundary); fixture stories (fixtures should be parser-agnostic YAML/JSON, not remark-specific test code).

**Constrains:** Harness interfaces must accept `(input: string) => mdast` as the parser contract — not `remarkProcessor.parse(...)` directly. Fixture entries declare `expected_behavior` in parser-agnostic terms, not remark AST shapes. This is load-bearing for the Rust project landing cleanly.

### CC4 — Greenfield precedent-setting

**What:** Every artifact this project produces becomes a template: the mutation-score workflow (how we run Stryker, where we commit the JSONL, how we document equivalent mutants), the audit script shape (how we check plugin CVEs), the policy-document format (how we write `docs/pipeline-policies.md`), the layer-isolated test convention (directory structure, naming).

**Touches:** All stories. Each story produces not only a deliverable but also a reusable pattern.

**Constrains:** Implementation choices must be generalizable. A hack-fix that works only for md⇄PM is a debt; a template that can be copied to schema, extensions, MCP server, etc., is the correct output. Staff-engineer correctness means "the right shape," not "a shape that works here."

### CC5 — Testing-infrastructure simplicity

**What:** No new scheduled / nightly / cron-based CI. Deterministic testing fits in the existing in-PR `test:fidelity` tier; anything else is a one-off developer-invocable script with a committed evidence artifact. Matches PR #213 precedent (fuzz + stress moved from CI to `measure-fuzz.sh` / `measure-stress.sh`).

**Touches:** Every story that could plausibly become a CI workflow.

**Constrains:** When a story produces something expensive or non-deterministic (Stryker, bun-runner benchmarking), the story's output is a script + evidence artifact, not a GitHub Actions workflow. When a story produces something deterministic and fast (differential harness, fixture coverage, layer-isolated tests, policy tests), it integrates into the existing `bun run test:fidelity` rather than spawning a new tier.

## Outcomes (Phase 1 output — decompose into stories in Phase 2)

Six outcomes define "iron-clad" per the gate stated in Strategic context. Each decomposes into 1–4 stories below. All six pass the quality gate (named beneficiary + observable change + beneficiary distinct from system being built).

| # | Outcome (what's true when we're done) | Beneficiary | Observable change from today |
|---|---|---|---|
| O1 | Oracle strength is measured and evidence-backed | Engineer modifying the pipeline | `bash scripts/measure-mutation.sh` produces a mutation-score JSONL; committed baseline shows every surviving mutant killed or documented as equivalent. Today: no mutation data. |
| O2 | Known ecosystem edge cases have explicit fixtures and pass | User importing markdown from any real-world source; engineer maintaining the pipeline | `tests/fidelity/` contains fixtures covering all 28 whitespace vectors + 59 divergence snippets + a real-world external corpus, each with documented expected behavior. Today: ASCII-only `\n`-only arbitraries. |
| O3 | Cross-parser differential validation runs on the CommonMark corpus | Engineer modifying normalization or handler logic; future Rust-migration owner (same scaffolding) | `bun run test:fidelity` includes remark + markdown-it + micromark agreement check on CommonMark (and GFM) corpus with explicit divergence allowlist. Today: every test uses remark on both sides. |
| O4 | Plugin security posture is audited and documented | Engineer making dependency decisions; security reviewer | `bash scripts/audit-plugins.sh` produces committed audit artifact; no used plugin has an unpatched advisory without documented rationale. Today: plugin CVE tracking not done. |
| O5 | Architectural policies are documented with tests | Engineer reasoning about pipeline behavior; user expecting specific behavior | `docs/pipeline-policies.md` documents BOM / CRLF / tab / wiki-link-URL handling explicitly; each policy backed by fidelity tests. `corpus-commonmark.test.ts` `SKIP_SECTIONS` carries a policy reference. Today: silent defaults. |
| O6 | Pipeline bugs are bisectable to their layer | Engineer debugging; future Rust-migration planner (knowing which tests apply to swapped layer) | `tests/fidelity/` has explicit sub-suites for md↔mdast, mdast↔PM, PM↔Y.XmlFragment; a fidelity failure indicates which layer. Today: every test composes the full pipeline. |

## Stories

Fourteen stories decompose the six outcomes. Each story follows project-grade format: What to build (1-3 sentences), Value (multi-dimensional intersection), Constraints, Lateral connections, Forward connections.

### Phasing overview (see end of section for Now / Next / Later rationale)

**Now** (7 stories, unblock everything downstream): S4, S7, S8, S9, S11, S12, S13
**Next** (5 stories, depend on Now): S1, S3, S5, S6, S10
**Later** (2 stories, depend on Next): S2, S14

Dependency graph:

```
          Foundations (Now — parallel-safe, no inter-dependencies)
          ┌──────────────────────────────────────────────────────────┐
          │  S11 (md↔mdast layer)   S12 (mdast↔PM layer)             │
          │  S13 (PM↔Y.XmlFragment verify)                           │
          │  S4 (divergence corpus) S7 (BOM) S8 (CRLF) S9 (tab)      │
          └─────────┬──────────────┬──────────┬─────────────┬────────┘
                    │              │          │             │
                    ▼              ▼          ▼             ▼
                  S1         S3 (whitespace)  S5           S10 (wiki-link policy)
               (Stryker)       fixtures     (differential    +  S6 (plugin audit)
                    │                       harness)         (parallel, standalone)
                    ▼
                   S2 ────────────────► S14 (real-world corpus)
             (mutant remediation)    (Later — needs all prior)
```

Within each phase, stories below are ordered by outcome (O1→O2→O3→O4→O5→O6) for discoverability, not execution order — parallelization decisions happen inside each phase.

### O1 stories — Oracle strength

#### S1 — Stand up Stryker on the md⇄PM pipeline

**What to build (1-3 sentences):** Install `@stryker-mutator/core@^9` + `stryker-mutator-bun-runner@0.4.0` (exact pin) in `packages/app`. Configure to mutate `packages/core/src/markdown/pipeline.ts` + `packages/core/src/bridge/*.ts` + handler files. Wire a `packages/app/scripts/measure-mutation.sh` utility (sourcing `_measure-lib.sh` per CC2) that runs Stryker with `coverageAnalysis: "perTest"` + `ignoreStatic: true` and appends a JSONL record per run to `projects/md-pm-testing-hardening/evidence/mutation-measurements.jsonl`.

**Value:** Establishes the oracle-strength baseline infrastructure (internal precedent — CC4) AND sources the evidence artifact that drives S2 remediation (customer: oracle-caught bugs don't reach users) BUT must use the one-off-script pattern from CC5/D2 rather than a scheduled CI tier. Intersection: the measurement infrastructure is itself the architectural deliverable; staff-engineer correctness means the pattern is reusable for any module (handlers, schema, extensions) that wants mutation coverage later.

**Constraints:** Must use `stryker-mutator-bun-runner@0.4.0` exact pin (A1 assumption, D6 decision). Must source `_measure-lib.sh` for JSONL atomic append (CC2). JSONL schema stays identical to PR #213's precedent; Stryker-specific fields go in `extra`. fast-check seeds must be explicitly pinned (research §I.4 / stryker-js#5714 history) to avoid mutant-label flakiness.

**Lateral:** Depends on S11+S12 for layer-isolated tests (mutation needs meaningful test files to kill mutants); if layer-isolated tests are late, Stryker can run against composite tests with lower signal. CC2 (shares measurement infrastructure with S6 plugin audit). Forward: S2 remediation consumes this baseline.

**Forward:** Sets the precedent other modules (schema, MCP, extensions) can copy. The `measure-mutation.sh` shape becomes the template for any future mutation-testing work.

#### S2 — Drive fidelity suite to zero non-equivalent surviving mutants

**What to build:** For every mutant surviving the S1 baseline, either (a) add or sharpen a test that kills the mutant, or (b) document the mutant as equivalent with written rationale in a committed `evidence/equivalent-mutants.md` file (one entry per mutant: file, line, mutator, why-equivalent). Re-run `measure-mutation.sh` after each remediation pass; append the improved JSONL. Done when the JSONL shows zero non-equivalent surviving mutants.

**Value:** Transforms the fidelity suite from "asserts round-trips compose" to "asserts round-trips detect injected bugs" (platform correctness — the bridge-correctness spec's post-conditions become non-self-referential). AND trains the test-writing discipline on parser-shaped code (internal: every test that survives a mutant is a test that matters). BUT the surviving mutant list may include semantically-equivalent mutations that no amount of test work will kill; these must be documented with rigor, not hand-waved.

**Constraints:** Must not add tests that lock implementation details to pass mutation testing (red flag for coupling to implementation vs behavior — cf. /tdd principle). Must not `excludeMutations:` on files just to lift the score; equivalent mutants are documented individually.

**Lateral:** CC1 (fidelity test harness) — test additions must compose with existing PBT seed rotation. D11 (mutation-score bar) — remediation completes when zero non-equivalent survive, not at a percentage.

**Forward:** Every test added for mutation-killing becomes regression protection for the layer under test. The `evidence/equivalent-mutants.md` artifact becomes a living design doc about parser-code mutation patterns.

### O4 stories — Plugin security posture

#### S6 — Plugin security audit script + committed baseline audit

**What to build:** `packages/app/scripts/audit-plugins.sh` that (a) enumerates every plugin in the pipeline dependency tree (remark extensions, mdast utilities, `@handlewithcare/remark-prosemirror`, `@tiptap/y-tiptap`, DOMPurify if present, any HTML rendering deps), (b) queries GHSA for each package+version combination, (c) writes a Markdown audit report to `projects/md-pm-testing-hardening/evidence/plugin-audit-YYYY-MM-DD.md` with status per-plugin (patched / vulnerable with documented rationale / no-advisory). First run produces the baseline audit at project start; the script is re-runnable on demand whenever deps are bumped.

**Value:** Closes the security-posture gap the research report §IV.1 surfaced (9 of 20 published CVEs are ReDoS; `remark-html` CVSS 10.0; `mdast-util-to-hast` Dec 2025 injection; DOMPurify 4 advisories 2024-2026) — customer: users' markdown isn't being processed by a library with known unpatched exploits. AND establishes the one-off-audit-script pattern (internal — CC4) for any future security-posture check. BUT must run against the actual dep tree, not just top-level deps; transitive deps are where most CVEs live.

**Constraints:** Must use `gh api` or `npm audit --json` for GHSA data; no reinventing advisory lookups. Must not gate CI (CC5/D2 — this is a one-off script). Output format must be git-diffable (Markdown with stable structure, not JSON with changing field order) so dep bumps show audit deltas in PRs.

**Lateral:** CC2 (script infrastructure — sources `_measure-lib.sh` conventions even though it's not strictly a measurement script). CC4 (precedent for security-posture audits on any module).

**Forward:** Pattern copies to MCP server, CLI, UI deps. The audit report format becomes the `docs/security-posture/` template.

### O2 stories — Edge-case fixture coverage

#### S3 — Lift 28-vector whitespace fixture corpus

**What to build:** Create `packages/app/tests/fidelity/fixtures/whitespace-corpus.yaml` containing all 28 entries from research report Appendix A (8 BOM + 10 line-ending + 10 tab vectors). Each entry: `name`, `input` (literal markdown), `expected_behavior` (prose description per our policies D9/D10 and CRLF policy from S8). Add `packages/app/tests/fidelity/whitespace-corpus.test.ts` that loads the YAML and runs each vector through `parseMd` + `serializeMd`, asserting expected behavior (round-trip identity OR normalized-form equality OR documented-divergence allowlist entry).

**Value:** Customer: every whitespace edge case the CommonMark community catalogued is now exercised against our pipeline, with explicit expected behavior — no more silent drift. AND the fixture file is YAML-parseable data, not code (internal/forward — CC3: the Rust port's equivalence suite can consume the same YAML directly). BUT the `expected_behavior` field is meaningful only against documented policies (D9 BOM, D10 tab, S8 CRLF) — so this story depends on S7/S8 landing first or in parallel.

**Constraints:** YAML schema must match the research report Appendix A format (`name`, `input`, `expected_behavior`, optional `parsers_known_to_diverge`, optional `source`). Must preserve exact input bytes — YAML block scalars + literal-block indicators to avoid whitespace munging. Test must iterate all 28 entries; skipping any requires a `skip_reason:` field on the YAML entry plus a linked issue.

**Lateral:** S7 (BOM policy — shapes the expected behavior for BOM entries). S8 (CRLF policy — shapes line-ending entries). S9 (tab policy — shapes tab entries).

**Forward:** The YAML-as-fixture pattern becomes the template for any future fixture lift (e.g., from upstream CommonMark bug reports or user-submitted edge cases). S4 follows the same pattern.

#### S4 — Lift 59-snippet cross-parser divergence fixture corpus

**What to build:** Create `packages/app/tests/fidelity/fixtures/divergence-corpus.yaml` with all 59 entries from research report Appendix B, organized by `test_family` (emphasis 7, links 6, html-blocks 4, setext-vs-hr 2, autolinks 11, lists 5, fenced-code 4, code-spans 1, hard-breaks 3, gfm-strikethrough 3, gfm-tables 7, gfm-tasks 3, disallowed-html 3). Each entry: `name`, `input`, `divergence` (prose describing which parsers produce what output), `spec_ref` (URL to CommonMark forum / cmark-gfm issue / etc.). The YAML itself is pure data; the consuming test is part of S5 (differential harness consumes this corpus as its allowlist input).

**Value:** Internal: a parser-agnostic fixture corpus is the correct primitive (CC3 — Rust port consumes the same YAML with no changes). AND it decouples corpus curation from harness implementation — if the harness is reshaped later, the corpus survives. BUT it has no intrinsic value until S5 consumes it; this story is pure curation.

**Constraints:** YAML schema must match research report Appendix B format. Per-entry `divergence` field describes EXPECTED divergence across named parsers — this is the allowlist; anything not matching is caught as a regression. Must not convert snippets to "just pick one parser's behavior as canonical" — the point is that divergence is documented, not resolved.

**Lateral:** Feeds S5 directly.

**Forward:** Rust-port differential-testing consumes this corpus verbatim.

#### S14 — Real-world external-corpus fidelity test

**What to build:** Curate a corpus of real-world markdown from external sources: ~100 READMEs from popular GitHub projects (`react`, `typescript`, `bun`, `next.js`, etc.), ~50 MDX files from docs sites (Fumadocs, Mintlify examples), ~50 Obsidian-vault exports from public vaults. Store as fixture data in `packages/app/tests/fidelity/fixtures/real-world-corpus/` (one file per sample, keyed by source URL + commit SHA for reproducibility). Add `real-world-corpus.test.ts` that iterates every file and asserts (a) parse succeeds without crash, (b) AST-level round-trip identity (`parse(serialize(parse(input))).toString() === parse(input).toString()` modulo documented policies), (c) no plugin falls back silently.

**Value:** Customer: the pipeline's behavior on actual real-world markdown is measured, not inferred from generated arbitraries. AND exposes the pipeline to long-tail structure that arbitraries don't generate (extreme nesting, pathological MDX, empty frontmatter, nested blockquote-list-code-emphasis chains) (internal: catches bugs `arbitraries.ts` structurally misses). BUT "real-world" is a moving target — the corpus must be snapshotted (committed as test fixtures) not live-fetched, or tests become non-deterministic.

**Constraints:** Fixtures must be committed (not live-fetched) with source URL + commit SHA metadata for provenance. Licensing must be audited — only MIT/Apache/CC-BY or similar permissive markdown content; GPL README content excluded. Corpus size should be bounded (~1-5MB total; 200 files @ ~5-50KB each) so test time stays reasonable.

**Lateral:** CC1 (extends fidelity test harness). Policy stories (S7-S10) — real-world corpus will exercise BOM, CRLF, tab, non-ASCII wiki-link behavior at scale.

**Forward:** Extending the corpus is a continuous job for future test hardening. The snapshot-fetch + license-audit pattern becomes the template.

### O3 stories — Cross-parser differential validation

#### S5 — Build JS-vs-JS differential harness with divergence-corpus allowlist

**What to build:** Implement `packages/app/tests/fidelity/differential-harness.ts` that runs a given markdown input through `remark-parse`, `markdown-it`, and `micromark` (and accepts any `(input: string) => mdast | html` parser via a plug-in interface per CC3). For each input, compare normalized-HTML output (using `markedjs/html-differ` or equivalent — research report §II.3 identifies normalized-HTML as the canonical cross-parser oracle). Load the CommonMark 0.31.2 spec test corpus (652 examples) + optionally GFM spec corpus as inputs. Consume S4's `divergence-corpus.yaml` as the explicit allowlist — divergences listed in the corpus are expected; undocumented divergence fails the harness. Wire into `bun run test:fidelity` if runtime budget (measure first) allows in-PR tier; otherwise package as `scripts/run-differential.sh` one-off with committed evidence artifact.

**Value:** Platform: closes the structural gap the research §II surfaced (no public repo runs ≥2 JS parsers against shared inputs for equivalence) — we're first. Catches bugs where our pipeline's normalization drifts from CommonMark+majority-JS consensus. AND the parser-agnostic interface means markdown-rs plugs in during Rust migration with no harness changes (CC3 — the Rust equivalence suite re-uses this harness directly). BUT the runtime is load-bearing: if 652 examples × 3 parsers × HTML-diff exceeds a reasonable in-PR budget (~30s), it drops to one-off script status per D8 — which weakens the "drift caught immediately" guarantee.

**Constraints:** Parser interface must be `(input: string) => { ast: mdast | null; html: string; error?: Error }` — no remark-specific types. Divergence allowlist consumption must happen via YAML load, not code (S4's artifact is the source of truth). Runtime measurement is part of the story: prototype against 652 examples, measure on CI runner hardware (not local laptop), decide in-PR vs one-off based on budget.

**Lateral:** Consumes S4. Shares fidelity-tier integration with S3 if both run in `test:fidelity`.

**Forward:** Rust migration's equivalence suite consumes this harness directly — the only change is adding markdown-rs as a fourth parser. GFM spec corpus support extends to `remark-gfm`, `markdown-it + gfm-tables`, `micromark-extension-gfm`.

### O5 stories — Architectural policies documented with tests

#### S7 — BOM handling policy: strip-on-input, documented + tested

**What to build:** Add BOM stripping at the pipeline input boundary in `parseMd` (strip a single leading U+FEFF before any other processing; do not strip mid-text BOMs in the initial implementation). Document the policy in `docs/pipeline-policies.md` (or `ARCHITECTURE.md` if that's the project convention) with rationale citing research report §III.1 evidence (CommonMark silent, micromark string-vs-stream divergence collapsed by normalizing input, BOM-prefixed Word/VSCode/PowerShell imports are the common case). Add fidelity tests in `whitespace-corpus.test.ts` (S3) asserting: (a) `"\uFEFFheading"` parses as `heading` (BOM stripped); (b) `"text\uFEFFmore"` preserves mid-text BOM as content; (c) `"\uFEFF---\ntitle: t\n---\n\nbody"` parses frontmatter correctly (BOM doesn't confuse frontmatter detection).

**Value:** Customer: Word/VSCode-BOM imports work silently; micromark string-vs-stream divergence disappears as a bug source. AND the explicit policy doc makes an architectural decision traceable rather than emergent from library defaults. BUT mid-text BOM preservation is a judgment call that could be wrong if we later see user-facing evidence of mid-text BOM as intentional content.

**Constraints:** BOM strip must happen BEFORE `remark-frontmatter` (or frontmatter parsing fails on BOM+`---`). Must test against both string-input and stream-via-TextDecoder paths (research §III.1 identifies this as the divergence surface).

**Lateral:** S3 provides test vectors. CC3 (policy applies to any mdast-producing parser, not just remark — Rust port implements the same policy at the same boundary).

**Forward:** Policy doc format becomes the template for S8, S9, S10.

#### S8 — CRLF handling policy: AST-equivalence as oracle, documented + tested

**What to build:** Document the policy in `docs/pipeline-policies.md`: byte-identity CRLF round-trip is architecturally out-of-scope under the unified/remark stack (`mdast-util-to-markdown` has no `lineEnding` option; CommonMark §2.1 treats LF/CR/CRLF as equivalent). The contract: all line-ending variants normalize to LF on output; AST-equivalence is the fidelity oracle. Add fidelity tests asserting: (a) `"a\r\nb"`, `"a\rb"`, `"a\nb"` all produce the same mdast; (b) output is always LF-terminated; (c) hard-break semantics work identically across line-ending variants (`"text  \r\n"` vs `"text  \n"` both produce hard break). Update `whitespace-corpus.test.ts` (S3) line-ending entries to assert this policy.

**Value:** Customer: predictable line-ending behavior — no user ever gets a report "my CRLF file broke" because the contract is documented. AND makes the architectural position explicit rather than emergent (this is the biggest policy decision in the project). BUT if customer-visible failures show users WANT byte-identity CRLF preservation (VSCode-on-Windows diff noise), this revisable per D5.

**Constraints:** Must NOT build a CRLF-preserving post-processor in this story; that's explicitly out-of-scope per D5 unless user-visible evidence demands it. Document the revisit condition clearly.

**Lateral:** S3 (line-ending entries in whitespace corpus rely on this policy). S11 (md↔mdast layer-isolated tests should exercise line-ending normalization at the parse stage specifically).

**Forward:** If D5 revisit triggers, a CRLF-preservation layer becomes a separate story; the policy doc structure supports that revision without rewriting.

#### S9 — Tab handling policy: fenced-canonical, documented + remove CommonMark SKIP_SECTIONS

**What to build:** Document the policy: indented-code-block input round-trips as fenced-code-block output (`mdast-util-to-markdown` `fences: true` default). Indented and fenced code blocks are semantically equivalent; fenced is canonical. Tab expansion follows CommonMark §2.2 (tab-stop 4). Remove the `SKIP_SECTIONS = ["Tabs", "Indented code blocks"]` skip in `corpus-commonmark.test.ts` and replace with either: (a) remove skip entirely and accept fenced-normalized output as test expectation, OR (b) a `NORMALIZE_SECTIONS` entry that acknowledges the intentional indented→fenced transformation. Add fidelity tests: (a) `"\t\tcode"` round-trips as ```` ```\ncode\n``` ````; (b) `"    code"` same; (c) tab expansion in paragraph text follows §2.2.

**Value:** Removes the longest-standing silent-skip in the fidelity suite (internal: no more mysterious CommonMark sections disabled). AND the fenced-canonical choice is architecturally defensible and testable. BUT changing `SKIP_SECTIONS` changes the corpus pass/fail surface — must verify no previously-passing sections break.

**Constraints:** Must be tested before merging (re-run `corpus-commonmark.test.ts` after skip removal; any new failures investigated, not auto-silenced). If any section legitimately can't pass under the new policy, it's documented as a known-limitation with a linked issue, not silently re-added to SKIP_SECTIONS.

**Lateral:** S3 (tab entries in whitespace corpus rely on this policy). S11 (md↔mdast parse + stringify tests at the parser layer exercise tab handling directly).

**Forward:** Same policy doc format as S7/S8.

#### S10 — Wiki-link URL encoding policy: decide + document + test for non-ASCII targets

**What to build:** Investigate `remark-wiki-link` behavior on non-ASCII targets (`[[Москва]]`, `[[München]]`, `[[日本]]`) — does it percent-encode, preserve literal, slugify, or fail? Make an architectural decision based on the evidence. Document the policy. Add fidelity tests asserting the chosen behavior. Extend `arbitraries.ts` to generate non-ASCII wiki-link targets so PBT covers the decided policy.

**Value:** Customer: users writing non-English wiki-links get predictable link-resolution behavior. AND sets the precedent for how URL encoding is handled across the link ecosystem. BUT this is the least-specified area in the research — the decision is shaped by reading `remark-wiki-link` source first.

**Constraints:** Decision must be based on reading `remark-wiki-link` source (`~/.claude/oss-repos/remark-wiki-link/`) — not assumed from behavior. Must cover three cases: wiki-link target is (a) non-ASCII ASCII-percent-encodable, (b) emoji / astral plane, (c) ZWJ sequence. Test expectations are set after decision, not before.

**Lateral:** CC1 (arbitrary extension). Integration tests in `tests/integration/backlinks.test.ts` may exercise non-ASCII already — if so, alignment is required.

**Forward:** Policy format matches S7-S9. If the decision reveals a bug in `remark-wiki-link`, that's an upstream issue + local patch decision (separate from this story).

### O6 stories — Layer-isolated tests

#### S11 — md↔mdast layer-isolated test suite (Rust-boundary layer)

**What to build:** Create `packages/app/tests/fidelity/layers/md-mdast/` containing tests that exercise ONLY the md↔mdast layer (i.e., `remarkProcessor.parse` + `remarkProcessor.stringify` without invoking `toProseMirror` or `updateYFragment`). Include: (a) I1-I10 invariants replicated at this layer (parse/stringify round-trip without PM involvement), (b) CommonMark corpus at this layer, (c) GFM corpus at this layer, (d) MDX parsing at this layer. The test harness exposes a stable interface `(input: string) => mdast` so markdown-rs can be swapped in during Rust migration.

**Value:** Internal + forward: this is the exact seam the Rust bridge migration cuts along (per SPEC NG3). Iron-clad tests at this layer become the Rust equivalence suite's JS-reference implementation. AND a fidelity failure becomes bisectable to "the parser/serializer is wrong" vs "the handler is wrong" vs "the bridge is wrong" — the single biggest debuggability improvement to the fidelity suite.

**Constraints:** Interface is `(input: string) => mdast` — no `Processor` instances, no unified-specific types leaking. Must share test fixtures (S3, S4, S14 corpora) rather than duplicating inputs.

**Lateral:** S1/S2 (Stryker mutation testing is more meaningful on layer-isolated tests than composite). S5 (differential harness consumes the same `(string) => mdast` interface).

**Forward:** Rust migration's equivalence suite is this suite, re-run with Rust parser plugged into the same interface.

#### S12 — mdast↔PM layer-isolated test suite (handler layer)

**What to build:** Create `packages/app/tests/fidelity/layers/mdast-pm/` containing tests that exercise ONLY the `@handlewithcare/remark-prosemirror` handlers (i.e., `toProseMirror` + `fromProseMirror` round-trip) with hand-constructed mdast trees — NOT markdown strings. For every handler registered in `pipeline.ts` (paragraph, heading, code, list, blockquote, emphasis, strong, link, image, frontmatter, jsxComponent, wikiLink, etc.), add a test that constructs a minimal mdast tree exercising that handler, converts to PM, converts back to mdast, asserts tree equality.

**Value:** Internal: handler bugs currently hide behind `remark-parse`'s normalization (a handler that mangles its output is invisible if the parser re-produces the same tree from the mangled markdown). Hand-constructed mdast trees catch this class. AND per-handler tests establish the pattern that new handlers follow (CC4). BUT this is the most tedious story — 22+ handlers × a few test cases each = substantial volume.

**Constraints:** Must use hand-constructed mdast trees (e.g., `u('paragraph', [u('text', 'hi')])` via `unist-builder` or plain object literals) — never `parseMd("...")` as input. Tests live per-handler (`code.test.ts`, `link.test.ts`, etc.), not one monolithic file.

**Lateral:** S1/S2 (Stryker catches handler mutants only if isolated handler tests exist). S4 (divergence snippets that traffic in handlers — links, emphasis, code spans — may duplicate some coverage; de-dup judgment call).

**Forward:** The per-handler test file pattern is the template for any new handler added later. Post-Rust-migration, these tests are unchanged because mdast↔PM stays in JS (NG3).

#### S13 — PM↔Y.XmlFragment bridge layer verification

**What to build:** Verify the PR #213 `bridge-observer-conversion.test.ts` coverage (Chain A/B/C/D) satisfies the O6 bisectability requirement for this layer. If gaps exist, add them. Document the three-chain layer-coverage map in `docs/test-architecture.md` so the layer-isolated split is visible. This story is mostly verification + documentation since PR #213 did the heavy lift.

**Value:** Internal: closes the "are we actually bisectable at this layer?" question. AND the layer-architecture doc makes the fidelity suite's structure legible to a new engineer. BUT may reveal gaps that expand into additional test work.

**Constraints:** If new tests are needed, they must follow PR #213's Chain A/B/C/D organizational convention, not a new scheme.

**Lateral:** CC1 (extends existing fidelity harness in same style as PR #213).

**Forward:** If a future bridge change requires new chain tests, the doc provides the conventions.

---

### Now / Next / Later — phasing rationale

**Phasing heuristic: dependency-first, then risk-first**, with capacity-first as a constraint. Rationale: this is a hardening project against a known-shape research output — there's no market-validation uncertainty (customer-journey-first doesn't apply), no fixed time budget (appetite-first doesn't apply), and no business pressure for quick wins (value-first doesn't apply). The dominant constraint is that oracle-strength measurement (S1) produces low-signal output unless layer-isolated tests (S11, S12) exist first, and fixture stories (S3) depend on policy decisions (S7, S8, S9) being shipped. Dependency order dictates.

#### Now

Foundations. Every story here either unblocks a Next story or is a standalone precondition. All stories in Now are parallel-safe (no inter-dependencies among them).

- **S11 — md↔mdast layer tests.** Unblocks S1 (Stryker signal requires isolated tests to be meaningful). Rust-bridge seam — highest long-term leverage.
- **S12 — mdast↔PM layer tests.** Same reason as S11 — unblocks S1 signal and handler-layer bisectability.
- **S13 — PM↔Y.XmlFragment verification.** Closes the third layer of O6. Small (PR #213 already did the work).
- **S4 — Divergence corpus curation.** Unblocks S5. Pure data curation, zero risk.
- **S7 — BOM policy.** Unblocks S3 BOM entries. Decision already made (D9); this is documentation + implementation.
- **S8 — CRLF policy.** Unblocks S3 line-ending entries. Documentation-heavy; no preservation implementation per D5.
- **S9 — Tab policy.** Unblocks S3 tab entries + removes `SKIP_SECTIONS`. Requires verifying no regressions on the CommonMark corpus when skips are lifted.

**Walking skeleton test:** if Next/Later never happen, Now alone delivers: layer-bisectability (new debuggability property); documented BOM/CRLF/tab policies (architectural decisions captured); curated 59-snippet divergence corpus (reusable artifact); bridge-layer verification (PR #213 coverage validated). Not iron-clad, but a substantial net addition — the fidelity suite moves from "self-referential identity checks" to "explicit architectural decisions + layer-bisectable tests."

#### Next

Stories that depend on Now. Order within Next by dependency chain.

- **S1 — Stryker setup.** Depends on S11 + S12 (mutation needs meaningful isolated tests for high-signal output). First story after Now completes.
- **S3 — Whitespace fixture corpus.** Depends on S7 + S8 + S9 (the policies shape the expected-behavior assertions in each fixture entry).
- **S5 — Differential harness.** Depends on S4 (harness consumes the divergence corpus as allowlist).
- **S10 — Wiki-link URL encoding policy.** Depends on reading `remark-wiki-link` source (investigation step, not depending on another story — but deferred to Next because it requires external investigation time distinct from the Now policies which have decisions already made).
- **S6 — Plugin audit.** Standalone, could technically be Now, but pushed to Next because (a) it doesn't unblock downstream work and (b) audit results are most useful once pipeline behavior is stable (so a flagged CVE doesn't race against concurrent policy-story changes to the same dep).

#### Later

Stories that depend on Next outputs or require the pipeline to be stable first.

- **S2 — Mutant remediation.** Depends on S1 baseline JSONL. Promotion trigger: S1 writes first `mutation-measurements.jsonl` record. Volume unknown until S1 runs — could be a few mutants or many; treating as Later preserves option to split into multiple remediation sub-stories based on S1 output.
- **S14 — Real-world external-corpus fidelity test.** Depends on stable pipeline (all policy stories merged, all layer tests in place) so a real-world corpus failure points at a test-infrastructure gap, not at a pending architectural decision. Promotion trigger: all of S3, S5, S7-S10, S11-S13 merged.

## Rabbit holes

Attractive nuisances that look in-scope but would derail the project.

**RH1 — Chasing marginal mutant-killing during S2.**
*Why tempting:* A surviving mutant feels like a gap in test coverage; writing a test to kill it is satisfying.
*Why a rabbit hole:* Some mutants are killable only via tests that couple to implementation details (asserting call counts, specific internal function invocations, branch-order assumptions). Those tests are anti-patterns per `/tdd` principles — they break on refactors that don't change behavior. D11 explicitly accepts "document as equivalent" as the correct outcome for such mutants.
*What to do:* When writing a mutant-killing test, apply the /tdd litmus test: would this test survive an internal refactor that preserves behavior? If no — document the mutant as equivalent, don't write the test.

**RH2 — Building a CRLF-preserving post-processor during S8.**
*Why tempting:* "Iron-clad" seems to demand byte-identity round-trip. Building a layer that reconstructs original line endings is architecturally interesting.
*Why a rabbit hole:* Explicitly excluded by D5 non-goal. `mdast-util-to-markdown`'s no-`lineEnding`-option is a deliberate design reflecting CommonMark §2.1; fighting it creates a maintenance burden with no CommonMark mandate backing it. The correct iron-clad outcome at this layer is AST-equivalence as the oracle.
*What to do:* If S8 reviewer pushback is "but shouldn't we just preserve?", reference D5 revisit condition: build a post-processor only if a concrete customer-visible failure is documented. Otherwise, ship S8 as documented policy + tests, nothing more.

**RH3 — Upstreaming fixes during S10.**
*Why tempting:* If `remark-wiki-link` has a bug in non-ASCII handling, fixing it upstream is the right engineering posture.
*Why a rabbit hole:* Upstream PR cycles are unbounded; one library's maintainer responsiveness is outside our control. Wrapping the project around a pending upstream PR creates a cross-repo dependency.
*What to do:* Investigate (read source), decide policy (document), implement locally via wrapping or patching (`patches/` dir if needed), file upstream issue with reproduction. Do NOT drive an upstream PR to merge during this project.

**RH4 — Stryker scope creep beyond the pipeline.**
*Why tempting:* Once Stryker infrastructure exists (S1), applying it to handlers, schema, MCP server, CLI "just takes a config change."
*Why a rabbit hole:* Explicitly excluded by bet-level non-goal (NEVER-in-this-project for non-pipeline code). Every additional surface multiplies baseline + remediation work. Propagation is a separate project decision with its own justification.
*What to do:* If reviewer or team raises "should we also mutate X?", note it as "out of scope for this project; establish the pattern here; propagate in a follow-up if value is demonstrated." Add to the project's deferred-scope note in `meta/_changelog.md`.

**RH5 — Differential harness corpus expansion beyond CommonMark + GFM.**
*Why tempting:* The harness architecture could run any parser on any corpus; testing more corpora catches more bugs.
*Why a rabbit hole:* MDX, wiki-link, directive, and custom-handler corpora don't have cross-parser equivalence expectations — they're our pipeline's proprietary extensions. Running a differential harness on them is self-referential (there's nothing to differ against). CommonMark 0.31.2 + optional GFM is the scope because those are the only corpora with an independent JS parser ecosystem to validate against.
*What to do:* S5 harness architecture supports pluggable corpora (via the `(input: string) => mdast | html` interface), so future corpus expansion is cheap — but doesn't happen in this project.

**RH6 — Real-world corpus (S14) size creep.**
*Why tempting:* More samples = more coverage. Why stop at 200?
*Why a rabbit hole:* Test runtime grows linearly with corpus size; at 5000 samples the fidelity tier becomes slow enough that developers skip it locally. Also, each sample needs license audit — volume adds bureaucracy without proportional signal.
*What to do:* Budget: ~200 files total, ~5MB corpus size. Stop. If specific gaps surface later, add targeted samples, not wholesale corpus expansion.

## Pre-mortem

If this project fails, what's the most likely cause? What are we assuming that could be wrong?

**PM1 — Stryker baseline reveals a low mutation score.** If S1 produces a JSONL with (say) 0.3 mutation score, S2 remediation is a much bigger project than scoped. The assumption that could be wrong: "our fidelity suite's identity oracles are strong." Mitigation: the iron-clad gate's "kill-or-document" framing (D11) accommodates this — we don't commit to a percentage target. But if the kill-or-document workload is enormous, the timeline expands unboundedly. If this happens, the correct response is to split S2 into sub-stories (one per test file or per mutant class) and re-phase.

**PM2 — Differential harness runtime exceeds in-PR budget.** If S5's prototype on 652 × 3 parsers × HTML-diff is >30s on CI hardware (A2 assumption), D8 forces fallback to one-off-script delivery. The "drift caught immediately" guarantee degrades to "drift caught when a developer remembers to run the script." Mitigation: the one-off script with JSONL evidence artifact is still a substantial improvement over no differential check; but it's less iron-clad than in-PR integration.

**PM3 — Wiki-link investigation (S10) reveals fundamental brokenness.** If `remark-wiki-link` percent-encodes non-ASCII wrong or produces invalid URLs, the decision isn't "strip-on-input vs preserve" — it's "fix or replace the library." Scope expands into library-evaluation or fork-and-patch territory. Mitigation: time-box the investigation to a day; if the library is broken, open a separate project for library replacement and ship S10 as "documented current behavior (buggy); policy pending replacement."

**PM4 — bun-runner 0.4.0 flakiness in practice.** The A1 assumption (pin 0.4.0) rests on a source-read, not a real run. If bun-runner is unstable when actually running Stryker (process-pool races, snapshot conflicts, coverage-hook injection failures), S1 falls back to Option 3b hybrid per §I.6 (keep bun primary; run Stryker with vitest-runner). That adds vitest config scope to S1. Mitigation: time-box S1 bun-runner-first attempt to ~2 days; if unstable, pivot to vitest-runner — the fallback is documented in the research and doesn't block the bet.

**PM5 — Plugin audit (S6) reveals an actively-exploited CVE.** If a current transitive dep has an unpatched RCE or similar critical advisory, the correct response is emergency patching, not "document for this project's audit artifact." That work falls outside this project's scope but becomes urgent. Mitigation: frame S6 discovery as dual-output — the audit artifact AND an incident-response handoff if a Critical advisory surfaces. The project pauses for the handoff; it doesn't try to self-resolve the incident.

**PM6 — Two staff engineers disagree on a policy decision and no evidence resolves it.** For Q3 (wiki-link URL) or some edge of Q1/Q2 not foreseen, the "evidence-based" stance may fail to produce a uniquely-correct answer. Mitigation: under the user's stated principle, this is the one case where cascading to the user for a judgment call is correct — "the evidence supports two equally-defensible choices; which does the product want?" The answer becomes a DECIDED item with firmness = "revisable if customer evidence emerges."

## Evidence & References

### Evidence Files

_(populated during Phase 2 execution; expected artifacts: mutation-measurements.jsonl (S1), equivalent-mutants.md (S2), plugin-audit-YYYY-MM-DD.md (S6), per-policy evidence files (S7-S10), layer-architecture.md (S13), real-world-corpus-license-audit.md (S14))_

### Research Reports

- [reports/md-pm-testing-hardening-today/REPORT.md](../../reports/md-pm-testing-hardening-today/REPORT.md) — Factual landscape of four testing-hardening techniques (mutation testing via Stryker, differential testing in the JS parser ecosystem, whitespace/BOM/CRLF/tab edge cases, pathological inputs + 59-snippet cross-parser divergence corpus); audit-resolved including resolution of #13 bun-runner perTest contradiction via source-read of published 0.4.0. Full evidence chain (21 evidence files, 6 fanout sub-reports, CLAIMS.md inventories, audit findings) preserved in the same directory.

### Upstream Artifacts

- Conversation history + worldmodel pass produced earlier in this session (topology map of current fidelity test suite, arbitraries coverage, PR #213 bridge-observer-conversion.test.ts, PBT seed rotation, measurement scripts, TDD adherence signals)
- Root-level PROJECT.md at open-knowledge repo: "Build an agent-native knowledge platform" — this project sits inside that portfolio as testing-infrastructure hardening for the markdown pipeline

### Key code references (for each story)

- `packages/core/src/markdown/pipeline.ts` — pipeline entry points (`parseMd`, `serializeMd`, `createParseProcessor`, `createSerializeProcessor`). Mutated by S1; layer boundary is within this file for S11.
- `packages/core/src/bridge/apply-diff.ts`, `merge-three-way.ts`, `frontmatter-y.ts`, `normalize.ts` — bridge utilities. Mutated by S1; verified by S13.
- `packages/app/tests/fidelity/helpers.ts` — PBT infrastructure. Extended by S3, S4, S14.
- `packages/app/tests/fidelity/arbitraries.ts` — markdown-construct generators. Extended by S10 (non-ASCII wiki-link).
- `packages/app/tests/fidelity/bridge-observer-conversion.test.ts` — PR #213 Chain A/B/C/D coverage. Verified by S13.
- `packages/app/tests/fidelity/corpus-commonmark.test.ts` — `SKIP_SECTIONS` removed by S9.
- `packages/app/scripts/_measure-lib.sh` — script infrastructure (CC2). Sourced by S1 (`measure-mutation.sh`) and S6 (`audit-plugins.sh`).
- `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl` — precedent JSONL schema for all measurement scripts.

### Repo reference

- Current branch: `project/md-pm-testing-hardening` off `origin/main` (`0ae6cc8d`)
- Current worktree: `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/md-pm-testing-hardening`
- Previous worktree where ci-signal-quality PR #213 shipped: `.claude/worktrees/ci-signal-quality` on branch `spec/ci-signal-quality` (merged to main)
