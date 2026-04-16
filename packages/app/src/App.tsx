import { useEffect, useState } from 'react';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { isNewItemShortcut, NewItemDialog } from '@/components/NewItemDialog';
import { PageListProvider } from '@/components/PageListContext';
import { SystemDocSubscriber } from '@/components/SystemDocSubscriber';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  DocumentProvider,
  useDocumentContext,
  useDocumentTransition,
} from '@/editor/DocumentContext';
import { docNameFromHash } from '@/lib/doc-hash';

export { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';

/** Hash is the source of truth for navigation; all navigation sets the hash;
 *  this handler is the single place that calls openDocumentTransition().
 *  Wrapping every hash-driven nav in a transition (a) keeps the previously-revealed
 *  doc visible while the next entry suspends on syncPromise (SPEC G2), and
 *  (b) surfaces `isPending` to NavigationPendingBar (SPEC G3). Agent-driven
 *  nav via SystemDocSubscriber flows through `window.location.hash` too, so
 *  it inherits the same UX without a separate code path (SPEC §F7). */
function NavigationHandler() {
  const { openDocumentTransition } = useDocumentTransition();

  useEffect(() => {
    onHashChange();

    function onHashChange() {
      const docName = docNameFromHash(window.location.hash);
      if (docName) openDocumentTransition(docName);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [openDocumentTransition]);

  return null;
}

function NewItemShortcutHandler() {
  const { activeDocName } = useDocumentContext();
  const [dialogOpen, setDialogOpen] = useState(false);

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
      initialDir={defaultInitialDir(activeDocName)}
    />
  );
}

export function App() {
  return (
    <DocumentProvider>
      <PageListProvider>
        <SystemDocSubscriber />
        <NavigationHandler />
        <NewItemShortcutHandler />
        <SidebarProvider className="h-screen overflow-hidden">
          <FileSidebar />
          <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
            <EditorPane />
          </SidebarInset>
        </SidebarProvider>
      </PageListProvider>
    </DocumentProvider>
  );
}
