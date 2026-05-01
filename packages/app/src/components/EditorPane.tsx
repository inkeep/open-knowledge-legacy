import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDocumentContext } from '@/editor/DocumentContext';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import { type EditorModeValue, useEditorMode } from '@/editor/use-editor-mode';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { AuthModal } from './AuthModal';
import { ConflictBanner } from './ConflictBanner';
import { ConflictResolver } from './ConflictResolver';
import { type PanelTab, TABS } from './DocPanel';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';

export type EditorMode = EditorModeValue;

export function EditorPane() {
  const [persistedMode, setPersistedMode] = useEditorMode();
  const [editorMode, setEditorMode] = useState<EditorMode>(persistedMode);
  const [conflictResolverOpen, setConflictResolverOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'auth' | 'identity'>('auth');
  const [activeTab, setActiveTab] = useState<PanelTab>(TABS[0].id);
  const [saving, setSaving] = useState(false);
  const optInToastShownRef = useRef(false);

  const syncStatus = useGitSyncStatus();

  const { activeDocName } = useDocumentContext();

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

  return (
    <>
      <ConflictBanner onOpenResolver={() => setConflictResolverOpen(true)} />
      <EditorHeader
        editorMode={editorMode}
        onModeChange={handleModeChange}
        onSaveVersion={handleSaveVersion}
        saving={saving}
        onSignIn={() => {
          setAuthInitialStep('auth');
          setAuthModalOpen(true);
        }}
        onSetIdentity={() => {
          setAuthInitialStep('identity');
          setAuthModalOpen(true);
        }}
        onOpenConflictResolver={() => setConflictResolverOpen(true)}
      />
      <EditorArea editorMode={editorMode} activeTab={activeTab} onActiveTabChange={setActiveTab} />
      <ConflictResolver open={conflictResolverOpen} onOpenChange={setConflictResolverOpen} />
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        identityPrompt={authInitialStep === 'identity'}
        onSuccess={() => {
          setAuthModalOpen(false);
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
