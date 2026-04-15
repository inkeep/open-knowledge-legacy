# Evidence: D4 — Docs-as-code frameworks (Docusaurus, Mintlify, Fumadocs)

**Dimension:** How static docs frameworks render markdown tables
**Date:** 2026-04-14
**Sources:** OSS local (Fumadocs), OSS-GitHub/npm (Docusaurus via Infima), closed (Mintlify)

---

## Key files / pages

- `fumadocs/packages/tailwind/src/typography/styles.ts` — Fumadocs's typography plugin
- `fumadocs/packages/radix-ui/src/mdx.tsx` — Fumadocs Radix UI MDX component mapping (defines a `Table` wrapper component)
- https://unpkg.com/infima@0.2.0-alpha.45/dist/css/default/default.css — Infima's default CSS (Docusaurus's styling framework)
- https://github.com/facebook/docusaurus/discussions/11308 — discussion of Docusaurus table behavior

---

## Findings

### Finding: Docusaurus applies `display: block; overflow: auto` directly on `<table>` via Infima CSS, converting the table itself into a block-scroll container
**Confidence:** CONFIRMED
**Evidence:** Infima default.css at unpkg, retrieved 2026-04-14:

```css
table {
  border-collapse: collapse;
  display: block;
  margin-bottom: var(--ifm-spacing-vertical);
  overflow: auto;
}
```

Plus `table thead tr { border-bottom: 2px solid ... }`, `table tr { background-color: ... }`, `table th, table td { border: ... solid ...; padding: var(--ifm-table-cell-padding); }`. No `.table-*` wrapper classes are defined — the `<table>` is its own scroll container.

`table-layout` is not set → browser default (`auto`) applies.

**Implications:** This is the **Block-scroll** family in its purest form. The `<table>` has `display: block`, which unlike default `display: table` (a) lets it behave like a block element for overflow purposes and (b) makes `overflow: auto` create a scroll container on the table itself. No wrapper is needed; the markdown parser can emit a raw `<table>` and Docusaurus's CSS handles it. Trade-off noted in community discussions (e.g., discussion #11308): `display: block` breaks `table-layout: fixed` column-width control, and some layouts lose the table's natural column sizing behavior.

---

### Finding: Docusaurus does not map a custom React component for the `table` tag; rendering is pure CSS
**Confidence:** CONFIRMED
**Evidence:** `docusaurus-theme-classic/src/theme/MDXComponents/index.tsx` lists component mappings for `a`, `img`, `ul`, `li`, `Code`, `Details`, `Heading`, `Pre` — but no `table`. Directory listing at https://github.com/facebook/docusaurus/tree/main/packages/docusaurus-theme-classic/src/theme/MDXComponents confirms no Table file exists.

**Implications:** All Docusaurus table styling is CSS-only via Infima — there is no JSX wrapper interposed by the theme. This differs from Fumadocs, which ships a React wrapper component.

---

### Finding: Fumadocs Radix variant wraps every markdown table in a React component with `<div class="relative overflow-auto prose-no-margin my-6">`
**Confidence:** CONFIRMED
**Evidence:** `fumadocs/packages/radix-ui/src/mdx.tsx:52-58`

```tsx
function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative overflow-auto prose-no-margin my-6">
      <table {...props} />
    </div>
  );
}
```

The typography plugin (`packages/tailwind/src/typography/styles.ts:74-123`) sets table to `width: 100%; tableLayout: 'auto'` under a default variant. An optional `roundedTable` variant adds `overflow: hidden` to the table itself (for border-radius clipping), with cell-level borders instead of table-level.

**Implications:** Fumadocs is a **Wrapper-scroll** implementation at the component level — markdown tables automatically get the wrapper without any author markup. The wrapper's `overflow-auto` (both axes) handles overflow in both directions. `table-layout: auto` lets columns size to content. This is the most prescriptive default among docs-as-code frameworks observed.

---

### Finding: Mintlify's table rendering is not publicly documented at the CSS layer
**Confidence:** INACCESSIBLE
**Evidence:** WebFetch of https://mintlify.com/docs/api-playground/overview returned markdown source, not rendered HTML. Mintlify's implementation CSS is not in a public repository. No raw CSS URL was discoverable.

**Implications:** Mintlify could be using any of the strategies in this report; confident classification requires signed-in DOM inspection or access to Mintlify's closed source. Flagged as INACCESSIBLE per the incompleteness taxonomy.

**What was searched:**
- GitHub for "mintlify" + table CSS: Mintlify's public repos (mintlify/docs starter, mintlify/components) do not contain the rendering CSS — those are example/docs repos, not product source.
- Direct WebFetch of a docs page: returned markdown, not rendered HTML.

---

## Cross-framework summary

| Framework | Implementation layer | Strategy | table-layout | Wrapper | Evidence level |
|---|---|---|---|---|---|
| **Docusaurus** | CSS (Infima) | Block-scroll (`display: block` + `overflow: auto` on `<table>`) | (auto, but effectively `block`) | none — table itself | CONFIRMED |
| **Fumadocs** | React wrapper component | Wrapper-scroll (`<div overflow-auto>`) | `auto` | `<div class="...overflow-auto...">` | CONFIRMED |
| **Mintlify** | Unknown | INACCESSIBLE | — | — | INACCESSIBLE |

---

## Notable contrast between Docusaurus and Fumadocs

Both are popular MDX-based docs frameworks, but they pick opposite strategies:

- **Docusaurus:** no JSX wrapper, `display: block` on table. Table's own overflow.
- **Fumadocs:** JSX wrapper `<div>`, regular `display: table` on table. Wrapper's overflow.

Functionally both achieve horizontal scroll for wide tables, but they diverge on whether `table-layout: fixed` could be layered on top (Docusaurus's `display: block` partially breaks it — cf. issue comments in #11308; Fumadocs's `display: table` preserves it).

---

## Gaps / follow-ups

- Mintlify remains INACCESSIBLE — a live DOM inspection in an authenticated Mintlify environment would resolve this.
- Fumadocs's default Tailwind variant (non-Radix) may have a different wrapper — verify by checking `fumadocs/packages/core/src/mdx-plugins/` or the non-Radix MDX component set.
- The Infima version queried (0.2.0-alpha.45) may not match the Infima currently bundled with the latest Docusaurus. Verify the rule hasn't changed in a newer Infima release.
