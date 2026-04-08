import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SourceEditor } from './editor/SourceEditor';
import type { TiptapEditorHandle } from './editor/TiptapEditor';
import { TiptapEditor } from './editor/TiptapEditor';
import { AgentUndoButton } from './presence/AgentUndoButton';
import { PresenceBar } from './presence/PresenceBar';

export function App() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const editorRef = useRef<TiptapEditorHandle | null>(null);

  const provider = editorRef.current?.getProvider() ?? null;

  return (
    <div className="mx-auto max-w-[800px] p-6">
      {/* Presence bar */}
      <PresenceBar provider={provider} />

      {/* Toolbar: mode toggle + agent undo */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-lg font-semibold mr-auto">Open Knowledge</h1>
        <AgentUndoButton />
        <Button
          variant={isSourceMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsSourceMode(!isSourceMode)}
        >
          {isSourceMode ? 'WYSIWYG' : 'Source'}
        </Button>
      </div>

      {/* Editor area */}
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
