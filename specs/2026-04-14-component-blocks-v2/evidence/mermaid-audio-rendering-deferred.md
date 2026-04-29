# Mermaid Removed + Audio Functional-But-Chrome-Pending

**Date:** 2026-04-21
**Status:** Mermaid descriptor removed from registry. Audio functional; shadcn-chrome work deferred.
**Related research report:** [`reports/mermaid-rendering-options-for-mdx-editors/REPORT.md`](../../../reports/mermaid-rendering-options-for-mdx-editors/REPORT.md)

---

## What this evidence captures

SPEC.md's D3-LOCKED decision planned `Mermaid` and `Audio` as **shadcn wrappers** at `packages/app/src/components/ui/{mermaid,audio}.tsx`, with visual-regression tests VR13 (Mermaid × light/dark) and VR14 (Audio MP3 × light/dark). PR #165 initially shipped placeholder stubs in `componentMap.tsx` instead.

**Resolution (2026-04-21, two-step):**

1. **Mermaid stub removed from registry.** The `MermaidPlaceholder` function and `Mermaid` descriptor were non-functional — rendered chart source as `<pre>`, no SVG. Per greenfield directive (don't claim to ship capability the code doesn't deliver), the descriptor + props + componentMap entry were deleted. Existing `<Mermaid />` user content now auto-converts to `rawMdxFallback` (nested CM source editor) via `JsxComponentView`'s wildcard-handling path — strictly better user experience than the dead `<pre>` placeholder because the source stays editable. Built-in manifest: 18 → 17 components.
2. **`AudioPlaceholder` renamed to `Audio`.** The code was always functional (real HTML5 `<audio controls src>` element — playback works end-to-end). The `Placeholder` suffix was misleading, not the behavior. No functional change; just honest naming. The VR14 follow-up (shadcn-styled chrome on top of the working player) stays as future work with concrete scope below.

This file records the new shipped state, the rationale for the Mermaid removal, and the un-deferral decision framework for both Mermaid (re-introduce with a real renderer) and Audio (add shadcn chrome).

## Shipped state audit (post-removal, 2026-04-21)

Grep of `packages/app/src/editor/components/componentMap.tsx`:

| Descriptor | Target in `componentMap` | What actually renders |
|---|---|---|
| ~~`Mermaid`~~ | ~~removed from registry~~ | Existing `<Mermaid />` in user content hits the wildcard `'*'` path in `JsxComponentView` → auto-converts to `rawMdxFallback` (nested CM source editor). User sees their Mermaid source in an editable code block with a "Unregistered component: Mermaid" badge instead of a dead `<pre>` stub. |
| `Audio` | `Audio` (inline in `componentMap.tsx` — **not** a stub; real HTML5 `<audio controls src>`) | Bordered `<div>` with `<audio controls src={props.src}>` inside. Real HTML5 `<audio>` element — playback / scrub / volume / keyboard shortcuts all work. No shadcn chrome (browser-native controls). |
| `ImageZoom` | `ImageZoom` from `fumadocs-ui/components/image-zoom` | Real fumadocs `ImageZoom` component (wraps `react-medium-image-zoom`). |
| `Video` | (not in registry) | N/A — the manifest has no `Video` descriptor. |

Grep of `packages/app/src/components/ui/`: `mermaid.tsx` and `audio.tsx` — **not present**. The originally-planned shadcn wrappers were never authored.

What `componentMap.tsx`'s header comment now says about the state (line 10-19):

```
`Audio` is a minimal HTML5 `<audio controls>` wrapper — functional playback
via the browser-native media element. VR14 envisioned a shadcn-styled
player; the research + follow-up work item live at
`specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`
(current lean: AI Elements AudioPlayer on `media-chrome`).

Mermaid was removed from the registry 2026-04-21 — the prior placeholder
rendered no SVG and was tech debt under the greenfield directive. Existing
`<Mermaid />` user content auto-converts to `rawMdxFallback` (nested CM
source editor) via `JsxComponentView`'s wildcard-handling path.
```

