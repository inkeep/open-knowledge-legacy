import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILETREE_SRC = readFileSync(join(__dirname, 'FileTree.tsx'), 'utf8');

const ACTIVE_TREE_PATH_DEPS_CLOSE =
  '}, [activeAncestorTreePathsSignature, activeTreePath, model]);';
const USE_EFFECT_OPEN = 'useEffect(() => {';

function extractActiveTreePathEffectBody(): string {
  const closeIdx = FILETREE_SRC.indexOf(ACTIVE_TREE_PATH_DEPS_CLOSE);
  if (closeIdx === -1) {
    throw new Error(
      'Could not locate the activeTreePath useEffect deps-array close in FileTree.tsx. ' +
        `Expected substring: \`${ACTIVE_TREE_PATH_DEPS_CLOSE}\`. ` +
        'If the deps changed, update this anchor AND re-evaluate whether the ' +
        'singleton-selection contract still holds at the new effect site.',
    );
  }
  const openIdx = FILETREE_SRC.lastIndexOf(USE_EFFECT_OPEN, closeIdx);
  if (openIdx === -1) {
    throw new Error(
      'Could not locate the matching `useEffect(() => {` opener for the ' +
        'activeTreePath effect.',
    );
  }
  return FILETREE_SRC.slice(openIdx + USE_EFFECT_OPEN.length, closeIdx);
}

describe('FileTree — activeTreePath → Pierre selection mirror (singleton invariant)', () => {
  test('the activeTreePath useEffect block exists with its expected deps signature', () => {
    expect(FILETREE_SRC).toContain(ACTIVE_TREE_PATH_DEPS_CLOSE);
    expect(extractActiveTreePathEffectBody().length).toBeGreaterThan(0);
  });

  test('the activeTreePath effect must NOT use the additive `item.select()` shorthand', () => {
    const body = extractActiveTreePathEffectBody();
    expect(body).not.toMatch(/\bitem\.select\(\)/);
  });

  test('the activeTreePath effect must use a replace-semantic selection primitive', () => {
    const body = extractActiveTreePathEffectBody();
    const usesOptionA = /(?<![_\w])selectOnlyTreeItem\s*\(/.test(body);
    const usesOptionB = /\.selectOnlyPath\s*\(/.test(body);
    expect(usesOptionA || usesOptionB).toBe(true);
  });

  test('the activeTreePath effect must still call `item.focus()` (focus side effect preserved)', () => {
    const body = extractActiveTreePathEffectBody();
    expect(body).toMatch(/\bitem\.focus\(\)/);
  });
});
