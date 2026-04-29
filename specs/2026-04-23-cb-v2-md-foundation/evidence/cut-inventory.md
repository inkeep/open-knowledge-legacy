---
sources:
  - packages/core/src/registry/built-ins.ts
  - packages/app/src/editor/components/
  - packages/app/src/editor/extensions/
  - packages/app/src/globals.css
  - packages/app/tests/
  - reports/worldmodel-pr-165-component-blocks-v2/audit-mvp-component-claims.md
kind: surface-inventory
cutoff: 2026-04-23
---

# Cut Inventory

Complete list of files + CSS sections + test fixtures to cut. Sourced from the Explore pass on 2026-04-23. Every item has zero 5-pack consumers.

## Descriptors (built-ins.ts)

Cut 12 primitive families (14 descriptors total counting sibling-pair parent+child relationships):
- Banner (content; L294-317 + manifest L517-525)
- Card + Cards (content/layout; L60-107 + L379-400)
- Step + Steps (content/layout; L111-127 + L401-421)
- Tab + Tabs (layout; L131-167 + L424-444)
- **fumadocs Accordion + Accordions** (layout; L171-201 + L447-467) — Radix-based compound pair with `<Accordions>` parent wrapper requirement. Distinct from the new foundation `Accordion` descriptor added below (shared name, different shape: standalone, HTML5 `<details>` substrate, 6-prop Mintlify-Accordion-shaped surface per D-MF14/D-MF16).
- File + Files + Folder (layout; L205-256 + L470-502)
- TypeTable (data; L321-335 + L528-537)
- InlineTOC (content; L339-346 + L538-547)

Keep 3 existing: Callout (L33-56 + L367-378), ImageZoom→Image (L258-292 + L505-515), Audio (L348-363 + L559-569).

Add 2 new: Video, **Accordion** (formerly Accordion; renamed per D-MF16 2026-04-23 — 6-prop standalone primitive; no `Accordions` wrapper per user directive).

