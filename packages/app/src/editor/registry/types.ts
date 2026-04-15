/**
 * App-side descriptor — extends core JsxComponentMeta with the React component.
 */
import type { JsxComponentMeta } from '@inkeep/open-knowledge-core';

export interface JsxComponentDescriptor extends JsxComponentMeta {
  // biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across 18+ built-ins; no single prop type covers all
  Component: React.ComponentType<any>;
}
