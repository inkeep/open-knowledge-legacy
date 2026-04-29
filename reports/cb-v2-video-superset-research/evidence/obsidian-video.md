# Evidence: Obsidian Video Embed Spec

**Dimension:** Obsidian video support (OFM / Obsidian Flavored Markdown)
**Date:** 2026-04-22
**Sources:** help.obsidian.md/file-formats, help.obsidian.md/How+to/Embed+files, forum.obsidian.md

---

## Findings

### Finding: `![[video.mp4]]` is the embed syntax
**Confidence:** CONFIRMED
**Evidence:** Obsidian Help — "Embed files"

Obsidian uses its wiki-embed syntax for all media: `![[file-path]]`. Video is treated identically to images/audio at the parse layer — the renderer branches on file extension to emit `<video>` instead of `<img>`.

### Finding: Supported video formats are mkv, mov, mp4, ogv, webm
**Confidence:** CONFIRMED
**Evidence:** <https://help.obsidian.md/file-formats> ("Accepted file formats")

The list is **Obsidian-canonical**, not a superset of HTML5:

- `.mp4` — H.264/AVC in MP4 container (universal)
- `.webm` — VP8/VP9 in WebM container (open-source stack)
- `.ogv` — Theora in Ogg container (legacy open-source)
- `.mov` — QuickTime container (Apple-native, variable browser support)
- `.mkv` — Matroska container (NOT natively supported by any browser's `<video>` element — Obsidian renders this via Electron's embedded Chromium which has broader codec support than Safari/Firefox)

### Finding: Sizing syntax `![[video.mp4|640]]` works
**Confidence:** INFERRED
**Evidence:** Obsidian forum discussions; identical embed-syntax semantics as images

The standard Obsidian embed sizing syntax `![[file|WIDTH]]` or `![[file|WIDTHxHEIGHT]]` applies to images per docs. Video embeds share the parser; pixel-width rendering confirmed in community forum threads. HOWEVER the official "Embed files" page does not enumerate sizing for video explicitly, so this is INFERRED from parser behavior and community use.

### Finding: No playback-control syntax in native markdown
**Confidence:** CONFIRMED
**Evidence:** Obsidian Help + forum threads

Obsidian `![[]]` embeds render `<video>` with the app's default controls enabled. There is **no markdown-syntax way** to toggle `autoplay`, `loop`, `muted`, `controls`. Authors who need these author raw `<video controls autoplay muted>...</video>` HTML or use CSS snippets.

### Finding: YouTube/Vimeo via iframe, not via `![[]]`
**Confidence:** CONFIRMED
**Evidence:** Obsidian forum ("Iframe" thread, "Embed YouTube Videos" thread)

Obsidian does NOT natively URL-sniff YouTube/Vimeo links into embeds. Standard workflow:
1. Paste raw HTML `<iframe src="https://www.youtube.com/embed/..." ...></iframe>` into the note
2. OR use community plugins (e.g., `obsidian-convert-url-to-iframe` by FHachez)

Obsidian Publish (the hosted docs product) has a distinct renderer — its behavior on YouTube URLs is separately documented but still relies on HTML iframe passthrough.

### Finding: YouTube timestamp link support via `?t=` query
**Confidence:** INFERRED
**Evidence:** Standard YouTube URL parameter

Timestamp jumping works because authors keep the `?t=90` query in the iframe `src`, not because Obsidian parses it. Not a component feature.

**Implications for OK CB-v2:** Obsidian's video UX relies on file-reference semantics (embed the file, browser decides format). Migration from Obsidian `![[video.mp4]]` to an OK `<Video>` descriptor MUST preserve the file-path + optional width|height affordance. YouTube/Vimeo migration requires parsing raw `<iframe>` from source (probably already handled by rawMdxFallback).
