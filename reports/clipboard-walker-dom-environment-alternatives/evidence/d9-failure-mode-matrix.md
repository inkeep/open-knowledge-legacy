# Evidence: D9 — Failure-mode matrix

**Dimension:** Per-pattern × per-failure-mode matrix; concrete cells per (pattern, failure)
**Date:** 2026-05-01
**Sources:** D1-D8 evidence files + prior reports
**Coverage policy:** Synthesis. The most important single deliverable per the rubric.

---

## How to read

Patterns:

- **A** = Live-browser walker (current OK; D4)
- **B1** = react-email model (SSR + React-tree walk + css-tree AST; no DOM library; D5 §2)
- **B2** = textbook SSR + cheerio + juice (D5 §3)
- **B3** = build-time pre-rendered shells (D5 §4)
- **C** = Pattern A + JIT Tailwind compile in browser (D6)
- **D1** = singleton hidden iframe (D7)
- **D2** = on-demand hidden iframe (D7)
- **D3** = iframe-substitute via Shadow DOM (D7)
- **E** = per-descriptor declarative `toClipboardHast` (D8)

Cells use:
- ✅ — fully handled by the pattern as built
- ⚠️ — partial / requires a workaround / gotcha applies
- ❌ — fails as built; would need a sibling pattern alongside
- — — N/A or out-of-scope for the pattern

Citations point to evidence files in this report (relative paths).

---

## Failure modes (rows)

The 13 rows derive from the rubric's enumerated failure modes plus the additional ones surfaced during D1-D8 research.

