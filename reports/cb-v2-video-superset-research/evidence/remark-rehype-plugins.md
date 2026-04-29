# Evidence: Remark / Rehype Video Plugin Landscape

**Dimension:** Markdown → video pipeline plugins
**Date:** 2026-04-22
**Sources:** NPM search, unified ecosystem explorer, GitHub

---

## Findings

### Finding: `rehype-video` (jaywcjlove) — link-to-video transformer
**Confidence:** CONFIRMED
**Evidence:** <https://github.com/jaywcjlove/rehype-video>

- **URL match:** default RegExp `/\/(.*)(\.mp4|\.mov)$/` — mp4 + mov by default; `test` option accepts custom RegExp or function to add webm/ogv
- **Output:** `<video muted controls style="max-height:640px;" src="URL"></video>` — optionally wrapped in `<details open><summary>…</summary>…</details>` when `details: true` (the default)
- **Options:** `test` (URL matcher), `details` (boolean), `track` (boolean — enables subtitle track support via URL hash params like `#title=Foo`, `?track['en']=path.vtt&track['en:label']=English`)
- **Runs at rehype layer** (HAST), so it sees already-parsed link nodes. Pairs well with a link-only markdown source.

### Finding: `remark-oembed` — async oEmbed URL transformer
**Confidence:** CONFIRMED
**Evidence:** npmjs.com/package/remark-oembed, unified explorer

- Supports **oEmbed protocol**: YouTube, Vimeo, CodePen, Flickr, Instagram, Reddit, Twitter, SoundCloud (via `oembed-parser` package's provider list)
- **Async** — makes network requests to each provider's oEmbed endpoint. This is a blocker for pure-client and for `react-markdown` (which only accepts sync plugins).
- Emits whatever HTML the provider returns (usually an iframe).

### Finding: `remark-youtube` (pkolt) — YouTube-only URL sniffer
**Confidence:** CONFIRMED
**Evidence:** <https://github.com/pkolt/remark-youtube>

- Recognizes `https://youtu.be/ID` and `https://www.youtube.com/watch?v=ID`
- Emits iframe player HTML
- ESM-only; sync

### Finding: `gatsby-remark-embed-video` — multi-provider shortcode plugin
**Confidence:** CONFIRMED
**Evidence:** npmjs.com/package/gatsby-remark-embed-video

- Uses `youtube: ID` / `vimeo: ID` inline shortcode syntax in source markdown (not URL sniffing)
- Supports YouTube, Vimeo, Twitch, VideoJS, Youku, Coub
- Gatsby-scoped — not directly usable outside Gatsby but pattern transfers

### Finding: `@raae/gatsby-remark-oembed` — generic oEmbed
**Confidence:** CONFIRMED
**Evidence:** gatsbyjs.com/plugins/@raae/gatsby-remark-oembed

- Tested with CodePen, Flickr, Instagram, Reddit, Twitter, Vimeo, YouTube, SoundCloud
- Async (oEmbed network fetch)

---

## Pipeline design implications for OK CB-v2

**Parse path options for `![[video.mp4]]` → PM JsxComponent `Video`:**

| Source pattern | Detection layer | Transform |
|---|---|---|
| `![[video.mp4]]` (OFM) | remark (wiki-link) | Already handled by existing wikilink micromark extension. Extend wikilink handler to detect video extensions → emit `JsxComponent` with `name='Video'`, `attributes.src={resolved-path}` instead of image |
| `<Video src="..." />` (MDX) | remark-mdx | Already handled by MDX pipeline |
| `<video src="..." />` (raw HTML) | remark-mdx / mdxAgnostic | Remark parses as `mdxJsxFlowElement` with name `video`; handler normalizes to `JsxComponent` |
| `https://youtube.com/watch?v=ID` (bare URL) | Optional remark plugin (not in core scope) | URL-sniff → `JsxComponent` with `name='Video'`, `attributes.src=embed-URL` |
| `[text](https://youtube.com/...)` or `.mp4` link | rehype-video style | NOT recommended for OK — rehype runs after HAST conversion; OK operates on mdast/PM |

**Recommendation:** OK does NOT need a new remark plugin for the MVP. The existing wiki-link micromark tokenizer + MDX agnostic mode + raw-HTML path already cover the three canonical sources (Obsidian, MDX, raw HTML). URL-sniffing YouTube/Vimeo links can ship as a separate opt-in plugin at a later date — not required for the descriptor.

**NG for CB-v2 v1:** Do not adopt `remark-oembed`. Async plugins break the sync react-markdown / Y.Doc observer model and introduce network dependency at parse time, violating both the existing serialize invariants and the PRECEDENT #15 "idempotent micromark extensions" rule.
