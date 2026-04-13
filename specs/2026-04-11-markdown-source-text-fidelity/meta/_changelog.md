# Changelog — markdown-source-text-fidelity spec

## 2026-04-11

### Session start
- Spec seeded from user directive: "full Source Text Model adherence end to end across all scenarios/edge cases/paths" — maximalist scope, not sampling.
- Prior research in hand:
  - `reports/markdown-construct-fidelity-catalog/` (118-case probe + F1-F4 follow-ups)
  - `reports/markdown-roundtrip-fidelity-tiptap/` (ecosystem comparison)
- Baseline commit: `2d35736`

### User-confirmed scope framing (pre-intake)
- **Full maximalist** selected over 3 alternative framings
- 7 invariants (I1-I7), 15 implementation fix classes across 5 phases, 5 test tiers
- Estimated 10-12 engineering days
- Use `/nest-claude` for parallel investigation dispatch
- Consider library reuse as part of investigation (not just patching our stack)
- Test coverage framed via `/tdd` principles (behavior, vertical slice, invariants)

### Planned investigation dispatch (6 parallel /nest-claude subagents)
- I1: Library/ecosystem reuse survey (remark, markdown-it, prosemirror-markdown deeper, peritext, Obsidian/Logseq approaches)
- I2: Property-based testing tooling (fast-check, commonmark.js test suite, gfm-compliance, what existing PM tests use)
- I3: Paste handler + frontmatter edge cases (TipTap paste internals, ClipboardEvent API, YAML edge cases)
- I4: Schema attribute + custom node patterns (marker preservation via node attrs, HTML block as first-class node, ref link def design)
- I5: @tiptap/markdown v4 roadmap (upstream trajectory, timeline for ecosystem fixes)
- I6: Path × construct test matrix plan (which of 99 combos pass trivially, which need explicit harness)

### Investigations complete (6/6)
All 6 /nest-claude investigations returned with evidence. Summary:

- **I1 — Library reuse:** No external library solves the fidelity problem out of the box. remark can't preserve per-occurrence source form; prosemirror-markdown breaks 9 GFM constructs; marked is 91/118 clean (our strongest asset). Verdict: COMPOSE (patch @tiptap/markdown serialize). REFERENCE (remark-stringify as test oracle). INGEST (commonmark.json 652 + GFM spec ~200 = 970 external corpus cases).
- **I2 — PBT tooling:** fast-check + bun:test, structured generator composing CommonMark blocks (not random strings), one file per invariant. Concrete ~30-line sketch for I2 test suite provided. Wire as `test:fidelity` in turbo with independent cache key.
- **I3 — Paste + frontmatter:** Paste has NO custom handler, NO sanitization, NO markdown detection in our codebase. Frontmatter has 2 real regex bugs (CRLF, empty block). Two 1-line fixes ship Phase 1.
- **I4 — Extension designs:** 10 items (7 Tier 2 + 3 Tier 3) all sketched with code. Total ~370 LOC. Key discovery: every marked token has `.raw` field preserving source text — no custom tokenizers needed.
- **I5 — Upstream trajectory:** No v4 imminent. PR #7565 introduced non-configurable encoding Mar 2026. Markdown deprioritized on TipTap roadmap. 10+ open markdown issues with minimal maintainer response. Verdict: PATCH NOW, pin exact version, ~1 hour per minor release maintenance.
- **I6 — Path matrix:** 99 (IN × OUT) cells collapse to 77 TRIVIAL + 14 N/A + 8 VARIANT. VARIANT cells collapse to 2 test shapes: V1 (browser paste → OUTa/b/c/d) + V2 (external-write → OUTb/d window). Highest risk: IN3 × OUTc (browser paste → disk persistence).

### Decisions locked (D1, D2, D4, D6)

- **D1 LOCKED:** Adopt both CommonMark (652) + GFM (~200) external corpora + our 118. ~970 test cases. Implementation: `commonmark.json` npm package + one-time extraction of GFM spec into `fixtures/gfm-examples.json`.
- **D2 LOCKED:** Full paste hardening — markdown-detect via custom `clipboardTextParser`, DOMPurify for HTML paste, V1 Playwright tests. ~100-150 LOC + DOMPurify dep.
- **D4 LOCKED:** Patch strategy = Option D monkey-patch (entities) + dual-layer backslash fix + Tier 2 attribute preservation + Tier 3 custom node types. Pin @tiptap/markdown exact version.
- **D6 LOCKED:** Waited for I4 re-dispatch. Tier 2/3 design now concrete.

