---
title: "CB-v2 Image Descriptor: Cross-Platform Superset Research"
description: "Survey of Image component conventions (Fumadocs ImageZoom, Mintlify Frame, Obsidian embed, CommonMark/GFM, HTML5) yielding a superset Image descriptor + migration matrix + zoom-UX analysis for Open Knowledge Component Blocks v2."
createdAt: 2026-04-22
updatedAt: 2026-04-22
subjects:
  - Fumadocs
  - Mintlify
  - Obsidian
  - CommonMark
  - HTML5
  - react-medium-image-zoom
  - rehype-figure
  - remark-unwrap-images
topics:
  - image components
  - click-to-zoom
  - figure caption
  - MDX descriptors
  - obsidian wiki-embed
---

# CB-v2 Image Descriptor: Cross-Platform Superset Research

**Purpose:** Inform the Open Knowledge Component Blocks v2 `Image` descriptor so content migrating from Fumadocs, Mintlify, Obsidian, CommonMark/GFM, or raw HTML `<img>` round-trips with minimal loss — while keeping the descriptor authoring-ergonomic and the zoom/caption UX coherent.

---

## Executive Summary

Six source surfaces investigated. Two axes dominate divergence — **zoom-by-default vs. opt-in**, and **caption-on-image vs. caption-on-wrapper** — and no source platform covers the full union of concerns that a component-block descriptor needs.

**1. Zoom UX splits cleanly.** Mintlify ships click-to-zoom on every `![]()` by default, opt-out via `noZoom`. Fumadocs ships `ImageZoom` as a 49-line thin wrapper around `react-medium-image-zoom@^5.4.1` (byte-identical under `packages/radix-ui/` and `packages/base-ui/`) and requires authors to opt in by overriding the `img:` slot in their MDX components map. Obsidian has **no native zoom at all** — click-to-zoom is delivered by the community plugin `obsidian-image-toolkit`. CommonMark/GFM and HTML5 `<img>` don't address zoom — it's a render-layer concern. The choice for OK is a product decision (default-on vs. opt-in), not a technical constraint.

**2. Caption semantics split three ways.** Mintlify puts captions on a *wrapper* (`<Frame caption="...">`) and supports inline markdown in the caption string. Fumadocs has no native caption component for images. `@microflash/rehype-figure` and competitors transform `![alt](src)` or `![alt](src "title")` into a `<figure><img><figcaption>` tree post-parse. CommonMark's `title` attribute is the only markdown-level affordance and it conflates tooltip + potential caption. Obsidian's `![[image|alias]]` pipe is overloaded — numeric-only tokens become dimensions, everything else becomes alias (display text, not distinct HTML `alt`).

**3. HTML5 `<img>` has 14 content attributes; no source platform uses more than 7 of them.** Load-bearing (`src`, `alt`, `width`, `height`) are universal. `srcset`, `sizes`, `loading`, `decoding`, `fetchpriority`, `referrerpolicy`, `crossorigin`, `usemap`, `ismap`, `controls` are either framework-synthesized (Next/Image sets `sizes`) or unused by most sources. For a component descriptor, the first 6 (`src`, `alt`, `width`, `height`, `title`, `loading`) cover 95%+ of authored content.

**4. Dimension-carrying syntax is the hardest migration surface.** Obsidian's `![[img.png|640x480]]` has no CommonMark-compatible round-trip. Any descriptor that claims to preserve migrated Obsidian dimensions must either (a) serialize to raw HTML `<img width=... height=...>`, (b) use an MDX/JSX form like `<Image src="..." width={640} height={480}/>`, or (c) accept dimension loss on CommonMark export.

---

## Detailed Findings

### Dimension 1: Fumadocs ImageZoom + img override

Fumadocs ImageZoom is a 49-line thin wrapper over `react-medium-image-zoom@^5.4.1`. The files under `packages/radix-ui/src/components/image-zoom.tsx` and `packages/base-ui/src/components/image-zoom.tsx` are byte-identical. The component surface:

