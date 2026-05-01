import type { JsxComponentMeta } from '@inkeep/open-knowledge-core';

interface JsxComponentDecoration {
  Component: React.ComponentType<any>;
  reactNodePropNames: ReadonlySet<string>;
}

export type JsxComponentDescriptor = JsxComponentMeta & JsxComponentDecoration;
