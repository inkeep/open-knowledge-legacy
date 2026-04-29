# Evidence: D1 — `mermaid` package facts (11.14.0) + D7 SSR/memory

**Dimension:** D1 (Public API surface, theme API, error surface, known issues, version drift) + D7 (SSR posture, memory leaks)
**Date:** 2026-04-21
**Sources:** `node_modules/mermaid@11.14.0` (local install), github.com/mermaid-js/mermaid (issues + releases), mermaid.js.org
**Version pinned:** `mermaid@11.14.0`, published 2026-04-01

---

## Key files / URLs referenced

- `node_modules/mermaid/package.json` — entry points, deps, exports field (lines 2-14, 50-71)
- `node_modules/mermaid/dist/mermaid.d.ts:1-185` — public type surface
- `node_modules/mermaid/dist/mermaidAPI.d.ts:82-94` — `render`/`parse` signatures + deprecated surface
- `node_modules/mermaid/dist/types.d.ts:62-109` — `RenderResult`, `ParseResult`, `ParseOptions`
- `node_modules/mermaid/dist/errors.d.ts:1-3` — `UnknownDiagramError`
- `node_modules/mermaid/dist/diagram-api/diagramAPI.d.ts:27` — `DiagramNotFoundError`
- `node_modules/mermaid/dist/utils.d.ts:212-217` — `DetailedError` interface
- `node_modules/mermaid/dist/config.type.d.ts:61` — theme enum
- `node_modules/mermaid/dist/mermaid.core.mjs:900-1429` — render/parse/run implementation
- `node_modules/mermaid/dist/chunks/mermaid.core/chunk-ICPOFSXX.mjs:4193-4215, 921-922` — defaults
- [mermaid.js.org usage docs](https://mermaid.js.org/config/usage.html) — T1
- [mermaid.js.org theming docs](https://mermaid.js.org/config/theming.html) — T1
- GitHub issues #1945, #3650, #3680, #4346, #4461, #5307, #6146, #6292, #6370, #6634, #6696, #7094
- [v10.0.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/v10.0.0) — T2
- [v11.0.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/v11.0.0) — T2
- [11.14.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4011.14.0) — T2

---

## Findings

### Finding D1.1.a: `mermaid.initialize(config)` is synchronous, returns void
**Confidence:** CONFIRMED
**Evidence:** `mermaid.d.ts:64`, `mermaid.core.mjs:1156-1175, 1297-1299`

```ts
// mermaid.d.ts:64
initialize: (config: MermaidConfig) => void;
```

Sets `siteConfig`, resolves `themeVariables` via the named theme's `getThemeVariables()`, and calls `addDiagrams()` (registers built-in diagrams). Does not throw for well-formed config objects; unknown keys silently passed through `assignWithDepth_default`.

### Finding D1.1.b: `mermaid.render(id, text, container?)` is async and serialized
**Confidence:** CONFIRMED
**Evidence:** `mermaidAPI.d.ts:82`, `types.d.ts:84-103`, `mermaid.core.mjs:1048-1155, 1340-1358, 1379-1398`

```ts
// Signature
render(id: string, text: string, svgContainingElement?: Element): Promise<RenderResult>

// Return shape (types.d.ts:84-103)
type RenderResult = { svg: string; diagramType: string; bindFunctions?: (element: Element) => void }
```

All calls go through `executionQueue` — a serial FIFO promise-chain. Docstring at `mermaid.d.ts:141`:

> Multiple calls to this function will be enqueued to run serially.

**Implications:** no cancellation API; rapid text changes (live typing) enqueue rather than replace. The queue is module-scoped (singleton).

### Finding D1.1.c: `mermaid.parse(text, {suppressErrors?})` — async, overloaded
**Confidence:** CONFIRMED
**Evidence:** `mermaidAPI.d.ts:12-15`, `mermaid.core.mjs:943-955, 1359-1378`

```ts
parse(text, { suppressErrors: true }): Promise<ParseResult | false>
parse(text, parseOptions?): Promise<ParseResult>   // throws on error
```

`ParseResult = { diagramType: string; config: MermaidConfig }`. Also wrapped in `executionQueue`. Pure validation — does NOT mutate DOM.

### Finding D1.1.d: `mermaid.run(options?)` uses `data-processed` stamp for idempotency
**Confidence:** CONFIRMED
**Evidence:** `mermaid.d.ts:20-58`, `mermaid.core.mjs:1228-1296`

```ts
type RunOptions = {
  querySelector?: string;       // default: '.mermaid'
  nodes?: ArrayLike<HTMLElement>;
  postRenderCallback?: (id: string) => unknown;
  suppressErrors?: boolean;
}
```

Skips elements already marked `data-processed`, stamps them before rendering. Re-invocation is idempotent on the same elements.

### Finding D1.1.e: `registerDiagrams` does NOT exist on public API; `registerExternalDiagrams` is the equivalent
**Confidence:** CONFIRMED
**Evidence:** `mermaid.d.ts:159-183` (full public export enumeration), `mermaid.core.mjs:1317-1325`

Public registration surface at 11.14.0: `registerLayoutLoaders`, `registerExternalDiagrams`, `registerIconPacks`. The singular `registerDiagram` exists internally (`diagram-api/diagramAPI.d.ts:25`) but is **not re-exported**.

```ts
registerExternalDiagrams(
  diagrams: ExternalDiagramDefinition[],
  { lazyLoad = true }: { lazyLoad?: boolean }
): Promise<void>
```

`lazyLoad: false` preloads all registered diagrams (hence the Promise return).

### Finding D1.1.f: `mermaid.init()` is deprecated at 11.x
**Confidence:** CONFIRMED
**Evidence:** `mermaid.d.ts:67-68, 79`, `mermaid.core.mjs:1301` (runtime `log.warn`)

JSDoc marks `init` as `@deprecated`. Runtime emits a log warning on call. `mermaidAPI` itself also marked deprecated (`mermaid.d.ts:163-167`).

### Finding D1.2.a: 11 theme values in 11.14.0 — 6 undocumented publicly
**Confidence:** CONFIRMED
**Evidence:** `config.type.d.ts:61`, [mermaid.js.org/config/theming.html](https://mermaid.js.org/config/theming.html), v11.14.0 release notes

```ts
theme?: 'default' | 'base' | 'dark' | 'forest' | 'neutral'
      | 'neo' | 'neo-dark'
      | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color'
      | 'null';
```

Public theming docs list 5 (`default`, `neutral`, `dark`, `forest`, `base`). The `neo`/`redux` families are undocumented on that page. 11.14.0 release notes: *"feat: implement neo look and themes for …"* + *"additional redux themes"* — new in this release. Theme files at `dist/themes/theme-{name}.d.ts`.

### Finding D1.2.b: `themeVariables` is typed `any`; 200+ runtime keys enumerated in Theme class
**Confidence:** CONFIRMED
**Evidence:** `config.type.d.ts:62` (`themeVariables?: any`), `dist/themes/theme-helpers.d.ts:2-213`

Public schema is untyped. Runtime Theme class enumerates keys including `background, primaryColor, secondaryColor, tertiaryColor, *BorderColor, *TextColor, lineColor, mainBkg, secondBkg, border1/2, arrowheadColor, fontFamily, fontSize, nodeBkg, nodeBorder, clusterBkg, cScale0-11, pie1-12, git0-7, gitInv0-7, actorBkg, actorBorder, sectionBkgColor, requirementBackground, venn1-8, radar, xyChart`, ~200+ total. Concrete key list lives in Theme class, not public API docs.

### Finding D1.2.c: `themeCSS` is prepended raw, unsanitized
**Confidence:** CONFIRMED
**Evidence:** `config.type.d.ts:63`, `mermaid.core.mjs:961-996` (`createCssStyles`)

```js
// mermaid.core.mjs:961-996
if (config.themeCSS !== undefined) {
  // themeCSS prepended to generated <style> tag inside each rendered SVG
}
```

No parsing or sanitization applied.

### Finding D1.2.d: Runtime theme switching takes effect for subsequent renders; already-rendered SVGs don't re-theme
**Confidence:** CONFIRMED (for clean re-initialize) / UNCERTAIN (for live-swap)
**Evidence:** `mermaid.core.mjs:1156-1175`, issues [#1945](https://github.com/mermaid-js/mermaid/issues/1945), [#3680](https://github.com/mermaid-js/mermaid/issues/3680)

Re-calling `mermaid.initialize({theme: 'dark'})` overwrites `themeVariables` via `themes_default[options.theme].getThemeVariables(...)` and calls `setSiteConfig(config)`. Subsequent renders use new theme. Already-rendered SVGs contain inlined `<style>` — no live theme watcher.

**Open issue #1945** (5 years, state: open): `mermaid.mermaidAPI.reinitialize()` does not pick up a new theme after initial render; re-rendering after removing old DOM also fails for the reporter. No maintainer resolution.

**Open issue #3680** (state: open since 2022-10-15): theme variables in initialize not taking effect when also changing font family.

**Interpretation:** clean pattern (re-initialize before each render call with new config) works. Reported failure class — live-swap without full teardown — is documented but unresolved upstream.

### Finding D1.3.a: `render()` error-path behavior — re-throws after attempting error-diagram render
**Confidence:** CONFIRMED
**Evidence:** `mermaid.core.mjs:1097-1107, 1117-1126, 1146-1148`

On parse failure inside `Diagram.fromText`:
1. The original error is caught
2. A stand-in `"error"` diagram is rendered into the DOM (gated by `config.suppressErrorRendering`)
3. The original error is **re-thrown after render**

With `suppressErrorRendering: true`, step 2 is skipped, temp elements cleaned up, error re-thrown immediately.

On draw failure: `errorRenderer_default.draw(text, id, "11.14.0")` is called unless `suppressErrorRendering`, then the draw error is re-thrown.

### Finding D1.3.b: Silent oversized-text replacement (no throw)
**Confidence:** CONFIRMED
**Evidence:** `mermaid.core.mjs:921-922, 1054-1056`

If `text.length > config.maxTextSize` (default 50000), text is **silently replaced** with a static "Maximum text size in diagram exceeded" flowchart. No error is thrown.

### Finding D1.3.c: Error shape — two classes + `DetailedError` interface
**Confidence:** CONFIRMED
**Evidence:** `errors.d.ts:1-3`, `diagram-api/diagramAPI.d.ts:27`, `utils.d.ts:212-217`, `chunk-5PVQY5BW.mjs:464-467`

```ts
// errors.d.ts:1-3
class UnknownDiagramError extends Error { }

// diagram-api/diagramAPI.d.ts:27
class DiagramNotFoundError extends Error { }

// utils.d.ts:212-217
interface DetailedError {
  str: string;
  hash: any;
  error?: any;
  message?: string;
}
```

Parse errors from Jison/Langium surface as `DetailedError` with `.str` and `.hash` fields. Runtime detection:

```js
// chunk-5PVQY5BW.mjs:464-467
function isDetailedError(error) {
  return "str" in error;
}
```

`handleError` (`mermaid.core.mjs:1207-1227`) normalizes both into `{str, message, hash, error}`.

### Finding D1.3.d: PARTIAL ORPHAN DOM RISK at default `suppressErrorRendering: false`
**Confidence:** CONFIRMED (from source); matches open issue #5307
**Evidence:** `mermaid.core.mjs:1060-1094, 1146-1149`

Render always creates a hidden `<div id="d${id}"><svg id="${id}"><g></g></svg></div>` via `appendDivSvgG` before parsing. Cleanup call sites:
- Line 1102: `suppressErrorRendering: true` + `Diagram.fromText` throws → `removeTempElements()` then throw ✓
- Line 1121: `suppressErrorRendering: true` + `diag.renderer.draw` throws → `removeTempElements()` then throw ✓
- Line 1149: happy path ✓

**Risk path:** When `suppressErrorRendering === false` (DEFAULT) and `Diagram.fromText` throws, the code substitutes `diag = await Diagram.fromText("error")` and continues. The re-throw `if (parseEncounteredException) { throw ... }` (lines 1146-1148) runs **before** `removeTempElements()` (line 1149). Temp elements may be left in the DOM on this path.

Mitigation: `removeExistingElements` runs at the **start** of each render (line 1086) — re-using the same `id` removes stale orphans from the prior call. This is why StrictMode double-invocation survives (second call cleans first's residue). Matches open [issue #5307](https://github.com/mermaid-js/mermaid/issues/5307) — reporter observes mermaid parsing generated SVG on React re-render.

### Finding D1.4.a: No open issue tracking systematic SPA memory leak at 11.x
**Confidence:** CONFIRMED (negative search)
**Evidence:** GitHub search for `memory leak` + `SPA` / `unmount` in [mermaid-js/mermaid issues](https://github.com/mermaid-js/mermaid/issues); [#3227](https://github.com/mermaid-js/mermaid/issues/3227) is unrelated React-help issue

Single closed memory-leak issue: [#4461](https://github.com/mermaid-js/mermaid/issues/4461) (mindmap + >23 chars → page OOM on mermaid.live) — fixed 2023-06-06.

No open issue or maintainer-recommended pattern for "mermaid in a long-lived SPA leaks memory." Code-inferred: `removeExistingElements` at render start is the primary cleanup lever; `bindFunctions` reattaches listeners on each call with no teardown helper shipped.

### Finding D1.4.b: No tracked issue for React StrictMode double-invocation
**Confidence:** CONFIRMED (negative search)
**Evidence:** GitHub search `StrictMode`, `double render`, `re-render`, `concurrent` in mermaid-js/mermaid issues; [#1031](https://github.com/mermaid-js/mermaid/issues/1031) (closed 2019, v8.4 lint) is unrelated

Serial `executionQueue` (`mermaid.core.mjs:1340-1358`) means concurrent `render()` calls are serialized — StrictMode's double invocation doubles work but doesn't race. `removeExistingElements` cleans prior residue by id.

### Finding D1.4.c: Race condition in dimension calculation — OPEN
**Confidence:** CONFIRMED
**Evidence:** [#6146](https://github.com/mermaid-js/mermaid/issues/6146) (state: open, 2024-12-21)

*"CSS Animations edge case: Race Condition in calculateDimensionsWithPadding Affecting ViewBox Calculation"* — `getBBox()` returns wrong values before SVG is fully rendered.

### Finding D1.4.d: Multi-diagram bindFunctions overwrite — OPEN
**Confidence:** CONFIRMED
**Evidence:** [#4346](https://github.com/mermaid-js/mermaid/issues/4346) (state: open, 2023-04-25)

*"when using multiple diagrams on the same page, interactions via bindFunctions only end up working on one instance"* — `bindFunctions` from one render overwrites prior. 11.14.0 release notes mention *"Fix duplicate SVG element IDs when rendering multiple diagrams on the same page"* — addresses ID collision class but not necessarily the bindFunctions-overwrite class.

### Finding D1.4.e: Langium deep-import bundler failure — OPEN (affects Next.js / Webpack / Turbopack)
**Confidence:** CONFIRMED
**Evidence:** [#7094](https://github.com/mermaid-js/mermaid/issues/7094) (state: open, 2025-10-20)

`@mermaid-js/parser` deep-imports internal paths of `vscode-jsonrpc` via `langium@3.3.1` that modern bundlers cannot resolve. Cited affected chain: `mermaid@11.12.0 → @mermaid-js/parser@0.6.2 → langium@3.3.1 → vscode-jsonrpc/lib/common/cancellation.js`. 11.14.0 still depends on `@mermaid-js/parser: ^1.1.0` (`package.json:71`); whether langium internals were resolved upstream is UNCERTAIN here.

### Finding D1.4.f: `mermaid.parse()` returns `false` in Node.js when same input is truthy in browser — OPEN
**Confidence:** CONFIRMED
**Evidence:** [#6370](https://github.com/mermaid-js/mermaid/issues/6370) (state: open, 2025-03-11)

### Finding D1.5.a: v9 → v10 breaking changes
**Confidence:** CONFIRMED
**Evidence:** [v10.0.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/v10.0.0)

- **ESM-only** — CJS support dropped (PR #3577)
- **`render()` became async** — new return shape `{svg, bindFunctions}`, replacing v9's `renderAsync`/callback form
- **`init()` behavior changed** — signature + config-passing updated; `init` marked deprecated in favor of `initialize` + `run`
- **Configurable HTML class** (#3055)

### Finding D1.5.b: v10 → v11 breaking + major changes
**Confidence:** CONFIRMED
**Evidence:** [v11.0.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/v11.0.0)

- **Rendering engine refactor** — `look` config, ELK moved to separate package `@mermaid-js/layout-elk`
- **`useMaxWidth` defaults to `true`** for `git` (#5723) and `sankey` (#5724)
- **Bundle format: ESBuild IIFE replaces UMD** (#4729)
- **New `@mermaid-js/parser` package + langium** — info, pie parsers (#4727, #4751) → foundation for #7094
- **`ExternalDiagramDefinition.splitDiagrams`** added (#4110)
- **`suppressErrorRendering` config** added (#4359)
- **`mermaidAPI` deprecated** (#4821)
- **Default label rendering for flowcharts changed** — v11 treated all labels as markdown initially; partially reverted in 11.13.0 (#7276)

### Finding D1.5.c: No CHANGELOG.md shipped in npm tarball
**Confidence:** CONFIRMED
**Evidence:** `ls node_modules/mermaid/` shows `dist/`, `LICENSE`, `README.md`, `README.zh-CN.md` only

Release notes live at `github.com/mermaid-js/mermaid/releases/tag/mermaid@<version>`.

### Finding D7.a: No official SSR support
**Confidence:** CONFIRMED
**Evidence:** [#3650](https://github.com/mermaid-js/mermaid/issues/3650) (state: open, 2022-10-12), [#6696](https://github.com/mermaid-js/mermaid/issues/6696) (closed 2025-06-27 without SSR fix), [#6634](https://github.com/mermaid-js/mermaid/issues/6634) (state: open); `grep "SSR" node_modules/mermaid/README.md` → no hits

Maintainer statement in #3650: *"a browser environment is required to precompute widths/heights."* Suggested workaround: Vercel Satori / Yoga (not first-party). Community workaround: jsdom + SVGDOM.

### Finding D7.b: `registerExternalDiagrams` with `lazyLoad: false` is the only sync-ish preload path
**Confidence:** CONFIRMED
**Evidence:** `mermaid.core.mjs:1317-1325`

```ts
registerExternalDiagrams(diagrams, { lazyLoad = true })
```

Default `lazyLoad: true` uses the detector-registry + dynamic import pattern. Passing `lazyLoad: false` preloads all registered diagram types upfront — useful for consumers who know they'll render many types and want to avoid per-type import latency.

### Finding D7.c: No first-party memory-leak workaround guidance
**Confidence:** INFERRED (from absence)
**Evidence:** `node_modules/mermaid/README.md` + mermaid.js.org docs grep; no maintainer-authored pattern found

`removeExistingElements` (by id) at start of each render is the primary cleanup lever — callers re-using the same `id` get idempotent DOM replacement. For listeners attached by `bindFunctions`, each call reattaches; no first-party teardown helper is shipped. Aligns with open #4346 (bindFunctions overwrite).

---

## Negative searches

- **Searched:** GH issues for `"StrictMode"`, `"double render"`, `"concurrent"` → #1031 only (unrelated, closed 2019)
- **Searched:** GH issues for `"memory leak"` + `"SPA"` / `"unmount"` → #3227 only (help-wanted, unrelated)
- **Searched:** `README.md` for `SSR`, `server.side`, `server-side`, `nodejs` → no hits
- **Searched:** `mermaid.d.ts:159-183` for `registerDiagrams` → not exported; only `registerExternalDiagrams`

---

## Gaps / follow-ups

- **Bundle impact of `@mermaid-js/parser@^1.1.0` in 11.14.0** — whether the langium internals issue #7094 is fixed at the pinned parser version not verified here. Action: compare chain at `node_modules/@mermaid-js/parser@1.1.0/package.json` → `langium` version.
- **11.14.0 behavior on the #1945 live-theme-swap reproducer** — issue is 5 years old, most recent report on mermaid 8.x. Not reproduced against 11.14.0 in this research pass.
- **Exact scope of `suppressErrorRendering: true` guarantee under rapid chart changes** — does it cleanly close out in-flight queued renders that error mid-flight? Queue semantics not stress-tested.

---

## Vendor-bias flags

None applicable in this dimension — mermaid-js is the project under investigation; their own docs and issues are primary sources. Release notes are primary-source claims from the maintainers about their own code.
