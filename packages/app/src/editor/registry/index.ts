/**
 * App-side descriptor registry — merges core JsxComponentMeta with
 * React component implementations from componentMap.
 */
import { builtInComponents, type PropDef, wildcardMeta } from '@inkeep/open-knowledge-core';
import { componentMap } from '../components/componentMap.tsx';
import type { JsxComponentDescriptor } from './types.ts';

function computeReactNodePropNames(props: PropDef[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const p of props) {
    if (p.type === 'reactnode') names.add(p.name);
  }
  return names;
}

const wildcardDescriptor: JsxComponentDescriptor = {
  ...wildcardMeta,
  Component: componentMap['*'],
  reactNodePropNames: computeReactNodePropNames(wildcardMeta.props),
};

const descriptorMap = new Map<string, JsxComponentDescriptor>();
descriptorMap.set('*', wildcardDescriptor);

for (const meta of builtInComponents) {
  const Component = componentMap[meta.name];
  if (Component) {
    descriptorMap.set(meta.name, {
      ...meta,
      Component,
      reactNodePropNames: computeReactNodePropNames(meta.props),
    });
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
 * All registered descriptors (excluding wildcard).
 */
export function getRegisteredDescriptors(): JsxComponentDescriptor[] {
  return [...descriptorMap.values()].filter((d) => d.name !== '*');
}
