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
    // overflow-anchor: auto preserves scroll position when content is inserted above the
    // viewport (e.g. agent prepends). Browser default, but set explicitly to document
    // intent and guard against future overrides.
    <div className="flex-1 overflow-y-auto subtle-scrollbar" style={{ overflowAnchor: 'auto' }}>
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
  );
}
