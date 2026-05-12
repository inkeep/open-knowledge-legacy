import { describe, expect, test } from 'bun:test';
import {
  basenamePreview,
  CreateProjectDialog,
  computeCascade,
  joinPathPreview,
  parseCreateNewError,
} from './CreateProjectDialog';
import SRC from './CreateProjectDialog?raw';

describe('joinPathPreview', () => {
  test('joins parent + name with forward slash by default', () => {
    expect(joinPathPreview('/Users/me/Projects', 'Foo')).toBe('/Users/me/Projects/Foo');
  });

  test('drops trailing slash on parent', () => {
    expect(joinPathPreview('/Users/me/Projects/', 'Foo')).toBe('/Users/me/Projects/Foo');
    expect(joinPathPreview('/Users/me/Projects//', 'Foo')).toBe('/Users/me/Projects/Foo');
  });

  test('uses backslash on Windows-style parents', () => {
    expect(joinPathPreview('C:\\Users\\me', 'Foo')).toBe('C:\\Users\\me\\Foo');
  });

  test('returns empty string when either side is empty', () => {
    expect(joinPathPreview('', 'Foo')).toBe('');
    expect(joinPathPreview('/Users/me', '')).toBe('');
    expect(joinPathPreview('', '')).toBe('');
  });
});

describe('basenamePreview', () => {
  test('extracts the trailing component from a POSIX path', () => {
    expect(basenamePreview('/Users/me/Projects/Foo')).toBe('Foo');
  });

  test('extracts the trailing component from a Windows path', () => {
    expect(basenamePreview('C:\\Users\\me\\Projects\\Foo')).toBe('Foo');
  });

  test('tolerates trailing separators', () => {
    expect(basenamePreview('/Users/me/Projects/Foo/')).toBe('Foo');
    expect(basenamePreview('C:\\Users\\me\\Foo\\')).toBe('Foo');
  });

  test('returns the input unchanged when there is no separator', () => {
    expect(basenamePreview('Foo')).toBe('Foo');
  });

  test('returns empty string for empty input', () => {
    expect(basenamePreview('')).toBe('');
  });
});

describe('computeCascade', () => {
  const baseInput = {
    parent: '/Users/me/Projects',
    sanitizedName: 'Foo',
    enclosingProject: null,
    enclosingGit: null,
    targetState: null,
  };

  test('idle when parent or name is empty', () => {
    expect(computeCascade({ ...baseInput, parent: '' })).toEqual({ kind: 'idle' });
    expect(computeCascade({ ...baseInput, sanitizedName: '' })).toEqual({ kind: 'idle' });
  });

  test('block-nested wins over all other branches', () => {
    expect(
      computeCascade({
        ...baseInput,
        enclosingProject: { rootPath: '/Users/me/parent-proj', distance: 1 },
        enclosingGit: { gitRoot: '/Users/me', distance: 2 },
        targetState: 'exists-nonempty',
      }),
    ).toEqual({ kind: 'block-nested', rootPath: '/Users/me/parent-proj' });
  });

  test('confirm-git fires when an enclosing git root exists distinct from parent', () => {
    expect(
      computeCascade({
        ...baseInput,
        enclosingGit: { gitRoot: '/Users/me/repo', distance: 1 },
        targetState: 'free',
      }),
    ).toEqual({ kind: 'confirm-git', gitRoot: '/Users/me/repo' });
  });

  test('confirm-git suppressed when gitRoot === parent (no promotion would happen)', () => {
    expect(
      computeCascade({
        ...baseInput,
        enclosingGit: { gitRoot: '/Users/me/Projects', distance: 0 },
        targetState: 'free',
      }),
    ).toEqual({ kind: 'free' });
  });

  test('block-nonempty fires when target exists with content', () => {
    expect(
      computeCascade({
        ...baseInput,
        targetState: 'exists-nonempty',
      }),
    ).toEqual({ kind: 'block-nonempty' });
  });

  test('exists-empty is treated as free (manual mkdir retry case)', () => {
    expect(
      computeCascade({
        ...baseInput,
        targetState: 'exists-empty',
      }),
    ).toEqual({ kind: 'free' });
  });

  test('free when all probes return null / free', () => {
    expect(
      computeCascade({
        ...baseInput,
        targetState: 'free',
      }),
    ).toEqual({ kind: 'free' });
  });

  test('targetState null (probes not yet returned) treated as free', () => {
    expect(computeCascade({ ...baseInput, targetState: null })).toEqual({ kind: 'free' });
  });
});

