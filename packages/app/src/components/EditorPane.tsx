import { useState } from 'react';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';

export function EditorPane() {
  const [isSourceMode, setIsSourceMode] = useState(false);

  return (
    <>
      <EditorHeader isSourceMode={isSourceMode} onSourceModeChange={setIsSourceMode} />
      <EditorArea isSourceMode={isSourceMode} />
    </>
  );
}