### Stated intentions (stated, unblocked unless objection)

- **D3:** Frontmatter CRLF + empty-block regex fixes ship Phase 1 (2 lines). Zero risk.
- **D5:** Keep all 5 test tiers. Tier 5 collapses to 2 test files per I6; Tiers 1-4 remain substantial.

### Updated scope (5 phases, ~10-12 days)

- Phase 1 (~2 days): Option D + backslash + frontmatter regex + PBT infra + commonmark.json + GFM extraction + 12 P0 test cases
- Phase 2 (~3 days): Tier 2 attribute preservation (7 items, ~275 LOC per I4)
- Phase 3 (~2-3 days): Tier 3 custom node types (3 items, ~95 LOC per I4)
- Phase 4 (~2 days): Paste hardening (clipboardTextParser + DOMPurify + V1 Playwright) + V2 integration test
- Phase 5 (ongoing): CLAUDE.md sanitization boundary + documented irreducible gaps + continuous-probe wiring + version-pin discipline

Total: ~900 LOC production code + ~1500 LOC test code

### Analysis pass (/analyze ultrathink) — D7/D8/D9/D10 locked

**D7 LOCKED: Option A (doc-footer linkRefDef node).** Stress-test of Option C revealed latent correctness bug (link URL edit in WYSIWYG popover → silent ref corruption via undefined serialize order). Stress-test of Option B revealed bad collab semantics ("dedupe" causes cross-client URL hijacking on shared labels). Option A survives both; marked provides `def` tokens directly; test shape is simplest.

**D8 LOCKED: Paste UX forks to separate spec.** Analysis revealed original 3 options (conservative/aggressive/heuristic) were all flawed; two better alternatives (no-detection / detect+confirm-toast) exist. Rather than lock a suboptimal default inside the fidelity spec, fork paste-UX as standalone work. This spec ships V1 Playwright tests documenting CURRENT paste behavior (no handler, no sanitization) as the baseline regression oracle. CASCADE: Tier 4 scope reduced; DOMPurify dep removed; `clipboardTextParser` deferred. Frontmatter regex fix stays in Phase 4. Future Work entry required.

**D9 LOCKED: 1000 runs per invariant, STRESS_FIDELITY=1 nightly bump to 10k.** Analysis confirmed our bug classes (entity, backslash, marker normalization) are DENSE in the generator distribution — 1k catches them at ~95%+ rate. 5k/10k is diminishing returns for known bug classes; nightly bump handles unknown sparse-bug edge case. ~7s added to CI.

**D10 LOCKED: Single mega-PR with 5 atomic commits.** Matches PR #38/#42 pattern. Minimizes rebase burden on Miles's open PR #39 (1 rebase vs 2-5). ~2400 LOC single review cycle.

### Scope updated post-D8 cascade

**Tier 4 (Cross-path hardening) — REVISED:**
- V1 Playwright tests documenting current browser-paste behavior (~50 LOC) — IN
- V2 integration test for external-write Y.Text convergence window (~50 LOC) — IN
- Frontmatter CRLF + empty-block regex fixes (~2 LOC) — IN
- ~~clipboardTextParser for markdown detection~~ — DEFERRED to separate spec
- ~~DOMPurify HTML-paste sanitization~~ — DEFERRED to separate spec

Revised Tier 4 LOC: ~100 (down from ~230).
Revised total: ~770 LOC production + ~1400 LOC test code.

## 2026-04-11 (late evening) — Audit + challenger assessment via /assess-findings

### Inputs
- `meta/audit-findings.md`: 11 findings (2H, 5M, 4L)
- `meta/design-challenge.md`: 10 findings (5H, 3M, 2L)

### Accepted findings (3 — all applied)

**Challenger H2 → D4 mechanism switched: prototype monkey-patch → `bun patch`**
- Verified `bun patch` available in bun 1.3.11 (confirmed via `--help`)
- @tiptap/markdown ships .ts source that bun resolves directly → patch targets TypeScript, not compiled JS
- Benefits: type-safe, fail-loud at install, clean upgrade via `bun patch --update`
- R1 acceptance criteria updated. Phase 1 description updated. Build-time assertion removed (unnecessary with bun patch).
- Implementer note: run `bun patch @tiptap/markdown@3.22.3` as 15-minute spike to confirm monorepo workflow.

