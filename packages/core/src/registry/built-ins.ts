/**
 * Built-ins manifest — 5-pack foundation (Callout + Image + Video + Audio +
 * Accordion).
 *
 * Scope contract for this file after US-009 (`specs/2026-04-23-cb-v2-md-foundation/`):
 * five registered descriptors (+ wildcard `'*'` injected by the registry
 * factory) — the 5-pack foundation is complete at this count.
 * Cut in US-003: Banner, Card, Cards, Step, Steps, Tab, Tabs, Accordion
 * (fumadocs shape), Accordions, File, Files, Folder, TypeTable, InlineTOC —
 * 14 fumadocs descriptors retired because the 5-pack has no compound-wrapper
 * machinery (US-002 deleted `compound-wrappers.tsx` and the precedent #27
 * compound-components bridge was retracted on this branch in US-001). Names
 * that still appear in user content fall through to the wildcard `'*'`
 * descriptor (`hasChildren: true`, empty props) per `createRegistry()` /
 * `getOrWildcard()`.
 *
 * ImageZoom renamed to Image (US-003 / FR-20); US-006 widens the prop surface
 * to the FR-2 8-prop shape (src, alt, width, height, caption, title, loading,
 * zoom) alongside the DIY `react-medium-image-zoom` renderer. US-005 widened
 * Callout to 7 props (GFM 5-type enum + title/icon/color/collapsible/
 * defaultOpen). US-007 adds Video with the FR-3 9-prop HTML5 `<video>` shape
 * (pure HTML5 wrapper per D-MF12 — no URL sniffing, no iframe emission, no
 * `start` prop). US-008 widens Audio from the pre-narrow 2-prop shape
 * (src/title) to the FR-4 7-prop shape (src/title/autoplay/loop/muted/preload
 * + children for `<source>`/`<track>` passthrough) and flips `hasChildren:
 * false → true` (drops `isSelfClosing`) — the pre-US-008 state was a bug: the
 * inline renderer in `componentMap` passed children but the descriptor
 * declared none. US-009 adds Accordion with the FR-5 6-prop shape (title
 * required + defaultOpen + icon + description + id + name + children) —
 * standalone per D-MF16 (renamed from Toggle; no `<Accordions>` parent
 * wrapper required; HTML5 `<details>`/`<summary>` substrate; cross-browser
 * exclusive-accordion grouping via HTML5 `<details name>`; no `variant` prop
 * per D-MF14 — NG30 preserves the Notion color-map absorption path).
 *
 * ── Intent-of-ship ───────────────────────────────────────────────────────
 *
 * This manifest is the shipped default for the OK editor. The greenfield
 * directive (2026-04-13) forbids shipping empty-scaffolding registries; this
 * file is the authoritative source of truth. Downstream embedders can call
 * `createRegistry()` + `.set(...)` to add their own descriptors, but the
 * 5-pack is the in-app baseline.
 *
 * Mermaid was removed 2026-04-21 — placeholder stub was non-functional. See
 * `specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`
 * for the un-deferral framework.
 */
import type { JsxComponentMeta, PropDef } from './types.ts';

// ── Callout ──────────────────────────────────────────────────────────────────
//
// FR-1 (SPEC 2026-04-23-cb-v2-md-foundation): 7-prop surface matching GFM's
// 5-type `type` enum + Mintlify-inspired `title`/`icon`/`color` + Obsidian-
// inspired `collapsible`/`defaultOpen` (D-MF17). Research-recommended
// 9-value enum narrowed to GFM 5 per D-MF11 — parser alias map (US-010
// callout-transformer) folds broader inputs (Obsidian/Mintlify aliases) into
// this subset pre-descriptor lookup. Schema-is-add-only (precedent #9)
// makes the enum extension free if NG26 promotes.
//
// `icon` is a string (not reactnode) because it encodes a lucide-react
// identifier namespace (e.g., `lucide:ChevronRight`) — resolved in the
// renderer to an `<Icon>` element. This lets γ round-trip the icon name
// byte-identical and keeps the PropPanel editable (reactnode props are hidden
// from the generic switch per `hasEditableProps` in JsxComponentView).

