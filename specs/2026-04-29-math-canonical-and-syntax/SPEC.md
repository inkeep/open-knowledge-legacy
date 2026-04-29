# Math — Canonical Descriptor + Markdown Syntax

**Status:** Draft (stub)
**Owner(s):** anubra266
**Last updated:** 2026-04-29
**Baseline commit:** `7242822b`
**Links:**
- Parent spec (5-pack scope contract this amends): [`specs/2026-04-23-cb-v2-md-foundation/SPEC.md`](../2026-04-23-cb-v2-md-foundation/SPEC.md) — promotes NG22.
- Markdown pipeline contract: [`specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md`](../2026-04-16-markdown-pipeline-engineering-health/SPEC.md) — I1–I11 invariants, NG3 ("math/footnotes/alerts outside extension set not preserved") lifted in part.
- Component blocks parent: [`specs/2026-04-14-component-blocks-v2/SPEC.md`](../2026-04-14-component-blocks-v2/SPEC.md) — descriptor / γ / PropPanel architecture (inherited verbatim).
- Mermaid un-defer framework (precedent for guarded render-dep additions): [`specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`](../2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md).

---

## 1) Problem statement

**Situation.** Math notation has no first-class path through OK today. The 5-pack ([`built-ins.ts`](../../packages/core/src/registry/built-ins.ts)) ships `Callout / img / video / audio / Accordion`; the markdown pipeline ([`packages/core/src/markdown/`](../../packages/core/src/markdown/)) has no `remark-math` and no `inlineMath` / `math` mdast handler. NG22 (cb-v2-md-foundation §3) defers descriptor work; NG3 (markdown-pipeline-engineering-health) lists math as an irreducible gap given the current extension set. Authors who paste KaTeX-flavoured docs (Wikipedia copy, Notion exports, agent-emitted technical notes) currently see their `$$…$$` and ` ```math ` fences land as paragraphs / opaque code blocks — round-trips byte-identical for fences (good) and corrupts on edit for `$$…$$` inline (bad).

**Complication.** Two distinct surfaces, one canonical store. The canonical/compat split the 5-pack already uses (`Callout` ↔ `GFMCallout`, `img` ↔ `CommonMarkImage`, `Accordion` ↔ `HtmlDetailsAccordion`) is the obvious template:
- **Canonical:** a `<Math>` JSX descriptor — single source of truth, full prop surface (formula, display vs. inline, optional caption / id), PropPanel-editable.
- **Compat (parser-only, read-only-in-slash-menu):** `DollarMath` for `$x$` / `$$x$$` and `MathFence` for ` ```math ` — γ preserves source bytes on round-trip; convert-to-canonical is identity.

But this split layers on top of two big non-trivial costs:
1. **5-pack scope lock.** [`built-ins.ts:6-7`](../../packages/core/src/registry/built-ins.ts) calls out *"five registered descriptors … the 5-pack foundation is complete at this count"*. This spec lifts the lock to a 6-pack.
2. **Markdown-pipeline first-extension since the lock.** Adding `remark-math` is the first new remark plugin since the engineering-health spec; the I1–I11 PBT suite + 118-case fidelity probe encode the no-math assumption. The R23 sentinel set (U+E000–U+E004 PUA codepoints, NG9) is full — math may need a sixth sentinel for ambiguous-dollar guards (TBD).

**Resolution.** Single spec covering both surfaces, shipped in two PRs along the existing canonical/compat seam. **Block-math only** — see D-M5 below for the inline-math scope-out.
- **Phase 1 — canonical `<Math>` descriptor.** `JsxComponentMeta` entry in `built-ins.ts` (block), KaTeX render dep behind a lazy import, no remark-pipeline change. Authors can write `<Math formula="\frac{a}{b}" />` today; γ round-trips like every other descriptor. Slash-menu insertable.
- **Phase 2 — `$$…$$` + ` ```math ` parse paths (block).** `remark-math` added with `singleDollarTextMath: false`; a post-parse transformer maps `math` mdast nodes (block — both `$$…$$` and ` ```math ` shapes) into compat descriptors `DollarMath` and `MathFence`, both `rendersAs: 'Math'`. I1–I11 extended; 118-case probe rerun; R23 audited for sentinel collisions.

