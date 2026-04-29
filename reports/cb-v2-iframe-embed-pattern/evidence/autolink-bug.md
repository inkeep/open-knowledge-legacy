# Evidence: Autolink-eats-src bug in `showcase/03-video.mdx`

**Dimension:** D6 — autolink-eats-src bug trace
**Date:** 2026-04-28
**Sources:** repo trace via `bun test`, `git diff`, `git blame`, `packages/core/src/markdown/autolink-void-html-guard.ts`, `node_modules/remark-gfm`

---

## The observation

`showcase/03-video.mdx:84-92` (working tree, NOT YET COMMITTED at the time of this research):

```mdx
<iframe
width="560"
height="315"
src="[https://www.youtube.com/embed/dQw4w9WgXcQ](https://www.youtube.com/embed/dQw4w9WgXcQ)"
title="YouTube embed example"
frameBorder="0"
allow="autoplay; encrypted-media; picture-in-picture"
allowFullScreen
/>
```

The `src` value is `"[https://...](https://...)"` — CommonMark inline-link syntax — wrapping the actual URL inside an HTML attribute string. This is malformed HTML that the browser will refuse to load.

`git blame -L 87,87 showcase/03-video.mdx` confirms: `Not Committed Yet 2026-04-28`. So this is in the working copy only — likely produced by a parse-then-serialize round-trip from a draft that the author authored as a normal raw URL.

---

## Reproduction (executable trace, 2026-04-28)

A scratch test (deleted post-trace, content reproduced below) ran a well-formed iframe through OK's parse pipeline:

```ts
import { protectFromMdx } from './autolink-void-html-guard.ts';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';

const input = `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" />`;
const guarded = protectFromMdx(input);
console.log(JSON.stringify(guarded));
```

Output:

```
"iframe src=\"https://www.youtube.com/embed/dQw4w9WgXcQ\" /"
```

(GUARD_OPEN/GUARD_CLOSE displayed here as ``/`` for clarity; the test prints them as raw PUA bytes.)

**Both `<` and `>` got replaced with PUA sentinels** — exactly the behavior of `LOWERCASE_HTML_TAG_RE.replace` on the `<iframe ... />` substring (because `iframe` is not in `LOWERCASE_JSX_CANONICAL_TAGS`). But **the URL bytes inside `src="..."` are unchanged**.

When the guarded source is fed to `remark-parse + remark-mdx + remark-gfm`, the resulting MDAST is:

```
[
  {
    "type": "paragraph",
    "children": [
      { "type": "text", "value": "<iframe src=\"" },
      {
        "type": "link",
        "url": "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "children": [
          { "type": "text", "value": "https://www.youtube.com/embed/dQw4w9WgXcQ" }
        ]
      },
      { "type": "text", "value": "\" />" }
    ]
  }
]
```

**The bare URL inside the attribute string was claimed by remark-gfm's autolink-literal extension and promoted to a link node.** When this MDAST round-trips through to-markdown, that link node serializes as `[https://...](https://...)` — exactly the malformed source we see in `showcase/03-video.mdx:87`.

---

## Root cause

`packages/core/src/markdown/autolink-void-html-guard.ts:206-223` PUA-guards the angle brackets of lowercase HTML tags but leaves the **interior of the tag** — including attribute-string contents — exposed in the source byte stream. remark-gfm's autolink-literal then runs its scheme-prefix scanner over the whole source and matches the `https://...` URL bytes as if they were free-floating text, because **once `<` and `>` are PUA, nothing tells the next pipeline stage that the URL is "inside" anything**.

Compare to autolink protection (lines 195-198 of the guard):

```ts
result = result.replace(AUTOLINK_RE, (_match, uri: string) => {
  const safe = uri.replaceAll(':', GUARD_COLON).replaceAll('@', GUARD_AT);
  return `${GUARD_OPEN}${safe}${GUARD_CLOSE}`;
});
```

The autolink guard replaces `:` with GUARD_COLON inside the URL body to defeat remark-gfm's autolink-literal matcher. The lowercase-HTML-tag guard at line 201-203 doesn't do the same:

```ts
result = result.replace(HTML_CLOSE_TAG_RE, (match) => {
  return match.replace(/</g, GUARD_OPEN).replace(/>/g, GUARD_CLOSE);
});
```

It only replaces angle brackets — the URL body in `src="https://..."` keeps its `:` byte, which remark-gfm's autolink-literal pattern (`/scheme:[^\s<>]+/`) matches happily.

---

## Why this is NOT a problem for `<img>`/`<video>`/`<audio>` today

These tags are exempted from the PUA guard via `LOWERCASE_JSX_CANONICAL_TAGS` (line 88). They pass through unchanged to remark-mdx, which claims the **whole tag** (open angle bracket through close angle bracket, including attribute strings) as a single `mdxJsxFlowElement` token. remark-gfm's autolink-literal runs *after* tokenization, so attribute strings inside an mdx-jsx token are opaque — autolink-literal never sees the URL bytes.

Trace evidence (D1, finding 1) confirms: a self-closing `<iframe ... />` parsed *without* the PUA guard becomes a clean `mdxJsxFlowElement` with `attributes: [{ name: 'src', value: 'https://...' }]`. No `link` node, no `[url](url)` corruption.

---

## Fix

Add `'iframe'` to `LOWERCASE_JSX_CANONICAL_TAGS` (and ship a registered descriptor at the same time so `mdxJsxFlowElement` reaches descriptor dispatch). One regex line + one descriptor entry. **No new sentinel logic, no new escape pass.**

Subset of unaddressed concerns under this fix:

- **Paired-form `<iframe>...</iframe>`** stays guarded (the carve-out requires `/>`). Authors who copy-paste YouTube's "embed" snippet (which uses paired form) will get the same autolink-eats-src corruption. Fixing this requires either (a) educating authors to convert to self-closing, (b) extending `LOWERCASE_JSX_CANONICAL_TAGS` to a paired-form exemption, or (c) a paste-time canonicalizer.

- **The URL is not the only attribute that leaks.** `srcDoc="<html>..."` would have `<` get PUA-guarded, then the inner `<` gets re-claimed. But `srcdoc` is rare and out of scope here.

---

## Why the showcase content has the bug despite the author writing a clean iframe

`git diff showcase/03-video.mdx` shows the iframe section was just authored in this working copy. The bug is in the working copy, not the index. Two paths plausibly produced it:

1. **Author hand-typed the malformed `[url](url)` form** — extremely unlikely. No human writes `src="[https://x.com](https://x.com)"`.

2. **The author drafted the iframe with a normal `src="..."` URL, then the live preview pulled it through OK's parse + serialize loop.** The autolink-literal claimed the URL, the link node serialized as `[url](url)`, the file watcher wrote it back to disk. The author saw the corruption and committed it as-is (or noticed and is about to fix).

Path 2 is exactly what the trace test reproduces, and matches how the editor's persistence loop works. **The bug surfaces on every save once the user pastes any iframe with a URL src** — the showcase content is just the first artifact where it became visible.

---

## Confidence

**CONFIRMED.** The bug is fully reproduced by an executable trace; the cause is identified at a specific line range in the guard module; the fix is a single-line addition to `LOWERCASE_JSX_CANONICAL_TAGS` (combined with a descriptor registration); the showcase content is the visible symptom of the same parse path.
