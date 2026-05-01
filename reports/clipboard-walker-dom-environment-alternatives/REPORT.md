---
title: "Clipboard walker DOM-environment alternatives: are jsdom / happy-dom / juice / react-email viable replacements for OK's live-DOM walker, or orthogonal tools?"
description: "Architectural decision framework for OK's clipboard-time HTML emission. Surveys 6 Node-side DOM environments (jsdom / happy-dom / linkedom / parse5 / cheerio / htmlparser2), 7 CSS-inlining tools (juice / Premailer / react-email Tailwind / mailing / inline-css / css-inline), browser-side Tailwind compilers, and 5 architectural patterns (live walker, SSR+juice, build-time shells, hidden iframe, declarative hast). Produces a per-pattern × per-failure-mode matrix and ranked recommendation pinned to OK's Tailwind v4 / React 19 / ProseMirror / MDX / cross-app constraints."
createdAt: 2026-05-01
updatedAt: 2026-05-01
subjects:
  - jsdom
  - happy-dom
  - linkedom
  - parse5
  - cheerio
  - htmlparser2
  - juice
  - Premailer
  - react-email
  - mailing
  - Twind
  - jit-browser-tailwindcss
  - Tailwind v4
  - html2canvas
  - react-frame-component
  - ProseMirror
  - Tiptap
  - Lexical
  - BlockNote
  - Plate
topics:
  - clipboard architecture
  - DOM environment libraries
  - CSS inlining
  - cross-app paste
  - hidden-iframe rendering
  - declarative hast emission
  - Tailwind compilation
  - editor architecture
---

# Clipboard walker DOM-environment alternatives

