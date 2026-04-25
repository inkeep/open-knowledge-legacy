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
 * machinery (US-002 deleted `compound-wrappers.tsx` and the precedent #29
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
 * (src/title) to the FR-4 7-prop shape (src/title/autoPlay/loop/muted/preload
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
import { emitMdxJsx } from '../markdown/serialize-helpers.ts';
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
// component at all). 8-prop self-closing leaf: `src` + `title` + `controls`
// (default true) + `autoPlay` + `muted` + `loop` + `playsInline` + `poster` +
// `preload` (enum).
//
// Self-closing, no children slot. The HTML5 spec requires `<track>` and
// `<source>` as direct children of `<video>`, but ProseMirror NodeViews
// mandate a wrapper DOM element to host the content hole — the two
// contracts are structurally incompatible. Rather than pretend otherwise,
// Video is a leaf descriptor symmetric with Image. Authors who need
// captions or codec fallback sources write raw `<video>` + `<track>` HTML
// in MDX, which flows through the wildcard / rawMdxFallback path
// (byte-preserving, editable).
//
// Explicitly out-of-scope (per D-MF12 / NG27 / NG28 / NG31):
//   - YouTube / Vimeo URL sniffing → users author raw `<iframe>` for service
//     embeds; future NG27 promotes auto-detection when authoring friction
//     surfaces. Cheap to add later (~40 LoC render-time URL sniff) and
//     strictly additive — no descriptor shape change.
//   - `start` seek prop → Mintlify + Fumadocs both omit; video seeking is
//     runtime behavior, not a persisted authoring prop.
//   - Custom player chrome → HTML5 native controls are the UX; matches the
//     NG7 "no confidently-broken chrome" rule.
//   - Typed `tracks: Array<TrackDef>` / `sources: Array<SourceDef>` props
//     → NG31 Future Work; requires extending PropDef with an `array` type
//     of structured records (PropPanel UX, γ serialization, empty-array
//     default all need design). Ship today: raw-HTML escape hatch.

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
// native controls always on (NG7 "no confidently-broken chrome"). 6-prop
// self-closing leaf: `src` + `title` + `autoPlay` + `loop` + `muted` +
// `preload` (enum).
//
// No `controls` prop — per FR-4, controls are always on. Authors who want a
// chrome-less audio (background loop) would need to write a raw `<audio>`
// element in MDX; descriptor-dispatched Audio always renders controls.
//
// Self-closing, no children slot (symmetric with Video — see Video's comment
// block for the full PM-vs-HTML5-direct-child rationale). Authors who need
// `<source>` codec fallback write raw `<audio>` + `<source>` HTML in MDX,
// which flows through the wildcard / rawMdxFallback path. Typed `sources:
// Array<SourceDef>` is NG31 Future Work (paired with Video tracks).

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
  // `autoPlay` matches the Video descriptor's camelCase convention (FR-3) and
  // React's MDX-JSX attr canon; the spec's FR-4 originally called for
  // lowercase `autoplay` (HTML5 attr form) but that split the 5-pack's two
  // media descriptors across two casings for no authoring benefit. Per D-MF7
  // greenfield (no migration) we standardize on camelCase here; the renderer
  // passes `autoPlay={props.autoPlay}` straight through.
  // WYH2 review fix: declare in the same `autoPlay → muted → loop` order
  // as the Video descriptor (built-ins.ts L232-251) so the auto-generated
  // PropPanel column order is consistent across the two media primitives.
  // No runtime semantic change — purely a presentation alignment.
  {
    name: 'autoPlay',
    type: 'boolean',
    required: false,
    description: 'Begin playback as soon as possible (usually requires muted)',
  },
  {
    name: 'muted',
    type: 'boolean',
    required: false,
    description: 'Mute audio on load',
  },
  {
    name: 'loop',
    type: 'boolean',
    required: false,
    description: 'Restart from the beginning when playback ends',
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

// ── Compat descriptor prop subsets ───────────────────────────────────────────
//
// Compat descriptors expose ONLY the props their source syntax can natively
// express. Names are canonical (identity translateProps in v1) so storage stays
// uniform — node.attrs.props uses the same keys regardless of which descriptor
// is active. Convert-to-canonical is identity (same prop names, just enabling
// the canonical's full superset).

const gfmCalloutProps: PropDef[] = [
  // GFM `[!TYPE]` marker → type
  calloutProps[0],
  // Obsidian title text after the marker → title
  calloutProps[1],
  // Obsidian `+` / `-` suffix → collapsible + defaultOpen
  calloutProps[4],
  calloutProps[5],
  // Body is the reactnode children slot — same as canonical Callout.
  calloutProps[6],
];

const commonMarkImageProps: PropDef[] = [
  // `![alt](src "title")` — three native fields.
  imageProps[0], // src
  imageProps[1], // alt
  imageProps[5], // title
];

const htmlDetailsAccordionProps: PropDef[] = [
  // `<summary>` inner text → title
  accordionProps[0],
  // `open` HTML attr → defaultOpen
  accordionProps[1],
  // `id` HTML attr → id (deep-link anchor)
  accordionProps[4],
  // `name` HTML attr → name (HTML5 mutex group)
  accordionProps[5],
];

// ── Compat serialize helpers ─────────────────────────────────────────────────

/** Minimal HTML attribute-value escape (matches the lossiness of the parser). */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Minimal HTML text-content escape for `<summary>` inner text. */
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Manifest ─────────────────────────────────────────────────────────────────

export const builtInComponents: JsxComponentMeta[] = [
  // Content
  {
    name: 'Callout',
    surface: 'canonical',
    hasChildren: true,
    props: calloutProps,
    icon: 'MessageSquareWarning',
    category: 'content',
    displayName: 'Callout',
    description:
      'GFM alert / admonition with 5 type variants (note, tip, important, warning, caution)',
    searchTerms: ['note', 'warning', 'tip', 'important', 'caution', 'alert', 'admonition'],
    serialize: (node, ctx) => emitMdxJsx('Callout', node, ctx),
  },

  // Media
  {
    name: 'Image',
    surface: 'canonical',
    hasChildren: false,
    isSelfClosing: true,
    props: imageProps,
    icon: 'ZoomIn',
    category: 'media',
    displayName: 'Image',
    description: 'Image with optional caption, explicit dimensions, and click-to-zoom',
    searchTerms: ['image', 'zoom', 'picture', 'photo', 'figure', 'caption'],
    serialize: (node, ctx) => emitMdxJsx('Image', node, ctx),
  },
  {
    name: 'Video',
    surface: 'canonical',
    hasChildren: false,
    isSelfClosing: true,
    props: videoProps,
    icon: 'Film',
    category: 'media',
    displayName: 'Video',
    description: 'HTML5 video player with native controls',
    searchTerms: ['video', 'media', 'player', 'mp4', 'webm', 'movie'],
    serialize: (node, ctx) => emitMdxJsx('Video', node, ctx),
  },
  {
    name: 'Audio',
    surface: 'canonical',
    hasChildren: false,
    isSelfClosing: true,
    props: audioProps,
    icon: 'Volume2',
    category: 'media',
    displayName: 'Audio',
    description: 'HTML5 audio player with native controls',
    searchTerms: ['audio', 'sound', 'music', 'mp3', 'podcast', 'player'],
    serialize: (node, ctx) => emitMdxJsx('Audio', node, ctx),
  },

  // Content
  {
    name: 'Accordion',
    surface: 'canonical',
    hasChildren: true,
    props: accordionProps,
    icon: 'ChevronRight',
    category: 'content',
    displayName: 'Accordion',
    description:
      'Standalone expand/collapse via native HTML5 <details>/<summary>. Group siblings with the `name` prop for exclusive-accordion UX.',
    searchTerms: ['toggle', 'accordion', 'expandable', 'details', 'disclosure', 'collapse', 'fold'],
    serialize: (node, ctx) => emitMdxJsx('Accordion', node, ctx),
  },

  // ── Compat descriptors ─────────────────────────────────────────────────────
  // Read-only; never offered for new insertion (slash menu filters to
  // `surface: 'canonical'`). Each owns its own source-form serialize so
  // round-trip preserves the source bytes even after a user prop edit.

  {
    name: 'GFMCallout',
    surface: 'compat',
    hasChildren: true,
    props: gfmCalloutProps,
    icon: 'MessageSquareWarning',
    category: 'content',
    displayName: 'GFM Callout',
    description:
      'GFM blockquote alert (`> [!NOTE]`) — read-only compat. Convert to Callout for full prop access.',
    rendersAs: 'Callout',
    translateProps: (props) => props,
    convertibleTo: { target: 'Callout', remap: (props) => props },
    serialize: (node, ctx) => {
      const props = node.attrs.props as
        | {
            type?: string;
            title?: string;
            collapsible?: boolean;
            defaultOpen?: boolean;
          }
        | undefined;
      // Clamp to the GFM 5-type enum — the source form can only encode these
      // values syntactically. An invalid `type` (e.g., set via `setNodeMarkup`
      // by some external source) falls back to 'note' so the emit stays
      // GFM-syntax-valid and idempotent on round-trip. Mirror of the
      // alerts-plugin's permissiveness on parse + the descriptor PropDef enum.
      const GFM_ALERT_TYPES = new Set(['note', 'tip', 'important', 'warning', 'caution']);
      const rawType = props?.type ?? 'note';
      const type = (GFM_ALERT_TYPES.has(rawType.toLowerCase()) ? rawType : 'note').toUpperCase();
      // Obsidian `+` / `-` suffix encoding: collapsible+defaultOpen → `+`,
      // collapsible+!defaultOpen → `-`, !collapsible → no suffix.
      const suffix = props?.collapsible ? (props.defaultOpen === false ? '-' : '+') : '';
      const titleSegment = props?.title ? ` ${props.title}` : '';
      // Emit the alert marker as `html` mdast so remark-stringify does NOT
      // escape the `[` (text-node emit produces `\[!NOTE]`, breaking the
      // alerts-plugin re-parse). The blockquote container handler prefixes
      // every line with `> `; remark-github-alerts re-parses the resulting
      // `> [!TYPE]\n>\n> body` shape identically on round-trip → idempotent
      // dirty path holds.
      const marker = {
        type: 'html' as const,
        value: `[!${type}]${suffix}${titleSegment}`,
      };
      // Strip empty paragraphs from the body — a `> [!TYPE]\n>\n> body` source
      // re-parses with an empty paragraph between the marker line and the
      // body, and emitting it back through the blockquote handler would add
      // another blank `> ` line on every round-trip (idempotence violation).
      // Empty paragraphs are layout-only artifacts of the alert-block parse
      // and don't carry semantic content; dropping them produces a stable
      // fixed point under dirty-path re-emit.
      const body = ctx.all(node).filter((child) => {
        if (child.type !== 'paragraph') return true;
        const para = child as { type: 'paragraph'; children?: unknown[] };
        return Array.isArray(para.children) && para.children.length > 0;
      });
      return {
        type: 'blockquote' as const,
        children: [marker, ...body] as never,
      };
    },
  },

  {
    name: 'CommonMarkImage',
    surface: 'compat',
    hasChildren: false,
    isSelfClosing: true,
    props: commonMarkImageProps,
    icon: 'ZoomIn',
    category: 'media',
    displayName: 'CommonMark Image',
    description:
      'CommonMark image (`![alt](src "title")`) — read-only compat. Convert to Image for caption / dimensions / zoom props.',
    rendersAs: 'Image',
    translateProps: (props) => props,
    convertibleTo: { target: 'Image', remap: (props) => props },
    serialize: (node) => {
      const p = node.attrs.props as { src?: string; alt?: string; title?: string } | undefined;
      const image = {
        type: 'image' as const,
        url: p?.src ?? '',
        alt: p?.alt ?? '',
        title: p?.title ?? null,
      };
      return {
        type: 'paragraph' as const,
        children: [image],
      };
    },
  },

  {
    name: 'HtmlDetailsAccordion',
    surface: 'compat',
    hasChildren: true,
    props: htmlDetailsAccordionProps,
    icon: 'ChevronRight',
    category: 'content',
    displayName: 'HTML5 Details',
    description:
      'HTML5 `<details><summary>` collapsible — read-only compat. Convert to Accordion for icon / description props.',
    rendersAs: 'Accordion',
    translateProps: (props) => props,
    convertibleTo: { target: 'Accordion', remap: (props) => props },
    serialize: (node, ctx) => {
      const p = node.attrs.props as
        | { title?: string; defaultOpen?: boolean; name?: string; id?: string }
        | undefined;
      const open = p?.defaultOpen ? ' open' : '';
      const nameAttr = p?.name ? ` name="${escapeHtmlAttr(p.name)}"` : '';
      const idAttr = p?.id ? ` id="${escapeHtmlAttr(p.id)}"` : '';
      // Trim the title before emit — the parser strips leading/trailing
      // whitespace inside `<summary>`, so an un-trimmed title would round-trip
      // to a trimmed re-parse and break dirty-path idempotence. An empty
      // title (whitespace-only) emits no summary tag at all.
      const trimmedTitle = p?.title?.trim();
      const summary = trimmedTitle ? `<summary>${escapeHtmlText(trimmedTitle)}</summary>` : '';
      // Body is rendered by the to-markdown handler via state.containerFlow
      // when `data.htmlBoundary` is set — emit a marker mdxJsxFlowElement
      // carrying the opener/closer strings and the live mdast body children.
      return {
        type: 'mdxJsxFlowElement' as const,
        name: 'HtmlDetailsAccordion',
        attributes: [],
        children: ctx.all(node) as never,
        data: {
          htmlBoundary: {
            opener: `<details${open}${nameAttr}${idAttr}>\n${summary}`,
            closer: '</details>',
          },
        },
      };
    },
  },
];
