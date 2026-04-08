import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SourceEditor } from './editor/SourceEditor';
import type { TiptapEditorHandle } from './editor/TiptapEditor';
import { TiptapEditor } from './editor/TiptapEditor';
import { AgentUndoButton } from './presence/AgentUndoButton';
import { PresenceBar } from './presence/PresenceBar';

export function App() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const editorRef = useRef<TiptapEditorHandle | null>(null);

  const editorCallbackRef = useCallback((handle: TiptapEditorHandle | null) => {
    editorRef.current = handle;
    if (handle) {
      setProvider(handle.getProvider());
    }
  }, []);

  return (
    <div className="mx-auto max-w-[800px] min-h-screen flex flex-col px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Open Knowledge</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time collaborative editing with AI presence
        </p>
      </div>

      {/* Presence bar */}
      <div className="rounded-lg border bg-muted/30 px-3 py-2 mb-3">
        <PresenceBar provider={provider} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            variant={!isSourceMode ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            aria-pressed={!isSourceMode}
            onClick={() => setIsSourceMode(false)}
          >
            WYSIWYG
          </Button>
          <Button
            variant={isSourceMode ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            aria-pressed={isSourceMode}
            onClick={() => setIsSourceMode(true)}
          >
            Source
          </Button>
        </div>
        <div className="ml-auto">
          <AgentUndoButton />
        </div>
      </div>

      {/* Editor container */}
      <div className="relative flex-1 rounded-lg border bg-white overflow-hidden">
        <div className="h-[calc(100vh-280px)] overflow-y-auto">
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
      </div>

      {/* Footer hint */}
      <div className="mt-3 text-center">
        <p className="text-xs text-muted-foreground font-mono">
          Run{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
            bun run src/server/agent-sim.ts --markdown
          </code>{' '}
          to trigger an agent write
        </p>
      </div>
    </div>
  );
}
