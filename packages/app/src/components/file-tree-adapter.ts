import type { ContextMenuItem, FileTreeDropTarget } from '@pierre/trees';
import { type FileEntry, isAssetEntry } from '@/components/file-tree-utils';

const DEFAULT_TREE_EXTENSION = '.md';
const TREE_EXTENSION_PATTERN = /\.(md|mdx)$/i;

/**
 * Map a docName to the tree path the @pierre/trees model uses. `docExt`
 * carries the actual on-disk extension (`.md` / `.mdx`) — defaults to `.md`
 * for sites that don't have it yet. Two files with the same docName but
 * different extensions are distinct file system entries; passing the wrong
 * extension breaks tree-model mapping.
 */
export function docNameToTreePath(
  docName: string,
  docExt: string = DEFAULT_TREE_EXTENSION,
): string {
  return `${docName}${docExt}`;
}

export function treeFilePathToDocName(treePath: string): string {
  return stripTrailingSlash(treePath).replace(TREE_EXTENSION_PATTERN, '');
}

export function fileEntryToTreePath(entry: FileEntry): string {
  return isAssetEntry(entry) ? entry.path : docNameToTreePath(entry.docName, entry.docExt);
}

/**
 * Detect the markdown extension on a tree path. Returns `.md` or `.mdx`
 * (lowercased) when the path ends with one; undefined when neither matches
 * (e.g., a folder path).
 */
function detectTreePathExtension(treePath: string): string | undefined {
  const match = stripTrailingSlash(treePath).match(TREE_EXTENSION_PATTERN);
  return match ? `.${match[1].toLowerCase()}` : undefined;
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

export function documentsToTreePaths(documents: readonly FileEntry[]): string[] {
  return documents.map(fileEntryToTreePath);
}

export function treePathSignature(paths: readonly string[]): string {
  return [...paths].sort().join('\0');
}

export function documentsTreePathSignature(documents: readonly FileEntry[]): string {
  return treePathSignature(documentsToTreePaths(documents));
}

export function collectTreeFolderPathsFromDocuments(documents: readonly FileEntry[]): string[] {
  const folderPaths = new Set<string>();
  for (const entry of documents) {
    const path = isAssetEntry(entry) ? entry.path : entry.docName;
    const segments = path.split('/').filter(Boolean);
    for (let i = 1; i < segments.length; i++) {
      folderPaths.add(`${segments.slice(0, i).join('/')}/`);
    }
  }
  return [...folderPaths].sort();
}

export function computeTreeAncestorPaths(path: string | null): string[] {
  if (!path) return [];
  const normalized = stripTrailingSlash(path.replace(TREE_EXTENSION_PATTERN, ''));
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
  docExt?: string;
} {
  const isFolder = item.kind === 'directory';
  const appPath = isFolder
    ? treeDirectoryPathToFolderPath(item.path)
    : treeFilePathToDocName(item.path);
  const docExt = isFolder ? undefined : detectTreePathExtension(item.path);
  return {
    kind: isFolder ? 'folder' : 'file',
    name: stripTrailingSlash(getTreeBasename(item.path)).replace(TREE_EXTENSION_PATTERN, ''),
    path: appPath,
    treePath: normalizeTreePathForKind(item.path, isFolder),
    docExt,
  };
}

export function relativePathForTreeItem(item: ContextMenuItem): string {
  return item.kind === 'directory' ? treeDirectoryPathToFolderPath(item.path) : item.path;
}

export function normalizeTreePathForKind(path: string, isFolder: boolean): string {
  if (isFolder) return folderPathToTreeDirectoryPath(path);
  // Already-extended paths pass through (preserves authored .md/.mdx); bare
  // names get the default extension appended for new-file placeholders.
  return TREE_EXTENSION_PATTERN.test(path) ? path : `${path}${DEFAULT_TREE_EXTENSION}`;
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
      const candidate = `${parent}Untitled${suffix}${DEFAULT_TREE_EXTENSION}`;
      if (!existing.has(candidate)) return { addPath: candidate, renamePath: candidate };
      continue;
    }

    const directory = `${parent}New Folder${suffix}/`;
    const indexFile = `${directory}index${DEFAULT_TREE_EXTENSION}`;
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
  return `${treeDirectoryPathToFolderPath(destinationTreePath)}/index${DEFAULT_TREE_EXTENSION}`;
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
