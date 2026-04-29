# Evidence: OSS docs-editor patterns for iframe / embed

**Dimension:** D3 — How OSS docs platforms handle iframe embeds
**Date:** 2026-04-28
**Sources:** Mintlify docs, Fumadocs docs, Docusaurus docs + GitHub issues, Nextra docs, Astro Starlight docs + astro-embed package, BlockNote docs, Notion help center

---

## Summary table

| Platform | iframe surface | Companion component for caption / framing | URL-sniffing component | Sandbox by default |
|---|---|---|---|---|
| **Mintlify** | Raw `<iframe>` (paired form, JSX-style attrs) | `<Frame caption="..." hint="...">` (wraps iframe/img/video) | None — author chooses iframe | None |
| **Fumadocs** | Raw `<iframe>` via MDX raw-HTML | None (no Frame analogue) | None | None |
| **Docusaurus** | Raw `<iframe>` (with style-as-JS-object); plugin systems for YouTube | None first-party | None first-party | None |
| **Nextra** | Raw `<iframe>` inside `<Bleed>` for full-bleed layout | `<Bleed full>` (layout-only, not caption) | None | None |
| **Astro Starlight** | Per-provider components via `astro-embed` package | Per-provider | Yes — `<YouTube id="...">` etc. | Per-component |
| **BlockNote** | **No iframe block** — only File/Image/Video/Audio with `url` prop | n/a | n/a | n/a |
| **Notion** | Embed block — proxies through Iframely; user pastes URL | Native UI | Yes (1900+ domains via Iframely) | Per-domain via proxy |

**Convergence:** Three of seven (Mintlify, Fumadocs, Docusaurus) treat iframe as raw HTML the author writes by hand. Three (Nextra raw + Bleed wrapper, Starlight via astro-embed, Notion via Iframely) wrap the raw iframe in a layout or provider-specific component. **Only one (BlockNote) has no iframe surface at all** — and that's a structural editor that lacks an HTML-passthrough mode in general.

---

## Mintlify — raw iframe + Frame wrapper for captions

