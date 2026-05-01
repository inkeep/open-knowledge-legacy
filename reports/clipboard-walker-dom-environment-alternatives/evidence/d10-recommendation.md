# Evidence: D10 — Adequacy assessment + ranked recommendation

**Dimension:** Synthesis. Rank patterns for OK's specific constraints; pin recommendation to evidence.
**Date:** 2026-05-01
**Sources:** D1-D9 evidence files; rubric's adequacy criteria; OK's stated constraints
**Stance:** Conclusions (per scoping).

---

## OK's specific constraints (per rubric)

1. Tailwind v4 with `oklch()` default color
2. React 19 + ProseMirror (non-negotiable per non-goals)
3. MDX descriptor system with optional hidden state
4. `JsxComponent` descriptors must work cross-app at Gmail / Notion / Slack / Outlook / Google Docs
5. Editor runs in browser; copy fires on Cmd+C; sub-perceptible-threshold latency budget

---

## Adequacy criteria (rubric verbatim)

The walker is "adequate" if it:

1. Ships icons that render cross-app (per prior report — currently doesn't with inline SVG, but the icon-class-to-glyph mapping fix is small and walker-localized)
2. Inlines computed styles correctly (yes, post-`convertCssColors`)
3. Handles Activity-hidden state without losing the descriptor (yes via static palette fallback)
4. Doesn't break under MDX nesting (yes per shipped tests)
5. Doesn't bottleneck on copy events (sub-ms `getComputedStyle`)

---

## Adequacy verdict

**Pattern A passes 4 of 5 adequacy criteria as-shipped, plus passes #1 as-modified by the in-progress icon glyph fix from the cross-app icon report.** Concretely:

| Criterion | Pattern A status | Evidence |
|---|---|---|
| 1. Icons render cross-app | Currently NO; small walker-localized fix → YES | [cross-app icon report D10](../../cross-app-clipboard-icon-rendering/REPORT.md) |
| 2. Inlines computed styles correctly | YES (post-`convertCssColors`) | [D4](d4-pattern-a-live-walker.md) §"What it captures" |
| 3. Activity-hidden state handled | YES (static palette / Pattern Y/E fallback) | [D4](d4-pattern-a-live-walker.md) F2; [D8](d8-pattern-e-declarative-hast.md) §Finding 4 |
| 4. MDX nesting | YES (per shipped tests) | [D4](d4-pattern-a-live-walker.md) §"Adequacy criteria check" |
| 5. Copy-event latency | YES (sub-10ms typical, sub-50ms full-doc) | [D4](d4-pattern-a-live-walker.md) §"Performance profile"; [tiptap report line 1675](../../tiptap-clipboard-round-trip-markdown/REPORT.md) |

**Therefore no criterion fails in a way that requires switching off Pattern A.** Per the rubric's own framing: "If any of those are non-adequate, an alternative pattern is justified." None are non-adequate.

The question shifts from "should we replace Pattern A?" to "what should the *fallback path* be for the edge cases Pattern A explicitly admits it doesn't handle (Activity-hidden, descriptor-without-mount)?"

---

## Ranked recommendation

### Rank 1 (KEEP): Pattern A as primary, Pattern E (`toClipboardHast`) as fallback

**Composition:**
- **Hot path:** Pattern A — the live-DOM walker as currently shipped. Reads `view.nodeDOM(pos)`, calls `getComputedStyle`, post-processes with `convertCssColors`, sanitizes attrs. Add the cross-app icon glyph replacement (per cross-app icon report D10) as the next walker-localized change.
- **Fallback path (used when `view.nodeDOM(pos) === null`):** Pattern E — each descriptor's `toClipboardHast(props)` returns a hand-built hast tree from the props captured during PM-fragment iteration. The current "Pattern Y static palette" fallback is functionally already this — formalizing it as `descriptor.toClipboardHast(props)` per the OK spec preserves the API surface and makes the fallback palette per-descriptor rather than central.

**Why:**

- Passes all 5 rubric adequacy criteria.
- Bundle cost trivial (walker ~50–200 LoC; hast deps ~8 KB).
- Latency: sub-10ms typical, hast-fallback sub-millisecond.
- Theme drift handled automatically by the walker for the hot path; bounded for `toClipboardHast` (per-descriptor edit on theme change, only for the rare-edge fallback). The drift is *not* hot-path drift — it's drift on a fallback used in <1% of copies.
- Failure-mode matrix (D9 §Finding 2) confirms A + E covers every row except F3 (icon stripping; addressed by the walker-localized glyph fix already in flight).
- No new library dependency (jsdom / happy-dom / juice / react-email Tailwind / iframe lifecycle code) introduced.

**Risks accepted:**

- Per-descriptor `toClipboardHast` requires authors to keep their fallback hast in rough sync with their live React component. Theme changes are 2-file edits *for descriptors only* — bounded.
- F11 (descriptor-without-mount) for genuinely never-mounted descriptors (e.g., a Callout the user is copying from a never-rendered Activity branch) gets the hardcoded `toClipboardHast` shape; if that doesn't match the live theme, the cross-app paste degrades gracefully (still readable; just static colors). Acceptable for an edge case.

**Concrete next steps (engineering):**

1. Land the icon-class-to-glyph mapping at the walker boundary (per cross-app icon report D10).
2. Formalize `descriptor.toClipboardHast(props)` per OK's spec — replace the central Pattern Y static palette with per-descriptor hast functions.
3. Keep fallback null-check in walker; route to `toClipboardHast` when `view.nodeDOM(pos) === null`.

### Rank 2 (CONSIDER for high-fidelity edge cases): Pattern A + Pattern D1 (singleton hidden iframe)

**When this becomes relevant:** if a future OK descriptor's appearance is complex enough that a hand-coded `toClipboardHast` is fragile (e.g., a chart, a multi-state Toggle with deep visual hierarchy, a descriptor whose styling depends on dozens of cascading classes). For the current descriptor inventory (Callout, Toggle, Accordion, etc.), Pattern E is sufficient.

**What it would look like:**
- Singleton hidden iframe created at editor init, with parent stylesheets mirrored into iframe `<head>` via cssRules iteration (D7 §D1).
- React root persistent in iframe; `root.render(<Descriptor {...props} />)` on copy event.
- Walker walks iframe DOM via `getComputedStyle(iframe.contentWindow, el)`.
- Stylesheet HMR sync needed.

**Costs:**
- F8: react-frame-component (~5 KB) + iframe lifecycle code (~100 LoC custom or import).
- F12: warm path sub-frame; cold path multi-frame (60ms+ for first iframe per html2canvas; React mount + paint variable).
- Stylesheet duplication memory cost.
- Tailwind v4 `:root` custom-property re-injection complexity (D7 §"CSS variable / Tailwind v4 scoping problem").
- F2 ⚠️ — React 19.2 `<Activity>` semantics with portals to iframe documents are unverified (D7 §gaps). Worth empirical testing if this path is taken.

**Why Rank 2 not 1:** the cost is real and the marginal value over Pattern E for the current descriptor set is small. If OK's descriptor inventory grows in visual complexity, this becomes a more attractive tradeoff.

### Rank 3 (NOT NOW): Pattern B3 (build-time pre-rendered shells) — acceptable trade if the descriptor variant set is finite and stable

**When:** if OK had a closed, small descriptor set (Callout-info / Callout-warning / Callout-tip — finite) and an established convention against custom variants, B3 would be a clean architecture: run `@react-email/render` per variant at build time, ship a static map.

**Why not now:** OK's descriptor system is described as "MDX descriptor system" — extensible by definition. Build-time pre-rendering doesn't compose with user-authored variants. If a user adds a custom Callout variant via their own JSX, B3 has nothing to render.

**Plus:** F6 (theme drift) is the largest open question for B3 — every theme change requires a build run to refresh shells. For OK's dev loop this would add CI complexity (D9 F10) without buying anything Pattern A doesn't already give for free.

### Rank 4 (NOT): Pattern B1 (react-email-style SSR-in-browser)

**Why not:** the bundle cost (D9 F8 — estimated ≥300 KB minified per D5 Finding 6) and latency cost (D9 F12 — multi-frame cold; tens of ms warm) for a feature firing on every Cmd+C is structurally wrong. Pattern B1 is a render-once-ship-bytes architecture; OK's clipboard is render-on-event. The mismatch is foundational, not configurable. (D5 §6, D5 Finding 5)

### Rank 5 (NOT): Pattern B2 (textbook SSR + jsdom + juice)

**Why not:** dominated by B1 (D9 §"Patterns dominated entirely by another pattern"). And juice doesn't use jsdom — it uses cheerio (D2 §Finding 1), so the canonical "jsdom + juice" mental model the rubric tests doesn't even exist in production code. B2's hypothetical browser-side variant has all of B1's costs without B1's tree-walk efficiency.

### Rank 6 (NOT): Pattern C (Pattern A + JIT Tailwind in-browser)

**Why not:** Pattern C is structurally dominated by Pattern A (D6 §Finding 1) — the live CSSOM already gives resolved styles; running a second compiler to re-derive the same values is wasteful. Plus: Twind is stalled, jit-browser is v3-only, Tailwind v4 in-browser is undocumented (D3 §Findings 1-3). No path to a maintainable in-browser v4 compiler that's also small.

### Rank 7 (NOT): Pattern D2 (on-demand iframe per copy)

**Why not:** dominated by D1 (D9 §"Patterns dominated entirely by another pattern"). D2 pays full creation cost per copy; D1 amortizes. No row where D2 wins.

### Rank 8 (CONSIDER for future research): Pattern D3 (Shadow DOM substitute)

**Why future:** D3 (D7 §D3 + D9 §gaps) inherits parent CSS variables for free (Tailwind v4 token transfer is automatic), is synchronous (no iframe browsing-context init cost), and uses the same document's CSSOM. The cost: parent-style leakage into the shadow tree partly defeats the isolation goal. Whether D3 is a viable substitute for D1 for OK's case is UNCERTAIN — D7 §gaps notes this needs empirical evaluation.

If/when OK reaches the point where Pattern A + Pattern E is insufficient and a fresh-render-from-props path is needed, D3 should be evaluated *before* D1 — D3 is structurally cheaper. But that's a "not now" question, not a "yes/no" today.

---

## Cross-cutting findings

### Finding 1: jsdom / happy-dom / linkedom / parse5 / cheerio / htmlparser2 are ORTHOGONAL TOOLS to OK's clipboard problem, not viable alternatives

**Confidence:** HIGH.
**Evidence:** D1 — these are *Node-side* DOM environments. OK's clipboard runs in the *browser*. The browser already has a real, full, complete DOM and CSSOM that's strictly more capable than any of these. None of them adds a capability to OK that Pattern A doesn't already have.

The one library that matters in this set is **jsdom** for understanding what react-email's testing harness uses (D5 Finding 1 — it's a devDep there, not runtime). It does not represent a viable alternative architecture for OK clipboard.

