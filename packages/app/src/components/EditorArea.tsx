import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useCallback, useRef } from 'react';
import { SourceEditor } from '@/editor/SourceEditor';
import type { TiptapEditorHandle } from '@/editor/TiptapEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';

interface EditorAreaProps {
  isSourceMode: boolean;
  onProviderReady: (provider: HocuspocusProvider) => void;
}

export function EditorArea({ isSourceMode, onProviderReady }: EditorAreaProps) {
  const editorRef = useRef<TiptapEditorHandle | null>(null);

  const editorCallbackRef = useCallback(
    (handle: TiptapEditorHandle | null) => {
      editorRef.current = handle;
      if (handle) onProviderReady(handle.getProvider());
    },
    [onProviderReady],
  );

  return (
    // overflow-anchor: auto preserves scroll position when content is inserted above the
    // viewport (e.g. agent prepends). Browser default, but set explicitly to document
    // intent and guard against future overrides.
    <div className="flex-1 overflow-y-auto" style={{ overflowAnchor: 'auto' }}>
      {isSourceMode && editorRef.current && (
        <div className="p-6">
          <SourceEditor
            ytext={editorRef.current.getYText()}
            provider={editorRef.current.getProvider()}
          />
        </div>
      )}
      <div className="p-6" style={{ display: isSourceMode ? 'none' : 'block' }}>
        <TiptapEditor ref={editorCallbackRef} />
      </div>
    </div>
  );
}
