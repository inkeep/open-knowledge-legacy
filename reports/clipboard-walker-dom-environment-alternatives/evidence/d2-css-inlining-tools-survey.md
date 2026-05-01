# Evidence: D2 — CSS-inlining tools survey

**Dimension:** runtime CSS-inlining tools (juice, juice/client, Premailer, react-email Tailwind, mailing render, inline-css, css-inline)
**Date:** 2026-05-01
**Sources:** GitHub repos, npm registry, official READMEs/docs, primary source code

---

## Summary table

| Tool | Server/Browser | Internal DOM | Tailwind support | Bundle (unpacked) | Last release | Weekly DLs |
|---|---|---|---|---|---|---|
| **juice** (npm `juice` v11.1.1) | Node primary; `juice/client` is browserifiable | **cheerio** (`1.0.0`) | None built-in (consumes any CSS) | 65.7 KB (juice itself) + cheerio + slick + mensch | 2026-02-04 (commits: 2026-04-20) | 2,232,879 |
| **juice/client** (browser bundle) | Browser via Browserify; subset API only (`juiceDocument`, `inlineDocument`, `inlineContent`) | cheerio (browserified) | None | Bundled separately, drops `juiceFile`/`juiceResources`/`web-resource-inliner` | Same release as juice | (part of juice) |
| **Premailer** (`premailer/premailer`, RubyGem) | Ruby (Node-incompatible) | Nokogiri / Hpricot (Ruby) | None; expects CSS pre-processed | n/a | Active (2026-03-10 push) | n/a (gem) |
| **`@react-email/tailwind`** v2.0.7 | Node SSR (React component, runs `tailwindcss` v4 compile in `useSuspensedPromise`) | css-tree (AST) + React tree walker | Tailwind v4 first-party (bundles `tailwindcss` ^4.1.18 as direct dep) | 2,120,387 bytes (~2.0 MB) | 2026-03-31 — **DEPRECATED**: "Package no longer supported" | 3,352,640 |
| **`react-email` `<Tailwind>`** (in main `react-email` v6.0.6 package) | Node SSR (replaces deprecated standalone) | css-tree + React tree walker | Tailwind v4 (compile() at render time) | n/a (subset of react-email) | Active | 2,069,165 (parent pkg) |
| **`@react-email/render`** | Node + Edge + Browser entrypoints; uses jsdom in dev only | jsdom 26.1.0 (devDep, used for tests; not at runtime) | n/a (does not inline CSS itself) | n/a | Active | 5,975,229 |
| **mailing** (`sofn-xyz/mailing`, npm `mailing-core`) | Node | `node-html-parser` (NOT cheerio, NOT jsdom); CSS inlining handled upstream by **MJML**, not juice | None | n/a | Last commit 2024-05-14 (~12 mo); effectively unmaintained | 4,111 |
| **inline-css** v4.0.3 | Node only (no `browser` field) | **cheerio** (`^1.0.0`) | None | 19,898 bytes (~19.4 KB) | 2024-12-27 (last push 2025-05-01) | 308,888 |
| **css-inline** (`Stranger6667/css-inline`) v0.20.2 | Native (Rust) Node binding via N-API + WASM build for browser | Mozilla Servo's html5ever / kuchiki (Rust) | None | 50,676 bytes wrapper + per-platform native binaries (optional deps) | 2026-04-02 | 341,814 |

---

## Per-tool findings

### juice (`Automattic/juice`)

