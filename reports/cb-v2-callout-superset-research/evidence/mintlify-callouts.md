# Evidence: Mintlify Callouts

**Date:** 2026-04-22
**Sources:** `https://www.mintlify.com/docs/components/callouts`

---

## Findings

### Finding: Mintlify ships 6 typed callouts plus a generic `<Callout>`
**Confidence:** CONFIRMED
**Evidence:** Mintlify Callouts docs page.

Six typed callouts, each with preset icon + color, children-only:

| Component | Semantic |
|---|---|
| `<Note>` | neutral info |
| `<Tip>` | positive hint |
| `<Info>` | informational |
| `<Warning>` | caution |
| `<Check>` | success/positive confirmation |
| `<Danger>` | negative/destructive |

### Finding: Generic `<Callout>` accepts icon + color customization
**Confidence:** CONFIRMED
**Evidence:** Mintlify Callouts docs page.

Generic `<Callout>` props:

| Prop | Type | Notes |
|---|---|---|
| `icon` | string | Icon name or URL |
| `iconType` | enum | Font Awesome style: `regular` \| `solid` \| `light` \| `thin` \| `sharp-solid` \| `duotone` \| `brands` |
| `color` | string | Hex color (e.g. `#FFC107`) |
| `children` | ReactNode | Content |

Icons can come from Font Awesome, Lucide, Tabler, external URL, local file, or inline SVG (SVGR).

### Finding: No title prop on typed callouts; content is children
**Confidence:** CONFIRMED
**Evidence:** Docs example `<Note>This adds a note in the content</Note>`.

Mintlify typed callouts do **not** have a `title` prop. The entire content is `children`. This is different from Fumadocs where `<Callout title="...">` is a first-class prop.

### Finding: No documented nesting or foldable behavior
**Confidence:** INFERRED (absence)
**Evidence:** Not present on docs page.

No foldable/collapsible state, no nesting rules documented. Content is inline MDX.

---

## Gaps / follow-ups

- Default icons per typed variant not enumerated in docs (they are rendered but not listed as a table).
- Whether typed callouts accept title as a markdown-first-line convention (like Obsidian) is not documented.
