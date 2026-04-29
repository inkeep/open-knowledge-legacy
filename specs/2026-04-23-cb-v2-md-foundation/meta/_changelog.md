# Changelog — CB-v2 MD-Foundation

## 2026-04-23 — Spec scaffold

**Session context:** Multi-hour design conversation narrowing CB-v2 scope. Intake complete, scaffold complete, moving to backlog extraction next.

**Created:**
- `SPEC.md` — PRD + Technical Spec; 850+ lines
- `evidence/inherited-architectural-decisions.md` — CB-v2 SPEC pointer doc (no text duplication)
- `evidence/cut-inventory.md` — full delete/rewrite/add surface map from Explore pass
- `evidence/pr-270-coordination.md` — adjacent-spec independence + consolidation NG24 plan
- `evidence/research-report-pointers.md` — 5 research reports referenced by component

**Baseline commit:** `315deae6` (docs: CB-v2 5-pack superset research reports)

**Key decisions locked this session:**
- D-MF1 independent ship from PR #270
- D-MF2 DIY all 5 React components; zero fumadocs-ui React + zero `--color-fd-*` CSS
- D-MF3 `react-medium-image-zoom` direct dep with fumadocs-derived patterns
- D-MF4 cut compound-wrappers + typed-children-guard + EditorContext + InlineTOCView; retract Precedent #25
- D-MF5 GFM alerts only (Docusaurus + Obsidian foldable → Future Work)
- D-MF6 PropPanel generic 5-type switch (custom editors → Future Work with research preserved)
- D-MF7 greenfield; no migration surface
- D-MF8 delete i16 (nested-dirty PBT — compound-only consumer)
- D-MF9 reference CB-v2 SPEC rather than copy
- D-MF10 consolidation of wikiLinkEmbed with 5-pack render path is Future Work NG24
- D-MF11 Callout descriptor enum narrows to 5 GFM-matching types (note/tip/important/warning/caution); 9-value superset deferred to NG26 (promotes with NG17/NG18)
- D-MF12 Video is pure HTML5 `<video>` wrapper; no YouTube/Vimeo URL sniffing (matches Mintlify's explicit-iframe pattern + Fumadocs has no Video at all); NG27 defers URL auto-promote; NG28 defers rich iframe NodeView
- D-MF13 Callout has NO foldable props (collapsible/defaultOpen); matches Mintlify (Callout static; collapsibility via separate Expandable = our Toggle) + Fumadocs (no foldable Callout at all); NG29 defers foldable Callout; users compose `<Toggle><Callout>...</Callout></Toggle>` today

## 2026-04-23 (session 2) — Phase 4 iterate cascade

**Session context:** Opening Phase 4 iterate post-batched P0 resolution (D-MF11/D-MF12/D-MF13). Scanned for cascade effects from the narrowing pattern before Phase 5 audit.

**Cascade narrowings locked:**
- D-MF14 Toggle drops `variant` enum. Ships 6 props matching Mintlify Accordion + HTML5 `name` (no `variant`). Symmetry with D-MF11/D-MF12/D-MF13: research-recommended prop comes from de-prioritized Notion audience; precedent #9 (schema-add-only-forever) makes drop-now/add-later asymmetric. NG30 defers Notion-color-map absorption.
- D-MF15 Unknown-attr contract on narrowed descriptors made explicit. γ AttrBag preserves undeclared attrs (source-raw), renderer ignores (typed-prop signature), PropPanel hides (descriptor-declared only). Generalizes storage-layer fidelity contract to descriptor narrowing. Audit-relevant: ensures `<Callout collapsible>` authored against broader/future descriptors round-trips losslessly through the narrow surface.

**Files touched:**
- SPEC.md — FR-5 narrowed to 6 props; D-MF14 + D-MF15 added to Decision Log; NG30 added to Non-goals
- evidence/research-report-pointers.md — Toggle pointer updated for 6-prop narrow

**Next step:** Phase 5 audit — spawn /audit subprocess on SPEC.md + cut-inventory + research-pointers.

## 2026-04-23 (session 2) — D-MF16 rename + audit cascade

**Session context:** Mid-audit-dispatch, user directive "lets do Accordion without accordion group" flipped Toggle → Accordion. Applied rename cascade across SPEC.md + all evidence files concurrently with audit findings landing.

**Decision added:**
- D-MF16 Toggle → Accordion rename. 6-prop surface matches Mintlify Accordion 1:1 (was cosmetic drift under Toggle name). Ships standalone — no `<Accordions>` / `<AccordionGroup>` parent wrapper required. Fumadocs `Accordion` + `Accordions` cut in same commit (clean replacement, not schema extension). Declarative exclusive-accordion grouping via HTML5 `<details name="...">` without a wrapper component.

**Files touched by rename:**
- SPEC.md — all `Toggle` → `Accordion` references; D-MF13 rationale refined (removed stale `<Expandable> = our Toggle` citation; now references primitive-separation pattern); NG19 language updated to clarify Accordion ships standalone + wrapper is additive-not-prerequisite
- evidence/research-report-pointers.md — Toggle → Accordion rename + 6-prop narrow reflection
- evidence/cut-inventory.md — Toggle → Accordion rename + fumadocs-Accordion disambiguation (namespace collision documented) + refreshed Callout/Video/Audio LoC + narrowing-reflected descriptions (was M3 stale text per audit H2)
- evidence/inherited-architectural-decisions.md — Callout PropDef-coverage description refreshed (was 9-types + foldable; now 5 GFM types + static per D-MF11/D-MF13)

**Audit findings applied (2026-04-23 /audit subprocess):**
- H1 FACTUAL (HIGH): `remark-github-alerts` (hyoban) mutates blockquotes with `data.hName: 'callout'`, does NOT emit `mdxJsxFlowElement`. Q-MF1 updated to LOCK path (a): 2-step with ~40-LoC post-plugin transformer. FR-7 + P1 journey + A-MF4 + §9 Proposed Solution all refreshed to match.
- H2 COHERENCE (HIGH): stale evidence text describing 9-type Callout + foldable props + Video URL sniffing — refreshed across cut-inventory.md + inherited-architectural-decisions.md
- M4 FACTUAL: D-MF13's "Mintlify Expandable = our Toggle" citation incorrect (Expandable is 2-prop; ours is 6-prop Accordion-shape) — rewritten to reference primitive-separation pattern instead of prop-surface match
- M5 FACTUAL: `remark-github-alerts` author attribution fixed (Remco Haszing → hyoban)
- L6 LOW: compound-wrappers.tsx 432 → 431 LoC
- L7 LOW (bridgeIdPlugin PR #168 consumer unverifiable from worktree): accepted as provisional forward-reference; A-MF3 documents explore-confirmed "no other consumers" claim

**Challenger findings surfaced for user decision (NOT yet applied):**
- Angle 1 HIGH (Callout foldable audience mismatch): D-MF13 workaround `<Accordion><Callout>` is OK-specific idiom; AI agents emit `> [!note]-` natively (deferred to NG18). Spec's defense: D-MF15 graceful-degradation preserves intent losslessly; NG18 adds rendering when demand surfaces. Open for user reassessment.
- Angle 2 MEDIUM (5-pack coherence): §1 unifying thread "MD↔MDX equivalence via standard plugins" genuinely applies to Callout + Accordion only. Image/Video/Audio are "HTML5-element equivalence; MDX is richer form." Spec framing should acknowledge this honestly. Open for user decision on §1 refresh.
- Angle 3 MEDIUM (i16 NG25 deletion overreach): `<Accordion><Callout>` IS nested jsxComponent exercising the `hasDirtyDescendant` walk; i16 should be re-fixtured to 5-pack nested compositions, not deleted. Challenger proposes flipping NG25 → restore i16 with 5-pack fixture. Open for user decision.

**Next step:** Present challenger-surface findings to user for judgment (Phase 6 assess-findings).

## 2026-04-23 (session 2) — assess-findings resolutions (D-MF17, D-MF18, §1 reframe)

**Session context:** User responded to the three batched judgment calls from Phase 6 assess-findings. Decisions:

1. **Angle 1 (Callout foldable) → flipped to option (c) with scope narrowing.** User directive: "lets support collapsible Callout so we can fully support obsedian syntax (within gfm types)."
2. **Angle 2 (§1 coherence) → option (a) two-tier refresh, with user framing correction.** User pushed back on my "MD↔MDX equivalence" phrasing: "we said mdx would be a supersed of md, not neccessarily 1:1 (where there was md plugins/syntax equivalent)." Refreshed §1 to state MDX-as-strict-superset with two shapes (MD-syntax-plus-MDX-richer vs MDX-primary-with-HTML5-substrate).
3. **Angle 3 (i16 restoration) → option (a) flip NG25.** User directive: "agree on (a) for 3."

**Decisions added:**
- D-MF17 Callout foldable props `collapsible` + `defaultOpen` shipped within GFM 5-type scope. Reverses D-MF13 (marked SUPERSEDED). Obsidian `> [!TYPE]+/-` syntax parser added via extended FR-7 transformer (~60 LoC). Promotes NG18 partially (foldable-within-GFM ships; broader Obsidian type extensions remain deferred under NG26). Withdraws NG29.
- D-MF18 i16 nested-dirty PBT restored with 5-pack fixture rewrite. Reverses D-MF8 (marked SUPERSEDED). Covers `<Callout><Accordion>`, `<Accordion><Callout>`, same-type nesting, `<Callout collapsible>` wrapping `<Accordion>`. Withdraws NG25.

**Files touched:**
- SPEC.md — §1 two-tier superset framing; FR-1 (7 props); FR-7 (~60 LoC transformer with Obsidian `+/-` detection); P1b new journey (foldable authoring); I16 status RESTORED; I20 new invariant (Obsidian foldable round-trip); D-MF13 + D-MF8 marked SUPERSEDED; D-MF17 + D-MF18 added; D-MF15 example updated (removed stale `<Callout collapsible>` ref); NG18 + NG25 + NG29 withdrawn
- evidence/cut-inventory.md — Callout LoC bumped (120 → 150) + foldable-prop notation; i16 restoration note
- evidence/research-report-pointers.md — Callout section refreshed for 7 props + foldable-within-GFM parse path
- evidence/inherited-architectural-decisions.md — boolean PropDef coverage refreshed to reflect Callout now ships 2 booleans

**Audit findings status after this round:**
- H1 (FR-7 transformer shape) — APPLIED + extended for Obsidian foldable
- H2 (stale evidence text) — APPLIED across all three evidence files
- M4 (D-MF13 Mintlify Expandable citation) — APPLIED (decision SUPERSEDED; citation moot)
- M5 (remark-github-alerts author hyoban) — APPLIED
- L6 (432 → 431 LoC) — APPLIED
- L7 (bridgeIdPlugin PR #168 forward-reference) — ACCEPTED AS-IS (A-MF3 documents explore-confirmed "no other consumers"; PR #168 claim is forward-reference by design)
- Challenger Angles 1, 2, 3 — ALL RESOLVED (1 and 3 via flips; 2 via framing refresh)

**Next step:** Phase 6 (Verify and finalize) — close Task 35, transition to Task 36; run drift check on paths cited; present final spec summary.

**Session inputs:**
- 5 research reports committed 315deae6
- Audit findings at `reports/worldmodel-pr-165-component-blocks-v2/audit-mvp-component-claims.md`
- CB-v2 SPEC and evidence files
- PR #270 metadata + file list
- Codebase explore pass identifying consumers of cut items

**Next step:** Phase 3 backlog extraction (3-probe walkthrough; priority triage).

## 2026-04-25 — Canonical / compat descriptor split (post-ship architecture pivot)

**Session context:** User-driven architecture conversation discovered that the
shipped pipeline destroys source-form identity at parse time (`callout-
transformer`, `image-promoter`, `details-accordion-promoter` all collapse to
the canonical `componentName`), and the dirty-path serializer always emits
MDX JSX regardless. Result: a GFM `> [!NOTE]` opened, edited, saved becomes
`<Callout type="note">…</Callout>`. PropPanel further always shows the
canonical's full superset, so editing an MDX-only prop on a GFM-form node
silently promotes to MDX.

**Decision: canonical / compat descriptor split.** Descriptor identity carries
the source form. Three new compat descriptors (`GFMCallout`,
`CommonMarkImage`, `HtmlDetailsAccordion`) land alongside the 5 canonicals
(Callout, Image, Video, Audio, Accordion). Compat descriptors are read-only
(filtered out of the slash menu); each owns a `serialize()` that emits its
native source form, so `> [!NOTE]` round-trips back to `> [!NOTE]` even
through edits. Both surfaces render through the canonical's React component
via a render-time `translateProps` step (identity for v1's three compats).
PropPanel auto-scopes to the active descriptor's `props`. Compat nodes
expose a "Convert to <canonical>" affordance for users who want the
canonical's full superset.

**Decisions added:**
- D-MF20 — descriptor identity carries source form. Discriminated-union
  `JsxComponentMeta = CanonicalMeta | CompatMeta` on `surface: 'canonical' |
  'compat'`. Required `serialize: (node, ctx) => mdast` on both arms.
  Compat-only fields: `rendersAs`, `translateProps`, `convertibleTo`.
  Reverses the parse-time-coalescing-only model that was implicit in
  D-MF11/13/17 (those decisions about prop set + foldable extensions stay;
  the new layer is *which descriptor the source form claims to be*).
- D-MF21 — slash menu filtered to `surface === 'canonical'`. No
  user-facing way to insert a compat-form node from scratch — they only
  arise from authored markdown source. Convert-to-canonical is the
  promote path; there's no demote path.

**Files touched (code):**
- `packages/core/src/registry/types.ts` — discriminated union + new
  `SerializeContext`, `TranslateProps` types.
- `packages/core/src/registry/built-ins.ts` — 5 canonicals tagged + 3
  compat entries added.
- `packages/core/src/markdown/serialize-helpers.ts` (new) —
  `reconstructAttrs`, `propToMdxJsxAttribute`, `emitMdxJsx` extracted so
  descriptors can import without circular deps.
- `packages/core/src/markdown/index.ts:1043-1083` — dirty branch
  becomes `meta.serialize(pmNode, ctx)` dispatch.
- `packages/core/src/markdown/mdast-augmentation.ts` —
  `MdxJsxFlowElementData.htmlBoundary` (escape hatch for compat
  descriptors whose emit is raw HTML wrapping a markdown body, e.g.,
  `<details>...</details>` body via `state.containerFlow`).
- Three parser retargets:
  `callout-transformer.ts:188` `Callout` → `GFMCallout`,
  `image-promoter.ts:116` `Image` → `CommonMarkImage`,
  `details-accordion-promoter.ts:178,269` `Accordion` →
  `HtmlDetailsAccordion`.
- `packages/app/src/editor/registry/index.ts:67-74` — `buildDecoration`
  branches on `surface`. Compat descriptors look up `componentMap[meta.
  rendersAs]`. Throws at module init if `rendersAs` is dangling.
- `packages/app/src/editor/extensions/JsxComponentView.tsx` — applies
  `descriptor.translateProps(primitiveProps)` for compat surface; builds
  `onConvert` factory when `convertibleTo` is set.
- `packages/app/src/editor/components/PropPanel.tsx` — signature now
  `descriptor: JsxComponentDescriptor` (was `props: PropDef[]`). Renders
  Convert button when `surface === 'compat' && convertibleTo`.
- `packages/app/src/editor/slash-command/component-items.ts:198` —
  filter to `surface === 'canonical'`.
- `callout-transformer.ts` bonus fix — strips the residual title-line
  paragraph the alerts plugin leaves when title is on the marker line +
  body separated by a blank `>` (without it, `> [!NOTE] hi\n>\n> body`
  duplicated the title text on every dirty cycle).

**Files touched (tests):**
- `packages/core/src/registry/canonical-compat.test.ts` (new) — 12 unit
  tests locking the architecture: surface-discriminator presence,
  `rendersAs` resolution, identity `translateProps`, `convertibleTo`
  shape, prop-set subset relation.
- `packages/core/src/registry/registry.test.ts` — 5+3+wildcard count
  check; canonical-only `searchTerms` requirement.
- `packages/app/tests/fidelity/invariant-i13.test.ts` — PBT scoped to
  canonical fixtures (compat fixtures' source-form syntax can't survive
  PBT-generated pathological titles like `_a_*<>` through the
  remark-mdx-emphasis-inside-JSX parse). Added clamp for invalid `type`
  values in GFMCallout serializer (PBT generates non-enum strings).
- `packages/app/tests/fidelity/invariant-i18.test.ts`,
  `invariant-i19.test.ts`, `invariant-i20.test.ts`,
  `invariant-i21.test.ts` — `stripGammaAttrs` now also strips
  `componentName` for cross-form prop-shape comparison; updated explicit
  componentName assertions to the new compat names.

**Source-form fidelity invariants (new):**
- A user-edited GFM `> [!NOTE]` (or `> [!NOTE]+`) round-trips back to
  GFM syntax, NOT to `<Callout type="note">…</Callout>`.
- A user-edited CommonMark `![alt](src)` round-trips to CommonMark
  syntax, NOT to `<Image src="…" alt="…" />`.
- A user-edited HTML5 `<details>` round-trips to `<details>` HTML
  block, NOT to `<Accordion title="…">…</Accordion>`.
- All three surfaces render through the canonical's React component
  (so the editor visual is identical to the canonical authoring form),
  but storage preserves source-form identity through PM `componentName`.

**Tradeoffs / scope notes:**
- Mintlify `<Note>` compat descriptor was discussed and dropped from
  v1. It would be a true rename case (storage `heading` ≠ source
  `title`); v1's three compats all use identity `translateProps`
  because their prop names already match canonical's spelling. Adding
  a Mintlify compat is additive; no architectural change required.
- Convert-to-canonical UX shipped in v1 with identity remaps. Future
  compats whose prop names diverge from canonical's would supply
  non-identity `convertibleTo.remap` functions.
- Bundle size: all-JS-chunks ceiling raised 1050 → 1100 kB (+50 kB) to
  accommodate the three additional compat descriptors and main's
  recently-merged activity-panel + statistics-footer features. Main
  app bundle stays flat (213 kB / 230 kB ceiling).

**Audit findings status:** Clean. Architecture-locking unit tests cover
the new contract; existing fidelity invariants (I13/I18/I19/I20/I21)
adapted to the new contract.

**Next step:** Cloud review iteration on PR #310.

## 2026-04-27 — Lowercase media canonical pivot (corrigendum)

Canonical `Image` / `Video` / `Audio` replaced with lowercase `img` /
`video` / `audio`. PropPanel gains an "Advanced" collapsible section
for the HTML-native attribute tail (`srcset`, `sizes`, `decoding`,
`fetchpriority`, `crossorigin`, `referrerpolicy`, …). `caption` and
`zoom` dropped from descriptor props — Frame v2 will host caption as a
compositional wrapper (`<Frame caption="…"><img/></Frame>`); zoom is
always-on inside the Image React component for now, with `<Frame
zoom={false}>` as the planned opt-out path.

`displayName` stays capitalized so the slash-menu label and PropPanel
header read "Image" / "Video" / "Audio". `componentMap` keys flip to
lowercase HTML-tag form. `CommonMarkImage` compat reroutes through the
canonical `img` (`rendersAs: 'img'`, `convertibleTo.target: 'img'`);
the Convert button label uses target descriptor's `displayName` so it
still reads "Convert to Image".

Rule formalized in JSDoc above `builtInComponents`: media converges
with HTML primitives because HTML has primitives rich enough; non-
media (`Callout`, `Accordion`) stays capitalized canonical because
HTML has no primitive rich enough to converge with (`<details>` is
structurally a subset of Accordion; HTML has no Callout primitive).

Greenfield directive — no user-content migration. The
`autolink-void-html-guard` carve-out lets self-closing `<img/>` /
`<video/>` / `<audio/>` reach remark-mdx as `mdxJsxFlowElement`
instead of being PUA-protected as raw HTML.

Authoritative implementation in this branch (cb-v2-md-foundation
follow-up commits, US-001 through US-008).


## 2026-04-28 — Corrigendum: Convert button + `convertibleTo` machinery trimmed

Following the cb-v2-prop-file-upload spec's D8 LOCKED, the post-pivot
authoring model treats the canonical/compat distinction as a pure
implementation detail — never surfaced to users. The Convert button + its
`convertibleTo` metadata are removed:

- `CompatMeta.convertibleTo?: { target; remap }` field deleted from
  `packages/core/src/registry/types.ts`.
- The three v1 compat descriptors (`GFMCallout`, `CommonMarkImage`,
  `HtmlDetailsAccordion`) lose their `convertibleTo: ...` lines in
  `built-ins.ts`. They retain `surface: 'compat'`, `rendersAs`,
  `translateProps`, and `serialize` — so source-form preservation
  (`> [!NOTE]\nbody` round-trips byte-identically) is unchanged.
- `buildConvertedAttrs()` exported helper in `JsxComponentView.tsx`
  removed along with its 6 unit tests in `JsxComponentView.test.ts`.
- `PropPanel.tsx` loses `onConvert?` / `convertTargetLabel?` props,
  the `showConvert` computation, and the Convert button render.
  PropPanel.test.tsx loses the Convert-button label tests.
- `canonical-compat.test.ts` loses the `convertibleTo.target` mapping
  tests; the canonical/compat shape, prop-subset, and identity-remap
  tests remain.

Rationale: a user authoring `> [!NOTE]\nbody` sees a styled Callout in
WYSIWYG and would read "Convert to Callout" — *to what? It's already a
Callout*. The Convert UX leaks the underlying registry shape to authors
who don't have a vocabulary for it. Compat descriptors keep their
*only* essential job — round-trip identity preservation — and lose the
upgrade-shortcut UI. Reverse direction (canonical → compat) was already
out of scope per §11; this trim removes the forward direction
(compat → canonical) for symmetry and conceptual cleanliness.

Net effect for users: no UI change to the happy path. A user who
outgrows compat features deletes-and-reinserts via the slash menu —
same friction as adding any other block.
