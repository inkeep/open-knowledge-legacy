import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useState } from 'react';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { PageListProvider } from './PageListContext';

export function EditorPane() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  return (
    <PageListProvider>
      <EditorHeader
        provider={provider}
        isSourceMode={isSourceMode}
        onSourceModeChange={setIsSourceMode}
      />
      <EditorArea isSourceMode={isSourceMode} onProviderReady={setProvider} />
    </PageListProvider>
  );
}