This matches the Callout precedent (`<Callout>` canonical → ship; `> [!NOTE]` compat → ship) — γ-source-form preservation is the load-bearing UX promise on both sides. Every shipped descriptor is block, mirroring all 5 existing canonical-pack entries.

## 2) Goals

- **G1** — Ship `<Math>` as the 6th canonical descriptor with researched prop surface (KaTeX-as-substrate, accepts standard LaTeX math source).
- **G2** — `$$…$$` and ` ```math ` parse to compat descriptors that γ round-trips byte-identical when un-edited.
- **G3** — Single render path (`<Math>` React component → KaTeX) serves canonical + both compats. KaTeX import is lazy (first math-node mount).
- **G4** — Inherit CB-v2 architectural decisions verbatim (D1, D6, D7, D11, D13; Precedents #24, #26). No relitigation of descriptor / γ / PropPanel mechanics.
- **G5** — Extend I1–I11 invariants to cover math nodes; rerun 118-case fidelity probe; verify the two `remark-prosemirror` patch hunks still apply post-`remark-math`.
- **G6** — Promote NG22 (cb-v2-md-foundation) and partially close NG3 (markdown-pipeline) — write the closure breadcrumb in both predecessor specs per the post-ship corrigendum convention (CLAUDE.md).

## 3) Non-goals

Inherited from cb-v2-md-foundation §3 (verbatim, not re-derived): NG2, NG5, NG6, NG7, NG7a, NG9, NG10, NG11, NG13, NG14, NG16, NG19, NG20, NG21, NG24, NG31.

Added by this spec (working list — **OPEN**, expect refinement):

- **[NEVER]** NG-M1: Server-side math evaluation. `<Math>` renders display markup only; the formula string is not evaluated, simplified, or symbolically reduced. KaTeX is a typesetter, not a CAS.
- **[NEVER]** NG-M2: MathML output as the storage shape. Storage is LaTeX source on the descriptor's `formula` prop (and verbatim source bytes for `DollarMath` / `MathFence`). MathML is a render-time concern; not in the canonical store.
- **[NOT NOW]** NG-M3: MathJax substrate as an alternative renderer. KaTeX-only at ship; MathJax is feasible later (drop-in renderer swap behind the same descriptor) when KaTeX feature gaps surface as concrete authoring friction.
- **[NOT NOW]** NG-M4: Live-rendered inline-math editing in WYSIWYG (formula picker, palette, cursor inside KaTeX output). Phase 1 ships PropPanel-only editing — the `formula` string lives in the prop surface, not the rendered DOM. Promotion path: NG14 in CB-v2 governs live inline editing across all descriptors.
- **[NOT NOW]** NG-M5: AsciiMath / Typst / pandoc math-language input. LaTeX-only at ship; the canonical surface is `formula: string` + `language?: 'latex'` for forward compatibility.
- **[NOT NOW]** NG-M6: Equation numbering, cross-references, `\label`/`\ref` resolution across documents. Out of foundation scope.
- **[NOT NOW]** NG-M7: Print / paged-media math layout (column-break-aware breaking, page-fit display math). KaTeX renders inline-flow only.
- **[NOT NOW]** NG-M8: Wikipedia-paste-as-KaTeX recognizer (the screenshot's "Tip" box). Useful UX, but distinct from storage / parse work — own follow-up after Phase 2 lands.
- **[NOT NOW]** NG-M9: GFM math extension (the proposed `\$\$…\$\$` block syntax in GFM). Track upstream remark-gfm; auto-promotes if the GFM extension lands and is enabled — descriptor surface unaffected.
- **[NOT NOW]** NG-M10: Caption / figure-wrap on `<Math>`. Owned by Frame v2 (media-wrapper roadmap).
- ~~**[NOT NOW]** NG-M11~~ *(WITHDRAWN 2026-04-29 by Phase 3 — inline math (`$$x$$` mid-paragraph, `<InlineMath>`) now lives via the standalone `mathInline` PM atom + KaTeX NodeView. The "every canonical descriptor is block" invariant is preserved by NOT registering InlineMath as a descriptor; it's a PM-level path that bypasses the registry. NG14 (jsxInline render-less) is also preserved — inline math gets its own atom rather than extending jsxInline. Single-dollar `$x$` is intentionally NOT a math syntax per D-M5.)*

## 4) Functional requirements

> **Conventions.** "Canonical" = the `<Math>` descriptor (slash-menu insertable, full prop surface). "Compat" = read-only-in-slash-menu, source-form-preserving descriptors that share `<Math>`'s renderer.

- **FR-M1 — Canonical `<Math>` descriptor.** Add a 6th `JsxComponentMeta` to `builtInComponents` in `built-ins.ts`:
  - `name: 'Math'`, `surface: 'canonical'`, `category: 'content'`, `icon: 'Sigma'` (lucide), `displayName: 'Math'`.
  - `hasChildren: false`, `isSelfClosing: true`. Block (every existing canonical descriptor is block; the registry surfaces this as `mdxJsxFlowElement`).
  - Props: `formula: string` (required, autoFocus); `id?: string` (deep-link anchor); `language?: 'latex'` (forward-compat hint, default `'latex'`). No `display` prop — block-only at ship per D-M5; inline math is NG-M11.
  - `serialize: (node, ctx) => emitMdxJsx('Math', node, ctx)`.

- **FR-M2 — Render component.** New React component `packages/app/src/components/Math.tsx`:
  - Lazy-imports `katex` + `katex/dist/katex.min.css` on first mount (Phase 1 baseline measurement target: ≤30 KB transferred until first math node renders).
  - Calls `katex.renderToString(formula, { displayMode: true, throwOnError: false })`; renders the result via `dangerouslySetInnerHTML` inside a `<div>` wrapper (block-only; FR-M1).
  - On parse error: renders the formula source verbatim in a tagged error span (red underline + tooltip). Never crashes.
  - Storage-layer fidelity contract (CLAUDE.md §"Storage-layer fidelity contract") — no sanitization at the storage layer; KaTeX HTML output is render-time.

- **FR-M3 — `remark-math` parse path.** Add `remark-math` to the unified pipeline ([`packages/core/src/markdown/pipeline.ts`](../../packages/core/src/markdown/pipeline.ts)) configured with `singleDollarTextMath: false` (D-M5). Yields `math` mdast nodes for `$$…$$` blocks and ` ```math ` fenced code (the latter via the existing `code` mdast → math handler dispatch).

