import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILETREE_SRC = readFileSync(join(__dirname, 'FileTree.tsx'), 'utf8');

describe('FileTree — Hide this file/folder menu item (US-013 source-level)', () => {
  test('FileTree consumes useConfigContext to read okignoreBinding', () => {
    expect(FILETREE_SRC).toMatch(
      /import\s*\{[^}]*useConfigContext[^}]*\}\s*from\s*'@\/lib\/config-provider'/,
    );
    expect(FILETREE_SRC).toMatch(/const\s*\{\s*okignoreBinding\s*\}\s*=\s*useConfigContext\(\)/);
  });

  test('FileTreeMenuProps declares okignoreBinding as OkignoreBinding | null', () => {
    expect(FILETREE_SRC).toMatch(/okignoreBinding:\s*OkignoreBinding\s*\|\s*null/);
  });

  test('renderContextMenu threads okignoreBinding into FileTreeMenu', () => {
    expect(FILETREE_SRC).toMatch(/okignoreBinding=\{okignoreBinding\}/);
  });

  test('imports the pure pattern-builder helper from file-tree-okignore', () => {
    expect(FILETREE_SRC).toMatch(
      /import\s*\{\s*buildOkignorePatternFromTarget\s*\}\s*from\s*'@\/components\/file-tree-okignore'/,
    );
  });

  test('imports appendPattern + serializeOkignoreDoc + parseOkignoreDoc from settings/okignore-doc', () => {
    expect(FILETREE_SRC).toMatch(/from\s*'@\/components\/settings\/okignore-doc'/);
    expect(FILETREE_SRC).toContain('appendPattern');
    expect(FILETREE_SRC).toContain('serializeOkignoreDoc');
    expect(FILETREE_SRC).toContain('parseOkignoreDoc');
  });

  test('label flips between file and folder copy', () => {
    expect(FILETREE_SRC).toContain("'Hide this file'");
    expect(FILETREE_SRC).toContain("'Hide files in this folder'");
    expect(FILETREE_SRC).toMatch(
      /isFolder\s*\?\s*'Hide files in this folder'\s*:\s*'Hide this file'/,
    );
  });

  test('canHide gates on !isAsset && okignoreBinding !== null', () => {
    expect(FILETREE_SRC).toMatch(/canHide\s*=\s*!isAsset\s*&&\s*okignoreBinding\s*!==\s*null/);
  });

  test('menu item exposes the data-testid and the disabled gate', () => {
    expect(FILETREE_SRC).toContain('data-testid="file-tree-menu-hide"');
    expect(FILETREE_SRC).toMatch(/disabled=\{!canHide\}/);
  });

  test('menu item is wrapped in the !isAsset branch alongside Delete (asset rows omit the entry)', () => {
    const trashIdx = FILETREE_SRC.indexOf('<Trash2');
    expect(trashIdx).toBeGreaterThan(-1);
    const blockOpen = FILETREE_SRC.lastIndexOf('{!isAsset ? (', trashIdx);
    expect(blockOpen).toBeGreaterThan(-1);
    const sliceBetween = FILETREE_SRC.slice(blockOpen, trashIdx);
    expect(sliceBetween).toContain('data-testid="file-tree-menu-hide"');
    expect(sliceBetween).toContain('{hideLabel}');
  });

  test('menu item is NOT marked as destructive (variant="destructive" reserved for Delete)', () => {
    const hideIdx = FILETREE_SRC.indexOf("'Hide files in this folder'");
    expect(hideIdx).toBeGreaterThan(-1);
    const itemOpen = FILETREE_SRC.lastIndexOf('<DropdownMenuItem', hideIdx);
    expect(itemOpen).toBeGreaterThan(-1);
    const itemClose = FILETREE_SRC.indexOf('>', itemOpen);
    expect(itemClose).toBeGreaterThan(itemOpen);
    const itemTag = FILETREE_SRC.slice(itemOpen, itemClose + 1);
    expect(itemTag).not.toContain('variant="destructive"');
  });

  test('onSelect routes through the binding patch path with appendPattern', () => {
    expect(FILETREE_SRC).toMatch(/buildOkignorePatternFromTarget\(target\)/);
    expect(FILETREE_SRC).toMatch(/okignoreBinding\.current\(\)/);
    expect(FILETREE_SRC).toMatch(/appendPattern\(parseOkignoreDoc\(current\),\s*pattern\)/);
    expect(FILETREE_SRC).toMatch(/okignoreBinding\.patch\(next\)/);
  });

  test('onSelect closes the context menu before patching (matches Rename/Delete UX)', () => {
    const hideStart = FILETREE_SRC.indexOf('data-testid="file-tree-menu-hide"');
    expect(hideStart).toBeGreaterThan(-1);
    const itemEnd = FILETREE_SRC.indexOf('</DropdownMenuItem>', hideStart);
    expect(itemEnd).toBeGreaterThan(hideStart);
    const fragment = FILETREE_SRC.slice(hideStart, itemEnd);
    const closeIdx = fragment.indexOf('close()');
    const patchIdx = fragment.indexOf('okignoreBinding.patch(');
    expect(closeIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(closeIdx);
  });

  test('uses the EyeOff lucide icon (visual cue that the file is being hidden, not deleted)', () => {
    expect(FILETREE_SRC).toMatch(/import\s*\{[^}]*EyeOff[^}]*\}\s*from\s*'lucide-react'/);
    const hideStart = FILETREE_SRC.indexOf('data-testid="file-tree-menu-hide"');
    const itemEnd = FILETREE_SRC.indexOf('</DropdownMenuItem>', hideStart);
    const fragment = FILETREE_SRC.slice(hideStart, itemEnd);
    expect(fragment).toContain('<EyeOff');
  });

  test('no confirmation dialog (action is reversible via Settings — FR11)', () => {
    const hideStart = FILETREE_SRC.indexOf('data-testid="file-tree-menu-hide"');
    const itemEnd = FILETREE_SRC.indexOf('</DropdownMenuItem>', hideStart);
    const fragment = FILETREE_SRC.slice(hideStart, itemEnd);
    expect(fragment).not.toMatch(/window\.confirm/);
    expect(fragment).not.toMatch(/<Dialog/);
    expect(fragment).not.toMatch(/<AlertDialog/);
  });
});
