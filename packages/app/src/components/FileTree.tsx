import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { HandoffOutcome, HandoffTarget, InstallState } from '@inkeep/open-knowledge-core';
import {
  Bot,
  ChevronRight,
  Copy,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  Link2,
  Pencil,
  SquarePen,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';
import {
  createContext,
  type FC,
  type Ref,
  startTransition,
  use,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { parentDirOfDocName, validateMoveToFolder } from '@/components/file-tree-dnd';
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
import { resolveFileTreeSelection } from '@/components/file-tree-selection';
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
import { Dialog } from '@/components/ui/dialog';
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
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';
import { cn } from '@/lib/utils';
import { joinWorkspacePath } from '@/lib/workspace-paths';
import { OpenInAgentContextSubmenu } from './handoff/OpenInAgentContextSubmenu';
import {
  buildHandoffInput,
  type HandoffDispatchInput,
  useHandoffDispatch,
} from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';
import { cancelHoverPrewarm, scheduleHoverPrewarm } from './sidebar-hover-prewarm';

const FileTreeDragContext = createContext<FileTreeTarget | null>(null);

function useFileTreeDragSource(): FileTreeTarget | null {
  return use(FileTreeDragContext);
}

function navigateTo(targetPath: string) {
  window.location.hash = hashFromDocName(targetPath);
}

/**
 * Workspace-relative on-disk path for a tree node. Files get the `.md` extension;
 * folders return the bare path (no trailing slash). Mirrors how paths appear in
 * git diffs, VS Code 'Copy Relative Path', and the server's docName convention.
 *
 * US-011 promoted the sibling `joinWorkspacePath` to `@/lib/workspace-paths` so
 * handoff dispatch inputs share the same normalizer. `relativePathForNode`
 * stays local because it operates on a `TreeNode` (not a bare docName).
 */
function relativePathForNode(node: { kind: 'file' | 'folder'; path: string }): string {
  return node.kind === 'file' ? `${node.path}.md` : node.path;
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
 * Basename-scoped files that get a distinct icon in the sidebar. Covers the
 * cross-tool agent-doc conventions this repo treats as first-class: AGENTS.md
 * (agents.md spec), CLAUDE.md (Claude Code), and SKILL.md (skill bundles under
 * `.claude/skills/**`, `.agents/skills/**`). Basename match is case-insensitive
 * so `agents.md`, `Claude.md`, etc. all surface the badge. `TreeNode.name` is
 * already extension-less by construction.
 *
 * The badge icon is `Bot`, not `Sparkles` — `Sparkles` is already the live-
 * agent-presence fallback in `PresenceBar.tsx` (`AgentIcon` default case). Two
 * separate meanings on the same glyph ("this file is an agent config" vs. "an
 * agent is editing right now") would be ambiguous in the sidebar chrome.
 */
const AGENT_FILE_NAMES = new Set(['agents', 'agent', 'claude', 'skill']);

function isAgentFile(node: TreeNode): boolean {
  return node.kind === 'file' && AGENT_FILE_NAMES.has(node.name.toLowerCase());
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

function dropHighlightClass(
  activeSource: FileTreeTarget | null,
  destinationFolderPath: string,
): string {
  if (!activeSource) return '';
  const v = validateMoveToFolder(activeSource, destinationFolderPath);
  if (!v.ok && (v.reason === 'self' || v.reason === 'descendant')) {
    return 'bg-destructive/20 ring-2 ring-destructive/50';
  }
  if (v.ok) {
    return 'bg-primary/10 ring-2 ring-primary/40';
  }
  return '';
}

function RootDropRow({ treeActionsLocked }: { treeActionsLocked: boolean }) {
  const activeSource = useFileTreeDragSource();
  const { setNodeRef, isOver } = useDroppable({
    id: 'drop-root',
    disabled: treeActionsLocked,
    data: { destinationFolderPath: '' },
  });

  if (!activeSource) {
    return null;
  }

  return (
    <SidebarMenuItem>
      <div
        ref={setNodeRef}
        className={cn(
          'flex h-8 items-center rounded-md border border-dashed border-sidebar-border px-2 text-xs text-muted-foreground transition-colors',
          isOver && dropHighlightClass(activeSource, ''),
        )}
      >
        Drop here to move to library root
      </div>
    </SidebarMenuItem>
  );
}

const FileTreeNode: FC<{
  node: TreeNode;
  selectedFilePath: string | null;
  selectedFolderPath: string | null;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  activeRowRef: (node: HTMLDivElement | null) => void;
  editingPath: string | null;
  editingValue: string;
  busyPath: string | null;
  treeActionsLocked: boolean;
  /** Absolute on-disk workspace root + host path separator, or null while /api/workspace is still loading. */
  workspace: { contentDir: string; pathSeparator: '/' | '\\' } | null;
  /** Handoff install states + dispatch fn, lifted to the FileTree root so every
   *  file-row ContextMenu shares one `useInstalledAgents` coordinator (otherwise
   *  N file rows spin up N probe coordinators each with a 10s throttle — the
   *  server-side cache absorbs it but the React state stays fragmented). */
  handoff: {
    readonly installStates: Record<HandoffTarget, InstallState>;
    readonly isElectronHost: boolean;
    readonly dispatch: (
      target: HandoffTarget,
      input: HandoffDispatchInput,
    ) => Promise<HandoffOutcome>;
  };
  onNavigate: (targetPath: string) => void;
  /** Hover-intent prewarm trigger (V2 Option G). Safe-no-op when not wired. */
  prewarm: (docName: string) => void;
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
  selectedFilePath,
  selectedFolderPath,
  expandedPaths,
  onToggle,
  activeRowRef,
  editingPath,
  editingValue,
  busyPath,
  treeActionsLocked,
  workspace,
  handoff,
  onNavigate,
  prewarm,
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
  // Prevent Radix ContextMenu from returning focus to its trigger when an
  // inline-create input is about to mount. Without this, Radix's
  // onCloseAutoFocus fires (after the onSelect handler) and steals focus back
  // from the autoFocus input, which blurs it → triggers onCancel → unmounts.
  const preventFocusReturnRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isFile = node.kind === 'file';
  const expanded = !isFile && expandedPaths.has(node.path);

  const isActive = isFile ? node.path === selectedFilePath : node.path === selectedFolderPath;
  const isEditing = editingPath === node.path;

  useEffect(() => {
    if (!isEditing) return;
    requestAnimationFrame(() => {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, [isEditing]);
  const isBusy = busyPath === node.path;
  const anyActionBusy = busyPath !== null;
  const IconToUse = isFile ? File : expanded ? FolderOpen : Folder;
  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;
  const target: FileTreeTarget = { kind: node.kind, path: node.path, name: node.name };

  const destFolderForDrop = isFile ? parentDirOfDocName(node.path) : node.path;
  const activeDragSource = useFileTreeDragSource();

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag-${node.kind}-${node.path}`,
    disabled: treeActionsLocked || isEditing,
    data: { source: target },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${node.kind}-${node.path}`,
    disabled: treeActionsLocked,
    data: { destinationFolderPath: destFolderForDrop },
  });

  const rowRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
    if (isActive) activeRowRef(el);
  };

  const overDropClass =
    isOver && activeDragSource ? dropHighlightClass(activeDragSource, destFolderForDrop) : '';

  const showSymlink = isFile && node.isSymlink;
  const showAgentBadge = isAgentFile(node);
  /*
   * `!text-muted-foreground/50` (Tailwind v4 trailing-bang) is required
   * because SidebarMenuSubButton applies `[&>svg]:text-sidebar-accent-foreground`
   * to every direct SVG child (sidebar.tsx:636) — without !important, nested
   * rows render these badges as bright sidebar-accent-foreground while root
   * rows render them as muted-foreground/50.
   */
  const iconClass = 'size-3.5 shrink-0 text-muted-foreground/50!';

  // Hover-intent prewarm (review Major #7 / V2 SPEC FR12 Option G). Files
  // only — hovering a folder row doesn't trigger a prewarm. The 80ms
  // intent threshold + 3-concurrent cap live in `sidebar-hover-prewarm`;
  // here we just wire mouseenter/mouseleave to it. The prewarm opens a
  // cold HocuspocusProvider via `prewarm(docName)` so the target doc's
  // Y.Doc sync starts before the user clicks. Idempotent + rate-limited.
  const onRowEnter = isFile
    ? () => {
        scheduleHoverPrewarm(node.path, (docName) => {
          prewarm(docName);
        });
      }
    : undefined;
  const onRowLeave = isFile
    ? () => {
        cancelHoverPrewarm(node.path);
      }
    : undefined;

  const displayContent = (
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
        {node.name + (isFile ? '.md' : '')}
      </span>
      {showSymlink && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link2 className={iconClass} />
          </TooltipTrigger>
          <TooltipContent side="right" className="text-center leading-relaxed">
            Symlink → {node.targetPath}
            <br />
            Opens the same document as {node.canonicalDocName}
          </TooltipContent>
        </Tooltip>
      )}
      {showAgentBadge && <Bot className={iconClass} />}
    </>
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
        className="h-7 min-w-0 flex-1 bg-background text-sm text-foreground"
      />
      {isFile && <span className="text-xs text-sidebar-foreground/40">.md</span>}
    </div>
  );

  const triggerContent = isEditing ? (
    editingContent
  ) : isFile ? (
    <ButtonToUse
      isActive={isActive}
      onClick={() => onNavigate(node.path)}
      className="cursor-pointer"
      aria-current={isActive ? 'page' : undefined}
    >
      {displayContent}
    </ButtonToUse>
  ) : (
    <div>
      <ButtonToUse
        isActive={isActive}
        className="w-full cursor-pointer pr-8"
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onNavigate(node.path)}
      >
        {displayContent}
      </ButtonToUse>
      <SidebarMenuAction
        type="button"
        className={cn('top-1', expanded && 'rotate-90')}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
        aria-expanded={expanded}
        onPointerDown={(event) => {
          // The row wrapper is the draggable source. Stop the chevron's
          // pointer-down here so expand/collapse never arm a drag gesture.
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle(node.path);
        }}
      >
        <ChevronRight className="size-4 text-muted-foreground/50" />
      </SidebarMenuAction>
    </div>
  );

  return (
    <ComponentToUse>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/*
            The accessible widget is the button inside `triggerContent`
            (SidebarMenuButton); it already carries role/aria + keyboard
            affordances. This <div> is a pointer/ARIA passthrough — the
            mouseenter/mouseleave handlers fire hover-intent prewarm
            (Major #7) across the whole row. `role="presentation"`
            declares the div has no semantics of its own.
          */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-intent wrapper for ContextMenuTrigger; accessible target is the SidebarMenuButton inside triggerContent (review Major #7 wiring) */}
          <div
            ref={rowRef}
            className={cn(
              'rounded-md transition-[opacity,box-shadow] duration-150 ease-out',
              isDragging && 'opacity-40',
              overDropClass,
            )}
            onMouseEnter={onRowEnter}
            onMouseLeave={onRowLeave}
            {...(!isEditing && listeners)}
            {...(!isEditing && attributes)}
            role="presentation"
            // Disable double tab; the real focusable control is the inner button.
            tabIndex={undefined}
          >
            {triggerContent}
          </div>
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
                  preventFocusReturnRef.current = true;
                  onStartCreating('file', node.path);
                }}
              >
                <SquarePen aria-hidden="true" />
                New File
              </ContextMenuItem>
              <ContextMenuItem
                disabled={anyActionBusy}
                onSelect={() => {
                  preventFocusReturnRef.current = true;
                  onStartCreating('folder', node.path);
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
              preventFocusReturnRef.current = true;
              onStartRename(target);
            }}
          >
            <Pencil aria-hidden="true" />
            Rename
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Copy aria-hidden="true" />
              Copy Path
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                disabled={!workspace}
                onSelect={() => {
                  if (!workspace) return;
                  const full = joinWorkspacePath(
                    workspace.contentDir,
                    relativePathForNode(node),
                    workspace.pathSeparator,
                  );
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
          {isFile && (
            <OpenInAgentContextSubmenu
              input={buildHandoffInput({ docName: node.path, workspace })}
              installStates={handoff.installStates}
              isElectronHost={handoff.isElectronHost}
              dispatch={handoff.dispatch}
            />
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={anyActionBusy}
            onSelect={() => {
              onDelete(target);
            }}
          >
            <Trash2 aria-hidden="true" />
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
              selectedFilePath={selectedFilePath}
              selectedFolderPath={selectedFolderPath}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              activeRowRef={activeRowRef}
              editingPath={editingPath}
              editingValue={editingValue}
              busyPath={busyPath}
              treeActionsLocked={treeActionsLocked}
              workspace={workspace}
              handoff={handoff}
              onNavigate={onNavigate}
              prewarm={prewarm}
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
  const { activeDocName, activeTarget, closeDocument, prewarm } = useDocumentContext();
  const { addPage } = usePageList();
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [userExpanded, setUserExpanded] = useState(() => new Set<string>());
  const [userCollapsed, setUserCollapsed] = useState(() => new Set<string>());
  const {
    selectedFilePath,
    selectedFolderPath,
    navigationPath: activeNavigationPath,
  } = resolveFileTreeSelection(activeTarget, activeDocName);
  const [deleteTarget, setDeleteTarget] = useState<FileTreeTarget | null>(null);
  const [creatingItem, setCreatingItem] = useState<{
    kind: 'file' | 'folder';
    parentDir: string;
  } | null>(null);
  const [creatingValue, setCreatingValue] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [activeDragSource, setActiveDragSource] = useState<FileTreeTarget | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 12 } }));
  // Absolute workspace root + host path separator — null until /api/workspace
  // resolves. Used to build full filesystem paths for the row context menu's
  // 'Copy path > Full path' item. The separator comes from the server (Node's
  // `path.sep`) rather than being inferred client-side, because the shape of
  // `contentDir` alone doesn't disambiguate all cross-platform cases.
  const [workspace, setWorkspace] = useState<{
    contentDir: string;
    pathSeparator: '/' | '\\';
  } | null>(null);

  // Handoff surface (US-011) — shared across every file row's right-click menu.
  // Lifted to the tree root so one `useInstalledAgents` coordinator backs the
  // whole sidebar; per-row hook calls would spin up N probe coordinators (each
  // with its own 10s throttle) for no benefit.
  const { states: handoffInstallStates } = useInstalledAgents();
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoffIsElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const handoff = {
    installStates: handoffInstallStates,
    isElectronHost: handoffIsElectronHost,
    dispatch: dispatchHandoff,
  };

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
        if (
          res.ok &&
          data?.ok &&
          typeof data.contentDir === 'string' &&
          (data.pathSeparator === '/' || data.pathSeparator === '\\')
        ) {
          setWorkspace({ contentDir: data.contentDir, pathSeparator: data.pathSeparator });
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
   * Collapse a folder and all its descendant folders. The global derivation
   * is `expandedPaths = ancestors ∪ (userExpanded \ userCollapsed)` with
   * ancestors unconditionally expanded (see the `expandedPaths` loop below
   * and PRECEDENTS.md precedent #21). So adding subtree paths to `userCollapsed`
   * collapses every non-ancestor folder in the subtree; ancestors of the
   * active doc stay visible (matches VS Code / Finder semantics) — their
   * chevron is a visual no-op. See US-011 in
   * `specs/2026-04-17-e2e-observability-determinism/` for the empirical
   * triage that landed this invariant.
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
      // Under the ancestor-priority derivation
      // (`expandedPaths = ancestors ∪ (userExpanded \ userCollapsed)` with
      // ancestors exempt from userCollapsed — see the `expandedPaths` loop
      // below and PRECEDENTS.md precedent #21), ancestors of the active doc
      // stay expanded regardless of what we put in `userCollapsed`. So
      // "collapse all" collapses every non-ancestor folder and leaves the
      // active file's chain open — which matches VS Code / Finder UX and is
      // the intended contract for this button.
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

      const docName = data.docName ?? path.replace(/\.(mdx|md)$/, '');
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
    setDeleteTarget(null);

    try {
      const res = await fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: target.kind, path: target.path }),
      });
      const data = (await res.json()) as DeletePathResponse;

      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Failed to delete path');
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
      toast.error('Network error — please try again');
      setBusyPath(null);
    }
  }

  async function handleMove(source: FileTreeTarget, destinationFolderPath: string) {
    const v = validateMoveToFolder(source, destinationFolderPath);
    if (!v.ok) {
      if (v.reason === 'no_op') return;
      toast.error(
        v.reason === 'self'
          ? 'Cannot move a folder into itself'
          : 'Cannot move a folder into one of its subfolders',
      );
      return;
    }

    const nextPath = v.destinationPath;
    setBusyPath(source.path);
    setError(null);

    try {
      const endpoint = source.kind === 'file' ? '/api/rename' : '/api/rename-path';
      const payload =
        source.kind === 'file'
          ? { docName: source.path, newDocName: nextPath }
          : { kind: 'folder', fromPath: source.path, toPath: nextPath };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: RenamePathResponse = await res.json();

      if (!res.ok || !data.ok) {
        const msg = data.error ?? 'Failed to move';
        toast.error(msg);
        setError(msg);
        setBusyPath(null);
        return;
      }

      const renamed = Array.isArray(data.renamed) ? data.renamed : [];
      const nextActiveDocName = remapActiveDocName(activeDocName, renamed);

      for (const entry of renamed) closeDocument(entry.fromDocName);

      setDocuments((current) => applyRenameToDocuments(current, renamed));
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      const segments = nextPath.split('/').filter(Boolean);
      if (segments.length > 1) {
        setUserExpanded((prev) => {
          const n = new Set(prev);
          for (let i = 0; i < segments.length - 1; i++) {
            n.add(segments.slice(0, i + 1).join('/'));
          }
          return n;
        });
      }

      if (activeDocName && nextActiveDocName !== activeDocName) {
        window.location.hash = `#/${nextActiveDocName}`;
      }
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] move failed:', err);
      toast.error('Network error — please try again');
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
        <Button
          variant="link"
          size="sm"
          className="font-mono uppercase"
          onClick={() => startCreating('file', '')}
        >
          Create your first file
        </Button>
      </div>
    );
  }

  const treeNodes = documents.length > 0 ? buildTree(documents) : [];
  const folderPaths = collectFolderPaths(treeNodes);
  const ancestors = computeAncestors(activeNavigationPath);

  // Derive expansion on every render (D4 derive-don't-store):
  //   expandedPaths = ancestors(activeDocName) ∪ (userExpanded \ userCollapsed)
  //
  // Ancestors of the active doc are UNCONDITIONALLY expanded — user-collapse
  // on an active-doc-ancestor has no effect. This is a deliberate UX contract
  // matching VS Code / Finder file-explorer semantics: the active file's
  // context is always visible in the sidebar. The user can still collapse
  // non-ancestor folders (useExpanded \ useCollapsed applies there).
  //
  // Prior art: an earlier derivation `(ancestors ∪ userExpanded) \ userCollapsed`
  // let user-collapse override ancestors, which created a race with a
  // render-time `setUserCollapsed(new Set())` that auto-expanded ancestors
  // on navigation. Under CI load, concurrent user-collapse + navigation
  // batched into a single React render and the auto-clear clobbered the
  // user's intent 60% of the time. Moving the auto-clear to useEffect did
  // NOT fix it (same ordering race). The correct fix is the ancestor-priority
  // derivation here: there is no competing setState, so there is no race.
  // See US-011 in specs/2026-04-17-e2e-observability-determinism/SPEC.md.
  //
  // Both userExpanded and userCollapsed are intersected with current folder
  // paths to prevent stale entries (e.g., from a deleted-then-recreated
  // folder) affecting the derived state.
  const ancestorSet = new Set(ancestors);
  const expandedPaths = new Set<string>();
  // Ancestors always expanded
  for (const a of ancestorSet) {
    if (folderPaths.has(a)) expandedPaths.add(a);
  }
  // userExpanded adds non-ancestor folders
  for (const p of userExpanded) {
    if (folderPaths.has(p)) expandedPaths.add(p);
  }
  // userCollapsed subtracts — BUT ancestors are exempt (priority)
  for (const p of userCollapsed) {
    if (folderPaths.has(p) && !ancestorSet.has(p)) expandedPaths.delete(p);
  }

  function handleToggle(path: string) {
    // Ancestors of the active doc are unconditionally expanded by the
    // derivation above — the chevron is already a visual no-op on them.
    // Skip the `userCollapsed` write so a former-ancestor path doesn't
    // become a "surprise collapse" the moment the user navigates away.
    // Precedent #21 (AGENTS.md) + `packages/app/tests/stress/reveal-on-activate.e2e.ts`.
    if (ancestorSet.has(path)) {
      return;
    }
    const [add, remove] = expandedPaths.has(path)
      ? [setUserCollapsed, setUserExpanded]
      : [setUserExpanded, setUserCollapsed];

    add((prev) => new Set(prev).add(path));
    remove((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
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

  const treeActionsLocked = busyPath !== null || editingPath !== null || creatingItem !== null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => {
        setActiveDragSource((active.data.current?.source as FileTreeTarget | undefined) ?? null);
      }}
      onDragEnd={({ active, over }) => {
        setActiveDragSource(null);
        if (!over) return;
        const src = active.data.current?.source as FileTreeTarget | undefined;
        const dest = over.data.current?.destinationFolderPath;
        if (!src || typeof dest !== 'string') return;
        void handleMove(src, dest);
      }}
      onDragCancel={() => setActiveDragSource(null)}
    >
      <FileTreeDragContext.Provider value={activeDragSource}>
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
          <RootDropRow treeActionsLocked={treeActionsLocked} />
          {treeNodes.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              selectedFilePath={selectedFilePath}
              selectedFolderPath={selectedFolderPath}
              expandedPaths={expandedPaths}
              onToggle={handleToggle}
              activeRowRef={activeRowRef}
              editingPath={editingPath}
              editingValue={editingValue}
              busyPath={busyPath}
              treeActionsLocked={treeActionsLocked}
              workspace={workspace}
              handoff={handoff}
              onNavigate={navigateTo}
              prewarm={prewarm}
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
              onDelete={(target) => setDeleteTarget(target)}
              onStartCreating={startCreating}
              onExpandSubtree={expandSubtree}
              onCollapseSubtree={collapseSubtree}
              inlineCreate={getInlineCreate(node.path)}
              getInlineCreate={getInlineCreate}
            />
          ))}
        </SidebarMenu>
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open && !busyPath) setDeleteTarget(null);
          }}
        >
          {deleteTarget && (
            <DeleteConfirmationDialog
              itemName={`${deleteTarget.name}${deleteTarget.kind === 'file' ? '.md' : '/'}`}
              isSubmitting={busyPath === deleteTarget.path}
              onDelete={() => handleDelete(deleteTarget)}
              customDescription={
                deleteTarget.kind === 'folder'
                  ? `Are you sure you want to delete ${deleteTarget.name}/ and all files inside? This action cannot be undone.`
                  : undefined
              }
            />
          )}
        </Dialog>
        <DragOverlay dropAnimation={null}>
          {activeDragSource ? (
            <div className="pointer-events-none flex max-w-[min(100vw-2rem,280px)] items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-1.5 text-sm shadow-lg">
              {activeDragSource.kind === 'file' ? (
                <File className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
              ) : (
                <Folder className="size-4 shrink-0" stroke="var(--color-muted-foreground)" />
              )}
              <span className="min-w-0 flex-1 truncate text-sidebar-foreground">
                {activeDragSource.name}
                {activeDragSource.kind === 'file' ? '.md' : ''}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </FileTreeDragContext.Provider>
    </DndContext>
  );
}