```tsx
export type ImageZoomProps = ImageProps & {
  zoomInProps?: ComponentProps<'img'>;
  rmiz?: UncontrolledProps;
};
export function ImageZoom({ zoomInProps, children, rmiz, ...props }) {
  return (
    <Zoom zoomMargin={20} wrapElement="span" {...rmiz}
      zoomImg={{ src: getImageSrc(props.src), sizes: undefined, ...zoomInProps }}>
      {children ?? <Image sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 900px" {...props} />}
    </Zoom>
  );
}
```

`ImageProps` (from `fumadocs-core/framework/index.tsx:6-18`) extends `ComponentProps<'img'>` with `sizes?: string`, Next-compatible `src?: string | StaticImport`, and `priority?: boolean` that maps to HTML5 `fetchPriority: 'high' | 'auto'`. Defaults: `zoomMargin={20}`, `wrapElement="span"`.

**Critical wiring:** The default MDX `img:` slot (`packages/radix-ui/src/mdx.tsx:38-73`) does NOT include zoom — it only auto-adds a `sizes` attribute and a `rounded-lg` Tailwind class. Authors opt in via `img: (props) => <ImageZoom {...(props as any)} />` — inverse of Mintlify.

**Implications:** The `wrapElement="span"` override matters because markdown paragraphs contain images and a `<div>` inside a `<p>` is invalid HTML — the class of bug `remark-unwrap-images`/`rehype-unwrap-images` addresses.

### Dimension 2: Mintlify Frame + image zoom

Mintlify Frame has exactly two props: `caption` (string, supports inline markdown like `[links](/docs)` and **bold**) and `hint` (string, appears above the frame). Frame wraps arbitrary children — images, videos, other components. Images have click-to-zoom by default on both markdown and HTML-tag syntax; opt-out via a boolean `noZoom` attribute on `<img>`. A linked image (anchor-wrapped) automatically gets `noZoom` and a pointer cursor.

**Implications:** Captions live on the wrapper, not the image — aligns with HTML5 `<figure><figcaption>` semantics. Mintlify's *per-image opt-out* (`noZoom`) and *default-on* zoom mean migration *to* a Mintlify-like OK default is transparent; migration *from* opt-in (Fumadocs) to default-on requires content re-audit only if the source doc was designed around not-zoomed images.

### Dimension 3: Obsidian image embed + format support

Obsidian uses wiki-link image syntax with four forms: `![[image.png]]`, `![[image.png|alt]]`, `![[image.png|640]]`, `![[image.png|640x480]]`. The pipe position is overloaded — numeric tokens (`640`) or `NxN` tokens (`640x480`) become dimensions; everything else becomes display text (not strict HTML `alt`, but the rendered label). Supported formats: `.avif`, `.bmp`, `.gif`, `.jpeg`, `.jpg`, `.png`, `.svg`, `.webp` — 8 total.

**Click-to-zoom is NOT native.** The Obsidian Forum feature-request thread "Click image to view full image file / expand / enlarge image" is still open. The community plugin `obsidian-image-toolkit` is the de-facto solution.

**Implications:** Obsidian vault imports must parse the pipe-token semantically: `/^\d+$/` or `/^\d+x\d+$/` → dimension; otherwise → alt/alias. No native zoom means OK can pick either zoom default without creating a migration regression.

### Dimension 4: CommonMark + GFM baseline

CommonMark §6.4 defines only inline (`![alt](src "title")`), reference (`![alt][ref]`), and shortcut (`![alt]`) forms. No width, height, alignment, class, caption, or size attribute at the markdown level. GFM §6.7 preserves CommonMark image parity exactly.

**Implications:** CommonMark's `title` slot (tooltip) is the only markdown-level affordance for per-image metadata. Any attribute richer than `alt` + `title` requires HTML fallback, MDX/JSX form, or a non-standard remark extension.

### Dimension 5: HTML5 `<img>` attribute surface

HTML5 defines 14 content attributes: `alt`, `src`, `srcset`, `sizes`, `crossorigin`, `usemap`, `ismap`, `controls`, `width`, `height`, `referrerpolicy`, `decoding`, `loading`, `fetchpriority` — plus global attributes. `<figure>` + `<figcaption>` is the semantic caption wrapper. `<picture>` + `<source>` is the format/media fallback wrapper.

