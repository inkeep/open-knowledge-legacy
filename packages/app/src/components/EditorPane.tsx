import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useDocumentContext } from '@/editor/DocumentContext';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import { type EditorModeValue, useEditorMode } from '@/editor/use-editor-mode';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { AuthModal } from './AuthModal';
import { CloneDialog } from './CloneDialog';
import { ConflictBanner } from './ConflictBanner';
import { ConflictResolver } from './ConflictResolver';
import type { DiffLayout } from './DiffView';
import { type PanelTab, TABS } from './DocPanel';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { displayAuthor, formatRelativeTime } from './TimelinePanel';

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
  // Persisted preference (localStorage). Read once at mount via
  // `useEditorMode`'s `useState` initializer and seeded into session-local
  // `editorMode`. Open tabs are independent for their lifetime (SPEC D9);
  // the persisted value applies at load (refresh / new tab / new window).
  const [persistedMode, setPersistedMode] = useEditorMode();
  const [editorMode, setEditorMode] = useState<EditorMode>(persistedMode);
  const [conflictResolverOpen, setConflictResolverOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'auth' | 'identity'>('auth');
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [returnToCloneAfterAuth, setReturnToCloneAfterAuth] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<TimelineEntry | null>(null);
  const [diffLayout, setDiffLayout] = useState<DiffLayout>('unified');
  const [activeTab, setActiveTab] = useState<PanelTab>(TABS[0].id);
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

  const { activeDocName } = useDocumentContext();

  function handleEntrySelect(entry: TimelineEntry) {
    if (!entry.sha) {
      // "Current version" clicked — exit diff mode, restore prior editing mode
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

  function handleModeChange(mode: EditorModeValue) {
    setEditorMode(mode);
    // User-initiated change — persist globally. Tool-driven flips (e.g.
    // RAW_MDX_NAV_EVENT → source) are session-only and deliberately do NOT
    // call setPersistedMode (see §7.5).
    setPersistedMode(mode);
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
        activeTab={activeTab}
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
        <div className="flex h-8 shrink-0 items-center border-b bg-muted/30 px-3 gap-2">
          <span className="flex-1 truncate text-xs text-muted-foreground">
            Viewing: {formatRelativeTime(previewEntry.timestamp)} — {displayAuthor(previewEntry)}
          </span>
          {restoreError && <span className="text-xs text-destructive">{restoreError}</span>}
          <Button
            variant="ghost"
            className="font-mono uppercase"
            size="xs"
            onClick={handleExitPreview}
          >
            Close
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="default" size="xs" disabled={restoring}>
                {restoring ? 'Restoring…' : 'Restore'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore this version?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will replace the current document content with the version from{' '}
                  {formatRelativeTime(previewEntry.timestamp)}. Your current content is already
                  saved in the timeline — you can restore it anytime.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="font-mono uppercase">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      <EditorArea
        editorMode={editorMode}
        diffLayout={diffLayout}
        onEntrySelect={handleEntrySelect}
        selectedSha={previewEntry?.sha}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
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
      {/*
        Agent Activity Panel now lives inside DocPanel as the `'agent'` mode
        content (SPEC 2026-04-24-activity-panel-to-docpanel-mode-toggle).
        No longer mounted here — the mode toggle + DocumentContext
        (`docPanelMode` / `docPanelAgentId`) drive visibility. Presence-bar
        avatar clicks flip the DocPanel's mode + scope + trigger expand.
      */}
    </>
  );
}
