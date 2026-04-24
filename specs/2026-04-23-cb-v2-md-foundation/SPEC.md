# CB-v2 MD-Foundation — 5-Pack Descriptor Spec

**Status:** Draft
**Owner(s):** Nick
**Last updated:** 2026-04-23
**Baseline commit:** `315deae6`
**Links:**
- Parent spec (inherited architectural decisions): [`specs/2026-04-14-component-blocks-v2/SPEC.md`](../2026-04-14-component-blocks-v2/SPEC.md)
- Adjacent spec (independent — wiki-embed surface): [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](../2026-04-16-editor-asset-and-embed-surface/SPEC.md) shipping as PR #270
- Research reports (5 — the component superset designs):
  - [`reports/cb-v2-callout-superset-research/REPORT.md`](../../reports/cb-v2-callout-superset-research/REPORT.md)
  - [`reports/cb-v2-image-superset-research/REPORT.md`](../../reports/cb-v2-image-superset-research/REPORT.md)
  - [`reports/cb-v2-video-superset-research/REPORT.md`](../../reports/cb-v2-video-superset-research/REPORT.md)
  - [`reports/cb-v2-audio-superset-research/REPORT.md`](../../reports/cb-v2-audio-superset-research/REPORT.md)
  - [`reports/cb-v2-toggle-superset-research/REPORT.md`](../../reports/cb-v2-toggle-superset-research/REPORT.md)
