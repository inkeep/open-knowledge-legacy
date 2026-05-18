import {
  type Config,
  type ConfigBinding,
  CreateFolderSuccessSchema,
  CreatePageSuccessSchema,
  DeletePathSuccessSchema,
  DocumentListSuccessSchema,
  type HandoffOutcome,
  type HandoffTarget,
  humanFormat,
  type InstallState,
  type OkignoreBinding,
  RenamePathSuccessSchema,
  TrashCleanupSuccessSchema,
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
  Terminal,
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
import {
  applyExtensionBadges,
  FILE_TREE_EXT_BADGE_CSS,
} from '@/components/file-tree-extension-badge';
import { buildOkignorePatternFromTarget } from '@/components/file-tree-okignore';
import {
  applyDeleteToDocuments,
  applyRenameToDocuments,
  type FileTreeTarget,
  planRenameCleanupCalls,
  type RenamedDocMapping,
  type RenamedFolderMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { applyRenameChip, FILE_TREE_RENAME_CHIP_CSS } from '@/components/file-tree-rename-chip';
import { validateAndCoerceRenameDestination } from '@/components/file-tree-rename-validation';
import {
  resolveFileTreeSelection,
  resolveFileTreeSelectionAction,
} from '@/components/file-tree-selection';
import { selectTrashConfirmCopy, trashTargetDisplayName } from '@/components/file-tree-trash-copy';
import {
  type DocumentEntry,
  type FileEntry,
  filterVisibleEntries,
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
import {
  coerceTrashFailureReason,
  type TrashFailedTarget,
  TrashFailureModal,
} from '@/components/TrashFailureModal';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { dispatchOpenInTerminal } from '@/lib/dispatch-open-in-terminal';
import { hashFromDocName, hashFromFolderPath } from '@/lib/doc-hash';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';
import {
  subscribeToFileTreeMenuActionDelete,
  subscribeToFileTreeMenuActionRename,
} from '@/lib/file-tree-menu-action-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
import { createRefreshScheduler } from '@/lib/refresh-scheduler';
import { joinWorkspacePath } from '@/lib/workspace-paths';
import { OpenInAgentContextSubmenu } from './handoff/OpenInAgentContextSubmenu';
import {
  buildFolderHandoffInput,
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

const FILE_TREE_UNSAFE_CSS = `${FILE_TREE_EXT_BADGE_CSS}\n${FILE_TREE_RENAME_CHIP_CSS}`;

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

interface TrashFailureRequest {
  failed: TrashFailedTarget[];
  originalTargets: FileTreeTarget[];
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

function OpenInTerminalMenuItem({
  dirAbsPath,
  onClose,
}: {
  dirAbsPath: string | null;
  onClose: () => void;
}) {
  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
  if (!bridge) return null;
  const hint = dirAbsPath === null ? 'No workspace' : null;
  return (
    <DropdownMenuItem
      disabled={dirAbsPath === null}
      onSelect={() => {
        if (dirAbsPath === null) return;
        onClose();
        void dispatchOpenInTerminal(bridge, dirAbsPath);
      }}
      aria-label={hint ? `Open in Terminal, ${hint}` : 'Open in Terminal'}
    >
      <Terminal aria-hidden="true" />
      <span className="flex-1">Open in Terminal</span>
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
  /** Project-local config binding for the `Show Hidden Files` / `Show all files`
   *  folder-menu toggles. Patched directly here (mirrors the okignore Hide
   *  flow); `null` during cold-start disables the toggle items. */
  projectLocalBinding: ConfigBinding | null;
  /** Layered config view, source for the two toggle check-states
   *  (`appearance.sidebar.{showHiddenFiles,showAllFiles}`). */
  mergedConfig: Config | null;
  onStartCreating: (kind: 'file' | 'folder', parentDir: string) => void;
  /** Open NewItemDialog for the given parent dir so the template picker is
   *  reachable. Sibling to `onStartCreating`'s inline-rename fast path. */
  onStartCreatingFromTemplate: (parentDir: string) => void;
  onDelete: (targets: FileTreeTarget[]) => void;
  onExpandSubtree: (treePath: string) => void;
  onCollapseSubtree: (treePath: string) => void;
  folderTreePaths: readonly string[];
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
  projectLocalBinding,
  mergedConfig,
  onStartCreating,
  onStartCreatingFromTemplate,
  onDelete,
  onExpandSubtree,
  onCollapseSubtree,
  folderTreePaths,
  isAsset,
  isAssetTreePath,
}: FileTreeMenuProps) {
  const target = treeItemToTarget(item);
  const isFolder = item.kind === 'directory';
  const canHide = !isAsset && okignoreBinding !== null;
  const hideLabel = isFolder ? 'Hide folder' : 'Hide this file';
  const showHiddenFiles = mergedConfig?.appearance?.sidebar?.showHiddenFiles ?? false;
  const showAllFiles = mergedConfig?.appearance?.sidebar?.showAllFiles ?? false;
  const canToggleVisibility = projectLocalBinding !== null;
  const selectedTreePaths = model.getSelectedPaths();
  const selectedDeleteTargets = selectedTreePaths.includes(target.treePath)
    ? selectedTreePathsToDeleteTargets(selectedTreePaths, isAssetTreePath)
    : [];
  const deleteTargets = selectedDeleteTargets.length > 1 ? selectedDeleteTargets : [target];
  const deleteLabel = deleteTargets.length > 1 ? `Delete ${deleteTargets.length} Items` : 'Delete';
  const folderAbsPath =
    isFolder && workspace
      ? joinWorkspacePath(
          workspace.contentDir,
          relativePathForTreeItem(item),
          workspace.pathSeparator,
        )
      : null;
  const parentDirAbsPath: string | null = (() => {
    if (!workspace || isFolder) return null;
    const rel = relativePathForTreeItem(item);
    const lastSep = rel.lastIndexOf('/');
    if (lastSep === -1) return workspace.contentDir;
    return joinWorkspacePath(workspace.contentDir, rel.slice(0, lastSep), workspace.pathSeparator);
  })();
  const handoffInput: HandoffDispatchInput | null = isAsset
    ? null
    : isFolder
      ? buildFolderHandoffInput({
          folderAbsPath: folderAbsPath ?? '',
          folderRelativePath: relativePathForTreeItem(item),
          workspace,
        })
      : buildHandoffInput({
          docName: treeFilePathToDocName(item.path),
          workspace,
        });

  const closeForInlineSurface = () => context.close({ restoreFocus: false });
  const close = () => context.close();

  const handleShowHiddenFilesToggle = (checked: boolean) => {
    if (projectLocalBinding === null) return;
    const result = projectLocalBinding.patch({
      appearance: { sidebar: { showHiddenFiles: checked } },
    });
    if (!result.ok) {
      console.warn('[FileTree] showHiddenFiles toggle rejected:', humanFormat(result.error));
      toast.error('Could not update sidebar settings', {
        description: humanFormat(result.error),
      });
    }
  };
  const handleShowAllFilesToggle = (checked: boolean) => {
    if (projectLocalBinding === null) return;
    const result = projectLocalBinding.patch({
      appearance: { sidebar: { showAllFiles: checked } },
    });
    if (!result.ok) {
      console.warn('[FileTree] showAllFiles toggle rejected:', humanFormat(result.error));
      toast.error('Could not update sidebar settings', {
        description: humanFormat(result.error),
      });
    }
  };

  let subtreeFolderCount = 0;
  let subtreeExpandedCount = 0;
  if (isFolder) {
    const root = folderPathToTreeDirectoryPath(item.path);
    for (const folderPath of folderTreePaths) {
      if (folderPath === root || folderPath.startsWith(root)) {
        subtreeFolderCount++;
        if (asDirectoryHandle(model.getItem(folderPath))?.isExpanded()) {
          subtreeExpandedCount++;
        }
      }
    }
  }
  const showSubtreeExpandAll = isFolder && subtreeExpandedCount < subtreeFolderCount;
  const showSubtreeCollapseAll = isFolder && subtreeExpandedCount > 0;

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
            <RevealInFileManagerMenuItem item={item} workspace={workspace} onClose={close} />
            <OpenInAgentContextSubmenu
              input={handoffInput}
              installStates={handoff.installStates}
              isElectronHost={handoff.isElectronHost}
              dispatch={handoff.dispatch}
              webFallbackVisible={false}
            />
            <OpenInTerminalMenuItem dirAbsPath={folderAbsPath} onClose={close} />
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
            {/* These toggles only flip the persisted config; the filter
                pipeline (client dot-segment bypass / server showAll) reads it
                from a separate seam. */}
            <DropdownMenuCheckboxItem
              checked={showHiddenFiles}
              onCheckedChange={handleShowHiddenFilesToggle}
              disabled={!canToggleVisibility}
              data-testid="file-tree-menu-show-hidden-files"
            >
              Show Hidden Files
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showAllFiles}
              onCheckedChange={handleShowAllFilesToggle}
              disabled={!canToggleVisibility}
              data-testid="file-tree-menu-show-all-files"
            >
              Show all files
            </DropdownMenuCheckboxItem>
            {/* Subtree-scoped Expand/Collapse, smart-hidden. The divider only
                renders when the section is non-empty so a fully-expanded or
                fully-collapsed subtree collapses to a single divider before
                the destructive section instead of an empty double rule. */}
            {showSubtreeExpandAll || showSubtreeCollapseAll ? <DropdownMenuSeparator /> : null}
            {showSubtreeExpandAll ? (
              <DropdownMenuItem
                onSelect={() => {
                  close();
                  onExpandSubtree(item.path);
                }}
              >
                <UnfoldVertical aria-hidden="true" />
                Expand All
              </DropdownMenuItem>
            ) : null}
            {showSubtreeCollapseAll ? (
              <DropdownMenuItem
                onSelect={() => {
                  close();
                  onCollapseSubtree(item.path);
                }}
              >
                <FoldVertical aria-hidden="true" />
                Collapse All
              </DropdownMenuItem>
            ) : null}
            {/* Destructive section. Rename sits with Hide/Delete here (not at
                the top with creation) so the menu's read order is
                create → act → filter → tree → mutate-or-remove. */}
            <DropdownMenuSeparator />
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
            <DropdownMenuItem
              data-testid="file-tree-menu-hide"
              disabled={!canHide}
              onSelect={() => {
                if (!okignoreBinding) return;
                close();
                const pattern = buildOkignorePatternFromTarget(target);
                const current = okignoreBinding.current();
                const doc = parseOkignoreDoc(current);
                const updated = appendPattern(doc, pattern);
                if (updated === doc) return;
                okignoreBinding.patch(serializeOkignoreDoc(updated));
                const basename = target.path.split('/').pop() || target.path;
                toast.success(`Hidden folder “${basename}”`, {
                  description: 'Manage hidden files in Settings → Ignore patterns.',
                  duration: 5000,
                });
              }}
            >
              <EyeOff aria-hidden="true" />
              {hideLabel}
            </DropdownMenuItem>
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
        ) : (
          <>
            <RevealInFileManagerMenuItem item={item} workspace={workspace} onClose={close} />
            {!isAsset && (
              <OpenInAgentContextSubmenu
                input={handoffInput}
                installStates={handoff.installStates}
                isElectronHost={handoff.isElectronHost}
                dispatch={handoff.dispatch}
                webFallbackVisible={true}
              />
            )}
            <OpenInTerminalMenuItem dirAbsPath={parentDirAbsPath} onClose={close} />
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
            {!isAsset ? (
              <>
                <DropdownMenuSeparator />
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
                <DropdownMenuItem
                  data-testid="file-tree-menu-hide"
                  disabled={!canHide}
                  onSelect={() => {
                    if (!okignoreBinding) return;
                    close();
                    const pattern = buildOkignorePatternFromTarget(target);
                    const current = okignoreBinding.current();
                    const doc = parseOkignoreDoc(current);
                    const updated = appendPattern(doc, pattern);
                    if (updated === doc) return;
                    okignoreBinding.patch(serializeOkignoreDoc(updated));
                    const basename = target.path.split('/').pop() || target.path;
                    toast.success(`Hidden “${basename}”`, {
                      description: 'Manage hidden files in Settings → Ignore patterns.',
                      duration: 5000,
                    });
                  }}
                >
                  <EyeOff aria-hidden="true" />
                  {hideLabel}
                </DropdownMenuItem>
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
          </>
        )}
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
    closeDocument,
    closeAndClearForRename,
    getPoolActiveDocName,
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
  const [trashFailure, setTrashFailure] = useState<TrashFailureRequest | null>(null);
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
  const showHiddenFilesRef = useRef<boolean>(false);
  const showAllFilesRef = useRef<boolean>(false);
  const refreshDocsScheduleRef = useRef<(() => void) | null>(null);
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
  const { okignoreBinding, projectLocalBinding, merged } = useConfigContext();
  const showHiddenFiles = merged?.appearance?.sidebar?.showHiddenFiles ?? false;
  const showAllFiles = merged?.appearance?.sidebar?.showAllFiles ?? false;

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
        closeTabs([folderTabId(pending.createdPath)], { force: true });
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
        const showAll = showAllFilesRef.current;
        const url = showAll ? '/api/documents?showAll=true' : '/api/documents';
        const res = await fetch(url);
        const parsed = await parseServerResponse(res, 'Failed to load documents');
        if (!active) return;
        if (!parsed.ok) {
          setError(parsed.title);
        } else {
          const success = DocumentListSuccessSchema.safeParse(parsed.body);
          if (!success.success) {
            setError('Documents response did not match expected shape.');
          } else {
            const bypassClientDotDrop = showHiddenFilesRef.current || showAll;
            setDocuments(
              filterVisibleEntries(
                success.data.documents as unknown as FileEntry[],
                bypassClientDotDrop,
              ),
            );
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
    refreshDocsScheduleRef.current = () => scheduler.request();
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
      refreshDocsScheduleRef.current = null;
      scheduler.dispose();
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
    };
  }, []);

  const isFirstShowHiddenFilesEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: showHiddenFiles is a flip-detection trigger, not a read — the effect body reads refs only. Sibling pattern at the treePathsSignature reset effect above.
  useEffect(() => {
    if (isFirstShowHiddenFilesEffectRunRef.current) {
      isFirstShowHiddenFilesEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [showHiddenFiles]);

  const isFirstShowAllFilesEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: showAllFiles is a flip-detection trigger, not a read — the effect body reads refs only. Sibling pattern at the treePathsSignature reset effect above.
  useEffect(() => {
    if (isFirstShowAllFilesEffectRunRef.current) {
      isFirstShowAllFilesEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [showAllFiles]);

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

    const cleanupDocNames = planRenameCleanupCalls(renamed, getPoolActiveDocName());
    await Promise.all(cleanupDocNames.map((docName) => closeAndClearForRename(docName)));
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

    setBusyPath(sourceTreePath);
    setError(null);

    try {
      if (!event.isFolder && isAssetTreePath(sourceTreePath)) {
        toast.error('Assets cannot be renamed from the sidebar');
        queueMicrotask(() => {
          resetModelToDocuments();
        });
        clearPendingCreate();
        setBusyPath(null);
        return;
      }

      const validation = validateAndCoerceRenameDestination(
        event.sourcePath,
        event.destinationPath,
        event.isFolder,
      );
      if (validation.kind === 'block') {
        toast.error(
          'File extensions are managed automatically - please rename without changing the extension',
        );
        queueMicrotask(() => {
          resetModelToDocuments();
        });
        clearPendingCreate();
        setBusyPath(null);
        return;
      }
      const destinationTreePath = normalizeTreePathForKind(
        validation.destinationPath,
        event.isFolder,
      );

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
      try {
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
      } catch (reconcileErr) {
        console.warn('[FileTree] post-rename reconciliation failed', {
          err: reconcileErr,
          sourceTreePath,
          destinationTreePath,
          renamedCount: success.renamed.length,
        });
        toast.error('Rename succeeded but the sidebar may be out of date — refresh to resync');
      }
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

      try {
        await applyRenamedDocuments(renamed, renamedFolders, activeBeforeRename);
      } catch (reconcileErr) {
        console.warn('[FileTree] post-move reconciliation failed', {
          err: reconcileErr,
          operationCount: operations.length,
          renamedCount: renamed.length,
        });
        toast.error('Move succeeded but the sidebar may be out of date — refresh to resync');
      }
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
    showHiddenFilesRef.current = showHiddenFiles;
    showAllFilesRef.current = showAllFiles;
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

  useEffect(() => {
    if (loading || documents.length === 0) return;
    const shadow = fileTreeHostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const apply = () => applyExtensionBadges(shadow);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-item-path'],
    });
    return () => observer.disconnect();
  }, [loading, documents.length]);

  useEffect(() => {
    if (loading || documents.length === 0) return;
    const shadow = fileTreeHostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const apply = () => applyRenameChip(shadow);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-item-path'],
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

  async function applyDeleteAftermath(
    successfulTargets: readonly FileTreeTarget[],
    deletedDocNames: readonly string[],
    deletedFolderPaths: readonly string[],
  ) {
    const tabsToClose = collectTabsToCloseForDelete(
      successfulTargets,
      documentsRef.current,
      folderTreePathsRef.current,
    );
    const pendingCreate = pendingCreateRef.current;
    if (
      pendingCreate &&
      successfulTargets.some((target) => deleteTargetCoversPendingCreate(target, pendingCreate))
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
    closeTabs(
      [
        ...[...deleted].map((docName) => docTabId(docName)),
        ...[...deletedFolders].map((folderPath) => folderTabId(folderPath)),
      ],
      { force: true },
    );
    await Promise.all([...deleted].map((docName) => closeAndClearForRename(docName)));

    for (const target of successfulTargets) {
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
  }

  async function hardDeleteTargets(targets: readonly FileTreeTarget[]): Promise<boolean> {
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
        if (successfulTargets.length > 0) {
          await applyDeleteAftermath(successfulTargets, deletedDocNames, deletedFolderPaths);
        }
        toast.error(parsed.title);
        return false;
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
    await applyDeleteAftermath(successfulTargets, deletedDocNames, deletedFolderPaths);
    return true;
  }

  async function trashTargetsViaShell(
    targets: readonly FileTreeTarget[],
    bridge: NonNullable<typeof window.okDesktop>,
    workspaceInfo: WorkspaceInfo,
  ): Promise<{
    trashed: FileTreeTarget[];
    failed: TrashFailedTarget[];
  }> {
    const trashed: FileTreeTarget[] = [];
    const failed: TrashFailedTarget[] = [];
    for (const target of targets) {
      setBusyPath(target.path);
      const absPath = joinWorkspacePath(
        workspaceInfo.contentDir,
        target.path,
        workspaceInfo.pathSeparator,
      );
      const result = await bridge.shell.trashItem(absPath);
      if (result.ok) {
        trashed.push(target);
      } else {
        failed.push({
          kind: target.kind,
          path: target.path,
          name: target.name,
          reason: coerceTrashFailureReason(result.reason),
          detail: result.detail,
        });
      }
    }
    return { trashed, failed };
  }

  async function postTrashCleanup(
    trashed: readonly FileTreeTarget[],
  ): Promise<{ deletedDocNames: string[]; deletedFolderPaths: string[] } | null> {
    const deletedDocNames: string[] = [];
    const deletedFolderPaths: string[] = [];
    const failedCleanups: Array<{ target: FileTreeTarget; reason: string }> = [];
    for (const target of trashed) {
      try {
        const res = await fetch('/api/trash/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: target.kind, path: target.path }),
        });
        const parsed = await parseServerResponse(res, 'Failed to clean up after trash');
        if (!parsed.ok) {
          console.warn('[FileTree] trash-cleanup failed', {
            target: `${target.kind}:${target.path}`,
            reason: parsed.title,
          });
          failedCleanups.push({ target, reason: parsed.title });
          continue;
        }
        const success = parseSuccessOrWarn(
          TrashCleanupSuccessSchema,
          parsed.body,
          'trash-cleanup',
          { deletedDocNames: [] },
        );
        deletedDocNames.push(...success.deletedDocNames);
        if (target.kind === 'folder') {
          deletedFolderPaths.push(target.path);
        }
      } catch (err) {
        console.warn('[FileTree] trash-cleanup threw', {
          target: `${target.kind}:${target.path}`,
          err,
        });
        failedCleanups.push({ target, reason: 'Network error during cleanup' });
      }
    }
    if (failedCleanups.length > 0) {
      const failedCount = failedCleanups.length;
      const noun = failedCount === 1 ? 'item' : 'items';
      toast.error(`Server-side cleanup failed for ${failedCount} ${noun}`, {
        description: 'The file is in your Trash; the file-watcher will reconcile.',
      });
    }
    if (failedCleanups.length === trashed.length && trashed.length > 0) {
      return null;
    }
    return { deletedDocNames, deletedFolderPaths };
  }

  async function handleDeleteTargets(targets: FileTreeTarget[]) {
    const firstTarget = targets[0];
    if (!firstTarget) return;
    setBusyPath(firstTarget.path);
    setDeleteRequest(null);

    const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
    try {
      if (bridge && workspace) {
        const { trashed, failed } = await trashTargetsViaShell(targets, bridge, workspace);
        if (trashed.length > 0) {
          const cleanup = await postTrashCleanup(trashed);
          if (cleanup) {
            await applyDeleteAftermath(
              trashed,
              cleanup.deletedDocNames,
              cleanup.deletedFolderPaths,
            );
          } else {
            const localDocNames = trashed.filter((t) => t.kind === 'file').map((t) => t.path);
            const localFolderPaths = trashed.filter((t) => t.kind === 'folder').map((t) => t.path);
            await applyDeleteAftermath(trashed, localDocNames, localFolderPaths);
          }
        }
        if (failed.length > 0) {
          setTrashFailure({ failed, originalTargets: [...targets] });
        }
        setBusyPath(null);
      } else {
        const ok = await hardDeleteTargets(targets);
        setBusyPath(null);
        if (!ok) resetModelToDocuments();
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn('[FileTree] delete failed:', err);
      toast.error('Could not complete delete', { description: detail });
      setBusyPath(null);
      resetModelToDocuments();
    }
  }

  async function handleTrashFailureDeletePermanently() {
    if (!trashFailure) return;
    const failedSet = new Set(trashFailure.failed.map((t) => `${t.kind}:${t.path}`));
    const targetsToHardDelete = trashFailure.originalTargets.filter((t) =>
      failedSet.has(`${t.kind}:${t.path}`),
    );
    setTrashFailure(null);
    if (targetsToHardDelete.length === 0) return;
    setBusyPath(targetsToHardDelete[0]?.path ?? null);
    try {
      const ok = await hardDeleteTargets(targetsToHardDelete);
      setBusyPath(null);
      if (!ok) resetModelToDocuments();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn('[FileTree] hard-delete fallback failed:', err);
      toast.error('Could not complete delete', { description: detail });
      setBusyPath(null);
      resetModelToDocuments();
    }
  }

  async function handleTrashFailureRetry() {
    if (!trashFailure) return;
    const failedSet = new Set(trashFailure.failed.map((f) => `${f.kind}:${f.path}`));
    const originals = trashFailure.originalTargets.filter((t) =>
      failedSet.has(`${t.kind}:${t.path}`),
    );
    setTrashFailure(null);
    await handleDeleteTargets(originals);
  }

  const handleDeleteTargetsRef = useRef(handleDeleteTargets);
  useEffect(() => {
    handleDeleteTargetsRef.current = handleDeleteTargets;
  });

  useEffect(() => {
    return subscribeToFileTreeMenuActionDelete((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        void handleDeleteTargetsRef.current([
          {
            kind: 'file',
            path: docName,
            name: docName.split('/').pop() ?? docName,
            docExt: docEntry?.docExt,
          },
        ]);
        return;
      }
      if (target.kind === 'folder') {
        void handleDeleteTargetsRef.current([
          {
            kind: 'folder',
            path: target.folderPath,
            name: target.folderPath.split('/').pop() ?? target.folderPath,
          },
        ]);
        return;
      }
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-delete-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, []);

  useEffect(() => {
    return subscribeToFileTreeMenuActionRename((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        const treePath = docNameToTreePath(docName, docEntry?.docExt);
        model.startRenaming(treePath);
        return;
      }
      if (target.kind === 'folder') {
        model.startRenaming(target.folderPath);
        return;
      }
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-rename-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, [model]);

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
              projectLocalBinding={projectLocalBinding}
              mergedConfig={merged}
              onStartCreating={startCreating}
              onStartCreatingFromTemplate={startCreatingFromTemplate}
              onDelete={(targets) => setDeleteRequest({ targets })}
              onExpandSubtree={expandSubtree}
              onCollapseSubtree={collapseSubtree}
              folderTreePaths={folderTreePaths}
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
            {...(() => {
              const variant: 'electron' | 'web' =
                typeof window !== 'undefined' && window.okDesktop != null ? 'electron' : 'web';
              const copy = selectTrashConfirmCopy(variant, deleteRequest.targets);
              if (copy) {
                return {
                  customTitle: copy.title,
                  customDescription: '',
                  customDetail: copy.detail,
                  customConfirmLabel: copy.confirmLabel,
                  customConfirmLabelBusy: copy.confirmLabelBusy,
                  children: copy.listedTargets ? (
                    <ul className="flex flex-col gap-1 font-mono text-foreground text-xs">
                      {copy.listedTargets.map((target) => (
                        <li key={`${target.kind}:${target.path}`} data-testid="delete-target-row">
                          {trashTargetDisplayName(target)}
                        </li>
                      ))}
                    </ul>
                  ) : null,
                };
              }
              return {
                itemName:
                  deleteRequest.targets.length === 1
                    ? `${primaryDeleteTarget.name}${primaryDeleteTarget.kind === 'file' ? (primaryDeleteTarget.docExt ?? '.md') : '/'}`
                    : undefined,
                customTitle: deleteRequest.targets.length > 1 ? 'Delete selected items' : undefined,
                customDescription:
                  deleteRequest.targets.length > 1
                    ? `Are you sure you want to delete ${deleteRequest.targets.length} selected items? Folders and all files inside them will be deleted. This action cannot be undone.`
                    : primaryDeleteTarget.kind === 'folder'
                      ? `Are you sure you want to delete ${primaryDeleteTarget.name}/ and all files inside? This action cannot be undone.`
                      : undefined,
              };
            })()}
            isSubmitting={busyPath !== null}
            onDelete={() => handleDeleteTargets(deleteRequest.targets)}
          />
        )}
      </Dialog>
      <Dialog
        open={!!trashFailure}
        onOpenChange={(open) => {
          if (!open && !busyPath) setTrashFailure(null);
        }}
      >
        {trashFailure && (
          <TrashFailureModal
            failedTargets={trashFailure.failed}
            isSubmitting={busyPath !== null}
            onDeletePermanently={handleTrashFailureDeletePermanently}
            onRetry={handleTrashFailureRetry}
            onCancel={() => setTrashFailure(null)}
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
