# Evidence: Mintlify, Notion, HTML5, Obsidian

**Date:** 2026-04-22

## Mintlify

### Finding: Mintlify has TWO distinct components — Accordion and Expandable
**Confidence:** CONFIRMED
**Sources:** mintlify.com/docs/components/accordions, mintlify.com/docs/components/expandables

**Expandable** (minimal, API-ref oriented):
| Prop | Type | Default | Required |
|------|------|---------|----------|
| `title` | string | — | Yes |
| `defaultOpen` | boolean | `false` | No |

Quote: `"title: The name of the object you are showing."`, `"defaultOpen: Set to true for the expandable to open when the page loads"`.

**Accordion** (richer, content-oriented):
| Prop | Type | Required | Default |
|------|------|----------|---------|
| `title` | string | Yes | — |
| `description` | string | No | — |
| `defaultOpen` | boolean | No | `false` |
| `id` | string | No | — |
| `icon` | string | No | — |
| `iconType` | string | No | — |

Both support standalone use (unlike Fumadocs). The Accordion has richer chrome (description, icon, anchor id); Expandable is the minimal toggle variant used inline inside ResponseField groups.

## Notion

### Finding: Notion has TWO distinct primitives — `toggle` block and toggleable heading
**Confidence:** CONFIRMED
**Source:** developers.notion.com/reference/block

**Toggle block** (`type: "toggle"`):
| Field | Type | Description |
|-------|------|-------------|
| `rich_text` | array | "The rich text displayed in the toggle block." |
| `color` | enum | `default`, `blue`, `green`, `red`, `purple`, `pink`, `orange`, `yellow`, `gray`, `brown` + `_background` variants |
| `children` | array | "The nested child blocks, if any, of the toggle block." |

**Toggleable heading** (`heading_1`/`heading_2`/`heading_3` with `is_toggleable: true`):
> "Whether or not the heading block is a toggle heading or not. If `true`, then the heading block toggles and can support children."

Distinct primitives. The toggle block is a paragraph-like container; the toggleable heading is a heading that happens to reveal children. Children types are arbitrary blocks in both cases.

## HTML5 `<details>` / `<summary>`

**Source:** html.spec.whatwg.org (WHATWG HTML Living Standard)

### Finding: `<details>` has two authoring attributes — `open` and `name`
**Confidence:** CONFIRMED

- **`open`**: boolean attribute. "Indicates whether the additional information is visible to the user." Toggled by user-agent when `<summary>` is activated.
- **`name`**: groups `<details>` elements into an exclusive accordion. Spec: "Opening one member of this group causes other members of the group to close." And: "A document must not contain more than one `details` element in the same details name group that has the `open` attribute present."

### Finding: `name` attribute browser support (2024)
**Confidence:** CONFIRMED
**Source:** developer.mozilla.org/en-US/blog/html-details-exclusive-accordions/, developer.chrome.com/docs/css-ui/exclusive-accordion

- Chrome 120 (Dec 2023)
- Safari 17.2 (Dec 2023)
- Firefox 130 (Sep 2024) stable
- "Available across browsers since 2025"

### Finding: Content model requires `<summary>` first, then flow content
**Confidence:** CONFIRMED
- `<summary>` acts as the clickable label.
- Activation toggles the `open` attribute via user-agent.
- Default UA styling provides a disclosure triangle.
- Keyboard: Enter/Space on focused summary toggles.
- ARIA: UAs expose implicit `role=group` with `aria-expanded` derived from `open`.

## Obsidian

**Sources:** help.obsidian.md/callouts, obsidian forum threads

### Finding: Obsidian foldable callouts are a callout variant, not a standalone Toggle
**Confidence:** CONFIRMED

- `> [!note]+` — callout, foldable, default OPEN
- `> [!note]-` — callout, foldable, default CLOSED
- `> [!note]` — callout, NOT foldable

Quote: "Adding a plus sign or minus sign directly after the type controls whether the callout can fold."

Obsidian has **no dedicated Toggle block primitive** in core markdown. The foldable callout carries both the callout chrome (colored chevron + type-icon + title bar) AND the fold behavior. To produce a plain "headed collapsible" you repurpose `> [!note]-` with a neutral type.

## Docusaurus / GitBook / Hashnode

**Sources:** docusaurus.io, docs.gitbook.com, hashnode.com

### Finding: Docusaurus = raw HTML5 `<details>`/`<summary>` pass-through
**Confidence:** CONFIRMED
- Docusaurus MDX renders `<details><summary>…</summary>…</details>` natively; no special component.
- Known caveats: MDX wraps line-breaks in `<p>` inside summary (keep summary on one line); code blocks inside `<details>` are finicky; `prefers-reduced-motion` breaks nested collapsibles (Docusaurus issue #8906).

### Finding: GitBook has a first-class `Expandable` block
**Confidence:** CONFIRMED
- Block-editor only (no markdown syntax); title + default-expanded option.
- Not MDX-authored; exported markdown uses GitBook's custom notation.

### Finding: Hashnode Docs supports MDX but has no dedicated Toggle component
**Confidence:** INFERRED
- Hashnode's WYSIWYG editor surfaces HTML `<details>` via MDX; no documented proprietary Toggle component.

## Remark/rehype ecosystem

**Sources:** github.com/Rokt33r/remark-collapse, github.com/remarkjs/remark-directive

### Finding: Three relevant plugin patterns
**Confidence:** CONFIRMED

1. **`remark-collapse`** — finds a heading, wraps the section beneath it in `<details>`/`<summary>`. Inverts the problem: treats a heading as a toggle trigger. Not what OK needs.
2. **`remark-directive`** + custom handler — authors use `:::details Title` blocks; handler converts to `<details>`. Used by some Docusaurus themes.
3. **Native MDX passthrough** — MDX already parses `<details>`/`<summary>` as raw HTML JSX. No plugin required; the question is how the downstream AST handler recognizes it as a Toggle (the `<summary>` is the title).

For OK, the cleanest path is a **custom mdast→PM handler** that matches `html` or `mdxJsxFlowElement` with `name === 'details'`, extracts the first `<summary>` child as the toggle title, and treats remaining children as the Toggle's block content.
