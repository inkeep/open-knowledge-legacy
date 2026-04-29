# Evidence: HTML5 `<video>` Element — Full Attribute Surface

**Dimension:** HTML5 spec (WHATWG / MDN)
**Date:** 2026-04-22
**Source:** <https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video>

---

## Findings

### Finding: Main `<video>` attributes
**Confidence:** CONFIRMED

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `src` | URL | — | Optional if `<source>` children are used |
| `controls` | Boolean | false | Shows native UA controls |
| `autoplay` | Boolean | false | Modern browsers block unless `muted` |
| `loop` | Boolean | false | Seek to start on end |
| `muted` | Boolean | false | Initial audio state; required for autoplay on mobile |
| `poster` | URL | — | Preview image during download |
| `preload` | enum | UA-dependent | `none` / `metadata` / `auto` |
| `crossorigin` | enum | — | `anonymous` / `use-credentials` |
| `playsinline` | Boolean | false | iOS — play inline, not fullscreen by default |
| `disablepictureinpicture` | Boolean | false | Suppress PiP affordance |
| `disableremoteplayback` | Boolean | false | Block AirPlay/Chromecast/etc. |
| `controlslist` | string | — | `nodownload nofullscreen noremoteplayback` (space-separated subset) |
| `width` | CSS px (abs) | — | No percentages; layout-affecting |
| `height` | CSS px (abs) | — | No percentages; layout-affecting |
| `loading` | enum | `eager` | Experimental: `eager` / `lazy` |

### Finding: `<source>` sub-element (format fallback)
**Confidence:** CONFIRMED

```html
<video controls width="620">
  <source src="myVideo.webm" type="video/webm" />
  <source src="myVideo.mp4" type="video/mp4" />
  Fallback text for unsupported browsers
</video>
```

Attributes: `src` (required), `type` (MIME; may include `; codecs="..."`).
Browser tries each `<source>` sequentially and uses the first compatible match.

### Finding: `<track>` sub-element (captions/subtitles/chapters)
**Confidence:** CONFIRMED

```html
<video controls src="video.webm">
  <track default kind="captions" src="captions.vtt" srclang="en" label="English" />
  <track kind="subtitles" src="subtitles.fr.vtt" srclang="fr" label="Français" />
</video>
```

Attributes: `kind` (enum: `subtitles` default / `captions` / `chapters` / `descriptions` / `metadata`), `src` (WebVTT `.vtt` URL, required), `srclang` (BCP47 language code), `label` (UI-facing track name), `default` (boolean — enable on load).

### Finding: Autoplay policy (browser-enforced)
**Confidence:** CONFIRMED

Modern browsers (Chrome, Safari, Firefox) **block** autoplay of videos with unmuted audio unless the user has interacted with the site. Reliable autoplay requires `muted` + usually `playsinline`. This is a runtime behavior, not a spec attribute — but any Video descriptor must expose both props to make autoplay functional.

**Implications for OK CB-v2:** HTML5 defines **~15 main `<video>` attributes** plus 2 sub-elements with another ~6 attributes each. A descriptor superset across all platforms can choose between three shapes:
1. **Full surface** — every HTML5 prop exposed (~22 props) — highest fidelity, widest migration, but large PropDef[] array
2. **Common path** — Mintlify-subset (7 props) — ergonomic but loses captions/format fallback
3. **Hybrid** — common-path scalar props + structured children for `<source>`/`<track>` — balanced
