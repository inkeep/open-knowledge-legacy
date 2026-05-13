import {
  CreateFolderSuccessSchema,
  CreatePageSuccessSchema,
  DeletePathSuccessSchema,
  DocumentListSuccessSchema,
  type HandoffOutcome,
  type HandoffTarget,
  type InstallState,
  type OkignoreBinding,
  RenamePathSuccessSchema,
  WorkspaceSuccessSchema,
} from '@inkeep/open-knowledge-core';
import {
  type ContextMenuItem,
  type ContextMenuOpenContext,
  FILE_TREE_TAG_NAME,
  type FileTreeDropResult,
  type FileTreeRenameEvent,
  type FileTree as PierreFileTreeModel,
  themeToTreeStyles,
} from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import {
  Copy,
  EyeOff,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  Pencil,
  SquarePen,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';
import { __iconNode as botIcon } from 'lucide-react/dist/esm/icons/bot';
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
  fileEntryToTreePath,
  folderPathToTreeDirectoryPath,
  normalizeTreePathForKind,
  relativePathForTreeItem,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocName,
  treeItemToTarget,
  treePathSignature,
  treePathToAppPath,
} from '@/components/file-tree-adapter';
import { buildOkignorePatternFromTarget } from '@/components/file-tree-okignore';
import {
  applyDeleteToDocuments,
  applyRenameToDocuments,
  type FileTreeTarget,
  type RenamedDocMapping,
  type RenamedFolderMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import {
  resolveFileTreeSelection,
  resolveFileTreeSelectionAction,
} from '@/components/file-tree-selection';
import {
  type DocumentEntry,
  type FileEntry,
  isAssetEntry,
  isDocumentEntry,
  isFolderEntry,
} from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import { usePageList } from '@/components/PageListContext';
import {
  appendPattern,
  parseOkignoreDoc,
  serializeOkignoreDoc,
} from '@/components/settings/okignore-doc';
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
import { Skeleton } from '@/components/ui/skeleton';
import { asDirectoryHandle, useSelectionMirror } from '@/components/use-selection-mirror';
import { useDocumentContext } from '@/editor/DocumentContext';
import { docTabId, folderTabId, remapPathForFolderRenames } from '@/editor/editor-tabs';
import { useConfigContext } from '@/lib/config-provider';
import { hashFromDocName, hashFromFolderPath } from '@/lib/doc-hash';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
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

const MARKDOWN_TREE_EXTENSION_PATTERN = /\.(md|mdx)$/i;

function replaceHashWithoutNavigation(hash: string) {
  if (window.location.hash === hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}${hash}`);
}

function parseAlreadyExistsRenamePath(message: string): string | null {
  const match = message.match(/^"(.+)" already exists\.$/);
  return match ? match[1] : null;
}

function markdownTreeExtension(path: string): string | null {
  const match = path.match(MARKDOWN_TREE_EXTENSION_PATTERN);
  return match ? match[0] : null;
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
  return iconNode
    .map(([tag, { key, ...attrs }]) => {
      const attrString = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrString} />`;
    })
    .join('');
}

function createLucideSpriteSymbol(id: string, iconNode: IconNode): string {
  const symbolContent = iconNodeToSvg(iconNode);
  return `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbolContent}</symbol>`;
}

const FILE_TREE_DECORATION_SPRITE_SHEET = `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  ${createLucideSpriteSymbol(LINK_DECORATION_ICON_ID, link2Icon)}
  ${createLucideSpriteSymbol(AGENT_DECORATION_ICON_ID, botIcon)}
</svg>`;

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

interface PendingCreate {
  kind: 'file' | 'folder';
  renamePath: string;
  createdPath: string;
  previousHash: string;
  disposeCommitListener: () => void;
}

interface PendingCreateCleanupOptions {
  updateUi?: boolean;
  restoreLocation?: boolean;
}

interface FileTreeDeleteRequest {
  targets: FileTreeTarget[];
}

interface WorkspaceInfo {
  contentDir: string;
  pathSeparator: '/' | '\\';
}

function revealInFileManagerLabel(platform: 'darwin' | 'win32' | 'linux'): string {
  if (platform === 'darwin') return 'Reveal in Finder';
  if (platform === 'win32') return 'Reveal in File Explorer';
  return 'Open Containing Folder';
}

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
  okignoreBinding: OkignoreBinding | null;
  onStartCreating: (kind: 'file' | 'folder', parentDir: string) => void;
  /** Open NewItemDialog for the given parent dir so the template picker is
   *  reachable. Sibling to `onStartCreating`'s inline-rename fast path. */
  onStartCreatingFromTemplate: (parentDir: string) => void;
  onDelete: (targets: FileTreeTarget[]) => void;
  onExpandSubtree: (treePath: string) => void;
  onCollapseSubtree: (treePath: string) => void;
  isAsset: boolean;
  isAssetTreePath: (treePath: string) => boolean;
}

function treePathToTarget(treePath: string): FileTreeTarget {
  return treeItemToTarget({
    kind: treePath.endsWith('/') ? 'directory' : 'file',
    name: treePath,
    path: treePath,
  });
}

function isTreePathInsideFolder(treePath: string, folderTreePath: string): boolean {
  return treePath !== folderTreePath && treePath.startsWith(folderTreePath);
}

