/**
 * Registry types — React-free metadata for JSX component descriptors.
 *
 * Core owns the typed metadata; the app layer adds `Component: React.ComponentType<any>`.
 * This file MUST NOT import React.
 */

import type { Node as PmNode } from '@tiptap/pm/model';
import type { Nodes as MdastNodes } from 'mdast';
import type { ComponentRegistry } from './index.ts';

// ── PropDef discriminated union ──────────────────────────────────────────────

export interface PropDefBase {
  name: string;
  required: boolean;
  description?: string;
  /**
   * Suppresses the prop from the auto-generated PropPanel UI, while keeping
   * it in the descriptor for documentation and MCP queries. Useful for extracted
   * props that shouldn't surface to authors (className, ref, style, internal-only
   * fields). Analogous to Storybook's `argTypes.X.control: false`. The
   * build-registry JSDoc extractor populates this from an `@hidden` tag on the
   * source prop.
   */
  hidden?: boolean;
  /**
   * Marks a prop as belonging to the PropPanel "Advanced" collapsible section.
   * Closed by default; trigger reads "Advanced" with a count of non-default-valued
   * props. Used for HTML-native attrs that experienced authors want but don't
   * edit on every insert (srcset, sizes, decoding, fetchpriority, etc.).
   *
   * Mirrors the precedent of `hidden?: boolean` above: additive, non-discriminating,
   * doesn't trip the PropPanel assertUnreachable check (which switches on `type`).
   */
  advanced?: boolean;
  /**
   * Opt-in: when the prop value strictly equals the declared `defaultValue`,
   * omit the attribute on emit. The renderer applies the default at parse
   * time anyway (descriptor `translateProps` and React component-level
   * defaults), so the on-disk attribute is redundant.
   *
   * Distinct from `defaultValue`: `defaultValue` doubles as a UI initial-
   * state hint AND may carry semantic meaning (e.g., `<img alt="">` is
   * "decorative" — different from absent — even though defaultValue is `''`).
   * Set this flag only when the rendered behavior of `prop=default` and
   * `prop absent` is truly identical at the browser layer (e.g., HTML
   * `loading` defaults to `lazy`; HTML5 `<video controls>` defaults to
   * absent-controls = no controls but our descriptor flips that with
   * `defaultValue: true`).
   *
   * Strips redundant attrs on the dirty serialize path only — pristine
   * sourceRaw round-trips byte-identically (precedent #9 untouched).
   */
  omitOnDefault?: boolean;
}

export interface PropDefString extends PropDefBase {
  type: 'string';
  defaultValue?: string;
  /**
   * Allowed file types for an optional upload affordance on this prop. When
   * set, the auto-rendered PropPanel input renders an upload icon-button next
   * to the URL field that opens a native file picker constrained to these
   * types. Each entry is either a MIME type (`image/png`), a MIME wildcard
   * (`image/*`), or a `.ext` shortcut (`.svg`) — all three forms are valid per
   * MDN Web/HTML/Element/input#accept. The array is joined to a comma-string
   * at the `<input accept>` boundary; clients are still expected to validate
   * server-side (the `accept` value is a UX hint, not a security control).
   */
  accept?: readonly string[];
  /**
   * When the PropPanel mounts, focus this prop's input first. Mirrors the
   * React DOM `autoFocus` convention. If multiple props on a descriptor set
   * `autoFocus: true`, the first match (in declared `props[]` order) wins —
   * deterministic and avoids a separate ordering field.
   */
  autoFocus?: boolean;
}

export interface PropDefBoolean extends PropDefBase {
  type: 'boolean';
  defaultValue?: boolean;
}

export interface PropDefNumber extends PropDefBase {
  type: 'number';
  defaultValue?: number;
}

export interface PropDefEnum extends PropDefBase {
  type: 'enum';
  enumValues: [string, ...string[]];
  defaultValue?: string;
}

export interface PropDefReactNode extends PropDefBase {
  type: 'reactnode';
}

export type PropDef =
  | PropDefString
  | PropDefBoolean
  | PropDefNumber
  | PropDefEnum
  | PropDefReactNode;

// ── SerializeContext + helper types ──────────────────────────────────────────

/**
 * State threaded into a descriptor's `serialize(node, ctx)` call. Provides the
 * minimum surface a descriptor needs to emit its source-form mdast.
 *
 * Mirror of remark-prosemirror's internal `State` (not publicly exported); the
 * field names must stay in lockstep with `markdown/index.ts` (`MdastToPmState`).
 */