describe('parseCreateNewError', () => {
  test('matches nested-project prefix', () => {
    const e = new Error('nested-project: Cannot create a project inside an existing project: /foo');
    expect(parseCreateNewError(e)).toEqual({ reason: 'nested-project' });
  });

  test('matches target-not-empty prefix', () => {
    const e = new Error('target-not-empty: Target folder is not empty: /foo/bar');
    expect(parseCreateNewError(e)).toEqual({ reason: 'target-not-empty' });
  });

  test('matches invalid-args / mkdir-failed / git-init-failed / init-failed / discovery-failed', () => {
    expect(parseCreateNewError(new Error('invalid-args: name is empty'))).toMatchObject({
      reason: 'invalid-args',
    });
    expect(parseCreateNewError(new Error('mkdir-failed: EACCES'))).toMatchObject({
      reason: 'mkdir-failed',
    });
    expect(parseCreateNewError(new Error('git-init-failed: git not on PATH'))).toMatchObject({
      reason: 'git-init-failed',
    });
    expect(parseCreateNewError(new Error('init-failed: write error'))).toMatchObject({
      reason: 'init-failed',
    });
    expect(parseCreateNewError(new Error('discovery-failed: realpath EACCES'))).toMatchObject({
      reason: 'discovery-failed',
    });
  });

  test('falls through to unknown with verbatim message', () => {
    expect(parseCreateNewError(new Error('weird unexpected thing'))).toEqual({
      reason: 'unknown',
      message: 'weird unexpected thing',
    });
  });

  test('handles non-Error throwables', () => {
    expect(parseCreateNewError('plain string')).toEqual({
      reason: 'unknown',
      message: 'plain string',
    });
  });
});

describe('CreateProjectDialog module', () => {
  test('exports component as a named function', () => {
    expect(typeof CreateProjectDialog).toBe('function');
  });

  test('exports named pure helpers', async () => {
    const mod = await import('./CreateProjectDialog');
    expect(typeof mod.CreateProjectDialog).toBe('function');
    expect(typeof mod.computeCascade).toBe('function');
    expect(typeof mod.joinPathPreview).toBe('function');
    expect(typeof mod.parseCreateNewError).toBe('function');
  });
});

describe('CreateProjectDialog — load-bearing structural guards', () => {
  test('Cancel button is type="button" so it does not submit the form', () => {
    expect(SRC).toMatch(
      /<Button[\s\S]{0,400}?type="button"[\s\S]{0,400}?data-testid="create-cancel"/,
    );
  });

  test('Submit button is type="submit" so Enter-on-input fires Create', () => {
    expect(SRC).toMatch(/<Button type="submit"[\s\S]{0,400}?data-testid="create-submit"/);
  });

  test('Browse button is type="button" and calls bridge.dialog.openFolder', () => {
    expect(SRC).toMatch(
      /<Button[\s\S]{0,400}?type="button"[\s\S]{0,400}?data-testid="create-browse"/,
    );
    expect(SRC).toContain('bridge.dialog.openFolder()');
  });

  test('onSubmit calls preventDefault to suppress renderer page-reload', () => {
    expect(SRC).toMatch(/onSubmit[\s\S]{0,200}?e\.preventDefault\(\)/);
  });

  test('Editor labels + ALL_EDITOR_IDS are sourced from @inkeep/open-knowledge-core', () => {
    expect(SRC).toMatch(/EDITOR_LABELS[\s\S]{0,400}from '@inkeep\/open-knowledge-core'/);
    expect(SRC).toMatch(/ALL_EDITOR_IDS[\s\S]{0,400}from '@inkeep\/open-knowledge-core'/);
    expect(SRC).not.toMatch(/^const EDITOR_LABELS\b/m);
    expect(SRC).not.toMatch(/^const ALL_EDITOR_IDS\b/m);
  });

  test('Cascade evaluator imports + uses sanitizeFolderName from core', () => {
    expect(SRC).toContain("from '@inkeep/open-knowledge-core'");
    expect(SRC).toContain('sanitizeFolderName');
  });

  test('Telemetry call fires bridge.project.recordCreateNewBannerShown', () => {
    expect(SRC).toContain('recordCreateNewBannerShown');
  });

  test('All four ALL_EDITOR_IDS rendered as checkbox rows (data-testid contract)', () => {
    expect(SRC).toMatch(/data-testid={`create-editor-\$\{id\}`}/);
  });

  test('Banner variants carry stable data-testids the e2e relies on', () => {
    expect(SRC).toContain('data-testid="create-banner-nested"');
    expect(SRC).toContain('data-testid="create-banner-git-confirm"');
    expect(SRC).toContain('data-testid="create-banner-nonempty"');
    expect(SRC).toContain('data-testid="create-banner-nested-open"');
  });

  test('No forbidden React Compiler escape hatches (memo / useMemo / useCallback / forwardRef)', () => {
    expect(SRC).not.toMatch(/\bforwardRef\b/);
    expect(SRC).not.toMatch(/\buseMemo\b/);
    expect(SRC).not.toMatch(/\buseCallback\b/);
    expect(SRC).not.toMatch(/\bmemo\(/);
  });

  test('No inline style props (Tailwind via className per code-style rule)', () => {
    expect(SRC).not.toMatch(/\bstyle=\{\{/);
  });

  test('Open-tracking useEffect resets transient state on each open', () => {
    const block = SRC.match(/if \(!open\) return;[\s\S]{0,800}?bridge\.fs/);
    expect(block).not.toBeNull();
    const body = block?.[0] ?? '';
    expect(body).toContain('setBusy(false)');
    expect(body).toContain("setName('')");
    expect(body).toContain('setEditorIds(new Set(ALL_EDITOR_IDS))');
  });
});
