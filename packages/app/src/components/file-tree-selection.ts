import type { ResolvedNavigationTarget } from './navigation-targets';

interface FileTreeSelection {
  selectedFilePath: string | null;
  selectedFolderPath: string | null;
  navigationPath: string | null;
}

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
      return {
        selectedFilePath: null,
        selectedFolderPath: null,
        navigationPath: null,
      };
  }
}