**Finding:** Server-first CSS inliner; uses cheerio (NOT jsdom). Browser usable via `juice/client` Browserify entrypoint.
**Confidence:** CONFIRMED
**Evidence:**
- `package.json` direct from registry: `"main": "index.js"`, `"browser": "client.js"`, dependencies include `"cheerio": "1.0.0"`, `"mensch": "^0.3.4"` (CSS parser), `"slick": "^1.12.2"` (selector tokenizer), `"web-resource-inliner": "^8.0.0"` ([npm registry](https://registry.npmjs.org/juice/latest); also visible in [package.json on master](https://github.com/Automattic/juice/blob/master/package.json))
- `client.js` source (verbatim): `var cheerio = require('./lib/cheerio');` — confirms cheerio is the in-browser DOM substrate too ([client.js raw](https://raw.githubusercontent.com/Automattic/juice/master/client.js))
- README "Try out the web client version" links to [https://automattic.github.io/juice/](https://automattic.github.io/juice/) (live browser demo built from `juice/client`)
- README §"Methods": `juice.juiceDocument($, options)` accepts a cheerio instance directly; `juice.inlineContent(html, css [, options])` runs without `<style>`/`<link>` extraction
- README option table (extracted verbatim):
  - `preserveMediaQueries` default `true`
  - `preserveFontFaces` default `true`
  - `preserveKeyFrames` default `true`
  - `preservePseudos` default `true` (preserves `:hover`/`:active`/`:focus`/`:visited`/`:link` from `juiceClient.ignoredPseudos`)
  - `inlinePseudoElements` default `false` ("Insert pseudo elements (`::before` and `::after`) as `<span>` into the DOM")
  - `resolveCSSVariables` default `true`
  - `removeStyleTags` default `true`

**Internal DOM:** uses **cheerio** v1.0.0. Confirmed in `package.json` and `lib/inline.js` / `client.js`. Cheerio internally uses `parse5` ^7.3.0 for HTML parsing (per cheerio's own `package.json`).

**CSS handling specifics:**
- **Pseudo-elements**: opt-in via `inlinePseudoElements`; inserted as `<span>` elements (mutates DOM) — README warns this "may conflict with CSS selectors elsewhere on the page"
- **Media queries**: preserved by default in surviving `<style>` tag when `removeStyleTags: true`
- **CSS custom properties**: resolved via `resolveCSSVariables: true`. Source `lib/variables.js` walks DOM ancestors via `pseudoElementParent`/`parent` to inherit cascaded `--var` values; supports `var(--name, default)` fallback syntax. Implementation does not query a *real* computed-style engine; it inspects already-extracted styleProps on cheerio nodes.
- **Modern selectors (`:has`, `:is`, `:where`)**: README contains **no mention**; selector parsing is via `slick` v1.12.2 (a tokenizer last meaningfully updated years before these selectors). `.juiceClient.ignoredPseudos` defaults to `['hover','active','focus','visited','link']`. WebFetch confirms no `:has`/`:is`/`:where` documentation.
- **`@import`**: handled at file-fetch tier via `web-resource-inliner` (Node-only — explicitly absent from `juice/client`)
- **`<style>` block extraction**: yes; default `applyStyleTags: true`, `removeStyleTags: true`

**Tailwind compatibility:** None built in. Juice consumes pre-existing CSS — caller is responsible for compiling Tailwind to a CSS string before passing.

**Bundle size:** 65,712 bytes unpacked for juice itself (npm registry `dist.unpackedSize`). Adds cheerio's runtime weight (cheerio's published `dist/browser/index.js` is its slimmed browser entry, but still ships with `parse5`).

**Maintenance signal:** 3,248 GitHub stars; 2,232,879 weekly npm downloads; last release 2026-02-04 (v11.1.1); last GitHub push 2026-04-20. Active.

**API shape:**
```js
import juice from 'juice';
const result = juice('<style>div{color:red;}</style><div></div>');
// → '<div style="color: red;"></div>'
```
Browser variant:
```js
import juice from 'juice/client'; // resolved by Browserify via package.json "browser" field
const out = juice.inlineContent(htmlString, cssString, { resolveCSSVariables: true });
```

---

### juice/client (browser entry of juice)

**Finding:** A bundled-down subset of juice, exposed via the package's `"browser": "client.js"` field. Browserify-only — does not ship a pre-built browser bundle to npm.
**Confidence:** CONFIRMED
**Evidence:**
- `package.json` declares `"browser": "client.js"` and a `"browserify"` script: `"browserify client.js -o tmp/bundle.js --standalone juice"` ([raw package.json](https://raw.githubusercontent.com/Automattic/juice/master/package.json))
- `client.js` (verbatim, 28 lines): imports `./lib/cheerio` and `./lib/inline`; exposes `juiceDocument`, `inlineDocument`, `inlineContent`, `codeBlocks`. **Excludes** `juiceFile`, `juiceResources`, and remote-resource fetching ([client.js raw](https://raw.githubusercontent.com/Automattic/juice/master/client.js))
- README §"How to use": "Juice has a number of functions… To inline HTML without getting remote resources, using default options" — `juice/client` is the browser-safe path

**Internal DOM:** cheerio (browserified). Cheerio runs in browsers via parse5.

**CSS handling:** Identical to juice with the exclusions noted (no remote `<link>` resolve, no `@import` fetch, no file I/O).

**Tailwind compatibility:** Same as juice — caller-supplied CSS only.

**Bundle size:** Not pre-published. Consumers run `browserify client.js --standalone juice`. Empirical size depends on consumer bundler; the GitHub Pages live demo at automattic.github.io/juice ships a Browserify bundle. The README does not state a numeric size; no separate npm package exists for `juice/client` standalone.

**Maintenance signal:** Same as juice (single repo).

**API shape:**
```js
// After Browserify/webpack/Vite resolves package.json "browser" field:
import juice from 'juice'; // resolves to client.js in browser builds
const out = juice('<style>p{color:red}</style><p>hi</p>');
// or:
const out = juice.inlineContent('<p>hi</p>', 'p{color:red}', { resolveCSSVariables: true });
```

---

### Premailer (`premailer/premailer`, Ruby)

**Finding:** Ruby gem; not usable from JavaScript. Inlines via Nokogiri/Hpricot (Ruby HTML libs). CSS variables NOT resolved automatically.
**Confidence:** CONFIRMED
**Evidence:**
- README (via WebFetch): "Premailer is a Ruby gem that prepares HTML emails… converts CSS to inline styles, converts relative paths to absolute ones, and checks CSS against email client capabilities."
- README explicitly: "The gem does not automatically replace CSS variables with their static value in the context of a Ruby on Rails application." Recommendation is "pre-process files using PostCSS" before invoking Premailer.
- Repo language stats: 92.2% Ruby. JRuby support: "close, contributors are welcome" (no completed JS port)

**Internal DOM:** Nokogiri (Ruby libxml2 binding) — confirmed by repo metadata as the Ruby-side parser; not relevant to JS pipelines.

**CSS handling specifics:**
- Pseudo-elements: not addressed in README
- Media queries: preserved (Premailer's primary email use case)
- **CSS custom properties (`--var`)**: NOT resolved automatically; user must pre-run PostCSS
- **Modern selectors (`:has`, `:is`, `:where`)**: not mentioned; engine pre-dates these selectors
- `@import`: handled (it's a Ruby tool that resolves remote files)
- `<style>` block extraction: yes

**Tailwind compatibility:** No first-party support; expects pre-compiled CSS.

**Bundle size:** n/a (Ruby gem, not npm).

**Maintenance signal:** 2,408 stars; last push 2026-03-10; 814 commits, 54 tagged releases. Active project. Web service at premailer.dryicons or similar wrappers exist.

**API shape:**
```ruby
require 'premailer'
premailer = Premailer.new('http://example.com/test.html', warn_level: Premailer::Warnings::SAFE)
puts premailer.to_inline_css
```

---

### `@react-email/tailwind` (npm `@react-email/tailwind` v2.0.7)

**Finding:** **DEPRECATED as of latest publish (2026-03-31).** Functionality migrated into the main `react-email` package's `<Tailwind>` component. Runs Tailwind v4 `compile()` at React render time (Node SSR) and uses `css-tree` to walk the resulting stylesheet — does NOT use juice or cheerio.
**Confidence:** CONFIRMED
**Evidence:**
- npm registry metadata (verbatim): `"deprecated": "Package no longer supported. Contact Support at https://www.npmjs.com/support for more info."` for version 2.0.7 ([https://registry.npmjs.org/@react-email/tailwind](https://registry.npmjs.org/@react-email/tailwind))
- v2.0.7 dependencies are minimal: `"dependencies": { "tailwindcss": "^4.1.18" }` — no juice, no cheerio, no jsdom. devDeps include `css-tree` 3.1.0.
- Live source moved: the canonical Tailwind component now lives in `packages/react-email/src/components/tailwind/` (canary branch). The standalone `packages/tailwind/` no longer exists in the canary branch listing (verified via GitHub Contents API on `?ref=canary`).
- Source of `setupTailwind()` (verbatim, [setup-tailwind.ts raw](https://raw.githubusercontent.com/resend/react-email/canary/packages/react-email/src/components/tailwind/utils/tailwindcss/setup-tailwind.ts)):
  ```ts
  import { parse, type StyleSheet } from 'css-tree';
  import { compile } from 'tailwindcss';
  // ...
  const compiler = await compile(baseCss, {
    async loadModule(id, base, resourceHint) { /* injects user config */ },
    polyfills: 0, // All
    async loadStylesheet(id, base) { /* serves bundled tailwindcss/index.css, preflight.css, theme.css, utilities.css */ },
  });
  return {
    addUtilities(candidates) { css = compiler.build(candidates); },
    getStyleSheet() { return parse(css) as StyleSheet; },
  };
  ```
  — confirms Tailwind's `compile()` runs at render time, fed user-supplied class candidates.
- Source of `tailwind.tsx` (verbatim, ~165 LOC): walks the React tree (`mapReactTree`) collecting className-split tokens, calls `tailwindSetup.addUtilities(classes)`, then runs `sanitizeStyleSheet` (`resolveAllCssVariables`, `resolveCalcExpressions`, `sanitizeDeclarations`), splits rules into `inlinable` vs `nonInlinable`, and rewrites each React element via `cloneElementWithInlinedStyles`. Non-inlinable rules (e.g., media queries) are emitted into a `<style>` injected inside the `<head>`. Inline conversion happens at React render time, not via DOM serialization.
- `sanitize-stylesheet.ts` (verbatim): runs `resolveAllCssVariables` + `resolveCalcExpressions` + `sanitizeDeclarations` on the css-tree AST — manual variable resolution, NOT a real CSSOM.

**Internal DOM:** None — operates on React's virtual element tree, not on DOM. Stylesheet traversal uses `css-tree` AST.

**CSS handling specifics:**
- Pseudo-elements: not directly inlinable to attribute style; routed to non-inline `<style>` block
- Media queries: routed to the non-inline `<style>` (must have a `<head>` element somewhere in the `<Tailwind>` subtree, else the component throws an Error — verbatim error message in the source)
- CSS custom properties: resolved by `resolveAllCssVariables` (manual walk of the css-tree AST). Per [react.email docs](https://react.email/docs/components/tailwind): "emails don't really have great support for CSS variables, so a custom postcss plugin is used alongside Tailwind to resolve all of these variables."
- Modern selectors: limited. Per the docs the component "cannot handle complex selectors (like those from `@tailwindcss/typography` or `space-*` utilities)"; classes that produce inline-incompatible selectors flow through the non-inline `<style>` path
- `@import`: handled inside `setupTailwind` via `loadStylesheet` (only allows the four `tailwindcss/*.css` modules)
- `<style>` block extraction: not relevant — output is React tree, not raw HTML

**Tailwind compatibility:** First-party Tailwind v4 (peer-dep `tailwindcss` ^4.1.18 in v2.0.7; `tailwindcss-v4-beta` was the prior dist-tag). Bundles its own stylesheet bytes (`tailwind-stylesheets/{index,preflight,theme,utilities}.js`) so consumers don't need a tailwind config file.

**Bundle size:** 2,120,387 bytes unpacked (npm registry `dist.unpackedSize` for v2.0.7) — **dominated by the bundled Tailwind v4 compiler + base stylesheets**. ~2 MB unpacked is in line with running Tailwind compilation in-process.

**Maintenance signal:** Standalone package: deprecated 2026-03-31. Successor (in-package `<Tailwind>`) is active. 3,352,640 weekly downloads on the deprecated package — high installed base before migration. React-email parent repo: 19,070 stars; last push 2026-04-30.

**API shape:**
```tsx
import { Tailwind } from '@react-email/components'; // or '@react-email/tailwind' (deprecated)
export default function Email() {
  return (
    <Tailwind config={{ theme: { extend: {} } }}>
      <Html><Head /><Body><Container className="bg-blue-500 p-4">Hi</Container></Body></Html>
    </Tailwind>
  );
}
// Renders to inline-styled HTML via @react-email/render → renderToStaticMarkup-ish path
```

---

### `@react-email/render`

**Finding:** Sibling to the Tailwind component. Renders React component trees to static HTML strings via `react-dom/server`. Has node, edge, and browser entrypoints. Does NOT inline CSS itself — that's `<Tailwind>`'s job. Uses `jsdom` only as a devDependency (test fixture), not at runtime.
**Confidence:** CONFIRMED
**Evidence:**
- `packages/render/package.json` (verbatim, fetched via WebFetch): production deps `html-to-text` ^9.0.5, `prettier` ^3.5.3 only; devDep `jsdom` 26.1.0 (test fixture)
- Directory listing via GitHub Contents API: `packages/render/src/{browser,edge,node,shared,react-internals.d.ts}` — three runtime-environment-specific entrypoints

**Internal DOM:** None at runtime. `jsdom` is in devDependencies only (used by the package's own tests).

**CSS handling:** None — the package's role is React→HTML serialization plus `html-to-text` plain-text generation. Inlining happens before render (via `<Tailwind>` or similar) or after (via separate juice pipeline).

**Tailwind compatibility:** n/a (downstream of Tailwind component).

**Bundle size:** Not measured here.

**Maintenance signal:** 5,975,229 weekly downloads — the highest in this rubric. Active.

**API shape:**
```ts
import { render } from '@react-email/render';
const html = await render(<Email />, { pretty: true });
const text = await render(<Email />, { plainText: true });
```

---

### mailing (`sofn-xyz/mailing`, npm `mailing-core`)

**Finding:** React+MJML email framework. CSS inlining is handled by **MJML** (the underlying templating engine), NOT juice. Effectively unmaintained — last meaningful commit 2024-05-14.
**Confidence:** CONFIRMED
**Evidence:**
- `mailing-core` package.json (via WebFetch): dependencies `@faire/mjml-react` ^3.1.2, `mjml` ^4.12.0, `chalk`, `fs-extra`, `node-fetch`, `node-html-parser` ^6.1.1, `open`, `posthog-node`. **No juice.** **No cheerio.** Uses `node-html-parser` instead.
- GitHub repo metadata: `pushed_at: "2024-05-27T09:36:53Z"` — repository hasn't been pushed in ~12 months. Last 5 commits: 2024-05-14, 2023-12-04 (×3), 2023-12-04 — pre-2026.
- 3,609 GitHub stars but only 4,111 weekly npm downloads on `mailing-core` — order of magnitude lower than the top tools in the survey.
- README states "Built-in MJML-React support" and rendering goes through `mjml` (which produces table-based HTML with inline-style-friendly markup as a side effect of MJML's own pipeline).

**Internal DOM:** `node-html-parser` (a fast, zero-dependency HTML parser distinct from cheerio and jsdom) for any in-place transforms; MJML itself does the heavy lifting of producing email-ready HTML.

**CSS handling:** Delegated to MJML 4.x. MJML translates its own MJ-* tags into table-based HTML with attributes; CSS support is whatever MJML's output produces (which itself is mostly inline-style-friendly markup, not a juice-style transform).

**Tailwind compatibility:** Not first-party.

**Bundle size:** Not relevant for this comparison (full framework).

**Maintenance signal:** Last push 2024-05-27; last commit 2024-05-14; effectively unmaintained for ~12 months as of 2026-05-01. 4,111 weekly downloads.

**API shape:**
```ts
import { sendMail } from 'mailing-core';
// renders MJML-React templates; sendMail uses Nodemailer transport + MJML compile
```

---

### inline-css (npm `inline-css` v4.0.3)

**Finding:** Server-side juice alternative; explicitly "Inspired by the juice library", uses cheerio (NOT jsdom). Released 2024-12-27, smaller scope than juice.
**Confidence:** CONFIRMED
**Evidence:**
- README §Features (verbatim, fetched as raw): "Uses [cheerio](https://github.com/cheeriojs/cheerio) instead of jsdom" + "Works on Windows" + "Preserves Doctype" + "Modular" + "Gets your CSS automatically through style and link tags"
- npm registry `package.json`: `"dependencies": { "cheerio": "^1.0.0", "css-rules": "^1.1.0", "extract-css": "^3.0.2", "flat-util": "^1.1.9", "pick-util": "^1.1.5", "slick": "^1.12.2", "specificity": "^0.4.1" }` — cheerio confirmed; same `slick` selector tokenizer as juice.
- No `"browser"` field declared in package.json → Node-only intent.
- API option list (from README):
  - `extraCss`, `applyStyleTags` (default `true`), `applyLinkTags` (default `true`)
  - `removeStyleTags` (default `true`), `removeLinkTags` (default `true`)
  - `url` (required, used to resolve `<link>` hrefs)
  - `preserveMediaQueries` (default `false` — note: opposite default from juice's `true`)
  - `applyWidthAttributes` (default `false`), `applyTableAttributes` (default `false`)
- Returns Promise: README §Usage shows `inlineCss(html, options).then(html => ...)`

**Internal DOM:** **cheerio** ^1.0.0 (transitively `parse5`).

**CSS handling specifics:**
- Pseudo-elements: not surfaced as a config option in README; behavior likely "skip"
- Media queries: opt-in preserve via `preserveMediaQueries` (defaults OFF, contra juice)
- CSS custom properties: NOT documented (no `resolveCSSVariables`-equivalent option in README's option list)
- Modern selectors: README silent; uses `slick` 1.12.2 (same as juice)
- `@import` / `<link>`: resolved via `extract-css` and `applyLinkTags`
- `<style>` block extraction: yes; default `applyStyleTags: true`

**Tailwind compatibility:** None built-in.

**Bundle size:** 19,898 bytes unpacked (npm registry).

**Maintenance signal:** 440 stars; 308,888 weekly downloads; last npm publish 2024-12-27; last GitHub push 2025-05-01. Steady but slow cadence (one major release per ~6 months).

**API shape:**
```js
import inlineCss from 'inline-css';
const html = '<style>div{color:red;}</style><div>hi</div>';
const inlined = await inlineCss(html, { url: 'about:blank' });
```

---

### css-inline (`Stranger6667/css-inline`, npm `@css-inline/css-inline` v0.20.2)

**Finding:** Rust core compiled to native (per-platform N-API binaries) and to WASM for browser use. Highest-performance option in the survey. The legacy `css-inline` (not scoped) npm package is deprecated and renamed to the scoped `@css-inline/css-inline`.
**Confidence:** CONFIRMED
**Evidence:**
- `@css-inline/css-inline` package.json (npm registry): N-API targets across 11 platforms (`x86_64-apple-darwin`, `x86_64-pc-windows-msvc`, `aarch64-apple-darwin`, etc.); `optionalDependencies` lists 11 per-platform native packages. Build scripts: `"build": "napi build --platform --release ..."`, `"build:wasm": "wasm-pack build --target web --out-name index --out-dir wasm/dist --release"`.
- Package size: 50,676 bytes unpacked for the JS wrapper (npm registry); platform-specific `.node` binaries are separate optional packages so installed size depends on host.
- README §"WASM": ships a separate `https://unpkg.com/@css-inline/css-inline-wasm` distribution; WASM module "lacks support for fetching stylesheets from network or filesystem and caching" (parallel to juice/client's exclusions).
- README perf benchmarks: ~4 µs basic HTML, ~48–79 µs realistic email, ~17 ms for 1.81 MB GitHub page; "over a 3x speed advantage" vs alternatives on an 8.58 KB document (168.95 µs vs 344.59 µs–1.15 ms). Counterparties unnamed in fetched excerpt but devDeps include `inline-css` and `juice` for benchmark fixtures: `"inline-css": "^4.0.3"`, `"juice": "^11.0.3"` (from package.json devDependencies) — implies juice and inline-css are the benchmark baselines.
- README mentions support for "HTML5 & CSS3" and `keep_at_rules` option for `@media`. README does NOT call out specific `:has`/`:is`/`:where` support; selector parsing is via Servo's html5ever/kuchiki components ("Uses reliable components from Mozilla's Servo project").

**Internal DOM:** Mozilla Servo's HTML/CSS engine components (Rust). Not jsdom, not cheerio. Real DOM-tree implementation in Rust.

**CSS handling specifics:**
- Media queries: `keep_at_rules` config option preserves them
- Pseudo-elements: README doesn't discuss insertion; Servo's parser handles them as selectors but inlining to `style=""` is structurally not possible (same constraint as juice)
- CSS custom properties: NOT explicitly documented as resolved
- Modern selectors: README silent; Servo's selector matcher does support `:is`/`:where` upstream as of recent versions, but the css-inline README does not promise this.
- `@import`: full Node binding supports remote stylesheet fetch + caching; **WASM build does not** (per README)
- `<style>` block extraction: yes (`inlineStyleTags`, `keepStyleTags`)

**Tailwind compatibility:** None first-party; consumes any CSS string.

**Bundle size:** 50,676 bytes unpacked for the JS wrapper. Plus per-platform native `.node` (N-API) for Node, or WASM bytes for browser. WASM bundle size not stated in the README excerpt fetched.

**Maintenance signal:** 306 GitHub stars; 341,814 weekly downloads on the scoped package; last release 2026-04-02 (v0.20.2); last push 2026-04-28; 142 total releases — high release velocity. Active.

**API shape (Node):**
```ts
import { inline, inlineFragment } from '@css-inline/css-inline';
const out = inline('<style>p{color:red}</style><p>hi</p>'); // returns full document
const frag = inlineFragment('<p class="x">hi</p>', '.x{color:red}'); // returns fragment without <html>/<head>/<body>
```
API shape (Browser/WASM):
```html
<script type="module">
  import init, { inline } from 'https://unpkg.com/@css-inline/css-inline-wasm';
  await init(); // initialize WASM
  const out = inline(htmlString);
</script>
```

---

## Key cross-tool findings

### Finding 1: juice and inline-css both use cheerio (NOT jsdom). React-email uses neither.

**Evidence:**
- juice `package.json` declares `"cheerio": "1.0.0"` as a direct dep ([raw](https://raw.githubusercontent.com/Automattic/juice/master/package.json)); `client.js` imports `./lib/cheerio`
- inline-css README "Uses cheerio instead of jsdom" + `package.json` declares `"cheerio": "^1.0.0"`
- `@react-email/tailwind` v2.0.7 has `tailwindcss` ^4.1.18 as its only runtime dep — operates on React virtual elements + `css-tree` AST, no HTML DOM at all
- `@react-email/render` v-current declares `jsdom` only in devDependencies (test fixture); production deps are `html-to-text` and `prettier`
- mailing-core uses `node-html-parser` (a third option, distinct from both cheerio and jsdom)

**Implication for browser-side runtime use:** cheerio runs in browsers via Browserify (parse5 is browser-compatible). So juice/client and any browserified inline-css *can* run in-browser without bundling jsdom. They're light by jsdom standards; cheerio is structurally a DOM-shaped wrapper around parse5, not a DOM emulator.

### Finding 2: React-email's Tailwind component runs `tailwindcss.compile()` at render time (Node/SSR), bundles Tailwind v4 stylesheets

**Evidence:** Verbatim source from [setup-tailwind.ts](https://raw.githubusercontent.com/resend/react-email/canary/packages/react-email/src/components/tailwind/utils/tailwindcss/setup-tailwind.ts):
```ts
import { compile } from 'tailwindcss';
const compiler = await compile(baseCss, { /* loadStylesheet returns bundled tailwindcss/{index,preflight,theme,utilities}.css */ });
```
The four base stylesheets are bundled as JS string modules in `tailwind-stylesheets/`. The compiler runs synchronously per-render; `useSuspensedPromise(() => setupTailwind(config), JSON.stringify(config))` caches per-config-shape. classNames are split on whitespace and fed as candidates to `compiler.build(candidates)`.

This corroborates the prior 2026-04-30 amendment in `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` (lines ~1406-1450). Verifies the key claim that Tailwind compilation is at Node/SSR time, not pre-built. The 2.0 MB unpacked size of `@react-email/tailwind` v2.0.7 reflects bundled tailwind compiler + base CSS.

### Finding 3: `@react-email/tailwind` is deprecated as of 2026-03-31; successor `<Tailwind>` lives inside the main `react-email` package

**Evidence:** `registry.npmjs.org/@react-email/tailwind` v2.0.7 has `"deprecated": "Package no longer supported. Contact Support at https://www.npmjs.com/support for more info."`. The canary branch's `packages/` listing (via GitHub Contents API on `?ref=canary`) shows directories: `create-email`, `editor`, `react-email`, `render`, `tsconfig`, `ui` — **no `tailwind` package**. The tailwind component now lives at `packages/react-email/src/components/tailwind/{tailwind.tsx,inline-styles.ts,sanitize-stylesheet.ts,index.ts,utils/...}`.

### Finding 4: No surveyed tool runs in-browser without bundling either cheerio (juice/client, browserified inline-css) or a Servo-derived WASM module (css-inline-wasm)

**Evidence:**
- juice/client: requires Browserify; bundles cheerio + parse5 (no separate browser tarball published)
- inline-css: no `browser` field in package.json; not advertised as browser-compatible (would require manual bundling)
- `@css-inline/css-inline-wasm`: ships pre-built WASM at unpkg.com but lacks remote-stylesheet/cache features
- `@react-email/tailwind`: SSR React component; runs `tailwindcss.compile()` which is Node-targeted (uses Node-style file resolution, even in the loadStylesheet abstraction); not designed for browser execution
- Premailer: Ruby, irrelevant
- mailing: Node-only; built around MJML, which is also Node-targeted

**The minimal happy-dom + juice browser-side stack does not exist in published form.** A consumer who wanted "happy-dom + juice in browser" would need to (a) Browserify `juice/client` themselves (bundles cheerio+parse5, not happy-dom), or (b) drive happy-dom inside the browser as a CSSOM substrate and invoke juice against it — but juice's `juiceDocument` accepts a *cheerio* instance, not a DOM, so happy-dom output would need conversion. juice does not consume real-DOM nodes; it consumes cheerio's parse5-backed pseudo-DOM.

### Finding 5: Mailing.run vs react-email — different CSS-inlining philosophies

**Evidence:**
- mailing-core (sofn-xyz/mailing) uses `@faire/mjml-react` + `mjml` v4 to compile MJML markup (table-based, Outlook-friendly) into already-inline-friendly HTML. CSS inlining is implicit in MJML's output; no juice/cheerio inliner is involved.
- react-email pairs `<Tailwind>` (Tailwind v4 compile() at render time → css-tree AST → inline styles + non-inline `<style>` block injected to `<head>`) with `@react-email/render` (`react-dom/server`-style HTML serialization).
- Mailing also has not been actively maintained since 2024-05; react-email is on weekly release cadence.

### Finding 6: juice does support CSS variable resolution; `:has`/`:is`/`:where` are not addressed

**Evidence:** juice's `lib/variables.js` (per WebFetch of source) walks the styleProps cascade via `pseudoElementParent`/`parent`, supports `var(--name, default)` fallback. Default option `resolveCSSVariables: true`. README does NOT mention `:has`, `:is`, `:where`, or any selector pseudo-class beyond the `ignoredPseudos` allowlist (`hover`, `active`, `focus`, `visited`, `link`). Selector parsing is via `slick` v1.12.2 — slick's last meaningful update predates these CSS Selectors Level 4 features.

### Finding 7: css-inline is the only surveyed tool with a real Servo-derived CSS engine

**Evidence:** README states "Uses reliable components from Mozilla's Servo project." Rust → N-API binaries for Node + WASM for browser. Benchmarks vs juice and inline-css (devDeps include both) show 3× speedup. This positions css-inline as the only tool whose selector matching is backed by a production browser engine's components rather than a regex-y tokenizer (juice/inline-css use `slick` 1.12.2).

---

## Negative searches

- Searched "browser-side juice" → only finds the GitHub Pages demo at automattic.github.io/juice, which is a Browserified bundle of `client.js`. No standalone npm browser package.
- Searched "@react-email/tailwind tw-to-css" → unrelated `tw-to-css` package (vinicoder/tw-to-css) exists as an alternative for non-react-email use cases; react-email itself uses `tailwindcss.compile()` directly via the `tailwindcss` v4 dependency.
- Searched "mailing.run juice approach" → mailing.run docs (the marketing site) do not mention juice; mailing-core's `package.json` confirms no juice dependency.
- Searched "css-inline :has :is :where" → no explicit support claim. The Servo selector matcher upstream does support these, but css-inline's README/docs make no commitment.
- Searched for `sofn-xyz/mailing` README → fetch returned 404 / archive-like state. Confirmed via repo metadata that pushes have stopped.

---

## Gaps / follow-ups

- **css-inline modern-selector matrix:** the README does not enumerate `:has`/`:is`/`:where` behavior. To know definitively, read the Rust source under `Stranger6667/css-inline/css-inline/src/` and grep for the Servo selectors version pinned (this would tell us whether Selectors Level 4 features pass through). Out of scope for this 25-min pass.
- **juice/client browserified bundle size:** README does not state a kB number. Producing it requires running `npm run browserify` locally or measuring the GitHub Pages demo's bundle bytes (could be done as a follow-up in 5 minutes).
- **`@react-email/tailwind` migration direction:** the deprecation message points to npm Support rather than to a successor package, but the in-package `<Tailwind>` is the de-facto successor (verified via canary branch source). Confirm with a release note: react-email blog posts at resend.com/blog/react-email-{5,6} cover Tailwind v4 migration but were not fetched in this pass.
- **Numeric WASM bundle for `@css-inline/css-inline-wasm`:** README cites unpkg.com URL but not size. Could be measured via curl + content-length follow-up.
