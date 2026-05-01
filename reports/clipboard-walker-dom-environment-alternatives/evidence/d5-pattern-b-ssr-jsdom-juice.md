# Evidence: D5 — Pattern B (SSR + jsdom + juice; react-email model)

**Dimension:** Build-time/SSR + jsdom + juice architecture for descriptor-shaped HTML emission
**Date:** 2026-05-01
**Sources:** `resend/react-email` source (commit `main`), `Automattic/juice` source (v11.1.1), `facebook/lexical` source, `TypeCellOS/BlockNote` source, `udecode/plate` source, prior report `tiptap-clipboard-round-trip-markdown/REPORT.md` §2/§3/§4 (2026-04-30 amendment)

---

## 1. Architectural premise

"Pattern B" in this dimension's framing is the canonical email-template architecture:

> Render React server-side → emit HTML with class names → load HTML+CSS into a Node DOM → walk the DOM applying CSS rules → write resolved declarations back as `style=""` → ship HTML string.

The mental model from generic email-template tooling (Maizzle, MJML build pipelines) suggests this requires:
- React SSR (`renderToStaticMarkup` / streaming)
- A Node-side DOM (jsdom or happy-dom) to "see" the rendered HTML and CSS
- juice (or Premailer) to walk that DOM applying CSS-via-cascade and writing inline styles

**Primary-source finding:** the modern react-email implementation does NOT match this textbook. It bypasses the DOM-walking step entirely and operates on the React tree + a CSS-tree AST. The textbook flow (jsdom + juice) IS one valid variant (B2), but it is not what the dominant email-React framework actually ships in 2026.

The rest of this evidence file documents what each variant actually does.

---

## 2. Variant B1 — react-email (the dominant React-based pipeline)

### 2.1 What runs where

| Phase | Where | Library | Function |
|---|---|---|---|
| Author | dev machine | React + `@react-email/components` + `<Tailwind>` wrapper | Authors `<Tailwind><Container>...</Container></Tailwind>` |
| First tree walk | Node, render time | `mapReactTree` (custom util in react-email) | Collect `className` strings from every React element; feed each to `tailwindSetup.addUtilities(classes)` |
| Tailwind compile | Node, render time | `tailwindcss@^4` exporting `compile(baseCss, opts)` | Generate CSS for the exact set of candidate utility classes (no scanning of source files; no PostCSS pipeline) |
| CSS parse | Node, render time | `css-tree` (`parse`) | Convert CSS string → AST (`StyleSheet`) |
| Per-class rule extraction | Node, render time | `extractRulesPerClass` (custom util in react-email) | Map each class → its inlinable Rule + identify non-inlinable rules (media queries, pseudo-classes) |
| CSS-variable resolution | Node, render time | `getCustomProperties` + `makeInlineStylesFor` (custom utils) | Substitute `var(--token)` → literal value |
| Second tree walk | Node, render time | `mapReactTree` | Clone every React element, inject resolved declarations into the `style={{}}` prop, drop the now-redundant class names |
| Style hoisting | Node, render time | `<style dangerouslySetInnerHTML>` | Non-inlinable rules (`@media`, `:hover`) hoisted to a `<style>` tag inserted into `<head>` |
| React → string | Node, render time | `renderToReadableStream` / `renderToPipeableStream` (React 18+) | Stream React → HTML string |
| Post-process | Node, render time | string ops (replace `\0`, prepend doctype, optional `prettier` format) | No DOM; no juice; no jsdom |

### 2.2 No jsdom; no juice; no DOM at all

Verified from primary source:

