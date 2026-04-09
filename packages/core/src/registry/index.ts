// Generated manifest (extracted prop schemas — committed, not gitignored)
export { componentManifest } from '../generated/components.ts';
// NOTE: BUILT_INS is NOT re-exported here — it uses node:module (createRequire)
// which crashes Vite's browser bundle. Import directly from './built-ins.ts'
// in Node-only contexts (e.g., build-registry script).
export type { JsxComponentExtensions } from './jsx-component-factory.ts';
// Factory
export { createJsxComponentExtensions } from './jsx-component-factory.ts';

// Registry types
export type { BuiltInManifestEntry, ComponentMeta, PropDef } from './types.ts';
