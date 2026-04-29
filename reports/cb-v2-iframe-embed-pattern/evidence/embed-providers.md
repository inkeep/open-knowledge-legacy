# Evidence: Common embed providers + URL shapes + iframe attribute requirements

**Dimension:** D5 — Top embed providers and their iframe requirements
**Date:** 2026-04-28
**Sources:** Provider docs (YouTube, Vimeo, Loom, Spotify, Figma, CodeSandbox, StackBlitz, Google Maps), web.dev, MDN

---

## Top providers, ranked by docs-platform observation

Based on which providers appear in Mintlify, Fumadocs, Docusaurus, Nextra documentation examples + technical-writing-rule guides:

| Rank | Provider | Use case |
|------|----------|----------|
| 1 | YouTube | video |
| 2 | Loom | video (workplace) |
| 3 | Vimeo | video |
| 4 | CodeSandbox | live code |
| 5 | StackBlitz | live code |
| 6 | Figma | design |
| 7 | Spotify | audio (podcast/track) |
| 8 | Twitter/X | social post |
| 9 | Google Maps | map |
| 10 | OpenStreetMap | map |

Tier 1-3 are saturating. Tier 4-7 are common. Tier 8-10 are tail.

---

## Provider-by-provider URL shapes and requirements

### YouTube

