---
title: "CB-v2 Toggle — Superset Research"
description: "Cross-platform research on standalone Toggle/Expandable/Collapsible components (Fumadocs, Mintlify, Notion, HTML5 <details>, Obsidian, Docusaurus, GitBook, remark ecosystem) to inform the Open Knowledge CB-v2 Toggle descriptor as a SUPERSET of external surfaces."
createdAt: 2026-04-22
updatedAt: 2026-04-22
subjects: [Fumadocs, Mintlify, Notion, HTML5 details, Obsidian, Docusaurus, GitBook, remark]
topics: [component descriptor, collapsible UI, MDX serialization, standalone toggle]
---

# CB-v2 Toggle — Superset Research

**Purpose:** Inform the OK CB-v2 5-pack's Toggle descriptor as a superset of existing platform surfaces. Scope is the **standalone** toggle/collapsible case. Grouped-accordion behavior (sibling state coordination) is explicitly out of scope — a Phase 2 concern.

## Executive Summary

The standalone Toggle shape is narrow and highly convergent across platforms. Every surface investigated reduces to the same three load-bearing props: a **title** (the clickable label), an **open-by-default** boolean, and a **children** slot for block content. Divergence lives in three optional dimensions: an **icon** on the trigger chrome (Mintlify Accordion), a **description/subtitle** under the title (Mintlify Accordion only), and an **id** for anchor-linking / deep-link auto-open (Fumadocs, Mintlify Accordion).

The most consequential finding for OK is that **HTML5 `<details>` is now a first-class, standards-aligned primitive**: the `name` attribute (Chrome 120 / Safari 17.2 Dec 2023, Firefox 130 Sept 2024) enables exclusive-accordion grouping declaratively without JavaScript. Treating `<details>` as the serialization substrate for OK Toggle — with the descriptor as the authoring surface — gives OK cross-platform interchange for free (Docusaurus, GitHub, Hashnode, vanilla MDX all render `<details>` natively).

**Key Findings:**
- **Fumadocs has no true standalone case** — `<Accordion>` is always an item inside `<Accordions>`. The idiomatic "single toggle" is `<Accordions type="single"><Accordion title="..." /></Accordions>`.
- **Mintlify has two primitives** — `Expandable` (minimal: `title` + `defaultOpen`) and `Accordion` (adds `description`, `icon`, `iconType`, `id`). OK's superset must cover both.
- **Notion distinguishes toggle blocks from toggleable headings** — `is_toggleable` is a flag on heading blocks, separate from the `toggle` block type. OK can stay focused on the toggle-block case; toggleable headings are a later, orthogonal feature.
- **HTML5 `<details name="...">` makes exclusive accordions declarative** — stable since late 2023 in Chrome/Safari, 2024 in Firefox. OK should expose `name` as a first-class Toggle prop so authors opt into cross-browser accordion grouping without needing the compound `<Accordions>` wrapper.
- **Obsidian has no native Toggle primitive** — only foldable callouts via `> [!note]-` / `> [!note]+`. Not a direct migration source; document the distinction.

## Detailed Findings

### Fumadocs (Radix + Base UI variants)

Fumadocs does not ship a single-item Toggle. The `<Accordion>` export is an `AccordionItem` that requires a parent `<Accordions>` (the Radix root) for controlling state. A standalone use is `<Accordions type="single"><Accordion title="..." /></Accordions>` — the single-item group degenerate case.

Surface on the inner `<Accordion>`:
- `title: string | ReactNode` (required)
- `id?: string` — enables hash-link deep-open (`window.location.hash` match → auto-expand)
- `value?: string` — internal key; defaults to `String(title)`

Initial open state lives on the parent `<Accordions defaultValue="...">` matching the item's `value` — there is no `defaultOpen` on the item. The base-ui variant adds `hiddenUntilFound` so browser find-in-page reveals collapsed content (a progressive-enhancement delta worth carrying forward).

**Implications:** Fumadocs' shape is awkward to migrate one-to-one. Mapping: Fumadocs `title` → Toggle `title`; Fumadocs `id` → Toggle `id`; Fumadocs `defaultValue === value` → Toggle `defaultOpen: true`.

### Mintlify — Expandable vs Accordion

Mintlify ships two distinct primitives that overlap in behavior but differ in chrome. OK's Toggle superset must cover both.

| Surface | Expandable | Accordion |
|---|---|---|
| `title` | required | required |
| `defaultOpen` | yes (bool, default false) | yes (bool, default false) |
| `description` | — | yes (subtitle under title) |
| `icon` | — | yes (Lucide/Font Awesome/URL/SVG) |
| `iconType` | — | yes (FA style variant) |
| `id` | — | yes (anchor-linkable) |

**Implications:** Expandable is the "minimal toggle" shape (used inline inside API-reference `ResponseField` groups). Accordion is a richer content-oriented toggle with icon/description chrome. OK's descriptor should make the Expandable subset required and the Accordion extras optional.

