import { describe, expect, test } from 'bun:test';
import { bucketKeyForPath, colorForDocName, colorForFolderPath } from './directory';
import {
  DIRECTORY_FALLBACK_DARK,
  DIRECTORY_FALLBACK_LIGHT,
  DIRECTORY_PALETTE_DARK,
  DIRECTORY_PALETTE_LIGHT,
} from './palette';

describe('bucketKeyForPath', () => {
  test('returns null when depth is 0', () => {
    expect(bucketKeyForPath('projects/alpha', 0)).toBeNull();
  });

  test('returns null for empty path', () => {
    expect(bucketKeyForPath('', 1)).toBeNull();
  });

  test('returns single segment at depth 1', () => {
    expect(bucketKeyForPath('projects/alpha/notes', 1)).toBe('projects');
  });

  test('returns two segments at depth 2', () => {
    expect(bucketKeyForPath('projects/alpha/notes', 2)).toBe('projects/alpha');
  });

  test('returns full path when depth exceeds segment count', () => {
    expect(bucketKeyForPath('projects/alpha', 5)).toBe('projects/alpha');
  });

  test('returns single segment for single-segment path at any depth', () => {
    expect(bucketKeyForPath('projects', 1)).toBe('projects');
    expect(bucketKeyForPath('projects', 3)).toBe('projects');
  });

  test('handles trailing slash', () => {
    expect(bucketKeyForPath('projects/alpha/', 2)).toBe('projects/alpha');
  });

  test('handles leading slash', () => {
    expect(bucketKeyForPath('/projects/alpha', 2)).toBe('projects/alpha');
  });

  test('prefix-truncation at depths 0-5', () => {
    const path = 'a/b/c/d/e/f';
    expect(bucketKeyForPath(path, 0)).toBeNull();
    expect(bucketKeyForPath(path, 1)).toBe('a');
    expect(bucketKeyForPath(path, 2)).toBe('a/b');
    expect(bucketKeyForPath(path, 3)).toBe('a/b/c');
    expect(bucketKeyForPath(path, 4)).toBe('a/b/c/d');
    expect(bucketKeyForPath(path, 5)).toBe('a/b/c/d/e');
  });
});

describe('colorForDocName', () => {
  test('returns fallback for flat-root doc at any depth', () => {
    expect(colorForDocName('readme', { depth: 1, theme: 'light' })).toBe(DIRECTORY_FALLBACK_LIGHT);
    expect(colorForDocName('readme', { depth: 3, theme: 'dark' })).toBe(DIRECTORY_FALLBACK_DARK);
  });

  test('returns fallback when depth is 0', () => {
    expect(colorForDocName('projects/alpha/foo', { depth: 0, theme: 'light' })).toBe(
      DIRECTORY_FALLBACK_LIGHT,
    );
  });

  test('strips filename before bucketing', () => {
    const color1 = colorForDocName('projects/alpha/foo', {
      depth: 2,
      theme: 'light',
    });
    const color2 = colorForDocName('projects/alpha/bar', {
      depth: 2,
      theme: 'light',
    });
    expect(color1).toBe(color2);
  });

  test('path shorter than depth uses its own full prefix, not fallback (D11)', () => {
    const color = colorForDocName('projects/readme', {
      depth: 2,
      theme: 'light',
    });
    expect(color).not.toBe(DIRECTORY_FALLBACK_LIGHT);
    const expectedBucket = 'projects';
    const folderColor = colorForFolderPath(expectedBucket, {
      depth: 2,
      theme: 'light',
    });
    expect(color).toBe(folderColor);
  });

  test('returns a palette color for nested doc', () => {
    const color = colorForDocName('projects/alpha/notes/foo', {
      depth: 1,
      theme: 'light',
    });
    expect(DIRECTORY_PALETTE_LIGHT).toContain(color);
  });

  test('same input produces same output (deterministic)', () => {
    const opts = { depth: 2, theme: 'light' as const };
    const a = colorForDocName('meetings/standup/2024-01', opts);
    const b = colorForDocName('meetings/standup/2024-01', opts);
    expect(a).toBe(b);
  });

  test('theme variance: same bucket, different theme → paired palette index', () => {
    const light = colorForDocName('projects/alpha/foo', {
      depth: 1,
      theme: 'light',
    });
    const dark = colorForDocName('projects/alpha/foo', {
      depth: 1,
      theme: 'dark',
    });
    const lightIdx = DIRECTORY_PALETTE_LIGHT.indexOf(light);
    const darkIdx = DIRECTORY_PALETTE_DARK.indexOf(dark);
    expect(lightIdx).toBeGreaterThanOrEqual(0);
    expect(lightIdx).toBe(darkIdx);
  });
});

describe('colorForFolderPath', () => {
  test('returns fallback when depth is 0', () => {
    expect(colorForFolderPath('projects', { depth: 0, theme: 'light' })).toBe(
      DIRECTORY_FALLBACK_LIGHT,
    );
  });

  test('does not strip last segment (folder semantics)', () => {
    const folderColor = colorForFolderPath('projects/alpha', {
      depth: 2,
      theme: 'light',
    });
    const docColor = colorForDocName('projects/alpha', {
      depth: 2,
      theme: 'light',
    });
    expect(folderColor).not.toBe(docColor);
  });

  test('returns palette color for folder path', () => {
    const color = colorForFolderPath('meetings', {
      depth: 1,
      theme: 'dark',
    });
    expect(DIRECTORY_PALETTE_DARK).toContain(color);
  });

  test('different folders at depth 1 get different or same color deterministically', () => {
    const opts = { depth: 1, theme: 'light' as const };
    const c1 = colorForFolderPath('projects', opts);
    const c2 = colorForFolderPath('meetings', opts);
    expect(typeof c1).toBe('string');
    expect(typeof c2).toBe('string');
  });

  test('prefix-truncation groups deeper folders under same bucket', () => {
    const opts = { depth: 1, theme: 'light' as const };
    const parent = colorForFolderPath('projects', opts);
    const child = colorForFolderPath('projects/alpha', opts);
    expect(parent).toBe(child);
  });

  test('depth 2 distinguishes children within same parent', () => {
    const opts = { depth: 2, theme: 'light' as const };
    const alpha = colorForFolderPath('projects/alpha', opts);
    const beta = colorForFolderPath('projects/beta', opts);
    expect(alpha).not.toBe(beta);
  });
});