**Source:** [Mintlify image-embeds docs](https://mintlify.com/docs/content/image-embeds), [Frames component](https://mintlify.com/docs/content/components/frames)

YouTube embed example (from Mintlify docs verbatim):

```html
<iframe
  className="w-full aspect-video rounded-xl"
  src="https://www.youtube.com/embed/4KzFe50RQkQ"
  title="YouTube video player"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
></iframe>
```

Generic embed example:

```html
<iframe 
  src="https://example.com/embed" 
  title="Embedded content"
  className="w-full h-96 rounded-xl"
></iframe>
```

**Observations:**

- Mintlify uses **paired-form** `<iframe>...</iframe>`, not self-closing. (The OK PUA guard's exemption requires self-closing — divergence.)
- Attribute spelling is camelCase (`className`, `allowFullScreen`) — JSX form, not HTML lowercase.
- No sandbox attribute in any documented example.
- Caption is achieved via the separate `<Frame caption="...">` wrapper, not on the iframe itself.

The Mintlify Frame component:

```jsx
<Frame caption="This is a caption">
  <img src="/image.jpg" alt="Example" />
</Frame>
```

`Frame` props: `caption`, `hint`. Wraps any media element (img, video, iframe). Supports markdown in caption (links, bold). When wrapping a `<video>` with `autoPlay`, Frame automatically adds `playsInline loop muted` — a quality-of-life touch.

**Implication for OK:** Mintlify validates the canonical/compat rule's "compositional wrappers (Frame, Figure) are the canonical home for OK-specific affordances around the primitive". The Mintlify decomposition is exactly:
- Primitive: lowercase `<iframe>` (raw HTML)
- Wrapper: `<Frame>` for caption / hint / framing

This is one platform's confirmation that the lowercase-canonical-with-Frame-wrapper pattern works.

## Fumadocs — no iframe component, raw HTML

**Source:** [Fumadocs Components docs](https://www.fumadocs.dev/docs/ui/components)

The Fumadocs UI package ships these MDX components: Cards, Callouts, Code Blocks, Headings, Tabs, Steps, Accordion, Banner, File, Files. **No Iframe, no Frame, no Embed.** Authors who want an iframe write `<iframe ... />` as raw MDX/HTML — same as Mintlify but without the Frame wrapper.

This was independently confirmed by web search and a direct GitHub repository scan. No component file matches `iframe` in the fumadocs source tree.

**Implication:** the absence of a wrapper means Fumadocs authors lose caption / centering / hint support — they hand-roll Tailwind classes. This argues for OK to *eventually* ship a Frame wrapper, but doesn't change the iframe-primitive design.

## Docusaurus — raw iframe, JSX-style attributes

**Source:** [Docusaurus issue #1165 — embedding videos](https://github.com/facebook/docusaurus/issues/1165), Docusaurus official tests page for [iframe embeds](https://docusaurus.io/tests/pages/embeds)

Docusaurus is React-based MDX. Authors write `<iframe>` directly. Style strings need JSX-object form (`style={{height: '500px'}}` not `style="height: 500px"`). No first-party iframe component.

Plugin-based approaches exist for video embedding (e.g., `docusaurus-plugin-includes`'s `{@youtube: videocode}` syntax), but these are third-party and rare.

**Implication:** another point on the curve — the React-MDX docs ecosystem prefers raw iframe.

## Nextra — raw iframe inside `<Bleed>`

**Source:** [Nextra Bleed component](https://nextra.site/docs/built-ins/bleed)

Nextra ships a `<Bleed>` layout component that lets content overflow the prose container's width. It's the canonical recommendation for embedding wide things. iframe usage:

```jsx
<Bleed full>
  <iframe
    src="https://codesandbox.io/embed/swr-states-4une7"
    width="100%"
    height="500px"
    title="SWR-States"
  />
</Bleed>
```

Two points: (a) Nextra does NOT have an Iframe component — Bleed is layout-only; (b) the iframe inside is plain JSX with HTML-style spelling (`width="100%"` not `width={100}`, no `className`).

**Implication:** Bleed is essentially Nextra's answer to Mintlify's Frame, but caption-less. Yet another instance of "primitive + wrapper" decomposition.

## Astro Starlight — per-provider components via astro-embed

**Source:** [astro-embed](https://astro-embed.netlify.app/)

Astro takes a fundamentally different path: instead of one generic iframe surface, it ships **eight provider-specific components** in the `astro-embed` package:

- `<YouTube id="..." />`
- `<Vimeo id="..." />`
- `<Twitter id="..." />`
- `<Bluesky id="..." />`
- `<Mastodon id="..." />`
- `<LinkPreview href="..." />`
- `<GitHubGist src="..." />`
- `<BaselineStatus id="..." />`

Each component does **URL sniffing** ([YouTube docs](https://astro-embed.netlify.app/components/youtube/)):

> The `id` prop accepts a video ID *or* a YouTube URL in any of the various YouTube formats.

Each uses lite-loading patterns (e.g., `lite-youtube-embed` web component) to avoid loading the provider's JavaScript until user interaction. Performance-first.

**Trade-off:** maintenance burden grows with provider count. Eight components mean eight surface APIs to keep in sync with provider URL changes. Astro absorbs this cost because the performance win matters for static-site Lighthouse scores.

**Implication for OK:** URL-sniffing per-provider is a valid pattern but has a high cost. It's a clean future direction (NG-style "preserved path") but not a v1 requirement. Mintlify, Fumadocs, Docusaurus, Nextra all skip it.

## BlockNote — no iframe block at all

**Source:** [BlockNote embeds docs](https://www.blocknotejs.org/docs/features/blocks/embeds)

BlockNote is a structured block editor — not an MDX editor. It has four "embed" block types (File, Image, Video, Audio), each with `name`, `url`, `caption`, `showPreview`, `previewWidth`. **No iframe block exists.** GitHub issues confirm video embedding is broken in some configurations and that YouTube iframe embedding is explicitly unsupported.

**Implication:** BlockNote's structural-block model is incompatible with raw-HTML iframe embedding by design. OK is closer to Mintlify's MDX model than BlockNote's structural model — so BlockNote's absence of iframe doesn't constrain OK's design.

## Notion — Iframely-proxied embed block

**Source:** [Notion embed help](https://www.notion.com/help/embed-and-connect-other-apps)

Notion's embed block accepts a URL and proxies through [Iframely](https://iframely.com/), which supports 1900+ domains via custom parsers, oEmbed, Twitter Cards, and Open Graph. The user pastes a URL; Notion turns it into a live preview.

This is the most opinionated approach: a service-side URL-sniffing proxy that handles every provider's quirks. The trade-off: a cloud dependency (Iframely is a paid service) and reduced control. Not appropriate for OK (file-based, local-first, no cloud).

**Implication:** Notion's pattern proves URL-sniffing-with-allowlist *can* be valuable but requires infrastructure OK doesn't have. Skip.

---

## Patterns observed

1. **Raw iframe is the dominant surface.** Mintlify, Fumadocs, Docusaurus, Nextra all expect authors to write `<iframe>` directly. This is the lingua franca of MDX docs.

2. **The wrapper sits next to the primitive, not over it.** Mintlify's Frame, Nextra's Bleed — both are siblings of `<iframe>` in the component tree, not parents that sniff URLs. The primitive stays primitive; the wrapper adds OK-specific affordances around it.

3. **Sandbox by default would break the world.** No platform documents a sandbox default. The expected stance is "trust the embed origin; iframe is a user choice".

4. **URL-sniffing is a separate concern.** When platforms do sniff (Astro, Notion), they ship a separate per-provider component. They don't try to make the iframe primitive sniff.

5. **JSX attribute spelling varies.** Mintlify uses `className` and `allowFullScreen` (JSX camelCase). Nextra uses `className`. Docusaurus uses `style={{...}}` (JSX-object form). All three coexist with raw HTML in MDX. The OK 1P precedent (lowercase HTML-spec attrs at descriptor level, camelCase translation at render time) is a third valid choice.

6. **Caption is wrapper-territory, not primitive-territory.** Mintlify Frame holds caption; Astro YouTube has no caption (you'd wrap in a parent); BlockNote video has caption on the block itself. Caption-on-primitive is a minority position.

---

## Implication for OK

The dominant pattern is **lowercase-canonical raw iframe + sibling wrapper for affordances**. This matches the canonical/compat rule:

- iframe HTML primitive carries `src`, `allow`, `sandbox`, `referrerpolicy`, `loading`, `width`, `height`, `name`, `title` — a complete enough attribute set that nothing OK-specific needs to live as a prop on iframe itself.
- Compositional wrappers (Frame v2 / Figure / Embed) are the canonical home for caption / hint / aspect-ratio / lazy-load.

This is identical to img/video/audio. **Iframe should be a lowercase canonical descriptor.**

---

## Negative searches

- Searched [github.com/fuma-nama/fumadocs](https://github.com/fuma-nama/fumadocs) for `iframe` component — **NOT FOUND**.
- Searched [Mintlify components repo](https://github.com/mintlify/components) for `Iframe.tsx` — **NOT FOUND** (the Iframe handling is documented in their docs but not in the open-source components package; appears to be docs-platform-only).
- Searched Docusaurus core for iframe-specific component — **NOT FOUND**. Plugin landscape only.
