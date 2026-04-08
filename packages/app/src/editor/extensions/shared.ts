/**
 * App-specific shared extensions — uses core's sharedExtensions but swaps
 * JsxComponent for the React-enabled version with NodeView.
 */
import { sharedExtensions as coreExtensions } from '@inkeep/open-knowledge-core';
import { JsxComponent } from './jsx-component';

// Replace core's JsxComponent (no NodeView) with app's (has ReactNodeViewRenderer)
export const sharedExtensions = coreExtensions.map((ext) =>
  ext.name === 'jsxComponent' ? JsxComponent : ext,
);
