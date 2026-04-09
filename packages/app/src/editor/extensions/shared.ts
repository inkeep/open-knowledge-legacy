/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * BOTH jsxComponentEditable and jsxComponentVoid with React-enabled versions
 * that have NodeView renderers.
 */
import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import { JsxComponentEditable, JsxComponentVoid } from './jsx-component';

// Replace core's jsxComponent extensions (no NodeView) with app's (has ReactNodeViewRenderer)
export const sharedExtensions = coreExtensions.map((ext) => {
  if (ext.name === 'jsxComponentEditable') return JsxComponentEditable;
  if (ext.name === 'jsxComponentVoid') return JsxComponentVoid;
  return ext;
});
