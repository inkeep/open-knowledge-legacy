import {
  CreatePageSuccessSchema,
  DeletePathSuccessSchema,
  DocumentListSuccessSchema,
  type HandoffOutcome,
  type HandoffTarget,
  type InstallState,
  ProblemDetailsSchema,
  RenamePathSuccessSchema,
  WorkspaceSuccessSchema,
} from '@inkeep/open-knowledge-core';
import {
  type ContextMenuItem,
  type ContextMenuOpenContext,
  type FileTreeDirectoryHandle,
  type FileTreeDropResult,
  type FileTreeRenameEvent,
  type FileTree as PierreFileTreeModel,
  themeToTreeStyles,
} from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import {
  Copy,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  Pencil,
  SquarePen,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';
// @ts-expect-error -- no types
import { __iconNode as botIcon } from 'lucide-react/dist/esm/icons/bot';
// @ts-expect-error -- no types
import { __iconNode as link2Icon } from 'lucide-react/dist/esm/icons/link-2';
import { useTheme } from 'next-themes';
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type Ref,
  startTransition,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import {
  collectTreeFolderPathsFromDocuments,
  computeTreeAncestorPaths,
  computeTreeDropDestinationPath,
  createPagePathFromTreeDestination,
  createTreePlaceholder,
  docNameToTreePath,
  documentsToTreePaths,
  documentsTreePathSignature,
  folderPathToTreeDirectoryPath,
  normalizeTreePathForKind,
  relativePathForTreeItem,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocName,
  treeItemToTarget,
  treePathSignature,
  treePathToAppPath,
} from '@/components/file-tree-adapter';
import {
  applyDeleteToDocuments,
  applyRenameToDocuments,
  type FileTreeTarget,
  type RenamedDocMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { resolveFileTreeSelection } from '@/components/file-tree-selection';
import type { DocEntry } from '@/components/file-tree-utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDocumentContext } from '@/editor/DocumentContext';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';
import { createRefreshScheduler } from '@/lib/refresh-scheduler';
import { joinWorkspacePath } from '@/lib/workspace-paths';
import { OpenInAgentContextSubmenu } from './handoff/OpenInAgentContextSubmenu';
import {
  buildHandoffInput,
  type HandoffDispatchInput,
  useHandoffDispatch,
} from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';
import { cancelHoverPrewarm, scheduleHoverPrewarm } from './sidebar-hover-prewarm';
import { useSidebar } from './ui/sidebar';

function navigateTo(targetPath: string) {
  window.location.hash = hashFromDocName(targetPath);
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

const AGENT_FILE_NAMES = new Set(['agents', 'agent', 'claude', 'skill']);
const LINK_DECORATION_ICON_ID = 'ok-file-tree-link-decoration';
const AGENT_DECORATION_ICON_ID = 'ok-file-tree-agent-decoration';

type IconNode = [string, Record<string, string>][];

function iconNodeToSvg(iconNode: IconNode): string {
  return (
    iconNode
      // remove React key
      .map(([tag, { key, ...attrs }]) => {
        const attrString = Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        return `<${tag} ${attrString} />`;
      })
      .join('')
  );
}

function createLucideSpriteSymbol(id: string, iconNode: IconNode): string {
  const symbolContent = iconNodeToSvg(iconNode);
  return `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbolContent}</symbol>`;
}

const FILE_TREE_DECORATION_SPRITE_SHEET = `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  ${createLucideSpriteSymbol(LINK_DECORATION_ICON_ID, link2Icon)}
  ${createLucideSpriteSymbol(AGENT_DECORATION_ICON_ID, botIcon)}
</svg>`;

// Pierre's per-extension icon color (specificity 0,1,0 on the inner [data-icon-token]
// element) wins over the inherited selected-fg color from the parent row, so the
// markdown icon stays gray when its row is selected. Re-target the inner element on
// selection so it picks up --trees-selected-fg.
const FILE_TREE_UNSAFE_CSS = `
  [data-item-selected='true'] [data-icon-token='markdown'] {
    color: var(--trees-selected-fg);
  }
`;

function createFileTreeStyle(resolvedTheme: string | undefined): CSSProperties {
  return {
    ...themeToTreeStyles({
      type: resolvedTheme === 'dark' ? 'dark' : 'light',
      colors: {
        'sideBar.background': 'var(--sidebar)',
        'sideBar.foreground': 'var(--sidebar-foreground)',
        'sideBar.border': 'var(--sidebar-border)',
        'list.activeSelectionBackground': 'var(--sidebar-accent)',
        'list.activeSelectionForeground': 'var(--sidebar-accent-foreground)',
        'list.hoverBackground': 'var(--sidebar-hover)',
        focusBorder: 'var(--color-primary)',
        'input.background': 'var(--input)',
        'input.border': 'var(--border)',
      },
    }),
    '--trees-font-family-override': 'var(--font-sans)',
    '--trees-font-size-override': '0.875rem',
    '--trees-item-padding-x-override': '0.5rem',
    '--trees-padding-inline-override': '0.5rem',
    '--trees-border-radius-override': '0.375rem',
    '--trees-selected-fg': 'var(--color-primary)',
    '--truncate-marker-fade-in-duration': '0s', // render ellipsis without delay
    '--trees-file-icon-color-markdown': 'light-dark(var(--color-gray-400), var(--color-gray-500))',
    '--trees-fg-muted': 'light-dark(var(--color-gray-400), var(--color-gray-500))',
  } as CSSProperties;
}

function isAgentTreePath(treePath: string): boolean {
  const name = treePath.split('/').pop()?.replace(/\.md$/i, '').toLowerCase();
  return !!name && AGENT_FILE_NAMES.has(name);
}

/**
 * Read a server response body and narrow on HTTP status per the RFC 9457
 * two-step parse pattern. Errors return the human-readable `title` from
 * `ProblemDetailsSchema` (or a fallback when the body fails schema). Success
 * returns the body as-is (caller validates with the per-handler schema).
 */
async function parseServerResponse(
  res: Response,
  fallbackErrorTitle: string,
): Promise<{ ok: true; body: unknown } | { ok: false; title: string }> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, title: `Server error (HTTP ${res.status})` };
  }
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    return {
      ok: false,
      title: problem.success ? problem.data.title : fallbackErrorTitle,
    };
  }
  return { ok: true, body };
}

