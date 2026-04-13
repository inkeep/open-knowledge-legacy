import { BacklinksPanel } from '@/components/BacklinksPanel';
import { useDocumentContext } from '@/editor/DocumentContext';
import { SourceEditor } from '@/editor/SourceEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';

interface EditorAreaProps {
  isSourceMode: boolean;
}

export function EditorArea({ isSourceMode }: EditorAreaProps) {
  const { activeDocName, activeProvider } = useDocumentContext();

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
      <aside className="hidden w-80 shrink-0 border-l border-border/60 bg-muted/20 lg:block">
        <BacklinksPanel docName={activeDocName} />
      </aside>
    </div>
  );
}
