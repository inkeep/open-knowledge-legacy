import { FileImage, FileVideo, FolderOpen, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  buildRenamedNodePath,
  isValidNodeName,
  normalizeRenameValue,
  type RenamedDocMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { usePageList } from '@/components/PageListContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import type { EditorModeValue } from '@/editor/use-editor-mode';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { useWorkspace } from '@/lib/use-workspace';
import { PresenceBar } from '@/presence/PresenceBar';
import { useSyncStatus } from '@/presence/use-sync-status';
import type { EditorMode } from './EditorPane';
import { HelpPopover } from './HelpPopover';
import { OpenInAgentMenu } from './handoff/OpenInAgentMenu';
import { buildHandoffInput } from './handoff/useHandoffDispatch';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';
import { SyncStatusBadge } from './SyncStatusBadge';
import { ThemeToggle } from './ThemeToggle';
import { Badge } from './ui/badge';

type RenameResponse =
  | {
      ok: true;
      renamed: RenamedDocMapping[];
      rewrittenDocs: Array<{ docName: string; rewrites: number }>;
    }
  | { ok: false; error: string };

function isRenamedDocMapping(v: unknown): v is RenamedDocMapping {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { fromDocName: unknown }).fromDocName === 'string' &&
    typeof (v as { toDocName: unknown }).toDocName === 'string'
  );
}

function isRenameResponse(v: unknown): v is RenameResponse {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.ok === true) {
    return (
      Array.isArray(obj.renamed) &&
      obj.renamed.every(isRenamedDocMapping) &&
      Array.isArray(obj.rewrittenDocs)
    );
  }
  if (obj.ok === false) {
    return typeof obj.error === 'string';
  }
  return false;
}

interface EditorHeaderProps {
  editorMode: EditorMode;
  onModeChange: (mode: EditorModeValue) => void;
  onSaveVersion: () => void;
  saving: boolean;
  onSignIn?: () => void;
  onSetIdentity?: () => void;
  onOpenConflictResolver?: () => void;
}