**Purpose:** OK shipped a clipboard walker (PR #386) that runs at copy time in the browser, reads `view.nodeDOM(pos)` from the live ProseMirror+React render, calls `getComputedStyle(el)` to inline computed styles (post-`convertCssColors` for oklch→rgb), sanitizes attributes, and emits the result as `text/html` for cross-app paste. This report answers: do happy-dom / jsdom / linkedom / parse5 / cheerio / juice / react-email / Premailer represent viable **alternatives** to this walker pattern, or are they orthogonal tools? What are the architectural trade-offs, and what should OK do?

---

## Executive Summary

**The walker is the right tool. Keep it. Compose with `descriptor.toClipboardHast(props)` for the fallback path.**

The library survey tells a clear structural story: jsdom / happy-dom / linkedom / parse5 / cheerio / htmlparser2 are **Node-side DOM environments**. OK's clipboard runs in the browser, where a strictly more capable real DOM + CSSOM is already present. None of these libraries add a capability Pattern A doesn't already have. The CSS-inliner family (juice, Premailer, react-email's Tailwind component, mailing) is built for **render-once-ship-bytes server-side email templates** — fundamentally mismatched with **render-on-event browser clipboard** semantics. Two key facts surfaced from primary-source reads tighten this finding: (1) **juice uses cheerio, not jsdom** — the canonical "jsdom + juice" pipeline assumed in the rubric does not exist in production OSS; (2) **react-email runs Tailwind `compile()` at React-tree-walk time with no DOM library at runtime** — its inlining is per-class rule extraction + AST clone, not a real CSS engine. Both findings further weaken the case for Pattern B variants in OK's runtime.

The hidden-iframe pattern (D7) is the only DOM-environment alternative that adds *capability* — it can render a descriptor's React component from captured props without main-tree mount, surviving Activity-hidden subtree unmounting. But the cost is real: html2canvas reports ~60ms cold iframe creation, CSS custom properties don't cross iframe boundaries (so Tailwind v4 `@theme` tokens require explicit re-injection), constructable adopted stylesheets throw `NotAllowedError` across documents, and `display:none` iframes have unreliable `getComputedStyle` (Bugzilla 548397, 1579345 — production code uses offscreen `visibility:hidden`). For OK's current descriptor inventory, a per-descriptor `toClipboardHast(props)` function — already preserved as an escape hatch in OK's spec — covers the same edge cases at trivial bundle cost (~8 KB of `hastscript` + `hast-util-to-html`).

The per-pattern × per-failure-mode matrix (D9, the centerpiece deliverable of this report) confirms: **Pattern A composed with Pattern E (`toClipboardHast`) covers every failure mode except F3 (inline `<svg>` stripped by destinations)**, and F3 is solved by the walker-localized icon-glyph mapping already recommended in the cross-app-clipboard-icon-rendering report. No criterion in the rubric's adequacy test fails for Pattern A as-shipped (post the icon glyph fix). Per the rubric's own framing — "If any of those are non-adequate, an alternative pattern is justified" — no alternative is justified.

**Key Findings:**

- **Pattern A passes all 5 adequacy criteria** (icons cross-app via glyph fix, `convertCssColors` for oklch, Pattern Y/E fallback for Activity-hidden, MDX nesting per shipped tests, sub-10ms typical latency). No criterion fails. ([D4](evidence/d4-pattern-a-live-walker.md), [D10](evidence/d10-recommendation.md))
- **The 6 Node-side DOM libraries are orthogonal, not alternatives.** Only jsdom v29 (Mar 2026) has a maintained near-complete CSSOM with cascade-resolving `getComputedStyle`, but it's Node-only by README. happy-dom has its own engine but documented inheritance/color/unit gaps. linkedom / parse5 / cheerio / htmlparser2 have no `getComputedStyle` at all. The browser already has what these provide — and more. ([D1](evidence/d1-dom-library-survey.md))
- **juice uses cheerio, not jsdom.** The textbook "SSR + jsdom + juice" pipeline doesn't exist in production code. juice's lib/inline.js operates on a cheerio root with mensch-parsed CSS and slick-tokenized selectors, with specificity tracked manually. ([D2](evidence/d2-css-inlining-tools-survey.md), [D5](evidence/d5-pattern-b-ssr-jsdom-juice.md))
- **react-email runs no DOM library at runtime.** Its `<Tailwind>` component walks the React tree, runs Tailwind's `compile()`, parses the CSS via `css-tree` AST, and clones React elements with resolved styles — all before `renderToReadableStream` ever sees the tree. `@react-email/render` declares jsdom only as a devDependency. ([D5](evidence/d5-pattern-b-ssr-jsdom-juice.md))
- **`@react-email/tailwind` v2.0.7 is deprecated** as of 2026-03-31; functionality migrated into the main `react-email` package. Tailwind v4 compile() is in the runtime path; bundle is ~2 MB unpacked, dominated by the Tailwind compiler + base stylesheets. ([D2](evidence/d2-css-inlining-tools-survey.md))
- **No surveyed live editor uses Pattern B (SSR + jsdom + juice or its react-email variant) for the copy direction.** Lexical's `exportDOM`, BlockNote's `toExternalHTML`, and Plate's `serializeHtml` are author-written-per-node-class with author-supplied inline styles or class pass-through. Pattern B is purely an email-template idiom. ([D5](evidence/d5-pattern-b-ssr-jsdom-juice.md) §8)
- **Hidden-iframe rendering (Pattern D) is validated at production scale by html2canvas** (`document-cloner.ts` master) — but the load-bearing operational facts make it expensive: ~60ms cold iframe creation, no `:root` custom-property inheritance across iframe boundaries, `display:none` iframes have unreliable `getComputedStyle`, constructable stylesheets cannot be adopted across documents. For OK's edge cases, Pattern E is structurally cheaper. ([D7](evidence/d7-hidden-iframe-render-and-walk.md))
- **Pattern A + Pattern E is the smallest sufficient set.** The failure-mode matrix in D9 covers every row at trivial bundle cost (~8 KB hast deps), sub-10ms hot path, sub-ms fallback. ([D9](evidence/d9-failure-mode-matrix.md), [D10](evidence/d10-recommendation.md))
- **Browser-side Tailwind JIT compilers remain unattractive.** Twind is in maintenance hibernation since Q4 2024; jit-browser-tailwindcss is v3-only with no v4 support; Tailwind v4 `compile()` in-browser is undocumented. All bundle 50–800 KB for capability the live CSSOM already provides. ([D3](evidence/d3-browser-jit-tailwind.md), [D6](evidence/d6-pattern-c-jit-walker-hybrid.md))

---

## Research Rubric

**Stance:** Conclusions — produce architectural decision framework + ranked recommendation.
**Framing:** 3P / external library + pattern research; no first-party codebase analysis.

| # | Dimension | Depth | Why |
|---|---|---|---|
| **D1** | DOM-environment library survey — happy-dom, jsdom, linkedom, parse5, cheerio, htmlparser2: purpose, performance profile, API completeness (especially `getComputedStyle`, CSSOM, `style.cssText`), bundle size, maintenance signal (last-commit dates, open issues), browser-vs-Node-only. | Deep | Library-level facts the user needs for any architectural choice. Does each have getComputedStyle? Does each apply Tailwind classes correctly? |
| **D2** | CSS-inlining tools survey — juice (Node), juice/client (browser), Premailer (Ruby), react-email's Tailwind component, mailing's render. Server vs browser availability, internal DOM dep (which use jsdom?), Tailwind compatibility. | Deep | These are the runtime "make styles inline" tools; understanding which depends on jsdom is critical |
| **D3** | Browser-side JIT Tailwind compilation — jit-browser-tailwindcss, Twind, official Tailwind v4 compile() in browser. Refresh maintenance signals + bundle cost. | Moderate | Prior report covered this — refresh + verify still current. Cite the prior report rather than re-deriving |
| **D4** | Pattern A: live-browser walker (current OK approach) — what it captures, what it doesn't, failure modes documented. | Moderate | Reference baseline for comparison |
| **D5** | Pattern B: build-time / SSR + jsdom + juice (react-email) — full architecture. What it captures (static-known descriptor shapes), what it can't (user-edited content, dynamic state). | Deep | The "competing canonical" pattern. Why does it work for emails? Why might it work or not work for clipboard? |
| **D6** | Pattern C: browser-time JIT Tailwind compile + walker hybrid — would shipping a Tailwind compiler help? At what cost? | Moderate | Refresh from prior report |
| **D7** | Pattern D: hidden-iframe render-and-walk — render the React subtree into a hidden iframe at copy time, run getComputedStyle on the iframe's DOM, walk that. Side effects, init cost, what this enables (descriptor-without-mount, Activity-hidden state). | Deep | Novel pattern not surveyed in prior reports; could solve Activity-hidden + descriptor-without-mount cases that the static palette currently handles |
| **D8** | Pattern E: per-descriptor declarative hast emit (no DOM) — `descriptor.toClipboardHast(props): Hast` returns a hand-built hast tree from props. No live DOM dependency. | Moderate | OK's spec preserved this as escape hatch; revisit as architecture-level option |
| **D9** | Failure-mode matrix — per-pattern × per-failure-mode (Activity-hidden, user-edited content, theme drift, MDX nesting, dynamic descriptor state, bundle cost, maintenance cost, build-time complexity, descriptor-without-mount). Concrete cells: pattern X handles failure Y how. | Deep | The decision-framework deliverable |
| **D10** | Adequacy assessment + recommendation — rank for OK's specific constraints (Tailwind v4 oklch, React 19 + ProseMirror, MDX, JsxComponent descriptors with optional hidden state, must work cross-app at Gmail/Notion/Slack/Outlook/GDocs scale). Pin recommendation to evidence + the project constraints. | Synthesis | Closes the loop |

**Non-goals:**
- Re-implementing the walker — assess whether it's the right tool, don't propose a from-scratch redesign
- 1P codebase analysis (the recommendation may inform OK changes; the report stays factual)
- Re-deriving the cross-app destination matrix (already in `cross-app-clipboard-icon-rendering`)
- Recommending a specific React rendering library (assume React 19 + ProseMirror stay)

**Adequacy criteria for "is the walker the right tool":** the walker is "adequate" if it (1) ships icons that render cross-app, (2) inlines computed styles correctly, (3) handles Activity-hidden state without losing the descriptor, (4) doesn't break under MDX nesting, (5) doesn't bottleneck on copy events. *If any are non-adequate, an alternative pattern is justified.*

---

## Detailed Findings

### D1 — DOM-environment library survey

**Finding:** Of the six surveyed libraries, only [jsdom](https://github.com/jsdom/jsdom) has a maintained near-complete CSSOM that resolves the cascade in `getComputedStyle()` (overhauled in v29.0.0, Mar 2026, with repeated targeted improvements through v29.1.1 in Apr 2026). [happy-dom](https://github.com/capricorn86/happy-dom) has its own CSS engine but documented gaps (8 open `getComputedStyle` issues — RGB normalization missing, CSS-variable inheritance broken, missing `:hover`/`:active` resolution, missing `pseudoElt` second argument). [linkedom](https://github.com/WebReflection/linkedom) explicitly has no `getComputedStyle`; CSS support is parser-only via `cssom@0.5.0` (last commit 2023-04-18). [parse5](https://github.com/inikulin/parse5), [cheerio](https://github.com/cheeriojs/cheerio), and [htmlparser2](https://github.com/fb55/htmlparser2) have no DOM, no CSSOM, no `getComputedStyle` — they are HTML-parsing layers, not runtimes.

Bundle-size order (smallest → largest, unpacked tarball): htmlparser2 (235 KB) < parse5 (337 KB) < linkedom (919 KB) < cheerio (1.01 MB) < jsdom (7.03 MB) < happy-dom (8.41 MB).

**Evidence:** [evidence/d1-dom-library-survey.md](evidence/d1-dom-library-survey.md)

**Implications:**
- For OK's clipboard problem, **jsdom is the only library in the set that could theoretically substitute for the browser's CSSOM**. But jsdom is Node-only by README and ships no browser bundle.
- **happy-dom's CSS engine still has documented fidelity gaps relative to a real browser** — adopting it for any cascade-sensitive use would require accepting those gaps.
- linkedom / parse5 / cheerio / htmlparser2 are not candidates for the cascade-resolution task at all.

**Decision triggers (when this matters):**
- If OK ever needs a *server-side* (Node/Edge) clipboard-render path (e.g., for headless export tooling), jsdom v29 is the canonical choice. happy-dom is faster but with caveats. **For browser-side clipboard in the editor process, this entire library category is moot — the browser already has a complete real DOM.**

**Remaining uncertainty:**
- jsdom's modern color (`oklch`/`lab`/`color-mix`) support is not directly confirmed — `@asamuzakjp/css-color@^5.1.11` README was not fetchable in this pass. Not relevant to the recommendation, but flagged.

---

### D2 — CSS-inlining tools survey

**Finding:** [juice](https://github.com/Automattic/juice) and [inline-css](https://github.com/jonkemp/inline-css) both use **cheerio (NOT jsdom)** for HTML manipulation. [Premailer](https://github.com/premailer/premailer) is a Ruby gem irrelevant to JS pipelines. [`@react-email/tailwind`](https://github.com/resend/react-email) v2.0.7 is **deprecated as of 2026-03-31**; the successor `<Tailwind>` component lives inside the main `react-email` package and runs Tailwind v4's `compile()` at React render time, walking a `css-tree` AST — **does NOT use juice, cheerio, or jsdom at runtime**. [mailing](https://github.com/sofn-xyz/mailing) is effectively unmaintained since 2024-05 and uses MJML (not juice). [`@css-inline/css-inline`](https://github.com/Stranger6667/css-inline) is the only surveyed tool with a Servo-derived CSS engine (Rust → N-API + WASM); the only browser-runnable option without bundling cheerio.

The minimal "happy-dom + juice browser-side stack" that the rubric tests does **not exist in published form**. Consumers wanting "happy-dom + juice in browser" would have to (a) Browserify `juice/client` themselves (which bundles cheerio + parse5, NOT happy-dom), or (b) drive happy-dom inside the browser — but juice's `juiceDocument` accepts a cheerio instance, not a DOM.

**Evidence:** [evidence/d2-css-inlining-tools-survey.md](evidence/d2-css-inlining-tools-survey.md)

**Implications:**
- The rubric's premise that "jsdom is critical" for understanding which CSS-inliners depend on it is technically true but *no surveyed tool actually uses jsdom at runtime*. juice and inline-css use cheerio; react-email uses neither; css-inline uses a Rust-derived engine.
- **`@react-email/tailwind` deprecation** materially shifts what "react-email Tailwind" means in 2026 — it now means the in-package `<Tailwind>`, which has the same architectural shape (Tailwind compile + css-tree AST + React tree walk) but lives in a different module.
- **None of these tools are turn-key browser-bundleable + happy-dom-paired** for OK's runtime.

**Decision triggers:**
- If OK ever needs Node-side HTML emission (e.g., for a headless export CLI), juice + cheerio is the established path. css-inline (Rust + N-API) is faster but heavier in deps.
- If OK pursued Pattern B1 (react-email-style), the bundled Tailwind compiler is ~2 MB unpacked.

---

### D3 — Browser-side JIT Tailwind compilation (refresh)

**Finding:** Refresh of prior `tiptap-clipboard-round-trip-markdown` 2026-04-30 amendment — all three options remain unattractive. [Twind](https://github.com/tw-in-js/twind) is in maintenance hibernation since Q4 2024 (only chore commits). [jit-browser-tailwindcss](https://github.com/mhsdesign/jit-browser-tailwindcss) is **Tailwind v3-only** (last release Dec 2024); does not support OK's Tailwind v4. Tailwind v4 official `compile()` is callable from JS but designed for Node — react-email's wrapper uses Node-resolution callbacks (`loadModule` / `loadStylesheet`) that would need browser polyfills, and `@tailwindcss/oxide-wasm` adds ~700KB compressed WASM.

**Evidence:** [evidence/d3-browser-jit-tailwind.md](evidence/d3-browser-jit-tailwind.md)

**Implications:** The prior report's verdict holds: "structurally possible but unattractive. All three add 50–250 KB to the bundle for a feature that fires on copy events." For Tailwind v4 in-browser, the floor is materially higher (likely 200–800 KB total).

---

### D4 — Pattern A (live-browser walker, current OK approach)

**Finding:** Pattern A's algorithm — walk live DOM with `view.nodeDOM(pos)`, call `getComputedStyle(el)`, inline resolved values, post-process with `convertCssColors` for oklch→rgb, sanitize attrs, emit text/html — passes all five adequacy criteria as currently shipped (modulo the in-progress walker-localized icon-glyph fix from the cross-app icon report). Per shipped tests + perf evidence: sub-10ms typical, sub-50ms full-doc; no perf bottleneck.

**Evidence:** [evidence/d4-pattern-a-live-walker.md](evidence/d4-pattern-a-live-walker.md)

**Implications:**
- Pattern A's irreducible limit is "what the user is currently looking at." Activity-hidden subtrees and never-mounted descriptors are not capturable by Pattern A alone — these need a sibling pattern (E or D1) for the rare-edge fallback.
- The 11 documented failure modes (F1-F11 in the evidence file) are all addressed-or-accepted in shipped or in-progress work.

**Decision triggers:**
- If a future descriptor's appearance can't be reliably reproduced from props by hand (e.g., charts, deep-styling-cascade-dependent components), the fallback path needs more than Pattern E — at which point Pattern D1 becomes a candidate.

---

### D5 — Pattern B (SSR + jsdom + juice; react-email model)

**Finding:** The textbook "render React server-side → load HTML+CSS into a Node DOM → juice walks DOM applying cascade → write inline styles" pipeline is conceptually right but mechanically wrong: react-email (the dominant React-based email pipeline, 19K+ stars on `resend/react-email`) does **not** use jsdom, juice, cheerio, or happy-dom at runtime. Its `<Tailwind>` component walks the React tree twice (collect classes / clone with resolved styles), calls Tailwind v4's `compile()`, parses the result via `css-tree` AST, and rewrites elements. The textbook variant (B2: `react-dom/server` + juice + cheerio) is implementable but **no surveyed live editor uses any Pattern B variant for the copy direction**.

The asymmetries between email-template runtime (Node, render-once-ship-bytes, latency amortized over recipients) and clipboard runtime (browser, render-on-event, sub-100ms budget) are foundational. Pattern B's home turf doesn't match.

**Evidence:** [evidence/d5-pattern-b-ssr-jsdom-juice.md](evidence/d5-pattern-b-ssr-jsdom-juice.md)

**Implications:**
- Adopting B1 (react-email-in-browser) for OK clipboard means bundling react-dom/server + Tailwind v4 compiler + css-tree + react-email tree-walker into the editor — D5 §7.1 estimates ≥300 KB minified, dominated by the Tailwind compiler.
- B2 (SSR + cheerio + juice) is dominated by B1: similar bundle, ugly pseudo-element handling (juice synthesizes `<span>` siblings), incomplete CSS-variable resolution, slick selector tokenizer (no `:has`/`:is`/`:where`).
- B3 (build-time pre-rendered shells) collapses to "Pattern Y on steroids" — a static map produced by a build step. Works only for finite, stable descriptor variants; doesn't compose with user-authored variants in OK's MDX system.

**Decision triggers:**
- If OK had a closed descriptor system with finite variants and accepted theme-rebuild-on-change, B3 would be a cleaner-than-Pattern-Y option. Neither precondition holds.

---

### D6 — Pattern C (Pattern A + JIT Tailwind in browser)

**Finding:** Pattern C does not solve a problem Pattern A has. Pattern A's `getComputedStyle` already does cascade resolution from the live CSSOM; running a second JIT Tailwind compiler to re-derive the same values is wasteful. Pattern C only adds value if Pattern A is *replaced* by a render-time pattern (B or D) that needs Tailwind class resolution without a live stylesheet — and even then, injecting parent stylesheets into the iframe is cheaper than running a JIT compiler. Plus: per D3, no surveyed in-browser compiler currently supports Tailwind v4 with manageable bundle size.

**Evidence:** [evidence/d6-pattern-c-jit-walker-hybrid.md](evidence/d6-pattern-c-jit-walker-hybrid.md)

**Implications:** Pattern C is dominated by Pattern A. Eliminable from consideration.

---

### D7 — Pattern D (hidden-iframe render-and-walk)

**Finding:** The hidden-iframe pattern is validated at production scale by [html2canvas](https://github.com/niklasvh/html2canvas) (`src/dom/document-cloner.ts` master) — its `createIFrameContainer` + `documentClone.write()` + `iframeLoader` + `getComputedStyle` walk is the canonical OSS reference. The pattern uniquely enables rendering a descriptor's React component from captured props **without main-tree mount**, with full styling fidelity (the actual React component's CSS, not hand-coded approximations). [react-frame-component](https://github.com/ryanseddon/react-frame-component) provides the React-via-portal-into-iframe lifecycle plumbing.

But the load-bearing operational facts make it expensive:
- **iframe creation cost ~60ms** per html2canvas's reported measurement; "1-2 orders of magnitude more than other DOM elements" per Steve Souders (2009) — architectural reason persists in modern engines (browsing context init).
- **`display:none` iframes have unreliable `getComputedStyle`** (Bugzilla [548397](https://bugzilla.mozilla.org/show_bug.cgi?id=548397), [1579345](https://bugzilla.mozilla.org/show_bug.cgi?id=1579345); Chromium throttles render in `display:none` iframes). Production code uses offscreen `position: fixed; left: -10000px; visibility: hidden`.
- **CSS custom properties do NOT cross iframe boundaries.** Tailwind v4 `@theme` tokens compile to `:root { --color-X: …; }` declarations; without re-injecting Tailwind's compiled CSS into iframe `<head>`, custom properties resolve to initial empty tokens.
- **Constructable adopted stylesheets cannot be shared across iframes** — throw `NotAllowedError` per WICG construct-stylesheets explainer.
- **Stylesheet sync strategies have asymmetric tradeoffs:** mirror parent `<link>` (refetch cost; same-origin only) vs inline `cssRules` content (no refetch; throws on cross-origin) vs pre-bundle the iframe (Storybook approach; not viable for ad-hoc copy iframe).

Pattern D3 (Shadow DOM substitute) is structurally cheaper than D1/D2 for some properties (synchronous, no separate Window, custom properties cross open shadow boundaries via host inheritance) but inherits parent unwanted styles, partly defeating the isolation goal.

**Evidence:** [evidence/d7-hidden-iframe-render-and-walk.md](evidence/d7-hidden-iframe-render-and-walk.md)

**Implications:**
- D1 (singleton iframe) is the operationally tractable variant — amortizes 60ms creation cost across copies, persistent React root, persistent stylesheet sync.
- D2 (on-demand) is dominated by D1 on latency.
- D3 (Shadow DOM) is RESEARCH — viability for OK's Tailwind v4 + isolation requirements is UNCERTAIN.

**Decision triggers:**
- If a future descriptor's rendering complexity outgrows hand-coded `toClipboardHast` reliability, D1 becomes attractive. Until then, the runtime cost is disproportionate to the marginal value.

**Remaining uncertainty:**
- React 19's `<Activity>` semantics with portals to iframe documents are empirically unconfirmed (D7 §gaps). Load-bearing if D1 is adopted.

---

### D8 — Pattern E (per-descriptor declarative hast emit)

**Finding:** `descriptor.toClipboardHast(props): Hast` — each descriptor implements a function that returns a hand-built hast tree from props, captured at PM-fragment-iteration time. No live DOM, no `getComputedStyle`, no iframe, no SSR. Bundle cost ~8 KB (`hast-util-to-html` + `hastscript`). Latency sub-millisecond.

This is **structurally what every peer live editor uses for copy** — Lexical's `exportDOM`, BlockNote's `toExternalHTML`, Plate's `serializeHtml`. The difference: peer editors use Pattern E *as primary* because they don't have OK's stable live DOM at copy time. OK can use Pattern E *as fallback*, getting the best of both worlds.

**Evidence:** [evidence/d8-pattern-e-declarative-hast.md](evidence/d8-pattern-e-declarative-hast.md)

**Implications:**
- Pattern E is the only pattern that handles Activity-hidden + state-purified output **without a live DOM dependency** at trivial bundle cost.
- Composes naturally with Pattern A: A handles content (children) via cascade; E handles descriptor chrome via author-coded hast.
- Theme drift cost: per-descriptor edit on theme change, only for the rare-edge fallback path. Bounded.

---

### D9 — Failure-mode matrix (the centerpiece)

The matrix below maps 13 failure modes (rows) against 9 candidate patterns (columns). Cells use ✅ (handled), ⚠️ (partial / requires workaround), ❌ (fails as built; needs sibling pattern), — (N/A).

**Patterns:**
- **A** = Live-browser walker (current OK)
- **B1** = react-email model (no DOM library at runtime)
- **B2** = textbook SSR + cheerio + juice
- **B3** = build-time pre-rendered shells
- **C** = Pattern A + JIT Tailwind in browser
- **D1** = singleton hidden iframe
- **D2** = on-demand hidden iframe
- **D3** = Shadow DOM substitute
- **E** = per-descriptor declarative `toClipboardHast`

| Failure mode | A | B1 | B2 | B3 | C | D1 | D2 | D3 | E |
|---|---|---|---|---|---|---|---|---|---|
| **F1** Pseudo-elements (`::before`, `::after`) | ⚠️ pre-promote to real DOM (shipped) | ⚠️ routed to `<style>` block | ⚠️ juice synthesizes `<span>` siblings | ✅ frozen as siblings at build | =A | =A | =D1 | =A | ✅ author writes as real children |
| **F2** Activity-hidden subtree | ❌ `view.nodeDOM(pos)===null` | ✅ fresh render from props | ✅ same | ✅ pre-rendered | =A | ✅ fresh render | ✅ same | ⚠️ React 19.2 × portal × shadow unverified | ✅ function call from props |
| **F3** Inline `<svg>` stripped cross-app | ⚠️ Unicode glyph fix at walker boundary | ⚠️ same | ⚠️ same | ⚠️ same | =A | =A | =D1 | =A | ✅ author writes glyph directly |
| **F4** `oklch()` color in output | ⚠️ `convertCssColors` (shipped) | ⚠️ Tailwind compile emits oklch | ⚠️ juice doesn't color-convert | ⚠️ frozen as oklch unless build runs `convertCssColors` | =A | =A | =D1 | =A | ✅ author writes RGB directly |
| **F5** User-edited content (children) | ✅ walker visits children; cascade resolves | ⚠️ needs PM→React adapter | ⚠️ needs PM→HTML adapter | ❌ shells are templates; need A for content | =A | ⚠️ if children rendered in iframe, needs PM→React adapter | =D1 | =D1 | ❌ E owns chrome only; A handles children |
| **F6** Theme drift | ✅ live CSSOM re-resolves every copy | ⚠️ Tailwind config must mirror live theme | ⚠️ supplied stylesheet must match | ❌ frozen until rebuild | =A | ⚠️ iframe stylesheet HMR sync needed | =D1 | ⚠️ shadow inherits parent vars; class-derived needs sync | ❌ hardcoded; per-descriptor edit on theme change |
| **F7** Dynamic descriptor state | ⚠️ captures whatever's visible (closed Toggle → collapsed) | ✅ author renders canonical from props | ✅ same | ✅ pre-rendered canonical | =A | ✅ canonical from captured props | ✅ same | ✅ same | ✅ author writes per-state |
| **F8** Bundle cost | ✅ ~50–200 LoC; **negligible** | ❌ ≥300 KB minified (Tailwind+css-tree+server-React) | ❌ ~150 KB (juice/client+cheerio+parse5) | ✅ static map only; **negligible** | ❌ 50–800 KB compiler | ❌ ~5 KB react-frame-component + lifecycle code; iframe not zero | =D1 | ✅ no iframe; lighter than D1 | ✅ ~8 KB hast deps; **trivial** |
| **F9** Maintenance cost | ✅ one-and-done; theme auto-propagates | ⚠️ Tailwind config sync; theme flows if shared | ⚠️ stylesheet supplied at build | ❌ per-variant build artefact; theme requires rebuild | =A | ⚠️ iframe stylesheet sync per HMR | =D1 | =D1 | ❌ per-descriptor hand-coded; 2-file edit per theme change |
| **F10** Build-time complexity | ✅ no build step | ⚠️ Tailwind v4+css-tree+react-email peer deps | ⚠️ juice+cheerio+supplied CSS at build | ❌ "render shells" stage in CI; source-map debug harder | =A | ✅ none | =D1 | =D1 | ✅ none beyond per-descriptor function |
| **F11** Descriptor-without-mount | ❌ requires live mount | ✅ renders from props | ✅ same | ✅ pre-rendered | =A | ✅ fresh render | =D1 | =D1 | ✅ function call from props |
| **F12** Latency on Cmd+C | ✅ sub-10ms typical; sub-50ms full-doc | ❌ tens of ms warm; 100+ ms cold; race against `oncopy` | ❌ similar; multi-frame cold | ✅ string-template splice; sub-ms | =A | ⚠️ pre-warmed sub-frame; cold 60ms+; gesture-staleness risk | ❌ 60ms+ creation alone; multi-frame cold | ✅ synchronous mount | ✅ function→hast→string; sub-ms |
| **F13** MDX nesting | ✅ recursive walker (per shipped tests) | ⚠️ requires `<Tailwind>` wrap; PM→React preserves nesting | ⚠️ same | ❌ shells don't compose with arbitrary nesting | =A | ⚠️ same as B1 | =D1 | =D1 | ⚠️ composes if `toClipboardHast` recurses |

**How to read the matrix:**

- **Patterns dominated entirely by another pattern (eliminable):** C dominated by A; D2 dominated by D1; B2 dominated by B1.
- **Pattern A is the only pattern that handles F5 (children) AND F6 (theme drift) at F8-cheap cost.** Live CSSOM does the work for free.
- **B1, B3, D1, E are the only patterns that handle F2 (Activity-hidden) and F11 (descriptor-without-mount).** A and C cannot.
- **E and B3 are the only patterns with negligible F8 (bundle) AND F12 (latency).** B3 fails F6/F9/F10 (build-time only); E fails F5/F6 (children + drift cost).
- **The natural compositions** — A handles the rows nothing else handles cheaply; A's ❌ rows (F2, F11) are filled by E or D1. **A + E covers every row except F3** (cross-app icon stripping; addressed by walker-localized glyph fix).

Detailed cell rationale + citations: [evidence/d9-failure-mode-matrix.md](evidence/d9-failure-mode-matrix.md).

---

### D10 — Adequacy assessment + ranked recommendation

**Finding:** Pattern A passes all 5 rubric adequacy criteria as-shipped (modulo the in-progress walker-localized icon glyph fix from the cross-app icon report). Per the rubric: "If any of those are non-adequate, an alternative pattern is justified." None are non-adequate. **No alternative is justified as a wholesale replacement; the question shifts to "what should the fallback path be for the explicit edge cases (Activity-hidden, descriptor-without-mount)?"**

**Evidence:** [evidence/d10-recommendation.md](evidence/d10-recommendation.md)

**Ranked recommendation:**

| Rank | Pattern | Verdict | Why |
|---|---|---|---|
| 1 | **A + E** (live walker + per-descriptor `toClipboardHast` fallback) | **KEEP** | Passes all 5 adequacy criteria; trivial bundle (~8 KB); sub-ms fallback; bounded maintenance per-descriptor only |
| 2 | A + D1 (live walker + singleton hidden iframe) | CONSIDER if descriptor complexity grows | Adds genuine capability for descriptor-without-mount; modest runtime cost; load-bearing UNCERTAIN around React 19 × `<Activity>` × portal |
| 3 | B3 (build-time pre-rendered shells) | NOT NOW | Wrong fit for extensible descriptor system; theme requires rebuild |
| 4 | B1 (react-email-in-browser) | NOT | Bundle (≥300 KB) + latency mismatch for copy-event runtime |
| 5 | B2 (SSR + juice) | NOT | Dominated by B1; juice doesn't actually use jsdom |
| 6 | C (A + JIT TW) | NOT | Dominated by A |
| 7 | D2 (on-demand iframe) | NOT | Dominated by D1 |
| 8 | D3 (Shadow DOM) | RESEARCH | Cheaper than D1 if pattern is taken; viability for OK UNCERTAIN |

**Decision triggers (when the recommendation should be revisited):**

- **Descriptor visual complexity grows** (charts, multi-state cascade-dependent components) such that hand-coded `toClipboardHast` becomes unreliable → evaluate D3 first, then D1.
- **OK introduces a Node-side export tool** (CLI for headless export) → jsdom v29 + cheerio + juice becomes the canonical Node path for that case (orthogonal to clipboard).
- **A future pattern** ships a real Tailwind v4 in-browser compiler with manageable bundle size → re-evaluate Pattern C / D1 with Tailwind sync via the compiler.

**Concrete next steps (engineering — informed by this 3P research):**

1. Land the icon-class-to-glyph mapping at the walker boundary (per cross-app icon report D10).
2. Formalize `descriptor.toClipboardHast(props)` per OK's spec — replace any central Pattern Y static palette with per-descriptor hast functions.
3. Keep the walker's defensive null-check; route to `toClipboardHast` when `view.nodeDOM(pos) === null`.

**Remaining uncertainty (UNCERTAIN claims warranting empirical follow-up):**

These don't change the recommendation but a follow-up empirical pass would tighten confidence:

1. Bundle size for Pattern B1 in-browser (≥300 KB estimate; build experiment would resolve).
2. Latency for Pattern D1 cold path (html2canvas's 60ms is a single-machine, ~10-year-old datapoint).
3. React 19 `<Activity>` × iframe portal interaction (load-bearing if D1 is adopted).
4. Tailwind v4 `compile()` in-browser bundle size (no published example).
5. jsdom v29 oklch / lab / color-mix support (`@asamuzakjp/css-color` README not fetchable in this pass).
6. Pattern D3 (Shadow DOM) viability for OK's Tailwind v4 + isolation requirements.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **D7 paint-timing reliability across browsers** — only Chromium and Firefox bug-tracker evidence cited. Safari / iOS Safari cross-frame `getComputedStyle` semantics not surveyed. Not load-bearing for the recommendation; flagged for future D1 adoption.
- **D1 jsdom oklch coverage** — see UNCERTAIN claim 5 above. `@asamuzakjp/css-color@^5.1.11` README was not fetchable in this pass.
- **D7 React 19 × Activity × portal × iframe** — no production OSS surfaced this exact composition. Empirical verification needed if Pattern D1 is taken.

### Out of scope (per non-goals)

- Re-implementing the walker — explicitly out of scope.
- 1P codebase analysis — research stays factual; recommendation can inform OK changes.
- Cross-app destination matrix — covered in `cross-app-clipboard-icon-rendering`.
- React rendering library choice — assumed React 19 + ProseMirror.

---

## Related Research

- [reports/cross-app-clipboard-icon-rendering/](../cross-app-clipboard-icon-rendering/REPORT.md) — destination matrix (Gmail / Outlook / Notion / Slack / Google Docs strip inline `<svg>`); Unicode glyph replacement recommendation. Referenced for F3 row.
- [reports/tiptap-clipboard-round-trip-markdown/](../tiptap-clipboard-round-trip-markdown/REPORT.md) (2026-04-30 amendment §"CSS-to-inline-style techniques for cross-app HTML emission") — Patterns X/Y/Z/W; html-to-image / dom-to-image / html2canvas / computed-style-to-inline-style library family; perf data on `getComputedStyle`; pseudo-element gotcha; Tailwind v4 oklch / `@theme` notes. This report builds on that amendment with library-level depth (D1, D2) and the hidden-iframe pattern (D7, novel).

---

## References

### Evidence Files
- [evidence/d1-dom-library-survey.md](evidence/d1-dom-library-survey.md) — jsdom, happy-dom, linkedom, parse5, cheerio, htmlparser2 with primary-source-grounded `getComputedStyle` / CSSOM / bundle / maintenance facts
- [evidence/d2-css-inlining-tools-survey.md](evidence/d2-css-inlining-tools-survey.md) — juice (uses cheerio not jsdom), juice/client, Premailer, `@react-email/tailwind` (deprecated 2026-03-31), mailing (unmaintained), inline-css, css-inline (Rust → N-API + WASM)
- [evidence/d3-browser-jit-tailwind.md](evidence/d3-browser-jit-tailwind.md) — Twind / jit-browser / Tailwind v4 compile() refresh; all three remain unattractive
- [evidence/d4-pattern-a-live-walker.md](evidence/d4-pattern-a-live-walker.md) — current OK approach with 11 enumerated failure modes (F1-F11); all addressed-or-accepted
- [evidence/d5-pattern-b-ssr-jsdom-juice.md](evidence/d5-pattern-b-ssr-jsdom-juice.md) — react-email's actual architecture (no DOM library at runtime); B1/B2/B3 variants; peer-editor precedents (Lexical / BlockNote / Plate / Notion / Obsidian)
- [evidence/d6-pattern-c-jit-walker-hybrid.md](evidence/d6-pattern-c-jit-walker-hybrid.md) — Pattern C structurally dominated by Pattern A
- [evidence/d7-hidden-iframe-render-and-walk.md](evidence/d7-hidden-iframe-render-and-walk.md) — html2canvas as canonical OSS reference; 10 findings on iframe creation cost, `display:none` `getComputedStyle` bug, CSS-variable scoping, constructable-stylesheet cross-document `NotAllowedError`
- [evidence/d8-pattern-e-declarative-hast.md](evidence/d8-pattern-e-declarative-hast.md) — `descriptor.toClipboardHast(props)`; ~8 KB hast deps; what peer editors converge on
- [evidence/d9-failure-mode-matrix.md](evidence/d9-failure-mode-matrix.md) — 13 × 9 matrix with detailed cell rationale + 6 cross-pattern findings
- [evidence/d10-recommendation.md](evidence/d10-recommendation.md) — adequacy verdict; ranked patterns; UNCERTAIN claims; concrete next steps
- [meta/worldmodel.md](meta/worldmodel.md) — topology snapshot

### External Sources

#### DOM environments
- [jsdom GitHub](https://github.com/jsdom/jsdom) — v29.0.0 (Mar 2026) overhauled CSSOM; v29.1.1 (Apr 2026) `getComputedStyle()` perf + correctness improvements
- [happy-dom GitHub](https://github.com/capricorn86/happy-dom) — own CSSOM in `packages/happy-dom/src/css/`; documented gaps in 8 open issues
- [linkedom GitHub](https://github.com/WebReflection/linkedom) — README explicitly disclaims `getComputedStyle` and full compliance
- [parse5 GitHub](https://github.com/inikulin/parse5) — WHATWG HTML5 parser; no DOM/CSS
- [cheerio GitHub](https://github.com/cheeriojs/cheerio) — jQuery API over parse5/htmlparser2
- [htmlparser2 GitHub](https://github.com/fb55/htmlparser2) — fast HTML/XML tokenizer

#### CSS-inlining tools
- [juice GitHub](https://github.com/Automattic/juice) — uses cheerio (`package.json`: `"cheerio": "1.0.0"`); CSS via mensch; selectors via slick
- [juice/client.js source](https://raw.githubusercontent.com/Automattic/juice/master/client.js) — `var cheerio = require('./lib/cheerio');`
- [@react-email/tailwind v2.0.7 deprecated](https://www.npmjs.com/package/@react-email/tailwind) — `"deprecated": "Package no longer supported"`
- [react-email setup-tailwind.ts](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/utils/tailwindcss/setup-tailwind.ts) — `import { compile } from 'tailwindcss'; ... compiler.build(candidates)`
- [react-email tailwind.tsx](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/tailwind.tsx) — two `mapReactTree` calls + `cloneElementWithInlinedStyles`
- [react-email render.tsx](https://raw.githubusercontent.com/resend/react-email/main/packages/render/src/node/render.tsx) — no DOM ever instantiated; just `react-dom/server` streaming
- [Premailer GitHub](https://github.com/premailer/premailer) — Ruby gem; Nokogiri parser
- [@css-inline/css-inline GitHub](https://github.com/Stranger6667/css-inline) — Servo-derived Rust → N-API + WASM
- [inline-css GitHub](https://github.com/jonkemp/inline-css) — uses cheerio; "Inspired by the juice library"
- [mailing-core GitHub](https://github.com/sofn-xyz/mailing) — last meaningful commit 2024-05-14; uses MJML, not juice

#### Hidden-iframe pattern
- [html2canvas src/dom/document-cloner.ts](https://github.com/niklasvh/html2canvas/blob/master/src/dom/document-cloner.ts) — `createIFrameContainer` + `documentClone.write()` + `iframeLoader` + `getComputedStyle` walk
- [html2canvas issue #492](https://github.com/niklasvh/html2canvas/issues/492) — "iFrame generation takes 60ms on its own"
- [react-frame-component src/Frame.jsx](https://github.com/ryanseddon/react-frame-component/blob/master/src/Frame.jsx) — React-via-portal-into-iframe lifecycle plumbing
- [Bugzilla 548397](https://bugzilla.mozilla.org/show_bug.cgi?id=548397) — Firefox returned null for `getComputedStyle` in `display:none` iframes
- [Bugzilla 1579345](https://bugzilla.mozilla.org/show_bug.cgi?id=1579345) — `getComputedStyle` doesn't reflect injected stylesheets in `display:none` iframes
- [Chromium blink-dev: iframe render throttling PSA](https://groups.google.com/a/chromium.org/g/blink-dev/c/op-z7fMMmWY) — `display:none` cross-origin iframes lose rAF + ResizeObserver
- [Steve Souders: Using Iframes Sparingly (2009)](https://www.stevesouders.com/blog/2009/06/03/using-iframes-sparingly/) — "1-2 orders of magnitude more expensive than other DOM elements"
- [web.dev: Constructable Stylesheets](https://web.dev/articles/constructable-stylesheets) — `NotAllowedError` for cross-document adoption
- [MDN HTMLIFrameElement.contentWindow](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/contentWindow)
- [MDN Window.getComputedStyle](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)

#### Browser Tailwind compilers
- [Twind GitHub](https://github.com/tw-in-js/twind) — maintenance hibernation since Q4 2024
- [jit-browser-tailwindcss GitHub](https://github.com/mhsdesign/jit-browser-tailwindcss) — Tailwind v3 only; 246 KB minified / 74 KB gzipped
- [tailwindlabs/tailwindcss discussion #15881](https://github.com/tailwindlabs/tailwindcss/discussions/15881)
- [tailwindlabs/tailwindcss discussion #16612](https://github.com/tailwindlabs/tailwindcss/discussions/16612)

#### Peer editor precedents
- [Lexical packages/lexical-html/src/index.ts](https://github.com/facebook/lexical/blob/main/packages/lexical-html/src/index.ts) — `$generateHtmlFromNodes`; per-node `exportDOM` author-written
- [BlockNote serializeBlocksExternalHTML.ts](https://github.com/TypeCellOS/BlockNote/blob/main/packages/core/src/api/exporters/html/util/serializeBlocksExternalHTML.ts) — `toExternalHTML` per-block
- [Plate juice plugin source](https://raw.githubusercontent.com/udecode/plate/main/packages/juice/src/lib/JuicePlugin.ts) — wires juice into PASTE direction (`parser.transformData`), not export
- [Plate platejs.org/docs/html](https://platejs.org/docs/html) — class pass-through approach
- [Obsidian Copy-as-HTML plugin](https://github.com/mvdkwast/obsidian-copy-as-html) — hardcoded `DEFAULT_STYLESHEET` constant