- [`packages/render/package.json` (resend/react-email main)](https://raw.githubusercontent.com/resend/react-email/main/packages/render/package.json) — runtime `dependencies`: `html-to-text`, `prettier`. **Not present in any dependency category at runtime: jsdom, happy-dom, cheerio, juice, linkedom.** (`jsdom: 26.1.0` appears only in `devDependencies` for testing.)
- [`packages/react-email/package.json`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/package.json) — runtime `dependencies`: includes `css-tree`, `tailwindcss`. **Same absence: no jsdom, no happy-dom, no cheerio, no juice.**
- [`packages/render/src/node/render.tsx`](https://raw.githubusercontent.com/resend/react-email/main/packages/render/src/node/render.tsx) — full render function reproduced below; no DOM is ever instantiated.

```typescript
// packages/render/src/node/render.tsx (literal source)
export const render = async (node: React.ReactNode, options?: Options) => {
  const reactDOMServer = await import('react-dom/server').then((m) => {
    if ('default' in m) return m.default;
    return m;
  });

  let html!: string;
  await new Promise<void>((resolve, reject) => {
    if (
      Object.hasOwn(reactDOMServer, 'renderToReadableStream') &&
      typeof WritableStream !== 'undefined'
    ) {
      const ErrorBoundary = createErrorBoundary(reject);
      reactDOMServer
        .renderToReadableStream(
          <ErrorBoundary><Suspense>{node}</Suspense></ErrorBoundary>,
          { progressiveChunkSize: Number.POSITIVE_INFINITY, onError(error) { reject(error); } },
        )
        .then(async (stream) => { await stream.allReady; return readStream(stream); })
        .then((result) => { html = result; resolve(); })
        .catch(reject);
    } else {
      // pipeable stream fallback (Node 16/early 18) — same idea
      const ErrorBoundary = createErrorBoundary(reject);
      const stream = reactDOMServer.renderToPipeableStream(/* … */);
    }
  });

  if (options?.plainText) return toPlainText(html, options.htmlToTextOptions);

  const doctype = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';
  const document = `${doctype}${html.replace(/<!DOCTYPE.*?>/, '')}`;
  if (options?.pretty) return pretty(document);
  return document;
};
```

The `pretty()` post-processor calls `prettier.format()` — pure string formatting, no DOM ([`packages/render/src/shared/utils/pretty.ts`](https://github.com/resend/react-email/blob/main/packages/render/src/shared/utils/pretty.ts)).

### 2.3 The Tailwind component — React-tree walk + css-tree AST

The `<Tailwind>` wrapper does the inlining work BEFORE React's `renderToStream` ever sees the tree. From [`packages/react-email/src/components/tailwind/tailwind.tsx`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/tailwind.tsx):

```tsx
export function Tailwind({ children, config }: TailwindProps) {
  const tailwindSetup = useSuspensedPromise(
    () => setupTailwind(config ?? {}),
    JSON.stringify(config, /* … */),
  );
  let classesUsed: string[] = [];

  // First tree walk: collect classes
  let mappedChildren: React.ReactNode = mapReactTree(children, (node) => {
    if (React.isValidElement<EmailElementProps>(node)) {
      if (node.props.className) {
        const classes = node.props.className?.split(/\s+/);
        classesUsed = [...classesUsed, ...classes];
        tailwindSetup.addUtilities(classes);
      }
    }
    return node;
  });

  const styleSheet = tailwindSetup.getStyleSheet();
  sanitizeStyleSheet(styleSheet);

  const { inlinable: inlinableRules, nonInlinable: nonInlinableRules } =
    extractRulesPerClass(styleSheet, classesUsed);
  const customProperties = getCustomProperties(styleSheet);

  // Build a non-inline stylesheet for media queries + pseudo-classes
  const nonInlineStyles: StyleSheet = {
    type: 'StyleSheet',
    children: new List<CssNode>().fromArray(Array.from(nonInlinableRules.values())),
  };
  sanitizeNonInlinableRules(nonInlineStyles);

  // Second tree walk: clone elements with resolved styles
  mappedChildren = mapReactTree(mappedChildren, (node) => {
    if (React.isValidElement<EmailElementProps>(node)) {
      const elementWithInlinedStyles = cloneElementWithInlinedStyles(
        node, inlinableRules, nonInlinableRules, customProperties,
      );
      // When we hit <head>, inject the non-inline <style> tag
      if (elementWithInlinedStyles.type === 'head') {
        const styleElement = (
          <style dangerouslySetInnerHTML={{ __html: generate(nonInlineStyles) }} />
        );
        return React.cloneElement(
          elementWithInlinedStyles, elementWithInlinedStyles.props,
          styleElement, elementWithInlinedStyles.props.children,
        );
      }
      return elementWithInlinedStyles;
    }
    return node;
  });

  // Throw if non-inlinable rules exist but no <head> was found
  if (hasNonInlineStylesToApply && !appliedNonInlineStyles) {
    throw new Error(/* "make sure you have a <head>" */);
  }

  return mappedChildren;
}
```

`cloneElementWithInlinedStyles` ([`utils/tailwindcss/clone-element-with-inlined-styles.ts`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/utils/tailwindcss/clone-element-with-inlined-styles.ts)) is per-element:

```typescript
export function cloneElementWithInlinedStyles(
  element: React.ReactElement<EmailElementProps>,
  inlinableRules: Map<string, Rule>,
  nonInlinableRules: Map<string, Rule>,
  customProperties: CustomProperties,
) {
  const propsToOverwrite: Partial<EmailElementProps> = {};
  if (element.props.className && !isComponent(element)) {
    const classes = element.props.className.trim().split(/\s+/);
    const residualClasses: string[] = [];
    const rules: Rule[] = [];
    for (const className of classes) {
      const rule = inlinableRules.get(className);
      if (rule) rules.push(rule);
      if (nonInlinableRules.has(className)) residualClasses.push(className);
      else if (!rule) residualClasses.push(className);
    }
    const styles = makeInlineStylesFor(rules, customProperties);
    propsToOverwrite.style = { ...styles, ...element.props.style };
    if (residualClasses.length > 0) {
      propsToOverwrite.className = residualClasses.map(/* sanitize */).join(' ');
    } else {
      propsToOverwrite.className = undefined;
    }
  }
  return React.cloneElement(element, { ...element.props, ...propsToOverwrite }, element.props.children);
}
```

### 2.4 The Tailwind compile — Node-only, called as a JS function

[`utils/tailwindcss/setup-tailwind.ts`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/utils/tailwindcss/setup-tailwind.ts):

```typescript
import { parse, type StyleSheet } from 'css-tree';
import { compile } from 'tailwindcss';
import indexCss from './tailwind-stylesheets/index.js';
import preflightCss from './tailwind-stylesheets/preflight.js';
import themeCss from './tailwind-stylesheets/theme.js';
import utilitiesCss from './tailwind-stylesheets/utilities.js';

export async function setupTailwind(config: TailwindConfig) {
  const baseCss = `
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@config;
`;
  const compiler = await compile(baseCss, {
    async loadModule(id, base, resourceHint) {
      if (resourceHint === 'config') return { path: id, base, module: config };
      throw new Error(`NO-OP: ${resourceHint}`);
    },
    polyfills: 0,
    async loadStylesheet(id, base) {
      if (id === 'tailwindcss') return { base, path: 'tailwindcss/index.css', content: indexCss };
      if (id === 'tailwindcss/preflight.css') return { base, path: id, content: preflightCss };
      if (id === 'tailwindcss/theme.css') return { base, path: id, content: themeCss };
      if (id === 'tailwindcss/utilities.css') return { base, path: id, content: utilitiesCss };
      throw new Error(`stylesheet not supported`);
    },
  });

  let css: string = baseCss;
  return {
    addUtilities: (candidates: string[]): void => { css = compiler.build(candidates); },
    getStyleSheet: () => parse(css) as StyleSheet,
  };
}
```

The four `tailwind-stylesheets/*.js` files inline the canonical CSS strings (preflight, theme, utilities) so the compiler doesn't need filesystem access — but the compiler is still the actual `tailwindcss` npm package.

### 2.5 No `getComputedStyle`, no cascade, no actual CSS engine

Crucially: react-email's inlining **does not run a CSS engine**. It cherry-picks "the rule for class X" out of the parsed stylesheet and assigns its declarations to elements that have class X. Specificity, the cascade, inheritance, pseudo-class resolution — all skipped. This works because:

1. Tailwind utility classes are single-purpose (one declaration per class, mostly), so cascade conflicts are rare.
2. The non-inlinable bucket catches anything that *would* require cascade resolution (media queries, `:hover`, `:focus`).
3. CSS variables get pre-resolved to literal values via `getCustomProperties` + `makeInlineStylesFor`.

This is a much simpler operation than what juice does (which DOES walk the cascade — see §3).

---

## 3. Variant B2 — Custom SSR + juice (the textbook flow)

### 3.1 What it actually requires

If you really want the textbook "render → DOM → juice → string" pipeline, this is what each step needs:

| Phase | Where | Library | Function |
|---|---|---|---|
| Render | Node | `react-dom/server` | `renderToStaticMarkup(<Component />)` returns HTML string |
| DOM load | Node | jsdom OR cheerio (juice's choice) OR happy-dom | Parse HTML+CSS into a queryable DOM-ish structure |
| CSS-via-cascade walk | Node | juice | Apply each rule to matching elements; resolve specificity; write resolved declarations to `style=""` |
| Serialize | Node | juice | Output the final HTML string |

**Key fact: juice uses cheerio, not jsdom.** Confirmed from primary source.

[`Automattic/juice/package.json`](https://raw.githubusercontent.com/Automattic/juice/master/package.json) — version `11.1.1`, runtime `dependencies`:

```
"cheerio": "1.0.0",
"commander": "^12.1.0",
"entities": "^7.0.0",
"mensch": "^0.3.4",
"slick": "^1.12.2",
"web-resource-inliner": "^8.0.0"
```

`main: "index.js"`, `browser: "client.js"` — meaning bundlers automatically substitute the browser entry point for `juice/client`.

[`Automattic/juice/lib/inline.js`](https://raw.githubusercontent.com/Automattic/juice/master/lib/inline.js) — operates on a cheerio document:

- `inlineDocument($, css, options)` — `$` is a cheerio root, `css` is a stylesheet string
- Calls `utils.parseCSS(css)` which uses `mensch` (NOT `css-tree`) for CSS parsing
- Selectors parsed by `slick`; matched against the cheerio tree via `$(sel)`
- Each matched element accumulates `el.styleProps`, tracking specificity + position; specificity-resolved styles eventually serialized to `style=""`

### 3.2 Why juice is a Node-DOM thing (not a real-DOM thing)

Cheerio is a Node-only HTML manipulation library — it implements jQuery-like API on top of `parse5`/`htmlparser2` HTML parsing, but does NOT implement CSSOM, layout, or any real CSS engine. juice's "cascade" is reimplemented by hand inside `lib/inline.js` (specificity tracked manually, pseudo-elements faked by spawning sibling `<span>` nodes).

**This means:**
- juice's "applies the cascade" is correct enough for the email use case (where CSS is small and explicit) but is a partial reimplementation of what `getComputedStyle` would compute on a real DOM.
- jsdom is NOT in juice's dependency tree at all.

### 3.3 Browser version (`juice/client`)

[`Automattic/juice/client.js`](https://raw.githubusercontent.com/Automattic/juice/master/client.js) — strips file-system dependencies. Exposes only:
- `juice(html, options)` — process an HTML string in-browser
- `juiceDocument($, options)` — apply inlining to an existing cheerio root
- `inlineDocument($, css, options)` — apply specific CSS to a cheerio root
- `inlineContent(html, css, options)` — process HTML+CSS strings

NOT exposed in the client bundle: `juiceFile`, `juiceResources`, `inlineExternal` (file-system or network-fetching variants).

The browser bundle still uses cheerio internally (cheerio is browser-bundleable because it doesn't actually need a real DOM — it's a virtual DOM-ish tree manipulator). README quote:

> "you can `require('juice/client')` via Browserify which has support for `juiceDocument`, `inlineDocument`, and `inlineContent`, but not `juiceFile`, `juiceResources`, or `inlineExternal`."

### 3.4 Adoption signals

- juice — npm `juice` package, ~1.69M weekly downloads as of 2026 ([`security.snyk.io/package/npm/juice`](https://security.snyk.io/package/npm/juice) cited via search). v11.1.1 published roughly 2026-Q1. Stable, maintained.
- `@react-email/render` — 15K+ weekly downloads (search-cited). v6.0.5 era as of 2026 main.
- `@react-email/tailwind` — 789K+ weekly downloads cited in the prior `tiptap-clipboard-round-trip-markdown/REPORT.md` (CodeSandbox stats).

---

## 4. Variant B3 — Build-time pre-rendered shells

The third variant (mentioned in the assignment): at app build time, run react-email-style render on each descriptor type (Callout-info, Callout-warning, …) to produce inline-styled HTML *templates* with placeholders for children. Ship the resulting map as a static JS module. At copy time, just splice user content into the precomputed shell.

| Phase | Where | Library | Function |
|---|---|---|---|
| Build-time | dev/CI | `@react-email/render` + `@react-email/tailwind` (or any of B1/B2) | Produce static HTML strings per descriptor type |
| Build artefact | TS module | — | `export const SHELLS: Record<DescriptorType, string> = { … }` |
| Copy-time | Browser | string templates | `const html = SHELLS[type].replace('{{children}}', userHtml)` |

**Properties of B3 (architectural facts):**
- Descriptor "chrome" (icon, palette, container) is fully resolved with inline styles at build time.
- Descriptor "content" (children) is templated in at copy time, so its style fidelity is whatever the live DOM provides for that subtree (or none, if children get plain HTML).
- Bundle cost at runtime: only the shell strings (~few KB per descriptor type), not Tailwind compiler / css-tree / juice.
- Drift class: when descriptor styling changes, the build artefact regenerates as part of the regular build — same drift class as any other build-derived asset.

This variant is essentially what the Obsidian "Copy as HTML" plugin does at a coarser grain (one stylesheet for the whole document, hardcoded as a TS string) — see `mvdkwast/obsidian-copy-as-html/main.ts` `DEFAULT_STYLESHEET`. The difference is that B3 narrows the scope to per-descriptor pre-rendered chrome, not a whole-document stylesheet.

---

## 5. Capability matrix: what Pattern B captures

| Property | B1 (react-email) | B2 (SSR + juice) | B3 (build-time shells) |
|---|---|---|---|
| Static descriptor shape (Callout chrome) | yes (full Tailwind class set resolved) | yes (full CSS-cascade applied) | yes (frozen at build time) |
| Per-descriptor variant (`<Callout type="info">` vs `"warning"`) | yes (each render call resolves classes for the actual props) | yes | yes (one shell per variant) |
| Fixed icons (`<svg>`) | yes (rendered into the React tree, then to HTML) | yes | yes |
| `children` prop composed at render time | yes (children are part of the React tree being rendered) | yes (children are part of the HTML being inlined) | partial — only if children are templated in as raw HTML, not as React |
| User-edited content (the actual document body) | requires PM doc → React tree converter | requires PM doc → React tree → HTML converter | shell carries chrome only; user content spliced as already-styled HTML from elsewhere |
| Live ProseMirror selection state | no — render-time view is a fresh tree | no | no |
| Activity-hidden subtree state | no — render-time has no concept of Activity | no | no |
| User's actual rendered DOM (visual fidelity to live editor) | indirect — depends on Tailwind config matching live theme | indirect — depends on supplied stylesheet matching live theme | indirect — same |
| Editor-specific behaviors (collab cursors, NodeView slots) | no | no | no |
| Pseudo-elements (`::before`, `::after`) | not without explicit handling | partial — juice fakes them as sibling spans | only if frozen into the shell |
| CSS variables (`var(--color-X)`) resolution | yes — `getCustomProperties` + `makeInlineStylesFor` resolve them | partial — juice substitutes only when `xmlMode: false` and the value is statically resolvable | resolved at build time |
| `oklch()` colors in resolved output | depends on Tailwind config — Tailwind v4 emits `oklch()` literally; OK's `convertCssColors` walker would still need to run downstream | same | same — frozen as `oklch()` unless the build also runs `convertCssColors` |

**The matrix makes the seam explicit:** Pattern B owns descriptor *chrome*. It does NOT own descriptor *content* (children) — that has to come from somewhere. For OK clipboard, "somewhere" is the live ProseMirror DOM, which has its own walker requirements. Pattern B is *complementary* to a content walker, not a replacement.

---

## 6. Why Pattern B works for emails — and what's different about clipboard

| Property | Email (react-email's home turf) | Clipboard (OK's problem) |
|---|---|---|
| When does render fire? | Once, at template compile or at outbound send time | Every Cmd+C, in the user's browser, sub-100ms budget |
| What's rendered? | The whole email — author-controlled top to bottom | A *slice* of an arbitrary live document, mixed user content + descriptors |
| Is content static? | Yes — once rendered, the HTML is shipped as bytes; no re-render | No — every copy is a different slice, often after live edits |
| Is the runtime Node? | Yes (Resend, SendGrid, mail-render servers) | No — browser, in the editor process |
| Bundle cost matters? | No — server-side, tens of MB OK | Yes — every byte ships to the editor; Cmd+C must be instant |
| Author controls children? | Yes — author writes the JSX | No — children are user-generated PM content |
| Does the author know the styling theme? | Yes — author wrote the theme | Yes — but the theme is *the live editor's running CSS*, not a Tailwind config the bundler can see |

The asymmetries are all in the same direction: emails are render-once-ship-bytes with full author control; clipboard is render-on-event with arbitrary content + tight latency budget + no Node runtime. Pattern B's costs (Tailwind compiler, css-tree AST, second React tree walk) are amortized over millions of recipients per email render. They're paid per-Cmd+C in clipboard.

---

## 7. Architectural feasibility for OK clipboard (factual; no recommendation)

To call `renderToStaticMarkup(<Callout type={t}>{...children})` at copy time, OK would need:

### 7.1 The pieces

1. **A copy-time React component for each descriptor.** OK already has these (the live editor's NodeView components). The render-time ones might or might not be reusable — typed-component-nodes per the user's MEMORY note plus React 19.2 `<Activity>` interactions complicate reuse.
2. **A children adapter: PM doc fragment → React tree.** The descriptor's `children` are TipTap/PM content. To pass them as `children` props, OK would need a PM-fragment → React-element-tree converter. Lexical solves this on the import direction (`$generateNodesFromDOM`), but the OK direction is PM → React, with all the marks, NodeViews, and inline content shapes preserved.
3. **A render entry point.** `renderToStaticMarkup` from `react-dom/server`. Browser-bundleable — `react-dom/server.browser` is a documented entry point. Cost: extra React server bundle (`react-dom/server` is roughly 80–120 KB minified depending on version; React 19 server entry has dropped some of the legacy server APIs).
4. **The styling resolution layer.** Three sub-options:
   - **B1-in-browser:** Bundle Tailwind v4 `compile()` + css-tree + react-email's tree-walk into the editor. Per the prior `tiptap-clipboard-round-trip-markdown/REPORT.md` §5, `jit-browser-tailwindcss` (Tailwind v3) is 246 KB minified / 74 KB gzipped; v4 `compile()` is undocumented in-browser; Twind is maintenance-stalled. css-tree itself is ~120 KB minified.
   - **B2-in-browser:** Bundle `juice/client` + supply the active Tailwind-output CSS as a string. Per the prior report, this requires reading all `document.styleSheets` and serializing them to text first, since Tailwind v4's runtime CSS lives as the live `<style>` element / CSS file. juice/client minified bundle is ~150 KB minified+gzipped per the prior report's juice notes.
   - **B3-precomputed:** Run the render at app build time per descriptor type; ship the resulting inline-styled shells as a static map. Bundle cost is just the shells' bytes. But B3 doesn't accept arbitrary children — it accepts placeholders.

### 7.2 The integration points

- **Where it hooks into PM clipboard:** `clipboardSerializer` slot or `transformCopied` (per [`prosemirror-view/src/clipboard.ts`](https://github.com/ProseMirror/prosemirror-view/blob/master/src/clipboard.ts), reproduced in §1 of the prior report).
- **What it returns to PM:** an HTML string (eventually wrapped in DataTransfer's `text/html`). PM expects a fragment/Slice; the SSR-rendered HTML would have to be re-parsed if PM-internal copy is also a goal, OR the clipboard-write path bypasses PM serialization entirely and writes to `clipboardData.setData('text/html', staticHtml)` directly.
- **Latency budget:** copy events are user-perceptible if they exceed roughly 50–100 ms wall-clock (Paul Irish's "user perception of input latency"). For a Callout selection of ~5 elements, B1's pipeline runs (a) two React tree walks, (b) a Tailwind compile, (c) a css-tree parse, (d) a children walk and clone — likely tens of ms in-browser if the pipeline is warmed; potentially 100+ ms cold.

### 7.3 What the integration looks like (sketch)

```typescript
// In editor props:
clipboardSerializer: createSSRSerializer(view, descriptorRegistry);

function createSSRSerializer(view, registry): DOMSerializer {
  const baseSerializer = DOMSerializer.fromSchema(view.state.schema);
  return {
    serializeFragment(fragment, options) {
      // Convert PM fragment → React tree
      const reactTree = pmFragmentToReact(fragment, registry);
      // Render to HTML (the render call internally walks classes → inline styles)
      const html = renderToStaticMarkupWithTailwind(reactTree);
      // Parse HTML back into a detached DOM for PM's wrap.appendChild contract
      const detached = options.document.createElement('div');
      detached.innerHTML = html;
      return detached;
    }
  };
}
```

Note `renderToStaticMarkupWithTailwind` is a hypothetical wrapper that does what `<Tailwind>` does — there's no single npm export of this today; the real `<Tailwind>` is wrapped around the children at React-tree construction time, not at render time as a post-process.

### 7.4 The "children" question

If OK passes user content as already-styled HTML (e.g. via the live-DOM walker for the user content, then SSR for the descriptor chrome only), the architecture degenerates to B3 with extra steps — the SSR pipeline only adds value over B3 in that the *same* per-descriptor render call resolves variant props (`type="info"`) at copy time instead of at build time. For descriptors where the variant set is small and known at build time (Callout has ~5 types), B3 is strictly cheaper.

If OK passes user content as React (PM → React adapter), then the SSR pipeline owns end-to-end styling — but now OK has to maintain a PM-to-React converter that handles every node type, every mark, every NodeView, AND keeps it in sync with the live editor's React components. This is a substantial engineering surface that does not exist in any peer editor surveyed.

---

## 8. Peer editor precedents

| Editor | Copy-as-HTML produces | Where rendering runs | Style strategy | Uses Pattern B? |
|---|---|---|---|---|
| **Lexical (Meta)** ([`packages/lexical-html/src/index.ts`](https://github.com/facebook/lexical/blob/main/packages/lexical-html/src/index.ts), [`packages/lexical-clipboard/src/clipboard.ts`](https://github.com/facebook/lexical/blob/main/packages/lexical-clipboard/src/clipboard.ts)) | `text/html` via `$generateHtmlFromNodes` → each node's `exportDOM()` returns an HTMLElement; `container.innerHTML` extracted | Browser, copy time. Uses `document.createElement('div')` (REAL DOM, detached) | **Inline styles set explicitly per-node by author of the node class.** No automatic computed-style capture. No CSS-inliner. | No. The "import direction" function `inlineStylesFromStyleSheets(doc)` walks `doc.styleSheets` and applies rules to inline styles — but this is for paste handling (e.g. Excel imports), NOT for copy. |
| **BlockNote (TypeCellOS)** ([`packages/core/src/api/exporters/html/util/serializeBlocksExternalHTML.ts`](https://github.com/TypeCellOS/BlockNote/blob/main/packages/core/src/api/exporters/html/util/serializeBlocksExternalHTML.ts), [`externalHTMLExporter.ts`](https://github.com/TypeCellOS/BlockNote/blob/main/packages/core/src/api/exporters/html/externalHTMLExporter.ts)) | `text/html` via `toExternalHTML` per-block → `document.createElement` + ProseMirror's `DOMSerializer.serializeFragment` | Browser, copy time. Uses real document fragments (`doc.createDocumentFragment()`, `doc.createElement(listType)`) | Author-defined inline `style={{}}` props on the React component returned from `toExternalHTML`. **Filters out BlockNote-specific classes (`bn-` prefix)** before emitting. No CSS-inliner. | No. |
| **Plate (Slate)** ([`platejs.org/docs/html`](https://platejs.org/docs/html), [`packages/juice`](https://github.com/udecode/plate/tree/main/packages/juice)) | `text/html` via `serializeHtml` (server-side, with `PlateStatic` static components) | Server-side rendering | **Mostly class names.** Default behavior strips classes except `slate-*` and `line-clamp` prefixes. Documentation explicitly says: "you must ensure the necessary CSS is available in the final context where the HTML will be displayed." | **Plate has a `@platejs/juice` package, BUT it is hooked into the PASTE/PARSER direction**, not export. Source: [`packages/juice/src/lib/JuicePlugin.ts`](https://raw.githubusercontent.com/udecode/plate/main/packages/juice/src/lib/JuicePlugin.ts) — `inject.plugins[KEYS.html].parser.transformData` runs `juice(newData)` on incoming HTML before parse, to handle malformed `<style>` tags from Word/Outlook pastes. NOT a copy-as-styled-HTML feature. |
| **Notion** | Class-tagged HTML + cooperative `text/markdown` MIME | Browser, copy time (proprietary stack) | Empirical clipboard inspection (per prior `tiptap-clipboard-round-trip-markdown/REPORT.md` §4): writes class-tagged HTML with a synthesized `<style>` block. **Destinations that strip `<style>` get a degraded render.** | No (uses `<style>` block, not Pattern B inline-style emission). |
| **Obsidian "Copy as HTML" plugin** ([`mvdkwast/obsidian-copy-as-html`](https://github.com/mvdkwast/obsidian-copy-as-html)) | Whole `<html>` document with inline `<style>` block carrying a hand-curated stylesheet (literal `DEFAULT_STYLESHEET` constant in `main.ts`) | Browser, copy time (Electron) | **Hardcoded TS string** — pure double-maintenance. Author chose this because Obsidian's theme system is too dynamic to query at copy time. | Conceptually closest to B3 (hardcoded shell at "build" time = source-code time). |

**Cross-cutting finding:** No surveyed live editor uses Pattern B (SSR + jsdom + juice or its react-email variant) for their COPY direction. The Lexical/BlockNote pattern is "real DOM at copy time + author-written inline styles in `exportDOM`/`toExternalHTML`". The Plate pattern is "ship classes; let the destination handle CSS". Pattern B is purely an *email-template* / *static-HTML-export* idiom in 2026, not a live-editor copy idiom.

The reasons Pattern B doesn't appear in editors:
- Editors run client-side; Pattern B runs server-side (Node).
- Live editors HAVE a running DOM with resolved styles already; they don't need a synthetic Node-DOM.
- `react-dom/server` + Tailwind compile + css-tree is heavy bundle ballast for a Cmd+C feature.

---

## 9. What runs where (consolidated)

| Library | Runtime | DOM model | Used in |
|---|---|---|---|
| `@react-email/render` | Node (any modern: Node 18+, Edge, Bun) | None — operates on React tree + string | B1 |
| `@react-email/tailwind` (Tailwind component) | Node (peer-dep `tailwindcss@^4.1.12`, `css-tree`) | None — operates on React tree + css-tree AST | B1 |
| `tailwindcss` v4 `compile()` | Node | None (text in, text out) | B1 |
| `css-tree` | Anywhere (Node + browser) | None — CSS AST | B1 |
| juice | Node primarily | cheerio (Node DOM-ish) | B2 |
| juice/client | Browser | cheerio (works in-browser via Browserify shim) | B2 in-browser |
| jsdom | Node | Spec-aiming DOM with partial CSSOM, `getComputedStyle` partial | (NOT used by react-email runtime; would be relevant if you wired your own SSR + jsdom + juice from scratch) |
| `react-dom/server` | Node + browser (`/server.browser` entry) | None — emits HTML string | B1, B2 |
| `prettier` | Node | None | B1 (optional pretty-print) |

---

## 10. Findings

### Finding 1: react-email runs Tailwind compile() at React-tree-walk time, NOT at HTML-string time, and uses NO DOM library at runtime

**Confidence:** High.
**Evidence:**
- [`packages/react-email/src/components/tailwind/tailwind.tsx`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/tailwind.tsx) — `mapReactTree` is invoked twice INSIDE the React component tree, before `renderToStream` is called.
- [`packages/render/src/node/render.tsx`](https://raw.githubusercontent.com/resend/react-email/main/packages/render/src/node/render.tsx) — `renderToReadableStream` / `renderToPipeableStream` produce HTML; the post-process is just doctype injection + optional `prettier` formatting.
- [`packages/render/package.json`](https://raw.githubusercontent.com/resend/react-email/main/packages/render/package.json) and [`packages/react-email/package.json`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/package.json) — neither has jsdom, happy-dom, cheerio, juice in runtime dependencies.

**Implications for the dimension:** the assignment's "render → HTML → load HTML+CSS into jsdom → walk DOM → juice-inline" mental model is the textbook variant (B2), not what the dominant React email framework actually does (B1). A clean B1 implementation has zero DOM-ever-instantiated.

### Finding 2: react-email's "inlining" is per-class rule extraction + AST clone, not a CSS engine

**Confidence:** High.
**Evidence:**
- [`utils/tailwindcss/clone-element-with-inlined-styles.ts`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/utils/tailwindcss/clone-element-with-inlined-styles.ts) — for each element with classes, look up each class's Rule in `inlinableRules`, accumulate `Rule[]`, call `makeInlineStylesFor(rules, customProperties)` to flatten declarations into a `style` object.
- The non-inlinable bucket (`extractRulesPerClass` returns `nonInlinable`) catches media queries / pseudo-classes — these are hoisted to a `<style>` tag in `<head>`, NOT inlined.

**Implications:** No specificity resolution beyond "first matching class wins per declaration". No inheritance walk. No actual cascade. This is a much simpler operation than what juice does — and works because Tailwind utility classes are atomic (one declaration per class).

### Finding 3: juice uses cheerio, not jsdom; cheerio is a Node DOM-ish layer with no real CSSOM

**Confidence:** High.
**Evidence:**
- [`Automattic/juice/package.json`](https://raw.githubusercontent.com/Automattic/juice/master/package.json) — `cheerio: 1.0.0` is the dependency; jsdom is not present.
- [`Automattic/juice/lib/inline.js`](https://raw.githubusercontent.com/Automattic/juice/master/lib/inline.js) — `inlineDocument($, css, options)` operates on a cheerio root `$`; CSS parsed by `mensch`; selectors parsed by `slick`; specificity tracked manually.

**Implications:** The "use jsdom for the SSR + juice flow" framing is conceptually right (you need *some* Node DOM-ish layer) but mechanically wrong (juice already has its own — cheerio — and doesn't ask for jsdom). If a hypothetical SSR + jsdom + juice pipeline were built, jsdom would only be needed if some OTHER step (post-juice DOM manipulation, e.g. screenshot capture) required it.

### Finding 4: Plate's `@platejs/juice` is a paste/import plugin, NOT a copy/export plugin

**Confidence:** High.
**Evidence:** [`packages/juice/src/lib/JuicePlugin.ts`](https://raw.githubusercontent.com/udecode/plate/main/packages/juice/src/lib/JuicePlugin.ts) — wires juice into `inject.plugins[KEYS.html].parser.transformData`, which is the parser/import side. The transform pre-processes incoming HTML (e.g. malformed `<style>` blocks from Word/Outlook) before Plate's HTML parser sees it. Plate's HTML EXPORT (`serializeHtml`) does no automatic style inlining.

**Implications:** Plate is sometimes cited as "an editor that uses juice" — this is technically true but the direction is opposite to what Pattern B implies. Plate's export still requires the destination to bring its own CSS.

### Finding 5: No surveyed live editor uses Pattern B for the copy direction

**Confidence:** High.
**Evidence:** §8 matrix; primary sources for Lexical (`exportDOM`-author-written), BlockNote (`toExternalHTML`-author-written), Plate (class-pass-through), Obsidian Copy-as-HTML (hardcoded stylesheet). All run client-side at copy time using a real DOM (`document.createElement`) or the live editor DOM directly.

**Implications:** Pattern B is an email-template idiom, not a live-editor idiom in 2026. The reasons are structural: editors run client-side and have a live DOM; email-template tooling runs server-side and has neither. Adopting Pattern B for clipboard means importing a server-side architecture into a client-side runtime budget.

### Finding 6: B1-in-browser bundle cost is dominated by Tailwind compile + css-tree + react-dom/server

**Confidence:** Medium (component-by-component sizing requires a build experiment to confirm).
**Evidence:**
- Prior `tiptap-clipboard-round-trip-markdown/REPORT.md` §5 — `jit-browser-tailwindcss` is 246 KB minified / 74 KB gzipped; Tailwind v4 `compile()` is in a similar order of magnitude with undocumented browser-bundleability.
- `css-tree` source — full library is around 100–150 KB minified depending on tree-shake. `parse` + `generate` are the largest exports.
- `react-dom/server` browser entry point — on the order of 80–120 KB minified for React 19.
- juice/client — around 150 KB minified + gzipped (per prior report).

A round number for B1-in-browser: at least 300 KB of compiler/parser/server-React net of overlap, plus the pre-existing react-dom client bundle. For a feature that fires on Cmd+C, this is large.

### Finding 7: B3 (build-time pre-rendered shells) collapses to "Pattern Y on steroids"

**Confidence:** High.
**Evidence:** §4 — at build time, run B1 once per descriptor variant; ship the resulting inline-styled HTML strings as a static TS module map. Runtime cost is only the static map's bytes plus a string-template splice.

**Implications:** The architectural ceiling for B3 is the same as the architectural ceiling for hand-authored shared-style-token modules (the prior report's "Pattern Y") — the difference is who/what produces the shells (a build pipeline vs. a human). Either way, the artefact is a static map and the runtime is "splice user content into the right shell".

---

## 11. Gaps / follow-ups

- **Bundle-size confirmation for B1-in-browser:** the numbers in Finding 6 are inferred from prior-report citations and library-source intuition. A concrete build experiment (`@react-email/render` + `@react-email/tailwind` + `tailwindcss@^4` bundled via Vite/esbuild for the browser, with tree-shake) would give a real number.
- **Latency profile for B1-in-browser:** would require a benchmark — render a `<Callout>` with ~20 children inside `<Tailwind>` in browser vs. Node.
- **PM-fragment → React-tree adapter:** no peer editor surveyed has this exact converter. Lexical has the inverse (`$generateNodesFromDOM`, HTML → Lexical), but PM → React for an arbitrary slice including marks + NodeViews + nested descriptors is novel surface.
- **`renderToStaticMarkup` vs. `renderToString` vs. `renderToReadableStream` choice in browser:** react-email's runtime uses streaming variants (`renderToReadableStream` / `renderToPipeableStream`); for a clipboard-event use case, the synchronous-ish `renderToStaticMarkup` is more appropriate but not what react-email ships. Would require a separate render-entry choice.
- **CC-style coalescing for Cmd+C burst:** if the user does Cmd+C twice in 100ms, do we re-render? react-email assumes one render per email; OK would need to short-circuit re-renders within a single event loop iteration if PM dispatches multiple copy attempts.
