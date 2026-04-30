/**
 * Shared helpers for descriptor `serialize(node, ctx)` implementations.
 *
 * Used by:
 *  - The 5 canonical descriptors in `registry/built-ins.ts` (each emits an
 *    `mdxJsxFlowElement` with their own name via `emitMdxJsx`).
 *  - The wildcard `'*'` descriptor (same emit shape as canonical for
 *    backward compat with unregistered components).
 *  - The compat descriptors (which generally do NOT use `emitMdxJsx` —
 *    they emit their native source-form mdast — but use `reconstructAttrs`
 *    if they need to merge preserved attributes with structured props).
 *
 * One-way deps: helpers depend on `mdast` types only (no PM-schema or
 * registry imports beyond `SerializeContext`). Descriptors import from here;
 * `markdown/index.ts` imports from here. No circular path.
 */

import type { Node as PmNode } from '@tiptap/pm/model';
import type { MdxJsxAttribute, MdxJsxExpressionAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import type { PropDef, SerializeContext } from '../registry/types.ts';

/**
 * Reconstruct MdxJsxAttribute[] from a jsxComponent PM node's attrs.
 *
 * Merge semantics (FR-21): starts from the preserved mdast `attributes` array,
 * overlays structured props from `attrs.props` for descriptor-declared keys.
 * All other keys pass through verbatim. Prevents the γ-dirty path from
 * silently dropping user-supplied attrs not known to the descriptor.
 *
 * Optional `props` parameter enables emit-time default-omission per the
 * `omitOnDefault` PropDef flag: when a structured prop's value strictly
 * equals its declared `defaultValue` AND the PropDef opted in via
 * `omitOnDefault: true`, the attribute is dropped from emit (and stripped
 * from `preserved` if it was there too). Browser-default-equivalent attrs
 * like `loading="lazy"` / `decoding="auto"` / `<video controls={true}>`
 * become noise on disk; this reconciles authored-via-PropPanel state with
 * the canonical "absent ≡ default" source shape.
 */
function reconstructAttrs(
  pmNode: PmNode,
  props?: readonly PropDef[],
): Array<MdxJsxAttribute | MdxJsxExpressionAttribute> {
  const preserved: Array<MdxJsxAttribute | MdxJsxExpressionAttribute> = Array.isArray(
    pmNode.attrs.attributes,
  )
    ? pmNode.attrs.attributes.filter(
        (a): a is MdxJsxAttribute | MdxJsxExpressionAttribute =>
          a != null && typeof a === 'object' && 'type' in a,
      )
    : [];
  const structuredProps: Record<string, unknown> = pmNode.attrs.props ?? {};

  // Build per-prop omission rules from the descriptor:
  //   1. `omitDefaults` — opt-in default-equivalence (loading="lazy",
  //      controls={true}). Skip when value strictly equals defaultValue.
  //   2. `stringPropsOmittingEmpty` — string PropDefs that do NOT declare
  //      an explicit `defaultValue: ''`. Empty string on these is "absent"
  //      noise (srcset="", sizes="", title="", referrerpolicy="") — the
  //      attribute carries no semantic vs being absent. Stripped on emit.
  //
  // The string rule is NOT opt-in because semantically-meaningful empty
  // string props (alt="" decorative-image per WCAG) declare
  // `defaultValue: ''` explicitly, which excludes them from this set —
  // their empty value is preserved on emit. Numbers / booleans / enums
  // never participate in this rule (number `0`, boolean `false`, enum
  // first-value are all distinct from "absent" in HTML semantics).
  const omitDefaults = new Map<string, unknown>();
  const stringPropsOmittingEmpty = new Set<string>();
  if (props) {
    for (const p of props) {
      if (p.omitOnDefault === true && 'defaultValue' in p && p.defaultValue !== undefined) {
        omitDefaults.set(p.name, p.defaultValue);
      }
      if (p.type === 'string' && p.required === false && p.defaultValue === undefined) {
        stringPropsOmittingEmpty.add(p.name);
      }
    }
  }

  for (const [key, value] of Object.entries(structuredProps)) {
    const existingIdx = preserved.findIndex((a) => a.type === 'mdxJsxAttribute' && a.name === key);

    // Default-omit: prop value matches declared default AND opt-in flag is
    // set. Strip from preserved too so re-saves are stable (preserved was
    // populated from a prior parse of the same prop attribute and would
    // re-emit otherwise).
    if (omitDefaults.has(key) && Object.is(omitDefaults.get(key), value)) {
      if (existingIdx >= 0) preserved.splice(existingIdx, 1);
      continue;
    }

    // Empty-string-omit: optional string props with no explicit default.
    // Catches PropPanel-driven empty-attr drift (`srcset=""` / `sizes=""`
    // / `title=""`) without affecting WCAG-semantic `alt=""` (which
    // declares `defaultValue: ''` and is excluded from this set).
    if (stringPropsOmittingEmpty.has(key) && value === '') {
      if (existingIdx >= 0) preserved.splice(existingIdx, 1);
      continue;
    }

    const newAttr = propToMdxJsxAttribute(key, value);
    if (existingIdx >= 0) {
      preserved[existingIdx] = newAttr;
    } else {
      preserved.push(newAttr);
    }
  }

  return preserved;
}

/**
 * Convert a (key, value) pair to an MdxJsxAttribute mdast node.
 *
 * Encoding rules:
 * - `true` / `null` / `undefined` → boolean shorthand (`<C bool />`)
 * - `false` → expression (`<C bool={false} />`)
 * - string → literal (`<C s="…" />`)
 * - number / object / array → JSON-stringified expression
 */
function propToMdxJsxAttribute(name: string, value: unknown): MdxJsxAttribute {
  if (value === true) {
    return { type: 'mdxJsxAttribute', name, value: null };
  }
  if (value === false) {
    return {
      type: 'mdxJsxAttribute',
      name,
      value: { type: 'mdxJsxAttributeValueExpression', value: 'false' },
    };
  }
  if (value == null) {
    return { type: 'mdxJsxAttribute', name, value: null };
  }
  if (typeof value === 'string') {
    return { type: 'mdxJsxAttribute', name, value };
  }
  if (typeof value === 'number') {
    return {
      type: 'mdxJsxAttribute',
      name,
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: JSON.stringify(value),
      },
    };
  }
  if (typeof value === 'object') {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      serialized = String(value);
    }
    return {
      type: 'mdxJsxAttribute',
      name,
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: serialized,
      },
    };
  }
  return { type: 'mdxJsxAttribute', name, value: String(value) };
}

