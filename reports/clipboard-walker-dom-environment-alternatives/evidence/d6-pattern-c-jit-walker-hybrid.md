# Evidence: D6 — Pattern C (browser-time JIT Tailwind compile + walker hybrid)

**Dimension:** would shipping a Tailwind compiler IN ADDITION to the walker help? At what cost?
**Date:** 2026-05-01
**Sources:** D3 (this report) + prior `tiptap-clipboard-round-trip-markdown/REPORT.md` (lines 1488–1496, 1556–1568)
**Coverage policy:** Refresh from prior report.

---

## Pattern definition

The hybrid pattern: keep the live walker (Pattern A) for content/cascade resolution, BUT augment it with an in-browser Tailwind compiler (Twind / jit-browser-tailwindcss / Tailwind v4 `compile()` in WASM) that re-derives the Tailwind class → CSS mapping at copy time. The walker would call the compiler when it encounters a class it can't resolve via the live CSSOM (e.g., classes only present in detached documents or in iframe renders).

---

## What Pattern C would solve that Pattern A does not

**Honest answer: very little for the OK clipboard case.**

The reason: Pattern A's `getComputedStyle` already does the cascade resolution. There's no class-name-to-CSS-property gap that the walker can't fill from the live DOM. The compiler buys you the ability to re-derive resolved CSS for classes that are NOT present in the live document — i.e., for components the user hasn't mounted. For OK clipboard, that case is rare (the user only copies what they're looking at) and is already handled by Pattern Y (static fallback palette).

The one place a JIT compiler could help: if OK adopts Pattern D (hidden-iframe render-and-walk) and the iframe doesn't have the parent's stylesheets injected, you'd need to either:
1. Inject the parent stylesheets into the iframe (cheaper, no compiler needed).
2. Re-compile Tailwind classes on demand inside the iframe.

(2) is still more expensive than (1).

---

## Cost (refresh from D3)

| Library | Bundle (gzipped) | v4 support | Maintenance signal |
|---|---|---|---|
| Twind | ~10 KB | NO | Stalled since Q4 2024 (D3 §Finding 1) |
| jit-browser-tailwindcss | ~74 KB | NO (v3.1.8 only) | Last release Dec 2024 (D3 §Finding 2) |
| Tailwind v4 `compile()` in WASM | UNCERTAIN (likely 200–800 KB compressed if `@tailwindcss/oxide-wasm` is bundled) | YES (it IS v4) | UNCERTAIN — undocumented in-browser usage (D3 §Finding 3) |

The bundle cost for a "real" Tailwind v4 in-browser compiler that matches OK's CSS is structurally unbounded by current evidence — the v4 compiler is largely Rust → WASM, and no production OSS has shipped it as a clipboard-time browser bundle.

---

## Findings

### Finding 1: Pattern C does not solve a problem Pattern A has

**Confidence:** HIGH.
**Evidence:** Prior report line 1496: "Compared to the alternative — the live page already has the resolved CSS *because the user is looking at it* — bundling a second compiler purely to re-derive the same values is wasteful."

The walker already gets resolved CSS from the live CSSOM. A JIT Tailwind compiler would re-derive the same values at higher bundle and latency cost.

### Finding 2: Pattern C only adds value if Pattern A is *replaced* by a render-time pattern (B or D)

**Confidence:** MEDIUM.
**Evidence:** If the descriptor is rendered into a hidden iframe (D7) without the parent's Tailwind stylesheet injected, OR if it's rendered server-side via SSR (D5), you need to resolve Tailwind classes somehow. A JIT compiler is one path; a pre-injected stylesheet is another (cheaper) path. **Pattern C as a hybrid with Pattern A is dominated by Pattern A alone**.

### Finding 3: For OK's specific Tailwind v4 + React 19 + ProseMirror constraint, no surveyed in-browser compiler is currently usable

**Confidence:** HIGH.
**Evidence:** Twind: stalled and v3-spec only. jit-browser-tailwindcss: v3 only. Tailwind v4 `compile()`-in-browser: no published example, requires custom polyfills for `loadModule` / `loadStylesheet` callbacks (per D2/D5/D3 evidence), bundles `@tailwindcss/oxide-wasm` (~700KB compressed per npm registry).

---

## Verdict

Pattern C is structurally dominated by Pattern A in the live-editor copy case. It would only be considered if (a) OK were forced off the live walker (it isn't) AND (b) the replacement pattern needed Tailwind class resolution without a live stylesheet (Pattern D/iframe could need this if stylesheets aren't injected). Neither precondition holds currently.

---

## Gaps / follow-ups

- If OK migrates to Pattern D (iframe), the choice between (i) inject parent stylesheets into iframe vs (ii) JIT-compile Tailwind in the iframe is a measurable engineering question, but only matters if (i) is somehow infeasible. Stylesheet injection is the standard answer for Storybook, react-frame-component, etc.
