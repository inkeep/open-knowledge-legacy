import { useEffect, useState } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { ConnectingBanner } from '@/components/ConnectingBanner';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { defaultInitialDir } from '@/components/file-tree-utils';
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
 *  and calls openTargetTransition().
 *  Wrapping every hash-driven nav in a transition (a) keeps the previously-revealed
 *  doc visible while the next entry suspends on syncPromise (SPEC G2), and
 *  (b) surfaces `isPending` to NavigationPendingBar (SPEC G3). Agent-driven
 *  nav via SystemDocSubscriber flows through `window.location.hash` too, so
 *  it inherits the same UX without a separate code path (SPEC §F7). Target
 *  resolution (doc / folder-index / folder / missing) lives in
 *  resolveNavigationTarget (PR #175) — the transition wraps the whole
 *  openTarget() call so folder-overview nav is transition-wrapped too. */
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
  // Electron-only Cmd+K palette for project-level commands (open folder,
  // start fresh, switch to a recent project). Gated on `window.okDesktop`
  // so the web/CLI distribution never mounts the handler — zero footprint
  // outside Electron. Mounted at the App root so Cmd+K works regardless of
  // which surface has focus (editor, sidebar, timeline, etc.).
  const desktopBridge = typeof window !== 'undefined' ? (window.okDesktop ?? null) : null;

  return (
    <ProfilerBoundary name="app">
      <DocumentProvider>
        <ConnectingBanner />
        <PageListProvider>
          <SystemDocSubscriber />
          <NavigationHandler />
          <NewItemShortcutHandler />
          {desktopBridge ? <CommandPalette bridge={desktopBridge} /> : null}
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