### Finding 2: juice / Premailer / react-email tailwind / mailing render are ORTHOGONAL TOOLS for *email templates*, not viable alternatives for *clipboard*

**Confidence:** HIGH.
**Evidence:** D2 + D5. These are render-once-ship-bytes server-side tools. Their architecture assumes (a) Node runtime, (b) author controls the entire template, (c) latency is amortized over recipients. OK's clipboard fails all three preconditions. (D5 §6 asymmetries table)

`juice/client` exists but doesn't change the architectural mismatch — it just lets you bundle juice into a browser, where it runs slower and on less-resolved CSS than `getComputedStyle` already gives.

### Finding 3: The hidden-iframe pattern (D7) is the only DOM-environment alternative that adds capability — but the capability gain is narrow and the cost is real

**Confidence:** HIGH.
**Evidence:** D7 + D9. D1 (singleton iframe) uniquely allows rendering React from props without main-tree mount, with the actual descriptor's React component (full styling fidelity, no hand-coded drift). The cost is iframe lifecycle + stylesheet sync + Tailwind v4 custom-property re-injection + ~5 KB react-frame-component + ~100 LoC custom plumbing.

For the *current* OK descriptor set, the hand-coded `toClipboardHast` (Pattern E) is a strictly cheaper way to handle the same case. D1 becomes attractive only if descriptor visual complexity grows.