## What the spec said vs what shipped

| SPEC reference | Stated plan | Shipped reality |
|---|---|---|
| FR-8 (line 160) | "16 fumadocs-ui + Mermaid + Audio shadcn wrappers per D3" | 16 fumadocs + 2 inline placeholder stubs |
| §9.15.7 table (line 742) | "2 shadcn wrappers to write (`packages/app/src/components/ui/{mermaid,audio}.tsx`)" | Files absent; rendering inlined in `componentMap.tsx` |
| D3-LOCKED (line 2200) | "Built-ins P0: 18 components (16 fumadocs + Mermaid + Audio shadcn wrappers)" | 18 descriptor count preserved, but 2 of them placeholder-backed |
| VR13 (line 668) | "Mermaid with flowchart fixture × {light, dark} — Diagram renders; colors match" | Test not implemented; diagram would not render |
| VR14 (line 669) | "Audio with test MP3 × {light, dark} — Audio player chrome (shadcn wrapper) matches reference" | Test not implemented; audio element plays but chrome does not match a shadcn reference |

## Why the spec-vs-shipped divergence exists

Not captured in the spec's `_changelog.md`. The implementation decision to ship placeholders was made during the PR #165 build-out, without a corrigendum against the spec. Re-stating plainly: the spec's plan was to author two shadcn wrappers; the shipped code has inline placeholders. Neither source documents the reason for the divergence.

The `Mermaid` placeholder is a functional gap (no rendering). The `Audio` placeholder is a chrome gap (playback works, but the player lacks the shadcn visual treatment specified by VR14). `ImageZoom` is fully shipped.

## Decision framework for un-deferring (from research)

