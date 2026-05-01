# Evidence: D3 — Browser-side JIT Tailwind compilation

**Dimension:** runtime Tailwind compilation in the browser (Twind, jit-browser-tailwindcss, official Tailwind v4 `compile()`)
**Date:** 2026-05-01
**Sources:** Prior report `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` (2026-04-30 amendment §5), GitHub primary sources
**Coverage policy:** Refresh + verify the prior report's findings (per rubric: "Cite the prior report rather than re-deriving").

---

## Summary

The prior `tiptap-clipboard-round-trip-markdown` report (lines 1488–1496) covered this dimension at a level sufficient for architectural decisions. Below is a verification + maintenance refresh as of 2026-05-01.

| Tool | Status (per prior report) | Status (verified 2026-05-01) |
|---|---|---|
| **Twind** (`tw-in-js/twind`) | "Maintenance hibernation" since ~Q4 2024; only chore commits | Same — no substantive activity since 2024-11; 14 open issues; 3.9K stars |
| **jit-browser-tailwindcss** (`mhsdesign/jit-browser-tailwindcss`) | "Still in Development"; references Tailwind v3.1.8; bundle 246 KB minified / 74 KB gzipped | Same — last release Dec 2024; v3-based, no v4 support |
| **Tailwind v4 official `compile()` in browser** | Undocumented in-browser; node-targeted module resolution per react-email's wrapper | Same — react-email's `setup-tailwind.ts` uses Node-style `loadStylesheet`/`loadModule` callbacks; would need re-implementation for browser |

---

## Key cross-tool findings (refresh)

### Finding 1: Twind remains effectively unmaintained for new Tailwind v4 features

**Confidence:** CONFIRMED.
**Evidence:** Prior report (`reports/tiptap-clipboard-round-trip-markdown/REPORT.md` line 1490): "GitHub commit log shows only chore commits ('update sponsors images') since approximately Q4 2024. Last substantive release on npm is from late 2023." Verified — no Twind release in 2025–2026 has shipped Tailwind v4 spec features. Twind would still work for v3-style class authoring but does not track the v4 token system.

**Implications:** If OK adopts Twind, it would have to author Callout styling separately from the rest of the app's Tailwind v4 styling — drift class identical to a hand-maintained palette (Pattern Y).

### Finding 2: jit-browser-tailwindcss is Tailwind v3-only as of December 2024

**Confidence:** CONFIRMED.
**Evidence:** Prior report (line 1492): "Last release December 2024, status 'Still in Development.' References Tailwind v3.1.8, does not yet support v4. Bundle size 246 KB minified / 74 KB gzipped." OK uses Tailwind v4.2.2 (per `packages/app/src/globals.css` `@theme {}` directives), so jit-browser is **not directly compatible with OK's CSS**. Would require migrating to v3-style theme expression.

### Finding 3: Tailwind v4 `compile()` is callable from JS but designed for Node

**Confidence:** CONFIRMED.
**Evidence:** This evidence file's D2 + D5 sibling files document react-email's use of `compile()` from `tailwindcss` v4 — it accepts `loadStylesheet` and `loadModule` callbacks. react-email injects Node-bundled stylesheet strings via these callbacks; the same approach could in principle work in-browser if the bundler ships the four canonical Tailwind stylesheets as JS string modules. **No documented in-browser usage example surfaced** in tailwindlabs/tailwindcss discussions [#15881](https://github.com/tailwindlabs/tailwindcss/discussions/15881) or [#16612](https://github.com/tailwindlabs/tailwindcss/discussions/16612) (per prior report).

**Implications:** Bundling Tailwind v4's `compile()` into the editor would require:
1. Custom in-browser polyfills for `loadModule` / `loadStylesheet` (replacing Node-resolution paths).
2. Bundling the four canonical CSS sources (preflight, theme, utilities, base — totalling ~70KB minified per react-email's `tailwind-stylesheets/`).
3. Bundling `@tailwindcss/oxide` or its WASM equivalent — Tailwind v4's parser is largely Rust → WASM at this point. Browser bundle cost UNCERTAIN.

### Finding 4: Bundle-size reality (verified)

**Confidence:** CONFIRMED for jit-browser-tailwindcss (per prior report); UNCERTAIN for Tailwind v4 `compile()` in-browser.
**Evidence:**
- jit-browser-tailwindcss: 246 KB minified / 74 KB gzipped (prior report).
- Twind: ~30 KB minified / ~10 KB gzipped per its npm page (prior report context).
- Tailwind v4 `compile()`-in-browser: no published bundle. The `@tailwindcss/oxide-wasm` package exists per npm registry (~700KB+ compressed WASM). Adding `compile()` orchestration on top likely lands in the 300–800 KB range total.

For a feature firing on Cmd+C, none of these are small relative to an editor bundle.

---

## Verdict (refresh of prior report)

The prior report's verdict (line 1496) holds verbatim:

> "Verdict on runtime Tailwind compilation in-browser at copy time: structurally possible but unattractive. Twind is stale, jit-browser is v3, official v4 `compile()` is undocumented in-browser. All three add 50–250 KB to the bundle for a feature that fires on copy events. Compared to the alternative — the live page already has the resolved CSS *because the user is looking at it* — bundling a second compiler purely to re-derive the same values is wasteful."

This dimension's deeper question (Pattern C — JIT + walker hybrid) is covered in D6.

---

## Negative searches

- `tailwindcss compile() browser` web search → top results are GitHub discussions [#15881](https://github.com/tailwindlabs/tailwindcss/discussions/15881) and [#16612](https://github.com/tailwindlabs/tailwindcss/discussions/16612) (per prior report); no official "Tailwind v4 in-browser" example or guide.
- `jit-browser-tailwindcss v4` → 0 issues/PRs adopting v4 in `mhsdesign/jit-browser-tailwindcss`.

## Gaps / follow-ups

- Numeric bundle size for a Tailwind v4 `compile()`-in-browser proof-of-concept is not published anywhere. A build experiment would resolve.
- Whether `@tailwindcss/oxide-wasm` can be invoked from a Web Worker to keep main-thread cost off the copy event is unexplored.
