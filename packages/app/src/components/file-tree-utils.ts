/** Pure data model and tree-building logic for the file sidebar. */

export interface DocEntry {
  docName: string;
  size: number;
  modified: string;
  isSymlink?: boolean;
  canonicalDocName?: string | null;
  targetPath?: string | null;
}

export interface TreeNode {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  children: TreeNode[];
  isSymlink?: boolean;
  canonicalDocName?: string | null;
  targetPath?: string | null;
}

export function computeAncestors(docName: string | null): string[] {
  if (!docName) return [];
  const segments = docName.split('/').filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i).join('/'));
  }
  return ancestors;
}

export function collectFolderPaths(tree: TreeNode[]): Set<string> {
  const paths = new Set<string>();
  function walk(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.kind === 'folder') {
        paths.add(node.path);
        walk(node.children);
      }
    }
  }
  walk(tree);
  return paths;
}

export function defaultInitialDir(activeDocName: string | null): string {
  if (!activeDocName) return '';
  const slash = activeDocName.lastIndexOf('/');
  return slash > 0 ? activeDocName.slice(0, slash) : '';
}

/**
 * Build a hierarchical tree from a flat list of documents.
 * Each docName is split on '/' to create folder structure.
 * Result is sorted: folders first, then alphabetically within each group.
 */
export function buildTree(documents: DocEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const doc of documents) {
    const segments = doc.docName.split('/').filter(Boolean);
    let children = root;

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join('/');
      const isFile = index === segments.length - 1;
      let node = children.find((child) => child.path === path);

      if (!node) {
        node = {
          name: segment,
          path,
          kind: isFile ? 'file' : 'folder',
          children: [],
          ...(isFile && {
            isSymlink: doc.isSymlink,
            canonicalDocName: doc.canonicalDocName,
            targetPath: doc.targetPath,
          }),
        };
        children.push(node);
      }

      children = node.children;
    }
  }

  function sortNodes(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sortNodes(node.children);
  }
  sortNodes(root);

  return root;
}
