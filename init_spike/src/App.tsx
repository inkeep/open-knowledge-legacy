import { useRef, useState } from 'react';
import { SourceEditor } from './editor/SourceEditor';
import type { TiptapEditorHandle } from './editor/TiptapEditor';
import { TiptapEditor } from './editor/TiptapEditor';

export function App() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const editorRef = useRef<TiptapEditorHandle | null>(null);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <h1 style={{ margin: 0 }}>Open Knowledge</h1>
        <button
          type="button"
          onClick={() => setIsSourceMode(!isSourceMode)}
          style={{
            padding: '6px 16px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            background: isSourceMode ? '#e8f0fe' : '#fff',
            cursor: 'pointer',
          }}
        >
          {isSourceMode ? 'WYSIWYG' : 'Source'}
        </button>
      </div>

      {isSourceMode && editorRef.current && (
        <SourceEditor
          ytext={editorRef.current.getYText()}
          provider={editorRef.current.getProvider()}
        />
      )}
      <div style={{ display: isSourceMode ? 'none' : 'block' }}>
        <TiptapEditor ref={editorRef} />
      </div>
    </div>
  );
}