**Implications:** For OK's docs-editor descriptor, the useful subset is `src`, `alt`, `width`, `height`, `title`, `loading` — the rest are either framework-injected (Next/Image sets `sizes`/`srcset`), security-sensitive (`crossorigin`, `referrerpolicy`), or rarely authored (`usemap`, `ismap`).

### Dimension 6: remark/rehype plugin landscape

| Plugin | Purpose | Status | Notes |
|---|---|---|---|
| `remark-unwrap-images` | Remove enclosing `<p>` around single-image paragraphs | **DEPRECATED** (archived Oct 2024) | Migrate to `rehype-unwrap-images` |
| `rehype-unwrap-images` | Same, post-hast phase | Active | Canonical replacement |
| `remark-images` | Auto-promote `http://…/foo.png` URLs to image nodes | Official `remarkjs` org | Tangential for OK |
| `remark-image-attributes` | `![a](src#width=640;height=740)` URL-fragment attrs | Niche; non-standard | Breaks asset resolution; not a good migration target |
| `@microflash/rehype-figure` | `<img alt>` → `<figure><img><figcaption>alt</figcaption>` | Active; v2.1.4 Apr 2025 | Conflates alt with caption |
| `rehype-title-figure` | `<img title>` → `<figcaption>title</figcaption>` | Active | Better a11y separation; uses CommonMark `title` slot |

**Implications:** For figure-caption serialization, `rehype-title-figure`'s approach (title→figcaption, alt stays) is the cleanest. But a component-block descriptor sidesteps this by exposing `caption` as a separate prop at the JSX level.

### Dimension 7: Zoom UX — library vs. native vs. custom

`react-medium-image-zoom@5.4.3` is the dominant React image-zoom library. Zero runtime deps. ES2021 target. Active maintenance since 2016. Uses native HTML `<dialog>` for the modal — inheriting Esc-to-close, focus trap, and top-layer rendering for free. Honors `prefers-reduced-motion`. A11y-tested across JAWS / NVDA / VoiceOver / TalkBack. Estimated ~5–6 KB gzipped.

From Fumadocs' shipped CSS:
```css
[data-rmiz-modal][open] { width: 100dvw; height: 100dvh; position: fixed; ... }
@media (prefers-reduced-motion: reduce) {
  [data-rmiz-modal-overlay], [data-rmiz-modal-img] { transition-duration: 0.01ms !important; }
}
```

Alternatives:
- **Native `<dialog>` + ~40 LOC**: Full control, zero library, loses swipe-to-dismiss.
- **Radix UI `Dialog`**: ~10 KB gz; overkill for zoom-only.
- **`medium-zoom` (vanilla JS)**: 3.9 KB gz, no React bindings.

**Recommendation:** `react-medium-image-zoom` — matches Fumadocs' dependency choice, minimizes surprise for users importing Fumadocs content.

### Dimension 8: Caption handling

Three patterns:
(a) **Caption-on-image prop**: `<Image src alt caption />`
(b) **Caption-on-wrapper** (Mintlify): `<Frame caption><img /></Frame>`
(c) **Caption via CommonMark title** (`rehype-title-figure`): `![alt](src "caption")`

**Cross-platform fit:**
- Fumadocs: none native.
- Mintlify: (b) wrapper model.
- Obsidian: none native.
- CommonMark: (c) only in-spec option.
- HTML5: (a) or (b).

**Recommendation:** pattern (a). Simpler for the descriptor, aligns with "single descriptor, typed props" direction. The component emits `<figure>`/`<figcaption>` when `caption` is set, otherwise just `<img>`.

---

## OK Image Descriptor Recommendation

```ts
Image: {
  name: 'Image',
  icon: 'image',
  category: 'media',
  searchTerms: ['image', 'figure', 'photo', 'picture', 'img'],
  props: [
    { name: 'src',     type: 'string',  required: true },
    { name: 'alt',     type: 'string',  required: false },   // HTML5 + CommonMark
    { name: 'width',   type: 'number',  required: false },   // HTML5 + Obsidian |WxH
    { name: 'height',  type: 'number',  required: false },   // HTML5 + Obsidian |WxH
    { name: 'caption', type: 'string',  required: false },   // Mintlify Frame.caption + figcaption
    { name: 'title',   type: 'string',  required: false },   // CommonMark title slot (tooltip)
    { name: 'loading', type: 'enum', enumValues: ['eager', 'lazy'], defaultValue: 'lazy' },
    { name: 'zoom',    type: 'boolean', defaultValue: true },     // product: default-on like Mintlify
  ],
  hasChildren: false,
}
```

