/**
 * PropertyPanel — top-of-document frontmatter table for WYSIWYG mode.
 *
 * Renders a sibling to the TipTap editor inside `DocumentBoundary` (NOT a
 * ProseMirror node). Reads `Y.Map('metadata')` per-key entries via the
 * `getFrontmatterMap` helper and re-renders on `observeDeep`.
 *
 * US-007 scope: panel shell + collapse + read-only row rendering.
 * Type widgets (US-008), add/remove/reorder/rename (US-009), and form-driven
 * writes (US-010) layer on top of this.
 */

import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type FrontmatterMap,
  type FrontmatterValue,
  getFrontmatterMap,
} from '@inkeep/open-knowledge-core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PropertyPanelProps {
  provider: HocuspocusProvider;
}

export function PropertyPanel({ provider }: PropertyPanelProps) {
  const map = useFrontmatterMap(provider);
  const [collapsed, setCollapsed] = useState(false);
  const keys = Object.keys(map);
  if (keys.length === 0) return null;

  return (
    <div className="property-panel border-b bg-muted/20 text-sm" data-testid="property-panel">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="property-panel-rows"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )}
        <span>{`Properties (${keys.length})`}</span>
      </button>
      {!collapsed && (
        <div id="property-panel-rows" className="px-4 pb-2">
          {keys.map((key) => (
            <PropertyRow key={key} keyName={key} value={map[key]} />
          ))}
        </div>
      )}
    </div>
  );
}

interface PropertyRowProps {
  keyName: string;
  value: FrontmatterValue | undefined;
}

function PropertyRow({ keyName, value }: PropertyRowProps) {
  return (
    <div className="flex items-center gap-3 py-1" data-testid="property-row" data-key={keyName}>
      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{keyName}</span>
      <span className="flex-1 truncate">{formatValue(value)}</span>
    </div>
  );
}

function formatValue(value: FrontmatterValue | undefined): string {
  if (value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * Subscribe to `Y.Map('metadata')` deep changes. Returns the structured per-key
 * map; re-runs on every metaMap mutation (per-key set/delete + nested Y.Text /
 * Y.Array<Y.Text> mutations once US-010 wires those in).
 */
function useFrontmatterMap(provider: HocuspocusProvider): FrontmatterMap {
  const [map, setMap] = useState<FrontmatterMap>(() => getFrontmatterMap(provider.document));
  useEffect(() => {
    const metaMap = provider.document.getMap('metadata');
    const update = () => setMap(getFrontmatterMap(provider.document));
    update();
    metaMap.observeDeep(update);
    return () => metaMap.unobserveDeep(update);
  }, [provider]);
  return map;
}

/**
 * True when the active doc carries any frontmatter — either per-key entries or
 * a populated legacy `'frontmatter'` slot. Used to gate the toolbar trigger:
 * present only when neither surface has FM yet.
 */
export function useHasFrontmatter(provider: HocuspocusProvider | null): boolean {
  const [has, setHas] = useState<boolean>(() => (provider ? hasAnyFrontmatter(provider) : false));
  useEffect(() => {
    if (!provider) {
      setHas(false);
      return;
    }
    const metaMap = provider.document.getMap('metadata');
    const update = () => setHas(hasAnyFrontmatter(provider));
    update();
    metaMap.observeDeep(update);
    return () => metaMap.unobserveDeep(update);
  }, [provider]);
  return has;
}

function hasAnyFrontmatter(provider: HocuspocusProvider): boolean {
  const map = getFrontmatterMap(provider.document);
  if (Object.keys(map).length > 0) return true;
  const legacy = provider.document.getMap('metadata').get('frontmatter');
  return typeof legacy === 'string' && legacy.length > 0;
}
