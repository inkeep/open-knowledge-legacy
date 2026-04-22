/**
 * App-side descriptor registry — decorates core's `ComponentRegistry`
 * with React component implementations from `componentMap`.
 *
 * Core owns the wildcard-fallback semantic (`getOrWildcard`) and the
 * built-in manifest. The app layer adds a per-name `{ Component,
 * reactNodePropNames }` decoration lookup and routes meta reads through
 * the core factory — so `coreRegistry.set(name, meta)` on the same
 * registry object flows through to rendering (the NG13 extensibility
 * seam), as long as the embedder also registers a matching React
 * implementation in `componentMap` or provides a `'*'` wildcard that
 * handles the render.
 */
import { createRegistry, type JsxComponentMeta, type PropDef } from '@inkeep/open-knowledge-core';
import { componentMap } from '../components/componentMap.tsx';
import type { JsxComponentDescriptor } from './types.ts';

function computeReactNodePropNames(props: PropDef[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const p of props) {
    if (p.type === 'reactnode') names.add(p.name);
  }
  return names;
}

/**
 * The module-level core registry — single source of truth for metadata.
 * App-level decorations (`Component`, `reactNodePropNames`) live in a
 * sibling lookup keyed by the same name.
 */
const coreRegistry = createRegistry();

interface Decoration {
  // biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across 18+ built-ins; no single prop type covers all
  Component: React.ComponentType<any>;
  reactNodePropNames: ReadonlySet<string>;
}

const decorations = new Map<string, Decoration>();

function buildDecoration(meta: JsxComponentMeta): Decoration | null {
  const Component = componentMap[meta.name];
  if (!Component) return null;
  return {
    Component,
    reactNodePropNames: computeReactNodePropNames(meta.props),
  };
}

// Seed decorations for the wildcard + every built-in whose React component
// ships in `componentMap`. Any future `coreRegistry.set(name, meta)` that
// also lands a matching entry in `componentMap` will render correctly the
// next time `getDescriptor` is called; entries without a render component
// fall through to the wildcard via `getOrWildcard`.
for (const [name, meta] of coreRegistry.entries()) {
  const deco = buildDecoration(meta);
  if (deco) decorations.set(name, deco);
}

function composeDescriptor(meta: JsxComponentMeta, deco: Decoration): JsxComponentDescriptor {
  return {
    ...meta,
    Component: deco.Component,
    reactNodePropNames: deco.reactNodePropNames,
  };
}

/**
 * Lookup a descriptor by component name. Returns the wildcard `'*'`
 * descriptor for unregistered names (core owns the fallback semantic).
 */
export function getDescriptor(name: string): JsxComponentDescriptor {
  const meta = coreRegistry.getOrWildcard(name);
  const deco = decorations.get(meta.name) ?? decorations.get('*');
  if (!deco) {
    // `componentMap['*']` guarantees a wildcard decoration exists at
    // module init. If it doesn't, `componentMap` is mis-seeded — crash
    // loudly rather than render an undefined component.
    throw new Error(`No React component registered for ${meta.name} (and no '*' wildcard)`);
  }
  return composeDescriptor(meta, deco);
}

/**
 * All registered descriptors (excluding wildcard).
 */
export function getRegisteredDescriptors(): JsxComponentDescriptor[] {
  const result: JsxComponentDescriptor[] = [];
  for (const [name, meta] of coreRegistry.entries()) {
    if (name === '*') continue;
    const deco = decorations.get(name);
    if (deco) result.push(composeDescriptor(meta, deco));
  }
  return result;
}
