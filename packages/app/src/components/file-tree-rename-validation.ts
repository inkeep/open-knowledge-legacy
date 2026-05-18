type RenameDestinationValidation = { kind: 'allow'; destinationPath: string } | { kind: 'block' };

export function getFileExtension(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  const basename = lastSlash < 0 ? path : path.slice(lastSlash + 1);
  const lastDot = basename.lastIndexOf('.');
  if (lastDot <= 0) return '';
  return basename.slice(lastDot);
}

export function replaceFileExtension(path: string, newExt: string): string {
  const lastSlash = path.lastIndexOf('/');
  const dir = lastSlash < 0 ? '' : path.slice(0, lastSlash + 1);
  const basename = lastSlash < 0 ? path : path.slice(lastSlash + 1);
  const lastDot = basename.lastIndexOf('.');
  const basenameNoExt = lastDot <= 0 ? basename : basename.slice(0, lastDot);
  return `${dir}${basenameNoExt}${newExt}`;
}

export function validateAndCoerceRenameDestination(
  sourcePath: string,
  destinationPath: string,
  isFolder: boolean,
): RenameDestinationValidation {
  if (isFolder) return { kind: 'allow', destinationPath };
  const sourceExt = getFileExtension(sourcePath);
  if (sourceExt === '') return { kind: 'allow', destinationPath };
  const destExt = getFileExtension(destinationPath);
  if (destExt && destExt.toLowerCase() !== sourceExt.toLowerCase()) {
    return { kind: 'block' };
  }
  return {
    kind: 'allow',
    destinationPath: replaceFileExtension(destinationPath, sourceExt),
  };
}
