import { useCallback, useRef, useState } from 'react';
import { SourceEditor } from './editor/SourceEditor';
import { TiptapEditor } from './editor/TiptapEditor';

export function App() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceContent, setSourceContent] = useState('');
  const editorRef = useRef<{
    getMarkdown: () => string;
    applyMarkdown: (md: string) => void;
  } | null>(null);

  const handleToggle = useCallback(() => {
    if (isSourceMode) {
      // Toggle back to WYSIWYG — apply source edits via updateYFragment
      const editor = editorRef.current;
      if (editor && sourceContent) {
        editor.applyMarkdown(sourceContent);
      }
      setIsSourceMode(false);
    } else {
      // Toggle to source — serialize current content to markdown
      const editor = editorRef.current;
      if (editor) {
        const md = editor.getMarkdown();
        setSourceContent(md);
      }
      setIsSourceMode(true);
    }
  }, [isSourceMode, sourceContent]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <h1 style={{ margin: 0 }}>Open Knowledge</h1>
        <button
          type="button"
          onClick={handleToggle}
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

      {isSourceMode ? (
        <SourceEditor content={sourceContent} onChange={setSourceContent} />
      ) : (
        <TiptapEditor ref={editorRef} />
      )}
    </div>
  );
}
