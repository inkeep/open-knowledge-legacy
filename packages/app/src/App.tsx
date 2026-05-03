import { useEffect, useState } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { ConnectingBanner } from '@/components/ConnectingBanner';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { McpConsentDialog } from '@/components/McpConsentDialog';
import { isNewItemShortcut, NewItemDialog } from '@/components/NewItemDialog';
import { resolveNavigationTarget } from '@/components/navigation-targets';
import { PageListProvider, usePageList } from '@/components/PageListContext';
import { SystemDocSubscriber } from '@/components/SystemDocSubscriber';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  DocumentProvider,
  useDocumentContext,
  useDocumentTransition,
} from '@/editor/DocumentContext';
import { ConfigProvider } from '@/lib/config-provider';
import { assetPathFromHash, docNameFromHash } from '@/lib/doc-hash';
import { mark, ProfilerBoundary } from '@/lib/perf';
import { isSettingsShortcut, SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';

function NavigationHandler() {
  const { clearTarget } = useDocumentContext();
  const { openTargetTransition } = useDocumentTransition();
  const { folderPaths, loading, pages } = usePageList();

  useEffect(() => {
    onHashChange();

    function onHashChange() {
      const assetPath = assetPathFromHash(window.location.hash);
      if (assetPath) {
        const lower = assetPath.toLowerCase();
        const mediaKind = lower.endsWith('.mp4') ? 'video' : 'image';
        mark('ok/nav/hash-change', { docName: null, kind: 'asset' });
        openTargetTransition({
          kind: 'asset',
          target: assetPath,
          assetPath,
          mediaKind,
        });
        return;
      }
      const docName = docNameFromHash(window.location.hash);
      if (!docName) {
        mark('ok/nav/hash-change', { docName: null, kind: 'clear' });
        clearTarget();
        return;
      }
      if (loading) {
        mark('ok/nav/hash-change', { docName, kind: 'deferred-loading' });
        return;
      }
      const target = resolveNavigationTarget(docName, {
        pages,
        folderPaths,
      });
      mark('ok/nav/hash-change', { docName, kind: target.kind });
      openTargetTransition(target);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [clearTarget, folderPaths, loading, openTargetTransition, pages]);

  return null;
}

const INSTALL_DIALOG_HASH = '#install-claude-desktop';
function InstallInClaudeDesktopTrigger() {
  const [open, setOpen] = useState(
    typeof window !== 'undefined' && window.location.hash === INSTALL_DIALOG_HASH,
  );

  useEffect(() => {
    function onHashChange() {
      if (window.location.hash === INSTALL_DIALOG_HASH) setOpen(true);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && window.location.hash === INSTALL_DIALOG_HASH) {
      const { pathname, search } = window.location;
      window.history.replaceState(null, '', `${pathname}${search}`);
    }
  }

  return <InstallInClaudeDesktopDialog open={open} onOpenChange={handleOpenChange} />;
}

function SettingsShortcutHandler() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (
        isSettingsShortcut({
          target,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          key: e.key,
        })
      ) {
        e.preventDefault();
        if (window.location.hash !== SETTINGS_OPEN_HASH) {
          window.location.hash = SETTINGS_OPEN_HASH;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

function NewItemShortcutHandler() {
  const { activeDocName, activeTarget } = useDocumentContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const initialDir =
    activeTarget?.kind === 'folder' ? activeTarget.folderPath : defaultInitialDir(activeDocName);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (
        isNewItemShortcut({
          target,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          key: e.key,
        })
      ) {
        e.preventDefault();
        setDialogOpen(true);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <NewItemDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      kind="file"
      initialDir={initialDir}
    />
  );
}

export function App() {
  const desktopBridge = typeof window !== 'undefined' ? (window.okDesktop ?? null) : null;

  return (
    <ProfilerBoundary name="app">
      <DocumentProvider>
        <ConfigProvider>
          <ConnectingBanner />
          <PageListProvider>
            <SystemDocSubscriber />
            <NavigationHandler />
            <NewItemShortcutHandler />
            <SettingsShortcutHandler />
            <InstallInClaudeDesktopTrigger />
            {/* M6b first-launch consent dialog — host-agnostic per D-M6-R10.
                Self-gates on the shared `mcpConsentStore` snapshot; renders
                nothing until main fires `ok:mcp-wiring:show`. Mounted
                identically in NavigatorApp. */}
            <McpConsentDialog />
            {desktopBridge ? <CommandPalette bridge={desktopBridge} /> : null}
            <SidebarProvider className="h-screen overflow-hidden">
              <FileSidebar />
              <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
                <EditorPane />
              </SidebarInset>
            </SidebarProvider>
          </PageListProvider>
        </ConfigProvider>
      </DocumentProvider>
    </ProfilerBoundary>
  );
}
