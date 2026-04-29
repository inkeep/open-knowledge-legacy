# Challenger Findings

Adversarial review of SPEC.md commit `315deae6` (baseline) targeted at the "don't do more than Mintlify/Fumadocs + de-prioritize Notion/Obsidian" narrowing standard applied in D-MF11, D-MF12, D-MF13, D-MF14.

---

## Angle 1: Audience mismatch — the standard applied is dev-docs-centric, misaligned with the stated primary audience

Summary verdict: the narrowing standard is **load-bearing for this spec** but its pedigree is dev-docs authoring (Mintlify + Fumadocs are both dev-docs DSLs). The spec states the primary audience is "AI-authoring agents presenting info to users" and the secondary is "dev-docs authoring." Calibrating the narrow against the secondary audience's reference impls understates the primary audience's needs in two concrete places (Callout foldable, Toggle variants). Both surface as the same bug shape: a descriptor that's adequate for authoring API docs but underpowered for knowledge-base UX.

### Finding 1.1: "Don't do more than Mintlify/Fumadocs" is the wrong ceiling for AI-agent knowledge-base UX

**Position:** Mintlify + Fumadocs are optimized for published dev-docs where callouts are static chrome around prose. AI-agent authoring for a personal/team knowledge base has a different dominant shape: agents emit summaries with progressive disclosure ("Quick take" → "Click for details"). Notion's toggle is the defining primitive of that UX, and Obsidian's foldable callout is the same primitive with admonition chrome. The spec's §4 explicitly says the CB-v2 parent weighted P1/P2 "Obsidian-style personal knowledge writers dominate (per audience research)" and "AI agents ... both forms supported." The narrowing standard then cites Mintlify/Fumadocs as the ceiling — a direct contradiction.

**Evidence:** SPEC §4 Personas: `P1 — Obsidian-style personal knowledge writers dominate (per audience research)`. D-MF13 rationale: `User directive 2026-04-23 ("who does foldable callouts?") + earlier "don't do more than mintlify/fumadocs" standard applied symmetrically`. Callout research REPORT §Executive Summary line 38: `Foldable state is Obsidian-only today but is a recurring feature request across platforms. collapsible: boolean + defaultOpen: boolean is worth adding now to lock in the contract before the first real migration — it costs nothing when absent.` Toggle research §Dimension 3 / 6: Notion's toggle block is a first-class primitive carrying `color` → `variant` absorbs it.

**Counter-argument the spec would make:** The standard is a scope-discipline tool, not a UX truth claim. Precedent #9 (schema-add-only-forever) makes the cuts free to reverse when a concrete AI-agent authoring friction surfaces. Shipping with unused props creates permanent lock-in (D-MF14 rationale). Also: `<Toggle><Callout>` composition is schema-supported (block*, isolating:true, defining:true — verified in `packages/core/src/extensions/jsx-component.ts:36-37`) so the expressive capability exists, just not as a single descriptor.

**Severity:** High on Callout foldable (D-MF13). Medium on Toggle variant (D-MF14).

**Suggested action:** Re-examine D-MF13 specifically through the AI-agent-scenario lens the SPEC states is primary. Concretely: simulate "Claude summarizes this repo" or "Claude renders a troubleshooting guide" and ask whether the agent will compose `<Toggle><Callout>` every time it wants a collapsible admonition, or whether it will emit flat text because the composition isn't in its training distribution. The latter is likely — GFM, Obsidian, and Notion all have a single-construct collapsible admonition; MDX `<Toggle><Callout>` is an OK-specific convention that an AI agent has zero prior exposure to. If the goal is "the agent emits rich UX from training distribution," the primitive the agent actually knows is `> [!note]-`.

### Finding 1.2: The asymmetry argument under precedent #9 is not as clean as it reads