function selectedTreePathsToDeleteTargets(
  selectedTreePaths: readonly string[],
  isAssetTreePath: (treePath: string) => boolean,
): FileTreeTarget[] {
  const uniqueDeletablePaths = [...new Set(selectedTreePaths)].filter(
    (treePath) => !isAssetTreePath(treePath),
  );
  const selectedFolderPaths = uniqueDeletablePaths.filter((treePath) => treePath.endsWith('/'));
  return uniqueDeletablePaths
    .filter(
      (treePath) =>
        !selectedFolderPaths.some((folderPath) => isTreePathInsideFolder(treePath, folderPath)),
    )
    .map(treePathToTarget);
}

function isPathAtOrInsideFolder(path: string, folderPath: string): boolean {
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

function collectTabsToCloseForDelete(
  targets: readonly FileTreeTarget[],
  documents: readonly FileEntry[],
  folderTreePaths: readonly string[],
): { docNames: Set<string>; folderPaths: Set<string> } {
  const docNames = new Set<string>();
  const folderPaths = new Set<string>();

  for (const target of targets) {
    if (target.kind === 'file') {
      docNames.add(target.path);
      continue;
    }

    folderPaths.add(target.path);
    for (const entry of documents) {
      if (isDocumentEntry(entry) && entry.docName.startsWith(`${target.path}/`)) {
        docNames.add(entry.docName);
      }
    }
    for (const treePath of folderTreePaths) {
      const folderPath = treeDirectoryPathToFolderPath(treePath);
      if (isPathAtOrInsideFolder(folderPath, target.path)) {
        folderPaths.add(folderPath);
      }
    }
  }

  return { docNames, folderPaths };
}

function deleteTargetCoversPendingCreate(target: FileTreeTarget, pending: PendingCreate): boolean {
  if (target.kind === 'file') {
    return pending.kind === 'file' && target.path === pending.createdPath;
  }
  return isPathAtOrInsideFolder(pending.createdPath, target.path);
}

function FileTreeMenu({
  item,
  context,
  anyActionBusy,
  workspace,
  handoff,
  model,
  okignoreBinding,
  onStartCreating,
  onStartCreatingFromTemplate,
  onDelete,
  onExpandSubtree,
  onCollapseSubtree,
  isAsset,
  isAssetTreePath,
}: FileTreeMenuProps) {
  const target = treeItemToTarget(item);
  const isFolder = item.kind === 'directory';
  const canHide = !isAsset && okignoreBinding !== null;
  const hideLabel = isFolder ? 'Hide files in this folder' : 'Hide this file';
  const selectedTreePaths = model.getSelectedPaths();
  const selectedDeleteTargets = selectedTreePaths.includes(target.treePath)
    ? selectedTreePathsToDeleteTargets(selectedTreePaths, isAssetTreePath)
    : [];
  const deleteTargets = selectedDeleteTargets.length > 1 ? selectedDeleteTargets : [target];
  const deleteLabel = deleteTargets.length > 1 ? `Delete ${deleteTargets.length} Items` : 'Delete';
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
                onStartCreatingFromTemplate(treeDirectoryPathToFolderPath(item.path));
              }}
            >
              <FilePlus aria-hidden="true" />
              New from template
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
        {!isAsset ? (
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
        ) : null}
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
        {!isFolder && !isAsset && (
          <OpenInAgentContextSubmenu
            input={handoffInput}
            installStates={handoff.installStates}
            isElectronHost={handoff.isElectronHost}
            dispatch={handoff.dispatch}
          />
        )}
        {!isAsset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="file-tree-menu-hide"
              disabled={!canHide}
              onSelect={() => {
                if (!okignoreBinding) return;
                close();
                const pattern = buildOkignorePatternFromTarget(target);
                const current = okignoreBinding.current();
                const next = serializeOkignoreDoc(
                  appendPattern(parseOkignoreDoc(current), pattern),
                );
                okignoreBinding.patch(next);
              }}
            >
              <EyeOff aria-hidden="true" />
              {hideLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={anyActionBusy}
              onSelect={() => {
                close();
                onDelete(deleteTargets);
              }}
            >
              <Trash2 aria-hidden="true" />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface FileTreeHandle {
  startCreating(kind: 'file' | 'folder', parentDir: string): void;
  /** Open NewItemDialog at the given parentDir so the template picker is
   *  reachable from any toolbar / sidebar surface. Sibling to
   *  `startCreating`'s inline-rename fast path. */
  startCreatingFromTemplate(parentDir: string): void;
  expandAll(): void;
  collapseAll(): void;
  getFolderState(): { folderCount: number; expandedCount: number };
  subscribe(listener: () => void): () => void;
}

export function FileTree({ ref }: { ref?: Ref<FileTreeHandle | null> }) {
  const {
    activeDocName,
    activeTarget,
    closeTabs,
    closeTab,
    closeDocument,
    closeAndClearForRename,
    isNewTabActive,
    openTarget,
    prewarm,
    remapTabsForRename,
  } = useDocumentContext();
  const { notifySidebarFileSelected } = useSidebar();
  const { resolvedTheme } = useTheme();
  const { addPage } = usePageList();
  function navigateToWithPulse(targetPath: string) {
    openTarget(
      {
        kind: 'doc',
        target: targetPath,
        docName: targetPath,
      },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(hashFromDocName(targetPath));
    notifySidebarFileSelected();
  }
  function navigateToFolderWithPulse(folderPath: string) {
    const nextHash = hashFromFolderPath(folderPath);
    openTarget(
      { kind: 'folder', target: folderPath, folderPath },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(nextHash);
    notifySidebarFileSelected();
  }
  const [documents, setDocuments] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<FileTreeDeleteRequest | null>(null);
  const [newItemRequest, setNewItemRequest] = useState<{ parentDir: string } | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  const documentsRef = useRef(documents);
  function activateTreePath(treePath: string, entries: readonly FileEntry[] = documents) {
    const action = resolveFileTreeSelectionAction(treePath, entries);
    if (action.kind === 'none') {
      console.debug(
        '[FileTree] Dropped selection for unknown docName:',
        treePathToAppPath(treePath),
      );
      return;
    }
    if (action.kind === 'asset') {
      openTarget(
        {
          kind: 'asset',
          target: action.path,
          assetPath: action.path,
          mediaKind: action.mediaKind,
        },
        { tabBehavior: 'replace-active' },
      );
      replaceHashWithoutNavigation(action.hash);
      notifySidebarFileSelected();
      return;
    }
    if (action.kind === 'folder') {
      navigateToFolderWithPulse(action.path);
      return;
    }
    navigateToWithPulse(action.path);
  }
  const activeDocNameRef = useRef(activeDocName);
  const assetTreePaths = new Set(
    documents.filter(isAssetEntry).map((entry) => fileEntryToTreePath(entry)),
  );
  const assetTreePathsRef = useRef(assetTreePaths);
  const activeAncestorTreePathsRef = useRef<string[]>([]);
  const pendingCreateRef = useRef<PendingCreate | null>(null);
  const cleanupPendingCreateRef = useRef<
    (pending: PendingCreate, options?: PendingCreateCleanupOptions) => Promise<void>
  >(async () => {});
  const skipNextResetSignatureRef = useRef<string | null>(null);
  const hoveredPrewarmDocRef = useRef<string | null>(null);
  const suppressSelectionRef = useRef(false);
  const busyPathRef = useRef<string | null>(null);
  const fileTreeHostRef = useRef<HTMLDivElement | null>(null);
  const handleSelectionChangeRef = useRef<(selectedPaths: readonly string[]) => void>(() => {});
  const handleRenameRef = useRef<(event: FileTreeRenameEvent) => void>(() => {});
  const handleRenameErrorRef = useRef<(message: string) => void>((message) => toast.error(message));
  const handleDropCompleteRef = useRef<(event: FileTreeDropResult) => void>(() => {});
  const activeTargetRef = useRef(activeTarget);

  const {
    selectedFilePath,
    selectedFolderPath,
    navigationPath: activeNavigationPath,
  } = resolveFileTreeSelection(activeTarget, isNewTabActive ? null : activeDocName);
  const activeTreePath = selectedFilePath
    ? docNameToTreePath(
        selectedFilePath,
        documents.find(
          (d): d is DocumentEntry => isDocumentEntry(d) && d.docName === selectedFilePath,
        )?.docExt,
      )
    : selectedFolderPath
      ? folderPathToTreeDirectoryPath(selectedFolderPath)
      : activeTarget?.kind === 'asset'
        ? activeTarget.assetPath
        : null;

  const handoffInstallStates = useInstalledAgents().states;
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoff = {
    installStates: handoffInstallStates,
    isElectronHost: typeof window !== 'undefined' && window.okDesktop != null,
    dispatch: dispatchHandoff,
  };
  const { okignoreBinding } = useConfigContext();

  const isAvailable = () => busyPathRef.current === null;

  const { model } = useFileTree({
    paths: [],
    flattenEmptyDirectories: false,
    initialExpansion: 'closed',
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
      canDrag: isAvailable,
      canDrop: isAvailable,
      onDropComplete: (event) => handleDropCompleteRef.current(event),
      onDropError: (message) => {
        toast.error(message);
      },
    },
    renaming: {
      canRename: isAvailable,
      onRename: (event) => handleRenameRef.current(event),
      onError: (message) => handleRenameErrorRef.current(message),
    },
    onSelectionChange: (selectedPaths) => handleSelectionChangeRef.current(selectedPaths),
    renderRowDecoration: ({ item }) => {
      if (item.kind !== 'file') return null;
      const doc = documentsRef.current.find(
        (entry): entry is DocumentEntry =>
          isDocumentEntry(entry) && docNameToTreePath(entry.docName, entry.docExt) === item.path,
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

  function normalizeSelectionPath(treePath: string): string {
    const item = model.getItem(treePath) ?? model.getItem(folderPathToTreeDirectoryPath(treePath));
    if (item?.isDirectory()) {
      return folderPathToTreeDirectoryPath(treeDirectoryPathToFolderPath(item.getPath()));
    }
    return treePath;
  }

  const treePaths = documentsToTreePaths(documents);
  const treePathsSignature = treePathSignature(treePaths);
  const treePathsRef = useRef(treePaths);
  const folderTreePaths = collectTreeFolderPathsFromDocuments(documents);
  const folderTreePathsRef = useRef(folderTreePaths);

  const activeAncestorTreePaths = selectedFolderPath
    ? computeTreeAncestorPaths(folderPathToTreeDirectoryPath(selectedFolderPath)).slice(0, -1)
    : computeTreeAncestorPaths(activeTreePath ?? activeNavigationPath);
  const activeAncestorTreePathsSignature = activeAncestorTreePaths.join('\0');

  const collectExpandedFolderTreePaths = () => {
    const expanded = new Set<string>();
    for (const folderPath of folderTreePathsRef.current) {
      const item = asDirectoryHandle(model.getItem(folderPath));
      if (item?.isExpanded()) {
        expanded.add(folderPath);
      }
    }
    return expanded;
  };

  const expandedPathsForReset = (nextDocuments?: readonly FileEntry[]) => {
    const nextFolderPaths = new Set(
      collectTreeFolderPathsFromDocuments(nextDocuments ?? documentsRef.current),
    );
    const expanded = collectExpandedFolderTreePaths();
    for (const ancestor of activeAncestorTreePathsRef.current) {
      expanded.add(ancestor);
    }
    return [...expanded].filter((path) => nextFolderPaths.has(path));
  };

  const resetModelToDocuments = (nextDocuments?: readonly FileEntry[]) => {
    const nextPaths = documentsToTreePaths(nextDocuments ?? documentsRef.current);
    model.resetPaths(nextPaths, {
      initialExpandedPaths: expandedPathsForReset(nextDocuments),
    });
  };

  const markNextDocumentsAsApplied = (nextDocuments: readonly FileEntry[]) => {
    skipNextResetSignatureRef.current = documentsTreePathSignature(nextDocuments);
  };

  const isAssetTreePath = (treePath: string) => assetTreePathsRef.current.has(treePath);

  function recoverMarkdownRenameConflict(message: string): boolean {
    const bareDestinationPath = parseAlreadyExistsRenamePath(message);
    if (!bareDestinationPath || markdownTreeExtension(bareDestinationPath)) return false;

    const sourceTreePath = model.getFocusedPath() ?? model.getSelectedPaths()[0] ?? null;
    if (!sourceTreePath || sourceTreePath.endsWith('/') || isAssetTreePath(sourceTreePath)) {
      return false;
    }

    const sourceExtension = markdownTreeExtension(sourceTreePath);
    if (!sourceExtension) return false;

    const folderTreePath = folderPathToTreeDirectoryPath(bareDestinationPath);
    if (!folderTreePathsRef.current.includes(folderTreePath)) return false;

    const destinationTreePath = `${bareDestinationPath}${sourceExtension}`;
    if (treePathsRef.current.includes(destinationTreePath)) return false;

    const event = {
      sourcePath: sourceTreePath,
      destinationPath: destinationTreePath,
      isFolder: false,
    } satisfies FileTreeRenameEvent;

    void handleTreeRename(event);
    model.move(sourceTreePath, destinationTreePath);
    return true;
  }

  const clearPendingCreate = (pending?: PendingCreate | null) => {
    const current = pending ?? pendingCreateRef.current;
    if (!current || pendingCreateRef.current !== current) return;
    current.disposeCommitListener();
    pendingCreateRef.current = null;
  };

  async function cleanupPendingCreate(
    pending: PendingCreate,
    options: PendingCreateCleanupOptions = {},
  ) {
    const updateUi = options.updateUi ?? true;
    const restoreLocation = options.restoreLocation ?? updateUi;

    clearPendingCreate(pending);
    if (updateUi) setBusyPath(pending.renamePath);

    try {
      const res = await fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: pending.kind, path: pending.createdPath }),
      });
      if (!res.ok && res.status !== 404) {
        const parsed = await parseServerResponse(res, `Failed to clean up pending ${pending.kind}`);
        if (parsed.ok) return;
        const message = `${parsed.title} - ${pending.kind} "${pending.createdPath}" still exists on disk`;
        if (updateUi) {
          toast.error(message);
        } else {
          console.warn(`[FileTree] cleanup pending create failed: ${message}`);
        }
        if (updateUi) {
          setBusyPath(null);
          resetModelToDocuments();
        }
        return;
      }
    } catch (err) {
      console.warn('[FileTree] cleanup pending create failed:', err);
      if (updateUi) {
        toast.error(
          `Network error - ${pending.kind} "${pending.createdPath}" still exists on disk`,
        );
      }
      if (updateUi) {
        setBusyPath(null);
        resetModelToDocuments();
      }
      return;
    }

    if (updateUi) {
      if (pending.kind === 'file') {
        closeDocument(pending.createdPath);
      } else {
        closeTab(folderTabId(pending.createdPath));
      }
    }
    if (updateUi) {
      setDocuments((current) => {
        const next = applyDeleteToDocuments(
          current,
          pending.kind === 'file' ? [pending.createdPath] : [],
          pending.kind === 'folder' ? pending.createdPath : undefined,
        );
        markNextDocumentsAsApplied(next);
        return next;
      });
    }
    emitDocumentsChanged(['files', 'backlinks', 'graph']);
    if (restoreLocation) window.location.hash = pending.previousHash;
    if (updateUi) setBusyPath(null);
  }

  useEffect(() => {
    return () => {
      const pending = pendingCreateRef.current;
      if (pending) {
        void cleanupPendingCreateRef
          .current(pending, {
            restoreLocation: false,
            updateUi: false,
          })
          .catch((err) => {
            console.warn('[FileTree] unmount cleanup failed:', err);
          });
      }
    };
  }, []);

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
            setDocuments(success.data.documents as unknown as FileEntry[]);
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
        const data = await res.json();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: expandedPathsForReset reads refs; model + treePathsSignature are the reset triggers.
  useEffect(() => {
    if (skipNextResetSignatureRef.current === treePathsSignature) {
      skipNextResetSignatureRef.current = null;
      return;
    }
    model.resetPaths(treePathsRef.current, {
      initialExpandedPaths: expandedPathsForReset(),
    });
  }, [model, treePathsSignature]);

  useSelectionMirror(model, activeTreePath, activeAncestorTreePathsSignature, suppressSelectionRef);

  useEffect(() => {
    return model.subscribe(() => {
      if (model.isSearchOpen()) return;
      for (const ancestor of activeAncestorTreePathsRef.current) {
        const item = asDirectoryHandle(model.getItem(ancestor));
        if (item && !item.isExpanded()) {
          item.expand();
        }
      }
    });
  }, [model]);

  useEffect(() => {
    return model.onMutation('remove', (event) => {
      const pending = pendingCreateRef.current;
      if (!pending || event.path !== pending.renamePath) return;
      void cleanupPendingCreateRef.current(pending);
    });
  }, [model]);

  const applyRenamedDocuments = async (
    renamed: RenamedDocMapping[],
    renamedFolders: RenamedFolderMapping[] = [],
    activeBeforeRename?: { docName: string | null; folderPath: string | null },
  ) => {
    const currentActiveDocName = activeBeforeRename?.docName ?? activeDocNameRef.current;
    const nextActiveDocName = remapActiveDocName(currentActiveDocName, renamed);
    const currentActiveFolderPath =
      activeBeforeRename?.folderPath ??
      (activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null);
    const nextActiveFolderPath = currentActiveFolderPath
      ? remapPathForFolderRenames(currentActiveFolderPath, renamedFolders)
      : null;

    await Promise.all(
      renamed.flatMap((entry) => [
        closeAndClearForRename(entry.fromDocName),
        closeAndClearForRename(entry.toDocName),
      ]),
    );
    for (const entry of renamed) {
      addPage(entry.toDocName);
    }
    remapTabsForRename(renamed, renamedFolders);

    setDocuments((current) => {
      const next = applyRenameToDocuments(current, renamed, renamedFolders);
      markNextDocumentsAsApplied(next);
      return next;
    });

    if (
      currentActiveFolderPath &&
      nextActiveFolderPath &&
      nextActiveFolderPath !== currentActiveFolderPath
    ) {
      navigateToFolderWithPulse(nextActiveFolderPath);
    } else if (nextActiveDocName && nextActiveDocName !== currentActiveDocName) {
      window.location.hash = hashFromDocName(nextActiveDocName);
    }
    emitDocumentsChanged(['files', 'backlinks', 'graph']);
  };

  async function handleTreeRename(event: FileTreeRenameEvent) {
    const sourceTreePath = normalizeTreePathForKind(event.sourcePath, event.isFolder);
    const destinationTreePath = normalizeTreePathForKind(event.destinationPath, event.isFolder);

    setBusyPath(sourceTreePath);
    setError(null);

    try {
      if (!event.isFolder && isAssetTreePath(sourceTreePath)) {
        toast.error('Assets cannot be renamed from the sidebar');
        resetModelToDocuments();
        clearPendingCreate();
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
      const activeBeforeRename = {
        docName: activeDocNameRef.current,
        folderPath:
          activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
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
        const pending = pendingCreateRef.current;
        if (pending && pending.renamePath === sourceTreePath) {
          await cleanupPendingCreate(pending);
        } else {
          clearPendingCreate();
        }
        setBusyPath(null);
        return;
      }

      const success = parseSuccessOrWarn(RenamePathSuccessSchema, parsed.body, 'rename-path', {
        renamed: [],
      });
      await applyRenamedDocuments(
        success.renamed,
        event.isFolder
          ? [
              {
                fromPath: treeDirectoryPathToFolderPath(sourceTreePath),
                toPath: treeDirectoryPathToFolderPath(destinationTreePath),
              },
            ]
          : [],
        activeBeforeRename,
      );
      clearPendingCreate();
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] rename failed:', err);
      const msg = 'Network error — please try again';
      toast.error(msg);
      setError(msg);
      resetModelToDocuments();
      const pending = pendingCreateRef.current;
      if (pending && pending.renamePath === sourceTreePath) {
        await cleanupPendingCreate(pending);
      } else {
        clearPendingCreate();
      }
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

    if (operations.some((operation) => isAssetTreePath(operation.sourcePath))) {
      toast.error('Assets cannot be moved from the sidebar');
      resetModelToDocuments();
      return;
    }

    setBusyPath(operations[0]?.sourcePath ?? null);
    setError(null);

    try {
      let renamed: RenamedDocMapping[] = [];
      const renamedFolders: RenamedFolderMapping[] = [];
      const activeBeforeRename = {
        docName: activeDocNameRef.current,
        folderPath:
          activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
      };
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
        if (isFolder) {
          renamedFolders.push({
            fromPath: treeDirectoryPathToFolderPath(operation.sourcePath),
            toPath: treeDirectoryPathToFolderPath(operation.destinationTreePath),
          });
        }
      }

      await applyRenamedDocuments(renamed, renamedFolders, activeBeforeRename);
      setBusyPath(null);
    } catch (err) {
      console.warn('[FileTree] move failed:', err);
      toast.error('Network error — please try again');
      resetModelToDocuments();
      setBusyPath(null);
    }
  }

  function startCreatingFromTemplate(parentDir: string) {
    setNewItemRequest({ parentDir });
  }

  async function startCreating(kind: 'file' | 'folder', parentDir: string) {
    if (busyPathRef.current) return;

    const pendingCreate = pendingCreateRef.current;
    if (pendingCreate) {
      clearPendingCreate(pendingCreate);
    }

    try {
      const placeholder = createTreePlaceholder(kind, parentDir, [
        ...treePaths,
        ...folderTreePathsRef.current,
      ]);
      setBusyPath(placeholder.renamePath);
      busyPathRef.current = placeholder.renamePath;
      const previousHash = window.location.hash;

      let createdPath: string;
      if (kind === 'file') {
        const createPath = createPagePathFromTreeDestination('file', placeholder.addPath);
        const res = await fetch('/api/create-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: createPath }),
        });
        const parsed = await parseServerResponse(res, `Failed to create file`);

        if (!parsed.ok) {
          toast.error(parsed.title);
          setError(parsed.title);
          setBusyPath(null);
          busyPathRef.current = null;
          return;
        }

        const fallbackDocName = treeFilePathToDocName(createPath);
        const success = parseSuccessOrWarn(CreatePageSuccessSchema, parsed.body, 'create-page', {
          docName: fallbackDocName,
        });
        const docName = success.docName;
        createdPath = docName;
        const docExt = createPath.toLowerCase().endsWith('.mdx') ? '.mdx' : '.md';
        setDocuments((current) => {
          if (current.some((entry) => isDocumentEntry(entry) && entry.docName === docName)) {
            return current;
          }
          const next = [
            ...current,
            {
              kind: 'document',
              docName,
              docExt,
              modified: new Date().toISOString(),
              size: 0,
            } satisfies FileEntry,
          ];
          markNextDocumentsAsApplied(next);
          return next;
        });
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        navigateToWithPulse(docName);
      } else {
        const folderPath = treeDirectoryPathToFolderPath(placeholder.addPath);
        const res = await fetch('/api/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folderPath }),
        });
        const parsed = await parseServerResponse(res, `Failed to create folder`);

        if (!parsed.ok) {
          toast.error(parsed.title);
          setError(parsed.title);
          setBusyPath(null);
          busyPathRef.current = null;
          return;
        }

        const success = parseSuccessOrWarn(
          CreateFolderSuccessSchema,
          parsed.body,
          'create-folder',
          { path: folderPath },
        );
        createdPath = success.path;
        setDocuments((current) => {
          if (current.some((entry) => isFolderEntry(entry) && entry.path === createdPath)) {
            return current;
          }
          const next = [
            ...current,
            {
              kind: 'folder',
              path: createdPath,
              modified: new Date().toISOString(),
              size: 0,
            } satisfies FileEntry,
          ];
          markNextDocumentsAsApplied(next);
          return next;
        });
        emitDocumentsChanged(['files']);
        navigateToFolderWithPulse(createdPath);
      }

      let disposed = false;
      const handleCommitKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        const pending = pendingCreateRef.current;
        if (!pending || pending.renamePath !== placeholder.renamePath) return;
        queueMicrotask(() => clearPendingCreate(pending));
      };
      const disposeCommitListener = () => {
        if (disposed) return;
        disposed = true;
        document.removeEventListener('keydown', handleCommitKeyDown, true);
      };
      document.addEventListener('keydown', handleCommitKeyDown, true);
      pendingCreateRef.current = {
        kind,
        renamePath: placeholder.renamePath,
        createdPath,
        previousHash,
        disposeCommitListener,
      };
      setBusyPath(null);
      busyPathRef.current = null;
      model.add(placeholder.addPath);
      model.startRenaming(placeholder.renamePath, { removeIfCanceled: true });
    } catch (err) {
      console.warn('[FileTree] create placeholder failed:', err);
      toast.error('Could not start creating a new item');
      const pending = pendingCreateRef.current;
      if (pending) {
        await cleanupPendingCreate(pending);
      } else {
        clearPendingCreate();
      }
      setBusyPath(null);
      busyPathRef.current = null;
      resetModelToDocuments();
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
    activeTargetRef.current = activeTarget;
    assetTreePathsRef.current = assetTreePaths;
    busyPathRef.current = busyPath;
    treePathsRef.current = treePaths;
    folderTreePathsRef.current = folderTreePaths;
    activeAncestorTreePathsRef.current = activeAncestorTreePaths;
    cleanupPendingCreateRef.current = cleanupPendingCreate;
    handleSelectionChangeRef.current = (selectedPaths) => {
      if (suppressSelectionRef.current) return;
      if (selectedPaths.length !== 1) return;
      const selected = selectedPaths[0];
      if (selected) activateTreePath(normalizeSelectionPath(selected), documents);
    };
    handleRenameErrorRef.current = (message) => {
      if (recoverMarkdownRenameConflict(message)) return;
      toast.error(message);
    };
    handleRenameRef.current = handleTreeRename;
    handleDropCompleteRef.current = handleDropComplete;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'a') {
        return;
      }
      if (isEditableKeyboardTarget(event.target)) return;

      const host = fileTreeHostRef.current;
      const target = event.target;
      const activeElement = document.activeElement;
      const eventStartedInTree = target instanceof Node && host?.contains(target);
      const focusIsInTree = activeElement instanceof Node && host?.contains(activeElement);
      if (!eventStartedInTree && !focusIsInTree) return;

      const selectedPaths = new Set([...folderTreePathsRef.current, ...treePathsRef.current]);
      suppressSelectionRef.current = true;
      for (const treePath of selectedPaths) {
        if (!treePath || assetTreePathsRef.current.has(treePath)) continue;
        model.getItem(treePath)?.select();
      }
      queueMicrotask(() => {
        suppressSelectionRef.current = false;
      });
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [model]);

  useEffect(() => {
    if (loading || documents.length === 0) return;
    const shadow = fileTreeHostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const toTitle = (treePath: string) =>
      treePath.endsWith('/') ? treePath.slice(0, -1) : treePath;
    const stampTitles = () => {
      for (const row of shadow.querySelectorAll<HTMLElement>('[data-item-path]')) {
        const treePath = row.dataset.itemPath;
        if (!treePath) continue;
        const title = toTitle(treePath);
        if (row.title !== title) row.title = title;
      }
      const anchor = shadow.querySelector<HTMLElement>('[data-type="context-menu-anchor"]');
      if (anchor) {
        const hoveredPath = shadow.querySelector<HTMLElement>(
          '[data-item-context-hover="true"][data-item-path]',
        )?.dataset.itemPath;
        const title = hoveredPath ? toTitle(hoveredPath) : '';
        if (anchor.title !== title) anchor.title = title;
      }
    };
    stampTitles();
    const observer = new MutationObserver(stampTitles);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-item-path', 'data-item-context-hover'],
    });
    return () => observer.disconnect();
  }, [loading, documents.length]);

  const folderStateCacheRef = useRef<{ folderCount: number; expandedCount: number }>({
    folderCount: 0,
    expandedCount: 0,
  });

  const startCreatingRef = useRef(startCreating);
  const startCreatingFromTemplateRef = useRef(startCreatingFromTemplate);
  useEffect(() => {
    startCreatingRef.current = startCreating;
    startCreatingFromTemplateRef.current = startCreatingFromTemplate;
  });

  useImperativeHandle(
    ref,
    () => ({
      startCreating(kind, parentDir) {
        void startCreatingRef.current(kind, parentDir);
      },
      startCreatingFromTemplate(parentDir) {
        startCreatingFromTemplateRef.current(parentDir);
      },
      expandAll() {
        startTransition(() => {
          for (const folderPath of folderTreePathsRef.current) {
            const item = asDirectoryHandle(model.getItem(folderPath));
            if (item) {
              item.expand();
            }
          }
        });
      },
      collapseAll() {
        const activeAncestors = new Set(activeAncestorTreePathsRef.current);
        startTransition(() => {
          for (const folderPath of [...folderTreePathsRef.current].reverse()) {
            if (activeAncestors.has(folderPath)) continue;
            const item = asDirectoryHandle(model.getItem(folderPath));
            if (item) {
              item.collapse();
            }
          }
        });
      },
      getFolderState() {
        const paths = folderTreePathsRef.current;
        let expandedCount = 0;
        for (const p of paths) {
          if (asDirectoryHandle(model.getItem(p))?.isExpanded()) expandedCount++;
        }
        const folderCount = paths.length;
        const cached = folderStateCacheRef.current;
        if (cached.folderCount === folderCount && cached.expandedCount === expandedCount) {
          return cached;
        }
        const next = { folderCount, expandedCount };
        folderStateCacheRef.current = next;
        return next;
      },
      subscribe(listener: () => void) {
        return model.subscribe(listener);
      },
    }),
    [model],
  );

  async function handleDeleteTargets(targets: FileTreeTarget[]) {
    const firstTarget = targets[0];
    if (!firstTarget) return;
    setBusyPath(firstTarget.path);
    setDeleteRequest(null);

    try {
      const tabsToClose = collectTabsToCloseForDelete(
        targets,
        documentsRef.current,
        folderTreePathsRef.current,
      );
      const deletedDocNames: string[] = [];
      const deletedFolderPaths: string[] = [];
      const successfulTargets: FileTreeTarget[] = [];
      for (const target of targets) {
        setBusyPath(target.path);
        const res = await fetch('/api/delete-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: target.kind, path: target.path }),
        });
        const parsed = await parseServerResponse(res, 'Failed to delete path');

        if (!parsed.ok) {
          const partialTabsToClose = collectTabsToCloseForDelete(
            successfulTargets,
            documentsRef.current,
            folderTreePathsRef.current,
          );
          const partialDeleted = new Set([...partialTabsToClose.docNames, ...deletedDocNames]);
          const partialDeletedFolders = new Set([
            ...partialTabsToClose.folderPaths,
            ...deletedFolderPaths,
          ]);
          closeTabs([
            ...[...partialDeleted].map((docName) => docTabId(docName)),
            ...[...partialDeletedFolders].map((folderPath) => folderTabId(folderPath)),
          ]);
          await Promise.all([...partialDeleted].map((docName) => closeAndClearForRename(docName)));
          toast.error(parsed.title);
          setBusyPath(null);
          resetModelToDocuments();
          emitDocumentsChanged(['files', 'backlinks', 'graph']);
          return;
        }

        const success = parseSuccessOrWarn(DeletePathSuccessSchema, parsed.body, 'delete-path', {
          deletedDocNames: [],
        });
        deletedDocNames.push(...success.deletedDocNames);
        if (target.kind === 'folder') {
          deletedFolderPaths.push(target.path);
        }
        successfulTargets.push(target);
      }

      const pendingCreate = pendingCreateRef.current;
      if (
        pendingCreate &&
        targets.some((target) => deleteTargetCoversPendingCreate(target, pendingCreate))
      ) {
        if (pendingCreate.kind === 'file') {
          tabsToClose.docNames.add(pendingCreate.createdPath);
        } else {
          tabsToClose.folderPaths.add(pendingCreate.createdPath);
        }
        clearPendingCreate(pendingCreate);
      }

      const deleted = new Set([...tabsToClose.docNames, ...deletedDocNames]);
      const deletedFolders = new Set([...tabsToClose.folderPaths, ...deletedFolderPaths]);
      closeTabs([
        ...[...deleted].map((docName) => docTabId(docName)),
        ...[...deletedFolders].map((folderPath) => folderTabId(folderPath)),
      ]);
      await Promise.all([...deleted].map((docName) => closeAndClearForRename(docName)));

      for (const target of targets) {
        const treePath =
          target.kind === 'folder'
            ? folderPathToTreeDirectoryPath(target.path)
            : docNameToTreePath(target.path, target.docExt);
        if (model.getItem(treePath)) {
          model.remove(treePath, target.kind === 'folder' ? { recursive: true } : undefined);
        }
      }
      setDocuments((current) => {
        let next = applyDeleteToDocuments(current, [...deleted]);
        for (const folderPath of deletedFolders) {
          next = applyDeleteToDocuments(next, [], folderPath);
        }
        markNextDocumentsAsApplied(next);
        return next;
      });
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
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
    const entry = documentsRef.current.find((item) => fileEntryToTreePath(item) === path);
    if (entry && isAssetEntry(entry)) {
      cancelCurrentHoverPrewarm();
      return;
    }
    if (hoveredPrewarmDocRef.current === docName) return;
    cancelCurrentHoverPrewarm();
    hoveredPrewarmDocRef.current = docName;
    scheduleHoverPrewarm(docName, (nextDocName) => prewarm(nextDocName));
  }

  function handleTreeClickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const item = findTreeItemElement(event.nativeEvent);
    if (!item || item.getAttribute('aria-selected') !== 'true') return;

    const rawPath = item.dataset.itemPath;
    if (!rawPath) return;

    const path =
      item.dataset.itemType === 'folder' ? folderPathToTreeDirectoryPath(rawPath) : rawPath;
    if (model.getSelectedPaths().length !== 1) return;

    if (item.dataset.itemType === 'folder') {
      const folderPath = treeDirectoryPathToFolderPath(path);
      if (window.location.hash === hashFromFolderPath(folderPath)) return;
      queueMicrotask(() => navigateToFolderWithPulse(folderPath));
      return;
    }

    const docName = treeFilePathToDocName(path);
    if (window.location.hash === hashFromDocName(docName)) return;
    queueMicrotask(() => activateTreePath(path));
  }

  if (loading) {
    return <FileTreeSkeleton />;
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
  const primaryDeleteTarget = deleteRequest?.targets[0] ?? null;
  return (
    <>
      <div ref={fileTreeHostRef} className="flex min-h-0 flex-1 flex-col">
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
          onClickCapture={handleTreeClickCapture}
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
              okignoreBinding={okignoreBinding}
              onStartCreating={startCreating}
              onStartCreatingFromTemplate={startCreatingFromTemplate}
              onDelete={(targets) => setDeleteRequest({ targets })}
              onExpandSubtree={expandSubtree}
              onCollapseSubtree={collapseSubtree}
              isAsset={assetTreePaths.has(item.path)}
              isAssetTreePath={isAssetTreePath}
            />
          )}
        />
      </div>
      <Dialog
        open={!!deleteRequest}
        onOpenChange={(open) => {
          if (!open && !busyPath) setDeleteRequest(null);
        }}
      >
        {deleteRequest && primaryDeleteTarget && (
          <DeleteConfirmationDialog
            itemName={
              deleteRequest.targets.length === 1
                ? `${primaryDeleteTarget.name}${primaryDeleteTarget.kind === 'file' ? (primaryDeleteTarget.docExt ?? '.md') : '/'}`
                : undefined
            }
            isSubmitting={busyPath !== null}
            onDelete={() => handleDeleteTargets(deleteRequest.targets)}
            customTitle={deleteRequest.targets.length > 1 ? 'Delete selected items' : undefined}
            customDescription={
              deleteRequest.targets.length > 1
                ? `Are you sure you want to delete ${deleteRequest.targets.length} selected items? Folders and all files inside them will be deleted. This action cannot be undone.`
                : primaryDeleteTarget.kind === 'folder'
                  ? `Are you sure you want to delete ${primaryDeleteTarget.name}/ and all files inside? This action cannot be undone.`
                  : undefined
            }
          />
        )}
      </Dialog>
      <NewItemDialog
        open={newItemRequest !== null}
        onOpenChange={(open) => {
          if (!open) setNewItemRequest(null);
        }}
        kind="file"
        initialDir={newItemRequest?.parentDir ?? ''}
      />
    </>
  );
}

function findTreeItemPath(event: MouseEvent): string | null {
  return findTreeItemElement(event)?.dataset.itemPath ?? null;
}

function findTreeItemElement(event: MouseEvent): HTMLElement | null {
  for (const entry of event.composedPath()) {
    if (entry instanceof HTMLElement && entry.dataset.itemPath) {
      return entry;
    }
  }
  return null;
}

const FILE_TREE_SKELETON_ROW_WIDTHS = ['w-3/4', 'w-2/3', 'w-4/5', 'w-1/2', 'w-3/5', 'w-2/3'];

function FileTreeSkeleton() {
  return (
    <div
      className="flex flex-1 flex-col gap-1 px-2 py-2"
      role="status"
      aria-busy="true"
      aria-label="Loading files"
    >
      {FILE_TREE_SKELETON_ROW_WIDTHS.map((width, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static decoration list
          key={index}
          className="flex h-6 items-center gap-2"
        >
          <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}