- **FR-M4 — `DollarMath` compat descriptor.** A dedicated promoter (`packages/core/src/markdown/math-promoter.ts`, wired between `imagePromoterPlugin` and the merged Phase B walker) maps three input shapes to `DollarMath`:
  - `math` mdast (block — multi-line `$$\n…\n$$` from remark-math) → `mdxJsxFlowElement(DollarMath, {formula})` directly.
  - paragraph whose sole child is `inlineMath` (single-line `$$x$$` — remark-math classifies single-line as inline; promoting standalone-paragraph form to block matches author intent and mirrors the image-promoter `paragraph > image` → flow pattern).
  - leftover `inlineMath` mid-paragraph (`prose $$x$$ prose`) → text passthrough emitting `$$value$$` verbatim. NG-M11 keeps live inline rendering deferred; the passthrough preserves authoring intent without triggering the unknown-mdast guard.

  On serialize (dirty path), `DollarMath` emits back to `math` mdast preserving the `$$…$$` form via mdast-util-math's stringifier. Compat surface: read-only in slash menu; PropPanel allows `formula` edit; `surface: 'compat'`, `rendersAs: 'Math'`.

- **FR-M5 — `MathFence` compat descriptor.** Same transformer dispatches ` ```math ` fenced code blocks (mdast `code` with `lang: 'math'`) into `mdxJsxFlowElement(MathFence, {formula, source: 'fence'})`. Serializes back to a fenced ` ```math `…``` ``` block. Slash-menu read-only; `rendersAs: 'Math'`.

