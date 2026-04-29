---
title: "CB-v2 Video Component Superset Research"
description: "Cross-platform Video component survey (Fumadocs absence, Mintlify, Obsidian, HTML5, YouTube/Vimeo embed) yielding a superset Video descriptor + migration matrix for Open Knowledge Component Blocks v2."
createdAt: 2026-04-22
updatedAt: 2026-04-22
subjects:
  - Fumadocs
  - Mintlify
  - Obsidian
  - HTML5 video
  - YouTube
  - Vimeo
  - remark-embed-video
topics:
  - video components
  - media embed
  - URL sniffing
  - MDX descriptors
  - CRDT sync invariants
---

# CB-v2 Video Component Superset Research

**Purpose:** Inform OK CB-v2 5-pack's Video descriptor as a SUPERSET of Fumadocs, Mintlify, Obsidian, HTML5, and common embed providers (YouTube/Vimeo).

---

## Executive Summary

Video is a **genuine gap in fumadocs's component family** — the platform ships no `<Video>` primitive, only a Tailwind Typography rule that adds vertical margin to bare HTML5 `<video>` tags. Every CB-v2 5-pack peer (Callout, Image, Audio, Toggle) can inherit a fumadocs prop surface as its starting union; Video cannot. The superset must instead be assembled from three sources: Mintlify's documented MDX pattern (itself raw HTML5 passthrough), Obsidian's file-embed syntax, and the HTML5 `<video>` / `<source>` / `<track>` spec.

Mintlify's canonical surface is a **7-prop subset** of HTML5: `src`, `controls`, `autoPlay`, `muted`, `loop`, `playsInline`, `className` — plus raw `<iframe>` with `src`, `allow`, `allowFullScreen`, `title` for YouTube. Obsidian's `![[video.mp4]]` file-embed handles five video formats (mp4, webm, mov, ogv, mkv) with implicit `controls` on, no syntax for autoplay/loop/muted, and zero native URL-sniffing for YouTube/Vimeo (users paste raw iframes). HTML5 itself exposes **~15 main attributes** plus `<source>` fallback and `<track>` captions.

The recommended CB-v2 descriptor is a **hybrid**: scalar props for the ergonomic-common path (Mintlify + Obsidian coverage), optional props for HTML5 completeness tail (captions, poster, format fallback), and a single `src` prop accepting local paths, direct media URLs, AND YouTube/Vimeo URLs — with provider detection in the render layer, not the parse layer.

**Key Findings:**
- **Video is absent from fumadocs.** Zero `.tsx`/`.ts` files define a Video component anywhere in the monorepo; only typography CSS.
- **Mintlify and Obsidian both refuse to own URL-sniffing.** Both require users to hand-author `<iframe>` for YouTube/Vimeo. An OK descriptor that auto-promotes provider URLs is a strict improvement.
- **Captions are superset-exclusive.** Neither Mintlify nor Obsidian exposes `<track>` in their documented surface.
- **No new remark plugin required for MVP.** OK's wiki-link micromark extension, MDX agnostic mode, and raw-HTML pathway together cover every detectable source.

---

## Detailed Findings

### Cross-platform comparison

| Prop / Capability | Fumadocs | Mintlify | Obsidian (`![[]]`) | HTML5 spec |
|---|---|---|---|---|
| `src` | — (passthrough) | yes | file-path-encoded | yes |
| `controls` | — | yes | implicit ON, not toggleable | yes |
| `autoplay` / `autoPlay` | — | yes (camelCase) | no | yes |
| `muted` | — | yes | no | yes |
| `loop` | — | yes | no | yes |
| `playsinline` / `playsInline` | — | yes (camelCase) | no | yes |
| `poster` | — | no | no | yes |
| `preload` | — | no | no | yes |
| `width` / `height` | — | no (className) | `\|W` for images, inferred for video | yes (absolute px) |
| `<source>` format fallback | — | no | no (auto by ext) | yes |
| `<track>` captions / subtitles | — | no | no | yes (WebVTT) |
| `crossorigin` | — | no | no | yes |
| `disablepictureinpicture` | — | no | no | yes |
| `disableremoteplayback` | — | no | no | yes |
| `controlslist` | — | no | no | yes |
| YouTube auto-embed from URL | — | no (hand iframe) | no (hand iframe) | — |
| Vimeo auto-embed from URL | — | no | no | — |
| File extensions supported | all `<video>`-compatible | all | mp4, webm, mov, ogv, mkv | varies by browser |

