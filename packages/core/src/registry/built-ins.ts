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
 * ImageZoom renamed to Image (US-003 / FR-20) — prop shape stays as-is for
 * now; US-006 widens to the FR-2 8-prop shape (alt, width, height, caption,
 * title, loading, zoom) alongside the DIY `react-medium-image-zoom` renderer.
 * Callout and Audio prop shapes are untouched here; US-005 widens Callout to
 * 7 props (GFM 5-type enum + title/icon/color/collapsible/defaultOpen) and
 * US-008 widens Audio to 7 props (src/title/autoplay/loop/muted/preload +
 * children).
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

const calloutProps: PropDef[] = [
  {
    name: 'type',
    type: 'enum',
    enumValues: ['info', 'warn', 'error', 'success', 'warning', 'idea'],
    defaultValue: 'info',
    required: false,
    description: 'Visual variant of the callout',
  },
  {
    name: 'icon',
    type: 'reactnode',
    required: false,
    description: 'Custom icon override',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Callout content',
  },
];

// ── Image (renamed from ImageZoom in US-003; prop shape widens in US-006) ───

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
    name: 'children',
    type: 'reactnode',
    required: false,
    description: 'Image caption',
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
    description: 'Callout box with type variants (info, warning, error, etc.)',
    searchTerms: ['note', 'warning', 'tip', 'info', 'alert', 'admonition'],
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
    description: 'Image with click-to-zoom',
    searchTerms: ['image', 'zoom', 'picture', 'photo'],
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
