import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import { RAW_MDX_NAV_EVENT } from '@/editor/extensions/RawMdxFallbackView';
import { createNavigationRetryHandler } from '@/editor/navigation-retry';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { AuthModal } from './AuthModal';
import { CloneDialog } from './CloneDialog';
import { ConflictBanner } from './ConflictBanner';
import { ConflictResolver } from './ConflictResolver';
import type { DiffLayout } from './DiffView';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { NavigationPendingBar } from './NavigationPendingBar';
import { displayAuthor, formatRelativeTime } from './TimelinePanel';

/**
 * Editor mode enum (TQ8) — single source of truth for the 3-state editor.
 * Replaces the prior `isSourceMode: boolean` + `previewEntry: TimelineEntry | null`
 * two-boolean encoding. Booleans don't scale past 2 states.
 */
export type EditorMode = 'wysiwyg' | 'source' | 'diff';

export function EditorPane() {
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [conflictResolverOpen, setConflictResolverOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'auth' | 'identity'>('auth');
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [returnToCloneAfterAuth, setReturnToCloneAfterAuth] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<TimelineEntry | null>(null);
  const [diffLayout, setDiffLayout] = useState<DiffLayout>('unified');
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optInToastShownRef = useRef(false);
  /** Remembers which editing mode to restore after exiting diff preview. */
  const modeBeforeDiffRef = useRef<'wysiwyg' | 'source'>('wysiwyg');

  const syncStatus = useGitSyncStatus();

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const { activeDocName, recycleDocument } = useDocumentContext();
  const { openDocumentTransition, isPending } = useDocumentTransition();

  // Retry handler consumed by `NavigationPendingBar`'s tier-3 "Try again"
  // button (spec §D7). Reads `activeDocName` via a thunk at call time so the
  // handler always targets the currently-displayed doc, not a stale capture.
  // `recycleDocument` is the one-shot reset — destroys the broken provider
  // and recreates it before the new transition re-suspends DocumentBoundary.
  const handleRetry = createNavigationRetryHandler({
    recycleDocument,
    openDocumentTransition,
    getActiveDocName: () => activeDocName,
  });

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

  function handleNoDiff() {
    handleExitPreview();
    toast.info('No changes since this version');
  }

  // R7: rawMdxFallback click → switch to source mode so user can fix the broken MDX.
  // SourceEditor separately listens for the same event to scroll to the offset.
  useEffect(() => {
    function onRawMdxNav() {
      setEditorMode('source');
    }
    window.addEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
    return () => window.removeEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
  }, []);

  // Clear stale diff state when the active document changes (spec D3 / FR-3).
  // Uses a ref to detect doc changes in an effect that reads activeDocName,
  // satisfying the React Compiler's dependency analysis.
  const prevDocNameRef = useRef(activeDocName);
  useEffect(() => {
    if (prevDocNameRef.current !== activeDocName) {
      prevDocNameRef.current = activeDocName;
      setPreviewEntry(null);
      if (editorMode === 'diff') {
        setEditorMode(modeBeforeDiffRef.current);
      }
    }
  }, [activeDocName, editorMode]);

  // Opt-in prompt (D36): show a dismissible toast the first time we detect
  // a remote exists but sync is dormant (not yet enabled).
  useEffect(() => {
    if (!optInToastShownRef.current && syncStatus?.state === 'dormant' && syncStatus.hasRemote) {
      optInToastShownRef.current = true;
      toast.info('This project has a GitHub remote.', {
        description: 'Sign in to enable automatic sync with your team.',
        duration: 8000,
        action: {
          label: 'Sign in',
          onClick: () => setAuthModalOpen(true),
        },
      });
    }
  }, [syncStatus?.state, syncStatus?.hasRemote]);

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
      if (res.ok) {
        toast.success('Checkpoint saved');
      } else {
        console.error('[save-version] failed:', await res.text());
        toast.error('Checkpoint failed — try again');
      }
    } catch (e) {
      console.error('[save-version] failed:', e);
      toast.error('Checkpoint failed — try again');
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
    <>
      <ConflictBanner onOpenResolver={() => setConflictResolverOpen(true)} />
      <EditorHeader
        editorMode={editorMode}
        onModeChange={handleModeChange}
        onSaveVersion={handleSaveVersion}
        saving={saving}
        previewEntry={previewEntry}
        restoring={restoring}
        restoreError={restoreError}
        onExitPreview={handleExitPreview}
        onRestore={handleRestore}
        diffLayout={diffLayout}
        onDiffLayoutChange={setDiffLayout}
        onSignIn={() => {
          setAuthInitialStep('auth');
          setAuthModalOpen(true);
        }}
        onSetIdentity={() => {
          setAuthInitialStep('identity');
          setAuthModalOpen(true);
        }}
        onOpenConflictResolver={() => setConflictResolverOpen(true)}
        onOpenClone={() => setCloneDialogOpen(true)}
      />
      {editorMode === 'diff' && previewEntry && (
        <div className="flex h-8 shrink-0 items-center border-b bg-muted/30 px-3 justify-center">
          <span className="truncate text-xs text-muted-foreground">
            Viewing: {formatRelativeTime(previewEntry.timestamp)} — {displayAuthor(previewEntry)}
          </span>
        </div>
      )}
      <NavigationPendingBar isPending={isPending} onRetry={handleRetry} />
      <EditorArea
        editorMode={editorMode}
        previewEntry={previewEntry}
        diffLayout={diffLayout}
        onNoDiff={handleNoDiff}
        onEntrySelect={handleEntrySelect}
        selectedSha={previewEntry?.sha}
      />
      <ConflictResolver open={conflictResolverOpen} onOpenChange={setConflictResolverOpen} />
      <AuthModal
        open={authModalOpen}
        onOpenChange={(next) => {
          setAuthModalOpen(next);
          if (!next) setReturnToCloneAfterAuth(false);
        }}
        identityPrompt={authInitialStep === 'identity'}
        onSuccess={() => {
          setAuthModalOpen(false);
          if (returnToCloneAfterAuth) {
            setReturnToCloneAfterAuth(false);
            setCloneDialogOpen(true);
          }
        }}
      />
      <CloneDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        onSignIn={() => {
          setCloneDialogOpen(false);
          setAuthInitialStep('auth');
          setReturnToCloneAfterAuth(true);
          setAuthModalOpen(true);
        }}
      />
    </>
  );
}
