# Evidence: React intrinsic types & attribute conventions for iframe

**Dimension:** D4 — React intrinsic types & attribute conventions
**Date:** 2026-04-28
**Source:** `node_modules/@types/react@19.2.14/index.d.ts`

---

## Key citation

`node_modules/@types/react/index.d.ts:3140-3161`:

```ts
interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
    allow?: string | undefined;
    allowFullScreen?: boolean | undefined;
    allowTransparency?: boolean | undefined;
    /** @deprecated */
    frameBorder?: number | string | undefined;
    height?: number | string | undefined;
    loading?: "eager" | "lazy" | undefined;
    /** @deprecated */
    marginHeight?: number | undefined;
    /** @deprecated */
    marginWidth?: number | undefined;
    name?: string | undefined;
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
    sandbox?: string | undefined;
    /** @deprecated */
    scrolling?: string | undefined;
    seamless?: boolean | undefined;
    src?: string | undefined;
    srcDoc?: string | undefined;
    width?: number | string | undefined;
}
```

Cross-link: `index.d.ts:3000-3010` defines `HTMLAttributeReferrerPolicy`:

```ts
type HTMLAttributeReferrerPolicy =
    | ""
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url";
```

JSX intrinsic registration at `index.d.ts:4223`:

```ts
iframe: React.DetailedHTMLProps<React.IframeHTMLAttributes<HTMLIFrameElement>, HTMLIFrameElement>;
```

---

## Findings

### Finding 1: 16 props in `IframeHTMLAttributes` total. 5 are explicitly @deprecated

**Confidence:** CONFIRMED
**Evidence:** lines 3140-3161 above.

| Prop | TS type | Status | Notes |
|---|---|---|---|
| `allow` | `string` | active | Permissions Policy directives, semicolon-separated |
| `allowFullScreen` | `boolean` | active (camelCase) | HTML attr is `allowfullscreen` (lowercase) |
| `allowTransparency` | `boolean` | active (legacy IE-era) | Rarely used; documented in MDN as legacy |
| `frameBorder` | `number \| string` | **@deprecated** | Use CSS `border` instead |
| `height` | `number \| string` | active | |
| `loading` | `"eager" \| "lazy"` | active | Native lazy-loading hint |
| `marginHeight` | `number` | **@deprecated** | |
| `marginWidth` | `number` | **@deprecated** | |
| `name` | `string` | active | Targetable browsing-context name |
| `referrerPolicy` | `HTMLAttributeReferrerPolicy` (9-value enum) | active (camelCase) | HTML attr is `referrerpolicy` |
| `sandbox` | `string` | active | Space-separated tokens (sandbox values) |
| `scrolling` | `string` | **@deprecated** | |
| `seamless` | `boolean` | active (rarely used) | Removed from HTML spec but still in @types/react |
| `src` | `string` | active | The actual embed URL |
| `srcDoc` | `string` | active (camelCase) | HTML attr is `srcdoc`. Inline HTML override of `src` |
| `width` | `number \| string` | active | |

**Inherited from `HTMLAttributes<T>`:** `id`, `className`, `style`, `title`, `lang`, `dir`, plus all the `aria-*` and `data-*` shapes. These are not iframe-specific.

### Finding 2: Three attrs whose React camelCase diverges from HTML lowercase

**Confidence:** CONFIRMED
**Evidence:** `IframeHTMLAttributes` field names compared to MDN `<iframe>` spec (D2 evidence):

| OK descriptor (HTML lowercase, by 1P precedent) | React JSX (camelCase) | HTML attribute (on-disk) |
|---|---|---|
| `allowfullscreen` (deprecated; prefer `allow="fullscreen"`) | `allowFullScreen` | `allowfullscreen` |
| `referrerpolicy` | `referrerPolicy` | `referrerpolicy` |
| `srcdoc` | `srcDoc` | `srcdoc` |
| `frameborder` (deprecated; prefer CSS) | `frameBorder` | `frameborder` |
| `marginheight` (deprecated) | `marginHeight` | `marginheight` |
| `marginwidth` (deprecated) | `marginWidth` | `marginwidth` |

The 1P precedent in `built-ins.ts:120-152` JSDoc establishes:

> HTML-attr lowercase names — `autoplay` (not `autoPlay`), `playsinline` (not `playsInline`), `fetchpriority`, `crossorigin`, `referrerpolicy`. The descriptor `name` is the source-form attribute spelling that gets emitted by `emitMdxJsx`, so storing lowercase makes the rendered MDX match the HTML spec exactly. The React media components translate to camelCase at the JSX boundary (where TypeScript's `JSX.IntrinsicElements` types require it).

For iframe, that means descriptor PropDef `name` values should be lowercase: `src`, `srcdoc`, `width`, `height`, `allow`, `sandbox`, `referrerpolicy`, `loading`, `name`, `title`. The renderer (`Iframe.tsx`) translates to `srcDoc`, `referrerPolicy` at the JSX boundary.

### Finding 3: `IframeHTMLAttributes` does NOT include `csp` or `credentialless`

**Confidence:** CONFIRMED
**Evidence:** Searched lines 3140-3161 above; neither attribute appears.

MDN documents `csp` and `credentialless` (D2 evidence) as iframe attributes, but `@types/react@19.2.14` lags behind. Authors who set them get a TypeScript error. **Practical consequence:** if the OK descriptor exposes `csp` or `credentialless`, the React component will need a cast (`{...{csp: '...'} as IframeHTMLAttributes<HTMLIFrameElement>}`) to compile, OR the component can omit them from the JSX boundary and accept that they won't reach the rendered DOM until @types/react adds them. Recommendation: omit from the descriptor for now and revisit when @types/react catches up.

### Finding 4: HTML-spec status of `allowfullscreen`

**Confidence:** CONFIRMED
**Evidence:** D2 evidence (MDN iframe page) marks `allowfullscreen` as **legacy** (kept for backward compatibility, not deprecated for removal):

> | `allowfullscreen` | Legacy | Use `allow="fullscreen *"` instead |

@types/react keeps `allowFullScreen` as a non-deprecated `boolean`. For descriptor design, this means we have two valid choices:

(a) Expose `allowfullscreen` (HTML lowercase) as a `boolean` PropDef alongside `allow`. Authors who paste YouTube embed snippets (which use `allowFullScreen` / `allowfullscreen`) keep their content working.

(b) Drop `allowfullscreen` and require `allow="fullscreen"` instead. More forward-looking, but breaks paste-from-real-world-iframe ergonomics.

The 1P pattern (`built-ins.ts` audio/video shapes) is to expose the HTML-spec common props even when there's a more modern alternative — `controls`, `autoplay`, `loop` all coexist with the `controls` shadow that comes from React. By analogy, **expose both `allow` AND `allowfullscreen`** for iframe.

### Finding 5: `sandbox` is `string`, not a discriminated union

**Confidence:** CONFIRMED
**Evidence:** Line 3154: `sandbox?: string | undefined;`

`@types/react` does not type-check sandbox tokens. Authors can write `sandbox="allow-banana"` without TypeScript complaining. The descriptor framework's `PropDef` system supports `type: 'enum'` but `sandbox` is a multi-token-bag, not a single-value enum — encoding it as enum would be incorrect.

**Implication:** the `sandbox` PropDef must be `type: 'string'`, with documentation that lists the valid tokens. Validation (rejecting invalid tokens) is out of scope at the descriptor level — this matches how React itself handles it. Validation can move to a render-time concern if needed.

### Finding 6: `srcDoc` and `src` are mutually exclusive in HTML semantics but both typed as optional `string` in React

**Confidence:** CONFIRMED
**Evidence:** Line 3158-3159; both `src` and `srcDoc` are independent optional fields. MDN states "`srcdoc` overrides `src` if both are present". The descriptor framework doesn't have first-class mutual-exclusion support, so authors can supply both — the browser will use `srcdoc`.

`srcdoc` in markdown content is rare (it'd require embedding a full HTML document inside an attribute string, with all the `<` characters needing escape). Most authors will only use `src`.

**Recommendation:** Make `src` required, `srcdoc` optional (advanced). Mirror the img/video/audio precedent of `src: required`.

---

## Recommended PropDef shape (synthesizing findings)

Based on findings 2-6 and the `built-ins.ts` precedent for img/video/audio:

| Tier | PropDef name (lowercase) | type | required | default | notes |
|---|---|---|---|---|---|
| common | `src` | `string` | true | — | The embed URL. autoFocus on insert. |
| common | `title` | `string` | false | — | A11y label (MDN strongly recommends this) |
| common | `width` | `number` | false | — | |
| common | `height` | `number` | false | — | |
| common | `allow` | `string` | false | — | Permissions Policy directives |
| advanced | `sandbox` | `string` | false | — | space-separated `allow-*` tokens |
| advanced | `referrerpolicy` | `enum` (9 values) | false | — | matches `HTMLAttributeReferrerPolicy` |
| advanced | `loading` | `enum` (`eager`/`lazy`) | false | — | |
| advanced | `name` | `string` | false | — | Targetable name |
| advanced | `srcdoc` | `string` | false | — | Inline HTML override (rare) |
| advanced | `allowfullscreen` | `boolean` | false | — | Legacy but ubiquitous in real-world iframes |

Deprecated attrs intentionally omitted: `frameBorder`, `marginHeight`, `marginWidth`, `scrolling`, `allowTransparency`. Anything authors paste with these still parses correctly and round-trips byte-identically through `mdxJsxFlowElement.attributes`; the descriptor just doesn't surface them in the PropPanel.

---

## Negative searches

- Searched `index.d.ts` for `csp:` and `credentialless:` — **NOT FOUND.** @types/react@19.2.14 does not yet include these MDN-documented attrs.
- Searched for `IframeHTMLAttributes` extending anything beyond `HTMLAttributes<T>` — does not. No iframe-specific common parent.
