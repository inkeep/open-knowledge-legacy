# Evidence: Mintlify Video Handling

**Dimension:** Mintlify video support
**Date:** 2026-04-22
**Source:** <https://mintlify.com/docs/create/image-embeds>

---

## Findings

### Finding: Mintlify ships NO dedicated `<Video>` component
**Confidence:** CONFIRMED
**Evidence:** Mintlify "Images and embeds" docs

All video examples use **raw HTML5 `<video>` or raw `<iframe>`**. No `<Video>` import, no Mintlify-scoped MDX video block.

### Finding: YouTube pattern — raw iframe
**Confidence:** CONFIRMED

```html
<iframe
  className="w-full aspect-video rounded-xl"
  src="https://www.youtube.com/embed/4KzFe50RQkQ"
  title="YouTube video player"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
></iframe>
```

Prop surface: `src`, `title`, `allow` (space-separated permissions list), `allowFullScreen` (camelCase boolean), `className`.

### Finding: Self-hosted pattern — HTML5 video
**Confidence:** CONFIRMED

```html
<video
  controls
  className="w-full aspect-video rounded-xl"
  src="link-to-your-video.com"
></video>
```

### Finding: Autoplay pattern requires muted + playsInline
**Confidence:** CONFIRMED

```html
<video
  autoPlay
  muted
  loop
  playsInline
  className="w-full aspect-video rounded-xl"
  src="/videos/demo.mp4"
></video>
```

Mintlify explicitly documents the JSX camelCase rule: "when using JSX syntax, write double-word attributes in camelCase: `autoPlay`, `playsInline`, `allowFullScreen`."

### Finding: Prop surface (Mintlify-documented subset of HTML5)
**Confidence:** CONFIRMED

- `src` (URL or path)
- `controls` (boolean)
- `autoPlay` (boolean; JSX camelCase — MDX aware)
- `muted` (boolean; required with autoPlay per browser policy)
- `loop` (boolean)
- `playsInline` (boolean; required for mobile autoplay)
- `className` (Tailwind utilities — presentational)

**NOT documented** in Mintlify video examples: `poster`, `preload`, `crossorigin`, `width`/`height` attrs, `<source>` tags for fallback, `<track>` tags for captions, `disablepictureinpicture`, `disableremoteplayback`, `controlslist`.

**Implications for OK CB-v2:** Mintlify's Video prop surface is a **minimal subset** of HTML5 — it's the "common ergonomic path" but doesn't cover captions or format fallback. A descriptor superset must add these back.
