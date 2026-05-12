import { describe, expect, test } from 'bun:test';
import { isContentDirSafe, relativeToProject } from './ConsentDialogBody';
import SRC from './ConsentDialogBody?raw';

describe('isContentDirSafe', () => {
  test.each([
    ['', true],
    ['.', true],
    ['docs', true],
    ['docs/api', true],
    ['a/b/c/d', true],
    ['./docs', true],
  ])('safe: %s → %s', (input, expected) => {
    expect(isContentDirSafe(input)).toBe(expected);
  });

  test.each([
    ['..', false],
    ['../escape', false],
    ['docs/../..', false],
    ['../sibling', false],
    ['/abs/path', false],
    ['C:/win', false],
  ])('rejected: %s → %s', (input, expected) => {
    expect(isContentDirSafe(input)).toBe(expected);
  });

  test('depth-0 with dotdot rejected', () => {
    expect(isContentDirSafe('docs/../docs/../..')).toBe(false);
  });

  test('balanced traversal stays safe', () => {
    expect(isContentDirSafe('docs/../api')).toBe(true);
  });
});

describe('relativeToProject', () => {
  test('picked === projectDir resolves to "."', () => {
    expect(relativeToProject('/users/me/proj', '/users/me/proj')).toBe('.');
  });

  test('picked inside projectDir returns the relative tail', () => {
    expect(relativeToProject('/users/me/proj', '/users/me/proj/docs')).toBe('docs');
    expect(relativeToProject('/users/me/proj', '/users/me/proj/docs/api')).toBe('docs/api');
  });

  test('trailing slashes on either side are tolerated', () => {
    expect(relativeToProject('/users/me/proj/', '/users/me/proj/docs')).toBe('docs');
    expect(relativeToProject('/users/me/proj', '/users/me/proj/docs/')).toBe('docs');
  });

  test('escape returns null', () => {
    expect(relativeToProject('/users/me/proj', '/users/me/other')).toBe(null);
    expect(relativeToProject('/users/me/proj', '/etc')).toBe(null);
  });

  test('prefix-matching is segment-aware (no /proj-other false-positive)', () => {
    expect(relativeToProject('/users/me/proj', '/users/me/proj-other/docs')).toBe(null);
  });

  test('windows backslash paths normalize for cross-platform comparison', () => {
    expect(relativeToProject('C:\\users\\me\\proj', 'C:\\users\\me\\proj\\docs')).toBe('docs');
  });
});

describe('ConsentDialogBody module', () => {
  test('exports default component', async () => {
    const mod = await import('./ConsentDialogBody');
    expect(typeof mod.default).toBe('function');
  });

  test('exports isContentDirSafe helper', async () => {
    const mod = await import('./ConsentDialogBody');
    expect(typeof mod.isContentDirSafe).toBe('function');
  });

  test('exports relativeToProject helper', async () => {
    const mod = await import('./ConsentDialogBody');
    expect(typeof mod.relativeToProject).toBe('function');
  });
});

describe('ConsentDialogBody — load-bearing structural guards', () => {
  test('Cancel button is type="button" so it does not submit the form', () => {
    expect(SRC).toMatch(
      /<Button[\s\S]{0,200}?type="button"[\s\S]{0,200}?data-testid="consent-cancel"/,
    );
  });

  test('Start button is type="submit" so Enter-on-input routes through onSubmit', () => {
    expect(SRC).toMatch(/<Button type="submit"[\s\S]{0,200}?data-testid="consent-start"/);
  });

  test('onSubmit calls preventDefault to suppress renderer page-reload', () => {
    expect(SRC).toMatch(/function onSubmit[\s\S]{0,200}?e\.preventDefault\(\)/);
  });

  test('onSubmit short-circuits when startDisabled (matches Start click gate)', () => {
    expect(SRC).toMatch(/function onSubmit[\s\S]{0,200}?if \(startDisabled\) return/);
  });

  test('Browse button calls bridge.dialog.openFolder with payload.projectDir as defaultPath', () => {
    expect(SRC).toMatch(
      /bridge\.dialog\.openFolder\(\{\s*defaultPath:\s*payload\.projectDir\s*\}\)/,
    );
  });
});
