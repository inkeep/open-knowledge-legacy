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

  const merged: Config | null =
    userState && projectState ? mergeLayered(userState.config, projectState.config) : null;

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

function mergeLayered(user: Config, project: Config): Config {
  return mergeDeep(user, project, []) as Config;
}

function mergeDeep(user: unknown, project: unknown, path: (string | number)[]): unknown {
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
