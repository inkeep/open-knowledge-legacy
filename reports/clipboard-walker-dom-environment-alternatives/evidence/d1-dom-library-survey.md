# Evidence: D1 — DOM-environment library survey

**Dimension:** DOM library survey (jsdom, happy-dom, linkedom, parse5, cheerio, htmlparser2)
**Date:** 2026-05-01
**Sources:** GitHub repos (commits/releases/issues APIs), npm registry (`npm view`), official READMEs and wikis, npm downloads API.

---

## Summary table

| Library | Purpose | `getComputedStyle` resolves cascade? | CSSOM | Unpacked size | Last commit | Weekly downloads | Open issues | Browser? |
|---|---|---|---|---|---|---|---|---|
| **jsdom** v29.1.1 | Full WHATWG / web-standards JS env for Node.js | YES (overhauled in v29.0.0, Mar 2026; uses `css-tree` + `@asamuzakjp/css-color`) | YES (full, fresh internal implementation as of v29) | 7.03 MB (21 deps) | 2026-04-30 | 70.86 M | 412 | NO (Node.js only) |
| **happy-dom** v20.9.0 | JS web-browser implementation without GUI | PARTIAL (parses `<style>` blocks, walks parents, supports `var()` fallbacks; multiple open bugs around inheritance, color formats, sizes) | YES (custom, in `packages/happy-dom/src/css`) | 8.41 MB (6 deps) | 2026-04-13 | 7.69 M | 299 | Bun-friendly; no published browser bundle (default `lib/index.js`, Node-oriented) |
| **linkedom** v0.18.12 | Triple-linked-list DOM for SSR/DOM-less envs | NO (no `getComputedStyle`; depends on `cssom@0.5.0` only for parsing) | LIMITED (parser-only via `cssom@0.5.0`, last cssom commit 2023-04-18) | 919 KB (5 deps) | 2026-03-28 | 2.32 M | 40 | YES (ESM + CJS, no Node-only APIs in core path) |
| **parse5** v8.0.1 | Spec-compliant HTML5 tokenizer/parser/serializer | NO (HTML only; no DOM, no CSS) | NO | 337 KB (1 dep: `entities`) | 2026-04-28 | 116.48 M | 35 | YES (pure JS) |
| **cheerio** v1.2.0 | jQuery-like API over `parse5` / `htmlparser2` | NO (no DOM, no CSS resolution) | NO | 1.01 MB (11 deps) | 2026-05-01 | 25.66 M | 40 | YES (ships dedicated `./dist/browser/index.js`) |
| **htmlparser2** v12.0.0 | Fast, forgiving HTML/XML tokenizer | NO (parser only; pairs with `domhandler`) | NO | 235 KB (4 deps) | 2026-03-24 (push 2026-04-28) | 74.95 M | 12 | YES (pure JS) |

Bundle-size order (smallest → largest, unpacked): **htmlparser2 (235 KB) < parse5 (337 KB) < linkedom (919 KB) < cheerio (1.01 MB) < jsdom (7.03 MB) < happy-dom (8.41 MB)**.

---

## Per-library findings

### jsdom

**Finding:** jsdom is the only library in this set that ships a near-complete CSSOM and a `getComputedStyle()` that resolves the CSS cascade against parsed `<style>`/`<link>` rules. It is **Node-only**, and **does not implement layout** (`getBoundingClientRect`, `offsetTop`, etc. return zeros).
**Confidence:** CONFIRMED.
**Evidence:**

- v29.0.0 release notes (`gh api repos/jsdom/jsdom/releases/tags/v29.0.0`):

  > "Overhauled the CSSOM implementation, replacing the `@acemir/cssom` and `cssstyle` dependencies with fresh internal implementations built on webidl2js wrappers and the `css-tree` parser. Serialization, parsing, and API behavior is improved in various ways, especially around edge cases."
  > "Added `cssMediaRule.matches` and `cssSupportsRule.matches` getters."
  > "Fixed `getComputedStyle()` crashing in XHTML documents when stylesheets contained at-rules such as `@page` or `@font-face`."

- v29.0.2 / v29.1.0 / v29.1.1 release notes (Apr 2026):

  > "Significantly improved and sped up `getComputedStyle()`."
  > "Fixed `getComputedStyle()` sometimes returning outdated results after CSS was modified."
  > "Significantly optimized initial calls to `getComputedStyle()`."
  > "Fixed `'border-radius'` computed style serialization."
  > "Fixed computed style computation when using `'background-origin'` and `'background-clip'` CSS properties."