const calloutProps: PropDef[] = [
  {
    name: 'type',
    type: 'enum',
    enumValues: ['note', 'tip', 'important', 'warning', 'caution'],
    defaultValue: 'note',
    required: false,
    description: 'GFM alert variant',
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'Optional heading shown above the body',
  },
  {
    name: 'icon',
    type: 'string',
    required: false,
    description: 'Custom lucide icon override (e.g. `lucide:Lightbulb`)',
  },
  {
    name: 'color',
    type: 'string',
    required: false,
    description: 'Optional accent color override (hex — e.g. `#F05032`)',
  },
  {
    name: 'collapsible',
    type: 'boolean',
    required: false,
    defaultValue: false,
    description: 'Render as a foldable `<details>` (Obsidian `[!TYPE]+/-`)',
  },
  {
    name: 'defaultOpen',
    type: 'boolean',
    required: false,
    defaultValue: true,
    description: 'When collapsible, start in the open state',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Callout content',
  },
];

// ── Image (US-003 rename from ImageZoom; US-006 widens to FR-2 8-prop shape) ─
//
// FR-2 surface: `src` + `alt` + `width` + `height` + `caption` + `title` +
// `loading` + `zoom` (8 typed props). Superset of CommonMark `![alt](src)` —
// MDX JSX adds dimensions, caption, loading strategy, and zoom override.
// Children slot is NOT declared on the descriptor (isSelfClosing stays true);
// `caption` is a typed string prop rather than a reactnode so it round-trips
// through γ + PropPanel cleanly.
//
// Rendering (Image.tsx):
//   - `caption` set   → <figure> → <Zoom wrapElement="span"><img></Zoom>
//                     → <figcaption>{caption}</figcaption> → </figure>
//   - `caption` unset → <Zoom wrapElement="span"><img></Zoom>
//   - `zoom: false`   → skip Zoom wrapper; bare <img> (still inside <figure>
//                       when caption present)
//
// `loading` defaults to `'lazy'` at the renderer for consistency with the
// native img contract; an explicit `'eager'` author-override preserves.

const imageProps: PropDef[] = [
  {
    name: 'src',
    type: 'string',
    required: true,
    description: 'Image source URL',
  },
  {
    name: 'alt',
    type: 'string',
    required: false,
    defaultValue: '',
    description: 'Alt text',
  },
  {
    name: 'width',
    type: 'number',
    required: false,
    description: 'Image width',
  },
  {
    name: 'height',
    type: 'number',
    required: false,
    description: 'Image height',
  },
  {
    name: 'caption',
    type: 'string',
    required: false,
    description: 'Optional caption rendered below the image in a <figcaption>',
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'Tooltip text (rendered as the native HTML title attribute)',
  },
  {
    name: 'loading',
    type: 'enum',
    enumValues: ['eager', 'lazy'],
    defaultValue: 'lazy',
    required: false,
    description: 'Native img loading strategy (defaults to lazy)',
  },
  {
    name: 'zoom',
    type: 'boolean',
    defaultValue: true,
    required: false,
    description: 'When true (default), click the image to open a full-viewport zoom modal',
  },
];

// ── Video (US-007) ───────────────────────────────────────────────────────────
//
// FR-3 (SPEC 2026-04-23-cb-v2-md-foundation): pure HTML5 `<video>` wrapper per
// D-MF12 — matches Mintlify's explicit-iframe pattern (Fumadocs has no Video
// component at all). 9-prop surface: `src` + `title` + `controls` (default
// true) + `autoPlay` + `muted` + `loop` + `playsInline` + `poster` + `preload`
// (enum) + children (reactnode, for `<track>` passthrough).
//
// Explicitly out-of-scope (per D-MF12 / NG27 / NG28):
//   - YouTube / Vimeo URL sniffing → users author raw `<iframe>` for service
//     embeds; future NG27 promotes auto-detection when authoring friction
//     surfaces. Cheap to add later (~40 LoC render-time URL sniff) and
//     strictly additive — no descriptor shape change.
//   - `start` seek prop → Mintlify + Fumadocs both omit; video seeking is
//     runtime behavior, not a persisted authoring prop.
//   - Custom player chrome → HTML5 native controls are the UX; matches the
//     NG7 "no confidently-broken chrome" rule.
//
// `children` is declared (`hasChildren: true`) so authored `<track>` /
// `<source>` tags round-trip as PM children. Runtime subtitle rendering
// depends on browser tolerance of the NodeView wrapper — fidelity-first;
// editability over runtime-media semantics (QA-009 best-effort).

