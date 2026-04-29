# Evidence: MDX parse path & PUA guard interaction

**Dimension:** D1 — MDX parse path & PUA guard interaction
**Date:** 2026-04-28
**Sources:** repo `packages/core/src/markdown/`, `node_modules/micromark-extension-mdx-jsx`, `node_modules/mdast-util-mdx-jsx`, `node_modules/@types/react@19.2.14`, executable trace via `bun test`

---

## Key files referenced

- `packages/core/src/markdown/autolink-void-html-guard.ts:88` — `LOWERCASE_JSX_CANONICAL_TAGS = new Set(['img','video','audio'])`
- `packages/core/src/markdown/autolink-void-html-guard.ts:206-223` — first carve-out (LOWERCASE_HTML_TAG_RE pass)
- `packages/core/src/markdown/autolink-void-html-guard.ts:282-288` — second carve-out (catch-all pass for any remaining `<`)
- `node_modules/micromark-extension-mdx-jsx/lib/factory-tag.js` — token-emitter (no HTML/JSX discrimination)
- `node_modules/mdast-util-mdx-jsx/lib/index.js` — emits `mdxJsxFlowElement` / `mdxJsxTextElement`
- `node_modules/@types/react/index.d.ts:3140-3161` — `IframeHTMLAttributes` interface (D4 cross-link)

---

## Findings

### Finding 1: `remark-mdx` makes NO lowercase-vs-uppercase distinction in the parser

**Confidence:** CONFIRMED
**Evidence:** Trace test at `packages/core/src/markdown/__iframe-trace.test.ts` (deleted post-trace) ran a raw `<iframe ... />` block through `unified().use(remarkParse).use(remarkMdx).use(remarkGfm)` with NO PUA guard. Output:

```
{
  "type": "mdxJsxFlowElement",
  "name": "iframe",
  "attributes": [
    { "type": "mdxJsxAttribute", "name": "width", "value": "560" },
    { "type": "mdxJsxAttribute", "name": "height", "value": "315" },
    { "type": "mdxJsxAttribute", "name": "src", "value": "https://www.youtube.com/embed/dQw4w9WgXcQ" },
    { "type": "mdxJsxAttribute", "name": "title", "value": "YouTube embed example" },
    { "type": "mdxJsxAttribute", "name": "frameBorder", "value": "0" },
    { "type": "mdxJsxAttribute", "name": "allow", "value": "autoplay; encrypted-media; picture-in-picture" },
    { "type": "mdxJsxAttribute", "name": "allowFullScreen", "value": null }
  ],
  "children": [],
  "selfClosing": true
}
```

`remark-mdx` claims `<iframe>` exactly the same way it claims `<Callout>` or `<MyComponent>` — both produce `mdxJsxFlowElement`. The "lowercase = HTML, uppercase = component" distinction is OK's policy convention encoded in `autolink-void-html-guard.ts`, not a parser behavior.

The `mdast-util-mdx-jsx` README confirms this is by design — JSX tags are distinguished only by self-closing vs paired-tag syntax, not by name casing. The micromark `factory-tag.js` token emitter (lines 127-294) tracks `tagNamePrimary`, `tagNameMember`, `tagNamePrefix` — never the lexical category.

**Implication:** Routing iframe to `mdxJsxFlowElement` is one regex line. The hard part is the autolink-eats-src cascade described in finding 2.

### Finding 2: Adding `iframe` to `LOWERCASE_JSX_CANONICAL_TAGS` is the structural fix

**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/markdown/autolink-void-html-guard.ts:73-88, 206-223, 282-288`. Three carve-out sites:

```ts
// Line 73 — opening-tag regex (matches both `<x>` and `<x />`)
const LOWERCASE_HTML_TAG_RE = /<([a-z][a-z0-9]*)(\s[^>]*)?\/?>/g;

// Line 88 — exemption set
const LOWERCASE_JSX_CANONICAL_TAGS = new Set(['img', 'video', 'audio']);

// Line 214-216 — first carve-out (within LOWERCASE_HTML_TAG_RE.replace)
if (LOWERCASE_JSX_CANONICAL_TAGS.has(tag) && match.endsWith('/>')) {
  return match;  // pass-through to remark-mdx
}

