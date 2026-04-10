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
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function handleEntrySelect(entry: TimelineEntry) {
    if (!entry.sha) {
      setPreviewEntry(null);
    } else {
      setPreviewEntry(entry);
    }
    setRestoreError(null);
  }

  function handleExitPreview() {
    setPreviewEntry(null);
    setRestoreError(null);
  }

  async function handleRestore() {
    if (!previewEntry?.sha) return;
    setRestoring(true);
    try {
      const res = await fetch('/api/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName: activeDocName, commitSha: previewEntry.sha }),
      });
      if (res.ok) {
        setPreviewEntry(null);
        setRestoreError(null);
      } else {
        setRestoreError('Restore failed — document unchanged');
        setTimeout(() => setRestoreError(null), 4000);
      }
    } catch {
      setRestoreError('Restore failed — document unchanged');
      setTimeout(() => setRestoreError(null), 4000);
    }
    setRestoring(false);
  }

  // Read activeDocName inside the provider tree
  const { activeDocName } = useDocumentContext();

  return (
    <PageListProvider>
      <EditorHeader
        isSourceMode={isSourceMode}
        onSourceModeChange={setIsSourceMode}
        onTimelineToggle={() => setTimelineOpen((o) => !o)}
        previewEntry={previewEntry}
        restoring={restoring}
        restoreError={restoreError}
        onExitPreview={handleExitPreview}
        onRestore={handleRestore}
      />
      <EditorArea
        isSourceMode={isSourceMode}
        previewEntry={previewEntry}
        onNoDiff={handleExitPreview}
      />
      <TimelinePanel
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        docName={activeDocName ?? ''}
        onEntrySelect={handleEntrySelect}
        selectedSha={previewEntry?.sha}
      />
    </PageListProvider>
  );
}
