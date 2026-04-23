---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---

feat: Component Blocks v2 — 5-pack foundation (Callout + Image + Video + Audio + Accordion)

BREAKING: `jsxInline` schema narrows from `content: 'inline*'` + `{attributes, sourceRaw}` attrs to `content: 'text*'` with zero attrs. Mid-flight collab pairs on different versions will see stale-shape inline content render empty (the R13 `@tiptap/y-tiptap` patch logs + skips; no Y.Item tombstoning — see `packages/core/src/schema-invariant.test.ts` `ALLOWED_NARROWINGS` registry and the SH05 regression test at `packages/app/tests/integration/jsx-schema-narrowing-safety.test.ts`). Pre-1.0 semver allows the break at minor, but the change is load-bearing for anyone upgrading under an in-flight collab session.

Widens `jsxComponent` from atom to a block-container node (`atom: false, content: 'block*'`, `isolating: true`) with runtime descriptor dispatch for a **5-pack foundation** — `Callout`, `Image`, `Video`, `Audio`, `Accordion` — plus a `'*'` wildcard fallback for unregistered names. Each descriptor ships a DIY React renderer on the OK brand (shadcn + Tailwind); zero `fumadocs-ui` React imports and zero `--color-fd-*` CSS tokens in the editor bundle.

- **Callout** (7 props) — 5-type GFM enum (`note`/`tip`/`important`/`warning`/`caution`) plus `title`/`icon`/`color`/`collapsible`/`defaultOpen` (Obsidian foldable within GFM scope, D-MF17). `remark-github-alerts` + a post-plugin transformer parse `> [!NOTE]` and `> [!WARNING]-` into the descriptor; a 23-entry alias map folds common Obsidian / Mintlify / Pandoc type tokens to the GFM set.
- **Image** (8 props) — `src` / `alt` / `width` / `height` / `caption` / `title` / `loading` / `zoom`. Click-to-zoom via `react-medium-image-zoom` with `wrapElement="span"`, `zoomMargin={20}`, `zoomImg.sizes: undefined`; `<figure>` / `<figcaption>` when `caption` is set.
- **Video** (9 props) — pure HTML5 `<video>` wrapper per D-MF12. No YouTube / Vimeo URL sniffing, no iframe emission, no `start` prop. `<track>` children round-trip. Matches Mintlify's explicit-iframe pattern.
- **Audio** (6 props) — pure HTML5 `<audio>` wrapper with native controls always on (no `controls` prop, per NG7). `<source>` / `<track>` children round-trip.
- **Accordion** (6 props) — standalone HTML5 `<details>` / `<summary>` substrate per D-MF16. Cross-browser exclusive grouping via HTML5 `<details name="…">`. HTML5 `<details>` source form → `<Accordion>` via a mdast promoter; `<Accordion>` serializes back to the authored form byte-identical on pristine save.

Adds:

- Floating PropPanel with auto-generated controls (string / boolean / enum / number) from descriptor prop definitions (`PropDef[]` — no `react-docgen-typescript` runtime dep).
- Slash-command insertion with default-prop fallbacks and auto-open popover.
- Hover-revealed side-menu chrome: move up / down, delete, settings gear.
- Keyboard navigation (Esc / arrow / Enter with suggestion + popover priority coordination).
- Embedded CodeMirror nested editor for `rawMdxFallback` (parse-failure surface) with unified undo via PM transaction dispatch (no `y-codemirror.next`).
- Observer B flipped to `parseWithFallback` and ancestor-chain-local `findFallbackRegion` — broken nodes degrade only their tightest structural region.
- Source-dirty tracking for hybrid γ serialization — pristine (unedited) components serialize via byte-identical `sourceRaw` passthrough; edited components reconstruct via `mdxJsxFlowElement`.

Cut in this release (deliberate; preservation is on the PR #165 branch commit `e56f33c3`): the fumadocs `Banner` / `Card` / `Cards` / `Step` / `Steps` / `Tab` / `Tabs` / `Accordion` (compound fumadocs shape) / `Accordions` / `File` / `Files` / `Folder` / `TypeTable` / `InlineTOC` descriptors, `compound-wrappers.tsx`, `typed-children-guard.ts`, `EditorContext.tsx`, `InlineTOCView.tsx`, the `--color-fd-*` CSS variable bridge, and the `@source "…fumadocs-ui/dist…"` Tailwind scan. The Context Bridge Registry architectural precedent is retracted on this branch (AGENTS.md #27 / PRECEDENTS.md #29). All of these are additive-to-restore when a compound tier lands (deferred as NG19 / NG20).

Migration: existing content that uses any cut descriptor name (`<Tabs>`, `<Card>`, `<Steps>`, `<Banner>`, `<Files>`, `<TypeTable>`, `<InlineTOC>`, `<Mermaid />`, the former `<AudioPlaceholder />` stub, …) falls through to the wildcard `'*'` descriptor — the MDX source renders as an editable nested-CodeMirror source block and the bytes round-trip byte-identical on save. Rename `<AudioPlaceholder />` → `<Audio />` to pick up the built-in descriptor chrome. Rename `<ImageZoom>` → `<Image>` (the new descriptor name per FR-20) to pick up the widened 8-prop shape.

Schema note (per SPEC §FR-4, NG14): `jsxInline` narrows from `inline*`+attrs to `text*`+zero-attrs. The change is greenfield-authorized by the spec's user directive; the prior shape shipped in PR #136 (two days earlier) and is explicitly replaced with no migration. The `y-prosemirror@1.3.7` patch is the schema-throw safety net for **block**-context mismatches — it substitutes `rawMdxFallback` so content is preserved. For **inline**-context mismatches the patch logs + skips (inline Y.Items are NOT destructively deleted — a pre-existing-but-never-applied destructive delete was replaced with a no-op delete-from-mapping), so stale-schema inline content would render empty rather than corrupt the Y.Doc. Greenfield clears this for external consumers; mid-flight collab pairs should upgrade together.