- Audit correcting earlier MVP claims: [`reports/worldmodel-pr-165-component-blocks-v2/audit-mvp-component-claims.md`](../../reports/worldmodel-pr-165-component-blocks-v2/audit-mvp-component-claims.md)
- World model (pre-stack snapshot of PR #165): [`reports/worldmodel-pr-165-component-blocks-v2/WORLDMODEL.md`](../../reports/worldmodel-pr-165-component-blocks-v2/WORLDMODEL.md)
- Evidence: [`./evidence/`](./evidence/)

---

## 1) Problem statement

**Situation.** Post-PR #165 (Component Blocks v2, open), OK ships descriptor-dispatched MDX editing — `jsxComponent` node widened to `block*` content, runtime descriptor registry, PropPanel, γ serialization, G9 always-live bridge, `rawMdxFallback` CM-in-PM — with a 17-component manifest (16 fumadocs-ui + 1 custom Audio). The architecture is solid and validated; the manifest is docs-site-shaped (fumadocs-origin: Banner, Card, Cards, Steps, Tabs, Accordion, Files, TypeTable, InlineTOC, etc.) and over-serves OK's primary audiences (Obsidian-style personal knowledge bases, AI agents authoring structured content, dev-docs and help-center content). Audit confirmed only 2 of the top-5-by-relevance components (Callout, ImageZoom) actually use `fumadocs-ui` React; the rest are OK-custom or HTML5.

**Complication.** Shipping PR #165's full 17-descriptor scope carries cost without proportional value:
- 12 of 17 descriptors (Banner, Card, Cards, Step, Steps, Tab, Tabs, Accordion, Accordions, File, Files, Folder, TypeTable, InlineTOC) are fumadocs-specific. 5 of those are compound components requiring the Context Bridge Registry (Precedent #25, ~431 LoC `compound-wrappers.tsx` + support machinery) — unused if the compound tier doesn't ship.
- `PropPanel` underdelivers: Callout's 9-value `type` enum renders as a plain `<select>` because `PropPanel` has no extension point. The custom-editor affordance (icon-grid picker, URL input with drag-drop) is the canonical PropPanel UX differentiator.
- Fumadocs-ui dep + `--color-fd-*` CSS token bridge + `@source` fumadocs-ui Tailwind scan bring styling-footprint OK doesn't need for its own brand direction.
- OK's audience convergence: 5 descriptors (Callout, Image, Video, Audio, Accordion) where **MDX JSX is a strict superset of the markdown form**. Two shapes of this superset relationship, depending on whether the component has a markdown-native parse path: (a) **MD-syntax + MDX-richer** — Callout (GFM alerts `> [!NOTE]` parses to the same descriptor the MDX JSX produces, MDX form adds `title`/`icon`/`color`/`collapsible`/`defaultOpen`), Accordion (HTML5 `<details>` parses to the same descriptor, MDX form adds `icon`/`description`/`id`/`name`), Image (`![alt](src)` parses to the same descriptor, MDX form adds `width`/`height`/`caption`/`zoom`); (b) **MDX-primary, HTML5-substrate** — Video and Audio have no markdown-native syntax, so MDX JSX is the sole authoring surface, with HTML5 `<video>`/`<audio>` as the rendering substrate (and as the natural plain-HTML fallback for tools that cannot parse MDX). γ preserves user's authoring form in both shapes. The same rendering engine serves every path. This is the 5-pack.

**Resolution.** Narrow to a 5-pack foundation. Each descriptor ships with:
- Researched superset prop shape across Fumadocs, Mintlify, Obsidian, HTML5, CommonMark/GFM, and Pandoc/Docusaurus surfaces (per the 5 superset research reports).
- DIY React components using OK's own brand (shadcn/Tailwind), **no** `fumadocs-ui` React imports, **no** `--color-fd-*` CSS tokens.
- MDX as a strict superset of the markdown form where a standard parse path exists (GFM alerts `> [!NOTE]` + Obsidian foldable `> [!NOTE]-` → `<Callout>`; HTML5 `<details>` → `<Accordion>`; CommonMark image `![alt](src)` → `<Image>`). Where no markdown-native form exists, MDX JSX is the sole authoring surface with HTML5 substrate (Video, Audio).
- γ preserves user's original authoring form.

Plus surgical cleanup: remove 12 docs-site descriptors + `compound-wrappers.tsx` + `typed-children-guard` + `InlineTOCView` + `EditorContext` + `fumadocs-ui` npm dep + CSS token bridge. Retract Precedent #25 on this branch. All preserved on PR #165 branch.

This spec **coordinates but does not overlap** with PR #270 (editor asset + embed surface). PR #270 owns wiki-embed parsing (`![[file.ext]]`), upload, dedup, basename index. This spec owns MDX JSX authoring (`<Image src="x">`). Consolidation of rendering (PR #270's wikiLinkEmbed NodeView dispatches to our componentMap entries) is documented as Future Work — small follow-up after both specs merge.

## 2) Goals

- **G1** — Ship 5 DIY descriptors with researched superset prop shapes: Callout, Image, Video, Audio, Accordion.
- **G2** — Every descriptor's MD form (where it exists) and MDX form render through the same engine; γ preserves source form byte-fidelity.
- **G3** — Zero `fumadocs-ui` React imports; zero `--color-fd-*` CSS tokens. OK's own brand is the styling source of truth.
- **G4** — No dead code: every line shipped has an active consumer in the 5-pack scope.
- **G5** — Inherit CB-v2 architectural decisions (D1, D6, D7, D11, D13; Precedents #24, #26) verbatim from `specs/2026-04-14-component-blocks-v2/SPEC.md`. No relitigation.
- **G6** — Layer cleanly with PR #270. No overlap, no discongruence, no throwaway work.

## 3) Non-goals

Inherited from CB-v2 SPEC (see parent spec for full text and rationale — not re-derived here):

- **[NEVER]** NG5, NG6, NG7, NG7a (inherited verbatim from CB-v2 §3)
- **[NOT NOW]** NG2 (multi-content-hole components), NG9 (component rename/transformation UI), NG10 (per-block source-mode toggle), NG11 (conditional prop visibility)
- **[NOT NOW]** NG13 (user-registered custom components) — wildcard `'*'` still handles unknown names
- **[NOT NOW]** NG14 (live-rendered inline-component editing) — thin `jsxInline` still ships
- **[ACCEPTED]** NG12 (γ-dirty quoting normalization) — verified idempotent

Added by this spec:

- **[NOT NOW]** NG16: `PropDef.editor?` per-prop editor override + custom field registry (react-hook-form-style). Full research captured in this spec's Future Work (Explored tier). Callout's `type` ships with plain native `<select>` until promotion. Revisit when PropPanel UX iteration demands tailored editors.
- **[NOT NOW]** NG26: Callout `type` enum 9-value superset (`info`, `success`, `danger`, `idea` as distinct additional values) **plus matching broader Obsidian non-GFM-type foldable syntax** (`> [!success]-`, `> [!idea]+`, etc.). Per D-MF11 + D-MF17, descriptor ships 5 GFM-matching values with foldable support; non-GFM type alias-folding is lossy today. Revisit alongside NG17 (Docusaurus directive syntax) OR under Obsidian-vault migration demand — both promote additional type semantics that justify extending the enum. Schema-is-add-only makes this extension free.
- **[NOT NOW]** NG27: YouTube/Vimeo URL auto-promotion for Video (detect `youtu.be`, `youtube.com/watch`, `vimeo.com/X`, etc. → emit `<iframe>` embed). Per D-MF12, Video is pure HTML5; service-embeds are author-authored `<iframe>`. Revisit if concrete authoring friction (dev-docs / help-center demand frequent YouTube embeds and find the `<iframe>` boilerplate painful). Low cost to add later (~40 LoC render-time URL sniff); no storage-shape change.
- **[NOT NOW]** NG28: Rich `<iframe>` NodeView for YouTube/Vimeo/generic embed UX (resize handles, ratio-preservation, preview-card in editor). Dependent on NG27 or orthogonal raw-HTML-iframe UX work. Out of foundation scope.
- ~~**[NOT NOW]** NG29~~ *(WITHDRAWN 2026-04-23 by D-MF17 — Callout foldable props ship in this spec: `collapsible` + `defaultOpen` added to descriptor, Obsidian `> [!TYPE]+/-` parse path added within GFM 5-type scope.)*
- **[NOT NOW]** NG30: Accordion `variant` enum (Notion color-map absorption). Per D-MF14, Accordion ships 6 props matching Mintlify Accordion + HTML5 `name` — no `variant`. Revisit if Notion-style color-variant toggles surface as concrete authoring demand; trivially additive via schema-add-only under precedent #9. Zero cost to add later; permanent lock-in if we ship now without a consumer.
- **[NOT NOW]** NG17: Docusaurus directive Callout syntax (`:::note[Title]` / `:::warning`). `remark-directive` + ~40-LoC visitor. Future Work (Explored tier). Ship when docs-site migration demand surfaces.
- ~~**[NOT NOW]** NG18~~ *(WITHDRAWN 2026-04-23 by D-MF17 — Obsidian foldable callout syntax `> [!TYPE]+/-` is now shipped within the GFM 5-type scope via the extended FR-7 transformer. Broader Obsidian type extensions beyond the 5 GFM types remain deferred as part of NG26.)*
- **[NOT NOW]** NG19: Compound-component tier — Tabs / Tab, `<Accordions>` / `<AccordionGroup>` wrapper, Steps / Step. Reinstates `compound-wrappers.tsx`, `typed-children-guard`, Precedent #25 Context Bridge Registry verbatim from PR #165. All preserved on that branch. Revisit when dev-docs / help-center authoring demand surfaces for alternative-layouts or FAQ accordions. **Note:** the foundation `<Accordion>` (D-MF16) ships **standalone** — NG19 layers a *grouping wrapper* on top for exclusive-accordion UX with shared chrome, NOT a Radix-style parent requirement. Cross-browser exclusive grouping is already available on standalone Accordion via HTML5 `<details name="...">`; the wrapper adds visual grouping + coordinated animation, not basic grouping semantics. Future Work (Explored tier — full research in CB-v2 spec §9.15).
- **[NOT NOW]** NG20: Card, CardGroup, Banner, Files-tree, TypeTable, InlineTOC descriptors. Future Work (Explored tier).
- **[NOT NOW]** NG21: Mermaid rendering. Prior research preserved at `reports/mermaid-rendering-options-for-mdx-editors/`. Un-defer framework in CB-v2 `evidence/mermaid-audio-rendering-deferred.md`.
- **[NOT NOW]** NG22: Math / KaTeX inline + block. Markdown-pipeline concern, not descriptor.
- **[OUT OF SCOPE — OWNED BY PR #270]** NG23: `![[file.ext]]` wiki-embed parsing + extension dispatch, asset upload, dedup, basename index, file-watcher asset events. This spec's Image/Video/Audio descriptors are MDX-JSX-side only. PR #270 owns the wiki-embed substrate.
- **[NOT NOW]** NG24: Unified media rendering — PR #270's `wikiLinkEmbed` NodeView dispatches extension → renders our Image/Video/Audio React components. ~40 LoC follow-up against whichever spec merges second. Until landed, users see two-tier media UX: `![[photo.jpg]]` renders native `<img>` (basic); `<Image src="photo.jpg">` renders our DIY component (zoom + caption + dimensions + PropPanel). Future Work (Explored tier).
- ~~**[NOT NOW]** NG25~~ *(WITHDRAWN 2026-04-23 by D-MF18 — i16 restored with 5-pack fixture rewrite. `<Callout><Accordion>`, `<Accordion><Callout>`, same-type nesting, and `<Callout collapsible>` inner `<Accordion>` all exercise nested `hasDirtyDescendant` walk paths. Cut-call was wrong under jsxComponent `content: 'block*'` widening.)*
- **[NOT NOW]** NG31: Typed `tracks: Array<TrackDef>` + `sources: Array<SourceDef>` props on Video / Audio descriptors. Per D-MF19, the original FR-3/FR-4 `children` passthrough was a category error — HTML5 requires `<track>`/`<source>` as direct children of `<video>`/`<audio>`, but PM NodeViews mandate a wrapper DOM element around the content hole, so the two contracts can't coexist. The shipped 5-pack drops the children slot; captions / codec-fallback go through raw `<video>`+`<track>` HTML in MDX (rawMdxFallback path). NG31 restores the capability additively when PropDef grows an `array` type of structured records — that extension has its own design questions (PropPanel UX, γ serialization, empty-array defaults, validation) that deserve a dedicated spec. Trigger: concrete authoring-friction data showing raw-HTML escape hatch is a real pain point, OR another descriptor (NG20 Cards, NG19 compound tier) also needing array-of-records PropDef.
- **[PRE-EXISTING, NOT-THIS-PR]** NG15: markdown round-trip fidelity gaps on initial document load — unchanged, not introduced or exacerbated by this spec.

## 4) Personas

Inherited from CB-v2 SPEC §4 verbatim: P1 (authoring humans), P2 (AI agents / MCP clients), P3 (OK maintainers adding built-ins), P4 (downstream consumers — MCP schemas, docs site, search indexing).

Weighting for this spec:
- **P1** — Obsidian-style personal knowledge writers dominate (per audience research). Dev-docs authors write a subset. Help-center authors write callouts + media.
- **P2** — AI agents emit GFM alerts (`> [!NOTE]`) and standard MDX JSX natively from training distribution. Both forms supported; γ preserves what agent emitted.

## 5) User journeys

### P1 — block-authoring a Callout via GFM-alerts syntax
1. User types `> [!NOTE]\nRemember to commit often.` in source mode.
2. `remark-github-alerts` tags the blockquote with `data.hName: 'callout'` + `data.hProperties.dataType: 'note'`; a ~60-LoC post-plugin transformer maps that into `mdxJsxFlowElement(Callout, {type: 'note'})` (no foldable marker → static Callout).
3. WYSIWYG renders: our Callout component with note-variant styling, body text editable inline.
4. User clicks the `type` badge in the PropPanel → changes `note → warning`.
5. γ detects edit → `sourceDirty: true` → reconstructs as `<Callout type="warning">\nRemember to commit often.\n</Callout>` on save.
6. If never edited post-parse, γ emits the original `> [!NOTE]` form byte-identical.

### P1b — foldable Callout via Obsidian `> [!TYPE]+/-` syntax (D-MF17)
1. User types `> [!WARNING]-\nThis is hidden by default.` in source mode.
2. `remark-github-alerts` tags the blockquote with `data.hName: 'callout'` + `data.hProperties.dataType: 'warning'`; the transformer re-inspects the source at `blockquote.position`, matches regex `/^>\s*\[!\w+\]([+-])/` against the opener, reads marker `-` → emits `mdxJsxFlowElement(Callout, {type: 'warning', collapsible: true, defaultOpen: false})`.
3. WYSIWYG renders a foldable Callout with the disclosure triangle closed.
4. User clicks the triangle → opens in-place (native `<details>`-like UX inside the Callout shell).
5. Authoring via MDX JSX form `<Callout type="warning" collapsible>...</Callout>` or `<Callout type="warning" collapsible defaultOpen>...</Callout>` produces the same rendered shape.
6. γ preserves original form: `> [!WARNING]-` stays byte-identical on pristine save; post-edit canonicalizes to MDX JSX form with `collapsible`/`defaultOpen` attrs.

### P1 — block-authoring a Accordion via HTML5 `<details>`
1. User types `<details open><summary>Show details</summary>\n\nBody\n\n</details>`.
2. HTML5-to-Accordion mdast promoter recognizes `<details>` → emits `mdxJsxFlowElement(Accordion, {title: 'Show details', defaultOpen: true})` with Body as children.
3. WYSIWYG renders Accordion — click-summary expands/collapses via browser's native `<details>` behavior.
4. User edits title via PropPanel → `sourceDirty: true` → γ reconstructs as `<Accordion title="..." defaultOpen>` MDX form on save.
5. If never edited, γ emits the original `<details>` form byte-identical.

### P1 — Image with zoom
1. User types `<Image src="/assets/diagram.png" alt="Architecture" width={800} caption="Service topology" />`.
2. JsxComponentView renders our Image component → `<figure>` with `<img>` wrapped in `react-medium-image-zoom`'s `<Zoom wrapElement="span" zoomMargin={20}>` + `<figcaption>Service topology</figcaption>`.
3. User clicks image → native `<dialog>` zoom modal opens (full-viewport, Esc to close, swipe to dismiss, `prefers-reduced-motion` honored).
4. User edits caption or dimensions via PropPanel → γ reconstructs.

### P2 — AI agent emits structured content
Agent writes `> [!TIP]\nUse \`npm ci\` in CI.\n\n<Image src="/screenshots/ci.png" alt="CI dashboard" />\n\n<Accordion title="Advanced flags" defaultOpen={false}>\n\n- `--fetch-retry-maxtimeout=60000`\n- `--loglevel=warn`\n\n</Accordion>`. Each path parses deterministically; round-trip on next edit preserves the agent's original form.

### Failure / recovery
- User types malformed JSX (`<Callout type="wrong">...`) → `parseWithFallback` emits `rawMdxFallback` PM node (Precedent #24) → nested CodeMirror opens showing the source → user fixes → on blur, re-parses → promotes to valid Callout if fixable.
- User types unregistered component (`<CustomThing>...</CustomThing>`) → `JsxComponentView`'s wildcard path renders → user sees name-badge + editable children (Precedent #26: all user content visible).

### Interaction state matrix

| Surface | Pristine (sourceDirty=false) | Edited (sourceDirty=true) | Unregistered (wildcard) | Parse failure |
|---|---|---|---|---|
| `<Callout>` MDX | sourceRaw verbatim; PropPanel + children editable | Reconstruct MDX JSX; PropPanel + children editable | Name badge, editable children, no PropPanel | rawMdxFallback nested CM |
| `> [!NOTE]` GFM | Byte-identical GFM form on save | Reconstruct as MDX `<Callout>` form on save | N/A (type alias fallback to parser warning) | Falls through remark, treated as blockquote |
| `<details>` HTML5 | Byte-identical `<details>` on save | Reconstruct as `<Accordion>` MDX on save | N/A | MDX agnostic raw-HTML passthrough |
| `<Image>` / `<Video>` / `<Audio>` MDX | sourceRaw verbatim; PropPanel editable | Reconstruct MDX JSX; PropPanel editable | Wildcard fallback | rawMdxFallback nested CM |
| jsxInline (inline JSX) | Source text byte-identical in WYSIWYG | N/A (no sourceDirty — text content IS source) | Same — visible text | Falls through micromark to plain text |

## 6) Requirements

### Functional (Must)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-1 | `Callout` descriptor with **7 props** (matches Mintlify type-surface + Obsidian foldable-within-GFM per D-MF17): **5-value GFM-matching `type` enum** (`note` \| `tip` \| `important` \| `warning` \| `caution`, default `note`) + `title` string (optional) + `icon` namespaced string (optional) + `color` hex string (optional; Mintlify generic-Callout parity) + `collapsible` boolean (optional, default false) + `defaultOpen` boolean (optional, default true when `collapsible`) + `children` reactnode (required). | Per `reports/cb-v2-callout-superset-research/REPORT.md` §"OK Callout Descriptor" (narrowed per D-MF11 to 5 GFM types; foldable re-added per D-MF17 to match Obsidian `> [!TYPE]+/-` within the GFM 5-type scope); ~20-entry parser alias map folds broader inputs (Mintlify's `check`/`danger`, Obsidian's `success`/`idea`/`question`/etc.) into this 5-value subset pre-descriptor lookup; lossy for some Obsidian/Mintlify-migrated content (`success` → `tip`, `danger` → `caution`, `idea` → `tip`) but additive — no semantic-loss worry when NG26 promotes and enum extends |
| FR-2 | `Image` descriptor with `src` string (required) + `alt` string + `width` number + `height` number + `caption` string + `title` string + `loading` enum ('eager'\|'lazy') + `zoom` boolean (default true) | Per `reports/cb-v2-image-superset-research/REPORT.md`; renders `<figure>` with `<figcaption>` when `caption` set |
| FR-3 | `Video` descriptor with `src` string (required) + `title` string + `controls` boolean (default true) + `autoPlay`/`muted`/`loop`/`playsInline` booleans + `poster` string + `preload` enum. **Self-closing leaf, pure HTML5 `<video>` wrapper** — no YouTube/Vimeo URL sniffing, no iframe emission, no `start` prop, no PM children slot (see D-MF19 + NG31 for the tracks/sources story; authors needing captions today write raw `<video>` + `<track>` HTML in MDX, which flows through rawMdxFallback). Matches Mintlify's explicit-iframe pattern; Fumadocs has no Video component at all. | Per `reports/cb-v2-video-superset-research/REPORT.md` §"Cross-platform comparison" (narrowed per D-MF12 + D-MF19 to match Mintlify/Fumadocs surface) |
| FR-4 | `Audio` descriptor with `src` string (required) + `title` string + `autoPlay`/`loop`/`muted` booleans + `preload` enum. Self-closing leaf symmetric with Video; `hasChildren: false, isSelfClosing: true`. No `controls` prop — controls are always on per NG7. Authors who need `<source>` codec fallback write raw `<audio>` HTML (same escape hatch as Video; see D-MF19 + NG31). | Per `reports/cb-v2-audio-superset-research/REPORT.md`; controls always on (NG7: no confidently-broken chrome) |
| FR-5 | `Accordion` descriptor with **6 props** (matches Mintlify Accordion surface + HTML5 `name` attr — no `variant`; see D-MF14): `title` string (required) + `defaultOpen` boolean + `icon` namespaced string + `description` string + `id` string + `name` string + `children` reactnode (required) | Per `reports/cb-v2-toggle-superset-research/REPORT.md` (narrowed per D-MF14); native `<details>`/`<summary>` render |
| FR-6 | DIY React component for each of the 5 using OK's own brand (shadcn/Tailwind). Zero `fumadocs-ui` React imports | `grep "fumadocs" packages/app/src/editor/components/*.tsx` returns zero hits |
| FR-7 | GFM-alerts + Obsidian-foldable parse path. `remark-github-alerts` (hyoban) tags blockquotes with `data.hName: 'callout'` + `hProperties.dataType`; a ~60-LoC post-plugin transformer (a) maps the tagged blockquote → `mdxJsxFlowElement(Callout, {type, title?})`; (b) re-inspects the original source at `blockquote.position` for the Obsidian foldable marker — regex `/^>\s*\[!\w+\]([+-])/` against the opener line — and when present adds `collapsible: true, defaultOpen: (marker === '+')` to the emitted mdxJsxFlowElement; (c) foldable recognition is scoped to the 5 GFM types (non-GFM types never match `remark-github-alerts` so the transformer never sees them). Per Q-MF1 path (a), extended for D-MF17. | Round-trip invariants: `parse('> [!NOTE]\nX') === parse('<Callout type="note">X</Callout>')`; `parse('> [!NOTE]-\nX') === parse('<Callout type="note" collapsible>X</Callout>')`; `parse('> [!NOTE]+\nX') === parse('<Callout type="note" collapsible defaultOpen>X</Callout>')` |
| FR-8 | HTML5 `<details>` → Accordion mdast promoter (~40-LoC visitor). `<details><summary>X</summary>Y</details>` parses to `mdxJsxFlowElement(Accordion, {title: 'X', defaultOpen?, name?})` with Y as children | Round-trip invariant: `parse(detailsHtml) === parse(mdxAccordionEquivalent)` |
| FR-9 | γ preserves authoring form (inherited D6 from CB-v2): user-authored `> [!NOTE]` stays on disk as `> [!NOTE]`; `<Callout>` stays as `<Callout>`; `<details>` stays as `<details>`; `<Accordion>` stays as `<Accordion>`. On edit, form canonicalizes to MDX JSX | Verified per form via round-trip invariant test |
| FR-10 | 12 fumadocs descriptors removed from `built-ins.ts`: Banner, Card, Cards, Step, Steps, Tab, Tabs, Accordion, Accordions, File, Files, Folder, TypeTable, InlineTOC | Descriptor manifest has exactly 5 entries + wildcard |
| FR-11 | `compound-wrappers.tsx`, `InlineTOCView.tsx`, `EditorContext.tsx`, `typed-children-guard.ts` + tests: deleted | Files absent; `grep` for their exports returns zero consumer hits |
| FR-12 | `fumadocs-ui` npm dep removed from `packages/app/package.json` | `bun install` resolves cleanly; `grep "fumadocs-ui" packages/app/package.json` returns zero |
| FR-13 | `--color-fd-*` CSS token bridge, `@theme` fumadocs sections, fd-steps utilities, Radix collapsible/accordion keyframes, Cards/Steps selection-halo tuning: removed from `globals.css` | `grep "color-fd-" packages/app/src/globals.css` returns zero |
| FR-14 | `@source "../../../node_modules/fumadocs-ui/dist/**/*.js"` Tailwind scan: removed from `globals.css` | — |
| FR-15 | Precedent #25 (Context Bridge Registry) retracted from this branch's `AGENTS.md`. PR #165 branch preserves the precedent text for compound tier revival | Commit `AGENTS.md` change; PR #165 branch unchanged |
| FR-16 | `react-medium-image-zoom` added as direct dep (was transitive via fumadocs-ui) | `packages/app/package.json` lists `react-medium-image-zoom@^5.4.3` |
| FR-17 | `remark-github-alerts` added as dep | — |
| FR-18 | Image component uses `wrapElement="span"` + `zoomMargin={20}` + `zoomImg.sizes: undefined` (fumadocs ImageZoom patterns) | Per `reports/cb-v2-image-superset-research/REPORT.md` |
| FR-19 | Slash-menu `ICON_COMPONENTS` map trimmed: remove 14 lucide imports for cut components; add 2 for Video + Accordion; remove dangling `GitGraph` (pre-existing dead) | 5-pack slash items + wildcard only |
| FR-20 | Rename `ImageZoom` descriptor to `Image` at manifest + componentMap keys; update `[data-component-type="image"]` CSS selector (prevents silent halo-tuning loss) | `grep "imagezoom" packages/app/src/globals.css` returns zero |

### Non-functional

- **Performance:** no regression from CB-v2 baseline. New renderers are simpler than fumadocs-ui components; bundle should trend down.
- **Reliability:** γ invariants I12–I15 + I17 inherit unchanged. I16 restored with 5-pack nested fixture rewrite per D-MF18 (NG25 withdrawn). I14 (rawMdxFallback byte-identity) scoped narrower but still tested. New invariants: I18 GFM-alerts ↔ Callout round-trip; I19 HTML5-`<details>` ↔ Accordion round-trip; I20 Obsidian foldable-Callout `+/-` round-trip.
- **Security:** `sanitizeNested` URL sanitizer unchanged (defense-in-depth for JSX attr URLs). Image `src`, Video `src`, Audio `src` flow through sanitizer at render.
- **Operability:** parse-health metrics unchanged. Callout/Image/Video/Audio/Accordion render errors route through existing severity taxonomy (info/warn/error) + rawMdxFallback.
- **Cost:** `react-medium-image-zoom` is the only net-new direct dep (~6 KB gz, already transitively present via fumadocs-ui). `remark-github-alerts` is a parse-time plugin.

## 7) Success metrics & instrumentation

Inherited from CB-v2 §7.1 (unchanged semantics; narrower component set):

| Invariant | Status | Scope change |
|---|---|---|
| **I12** — Pristine block JSX byte-identity | Inherited | Scoped to 5 descriptors |
| **I13** — Edited-path idempotence (NG12 normalization) | Inherited | Scoped to 5 descriptors |
| **I14** — rawMdxFallback byte-identity (malformed MDX corpus) | Inherited | Unchanged |
| **I15** — Observer B vs mdManager parity | Inherited | Scoped to 5 descriptors |
| **I16** — Nested effectiveDirty ancestor reconstruction | **RESTORED** (D-MF18; NG25 withdrawn) | Re-fixtured to 5-pack nested compositions: `<Callout><Accordion>`, `<Accordion><Callout>`, `<Accordion><Accordion>`, `<Callout><Callout>`, `<Callout collapsible>` wrapping `<Accordion>`. Exercises `hasDirtyDescendant` walks under jsxComponent `content: 'block*'` widening. |
| **I17** — All user content visible (Precedent #26) | Inherited | Unchanged; STOP rule stays static |

New invariants this spec introduces:

| Invariant | Intent |
|---|---|
| **I18** — GFM-alerts ↔ Callout round-trip | `parse('> [!NOTE]\nText') === parse('<Callout type="note">Text</Callout>')` produces identical PM trees; γ preserves original form on pristine save |
| **I19** — HTML5-`<details>` ↔ Accordion round-trip | `parse('<details open><summary>X</summary>Y</details>') === parse('<Accordion title="X" defaultOpen>Y</Accordion>')` identical |
| **I20** — Obsidian foldable-Callout ↔ MDX round-trip (D-MF17) | `parse('> [!NOTE]-\nX') === parse('<Callout type="note" collapsible>X</Callout>')` identical; `parse('> [!NOTE]+\nX') === parse('<Callout type="note" collapsible defaultOpen>X</Callout>')` identical; γ preserves `+/-` marker on pristine save |

Metrics: no new metrics. Inherit CB-v2 M1–M21.

## 8) Current state

Post-PR #165 (pre-this-spec):
- 17 descriptors in `built-ins.ts` (was 18; Mermaid removed 2026-04-21)
- `componentMap.tsx` imports from `fumadocs-ui`: Banner, Callout, Card, Cards, File, Files, Folder, ImageZoom, Step, Steps, TypeTable (11 imports)
- `compound-wrappers.tsx` ~431 LoC active for Tabs/Tab, Accordions/Accordion
- `InlineTOCView.tsx` + `EditorContext.tsx` active with provider wrapping in `JsxComponentView`
- `typed-children-guard.ts` + test active
- `globals.css` carries fumadocs CSS bridge: `--color-fd-*` `@theme inline`, fd-steps utilities, Radix collapsible/accordion keyframes, Cards/Steps halo tuning, `@source` fumadocs-ui dist scan (~200 LoC of CSS referencing cut descriptors)
- 14 lucide icon imports in `component-items.ts` for cut descriptors + 1 dangling (`GitGraph` from removed Mermaid)
- Test fixtures in `built-ins.json` + `ng-pinned` + VR/A11Y/selection e2e reference cut components (per explore findings)
- `bundle budget`: 850 kB main JS / 1050 kB all JS (vs main's 210 / 980 kB); not a goal-driver per user directive but trends down

## 9) Proposed solution

### User experience / surfaces

**Authoring surfaces (for each component):**

| Component | MD form | MDX form |
|---|---|---|
| Callout | `> [!NOTE]\nText` | `<Callout type="note" title?="..." icon?="lucide:..." color?="#RRGGBB">Text</Callout>` |
| Accordion | `<details><summary>X</summary>Y</details>` | `<Accordion title="X">Y</Accordion>` |
| Image | `![alt](src)` (standard CommonMark — PR #270 handles `![[file]]`) | `<Image src="x" alt="y" width={640} caption="..." />` |
| Video | HTML `<video src controls>` (passthrough) | `<Video src="x" poster="p" autoPlay muted>...</Video>` |
| Audio | HTML `<audio src controls>` (passthrough) | `<Audio src="x" autoplay loop>...</Audio>` |

**Rendering surfaces:** each component has a DIY React component in `packages/app/src/editor/components/{Callout,Image,Video,Audio,Accordion}.tsx`. Registered in `componentMap` by name. Rendered via `JsxComponentView` descriptor dispatch (unchanged). PropPanel renders editable props via the existing generic 5-type switch (no extension point in this spec — NG16).

### System design

Architecture inherits CB-v2 §9.1 verbatim — no re-derivation. Key pillars:
1. `jsxComponent` block-container schema (D1 LOCKED)
2. γ serialization (D6 LOCKED) — preserves MD vs MDX authoring form
3. Source-dirty observer (FR-7 of CB-v2 — unchanged)
4. `bridgeId` PluginState (Q10 Option A — kept: Selection layer PR #168 is the consumer)
5. ~~Context Bridge flow~~ — **DELETED** (no compound consumers; retract Precedent #25 on this branch)
6. G9 bridge always-live (D11 LOCKED) — `parseWithFallback` + `findFallbackRegion`
7. Nested Editor (D13 LOCKED) — CM-in-PM for rawMdxFallback + direct PM dispatch (Precedent #24)

New pieces (parse-side):
- `remark-github-alerts` plugin integrated into `packages/core/src/markdown/` pipeline (parse direction) + ~40-LoC downstream blockquote-to-mdxJsxFlow transformer. Final shape: `mdxJsxFlowElement(Callout, ...)` mdast nodes. Two-step per Q-MF1 path (a).
- HTML5 `<details>` → `Accordion` mdast promoter (~40-LoC unist visitor). Emits `mdxJsxFlowElement(Accordion, ...)` from `<details>`-shaped mdxJsxFlowElement or HTML-raw nodes.

### Alternatives considered

- **Keep PR #165 scope intact** — rejected: 12 fumadocs descriptors don't serve primary audiences; compound machinery is ~431 LoC of unused complexity; `PropPanel` doesn't exercise custom editors.
- **Markdown-syntax-only foundation** (ship 5 primitives purely as remark plugins + specialized mdast nodes, no JSX component authoring) — rejected by user directive: "we want the descriptor/prop panel architecture today."
- **Fumadocs cherry-pick for Callout + Image only** — investigated; cherry-picking `fumadocs-ui/components/image-zoom` brings in fumadocs-core + Radix family + class-variance-authority + tailwind-merge as transitive deps. Not clean.
- **Consolidate wikiLinkEmbed with jsxComponent at parse time** — rejected: conflicts with PR #270's storage shape.
- **Keep latent Context Bridge Registry** for future compound tier — rejected per user directive: "things without consumers should be cut; preservation is on PR #165."

## 10) Decision log

Inherited LOCKED decisions from CB-v2 SPEC §10 (see parent for rationale):

| ID | Decision | Status |
|---|---|---|
| D0 | Supersede PR #23 + block-editor-ux SPEC | **LOCKED (inherited)** |
| D1 | One `jsxComponent` node, `atom: false, content: 'block*'` | **LOCKED (inherited)** |
| D5 | Expression attrs: JSON.parse simple literals, raw-string passthrough for complex | **LOCKED (inherited)** |
| D6 | Hybrid γ serialization (`sourceRaw` pristine, reconstruct edited); jsxComponent only | **LOCKED (inherited)** |
| D7 | Custom flush-left `mdxJsxFlowElement` to-markdown handler | **LOCKED (inherited)** |
| D8 | **FLIPPED → NG14**: inline JSX as source text | **Stays FLIPPED** |
| D9/D10 | **FLIPPED → NG13**: user-registered custom components | **Stays FLIPPED** |
| D11 | G9 bridge always-live: Observer B uses `parseWithFallback` + single-pass `findFallbackRegion` | **LOCKED (inherited)** |
| D13 | CM-in-PM nested editor for `rawMdxFallback`; direct PM dispatch (Precedent #24) | **LOCKED (inherited)** |
| Q6 | Wildcard descriptor `hasChildren: true` default | **LOCKED (inherited)** |
| Q10 | `bridgeId` stored in PM PluginState (WeakMap), not schema attr | **LOCKED (inherited; consumer is PR #168 Selection layer)** |

**Narrowed** decisions:

| ID | Decision | Status |
|---|---|---|
| D3 | Built-ins manifest | **NARROWED** from 17 → 5 (Callout, Image, Video, Audio, Accordion). Rationale: audience research + audit + user directive. |
| D12 | Fidelity: use fumadocs-ui directly + Context Bridge Registry | **NARROWED** — fidelity priority retained as design principle; "use fumadocs-ui directly" path dropped (DIY all 5 with OK's own brand); Context Bridge Registry half retracted (no compound consumers). |

**New** decisions this spec:

| ID | Decision | Type | Status | 1-way? | Rationale |
|---|---|---|---|---|---|
| D-MF1 | Ship 5-pack independently of PR #270 (editor asset + embed surface). Zero overlap on parsing / storage / rendering code paths. | X | **LOCKED** | NO | Overlap audit: PR #270 modifies disjoint files (image-upload/, link-resolution.ts, hocuspocus-plugin.ts, CLI config) except for trivially-mergeable shared.ts/package.json/bun.lock. |
| D-MF2 | DIY all 5 React components using OK's brand (shadcn/Tailwind); zero fumadocs-ui React imports; remove fumadocs-ui npm dep. | X | **LOCKED** | NO | User directive: "lets not inherit fumadocs styling etc, lets just make our own using our own brand/styling/design conventions." Cherry-picking fumadocs-ui ImageZoom drags in fumadocs-core + Radix family; not a clean cherry-pick. |
| D-MF3 | `react-medium-image-zoom` as direct dep for Image. Apply fumadocs-derived patterns (`wrapElement="span"`, `zoomMargin={20}`, `zoomImg.sizes: undefined`) without importing fumadocs. | T | **LOCKED** | NO | CSS footprint is structural-only (no theme tokens); library's styles.css handles `prefers-reduced-motion`; maintained (v5.4.3 April 2026, 2.1k stars, 18.9k dependents). |
| D-MF4 | Cut `compound-wrappers.tsx`, `typed-children-guard.ts`, `EditorContext.tsx`, `InlineTOCView.tsx`. Retract Precedent #25. All preservation via PR #165 branch. | X | **LOCKED** | NO (reversible) | User directive: "if no consumers, can't we just nix? things without consumers should be cut; we'll keep preservation in the pr 165." |
| D-MF5 | GFM alerts as the base markdown-syntax parse path for Callout. **Refined by D-MF17 2026-04-23:** Obsidian `> [!TYPE]+/-` foldable marker now also ships within the GFM 5-type scope (transformer extension, not a second plugin). Docusaurus `:::note` directive + broader Obsidian non-GFM type syntax (`[!success]`, `[!idea]`, etc.) → Future Work (NG17, NG26). | P | **LOCKED + refined** | NO (reversible) | Original directive "start with just github" narrowed the PLUGIN surface; D-MF17 added the foldable marker on top of the same plugin's tokenization. Non-GFM types still defer. |
| D-MF6 | `PropPanel` keeps generic 5-type switch (no `editor?` extension, no field registry). Custom editors → Future Work with react-hook-form-style research preserved. | P | **LOCKED** | NO (reversible) | User directive: "lets keep generic for now, we can do custom editor or custom per field later." |
| D-MF7 | No migration surface: greenfield + pre-production. Existing content with cut component names (`<Tabs>`, `<Card>`, etc.) falls through to wildcard → rawMdxFallback. No deprecation warnings, no migration scripts, no rewrite utilities. | X | **LOCKED** | NO | User directive: "we're greenfield, DO NOT WORRY ABOUT BACKWARD COMPAT OR MIGRATIONS." |
| ~~D-MF8~~ *(SUPERSEDED by D-MF18)* | ~~Delete i16 (nested-dirty PBT).~~ Reversed after challenger Angle-3 finding: nested compositions across the 5-pack (Callout/Accordion intermixed, plus `<Callout collapsible>` containing nested blocks post-D-MF17) exercise the `hasDirtyDescendant` walk under jsxComponent `content: 'block*'` widening. See D-MF18 for the live decision. | T | **SUPERSEDED** | — | See D-MF18. |
| D-MF9 | Reference CB-v2 SPEC for inherited architectural decisions rather than copying text. | X | **LOCKED** | NO | Avoids drift; user directive "we don't want to relitigate architecture/etc." |
| D-MF10 | Consolidation of PR #270's `wikiLinkEmbed` NodeView with 5-pack Image/Video/Audio components is Future Work, not this spec. ~40-LoC follow-up against whichever spec merges second. Interim two-tier media UX is documented + accepted. | X | **LOCKED** | NO | User directive: "assume we'll ship first/independently of 270; but lets not do overlapping or discongruent or throwaway work that that branch is doing." |
| D-MF11 | Callout descriptor enum narrows to **GFM's 5 canonical types** (`note` \| `tip` \| `important` \| `warning` \| `caution`). Research-recommended 9-value superset (`info`, `success`, `danger`, `idea` as additional distinct types) deferred. Parser alias map folds broader inputs into this subset — lossy-but-defensible for Obsidian/Mintlify-migrated content. | P | **LOCKED** | NO (reversible — enum extends additively when NG17/NG18 promote) | User directive 2026-04-23: "gfm matching" — tightest scope match to the parse-path directive ("start with just github"). Schema-is-add-only makes enum extension free when Obsidian foldable syntax promotes. Fumadocs-specific `idea` type drops (folded to `tip`); Mintlify `success`/`danger` fold to `tip`/`caution` respectively. |
| D-MF12 | Video descriptor is **pure HTML5 `<video>` wrapper**. No YouTube/Vimeo URL sniffing, no iframe auto-emission, no `start` prop. Matches Mintlify (explicit-iframe pattern for embedded services) and Fumadocs (no Video component at all — has no opinion). Users embedding YouTube/Vimeo author raw `<iframe>` in MDX directly. | P | **LOCKED** | NO (reversible) | User directive 2026-04-23: "are we including youtube/vimeo special parsing? i don't want to do anything more than what mintlify/fumadocs do." Research report's URL-sniff recommendation overshot — both reference implementations leave service-embed to the author. Downstream consequence: raw `<iframe>` in user MDX renders via OK's existing wildcard path (likely rawMdxFallback nested CM showing iframe source) — acceptable; rich-iframe UX is Future Work. |
| ~~D-MF13~~ *(SUPERSEDED by D-MF17)* | ~~Callout descriptor has no foldable props.~~ Reversed in-session after challenger Angle-1 finding: the "compose `<Accordion><Callout>`" workaround is an OK-specific idiom not reflected in AI-agent training distribution, which defaults to Obsidian's `> [!note]-` foldable form. D-MF15 graceful-degradation preserves authoring intent but renders flat for the primary audience. See D-MF17 for the live decision. | P | **SUPERSEDED** | — | See D-MF17. Original rationale preserved for audit trail. |
| D-MF17 | **Callout has foldable props within the GFM 5-type scope.** Reverses D-MF13. Callout descriptor adds `collapsible: boolean` + `defaultOpen: boolean`. Parser supports Obsidian's `> [!TYPE]+/-` foldable marker, **limited to the 5 GFM types** (D-MF11 stays locked — 9-type enum extension remains NG26). Mapping: `-` suffix → `collapsible: true, defaultOpen: false`; `+` suffix → `collapsible: true, defaultOpen: true`; no suffix → unchanged (static Callout). Promotes NG18 within GFM-type scope only; broader Obsidian type extensions stay deferred. | P+T | **LOCKED** | NO (reversible additively; but removing a descriptor prop post-ship hits precedent #9 schema-add-only) | User directive 2026-04-23: "lets support collapsible Callout so we can fully support obsedian syntax (within gfm types)." Challenger Angle 1 landed — the primary audience (AI agents) emits Obsidian foldable syntax natively. Narrowed scope to "within GFM types" preserves D-MF11's type-enum narrow while supporting the foldable orthogonal dimension. Mintlify/Fumadocs don't ship this, but the audience-driven reason (AI-authoring) trumps the dev-docs-DSL parity standard per user directive. Downstream: NG18 withdraws (promoted); NG29 withdraws (props now shipping); NG26 unchanged (enum extension still deferred); I20 adds foldable round-trip invariant. |
| D-MF18 | **Restore i16 (nested-dirty PBT) with 5-pack fixture rewrite.** Reverses NG25. Challenger Angle-3 landed: `<Callout><Accordion>`, `<Accordion><Callout>`, `<Accordion><Accordion>`, and `<Callout collapsible>` with inner nested `<Accordion>` all exercise `hasDirtyDescendant` walk paths under γ. i16's ancestor-reconstruction invariant is non-trivial and has concrete 5-pack consumers — deleting it would leave nested effectiveDirty regressions undetected until compound tier ships. Cost: one fixture rewrite (~30 min, single file). | T | **LOCKED** | NO (reversible — fixture rewrite is the full change) | Challenger Angle 3 + user directive 2026-04-23 "agree on (a) for 3." Corrects a scope-call error in the cut-inventory: "compound parent-child is the only nested scenario" was wrong under jsxComponent widening (D1). NG25 withdraws. |
| D-MF14 | Accordion descriptor **drops `variant` enum**. Ships 6 props (`title`, `defaultOpen`, `icon`, `description`, `id`, `name` + `children`) matching Mintlify Accordion surface + HTML5 `name` attr. The `variant` enum came only from Notion's color map (`default`, `gray`, `brown`, `_background` variants) — the de-prioritized audience per user directive. Drop-now / add-later is asymmetric under precedent #9 (schema-add-only-forever): dropping is free today, adding is always free, keeping is permanent lock-in for a prop with no non-Notion consumer. | P+T | **LOCKED** | NO (reversible additively) | Cascade from D-MF11/D-MF12/D-MF13 "don't do more than Mintlify/Fumadocs + de-prioritize Notion/Obsidian" applied symmetrically. Research-recommended 7-prop descriptor included `variant` from Notion color map — same overshoot shape as Callout-foldable + Video-URL-sniffing. Precedent #9 asymmetry makes the drop strictly dominant. NG30 preserves the Notion color-map absorption path for when Notion-style variant demand surfaces. |
| D-MF16 | **Rename `Toggle` → `Accordion`.** The 6-prop surface (`title`, `defaultOpen`, `icon`, `description`, `id`, `name`) matches Mintlify `<Accordion>` 1:1; `Toggle` aligned semantically with Notion — the de-prioritized audience. Ships **standalone** (no `<Accordions>` / `<AccordionGroup>` parent wrapper required) — matches Mintlify's standalone-Accordion stance, diverges from Fumadocs's Radix-requires-parent pattern, and absorbs the "single foldable primitive" role HTML5 `<details>` provides natively. Declarative exclusive-accordion grouping via HTML5 `<details name="...">` without any wrapper component. Namespace collision: fumadocs `Accordion` + `Accordions` are cut in FR-10 in the same commit; the new foundation `Accordion` is a full replacement (clean cut, not a schema extension — both shapes have zero attr overlap beyond `title`). PR #165 branch preserves the fumadocs compound pair verbatim for future compound tier (NG19). | P+T | **LOCKED** | NO (reversible) | User directive 2026-04-23: "lets do Accordion without accordion group." Resolves two latent concerns: (1) `Toggle` connotes UI on/off switch in common usage and Notion-aligned name for our sole audience-de-prioritized platform; (2) prop surface already matched Mintlify Accordion exactly — naming it Toggle was cosmetic drift. Drift-guard: future `<Accordions>` compound wrapper (NG19) must NOT require parent wrapper for Accordion children (stays standalone-first; compound is additive for grouped-UX, not a prerequisite). |
| D-MF15 | **Unknown-attr contract on narrowed descriptors.** When an MDX author writes an attr not declared by the descriptor (e.g. `<Accordion variant="accent">` post-D-MF14, `<Callout severity="critical">`, or any speculative attr), the γ AttrBag **preserves** the attr (source-raw-sourced), the DIY renderer **ignores** it (typed-prop signature), and PropPanel **hides** it (descriptor-declared props only). Result: unknown attrs round-trip losslessly on disk but carry no runtime/UI semantic. This is the natural consequence of descriptor-dispatched rendering + γ preservation; no new machinery. | T | **LOCKED** | NO (inherited from CB-v2 descriptor architecture) | Makes explicit what was implicit: narrowing a descriptor does NOT corrupt content that was authored against a broader descriptor elsewhere. The storage-layer fidelity contract ("storage never sanitizes; renderers apply semantics") generalizes to descriptor narrowing. Audit handoff: test that `<Accordion variant="accent">` round-trips byte-identical on pristine save (I12 inherits this). (Note: `<Callout collapsible>` is no longer a "unknown-attr" example — D-MF17 promoted it to a declared prop.) |
| D-MF19 | **Video + Audio are self-closing leaf descriptors.** Removes the `children` prop from both descriptors (Video 9→8 props, Audio 7→6 props); flips `hasChildren: true` → `false` and sets `isSelfClosing: true` (symmetric with Image). The original FR-3/FR-4 promise of `<track>`/`<source>` passthrough via PM children was a category error — HTML5 requires `<track>` and `<source>` as direct children of `<video>`/`<audio>`, but ProseMirror NodeViews mandate a wrapper DOM element to host the content hole (`NodeViewContent`). The two contracts are structurally incompatible: any attempt to thread the passthrough ends up wrapping native elements in an intermediate `<div>`, which browsers don't reliably resolve as caption/fallback sources. Phase 7 QA caught it (QA-017 Video `<track>` + QA-019 Audio `<source>` both failed — rendered as escaped text inside a `<p>` wrapper, not as native elements). Captions + codec fallback sources become NG31 Future Work (typed `tracks` + `sources` array props, gated on an `array` PropDef type extension). Authors needing captions today write raw `<video>` + `<track>` HTML in MDX, which flows through the wildcard / rawMdxFallback path (byte-preserving, editable). Greenfield (D-MF7) — no migration surface; `<Video><track></Video>` never rendered captions anyway, so this is strictly a correctness + honesty fix. | P+T | **LOCKED** | NO (reversible additively via NG31; removing the `children` prop is a descriptor narrowing that precedent #9 forbids post-ship, but the 5-pack has not shipped — the decision lands before merge) | Architectural coherence. "What two staff engineers would agree on" when presented with QA-017 + QA-019: the PM-NodeView wrapper is load-bearing on the PM side; the HTML5 direct-child requirement is load-bearing on the media side; no amount of clever rendering threads the needle. Unwind the false promise. Consistent with D-MF12's "Video is pure HTML5 wrapper, author raw `<iframe>` for services" — extends the same "raw-HTML escape hatch" stance to tracks/sources. Downstream: NG31 added; QA-017 + QA-019 deleted (non-feature); FR-3 drops `children`; FR-4 drops `children` and reverts the US-008 hasChildren flip note (it was fixing the wrong bug — pre-US-008 self-closing Audio was structurally correct; US-008 changed it to match an architecturally unsound children contract; D-MF19 restores self-closing). |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Status |
|---|---|---|---|---|---|
| Q-MF1 | GFM-alerts → Callout implementation path. `remark-github-alerts` (by `hyoban`) mutates blockquote nodes with `data.hName: 'callout'` + `hProperties` — it does NOT emit `mdxJsxFlowElement` directly (audit H1 2026-04-23). Two paths: **(a)** `remark-github-alerts` + ~40-LoC blockquote-to-mdxJsxFlow transformer (downstream of the plugin; reads `data.hName === 'callout'` → emits `mdxJsxFlowElement(Callout, {type: data.hProperties.dataType})`); **(b)** skip the plugin + custom ~150-LoC blockquote visitor. Both end at the same mdast shape; path (a) is smaller surface + leverages maintained parsing. | T | **RECOMMENDED path (a)** — 2-step | No | Recommend locking path (a): retain `remark-github-alerts` for maintained GFM-alert tokenization, add a ~40-LoC post-plugin transformer. Escape hatch: if `remark-github-alerts` stops being maintained, flip to path (b) in one file. Audit citation for attribution correction: github.com/hyoban/remark-github-alerts (was incorrectly attributed to Remco Haszing). |
| Q-MF2 | HTML5 `<details>` → Accordion mdast promoter: pre-parse post-walker vs parse-time handler? | T | P0 | No | DELEGATED — implementation-time choice. |
| Q-MF3 | Callout `type` parser alias map (~22 aliases: warn→warning, error→danger, etc.): ship complete map vs minimal for launch? | P | P0 | No | LOCKED — ship complete map. Research report has the list. Zero-cost to support, user-friction-reducing. |
| Q-MF4 | Audio `hasChildren: false → true` flip to fix existing renderer mismatch — any downstream consumer of the current `false` value? | T | P0 | No | DELEGATED — verify via `grep "Audio" packages/app/src/editor/**/*.{ts,tsx}` during implementation. Expected: none — the current mismatch is the bug being fixed. |
| Q-MF5 | CSS removal sweep — any selector depending on `--color-fd-*` that isn't in a cut component's rule? | T | P0 | No | DELEGATED — verify via `grep "color-fd-" packages/app/src/globals.css` during implementation; expected zero after removal of cut-component rules. |

## 12) Assumptions

| ID | Assumption | Confidence | Verification |
|---|---|---|---|
| A-MF1 | `react-medium-image-zoom@5.4.3` remains maintained through at least 2026-H2 | MED | Latest release April 2026; check npm at finalization |
| A-MF2 | PR #270 merges with `wikiLinkEmbed` as a distinct PM node type (not collapsed into jsxComponent) | HIGH | PR body + file list confirmed; consistent across review cycles |
| A-MF3 | Selection layer (PR #168) remains the only consumer of `bridgeIdPlugin` PluginState after our cut | HIGH | Confirmed via explore output; no other downstream readers found |
| A-MF4 | `remark-github-alerts` emits mutated blockquote nodes with `data.hName: 'callout'` + `hProperties` (NOT `mdxJsxFlowElement`; NOT a custom node type). Path (a) per Q-MF1 locks in a ~40-LoC blockquote→mdxJsxFlow transformer downstream. | HIGH (now VERIFIED per audit H1 2026-04-23) | Verified via upstream source read: github.com/hyoban/remark-github-alerts |
| A-MF5 | Accordion descriptor's `name` prop for cross-browser exclusive-accordion grouping (HTML5 `<details name="...">`) reaches our target user base (Chrome 120+, Safari 17.2+, Firefox 130+ — all since 2024) | HIGH | Browser support tracked in toggle research report; target baseline = evergreen |
| A-MF6 | No existing OK user content on production relies on `<Tabs>`, `<Accordion>`, etc. in a way that materially degrades with wildcard-rawMdxFallback fallback | HIGH | Pre-production greenfield; no migration surface required per D-MF7 |

## 13) In Scope

- 5 DIY descriptors with superset prop shapes (FR-1 through FR-5) + DIY React components (FR-6)
- `remark-github-alerts` plugin integration for Callout MD form (FR-7)
- HTML5 `<details>` → Accordion mdast promoter (FR-8)
- γ authoring-form preservation for both MD and MDX paths (FR-9)
- Removal of 12 fumadocs descriptors + `compound-wrappers.tsx` + `typed-children-guard` + `InlineTOCView` + `EditorContext` (FR-10, FR-11)
- Removal of `fumadocs-ui` npm dep + `--color-fd-*` CSS token bridge + `@source` fumadocs Tailwind scan + Radix collapsible/accordion keyframes + fd-steps CSS + Cards/Steps halo tuning (FR-12, FR-13, FR-14)
- Retraction of Precedent #25 from AGENTS.md on this branch (FR-15)
- Addition of `react-medium-image-zoom` direct dep with fumadocs-derived good-defaults (FR-16, FR-18)
- Addition of `remark-github-alerts` dep (FR-17)
- Slash-menu icon map trim + Video + Accordion icon addition (FR-19)
- Rename `ImageZoom` → `Image` at descriptor + componentMap + CSS selector (FR-20)
- I12, I13, I14, I15, I17 (scoped to 5-pack) + new I18 (GFM-alerts round-trip) + I19 (HTML5 `<details>` round-trip)
- Test suite updates: fixtures for 5-pack; VR02-08/10/17 rewrites; A11Y07 cut or rewrite; A11Y10/A11Y11 rewrites; selection S1-S3 rewrites; i14 fixture rewrites (generic names); i17 compound-wrappers pin deletion; autolink-guard fixture rewrites; parse-health label cleanups

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Visual drift between `![[photo.jpg]]` (PR #270 wikiLinkEmbed → native `<img>`) and `<Image src>` (our component → rich UX) during interim before consolidation | HIGH | MEDIUM | Documented as NG24; consolidation follow-up scoped at ~40 LoC. Users notified in docs that the two paths are currently distinct tiers. |
| DIY Callout/Image implementations introduce subtle visual or a11y regressions vs the fumadocs-ui versions | MED | MED | Research reports captured the fumadocs patterns worth stealing; DIY implementations apply them (e.g., Image uses `wrapElement="span"`, `zoomMargin={20}`). VR + A11Y tests rewritten to cover 5-pack DIY renderers. |
| `react-medium-image-zoom` falls unmaintained post-2026-H2 | LOW | MED | Library has 2.1k stars, 18.9k dependents; fallback path is DIY native `<dialog>` zoom (~60 LoC). Switch at low risk. |
| Callout alias map misses a user-expected alias; user types `> [!caution]` and gets unexpected rendering | MED | LOW | Ship complete 22-entry map from research (Q-MF3 LOCKED). Unknown types pass through as `type="<literal>"` with parser warning; wildcard/rawMdxFallback catches any truly malformed. |
| CSS removal accidentally breaks kept components (e.g., Callout chrome referenced a `--color-fd-*` token) | LOW | MED | Before merge: grep + visual regression check + Callout screenshot comparison. If found, re-map to OK's shadcn semantic tokens. |
| PR #270 merges while we're mid-implementation and introduces unexpected changes to shared files | MED | LOW | Overlap audit shows minimal shared surface (shared.ts, package.json, bun.lock, AGENTS.md). Merge conflicts expected to be trivial. Rebase test at implementation start + pre-finalization. |

## 15) Future Work

### Explored tier

- **Unified media rendering (NG24).**
  - What we learned: PR #270's `wikiLinkEmbed` NodeView renders native HTML5 `<img>`/`<video>`/`<audio>`. Our 5-pack's Image/Video/Audio descriptors ship DIY React components with rich UX (zoom, caption, dimensions, YouTube/Vimeo URL sniff). Two-tier UX drift in the interim.
  - Recommended approach: amend PR #270's `wikiLinkEmbed` NodeView to import from our componentMap and dispatch extension → render our Image/Video/Audio components. ~40 LoC change + updated tests.
  - Why not in scope now: independent ship of both specs (no cross-coordination); natural follow-up against whichever merges second.
  - Triggers: both specs merged.
  - Implementation sketch: in `packages/app/src/editor/extensions/link-resolution.ts` (or wherever PR #270 lands the NodeView): replace inline `<img>`/`<video>`/`<audio>` render branches with dispatch to `componentMap.Image`/`componentMap.Video`/`componentMap.Audio`.

- **Compound tier: Tabs / Tab, Accordions-group / Accordion, Steps / Step (NG19).**
  - What we learned: full design + rationale captured in CB-v2 SPEC §9.15 Context Bridge Registry; `compound-wrappers.tsx` preserved on PR #165 branch.
  - Recommended approach: reinstate `compound-wrappers.tsx` verbatim + re-add Precedent #25 to AGENTS.md + re-register `typedChildrenGuard` extension + add compound descriptors to `built-ins.ts`.
  - Why not in scope now: audience-demand-driven (dev-docs multi-platform examples, help-center FAQ accordions); not universal.
  - Triggers: dev-docs customer onboarding surfaces Tabs demand; help-center audience surfaces FAQ-accordion demand.

- **`PropDef.editor?` per-prop editor override + custom field registry (NG16).**
  - What we learned: PropPanel currently a closed `switch` on `propDef.type`. Per-prop override covers Callout type-picker, Image URL-picker, etc. Field registry (react-hook-form-style — register `'url'`, `'icon'`, `'color'` fields with `{editor, parse, validate}`) reuses editors across components (URL picker × 3 src props).
  - Recommended approach: hybrid — per-prop `editor?` + field registry. ~120 LoC total. Earlier research preserved in this conversation's SPEC draft iteration.
  - Why not in scope now: user directive "keep generic for now." PropPanel UX iteration needed to surface which editors most wanted.
  - Triggers: UX friction around Callout type dropdown; Image URL-paste friction; NG13 custom-components unblocks (users register types).

- **Docusaurus `:::note[Title]` directive syntax for Callout (NG17).**
  - Recommended approach: `remark-directive` + ~40-LoC visitor mapping `:::type[title]{attrs}` → `mdxJsxFlowElement(Callout, {type, title?, ...attrs})`. Reuse pattern from fumadocs core `remark-directive-admonition`.
  - Triggers: Docusaurus migration demand.

- ~~**Obsidian `> [!note]+/-` foldable callout syntax (NG18).**~~ *(SHIPPED 2026-04-23 per D-MF17 within the GFM 5-type scope. Residual: broader Obsidian type syntax `> [!success]-` / `> [!idea]+` (non-GFM types) remains deferred as part of NG26 — couples enum extension with foldable-marker recognition beyond the GFM set.)*

- **Card, CardGroup, Banner, Files-tree, TypeTable, InlineTOC descriptors (NG20).**
  - Recommended approach: per-descriptor DIY components in OK brand (not fumadocs-ui) + descriptor additions. Cards/CardGroup may need compound machinery → couple with NG19.
  - Triggers: per-component audience demand surfaces.

- **Mermaid rendering (NG21).**
  - Full prior research preserved at `reports/mermaid-rendering-options-for-mdx-editors/` (9 files). Un-defer framework at `specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`.

### Identified tier

- **Math / KaTeX integration (NG22).**
  - What we know: `$...$` inline + `$$...$$` block LaTeX. Requires `remark-math` + `rehype-katex` + KaTeX runtime (~250 KB + web fonts).
  - Why it matters: academic/technical writers (Obsidian audience heavily) + AI agents emitting formulas.
  - What investigation is needed: bundle-cost analysis, lazy-loading pattern, $ delimiter ambiguity ($5.99 false-positives).

- **User-registered custom components (NG13).**
  - Inherited from CB-v2 `evidence/custom-components-deferred.md`. `react-prosemirror` migration pre-requisite documented.

- **Live-rendered inline-component editing (NG14).**
  - Inherited from CB-v2 `evidence/inline-component-editing-deferred.md`.

### Noted tier

- Podcast component (separate from Audio) — RSS + chapters + MediaSession (from audio research report).
- YouTube/Vimeo auto-promote from bare URL on paste — out of Video scope per research recommendation.
- Video captions as structured `tracks` prop (array of `{kind, src, srclang, label}` objects) vs children passthrough — current pick is children; promote if child-passthrough friction surfaces.
- AI-native primitives (Prompt, Visibility, View, Update — Mintlify's set) — Mintlify-specific; worth consideration if AI-authoring becomes the dominant use case.
- A11y test tier (`test:a11y`) re-enablement: pre-existing 3-test skip list (A11Y01 PropPanel Tab focus, A11Y03 PropPanel Esc returns focus, A11Y10 axe-core on 20-component fixture) needs dedicated PR post-this-spec.

## 16) Agent constraints

- **SCOPE:**
  - `packages/core/src/registry/*` (built-ins.ts + types.ts)
  - `packages/app/src/editor/components/*` (Callout.tsx, Image.tsx, Video.tsx, Audio.tsx, Accordion.tsx — new; componentMap.tsx — rewrite; compound-wrappers.tsx, InlineTOCView.tsx, EditorContext.tsx — delete)
  - `packages/app/src/editor/extensions/typed-children-guard.ts` + test (delete)
  - `packages/app/src/editor/extensions/JsxComponentView.tsx` (remove EditorContextProvider wrap)
  - `packages/app/src/editor/extensions/shared.ts` (remove typedChildrenGuard registration if present)
  - `packages/app/src/editor/slash-command/component-items.ts` (trim icons)
  - `packages/app/src/globals.css` (remove fumadocs bridge + `@source` + fd-steps + Radix keyframes + Cards/Steps halo; add new DIY component CSS using OK tokens)
  - `packages/core/src/markdown/*` (add GFM alerts handler + Accordion details promoter)
  - `packages/app/package.json` (remove fumadocs-ui; add react-medium-image-zoom + remark-github-alerts)
  - `packages/app/tests/**` — updates per test inventory in §13
  - `packages/core/src/markdown/fixtures/**` — updates per §13
  - `AGENTS.md` (retract Precedent #25 on this branch)
  - `specs/2026-04-23-cb-v2-md-foundation/` (this spec + evidence/ + meta/)

- **EXCLUDE:**
  - Everything in PR #270's file list (packages/app/src/editor/image-upload/, link-resolution.ts, doc-context.ts, hocuspocus-plugin.ts, CLI config, core/constants/upload.ts, asset-embed tests, asset-embed docs) — strictly owned by PR #270
  - `packages/app/src/editor/TiptapEditor.tsx` — PR #270 modifies; we avoid unless strictly required (none foreseen)
  - `packages/app/src/components/editor/**` (Selection layer territory — PR #168; orthogonal)
  - `packages/server/**` — bridge correctness, CRDT sync, persistence; no changes from this spec
  - `docs/content/**` — PR #270 ships asset-and-embeds docs; this spec adds a 5-pack reference separately (or skips docs entirely for foundation)
  - `packages/desktop/**` — unrelated

- **STOP_IF:**
  - A change to `jsxComponent` PM schema attrs / content expression is proposed → STOP, Precedent #9 (schema is add-only)
  - A change to Precedent #24 or #26 is proposed → STOP, both are inherited LOCKED
  - A consumer of `compound-wrappers.tsx` or `typed-children-guard.ts` or `EditorContext.tsx` or `InlineTOCView.tsx` surfaces (beyond what the explore identified) → STOP, re-audit before deletion
  - A change that reintroduces `--color-fd-*` CSS tokens is proposed → STOP, violates D-MF2
  - A change that overlaps with PR #270's wikiLinkEmbed parsing or upload surface is proposed → STOP, violates D-MF10

- **ASK_FIRST:**
  - Introducing any new npm dep beyond `react-medium-image-zoom` + `remark-github-alerts` (explicit deps in this spec)
  - Changing the Callout `type` enum (9 values) or parser alias map (22 entries)
  - Changing the `<details>` → Accordion promoter shape
  - Any change that narrows I12–I15 or I17 invariant coverage
  - Any change to the γ serialization contract
