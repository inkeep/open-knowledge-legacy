# Evidence: Fumadocs Video Component Absence

**Dimension:** Fumadocs video support
**Date:** 2026-04-22
**Sources:** /Users/edwingomezcuellar/.claude/oss-repos/fumadocs (full tree)

---

## Searches performed

- `find packages -path '*/node_modules' -prune -o -iname '*video*' -print` → only matches in `packages/tailwind/src/typography/{index.ts,styles.ts}` (typography styling, not a component)
- `grep -rln "video\|Vimeo\|YouTube" packages --include='*.tsx' --include='*.ts'` → only the two typography files
- `grep -rln -i "video|vimeo|youtube" documents/` → zero matches across entire docs corpus

## Packages inspected

`base-ui`, `cli`, `content`, `content-collections`, `core`, `create-app`, `doc-gen`, `epub`, `mdx`, `mdx-remote`, `obsidian`, `openapi`, `press`, `python`, `radix-ui`, `shared`, `stf`, `story`, `tailwind`, `twoslash`, `typescript`

---

## Findings

### Finding: Fumadocs ships NO Video component
**Confidence:** CONFIRMED
**Evidence:** None — negative search across `packages/base-ui`, `packages/radix-ui`, `packages/core`, and the full documentation corpus

No `.tsx` or `.ts` file in fumadocs defines, exports, or references `Video`, `<Video>`, `YouTube`, `Vimeo`, iframe helper, or video URL sniffing.

### Finding: Video handled as HTML passthrough with Typography CSS
**Confidence:** CONFIRMED
**Evidence:** `packages/tailwind/src/typography/index.ts:145`, `packages/tailwind/src/typography/styles.ts:345-348`

```ts
// index.ts — SELECTORS list (generates `.prose-video` variant)
['video'],
```

```ts
// styles.ts — prose typography CSS for native <video>
video: {
  marginTop: em(32, 16),
  marginBottom: em(32, 16),
},
```

The fumadocs "prose" typography plugin emits spacing CSS for bare `<video>` elements. There is no component — authors write raw `<video>` or raw `<iframe>` inside MDX and the typography prose styles apply marginTop/marginBottom. Users who want YouTube/Vimeo embeds are expected to author `<iframe>` by hand.

**Implications for OK CB-v2:** Video is a **genuine gap in fumadocs's 5-pack family** — every other block (Callout, Card, Cards, Steps, Tabs, etc.) has a dedicated component. OK's Video descriptor cannot inherit fumadocs's prop surface (there is none). The superset must be assembled from Mintlify + Obsidian + HTML5 + remark ecosystem.
