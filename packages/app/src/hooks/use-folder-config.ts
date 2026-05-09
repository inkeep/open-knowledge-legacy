import { useEffect, useState } from 'react';
import { parseApiError } from '@/lib/parse-api-error';

/**
 * Folder cascade + templates data subscriptions.
 *
 * Imperative writes live in `@/lib/folder-config-api` — these hooks are
 * read-only, refresh-aware data sources. Call `refresh()` after a successful
 * write so the UI re-fetches.
 */

interface FolderConfig {
  path: string;
  type: 'directory';
  title?: string;
  description?: string;
  tags?: string[];
  frontmatter_defaults?: {
    title?: string;
    description?: string;
    tags?: string[];
  } & Record<string, unknown>;
  templates_available?: TemplateMenuEntry[];
  directMdCount: number;
  recursiveMdCount: number;
  childDirCount: number;
  truncated: boolean;
  mostRecentMd?: { path: string; title?: string; updatedAt: string };
}

export interface FolderConfigSnapshot {
  folder: FolderConfig;
  frontmatterLocal: Record<string, unknown> | null;
  frontmatterSources: Record<string, string>;
}

export interface TemplateMenuEntry {
  name: string;
  title?: string;
  description?: string;
  path: string;
  source_folder: string;
  scope: 'local' | 'inherited' | 'user';
}

export interface TemplateDetail {
  name: string;
  folder: string;
  scope: 'local' | 'inherited' | 'user';
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export type TemplateTarget = 'project' | 'user';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

interface FolderConfigHandle {
  state: AsyncState<FolderConfigSnapshot>;
  refresh: () => void;
}

export function useFolderConfig(folderPath: string | null): FolderConfigHandle {
  const [state, setState] = useState<AsyncState<FolderConfigSnapshot>>({ status: 'idle' });
  const [refreshKey, setRefreshKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch trigger is the only purpose of refreshKey
  useEffect(() => {
    if (folderPath === null) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    const qs = folderPath ? `?path=${encodeURIComponent(folderPath)}` : '';
    fetch(`/api/folder-config${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as unknown;
          throw new Error(parseApiError(body) ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{
          folder: FolderConfig;
          frontmatter_local?: Record<string, unknown> | null;
          frontmatter_sources?: Record<string, string>;
        }>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload || typeof payload !== 'object' || !payload.folder) {
          setState({ status: 'error', message: 'Server returned an incomplete folder response.' });
          return;
        }
        setState({
          status: 'ready',
          data: {
            folder: payload.folder,
            frontmatterLocal: payload.frontmatter_local ?? null,
            frontmatterSources: payload.frontmatter_sources ?? {},
          },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [folderPath, refreshKey]);

  return {
    state,
    refresh: () => setRefreshKey((k) => k + 1),
  };
}

export function useTemplate(
  folder: string | null,
  name: string | null,
  target?: TemplateTarget,
): AsyncState<TemplateDetail> {
  const [state, setState] = useState<AsyncState<TemplateDetail>>({ status: 'idle' });

  useEffect(() => {
    if (!name) {
      setState({ status: 'idle' });
      return;
    }
    if (target !== 'user' && folder === null) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    const folderParam = target === 'user' ? '' : (folder ?? '');
    let qs = `?folder=${encodeURIComponent(folderParam)}&name=${encodeURIComponent(name)}`;
    if (target !== undefined) qs += `&target=${encodeURIComponent(target)}`;
    fetch(`/api/template${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as unknown;
          throw new Error(parseApiError(body) ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ template: TemplateDetail }>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload || typeof payload !== 'object' || !payload.template) {
          setState({
            status: 'error',
            message: 'Server returned an incomplete template response.',
          });
          return;
        }
        setState({ status: 'ready', data: payload.template });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [folder, name, target]);

  return state;
}
