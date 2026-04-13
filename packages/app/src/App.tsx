import { useEffect } from 'react';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DocumentProvider, useDocumentContext } from '@/editor/DocumentContext';

export function docNameFromHash(hash = window.location.hash): string | null {
  if (hash.startsWith('#/')) {
    const rest = hash.slice(2);
    const qmark = rest.indexOf('?');
    const encoded = qmark >= 0 ? rest.slice(0, qmark) : rest;
    if (!encoded) return null;
    // Browsers percent-encode spaces and non-ASCII in window.location.hash.
    // Decode per path segment so docName matches the server's raw on-disk name
    // (e.g. 'My Notes/Ideas — 2026/draft').
    try {
      return encoded.split('/').map(decodeURIComponent).join('/');
    } catch {
      // Malformed percent-encoding — fall back to raw string.
      return encoded;
    }
  }
  return null;
}

export function hashFromDocName(docName: string, anchor?: string | null): string {
  const base = `#/${docName}`;
  return anchor ? `${base}?anchor=${encodeURIComponent(anchor)}` : base;
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
