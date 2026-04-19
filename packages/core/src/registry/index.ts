/**
 * Component descriptor registry — runtime Map with wildcard fallback.
 *
 * NG14: registry tracks block components only. Inline JSX uses the
 * thin jsxInline PM node — no descriptors, no dispatch.
 */

export { builtInComponents } from './built-ins.ts';
export type { JsxComponentMeta, PropDef } from './types.ts';

import { builtInComponents } from './built-ins.ts';
import type { JsxComponentMeta } from './types.ts';

/**
 * The wildcard descriptor — serves any component name not in the registry.
 * hasChildren: true so markdown children remain editable ("bring your own markdown").
 */
export const wildcardMeta: JsxComponentMeta = {
  name: '*',
  hasChildren: true,
  props: [],
  description: 'Unregistered component — children editable as markdown',
};

export interface ComponentRegistry {
  /**
   * Return the registered descriptor for `name`, or `undefined` if no
   * descriptor is registered under that name. Callers that want the
   * wildcard-fallback semantic should use `getOrWildcard`.
   */
  get(name: string): JsxComponentMeta | undefined;
  /**
   * Return the registered descriptor for `name`, or the wildcard `'*'`
   * descriptor on miss. Use this when you need a descriptor to render
   * against — the wildcard gives you sane defaults (`hasChildren: true`,
   * empty `props`) for unregistered components.
   */
  getOrWildcard(name: string): JsxComponentMeta;
  set(name: string, meta: JsxComponentMeta): void;
  has(name: string): boolean;
  entries(): IterableIterator<[string, JsxComponentMeta]>;
}

/**
 * Creates a registry pre-populated with the 18 built-in components
 * and the wildcard '*' fallback. Additional entries can be added
 * via `registry.set()` (future NG13 extensibility seam).
 */
export function createRegistry(): ComponentRegistry {
  const map = new Map<string, JsxComponentMeta>();

  // Register wildcard first
  map.set('*', wildcardMeta);

  // Register all built-ins
  for (const meta of builtInComponents) {
    map.set(meta.name, meta);
  }

  return {
    get(name) {
      return map.get(name);
    },
    getOrWildcard(name) {
      return map.get(name) ?? (map.get('*') as JsxComponentMeta);
    },
    set(name, meta) {
      map.set(name, meta);
    },
    has(name) {
      return map.has(name);
    },
    entries() {
      return map.entries();
    },
  };
}
