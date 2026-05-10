import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  bindConfigDoc,
  bindOkignoreDoc,
  CONFIG_DOC_NAME_OKIGNORE,
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_PROJECT_LOCAL,
  CONFIG_DOC_NAME_USER,
  type Config,
  type ConfigBinding,
  mergeLayered,
  type OkignoreBinding,
  type WriteScope,
} from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';
import { useThemeBridge } from '@/hooks/use-theme-bridge';

interface ConfigContextValue {
  userBinding: ConfigBinding | null;
  projectBinding: ConfigBinding | null;
  projectLocalBinding: ConfigBinding | null;
  okignoreBinding: OkignoreBinding | null;
  okignoreSynced: boolean;
  userConfig: Config | null;
  projectConfig: Config | null;
  projectLocalConfig: Config | null;
  projectLocalSynced: boolean;
  merged: Config | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

interface ScopedBinding {
  binding: ConfigBinding;
  config: Config;
  cleanup: () => void;
}

function makeBinding(collabUrl: string, docName: string, scope: WriteScope): ScopedBinding {
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

interface OkignoreScoped {
  binding: OkignoreBinding;
  provider: HocuspocusProvider;
  cleanup: () => void;
}

function makeOkignoreBinding(collabUrl: string): OkignoreScoped {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: collabUrl,
    name: CONFIG_DOC_NAME_OKIGNORE,
    document: ydoc,
  });
  const binding = bindOkignoreDoc(provider);
  const cleanup = () => {
    binding.dispose();
    provider.destroy();
    ydoc.destroy();
  };
  return { binding, provider, cleanup };
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
  const [projectLocalState, setProjectLocalState] = useState<{
    binding: ConfigBinding;
    config: Config;
    synced: boolean;
  } | null>(null);
  const [okignoreState, setOkignoreState] = useState<{
    binding: OkignoreBinding;
    synced: boolean;
  } | null>(null);

  useEffect(() => {
    if (collabUrl === null) return;
    const userScoped = makeBinding(collabUrl, CONFIG_DOC_NAME_USER, 'user');
    const projectScoped = makeBinding(collabUrl, CONFIG_DOC_NAME_PROJECT, 'project');
    const projectLocalScoped = makeBinding(
      collabUrl,
      CONFIG_DOC_NAME_PROJECT_LOCAL,
      'project-local',
    );
    const okignoreScoped = makeOkignoreBinding(collabUrl);
    setUserState({ binding: userScoped.binding, config: userScoped.config });
    setProjectState({ binding: projectScoped.binding, config: projectScoped.config });
    setProjectLocalState({
      binding: projectLocalScoped.binding,
      config: projectLocalScoped.config,
      synced: projectLocalScoped.binding.hasSynced(),
    });
    setOkignoreState({ binding: okignoreScoped.binding, synced: false });

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
    const unsubProjectLocal = projectLocalScoped.binding.subscribe((next) => {
      setProjectLocalState((prev) =>
        prev?.binding === projectLocalScoped.binding ? { ...prev, config: next } : prev,
      );
    });
    const unsubProjectLocalSynced = projectLocalScoped.binding.subscribeSynced(() => {
      setProjectLocalState((prev) =>
        prev?.binding === projectLocalScoped.binding ? { ...prev, synced: true } : prev,
      );
    });
    const handleOkignoreSynced = () => {
      setOkignoreState((prev) =>
        prev?.binding === okignoreScoped.binding ? { ...prev, synced: true } : prev,
      );
    };
    okignoreScoped.provider.on('synced', handleOkignoreSynced);

    return () => {
      unsubUser();
      unsubProject();
      unsubProjectLocal();
      unsubProjectLocalSynced();
      okignoreScoped.provider.off('synced', handleOkignoreSynced);
      userScoped.cleanup();
      projectScoped.cleanup();
      projectLocalScoped.cleanup();
      okignoreScoped.cleanup();
      setUserState((prev) => (prev?.binding === userScoped.binding ? null : prev));
      setProjectState((prev) => (prev?.binding === projectScoped.binding ? null : prev));
      setProjectLocalState((prev) => (prev?.binding === projectLocalScoped.binding ? null : prev));
      setOkignoreState((prev) => (prev?.binding === okignoreScoped.binding ? null : prev));
    };
  }, [collabUrl]);

  const merged: Config | null =
    userState && projectState
      ? mergeLayered(userState.config, projectState.config, projectLocalState?.config)
      : null;

  const { setTheme } = useTheme();
  const themeValue = merged?.appearance?.theme;
  useEffect(() => {
    if (themeValue === 'light' || themeValue === 'dark' || themeValue === 'system') {
      setTheme(themeValue);
    }
  }, [themeValue, setTheme]);

  useThemeBridge(
    typeof window !== 'undefined' ? window.okDesktop : undefined,
    themeValue ?? 'system',
  );

  const value: ConfigContextValue = {
    userBinding: userState?.binding ?? null,
    projectBinding: projectState?.binding ?? null,
    projectLocalBinding: projectLocalState?.binding ?? null,
    okignoreBinding: okignoreState?.binding ?? null,
    okignoreSynced: okignoreState?.synced ?? false,
    userConfig: userState?.config ?? null,
    projectConfig: projectState?.config ?? null,
    projectLocalConfig: projectLocalState?.config ?? null,
    projectLocalSynced: projectLocalState?.synced ?? false,
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
