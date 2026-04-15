import { ChevronRight, File, Folder, FolderOpen, Link2, Pencil, Trash2 } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import {
  applyDeleteToDocuments,
  applyRenameToDocuments,
  buildRenamedNodePath,
  type FileTreeTarget,
  isValidNodeName,
  normalizeRenameValue,
  type RenamedDocMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import {
  buildTree,
  collectFolderPaths,
  computeAncestors,
  type DocEntry,
  type TreeNode,
} from '@/components/file-tree-utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';
import { cn } from '@/lib/utils';

interface RenamePathResponse {
  ok: boolean;
  renamed?: RenamedDocMapping[];
  rewrittenDocs?: Array<{ docName: string; rewrites: number }>;
  error?: string;
}

interface DeletePathResponse {
  ok: boolean;
  deletedDocNames?: string[];
  error?: string;
}

const FileTreeNode: FC<{
  node: TreeNode;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  activeRowRef: (node: HTMLDivElement | null) => void;
  editingPath: string | null;
  editingValue: string;
  busyPath: string | null;
  onSelect: (docName: string) => void;
  onStartRename: (target: FileTreeTarget) => void;
  onEditingValueChange: (value: string) => void;
  onCommitRename: (target: FileTreeTarget) => void;
  onCancelRename: () => void;
  onDelete: (target: FileTreeTarget) => void;
  nested?: boolean;
}> = ({
  node,
  nested = false,
  selectedPath,
  expandedPaths,
  onToggle,
  activeRowRef,
  editingPath,
  editingValue,
  busyPath,
  onSelect,
  onStartRename,
  onEditingValueChange,
  onCommitRename,
  onCancelRename,
  onDelete,
}) => {
  const isFile = node.kind === 'file';
  const expanded = !isFile && expandedPaths.has(node.path);

  const isActive = isFile && node.path === selectedPath;
  const isEditing = editingPath === node.path;
  const isBusy = busyPath === node.path;
  const anyActionBusy = busyPath !== null;
  const IconToUse = isFile ? File : !expanded ? Folder : FolderOpen;
  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;
  const target: FileTreeTarget = { kind: node.kind, path: node.path, name: node.name };

  const showSymlink = isFile && node.isSymlink;

  const fileContent = (
    <>
      <IconToUse className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
      <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground/70">
        {node.name}
        {isFile && '.md'}
      </span>
      {showSymlink && <Link2 className="size-3.5 shrink-0 text-muted-foreground/50" />}
    </>
  );

  const displayContent = showSymlink ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 flex-1 items-center gap-2">{fileContent}</span>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex flex-col gap-0.5">
        <span>Symlink → {node.targetPath}</span>
        <span className="text-muted">Opens the same document as {node.canonicalDocName}</span>
      </TooltipContent>
    </Tooltip>
  ) : (
    fileContent
  );

  const editingContent = (
    <div
      className={cn(
        'flex h-8 items-center gap-2 rounded-md px-2',
        !nested && 'ml-2',
        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
    >
      <IconToUse className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
      <Input
        value={editingValue}
        autoFocus
        disabled={isBusy}
        aria-label={`Rename ${node.kind}`}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={onCancelRename}
        onChange={(event) => onEditingValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onCommitRename(target);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancelRename();
          }
        }}
        className="h-7 min-w-0 flex-1 bg-background text-sm"
      />
      {isFile && <span className="text-xs text-sidebar-foreground/40">.md</span>}
    </div>
  );

  const triggerContent = isEditing ? (
    editingContent
  ) : isFile ? (
    <ButtonToUse
      isActive={isActive}
      onClick={() => onSelect(node.path)}
      className="cursor-pointer"
      aria-current={isActive ? 'page' : undefined}
    >
      {displayContent}
    </ButtonToUse>
  ) : (
    <div>
      <ButtonToUse
        className="w-full cursor-pointer pr-8"
        aria-expanded={expanded}
        onClick={() => onToggle(node.path)}
      >
        {displayContent}
      </ButtonToUse>
      <SidebarMenuAction
        className={cn('top-1 pointer-events-none', expanded && 'rotate-90')}
        aria-hidden
        tabIndex={-1}
      >
        <ChevronRight className="size-4 text-muted-foreground/50" />
      </SidebarMenuAction>
    </div>
  );

  return (
    <ComponentToUse>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div ref={isActive ? activeRowRef : undefined}>{triggerContent}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={anyActionBusy}
            onSelect={() => {
              if (!anyActionBusy) onStartRename(target);
            }}
          >
            <Pencil />
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={anyActionBusy}
            onSelect={() => {
              if (!anyActionBusy) onDelete(target);
            }}
          >
            <Trash2 />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {node.children.length > 0 && expanded && (
        <SidebarMenuSub className="mr-0 pr-0">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              activeRowRef={activeRowRef}
              editingPath={editingPath}
              editingValue={editingValue}
              busyPath={busyPath}
              onSelect={onSelect}
              onStartRename={onStartRename}
              onEditingValueChange={onEditingValueChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onDelete={onDelete}
              nested
            />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};

export function FileTree() {
  const { activeDocName, closeDocument } = useDocumentContext();
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [userExpanded, setUserExpanded] = useState<Set<string>>(() => new Set());
  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(() => new Set());
  const [prevActiveDocName, setPrevActiveDocName] = useState(activeDocName);
  if (activeDocName !== prevActiveDocName) {
    // Clear user-collapsed overrides on navigation so ancestors of the new
    // active file are guaranteed to expand. userExpanded is preserved — a user
    // who hand-opened unrelated folders keeps them open.
    setPrevActiveDocName(activeDocName);
    setUserCollapsed(new Set());
  }

  // Ref callback: fires when the active row DOM node attaches. Handles initial
  // page load (tree mounts after /api/documents resolves), hash navigation, and
  // rename — in every case the scroll runs once the target row exists in the DOM.
  const activeRowRef = (node: HTMLDivElement | null) => {
    if (node) node.scrollIntoView({ block: 'nearest' });
  };

  useEffect(() => {
    let active = true;

    const fetchDocs = () =>
      fetch('/api/documents')
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!active) return;
          if (res.ok && data?.ok) {
            setDocuments(data.documents);
            setError(null);
          } else {
            setError(data?.error ?? `Server error (HTTP ${res.status})`);
          }
        })
        .catch((err) => {
          if (active) setError('Could not reach server');
          console.warn('[FileTree] fetch failed:', err);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    fetchDocs();
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        void fetchDocs();
      }
    };
    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files')) {
        void fetchDocs();
      }
    });
    return () => {
      active = false;
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
    };
  }, []);

  async function handleRename(target: FileTreeTarget) {
    const normalizedName = normalizeRenameValue(target.kind, editingValue);
    if (!isValidNodeName(normalizedName)) {
      setError('Name must be a single path segment');
      return;
    }

    const nextPath = buildRenamedNodePath(target, normalizedName);
    if (nextPath === target.path) {
      setEditingPath(null);
      setEditingValue('');
      setError(null);
      return;
    }

    setBusyPath(target.path);
    setError(null);

    try {
      const endpoint = target.kind === 'file' ? '/api/rename' : '/api/rename-path';
      const payload =
        target.kind === 'file'
          ? { docName: target.path, newDocName: nextPath }
          : { kind: target.kind, fromPath: target.path, toPath: nextPath };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: RenamePathResponse = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to rename path');
        setBusyPath(null);
        return;
      }

      const renamed = Array.isArray(data.renamed) ? data.renamed : [];
      const nextActiveDocName = remapActiveDocName(activeDocName, renamed);

      for (const entry of renamed) closeDocument(entry.fromDocName);

      setDocuments((current) => applyRenameToDocuments(current, renamed));
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      setEditingPath(null);
      setEditingValue('');

      if (activeDocName && nextActiveDocName !== activeDocName) {
        window.location.hash = `#/${nextActiveDocName}`;
      }
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] rename failed:', err);
      setError('Network error — please try again');
      setBusyPath(null);
    }
  }

  async function handleDelete(target: FileTreeTarget) {
    setBusyPath(target.path);
    setError(null);

    try {
      const res = await fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: target.kind, path: target.path }),
      });
      const data = (await res.json()) as DeletePathResponse;

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to delete path');
        setBusyPath(null);
        return;
      }

      const deletedDocNames = Array.isArray(data.deletedDocNames) ? data.deletedDocNames : [];
      const deleted = new Set(deletedDocNames);

      for (const docName of deleted) closeDocument(docName);

      setDocuments((current) => applyDeleteToDocuments(current, deletedDocNames));
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      if (activeDocName && deleted.has(activeDocName)) window.location.hash = '';
      if (editingPath && (deleted.has(editingPath) || target.path === editingPath)) {
        setEditingPath(null);
        setEditingValue('');
      }
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] delete failed:', err);
      setError('Network error — please try again');
      setBusyPath(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <span className="select-none text-sm text-sidebar-foreground/30">Loading...</span>
      </div>
    );
  }

  if (error && documents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <span className="select-none text-sm text-sidebar-foreground/50">{error}</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <span className="select-none text-sm text-sidebar-foreground/30">No files yet.</span>
      </div>
    );
  }

  const treeNodes = buildTree(documents);
  const folderPaths = collectFolderPaths(treeNodes);
  const ancestors = computeAncestors(activeDocName);

  // Derive expansion on every render (D4 derive-don't-store):
  //   expandedPaths = (ancestors(activeDocName) ∪ userExpanded) \ userCollapsed
  // intersected with current folder paths to filter stale entries.
  const expandedPaths = new Set<string>();
  for (const a of ancestors) {
    if (folderPaths.has(a)) expandedPaths.add(a);
  }
  for (const p of userExpanded) {
    if (folderPaths.has(p)) expandedPaths.add(p);
  }
  for (const p of userCollapsed) {
    expandedPaths.delete(p);
  }

  function handleToggle(path: string) {
    if (expandedPaths.has(path)) {
      setUserCollapsed((prev) => new Set(prev).add(path));
      setUserExpanded((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      setUserExpanded((prev) => new Set(prev).add(path));
      setUserCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }

  return (
    <>
      {error && (
        <span role="alert" className="px-3 pb-1 text-xs text-destructive">
          {error}
        </span>
      )}
      <SidebarMenu>
        {treeNodes.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            selectedPath={activeDocName}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
            activeRowRef={activeRowRef}
            editingPath={editingPath}
            editingValue={editingValue}
            busyPath={busyPath}
            onSelect={(docName) => {
              window.location.hash = `#/${docName}`;
            }}
            onStartRename={(target) => {
              setEditingPath(target.path);
              setEditingValue(target.name);
              setError(null);
            }}
            onEditingValueChange={setEditingValue}
            onCommitRename={(target) => void handleRename(target)}
            onCancelRename={() => {
              if (!busyPath) {
                setEditingPath(null);
                setEditingValue('');
              }
            }}
            onDelete={(target) => void handleDelete(target)}
          />
        ))}
      </SidebarMenu>
    </>
  );
}
