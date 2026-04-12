import { useState } from 'react';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { PageListProvider } from './PageListContext';

export function EditorPane() {
  const [isSourceMode, setIsSourceMode] = useState(false);

  return (
    <PageListProvider>
      <EditorHeader isSourceMode={isSourceMode} onSourceModeChange={setIsSourceMode} />
      <EditorArea isSourceMode={isSourceMode} />
    </PageListProvider>
  );
}
