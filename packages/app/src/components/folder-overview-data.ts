export interface FolderOverviewFolderEntry {
  path: string;
  name: string;
}

export interface FolderOverviewDocEntry {
  docName: string;
  name: string;
}

export interface FolderOverviewData {
  title: string;
  childFolders: FolderOverviewFolderEntry[];
  childDocs: FolderOverviewDocEntry[];
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildFolderOverviewData(
  folderPath: string,
  options: {
    pages: ReadonlySet<string>;
    folderPaths: ReadonlySet<string>;
  },
): FolderOverviewData {
  const prefix = `${folderPath}/`;

  const childFolders = sortByName(
    [...options.folderPaths]
      .filter((path) => path.startsWith(prefix))
      .map((path) => ({
        path,
        relativePath: path.slice(prefix.length),
      }))
      .filter((entry) => entry.relativePath.length > 0 && !entry.relativePath.includes('/'))
      .map(({ path, relativePath }) => ({
        path,
        name: relativePath,
      })),
  );

  const childDocs = sortByName(
    [...options.pages]
      .filter((docName) => docName.startsWith(prefix))
      .map((docName) => ({
        docName,
        relativePath: docName.slice(prefix.length),
      }))
      .filter((entry) => entry.relativePath.length > 0 && !entry.relativePath.includes('/'))
      .map(({ docName, relativePath }) => ({
        docName,
        name: relativePath,
      })),
  );

  return {
    title: folderPath.split('/').pop() ?? folderPath,
    childFolders,
    childDocs,
  };
}