/**
 * Build a structural-reconstruction `mdxJsxFlowElement` from a PM jsxComponent
 * node. This is the canonical (and wildcard) descriptor's `serialize` body.
 *
 * The to-markdown handler at `to-markdown-handlers.ts:316-362` falls through
 * to its flush-left reconstruction branch when `data.sourceRaw` is absent,
 * emitting `<Name attr1 attr2>...</Name>` with a bit-exact attribute order
 * matching `reconstructAttrs`'s preserved-then-overlay output.
 *
 * Pass the descriptor's `props` array to enable emit-time default-omission
 * for opt-in PropDefs (`omitOnDefault: true` + declared `defaultValue`).
 * When omitted, the function still serializes correctly — props are emitted
 * verbatim from the prop bag, equivalent to pre-flag behavior.
 *
 * Compat descriptors generally do NOT use this — they emit their own native
 * source form (blockquote, paragraph+image, html-block).
 */
export function emitMdxJsx(
  componentName: string,
  pmNode: PmNode,
  ctx: SerializeContext,
  props?: readonly PropDef[],
): MdxJsxFlowElement {
  return {
    type: 'mdxJsxFlowElement',
    name: componentName,
    attributes: reconstructAttrs(pmNode, props),
    children: ctx.all(pmNode) as MdxJsxFlowElement['children'],
    data: {},
  };
}