**Position:** D-MF14 rationale claims "Drop-now / add-later is asymmetric under precedent #9 (schema-add-only-forever): dropping is free today, adding is always free, keeping is permanent lock-in." This is technically true for the PM schema, but there's a second asymmetry the spec doesn't address: **users who adopt the MDX form post-ship will author content WITHOUT the cut props**, and when NG29/NG30 eventually promote them, the promotion only helps *future* content — existing content doesn't automatically get upgraded. If the AI-agent audience is writing the knowledge base today, the foldable callouts they *should* be writing aren't getting written. That's not permanent lock-in in the schema sense, but it's semantic-loss on content authored during the window the descriptor is narrow. D-MF15 addresses this for speculative attrs (AttrBag preserves unknowns), but that preserves the raw source, not the UX — a narrowed descriptor rendering `<Callout collapsible>` still ignores `collapsible` at runtime per D-MF15 explicitly.

**Evidence:** D-MF15: `the DIY renderer ignores it (typed-prop signature), and PropPanel hides it (descriptor-declared props only)`. Translation: authoring `<Callout collapsible>` today stores losslessly on disk but looks like a static callout in the editor. The author cannot tell from the rendered UX whether they successfully authored a foldable callout.

**Counter-argument the spec would make:** This is a correct read of D-MF15 — and it's deliberate. "Storage never sanitizes; renderers apply semantics" is the storage-fidelity principle. Users authoring speculative attrs know they're doing speculative authoring. Once NG29 promotes, their pristine `<Callout collapsible>` content starts rendering foldable without a migration. In the interim, they see a static callout — acceptable for a greenfield pre-production system.

**Severity:** Medium. The spec is internally consistent but the asymmetry argument oversells "adding later is free." Adding later is free *for the schema*. For the installed base of content authored during the narrow window, the UX upgrade is silent-forward-compatible at best.

**Suggested action:** Call this out explicitly in the D-MF15 rationale: "users authoring speculative attrs during the narrow window will see static UX today and foldable UX after NG29 promotes, with no user action required." If the narrow window is measured in weeks (foundation → NG18), this is acceptable. If measured in quarters, reconsider.

### Finding 1.3: The Toggle `variant` drop silently removes one of the two primitives Notion-trained AI agents default to

**Position:** Claude's, GPT's, and similar AI agents' training distribution for Notion-like authoring is heavy on `<Toggle color="gray">` / `<Toggle color="blue">` patterns — Notion's toggle block carries `color` as a first-class field in its API (Toggle REPORT §Dimension 3 line 59). Dropping `variant` means an AI agent writing Notion-shaped content for this knowledge base sees its `color`/`variant` hints ignored. Under D-MF15 the attr round-trips on disk, but the rendered UX ignores it. The "primary audience = AI agents" framing breaks down here: the agent has no prior exposure to "OK Toggle has exactly these 6 props and no variant." It's going to emit what Notion trained it to emit.

**Evidence:** Toggle REPORT §Dimension 3 line 127: `Notion toggle block {rich_text, color, children} | <Toggle title={rich_text} variant={colorMap[color]}>{children}</Toggle>` — the research explicitly designed variant as the Notion color absorber. D-MF14 rationale: `The variant enum came only from Notion's color map`. The spec treats "only from Notion" as the reason to cut; the AI-agent audience argument says "only from Notion" is the reason to keep (Notion is the biggest AI-agent-training-data source for this shape).

**Counter-argument the spec would make:** Three points: (a) `variant` as a 3-value enum (`default|muted|accent`) was already a Notion-color-map *compression* — the research's own recommendation, not Notion's 10-color surface. So dropping a compression isn't dropping Notion parity. (b) `variant` is the weakest of the four narrowings because it has no MD-syntax counterpart — the only path is MDX-JSX authoring, which is explicitly AI-agent territory. If AI agents emit `<Toggle variant="gray">`, D-MF15 preserves it on disk; future promotion is free. (c) The de-prioritize-Notion directive was explicit from the user.

**Severity:** Medium. The drop is defensible but the argument "Notion's color map absorbs cleanly into a 3-value enum" is already a compromise; dropping the compromise isn't symmetric with keeping Mintlify/Fumadocs fidelity.

