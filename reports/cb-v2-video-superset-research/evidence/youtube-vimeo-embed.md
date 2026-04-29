# Evidence: YouTube / Vimeo embed conventions

**Dimension:** Platform embed conventions
**Date:** 2026-04-22
**Sources:** YouTube IFrame API docs, Vimeo Player docs, oEmbed spec

---

## Findings

### Finding: YouTube standard iframe embed URL
**Confidence:** CONFIRMED

```
https://www.youtube.com/embed/VIDEO_ID
```

Query parameters (most common):
- `autoplay=0|1`
- `mute=0|1`
- `loop=0|1` (requires `playlist=VIDEO_ID` to actually loop per YouTube's quirk)
- `controls=0|1`
- `start=<seconds>`
- `end=<seconds>`
- `rel=0|1` (related videos on end)
- `modestbranding=1`
- `playsinline=0|1`
- `cc_load_policy=1` (show captions by default)

Mintlify canonical allow-list for YouTube: `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"` + `allowFullScreen`.

### Finding: Vimeo standard iframe embed URL
**Confidence:** CONFIRMED

```
https://player.vimeo.com/video/VIDEO_ID
```

Query parameters: `autoplay=0|1`, `loop=0|1`, `muted=0|1`, `controls=0|1`, `title=0|1`, `portrait=0|1`, `byline=0|1`, `color=<hex>`, `#t=<time>` (time anchor).

### Finding: oEmbed protocol
**Confidence:** CONFIRMED
**Source:** <https://oembed.com>

An open spec for third-party sites to expose an oEmbed discovery endpoint. Request URL pattern:
```
https://<provider>/oembed?url=<encoded-content-url>&format=json
```

Response types include `video` and `rich` (iframe HTML). YouTube, Vimeo, SoundCloud, Twitter, Instagram, Flickr, CodePen support it.

**Trade-off for OK:** Using oEmbed at parse time means network fetch + API-rate-limit exposure + stale cached HTML. Using static URL templates (`https://www.youtube.com/embed/${ID}`) avoids those costs but misses edge cases like private Vimeo links. For OK CB-v2, static templates are the right call — provider-aware URL construction can live in the `Video` descriptor's render layer, not at the parse boundary.

### Finding: URL-sniffing detection patterns
**Confidence:** CONFIRMED (union across remark-youtube, gatsby-remark-embed-video, rehype-video ecosystem)

- YouTube: `youtu.be/ID`, `youtube.com/watch?v=ID`, `youtube.com/embed/ID`, `youtube.com/shorts/ID`, `youtube-nocookie.com/embed/ID`
- Vimeo: `vimeo.com/ID`, `vimeo.com/channels/NAME/ID`, `player.vimeo.com/video/ID`
- Self-hosted: bare URL ending in `.mp4`, `.webm`, `.mov`, `.ogv`

**Implications for OK CB-v2:** The Video descriptor's `src` prop MUST accept both local paths AND provider URLs. A render-time helper detects the URL shape and branches to `<video>` vs. `<iframe>`. This keeps the descriptor's markdown/prop surface flat (one `src`) while delivering the full multi-platform UX.
