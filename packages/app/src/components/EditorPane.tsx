import { useEffect, useRef, useState } from 'react';
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
  const [saving, setSaving] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up error dismissal timer on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const { activeDocName } = useDocumentContext();

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

  async function handleSaveVersion() {
    setSaving(true);
    try {
      const res = await fetch('/api/save-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        console.error('[save-version] failed:', await res.text());
      }
    } catch (e) {
      console.error('[save-version] failed:', e);
    }
    setSaving(false);
  }

  async function handleRestore() {
    if (!previewEntry?.sha || !activeDocName) return;
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
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setRestoreError(null), 4000);
      }
    } catch {
      setRestoreError('Restore failed — document unchanged');
      setTimeout(() => setRestoreError(null), 4000);
    }
    setRestoring(false);
  }

  return (
    <PageListProvider>
      <EditorHeader
        isSourceMode={isSourceMode}
        onSourceModeChange={setIsSourceMode}
        onTimelineToggle={() => setTimelineOpen((o) => !o)}
        onSaveVersion={handleSaveVersion}
        saving={saving}
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