/**
 * Apply a per-handler success schema to a `parseServerResponse` body, with
 * a typed fallback for schema drift. When the response shape diverges from
 * what the schema expects (server-side change without client lockstep,
 * forward-compat field rename, etc.), the caller's `fallback` value is
 * returned and the divergence is logged via `console.warn` so the drift is
 * observable in dev tools and forwarded to integration test harnesses.
 *
 * Mid-mutation flows (rename / delete / create) cannot recover from a thrown
 * parse error mid-transaction — the server already committed the operation.
 * The fallback keeps the UI consistent (e.g., derive docName from the path)
 * while making the schema drift loud rather than silent.
 */
function parseSuccessOrWarn<TIn, TOut>(
  schema: {
    safeParse: (v: unknown) => { success: true; data: TIn } | { success: false; error: unknown };
  },
  body: unknown,
  handler: string,
  fallback: TOut,
): TIn | TOut {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  console.warn('[FileTree] response schema drift:', handler, body, result.error);
  return fallback;
}

interface WorkspaceInfo {
  contentDir: string;
  pathSeparator: '/' | '\\';
}

interface PendingCreate {
  kind: 'file' | 'folder';
  renamePath: string;
}

/**
 * Platform-specific label for the file-manager reveal action. Mirrors VS Code's copy.
 * Linux verb asymmetry (Open vs Reveal) is intentional — no stable Linux file-manager
 * brand to "Reveal in"; a normalizing fix to "Reveal in Files" would be incorrect on
 * most distros.
 */
function revealInFileManagerLabel(platform: 'darwin' | 'win32' | 'linux'): string {
  if (platform === 'darwin') return 'Reveal in Finder';
  if (platform === 'win32') return 'Reveal in File Explorer';
  return 'Open Containing Folder';
}

/**
 * File-tree menu row that opens the OS file manager with the target file/folder
 * selected. Hidden entirely on the web variant (no useful no-op without a host
 * filesystem) — the disabled-with-hint pattern used by `OpenInAgentContextSubmenu`
 * doesn't apply here because reveal has no cross-host fallback. When present but
 * the workspace metadata hasn't resolved yet, renders disabled with a "No workspace"
 * affordance mirroring the handoff submenu's pattern.
 */
