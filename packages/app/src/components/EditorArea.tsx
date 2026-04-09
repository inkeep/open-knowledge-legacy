import type { HocuspocusProvider } from '@hocuspocus/provider';
import { Activity, useRef } from 'react';
import { SourceEditor } from '@/editor/SourceEditor';
import type { TiptapEditorHandle } from '@/editor/TiptapEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';

interface EditorAreaProps {
  isSourceMode: boolean;
  onProviderReady: (provider: HocuspocusProvider) => void;
}

export function EditorArea({ isSourceMode, onProviderReady }: EditorAreaProps) {
  const editorRef = useRef<TiptapEditorHandle | null>(null);

  function editorCallbackRef(handle: TiptapEditorHandle | null) {
    editorRef.current = handle;
    if (handle) onProviderReady(handle.getProvider());
  }

  return (
    // overflow-anchor: auto preserves scroll position when content is inserted above the
    // viewport (e.g. agent prepends). Browser default, but set explicitly to document
    // intent and guard against future overrides.
    <div className="flex-1 overflow-y-auto" style={{ overflowAnchor: 'auto' }}>
      {editorRef.current && (
        <Activity mode={isSourceMode ? 'visible' : 'hidden'}>
          <SourceEditor
            ytext={editorRef.current.getYText()}
            provider={editorRef.current.getProvider()}
          />
        </Activity>
      )}
      <Activity mode={isSourceMode ? 'hidden' : 'visible'}>
        <TiptapEditor ref={editorCallbackRef} />
      </Activity>
    </div>
  );
}
