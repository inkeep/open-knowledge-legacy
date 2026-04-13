import { useState } from 'react';
import { BacklinksPanel } from '@/components/BacklinksPanel';
import { GraphView } from '@/components/GraphView';
import { useDocumentContext } from '@/editor/DocumentContext';
import { SourceEditor } from '@/editor/SourceEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';

interface EditorAreaProps {
  isSourceMode: boolean;
}

type SidebarTab = 'backlinks' | 'graph';

export function EditorArea({ isSourceMode }: EditorAreaProps) {
  const { activeDocName, activeProvider } = useDocumentContext();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('backlinks');

  if (!activeProvider || !activeDocName) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="select-none text-sm text-muted-foreground">Select a document to edit</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className="min-h-0 flex-1 overflow-y-auto subtle-scrollbar"
        style={{ overflowAnchor: 'auto' }}
      >
        {/* CSS-based show/hide — React Activity runs effect cleanup on 'hidden' which destroys
            the CodeMirror/TipTap views. display:none keeps DOM in document without triggering
            React's effect lifecycle, so both editors stay alive across mode switches. */}
        <div className={isSourceMode ? 'h-full' : 'hidden'}>
          <SourceEditor
            key={activeDocName}
            ytext={activeProvider.document.getText('source')}
            provider={activeProvider}
          />
        </div>
        <div className={isSourceMode ? 'hidden' : 'h-full'}>
          <TiptapEditor key={activeDocName} provider={activeProvider} />
        </div>
      </div>
      <aside className="hidden w-80 shrink-0 border-l border-border/60 bg-muted/20 lg:flex lg:flex-col">
        <div className="flex shrink-0 border-b border-border/60">
          <button
            type="button"
            onClick={() => setSidebarTab('backlinks')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              sidebarTab === 'backlinks'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Backlinks
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('graph')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              sidebarTab === 'graph'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Graph
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {sidebarTab === 'backlinks' ? (
            <BacklinksPanel docName={activeDocName} />
          ) : (
            <GraphView activeDocName={activeDocName} />
          )}
        </div>
      </aside>
    </div>
  );
}
