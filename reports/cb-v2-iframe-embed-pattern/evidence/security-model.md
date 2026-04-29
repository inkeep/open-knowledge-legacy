# Evidence: iframe security model (sandbox, allow, CSP)

**Dimension:** D2 — Security model for embedded iframes in user-authored content
**Date:** 2026-04-28
**Sources:** MDN, web.dev, HTML Living Standard, OK 1P sanitizer

---

## Key sources

- [MDN: `<iframe>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) — full attribute reference
- [MDN: CSP `sandbox` directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)
- [web.dev: Play safely in sandboxed iframes](https://web.dev/articles/sandboxed-iframes)
- [HTML Living Standard §4.8.5 The iframe element](https://html.spec.whatwg.org/multipage/iframe-embed-object.html)
- 1P: `packages/core/src/markdown/mdast-to-html.ts:64-110` — `rehypeSanitizeUrls` (the only render-side defense today)

---

## Findings

### Finding 1: The full `sandbox` attribute taxonomy is 14 tokens

**Confidence:** CONFIRMED
**Evidence:** [MDN iframe docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe). Verbatim list:

| Token | Behavior |
|-------|----------|
| `allow-downloads` | Allow file downloads via `<a>`/`<area>` with `download` attribute |
| `allow-forms` | Allow form submission |
| `allow-modals` | Allow `Window.alert()`, `confirm()`, `print()`, `prompt()` and `<dialog>` |
| `allow-orientation-lock` | Allow screen orientation locking |
| `allow-pointer-lock` | Allow Pointer Lock API |
| `allow-popups` | Allow popups via `window.open()` or `target="_blank"` |
| `allow-popups-to-escape-sandbox` | Allow sandboxed documents to open new contexts without inheriting sandbox restrictions |
| `allow-presentation` | Allow control over presentation session initiation |
| `allow-same-origin` | Allow same-origin access; prevents special origin enforcement |
| `allow-scripts` | Allow script execution |
| `allow-storage-access-by-user-activation` | Allow Storage Access API for unpartitioned cookies |
| `allow-top-navigation` | Allow navigation of top-level browsing context |
| `allow-top-navigation-by-user-activation` | Allow top navigation only via user gesture |
| `allow-top-navigation-to-custom-protocols` | Allow navigation to non-HTTP protocols |

**Empty `sandbox=""`:** applies all restrictions (most restrictive).
**No `sandbox` attr:** no restrictions (least restrictive — full origin privileges).

### Finding 2: `allow-scripts` + `allow-same-origin` voids the sandbox

**Confidence:** CONFIRMED
**Evidence:** MDN security warning (verbatim):

> ⚠️ **Critical:** Avoid combining `allow-scripts` AND `allow-same-origin` — allows removing sandbox entirely

A document with both flags can `parent.frameElement.removeAttribute('sandbox')` from inside the frame, which then takes effect on any subsequent navigation. **Same-origin combined with scripts == no sandbox at all.**

This is the single most common authoring mistake — and it's the combination YouTube embeds frequently demand. A docs editor that exposes raw `sandbox` to users without warning is delegating a significant footgun to authors.

### Finding 3: The `allow` attribute is Permissions Policy delegation

**Confidence:** CONFIRMED
**Evidence:** [MDN allow attr docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Permissions_Policy). The `allow` attribute is **separate** from `sandbox`. Where `sandbox` restricts capabilities (default-deny), `allow` delegates Permissions Policy features (default-deny per Permissions-Policy header, then opted into per-iframe).

Common features used in real-world iframes (per D5 evidence):

```
allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
```

Each token can be unscoped (applies to the iframe origin) or scoped (`encrypted-media 'self' *.youtube.com`). Most copy-paste embed snippets use unscoped form.

YouTube's standard embed snippet ships with the seven-token allow list above. Loom uses just `allow="encrypted-media *;"`. Spotify's includes `fullscreen`. Different providers want different feature subsets — there is no one-size-fits-all default.

### Finding 4: CSP `frame-ancestors` is the *embedder's* primary defense, not the embedder of *content*

**Confidence:** CONFIRMED
**Evidence:** [MDN CSP frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors).

`frame-ancestors` is set by the *embedded* page (via `Content-Security-Policy` HTTP header) to control who can frame *it*. For example, GitHub sets `frame-ancestors 'none'`, which is why you cannot embed GitHub in an iframe.

For OK's case (we're the embedder), the relevant directive is `frame-src` in OK's own CSP — it determines which iframe origins OK is willing to load. Any iframe pointing to a domain not in OK's `frame-src` allowlist is blocked at network time, regardless of `sandbox`. **This is server-side / deployment configuration, not descriptor design.** If OK is deployed without a CSP, the browser allows iframes from any origin.

### Finding 5: OK's render-side sanitizer currently STRIPS iframe `src` URLs (defense-in-depth)

**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/markdown/mdast-to-html.ts:74-101`:

```ts
visit(tree, 'element', (node: Element) => {
  const tag = node.tagName.toLowerCase();
  // ...
  if (
    tag === 'img' ||
    tag === 'iframe' ||
    tag === 'script' ||
    tag === 'embed' ||
    tag === 'source' ||
    tag === 'audio' ||
    tag === 'video' ||
    tag === 'track'
  ) {
    const src = props.src;
    if (typeof src === 'string' && !isSafeUrl(src)) {
      delete props.src;
    }
  }
  // ...
});
```

Comment at lines 76-80:

> `href` lives on `<a>`, `<area>`, `<link>`, `<base>`. `src` lives on `<img>`, `<iframe>`, `<script>`, `<embed>`, `<source>`, `<audio>`, `<video>`, `<track>`. We don't emit `<form>` / `<iframe>` / `<script>` / `<embed>` from our pipeline — but defend anyway in case a custom handler ever passes them through.

`isSafeUrl` definition (line 60): only `http:`, `https:`, `mailto:`, `tel:`, `data:image/...` schemes pass; `javascript:` and similar are rejected.

**Implication:** if iframe is added as a descriptor, the existing sanitizer will already strip `javascript:` URLs from iframe `src` at the html-render boundary. The `<iframe>` tag itself is allowed to render — only dangerous URL schemes are removed. This matches MDN's R23 / NG4 storage-vs-render contract.

### Finding 6: There is no comment-strip for the iframe TAG itself in the current pipeline

**Confidence:** CONFIRMED
**Evidence:** `mdast-to-html.ts:128-131`:

```ts
const processor = unified()
  .use(remarkRehype, { handlers: customNodeHandlers })
  .use(rehypeSanitizeUrls)
  .use(rehypeStringify);
```

No `rehype-sanitize` is applied. `rehype-stringify` is invoked WITHOUT `allowDangerousHtml`, so any `raw` hast nodes (literal HTML passthrough) get dropped — but element-typed nodes pass through. The `mdxJsxFlowHandler` at line 137 emits a `<pre class="mdx-component">` fallback for any element that isn't in `HTML_PRIMITIVE_TAGS = {img, video, audio}` (line 66). **Today, an `<iframe>` JSX element in MDX would render as `<pre class="mdx-component">` source-code text — not a real iframe.** Adding iframe to `HTML_PRIMITIVE_TAGS` would change that to a real `<iframe>` element with the URL-scheme sanitizer running over its `src`.

### Finding 7: Default sandbox stances across major embed providers

**Confidence:** CONFIRMED
**Evidence:** D5 evidence + provider docs.

| Provider | Default sandbox | Default allow | Notes |
|---|---|---|---|
| YouTube | none | `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share` | Their copy-paste snippet does NOT use sandbox |
| Loom | none | `encrypted-media *;` | |
| Vimeo | none | `autoplay; fullscreen; picture-in-picture` | |
| Spotify | none | `autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture` | |
| Figma | none | (none) | Just `src` and dimensions |
| StackBlitz | none | (none) | |
| CodeSandbox | varies | `accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; vr; xr-spatial-tracking` | Sometimes ships sandbox tokens |

**No major provider ships sandbox by default in their copy-paste snippets.** The pattern is "trust the embed origin completely; rely on the browser's same-origin policy + CSP `frame-src`". This shapes our recommendation for descriptor defaults.

### Finding 8: Sandbox-by-default would break every major embed

**Confidence:** CONFIRMED
**Evidence:** D5 evidence shows YouTube specifically requires `allow-scripts allow-same-origin` to function. From [Thredded issue #314](https://github.com/thredded/thredded/issues/314): YouTube embeds break with `SecurityError` when sandboxed without `allow-same-origin`.

If OK's iframe descriptor sets a default sandbox like `sandbox="allow-scripts"`, YouTube and most other providers stop working. If we set `sandbox="allow-scripts allow-same-origin"`, sandboxing is essentially void (Finding 2).

**Practical conclusion:** the safe default is **no sandbox set**, identical to the major-provider defaults. Authors who want strict embedding (e.g., embedding untrusted user-supplied URLs) opt into sandbox manually via the descriptor's PropPanel.

---

## Industry pattern: docs editors don't sandbox by default

| Editor | Default sandbox | Source |
|---|---|---|
| Mintlify | none | [Mintlify image-embeds docs](https://mintlify.com/docs/content/image-embeds) — examples have no sandbox |
| Notion | n/a (delegated to Iframely) | Notion uses [Iframely](https://iframely.com/) which proxies and sometimes adds sandboxing |
| BlockNote | n/a (no iframe block) | [BlockNote embeds](https://www.blocknotejs.org/docs/features/blocks/embeds) — only File / Image / Video / Audio types |
| Astro Starlight | n/a (component-per-provider) | [astro-embed](https://astro-embed.netlify.app/) — each provider component sets its own |
| Docusaurus | none (raw iframe) | Authors hand-author iframes |

**Mintlify pattern (the closest 1P analogue):** raw `<iframe>` with `className`, `allowFullScreen`, `allow`, etc. No sandbox in any documented example. **This is the prevailing docs-platform default.**

---

## Recommendation for OK descriptor security defaults

1. **No default `sandbox`** — matches every major provider snippet and the prevailing docs-platform pattern.
2. **Expose `sandbox` as an advanced PropDef** so authors who want hardening can opt in.
3. **Render path is already defended** — `mdast-to-html.ts` URL-scheme sanitizer strips dangerous schemes regardless. Adding iframe to `HTML_PRIMITIVE_TAGS` activates the rest of the sanitizer chain for free.
4. **No URL allowlist at the descriptor level.** This is a deployment / CSP `frame-src` concern, not a content-format concern. Adding an allowlist locks the editor to a closed set of providers; YouTube + Loom + Figma is enough to start, but every additional provider becomes a code change.
5. **Document the YouTube embed pattern in showcase**, including the standard `allow="..."` and `allowFullScreen` invocation. This is what authors copy-paste in real life.

---

## Negative searches

- Searched OK source for any existing iframe sandbox enforcement or CSP `frame-src` policy. **NOT FOUND** in `packages/core` or `packages/server`. The deployment owns CSP; the descriptor framework owns content shape.
- Searched for `rehype-sanitize` in dependency tree — **NOT FOUND.** OK's render uses only the bespoke `rehypeSanitizeUrls` from `mdast-to-html.ts:70`. A future hardening pass might bring in `rehype-sanitize` for full schema validation.
