# CONSIDER — items surfaced by sister spec `markdown-pipeline-engineering-health`

**Produced:** 2026-04-16 by the `markdown-pipeline-engineering-health` parent Claude, after its ship run landed on main (21 P0 requirements, 17 user stories).

**Purpose:** Rich context for the component-blocks-v2 agent to reason through and make judgment calls on items that fall inside this PR's scope. Each item includes what is confirmed, what is still unclear, evidence pointers, and trade-off options. **This file deliberately does NOT prescribe decisions** — it enumerates the evidence landscape so you can decide in light of your spec's current state (which I can only read, not modify).

**Scope of this doc.** Only items that are **in this PR's domain** and require a decision from you. Items the sister spec owns (CLAUDE.md I11 label, parse-health contract doc, perf-framework authoring guide) have been removed; they land as sister-spec follow-ups and you inherit passively.

**Cross-spec path prefix:** All file paths resolve from repo root. Where I cite my sister spec's files, the prefix is `specs/2026-04-16-markdown-pipeline-engineering-health/…`; when I cite yours, the prefix is `specs/2026-04-14-component-blocks-v2/…`.

---

## Table of contents

Six items, two buckets:

1. 🔴 [Pair I13 PBT with example-based NG12 pins](#1--pair-i13-pbt-with-example-based-ng12-pins)
2. 🔴 [Commit the 18 built-ins fixture registry to a canonical location](#2--commit-the-18-built-ins-fixture-registry-to-a-canonical-location)
3. 🔴 [Document the flush-left handler algorithm separately from the code](#3--document-the-flush-left-handler-algorithm-separately-from-the-code)
4. 🔴 [Calibrate PF01-PF06 thresholds from measured variance](#4--calibrate-pf01-pf06-thresholds-from-measured-variance)
5. 🟡 [Nail down NG12's quoting rule with example-based canonicals](#5--nail-down-ng12s-quoting-rule-with-example-based-canonicals)
6. 🟡 [Reconcile the I12-I15 vs I12-I17 cross-references inside your SPEC](#6--reconcile-the-i12-i15-vs-i12-i17-cross-references-inside-your-spec)

Plus a single appendix: [What's already on main after your rebase](#whats-already-on-main-after-your-rebase).

---

## Confidence legend

- **HIGH** — evidence converges, trade-offs are clear, recommendation is concrete.
- **MEDIUM** — evidence exists but gap requires a decision you own; I enumerate options.

---

# 🔴 Bucket 1 — structural: address in this PR

These four items tie structurally into your spec's fidelity contract, schema widening, test surface, or perf gates.

---

## 1. 🔴 Pair I13 PBT with example-based NG12 pins

**Confidence:** HIGH

### Confirmed

1. Your SPEC.md:249 defines **I13** as:
   > "Edited jsxComponent/jsxInline idempotence — `serialize(parse(serialize(parse(X_edited))))) === serialize(parse(X_edited))` — NG12 normalization converges on first serialize; double-round-trip stabilizes. Holds for all 18 built-ins under each PropDef control's edited state. Verification: `jsx-edited-idempotence.test.ts` — property-based over prop-edit operations."

2. Your NG12 pattern is specified at SPEC.md:2409:
   > "NG12 — edited-node quoting normalization is an ACCEPTED trade-off (fidelity contract in §3), not a future work item."

3. Your `evidence/serialize-roundtrip-probe.md` shows **10 concrete cases** testing `mdast-util-mdx-jsx`'s serializer normalization (quoting, spacing, attribute order), all proven idempotent. Cases 2, 5, 6, 7 are the key demonstrations.

4. **On sister spec side, NG-pinned tests are example-based, not PBT-only.** File `packages/app/tests/fidelity/ng-pinned.test.ts` has two `describe()` blocks: NG1 (blank-line normalization: `# H\n\n\n\nP\n` → `# H\n\nP\n`) and NG11 (yaml-only doc: `---\ntitle: X\n---\n` → `""`). Both are byte-identity assertions, no `normalize()` stripping.

5. **Precedent #17 in CLAUDE.md (lines 100) says:**
   > "Byte-for-byte equivalence validators gate high-risk refactors. Template: US-007's `r17-mdast-equivalence.md` validator (714 fixtures, deleted post-refactor). Applied to merged-walker refactoring."

6. I13's convergence property alone (double-round-trip = single-round-trip) does NOT pin **which** canonical form wins. A PBT can generate random `X_edited`, observe that `f(f(X)) === f(X)`, and pass — even if tomorrow a library bump silently changes which quote character `f` picks, as long as it remains idempotent. That's exactly the shape of drift that NG-pinned byte-identity pins catch.

### What's still unclear

- Your 10 probe cases are in `evidence/serialize-roundtrip-probe.md` as prose analysis, not as committed test fixtures. Are they already somewhere as structured data, or is it only prose + inline snippets?
- Does your planned `jsx-edited-idempotence.test.ts` have an example-based mode in addition to PBT, or is it pure fast-check?

### Options

| Option | What it looks like | Trade-off |
|---|---|---|
| **A — Pair I13 PBT with an example-based NG12 fixture set.** | Lift the 10 probe cases from `serialize-roundtrip-probe.md` into `fixtures/mdx/ng12-quoting/*.json` (input → expected_output pairs). Add assertions in `ng-pinned.test.ts` next to NG1 + NG11. | Highest coverage: catches "library flips from double to single quotes" silently + catches "the idempotence property holds, but different canonical than we committed to." Matches pattern established by NG1 + NG11. |
| **B — Expand I13 PBT to cover "canonical form of each of the 18 built-ins."** | Make the property: for every built-in in the registry, `serialize(parse(original)) === expected_canonical`. Eliminates the need for a separate NG12 pin. | One test surface. But couples I13 to the registry contents — if built-ins change, the test has to be rewritten. |
| **C — Keep I13 as pure PBT; document the 10 cases as prose only.** | Ship as currently planned. | Fastest. Accepts the drift risk above (library bump silently changes canonical). |

### Why I rank A highest (HIGH confidence)

- The precedent exists (`ng-pinned.test.ts` ships NG1 + NG11 as byte-identity pins).
- The data already exists in your evidence file — you just need to lift it into fixtures.
- The drift risk is real: `mdast-util-mdx-jsx`'s serializer has settings (quote, quoteSmart, tightSelfClosing) that have changed across minor versions historically.

### Evidence

- Your SPEC: lines 249 (I13), 2409 (NG12 statement), 2187 (D6 γ serialization), 1028-1034 (sourceDirty observer).
- Your evidence: `specs/2026-04-14-component-blocks-v2/evidence/serialize-roundtrip-probe.md` — the 10 cases.
- Sister spec pattern: `packages/app/tests/fidelity/ng-pinned.test.ts` — the pattern.
- Sister spec: `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/ng-pinned-canonicals.md` — how we document canonicals.

---

## 2. 🔴 Commit the 18 built-ins fixture registry to a canonical location

**Confidence:** HIGH

### Confirmed

1. Your SPEC.md:2259 references `jsx-pristine-byte-identity.test.ts` — "**18 fixtures × {block form, inline form}**."
2. Your `evidence/worldmodel.md` lists the exact 18 as:
   - **16 fumadocs-ui@16.1.0:** Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC
   - **2 shadcn wrappers to author:** Mermaid (`packages/app/src/components/ui/mermaid.tsx`), Audio (`packages/app/src/components/ui/audio.tsx`)

3. The sister spec consolidated fixtures into:
   ```
   packages/core/src/markdown/fixtures/
   ├── commonmark/        (npm-package-backed, not committed here)
   ├── gfm/
   │   └── examples.json
   ├── mdx/
   │   └── crash-taxonomy.json
   ├── wiki-links/        (reserved, empty)
   ├── frontmatter/       (reserved, empty)
   ├── ng-pinned/         (reserved, empty)
   └── perf/
       ├── 100.md, 1000.md, 5000.md, 10000.md, 20000.md
       ├── large-realistic.md
       ├── README.md
       └── generate.ts
   ```
   **No `mdx/built-ins/` subdir currently exists.**

4. Typed loader interface at `packages/core/src/markdown/fixtures/index.ts:38-97`:
   ```typescript
   export interface GfmExample { section: string; markdown: string; }
   export function loadGfmExamples(): GfmExample[] { … }
   export interface MdxCrashEntry {
     id: string;
     input: string;
     class: string;
     r23Covers: boolean;
     expectedOutcome: string;
     note: string;
   }
   export function loadMdxCrashTaxonomy(): MdxCrashEntry[] { … }
   ```

### What's still unclear

- Where in your current implementation does the 18-list live — is it in `packages/core/src/registry/built-ins.ts` as an exported `BUILT_INS` constant, or inlined in the test file?
- Does "inline form" (SPEC.md:2259) mean a separate fixture file per component, or one file per component with two `{md, expectedForm: 'block'|'inline'}` entries?

### Options

| Option | What it looks like | Trade-off |
|---|---|---|
| **A — Canonical fixture dir + typed loader, matching sister spec's `gfm/` and `mdx/` patterns.** | New dir `packages/core/src/markdown/fixtures/mdx/built-ins/` with `{component-name}.json` files (or a single `examples.json` indexed by componentName). Add `loadBuiltInFixtures()` to `fixtures/index.ts`. Test file consumes it. | Matches established pattern. Clear cross-package discoverability. Reusable by docs / e2e tests. |
| **B — Test-file-local string literals.** | Keep the 18 fixtures inline in `jsx-pristine-byte-identity.test.ts`. | Fastest to ship. But: (1) no reuse for other test files; (2) adds to the "special-case-not-using-fixtures-convention" list; (3) future component addition requires test-file edit, not data file edit. |
| **C — Registry-driven (canonical forms live on descriptors).** | Add a `canonicalMd` field to each descriptor in `packages/core/src/registry/built-ins.ts`. Test file walks registry and asserts parse/serialize against canonicalMd. | One source of truth. But: pollutes runtime descriptor data with test data. Harder to show "this is what the source form looks like" to docs / authors. |

### Why I rank A highest

- Sister spec already established the pattern (two existing fixture dirs with typed loaders). Your PR will be the third to follow it.
- `turbo.json` now includes `"../core/src/markdown/fixtures/**/*.json"` in `test:fidelity` inputs — so committing JSON fixtures under `fixtures/` automatically participates in the fidelity tier's cache key.
- Your inline-form/block-form orthogonality fits naturally: one file per component with `{block: "<Callout type=\"note\">...</Callout>", inline: "<Badge>...</Badge>"}` when applicable.

### Evidence

- Your SPEC: lines 2259, 925.
- Your evidence: `specs/2026-04-14-component-blocks-v2/evidence/worldmodel.md` §1 + SPEC.md:726.
- Sister spec pattern: `packages/core/src/markdown/fixtures/gfm/examples.json` + `fixtures/index.ts:38-97`.
- Sister spec turbo input change: `turbo.json` (already on main).

---

## 3. 🔴 Document the flush-left handler algorithm separately from the code

**Confidence:** MEDIUM

### Confirmed

1. Your SPEC.md:1009-1022 defines the algorithm as **~30 LoC** inline:
   ```
   export const mdxJsxFlowElementHandler: Handle = (node, _parent, state, info) => {
     // Bypass library's containerFlow depth-indentation.
     // Emit: <Tag attr="value">\n\nchildren-serialized-flush-left\n\n</Tag>
     // Preserves fumadocs/Obsidian authoring convention; avoids 4-space CommonMark code-block
     // ambiguity at depth 2+.
     // ~30 LoC.
   };
   ```
2. Your D7 at SPEC.md:2188 notes:
   > "library default indents children 2-space-per-depth → CommonMark 4-space ambiguity at depth 2+; flush-left matches fumadocs/Obsidian authoring convention"
3. Q1 at SPEC.md:2200 flags "Flush-left handler corner cases: deeply-nested JSX, mixed paragraph/heading/list children, preserved blank-line semantics" as delegated to implementation-time fixture matrix.

4. **Sister spec has a precedent here.** The `merged-walker.ts` (Phase B dispatcher) has intra-phase ordering that's load-bearing — Pass 2 regex depends on Pass 1 PUA restoration. The implementation comments are exhaustive, but the rationale is captured in `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/pipeline-refactor-audit.md` §R17, not in the code. This gives future readers a narrative entry point.

### What's still unclear

- Is your flush-left handler fully specified, or is the ~30 LoC comment intentionally aspirational (the real handler TBD at implementation time)?
- Does the "flush-left" semantics need to be parameterized (e.g., configurable indent for projects that prefer 2-space-per-depth), or is zero-indent fixed for open-knowledge?
- **Rust-readiness angle:** If a sister Rust port needs to reproduce the exact output bytes of this handler, a prose algorithm doc is a contract; an inline `~30 LoC` comment in a TS file is not. (A Rust port exists at `specs/2026-04-14-markdown-engine-rust-bridge/` on another worktree.)

### Options

| Option | What it looks like | Trade-off |
|---|---|---|
| **A — Inline algorithm comment in the handler file + reference from SPEC.** | Expand the ~30 LoC comment into a full docstring with input → output examples and corner-case enumeration (nested JSX, mixed children, blank-line preservation). | Minimal new surface. Docstring rots slower than standalone docs because it's next to the code. |
| **B — Standalone algorithm spec file.** | `evidence/flush-left-handler-algorithm.md` with: input language (tree shapes accepted), output contract (byte-level emission rules), corner cases (numbered), fixtures tied to specific rules. | Higher investment. Reusable by Rust port, docs team, audit agents. Acts as the "contract" a reimplementation would honor. |
| **C — Fixture-driven spec (output contract via golden files).** | Commit 10-20 fixtures in `fixtures/mdx/flush-left-corpus/` with `{input, expected}` pairs. Let the fixtures be the spec. | Minimal prose. Strong test coverage. But: harder for a human to reason about "why this output shape" without commentary. Tends to become "regenerate on change" when algorithm shifts. |

### Why I'm less confident (MEDIUM)

- I don't know your implementation plan for this handler. If it's already written and the ~30 LoC is concrete with good inline comments, (A) might be enough.
- I don't know whether the Rust port is a near-term (≤3 months) concern or a year+ out. If it's year+ out, (A) is sufficient; (B) is premature.

### Evidence

- Your SPEC: lines 1009-1022, 2188 (D7), 2200 (Q1).
- Your evidence: `specs/2026-04-14-component-blocks-v2/evidence/serialize-roundtrip-probe.md` cases 5, 6, 7.
- Sister Rust spec: `specs/2026-04-14-markdown-engine-rust-bridge/` (on worktree `markdown-source-text-fidelity`).
- Sister spec precedent for prose+code split: `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/pipeline-refactor-audit.md` §R17 + `packages/core/src/markdown/merged-walker.ts`.

---

## 4. 🔴 Calibrate PF01-PF06 thresholds from measured variance

**Confidence:** MEDIUM-HIGH

### Confirmed

1. Your PF01-PF06 at SPEC.md:667-674 commit to concrete thresholds:
   - **PF01:** 100 jsxComponent nodes, edit one prop → p99 render time < 50ms
   - **PF02:** 10-level nested compound, 1 NodeView render → ancestor walk + ContextBridgeProvider < 5ms per render, p99 < 10ms
   - **PF03:** 500 keystrokes on 20-jsxComponent doc → Observer B cycle avg < 20ms, p99 < 50ms, no cycle > 200ms
   - **PF04:** `bun run check:full:parallel` → no tier regresses > 10% vs main-branch baseline
   - **PF05:** 100 keystrokes → Y.Item delta ≤ keystroke_count + constant overhead
   - **PF06:** Mount 50 compounds simultaneously → publishes settle in 16ms (one frame)

2. **None of these reference the `max(2× p99 variance, 10% floor)` formula from sister spec's R4.** PF04 is the closest — a simple 10% regression gate, but without the variance term.

3. The sister spec's R4 gate (shipped at `packages/core/tests/perf/regression-gate.ts:7-9`) is pinned as:
   ```typescript
   /**
    * THRESHOLD FORMULA (pinned, per SPEC §6 R4 and Q4):
    *   allowed_regression_ms = max(2 × p99_stdev_ms, 10% × baseline_p99_ms)
    *   fresh_p99_ms - baseline_p99_ms > allowed_regression_ms ⇒ REGRESSION
    */
   ```
   Baseline at `packages/core/tests/perf/baseline.json` captures `p99StdevMs` alongside `p99` per op, per block-count. Methodology (10 warm-ups, `Bun.gc(true)`, bun@1.3.11, M-series) pinned in `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-baseline-measured.md`. The full authoring guide lives at `packages/core/tests/perf/README.md` on main after your rebase.

4. **Why the variance term exists.** A 10% floor catches real regressions; the 2× variance term catches "fast regression" cases where the op is already at 5ms and a regression to 6ms is 20% — above the 10% floor — but well within session-to-session noise. Without the 2σ term, your CI gate flakes on noise.

5. **Drift risk.** If your PF thresholds are committed as fixed numbers without variance measurement, you get one of three failure modes: (a) gate flakes on noise; (b) gate is set loose enough that real regressions pass; (c) gate is set tight and the spec calibrates it down over time ("we meant 60ms, not 50ms") which dilutes the contract.

### What's still unclear

- Which of PF01-PF06 are measured on CI runners vs. locally? CI runners run ~2× slower (per sister spec CLAUDE.md Tier 1 budget note: "p95 warm local baseline ≈ 2m30s; runners ≈ 2× slower"). A 50ms threshold in local measurement means ≤100ms on runners — is that what you intend?
- Is the PF corpus deterministic (like sister spec's `fixtures/perf/{100,1000,5000,10000,20000}.md`), or is it generated per-run?
- Does your Observer B corpus (PF03: "20 jsxComponents, 500 keystrokes") exist yet, or is it TBD?

### Options

| Option | What it looks like | Trade-off |
|---|---|---|
| **A — Adopt R4 formula across PF01-PF06.** | Pre-flight measurement: 10 warm-ups + 10 measured runs × `Bun.gc(true)`, capture `{p99, p99StdevMs}` per op. Commit baseline JSON. Gate applies `max(2σ, 10%)` formula. Your PF thresholds become the "expected p99" column, not the "hard ceiling." | Maximum resilience to noise. Matches sister spec. Uniform CI experience. Larger up-front investment (measurement run + JSON baseline per op). See `packages/core/tests/perf/README.md` on main for the step-by-step guide. |
| **B — Keep fixed thresholds for PF01/PF02/PF06 (frame-budget-aligned); adopt R4 for PF03/PF04/PF05 (drift-sensitive).** | PF01/02/06 are tied to human-perceptible frame budgets (16ms/50ms). PF03/04/05 are drift-sensitive aggregates. Split calibration accordingly. | Pragmatic. Preserves "we hit one frame" as a hard contract where it matters. Still catches drift where it matters. More complexity. |
| **C — Ship fixed thresholds; calibrate on first flake.** | Ship as committed. When CI flakes 3× on same gate within a week, reset threshold + add variance term. | Fastest to land. Debt: first flake cost is "investigation of why is the gate mis-calibrated" which is ~2hr. |

### Why I rank A (MEDIUM-HIGH)

- Sister spec shipped R4 and it caught a real regression during the ship-run (the `Bun.gc(true)` calibration discovered session-to-session variance of ~0.15ms on a 2.29ms serialize — without the 2σ term, 10% floor would've been 0.23ms and we'd have been alarm-flashing on noise).
- Your PF01-PF06 cover a wider variance range (frame budgets → aggregates → throughput), so the uniform `max(2σ, 10%)` formula needs no bike-shed debate per gate.
- CI-runner speed differential (2×) makes fixed thresholds fragile — `max(2σ, 10%)` self-scales.

### Evidence

- Your SPEC: lines 667-674 (PF01-PF06).
- Sister spec gate: `packages/core/tests/perf/regression-gate.ts:7-9`, `packages/core/tests/perf/baseline.json`.
- Sister spec methodology: `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-baseline-measured.md`.
- Sister spec authoring guide: `packages/core/tests/perf/README.md` (now on main).
- Sister spec corpus generator: `packages/core/src/markdown/fixtures/perf/generate.ts`.
- CI budget note: `AGENTS.md` (repo root) "CI tier structure" table.

---

# 🟡 Bucket 2 — high-value, low effort: worth considering in-scope

Not structural blockers — opportunities where the sister spec's pattern or missing artifact aligns naturally with something you're already building.

---

## 5. 🟡 Nail down NG12's quoting rule with example-based canonicals

**Confidence:** HIGH

This overlaps Item 1. **Item 1 = pair the PBT with pins.** **Item 5 = what the pin content should be.** Separating them so you can decide independently whether to pin (Item 1) and what to pin (Item 5).

### Confirmed

1. NG12 is specified in prose (SPEC.md:2409), but your committed evidence set includes exactly **10 concrete input → output transformations** across `serialize-roundtrip-probe.md` cases 1-10.
2. Cases 2, 5, 6, 7 are highlighted as the idempotence demonstrations.
3. Example-based pins for sibling NGs (NG1, NG11) are 1-2 lines each in `packages/app/tests/fidelity/ng-pinned.test.ts`.

### What's still unclear

- Which of the 10 probe cases are **essential pins** (drift would silently change contract) vs. **incidental** (covered by PBT + other mechanisms)?
- Do any of the 10 cases involve library behavior that could flip on a minor version bump of `mdast-util-mdx-jsx`? (If yes, those are the highest-value pins.)

### Options

| Option | What | Trade-off |
|---|---|---|
| **A — Pin all 10 as byte-identity tests.** | Direct lift from probe evidence. | Complete coverage. Verbose. |
| **B — Pin the 4 highlighted cases (2, 5, 6, 7).** | Smaller pin set, matches your own evidence prioritization. | Faster, still captures the key idempotence assertions. |
| **C — Pin 1 canonical example per attribute-quoting scenario (single-quote → double, unquoted → double, JSX expression unchanged, attribute-order preservation, etc.).** | Category-based. | Maps cleanly to "what shape of regression would we catch." Requires one more analysis pass to categorize. |

### Evidence

- Your evidence: `specs/2026-04-14-component-blocks-v2/evidence/serialize-roundtrip-probe.md` — all 10 cases.
- Sister spec pattern: `packages/app/tests/fidelity/ng-pinned.test.ts` (NG1, NG11).

---

## 6. 🟡 Reconcile the I12-I15 vs I12-I17 cross-references inside your SPEC

**Confidence:** HIGH

### Confirmed

1. **SPEC.md:240** says:
   > "M6: Fidelity suite stays green: I1-I11 + NG12 entry + **this spec extends with I12-I15**"

2. **SPEC.md:255** says:
   > "Failure of any **I12-I17** fails CI"

3. **The invariants table (SPEC.md:242-253) stops at I16.** It defines I12, I13, I14, I15, I16 — not I17.

4. So there are three possible intended meanings:
   - The scope is **I12-I16** (5 new invariants), line 240 is stale.
   - The scope is **I12-I15** (4 new invariants), line 255 is stale, and I16 is deferred.
   - There's a planned I17 that got dropped from the table during a late edit.

### What's still unclear

- Which reference is canonical?
- Is I16 (nested-dirty serialization) in or out of scope for this PR?
- Is there an I17 that was dropped that needs reinstating?

### Options

| Option | What | Trade-off |
|---|---|---|
| **A — Align everything on I12-I16.** | Update line 240 to say "I12-I16." Leave line 255 as-is ("I12-I17" becomes stale but shipping I17 as follow-up). | Depends on whether I17 is planned. |
| **B — Align everything on I12-I15.** | Update line 255 to "I12-I15." Remove I16 from the table (or mark deferred). | Reduces scope. Requires confirming I16 is truly deferrable. |
| **C — Expand table to I17.** | Add an I17 row (candidate topic to be determined). | Maximal interpretation. Requires identifying what I17 is actually about. |

### Why HIGH confidence

This is a pure document-consistency issue. Three text fragments currently disagree about the invariant count. Pick one and align — all three options are operationally equivalent (the work that matters is the defined invariants, not the count). The ask here is just: don't leave 3 inconsistent numbers in the same doc.

### Evidence

- Your SPEC: lines 240, 242-253, 255.

---

# What's already on main after your rebase

After the sister spec (`markdown-pipeline-engineering-health`) merged, these landed on main and affect your PR:

- **`turbo.json`** includes `"../core/src/markdown/fixtures/**/*.json"` in `test:fidelity` inputs — commit JSON fixtures under `fixtures/mdx/built-ins/` and they're cache-keyed.
- **`packages/core/src/extensions/code-mark-fidelity.ts`** has the `CodeMarkFidelity` extension that widens `Code` mark's `excludes` from `'_'` to `''`. This unblocks emphasis/strong coexisting with inline code (CommonMark `*a \`*\`*` shape). If your jsxInline interacts with the Code mark on the same span, this is load-bearing — do not narrow.
- **`@handlewithcare/remark-prosemirror@0.1.5`** has a coupled two-hunk patch at `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch`. (a) PR #3 whitespace preservation; (b) `hydrateMarks` replaced with outside-in greedy nesting. Both coupled — re-port together on any upstream bump.
- **Architectural precedents #15 (idempotent micromark attachers), #16 (phase-ordered visitor dispatchers), #17 (byte-equivalence validators gate high-risk refactors)** added to CLAUDE.md. If your work adds a remark plugin or a walker pass, these apply.
- **CommonMark corpus is 652/652 idempotent** at `KNOWN_CRASH_CEILING = 0`. Do not regress.
- **CLAUDE.md I11 row** now correctly describes R23 guard precision (not "rawMdxFallback coverage pending"). Your I14 stands as the sole rawMdxFallback byte-identity invariant.
- **New authoring guides on main:**
  - `packages/core/tests/perf/README.md` — perf framework (relevant to Item 4).
  - `packages/core/tests/health/README.md` — parse-health counter + gate contract (relevant if you add a new counter for jsx-specific fallback).

---

# Summary table

| # | Item | Bucket | Confidence | Recommended path |
|---|---|---|---|---|
| 1 | Pair I13 PBT with NG12 pins | 🔴 | HIGH | Option A (pin all 10) |
| 2 | 18 built-ins fixture registry | 🔴 | HIGH | Option A (canonical dir + typed loader) |
| 3 | Flush-left handler algorithm docs | 🔴 | MEDIUM | Option A (inline docstring) or B (standalone) depending on Rust timeline |
| 4 | PF01-PF06 calibration | 🔴 | MEDIUM-HIGH | Option A (uniform `max(2σ, 10%)`) or B (split) |
| 5 | NG12 example pins | 🟡 | HIGH | Option B (pin 4 highlighted) minimum |
| 6 | I12-I15 vs I12-I17 reconciliation | 🟡 | HIGH | Pick one count, align |

---

# Open questions I couldn't resolve

Listed for the downstream agent to look into:

1. **Where is the 18-built-ins canonical source of truth?** `packages/core/src/registry/built-ins.ts`, or inline, or TBD? (Affects Item 2's Option C viability.)
2. **Is I16 (nested-dirty serialization) truly in scope, or is it a late addition that hasn't been tested?** (Affects Item 6's resolution.)
3. **Does your planned `jsx-edited-idempotence.test.ts` already have example-based mode, or is it pure fast-check?** (Affects Item 1's implementation cost.)
4. **Rust port timeline.** If ≤3 months, Item 3 Option B (standalone algorithm doc) is justified. If year+, Option A (docstring) suffices.
5. **CI runner speed differential.** Do your PF01-PF06 thresholds assume local or CI? (Affects Item 4 option selection.)
6. **Is your Observer B "20 jsxComponents × 500 keystrokes" corpus deterministic, or generated per-run?** (Affects Item 4's baseline capture approach.)
7. **Does PF04's "no tier regresses > 10%"** operate at the tier level (e.g., whole `test:integration`) or per-test? Tier-level runs the risk of masking a within-tier regression averaged out by another test getting faster.