export interface SerializeContext {
  /** Recursively serialize a PM node's children to mdast nodes. */
  all: (node: PmNode) => MdastNodes[];
  /** Read-only access to the registry. Used by descriptors that delegate. */
  registry: Pick<ComponentRegistry, 'getOrWildcard'>;
  /**
   * Render PM children to markdown bytes. Required by source forms whose emit
   * is a single `html` mdast node carrying the body verbatim (e.g.,
   * `<details>...</details>`). The host wires this from
   * `mdast-util-to-markdown`'s `containerFlow`. May throw if the host has not
   * provided it; descriptors that don't need it must not call it.
   */
  serializeChildren: (node: PmNode) => string;
}

/**
 * Translates a compat descriptor's stored prop bag to the render-time props
 * its `rendersAs` canonical Component expects. Pure; no React. Identity for
 * v1's three compat descriptors (their prop names already match canonical).
 */
type TranslateProps = (compatProps: Record<string, unknown>) => Record<string, unknown>;

// ── JsxComponentMeta — discriminated on `surface` ───────────────────────────

/**
 * Fields shared by both surfaces of `JsxComponentMeta`.
 *
 * NG14: registry tracks block components only. No isInline field —
 * inline JSX is the thin jsxInline node and doesn't use descriptors.
 */
interface JsxComponentMetaBase {
  /** Component tag name, or '*' for the wildcard fallback. */
  name: string;
  /** PropPanel/slash-menu hint; NodeViewContent always renders per Precedent #26. */
  hasChildren: boolean;
  /** Hint: component is typically self-closing (e.g., <Chart />). */
  isSelfClosing?: boolean;
  /** Auto-generated by react-docgen-typescript or hand-authored. */
  props: PropDef[];
  /** Slash menu icon name (resolved to Lucide in app). */
  icon?: string;
  /** Slash menu grouping category. Precedent #9 keeps this add-only —
   *  extending with new members is free; narrowing is permanent lock-in. */
  category?: 'content' | 'media';
  /** Slash menu label. */
  displayName?: string;
  /** One-line summary for slash menu + MCP agent discovery. */
  description?: string;
  /** Slash-command aliases (e.g., Callout → ['note','warning','tip','info','alert']). */
  searchTerms?: string[];
  /** For empty-container placeholder UX — Steps → 'Step', Tabs → 'Tab'. */
  emptyChildName?: string;
  /**
   * Emit this descriptor's source form as mdast. Required.
   *
   * Pristine-path round-trip is handled upstream by the caller via
   * `data.sourceRaw` passthrough — descriptors only own the dirty path. Each
   * canonical descriptor emits an `mdxJsxFlowElement`; each compat descriptor
   * emits its native source form (blockquote for GFMCallout, paragraph+image
   * for CommonMarkImage, html-block for HtmlDetailsAccordion).
   */
  serialize: (node: PmNode, ctx: SerializeContext) => MdastNodes;
}

/**
 * Canonical descriptor — appears in the slash menu, what WYSIWYG writes for
 * fresh inserts. Renders directly through its own React component in
 * `componentMap` (keyed by `name`).
 */
interface CanonicalMeta extends JsxComponentMetaBase {
  surface: 'canonical';
}

/**
 * Compat descriptor — read-only; never offered for new insertion. Preserves
 * the source form on round-trip via its own `serialize` even after edits.
 *
 * Renders through the canonical descriptor's React component (looked up via
 * `rendersAs`), with `translateProps` adapting the compat's prop names to
 * whatever the canonical Component expects.
 */
export interface CompatMeta extends JsxComponentMetaBase {
  surface: 'compat';
  /**
   * Canonical descriptor name to render through. Must resolve to a registered
   * `CanonicalMeta` at registry build time; the app-side registry throws on
   * init if the reference is dangling.
   */
  rendersAs: string;
  /**
   * Per-descriptor prop-name remap from compat storage shape to canonical
   * Component render-prop shape. Identity for v1's three compat descriptors
   * (their prop names already match canonical's spelling).
   */
  translateProps: TranslateProps;
}

/**
 * Descriptor union — runtime dispatch on `surface` discriminator. Closes
 * exhaustive switches with `assertNever` per type-safety idioms.
 */
export type JsxComponentMeta = CanonicalMeta | CompatMeta;