### Notion — toggle blocks vs toggleable headings

Notion has two distinct primitives. The `toggle` block (type `"toggle"`) carries `rich_text` + `color` + `children`. Toggleable headings are `heading_1`–`heading_4` with an `is_toggleable: true` flag.

**Implications:** OK Toggle maps cleanly to Notion's toggle block (title = `rich_text`, children = `children`). The `color` field is Notion-specific chrome; if OK adds a `variant` enum it can absorb this. Toggleable headings are a separate feature and do not collapse into OK's Toggle — they belong to a future `Heading` extension.

### HTML5 `<details>` / `<summary>`

`<details>` is a first-class, standards-aligned toggle primitive with two authoring attributes — `open` (boolean) and `name` (string, groups exclusive accordions).

- `open` → `defaultOpen` in the OK descriptor.
- `name` → `name` in the OK descriptor. Spec text: "Opening one member of this group causes other members of the group to close." Browser support: Chrome 120 + Safari 17.2 (Dec 2023); Firefox 130 (Sept 2024). Available across all major browsers since 2025.
- Content model: first child MUST be `<summary>` (the title); remaining children are flow content.
- Keyboard: Enter/Space on focused `<summary>` toggles.
- ARIA: UA exposes `role=group` with `aria-expanded` derived from `open`.

**Implications:** OK should treat `<details>` as both the **authoring shortcut** (users type `<details><summary>…</summary>…</details>` in MDX and get a Toggle node) and the **serialization target** (Toggle descriptor round-trips to `<details>` by default). The `name` attribute is the standards-blessed mechanism for exclusive-accordion grouping — exposing it means OK's single-item Toggle is also the atom from which cross-browser accordion groups are authored, without a compound `<Accordions>` wrapper.

### Obsidian — foldable callouts (not a Toggle primitive)

Obsidian has no dedicated Toggle block in core markdown. `> [!note]-` is a foldable callout closed-by-default; `> [!note]+` is foldable open-by-default; `> [!note]` (no sign) is not foldable. The fold behavior is a callout modifier, not an independent primitive.

**Implications:** OK's Toggle is a **distinct** primitive from OK's Callout — users who want "a titled collapsible without callout chrome" should use Toggle; users who want "a colored, icon-adorned, foldable callout" should use a foldable Callout variant (orthogonal feature, Phase 2).

### Docusaurus / GitBook / Hashnode

Docusaurus is pure HTML5 `<details>` passthrough (no proprietary component). GitBook has a block-editor-only `Expandable` block with no markdown syntax. Hashnode relies on MDX `<details>` passthrough.

**Implications:** If OK serializes Toggle to `<details>` by default, Docusaurus and Hashnode interchange work without conversion. GitBook migration requires a one-way import path (block-editor JSON → OK Toggle descriptor).

### remark/rehype plugin landscape

Three plugin patterns exist: (1) `remark-collapse` wraps content beneath a heading into `<details>` — inverts the problem; (2) `remark-directive` + custom handler implements `:::details Title` syntax; (3) native MDX `<details>` passthrough needs only an mdast→PM handler that recognizes `mdxJsxFlowElement` with `name === 'details'` and extracts the first `<summary>` child as title.

**Implications:** OK should NOT adopt directive syntax (`:::details`) — it diverges from the ecosystem. Cleanest implementation is the native-passthrough handler: users author either `<Toggle>` (OK descriptor) OR `<details><summary>…</summary>…</details>` (HTML5), and both parse into the same PM node. Serialization preserves the user's original form per the storage-layer fidelity contract.

---

## Recommended OK Toggle descriptor (SUPERSET)

```ts
Toggle: {
  name: 'Toggle',
  category: 'disclosure',
  emptyChildName: 'content',
  hasChildren: true,
  props: [
    { name: 'title',       type: 'string',   required: true  },  // all platforms
    { name: 'defaultOpen', type: 'boolean',  defaultValue: false  },  // Mintlify, HTML5 open, Notion
    { name: 'icon',        type: 'reactnode', required: false },  // Mintlify Accordion
    { name: 'description', type: 'string',   required: false },  // Mintlify Accordion
    { name: 'id',          type: 'string',   required: false },  // Fumadocs, Mintlify, anchor-link
    { name: 'name',        type: 'string',   required: false },  // HTML5 exclusive-accordion grouping
    { name: 'variant',     type: 'enum', enumValues: ['default','muted','accent'], defaultValue: 'default' },
  ],
}
```

Seven-prop union of every platform investigated. Only `title` is required; everything else is optional, so the Expandable / `<details>` minimal case remains a one-prop authoring experience.

## Migration matrix

