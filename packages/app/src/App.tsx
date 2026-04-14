import { useEffect, useState } from 'react';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
<<<<<<< HEAD
import { SystemDocSubscriber } from '@/components/SystemDocSubscriber';
=======
import { defaultInitialDir } from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
>>>>>>> cae5ce7 ([US-006] Add Cmd/Ctrl+Alt+N keyboard shortcut to open new-file dialog)
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DocumentProvider, useDocumentContext } from '@/editor/DocumentContext';
import { docNameFromHash } from '@/lib/doc-hash';

export { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';

/** Hash is the source of truth for navigation; all navigation sets the hash;
 *  this handler is the single place that calls openDocument(). */
function NavigationHandler() {
  const { openDocument } = useDocumentContext();

  useEffect(() => {
    onHashChange();

    function onHashChange() {
      const docName = docNameFromHash(window.location.hash);
      if (docName) openDocument(docName);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [openDocument]);

  return null;
}

function NewItemShortcutHandler() {
  const { activeDocName } = useDocumentContext();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      const modKey = e.metaKey || e.ctrlKey;
      if (modKey && e.altKey && e.key.toLowerCase() === 'n') {
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
      onCreated={() => {}}
    />
  );
}

export function App() {
  return (
    <DocumentProvider>
      <SystemDocSubscriber />
      <NavigationHandler />
      <NewItemShortcutHandler />
      <SidebarProvider className="h-screen overflow-hidden">
        <FileSidebar />
        <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
          <EditorPane />
        </SidebarInset>
      </SidebarProvider>
    </DocumentProvider>
  );
}
