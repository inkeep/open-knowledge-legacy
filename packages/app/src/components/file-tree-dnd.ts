import type { FileTreeTarget } from '@/components/file-tree-operations';

/** Parent directory path for a docName (`''` = content root). */
export function parentDirOfDocName(docName: string): string {
  const i = docName.lastIndexOf('/');
  return i <= 0 ? '' : docName.slice(0, i);
}

/** Last path segment (folder or file stem). */
export function lastSegment(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/** Joins a folder prefix and base name into a relative content path. */
export function joinContentPath(destinationFolderPath: string, base: string): string {
  if (!destinationFolderPath) return base;
  return `${destinationFolderPath}/${base}`;
}

export function computeMoveDestinationPath(
  source: Pick<FileTreeTarget, 'kind' | 'path'>,
  destinationFolderPath: string,
): string {
  return joinContentPath(destinationFolderPath, lastSegment(source.path));
}

export type MoveValidationReason = 'self' | 'descendant' | 'no_op';

export function validateMoveToFolder(
  source: Pick<FileTreeTarget, 'kind' | 'path'>,
  destinationFolderPath: string,
): { ok: true; destinationPath: string } | { ok: false; reason: MoveValidationReason } {
  if (source.kind === 'folder') {
    if (destinationFolderPath === source.path) {
      return { ok: false, reason: 'self' };
    }
    if (
      destinationFolderPath.length > source.path.length &&
      destinationFolderPath.startsWith(`${source.path}/`)
    ) {
      return { ok: false, reason: 'descendant' };
    }
  }

  const destinationPath = computeMoveDestinationPath(source, destinationFolderPath);
  if (destinationPath === source.path) {
    return { ok: false, reason: 'no_op' };
  }

  return { ok: true, destinationPath };
}
