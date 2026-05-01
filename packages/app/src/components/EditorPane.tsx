import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDocumentContext } from '@/editor/DocumentContext';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import { type EditorModeValue, useEditorMode } from '@/editor/use-editor-mode';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { useConfigContext } from '@/lib/config-provider';
import { AuthModal } from './AuthModal';
import { AutoSyncOnboardingDialog } from './AutoSyncOnboardingDialog';
import { ConflictBanner } from './ConflictBanner';
import { ConflictResolver } from './ConflictResolver';
import { type PanelTab, TABS } from './DocPanel';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';

export type EditorMode = EditorModeValue;

export function EditorPane() {
  // Persisted preference (localStorage). Read once at mount via
  // `useEditorMode`'s `useState` initializer and seeded into session-local
  // `editorMode`. Open tabs are independent for their lifetime;
  // the persisted value applies at load (refresh / new tab / new window).
  const [persistedMode, setPersistedMode] = useEditorMode();
  const [editorMode, setEditorMode] = useState<EditorMode>(persistedMode);
  const [conflictResolverOpen, setConflictResolverOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'auth' | 'identity'>('auth');
  const [activeTab, setActiveTab] = useState<PanelTab>(TABS[0].id);
  const [saving, setSaving] = useState(false);
  const [autoSyncOnboardingDismissed, setAutoSyncOnboardingDismissed] = useState(false);

  const syncStatus = useGitSyncStatus();
  const { projectConfig } = useConfigContext();

  const { activeDocName } = useDocumentContext();

  // Onboarding modal: open once per project when a remote exists and the user
  // has not yet chosen an autoSync.enabled value. The local flag closes the
  // modal immediately while the config file watcher propagates the API write.
  const showAutoSyncOnboarding =
    !autoSyncOnboardingDismissed &&
    syncStatus?.hasRemote === true &&
    projectConfig !== null &&
    projectConfig.autoSync?.enabled === undefined;

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
      <AutoSyncOnboardingDialog
        open={showAutoSyncOnboarding}
        onResolved={() => setAutoSyncOnboardingDismissed(true)}
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
