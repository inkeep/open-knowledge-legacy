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
import { docNameFromHash } from '@/lib/doc-hash';
import { mark, ProfilerBoundary } from '@/lib/perf';

/** Hash is the source of truth for navigation; all navigation sets the hash;
 *  this handler is the single place that resolves the active navigation target
 *  and calls openTargetTransition(). The transition wrapper keeps a previously-
 *  revealed doc visible while the next entry suspends on syncPromise (fast/warm
 *  path, SPEC G2); on cold paths `openTargetTransition` drops the transition
 *  and lets `<Suspense fallback={<EditorSkeleton />}>` paint immediately. Agent-
 *  driven nav via SystemDocSubscriber flows through `window.location.hash`, so
 *  it inherits the same UX without a separate code path (SPEC §F7). Target
 *  resolution (doc / folder-index / folder / missing) lives in
 *  resolveNavigationTarget (PR #175). */
function NavigationHandler() {
  const { clearTarget } = useDocumentContext();
  const { openTargetTransition } = useDocumentTransition();
  const { folderPaths, loading, pages } = usePageList();

  useEffect(() => {
    onHashChange();

    function onHashChange() {
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

/**
 * Mounts `InstallInClaudeDesktopDialog` at the App root and opens it when
 * `window.location.hash === '#install-claude-desktop'`. This is the minimum
 * viable trigger for Ship 1e — docs and future in-app CTAs link to the hash.
 * The hash clears when the dialog closes so it reopens only if the user
 * navigates back to the URL fragment. SPEC 2026-04-24 FR9-FR13.
 */
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
      // Clear the fragment so closing doesn't instantly re-open on refresh.
      // Uses history.replaceState to avoid adding a history entry.
      const { pathname, search } = window.location;
      window.history.replaceState(null, '', `${pathname}${search}`);
    }
  }

  return <InstallInClaudeDesktopDialog open={open} onOpenChange={handleOpenChange} />;
}

function NewItemShortcutHandler() {
  const { activeDocName, activeTarget } = useDocumentContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const initialDir =
    activeTarget?.kind === 'folder' ? activeTarget.folderPath : defaultInitialDir(activeDocName);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // KeyboardEvent.target is EventTarget|null — widen to the duck-typed
      // ShortcutEventLike shape used by the pure predicate.
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
  // Workspace omnibar: shared across web and Electron for file/folder
  // navigation and command dispatch. Electron additionally surfaces
  // project-level commands when the desktop bridge exists.
  // Mounted at the App root so Cmd/Ctrl+K works regardless of focus.
  const desktopBridge = typeof window !== 'undefined' ? (window.okDesktop ?? null) : null;

  return (
    <ProfilerBoundary name="app">
      <DocumentProvider>
        <ConnectingBanner />
        <PageListProvider>
          <SystemDocSubscriber />
          <NavigationHandler />
          <NewItemShortcutHandler />
          <InstallInClaudeDesktopTrigger />
          <McpConsentDialog />
          <CommandPalette bridge={desktopBridge} />
          <SidebarProvider className="h-screen overflow-hidden">
            <FileSidebar />
            <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
              <EditorPane />
            </SidebarInset>
          </SidebarProvider>
        </PageListProvider>
      </DocumentProvider>
    </ProfilerBoundary>
  );
}
