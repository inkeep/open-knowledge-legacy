import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  Pencil,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { type FC, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
  composeInlineFilePath,
  composeInlineFolderPath,
  computeAncestors,
  type DocEntry,
  type TreeNode,
} from '@/components/file-tree-utils';
import { usePageList } from '@/components/PageListContext';
import { Button } from '@/components/ui/button';
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

function navigateTo(docName: string) {
  window.location.hash = `#/${docName}`;
}

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

interface InlineCreateProps {
  kind: 'file' | 'folder';
  value: string;
  busy: boolean;
  error: string | null;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function InlineCreateRow({
  kind,
  value,
  busy,
  error,
  onChange,
  onCommit,
  onCancel,
}: InlineCreateProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // autoFocus is unreliable here: React fires node.focus() during the commit
    // phase while the ContextMenu portal is mid-teardown, so the browser drops
    // the focus call as focus moves off the removed portal elements. setTimeout
    // fires after that cleanup has fully settled.
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex flex-col">
      <div className={cn('flex h-8 items-center gap-2 rounded-md px-2')}>
        {kind === 'folder' ? (
          <Folder className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
        ) : (
          <File className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
        )}
        <Input
          ref={inputRef}
          value={value}
          disabled={busy}
          aria-label={`Create new ${kind}`}
          aria-invalid={!!error}
          aria-describedby={error ? 'inline-create-error' : undefined}
          placeholder={kind === 'folder' ? 'folder-name' : 'file-name'}
          className={cn('h-7 min-w-0 flex-1 bg-background text-sm', error && 'border-destructive')}
          onBlur={() => {
            if (!busy && !error) onCancel();
          }}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        {kind === 'file' && <span className="text-xs text-sidebar-foreground/40">.md</span>}
      </div>
      {error && (
        <span id="inline-create-error" role="alert" className="px-2 text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
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
  onStartCreating: (kind: 'file' | 'folder', parentDir: string) => void;
  inlineCreate: InlineCreateProps | null;
  getInlineCreate: (parentDir: string) => InlineCreateProps | null;
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
  onStartCreating,
  inlineCreate,
  getInlineCreate,
}) => {
  // Prevent Radix ContextMenu from returning focus to its trigger when an
  // inline-create input is about to mount. Without this, Radix's
  // onCloseAutoFocus fires (after the onSelect handler) and steals focus back
  // from the autoFocus input, which blurs it → triggers onCancel → unmounts.
  const preventFocusReturnRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isFile = node.kind === 'file';
  const expanded = !isFile && expandedPaths.has(node.path);

  const isActive = isFile && node.path === selectedPath;
  const isEditing = editingPath === node.path;

  useEffect(() => {
    if (!isEditing) return;
    const id = setTimeout(() => {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
    return () => clearTimeout(id);
  }, [isEditing]);
  const isBusy = busyPath === node.path;
  const anyActionBusy = busyPath !== null;
  const IconToUse = isFile ? File : !expanded ? Folder : FolderOpen;
  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;
  const target: FileTreeTarget = { kind: node.kind, path: node.path, name: node.name };

  const showSymlink = isFile && node.isSymlink;

  const fileContent = (
    <>
      <IconToUse
        className="size-4 shrink-0"
        stroke={
          isActive ? 'var(--color-sidebar-accent-foreground)' : 'var(--color-muted-foreground)'
        }
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          isActive ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/70',
        )}
      >
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
        ref={renameInputRef}
        value={editingValue}
        disabled={isBusy}
        aria-label={`Rename ${node.kind}`}
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
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            if (preventFocusReturnRef.current) {
              preventFocusReturnRef.current = false;
              e.preventDefault();
            }
          }}
        >
          {!isFile && (
            <>
              <ContextMenuItem
                disabled={anyActionBusy}
                onSelect={() => {
                  if (!anyActionBusy) {
                    preventFocusReturnRef.current = true;
                    onStartCreating('file', node.path);
                  }
                }}
              >
                <SquarePen aria-hidden="true" />
                New file
              </ContextMenuItem>
              <ContextMenuItem
                disabled={anyActionBusy}
                onSelect={() => {
                  if (!anyActionBusy) {
                    preventFocusReturnRef.current = true;
                    onStartCreating('folder', node.path);
                  }
                }}
              >
                <FolderPlus aria-hidden="true" />
                New folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            disabled={anyActionBusy}
            onSelect={() => {
              if (!anyActionBusy) {
                preventFocusReturnRef.current = true;
                onStartRename(target);
              }
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
      {expanded && (node.children.length > 0 || !!inlineCreate) && (
        <SidebarMenuSub className="mr-0 pr-0">
          {inlineCreate && (
            <SidebarMenuSubItem>
              <InlineCreateRow {...inlineCreate} />
            </SidebarMenuSubItem>
          )}
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
              onStartCreating={onStartCreating}
              inlineCreate={getInlineCreate(child.path)}
              getInlineCreate={getInlineCreate}
              nested
            />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};

export function FileTree({
  createTrigger,
}: {
  createTrigger: { kind: 'file' | 'folder'; parentDir: string; seq: number };
}) {
  const { activeDocName, closeDocument } = useDocumentContext();
  const { addPage } = usePageList();
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [userExpanded, setUserExpanded] = useState<Set<string>>(() => new Set());
  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(() => new Set());
  const [prevActiveDocName, setPrevActiveDocName] = useState(activeDocName);
  const [creatingItem, setCreatingItem] = useState<{
    kind: 'file' | 'folder';
    parentDir: string;
  } | null>(null);
  const [creatingValue, setCreatingValue] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const prevCreateSeqRef = useRef(0);

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

  // Consume header-button triggers from FileSidebar.
  const { seq: createSeq, kind: createKind, parentDir: createParentDir } = createTrigger;
  useEffect(() => {
    if (createSeq > prevCreateSeqRef.current) {
      prevCreateSeqRef.current = createSeq;
      setCreatingItem({ kind: createKind, parentDir: createParentDir });
      setCreatingValue('');
      setCreatingError(null);
      if (createParentDir) {
        setUserExpanded((prev) => new Set(prev).add(createParentDir));
        setUserCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(createParentDir);
          return next;
        });
      }
    }
  }, [createSeq, createKind, createParentDir]);

  function startCreating(kind: 'file' | 'folder', parentDir: string) {
    setCreatingItem({ kind, parentDir });
    setCreatingValue('');
    setCreatingError(null);
    if (parentDir) {
      setUserExpanded((prev) => new Set(prev).add(parentDir));
      setUserCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentDir);
        return next;
      });
    }
  }

  function handleCancelCreating() {
    if (!creatingBusy) {
      setCreatingItem(null);
      setCreatingValue('');
      setCreatingError(null);
    }
  }

  async function handleInlineCreate() {
    if (!creatingItem) return;
    const trimmed = creatingValue.trim();
    if (!trimmed) {
      setCreatingError('Name is required');
      return;
    }

    if (
      trimmed.includes('..') ||
      trimmed.startsWith('/') ||
      trimmed.includes('\\') ||
      trimmed.includes('\0')
    ) {
      setCreatingError('Invalid name');
      return;
    }

    const path =
      creatingItem.kind === 'file'
        ? composeInlineFilePath(creatingItem.parentDir, trimmed)
        : composeInlineFolderPath(creatingItem.parentDir, trimmed);

    setCreatingBusy(true);
    setCreatingError(null);

    try {
      const res = await fetch('/api/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      type CreatePageResponse = { ok: boolean; docName?: string; error?: string };
      let data: CreatePageResponse | null = null;
      try {
        data = (await res.json()) as CreatePageResponse;
      } catch (parseErr) {
        console.warn(
          '[FileTree] create response JSON parse failed:',
          parseErr,
          'status:',
          res.status,
        );
      }

      if (!res.ok || !data?.ok) {
        const msg = data?.error ?? `Failed to create ${creatingItem.kind}`;
        toast.error(msg);
        setCreatingError(msg);
        setCreatingBusy(false);
        return;
      }

      const docName = data.docName ?? path.replace(/\.md$/, '');
      setCreatingItem(null);
      setCreatingValue('');
      setCreatingError(null);
      setCreatingBusy(false);
      if (docName) navigateTo(docName);
      addPage(docName);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
    } catch (err) {
      console.warn('[FileTree] create failed:', err);
      const msg = 'Network error — please try again';
      toast.error(msg);
      setCreatingError(msg);
      setCreatingBusy(false);
    }
  }

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

  if (documents.length === 0 && !creatingItem) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
        <span className="select-none text-sm text-sidebar-foreground/30">No files yet.</span>
        <Button variant="outline" size="sm" onClick={() => startCreating('file', '')}>
          Create your first file
        </Button>
      </div>
    );
  }

  const treeNodes = documents.length > 0 ? buildTree(documents) : [];
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

  function getInlineCreate(parentDir: string): InlineCreateProps | null {
    if (!creatingItem || creatingItem.parentDir !== parentDir) return null;
    return {
      kind: creatingItem.kind,
      value: creatingValue,
      busy: creatingBusy,
      error: creatingError,
      onChange: setCreatingValue,
      onCommit: () => void handleInlineCreate(),
      onCancel: handleCancelCreating,
    };
  }

  const rootInlineCreate = getInlineCreate('');

  return (
    <>
      {error && (
        <span role="alert" className="px-3 pb-1 text-xs text-destructive">
          {error}
        </span>
      )}
      <SidebarMenu>
        {rootInlineCreate && (
          <SidebarMenuItem>
            <InlineCreateRow {...rootInlineCreate} />
          </SidebarMenuItem>
        )}
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
              navigateTo(docName);
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
            onStartCreating={startCreating}
            inlineCreate={getInlineCreate(node.path)}
            getInlineCreate={getInlineCreate}
          />
        ))}
      </SidebarMenu>
    </>
  );
}
