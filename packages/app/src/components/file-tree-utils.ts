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