function RevealInFileManagerMenuItem({
  item,
  workspace,
  onClose,
}: {
  item: ContextMenuItem;
  workspace: WorkspaceInfo | null;
  onClose: () => void;
}) {
  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
  if (!bridge) return null;
  const label = revealInFileManagerLabel(bridge.platform);
  const hint = !workspace ? 'No workspace' : null;
  return (
    <DropdownMenuItem
      disabled={!workspace}
      onSelect={() => {
        if (!workspace) return;
        onClose();
        const full = joinWorkspacePath(
          workspace.contentDir,
          relativePathForTreeItem(item),
          workspace.pathSeparator,
        );
        void bridge.shell.showItemInFolder(full);
      }}
      aria-label={hint ? `${label}, ${hint}` : label}
    >
      <FolderOpen aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {hint ? (
        <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
          {hint}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}

interface FileTreeMenuProps {
  item: ContextMenuItem;
  context: ContextMenuOpenContext;
  anyActionBusy: boolean;
  workspace: WorkspaceInfo | null;
  handoff: {
    readonly installStates: Record<HandoffTarget, InstallState>;
    readonly isElectronHost: boolean;
    readonly dispatch: (
      target: HandoffTarget,
      input: HandoffDispatchInput,
    ) => Promise<HandoffOutcome>;
  };
  model: PierreFileTreeModel;
  onStartCreating: (kind: 'file' | 'folder', parentDir: string) => void;
  onDelete: (target: FileTreeTarget) => void;
  onExpandSubtree: (treePath: string) => void;
  onCollapseSubtree: (treePath: string) => void;
}

function asDirectoryHandle(
  item: ReturnType<PierreFileTreeModel['getItem']>,
): FileTreeDirectoryHandle | null {
  if (!item?.isDirectory()) return null;
  return item as FileTreeDirectoryHandle;
}

function FileTreeMenu({
  item,
  context,
  anyActionBusy,
  workspace,
  handoff,
  model,
  onStartCreating,
  onDelete,
  onExpandSubtree,
  onCollapseSubtree,
}: FileTreeMenuProps) {
  const target = treeItemToTarget(item);
  const isFolder = item.kind === 'directory';
  const handoffInput = !isFolder
    ? buildHandoffInput({
        docName: treeFilePathToDocName(item.path),
        workspace,
      })
    : null;

  const closeForInlineSurface = () => context.close({ restoreFocus: false });
  const close = () => context.close();
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          data-file-tree-context-menu-root="true"
          className="block size-px"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={0}
        align="start"
        data-file-tree-context-menu-root="true"
        className="min-w-52"
      >
        {isFolder ? (
          <>
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                onStartCreating('file', treeDirectoryPathToFolderPath(item.path));
              }}
            >
              <SquarePen aria-hidden="true" />
              New File
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                onStartCreating('folder', treeDirectoryPathToFolderPath(item.path));
              }}
            >
              <FolderPlus aria-hidden="true" />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                close();
                onExpandSubtree(item.path);
              }}
            >
              <UnfoldVertical aria-hidden="true" />
              Expand All
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                close();
                onCollapseSubtree(item.path);
              }}
            >
              <FoldVertical aria-hidden="true" />
              Collapse All
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          disabled={anyActionBusy}
          onSelect={() => {
            closeForInlineSurface();
            model.startRenaming(item.path);
          }}
        >
          <Pencil aria-hidden="true" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Copy aria-hidden="true" />
            Copy Path
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              disabled={!workspace}
              onSelect={() => {
                if (!workspace) return;
                close();
                const full = joinWorkspacePath(
                  workspace.contentDir,
                  relativePathForTreeItem(item),
                  workspace.pathSeparator,
                );
                void copyToClipboard(full, 'full path');
              }}
            >
              Full Path
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                close();
                void copyToClipboard(relativePathForTreeItem(item), 'relative path');
              }}
            >
              Relative Path
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <RevealInFileManagerMenuItem item={item} workspace={workspace} onClose={close} />
        {!isFolder && (
          <OpenInAgentContextSubmenu
            input={handoffInput}
            installStates={handoff.installStates}
            isElectronHost={handoff.isElectronHost}
            dispatch={handoff.dispatch}
          />
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={anyActionBusy}
          onSelect={() => {
            close();
            onDelete(target);
          }}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface FileTreeHandle {
  startCreating(kind: 'file' | 'folder', parentDir: string): void;
  expandAll(): void;
  collapseAll(): void;
}

/**
 * Must be mounted inside a `SidebarProvider` — `useSidebar()` throws otherwise.
 * Today only `FileSidebar` mounts it, which is always inside the provider.
 */
export function FileTree({ ref }: { ref?: Ref<FileTreeHandle | null> }) {
  const { activeDocName, activeTarget, closeDocument, closeAndClearForRename, prewarm } =
    useDocumentContext();
  const { notifySidebarFileSelected } = useSidebar();
  const { resolvedTheme } = useTheme();
  function navigateToWithPulse(targetPath: string) {
    navigateTo(targetPath);
    notifySidebarFileSelected();
  }
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileTreeTarget | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  const documentsRef = useRef(documents);
  const activeDocNameRef = useRef(activeDocName);
  const activeAncestorTreePathsRef = useRef<string[]>([]);
  const pendingCreateRef = useRef<PendingCreate | null>(null);
  const skipNextResetSignatureRef = useRef<string | null>(null);
  const hoveredPrewarmDocRef = useRef<string | null>(null);
  const suppressSelectionRef = useRef(false);
  const busyPathRef = useRef<string | null>(null);
  const handleSelectionChangeRef = useRef<(selectedPaths: readonly string[]) => void>(() => {});
  const handleRenameRef = useRef<(event: FileTreeRenameEvent) => void>(() => {});
  const handleDropCompleteRef = useRef<(event: FileTreeDropResult) => void>(() => {});

  const {
    selectedFilePath,
    selectedFolderPath,
    navigationPath: activeNavigationPath,
  } = resolveFileTreeSelection(activeTarget, activeDocName);
  const activeTreePath = selectedFilePath
    ? docNameToTreePath(
        selectedFilePath,
        documents.find((d) => d.docName === selectedFilePath)?.docExt,
      )
    : selectedFolderPath
      ? folderPathToTreeDirectoryPath(selectedFolderPath)
      : null;

  const handoffInstallStates = useInstalledAgents().states;
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoff = {
    installStates: handoffInstallStates,
    isElectronHost: typeof window !== 'undefined' && window.okDesktop != null,
    dispatch: dispatchHandoff,
  };

  const { model } = useFileTree({
    paths: [],
    flattenEmptyDirectories: false,
    initialExpansion: 'closed',
    search: true,
    searchBlurBehavior: 'retain',
    fileTreeSearchMode: 'hide-non-matches',
    initialVisibleRowCount: 18,
    stickyFolders: true,
    icons: {
      set: 'complete',
      spriteSheet: FILE_TREE_DECORATION_SPRITE_SHEET,
    },
    unsafeCSS: FILE_TREE_UNSAFE_CSS,
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: 'both',
        buttonVisibility: 'when-needed',
      },
    },
    dragAndDrop: {
      canDrag: () => busyPathRef.current === null,
      canDrop: () => busyPathRef.current === null,
      onDropComplete: (event) => handleDropCompleteRef.current(event),
      onDropError: (message) => {
        toast.error(message);
      },
    },
    renaming: {
      canRename: () => busyPathRef.current === null,
      onRename: (event) => handleRenameRef.current(event),
      onError: toast.error,
    },
    onSelectionChange: (selectedPaths) => handleSelectionChangeRef.current(selectedPaths),
    renderRowDecoration: ({ item }) => {
      if (item.kind !== 'file') return null;
      const doc = documentsRef.current.find(
        (entry) => docNameToTreePath(entry.docName, entry.docExt) === item.path,
      );
      if (doc?.isSymlink) {
        return {
          icon: LINK_DECORATION_ICON_ID,
          title: doc.targetPath ? `Symlink to ${doc.targetPath}` : 'Symlink',
        };
      }
      if (isAgentTreePath(item.path)) {
        return {
          icon: AGENT_DECORATION_ICON_ID,
          title: 'Agent configuration file',
        };
      }
      return null;
    },
  });

  const treePaths = documentsToTreePaths(documents);
  const treePathsSignature = treePathSignature(treePaths);
  const treePathsRef = useRef(treePaths);
  const folderTreePaths = collectTreeFolderPathsFromDocuments(documents);
  const folderTreePathsRef = useRef(folderTreePaths);

  // Keep parents visible without forcing the selected folder itself open.
  const activeAncestorTreePaths = selectedFolderPath
    ? computeTreeAncestorPaths(folderPathToTreeDirectoryPath(selectedFolderPath)).slice(0, -1)
    : computeTreeAncestorPaths(activeTreePath ?? activeNavigationPath);
  const activeAncestorTreePathsSignature = activeAncestorTreePaths.join('\0');

  const resetModelToDocuments = (nextDocuments?: readonly DocEntry[]) => {
    const nextPaths = documentsToTreePaths(nextDocuments ?? documentsRef.current);
    model.resetPaths(nextPaths, {
      initialExpandedPaths: activeAncestorTreePathsRef.current,
    });
  };

  const markNextDocumentsAsApplied = (nextDocuments: readonly DocEntry[]) => {
    skipNextResetSignatureRef.current = documentsTreePathSignature(nextDocuments);
  };

  useEffect(() => {
    let active = true;

    async function refreshDocs() {
      try {
        const res = await fetch('/api/documents');
        const parsed = await parseServerResponse(res, 'Failed to load documents');
        if (!active) return;
        if (!parsed.ok) {
          setError(parsed.title);
        } else {
          const success = DocumentListSuccessSchema.safeParse(parsed.body);
          if (!success.success) {
            setError('Documents response did not match expected shape.');
          } else {
            setDocuments(success.data.documents);
            setError(null);
          }
        }
      } catch (err) {
        if (active) setError('Could not reach server');
        console.warn('[FileTree] fetch failed:', err);
      }
      if (active) setLoading(false);
    }

    const scheduler = createRefreshScheduler(refreshDocs);
    scheduler.request();
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        scheduler.request();
      }
    };
    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files')) {
        scheduler.request();
      }
    });
    return () => {
      active = false;
      scheduler.dispose();
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/workspace')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) return;
        const parsed = parseSuccessOrWarn(WorkspaceSuccessSchema, data, 'workspace', null);
        if (!parsed) return;
        setWorkspace({
          contentDir: parsed.contentDir,
          pathSeparator: parsed.pathSeparator,
        });
      })
      .catch((err) => {
        console.warn('[FileTree] /api/workspace fetch failed:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (skipNextResetSignatureRef.current === treePathsSignature) {
      skipNextResetSignatureRef.current = null;
      return;
    }
    model.resetPaths(treePathsRef.current, {
      initialExpandedPaths: activeAncestorTreePathsRef.current,
    });
  }, [model, treePathsSignature]);

  useEffect(() => {
    if (!activeTreePath) return;
    const ancestorPaths = activeAncestorTreePathsSignature
      ? activeAncestorTreePathsSignature.split('\0')
      : [];
    for (const ancestor of ancestorPaths) {
      const item = asDirectoryHandle(model.getItem(ancestor));
      if (item && !item.isExpanded()) {
        item.expand();
      }
    }
    const item = model.getItem(activeTreePath);
    if (!item) return;
    suppressSelectionRef.current = true;
    item.select();
    item.focus();
    queueMicrotask(() => {
      suppressSelectionRef.current = false;
    });
  }, [activeAncestorTreePathsSignature, activeTreePath, model]);

  useEffect(() => {
    return model.subscribe(() => {
      if (model.isSearchOpen()) return;
      for (const ancestor of activeAncestorTreePathsRef.current) {
        const item = asDirectoryHandle(model.getItem(ancestor));
        if (item && !item.isExpanded()) item.expand();
      }
    });
  }, [model]);

  const applyRenamedDocuments = async (renamed: RenamedDocMapping[]) => {
    const currentActiveDocName = activeDocNameRef.current;
    const nextActiveDocName = remapActiveDocName(currentActiveDocName, renamed);

    // Wipe IDB for BOTH ends of every rename pair before any new provider
    // opens. The `to` clear catches the move-back-to-previous-folder case
    // where the destination docName already had IDB rows from an earlier
    // session — opening into that stale IDB would hydrate the new Y.Doc
    // with prior-session content (foreign clientID, no shared ancestor
    // with the server's freshly-loaded Y.Doc), and the union-merge would
    // append the stale content to the post-rename body.
    await Promise.all(
      renamed.flatMap((entry) => [
        closeAndClearForRename(entry.fromDocName),
        closeAndClearForRename(entry.toDocName),
      ]),
    );

    setDocuments((current) => {
      const next = applyRenameToDocuments(current, renamed);
      markNextDocumentsAsApplied(next);
      return next;
    });
    emitDocumentsChanged(['files', 'backlinks', 'graph']);

    if (currentActiveDocName && nextActiveDocName !== currentActiveDocName) {
      window.location.hash = `#/${nextActiveDocName}`;
    }
  };

  async function handleTreeRename(event: FileTreeRenameEvent) {
    const kind = event.isFolder ? 'folder' : 'file';
    const sourceTreePath = normalizeTreePathForKind(event.sourcePath, event.isFolder);
    const destinationTreePath = normalizeTreePathForKind(event.destinationPath, event.isFolder);
    const pendingCreate = pendingCreateRef.current;

    setBusyPath(sourceTreePath);
    setError(null);

    try {
      if (pendingCreate?.renamePath === sourceTreePath) {
        const createPath = createPagePathFromTreeDestination(kind, destinationTreePath);
        const res = await fetch('/api/create-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: createPath }),
        });
        const parsed = await parseServerResponse(res, `Failed to create ${kind}`);

        if (!parsed.ok) {
          toast.error(parsed.title);
          setError(parsed.title);
          resetModelToDocuments();
          pendingCreateRef.current = null;
          setBusyPath(null);
          return;
        }

        const fallbackDocName = createPath.replace(/\.md$/i, '');
        const success = parseSuccessOrWarn(CreatePageSuccessSchema, parsed.body, 'create-page', {
          docName: fallbackDocName,
        });
        const docName = success.docName;
        setDocuments((current) => {
          if (current.some((doc) => doc.docName === docName)) return current;
          const next = [
            ...current,
            {
              docName,
              modified: new Date().toISOString(),
              size: 0,
            } satisfies DocEntry,
          ];
          markNextDocumentsAsApplied(next);
          return next;
        });
        navigateTo(docName);
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        pendingCreateRef.current = null;
        setBusyPath(null);
        return;
      }

      const payload = event.isFolder
        ? {
            kind: 'folder' as const,
            fromPath: treeDirectoryPathToFolderPath(sourceTreePath),
            toPath: treeDirectoryPathToFolderPath(destinationTreePath),
          }
        : {
            kind: 'file' as const,
            fromPath: treeFilePathToDocName(sourceTreePath),
            toPath: treeFilePathToDocName(destinationTreePath),
          };

      const res = await fetch('/api/rename-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await parseServerResponse(res, 'Failed to rename path');

      if (!parsed.ok) {
        toast.error(parsed.title);
        setError(parsed.title);
        resetModelToDocuments();
        pendingCreateRef.current = null;
        setBusyPath(null);
        return;
      }

      const success = parseSuccessOrWarn(RenamePathSuccessSchema, parsed.body, 'rename-path', {
        renamed: [],
      });
      await applyRenamedDocuments(success.renamed);
      pendingCreateRef.current = null;
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] rename failed:', err);
      const msg = 'Network error — please try again';
      toast.error(msg);
      setError(msg);
      resetModelToDocuments();
      pendingCreateRef.current = null;
      setBusyPath(null);
    }
  }

  async function handleDropComplete(event: FileTreeDropResult) {
    const operations = event.draggedPaths
      .map((sourcePath) => {
        const destinationTreePath = computeTreeDropDestinationPath(sourcePath, event.target);
        return sourcePath === destinationTreePath ? null : { sourcePath, destinationTreePath };
      })
      .filter((operation) => !!operation);
    if (operations.length === 0) return;

    setBusyPath(operations[0]?.sourcePath ?? null);
    setError(null);

    try {
      let renamed: RenamedDocMapping[] = [];
      for (const operation of operations) {
        const isFolder = operation.sourcePath.endsWith('/');
        const payload = isFolder
          ? {
              kind: 'folder' as const,
              fromPath: treeDirectoryPathToFolderPath(operation.sourcePath),
              toPath: treeDirectoryPathToFolderPath(operation.destinationTreePath),
            }
          : {
              kind: 'file' as const,
              fromPath: treeFilePathToDocName(operation.sourcePath),
              toPath: treeFilePathToDocName(operation.destinationTreePath),
            };

        const res = await fetch('/api/rename-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const parsed = await parseServerResponse(res, 'Failed to move');

        if (!parsed.ok) {
          toast.error(parsed.title);
          setError(parsed.title);
          resetModelToDocuments();
          setBusyPath(null);
          return;
        }
        const success = parseSuccessOrWarn(
          RenamePathSuccessSchema,
          parsed.body,
          'rename-path:drop',
          { renamed: [] },
        );
        renamed = renamed.concat(success.renamed);
      }

      await applyRenamedDocuments(renamed);
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] move failed:', err);
      toast.error('Network error — please try again');
      resetModelToDocuments();
      setBusyPath(null);
    }
  }

  function startCreating(kind: 'file' | 'folder', parentDir: string) {
    try {
      const placeholder = createTreePlaceholder(kind, parentDir, [
        ...treePaths,
        ...folderTreePathsRef.current,
      ]);
      pendingCreateRef.current = { kind, renamePath: placeholder.renamePath };
      model.add(placeholder.addPath);
      model.startRenaming(placeholder.renamePath, { removeIfCanceled: true });
    } catch (err) {
      console.warn('[FileTree] create placeholder failed:', err);
      toast.error('Could not start creating a new item');
    }
  }

  function expandSubtree(treePath: string) {
    const root = folderPathToTreeDirectoryPath(treePath);
    startTransition(() => {
      for (const folderPath of folderTreePathsRef.current) {
        if (folderPath === root || folderPath.startsWith(root)) {
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) {
            item.expand();
          }
        }
      }
    });
  }

  function collapseSubtree(treePath: string) {
    const root = folderPathToTreeDirectoryPath(treePath);
    const activeAncestors = new Set(activeAncestorTreePathsRef.current);
    startTransition(() => {
      for (const folderPath of [...folderTreePathsRef.current].reverse()) {
        if (
          (folderPath === root || folderPath.startsWith(root)) &&
          !activeAncestors.has(folderPath)
        ) {
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) {
            item.collapse();
          }
        }
      }
    });
  }

  useLayoutEffect(() => {
    documentsRef.current = documents;
    activeDocNameRef.current = activeDocName;
    busyPathRef.current = busyPath;
    treePathsRef.current = treePaths;
    folderTreePathsRef.current = folderTreePaths;
    activeAncestorTreePathsRef.current = activeAncestorTreePaths;
    handleSelectionChangeRef.current = (selectedPaths) => {
      if (suppressSelectionRef.current) return;
      const selected = selectedPaths[0];
      if (!selected) return;
      const appPath = treePathToAppPath(selected);
      const isFolder = selected.endsWith('/');
      // Don't navigate to a doc the rest of the app doesn't know about yet.
      // @pierre/trees fires onSelectionChange synchronously when an inline
      // rename commits — the renamed item's path updates in the tree model
      // and the selection follows BEFORE onRename fires our `handleTreeRename`
      // and BEFORE applyRenamedDocuments updates `documents`. Without this
      // guard, the selection-driven navigation opens a HocuspocusProvider
      // for the new docName before the file exists at the new path on disk,
      // which produces an empty server-side Y.Doc that the persistence layer
      // then writes back to disk as an empty file (data-loss bug). Navigation
      // for legitimately-renamed docs is handled in applyRenamedDocuments
      // after the API succeeds, so dropping this transient event is safe.
      if (!isFolder && !documentsRef.current.some((d) => d.docName === appPath)) {
        // Visible at debug level for diagnosis if `documents` is ever stale
        // for a non-rename reason — keeps the rename hot path silent without
        // discarding the signal entirely.
        console.debug('[FileTree] Dropped selection for unknown docName:', appPath);
        return;
      }
      navigateToWithPulse(appPath);
    };
    handleRenameRef.current = handleTreeRename;
    handleDropCompleteRef.current = handleDropComplete;
  });

  useImperativeHandle(ref, () => ({
    startCreating,
    expandAll() {
      startTransition(() => {
        for (const folderPath of folderTreePathsRef.current) {
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) item.expand();
        }
      });
    },
    collapseAll() {
      const activeAncestors = new Set(activeAncestorTreePathsRef.current);
      startTransition(() => {
        for (const folderPath of [...folderTreePathsRef.current].reverse()) {
          if (activeAncestors.has(folderPath)) continue;
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) item.collapse();
        }
      });
    },
  }));

  async function handleDelete(target: FileTreeTarget) {
    setBusyPath(target.path);
    setDeleteTarget(null);

    try {
      const treePath =
        target.kind === 'folder'
          ? folderPathToTreeDirectoryPath(target.path)
          : docNameToTreePath(target.path, target.docExt);
      const res = await fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: target.kind, path: target.path }),
      });
      const parsed = await parseServerResponse(res, 'Failed to delete path');

      if (!parsed.ok) {
        toast.error(parsed.title);
        setBusyPath(null);
        return;
      }

      const success = parseSuccessOrWarn(DeletePathSuccessSchema, parsed.body, 'delete-path', {
        deletedDocNames: [],
      });
      const deletedDocNames = success.deletedDocNames;
      const deleted = new Set(deletedDocNames);
      for (const docName of deleted) closeDocument(docName);

      if (model.getItem(treePath))
        model.remove(treePath, target.kind === 'folder' ? { recursive: true } : undefined);
      setDocuments((current) => {
        const next = applyDeleteToDocuments(current, deletedDocNames);
        markNextDocumentsAsApplied(next);
        return next;
      });
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      const currentActiveDocName = activeDocNameRef.current;
      if (currentActiveDocName && deleted.has(currentActiveDocName)) window.location.hash = '';
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] delete failed:', err);
      toast.error('Network error — please try again');
      setBusyPath(null);
      resetModelToDocuments();
    }
  }

  function cancelCurrentHoverPrewarm() {
    const current = hoveredPrewarmDocRef.current;
    if (current) cancelHoverPrewarm(current);
    hoveredPrewarmDocRef.current = null;
  }

  function handleTreeMouseMove(event: ReactMouseEvent<HTMLElement>) {
    const path = findTreeItemPath(event.nativeEvent);
    if (!path || path.endsWith('/')) {
      cancelCurrentHoverPrewarm();
      return;
    }
    const docName = treeFilePathToDocName(path);
    if (hoveredPrewarmDocRef.current === docName) return;
    cancelCurrentHoverPrewarm();
    hoveredPrewarmDocRef.current = docName;
    scheduleHoverPrewarm(docName, (nextDocName) => {
      prewarm(nextDocName);
    });
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <span className="select-none text-sidebar-foreground/30 text-sm">Loading...</span>
      </div>
    );
  }

  if (documents.length === 0) {
    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center py-8">
          <span className="select-none text-sidebar-foreground/50 text-sm">{error}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
        <span className="select-none text-sidebar-foreground/30 text-sm">No files yet.</span>
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

  const anyActionBusy = busyPath !== null;
  return (
    <>
      <PierreFileTree
        header={
          error && (
            <span role="alert" className="px-3 pb-1 text-destructive text-xs">
              {error}
            </span>
          )
        }
        model={model}
        style={createFileTreeStyle(resolvedTheme)}
        onMouseMove={handleTreeMouseMove}
        onMouseLeave={cancelCurrentHoverPrewarm}
        renderContextMenu={(item, context) => (
          <FileTreeMenu
            item={item}
            context={context}
            anyActionBusy={anyActionBusy}
            workspace={workspace}
            handoff={handoff}
            model={model}
            onStartCreating={startCreating}
            onDelete={setDeleteTarget}
            onExpandSubtree={expandSubtree}
            onCollapseSubtree={collapseSubtree}
          />
        )}
      />
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !busyPath) setDeleteTarget(null);
        }}
      >
        {deleteTarget && (
          <DeleteConfirmationDialog
            itemName={`${deleteTarget.name}${deleteTarget.kind === 'file' ? (deleteTarget.docExt ?? '.md') : '/'}`}
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
    </>
  );
}

function findTreeItemPath(event: MouseEvent): string | null {
  for (const entry of event.composedPath()) {
    if (entry instanceof HTMLElement && entry.dataset.itemPath) {
      return entry.dataset.itemPath;
    }
  }
  return null;
}
