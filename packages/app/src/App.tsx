import { useEffect } from 'react';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DocumentProvider, useDocumentContext } from '@/editor/DocumentContext';

function docNameFromHash(): string | null {
  const hash = window.location.hash;
  if (hash.startsWith('#/')) {
    const rest = hash.slice(2);
    const qmark = rest.indexOf('?');
    const docName = qmark >= 0 ? rest.slice(0, qmark) : rest;
    return docName || null;
  }
  return null;
}

/** Syncs window.location.hash ↔ DocumentContext.openDocument, unidirectionally:
 *  hash is the source of truth; all navigation sets the hash; this handler
 *  is the single place that calls openDocument(). */
function NavigationHandler() {
  const { openDocument } = useDocumentContext();

  useEffect(() => {
    onHashChange();

    function onHashChange() {
      const docName = docNameFromHash();
      if (docName) openDocument(docName);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [openDocument]);

  return null;
}

export function App() {
  return (
    <DocumentProvider>
      <NavigationHandler />
      <SidebarProvider className="h-screen overflow-hidden">
        <FileSidebar />
        <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
          <EditorPane />
        </SidebarInset>
      </SidebarProvider>
    </DocumentProvider>
  );
}
