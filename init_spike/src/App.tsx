import { useCallback, useEffect, useRef, useState } from 'react';
import { SourceEditor } from './editor/SourceEditor';
import type { TiptapEditorHandle } from './editor/TiptapEditor';
import { TiptapEditor } from './editor/TiptapEditor';

export function App() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceContent, setSourceContent] = useState('');
  const [snapshotMarkdown, setSnapshotMarkdown] = useState('');
  const editorRef = useRef<TiptapEditorHandle | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [toggleError, setToggleError] = useState<string | null>(null);

  // Subscribe to Y.Doc changes when entering source mode
  // Agent writes will trigger this, updating the source view in real-time
  useEffect(() => {
    if (isSourceMode && editorRef.current) {
      const unsubscribe = editorRef.current.onContentChange((markdown) => {
        setSourceContent(markdown);
      });
      unsubscribeRef.current = unsubscribe;
      return () => {
        unsubscribe();
        unsubscribeRef.current = null;
      };
    }
  }, [isSourceMode]);

  const handleToggle = useCallback(() => {
    if (isSourceMode) {
      // Unsubscribe from Y.Doc changes before toggle-back to avoid
      // the observer firing during applyThreeWayMerge
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Toggle back to WYSIWYG — three-way merge preserves concurrent agent writes
      const editor = editorRef.current;
      if (editor) {
        try {
          const result = editor.applyThreeWayMerge(snapshotMarkdown, sourceContent);
          if (result.fallbackReason) {
            console.warn('[App] Three-way merge fell back:', result.fallbackReason);
          }
          if (result.conflicts.length > 0) {
            console.warn(`[App] ${result.conflicts.length} conflict(s) resolved with user-wins`);
          }
          setToggleError(null);
        } catch (err) {
          setToggleError(err instanceof Error ? err.message : 'Failed to parse markdown');
          return; // Stay in source mode on error
        }
      }
      setIsSourceMode(false);
    } else {
      // Toggle to source — serialize current content to markdown and store snapshot
      const editor = editorRef.current;
      if (editor) {
        try {
          const md = editor.getMarkdown();
          setSourceContent(md);
          setSnapshotMarkdown(md); // Store snapshot for three-way merge on toggle-back
        } catch (err) {
          setToggleError(err instanceof Error ? err.message : 'Failed to serialize markdown');
          return; // Stay in WYSIWYG mode
        }
      }
      setToggleError(null);
      setIsSourceMode(true);
    }
  }, [isSourceMode, sourceContent, snapshotMarkdown]);

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

      {toggleError && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '12px',
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c00',
          }}
        >
          Parse error: {toggleError}
        </div>
      )}

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