const videoProps: PropDef[] = [
  {
    name: 'src',
    type: 'string',
    required: true,
    description: 'Video source URL',
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'Tooltip text (native HTML title attribute)',
  },
  {
    name: 'controls',
    type: 'boolean',
    required: false,
    defaultValue: true,
    description: 'Show native HTML5 video controls (defaults to true)',
  },
  {
    name: 'autoPlay',
    type: 'boolean',
    required: false,
    description: 'Begin playback as soon as possible',
  },
  {
    name: 'muted',
    type: 'boolean',
    required: false,
    description: 'Mute audio on load (required for autoPlay in most browsers)',
  },
  {
    name: 'loop',
    type: 'boolean',
    required: false,
    description: 'Restart from the beginning when playback ends',
  },
  {
    name: 'playsInline',
    type: 'boolean',
    required: false,
    description: 'Play inline on iOS rather than entering fullscreen',
  },
  {
    name: 'poster',
    type: 'string',
    required: false,
    description: 'Poster image URL shown before playback',
  },
  {
    name: 'preload',
    type: 'enum',
    enumValues: ['none', 'metadata', 'auto'],
    required: false,
    description: 'Hint for how much of the video to preload',
  },
];

// ── Audio (US-008) ───────────────────────────────────────────────────────────
//
// FR-4 (SPEC 2026-04-23-cb-v2-md-foundation): HTML5 `<audio>` wrapper with
// native controls always on (NG7 "no confidently-broken chrome"). 7-prop
// surface: `src` + `title` + `autoplay` + `loop` + `muted` + `preload` (enum)
// + children (reactnode, for `<source>` / `<track>` passthrough).
//
// No `controls` prop — per FR-4, controls are always on. Authors who want a
// chrome-less audio (background loop) would need to write a raw `<audio>`
// element in MDX; descriptor-dispatched Audio always renders controls.
//
// `children` is declared (`hasChildren: true`) so authored `<source>` /
// `<track>` tags round-trip as PM children and stay editable — same QA-009
// best-effort semantics as Video (runtime browser tolerance of the
// NodeViewContent wrapper; fidelity-first, not runtime-media-first).
//
// Pre-US-008 state was a bug: the inline Audio renderer passed `children` but
// the descriptor declared `hasChildren: false` + `isSelfClosing: true`. US-008
// flips both flags to match the rendered behavior (Q-MF4 DELEGATED: grep
// confirmed no downstream consumer keyed off `hasChildren: false`).

const audioProps: PropDef[] = [
  {
    name: 'src',
    type: 'string',
    required: true,
    description: 'Audio source URL',
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'Tooltip text (rendered as the native HTML title attribute)',
  },
  {
    name: 'autoplay',
    type: 'boolean',
    required: false,
    description: 'Begin playback as soon as possible (usually requires muted)',
  },
  {
    name: 'loop',
    type: 'boolean',
    required: false,
    description: 'Restart from the beginning when playback ends',
  },
  {
    name: 'muted',
    type: 'boolean',
    required: false,
    description: 'Mute audio on load',
  },
  {
    name: 'preload',
    type: 'enum',
    enumValues: ['none', 'metadata', 'auto'],
    required: false,
    description: 'Hint for how much of the audio to preload',
  },
];

