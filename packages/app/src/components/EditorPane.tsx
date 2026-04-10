import { useState } from 'react';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { PageListProvider } from './PageListContext';
import { TimelinePanel } from './TimelinePanel';

export function EditorPane() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  return (
    <PageListProvider>
      <EditorHeader
        isSourceMode={isSourceMode}
        onSourceModeChange={setIsSourceMode}
        onTimelineToggle={() => setTimelineOpen((o) => !o)}
      />
      <EditorArea isSourceMode={isSourceMode} />
      <TimelinePanel open={timelineOpen} onOpenChange={setTimelineOpen} docName="test-doc" />
    </PageListProvider>
  );
}
