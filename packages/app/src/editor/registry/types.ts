/**
 * App-side descriptor — extends core JsxComponentMeta with the React component.
 *
 * `reactNodePropNames` is pre-computed once at registry build time so NodeViews
 * don't reconstruct it per render. See Finding 17 (PR review) — any per-render
 * work in a jsxComponent NodeView multiplies across every component in the
 * doc on every PM transaction.
 */
import type { JsxComponentMeta } from '@inkeep/open-knowledge-core';

export interface JsxComponentDescriptor extends JsxComponentMeta {
  // biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across 18+ built-ins; no single prop type covers all
  Component: React.ComponentType<any>;
  /** Pre-computed set of prop names typed as `reactnode`. Stable per descriptor. */
  reactNodePropNames: ReadonlySet<string>;
}