**Source:** [YouTube Player Parameters docs](https://developers.google.com/youtube/player_parameters), [Mintlify image-embeds docs](https://mintlify.com/docs/content/image-embeds)

URL forms accepted as input by users:
- Watch URL: `https://www.youtube.com/watch?v=VIDEO_ID`
- Short URL: `https://youtu.be/VIDEO_ID`
- Shorts URL: `https://www.youtube.com/shorts/VIDEO_ID`
- Privacy-enhanced: `https://www.youtube-nocookie.com/embed/VIDEO_ID`

Canonical embed URL: `https://www.youtube.com/embed/VIDEO_ID`

Standard embed snippet (Mintlify-published, mirrors YouTube's own copy-paste):

```html
<iframe
  className="w-full aspect-video rounded-xl"
  src="https://www.youtube.com/embed/VIDEO_ID"
  title="YouTube video player"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
></iframe>
```

**Requirements:**
- `allow` MUST include `encrypted-media` (DRM playback)
- `allow` SHOULD include `autoplay; clipboard-write; picture-in-picture; web-share` for full feature parity
- `allowFullScreen` SHOULD be set (or `allow="fullscreen"` instead per modern spec)
- No sandbox in the canonical snippet
- Minimum viewport: 200×200; recommended: 480×270 for 16:9

**URL parameters in `src`:** `autoplay=1`, `loop=1` (requires `playlist=VIDEO_ID`), `start=N` (seconds), `mute=1`, `cc_load_policy=1`, `cc_lang_pref=en`. URL-sniffing a watch URL into an embed URL requires extracting VIDEO_ID and optionally `t=N` start timestamp.

### Loom

**Source:** [Loom embed docs (Atlassian Support)](https://support.atlassian.com/loom/docs/understand-embedding-videos-gifs-and-thumbnails/), [Iframely Loom](https://iframely.com/domains/loom)

URL forms:
- Share: `https://www.loom.com/share/VIDEO_ID`
- Embed: `https://www.loom.com/embed/VIDEO_ID`

Canonical Loom embed code:

```html
<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 62.5%;">
  <iframe
    src="https://www.loom.com/embed/VIDEO_ID"
    style="top: 0; left: 0; width: 100%; height: 100%; position: absolute; border: 0;"
    allowfullscreen
    scrolling="no"
    allow="encrypted-media *;"
  ></iframe>
</div>
```

**Requirements:**
- `allow="encrypted-media *;"` (much shorter than YouTube's allow list)
- `allowfullscreen`
- Aspect-ratio padding-trick wrapping is the canonical responsive pattern
- No sandbox

URL-sniffing: replace `/share/` with `/embed/` in the URL. Trivial.

### Vimeo

URL forms:
- Watch: `https://vimeo.com/VIDEO_ID`
- Embed: `https://player.vimeo.com/video/VIDEO_ID`

Standard embed snippet:

```html
<iframe
  src="https://player.vimeo.com/video/VIDEO_ID"
  width="640"
  height="360"
  frameborder="0"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>
```

**Requirements:** Similar to YouTube but a smaller `allow` list. URL-sniffing extracts VIDEO_ID from `vimeo.com/N`.

### CodeSandbox

**Source:** [CodeSandbox embedding docs](https://codesandbox.io/docs/learn/legacy-sandboxes/embedding)

URL forms:
- Sandbox: `https://codesandbox.io/s/SANDBOX_ID`
- Embed: `https://codesandbox.io/embed/SANDBOX_ID`

Standard:

```html
<iframe
  src="https://codesandbox.io/embed/SANDBOX_ID?codemirror=1"
  style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;"
  title="My Sandbox"
  allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; vr; xr-spatial-tracking"
  sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"
></iframe>
```

**Requirements:**
- HUGE `allow` list (12 features)
- ALSO ships `sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"` — note the `allow-scripts` + `allow-same-origin` combination (effectively no sandboxing per D2 finding 2). They accept this trade-off because the embedded sandbox runs untrusted user code that needs full capabilities.
- URL parameters: `codemirror=1` (show code), `view=editor|preview|split`, `module=PATH`, `expanddevtools=1`, `highlights=4,5,6` (line highlight), `theme=dark|light`, `fontsize=14`

URL-sniffing: replace `/s/` with `/embed/` in URL. Same trick as Loom.

### StackBlitz

**Source:** [StackBlitz embedding docs](https://developer.stackblitz.com/guides/integration/embedding)

URL forms:
- Project: `https://stackblitz.com/edit/PROJECT_ID`
- Embed: `https://stackblitz.com/edit/PROJECT_ID?embed=1`

Standard embedding uses query parameters: `?embed=1&view=editor|preview|split&hideExplorer=1&hideNavigation=1&theme=dark|light&file=src/main.ts&ctl=0|1` (where ctl=1 means click-to-load).

URL-sniffing: append `?embed=1` to a normal project URL.

### Figma

**Source:** [Figma Embed docs](https://developers.figma.com/docs/embeds/)

URL forms:
- File: `https://www.figma.com/file/FILE_KEY/...`
- Design: `https://www.figma.com/design/FILE_KEY/...`
- Proto: `https://www.figma.com/proto/FILE_KEY/...`
- Embed: `https://embed.figma.com/{design|proto|board}/FILE_KEY`

```html
<iframe src="https://embed.figma.com/design/FILE_KEY?embed-host=example" width="800" height="450"></iframe>
```

**Requirements:**
- No allow needed (Figma handles auth on its side)
- No sandbox in canonical snippet

URL-sniffing: replace `www.figma.com` host with `embed.figma.com`, normalize the path segment.

### Spotify

URL forms:
- Track: `https://open.spotify.com/track/TRACK_ID`
- Episode: `https://open.spotify.com/episode/EPISODE_ID`
- Show: `https://open.spotify.com/show/SHOW_ID`
- Playlist: `https://open.spotify.com/playlist/PLAYLIST_ID`
- Embed: `https://open.spotify.com/embed/{track|episode|show|playlist}/ID`

```html
<iframe
  src="https://open.spotify.com/embed/track/TRACK_ID"
  width="100%"
  height="232"
  frameborder="0"
  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
></iframe>
```

URL-sniffing: insert `/embed` after `open.spotify.com` in the URL path.

### Twitter / X

X requires script-tag based embedding (`<blockquote class="twitter-tweet">` + `widgets.js`) for native rendering. Pure-iframe embeds are NOT supported by X's official path. Third-party services (FxEmbed, Iframely, Bluesky as alternative) provide iframe-based wrappers.

**Practical conclusion:** iframe support for X is a non-starter without a proxy service. Skip from the v1 surface.

### Google Maps

```html
<iframe
  width="450"
  height="250"
  frameborder="0"
  style="border:0"
  referrerpolicy="no-referrer-when-downgrade"
  src="https://www.google.com/maps/embed/v1/{place|view|directions|streetview|search}?key=YOUR_API_KEY&PARAMETERS"
  allowfullscreen
></iframe>
```

**Requirements:**
- API key required (per Google's TOS, even though no charge)
- `referrerpolicy` recommended

Alternative without API key: the user-facing share URL `/maps/embed?pb=...` (no key needed but less officially supported).

### OpenStreetMap

```html
<iframe
  width="425"
  height="350"
  src="https://www.openstreetmap.org/export/embed.html?bbox=BBOX&layer=mapnik"
></iframe>
```

No API key required. URL parameter `bbox=west,south,east,north` selects the visible region; `marker=lat,lon` adds a pin.

---

## Cross-provider summary

| Provider | Sandbox needed? | Allow attrs needed | Self-closing OK? | URL-sniffable? |
|---|---|---|---|---|
| YouTube | No | 6+ tokens | Yes (in JSX form) | Yes (extract VIDEO_ID) |
| Loom | No | `encrypted-media *;` | Yes | Yes (replace `/share/` → `/embed/`) |
| Vimeo | No | 3 tokens | Yes | Yes |
| CodeSandbox | Yes (paradoxical — see notes) | 12 tokens | Yes | Yes |
| StackBlitz | No | (none) | Yes | Trivial (?embed=1) |
| Figma | No | (none) | Yes | Yes (host swap) |
| Spotify | No | 5 tokens | Yes | Yes (path insert) |
| Twitter/X | n/a | n/a (no iframe) | n/a | n/a |
| Google Maps | No | (none, but referrerpolicy yes) | Yes | Limited (API key) |
| OpenStreetMap | No | (none) | Yes | Yes (bbox compute) |

**Convergence:**

1. **No major provider needs sandbox to function.** The CodeSandbox case is paradoxical because they explicitly include `allow-scripts allow-same-origin` (which voids sandboxing per D2 finding 2). So effectively: no provider relies on sandbox.

2. **Allow attribute varies WIDELY** — from empty (Figma, OSM) to 12 tokens (CodeSandbox). Hardcoding any default fails some providers.

3. **All providers (except X) work with self-closing JSX `<iframe ... />`.** None require children.

4. **All providers are URL-sniffable** (except X). The transformation is "swap path segment" or "extract ID from URL"; trivial regex.

---

## Sandbox-by-default would work poorly

A descriptor-level default like `sandbox="allow-scripts allow-same-origin"` would:
- Effectively disable sandboxing (per D2 finding 2)
- Still break some providers (CodeSandbox needs `allow-modals` `allow-forms` `allow-popups` too)
- Add a false sense of security

Consistent with D3 and D2: **no default sandbox is the right call**.

---

## URL-sniffing scoping

URL-sniffing for top providers (YouTube, Loom, Vimeo, Spotify, Figma, CodeSandbox, StackBlitz) is implementable as ~30 lines of regex per provider. Eight providers × 30 lines = ~240 lines of code, plus tests and a maintenance burden as URL formats drift.

The cb-v2-video research report ([reports/cb-v2-video-superset-research/REPORT.md](../../cb-v2-video-superset-research/REPORT.md)) already mapped this surface for video specifically. **D-MF12 LOCKED** the v1 stance to "no URL sniffing, no iframe emission" for the video descriptor; iframe was the safety valve.

For iframe v1, URL-sniffing should also be out of scope (NG-track for future). Authors who want YouTube paste an iframe; OK doesn't synthesize iframe from a YouTube URL. **This is a v1 scope-discipline call, not a permanent stance** — the descriptor's PropDef shape supports later URL-sniffing additions cleanly (just add a paste-time canonicalizer that turns `https://youtube.com/watch?v=ID` into a complete iframe block).

---

## Negative searches

- Searched for any docs platform that ships built-in URL-sniffing iframe — only Notion (via Iframely cloud service) and Astro Starlight (via per-provider components, not an iframe primitive). **No platform's iframe primitive sniffs URLs.**
- Searched for sandbox defaults on a major provider's official embed snippet — only CodeSandbox sets sandbox, and the configuration voids itself per Finding D2-2. No counter-example found.
