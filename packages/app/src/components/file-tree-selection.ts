import { hashFromAssetPath } from '@/lib/doc-hash';
import { fileEntryToTreePath, treePathToAppPath } from './file-tree-adapter';
import type { FileEntry } from './file-tree-utils';
import { isAssetEntry, isDocumentEntry } from './file-tree-utils';
import type { ResolvedNavigationTarget } from './navigation-targets';

interface FileTreeSelection {
  selectedFilePath: string | null;
  selectedFolderPath: string | null;
  navigationPath: string | null;
}

type FileTreeSelectionAction =
  | { kind: 'none' }
  | { kind: 'asset'; hash: string }
  | { kind: 'document-or-folder'; path: string };

export function resolveFileTreeSelection(
  activeTarget: ResolvedNavigationTarget | null,
  activeDocName: string | null,
): FileTreeSelection {
  if (!activeTarget) {
    return {
      selectedFilePath: activeDocName,
      selectedFolderPath: null,
      navigationPath: activeDocName,
    };
  }

  switch (activeTarget.kind) {
    case 'doc':
      return {
        selectedFilePath: activeTarget.docName,
        selectedFolderPath: null,
        navigationPath: activeTarget.docName,
      };
    case 'folder':
    case 'folder-index':
      return {
        selectedFilePath: null,
        selectedFolderPath: activeTarget.folderPath,
        navigationPath: activeTarget.folderPath,
      };
    case 'missing':
    case 'asset':
      return {
        selectedFilePath: null,
        selectedFolderPath: null,
        navigationPath: null,
      };
  }
}

export function resolveFileTreeSelectionAction(
  selectedPath: string | undefined,
  entries: readonly FileEntry[],
): FileTreeSelectionAction {
  if (!selectedPath) return { kind: 'none' };

  const entry = entries.find((item) => fileEntryToTreePath(item) === selectedPath);
  if (entry && isAssetEntry(entry)) {
    return { kind: 'asset', hash: hashFromAssetPath(entry.path) };
  }

  const appPath = treePathToAppPath(selectedPath);
  if (selectedPath.endsWith('/')) {
    return { kind: 'document-or-folder', path: appPath };
  }

  if (!entries.some((item) => isDocumentEntry(item) && item.docName === appPath)) {
    return { kind: 'none' };
  }

  return { kind: 'document-or-folder', path: appPath };
}
