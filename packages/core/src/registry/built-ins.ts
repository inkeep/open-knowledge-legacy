/**
 * Built-ins manifest — 5-pack foundation (Callout + Image + Audio slotted here,
 * Video in US-007, Accordion in US-009).
 *
 * Scope contract for this file after US-003 (`specs/2026-04-23-cb-v2-md-foundation/`):
 * exactly three registered descriptors (+ wildcard `'*'` injected by the
 * registry factory). Cut in US-003: Banner, Card, Cards, Step, Steps, Tab,
 * Tabs, Accordion (fumadocs shape), Accordions, File, Files, Folder,
 * TypeTable, InlineTOC — 14 fumadocs descriptors retired because the 5-pack
 * has no compound-wrapper machinery (US-002 deleted `compound-wrappers.tsx`
 * and the precedent #27 compound-components bridge was retracted on this
 * branch in US-001). Names that still appear in user content fall through to
 * the wildcard `'*'` descriptor (`hasChildren: true`, empty props) per
 * `createRegistry()` / `getOrWildcard()`.
 *
 * ImageZoom renamed to Image (US-003 / FR-20); US-006 widens the prop surface
 * to the FR-2 8-prop shape (src, alt, width, height, caption, title, loading,
 * zoom) alongside the DIY `react-medium-image-zoom` renderer. US-005 widened
 * Callout to 7 props (GFM 5-type enum + title/icon/color/collapsible/
 * defaultOpen). Audio stays at the pre-US-006 shape here; US-008 widens it to
 * 7 props (src/title/autoplay/loop/muted/preload + children).
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

// ── Audio ────────────────────────────────────────────────────────────────────

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
    description: 'Audio title',
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
    name: 'Audio',
    hasChildren: false,
    isSelfClosing: true,
    props: audioProps,
    icon: 'Volume2',
    category: 'media',
    displayName: 'Audio',
    description: 'Audio player',
    searchTerms: ['audio', 'sound', 'music', 'mp3'],
  },
];
