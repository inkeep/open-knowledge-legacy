export interface FolderOverviewFolderEntry {
  path: string;
  name: string;
  title: string;
}

export interface FolderOverviewDocEntry {
  docName: string;
  name: string;
  title: string;
}

export interface FolderOverviewData {
  title: string;
  childFolders: FolderOverviewFolderEntry[];
  childDocs: FolderOverviewDocEntry[];
}

function sortByTitle<T extends { title: string; name: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.title.localeCompare(b.title) || a.name.localeCompare(b.name));
}

function getLegacyFolderNoteDocName(folderPath: string): string | null {
  const leaf = folderPath.split('/').pop();
  return leaf ? `${folderPath}/${leaf}` : null;
}

function getFolderTitle(folderPath: string, pageTitles: ReadonlyMap<string, string>): string {
  const canonicalTitle = pageTitles.get(`${folderPath}/index`);
  if (canonicalTitle) {
    return canonicalTitle;
  }

  const legacyFolderNoteDocName = getLegacyFolderNoteDocName(folderPath);
  if (legacyFolderNoteDocName) {
    const legacyTitle = pageTitles.get(legacyFolderNoteDocName);
    if (legacyTitle) {
      return legacyTitle;
    }
  }

  return folderPath.split('/').pop() ?? folderPath;
}

export function buildFolderOverviewData(
  folderPath: string,
  options: {
    pages: ReadonlySet<string>;
    pageTitles: ReadonlyMap<string, string>;
    folderPaths: ReadonlySet<string>;
  },
): FolderOverviewData {
  const prefix = `${folderPath}/`;

  const childFolders = sortByTitle(
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
        title: getFolderTitle(path, options.pageTitles),
      })),
  );

  const childDocs = sortByTitle(
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
        title: options.pageTitles.get(docName) ?? relativePath,
      })),
  );

  return {
    title: getFolderTitle(folderPath, options.pageTitles),
    childFolders,
    childDocs,
  };
}
