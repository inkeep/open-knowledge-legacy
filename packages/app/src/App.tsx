import { useEffect, useState } from 'react';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import { GraphView } from '@/components/GraphView';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { DocumentProvider, useDocumentContext } from '@/editor/DocumentContext';

// Doc hashes:    #/docName  (always starts with #/)
// System hashes: #?view=X   (no slash — structurally separate namespace)
const GRAPH_HASH = '#?view=graph';

export function docNameFromHash(): string | null {
  const hash = window.location.hash;
  if (hash.startsWith('#/')) {
    const rest = hash.slice(2);
    const qmark = rest.indexOf('?');
    const docName = qmark >= 0 ? rest.slice(0, qmark) : rest;
    return docName || null;
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

function GraphContent() {
  const { activeDocName } = useDocumentContext();
  const [stats, setStats] = useState<{ nodes: number; links: number; loading: boolean }>({
    nodes: 0,
    links: 0,
    loading: true,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
        <Separator orientation="vertical" className="mr-1 h-4 shrink-0 data-vertical:self-center" />
        <span className="text-sm text-muted-foreground">Graph</span>
        {!stats.loading && (
          <span className="text-xs text-muted-foreground/50">
            — {stats.nodes} {stats.nodes === 1 ? 'page' : 'pages'}, {stats.links}{' '}
            {stats.links === 1 ? 'link' : 'links'}
          </span>
        )}
      </header>
      <GraphView
        activeDocName={activeDocName ?? ''}
        className="min-h-0 flex-1"
        onStatsChange={(nodes, links, loading) => setStats({ nodes, links, loading })}
      />
    </div>
  );
}

export function App() {
  const [isGraphView, setIsGraphView] = useState(() => window.location.hash === GRAPH_HASH);

  useEffect(() => {
    function onHashChange() {
      setIsGraphView(window.location.hash === GRAPH_HASH);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <DocumentProvider>
      <NavigationHandler />
      <SidebarProvider className="h-screen overflow-hidden">
        <FileSidebar />
        <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
          {isGraphView ? <GraphContent /> : <EditorPane />}
        </SidebarInset>
      </SidebarProvider>
    </DocumentProvider>
  );
}