| Source | Mapping |
|---|---|
| **Fumadocs** `<Accordions><Accordion title="T" id="x" />` | `<Toggle title="T" id="x" />` (single-item unwrap) |
| Fumadocs `<Accordions defaultValue="T">` | `<Toggle title="T" defaultOpen>` |
| **Mintlify Expandable** `<Expandable title defaultOpen>` | `<Toggle title defaultOpen>` (identity) |
| **Mintlify Accordion** `<Accordion title description icon id defaultOpen>` | `<Toggle title description icon id defaultOpen>` (identity) |
| **HTML5** `<details open><summary>T</summary>…</details>` | `<Toggle title="T" defaultOpen>…</Toggle>` |
| **HTML5** `<details name="g"><summary>T</summary>…</details>` | `<Toggle title="T" name="g">…</Toggle>` |
| **Notion** toggle block `{rich_text, color, children}` | `<Toggle title={rich_text} variant={colorMap[color]}>{children}</Toggle>` |
| **Obsidian** `> [!note]- T` | Callout, NOT Toggle (keep as foldable Callout; distinct node) |
| **GitBook** Expandable block | `<Toggle title defaultOpen>` via import path |

## Serialization & parsing

**Round-trip rule (per OK storage-layer fidelity contract):** Toggle serializes back to the same authoring form the user originally typed.

- Source authored as `<Toggle title="T">…</Toggle>` → serialize as `<Toggle>…</Toggle>` (MDX/JSX form)
- Source authored as `<details><summary>T</summary>…</details>` → serialize as `<details>` (HTML form)
- New Toggles created via UI → default to `<Toggle>` JSX form

**Parse path:** A new mdast visitor matches:
1. `mdxJsxFlowElement` with `name === 'Toggle'` → Toggle PM node, attrs from `attributes`.
2. `mdxJsxFlowElement` with `name === 'details'` → Toggle PM node; first `<summary>` child → `title` attr; remaining children → node content; `open` attribute → `defaultOpen`; `name` attribute → `name`.
3. `html` raw-HTML matching `<details>…</details>` (non-MDX markdown) → same extraction.

Slots in at the same stage the `JsxComponent` descriptor dispatch runs (see `packages/core/src/registry/`) with a single additional pre-pass for the `<details>` → Toggle promotion. No new remark plugin dependency required — ~40 lines in `packages/core/src/markdown/`.

## Relationship to Accordions-group (out of scope, Phase 2)

The compound `<Accordions>` (sibling state coordination — one-open-at-a-time, roving focus) is **deliberately not** part of the foundation. Two architectural paths remain open:

1. **HTML5 `name` attribute** — OK Toggles with a shared `name` behave as an exclusive accordion declaratively, no React state coordination. Cross-browser since 2025. Lowest-complexity path.
2. **Compound `<Accordions>` wrapper** — a future CB-v2 compound component.

Path 1 covers most authoring intent with zero additional primitives. Path 2 becomes necessary if OK needs controlled state, programmatic open/close APIs, or coordinated transitions — none of which are Phase 1 goals.

## Remark plugin recommendation

**Do NOT add `remark-collapse` or `remark-directive` as dependencies.** Both diverge from the HTML5 / MDX-native authoring surface the rest of the ecosystem standardized on. Instead, add a ~40-line mdast visitor in `packages/core/src/markdown/toggle-parse.ts` that handles the three parse-path cases above. Keeps the dependency surface flat and centralizes Toggle parsing under OK's own pipeline.

## Limitations & Open Questions

- `hiddenUntilFound` (browser find-in-page reveal) is not in the minimum descriptor. Worth adding as a Phase-1.5 boolean.
- Icon rendering strategy (Lucide vs arbitrary ReactNode vs URL) is left to the descriptor's `icon` prop type. Mintlify supports five forms; OK can start with ReactNode and extend if migration corpus demands.
- Animation (open/close transition) is a CSS concern and stays at the render layer.

## References

### Evidence Files
- [evidence/fumadocs-accordion.md](evidence/fumadocs-accordion.md)
- [evidence/mintlify-notion-html5.md](evidence/mintlify-notion-html5.md)

### External Sources
- [Radix UI Accordion](https://www.radix-ui.com/primitives/docs/components/accordion)
- [Mintlify Accordion](https://mintlify.com/docs/components/accordions)
- [Mintlify Expandable](https://mintlify.com/docs/components/expandables)
- [Notion API — block reference](https://developers.notion.com/reference/block)
- [WHATWG HTML Living Standard — `<details>`](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-details-element)
- [MDN Blog — exclusive accordions via HTML details](https://developer.mozilla.org/en-US/blog/html-details-exclusive-accordions/)
- [Chrome for Developers — Exclusive Accordion](https://developer.chrome.com/docs/css-ui/exclusive-accordion)
- [Obsidian Help — Callouts](https://help.obsidian.md/callouts)
- [Docusaurus — Markdown Features](https://docusaurus.io/docs/markdown-features)
- [GitBook — Expandable](https://docs.gitbook.com/creating-content/blocks/expandable)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [remark-collapse](https://github.com/Rokt33r/remark-collapse)
