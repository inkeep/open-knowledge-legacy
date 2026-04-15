/**
 * App-side descriptor registry — merges core JsxComponentMeta with
 * React component implementations from componentMap.
 */
import { builtInComponents, wildcardMeta } from '@inkeep/open-knowledge-core';
import { componentMap } from '../components/componentMap.tsx';
import type { JsxComponentDescriptor } from './types.ts';

export type { JsxComponentDescriptor } from './types.ts';

const wildcardDescriptor: JsxComponentDescriptor = {
  ...wildcardMeta,
  Component: componentMap['*'],
};

const descriptorMap = new Map<string, JsxComponentDescriptor>();
descriptorMap.set('*', wildcardDescriptor);

for (const meta of builtInComponents) {
  const Component = componentMap[meta.name];
  if (Component) {
    descriptorMap.set(meta.name, { ...meta, Component });
  }
}

/**
 * Lookup a descriptor by component name. Returns wildcard '*' for
 * unregistered names.
 */
export function getDescriptor(name: string): JsxComponentDescriptor {
  return descriptorMap.get(name) ?? (descriptorMap.get('*') as JsxComponentDescriptor);
}

/**
 * Check if a name has a registered (non-wildcard) descriptor.
 */
export function hasDescriptor(name: string): boolean {
  return descriptorMap.has(name) && name !== '*';
}

/**
 * All registered descriptors (excluding wildcard).
 */
export function getRegisteredDescriptors(): JsxComponentDescriptor[] {
  return [...descriptorMap.values()].filter((d) => d.name !== '*');
}