**Audit M5 → T2-8 tight/loose list preservation added**
- Verified: not in requirements OR non-goals. Gap is real.
- Marked exposes `token.loose` boolean. Same extraction pattern as T2-1 through T2-7. ~50 LOC.
- R16 requirement added. Phase 2 LOC updated (~275 → ~325).
- NG1 (blank-line count) does NOT cover tight/loose — this is a list-item-level semantic concern with different HTML rendering.

**Challenger H4 → R17 startup fidelity canary added**
- Verified: zero production observability for logical errors. `console.error` only, no structured logging for fidelity.
- Pino logger infrastructure EXISTS at `packages/server/src/logger.ts` but unused for fidelity.
- R17 (Should): round-trip `"# H&M Store\n"`, assert byte identity, log via pino. ~15 LOC.

### Audit pure fixes applied
- H1: LOC split corrected (production ~570, test ~1100, not "945 + 1400")
- H2: Path matrix corrected (82 TRIVIAL, not 77; 9 N/A, not 14)
- M3: Phase 4 vestigial "frontmatter fixes (actually in Phase 1)" bullet removed
- M6: NG4 NEVER → NOT UNLESS with trigger "untrusted authorship features"
- M7: D9 rationale softened to "pragmatic default" not "dense bug density"

### Declined findings
- Challenger H1/H5 (mega-PR challenge): user locked D10 after /analyze with evidence
- Challenger H3 (linkRefDef schema risk): low-probability in single-CLI deployment; added deployment-table note about mixed-version risk
- Challenger M8 (paste V1 awareness-without-agency): R10 now documents that test failures are expected-and-accepted

### Status: SPEC FINALIZED
All P0 decisions locked. Audit corrections applied. Challenger findings assessed. Ready for implementation.

### Future Work — new entry

- **Paste-UX spec (standalone).** Scope: choose between no-detection / conservative-silent / conservative-toast-confirm / aggressive / heuristic. Audit TipTap's paste surface, assess DOMPurify integration cost, specify sanitization boundary at paste time. Trigger: after this fidelity spec ships and V1 Playwright tests lock current behavior as the regression baseline. + corpora imports

## 2026-04-12

### /assess-findings on 6 research-surfaced considerations (staff-engineer lens)

Applied /assess-findings protocol to 6 items surfaced from the 15-editor paste+HTML survey. Evaluation lens: "architecturally best, no tech debt, best product experience, without over-engineering."

**Accepted (3):**

- **R18 (Should): Always-parse paste for text/plain.** Partially reopens D8. Archetype D (always-parse, no detection) was not among the 3 heuristics D8 evaluated — it sidesteps the detection problem entirely. Milkdown and Plate (closest architectural peers) always-parse by default. ~30 LOC `clipboardTextParser` in Phase 4. Full paste-UX (HTML, sanitization, toast) remains deferred.
- **R19 (Must): Inline-level PBT generator.** Entity corruption fires at text-node mark boundaries (code/non-code). Block-level PBT generators don't exercise this. ~30 LOC in Phase 1 arbitraries.ts.
- **R20 (Must): Link URL `&` test case.** Verified `@tiptap/extension-link/src/link.ts:347` serializes href from attrs (bypasses `encodeTextForMarkdown`). Likely safe, but unverified — 5 LOC to close the gap.

**Declined (2):**

- **htmlBlock DOMPurify NodeView rendering:** Valid UX improvement but out of scope — presentation concern in a preservation spec. T3-1 preserves HTML correctly; rendering is product UX. Added to Future Work (Identified) with full context.
- **First-save migration script:** Over-engineering a one-time cosmetic issue. Normalization diffs are expected upgrade behavior. Documented in deployment notes.

**Noted (1):**

- **Post-fix probe baseline refresh:** Already covered by R15 (Could). Operational task, not a requirement.

### Spec deltas

- D8 partially reopened (text/plain always-parse added; full paste-UX still deferred)
- NG6 updated to reflect R18 inclusion
- Phase 1 LOC: ~150 prod / ~325 test → ~185 prod / ~360 test
- Phase 4 LOC: ~100 → ~130
- Total: ~570 prod / ~1100 test → ~635 prod / ~1165 test
- Agent constraints EXCLUDE updated (R18 clipboardTextParser IS in scope)
- Agent constraints SCOPE updated (TiptapEditor.tsx for R18)
- Future Work "HTML block rich preview" expanded with evidence from survey
