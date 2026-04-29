---
sources:
  - gh pr view 270 (cb-v2-md-foundation branch)
  - specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md
kind: cross-spec-coordination
cutoff: 2026-04-23
---

# PR #270 coordination

This spec (MD-Foundation 5-pack) and PR #270 (Editor asset + embed surface) are independent and complementary. No overlap, no discongruent work, no throwaway work.

## What PR #270 owns (NG23 in this spec)

From PR #270's own summary + file list:
- `wikiLinkEmbed` micromark tokenizer — parses `![[file.ext]]`
- `wikiLinkEmbed` mdast ↔ PM ↔ hast handlers with extension dispatch
- TipTap `wikiLinkEmbed` NodeView — renders native `<img>` / `<video>` / `<audio>` / `<a>` by extension
- `POST /api/upload` endpoint — streaming sha256 dedup + basename index + collision-suffix semantics
- `upload.*` Zod config (5 fields: `attachmentFolderPath`, `emitFormat`, `dedup.{mode,ui}`, `wikiEmbedExtensions`)
- Obsidian vault detection (non-destructive; `.obsidian/app.json`)
- File-watcher widening for asset DiskEvents
- CC1 `ch:'files'` fan-out for new assets
- Image-ref rewrite on doc rename (Markdown image refs only; wiki-embed refs untouched)
- Unicode-preserving `sanitizeFilename`
- Drop UX (drag → upload → insert) with dedup toast
- 48 QA scenarios validated on real fixtures (real PDF/PNG/MP4/MP3/SVG/ZIP/CSV; sha256 byte-identity verified on disk)

Entire surface is out of scope for this spec.

## What this spec owns

- 5 MDX-JSX descriptors: Callout, Image, Video, Audio, Accordion
- DIY React components (OK brand, no fumadocs-ui)
- GFM alerts markdown-syntax parse path for Callout
- HTML5 `<details>` mdast promoter for Accordion
- Removal of 12 fumadocs descriptors + `compound-wrappers.tsx` + supporting machinery
- Removal of `fumadocs-ui` React dep + `--color-fd-*` CSS bridge

## How they layer (technical independence)

| Concern | PR #270 | This spec | Interaction |
|---|---|---|---|
| PM node type for media via wiki-syntax | `wikiLinkEmbed` (distinct node) | — | PR #270 owns |
| PM node type for media via JSX syntax | — | `jsxComponent` (existing, widened CB-v2) | This spec owns |
| γ serialization | scoped to jsxComponent (unchanged) | scoped to jsxComponent | No cross-coupling |
| Parse plugins | `wikiLinkEmbed` tokenizer | `remark-github-alerts`, `<details>` promoter | Different plugins, different stages |
| Render output | native HTML5 `<img>`, `<video>`, `<audio>` | DIY React `<Image>`, `<Video>`, `<Audio>` with rich UX | Two-tier UX — acceptable in interim |

## Interim two-tier media UX (consequence of independent ship)

Users see:
- `![[photo.jpg]]` → native `<img>` (basic, no zoom modal, no caption)
- `<Image src="photo.jpg" caption="...">` → our DIY Image (zoom modal, caption, dimensions, PropPanel editable)
- `![[clip.mp4]]` → native `<video controls>` (basic)
- `<Video src="clip.mp4" poster="thumb.jpg" autoPlay>` → our DIY Video (richer props, YouTube/Vimeo URL sniff)
- Similarly for Audio

This drift is explicit and documented (NG24 in this spec). Each path has a consistent internal story:
- Wiki-embed form = "Obsidian-portable quick drop, basic rendering"
- MDX form = "rich component UX, typed props, PropPanel-editable"

## Consolidation follow-up (NG24)

Post-both-merges, a ~40-LoC follow-up PR amends PR #270's `wikiLinkEmbed` NodeView: dispatch by extension → render our `componentMap.Image` / `componentMap.Video` / `componentMap.Audio` React components instead of inline HTML5.

Implementation sketch:
```ts
// In PR #270's NodeView (packages/app/src/editor/extensions/link-resolution.ts or equivalent)
import { componentMap } from '../components/componentMap';

// Replace inline <img>/<video>/<audio> branches with:
case 'image': {
  const Image = componentMap.Image;
  return <Image src={resolvedSrc} alt={alias ?? ''} {...inferredDims} />;
}
case 'video': {
  const Video = componentMap.Video;
  return <Video src={resolvedSrc} controls />;
}
case 'audio': {
  const Audio = componentMap.Audio;
  return <Audio src={resolvedSrc} />;
}
```

After consolidation: single render path for media. Both authoring forms land at the same React component. Visual consistency restored.

## File-level conflict risk (shared files between the two specs)

| File | PR #270 touches | This spec touches | Conflict risk |
|---|---|---|---|
| `packages/app/package.json` | adds upload-related deps | removes fumadocs-ui, adds react-medium-image-zoom + remark-github-alerts | Trivial merge (additive + disjoint removal) |
| `bun.lock` | mechanical | mechanical | Standard regeneration |
| `AGENTS.md` | adds asset/embed docs | retracts Precedent #25 | Different sections; trivial merge |
| `packages/app/src/editor/extensions/shared.ts` | registers new extensions | removes `typedChildrenGuard.configure()` if present | Different extension entries; trivial merge |
| `knip.config.ts` | updates for new extensions | updates for new/removed components | Different entries; trivial merge |

No expected merge conflicts beyond mechanical bun.lock regeneration.

## Sequencing assumption

Either spec may merge first. This spec ships independently — does not block on PR #270. Consolidation (NG24) is whichever spec merges second writing the ~40-LoC amendment.

Under `git rebase origin/main` after PR #270 merges: our spec branches pick up PR #270's changes in the adjacent files; no restructure needed.