**Suggested action:** Either (a) keep `variant` as a 3-value enum explicitly framed as "a Notion-color absorber, de-prioritized but defensive," or (b) explicitly acknowledge in D-MF14 that "AI-agent Notion-style authoring is the one audience this narrow disappoints; accepted for foundation-scope simplicity." Today the rationale conflates "primary Notion-trained distribution" with "de-prioritized audience."

---

## Angle 2: 5-pack coherence — the stated unifying thread ("unequivocal MD↔MDX equivalence via standard plugins") does not actually cover 3 of the 5 components

Summary verdict: the 5-pack is **five reasonable individual scope choices** but it is not a coherent foundation under the thesis stated in SPEC §1 ("5 descriptors each have unequivocal MD↔MDX equivalence via standard library-backed remark plugins or HTML5 passthrough; MDX is a strict superset of the markdown form"). Callout and Toggle satisfy that thesis. Image, Video, Audio do not — they're "MDX-only component + separate wiki-embed path via PR #270." The spec acknowledges this but doesn't reconcile it with the unifying-thread claim. If the real unifying thread is "5 components the reference impls converge on," the spec should say that — which would weaken the "unequivocal MD↔MDX equivalence" framing used to justify the 5-pack selection.

### Finding 2.1: Image's "MD form" column is not actually an Image descriptor path

**Position:** SPEC §9 table row `Image | MD form: ![alt](src)` — this markdown form does NOT parse to our Image descriptor. It parses to an `image` mdast node rendered by whatever the existing markdown pipeline does (likely a plain `<img>`). Image's MDX JSX path (`<Image src=... width={640} caption="...">`) has no MD-form equivalent that carries `width`/`caption`/`zoom`. CommonMark's `![alt](src "title")` title is rendered as tooltip, not caption (confirmed in image report §Migration Matrix). So the "MD↔MDX equivalence" for Image is: you can author a poor-fidelity MD `![alt](src)`, or a full-fidelity MDX `<Image>`, but those are two separate storage shapes that don't round-trip. PR #270 owns a third shape `![[file.png|640x480]]` which also doesn't round-trip to `<Image>`. That's three authoring paths, none of which is a "MD↔MDX equivalence" in the sense D-MF11 uses it for Callout.

**Evidence:** SPEC §9 Rendering surfaces table; Image research REPORT §OK Image Descriptor — the descriptor is MDX-only; MD form `![alt](src)` is a separate `image` mdast node not in this spec's scope. PR #270 coordination doc §Interim two-tier media UX explicitly says `![[photo.jpg]]` renders native `<img>` distinct from `<Image>`. That's two paths already, not equivalence. The spec acknowledges this as NG24.

**Counter-argument the spec would make:** "Unequivocal MD↔MDX equivalence" in SPEC §1 is specifically about parse-path convergence — GFM alerts + HTML5 details both land in the same PM node as their MDX counterparts. Image doesn't have such a convergence because CommonMark's `![alt](src)` is intentionally less expressive than `<Image>`; the spec's claim is about whether MDX is a *superset* of the MD form, not whether every MDX prop has an MD counterpart. And the spec is honest: NG24 documents the two-tier drift accepted in the interim.

**Severity:** Medium. The issue isn't that Image is miscategorized — it's that the "unequivocal MD↔MDX equivalence" framing in §1 is doing double duty. It justifies Callout and Toggle (true equivalence via promoters) *and* Image/Video/Audio (not equivalence; MDX is a pure super-set authoring shape). If you read §1 fast, you'd assume all five have GFM-alerts-style promoters.

**Suggested action:** Split the §1 Resolution framing into two rationales: (a) Callout + Toggle: MD-form parse paths land in same PM node (promoters). (b) Image + Video + Audio: MDX-only descriptors with richer props than the ambient MD image/media syntax; PR #270 owns the wiki-embed path as a separate storage shape. The current framing blurs these.

### Finding 2.2: "HTML5 `<details>` → Toggle promoter" relies on a near-dead source syntax