### Finding 4: The "is the walker the right tool" question is settled YES by the adequacy criteria

**Confidence:** HIGH.
**Evidence:** Per the rubric: "If any of those are non-adequate, an alternative pattern is justified." Pattern A passes 4/5 as-shipped; passes 5/5 with the icon-glyph-replacement walker-localized fix. No criterion is non-adequate. (D4 §"Adequacy criteria check")

### Finding 5: The composition shape (live walker for content + per-descriptor declarative for chrome) is what every peer editor converges on

**Confidence:** HIGH.
**Evidence:** D5 §8 + D8 §Finding 1. Lexical, BlockNote, Plate, Notion all do per-node-class authored chrome. The difference is OK can additionally use the live walker for content, where peer editors don't have a stable live DOM to walk. So **OK's optimal architecture is the peer-editor architecture *plus* the live-walker advantage** — strictly more capable than any peer.

---

## UNCERTAIN claims warranting empirical follow-up

These are claims in this report that depend on inferences from library source + prior reports rather than direct measurement. They do not change the recommendation but a follow-up empirical pass would tighten confidence.

1. **Bundle size for Pattern B1 in-browser:** D9 F8 row cites ≥300 KB minified estimate from D5 Finding 6. A real Vite/esbuild build experiment would replace inference with measurement.
2. **Latency for Pattern D1 cold path:** D7 Finding 4 cites html2canvas's 60ms iframe-generation report from a single contributor's machine ~10 years ago. Modern engines may differ. A controlled benchmark would resolve.
3. **React 19 `<Activity>` × iframe portal interaction:** D7 §gaps notes this is empirically unconfirmed. If Pattern D1 is taken seriously, this is a load-bearing question.
4. **Tailwind v4 `compile()` in-browser bundle size:** D3 §Finding 4 calls this UNCERTAIN. No published example exists. Resolves a Pattern C / Pattern B1-in-browser question if measured.
5. **jsdom v29 oklch / lab / color-mix support:** D1 §Finding 5 notes the `@asamuzakjp/css-color` README was not fetchable; jsdom's modern color support is partially unconfirmed. Not relevant to the recommendation (jsdom is Node-only) but flagged for honesty.
6. **Pattern D3 (Shadow DOM) viability for OK's specific case:** D7 §gaps + D9 §gaps. Inherits parent custom properties (good for Tailwind tokens) but also inherits unwanted parent styles (bad for isolation). Net is UNCERTAIN.