// Line 285-288 — second carve-out (catch-all `<` pass)
const lowercaseCanonicalMatch = /^<([a-z][a-z0-9]*)([^>]*)\/>/.exec(lookahead);
if (lowercaseCanonicalMatch && LOWERCASE_JSX_CANONICAL_TAGS.has(lowercaseCanonicalMatch[1])) {
  return match;
}
```

Inline doc at lines 79-87 spells out the rationale:

> Lowercase tag names that ARE registered canonical descriptors and must pass through to remark-mdx as `mdxJsxFlowElement` rather than being PUA-protected as raw HTML.
> Adding a new lowercase canonical descriptor to the registry requires appending its tag name here.

Adding `'iframe'` to the set, combined with registering an `iframe` descriptor in `built-ins.ts`, satisfies both carve-outs.

### Finding 3: Both carve-outs require `/>` (self-closing JSX form) — paired `<iframe>...</iframe>` stays guarded

**Confidence:** CONFIRMED
**Evidence:** `autolink-void-html-guard.ts:214` uses `match.endsWith('/>')`; line 285 anchors `/^<([a-z][a-z0-9]*)([^>]*)\/>/`. Both demand the JSX self-closing form. Bare `<iframe>...</iframe>` (HTML void semantics) stays PUA-guarded as plaintext — same as bare `<img>` does today.

This is intentional (lines 211-213, the inline doc):

> Only the self-closing JSX form (`<img ... />`) is exempted; bare `<img>` / `<img src="x">` (HTML void semantics) stays guarded so legacy HTML-form content keeps parsing as text without remark-mdx demanding a close tag.

**Authoring implication for iframe:** users would need to write `<iframe ... />` (self-closing JSX form), not the HTML-style `<iframe>...</iframe>` you'd find in YouTube's own copy-paste embed. The Mintlify pattern (see D3 evidence) uses the paired form `<iframe>...</iframe>` — a slight authoring divergence.

### Finding 4: Boolean attrs (`allowFullScreen`) parse as `value: null`; semicolons inside string attrs (`allow="autoplay; encrypted-media"`) parse cleanly

**Confidence:** CONFIRMED
**Evidence:** Trace output (Finding 1):
```
{ "type": "mdxJsxAttribute", "name": "allowFullScreen", "value": null }
{ "type": "mdxJsxAttribute", "name": "allow", "value": "autoplay; encrypted-media; picture-in-picture" }
```

`mdxJsxAttribute.value: null` is the JSX-spec encoding for boolean attrs (per `mdast-util-mdx-jsx/lib/index.js` `MdxJsxAttribute` typedef). The `emitMdxJsx` serializer in `packages/core/src/markdown/serialize-helpers.ts` already handles `null`-valued attrs for the existing 5-pack. **No new serialization work needed for iframe boolean attrs.**

The `allow` attribute carries semicolon-separated tokens. Each `mdxJsxAttribute.value` is a verbatim string — semicolons are just bytes inside a quoted string, and remark-mdx never tries to interpret them. **No special case needed.**

### Finding 5: `frameBorder` (camelCase) parses as the literal attribute name `frameBorder`

**Confidence:** CONFIRMED
**Evidence:** Trace output preserves the input casing byte-for-byte: `"name": "frameBorder"`. remark-mdx is case-sensitive on attribute names — what authors type is what lands in `mdxJsxAttribute.name`.

The 1P precedent (`built-ins.ts:120-152` JSDoc) is to use **HTML-spec lowercase attribute names** at the descriptor level (`autoplay`, `playsinline`, `fetchpriority`, `crossorigin`, `referrerpolicy`) and translate to React camelCase at the JSX boundary inside `Image.tsx` / `Video.tsx` / `Audio.tsx`. Following that convention for iframe means descriptor PropDef names should be lowercase: `allow`, `sandbox`, `src`, `srcdoc`, `referrerpolicy`, `width`, `height`, `name`, `loading`, `allowfullscreen` (deprecated; see D2/D4 evidence).

But the existing trace shows authors *do* type `frameBorder` in real-world content (and Mintlify's docs use `frameBorder` and `allowFullScreen` — see D3 evidence). The PUA guard / parser preserves whatever they type; the burden of lowercase-vs-camelCase is at:
  1. Descriptor PropDef `name` (this is what PropPanel surfaces in the UI)
  2. The renderer's React JSX boundary (`{...{frameBorder: ...}}` doesn't work — React requires camelCase here)

**Implication:** if the OK descriptor's PropDef `name` uses lowercase `frameborder`, then the React component file must translate to `frameBorder` (camelCase) before passing to `<iframe>`. Same translation pattern as `Video.tsx` does today for `autoplay → autoPlay` and `playsinline → playsInline`.

### Finding 6: There is NO equivalent of `LOWERCASE_JSX_CANONICAL_TAGS` for paired forms

**Confidence:** CONFIRMED
**Evidence:** Lines 60-65 of `autolink-void-html-guard.ts`:

```ts
const HTML_CLOSE_TAG_RE = /<\/([a-z][a-z0-9]*)\s*>/g;
```

with the inline doc:

> JSX component closing tags (`</Callout>`, `</Docs.Link>`) MUST pass through to remark-mdx so paired components (mdxJsxFlowElement / mdxJsxTextElement) parse correctly. Matching mixed-case closing tags here was the original bug that broke paired MDX round-trip entirely — mirror the opening-tag regex's lowercase-only discrimination.

There is no carve-out for lowercase paired close tags. So `</iframe>` (lowercase paired close) gets PUA-guarded as text. Combined with finding 3, this means: **the supported iframe authoring form would be self-closing JSX (`<iframe ... />`), not the HTML-style paired form**.

If we wanted to support paired `<iframe>...</iframe>`, the close-tag regex would need a parallel exemption — and the contract gets more complex because remark-mdx would then see a paired flow-form `mdxJsxFlowElement` whose children become an embedded markdown block. Iframes don't have meaningful children semantically (only fallback text per the HTML5 spec, which browsers ignore when the iframe loads), so requiring self-closing is the right contract anyway.

---

## Hazards if iframe is added naïvely

1. **The autolink-eats-src bug** (D6 evidence) becomes worse if iframe is registered with no carve-out — every URL in iframe attributes will keep getting promoted to `[url](url)` on round-trip. Adding to `LOWERCASE_JSX_CANONICAL_TAGS` fixes this for self-closing JSX form.

2. **Paired-form authoring breaks.** If users copy YouTube's embed code (which is paired `<iframe>...</iframe>`), it parses as text+autolink. Either we educate authors to convert to self-closing form, or we add a paired-form exemption.

3. **`<iframe>` (no slash) HTML void form**. Users who write the HTML void form (no closing slash, no close tag) get text+autolink, exactly like today. Same as bare `<img>`.

---

## Negative searches

- Searched for any HTML-tag-name-aware logic in `node_modules/micromark-extension-mdx-jsx/lib/factory-tag.js`. **NOT FOUND.** The parser treats every JSX-shaped tag identically.
- Searched for an existing `iframe` reference in `packages/core/src/registry/built-ins.ts`. **NOT FOUND.** Iframe is not a registered descriptor today.
- Searched for any `iframe` rendering in `packages/app/src/editor/components/`. **NOT FOUND** outside the JSDoc note in `Video.tsx:13`.

---

## Gaps

- The MDX flow-vs-text element decision is governed by the parent context (block-level vs inline). Trace evidence shows a top-level `<iframe />` becomes `mdxJsxFlowElement`. Inside a paragraph (e.g., `text <iframe ... /> more text`) it would become `mdxJsxTextElement`. Both have the same attribute-handling semantics — the descriptor framework treats them uniformly.
- This evidence does not exhaust the question of whether the descriptor should declare `hasChildren: true` or `hasChildren: false`. Iframe semantically has no children (HTML5 fallback content ignored by browsers), so `hasChildren: false, isSelfClosing: true` matches img/video/audio canonicals. Recommended in synthesis.
