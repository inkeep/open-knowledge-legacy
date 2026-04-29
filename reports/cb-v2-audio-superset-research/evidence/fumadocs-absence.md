# Evidence: Fumadocs Audio Absence

**Dimension:** Fumadocs Audio component presence
**Date:** 2026-04-22
**Sources:** `~/.claude/oss-repos/fumadocs` (local checkout), Mintlify docs web

---

## Key files / directories referenced

- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/` — package roster
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/base-ui/src/components/` — shipped component files
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/obsidian/src/` — Obsidian-integration internals
- https://www.mintlify.com/docs/components — Mintlify component catalog

---

## Findings

### Finding: Fumadocs ships no Audio component
**Confidence:** CONFIRMED
**Evidence:**

`ls ~/.claude/oss-repos/fumadocs/packages/base-ui/src/components/`:

```text
accordion.tsx
banner.tsx
callout.tsx
card.tsx
codeblock.rsc.tsx
codeblock.tsx
dialog
dynamic-codeblock.core.tsx
dynamic-codeblock.tsx
files.tsx
github-info.tsx
heading.tsx
image-zoom.css
image-zoom.tsx
inline-toc.tsx
sidebar
steps.tsx
tabs.tsx
toc
type-table.tsx
ui
```

No `audio.tsx`, no `media.tsx`, no `player.tsx`.

`find ~/.claude/oss-repos/fumadocs -type f -iname '*audio*'` returned zero files.

**Implications:** CB-v2 inherits no upstream Audio descriptor from Fumadocs. The `builtInComponents` manifest correctly treats Audio as an OK-added entry (1 of 17 components is non-fumadocs), not as a fumadocs-ui wrap.

---

### Finding: Fumadocs Obsidian integration does not handle audio embeds
**Confidence:** CONFIRMED
**Evidence:**

`grep -rin -E "audio|mp3|wav|m4a|ogg|flac" ~/.claude/oss-repos/fumadocs/packages/obsidian/src` returned zero matches. The integration's remark layer (`remark-block-id.ts`, `remark-convert.ts`, `remark-obsidian-comment.ts`, `remark-wikilinks.ts`) handles wiki-links, block IDs, and comments — not media embeds.

**Implications:** The Obsidian → Fumadocs migration path is silent on audio. OK needs its own `![[x.mp3]]` → `<Audio src="x.mp3" />` transform (confirmed as a one-off in the report).

---

### Finding: Mintlify ships no Audio component
**Confidence:** CONFIRMED
**Evidence:** Mintlify's documented component catalog (https://www.mintlify.com/docs/components) lists Tabs, Code groups, Steps, Columns, Panel, Callouts, Banner, Badge, Update, Frames, Tooltips, Prompt, Accordions, Expandables, View, Visibility, Fields, Responses, Examples, Cards, Tiles, Icons, Mermaid diagrams, Color, Tree. The "media" grouping includes only video. No Audio, Podcast, or generic media-player component is present.

**Implications:** CB-v2 inherits no Audio contract from either peer doc-platform. The decision space on descriptor shape is open; the HTML5 substrate is the only upstream source with a defined prop surface.

---

## Negative searches
- Searched `audio|Audio|mp3|wav|m4a|ogg|flac|webm|podcast|media-player` in `~/.claude/oss-repos/fumadocs/packages/**` → 0 hits
- Searched Mintlify `/docs/components` landing page for "audio", "podcast", "media" outside video → 0 hits

---

## Gaps / follow-ups
- None. Absence is the finding.
