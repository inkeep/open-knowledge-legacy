import { useEffect, useRef, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { PageListProvider } from './PageListContext';
import type { TimelineEntry } from './TimelinePanel';
import { TimelinePanel } from './TimelinePanel';

/**
 * Editor mode enum (TQ8) — single source of truth for the 3-state editor.
 * Replaces the prior `isSourceMode: boolean` + `previewEntry: TimelineEntry | null`
 * two-boolean encoding. Booleans don't scale past 2 states.
 */
export type EditorMode = 'wysiwyg' | 'source' | 'diff';

export function EditorPane() {
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<TimelineEntry | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Remembers which editing mode to restore after exiting diff preview. */
  const modeBeforeDiffRef = useRef<'wysiwyg' | 'source'>('wysiwyg');

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const { activeDocName } = useDocumentContext();

  function handleEntrySelect(entry: TimelineEntry) {
    if (!entry.sha) {
      // "Now" clicked — exit diff mode, restore prior editing mode
      setPreviewEntry(null);
      setEditorMode(modeBeforeDiffRef.current);
    } else {
      if (editorMode !== 'diff') {
        modeBeforeDiffRef.current = editorMode === 'source' ? 'source' : 'wysiwyg';
      }
      setPreviewEntry(entry);
      setEditorMode('diff');
    }
    setRestoreError(null);
  }

  function handleExitPreview() {
    setPreviewEntry(null);
    setEditorMode(modeBeforeDiffRef.current);
    setRestoreError(null);
  }

  function handleModeChange(mode: 'wysiwyg' | 'source') {
    setEditorMode(mode);
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
        setEditorMode(modeBeforeDiffRef.current);
        setRestoreError(null);
      } else {
        setRestoreError('Restore failed — document unchanged');
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setRestoreError(null), 4000);
      }
    } catch {
      setRestoreError('Restore failed — document unchanged');
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setRestoreError(null), 4000);
    }
    setRestoring(false);
  }

  return (
    <PageListProvider>
      <EditorHeader
        editorMode={editorMode}
        onModeChange={handleModeChange}
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
        editorMode={editorMode}
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
