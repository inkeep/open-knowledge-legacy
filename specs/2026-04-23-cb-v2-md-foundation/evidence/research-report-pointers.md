---
sources: reports/cb-v2-*-superset-research/REPORT.md (5 reports, committed 315deae6)
kind: research-pointers
cutoff: 2026-04-23
---

# Research report pointers

Each of the 5 superset research reports is the load-bearing evidence for that component's prop shape. Instead of duplicating prop tables here, this spec defers to the reports directly.

## Callout

- Report: [`reports/cb-v2-callout-superset-research/REPORT.md`](../../../reports/cb-v2-callout-superset-research/REPORT.md)
- **Final descriptor shape (narrowed per D-MF11, foldable re-added per D-MF17)**: 7 props — `type` (**5-value GFM-matching enum per D-MF11**), `title` (optional), `icon` (optional, namespaced string), `color` (optional, hex), `collapsible` (optional boolean, per D-MF17), `defaultOpen` (optional boolean, per D-MF17), `children` (required). Foldable is scoped to the 5 GFM types per D-MF11 — non-GFM types stay deferred to NG26. Mintlify/Fumadocs don't ship foldable Callouts; OK ships per the AI-agent-authoring audience directive (Obsidian `> [!TYPE]+/-` is the native form AI agents emit for foldable admonitions).
- **Type enum narrow from research recommendation**: research recommended 9 canonical values. This spec adopts **5 GFM-matching values only** (`note` \| `tip` \| `important` \| `warning` \| `caution`). Parser alias map folds broader inputs into this subset. The research's 9-value superset is deferred to NG26 (promotes alongside NG17/NG18 Obsidian/Docusaurus parse paths).
- **Alias folding (lossy)**: `success → tip`, `danger → caution`, `idea → tip`, `info → note`, `check → tip`, `error → caution`, `bug → caution`, `failure → caution`, `question → note`, `faq → note`, `abstract → note`, `summary → note`, `tldr → note`, `todo → note`, `warn → warning`, `attention → warning`, `hint → tip`, etc. ~20 aliases covering Mintlify + Obsidian + Pandoc + Fumadocs source tokens.
- **Migration matrix**: §"Migration Matrix" in report covers Fumadocs, Mintlify, Obsidian, GFM, Docusaurus, Pandoc source forms → OK MDX form. Migration from Mintlify's 6-type set or Obsidian's 13-type set is semantically lossy until NG26 promotes — user authoring via MDX form is limited to the 5 GFM types today.
- **Parse plugin**: `remark-github-alerts` (hyoban) tags blockquotes with `data.hName: 'callout'`; a ~60-LoC post-plugin transformer handles both the GFM → mdxJsxFlowElement mapping AND the Obsidian `+/-` foldable-marker detection within the GFM 5-type scope (D-MF17). Docusaurus directive syntax remains Future Work NG17.
- **Critical finding**: fumadocs-obsidian's `remarkConvert` silently drops the Obsidian `+`/`-` foldable marker — OK is strictly better under D-MF17 (preserves + renders foldable within the GFM type set).

## Image