The standalone research report at `reports/mermaid-rendering-options-for-mdx-editors/` covers the full factual landscape. Before picking a direction, these decisions must be made (collated from the report's "what more information would we need" recap):

### Product scope

1. **Which Mermaid diagram types must be supported?** Gate between `mermaid@11.14.0` (20+ types, 21 transitive deps, ~153 KB first-insert gzipped per bundlephobia) and `beautiful-mermaid@1.1.3` (6 types, 2 deps, ~68-482 KB depending on elkjs inclusion). See REPORT §D1, §D2.
2. **Who authors Mermaid in this product?** DSL-fluent power users or casual authors needing a visual builder? (No surveyed editor ships a visual Mermaid builder.)
3. **Bundle budget?** First-insert cost vs. cold-start cost vs. per-diagram incremental.

### UX pattern

4. **Live-render-while-typing, render-on-commit, or explicit-toggle?** Constrains cache strategy + debounce + error UX all at once. See REPORT §D3 summary grid and §D4.3.
5. **Source-vs-render toggle shape?** Five prior-art shapes: tri-state (Notion), cursor-based edit mode (Outline), split view always-visible (MDXEditor), click-to-edit (Lexical community), `rawMdxFallback` nested-CM drop-down (our Precedent #24 pattern).
6. **Error fallback?** Per Precedent #26 (all user content visible and editable): inline error text, dim-last-render, drop-to-nested-CM, or re-raise to wildcard?

### Architectural fit (requires codebase source-read)

7. **NodeView vs Decoration.widget vs fenced-code-rewrite?**
   - NodeView (matches our current componentMap registry dispatch — `<Mermaid chart="..." />` JSX)
   - Decoration.widget on a `code_fence` node with `language="mermaid"` (Outline's pattern; preserves source as PM text content)
   - Fenced code + `remarkMdxMermaid` rewrite to `<Mermaid />` at parse time (fumadocs pattern; already shipped in our installed `fumadocs-core@16.1.0`)
8. **Activity-pool cache interaction.** `ACTIVITY_MOUNT_LIMIT = 3` unmounts NodeViews; a pool recycle resets React state. Module-level promise cache (fumadocs-style) survives; component-level `useMemo` does not. Trade-off depends on expected chart-change cardinality per session.
9. **CRDT bridge story for live Mermaid source editing.** Typing in source mode flows through Observer B. Does the observer need to know about Mermaid's JSX shape? Precedent #10 vs Precedent #24 considerations.

### Operational

10. **Mermaid `securityLevel`:** `'strict'` (sanitize), `'loose'` (allow click-handlers + links), `'sandbox'` (iframe isolation).
11. **Theme coupling** to `next-themes` `resolvedTheme` — REPORT §D3 shows no editor auto-derives from CSS variables; all use explicit named themes.
12. **Desktop (Electron) constraints** — CSP / file:// / Chromium-version pinning may narrow renderer options.

### What the research already rules out

- **No WASM port** — mermaid-js team explicit (Issue #3650, Discussion #4789).
- **Server-side rendering** (mermaid-cli, mermaid.ink, Kroki) is orthogonal to the live-editor question — useful for build-time static docs only.
- **No cross-React-mount shared cache** pattern in prior art — any such design would be novel.
- **Open #7094** — `@mermaid-js/parser` langium deep-imports fail in Webpack/Turbopack; Vite/Rollup status at `@mermaid-js/parser@1.1.0` (11.14.0's pin) UNCERTAIN.

### Sub-investigations available before picking a direction

Listed in REPORT.md §Research Recap as potential Path-C follow-ups:

- `@mermaid-js/parser@1.1.0` langium-bundler verification against Vite (targeted spike)
- Adaptive-debounce pattern survey beyond mermaid-live-editor
- `@toeverything/mermaid-wasm` lineage + diagram-coverage attestation (if worker+WASM is on the table)
- Visual diagram-builder products (Excalidraw, tldraw, Whimsical) — out of research scope but may reframe the core question ("should we ship Mermaid, or a visual tool?")

## Audio gap (separate from Mermaid — narrower scope, cosmetic only)

### Current shipped state

`AudioPlaceholder` (`packages/app/src/editor/components/componentMap.tsx:33-46`) renders a real HTML5 `<audio controls src={src}>` element wrapped in a bordered label div. Audio playback, scrubbing, volume, and keyboard shortcuts (Space to play/pause, arrow keys for seek) all work end-to-end via browser-native controls. The component's name suffix "Placeholder" is misleading — playback is functional; what's absent is the visual styling layer.

### What VR14 actually requires — concretely

SPEC §8 row VR14: *"`Audio` with test MP3 × {light, dark} — Audio player chrome (shadcn wrapper) matches reference."*

"shadcn wrapper" translates to three concrete properties the browser-native `<audio controls>` doesn't have:

1. **Theme reactivity.** Browser-native controls look identical in light and dark modes — Chromium draws the same grey UI either way, which visually clashes with the editor's dark surface. A shadcn-pattern player binds control colors to `--primary`, `--muted-foreground`, `--border` CSS variables, so dark-mode audio blocks match dark-mode Callouts / Cards / Accordions without a separate theme pass.
2. **OS/browser consistency.** Native `<audio>` UI differs between Chrome-macOS, Firefox-Linux, Safari-iOS. Any design review / visual regression will diff depending on which browser takes the screenshot. Custom chrome gives a single canonical appearance.
3. **Layout cohesion.** Native controls have fixed heights and spacings that don't align with the editor's 8px/16px spacing grid. Custom chrome uses the same Tailwind tokens as the rest of the surface.

Functionally no user is blocked by any of this today. The gap is purely cosmetic + theme-consistency.

### No user story exists

US-001..US-017 (covered in the PR #165 body's "Coverage by story" table) don't include an Audio-specific story. VR14 is a spec-level test row with no implementation user story behind it. No customer bug, support ticket, or design feedback references Audio-chrome quality. Audio blocks are a long-tail authoring surface — rare in technical documentation generally, and we have no evidence any of our users embed them.

### Shadcn-compatible landscape (researched 2026-04-21)

**shadcn/ui core does NOT ship an audio player.** Their catalog is primitives + layout (Button, Dialog, Slider, etc.) — media is not in their scope. Four registry-compatible / adjacent options surfaced:

| Option | Source | Shape | Dep posture |
|---|---|---|---|
| **[AI Elements `AudioPlayer`](https://elements.ai-sdk.dev/components/audio-player)** (Vercel AI SDK registry) | shadcn-CLI installable via `@<elements-registry>/audio-player`. Compound components: `AudioPlayer`, `AudioPlayerElement`, `AudioPlayerControlBar`, `AudioPlayerPlayButton`, `AudioPlayerSeekBackwardButton`/`…ForwardButton`, `AudioPlayerTimeDisplay`, `AudioPlayerDurationDisplay`, `AudioPlayerTimeRange`, `AudioPlayerMuteButton`, `AudioPlayerVolumeRange`. | Built on [`media-chrome`](https://www.media-chrome.org/) (MIT, web-components, 10+ year old, used by Mux) + shadcn Button. CSS-variable theming. | Adds `media-chrome` as runtime dep (~30 KB gzipped, lazy-loadable) |
| **[`media-chrome`](https://www.media-chrome.org/) direct** | `<media-controller>` + individual `<media-*>` web components, framework-agnostic. | Same underlying tech as option 1 — we own all Tailwind/CSS-variable wiring. | Same runtime dep |
| **Hand-rolled with shadcn Slider + Button** | Compose from our own `packages/app/src/components/ui/`. First requires `npx shadcn@latest add slider` — currently absent from our `ui/` dir. | Standard shadcn composition: Radix Slider + Button + `useRef`/`useEffect` on the `<audio>` element. ~150-200 LoC of code we maintain forever. | No new runtime deps beyond what shadcn Slider brings (Radix Slider) |
| **[audio-ui](https://github.com/ouestlabs/audio-ui)** (ouestlabs) | Shape mismatch — DAW/mixer primitives (faders, knobs, channel strips, xy-pads, transport). Music-production tooling. | ❌ Not applicable — wrong problem domain |
| **[ElevenLabs UI](https://ui.elevenlabs.io/docs)** | Includes `AudioPlayer` + `ScrubBar`, but packaged with agent-focused components (`VoiceButton`, `LiveWaveform`, `Orb`). Broader scope than we need, unclear license. | ⚠️ Plausible but over-scoped |

### Current lean (2026-04-21, NOT locked)

**Option 1: AI Elements `AudioPlayer`.** Rationale:

- Direct-fit API shape (compound components matching the `<Audio src="…" title="…">` descriptor contract)
- Installs via shadcn CLI directly into `packages/app/src/components/ui/`, matching our existing component layout convention
- `media-chrome` is mature (10+ years, Mux-maintained, MIT, broad browser coverage) → lower maintenance burden than hand-rolling
- CSS-variable theming composes naturally with our existing `globals.css` token bridge

**Fallback if the lean changes**: Option 3 (hand-rolled with shadcn Slider + Button) keeps zero runtime deps but costs ~150-200 LoC we own forever. Reasonable if `media-chrome`'s customizability proves insufficient, or if first-use reveals features media-chrome doesn't provide (e.g., waveform visualization, chapter markers).

### Follow-up work shape (when un-deferring)

Estimated **200-300 LoC total**, 1-2 focused hours:

1. **Install.** `npx shadcn@latest add @<elements-registry>/audio-player` → pulls compound components into `packages/app/src/components/ui/audio-player.tsx` (or per-component files). One new runtime dep: `media-chrome`.
2. **Thin wrapper.** Author `packages/app/src/components/ui/audio.tsx` exposing a single `<Audio src="..." title="...">` surface that matches our descriptor's prop contract (`src` required, `title` optional — see `packages/core/src/registry/built-ins.ts:357-370`). Internally composes `AudioPlayer` + `AudioPlayerElement` + `AudioPlayerControlBar` + `…PlayButton` + `…TimeRange` + `…TimeDisplay` + `…DurationDisplay` + `…MuteButton` + `…VolumeRange`. Minimal control set; skip `SeekBackward/Forward` buttons unless explicit product feedback requests them.
3. **Wire into registry.** Replace `Audio: AudioPlaceholder` at `componentMap.tsx:71` with the real import. Delete `AudioPlaceholder` function (lines 33-46) and its `'Audio'` fallback prop parsing. Remove the mislabeling comment at line 11.
4. **Implement VR14.** Add a Playwright test at `packages/app/tests/visual/component-parity.e2e.ts` (or dedicated `audio-chrome.e2e.ts`) — insert `<Audio src="/fixtures/test.mp3" title="Test" />` into a seeded doc, screenshot in light + dark, diff against baseline. Add MP3 fixture to `packages/content/` or a `tests/fixtures/` dir.
5. **Clean up SPEC.md corrigenda.** Remove the "Audio" portion of the VR14 breadcrumb once VR14 is green. Keep the VR13 (Mermaid) portion — still deferred.

### Non-goals for the follow-up

Explicitly OUT of scope for an audio-specific follow-up even when un-deferred:

- **Waveform visualization** — not in any descriptor prop; requires `wavesurfer.js` or similar; no user story asks for it
- **Chapter markers / timestamps** — not in descriptor prop; would require extending the `AudioProps` PropDef
- **Playlist / multi-track** — component is single-src by design (per `src: string` in `audioProps`)
- **Recording / capture** — `MediaRecorder` API, fundamentally different problem
- **Transcription overlay** — out of scope, separate from playback

Any of these would need their own descriptor + story; the AI Elements compound component composition cleanly supports added features later.

### Trigger conditions specific to Audio

The generic triggers at the document foot apply, plus one Audio-specific signal:

- **First customer doc that embeds `<Audio>` and someone notices the browser-native controls clash** — most-likely un-defer trigger. Cost of addressing is bounded (Option 1 is 1-2 hours), so this doesn't need pre-emptive work.

## Video gap (not in registry at all)

The 18-component manifest (`packages/core/src/registry/built-ins.ts:374-578`) has no `Video` descriptor. Fumadocs ships no Video component either — raw HTML5 `<video>` is the only first-class path in the fumadocs ecosystem (and even there, only a Tailwind typography margin rule, not a component). Adding `Video` would be a greenfield registry addition following the `Audio` pattern.

## Related spec non-goals (existing deferrals)

- `evidence/custom-components-deferred.md` — NG13 user-authored components
- `evidence/inline-component-editing-deferred.md` — NG14 live-rendered inline MDX
- `evidence/deferred-invariants-and-perf.md` — I-series invariants and perf tests deferred

This deferral joins that list at the D3-implementation level: the shadcn wrappers were LOCKED as in-scope but were not implemented, shipping placeholders instead. The spec text (line 160, 669, 670, 742, 2200) remains the moment-in-time source of truth for the plan; this evidence file records the shipped divergence and the un-deferral decision framework.

## When to revisit

Trigger conditions (any one warrants un-deferring):

1. Product spec or user research confirms Mermaid is a required authoring surface for the target audience
2. A customer-facing doc author requests diagram rendering and the raw-source fallback is not adequate
3. A visual-regression test suite regression (if VR13/VR14 are ever implemented) forces the decision
4. The `mermaid@11.14.0` → later-version gap becomes large enough that adoption-path research staleness warrants a rerun

Until then: `MermaidPlaceholder` and `AudioPlaceholder` live in `componentMap.tsx` as-is. Research is preserved at `reports/mermaid-rendering-options-for-mdx-editors/` for whoever picks this up.