---

## Summary table

| Rank | Pattern | Verdict | Why |
|---|---|---|---|
| 1 | A + E (live walker + per-descriptor hast fallback) | **KEEP** | Passes all 5 adequacy criteria; trivial bundle; sub-ms fallback; bounded maintenance |
| 2 | A + D1 (live walker + singleton iframe) | CONSIDER if descriptor complexity grows | Adds genuine capability for descriptor-without-mount; modest runtime cost |
| 3 | B3 (build-time pre-rendered shells) | NOT NOW | Wrong fit for extensible descriptor system; rebuild-on-theme-change |
| 4 | B1 (react-email-in-browser) | NOT | Bundle + latency mismatch for copy-event runtime |
| 5 | B2 (SSR + juice) | NOT | Dominated by B1; juice doesn't actually use jsdom |
| 6 | C (A + JIT TW) | NOT | Dominated by A |
| 7 | D2 (on-demand iframe) | NOT | Dominated by D1 |
| 8 | D3 (Shadow DOM) | RESEARCH | Cheaper than D1 if pattern is taken; viability for OK UNCERTAIN |

---

## Final recommendation (one paragraph)

Keep Pattern A as the primary path; formalize Pattern E (`descriptor.toClipboardHast(props)`) as the per-descriptor fallback for `view.nodeDOM(pos) === null` cases (Activity-hidden, descriptor-without-mount). Land the icon-class-to-glyph mapping at the walker boundary per the cross-app icon report. Do *not* introduce jsdom, happy-dom, juice, react-email's Tailwind compiler, jit-browser-tailwindcss, Twind, or hidden-iframe lifecycle code — none of these add a capability Pattern A + Pattern E doesn't already cover, and all of them add bundle / latency / build-complexity costs disproportionate to the marginal value. If a future descriptor's visual complexity outgrows hand-coded `toClipboardHast` reliability, **then** evaluate Pattern D3 (Shadow DOM substitute) before Pattern D1 (iframe), per D9 §gaps. The architectural decision framework here is durable: the matrix in D9 maps every (failure × pattern) cell, so any future descriptor requirement can be evaluated against the same grid.
