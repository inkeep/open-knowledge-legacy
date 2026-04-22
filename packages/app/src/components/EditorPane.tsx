import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDocumentContext } from '@/editor/DocumentContext';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import {
  type EditorModeValue,
  shouldApplyPersistedMode,
  useEditorMode,
} from '@/editor/use-editor-mode';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { AuthModal } from './AuthModal';
import { CloneDialog } from './CloneDialog';
import { ConflictBanner } from './ConflictBanner';
import { ConflictResolver } from './ConflictResolver';
import type { DiffLayout } from './DiffView';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { displayAuthor, formatRelativeTime, TimelinePanel } from './TimelinePanel';

/**
 * Editor mode enum (TQ8) — single source of truth for the 3-state editor.
 * Replaces the prior `isSourceMode: boolean` + `previewEntry: TimelineEntry | null`
 * two-boolean encoding. Booleans don't scale past 2 states.
 *
 * Derives from `EditorModeValue` (the persistable subset) + `'diff'` — so the
 * "diff is the only non-persistable mode" invariant is enforced structurally
 * by the compiler. Adding a new persistable mode updates `EDITOR_MODE_VALUES`
 * in `use-editor-mode.ts` and this type follows automatically.
 */
export type EditorMode = EditorModeValue | 'diff';

export function EditorPane() {
  // Persisted preference (localStorage, cross-window focus-based sync via
  // `useEditorMode`). Seeds the session-local `editorMode` state and is re-
  // applied when another window flips the preference and this window regains
  // focus — except when we're in diff mode (see cross-window sync effect
  // below + SPEC §7.4 R1).
  const [persistedMode, setPersistedMode] = useEditorMode();
  const [editorMode, setEditorMode] = useState<EditorMode>(persistedMode);
  // Track the session-local editorMode in a ref so the cross-window sync
  // effect below can read it without becoming a dependency. Depending on
  // `editorMode` would make diff-exit → restore-to-pre-diff-mode compete
  // with the effect's own write (audit-surfaced H1 bug). The ref is updated
  // in its own effect (not during render) so the React Compiler doesn't
  // flag `.current = …` as a render-phase ref mutation.
  const editorModeRef = useRef<EditorMode>(persistedMode);
  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);
  const [timelineOpen, setTimelineOpen] = useState(false);
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
  const modeBeforeDiffRef = useRef<EditorModeValue>('wysiwyg');

  const syncStatus = useGitSyncStatus();

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const { activeDocName, activeTarget } = useDocumentContext();

  function handleEntrySelect(entry: TimelineEntry) {
    if (!entry.sha) {
      // "Now" clicked — exit diff mode, restore prior editing mode
      setPreviewEntry(null);
      setEditorMode(modeBeforeDiffRef.current);
    } else {
      if (editorMode !== 'diff') {
        // editorMode is narrowed to EditorModeValue here (the 'diff' branch
        // excluded); direct assignment works since modeBeforeDiffRef is typed
        // as EditorModeValue too.
        modeBeforeDiffRef.current = editorMode;
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
  // The pending navigation store preserves the target offset until the source
  // chunk finishes loading for the active doc.
  useEffect(() => {
    function onRawMdxNav(e: Event) {
      const detail = (e as CustomEvent<RawMdxNavDetail>).detail;
      if (detail && activeDocName) {
        rememberPendingSourceNavigation(activeDocName, { kind: 'raw-mdx', detail });
      }
      setEditorMode('source');
    }
    window.addEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
    return () => window.removeEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
  }, [activeDocName]);

  useEffect(() => {
    if (activeTarget?.kind !== 'folder') return;
    setPreviewEntry(null);
    setTimelineOpen(false);
    if (editorMode === 'diff') {
      setEditorMode(modeBeforeDiffRef.current);
    }
  }, [activeTarget, editorMode]);

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

  function handleModeChange(mode: EditorModeValue) {
    setEditorMode(mode);
    // User-initiated change — persist globally. Tool-driven flips (e.g.
    // RAW_MDX_NAV_EVENT → source) are session-only and deliberately do NOT
    // call setPersistedMode (see §7.5).
    setPersistedMode(mode);
  }

  // Cross-window preference sync. `persistedMode` changes when the hook's
  // focus-based re-check picks up a flip from another window. Apply it to
  // the session-local editorMode UNLESS we're currently in diff — in diff,
  // defer the application so the existing "restore to session pre-diff mode
  // on exit" UX still runs cleanly via `modeBeforeDiffRef`. Dep array is
  // intentionally `[persistedMode]` alone; reading `editorMode` via ref
  // decouples the guard from the dep array (SPEC §7.4 R1, audit H1). The
  // 'diff'-guard decision lives in `shouldApplyPersistedMode()` so the
  // invariant is unit-tested as a pure function — adding `editorMode` to
  // this dep array reintroduces the H1 race; the pure helper alone cannot
  // catch that regression, but it guards the guard's own correctness.
  useEffect(() => {
    if (!shouldApplyPersistedMode(editorModeRef.current)) return;
    setEditorMode(persistedMode);
  }, [persistedMode]);

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
        onTimelineToggle={() => setTimelineOpen((o) => !o)}
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
      <EditorArea
        editorMode={editorMode}
        previewEntry={previewEntry}
        diffLayout={diffLayout}
        onNoDiff={handleNoDiff}
      />
      <TimelinePanel
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        docName={activeDocName ?? ''}
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
