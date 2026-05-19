import { describe, expect, test } from 'bun:test';
import { mergePageSets, pruneConfirmedOptimisticPages } from './PageListContext';
import SRC from './PageListContext.tsx?raw';

describe('PageListContext helpers', () => {
  test('mergePageSets keeps optimistic created pages visible until server confirms them', () => {
    const merged = mergePageSets(new Set(['STORIES']), new Set(['Y']));
    expect([...merged].sort()).toEqual(['STORIES', 'Y']);
  });

  test('pruneConfirmedOptimisticPages removes pages once the server index includes them', () => {
    const pending = pruneConfirmedOptimisticPages(new Set(['Y', 'tim']), new Set(['Y', 'STORIES']));
    expect([...pending]).toEqual(['tim']);
  });
});

describe('PageListContext compiler-memoization preconditions', () => {
  test('no "use no memo" directive opts the file out of the React Compiler', () => {
    expect(SRC).not.toMatch(/['"]use no memo['"]/);
  });

  test('no hand-written useMemo / useCallback / memo (compiler covers it)', () => {
    expect(SRC).not.toMatch(/\buseMemo\s*\(/);
    expect(SRC).not.toMatch(/\buseCallback\s*\(/);
    expect(SRC).not.toMatch(/\bmemo\s*\(/);
    expect(SRC).not.toMatch(/from\s+['"]react['"][^;]*\b(useMemo|useCallback|memo)\b/);
  });

  test('per-render derivations exist and consume reactive state via top-level helpers', () => {
    expect(SRC).toMatch(
      /const\s+pages\s*=\s*mergePageSets\(\s*serverPages\s*,\s*optimisticPages\s*\)/,
    );
    expect(SRC).toMatch(
      /const\s+pageTitles\s*=\s*mergePageTitles\(\s*serverPageTitles\s*,\s*optimisticPages\s*\)/,
    );
    expect(SRC).toMatch(/const\s+folderPaths\s*=\s*new Set\(\[[\s\S]*?deriveKnownFolderPaths\(/);
    expect(SRC).toMatch(/const\s+pagesBySlug\s*=\s*buildPagesBySlugIndex\(\s*pages\s*,/);
  });

  test('setPageListCache effect depends on the four memoized derivations', () => {
    expect(SRC).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?setPageListCache\([\s\S]*?\}\s*,\s*\[\s*pages\s*,\s*folderPaths\s*,\s*pagesBySlug\s*,\s*assetPaths\s*\]\s*\)/,
    );
  });
});
