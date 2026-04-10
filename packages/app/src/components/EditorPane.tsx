import { useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { PageListProvider } from './PageListContext';
import type { TimelineEntry } from './TimelinePanel';
import { TimelinePanel } from './TimelinePanel';

export function EditorPane() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<TimelineEntry | null>(null);

  function handleEntrySelect(entry: TimelineEntry) {
    if (!entry.sha) {
      setPreviewEntry(null);
    } else {
      setPreviewEntry(entry);
    }
  }

  function handleExitPreview() {
    setPreviewEntry(null);
  }

  return (
    <PageListProvider>
      <EditorHeader
        isSourceMode={isSourceMode}
        onSourceModeChange={setIsSourceMode}
        onTimelineToggle={() => setTimelineOpen((o) => !o)}
        previewEntry={previewEntry}
        onExitPreview={handleExitPreview}
      />
      <EditorArea
        isSourceMode={isSourceMode}
        previewEntry={previewEntry}
        onNoDiff={handleExitPreview}
      />
      <TimelineDocName
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        onEntrySelect={handleEntrySelect}
        selectedSha={previewEntry?.sha}
      />
    </PageListProvider>
  );
}

/** Reads activeDocName from context and passes to TimelinePanel. */
function TimelineDocName({
  open,
  onOpenChange,
  onEntrySelect,
  selectedSha,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntrySelect: (entry: TimelineEntry) => void;
  selectedSha?: string;
}) {
  const { activeDocName } = useDocumentContext();
  return (
    <TimelinePanel
      open={open}
      onOpenChange={onOpenChange}
      docName={activeDocName ?? ''}
      onEntrySelect={onEntrySelect}
      selectedSha={selectedSha}
    />
  );
}
