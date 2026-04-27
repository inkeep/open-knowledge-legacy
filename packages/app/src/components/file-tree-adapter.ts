import type { ContextMenuItem, FileTreeDropTarget } from '@pierre/trees';
import type { DocEntry } from '@/components/file-tree-utils';

const TREE_MARKDOWN_EXTENSION = '.md';

export function docNameToTreePath(docName: string): string {
  return `${docName}${TREE_MARKDOWN_EXTENSION}`;
}

export function treeFilePathToDocName(treePath: string): string {
  return stripTrailingSlash(treePath).replace(/\.md$/i, '');
}

export function treeDirectoryPathToFolderPath(treePath: string): string {
  return stripTrailingSlash(treePath);
}

export function folderPathToTreeDirectoryPath(folderPath: string): string {
  const trimmed = stripTrailingSlash(folderPath.trim());
  return trimmed ? `${trimmed}/` : '';
}

export function treePathToAppPath(treePath: string): string {
  return treePath.endsWith('/')
    ? treeDirectoryPathToFolderPath(treePath)
    : treeFilePathToDocName(treePath);
}

export function documentsToTreePaths(documents: readonly DocEntry[]): string[] {
  return documents.map((doc) => docNameToTreePath(doc.docName));
}

export function treePathSignature(paths: readonly string[]): string {
  return [...paths].sort().join('\0');
}

export function documentsTreePathSignature(documents: readonly DocEntry[]): string {
  return treePathSignature(documentsToTreePaths(documents));
}

export function collectTreeFolderPathsFromDocuments(documents: readonly DocEntry[]): string[] {
  const folderPaths = new Set<string>();
  for (const doc of documents) {
    const segments = doc.docName.split('/').filter(Boolean);
    for (let i = 1; i < segments.length; i++) {
      folderPaths.add(`${segments.slice(0, i).join('/')}/`);
    }
  }
  return [...folderPaths].sort();
}

export function computeTreeAncestorPaths(path: string | null): string[] {
  if (!path) return [];
  const normalized = stripTrailingSlash(path.replace(/\.md$/i, ''));
  const segments = normalized.split('/').filter(Boolean);
  const ancestors: string[] = [];
  const folderSegmentCount = path.endsWith('/') ? segments.length : segments.length - 1;
  for (let i = 1; i <= folderSegmentCount; i++) {
    ancestors.push(`${segments.slice(0, i).join('/')}/`);
  }
  return ancestors;
}

export function treeItemToTarget(item: ContextMenuItem): {
  kind: 'file' | 'folder';
  name: string;
  path: string;
  treePath: string;
} {
  const isFolder = item.kind === 'directory';
  const appPath = isFolder
    ? treeDirectoryPathToFolderPath(item.path)
    : treeFilePathToDocName(item.path);
  return {
    kind: isFolder ? 'folder' : 'file',
    name: stripTrailingSlash(getTreeBasename(item.path)).replace(/\.md$/i, ''),
    path: appPath,
    treePath: normalizeTreePathForKind(item.path, isFolder),
  };
}

export function relativePathForTreeItem(item: ContextMenuItem): string {
  return item.kind === 'directory' ? treeDirectoryPathToFolderPath(item.path) : item.path;
}

export function normalizeTreePathForKind(path: string, isFolder: boolean): string {
  if (isFolder) return folderPathToTreeDirectoryPath(path);
  return path.endsWith(TREE_MARKDOWN_EXTENSION) ? path : `${path}${TREE_MARKDOWN_EXTENSION}`;
}

export function createTreePlaceholder(
  kind: 'file' | 'folder',
  parentFolderPath: string,
  existingTreePaths: readonly string[],
): { addPath: string; renamePath: string } {
  const parent = folderPathToTreeDirectoryPath(parentFolderPath);
  const existing = new Set(existingTreePaths);
  for (let i = 0; i < 100; i++) {
    const suffix = i === 0 ? '' : ` ${i + 1}`;
    if (kind === 'file') {
      const candidate = `${parent}Untitled${suffix}${TREE_MARKDOWN_EXTENSION}`;
      if (!existing.has(candidate)) return { addPath: candidate, renamePath: candidate };
      continue;
    }

    const directory = `${parent}New Folder${suffix}/`;
    const indexFile = `${directory}index${TREE_MARKDOWN_EXTENSION}`;
    if (!existing.has(indexFile) && !existing.has(directory)) {
      return { addPath: indexFile, renamePath: directory };
    }
  }

  throw new Error('Could not allocate a unique tree placeholder');
}

export function createPagePathFromTreeDestination(
  kind: 'file' | 'folder',
  destinationTreePath: string,
): string {
  if (kind === 'file') return normalizeTreePathForKind(destinationTreePath, false);
  return `${treeDirectoryPathToFolderPath(destinationTreePath)}/index${TREE_MARKDOWN_EXTENSION}`;
}

export function computeTreeDropDestinationPath(
  sourcePath: string,
  target: FileTreeDropTarget,
): string {
  if (target.kind === 'root' || target.directoryPath == null) return getTreeBasename(sourcePath);
  return `${target.directoryPath}${getTreeBasename(sourcePath)}`;
}

function getTreeBasename(path: string): string {
  const stripped = stripTrailingSlash(path);
  const slash = stripped.lastIndexOf('/');
  const basename = slash === -1 ? stripped : stripped.slice(slash + 1);
  return path.endsWith('/') ? `${basename}/` : basename;
}

function stripTrailingSlash(path: string): string {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}