**Position:** FR-8 + D-MF5 + the toggle research report all frame HTML5 `<details>` as a first-class input shape. In practice, users almost never type raw HTML5 `<details>` in markdown. The two populated authoring populations are: (a) Obsidian users who use `> [!note]+/-` (covered by NG18, not this spec); (b) Notion users who use toggle blocks (exported to `<details>` by third-party exporters, but the OK author population doesn't come from Notion HTML-export pipelines directly — they come from Notion via paste-from-clipboard → Markdown). The "users type `<details><summary>X</summary>Y</details>`" user journey (SPEC §5 P1) is a straw-man — this user doesn't exist in the primary Obsidian-personal-KB + AI-agent-authoring populations. So the HTML5 promoter is over-engineered for its real use case. If the actual use case is "import from Notion HTML export" or "Docusaurus migration," that's exactly NG18 territory.

**Evidence:** Toggle REPORT §Dimension 8 line 89: three plugin patterns for markdown `<details>` auth — none are a common user authoring flow; all three are migration paths. Toggle REPORT §Dimension 7 Docusaurus: native `<details>` is the interchange format, but that's cross-platform serialization, not a primary authoring flow. SPEC §5 P1 Toggle journey assumes user hand-writes raw HTML5 — atypical for the Obsidian persona.

**Counter-argument the spec would make:** The `<details>` promoter is load-bearing not because users *type* it but because it's the **serialization substrate** — serializing a Toggle to `<details>` is what enables cross-platform interchange (Docusaurus, Hashnode, GitHub render it natively). The parse-path promoter gives you round-trip: export your knowledge base to Docusaurus, re-import via `<details>` → Toggle. Also: `<details>` is the pattern a ChatGPT/Claude agent *could* emit if given the OK MDX catalog (it's a primitive shape). Being permissive at parse doesn't cost much — 40 LoC.

**Severity:** Low on correctness (the code path is genuinely cheap and permissive-parse is defensible). Medium on framing (the spec's §5 user journey implies this is a primary authoring path when it's really a round-trip substrate).

**Suggested action:** Reframe FR-8 as a *serialization-compat* primitive rather than a primary authoring path. The user journey should go: "user exports to Markdown, publishes to GitHub/Docusaurus, re-imports to OK, Toggle reappears as `<details>` in the source and as `<Toggle>` in WYSIWYG." That's the real motivation.

### Finding 2.3: Audio has no "MD form" — the unifying thread doesn't apply at all