- README (https://github.com/jsdom/jsdom): explicitly excludes layout from scope:

  > "Layout: the ability to calculate where elements will be visually laid out as a result of CSS, which impacts methods like `getBoundingClientRects()` or properties like `offsetTop`."

- Issue #1696 "Implement CSS cascading" — opened 2016-12-28, **still listed as open**, but cascade is now functional in v29 per the release notes. Issue #2160 closed as a duplicate of #1696.
- 30 currently open issues match `getComputedStyle` (`gh api search/issues … is:open`), e.g. "getComputedStyle() does not return default values…", "window.getComputedStyle for background-image returns ''", "Inherit Styles: Color, Fill, Stroke", "Can't load external css", "Implement CSS cascade layers".
- 1 historical oklch issue (#3691, "Cannot set an oklch background color with JavaScript") — **closed**.
- Color/parsing depends on `@asamuzakjp/css-color@^5.1.11` and `css-tree@^3.2.1` (`npm view jsdom dependencies`). `css-tree` repo last pushed 2026-03-05.
- Browser support: README states it is "for use with Node.js"; no Browserify or browser bundle (WebFetch summary: "jsdom does not work in browsers").
- Maintenance: 21,568 stars; commit 2026-04-30; weekly downloads 70,859,052.

### happy-dom

**Finding:** happy-dom implements its own CSSOM (`packages/happy-dom/src/css/...`) and a `getComputedStyle()` that walks parents, parses `<style>` blocks, and resolves CSS custom-property fallbacks, but has multiple confirmed open issues against inheritance, color-format normalization, pseudo-element argument, and pixel-conversion correctness.
**Confidence:** CONFIRMED for "implementation exists"; UNCERTAIN for fidelity vs. real browsers (multiple open bugs).
**Evidence:**

- File `packages/happy-dom/src/css/declaration/computed-style/CSSStyleDeclarationComputedStyle.ts` (per WebFetch of the file): implements cascade walking, `:host`/`:host-context`, `@media`/`@supports`, em/rem/px conversion, inherited vs non-inherited handling, `WeakRef` caching, and `var()` resolution including fallbacks (regex `SINGLE_CSS_VARIABLE_REGEXP` / `CSS_VARIABLE_REGEXP`).
- README performance table (https://github.com/capricorn86/happy-dom/blob/master/packages/happy-dom/README.md):

  > "Import / Require: 333 ms (JSDOM) vs 45 ms (Happy DOM)"
  > "Parse HTML: 256 ms vs 26 ms"
  > "Serialize HTML: 65 ms vs 8 ms"
  > "Render custom element: 214 ms vs 19 ms"
  > "querySelectorAll('tagname'): 4.9 ms vs 0.7 ms"
  > "querySelectorAll(':nth-child(2n+1)'): 10.4 ms vs 3.8 ms"

- 8 open `getComputedStyle` issues (`gh api search/issues … is:open`). Titles include:

  > "`window.getComputedStyle` not returning correct style"
  > "getComputedStyle().color does not return RGB values"
  > "`window.getComputedStyle` is missing second argument `pseudoElt`"
  > "Add support `:hover` and `:active` to Window.getComputedStyle()"
  > "Inheritance of CSS variables/getComputedStyles/getPropertyValue seems to be broken"
  > "window.getComputedStyle(element).width does not return the correct size in pixels"
  > "Unlike real browsers, getComputedStyle(...).direction does not take `dir` attribute into account"
  > "Support for React styled-components styles, CSSStyleDeclaration issue"

- Zero issues match `oklch`. README's wiki "Performance" page reproduces the same numbers above.
- CSS source-tree (`gh api …/contents/packages/happy-dom/src/css`): files `CSS.ts`, `CSSRule.ts`, `CSSStyleSheet.ts`, `CSSUnitValue.ts`, `CSSUnits.ts`, `MediaList.ts`, plus `declaration/`, `rules/`, `style-property-map/`, `utilities/` directories.
- Dependencies (`npm view happy-dom dependencies`): `entities@^7.0.1`, `whatwg-mimetype@^3.0.0`, `ws@^8.18.3`, plus `@types/*` — no external CSS engine; happy-dom owns its CSS code.
- Browser bundle: `npm view happy-dom main` returns `lib/index.js`; no `browser` field. Multiple recent releases (v20.8.8, v20.8.9) were security patches, suggesting Node/runtime focus.
- Maintenance: 4,452 stars; commit 2026-04-13; weekly downloads 7,687,376.

### linkedom

**Finding:** linkedom explicitly does **not** implement `getComputedStyle`, layout, or live collections; CSS support is parser-level only via the `cssom@0.5.0` dependency, whose upstream repo (NV/CSSOM) has not been updated since 2023.
**Confidence:** CONFIRMED.
**Evidence:**

- README (https://github.com/WebReflection/linkedom):

  > "LinkeDOM has zero intention to: implement all things JSDOM already implemented … implement features not interesting for Server Side Rendering."
  > "Live collections are considered legacy, are slower, have side effects, and it's not intention of LinkeDOM to support these."
  > "Removing 3714 sparse `<div>` elements in a 12M document, as example, takes as little as 3ms."

- README description: "A triple-linked lists based DOM-like namespace, for DOM-less environments."
- README explicitly recommends JSDOM for "100% spec compliant behavior".
- Dependencies (`npm view linkedom dependencies`): `css-select@^5.1.0`, `cssom@^0.5.0`, `html-escaper@^3.0.3`, `htmlparser2@^10.0.0`, `uhyphen@^0.2.0`. Note `cssom` (NV/CSSOM) is the original project that jsdom forked away from in v29 — last commit 2023-04-18, 25 open issues, 758 stars.
- `cssom` package description (`npm view cssom description`): "CSS Object Model implementation and CSS parser" — parsing-only, not a `getComputedStyle` engine.
- No `getComputedStyle`, `CSSOM` cascade, custom-property resolution, or oklch references in linkedom README, nor in the package's exported surface.
- Browser support: ESM + CJS dual exports (`./esm/index.js`, `./cjs/index.js`, `./cached`, etc.); no Node-only built-ins required by core path.
- Maintenance: 2,016 stars; commit 2026-03-28; weekly downloads 2,320,125; 40 open issues.

### parse5

**Finding:** parse5 is an HTML tokenizer/parser/serializer (WHATWG HTML5-spec compliant). It has **no DOM API, no CSSOM, no `getComputedStyle`**.
**Confidence:** CONFIRMED.
**Evidence:**

- README (https://github.com/inikulin/parse5):

  > "HTML parsing/serialization toolset for Node.js. WHATWG HTML Living Standard (aka HTML5)-compliant."
  > "the fastest spec-compliant HTML parser for Node to date."

- `npm view parse5 description`: "HTML parser and serializer."
- Dependencies (`npm view parse5 dependencies`): `{ entities: '^8.0.0' }` (single dep).
- Browser support: pure-JS, no Node-only built-ins; `main: dist/index.js`, single `default` export. Bundlers can ship it browser-side.
- Used internally by jsdom (`parse5@^8.0.1` in jsdom deps) and cheerio (`parse5@^7.3.0`).
- Maintenance: 3,889 stars; commit 2026-04-28; weekly downloads 116,483,010 (highest of the six); 35 open issues.

### cheerio

**Finding:** cheerio implements a jQuery-style API over a parsed tree (using `parse5` and/or `htmlparser2`) but provides **no DOM, no CSSOM, no `getComputedStyle`** — it is a traversal/manipulation library, not a runtime.
**Confidence:** CONFIRMED.
**Evidence:**

- README (https://github.com/cheeriojs/cheerio):

  > "the fast, flexible, and elegant library for parsing and manipulating HTML and XML."

- README confirms cheerio uses **parse5 (primary) and htmlparser2 (alternative, "forgiving")** as parsers.
- Dependencies (`npm view cheerio dependencies`): `parse5@^7.3.0`, `htmlparser2@^10.1.0`, `domutils@^3.2.2`, `domhandler@^5.0.3`, `cheerio-select@^2.1.0`, `dom-serializer@^2.0.0`, `whatwg-mimetype@^4.0.0`, `encoding-sniffer@^0.2.1`, `parse5-parser-stream@^7.1.2`, `parse5-htmlparser2-tree-adapter@^7.1.0`, `undici@^7.19.0`.
- Browser support: dedicated `./dist/browser/index.js` build alongside ESM and CJS. `npm view cheerio exports` shows distinct `browser` conditional with own `.d.ts`.
- No CSS or `getComputedStyle` reference in README; not a documented capability.
- Maintenance: 30,300 stars (highest); commit 2026-05-01; weekly downloads 25,657,354; 40 open issues.

### htmlparser2

**Finding:** htmlparser2 is a low-level HTML/XML tokenizer with a callback interface; for DOM access, the ecosystem layers `domhandler` + `domutils` + `css-select` on top.
**Confidence:** CONFIRMED.
**Evidence:**

- README (https://github.com/fb55/htmlparser2):

  > "The fast & forgiving HTML/XML parser."
  > "htmlparser2 is the fastest HTML parser, and takes some shortcuts to get there. If you need strict HTML spec compliance, have a look at parse5."

- Dependencies (`npm view htmlparser2 dependencies`): `domelementtype@^3.0.0`, `domhandler@^6.0.0`, `domutils@^4.0.2`, `entities@^8.0.0`.
- README confirms ecosystem split: "Use the companion library `domhandler` to convert parsed documents into a DOM structure"; `css-select` provides selector matching; cheerio composes on top.
- No CSSOM, no `getComputedStyle`. Pure parser.
- Browser support: pure-JS, no Node-only built-ins required by the core path. `npm view htmlparser2 exports` shows `./WebWritableStream` subpath (web-stream-friendly).
- Used internally by linkedom (as primary HTML parser) and cheerio (as alternative parser).
- Maintenance: 4,777 stars; commit 2026-03-24 (last push to default branch 2026-04-28); weekly downloads 74,953,590; 12 open issues (lowest).

---

## Key cross-library findings

### Finding 1: jsdom is the only library with a near-complete, actively-maintained CSSOM that resolves the cascade in `getComputedStyle()`

The v29.0.0 release (Mar 2026) replaced the long-stagnant `@acemir/cssom` + `cssstyle` deps with a fresh internal implementation on top of `css-tree` + webidl2js wrappers, and v29.0.2 / v29.1.0 / v29.1.1 (Apr 2026) added repeated, targeted `getComputedStyle()` improvements ("Significantly improved and sped up `getComputedStyle()`", "Fixed `getComputedStyle()` sometimes returning outdated results after CSS was modified", "Fixed `'border-radius'` computed style serialization", "Significantly optimized initial calls to `getComputedStyle()`"). Cascade-related features still flagged in open issues include CSS cascade layers, fill/stroke inheritance for SVG, default value population, and external `<link rel="stylesheet">` loading — the "complete" claim is "near-complete", not "complete".

### Finding 2: happy-dom has a custom CSSOM but with documented gaps in inheritance, color normalization, and units

happy-dom owns its CSS engine end-to-end (`packages/happy-dom/src/css/declaration/computed-style/CSSStyleDeclarationComputedStyle.ts`) and parses `<style>` blocks, walks parents, and resolves `var()` (including fallbacks). 8 open `getComputedStyle` issues call out specific fidelity gaps: missing `pseudoElt` second argument, RGB color normalization not happening, CSS-variable inheritance broken, `width` not returning correct pixels, `direction` not honoring the `dir` attribute, missing `:hover`/`:active` handling.

### Finding 3: linkedom has effectively no CSSOM beyond a parser

linkedom imports `cssom@0.5.0` (NV/CSSOM upstream — last commit 2023-04-18) which is a CSS *parser*, not a computed-style engine. The README explicitly disclaims any intention to implement features outside SSR scope, and recommends jsdom for full compliance.

### Finding 4: parse5, cheerio, htmlparser2 are not DOM environments

They are HTML-parsing layers. They do not implement `Window`, `getComputedStyle`, or any CSSOM. cheerio's API is jQuery-shaped traversal/manipulation, not DOM. They cannot serve as a `getComputedStyle` substrate without an additional CSS engine layered on top.

### Finding 5: oklch / modern color support is not documented in the recent changelogs

A targeted `oklch` search yielded:
- 1 historical jsdom issue (#3691, "Cannot set an oklch background color with JavaScript") — **closed**.
- 0 happy-dom oklch issues.
- 0 mentions of oklch in jsdom v29 release notes.

jsdom delegates color handling to `@asamuzakjp/css-color@^5.1.11` (per `npm view jsdom dependencies`); the WebFetch attempt to load that repo's README returned 404 from this session, so its specific oklch coverage is **NOT VERIFIED** in this evidence pass.

### Finding 6: Internal usage graph

- **jsdom** uses `parse5@^8.0.1`, `css-tree@^3.2.1`, `@asamuzakjp/css-color@^5.1.11`, `@asamuzakjp/dom-selector@^7.1.1`, plus its own internal CSSOM/cssstyle replacements.
- **cheerio** uses `parse5@^7.3.0` AND `htmlparser2@^10.1.0` (selectable), with `domutils`/`domhandler`/`cheerio-select` on top.
- **linkedom** uses `htmlparser2@^10.0.0` (HTML parsing) + `css-select@^5.1.0` (selector matching) + `cssom@^0.5.0` (CSS parsing).
- **htmlparser2** stands alone (only depends on `entities`/`domelementtype`/`domhandler`/`domutils`).
- **parse5** stands alone (only depends on `entities`).

### Finding 7: Bundle-size tiers

Smallest → largest unpacked tarball:

| Tier | Library | Unpacked size |
|---|---|---|
| Tiny | htmlparser2 | 235 KB |
| Tiny | parse5 | 337 KB |
| Small | linkedom | 919 KB |
| Small | cheerio | 1.01 MB |
| Large | jsdom | 7.03 MB |
| Large | happy-dom | 8.41 MB |

Browser-shippable in practice (dedicated browser-targeted exports OR pure-JS with no Node built-ins): **htmlparser2, parse5, cheerio, linkedom**. **jsdom is Node-only by README**; **happy-dom** has no published browser bundle (default `lib/index.js`, no `browser` field).

### Finding 8: Maintenance activity ranking (most → least recent commit, as of 2026-05-01)

| Rank | Library | Last commit | Weekly downloads | Stars |
|---|---|---|---|---|
| 1 | cheerio | 2026-05-01 | 25.66 M | 30,300 |
| 2 | jsdom | 2026-04-30 | 70.86 M | 21,568 |
| 3 | parse5 | 2026-04-28 | 116.48 M | 3,889 |
| 4 | happy-dom | 2026-04-13 | 7.69 M | 4,452 |
| 5 | linkedom | 2026-03-28 | 2.32 M | 2,016 |
| 6 | htmlparser2 | 2026-03-24 (push 2026-04-28) | 74.95 M | 4,777 |

All six are actively maintained (last commit within ~5 weeks of 2026-05-01).

---

## Negative searches

- Searched `gh api search/issues` for `repo:capricorn86/happy-dom oklch` → 0 results (no oklch-tagged issues, open or closed).
- Searched `repo:jsdom/jsdom oklch` → 1 result (#3691, **closed**, "Cannot set an oklch background color with JavaScript").
- WebFetch on `https://github.com/asamuzakjp/css-color` → HTTP 404 from this session; oklch / lab / lch / color-mix coverage of that dependency is **NOT VERIFIED**.
- WebFetch on `https://www.npmjs.com/package/<name>` → HTTP 403 for all 6 packages from this session; size/deps/downloads gathered via `npm view` and `https://api.npmjs.org/downloads/point/...` instead.
- Searched happy-dom README for "getComputedStyle" / "CSSOM" / modern CSS — README/wiki landing page lists "CSS Style Declaration" as a feature but provides no detail page on `getComputedStyle` semantics, custom-property resolution, or modern color spaces.
- Searched happy-dom v20.x recent release notes for CSS-related items — last 5 releases focus on event-listener properties, fetch/cookie security advisories, ESM-export sandbox advisories, and `Console` interface updates; no recent CSS-engine entries.
- Looked for jsdom changelog at `Changelog.md` / `CHANGELOG.md` paths → both 404 on `raw.githubusercontent.com`. Used `gh api repos/jsdom/jsdom/releases` instead, which returned full release-note bodies.

## Gaps / follow-ups

- `@asamuzakjp/css-color` README was not fetchable in this session; whether jsdom's color parser supports `oklch()`, `lab()`, `lch()`, `color-mix()`, or relative color syntax is **not directly confirmed** here. Could be confirmed by reading `node_modules/@asamuzakjp/css-color/README.md` after a local install, or by the package's own GitHub repo via authenticated `gh api`.
- happy-dom's modern color coverage (oklch / lab / color-mix) is **not directly confirmed**; would need source-level inspection of `packages/happy-dom/src/css/utilities/` to verify.
- jsdom open issue #1696 ("Implement CSS cascading") remains open even though release notes claim cascade improvements; the *fidelity* of jsdom's cascade vs. real browsers is not reducible to a single binary signal from this survey alone — would benefit from a hands-on probe (parse Tailwind output, query computed `color`/`background-color`/`--var`, compare to Chrome).
- happy-dom's wiki had multiple "loading errors" per the WebFetch summary; deeper wiki probes (e.g., `Window`, `GlobalWindow`, `CSSStyleDeclaration`) didn't return content in this pass and may have richer detail.
- Performance numbers in happy-dom's README compare against jsdom but are not dated and not independently reproduced; benchmark comparison vs. linkedom was not surfaced from primary sources here.