**Finding:** Fumadocs has no capability column — the cell is empty for every row because there is no component. Mintlify and Obsidian cover common playback-control surface but neither handles captions or format fallback. HTML5 is the ceiling, but several tail attributes (`crossorigin`, `disableremoteplayback`, `controlslist`) are rarely used in documentation.

### URL sniffing vs local path: single `src` prop wins

Mintlify documents two authoring patterns: `<video src="/videos/demo.mp4">` for self-hosted, `<iframe src="https://www.youtube.com/embed/ID">` for YouTube. Author must *know* to switch tags. Obsidian goes further wrong — `![[video.mp4]]` for files, full `<iframe>` HTML for YouTube. Two completely different grammars.

The OK `Video` descriptor should take a single `src` prop accepting:
- Local path (`/assets/demo.mp4`)
- Direct `.mp4` / `.webm` / `.mov` / `.ogv` URL
- YouTube URL (`youtu.be/ID`, `youtube.com/watch?v=ID`, `youtube.com/shorts/ID`, `youtube-nocookie.com/embed/ID`)
- Vimeo URL (`vimeo.com/ID`, `player.vimeo.com/video/ID`)

Render-time component detects shape, constructs embed URL for providers (e.g. `https://www.youtube.com/embed/${ID}?start=${t}&mute=${muted?1:0}`), emits `<video>` or `<iframe>`. Descriptor `PropDef[]` stays flat.

**Decision trigger:** Future requirement for private Vimeo (OAuth-signed params via oEmbed) flips this toward server-side parse sniff. For MVP, static templates win on simplicity + offline-friendliness.

### Caption handling — MDX children passthrough

HTML5 `<track>` takes four author-facing attributes (`kind`, `src`, `srclang`, `label`, plus `default` boolean). Structured data, not free-form — bad fit for `reactnode` children (Callout body, Tab content).

Two shapes:
1. **Structured `tracks` prop** — array-of-objects; needs `PropDef` widening per precedent #9 if registry doesn't support object-array props.
2. **MDX children passthrough** — `<Video src="..."><track kind="captions" src="en.vtt" srclang="en" default /></Video>`. Simpler; requires Video component to walk children at render time.

Mintlify and Obsidian both skip captions entirely — either shape is a strict superset. **Recommendation: shape #2** wins on MDX round-trip fidelity (raw JSX children survive unchanged) and keeps `PropDef[]` small. JsxComponent was already widened to `content: 'block*'` in CB-v2, so track children fit.

---

## Recommended OK Video descriptor

```ts
Video: {
  name: 'Video',
  category: 'media',
  icon: 'Play',
  searchTerms: ['video', 'youtube', 'vimeo', 'mp4', 'embed'],
  emptyChildName: 'track',
  hasChildren: true,
  props: [
    { name: 'src',         type: 'string',  required: true,
      description: 'Local path, .mp4/.webm/.mov/.ogv URL, or YouTube/Vimeo URL' },
    { name: 'title',       type: 'string',  required: false,
      description: 'Accessible title (iframe) / label fallback (video)' },
    { name: 'controls',    type: 'boolean', defaultValue: true },
    { name: 'autoPlay',    type: 'boolean', defaultValue: false,
      description: 'Requires muted=true on most browsers' },
    { name: 'muted',       type: 'boolean', defaultValue: false },
    { name: 'loop',        type: 'boolean', defaultValue: false },
    { name: 'playsInline', type: 'boolean', defaultValue: true,
      description: 'iOS inline-playback affordance' },
    { name: 'poster',      type: 'string',  required: false,
      description: 'Preview image URL (HTML5 <video> only)' },
    { name: 'preload',     type: 'enum', enumValues: ['none', 'metadata', 'auto'],
      defaultValue: 'metadata' },
    { name: 'start',       type: 'number',  required: false,
      description: 'Seek/start offset in seconds (YouTube/Vimeo only)' },
  ],
}
```

Captions / `<track>` flow through as MDX children (`content: 'block*'`). Platform-specific tail attrs (`crossorigin`, `disableremoteplayback`, `controlslist`) excluded — they fall to rawMdxFallback if authors need them. **10 props total**, matching Callout/Card descriptor sizes. `width`/`height` omitted; className sizing is more idiomatic.

---

## Migration matrix