- Report: [`reports/cb-v2-image-superset-research/REPORT.md`](../../../reports/cb-v2-image-superset-research/REPORT.md)
- **Final descriptor shape**: §"OK Image Descriptor Recommendation" — 8 props: `src`, `alt`, `width`, `height`, `caption`, `title`, `loading`, `zoom` (default true)
- **Render details**: `<figure>` + `<figcaption>` when `caption` set; bare `<img>` otherwise; `<Zoom wrapElement="span" zoomMargin={20}>` wrapper when `zoom !== false`
- **Zoom library**: `react-medium-image-zoom@^5.4.3` — same library fumadocs-ui wraps; direct dep in this spec
- **Fumadocs patterns stolen**: `wrapElement="span"` (prevents `<p><div>` invalid nesting), `zoomMargin={20}` default, `zoomImg.sizes: undefined` override
- **Migration matrix**: §"Migration Matrix" — 11 source forms including Obsidian `![[img.png|640x480]]` sizing syntax (owned by PR #270 for wiki-embed path; MDX form owned here)

## Video

- Report: [`reports/cb-v2-video-superset-research/REPORT.md`](../../../reports/cb-v2-video-superset-research/REPORT.md)
- **Final descriptor shape (narrowed per D-MF12)**: 9 props — `src`, `title`, `controls`, `autoPlay`, `muted`, `loop`, `playsInline`, `poster`, `preload`, + `children` (reactnode, for `<track>` passthrough). **Pure HTML5 `<video>` wrapper.**
- **Narrow from research recommendation**: research recommended a 10-prop descriptor including a `src` prop that sniffed YouTube/Vimeo URLs at render time + a `start` seek prop. This spec drops both per D-MF12 — neither Mintlify nor Fumadocs auto-promotes service URLs. Mintlify documents explicit `<iframe src="https://youtube.com/embed/ID">` for service embeds; Fumadocs has no Video component at all.
- **Caption handling**: children passthrough for `<track>` elements (kind="captions" etc.)
- **Service embeds (YouTube/Vimeo)**: users author raw `<iframe>` in MDX (matches Mintlify's documented pattern). Rendering of user-authored `<iframe>` in OK's editor uses existing MDX agnostic / wildcard paths; rich `<iframe>` UX is NG28 Future Work.
- **Critical finding from report**: Video is a **genuine gap in Fumadocs** — zero Video component in the Fumadocs monorepo; DIY HTML5 wrapper is the correct path
- **Rejected**: async `remark-oembed` / `@raae/gatsby-remark-oembed` — violates CRDT-sync invariant (parse must be sync + deterministic). Aligns with D-MF12.

## Audio

- Report: [`reports/cb-v2-audio-superset-research/REPORT.md`](../../../reports/cb-v2-audio-superset-research/REPORT.md)
- **Final descriptor shape**: §"Recommended CB-v2 Audio Descriptor" — 7 props: `src`, `title`, `autoplay`, `loop`, `muted`, `preload` (enum), `children`
- **`hasChildren` flip**: current manifest declares `false` but renderer passes `children`; this spec fixes to `true`
- **Critical finding**: podcast metadata (chapters, transcripts, MediaSession) intentionally **out of Audio descriptor scope** — if demand surfaces, ship as separate `<Podcast>` component (RSS-shaped, different noun)
- **Render upgrade path (Future Work, not this spec)**: AI Elements AudioPlayer on media-chrome for richer chrome (renderer swap, no descriptor change)

## Accordion

- Report: [`reports/cb-v2-toggle-superset-research/REPORT.md`](../../../reports/cb-v2-toggle-superset-research/REPORT.md)
- **Final descriptor shape (narrowed per D-MF14)**: 6 props — `title` (required), `defaultOpen`, `icon` (namespaced string), `description`, `id`, `name`, + `children`. **`variant` enum dropped** — came only from Notion's color map (de-prioritized audience per "don't do more than Mintlify/Fumadocs"). Research recommended 7 props; narrow to 6 matches Mintlify Accordion surface exactly + adds HTML5 `name` for declarative accordion grouping. Under precedent #9 (schema-add-only-forever), keeping would be permanent lock-in for a prop with no non-Notion consumer; dropping is strictly dominant (free to add later when demand surfaces via NG30).
- **Serialization substrate**: native HTML5 `<details>` + `<summary>` — cross-browser interchange for free (Docusaurus, Hashnode, GitHub all render `<details>` natively)
- **Parse path**: `<details>` → Accordion mdast promoter (~40 LoC); `<Accordion>` MDX form parses directly via existing MDX agnostic
- **HTML5 `name` attribute**: Chrome 120 / Safari 17.2 (Dec 2023), Firefox 130 (Sept 2024) — enables exclusive-accordion grouping declaratively without JavaScript. Ship as prop; becomes the substrate for compound accordion UX without needing `<Accordions>` wrapper in Phase 2
- **Critical finding**: Obsidian has **no** dedicated Accordion primitive natively — only foldable callouts (`> [!note]-`). OK's Accordion is the Notion-style dedicated primitive; distinct from Callout

## Common threads across all 5 reports

1. **MDX = strict superset of MD form** — every component's MDX JSX carries all information the markdown form does plus more (props, attributes, richer UX).
2. **γ preservation of authoring form** — dual-form-preserving serialization means both paths round-trip user's intent.
3. **Standard-library plugin backing** — every MD-form parse path is supported by a maintained remark/rehype plugin or HTML5 passthrough; no bespoke conventions.
4. **Migration is additive, not lossy** — content migrated from Fumadocs/Mintlify/Obsidian/Docusaurus/HTML5 can be losslessly normalized (or preserved via γ).
