/**
 * Top-level ConfigProvider.
 *
 * Holds the user-global + workspace `bindConfigDoc` instances for the entire
 * app session. Exposes both bindings + a merged-config view (workspace
 * overrides user, per the per-field `defaultScope` ladder defined in core
 * schema metadata) via React context. Mounted inside DocumentProvider so it
 * can read `collabUrl`; mounted above everything that consumes config so
 * chrome controls + Settings pane can share state.
 *
 * Drives the next-themes bridge in one place: when `mergedConfig.appearance.theme`
 * changes (from the Settings pane, the chrome ThemeToggle, an external file
 * edit picked up by the chokidar watcher, or a CC1 broadcast from another
 * tab), this provider calls `setTheme()` so the page actually flips.
 *
 * Per FR-40 + D55, `appearance.theme` is dual-track: localStorage 'ok-theme-v1'
 * stays as the FOUC cache; config.yml is authoritative once set. Both writes
 * (chrome + Settings) flow through `userBinding.patch()` so the two stay
 * coherent.
 */
import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  bindConfigDoc,
  type Config,
  type ConfigBinding,
  CONFIG_DOC_NAME_USER,
  CONFIG_DOC_NAME_WORKSPACE,
  getLeafFieldMeta,
} from '@inkeep/open-knowledge-core';
import { ConfigSchema } from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';

interface ConfigContextValue {
  userBinding: ConfigBinding | null;
  workspaceBinding: ConfigBinding | null;
  userConfig: Config | null;
  workspaceConfig: Config | null;
  /**
   * Layered view: workspace fields override user fields per leaf. `null`
   * until the first user-binding sync. Consumers that just want "the
   * effective theme" should read `merged.appearance?.theme`.
   */
  merged: Config | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

interface ScopedBinding {
  binding: ConfigBinding;
  config: Config;
  cleanup: () => void;
}

function makeBinding(
  collabUrl: string,
  docName: string,
  scope: 'user' | 'workspace',
): ScopedBinding {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({ url: collabUrl, name: docName, document: ydoc });
  const binding = bindConfigDoc(provider, scope);
  const cleanup = () => {
    binding.dispose();
    provider.destroy();
    ydoc.destroy();
  };
  return { binding, config: binding.current(), cleanup };
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { collabUrl } = useDocumentContext();
  const [userState, setUserState] = useState<{ binding: ConfigBinding; config: Config } | null>(
    null,
  );
  const [workspaceState, setWorkspaceState] = useState<{
    binding: ConfigBinding;
    config: Config;
  } | null>(null);

  useEffect(() => {
    if (collabUrl === null) return;
    const userScoped = makeBinding(collabUrl, CONFIG_DOC_NAME_USER, 'user');
    const workspaceScoped = makeBinding(collabUrl, CONFIG_DOC_NAME_WORKSPACE, 'workspace');
    setUserState({ binding: userScoped.binding, config: userScoped.config });
    setWorkspaceState({ binding: workspaceScoped.binding, config: workspaceScoped.config });
    const unsubUser = userScoped.binding.subscribe((next) => {
      setUserState((prev) => (prev?.binding === userScoped.binding ? { ...prev, config: next } : prev));
    });
    const unsubWorkspace = workspaceScoped.binding.subscribe((next) => {
      setWorkspaceState((prev) =>
        prev?.binding === workspaceScoped.binding ? { ...prev, config: next } : prev,
      );
    });
    return () => {
      unsubUser();
      unsubWorkspace();
      userScoped.cleanup();
      workspaceScoped.cleanup();
      setUserState((prev) => (prev?.binding === userScoped.binding ? null : prev));
      setWorkspaceState((prev) =>
        prev?.binding === workspaceScoped.binding ? null : prev,
      );
    };
  }, [collabUrl]);

  const merged = useMemo<Config | null>(() => {
    if (!userState || !workspaceState) return null;
    return mergeLayered(userState.config, workspaceState.config);
  }, [userState, workspaceState]);

  // Bridge merged.appearance.theme → next-themes (FR-40 / D55 dual-track).
  // Fires app-wide because this provider is mounted at the App root, above
  // DocumentPane / chrome / SettingsPane. setTheme writes through to
  // localStorage so the FOUC script reads the latest value on next reload.
  const { setTheme } = useTheme();
  const themeValue = merged?.appearance?.theme;
  useEffect(() => {
    if (themeValue === 'light' || themeValue === 'dark' || themeValue === 'system') {
      setTheme(themeValue);
    }
  }, [themeValue, setTheme]);

  const value = useMemo<ConfigContextValue>(
    () => ({
      userBinding: userState?.binding ?? null,
      workspaceBinding: workspaceState?.binding ?? null,
      userConfig: userState?.config ?? null,
      workspaceConfig: workspaceState?.config ?? null,
      merged,
    }),
    [userState, workspaceState, merged],
  );

  return <ConfigContext value={value}>{children}</ConfigContext>;
}

export function useConfigContext(): ConfigContextValue {
  const ctx = use(ConfigContext);
  if (ctx === null) {
    throw new Error('useConfigContext must be used within <ConfigProvider />');
  }
  return ctx;
}

/**
 * Merge the layered configs per the loader's precedence: workspace
 * overrides user — EXCEPT for leaves marked `scope: 'user'` in the
 * field registry. User-scope fields are personal preferences (theme,
 * editor mode default); a stale workspace value should not override
 * the user's choice and lock collaborators into one mode. Workspace
 * values for user-scope fields are ignored at merge time, even if
 * they exist on disk (e.g., from a buggy prior write).
 *
 * Recursive on nested mappings; arrays replace wholesale (matches
 * `applyPatchToDocument` semantics + RFC 7396 §1).
 */
function mergeLayered(user: Config, workspace: Config): Config {
  return mergeDeep(user, workspace, []) as Config;
}

function mergeDeep(base: unknown, override: unknown, path: (string | number)[]): unknown {
  if (override === undefined) return base;
  // At a leaf path, ask the field registry whether the field is user-scope.
  // If so, drop the workspace value entirely.
  if (path.length > 0) {
    const meta = getLeafFieldMeta(ConfigSchema, path);
    if (meta?.scope === 'user') return base;
  }
  if (override === null) return null;
  if (Array.isArray(override)) return override;
  if (typeof override !== 'object') return override;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return override;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    out[key] = mergeDeep((base as Record<string, unknown>)[key], value, [...path, key]);
  }
  return out;
}