| Source | Input | OK output |
|---|---|---|
| Obsidian | `![[demo.mp4]]` | `<Video src="/demo.mp4" />` |
| Obsidian | `![[demo.mp4\|640]]` | `<Video src="/demo.mp4" className="w-[640px]" />` (NG: sizing moves from markdown to className) |
| Obsidian | Raw `<iframe src="https://www.youtube.com/embed/ID" ...>` | `<Video src="https://www.youtube.com/embed/ID" />` |
| Mintlify | `<video src="..." controls />` | `<Video src="..." />` (controls default ON) |
| Mintlify | `<video autoPlay muted loop playsInline src="..." />` | `<Video src="..." autoPlay muted loop playsInline />` |
| Mintlify | `<iframe src="https://www.youtube.com/embed/ID" allow="..." allowFullScreen />` | `<Video src="..." />` — lossy for non-default `allow` list; rawMdxFallback escape |
| HTML5 | `<video><source src="a.webm"><source src="a.mp4"></video>` | rawMdxFallback (multiple `<source>` can't flatten to single `src`) |
| HTML5 | `<video><track kind="captions" src="en.vtt" srclang="en" default /></video>` | `<Video src="..."><track kind="captions" ... /></Video>` (block children passthrough) |

**NG items requiring rawMdxFallback:**
- Multiple `<source>` children (format fallback)
- Mintlify custom non-default `allow` permission strings
- HTML5 tail attrs: `crossorigin`, `disablepictureinpicture`, `disableremoteplayback`, `controlslist`

---

## Remark plugin recommendation

**Recommendation: Do NOT introduce a new remark or rehype plugin for CB-v2 Video MVP.**

Three canonical input shapes are already covered by OK's existing pipeline:

1. **Wiki-link (Obsidian `![[video.mp4]]`)** — Existing `wiki-link-micromark.ts` tokenizer already parses `![[file]]`. Extend its mdast → PM handler to branch on extension: `.mp4`/`.webm`/`.mov`/`.ogv`/`.mkv` → emit `JsxComponent` with `name='Video'` instead of `image`.
2. **MDX `<Video>`** — Already handled by `remarkMdxAgnostic`. Registry descriptor dispatch does the work.
3. **Raw HTML `<video>`** — `remark-mdx` parses as `mdxJsxFlowElement` name `video`. Registered `Video` descriptor catches lowercase `video` after case-insensitive match in node handler.

**URL-sniffing for bare YouTube/Vimeo links** (e.g. `https://youtu.be/ID` alone on a line) is NOT-NOW. Every Mintlify/Obsidian example requires explicit iframe wrap — auto-promotion would be novel and could surprise users on paste. Ship as opt-in v2 plugin if research shows demand.

**Async plugin avoidance:** `remark-oembed` and `@raae/gatsby-remark-oembed` both fetch at parse time. Violates CRDT-sync invariant (parse must be sync + deterministic) and precedent #15 (idempotent micromark extensions). Neither adoptable.

---

## Limitations & Open Questions

- **Obsidian `|WxH` sizing for video** is INFERRED from image-embed parser identity + forum reports — official docs page body didn't render in WebFetch. Recommend direct in-app verification before locking migration matrix.
- **Obsidian Publish's YouTube behavior** (hosted docs product) has separate pipeline; out of scope.
- **Mintlify `.mdx` vs `.md`** — JSX camelCase is MDX-only; pure CommonMark behavior wasn't tested.

---

## References

### Evidence files
- [evidence/fumadocs-video-absence.md](evidence/fumadocs-video-absence.md)
- [evidence/mintlify-video.md](evidence/mintlify-video.md)
- [evidence/obsidian-video.md](evidence/obsidian-video.md)
- [evidence/html5-video.md](evidence/html5-video.md)
- [evidence/youtube-vimeo-embed.md](evidence/youtube-vimeo-embed.md)
- [evidence/remark-rehype-plugins.md](evidence/remark-rehype-plugins.md)

### External
- [HTML `<video>` on MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video)
- [WHATWG HTML Living Standard — video](https://html.spec.whatwg.org/multipage/media.html#the-video-element)
- [Mintlify components](https://www.mintlify.com/docs/components)
- [Obsidian accepted file formats](https://help.obsidian.md/file-formats)
- [YouTube Embed API](https://developers.google.com/youtube/player_parameters)
- [Vimeo Player API](https://developer.vimeo.com/player/sdk)
