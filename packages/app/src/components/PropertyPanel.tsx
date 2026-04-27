/**
 * PropertyPanel — top-of-document frontmatter table for WYSIWYG mode.
 *
 * Renders a sibling to the TipTap editor inside `DocumentBoundary` (NOT a
 * ProseMirror node). Reads `Y.Map('metadata')` per-key entries via the
 * `getFrontmatterMap` helper and re-renders on `observeDeep`.
 *
 * US-008 scope: per-row type widgets + type picker dropdown. Commits route
 * through HTTP POST to `/api/frontmatter-patch` (same path EditorHeader's
 * toolbar trigger uses) — US-010 layers error surfacing on top.
 */

import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type FrontmatterMap,
  type FrontmatterType,
  type FrontmatterValue,
  getFrontmatterMap,
  inferType,
} from '@inkeep/open-knowledge-core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  BooleanWidget,
  coerceValue,
  DateWidget,
  ListWidget,
  NumberWidget,
  resolveWidgetType,
  TextWidget,
  TypeIconButton,
} from '@/components/PropertyWidgets';

interface PropertyPanelProps {
  provider: HocuspocusProvider;
}

export function PropertyPanel({ provider }: PropertyPanelProps) {
  const map = useFrontmatterMap(provider);
  const [collapsed, setCollapsed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, FrontmatterType>>({});
  const docName = provider.configuration.name ?? '';

  async function commitProperty(key: string, value: FrontmatterValue) {
    try {
      const res = await fetch('/api/frontmatter-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName, patch: { [key]: value } }),
      });
      if (!res.ok) {
        console.warn('[PropertyPanel] frontmatter-patch failed', { key, status: res.status });
      }
    } catch (err) {
      console.warn('[PropertyPanel] frontmatter-patch network error', { key, err });
    }
  }

  function setType(key: string, nextType: FrontmatterType) {
    const current = map[key];
    if (current === undefined) return;
    setOverrides((prev) => ({ ...prev, [key]: nextType }));
    const coerced = coerceValue(current, nextType);
    if (!sameValue(current, coerced)) {
      void commitProperty(key, coerced);
    }
  }

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
          {keys.map((key) => {
            const value = map[key];
            if (value === undefined) return null;
            const declared = overrides[key] ?? inferType(value);
            return (
              <PropertyRow
                key={key}
                keyName={key}
                value={value}
                declared={declared}
                onCommit={(v) => commitProperty(key, v)}
                onChangeType={(t) => setType(key, t)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PropertyRowProps {
  keyName: string;
  value: FrontmatterValue;
  declared: FrontmatterType;
  onCommit: (next: FrontmatterValue) => void;
  onChangeType: (next: FrontmatterType) => void;
}

function PropertyRow({ keyName, value, declared, onCommit, onChangeType }: PropertyRowProps) {
  const widgetType = resolveWidgetType(value, declared);
  return (
    <div
      className="flex items-center gap-2 py-0.5"
      data-testid="property-row"
      data-key={keyName}
      data-widget-type={widgetType}
    >
      <TypeIconButton keyName={keyName} type={widgetType} onChangeType={onChangeType} />
      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{keyName}</span>
      <div className="flex-1">
        <Widget keyName={keyName} value={value} widgetType={widgetType} onCommit={onCommit} />
      </div>
    </div>
  );
}

interface WidgetProps {
  keyName: string;
  value: FrontmatterValue;
  widgetType: FrontmatterType;
  onCommit: (next: FrontmatterValue) => void;
}

function Widget({ keyName, value, widgetType, onCommit }: WidgetProps) {
  if (widgetType === 'list') {
    const arr = Array.isArray(value) ? value : [];
    return <ListWidget keyName={keyName} value={arr} onCommit={onCommit} />;
  }
  if (widgetType === 'boolean') {
    const bool = typeof value === 'boolean' ? value : false;
    return <BooleanWidget keyName={keyName} value={bool} onCommit={onCommit} />;
  }
  if (widgetType === 'number') {
    const num = typeof value === 'number' ? value : 0;
    return <NumberWidget keyName={keyName} value={num} onCommit={onCommit} />;
  }
  if (widgetType === 'date') {
    const str = typeof value === 'string' ? value : '';
    return <DateWidget keyName={keyName} value={str} onCommit={onCommit} />;
  }
  const str =
    typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : String(value);
  return <TextWidget keyName={keyName} value={str} onCommit={onCommit} />;
}

function sameValue(a: FrontmatterValue, b: FrontmatterValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item === b[i]);
  }
  return a === b;
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