// ── Accordion (US-009) ───────────────────────────────────────────────────────
//
// FR-5 (SPEC 2026-04-23-cb-v2-md-foundation): 6-prop standalone accordion
// matching Mintlify Accordion's surface + HTML5 `name` attr per D-MF14 +
// D-MF16. Renamed from Toggle (pre-spec draft) — the prop surface already
// matched Mintlify Accordion 1:1; `Toggle` was Notion-aligned naming drift.
//
// ── D-MF14 / D-MF16 constraints (load-bearing) ───────────────────────────────
//
//   - NO `variant` prop → Notion color-map absorption (default/gray/brown/
//     _background) is de-prioritized per user directive. NG30 preserves the
//     path when Notion-style demand surfaces; precedent #9 schema-add-only
//     makes adding `variant` later free, but dropping now when nothing
//     consumes it is permanent lock-in avoidance.
//   - STANDALONE → ships without `<Accordions>` / `<AccordionGroup>` parent
//     wrapper. Matches Mintlify's standalone-Accordion stance; diverges from
//     Fumadocs's Radix-requires-parent pattern. Cross-browser exclusive-
//     accordion grouping via HTML5 `<details name="...">` (Chrome 120+,
//     Safari 17.2+, Firefox 130+) — no wrapper component needed. NG19
//     preserves the compound-tier revival path via PR #165 branch for when
//     grouped-UX demand surfaces.
//   - HTML5 `<details>` SUBSTRATE → native browser collapse/expand (no JS
//     toggle handler, no Radix-style animation state machine). Rotation on
//     open/close via CSS transform keyed on the `[open]` attribute; styling
//     flows through OK shadcn tokens in globals.css (no `--color-fd-*`).
//
// ── Namespace collision ──────────────────────────────────────────────────────
//
// Fumadocs `Accordion` + `Accordions` descriptors were cut in US-003; the
// new foundation `Accordion` is a full replacement. Clean cut, not a schema
// extension — both shapes have zero attr overlap beyond `title` (fumadocs
// required an `<Accordions>` parent; ours is standalone). PR #165 branch
// preserves the fumadocs compound pair verbatim for future compound tier.
//
// ── `children` semantics ─────────────────────────────────────────────────────
//
// `hasChildren: true`. The summary (title/icon/description) is rendered as
// non-editable chrome inside `<summary>`; children render inside the body
// region under the fold. Precedent #26 (all user content visible): the body
// DOM is retained even when collapsed — browsers display:none inside the
// closed `<details>`, but PM children stay live so editing doesn't lose state.

const accordionProps: PropDef[] = [
  {
    name: 'title',
    type: 'string',
    required: true,
    description: 'Accordion heading shown inside the <summary>',
  },
  {
    name: 'defaultOpen',
    type: 'boolean',
    required: false,
    defaultValue: false,
    description: 'When true, the accordion renders expanded on initial load',
  },
  {
    name: 'icon',
    type: 'string',
    required: false,
    description: 'Custom lucide icon override (e.g. `lucide:Rocket`)',
  },
  {
    name: 'description',
    type: 'string',
    required: false,
    description: 'Optional subtitle rendered below the title inside <summary>',
  },
  {
    name: 'id',
    type: 'string',
    required: false,
    description: 'HTML id attribute for deep-linking (e.g. `#advanced-options`)',
  },
  {
    name: 'name',
    type: 'string',
    required: false,
    description: 'HTML5 <details name=> group — siblings with the same name are mutually exclusive',
  },
];

// ── Manifest ─────────────────────────────────────────────────────────────────

export const builtInComponents: JsxComponentMeta[] = [
  // Content
  {
    name: 'Callout',
    hasChildren: true,
    props: calloutProps,
    icon: 'MessageSquareWarning',
    category: 'content',
    displayName: 'Callout',
    description:
      'GFM alert / admonition with 5 type variants (note, tip, important, warning, caution)',
    searchTerms: ['note', 'warning', 'tip', 'important', 'caution', 'alert', 'admonition'],
  },

  // Media
  {
    name: 'Image',
    hasChildren: false,
    isSelfClosing: true,
    props: imageProps,
    icon: 'ZoomIn',
    category: 'media',
    displayName: 'Image',
    description: 'Image with optional caption, explicit dimensions, and click-to-zoom',
    searchTerms: ['image', 'zoom', 'picture', 'photo', 'figure', 'caption'],
  },
  {
    name: 'Video',
    hasChildren: true,
    props: videoProps,
    icon: 'Film',
    category: 'media',
    displayName: 'Video',
    description: 'HTML5 video player with native controls (track/source passthrough via children)',
    searchTerms: ['video', 'media', 'player', 'mp4', 'webm', 'movie'],
  },
  {
    name: 'Audio',
    hasChildren: true,
    props: audioProps,
    icon: 'Volume2',
    category: 'media',
    displayName: 'Audio',
    description: 'HTML5 audio player with native controls (source/track passthrough via children)',
    searchTerms: ['audio', 'sound', 'music', 'mp3', 'podcast', 'player'],
  },

  // Content
  {
    name: 'Accordion',
    hasChildren: true,
    props: accordionProps,
    icon: 'ChevronRight',
    category: 'content',
    displayName: 'Accordion',
    description:
      'Standalone expand/collapse via native HTML5 <details>/<summary>. Group siblings with the `name` prop for exclusive-accordion UX.',
    searchTerms: ['toggle', 'accordion', 'expandable', 'details', 'disclosure', 'collapse', 'fold'],
  },
];
