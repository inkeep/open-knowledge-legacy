---
title: "CB-v2 Audio Superset Research"
description: "Cross-platform survey of Audio component conventions (Fumadocs, Mintlify, Obsidian, HTML5, AI Elements, podcast standards) to inform Open Knowledge's Component Blocks v2 Audio descriptor as a superset of typical inputs."
createdAt: 2026-04-22
updatedAt: 2026-04-22
subjects:
  - Fumadocs
  - Mintlify
  - Obsidian
  - HTML5 audio
  - MediaSession API
  - AI Elements
  - Podcasting 2.0
topics:
  - audio components
  - documentation platforms
  - MDX audio embeds
---

# CB-v2 Audio Superset Research

**Purpose:** Inform the Open Knowledge Component Blocks v2 `Audio` descriptor by mapping the full landscape of audio-embed conventions across documentation platforms, the HTML5 substrate, and the podcast metadata ecosystem. Output is a recommended superset prop list, migration matrix, and scope recommendations for transcript / chapter / MediaSession concerns.

---

## Executive Summary

Audio has a far smaller design surface than video. Two of the three doc-platform peers we surveyed — Fumadocs and Mintlify — ship **no** Audio component. Obsidian's behavior is the dominant real-world input, and it is essentially an HTML5 `<audio controls>` element keyed on file extension, with no props. That makes the content substrate — HTML5 `<audio>` — the only technically rich layer, and it is itself a small surface: ten attributes and two child-element types (`<source>`, `<track>`).

The recommended CB-v2 descriptor is a small superset of HTML5 `<audio>`, adding a `title` label and preserving children as a caption / `<source>` / `<track>` passthrough. Rich podcast metadata (chapters, transcripts, MediaSession integration) should stay out of the descriptor: the standards are fragmented, not authored inline, and are better served by a purpose-built Podcast component if and when the need arises.

**Key Findings:**

- **Fumadocs ships no Audio component.** No file under `packages/base-ui/src/components/` matches audio, and a full repo grep returns zero hits. CONFIRMED.
- **Mintlify ships no Audio component.** The documented component catalog is structure/emphasis/navigation-focused; only `<video>` is enumerated under media. CONFIRMED.
- **Obsidian supports seven audio extensions via `![[file.ext]]` embeds** — `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.webm`, `.3gp` — rendered as HTML5 `<audio controls>`. No embed-syntax modifiers for loop/autoplay/timestamp in the canonical docs. CONFIRMED.
- **HTML5 `<audio>` has ten attributes and zero `width`/`height`/`poster`.** `<source>` children enable codec fallback; `<track>` children are permitted but not fully implemented across browsers. CONFIRMED.
- **AI Elements `AudioPlayer` (the prior-lean target) is built on `media-chrome` with shadcn/ui styling.** Composable sub-components (play, seek, timeline, volume) — a plausible later visual upgrade, not a descriptor change. CONFIRMED.
- **Podcast metadata (chapters, transcripts, MediaSession) lives outside the descriptor surface.** Podcasting 2.0 uses external JSON/VTT files referenced from RSS; MediaSession is a runtime API, not a prop. Recommendation: out of scope for CB-v2 Audio; gated to a future `Podcast` component.

---

## Detailed Findings

### Fumadocs — No Audio component (CONFIRMED)

`packages/base-ui/src/components/` enumerates: accordion, banner, callout, card, codeblock, dialog, files, github-info, heading, image-zoom, inline-toc, sidebar, steps, tabs, toc, type-table. No audio, no media, no podcast. A recursive grep for `audio|mp3|wav|m4a|ogg|flac` against `packages/obsidian/src` (the Fumadocs Obsidian integration) also returns zero hits — the integration does not even round-trip Obsidian audio embeds to HTML. CB-v2 inherits no upstream Audio contract from Fumadocs.

### Mintlify — No Audio component (CONFIRMED)