Final manifest: **5 + wildcard**. Namespace collision: the descriptor name `Accordion` is re-used — fumadocs compound-pair cut in the same commit as foundation Accordion added; clean replacement under greenfield + schema-add-only (precedent #9) because the fumadocs shape + the new shape have no attr overlap beyond `title`.

## React component files (packages/app/src/editor/components/)

Delete:
- `compound-wrappers.tsx` — 431 LoC, only consumers were Tab/fumadocs-Accordion/etc (fumadocs compound pairs, not the new foundation Accordion which uses HTML5 `<details>` directly)
- `InlineTOCView.tsx` + `InlineTOCView.test.ts` — only InlineTOC consumer
- `EditorContext.tsx` — only InlineTOCView consumed it; `JsxComponentView.tsx:813` provider wrapping becomes null-consumer

Rewrite:
- `componentMap.tsx` — remove 11 fumadocs-ui imports (Banner, Callout, Card, Cards, File, Files, Folder, ImageZoom, Step, Steps, TypeTable). Rename map key `ImageZoom → Image`. Remove EditorAccordion/EditorAccordions/EditorTab/EditorTabs imports. Inline Audio function → extract to `Audio.tsx`.

Add (DIY, OK's brand):
- `Callout.tsx` — ~150 LoC (shadcn semantic tokens + lucide icons, **5 GFM types** per D-MF11, **foldable via `collapsible` + `defaultOpen` props** per D-MF17 — Obsidian `> [!TYPE]+/-` syntax also supported via extended FR-7 transformer)
- `Image.tsx` — ~120 LoC (react-medium-image-zoom wrapper + figure/figcaption)
- `Video.tsx` — ~60 LoC (**pure HTML5 `<video>` wrapper** per D-MF12 — no URL sniffing, no iframe emission)
- `Audio.tsx` — ~40 LoC (extracted from componentMap inline function; expanded props)
- `Accordion.tsx` — ~40 LoC (native `<details>` + styled `<summary>` chevron; 6-prop Mintlify-Accordion-shaped surface per D-MF14/D-MF16; standalone — no `<Accordions>` wrapper)

## Editor extensions (packages/app/src/editor/extensions/)

Delete:
- `typed-children-guard.ts` + `typed-children-guard.test.ts` — 5-pack has zero `emptyChildName` descriptors; plugin becomes no-op. Reinstate with compound tier.

Modify:
- `JsxComponentView.tsx` — remove `EditorContextProvider` wrap (L813)
- `shared.ts` — remove `typedChildrenGuard.configure(...)` registration if present

Keep unchanged (load-bearing):
- `bridge-id-plugin.ts` — consumer is PR #168 Selection layer
- `source-dirty-observer.ts` — γ consumer
- `raw-mdx-fallback.ts` + `RawMdxFallbackCMView.tsx` — always-live bridge (D11) + D13

## CSS (packages/app/src/globals.css)

Remove:
- `@theme inline` fumadocs token bridge (`--color-fd-*` + semantic color aliases) — ~200 LoC block
- `@source "../../../node_modules/fumadocs-ui/dist/**/*.js"` Tailwind scan
- fd-steps utilities (~50 LoC including `.fd-step::before` editor-compensation)
- Radix collapsible keyframes + `--animate-fd-collapsible-*` vars (Files/Folder consumers)
- Radix accordion keyframes + `--animate-fd-accordion-*` vars (Accordion consumer)
- `[data-component-type="cards"]` + `[data-component-type="steps"]` selection-halo tuning
- `[data-component-type="imagezoom"]` selector → rename to `[data-component-type="image"]`

Keep:
- `--color-fd-*` → replace with OK's shadcn tokens (semantic mapping)
- Callout-specific halo tint (re-author with OK tokens)
- Selection-layer halo base + forced-colors + drag suppression — generic
- Chrome bar, add-child pill, empty placeholder — generic (verify consumers)
- `prose-no-margin` — generic
- rawMdxFallback chrome — generic (verify selectors)

Add:
- New DIY component CSS using OK's shadcn semantic tokens (Callout variants, Accordion chrome, Video/Audio wrappers)

## Slash menu (packages/app/src/editor/slash-command/component-items.ts)

ICON_COMPONENTS map:
- Remove 14 lucide icons for cut descriptors: `ChevronDown, ChevronsUpDown, FileText, Flag, FolderOpen, FolderTree, Hash, LayoutGrid, List, ListOrdered, PanelTop, Square, SquareMousePointer, Table`
- Remove `GitGraph` — dangling import from removed Mermaid (pre-existing dead code)
- Keep `MessageSquareWarning` (Callout), `ZoomIn` (Image), `Volume2` (Audio)
- Add `Play` or `Film` (Video), `ChevronRight` (Accordion)

Slash items auto-shrink via descriptor iteration — no manual edits needed beyond icon map.

## Fixtures

`packages/core/src/markdown/fixtures/mdx/built-ins.json` — drop 7 entries for cut components:
- `card` (L18), `cards` (L22), `steps` (L27), `tabs` (L32), `accordion` (L38), `banner` (L43), `card-with-unknown-attrs` (L58)

Keep wildcard/inline/expression cases; add new entries for Video + Accordion + widened Audio + widened Image + widened Callout.

`packages/core/src/markdown/fixtures/ng-pinned/component-blocks-v2.json` — drop `case-6` (Steps nested). Keep 9 others.

## Test files

Delete:
- `packages/app/src/editor/extensions/typed-children-guard.test.ts`
- ~~`packages/app/tests/fidelity/invariant-i16.test.ts`~~ *(RESTORED per D-MF18 2026-04-23; NG25 withdrawn. File kept. Fixture rewrite: replace compound-tier parent-child probes with 5-pack nested compositions — `<Callout><Accordion>`, `<Accordion><Callout>`, `<Callout collapsible>` wrapping `<Accordion>`, same-type nesting.)*

Rewrite:
- `packages/app/tests/visual/component-parity.e2e.ts` — drop VR02 Card, VR03 Cards, VR04 Steps, VR05 Tabs, VR06 Accordions, VR08 Files, VR10 Banner. Keep VR01 Callout, VR18 wildcard. Edit VR17 mixed-doc to 5-pack. Add new VR blocks for Image (+caption/zoom), Video, Audio, Accordion.
- `packages/app/tests/a11y/component-blocks.e2e.ts` — A11Y07 (empty-container activation on `<Steps>`): delete or rewrite around Callout children. A11Y10 fixture: rewrite to 5-pack only. A11Y11 (XSS `javascript:` via `<Card href>`): rewrite to `<Image src>` or `<Video src>`.
- `packages/app/tests/stress/selection-indicator.e2e.ts` — S1, S2, S3 fixtures use `<Card />`, `<Cards><Card/></Cards>`. Rewrite S1 + S2 around Callout. S3 (innermost-wins) needs nested container: use Callout inside Callout OR cut S3 until compound tier.
- `packages/app/tests/fidelity/invariant-i14.test.ts` — rewrite `<Card>`/`<Steps>` illustrations to wildcard names (generic logic preserved)
- `packages/app/tests/fidelity/invariant-i17.test.ts` — delete the `compound-wrappers.tsx` source pin (file deleted); keep broader NODE_VIEW_SOURCES introspection check
- `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` L100-110 — rewrite `<Card>`, `<Tab label>` illustrations to wildcard names
- `packages/core/src/metrics/parse-health.test.ts` — rewrite `'Card'`/`'Tabs'` label examples to kept names

## Dependencies

Remove from `packages/app/package.json`:
- `fumadocs-ui` — all React imports eliminated

Add to `packages/app/package.json`:
- `react-medium-image-zoom@^5.4.3` — direct dep (was transitive via fumadocs-ui)
- `remark-github-alerts` — pending Q-MF1 decision (candidate; alternative is custom ~150-line visitor)

## Precedent retractions

`AGENTS.md` on this branch:
- Retract Precedent #25 (Context Bridge Registry) — no active consumers on the 5-pack scope; preservation on PR #165 branch

Do not touch Precedents #24 (direct PM dispatch), #26 (all user content visible) — both have active consumers.

## Overlap audit with PR #270

Files touched by PR #270 (strictly avoid):
- `packages/app/src/editor/extensions/doc-context.ts`
- `packages/app/src/editor/extensions/link-resolution.ts` + test
- `packages/app/src/editor/extensions/shared.ts` (low-risk shared; our change is removal of `typedChildrenGuard` registration if present — trivial merge)
- `packages/app/src/editor/image-upload/` (upload infra)
- `packages/app/src/editor/TiptapEditor.tsx` (avoid unless strictly required)
- `packages/app/src/server/hocuspocus-plugin.ts`
- `packages/cli/src/**` (config schema)
- `packages/core/src/constants/upload.ts`
- Upload/asset tests + docs

Zero code overlap expected. Trivially-mergeable shared files: `package.json`, `bun.lock`, `AGENTS.md`.
