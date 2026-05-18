import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILETREE_SRC = readFileSync(join(__dirname, 'FileTree.tsx'), 'utf8');

function folderBranchSlice(): string {
  const start = FILETREE_SRC.indexOf('{isFolder ? (');
  expect(start).toBeGreaterThan(-1);
  const end = FILETREE_SRC.indexOf(') : (', start);
  expect(end).toBeGreaterThan(start);
  return FILETREE_SRC.slice(start, end);
}

function expectOrder(haystack: string, anchors: readonly string[]): void {
  let cursor = -1;
  for (const anchor of anchors) {
    const at = haystack.indexOf(anchor, cursor + 1);
    expect(at, `expected "${anchor}" after position ${cursor}`).toBeGreaterThan(cursor);
    cursor = at;
  }
}

describe('FileTree — Hide this file/folder menu item (source-level)', () => {
  test('FileTree consumes useConfigContext to read okignoreBinding', () => {
    expect(FILETREE_SRC).toMatch(
      /import\s*\{[^}]*useConfigContext[^}]*\}\s*from\s*'@\/lib\/config-provider'/,
    );
    expect(FILETREE_SRC).toMatch(/const\s*\{\s*okignoreBinding[^}]*\}\s*=\s*useConfigContext\(\)/);
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
    expect(FILETREE_SRC).toContain("'Hide folder'");
    expect(FILETREE_SRC).toMatch(/isFolder\s*\?\s*'Hide folder'\s*:\s*'Hide this file'/);
  });

  test('canHide gates on !isAsset && okignoreBinding !== null', () => {
    expect(FILETREE_SRC).toMatch(/canHide\s*=\s*!isAsset\s*&&\s*okignoreBinding\s*!==\s*null/);
  });

  test('menu item exposes the data-testid and the disabled gate (both surfaces)', () => {
    expect(FILETREE_SRC).toContain('data-testid="file-tree-menu-hide"');
    expect(FILETREE_SRC).toMatch(/disabled=\{!canHide\}/);
  });

  test('file/asset branch keeps Hide behind the !isAsset gate (asset rows omit it)', () => {
    const trashIdx = FILETREE_SRC.lastIndexOf('<Trash2');
    expect(trashIdx).toBeGreaterThan(-1);
    const blockOpen = FILETREE_SRC.lastIndexOf('{!isAsset ? (', trashIdx);
    expect(blockOpen).toBeGreaterThan(-1);
    const sliceBetween = FILETREE_SRC.slice(blockOpen, trashIdx);
    expect(sliceBetween).toContain('data-testid="file-tree-menu-hide"');
    expect(sliceBetween).toContain('{hideLabel}');
  });

  test('folder branch renders Hide + Delete unconditionally (folders are never assets)', () => {
    const folder = folderBranchSlice();
    expect(folder).toContain('data-testid="file-tree-menu-hide"');
    expect(folder).toContain('{deleteLabel}');
    expect(folder).not.toContain('{!isAsset ? (');
  });

  test('Hide menu item is NOT marked destructive (variant="destructive" reserved for Delete)', () => {
    const hideTestidIdx = FILETREE_SRC.indexOf('data-testid="file-tree-menu-hide"');
    expect(hideTestidIdx).toBeGreaterThan(-1);
    const itemOpen = FILETREE_SRC.lastIndexOf('<DropdownMenuItem', hideTestidIdx);
    expect(itemOpen).toBeGreaterThan(-1);
    const itemClose = FILETREE_SRC.indexOf('</DropdownMenuItem>', hideTestidIdx);
    expect(itemClose).toBeGreaterThan(itemOpen);
    const fragment = FILETREE_SRC.slice(itemOpen, itemClose);
    expect(fragment).not.toContain('variant="destructive"');
  });

  test('onSelect routes through the binding patch path with appendPattern', () => {
    expect(FILETREE_SRC).toMatch(/buildOkignorePatternFromTarget\(target\)/);
    expect(FILETREE_SRC).toMatch(/okignoreBinding\.current\(\)/);
    expect(FILETREE_SRC).toMatch(/parseOkignoreDoc\(current\)/);
    expect(FILETREE_SRC).toMatch(/appendPattern\(doc,\s*pattern\)/);
    expect(FILETREE_SRC).toMatch(/okignoreBinding\.patch\(serializeOkignoreDoc\(updated\)\)/);
  });

  test('onSelect short-circuits when appendPattern returns the same doc (dedup no-op)', () => {
    const hideStart = FILETREE_SRC.indexOf('data-testid="file-tree-menu-hide"');
    expect(hideStart).toBeGreaterThan(-1);
    const itemEnd = FILETREE_SRC.indexOf('</DropdownMenuItem>', hideStart);
    expect(itemEnd).toBeGreaterThan(hideStart);
    const fragment = FILETREE_SRC.slice(hideStart, itemEnd);
    const guardIdx = fragment.search(/if\s*\(\s*updated\s*===\s*doc\s*\)\s*return;/);
    const patchIdx = fragment.indexOf('okignoreBinding.patch(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(guardIdx);
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

  test('no confirmation dialog (Hide is reversible via Settings)', () => {
    const hideStart = FILETREE_SRC.indexOf('data-testid="file-tree-menu-hide"');
    const itemEnd = FILETREE_SRC.indexOf('</DropdownMenuItem>', hideStart);
    const fragment = FILETREE_SRC.slice(hideStart, itemEnd);
    expect(fragment).not.toMatch(/window\.confirm/);
    expect(fragment).not.toMatch(/<Dialog/);
    expect(fragment).not.toMatch(/<AlertDialog/);
  });
});

describe('FileTree — folder right-click menu §9 reorder (US-009 source-level)', () => {
  test('threads projectLocalBinding + merged config from useConfigContext into FileTreeMenu', () => {
    expect(FILETREE_SRC).toMatch(
      /const\s*\{\s*okignoreBinding,\s*projectLocalBinding,\s*merged\s*\}\s*=\s*useConfigContext\(\)/,
    );
    expect(FILETREE_SRC).toMatch(/projectLocalBinding=\{projectLocalBinding\}/);
    expect(FILETREE_SRC).toMatch(/mergedConfig=\{merged\}/);
  });

  test('FileTreeMenuProps declares the new config props with core types', () => {
    expect(FILETREE_SRC).toMatch(/projectLocalBinding:\s*ConfigBinding\s*\|\s*null/);
    expect(FILETREE_SRC).toMatch(/mergedConfig:\s*Config\s*\|\s*null/);
    expect(FILETREE_SRC).toMatch(
      /import\s*\{[^}]*type Config,\s*\n?\s*type ConfigBinding[^}]*\}\s*from\s*'@inkeep\/open-knowledge-core'/,
    );
  });

  test('toggle handlers patch the project-local appearance.sidebar leaves + surface validation failures', () => {
    expect(FILETREE_SRC).toMatch(
      /const result = projectLocalBinding\.patch\(\{\s*appearance:\s*\{\s*sidebar:\s*\{\s*showHiddenFiles:\s*checked\s*,?\s*\}\s*,?\s*\}\s*,?\s*\}\)/,
    );
    expect(FILETREE_SRC).toMatch(
      /const result = projectLocalBinding\.patch\(\{\s*appearance:\s*\{\s*sidebar:\s*\{\s*showAllFiles:\s*checked\s*,?\s*\}\s*,?\s*\}\s*,?\s*\}\)/,
    );
    expect(FILETREE_SRC).toMatch(/if \(!result\.ok\)/);
    expect(FILETREE_SRC).toMatch(/humanFormat\(result\.error\)/);
    expect(FILETREE_SRC).toMatch(/if\s*\(projectLocalBinding\s*===\s*null\)\s*return;/);
  });

  test('check-state reads from mergedConfig.appearance.sidebar', () => {
    expect(FILETREE_SRC).toMatch(
      /showHiddenFiles\s*=\s*mergedConfig\?\.appearance\?\.sidebar\?\.showHiddenFiles\s*\?\?\s*false/,
    );
    expect(FILETREE_SRC).toMatch(
      /showAllFiles\s*=\s*mergedConfig\?\.appearance\?\.sidebar\?\.showAllFiles\s*\?\?\s*false/,
    );
  });

  test('folder branch renders the 14-item / 5-section order from spec §9', () => {
    expectOrder(folderBranchSlice(), [
      'New File',
      'New from template',
      'New Folder',
      '<DropdownMenuSeparator />',
      '<RevealInFileManagerMenuItem',
      '<OpenInAgentContextSubmenu',
      '<OpenInTerminalMenuItem',
      'Copy Path',
      '<DropdownMenuSeparator />',
      'data-testid="file-tree-menu-show-hidden-files"',
      'data-testid="file-tree-menu-show-all-files"',
      'Expand All',
      'Collapse All',
      'Rename',
      'data-testid="file-tree-menu-hide"',
      '{deleteLabel}',
    ]);
  });

  test('folder Open with AI hides the claude.ai web fallback (no folder= companion param)', () => {
    const folder = folderBranchSlice();
    const submenuIdx = folder.indexOf('<OpenInAgentContextSubmenu');
    expect(submenuIdx).toBeGreaterThan(-1);
    const submenuEnd = folder.indexOf('/>', submenuIdx);
    expect(submenuEnd).toBeGreaterThan(submenuIdx);
    const submenu = folder.slice(submenuIdx, submenuEnd);
    expect(submenu).toContain('webFallbackVisible={false}');
  });

  test('file/asset Open with AI explicitly opts into the claude.ai web fallback', () => {
    const start = FILETREE_SRC.indexOf(') : (');
    const fileBranch = FILETREE_SRC.slice(start);
    const submenuIdx = fileBranch.indexOf('<OpenInAgentContextSubmenu');
    expect(submenuIdx).toBeGreaterThan(-1);
    const submenuEnd = fileBranch.indexOf('/>', submenuIdx);
    const submenu = fileBranch.slice(submenuIdx, submenuEnd);
    expect(submenu).toContain('webFallbackVisible={true}');
  });

  test('OpenInTerminalMenuItem is Electron-only and folder-targeted', () => {
    expect(FILETREE_SRC).toMatch(/function OpenInTerminalMenuItem\(/);
    const fnStart = FILETREE_SRC.indexOf('function OpenInTerminalMenuItem(');
    const fnSlice = FILETREE_SRC.slice(fnStart, FILETREE_SRC.indexOf('\n}\n', fnStart));
    expect(fnSlice).toMatch(/if\s*\(!bridge\)\s*return null;/);
    expect(fnSlice).toContain('dispatchOpenInTerminal(bridge, dirAbsPath)');
    const folder = folderBranchSlice();
    expect(folder).toContain(
      '<OpenInTerminalMenuItem dirAbsPath={folderAbsPath} onClose={close} />',
    );
    expect(FILETREE_SRC).toMatch(/const folderAbsPath\s*=\s*\n?\s*isFolder && workspace/);
  });

  test('Show toggles are DropdownMenuCheckboxItem bound to the project-local binding', () => {
    expect(FILETREE_SRC).toMatch(
      /import\s*\{[^}]*DropdownMenuCheckboxItem[^}]*\}\s*from\s*'@\/components\/ui\/dropdown-menu'/,
    );
    const folder = folderBranchSlice();
    const dot = folder.indexOf('data-testid="file-tree-menu-show-hidden-files"');
    const dotItemOpen = folder.lastIndexOf('<DropdownMenuCheckboxItem', dot);
    expect(dotItemOpen).toBeGreaterThan(-1);
    const dotItem = folder.slice(dotItemOpen, folder.indexOf('</DropdownMenuCheckboxItem>', dot));
    expect(dotItem).toContain('checked={showHiddenFiles}');
    expect(dotItem).toContain('onCheckedChange={handleShowHiddenFilesToggle}');
    expect(dotItem).toContain('disabled={!canToggleVisibility}');
  });

  test("Expand/Collapse stay subtree-scoped (today's logic preserved, not tree-wide)", () => {
    const folder = folderBranchSlice();
    expect(folder).toContain('onExpandSubtree(item.path)');
    expect(folder).toContain('onCollapseSubtree(item.path)');
    expect(folder).toMatch(/showSubtreeExpandAll\s*\?\s*\(/);
    expect(folder).toMatch(/showSubtreeCollapseAll\s*\?\s*\(/);
  });

  test('Rename uses the inline-rename close (closeForInlineSurface, not close)', () => {
    const folder = folderBranchSlice();
    const renameIdx = folder.indexOf('model.startRenaming(item.path)');
    expect(renameIdx).toBeGreaterThan(-1);
    const onSelectOpen = folder.lastIndexOf('onSelect={', renameIdx);
    const handler = folder.slice(onSelectOpen, renameIdx);
    expect(handler).toContain('closeForInlineSurface()');
  });

  test('folder toast says "Hidden folder" while file toast stays "Hidden"', () => {
    const folder = folderBranchSlice();
    expect(folder).toMatch(/toast\.success\(`Hidden folder/);
    const fileBranch = FILETREE_SRC.slice(FILETREE_SRC.indexOf(') : ('));
    expect(fileBranch).toMatch(/toast\.success\(`Hidden /);
    expect(fileBranch).not.toMatch(/toast\.success\(`Hidden folder/);
  });
});

function fileBranchSlice(): string {
  const start = FILETREE_SRC.indexOf(') : (');
  expect(start).toBeGreaterThan(-1);
  const end = FILETREE_SRC.indexOf('</DropdownMenuContent>', start);
  expect(end).toBeGreaterThan(start);
  return FILETREE_SRC.slice(start, end);
}

describe('FileTree — file right-click menu §9 reorder (US-010 source-level)', () => {
  test('parentDirAbsPath is computed for non-folder rows (folder rows use folderAbsPath)', () => {
    expect(FILETREE_SRC).toMatch(/const parentDirAbsPath:\s*string\s*\|\s*null\s*=\s*\(\(\)\s*=>/);
    expect(FILETREE_SRC).toMatch(/if\s*\(!workspace\s*\|\|\s*isFolder\)\s*return null;/);
    expect(FILETREE_SRC).toMatch(/if\s*\(lastSep\s*===\s*-1\)\s*return workspace\.contentDir;/);
  });

  test('file/asset branch renders the §9 act-section order (Reveal / SendToAI / Terminal / CopyPath)', () => {
    expectOrder(fileBranchSlice(), [
      '<RevealInFileManagerMenuItem',
      '<OpenInAgentContextSubmenu',
      '<OpenInTerminalMenuItem',
      'Copy Path',
    ]);
  });

  test('file branch renders the §9 destructive-section order behind the !isAsset gate', () => {
    const branch = fileBranchSlice();
    const gateOpen = branch.indexOf('{!isAsset ? (');
    expect(gateOpen).toBeGreaterThan(-1);
    const gateClose = branch.indexOf(') : null}', gateOpen);
    expect(gateClose).toBeGreaterThan(gateOpen);
    expectOrder(branch.slice(gateOpen, gateClose), [
      '<DropdownMenuSeparator />',
      'Rename',
      'data-testid="file-tree-menu-hide"',
      '{deleteLabel}',
    ]);
  });

  test('file/asset branch routes Open in Terminal through parentDirAbsPath (parent dir, not the row itself)', () => {
    expect(fileBranchSlice()).toContain(
      '<OpenInTerminalMenuItem dirAbsPath={parentDirAbsPath} onClose={close} />',
    );
  });

  test('asset rows suppress Open with AI / Rename / Hide / Delete but keep Reveal / Terminal / Copy Path', () => {
    const branch = fileBranchSlice();
    expect(branch).toMatch(/\{!isAsset && \(\s*<OpenInAgentContextSubmenu/);
    const revealIdx = branch.indexOf('<RevealInFileManagerMenuItem');
    const firstGateAfterReveal = branch.indexOf('{!isAsset', revealIdx);
    expect(firstGateAfterReveal).toBeGreaterThan(revealIdx);
    const terminalIdx = branch.indexOf('<OpenInTerminalMenuItem');
    const copyPathIdx = branch.indexOf('<DropdownMenuSub>');
    expect(terminalIdx).toBeGreaterThan(revealIdx);
    expect(copyPathIdx).toBeGreaterThan(terminalIdx);
  });

  test('file branch Open with AI is the ONLY act-section item gated on !isAsset', () => {
    const branch = fileBranchSlice();
    const firstGate = branch.indexOf('{!isAsset');
    const submenuOpen = branch.indexOf('<OpenInAgentContextSubmenu');
    expect(submenuOpen).toBeGreaterThan(firstGate);
    expect(submenuOpen - firstGate).toBeLessThan(60);
  });

  test('Show Hidden Files / Show all files toggles do NOT appear on file/asset rows', () => {
    const branch = fileBranchSlice();
    expect(branch).not.toContain('data-testid="file-tree-menu-show-hidden-files"');
    expect(branch).not.toContain('data-testid="file-tree-menu-show-all-files"');
  });

  test('Expand All / Collapse All do NOT appear on file/asset rows (leaf rows have no tree state)', () => {
    const branch = fileBranchSlice();
    expect(branch).not.toContain('Expand All');
    expect(branch).not.toContain('Collapse All');
  });

  test('file/asset Rename + Hide + Delete are wrapped in a single !isAsset block (one gate, one slice)', () => {
    const branch = fileBranchSlice();
    const matches = branch.match(/\{!isAsset \? \(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('FileTree — Show Hidden Files toggle wiring (US-012 source-level)', () => {
  test('FileTree reads showHiddenFiles from merged config with false default', () => {
    expect(FILETREE_SRC).toMatch(
      /const\s+showHiddenFiles\s*=\s*merged\?\.appearance\?\.sidebar\?\.showHiddenFiles\s*\?\?\s*false/,
    );
  });

  test('FileTree declares showHiddenFilesRef as a useRef<boolean> initialized to false', () => {
    expect(FILETREE_SRC).toMatch(/const\s+showHiddenFilesRef\s*=\s*useRef<boolean>\(false\)/);
  });

  test('showHiddenFilesRef.current is synced inside the bulk useLayoutEffect', () => {
    expect(FILETREE_SRC).toMatch(/showHiddenFilesRef\.current\s*=\s*showHiddenFiles;/);
  });

  test('docs-refresh closure filters via showHiddenFilesRef.current OR showAllFilesRef.current (US-012 + US-013 combined)', () => {
    expect(FILETREE_SRC).toMatch(
      /const\s+bypassClientDotDrop\s*=\s*showHiddenFilesRef\.current\s*\|\|\s*showAll/,
    );
    expect(FILETREE_SRC).toMatch(
      /filterVisibleEntries\(\s*success\.data\.documents\s+as\s+unknown\s+as\s+FileEntry\[\],\s*bypassClientDotDrop,?\s*\)/,
    );
  });

  test('refreshDocsScheduleRef is hoisted to allow re-fetch from sibling effects', () => {
    expect(FILETREE_SRC).toMatch(
      /const\s+refreshDocsScheduleRef\s*=\s*useRef<\(\(\)\s*=>\s*void\)\s*\|\s*null>\(null\)/,
    );
    expect(FILETREE_SRC).toMatch(
      /refreshDocsScheduleRef\.current\s*=\s*\(\)\s*=>\s*scheduler\.request\(\)/,
    );
    expect(FILETREE_SRC).toMatch(/refreshDocsScheduleRef\.current\s*=\s*null/);
  });

  test('separate useEffect triggers re-fetch on showHiddenFiles flip with first-render skip', () => {
    expect(FILETREE_SRC).toMatch(/const\s+isFirstShowHiddenFilesEffectRunRef\s*=\s*useRef\(true\)/);
    expect(FILETREE_SRC).toMatch(
      /if\s*\(isFirstShowHiddenFilesEffectRunRef\.current\)\s*\{\s*isFirstShowHiddenFilesEffectRunRef\.current\s*=\s*false;\s*return;\s*\}\s*refreshDocsScheduleRef\.current\?\.\(\);\s*\},\s*\[showHiddenFiles\]\)/,
    );
  });

  test('does NOT add showHiddenFiles to the docs-refresh useEffect dep array (avoids listener churn)', () => {
    const docsEffectStart = FILETREE_SRC.indexOf('async function refreshDocs()');
    expect(docsEffectStart).toBeGreaterThan(-1);
    const closing = FILETREE_SRC.indexOf('}, []);', docsEffectStart);
    expect(closing).toBeGreaterThan(docsEffectStart);
    expect(FILETREE_SRC.slice(closing, closing + 7)).toBe('}, []);');
  });
});

describe('FileTree — Show all files toggle wiring (US-013 source-level)', () => {
  test('FileTree reads showAllFiles from merged config with false default', () => {
    expect(FILETREE_SRC).toMatch(
      /const\s+showAllFiles\s*=\s*merged\?\.appearance\?\.sidebar\?\.showAllFiles\s*\?\?\s*false/,
    );
  });

  test('FileTree declares showAllFilesRef as a useRef<boolean> initialized to false', () => {
    expect(FILETREE_SRC).toMatch(/const\s+showAllFilesRef\s*=\s*useRef<boolean>\(false\)/);
  });

  test('showAllFilesRef.current is synced inside the bulk useLayoutEffect', () => {
    expect(FILETREE_SRC).toMatch(/showAllFilesRef\.current\s*=\s*showAllFiles;/);
  });

  test('docs-refresh closure picks the URL based on showAllFilesRef.current', () => {
    expect(FILETREE_SRC).toMatch(/const\s+showAll\s*=\s*showAllFilesRef\.current/);
    expect(FILETREE_SRC).toMatch(
      /const\s+url\s*=\s*showAll\s*\?\s*['"]\/api\/documents\?showAll=true['"]\s*:\s*['"]\/api\/documents['"]/,
    );
    expect(FILETREE_SRC).toMatch(/const\s+res\s*=\s*await\s+fetch\(url\)/);
  });

  test('separate useEffect triggers re-fetch on showAllFiles flip with first-render skip', () => {
    expect(FILETREE_SRC).toMatch(/const\s+isFirstShowAllFilesEffectRunRef\s*=\s*useRef\(true\)/);
    expect(FILETREE_SRC).toMatch(
      /if\s*\(isFirstShowAllFilesEffectRunRef\.current\)\s*\{\s*isFirstShowAllFilesEffectRunRef\.current\s*=\s*false;\s*return;\s*\}\s*refreshDocsScheduleRef\.current\?\.\(\);\s*\},\s*\[showAllFiles\]\)/,
    );
  });

  test('does NOT add showAllFiles to the docs-refresh useEffect dep array', () => {
    const docsEffectStart = FILETREE_SRC.indexOf('async function refreshDocs()');
    expect(docsEffectStart).toBeGreaterThan(-1);
    const closing = FILETREE_SRC.indexOf('}, []);', docsEffectStart);
    expect(closing).toBeGreaterThan(docsEffectStart);
    expect(FILETREE_SRC.slice(closing, closing + 7)).toBe('}, []);');
  });
});

describe('FileTree — Option B 2-step Trash flow (US-018 source-level)', () => {
  test('imports TrashCleanupSuccessSchema for Step 2 response parsing', () => {
    expect(FILETREE_SRC).toContain('TrashCleanupSuccessSchema');
  });

  test('imports the VSCode-verbatim copy helper + TrashFailureModal', () => {
    expect(FILETREE_SRC).toMatch(
      /import\s*\{\s*selectTrashConfirmCopy[\s,]+trashTargetDisplayName\s*\}\s*from\s*'@\/components\/file-tree-trash-copy'/,
    );
    expect(FILETREE_SRC).toMatch(/TrashFailureModal/);
    expect(FILETREE_SRC).toMatch(/type\s+TrashFailedTarget/);
  });

  test('TrashFailureRequest interface declares failed + originalTargets', () => {
    expect(FILETREE_SRC).toMatch(
      /interface\s+TrashFailureRequest\s*\{[\s\S]*?failed:\s*TrashFailedTarget\[\]/,
    );
    expect(FILETREE_SRC).toMatch(
      /interface\s+TrashFailureRequest\s*\{[\s\S]*?originalTargets:\s*FileTreeTarget\[\]/,
    );
  });

  test('trashFailure state declared with TrashFailureRequest | null', () => {
    expect(FILETREE_SRC).toMatch(
      /const\s+\[trashFailure,\s*setTrashFailure\]\s*=\s*useState<TrashFailureRequest\s*\|\s*null>\(null\)/,
    );
  });

  test('handleDeleteTargets branches on Electron bridge + workspace before trashing', () => {
    const fn = FILETREE_SRC.indexOf('async function handleDeleteTargets(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 4000);
    expect(slice).toMatch(/if\s*\(bridge\s*&&\s*workspace\)\s*\{/);
    expect(slice).toContain('trashTargetsViaShell');
    expect(slice).toContain('postTrashCleanup');
  });

  test('trashTargetsViaShell awaits bridge.shell.trashItem per target with absolute path', () => {
    const fn = FILETREE_SRC.indexOf('async function trashTargetsViaShell(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 1600);
    expect(slice).toContain('joinWorkspacePath');
    expect(slice).toContain('bridge.shell.trashItem(absPath)');
    expect(slice).toContain('failed.push');
    expect(slice).toContain('trashed.push');
  });

  test('postTrashCleanup POSTs /api/trash/cleanup for each trashed target', () => {
    const fn = FILETREE_SRC.indexOf('async function postTrashCleanup(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 2400);
    expect(slice).toContain("'/api/trash/cleanup'");
    expect(slice).toContain('TrashCleanupSuccessSchema');
  });

  test('postTrashCleanup loop wraps fetch+parse in per-iteration try/catch so thrown fetch routes to failedCleanups', () => {
    const fn = FILETREE_SRC.indexOf('async function postTrashCleanup(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 3600);
    expect(slice).toMatch(/for\s*\(const\s+target\s+of\s+trashed\)\s*\{[\s\S]*?try\s*\{/);
    expect(slice).toMatch(/\}\s*catch\s*\(err\)\s*\{[\s\S]*?failedCleanups\.push/);
    expect(slice).toContain('trash-cleanup threw');
  });

  test('Option B ordering: trash IPC FIRST, then trash-cleanup, then aftermath', () => {
    const fn = FILETREE_SRC.indexOf('async function handleDeleteTargets(');
    const slice = FILETREE_SRC.slice(fn, fn + 4000);
    const trashIdx = slice.indexOf('trashTargetsViaShell');
    const cleanupIdx = slice.indexOf('postTrashCleanup(trashed)');
    const aftermathIdx = slice.indexOf('applyDeleteAftermath');
    expect(trashIdx).toBeGreaterThan(-1);
    expect(cleanupIdx).toBeGreaterThan(trashIdx);
    expect(aftermathIdx).toBeGreaterThan(cleanupIdx);
  });

  test('Step 1 partial failure: setTrashFailure called with failed + originalTargets', () => {
    const fn = FILETREE_SRC.indexOf('async function handleDeleteTargets(');
    const slice = FILETREE_SRC.slice(fn, fn + 4000);
    expect(slice).toMatch(
      /setTrashFailure\(\{\s*failed,\s*originalTargets:\s*\[\.\.\.targets\]\s*\}\)/,
    );
  });

  test('web mode (no bridge OR no workspace) falls back to hardDeleteTargets', () => {
    const fn = FILETREE_SRC.indexOf('async function handleDeleteTargets(');
    const slice = FILETREE_SRC.slice(fn, fn + 4000);
    expect(slice).toMatch(/}\s*else\s*\{[\s\S]*?await\s+hardDeleteTargets\(targets\)/);
  });

  test("hardDeleteTargets posts /api/delete-path (today's endpoint preserved)", () => {
    const fn = FILETREE_SRC.indexOf('async function hardDeleteTargets(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 2000);
    expect(slice).toContain("'/api/delete-path'");
    expect(slice).toContain('DeletePathSuccessSchema');
  });

  test('Trash Delete Permanently fallback re-uses hardDeleteTargets against failed subset', () => {
    const fn = FILETREE_SRC.indexOf('async function handleTrashFailureDeletePermanently(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 1600);
    expect(slice).toContain('originalTargets.filter');
    expect(slice).toContain('hardDeleteTargets');
    expect(slice).toContain('setTrashFailure(null)');
  });

  test('handleTrashFailureDeletePermanently catch mirrors handleDeleteTargets catch (no "Network error" misattribution)', () => {
    const fn = FILETREE_SRC.indexOf('async function handleTrashFailureDeletePermanently(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 1600);
    expect(slice).not.toContain('Network error');
    expect(slice).toContain("toast.error('Could not complete delete'");
    expect(slice).toMatch(/err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*String\(err\)/);
  });

  test('Retry filters originalTargets to FAILED subset via compound kind:path key', () => {
    const fn = FILETREE_SRC.indexOf('async function handleTrashFailureRetry(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 800);
    expect(slice).toContain('setTrashFailure(null)');
    expect(slice).toContain('handleDeleteTargets(originals)');
    expect(slice).toMatch(
      /new Set\(trashFailure\.failed\.map\(\(f\) => `\$\{f\.kind\}:\$\{f\.path\}`\)\)/,
    );
    expect(slice).toMatch(
      /originalTargets\.filter\(\(t\)\s*=>\s*failedSet\.has\(`\$\{t\.kind\}:\$\{t\.path\}`\)\s*,?\s*\)/,
    );
  });

  test('DeleteConfirmationDialog gates copy variant on Electron bridge presence', () => {
    expect(FILETREE_SRC).toMatch(
      /const\s+variant:\s*'electron'\s*\|\s*'web'\s*=\s*[\s\S]*?window\.okDesktop\s*!=\s*null\s*\?\s*'electron'\s*:\s*'web'/,
    );
    expect(FILETREE_SRC).toMatch(/selectTrashConfirmCopy\(variant,\s*deleteRequest\.targets\)/);
  });

  test('multi-target list rendered with trashTargetDisplayName + stable React key', () => {
    expect(FILETREE_SRC).toMatch(/copy\.listedTargets\.map/);
    expect(FILETREE_SRC).toMatch(/key=\{`\$\{target\.kind\}:\$\{target\.path\}`\}/);
    expect(FILETREE_SRC).toContain('trashTargetDisplayName(target)');
  });

  test('TrashFailureModal mounts when trashFailure is set; cancel clears state', () => {
    const dialogStart = FILETREE_SRC.indexOf('open={!!trashFailure}');
    expect(dialogStart).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(dialogStart, dialogStart + 1200);
    expect(slice).toContain('<TrashFailureModal');
    expect(slice).toContain('failedTargets={trashFailure.failed}');
    expect(slice).toContain('onDeletePermanently={handleTrashFailureDeletePermanently}');
    expect(slice).toContain('onRetry={handleTrashFailureRetry}');
    expect(slice).toMatch(/onCancel=\{\(\)\s*=>\s*setTrashFailure\(null\)\}/);
  });

  test('applyDeleteAftermath is the single seam for tab close + IDB + tree state mirror', () => {
    const fn = FILETREE_SRC.indexOf('async function applyDeleteAftermath(');
    expect(fn).toBeGreaterThan(-1);
    const slice = FILETREE_SRC.slice(fn, fn + 3000);
    expect(slice).toContain('collectTabsToCloseForDelete');
    expect(slice).toContain('closeTabs');
    expect(slice).toContain('closeAndClearForRename');
    expect(slice).toContain('model.remove');
    expect(slice).toContain('setDocuments');
    expect(slice).toContain('emitDocumentsChanged');
  });
});