[Mintlify's component catalog](https://www.mintlify.com/docs/components) lists Tabs, Code groups, Steps, Columns, Panel, Callouts, Banner, Badge, Update, Frames, Tooltips, Prompt, Accordions, Expandables, View, Visibility, Fields, Responses, Examples, Cards, Tiles, Icons, Mermaid diagrams, Color, Tree — and under media, only video. No Audio, no Podcast, no media-player component.

### Obsidian `![[audio.ext]]` — the dominant input shape (CONFIRMED)

The canonical [obsidian-help](https://github.com/obsidianmd/obsidian-help) "Accepted file formats" page states: "Audio: `.flac`, `.m4a`, `.mp3`, `.ogg`, `.wav`, `.webm`, `.3gp`". These render as the browser's default HTML5 `<audio controls>` player when embedded via `![[file.ext]]`. Obsidian's embed syntax carries **no modifiers** for loop, autoplay, or playback-position — unlike image embeds, which accept `|width`. A small third-party plugin ecosystem (`obsidian-media`, audio-timestamp plugins) adds these capabilities, but they are non-canonical.

**Implication:** Migration-from-Obsidian for audio is essentially "map `![[x.mp3]]` → `<Audio src="x.mp3" />`". No additional props survive because Obsidian doesn't encode any.

### HTML5 `<audio>` — the substrate (CONFIRMED)

Per [MDN's `<audio>` reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio), the full attribute list is:

| Attribute | Values | Default |
|---|---|---|
| `src` | URL | — |
| `controls` | boolean | false |
| `autoplay` | boolean | false |
| `loop` | boolean | false |
| `muted` | boolean | false |
| `preload` | `none` \| `metadata` \| `auto` | browser-dependent (spec recommends `metadata`) |
| `crossorigin` | `anonymous` \| `use-credentials` | — |
| `controlslist` | `nodownload` \| `nofullscreen` \| `noremoteplayback` | — |
| `disableremoteplayback` | boolean | false |
| `loading` | `eager` \| `lazy` | `eager` (experimental) |

Notable absences vs `<video>`: **no `width`, no `height`, no `poster`.** The control bar's width is styled via CSS on the host element. `<source>` children let the browser pick the first playable codec; `<track>` children (kind `captions` / `chapters` / `descriptions`) are permitted by spec but, per MDN, "not fully implemented across browsers" for audio.

### OK's current Audio (14 LoC) — baseline to extend (CONFIRMED)

`packages/app/src/editor/components/componentMap.tsx:34-47` is an inline function: renders a `title` label and a native `<audio controls src={src}>`, with a bare `<track kind="captions" />` and a children-passthrough branch when `src` is absent. The descriptor in `packages/core/src/registry/built-ins.ts:348-363` exposes only `src` (required) and `title` (optional). The block comment at `componentMap.tsx:11-15` explicitly flags AI Elements AudioPlayer on `media-chrome` as the VR14 un-defer target — that is a **render upgrade**, not a descriptor change.

### AI Elements AudioPlayer — the render-upgrade target (CONFIRMED)

Per [elements.ai-sdk.dev/components/audio-player](https://elements.ai-sdk.dev/components/audio-player), the AudioPlayer is "built on media-chrome" with shadcn/ui Button styling. The API splits into a root `<AudioPlayer />` (accepts MediaController props, custom CSS theming vars), an `<AudioPlayerElement />` (accepts `src` or base64 `data`), and granular sub-components: play/pause, seek forward/backward (default 10 s), timeline + dual time displays, mute button + volume slider. It is fully composable.

**Implication for CB-v2:** The descriptor surface stays tiny because AI Elements AudioPlayer covers all playback behavior declaratively through its props; the descriptor just has to pass `src` + styling hooks. Upgrading the Audio renderer from the 14-LoC wrapper to AudioPlayer is a `componentMap.tsx` swap with no descriptor churn.

### Podcast metadata — out of scope for the descriptor (CONFIRMED, with recommendation)

Three distinct layers came up:

1. **[Podcasting 2.0 chapters](https://podcasting2.org/docs/podcast-namespace/tags/chapters)** — `<podcast:chapters>` references an external JSON file. Not embedded inline, not an MDX convention.
2. **[Podcasting 2.0 transcripts](https://podcasting2.org/docs/podcast-namespace/tags/transcript)** — `<podcast:transcript>` references an external VTT/SRT file. Also external.
3. **[MediaSession API](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession)** — a runtime JS API for lock-screen metadata. Set via `navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork })`, with action handlers for play/pause/seek/track navigation. Not Baseline as of 2026; mobile-coverage gaps.

None of these are natural MDX props. They either live outside the document (RSS enclosures, external VTT/JSON) or are imperative runtime concerns (MediaSession handlers). Forcing them into the Audio descriptor would produce a surface that the 99% author-of-a-podcast-episode-link use case never uses. The right home, if product direction warrants it, is a separate `<Podcast>` component whose descriptor accepts `rssUrl`, `episodeGuid`, `chaptersUrl`, `transcriptUrl` — a different noun with its own render shape.

### Remark/rehype audio plugins — landscape is thin (CONFIRMED)

No `remark-audio` or `rehype-audio` canonical plugin exists on npm. The closest neighbors are `remark-embed-images` (image-specific), `remark-youtube` (oEmbed-style video), and `remark-embed` (generic local-file injection). For OK, no plugin dependency is needed: CB-v2's existing `jsx-component` extension handles `<Audio />` natively, and the Obsidian-embed migration path is a one-off AST transform inside OK's markdown pipeline.

---

## Cross-Platform Prop Surface Comparison

| Prop | Fumadocs | Mintlify | Obsidian | HTML5 | OK (current) | Recommended CB-v2 |
|---|---|---|---|---|---|---|
| `src` | — | — | implicit (from `![[x]]`) | yes | required | required |
| `title` | — | — | no | no | optional | optional |
| `controls` | — | — | no (always on) | yes | hardcoded on | omit (always on) |
| `autoplay` | — | — | no | yes | no | optional (default false) |
| `loop` | — | — | no | yes | no | optional (default false) |
| `muted` | — | — | no | yes | no | optional (default false) |
| `preload` | — | — | no | yes enum | no | optional enum |
| `children` (caption / `<source>` / `<track>`) | — | — | no | yes | passthrough | reactnode |
| `poster` / `artwork` | — | — | no | no (audio has no poster) | no | no (defer to Podcast) |
| chapters / transcript | — | — | no | partial (`<track>`) | no | no (defer to Podcast) |

---

## Recommended CB-v2 Audio Descriptor

```ts
const audioProps: PropDef[] = [
  { name: 'src',      type: 'string',  required: true,  description: 'Audio source URL' },
  { name: 'title',    type: 'string',  required: false, description: 'Display label above the player' },
  { name: 'autoplay', type: 'boolean', required: false, defaultValue: false, description: 'Auto-start playback (subject to browser autoplay policy)' },
  { name: 'loop',     type: 'boolean', required: false, defaultValue: false, description: 'Restart on end' },
  { name: 'muted',    type: 'boolean', required: false, defaultValue: false, description: 'Start muted' },
  { name: 'preload',  type: 'enum',    required: false, enumValues: ['none', 'metadata', 'auto'], defaultValue: 'metadata', description: 'Loading hint' },
  { name: 'children', type: 'reactnode', required: false, description: 'Caption text, <source> fallbacks, or <track> captions' },
];
```

**Explicitly omitted:**

- `controls` — always on. A docs-site audio embed without controls is confidently-broken UI (precedent #7).
- `width` / `height` / `poster` — HTML5 `<audio>` has none.
- `crossorigin`, `controlslist`, `disableremoteplayback` — power-user knobs. Keep them accessible via `children` passthrough.
- `chapters`, `transcript`, `artist`, `album`, `artwork` — podcast concerns. See the Podcast-scope recommendation.

Also flip `hasChildren: false` → `true` and drop `isSelfClosing: true` in `built-ins.ts` to resolve the existing renderer/descriptor mismatch.

---

## Migration matrix

| Source | CB-v2 output |
|---|---|
| Obsidian `![[episode.mp3]]` | `<Audio src="episode.mp3" />` |
| Obsidian `![[clip.ogg]]` | `<Audio src="clip.ogg" />` (all 7 extensions pass through) |
| Raw `<audio src="x.mp3" controls loop />` | `<Audio src="x.mp3" loop />` (controls dropped — always on) |
| Raw `<audio><source src="x.opus" /><source src="x.mp3" /></audio>` | `<Audio><source src="x.opus" /><source src="x.mp3" /></Audio>` via children passthrough |
| Fumadocs / Mintlify | N/A — no source component to migrate from |

### Track / caption handling

Keep the `children` passthrough so authors CAN write `<Audio src="x.mp3"><track kind="captions" src="x.vtt" srclang="en" /></Audio>` — but do not elevate `transcript` or `captions` to a first-class prop. MDN flags `<track>` on `<audio>` as incompletely implemented; elevating a partially-working attribute to a documented prop misleads authors. The current 14-LoC wrapper's bare `<track kind="captions" />` (no `src`) is a no-op and should be removed when the renderer is upgraded.

### Podcast metadata — recommend separate component

Do not put these on `<Audio>`. If a Podcast component is ever warranted, sketch-scope would be: `rssUrl`, `episodeGuid` or `episodeIndex`, optional `chaptersUrl` / `transcriptUrl` overrides, optional `artwork`. That is its own spec.

### Remark plugin recommendation

**None.** No canonical `remark-audio` exists, and CB-v2 does not need one — `jsx-component` already dispatches `<Audio />` through the descriptor registry. The Obsidian-embed `![[x.mp3]]` → `<Audio src="x.mp3" />` migration is a one-off conversion inside OK's existing markdown pipeline (the same layer that handles `![[Page]]` wiki-links).

---

## Limitations & Open Questions

- **AI Elements AudioPlayer stability.** API surface was read from the live docs site; version pinning and breaking-change history were not traced. Descriptor recommendation is renderer-independent.
- **MediaSession chapter-markers shape.** MDN noted an experimental `ChapterInformation` type; full details weren't inspected because chapters were scoped out of the descriptor.
- **Obsidian playback-timestamp extensions.** A community plugin ecosystem layers timestamp anchors (`![[audio.mp3#t=30]]`) on top of core Obsidian. Canonical Obsidian docs don't cover this; if observed in real OK user content, the migration layer may need a `#t=` → `currentTime` bridge.

---

## References

### Evidence Files
- `evidence/fumadocs-absence.md` — repo structure + negative-grep receipts
- `evidence/ok-current.md` — current OK `Audio` function + descriptor

### External Sources
- MDN `<audio>`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio
- MDN MediaSession API: https://developer.mozilla.org/en-US/docs/Web/API/MediaSession
- Obsidian Accepted file formats: https://github.com/obsidianmd/obsidian-help/blob/master/en/Files%20and%20folders/Accepted%20file%20formats.md
- Mintlify Components: https://www.mintlify.com/docs/components
- AI Elements AudioPlayer: https://elements.ai-sdk.dev/components/audio-player
- Podcasting 2.0 Chapters: https://podcasting2.org/docs/podcast-namespace/tags/chapters
- Podcasting 2.0 Transcript: https://podcasting2.org/docs/podcast-namespace/tags/transcript
- Podlove Simple Chapters: https://podlove.org/simple-chapters/

### Related Research
- `reports/mermaid-rendering-options-for-mdx-editors/` — parallel deferred-renderer case study
- `reports/cb-v2-video-superset-research/` — peer descriptor research