| Code | Failure mode | Source |
|---|---|---|
| F1 | Pseudo-elements (`::before`, `::after`) — `cloneNode` doesn't copy them | [D4](d4-pattern-a-live-walker.md), [tiptap report line 1615](../../tiptap-clipboard-round-trip-markdown/REPORT.md) |
| F2 | Activity-hidden subtree — React 19.2 `<Activity mode="hidden">` unmounts; `view.nodeDOM(pos)` returns null | [D4](d4-pattern-a-live-walker.md), [D7](d7-hidden-iframe-render-and-walk.md), [memory note](../../../../../../.claude/projects/-Users-edwingomezcuellar-projects-open-knowledge/memory/project_tiptap_activity_hidden_destroys_editor.md) |
| F3 | Inline `<svg>` stripped by Gmail/Outlook/Notion/Slack/GDocs | [cross-app icon report](../../cross-app-clipboard-icon-rendering/REPORT.md) |
| F4 | `oklch()` color not supported by Gmail/Outlook | [cross-app icon report](../../cross-app-clipboard-icon-rendering/REPORT.md) |
| F5 | User-edited content (PM children) needs cascade-resolved styling | [D5](d5-pattern-b-ssr-jsdom-juice.md) §7.4 |
| F6 | Theme drift — emit values diverge from authored values when CSS theme changes | [D8](d8-pattern-e-declarative-hast.md) |
| F7 | Dynamic descriptor state (Toggle open/closed; Accordion expanded/collapsed) | [D4](d4-pattern-a-live-walker.md) F7 |
| F8 | Bundle cost on the editor (every byte ships to user) | [D2](d2-css-inlining-tools-survey.md), [D3](d3-browser-jit-tailwind.md), [D5](d5-pattern-b-ssr-jsdom-juice.md) §7.1 |
| F9 | Maintenance cost (per-descriptor / per-theme-change engineering work) | [D5](d5-pattern-b-ssr-jsdom-juice.md), [D8](d8-pattern-e-declarative-hast.md) |
| F10 | Build-time complexity (CI pipeline, source-map debug, dev-loop friction) | [D5](d5-pattern-b-ssr-jsdom-juice.md) §4 |
| F11 | Descriptor-without-mount (rendering a component the user isn't currently looking at) | [D7](d7-hidden-iframe-render-and-walk.md), [D8](d8-pattern-e-declarative-hast.md) |
| F12 | Latency on Cmd+C (sub-50ms perceptible threshold) | [D4](d4-pattern-a-live-walker.md), [D7](d7-hidden-iframe-render-and-walk.md) §"Side effects + cost data" |
| F13 | MDX nesting (descriptor inside descriptor; user content inside Callout) | [D4](d4-pattern-a-live-walker.md) (per shipped tests), [D5](d5-pattern-b-ssr-jsdom-juice.md) |

---

## Matrix

| Failure mode | A (live walker) | B1 (react-email) | B2 (SSR+juice) | B3 (build-time shells) | C (A + JIT TW) | D1 (singleton iframe) | D2 (on-demand iframe) | D3 (Shadow DOM) | E (toClipboardHast) |
|---|---|---|---|---|---|---|---|---|---|
| **F1** Pseudo-elements | ⚠️ Pseudos require pre-promotion to real DOM children (shipped). Editor-only chrome pseudos must be skipped by class filter. (D4 F1) | ⚠️ Not directly inlinable — routed to non-inline `<style>` block in `<head>`; clipboard destinations that strip `<style>` lose them anyway. (D2 §react-email) | ⚠️ juice `inlinePseudoElements: true` synthesizes `<span>` siblings; mutates DOM shape; "may conflict with CSS selectors elsewhere". (D2 §juice) | ✅ Frozen as real-DOM siblings at build time; same as A's pre-promotion approach. (D5 §4) | Same as A. | Same as A *if* same React render produces the same pseudos; iframe paint works the same way. (D7) | Same as D1. | Same as A; shadow does not change pseudo handling. | ✅ Author writes the pseudo equivalent as a real child element by construction. (D8) |
| **F2** Activity-hidden subtree | ❌ `view.nodeDOM(pos) === null`; walker has nothing to read. Mitigation: defensive null + Pattern Y/E fallback. (D4 F2) | ✅ Renders fresh from props; no Activity coupling. (D5 §6) | ✅ Same — fresh render. | ✅ Shells are pre-rendered; no live coupling. (D5 §4) | Inherits A's failure unless used with B/D/E for hidden content. | ✅ Renders fresh from captured props. (D7 §"What it enables") | ✅ Same. | ⚠️ Shadow DOM can be rendered fresh, BUT React 19.2 `<Activity>` semantics with portals to shadow roots are unverified; D7 §gaps notes this is empirically unconfirmed. | ✅ Function call from props; no DOM dependency. (D8 §Finding 4) |
| **F3** Inline `<svg>` stripped by destinations | ⚠️ Walker emits `<svg>`; destinations strip. Mitigation: Unicode glyph replacement at walker boundary (cross-app icon report D10; not yet shipped). | ⚠️ Same — inline SVG in React tree → inline SVG in HTML → destinations strip. Mitigation identical. | ⚠️ Same. | ⚠️ Same. | Same as A. | Same as A; iframe doesn't alter what destinations do. | Same as D1. | Same as A. | ✅ Author writes the Unicode glyph (or hosted PNG) directly by construction. (D8 + cross-app icon report D10) |
| **F4** `oklch()` color | ⚠️ `getComputedStyle` returns oklch for Tailwind v4 themes; needs `convertCssColors` post-walker (shipped). (D4 F4) | ⚠️ Tailwind compile() emits oklch in CSS; react-email's `getCustomProperties` resolves variables but not color space. (D5 §2.4) | ⚠️ juice resolves CSS variables but doesn't color-convert; same `convertCssColors` needed. (D2 §juice) | ⚠️ Frozen as oklch unless build runs `convertCssColors`. (D5 §5 matrix) | Same as A. | Same as A. | Same as D1. | Same as A. | ✅ Author writes RGB directly; oklch never enters the pipeline. (D8) |
| **F5** User-edited content (children styling) | ✅ Walker visits children; cascade resolves through them. (D4) | ⚠️ Children must arrive as React elements; needs PM-fragment → React converter. Substantial novel surface. (D5 §7.4) | Same — needs PM → HTML adapter. (D5 §7.4) | ❌ Shells are templates; children must be already-styled HTML from somewhere — typically the walker. So B3 forces a hybrid with A. (D5 §4) | Same as A. | ⚠️ If user content rendered in iframe via fresh React, needs PM → React adapter (same as B). If user content rendered in main + descriptor in iframe, hybrid composition. (D7) | Same as D1. | Same — hybrid with A is natural. | ❌ Pattern E owns chrome only; children flow through A or another pattern. Natural composition: E (chrome) + A (children). (D8 §Finding 2) |
| **F6** Theme drift | ✅ Re-resolves via live CSSOM at every copy. (D4) | ⚠️ Tailwind config must mirror live theme; if author authors with different config, drift. (D5 §6 matrix "live theme" row) | ⚠️ Same — supplied stylesheet must match live theme. | ❌ Frozen at build time; theme change requires rebuild. (D5 §4) | Same as A. | ⚠️ Iframe stylesheets must mirror live; if HMR updates Tailwind, iframe head needs re-injection. (D7 §D1 update protocol) | Same as D1. | ⚠️ Shadow inherits parent vars (D7 §D3); for vars-only themes, drift is automatic. For class-derived non-var styles, requires same stylesheet handling as D1/D2. | ❌ Hardcoded inline values drift; same drift class as Pattern Y. (D8) |
| **F7** Dynamic descriptor state | ⚠️ Captures whatever's currently visible (closed Toggle → collapsed shape); leaks live state. (D4 F7) | ✅ Author renders canonical shape from props (`<Toggle open={true}>`). | ✅ Same. | ✅ Pre-rendered canonical shape per variant. | Same as A. | ✅ Renders canonical shape from captured props. | ✅ Same. | ✅ Same. | ✅ Author writes per-state explicitly. (D8) |
| **F8** Bundle cost on editor | ✅ ~50–200 LoC walker; no library deps; **negligible**. (D4 F10) | ❌ react-dom/server + tailwindcss compile + css-tree + react-email tree-walker; estimated ≥300 KB minified per D5 §7.1 / D5 Finding 6. **Largest in survey.** | ❌ react-dom/server + juice/client (cheerio + parse5 + slick + mensch) ≈ 150 KB minified; **large**. (D5 §3.3) | ✅ Just static map of HTML strings (~few KB per descriptor); **negligible**. (D5 §4) | ❌ jit-browser-tailwind 74 KB gzipped (v3 only); Twind 10 KB (stalled); v4 in-browser bundle UNCERTAIN, likely 200–800 KB if `@tailwindcss/oxide-wasm` is bundled. (D3 + D6) | ❌ react-dom + react-frame-component (~5 KB) + iframe lifecycle code; modest base; iframe doesn't add JS bundle, but runtime stylesheet duplication has memory cost. | ❌ Same as D1. | ✅ No iframe; lighter than D1/D2; React run already exists. | ✅ `hast-util-to-html` + `hastscript` ≈ 8 KB minified; **trivial**. (D8) |
| **F9** Maintenance cost (per-descriptor / theme-change) | ✅ Walker is one-and-done; theme changes auto-propagate. (D4) | ⚠️ Tailwind config must stay in sync with live config; one-time setup of `<Tailwind>` per descriptor; theme changes flow if config is shared. (D5 §6) | ⚠️ Stylesheet supplied at build time; theme changes need stylesheet re-supply. (D5 §3) | ❌ Per-variant build artefact; theme changes regenerate at build (not edit-time). (D5 §4) | Same as A. | ⚠️ Iframe stylesheet sync protocol per HMR (D7 §D1). | Same as D1. | Same as D1. | ❌ Per-descriptor `toClipboardHast` is hand-coded; theme changes are 2-file edit per descriptor. (D8) |
| **F10** Build-time complexity | ✅ No build step beyond standard. (D4) | ⚠️ Requires Tailwind v4 setup, css-tree dep, react-email peer deps. Adds Node dep tree at build. (D5 §2.4) | ⚠️ Requires juice + cheerio + supplied CSS string at build/SSR time. (D5 §3) | ❌ Build pipeline adds a "render shells" stage; CI runs `@react-email/render` per descriptor variant. Source-map debug for shells more complex. (D5 §4) | Same as A. | ✅ No build complexity. | ✅ Same. | ✅ Same. | ✅ No build complexity beyond a `toClipboardHast` per descriptor. (D8) |
| **F11** Descriptor-without-mount | ❌ Walker requires live mount. (D4 §"Pattern A's irreducible limit") | ✅ Renders from props, no mount needed. (D5 §6) | ✅ Same. | ✅ Pre-rendered shells need no live mount. | Same as A. | ✅ Renders fresh in iframe from captured props. (D7 §"What it enables") | ✅ Same. | ✅ Same. | ✅ Function call from props. (D8 §Finding 4) |
| **F12** Latency on Cmd+C | ✅ Sub-10ms typical; sub-50ms full-doc. (D4 §"Performance profile"; tiptap report line 1675) | ❌ React tree walk + Tailwind compile + css-tree parse + per-class clone — likely tens of ms warm, 100+ ms cold; race against synchronous `oncopy` window. (D5 §7.2 + Finding 6) | ❌ React render + cheerio parse + juice cascade-walk — similar order to B1; cold path multi-frame. (D5) | ✅ String-template splice — sub-millisecond. (D5 §4) | Same as A. | ⚠️ Pre-warmed iframe avoids creation cost; React mount + paint + walk warm ≈ tens of ms; cold full pipeline 60+ ms iframe + mount + paint + walk per html2canvas data (D7 Finding 4); risks gesture-staleness for async clipboard API. | ❌ Cold path 60ms+ iframe creation alone (D7 Finding 4) + mount + paint + walk; multi-frame; cannot fit synchronous `oncopy` window. (D7 §D2) | ✅ Synchronous mount, no separate Window; lighter than D1/D2. | ✅ Function call → hast → string serialize; sub-millisecond. (D8) |
| **F13** MDX nesting | ✅ Walker recurses through nested children regardless of nesting depth. (D4 — shipped tests) | ⚠️ Requires `<Tailwind>` to wrap the whole tree; nested descriptors must each be valid React. PM → React converter must preserve nesting structure. (D5 §7.2) | ⚠️ Same. | ❌ Build-time shells don't compose with arbitrary MDX nesting; OK would need a shell-per-descriptor + post-process composition step. (D5 §4) | Same as A. | ⚠️ Same as B1 if rendered via React in iframe. | Same as D1. | Same as D1. | ⚠️ Composes with nested children if `toClipboardHast` recursively handles them; one-pass author care needed. (D8 §Finding 2) |

---

## How to read the matrix as a decision framework

Each row is a *required* property of the OK clipboard pipeline. Each column is a candidate pattern.

### Patterns dominated entirely by another pattern (eliminable)

- **C (A + JIT TW)** is dominated by A: Pattern A already gets resolved CSS from the live CSSOM (F4–F6 columns identical, F8 strictly worse for C). C buys nothing A doesn't have. (D6 §Finding 1)
- **D2 (on-demand iframe)** is dominated by D1 (singleton iframe) on F12 (D2 cold path is multi-frame; D1 warm path is sub-frame) and equal on every other dimension. D2 only matters if D1's persistent state contamination is a hard blocker (no evidence it is).
- **B2 (SSR + juice)** is dominated by B1 (react-email) on F1 (B2's pseudo-element hack is uglier), F8 (similar bundle cost; B2 doesn't even resolve CSS variables natively per D2 §Premailer), F9 (B2 needs a CSS string supplied; B1 manages it via Tailwind compile). The only case for B2 over B1 would be a pre-existing juice integration to amortize, which OK doesn't have.

### Patterns that handle a row no other pattern handles

- **A is the only pattern that handles F5 (children) and F6 (theme drift) in F8-cheap fashion** — A reads live CSSOM and inherits cascade for free; nothing else does this without major bundle cost.
- **B1/B3/D1/E are the only patterns that handle F2 (Activity-hidden) and F11 (descriptor-without-mount).** A and C cannot.
- **E and B3 are the only patterns with negligible F8 (bundle cost) AND F12 (latency).** B3 fails F6/F9/F10 (build-time only); E fails F5 (children) and F6 (theme drift).

### The natural compositions

Two compositions handle every row except F3 (which is a separate cross-app concern handled by Unicode glyph replacement at the walker boundary, per cross-app icon report D10):

| Composition | F2 + F11 (descriptor-without-mount) | F5 (children) | F6 (theme drift) | F8/F12 (cost) |
|---|---|---|---|---|
| **A + E** (live walker for content; declarative hast for descriptors) | ⚠️ Falls back to E's hardcoded hast | ✅ A handles | ⚠️ E entries drift | ✅ Trivial |
| **A + D1** (live walker for content; singleton iframe for hidden descriptors) | ✅ D1 handles | ✅ A handles | ⚠️ D1 stylesheet sync needed | ⚠️ ~5 KB react-frame-component + iframe lifecycle code |
| **A + B3** (live walker for content; pre-rendered shells for descriptors) | ✅ B3 handles | ✅ A handles | ❌ B3 frozen until rebuild | ✅ Trivial |

Each composition trades different things. The **A + E** composition is what the OK spec already preserves as the escape hatch (per the rubric: "OK's spec preserved this as escape hatch") and is the simplest in terms of dependencies + maintenance lifecycle.

### Patterns that fail multiple criteria simultaneously

- **B1, B2, D2** all fail F8 (bundle), F12 (latency), AND F10 (build complexity for B1/B2). Adopting any of these means accepting all three costs for a feature that fires on Cmd+C.
- **B3** fails F6 (theme drift), F9 (per-variant maintenance), AND F10 (build pipeline) but is otherwise cheap. Worth considering if the variant set is small and stable; for an evolving descriptor system it accumulates debt.

---

## Findings

### Finding 1: Pattern A meets the rubric's adequacy criteria post the icon-glyph fix; no failure mode justifies replacing it as the primary path

**Confidence:** HIGH.
**Evidence:** D4 §"Adequacy criteria check" — all 5 rubric adequacy criteria pass for Pattern A modulo the icon glyph replacement (which is a walker-localized fix, not a pattern switch). The matrix shows Pattern A's only red cells are F2 (Activity-hidden) and F11 (descriptor-without-mount), both of which are *edge* cases addressable by a sibling pattern (E or D1) used in fallback only.

### Finding 2: Pattern A composed with Pattern E is the smallest sufficient set

**Confidence:** HIGH.
**Evidence:** The matrix shows A + E covers every row except F3 (icon stripping, separate concern) without introducing F8/F10/F12 costs. Maintenance cost (F9) is bounded — per-descriptor `toClipboardHast` for the rare-edge fallback case, not for the hot path. This composition is also what peer editors converged on (Lexical's `exportDOM`, BlockNote's `toExternalHTML`) — but those editors use Pattern E *as primary*, not as fallback, because they don't have OK's live-DOM advantage. (D8 §Finding 1)

### Finding 3: Pattern D1 (singleton iframe) is the only pattern that genuinely *adds capability* over A + E for OK's edge cases — but at meaningful runtime cost

**Confidence:** MEDIUM-HIGH.
**Evidence:** D7 evidence §"What it enables" — D1 uniquely allows rendering the *actual* descriptor's React component (with all its CSS) without main-tree mount. E captures whatever the author hardcodes; D1 captures whatever the React component would render with given props. If the descriptor's appearance is complex enough that hand-coding hast is fragile, D1 is the alternative. The cost is iframe lifecycle complexity (D7 §D1) + stylesheet sync (D7 Finding 6) + memory pinning + `getComputedStyle`-in-iframe gotchas (D7 Finding 2 — `display: none` is unsafe; offscreen `visibility: hidden` is the production-safe pattern).

### Finding 4: Pattern B (any variant) is structurally mismatched for live-editor clipboard

**Confidence:** HIGH.
**Evidence:** D5 evidence §6 + Finding 5 — every peer live editor (Lexical, BlockNote, Plate, Notion, Obsidian Copy-as-HTML) uses real-DOM-or-author-written for copy, NOT SSR + jsdom + juice. Pattern B's home turf is server-side static-HTML emission (emails); copy events are wrong runtime + wrong latency budget for that machinery. (D5 Finding 5)

### Finding 5: jsdom is irrelevant to live-editor clipboard

**Confidence:** HIGH.
**Evidence:** D1 + D2 — jsdom is Node-only by README; juice doesn't use jsdom (uses cheerio); react-email doesn't use jsdom at runtime; happy-dom is Node-targeted (no browser bundle); linkedom has no `getComputedStyle`. None of the surveyed Node-DOM libraries can replace the live browser DOM the walker already consults. (D1 Findings 1-7)

### Finding 6: For OK's specific descriptor-without-mount edge case, the choice is E vs D1, with E winning on bundle and complexity

**Confidence:** HIGH.
**Evidence:** D7 + D8 — both can render from props without a live mount. E is a function call (8 KB hast deps, sub-ms). D1 is an iframe + React mount + stylesheet sync (multi-frame cold; sub-frame warm; persistent DOM + memory). For a *fallback* path that fires rarely (Activity-hidden + Cmd+C), E's predictability and minimal bundle dominate. D1 only wins if the descriptor's render is too complex for a hand-coded `toClipboardHast` to be reliable.

---

## Negative findings

- **No surveyed pattern is uniformly superior.** Every pattern fails at least one row materially.
- **No surveyed CSS-inlining tool runs in-browser at copy time without bundling cheerio + parse5 OR a Servo WASM binary.** (D2 §Finding 4) Even if we wanted "Pattern A but using juice in-browser instead of `getComputedStyle`", juice/client adds ~150 KB and re-implements the cascade more poorly than the live CSSOM does (D2 §juice CSS handling — slick selector parser, no `:has`/`:is`/`:where`).
- **No surveyed Node-DOM library has a CSSOM as complete as a real browser's.** Even jsdom v29 (the best of the set) has 30 open `getComputedStyle` issues (D1 §jsdom).

---

## Gaps / follow-ups

- The matrix's F12 (latency) cells for B1/B2/D1/D2 are inferred from library-source intuition + html2canvas's 60ms iframe-creation measurement. A controlled benchmark — render a `<Callout>` with 5 children inside `<Tailwind>` in browser; time it cold + warm — would replace inference with measurement.
- F11 + F2 cells assume Activity-hidden + descriptor-without-mount are the only "no live DOM" cases. If OK introduces shadow-DOM-rooted descriptors with `mode: 'closed'`, walker would also fail for those — adding a row for it would be appropriate.
- Whether D3 (Shadow DOM) is actually a viable substitute for D1 for OK's case is UNCERTAIN — D7 §D3 notes the inheritance asymmetry (custom properties cross open shadow boundaries; iframes don't). For Tailwind v4 themes via custom properties, this is *cheaper* to integrate than D1, but the implications for descriptor isolation (parent style leakage) need evaluation.
