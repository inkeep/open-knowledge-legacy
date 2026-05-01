/**
 * Top-level ConfigProvider.
 *
 * Holds the user-global + project `bindConfigDoc` instances for the entire
 * app session. Exposes both bindings + a merged-config view (project
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
 * `appearance.theme` is dual-track: localStorage 'ok-theme-v1' stays as
 * the FOUC cache; config.yml is authoritative once set. Both writes
 * (chrome + Settings) flow through `userBinding.patch()` so the two
 * stay coherent.
 */
import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  bindConfigDoc,
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_USER,
  type Config,
  type ConfigBinding,
  ConfigSchema,
  getLeafFieldMeta,
} from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';

interface ConfigContextValue {
  userBinding: ConfigBinding | null;
  projectBinding: ConfigBinding | null;
  userConfig: Config | null;
  projectConfig: Config | null;
  /**
   * Layered view: project fields override user fields per leaf. `null`
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

function makeBinding(collabUrl: string, docName: string, scope: 'user' | 'project'): ScopedBinding {
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
  const [projectState, setProjectState] = useState<{
    binding: ConfigBinding;
    config: Config;
  } | null>(null);

  useEffect(() => {
    if (collabUrl === null) return;
    const userScoped = makeBinding(collabUrl, CONFIG_DOC_NAME_USER, 'user');
    const projectScoped = makeBinding(collabUrl, CONFIG_DOC_NAME_PROJECT, 'project');
    setUserState({ binding: userScoped.binding, config: userScoped.config });
    setProjectState({ binding: projectScoped.binding, config: projectScoped.config });
    const unsubUser = userScoped.binding.subscribe((next) => {
      setUserState((prev) =>
        prev?.binding === userScoped.binding ? { ...prev, config: next } : prev,
      );
    });
    const unsubProject = projectScoped.binding.subscribe((next) => {
      setProjectState((prev) =>
        prev?.binding === projectScoped.binding ? { ...prev, config: next } : prev,
      );
    });
    return () => {
      unsubUser();
      unsubProject();
      userScoped.cleanup();
      projectScoped.cleanup();
      setUserState((prev) => (prev?.binding === userScoped.binding ? null : prev));
      setProjectState((prev) => (prev?.binding === projectScoped.binding ? null : prev));
    };
  }, [collabUrl]);

  // React Compiler memoizes — no manual `useMemo` per project convention.
  const merged: Config | null =
    userState && projectState ? mergeLayered(userState.config, projectState.config) : null;

  // Bridge `appearance.theme` from the merged config into next-themes app-
  // wide. setTheme writes through to localStorage so the FOUC script reads
  // the latest value on next reload.
  const { setTheme } = useTheme();
  const themeValue = merged?.appearance?.theme;
  useEffect(() => {
    if (themeValue === 'light' || themeValue === 'dark' || themeValue === 'system') {
      setTheme(themeValue);
    }
  }, [themeValue, setTheme]);

  const value: ConfigContextValue = {
    userBinding: userState?.binding ?? null,
    projectBinding: projectState?.binding ?? null,
    userConfig: userState?.config ?? null,
    projectConfig: projectState?.config ?? null,
    merged,
  };

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
 * Merge the layered configs per the loader's precedence: project
 * overrides user — EXCEPT for leaves marked `scope: 'user'` in the
 * field registry. User-scope fields are personal preferences (theme,
 * editor mode default); a stale project value should not override
 * the user's choice and lock collaborators into one mode. Workspace
 * values for user-scope fields are ignored at merge time, even if
 * they exist on disk (e.g., from a buggy prior write).
 *
 * Recursive on nested mappings; arrays replace wholesale (matches
 * `applyPatchToDocument` semantics + RFC 7396 §1).
 */
function mergeLayered(user: Config, project: Config): Config {
  return mergeDeep(user, project, []) as Config;
}

function mergeDeep(user: unknown, project: unknown, path: (string | number)[]): unknown {
  // Scope-aware leaf precedence. Each side's stale value is ignored when the
  // field's registered scope rules it out, so a user-global YAML carrying a
  // project-only field (e.g., `preview.baseUrl` left over from a prior
  // project) doesn't leak into the merged view, and a project YAML
  // carrying a user-only field (e.g., `appearance.theme` written under
  // earlier 'either' semantics) doesn't override the user's choice.
  if (path.length > 0) {
    const meta = getLeafFieldMeta(ConfigSchema, path);
    if (meta?.scope === 'user') return user;
    if (meta?.scope === 'project') return project ?? user;
  }
  if (project === undefined) return user;
  if (project === null) return null;
  if (Array.isArray(project)) return project;
  if (typeof project !== 'object') return project;
  if (typeof user !== 'object' || user === null || Array.isArray(user)) return project;
  const out: Record<string, unknown> = { ...(user as Record<string, unknown>) };
  for (const [key, value] of Object.entries(project as Record<string, unknown>)) {
    out[key] = mergeDeep((user as Record<string, unknown>)[key], value, [...path, key]);
  }
  return out;
}
