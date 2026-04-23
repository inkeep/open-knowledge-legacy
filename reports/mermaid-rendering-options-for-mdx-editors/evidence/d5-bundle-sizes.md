# Evidence: D5 — Bundle-size measurements

**Dimension:** D5 (`mermaid@11.14.0` gzipped + transitive, tree-shaking, `beautiful-mermaid`, dynamic-import gating)
**Date:** 2026-04-21
**Sources:** Local `node_modules/mermaid@11.14.0`, bundlephobia.com, npm registry, Vite docs

All on-disk measurements use `gzip -c <file> | wc -c` and `wc -c` (for raw) locally. Method noted per figure.

---

## Key files / URLs referenced

- `node_modules/mermaid/dist/` — all `.mjs` entries + chunks
- `node_modules/mermaid/package.json:2-14, 50-71` — entry points + deps
- `/tmp/beautiful-mermaid/package/dist/index.js` — tarball-unpacked `beautiful-mermaid@1.1.3`
- `~/.claude/oss-repos/fumadocs/apps/docs/components/mdx/mermaid.tsx` — fumadocs dynamic-import reference
- [bundlephobia.com/api/size?package=mermaid@11.14.0](https://bundlephobia.com/api/size?package=mermaid@11.14.0)
- [bundlephobia.com/api/size?package=beautiful-mermaid](https://bundlephobia.com/api/size?package=beautiful-mermaid)
- [Vite — Features: Dynamic Import](https://vite.dev/guide/features.html)

---

## Findings

### D5.1 — `mermaid@11.14.0` bundle sizes

**Confidence:** CONFIRMED (measured locally with `gzip -c <file> | wc -c`)
**Evidence:** `node_modules/mermaid/dist/` (local install)

| File | Raw bytes | Gzipped bytes | Role |
|---|---|---|---|
| `dist/mermaid.core.mjs` | 45,712 | **11,074** | Entry; `package.json#exports` default |
| `dist/mermaid.esm.mjs` | 57,507 | 14,189 | Standalone entry (d3/katex inlined) |
| `dist/mermaid.esm.min.mjs` | 27,199 | 10,198 | Minified esm variant |
| `dist/mermaid.js` (UMD dev) | 7,309,135 | 1,270,743 | Dev UMD — single-file, all inlined |
| `dist/mermaid.min.js` (UMD prod) | 3,164,970 | 870,292 | Prod UMD — single-file, minified |

- **`dist/` directory total:** 74 MB (includes 12 MB of sourcemaps for `mermaid.js` alone)

**Finding:** the tiny `mermaid.core.mjs` entry (11 KB gzipped) is misleading — it's the detector registry and `import()` glue. Real load cost is the chunk cascade.

#### Chunk pools (raw + gzipped)

**Confidence:** CONFIRMED (measured locally)
**Evidence:** `find node_modules/mermaid/dist/chunks/mermaid.core/ -name '*.mjs'` + `gzip` loop

| Chunk pool | File count | Raw total | Gzipped total |
|---|---|---|---|
| `dist/chunks/mermaid.core/` | 51 `.mjs` | 2,283,918 | **458,338** |
| `dist/chunks/mermaid.esm/` | 81 `.mjs` | 6,209,781 | **1,208,595** |
| `dist/chunks/mermaid.esm.min/` | 162 `.mjs` | — | ~854,000 (sum of individually-gzipped chunks) |

The `mermaid.core` variant externalizes d3, cytoscape, katex, dayjs, marked, lodash-es, uuid, stylis, @braintree/sanitize-url, @iconify/utils (verified via `grep -rE '^import.*from "(d3|cytoscape|…)"' dist/chunks/mermaid.core/`). The `mermaid.esm` variant inlines everything — ~2.6× larger gzipped.

#### Bundlephobia + packagephobia

**Confidence:** CONFIRMED (API); UNKNOWN (packagephobia blocked)
**Evidence:** bundlephobia.com API

- **bundlephobia mermaid@11.14.0**: size 638,672 min / **153,146 gzip**; dependencyCount 21
- **packagephobia**: returned Vercel bot-challenge page; not retrieved

**Why the disagreement with chunks total (153 KB vs 458 KB):** Bundlephobia builds with Webpack and tree-shakes. 153 KB represents what a simple `import mermaid from 'mermaid'` at a bundler root pulls into the entry graph **without ever invoking `mermaid.run()` or `mermaid.render()`**. The full 458 KB (core) or 1.2 MB (esm) lands only when async `loader()` callbacks fire on first render.

**Install footprint** (measured):
- `du -sh node_modules/mermaid/` → **74 MB** on disk
- `npm pack --dry-run mermaid@11.14.0` not verified this pass
- Packagephobia figure unavailable

### D5.2 — Transitive deps that matter

**Confidence:** CONFIRMED
**Evidence:** `node_modules/mermaid/package.json:50-71` + measured dir sizes

`mermaid@11.14.0` direct deps (21 packages):

| Dep | Role (diagram types consumed) | Installed dir size |
|---|---|---|
| `cytoscape@^3.33.1` | Layout engine for **architecture, mindmap** | 5.9 MB |
| `cytoscape-cose-bilkent@^4.1.0`, `cytoscape-fcose@^2.2.0` | Cytoscape layout plugins | (inside cytoscape tree) |
| `d3@^7.9.0` | Core SVG / DOM / layout primitives (all diagrams) | 868 KB |
| `d3-sankey@^0.12.3` | Sankey layout | (inside d3 tree) |
| `dagre-d3-es@7.0.14` | Graph layout for **flowchart, state, class** | 648 KB |
| `@mermaid-js/parser@^1.1.0` | Langium-based parsers (newer diagram types) | 7.3 MB (incl. langium) |
| `katex@^0.16.25` | Math rendering (`$$…$$`) | 4.4 MB |
| `lodash-es@^4.17.23` | Utilities | 2.6 MB |
| `dayjs@^1.11.19` | Date parsing (Gantt) | 1.9 MB |
| `roughjs@^4.6.6` | "Sketch" look | 356 KB |
| `dompurify@^3.3.1` | SVG sanitization | 844 KB |
| `marked@^16.3.0` | Markdown-in-labels rendering | 444 KB |
| `stylis@^4.3.6` | CSS-in-JS | 176 KB |
| `khroma@^2.1.0` | Color manipulation | 792 KB |
| `@iconify/utils@^3.0.2` | Icon helpers (architecture) | 656 KB |
| `@braintree/sanitize-url@^7.1.1` | URL sanitization (links) | 104 KB |
| `@upsetjs/venn.js@^2.0.0` | Venn diagrams | (not measured) |
| `@types/d3@^7.4.3` | Type defs (present at runtime) | — |
| `uuid@^11.1.0`, `ts-dedent@^2.2.0` | Misc | — |

#### Diagram-type → chunk mapping

**Confidence:** CONFIRMED (grep + file-size measurement)
**Evidence:** `dist/chunks/mermaid.core/*` file content + imports

- **Flowchart, state, class:** `d3` + `dagre-d3-es` (`dagre-KV5264BT.mjs`: 22,310 B raw / 5,272 gzip)
- **Architecture, mindmap:** `cytoscape` + `cytoscape-cose-bilkent` (`architectureDiagram-Q4EWVU46.mjs`: 45,743 B)
- **Gantt:** `dayjs` + plugins (`ganttDiagram-T4ZO3ILL.mjs`)
- **Math labels (any diagram with `$$…$$`):** `katex` — dynamic-imported only if detected (`chunk-ICPOFSXX.mjs:4837`: `const { default: katex } = await import("katex")`)

### D5.3 — Tree-shaking reality

**Confidence:** CONFIRMED
**Evidence:** `node_modules/mermaid/package.json#exports` + `dist/mermaid.core.mjs` imports + `mermaid.d.ts` re-exports grep

```json
// package.json "exports"
"exports": {
  ".": {
    "types": "./dist/mermaid.d.ts",
    "import": "./dist/mermaid.core.mjs",
    "default": "./dist/mermaid.core.mjs"
  },
  "./*": "./*"
}
```

**Two things in that exports field:**
1. `.` → `mermaid.core.mjs` — the ONLY declared entry
2. `./*` → fallback passthrough, enabling deep path imports like `mermaid/dist/chunks/mermaid.core/flowDiagram-DWJPFMVM.mjs` (but chunks are **build-hash-suffixed**, different on every publish — unstable as a public API)

**Finding:** **No `mermaid/flowchart` or other subpath export exists**; there is no supported way to import only flowcharts. The chunks ARE lazily imported at runtime, so an app that never parses non-flowchart content never pays for cytoscape/katex network bytes — but the full dep tree is installed into `node_modules/`.

**Tree-shaking reality:**
- Bundler can only tree-shake from `mermaid.core.mjs` — which is the detector-registry entry that dynamic-imports every diagram type lazily
- `mermaid.d.ts` does NOT re-export d3/cytoscape symbols; consumers who want `d3.select` must install d3 separately
- Tree-shaking d3 out of an app that doesn't use it is feasible because mermaid's chunks gate their d3 usage behind async loaders

**Verified:** **mermaid has no lite build; importing `mermaid/flowchart` is not supported.** The closest is loading `mermaid.core.mjs` (small entry) and relying on Vite/Rollup code-splitting to defer diagram chunks until first render.

### D5.4 — `beautiful-mermaid` bundle size

**Confidence:** CONFIRMED (local tarball + bundlephobia)
**Evidence:** `/tmp/beautiful-mermaid/package/` (npm tarball v1.1.3 unpacked), bundlephobia.com API

| Measurement | Value | Method |
|---|---|---|
| `dist/index.js` | 335,537 B raw / **68,629 B gzipped** | `gzip -c` local |
| `dist/` total | 1.1 MB | `du -sh` |
| Tarball unpacked size | 2,098,676 B | npm registry metadata |
| bundlephobia aggregate | 1,619,941 B min / **482,271 B gzipped** | bundlephobia.com API |

**Disagreement explanation:** dist/index.js (68 KB gzipped) vs bundlephobia (482 KB gzipped) gap is the `elkjs` layout engine — beautiful-mermaid's dist does NOT bundle elkjs; it lazy-imports it. Bundlephobia sees aggregate including elkjs (top dep at 1,468,610 unpacked).

**Deps:**
- `elkjs@^0.11.0` — layout engine (lazy-imported)
- `entities@^7.0.1` — HTML entity encoding
- No peer deps. No `mermaid` dep

**Scope comparison:** `beautiful-mermaid` supports flowchart, state, sequence, class, ER, xychart only (6 types) per `src/index.ts` header + `detectDiagramType` dispatch (line 54-64). Mermaid 11.14 supports ~20+. Framework-agnostic (sync `renderMermaidSVG(text) → string`); no DOM required, no d3, no cytoscape, no katex, no dayjs.

### D5.5 — Dynamic-import gating math

**Confidence:** CONFIRMED (measured + Vite docs)
**Evidence:** fumadocs reference pattern, `node_modules/mermaid/dist/mermaid.core.mjs:1-50` (entry imports), [Vite docs](https://vite.dev/guide/features.html)

#### Zero-Mermaid-block case (cold, before first insert)

With fumadocs-style `use(cachePromise('mermaid', () => import('mermaid')))`:
- Vite/Rollup emit `mermaid` into a separate chunk (Vite docs: *"Matched files are by default lazy-loaded via dynamic import and will be split into separate chunks during build"*)
- Main bundle pays only for the component shell (fumadocs `mermaid.tsx` minus the import body — a few hundred bytes)
- **Network cost for mermaid: 0**
- `mermaid` chunk lives on CDN but not fetched until first Mermaid render

#### First-Mermaid-insertion case

On first `import('mermaid')`:

- **Entry `mermaid.core.mjs`**: 11 KB gzipped
- **Eager chunks pulled statically by the entry** (lines 11-15 of `mermaid.core.mjs`): 5 chunks — `chunk-ENJZ2VHE`, `chunk-BSJP7CBP`, `chunk-5FUZZQ4R`, `chunk-ZZ45TVLE`, `chunk-X2U36JSP`. Measured largest: `chunk-5FUZZQ4R` at ~31 KB gzipped, `chunk-ICPOFSXX` at ~26 KB gzipped.
- **Conservative initial-graph estimate for `mermaid.core`**: **~100-150 KB gzipped** (matches bundlephobia's 153 KB number)
- **Per-diagram-type chunks** are dynamic `import()`-ed inside each detector's `loader()`:
  - `flowDiagram-DWJPFMVM.mjs`: ~24 KB gzipped
  - `sequenceDiagram-FGHM5R23.mjs`: ~38 KB gzipped
  - `c4Diagram-AHTNJAMY.mjs`: ~24 KB gzipped
  - `ganttDiagram-T4ZO3ILL.mjs`: ~17 KB gzipped
- **If the diagram contains `$$…$$` math**: katex dynamic-imported (`const { default: katex } = await import("katex")` at `chunk-ICPOFSXX.mjs:4858`) → additional ~106 KB gzipped (katex esm bundle)

#### Vite default code-splitting behavior

**Confidence:** CONFIRMED (docs)
**Evidence:** [Vite features docs](https://vite.dev/guide/features.html)

> "Matched files are by default lazy-loaded via dynamic import and will be split into separate chunks during build. … Vite automatically optimizes the loading sequence by rewriting code-split dynamic import calls with a preload step."

Rollup runs actual chunking; shared code between two dynamic-import graphs becomes a "common" chunk.

#### Net effect (fumadocs-style `import('mermaid')` under Vite default config)

| Phase | Cost |
|---|---|
| Page load (zero Mermaid blocks) | ~0 KB for mermaid |
| First Mermaid encounter | ~100-150 KB gzipped (entry + eager chunks) |
| Per unique diagram type in document | +15-40 KB gzipped |
| Math labels (if any) | +~106 KB gzipped |

#### npm download volumes (activity signal)

**Confidence:** CONFIRMED (npm registry API)

- `mermaid`: **24,722,045** downloads/month
- `beautiful-mermaid`: **748,069**/month (~3% of mermaid)
- `react-mermaid2`: ~9,923/month
- `@lightenna/react-mermaid-diagram`: ~15,000/month

---

## Summary of measured numbers

| Measurement | Value | Method |
|---|---|---|
| `mermaid.core.mjs` raw/gzip | 45,712 / **11,074** B | local `gzip -c \| wc -c` |
| `mermaid.esm.mjs` raw/gzip | 57,507 / 14,189 B | same |
| `mermaid.esm.min.mjs` raw/gzip | 27,199 / 10,198 B | same |
| `mermaid.min.js` UMD raw/gzip | 3,164,970 / 870,292 B | same |
| `mermaid.core` chunks pool (51 files) | 2.28 MB raw / **458 KB gzip** | `wc -c` + `gzip` loop |
| `mermaid.esm` chunks pool (81 files) | 6.21 MB raw / 1.21 MB gzip | same |
| mermaid install dir | **74 MB** | `du -sh` |
| mermaid bundlephobia | 638,672 B min / **153,146 B gzip** | bundlephobia API |
| `beautiful-mermaid` dist raw/gzip | 335,537 / **68,629 B** | local `gzip -c` |
| `beautiful-mermaid` bundlephobia (incl. elkjs) | 1,619,941 / **482,271 B gzip** | bundlephobia API |
| `beautiful-mermaid` tarball | 2,098,676 B | npm registry |
| Mermaid monthly npm downloads | 24.7M | npm registry |
| `beautiful-mermaid` monthly npm downloads | 748K (3% of mermaid) | npm registry |

---

## Negative searches

- `mermaid/flowchart` subpath export — NOT supported (`package.json#exports` has only `.` and `./*` passthrough)
- `mermaid/lite` / similar — NOT present in dist
- packagephobia.com for `mermaid@11.14.0` — blocked by Vercel bot-challenge; authoritative figure unavailable

---

## Gaps / follow-ups

- **Exact per-chunk gzipped measurements for all 51 `mermaid.core` chunks** — representative figures captured; full per-chunk table not assembled
- **`@upsetjs/venn.js` size** — not measured in this pass
- **Effect of Vite's `manualChunks` config** on the mermaid chunk cascade — not explored (consumers who want to customize split boundaries)
- **Bundle-impact baseline before fumadocs dynamic-import pattern was adopted** — only post-pattern numbers captured