Render-layer behavior:
- When `caption` is set, emit `<figure><img .../><figcaption>{caption}</figcaption></figure>`; otherwise bare `<img>`.
- When `zoom !== false`, wrap the `<img>` in `react-medium-image-zoom`'s `<Zoom>` with `wrapElement="span"` + `zoomMargin={20}`.
- `title` → passthrough to the HTML `title` attribute (tooltip, not caption).
- `alt` defaults to `''` (decorative) if neither alt nor caption provided.

---

## Migration Matrix

| Source form | Maps to OK Image descriptor as |
|---|---|
| `![alt](src.png)` (CommonMark) | `{ src, alt }` |
| `![alt](src.png "Caption")` (CommonMark + title) | `{ src, alt, title }` — title as tooltip; authors lift to `caption` manually if intended as caption |
| `<img src alt width height>` (HTML5) | `{ src, alt, width, height }` |
| `<img src noZoom>` (Mintlify) | `{ src, zoom: false }` |
| `<Frame caption="X"><img src /></Frame>` (Mintlify) | `{ src, caption: 'X' }` |
| `![[img.png]]` (Obsidian) | `{ src: 'img.png' }` |
| `![[img.png\|alt text]]` | `{ src: 'img.png', alt: 'alt text' }` |
| `![[img.png\|640]]` | `{ src: 'img.png', width: 640 }` |
| `![[img.png\|640x480]]` | `{ src: 'img.png', width: 640, height: 480 }` |
| `<ImageZoom src="..." />` (Fumadocs) | `{ src, zoom: true }` |
| `<img src="..." priority>` (Fumadocs+Next) | `{ src }`; drop `priority` (framework-specific) |

Obsidian pipe-parse pseudocode:
```ts
const pipeToken = path.split('|')[1];
if (/^\d+$/.test(pipeToken))          width = Number(pipeToken);
else if (/^\d+x\d+$/.test(pipeToken)) [width, height] = pipeToken.split('x').map(Number);
else                                   alt = pipeToken;
```

---

## Limitations & Open Questions

- **Fumadocs `priority` / Next Image optimization**: framework-specific; OK descriptor intentionally omits.
- **Mintlify `hint` prop**: No equivalent elsewhere. Omitted as a platform-specific idiom.
- **SVG `foreignObject` security stripping**: Render-time sanitization (per OK's storage contract).

---

## References

### External
- [Fumadocs radix-ui ImageZoom source](https://github.com/fuma-nama/fumadocs/blob/main/packages/radix-ui/src/components/image-zoom.tsx)
- [Fumadocs ImageZoom docs](https://fumadocs.vercel.app/docs/ui/components/image-zoom)
- [Mintlify Frame docs](https://www.mintlify.com/docs/components/frames)
- [Obsidian embed files help](https://help.obsidian.md/embeds)
- [Obsidian accepted file formats](https://help.obsidian.md/file-formats)
- [CommonMark Spec §6.4 Images](https://spec.commonmark.org/0.31.2/#images)
- [HTML Standard: img element](https://html.spec.whatwg.org/multipage/embedded-content.html#the-img-element)
- [react-medium-image-zoom](https://github.com/rpearce/react-medium-image-zoom)
- [remark-unwrap-images (deprecated)](https://github.com/remarkjs/remark-unwrap-images)
- [@microflash/rehype-figure](https://codeberg.org/naiyer/rehype-figure)
- [obsidian-image-toolkit](https://github.com/sissilab/obsidian-image-toolkit)

### Related Research
- `reports/cb-v2-callout-superset-research/` — peer descriptor research
- `reports/editor-asset-embed-patterns-across-universe/` — asset handling
- `reports/fumadocs-ecosystem-component-blocks-reuse/`

### Code paths read
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/radix-ui/src/components/image-zoom.tsx`
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/radix-ui/src/components/image-zoom.css`
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/base-ui/src/components/image-zoom.tsx` (byte-identical)
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/radix-ui/src/mdx.tsx`
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/core/src/framework/index.tsx`