export function EditorHeader({
  editorMode,
  onModeChange,
  onSaveVersion,
  saving,
  onSignIn,
  onSetIdentity,
  onOpenConflictResolver,
}: EditorHeaderProps) {
  const { activeDocName, activeProvider, activeTarget, closeAndClearForRename } =
    useDocumentContext();
  const { pageMeta } = usePageList();
  const { state: sidebarState } = useSidebar();
  const workspace = useWorkspace();
  const syncStatus = useSyncStatus(activeProvider);
  const handoffInput = buildHandoffInput({ docName: activeDocName, workspace });
  const isConnected = syncStatus === 'connected' || syncStatus === 'synced';
  const sourceDisabled = !activeDocName || !isConnected;
  const isFolderTarget = activeTarget?.kind === 'folder';
  const isAssetTarget = activeTarget?.kind === 'asset';
  const isNewDoc = activeTarget?.kind === 'missing';
  const activeDocExt = (activeDocName && pageMeta.get(activeDocName)?.docExt) || '.md';
  const displayName = isFolderTarget
    ? `${activeTarget.folderPath}/`
    : activeDocName
      ? `${activeDocName}${activeDocExt}`
      : '';

  const index = activeDocName?.lastIndexOf('/') ?? -1;
  const assetPath = isAssetTarget ? activeTarget.assetPath : '';
  const assetSlash = assetPath.lastIndexOf('/');
  const assetPrefix = assetSlash === -1 ? '' : assetPath.slice(0, assetSlash);
  const assetFileName = assetSlash === -1 ? assetPath : assetPath.slice(assetSlash + 1);

  const pathPrefix =
    activeDocName && index !== -1 ? `${activeDocName.substring(0, index + 1)}` : '';
  const fileBaseName = activeDocName ? activeDocName.substring(index + 1) : '';

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenameLoading, setIsRenameLoading] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const commitInProgressRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const renameDocRef = useRef<string | null>(null);
  const lastFailedValueRef = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeDocName is a trigger-only dep — the effect body only needs to re-run on change, not to read its value.
  useEffect(() => {
    cancelRequestedRef.current = true;
    renameDocRef.current = null;
    lastFailedValueRef.current = null;
    setIsRenaming(false);
    setRenameError(null);
  }, [activeDocName]);

  useEffect(() => {
    if (isRenaming) {
      const timer = setTimeout(() => {
        const el = renameInputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  function enterRenameMode() {
    if (!activeDocName || isFolderTarget) return;
    const segments = activeDocName.split('/');
    cancelRequestedRef.current = false;
    renameDocRef.current = activeDocName;
    setRenameValue(segments[segments.length - 1]);
    setRenameError(null);
    lastFailedValueRef.current = null;
    setIsRenaming(true);
  }

  function cancelRename() {
    cancelRequestedRef.current = true;
    renameDocRef.current = null;
    lastFailedValueRef.current = null;
    setIsRenaming(false);
    setRenameValue('');
    setRenameError(null);
  }

  async function commitRename() {
    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false;
      return;
    }
    if (commitInProgressRef.current) return;

    const docName = renameDocRef.current;
    if (!docName) {
      cancelRename();
      return;
    }

    const normalized = normalizeRenameValue('file', renameValue);
    const segments = docName.split('/');
    const currentName = segments[segments.length - 1];

    if (normalized === currentName) {
      cancelRename();
      return;
    }

    if (normalized === lastFailedValueRef.current) return;

    if (!isValidNodeName(normalized)) {
      setRenameError('Name can’t be empty, ".", "..", or contain / or \\');
      return;
    }

    const newDocName = buildRenamedNodePath(
      { kind: 'file', path: docName, name: currentName },
      normalized,
    );

    commitInProgressRef.current = true;
    setIsRenameLoading(true);
    setRenameError(null);

    try {
      const res = await fetch('/api/rename-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'file', fromPath: docName, toPath: newDocName }),
      });

      if (cancelRequestedRef.current) {
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        return;
      }

      let raw: unknown;
      try {
        raw = await res.json();
      } catch (parseErr) {
        console.warn('[EditorHeader] rename response JSON parse failed', {
          parseErr,
          status: res.status,
          docName,
          newDocName,
        });
        setRenameError(`Server error (HTTP ${res.status})`);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        return;
      }

      if (!res.ok || !isRenameResponse(raw)) {
        const errorBody = raw as { error?: string } | null;
        console.warn('[EditorHeader] rename failed', {
          status: res.status,
          docName,
          newDocName,
        });
        setRenameError(errorBody?.error || `Server error (HTTP ${res.status})`);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        return;
      }

      if (!raw.ok) {
        setRenameError(raw.error || 'Failed to rename path');
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        return;
      }

      const renamed = raw.renamed;
      const nextActiveDocName = remapActiveDocName(docName, renamed);

      await Promise.all(
        renamed.flatMap((entry) => [
          closeAndClearForRename(entry.fromDocName),
          closeAndClearForRename(entry.toDocName),
        ]),
      );
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      setIsRenaming(false);
      setRenameValue('');
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = null;
      renameDocRef.current = null;

      if (nextActiveDocName && nextActiveDocName !== docName) {
        window.location.hash = hashFromDocName(nextActiveDocName);
      }
    } catch (err) {
      console.warn('[EditorHeader] rename failed', { err, docName, newDocName, normalized });
      setRenameError('Network error — please try again');
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = normalized;
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center border-b">
      <div className="flex flex-1 items-center gap-1 px-3 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            {sidebarState === 'expanded' ? 'Hide Files' : 'Show Files'}
          </TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mr-1 h-4 shrink-0 data-vertical:self-center" />
        {isFolderTarget ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="size-4 shrink-0" />
            <span className="truncate">{displayName}</span>
          </span>
        ) : isAssetTarget ? (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm">
            {activeTarget.mediaKind === 'video' ? (
              <FileVideo className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <FileImage className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="flex min-w-0 items-center overflow-hidden">
              {assetPrefix ? (
                <>
                  <span className="truncate text-muted-foreground/60">{assetPrefix}</span>
                  <span className="shrink-0 px-2 text-muted-foreground/60">/</span>
                </>
              ) : null}
              <span className="shrink-0 font-medium text-foreground">{assetFileName}</span>
            </span>
          </div>
        ) : activeDocName ? (
          <div className="flex min-w-0 items-center overflow-hidden">
            {/* Path prefix — shrinks first so filename stays visible */}
            {pathPrefix && (
              <span
                className="flex shrink items-center overflow-hidden text-sm text-muted-foreground/60 transition-[max-width,opacity] duration-200 ease-in-out"
                style={isRenaming ? { maxWidth: 0, opacity: 0 } : { maxWidth: '20rem', opacity: 1 }}
              >
                <span className="truncate">{pathPrefix.slice(0, -1)}</span>
                <span className="shrink-0 pl-2">/</span>
              </span>
            )}
            {isRenaming ? (
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    ref={renameInputRef}
                    value={renameValue}
                    disabled={isRenameLoading}
                    aria-label={`Rename ${activeDocName}`}
                    aria-invalid={renameError ? true : undefined}
                    aria-describedby={renameError ? 'editor-header-rename-error' : undefined}
                    aria-busy={isRenameLoading || undefined}
                    onChange={(e) => {
                      setRenameValue(e.target.value);
                      setRenameError(null);
                      lastFailedValueRef.current = null;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => void commitRename()}
                    className="h-7 min-w-0 flex-1 border-none bg-background text-sm shadow-none focus-visible:ring-0"
                  />
                  <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground/40">
                    {activeDocExt}
                  </span>
                </div>
                {renameError && (
                  <span
                    id="editor-header-rename-error"
                    role="alert"
                    className="text-xs text-destructive mt-0.5"
                  >
                    {renameError}
                  </span>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={enterRenameMode}
                className="h-7 shrink-0 px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
              >
                {`${fileBaseName}${activeDocExt}`}
              </Button>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground truncate min-w-0">{displayName}</span>
        )}
        {isNewDoc && <Badge variant="dashed">New file</Badge>}
      </div>

      {activeDocName && (
        <ToggleGroup
          type="single"
          value={editorMode === 'source' ? 'source' : 'visual'}
          onValueChange={(v) => {
            if (v) onModeChange(v === 'source' ? 'source' : 'wysiwyg');
          }}
          aria-label="Editor mode"
          variant="segmented"
          size="sm"
          spacing={1}
          className="bg-muted dark:bg-background p-0.5 rounded-lg shrink-0"
          disabled={!activeDocName}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <ToggleGroupItem
                  value="visual"
                  aria-label="Visual editor"
                  className="gap-1.5 text-xs"
                >
                  <Textbox className="size-4 text-muted-foreground" />
                  <span className="hidden md:inline">Visual</span>
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent className="md:hidden">Visual</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={sourceDisabled ? 0 : undefined}>
                <ToggleGroupItem
                  value="source"
                  aria-label="Markdown source"
                  className="gap-1.5 text-xs"
                  disabled={sourceDisabled}
                >
                  <Markdown className="size-4 text-muted-foreground" />
                  <span className="hidden md:inline">Markdown</span>
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            {sourceDisabled && !activeDocName ? null : sourceDisabled ? (
              <TooltipContent>
                Source mode requires a live connection — your edits are saved and will appear when
                you reconnect.
              </TooltipContent>
            ) : (
              <TooltipContent className="md:hidden">Markdown</TooltipContent>
            )}
          </Tooltip>
        </ToggleGroup>
      )}

      <div className="flex flex-1 items-center justify-end gap-2 px-3">
        {activeDocName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Checkpoint version"
                onClick={onSaveVersion}
                disabled={saving}
                className="text-muted-foreground"
              >
                <Save className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{saving ? 'Saving…' : 'Checkpoint version'}</TooltipContent>
          </Tooltip>
        )}
        {activeDocName && <OpenInAgentMenu input={handoffInput} />}
        <SyncStatusBadge
          onSignIn={onSignIn}
          onSetIdentity={onSetIdentity}
          onOpenConflictResolver={onOpenConflictResolver}
        />
        <PresenceBar />
        <Separator orientation="vertical" className="h-4 shrink-0 data-vertical:self-center" />
        <HelpPopover />
        <ThemeToggle />
      </div>
    </header>
  );
}
