import { describe, expect, test } from 'bun:test';
import * as Module from './ShareReceiveDialog';
import SRC from './ShareReceiveDialog?raw';

describe('ShareReceiveDialog — module shape', () => {
  test('exports the named component + props interface', () => {
    expect(typeof Module.ShareReceiveDialog).toBe('function');
  });
});

describe('ShareReceiveDialog — wiring', () => {
  test('imports the Dialog primitives from @/components/ui/dialog', () => {
    expect(SRC).toContain("from '@/components/ui/dialog'");
    expect(SRC).toContain('DialogRoot');
    expect(SRC).toContain('DialogContent');
    expect(SRC).toContain('DialogHeader');
    expect(SRC).toContain('DialogTitle');
    expect(SRC).toContain('DialogBody');
    expect(SRC).toContain('DialogFooter');
  });

  test('imports the receive-flow helpers from @/lib/share/receive-flow', () => {
    expect(SRC).toContain("from '@/lib/share/receive-flow'");
    expect(SRC).toContain('buildCloneUrl');
    expect(SRC).toContain('canonicalGitHubRemoteUrl');
    expect(SRC).toContain('findQ1Match');
    expect(SRC).toContain('formatReceiveLog');
    expect(SRC).toContain('mapValidationToToast');
    expect(SRC).toContain('presentReceiveError');
    expect(SRC).toContain('resolveSharePayload');
  });

  test('imports the receive-store + singleton', () => {
    expect(SRC).toContain("from '@/lib/share/receive-store'");
    expect(SRC).toContain('shareReceiveStore');
  });

  test('uses useSyncExternalStore against the store snapshot/subscribe', () => {
    expect(SRC).toContain('useSyncExternalStore');
    expect(SRC).toContain('store.subscribe');
    expect(SRC).toContain('store.getSnapshot');
  });

  test('runs the Q1 lookup against bridge.project.listRecent', () => {
    expect(SRC).toContain('bridge.project.listRecent()');
  });

  test('Q1 hit dispatches bridge.project.open with the share-receive entry point and threads pendingDeepLinkDoc', () => {
    expect(SRC).toContain("entryPoint: 'share-receive'");
    expect(SRC).toContain('pendingDeepLinkDoc');
  });

  test('Q1 re-validates the matched path before opening so stale RecentProjects fall through to Q2', () => {
    expect(SRC).toMatch(/runQ1Lookup[\s\S]*bridge\.share\.validateLocalFolder/);
    const lookupBody = SRC.slice(
      SRC.indexOf('async function runQ1Lookup'),
      SRC.indexOf('async function runQ1Lookup') + 2000,
    );
    const validateIdx = lookupBody.indexOf('await bridge.share.validateLocalFolder');
    const openIdx = lookupBody.indexOf('await bridge.project.open');
    expect(validateIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(validateIdx);
  });

  test('Q2 picker path uses bridge.dialog.openFolder + bridge.share.validateLocalFolder', () => {
    expect(SRC).toContain('bridge.dialog.openFolder()');
    expect(SRC).toContain('bridge.share.validateLocalFolder');
  });

  test('non-ok payloads route through toast.error + store.dismiss (no dialog mount)', () => {
    expect(SRC).toContain("from 'sonner'");
    expect(SRC).toContain('toast.error');
    expect(SRC).toContain('store.dismiss');
  });

  test('cloneController prop seam carries the streamlined auth + clone surface', () => {
    expect(SRC).toContain('cloneController');
    expect(SRC).toContain('ShareReceiveCloneController');
    expect(SRC).toContain('getAuthStatus');
    expect(SRC).toContain('runClone');
    expect(SRC).toContain('startSignIn');
    expect(SRC).toContain('toast.info');
  });

  test('Clone button disables until auth check resolves with authenticated', () => {
    expect(SRC).toMatch(/authStatus\?\.authenticated === true/);
    expect(SRC).toContain("'Sign in to clone'");
    expect(SRC).toContain("'Cloning...'");
    expect(SRC).toContain('data-testid="share-receive-signin"');
    expect(SRC).toContain('data-testid="share-receive-auth-banner"');
  });

  test('Q2 cards carry stable data-testids for downstream e2e selection', () => {
    expect(SRC).toContain('data-testid="share-receive-dialog"');
    expect(SRC).toContain('data-testid="share-receive-clone"');
    expect(SRC).toContain('data-testid="share-receive-local"');
  });

  test('no React Compiler escape hatches', () => {
    expect(SRC).not.toMatch(/\bforwardRef\b/);
    expect(SRC).not.toMatch(/\bmemo\(/);
    expect(SRC).not.toMatch(/\buseCallback\b/);
    expect(SRC).not.toMatch(/\buseMemo\b/);
  });

  test('no inline style props (Tailwind only)', () => {
    expect(SRC).not.toMatch(/style=\{\{/);
  });

  test('no try/finally + no try without catch (React Compiler BuildHIR rejects both)', () => {
    expect(SRC).not.toMatch(/\}\s*finally\s*\{/);
  });

  test('per-payload reset useEffect tracks [payload] so a second share clears stale q1Done', () => {
    expect(SRC).toMatch(
      /setQ1Done\(false\);\s*setPickerOpen\(false\);\s*setAuthStatus\(null\);\s*setAuthChecking\(false\);\s*setCloneRunning\(false\);\s*authProbeStartedRef\.current = false;\s*\},\s*\[payload\]\);/,
    );
  });
});