- **FR-M6 — Slash-menu entry.** `<Math>` exposed via slash menu under category 'content' with searchTerms `['math', 'latex', 'equation', 'formula', 'katex']`. Compat descriptors (`DollarMath`, `MathFence`) filtered out per existing `surface === 'canonical'` slash-menu rule.

- **FR-M7 — Storage shape conformance.** All three descriptor names round-trip through Y.XmlFragment ↔ Y.Text identically to the existing 5-pack (no new bridge primitives). `applyAgentMarkdownWrite` / `applyAgentUndo` flow unchanged. The bridge invariant (CLAUDE.md §"Three invariants" #1) holds for math nodes.

- **FR-M8 — Source-mode highlight.** Source-mode CodeMirror gets `math` fence highlight (extend the markdown-language fence-language map) so ` ```math ` fences highlight as math/LaTeX. No inline-syntax highlight work — block-only at ship.

- **FR-M9 — `$$` block-vs-prose guard.** `$$…$$` outside paragraph-leading position must still parse as block math (remark-math's normal block detection). Bare `$$` in code spans or prose escaping (`\$\$`) must not promote. `singleDollarTextMath: false` (D-M5) eliminates the bigger ambiguity surface around bare `$`. Add a targeted PBT (`math-block-guard.precision.test.ts`) covering 10+ adversarial cases (escaped dollars, `$$` inside code spans, `$$` mid-paragraph, currency followed by display math).

- **FR-M10 — R23 sentinel audit.** Verify KaTeX's HTML output does not collide with the existing R23 sentinel set (U+E000–U+E004 PUA). KaTeX uses no PUA codepoints in default output, but `\char"E000` and similar can synthesize them — defense is the existing `r23-guard` precision suite, extended with a math-specific case.

## 5) Decisions

- **D-M1 [REVISED 2026-04-29]** — Single canonical block descriptor `<Math>` for the registry; inline math lives outside the registry via the `mathInline` PM atom (Phase 3, NG-M11 withdrawn). Every canonical descriptor still block; `jsxInline` still render-less. Inline math is its own first-class PM extension paired with a slash-menu entry and a KaTeX NodeView. `<InlineMath formula="…" />` MDX form maps directly to `mathInline` via a special-case in the `mdxJsxTextElement` handler.
- **D-M2 [LOCKED]** — Two compat descriptors, not one. `DollarMath` (`$$…$$`) and `MathFence` (` ```math `) are separate names because their source-form serializers diverge: `DollarMath` emits `math` mdast preserving the `$$…$$` delimiter shape; `MathFence` emits a fenced `code` mdast with `lang: 'math'`. A single compat would either collapse the source-form distinction (γ regression) or carry a discriminator prop (cosmetic split with no rendering benefit). Two compats is the cheaper, more legible shape — mirrors `GFMCallout` / `HtmlDetailsAccordion` co-existing as separate compat names.
- **D-M3 [LOCKED]** — KaTeX renders in the browser, not at parse time. Storage is LaTeX source. Reason: storage-layer fidelity contract (CLAUDE.md §"Storage-layer fidelity contract") — render-time concerns stay out of the CRDT.
- **D-M4 [LOCKED]** — Lazy-import KaTeX. The current pack ships ~0 KB of math; first math-node mount adds ~270 KB gzipped. The Mermaid removal precedent ([`built-ins.ts:43-45`](../../packages/core/src/registry/built-ins.ts)) sets the bar — math ships with a working renderer, not a stub, but the cost stays opt-in per document.
- **D-M5 [LOCKED — Phase 3 final]** — `singleDollarTextMath: false` at parse time. Single `$x$` is NEVER a math syntax; it stays prose. Inline math is exclusively `$$x$$`, `<InlineMath formula="x" />`, or the `/inline math` slash entry. **Why:** intermediate Phase 3 turned `singleDollarTextMath` on to support `$x$` shorthand, but a paired-dollar collision (`"Pay $5 to $10 dollars"`, `costs $5.00 plus tax. ... $PATH`) immediately surfaced in the showcase doc — micromark-extension-math claimed everything between paired `$`s as math. False alarms in currency / shell-var prose were too frequent to be acceptable. The double-dollar requirement matches Notion + Wikipedia paste behavior and removes the entire ambiguity surface in one move.
- **D-M6 [LOCKED]** — `$$x$$` matches remark-math's standard semantics: multi-line `$$\n…\n$$` is block (`math` mdast → `<DollarMath>` → `<Math>` render); single-line `$$x$$` (or `$$x$$` mid-paragraph) is inline (`inlineMath` mdast → `mathInline` atom → KaTeX inline render). Phase 2's paragraph-promotion path that auto-promoted single-line `$$x$$` to block was dropped in Phase 3 — single-line is now inline (matching the reference editor's behavior). Authors who want block-display from a single-line source use multi-line or the explicit `<Math formula="…" />` JSX.
- **D-M7 [LOCKED]** — `formula` PropPanel editor: plain `<textarea>`. Mirrors Callout's `type` shipping as a plain `<select>` (cb-v2-md-foundation NG16 — "PropPanel has no extension point"). Custom editor (CodeMirror-in-PropPanel with LaTeX-mode highlight) lands under NG16 promotion alongside Callout's icon-grid picker — no per-component bypass.
- **D-M8 [LOCKED]** — Source-mode highlight: ` ```math ` fence via the existing fence-language map only. No custom inline highlight (no inline math at ship; and no other inline syntax in the repo carries a custom CodeMirror highlight extension).

## 6) Phasing

Two PRs, gated independently. Phase 2 cannot land before Phase 1 (compat descriptors `rendersAs: 'Math'` and need the canonical to exist).

### Phase 1 — Canonical `<Math>` descriptor

- Add `Math` to `builtInComponents` (FR-M1) — amend the 5-pack scope contract comment in `built-ins.ts:6-7` to "6-pack foundation".
- Add `packages/app/src/components/Math.tsx` (FR-M2) + KaTeX dep + lazy-import wiring.
- Add slash-menu entry (FR-M6).
- Add Math-specific tests: descriptor round-trip, lazy-import behavior, parse-error fallback rendering.
- Update [`PRECEDENTS.md`](../../PRECEDENTS.md) only if a new precedent surfaces (none anticipated; this is descriptor-pattern reuse).
- Update [`CLAUDE.md`](../../CLAUDE.md) Markdown-pipeline section: NG3 closure breadcrumb (remains for footnotes / alerts-outside-extension-set; math removed).
- Cb-v2-md-foundation SPEC.md: NG22 corrigendum breadcrumb.

### Phase 2 — `$$…$$` + ` ```math ` parse paths

- Add `remark-math` (FR-M3).
- Add `DollarMath` + `MathFence` compat descriptors (FR-M4, FR-M5).
- Implement post-parse transformer (in the existing Phase B `unist-util-visit` dispatch — single-pass per pipeline.ts convention).
- Add `dollar-ambiguity-guard.precision.test.ts` (FR-M9).
- Add Math invariants — extend I1, I3, I4 PBT generators to emit `inlineMath` / `math` nodes; add a Math-specific handler PBT (`math-edge.precision.test.ts`) for edge cases (escaped delimiters, nested braces, comment-only formulas).
- Re-run the 118-case fidelity probe at `tech-probes/r1-preflight-gate/`.
- Verify the two `remark-prosemirror` patch hunks still apply (CLAUDE.md upgrade protocol).
- Add `math` fence highlight to source-mode CodeMirror (FR-M8).
- Markdown-pipeline-engineering-health SPEC.md: NG3 corrigendum breadcrumb.

## 7) Risks

- **R-M1 — Patch drift.** `remark-prosemirror` patches (pinned `0.1.5`) have failed cleanly twice in the history. `remark-math` lands at the parse-tree layer that those patches operate on — possible interaction. Mitigation: dry-run the patch apply against a `remark-math`-installed tree before Phase 2 PR; capture in evidence.
- **R-M2 — `$` ambiguity in agent-emitted prose.** Agents (P2) emit text containing literal `$` in shell snippets, currency, and template literals. FR-M9 + remark-math defaults are the primary defense; PBT is the regression net. Risk vector: a borderline construct that the PBT doesn't cover slips through and corrupts agent output silently. Tracked under: residual-measurements append on first math-related fidelity regression.
- **R-M3 — Bundle-size budget.** KaTeX gzipped ~270 KB. Lazy-import keeps the cost off documents that don't use math, but a math-heavy KB pays it on every load. Mitigation: lazy + per-instance memoization of `katex.renderToString`.
- **R-M4 — KaTeX HTML stability.** KaTeX's HTML output structure can shift across minor versions; the `Math.tsx` renderer treats KaTeX HTML as opaque, so structural shifts only affect rendering not storage. Pin KaTeX to a specific minor (working set: `^0.16`) and bump only with a fidelity-probe re-run.
- **R-M5 — Scope-lock amendment friction.** The 5-pack scope contract is an explicit invariant. Lifting to 6-pack sets a precedent for further additions. Mitigation: this spec is the documented case for the lift, with NG-M1–NG-M10 as the boundary.

## 8) Open questions

All D-M decisions locked in §5. Remaining items:

- Slash-menu insertion: empty `<Math formula="" />` with PropPanel auto-focus on the `formula` textarea, or a one-step modal that prefills before insertion? Default to PropPanel auto-focus (consistent with other descriptors' `autoFocus: true` PropDef metadata).
- Wiki-link interaction inside `formula`: a `[[Page Name]]` substring inside a LaTeX formula MUST stay opaque (formulas are LaTeX source, not OK markdown). Add a unit test asserting no wiki-link extraction passes through `formula` content.
- Commission `reports/cb-v2-math-superset-research/` alongside Phase 1 PR? Not strictly required (Math has only one mainstream substrate — KaTeX vs MathJax), but matches the cb-v2-md-foundation precedent of pairing each new descriptor with a superset-research report.

## 9) Success metrics

- **Adoption (lagging).** Documents containing at least one Math-family descriptor (`Math` / `DollarMath` / `MathFence`) — sample after 2 weeks post-Phase-2 ship.
- **Fidelity (leading).** I1–I11 + 118-case probe pass on Phase 2 PR. Zero regressions on the existing 5-pack.
- **Bundle.** First-load JS unchanged on math-free documents (within ±5 KB noise floor). First-math-mount adds ~270 KB transferred (target).
- **Round-trip stability.** `$$x$$` and ` ```math ` round-trip byte-identical when un-edited (compat γ source-form preservation). 100% on the corpus.

## 10) See also

- [`built-ins.ts`](../../packages/core/src/registry/built-ins.ts) — descriptor manifest (target of FR-M1, FR-M4, FR-M5).
- [`pipeline.ts`](../../packages/core/src/markdown/pipeline.ts) — unified pipeline assembly point (target of FR-M3 + post-parse transformer dispatch).
- [`PRECEDENTS.md`](../../PRECEDENTS.md) — #9 schema-add-only, #14 client-side observer write paths deleted, #24 per-session origin discipline.
- [`reports/CATALOGUE.md`](../../reports/CATALOGUE.md) — pre-existing math research (none registered as of baseline; commission a `cb-v2-math-superset-research/` report alongside Phase 1 PR if scope expands).