**Position:** Audio has no standard markdown syntax. The Audio research REPORT §Dimension 2 line 35 explicitly says Mintlify has no Audio component; §Dimension 1 line 34 says Fumadocs has none either. The only MD-form path for Audio is `![[audio.mp3]]` (PR #270's wiki-embed, owned elsewhere). There is no `<audio>` → Audio promoter, no Markdown alternative to `<Audio src=... autoplay>`. So Audio is 100% an MDX-JSX authoring descriptor. It fits the narrowing standard ("don't do more than Mintlify/Fumadocs") vacuously — neither platform has one, so any Audio descriptor is "more than Mintlify/Fumadocs." That contradicts the narrowing standard being applied; the spec shipped Audio anyway because the user directive said 5-pack. That's a case where the "we match the reference impls" framing breaks.

**Evidence:** Audio report §Executive Summary: `Fumadocs ships no Audio component. CONFIRMED.` and `Mintlify ships no Audio component. CONFIRMED.` D-MF11/12/13/14 all cite "match Mintlify/Fumadocs." Audio has no reference impl to match.

**Counter-argument the spec would make:** The narrowing standard applies to prop-surface *width* when a reference impl exists; Audio's reference is HTML5 `<audio>`, which has 10 attrs and zero children-except-source/track. FR-4's 7-prop descriptor (src/title/autoplay/loop/muted/preload/children) is a proper subset + a `title` label. So Audio narrows against HTML5, not Mintlify/Fumadocs. That's coherent; it's just not the same standard.

**Severity:** Low. Audio's shape is defensible independently. But the coherence argument — "5-pack = 5 components where MDX is a strict superset of MD form" — breaks here; the appropriate reframe is "HTML5 as the superset source for Audio."

**Suggested action:** In §1 Resolution, name the specific reference set per component: `Callout/Toggle: GFM + HTML5 (promoter-backed equivalence). Image: CommonMark + Obsidian |WxH (subset MD form + MDX super-form). Video/Audio: HTML5 only (no ecosystem MD form).` This replaces the monolithic "unequivocal MD↔MDX equivalence" framing with a per-component motivation.

---

## Angle 3: Cut-scope overreach — cuts are ~90% justified by null-consumer but the "DIY OK brand" framing bundles additional cuts not strictly necessary

Summary verdict: the cuts are **mostly well-justified** by the null-consumer test after descriptor removal. The overreach is at the edges — the CSS footprint cuts and fumadocs-ui dep removal go beyond null-consumer into "stylistic reset for OK brand." That's defensible, but it's a *different* rationale than "cut what has no consumer." The spec should own both rationales explicitly; today D-MF2 collapses them.

### Finding 3.1: `EditorContext.tsx` cut is clean but the cut-inventory's claim "only consumer is InlineTOCView" is slightly imprecise

**Position:** Verified transitively — `EditorContext.tsx` is imported by `JsxComponentView.tsx:46` (the provider wrapping at line 813) and `InlineTOCView.tsx:27` (the consumer via `useEditorContext`). Cutting `InlineTOCView` turns `JsxComponentView`'s provider wrap into null-consumer code. The cut is correct. However, the cut-inventory line 41 says "`EditorContext.tsx` — only InlineTOCView consumed it; `JsxComponentView.tsx:813` provider wrapping becomes null-consumer" — which is true but slightly misleading. There are TWO consumers (`InlineTOCView` reads, `JsxComponentView` provides); BOTH have to be cut cleanly. If anyone later wanted the EditorContext back for e.g. a slash-command that reads the editor from inside a NodeView child, cutting it now forces rebuild.

**Evidence:** `grep -rn "EditorContext" packages/app/src/editor/` returns only `JsxComponentView.tsx:46/813` (provider) and `InlineTOCView.tsx:27/72-73` (consumer). Verified — no other consumers.

**Counter-argument the spec would make:** That's exactly the null-consumer test working. No active consumer → cut. When/if a slash-command-inside-NodeView pattern lands, EditorContext is trivially re-addable; it's a 20-line file. Preserving it on PR #165 branch is sufficient (per D-MF4).

**Severity:** Low — the cut is correct.

**Suggested action:** None. Note for accuracy: the cut-inventory should say "cutting InlineTOCView removes the only consumer; JsxComponentView's provider wrap becomes dead code and is cut in the same pass." Today's phrasing reads like a single-consumer claim.

### Finding 3.2: `--color-fd-*` CSS token removal + `@source fumadocs-ui/dist` Tailwind scan removal goes beyond null-consumer

**Position:** FR-13 and FR-14 cut `--color-fd-*` tokens, fd-steps utilities, Radix collapsible/accordion keyframes, Cards/Steps halo tuning, and the Tailwind source scan. The null-consumer argument applies cleanly to `fd-steps`/`Radix collapsible`/`Cards halo` — their consumers (Steps, Files/Folder, Cards) are cut so the CSS is dead. But `--color-fd-*` tokens are a *theming layer* for any fumadocs-ui component that might be kept. The audit confirmed only 2 of 5 top descriptors actually use fumadocs-ui React (Callout, ImageZoom). D-MF2 cuts ALL fumadocs-ui usage (including Callout + ImageZoom) and rebuilds DIY — that's the pure-brand argument, not the null-consumer argument.

The tension: if DIY-the-surviving-descriptors is motivated by "OK brand, not fumadocs styling," say that directly. Today the spec's §1 Resolution bullet mentions brand direction once ("fumadocs-ui dep + `--color-fd-*` CSS token bridge + `@source` fumadocs-ui Tailwind scan bring styling-footprint OK doesn't need for its own brand direction") but the FR-level rationale conflates it with null-consumer.

**Evidence:** Audit (referenced in SPEC) confirmed Callout + ImageZoom actively use fumadocs-ui React. FR-6 acceptance `grep "fumadocs" packages/app/src/editor/components/*.tsx returns zero hits` proves this is a zero-tolerance cut, not a null-consumer cut.

**Counter-argument the spec would make:** Both rationales are in §1 — null-consumer for 12 descriptors, brand-reset for fumadocs-ui removal. D-MF2 rationale explicitly cites the user directive `lets not inherit fumadocs styling etc, lets just make our own`. The FR-level rationale can defer to D-MF2 rather than re-state.

**Severity:** Low — the spec has the rationale, just not prominently at the FR level.

**Suggested action:** In §1 Complication, split the two rationales explicitly: "(a) 12 descriptors have no target-audience use. (b) 5 surviving descriptors have OK-brand direction divergent from fumadocs." Today reads like one argument.

### Finding 3.3: Preserving compound tier primitives on PR #165 branch is *cheaper* for this branch but *more expensive* for the resurrection

**Position:** D-MF4 rationale: `User directive: "if no consumers, can't we just nix? things without consumers should be cut; we'll keep preservation in the pr 165."` The assumption is that preservation-on-PR-#165 is free. It's not quite free. NG19 (compound tier resurrection) would require:
- Cherry-picking `compound-wrappers.tsx` + `typed-children-guard.ts` + `EditorContext.tsx` + `InlineTOCView.tsx` from PR #165 onto main-of-the-moment
- Re-registering `typedChildrenGuard.configure()` in shared.ts
- Re-adding Precedent #25 to AGENTS.md
- Re-adding `EditorContextProvider` wrap to `JsxComponentView.tsx`
- Re-adding tests (`typed-children-guard.test.ts`)
- Re-adding compound descriptors to built-ins.ts
- Re-authoring the CSS footprint the spec is cutting (fd-steps, Radix collapsible/accordion keyframes, Cards/Steps halo tuning)
- Re-adding fumadocs-ui OR building DIY equivalents

PR #165 branch drifts every day main moves. The longer NG19 is deferred, the more merge-conflict-ridden the cherry-pick. Contrast with "leave compound machinery dormant in main until a compound descriptor is added to built-ins.ts" — zero active code paths execute, zero runtime cost, and re-activation is "add one descriptor." The spec picks cut-now for code-hygiene reasons; the cost-ledger is genuinely lopsided in favor of dormant-preservation if NG19 has any meaningful chance of shipping in H2 2026+.

**Evidence:** PR #165 branch at commit `e56f33c3` (per evidence doc). Main branch moves daily. The compound-wrappers.tsx is 432 LoC + tests + CSS; re-porting is non-trivial after significant main drift. The `EditorContext` provider wrap location in `JsxComponentView.tsx:813` may have moved.

**Counter-argument the spec would make:** The directive was explicit: `things without consumers should be cut; we'll keep preservation in the pr 165.` Dormant code has a long-tail cost too: TypeScript compile time, knip-clean gate maintenance, AGENTS.md precedent noise (#25 is actively referenced in design discussions), new contributors reading dead code. Greenfield pre-production is the *right* moment to cut; later the cost of cutting increases as more code grows around the dead paths. And: NG19 triggers `audience-demand-driven` — not imminent; dormant code accumulating main-drift debt in the meantime is worse than cherry-pick-after-demand.

**Severity:** Medium. The cost-ledger framing is genuinely arguable. If the demand for compound components surfaces sooner than the spec assumes (dev-docs onboarding is a real OK use case per SPEC §4), the resurrect cost will bite.

**Suggested action:** Add to D-MF4 rationale or a Risk row: "resurrection cost grows monotonically with main drift; if compound-tier demand surfaces within 3 months, cherry-pick from PR #165 is still cheap; after 6+ months, re-auth from spec may be cheaper than cherry-pick." This calibrates the cut against the resurrection window.

### Finding 3.4: i16 (nested-dirty PBT) deletion is correct but the "compound parent-child is the only scenario" claim is not quite bulletproof

**Position:** Verified by reading `packages/app/tests/fidelity/invariant-i16.test.ts:31-34` — the nestedFixtures filter is `['Cards', 'Steps', 'Tabs', 'Accordion']`, all compound. But the invariant logic itself (`effectiveDirty` + `hasDirtyDescendant` in `packages/core/src/markdown/index.ts:265`) is NOT scoped to compound. Any nested jsxComponent — e.g. `<Callout>` containing `<Callout>` (schema-allowed per `block*`), or `<Toggle><Callout>` (explicitly recommended by D-MF13 as the foldable-admonition replacement!) — exercises the nested-dirty walk. The I16 test's fixture corpus is compound-only because that was the original demand shape, but the invariant code path is broader. Cutting the test + deleting the invariant (per NG25) means `<Toggle><Callout>` composition's nested-dirty correctness is uncovered.

**Evidence:** i16 test fixture filter line 33-34: `nestedFixtures = fixtures.filter((f) => ['Cards', 'Steps', 'Tabs', 'Accordion'].includes(f.componentName));`. jsxComponent schema: `content: 'block*'` (block-nesting allowed). D-MF13 rationale: `<Toggle title="..."><Callout type="warning">...</Callout></Toggle>` is the recommended foldable-admonition pattern — this is an explicit nested jsxComponent case in the spec.

**Counter-argument the spec would make:** The γ code path `effectiveDirty` + `hasDirtyDescendant` remains intact — only the *test fixture corpus* goes away. If `<Toggle><Callout>` compositions become common, add a i16-style test with those fixtures. Inherent γ invariants I12/I13 (pristine byte-identity, edited-path idempotence) still cover single-descriptor round-trips; the nested-dirty walk is exercised incidentally by any nested fixture in those tests.

**Severity:** Medium. The spec says "i16 restored when compound tier ships" (NG25) which implicitly argues it's only exercised by compound. But the exact replacement the spec endorses (`<Toggle><Callout>`) IS nested jsxComponent. The test should survive, re-fixtured to 5-pack nested compositions, not deleted.

**Suggested action:** Re-examine NG25. Either (a) keep i16 with new fixtures built from `<Toggle><Callout>`, `<Callout>` nested, or `<Toggle><Toggle>`; or (b) explicitly acknowledge that nested-dirty correctness for 5-pack compositions is uncovered until NG19, and add a risk row for "regression in `hasDirtyDescendant` walk goes undetected for nested 5-pack compositions." Today i16's deletion rationale doesn't engage with the schema-supported 5-pack nesting cases.

---

## Summary verdict

The spec is **well-formed at the decision-log level but loose at the framing level**. The five narrowings (D-MF11/12/13/14 + the 12-descriptor cut) are individually defensible and each has a crisp escape hatch via schema-add-only precedent #9. The weakest premises are:

1. **"Don't do more than Mintlify/Fumadocs" is applied symmetrically but the primary audience is neither platform's user base.** The standard was set by dev-docs reference impls and then applied to an AI-agent-knowledge-base product. D-MF13 (Callout foldable) is the clearest symptom — foldable callouts are core to the Obsidian/Notion/AI-agent shape the spec names as primary.

2. **"Unequivocal MD↔MDX equivalence" as a unifying thread for the 5-pack is one-sided.** It genuinely applies to Callout and Toggle (promoter-backed). Image has CommonMark+Obsidian parse paths that DON'T round-trip to the MDX descriptor. Audio has no MD form at all. The spec silently papers over this with NG24 (two-tier media UX).

3. **The cut-scope is mostly null-consumer-correct but the fumadocs-ui brand reset is a different rationale.** Both are defensible; the spec just doesn't split them. The cut is more like "2 rationales, both applied" than "1 rationale, applied symmetrically."

4. **i16 deletion may leak nested-dirty uncovered for the recommended `<Toggle><Callout>` composition.** Worth a second look.

The LOCKED decisions are reversible via schema-add-only (correct), but D-MF13 specifically deserves a re-examination under the AI-agent-scenario lens before audit closes, because the composition workaround (`<Toggle><Callout>`) is an OK-specific idiom with zero training distribution — AI agents won't emit it unprompted, and that breaks the "AI agents emit rich content" value story stated in SPEC §4.
