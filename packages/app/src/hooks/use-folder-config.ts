import { useEffect, useState } from 'react';

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
}

export interface TemplateMenuEntry {
  name: string;
  title?: string;
  description?: string;
  path: string;
  source_folder: string;
  scope: 'local' | 'inherited';
}

export interface TemplateDetail {
  name: string;
  folder: string;
  scope: 'local' | 'inherited';
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

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
          const text = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
        }
        return r.json() as Promise<{
          ok: boolean;
          folder?: FolderConfig;
          frontmatter_local?: Record<string, unknown> | null;
          error?: string;
        }>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload.ok || !payload.folder) {
          setState({ status: 'error', message: payload.error ?? 'Unknown error' });
          return;
        }
        setState({
          status: 'ready',
          data: {
            folder: payload.folder,
            frontmatterLocal: payload.frontmatter_local ?? null,
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
): AsyncState<TemplateDetail> {
  const [state, setState] = useState<AsyncState<TemplateDetail>>({ status: 'idle' });

  useEffect(() => {
    if (folder === null || !name) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    const qs = `?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`;
    fetch(`/api/template${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
        }
        return r.json() as Promise<{ ok: boolean; template?: TemplateDetail; error?: string }>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload.ok || !payload.template) {
          setState({ status: 'error', message: payload.error ?? 'Unknown error' });
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
  }, [folder, name]);

  return state;
}
