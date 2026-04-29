# Evidence: Remark plugin landscape for callouts

**Date:** 2026-04-22
**Sources:** GitHub repos for remark-directive, remark-callout-directives, remark-github-alerts; Fumadocs `remark-directive-admonition`; Docusaurus docs.

---

## Findings

### Finding: `remark-directive` is the substrate for `:::type` syntax
**Confidence:** CONFIRMED
**Evidence:** remark-directive README.

Three directive forms keyed by colon count:

| Syntax | Form | mdast node | Use case |
|---|---|---|---|
| `:name` | Text | `textDirective` | Inline annotation |
| `::name` | Leaf | `leafDirective` | Block void (no children) |
| `:::name` | Container | `containerDirective` | Block with children |

Common grammar: `:::name[label]{attr=val .class #id}`
- `[label]` exposed as `node.data.directiveLabel` on a child paragraph
- `{…}` attributes map to `node.attributes`
- Nesting: use **more colons** for outer containers (not fewer).

`remark-directive` does NOT understand callouts — it just parses syntax. You add a second plugin that visits `containerDirective` nodes with names in a types-allowlist and rewrites them.

### Finding: `@microflash/remark-callout-directives` — most featureful directive-based plugin
**Confidence:** CONFIRMED
**Evidence:** README fetch (GitHub repo still accessible; moved to Codeberg).

- Built-in themes: **GitHub**, **Microflash**, **VitePress**
- Syntax: `:::type` + `{title="Custom"}` attribute; closed with `:::`
- Nesting: more colons on outer
- HTML output:
  ```html
  <aside class="callout callout-note">
    <div class="callout-indicator">
      <div class="callout-hint"><!-- SVG icon --></div>
      <div class="callout-title">Note</div>
    </div>
    <div class="callout-content"><!-- markdown --></div>
  </aside>
  ```
- Config: `callouts` (custom types with icons), `aliases`, `tagName` (swap `aside` → `details` for collapsible), `showHint`, `generate()` hook for layout override.
- **Status:** GitHub archived 2026-03-27; active on Codeberg. v5.0.0 (2025-10). 19 GH stars — small but well-maintained.

### Finding: `remark-github-alerts` — dedicated GFM alert parser
**Confidence:** INFERRED
**Evidence:** npm and GitHub direct fetches rate-limited during research; corroborated via Fumadocs CHANGELOG and general npm ecosystem knowledge.

Parses `>[!NOTE]` blockquote syntax into either HTML `<div class="markdown-alert markdown-alert-note">` or MDX elements. The ecosystem standard for GFM alerts. Maintained by Remco Haszing (unified org contributor) — high credibility, active.

### Finding: Fumadocs ships its own `remarkDirectiveAdmonition`
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/remark-directive-admonition.ts`.

Purpose-built for migrating from Docusaurus `:::type` syntax into `<CalloutContainer>/<CalloutTitle>/<CalloutDescription>` slotted MDX. Accepts `tags` option to rename output component names. Type map customizable.

### Finding: `remark-admonitions` (Docusaurus legacy) — deprecated
**Confidence:** CONFIRMED
**Evidence:** Docusaurus admonitions docs page; Fumadocs CHANGELOG 2023 deprecated its own `remarkAdmonition` in favor of `remarkDirectiveAdmonition`.

Original pre-`remark-directive` Docusaurus parser. Modern pipelines use `remark-directive` + a mapper.

### Finding: `portaljs/remark-callouts` — Obsidian-syntax parser
**Confidence:** UNCERTAIN (404s during fetch)
**Evidence:** Repo exists but URL shape was wrong; need to probe `github.com/datopian/*` or `github.com/portaljs/*` directly.

Designed for Obsidian `>[!type]` syntax, typically emits HTML `<div class="callout callout-warning">` with a foldable affordance when `+`/`-` markers are present.

---

## Plugin decision matrix for Open Knowledge

The OK pipeline already has `remark-mdx-agnostic` + `remark-gfm` + `remark-wikilink` wired in. Adding callout parsing has three options:

| Option | Surface | Who it covers | Effort |
|---|---|---|---|
| **A.** `remark-directive` + custom visitor | `:::type[Title]{key=val}` | Docusaurus, Pandoc, Quarto, Fumadocs directive path | Medium (one visitor) |
| **B.** `remark-github-alerts` | `>[!NOTE]` only | GFM alerts | Low (drop-in) |
| **C.** Custom blockquote visitor (Obsidian-shape) | `>[!type]+ Title` (foldable + title) | Obsidian, kepano vault | Low |
| **D.** `@microflash/remark-callout-directives` | directive path, with built-in themes | Pandoc, Docusaurus, Quarto | Low but opinionated output |

**Recommended combination for OK CB-v2:** A + B + C. The three syntaxes are orthogonal (directive vs. GFM-alert blockquote vs. Obsidian blockquote-with-type-marker) and each has a canonical plugin or a ~30-line visitor. D is rejected because its HTML output collides with the descriptor registry's JSX-element assumption — OK needs MDX, not `<aside>`.

---

## Gaps / follow-ups

- `@portaljs/remark-callouts` maintenance status and exact output shape needs re-fetch.
- Obsidian foldable state (`+`/`-`) emission as an MDX attribute — no existing plugin does this cleanly; Fumadocs-obsidian captures but discards it. OK could preserve as `collapsible` + `defaultOpen`.
