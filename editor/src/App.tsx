import { useEffect, useState } from 'react';
import { getProvider } from '@/client/provider';
import { SourceEditor } from './editor/SourceEditor';
import { TiptapEditor } from './editor/TiptapEditor';

type Status = 'connecting' | 'connected' | 'disconnected';

export function App() {
  const [status, setStatus] = useState<Status>('connecting');
  const [fileMode, setFileMode] = useState('editable');
  const [conflict, setConflict] = useState('');

  useEffect(() => {
    const provider = getProvider();
    const onStatus = ({ status }: { status: string }) => {
      if (status === 'connected') setStatus('connected');
      else if (status === 'disconnected') setStatus('disconnected');
      else setStatus('connecting');
    };
    provider.on('status', onStatus);
    return () => {
      provider.off('status', onStatus);
    };
  }, []);

  useEffect(() => {
    const provider = getProvider();
    const meta = provider.document.getMap('metadata');

    const syncMeta = () => {
      const mode = meta.get('fileMode');
      const nextConflict = meta.get('syncConflict');
      setFileMode(typeof mode === 'string' ? mode : 'editable');
      setConflict(typeof nextConflict === 'string' ? nextConflict : '');
    };

    syncMeta();
    meta.observe(syncMeta);
    return () => meta.unobserve(syncMeta);
  }, []);

  const dot =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'connecting'
        ? 'bg-yellow-400 animate-pulse'
        : 'bg-red-500';

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium">Open Knowledge</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{fileMode === 'editable' ? 'editable' : 'source-only'}</span>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
          {status}
        </div>
      </header>
      {conflict ? (
        <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
          {conflict}
        </div>
      ) : null}

      <div className="flex-1 flex overflow-hidden">
        {/* WYSIWYG pane */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border">
            WYSIWYG
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-6">
              {fileMode === 'editable' ? (
                <TiptapEditor />
              ) : (
                <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  This document is source-only because the server marked it as unsupported for
                  structured editing.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Source pane */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border">
            Source
          </div>
          <div className="flex-1 overflow-hidden">
            <SourceEditor />
          </div>
        </div>
      </div>
    </div>
  );
}
