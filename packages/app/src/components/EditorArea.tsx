import { Activity } from 'react';
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
        <span className="select-none text-sm text-muted-foreground">No document open</span>
      </div>
    );
  }

  return (
    // overflow-anchor: auto preserves scroll position when content is inserted above the
    // viewport (e.g. agent prepends). Browser default, but set explicitly to document
    // intent and guard against future overrides.
    <div className="flex-1 overflow-y-auto subtle-scrollbar" style={{ overflowAnchor: 'auto' }}>
      <Activity mode={isSourceMode ? 'visible' : 'hidden'}>
        <SourceEditor
          key={activeDocName}
          ytext={activeProvider.document.getText('source')}
          provider={activeProvider}
        />
      </Activity>
      <Activity mode={isSourceMode ? 'hidden' : 'visible'}>
        <TiptapEditor key={activeDocName} provider={activeProvider} />
      </Activity>
    </div>
  );
}
