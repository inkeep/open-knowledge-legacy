import { describe, expect, test } from 'bun:test';
import { ShareButton } from './ShareButton';
import SRC from './ShareButton?raw';

describe('ShareButton module', () => {
  test('exports ShareButton as a named function component', () => {
    expect(typeof ShareButton).toBe('function');
  });
});

describe('ShareButton — load-bearing structural guards', () => {
  test('delegates orchestration to runShareAction (helper carries the unit-tested decision tree)', () => {
    expect(SRC).toContain("from '@/lib/share/run-share-action'");
    expect(SRC).toContain('runShareAction');
  });

  test('reads activeDocName via useDocumentContext (single source of focused doc)', () => {
    expect(SRC).toContain("from '@/editor/DocumentContext'");
    expect(SRC).toContain('useDocumentContext');
    expect(SRC).toContain('activeDocName');
  });

  test('reads hasRemote via useGitSyncStatusDetailed (no extra fetch)', () => {
    expect(SRC).toContain("from '@/hooks/use-git-sync-status'");
    expect(SRC).toContain('useGitSyncStatusDetailed');
    expect(SRC).toContain('hasRemote');
  });

  test('writes the share URL through navigator.clipboard.writeText', () => {
    expect(SRC).toContain('navigator.clipboard.writeText');
  });

  test('uses sonner toast for the success + error notifications', () => {
    expect(SRC).toContain("from 'sonner'");
    expect(SRC).toContain('toast.success');
    expect(SRC).toContain('toast.error');
  });

  test('renders a Tooltip wrapping the Button trigger (consistent with sibling cluster)', () => {
    expect(SRC).toContain("from '@/components/ui/tooltip'");
    expect(SRC).toContain('<Tooltip>');
    expect(SRC).toContain('<TooltipContent>Share</TooltipContent>');
  });

  test('Button carries an aria-label so the icon-bearing affordance is screen-reader navigable', () => {
    expect(SRC).toMatch(/aria-label="Share doc"/);
  });

  test('renders the Share2 icon from lucide-react', () => {
    expect(SRC).toContain("from 'lucide-react'");
    expect(SRC).toContain('Share2');
  });

  test('Button gets data-testid="share-button" for downstream Playwright coverage', () => {
    expect(SRC).toContain('data-testid="share-button"');
  });

  test('busy flag disables the button so double-clicks cannot fire two requests', () => {
    expect(SRC).toMatch(/disabled=\{busy\}/);
    expect(SRC).toMatch(/setBusy\(true\)/);
    expect(SRC).toMatch(/setBusy\(false\)/);
  });

  test('returns null when no doc is focused (button has nothing to share)', () => {
    expect(SRC).toMatch(/if \(!activeDocName\) return null;/);
  });

  test('no React Compiler escape hatches (forwardRef / memo / useMemo / useCallback)', () => {
    expect(SRC).not.toMatch(/\bforwardRef\b/);
    expect(SRC).not.toMatch(/\buseMemo\b/);
    expect(SRC).not.toMatch(/\buseCallback\b/);
    expect(SRC).not.toMatch(/\bmemo\(/);
  });

  test('no inline style props (Tailwind className per code-style rule)', () => {
    expect(SRC).not.toMatch(/\bstyle=\{\{/);
  });
});
