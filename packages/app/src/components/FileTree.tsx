import {
  ChevronRight,
  Copy,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  Link2,
  Pencil,
  Sparkles,
  SquarePen,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';
import {
  type FC,
  type Ref,
  startTransition,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
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

/**
 * Workspace-relative on-disk path for a tree node. Files get the `.md` extension;
 * folders return the bare path (no trailing slash). Mirrors how paths appear in
 * git diffs, VS Code 'Copy Relative Path', and the server's docName convention.
 */
function relativePathForNode(node: { kind: 'file' | 'folder'; path: string }): string {
  return node.kind === 'file' ? `${node.path}.md` : node.path;
}

/**
 * Join `contentDir` with a workspace-relative path. Cross-platform — picks the
 * separator that already appears in `contentDir` (POSIX `/` on macOS/Linux,
 * `\` on Windows). The relative segment itself is always `/`-joined because
 * TreeNode.path and DocEntry.docName are POSIX-form in transit.
 */
function joinWorkspacePath(contentDir: string, relative: string): string {
  const winSep = contentDir.includes('\\') && !contentDir.includes('/');
  const sep = winSep ? '\\' : '/';
  const normalizedRelative = winSep ? relative.replaceAll('/', '\\') : relative;
  const trimmedDir = contentDir.endsWith(sep) ? contentDir.slice(0, -1) : contentDir;
  return `${trimmedDir}${sep}${normalizedRelative}`;
}

async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}`, { description: text });
  } catch (err) {
    console.warn('[FileTree] clipboard write failed:', err);
    toast.error(`Could not copy ${label}`);
  }
}

/**
 * Basename-scoped files that get a distinct icon in the sidebar. AGENTS.md is
 * the cross-tool convention for agent instructions (agents.md spec) — surfacing
 * it visually makes the sidebar agent-native in the same way CLAUDE.md is
 * for this repo. Kept as a Set so adding siblings (CLAUDE.md, SKILL.md, etc.)
 * later is a one-liner. The `TreeNode.name` used here is already extension-less.
 */
const AGENT_FILE_NAMES = new Set(['AGENTS']);

function isAgentFile(node: TreeNode): boolean {
  return node.kind === 'file' && AGENT_FILE_NAMES.has(node.name);
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
  return (
    <div className="flex flex-col">
      <div className={cn('flex h-8 items-center gap-2 rounded-md px-2')}>
        {kind === 'folder' ? (
          <Folder className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
        ) : (
          <File className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
        )}
        <Input
          value={value}
          autoFocus
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
  /** Absolute on-disk workspace root, or null while /api/workspace is still loading. */
  contentDir: string | null;
  onSelect: (docName: string) => void;
  onStartRename: (target: FileTreeTarget) => void;
  onEditingValueChange: (value: string) => void;
  onCommitRename: (target: FileTreeTarget) => void;
  onCancelRename: () => void;
  onDelete: (target: FileTreeTarget) => void;
  onStartCreating: (kind: 'file' | 'folder', parentDir: string) => void;
  onExpandSubtree: (folder: TreeNode) => void;
  onCollapseSubtree: (folder: TreeNode) => void;
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
  contentDir,
  onSelect,
  onStartRename,
  onEditingValueChange,
  onCommitRename,
  onCancelRename,
  onDelete,
  onStartCreating,
  onExpandSubtree,
  onCollapseSubtree,
  inlineCreate,
  getInlineCreate,
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
  const showAgentBadge = isAgentFile(node);

  const fileContent = (
    <>
      <IconToUse className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
      <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground/70">
        {node.name}
        {isFile && '.md'}
      </span>
      {/*
       * `!text-muted-foreground/50` (Tailwind v4 trailing-bang) is required
       * because SidebarMenuSubButton applies `[&>svg]:text-sidebar-accent-foreground`
       * to every direct SVG child (sidebar.tsx:636) — without !important, nested
       * rows render these badges as bright sidebar-accent-foreground while root
       * rows render them as muted-foreground/50.
       */}
      {showAgentBadge && <Sparkles className="size-3.5 shrink-0 text-muted-foreground/50!" />}
      {showSymlink && <Link2 className="size-3.5 shrink-0 text-muted-foreground/50!" />}
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
          {!isFile && (
            <>
              <ContextMenuItem
                disabled={anyActionBusy}
                onSelect={() => {
                  if (!anyActionBusy) onStartCreating('file', node.path);
                }}
              >
                <SquarePen aria-hidden="true" />
                New File
              </ContextMenuItem>
              <ContextMenuItem
                disabled={anyActionBusy}
                onSelect={() => {
                  if (!anyActionBusy) onStartCreating('folder', node.path);
                }}
              >
                <FolderPlus aria-hidden="true" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
              {/*
               * Subtree-scoped expand/collapse — distinct from the sidebar-
               * header buttons which operate on the whole tree. Only meaningful
               * on folder rows, which is why the block sits inside the !isFile
               * guard alongside the other folder-only actions.
               */}
              <ContextMenuItem onSelect={() => onExpandSubtree(node)}>
                <UnfoldVertical aria-hidden="true" />
                Expand All
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onCollapseSubtree(node)}>
                <FoldVertical aria-hidden="true" />
                Collapse All
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            disabled={anyActionBusy}
            onSelect={() => {
              if (!anyActionBusy) onStartRename(target);
            }}
          >
            <Pencil />
            Rename
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Copy />
              Copy Path
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                disabled={!contentDir}
                onSelect={() => {
                  if (!contentDir) return;
                  const full = joinWorkspacePath(contentDir, relativePathForNode(node));
                  void copyToClipboard(full, 'full path');
                }}
              >
                Full Path
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  void copyToClipboard(relativePathForNode(node), 'relative path');
                }}
              >
                Relative Path
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
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
              contentDir={contentDir}
              onSelect={onSelect}
              onStartRename={onStartRename}
              onEditingValueChange={onEditingValueChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onDelete={onDelete}
              onStartCreating={onStartCreating}
              onExpandSubtree={onExpandSubtree}
              onCollapseSubtree={onCollapseSubtree}
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

/**
 * Imperative commands exposed by the FileTree, invoked by the FileSidebar header
 * buttons. Modeled as a ref handle instead of prop-seq counters because the
 * trigger relationship here is "parent tells child to do a one-shot thing" —
 * which React 19's docs explicitly call out as a case that does NOT belong in
 * an Effect. See https://react.dev/learn/you-might-not-need-an-effect.
 */
export interface FileTreeHandle {
  startCreating(kind: 'file' | 'folder', parentDir: string): void;
  expandAll(): void;
  collapseAll(): void;
}

export function FileTree({ ref }: { ref?: Ref<FileTreeHandle | null> }) {
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
  // Absolute workspace root — null until /api/workspace resolves. Used to build
  // full filesystem paths for the row context menu's 'Copy path > Full path' item.
  const [contentDir, setContentDir] = useState<string | null>(null);

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

  // Fetch workspace metadata once — contentDir is stable for the session, so no
  // subscription or refresh is needed. Failure is non-fatal: the 'Copy path > Full
  // path' menu item stays disabled until the fetch resolves.
  useEffect(() => {
    let active = true;
    fetch('/api/workspace')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (res.ok && data?.ok && typeof data.contentDir === 'string') {
          setContentDir(data.contentDir);
        }
      })
      .catch((err) => {
        console.warn('[FileTree] /api/workspace fetch failed:', err);
      });
    return () => {
      active = false;
    };
  }, []);

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

  /**
   * Expand a folder and all its descendant folders. Used by the row
   * context-menu "Expand All" action — distinct from the header button which
   * operates on the whole tree. Same `startTransition` wrapping rationale:
   * avoids the materialize-all-rows stutter.
   */
  function expandSubtree(folder: TreeNode) {
    const subtreePaths = collectFolderPaths([folder]);
    startTransition(() => {
      setUserExpanded((prev) => {
        const next = new Set(prev);
        for (const p of subtreePaths) next.add(p);
        return next;
      });
      setUserCollapsed((prev) => {
        const next = new Set(prev);
        for (const p of subtreePaths) next.delete(p);
        return next;
      });
    });
  }

  /**
   * Collapse a folder and all its descendant folders. Because the global
   * derivation is `expanded = (ancestors ∪ userExpanded) \ userCollapsed`,
   * adding the subtree paths to `userCollapsed` correctly overrides both
   * prior user expansions and the active-doc-ancestor auto-expansion inside
   * this scope, while leaving unrelated folders untouched.
   */
  function collapseSubtree(folder: TreeNode) {
    const subtreePaths = collectFolderPaths([folder]);
    startTransition(() => {
      setUserCollapsed((prev) => {
        const next = new Set(prev);
        for (const p of subtreePaths) next.add(p);
        return next;
      });
      setUserExpanded((prev) => {
        const next = new Set(prev);
        for (const p of subtreePaths) next.delete(p);
        return next;
      });
    });
  }

  // Expose imperative commands to the FileSidebar header. Replaces the old
  // createTrigger prop + seq-counter useEffect — the "parent pings child to do
  // one thing" pattern is exactly what React 19 recommends against wiring
  // through Effects. Methods close over current state; useImperativeHandle
  // re-runs on each render so closures are never stale.
  //
  // `expandAll` / `collapseAll` wrap their setters in `startTransition` because
  // materializing every folder's rows at once produces a user-visible stutter
  // (hundreds of Radix ContextMenu subtrees instantiating in one render pass).
  // Transitions mark the update as non-urgent, so the HoverCard close animation
  // and button-click feedback stay at 60fps; React yields to browser paint /
  // input and interleaves the tree expansion. See
  // https://react.dev/reference/react/startTransition.
  useImperativeHandle(ref, () => ({
    startCreating,
    expandAll() {
      const paths = collectFolderPaths(buildTree(documents));
      startTransition(() => {
        setUserExpanded(paths);
        setUserCollapsed(new Set());
      });
    },
    collapseAll() {
      // `userCollapsed` must include ancestors of the active doc to override the
      // derivation `expanded = (ancestors ∪ userExpanded) \ userCollapsed`;
      // otherwise "collapse all" would leave the active file's chain open.
      const paths = collectFolderPaths(buildTree(documents));
      startTransition(() => {
        setUserCollapsed(paths);
        setUserExpanded(new Set());
      });
    },
  }));

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
            onExpandSubtree={expandSubtree}
            onCollapseSubtree={collapseSubtree}
            inlineCreate={getInlineCreate(node.path)}
            getInlineCreate={getInlineCreate}
            contentDir={contentDir}
          />
        ))}
      </SidebarMenu>
    </>
  );
}
