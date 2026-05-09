import {
  classifyWikiLinkTarget,
  getWikiLinkText,
  normalizeNullableString,
} from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/core';
import { posToDOMRect } from '@tiptap/core';
import {
  CircleAlert,
  ExternalLink,
  File,
  FileImage,
  FilePlus2,
  FolderOpen,
  Loader2,
  Pencil,
  Trash2,
  Unlink2,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { InteractionPropPanel } from '../../components/InteractionPropPanel';
import {
  folderIndexCreateSeed,
  resolveLinkTargetIntent,
} from '../../components/link-target-intent';
import { usePageList } from '../../components/PageListContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { type CreatePageSeed, createPageFromSeedAndUpdate } from '../../lib/create-page';
import { hashFromAssetPath } from '../../lib/doc-hash';
import { cn } from '../../lib/utils';
import { openInternalHashHrefInNewTab } from '../internal-link-helpers';
import { isSafeNavigationUrl } from '../safe-navigation-url';
import { useHeadings } from './use-headings';
import {
  getWikiLinkResolutionCandidates,
  isResolvedWikiLinkTarget,
  resolveWikiLinkAssetTarget,
} from './wiki-link-helpers';

interface EditWikiLinkDialogProps {
  open: boolean;
  target: string;
  alias: string | null;
  anchor: string | null;
  pages: Set<string>;
  assetPaths: Set<string>;
  onOpenChange: (open: boolean) => void;
  onSave: (target: string, alias: string | null, anchor: string | null) => void;
}

function EditWikiLinkDialog({
  open,
  target,
  alias,
  anchor,
  pages,
  assetPaths,
  onOpenChange,
  onSave,
}: EditWikiLinkDialogProps) {
  const [editTarget, setEditTarget] = useState(target);
  const [editAlias, setEditAlias] = useState(alias ?? '');
  const [editAnchor, setEditAnchor] = useState(anchor ?? '');
  const targetId = useId();
  const anchorId = useId();
  const aliasId = useId();
  const headingListId = useId();

  const editAssetPath = resolveWikiLinkAssetTarget(editTarget, assetPaths);
  const isEditTargetResolved = isResolvedWikiLinkTarget(editTarget, pages, assetPaths);
  const headings = useHeadings(editTarget, isEditTargetResolved && !editAssetPath && open);

  useEffect(() => {
    if (open) {
      setEditTarget(target);
      setEditAlias(alias ?? '');
      setEditAnchor(anchor ?? '');
    }
  }, [open, target, alias, anchor]);

  function handleSave() {
    const t = editTarget.trim();
    if (!t) return;
    onSave(t, editAlias.trim() || null, editAnchor.trim() || null);
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
  }

  const counts = new Map<string, number>();
  const headingsWithKeys = headings?.map((h) => {
    const count = counts.get(h.slug) ?? 0;
    counts.set(h.slug, count + 1);
    const reactKey = count === 0 ? h.slug : `${h.slug}-${count}`;
    return { ...h, reactKey };
  });
  const showHeadings = !!headingsWithKeys?.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          data-slot="dialog-content"
          data-ok-layer-spawned=""
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <Dialog.Title className="mb-1 text-base font-semibold">Edit wiki link</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Modify the link target, anchor, and display label.
          </Dialog.Description>

          <div className="mb-4 space-y-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={targetId}>
                Page <span className="text-red-500">*</span>
              </label>
              <Input
                id={targetId}
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                placeholder="page-name"
                autoFocus
                aria-required="true"
                onKeyDown={handleKeyDown}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={anchorId}>
                Section{' '}
                <span className="font-normal text-muted-foreground">(optional heading anchor)</span>
              </label>
              <Input
                id={anchorId}
                value={editAnchor}
                onChange={(e) => setEditAnchor(e.target.value)}
                placeholder="heading-slug"
                onKeyDown={handleKeyDown}
              />
              {showHeadings && (
                <div
                  role="listbox"
                  id={headingListId}
                  aria-label="Heading anchors"
                  className="mt-1.5 max-h-36 overflow-y-auto subtle-scrollbar rounded-md border border-border bg-muted/30"
                >
                  {headingsWithKeys.map((h) => (
                    <button
                      key={h.reactKey}
                      type="button"
                      role="option"
                      aria-selected={editAnchor === h.slug}
                      className={cn(
                        'flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                        editAnchor === h.slug && 'bg-accent text-accent-foreground',
                      )}
                      style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                      onClick={() => setEditAnchor(editAnchor === h.slug ? '' : h.slug)}
                    >
                      <span className="w-7 shrink-0 font-mono text-[10px] text-muted-foreground">
                        H{h.level}
                      </span>
                      <span className="truncate">{h.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={aliasId}>
                Label{' '}
                <span className="font-normal text-muted-foreground">(optional display text)</span>
              </label>
              <Input
                id={aliasId}
                value={editAlias}
                onChange={(e) => setEditAlias(e.target.value)}
                placeholder="Custom display text"
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!editTarget.trim()}>
              Save
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface WikiLinkPropPanelProps {
  editor: Editor;
  getPos: () => number | undefined;
  onClose: () => void;
}

export function WikiLinkPropPanel({ editor, getPos, onClose }: WikiLinkPropPanelProps) {
  const pos = getPos();
  const node = pos != null ? editor.state.doc.nodeAt(pos) : null;
  const target = String(node?.attrs.target ?? '');
  const alias = normalizeNullableString(node?.attrs.alias);
  const anchor = normalizeNullableString(node?.attrs.anchor);
  const label = getWikiLinkText({ target, alias, anchor });

  const { addPage, assetPaths, folderPaths, pages, pagesBySlug, loading } = usePageList();
  const classifiedTarget = classifyWikiLinkTarget(target, anchor);
  const externalTarget = classifiedTarget?.kind === 'external' ? classifiedTarget : null;
  const assetPath =
    classifiedTarget?.kind === 'asset'
      ? resolveWikiLinkAssetTarget(classifiedTarget.url, assetPaths)
      : null;
  const linkIntent = assetPath
    ? null
    : resolveLinkTargetIntent(target, {
        pages,
        folderPaths,
        pagesBySlug,
        fallbackTargets: getWikiLinkResolutionCandidates(target),
      });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creatingMode, setCreatingMode] = useState<'missing' | 'folder-index' | null>(null);
  const folderCreateSeed = linkIntent ? folderIndexCreateSeed(linkIntent) : null;

  if (!node) {
    return null;
  }

  function handleSaveEdit(newTarget: string, newAlias: string | null, newAnchor: string | null) {
    const livePos = getPos();
    if (livePos == null) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(livePos, undefined, {
        ...editor.state.doc.nodeAt(livePos)?.attrs,
        target: newTarget,
        alias: newAlias,
        anchor: newAnchor,
      }),
    );
  }

  function handleRemove() {
    const livePos = getPos();
    if (livePos == null) return;
    const nodeAtPos = editor.state.doc.nodeAt(livePos);
    if (!nodeAtPos) return;
    editor.view.dispatch(editor.state.tr.delete(livePos, livePos + nodeAtPos.nodeSize));
    onClose();
  }

  function updateMissingLinkTarget(docName: string) {
    if (docName !== target) {
      const livePos = getPos();
      if (livePos == null) return;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(livePos, undefined, {
          ...editor.state.doc.nodeAt(livePos)?.attrs,
          target: docName,
          alias: alias ?? label,
        }),
      );
    }
  }

  function createSeedForMode(mode: 'missing' | 'folder-index'): CreatePageSeed | null {
    if (mode === 'folder-index') return folderCreateSeed;
    if (linkIntent?.kind !== 'create') return null;
    return {
      initialDir: linkIntent.initialDir,
      suggestedName: linkIntent.suggestedName,
    };
  }

  async function handleCreatePage(mode: 'missing' | 'folder-index') {
    const seed = createSeedForMode(mode);
    if (!seed || creatingMode) return;
    setCreatingMode(mode);
    try {
      await createPageFromSeedAndUpdate(seed, {
        addPage,
        onCreated(docName) {
          if (mode === 'missing') {
            updateMissingLinkTarget(docName);
          }
          window.location.hash = `#/${docName}`;
          onClose();
        },
      });
      setCreatingMode(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create page');
      setCreatingMode(null);
    }
  }

  function handleNavigate(opts: { newTab?: boolean }) {
    if (externalTarget) {
      if (isSafeNavigationUrl(externalTarget.url)) {
        window.open(externalTarget.url, '_blank', 'noopener,noreferrer');
      } else {
        // eslint-disable-next-line no-console
        console.warn('[safe-nav] blocked non-safe scheme:', externalTarget.url);
      }
      return;
    }
    if (assetPath) {
      const assetHash = hashFromAssetPath(assetPath);
      if (opts.newTab) {
        window.open(assetHash, '_blank', 'noopener,noreferrer');
      } else {
        window.location.hash = assetHash;
      }
      return;
    }
    if (!linkIntent) return;
    if (linkIntent.kind === 'create') {
      void handleCreatePage('missing');
      return;
    }
    const docName = linkIntent.hashDocName;
    if (opts.newTab) {
      openInternalHashHrefInNewTab({ docName, anchor });
      return;
    }
    if (anchor) {
      const hashMatch = window.location.hash.match(/^#\/([^?#/]+)/);
      const currentDoc = hashMatch ? decodeURIComponent(hashMatch[1]) : null;
      if (currentDoc === docName) {
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      window.location.hash = `#/${docName}?anchor=${encodeURIComponent(anchor)}`;
      return;
    }
    window.location.hash = `#/${docName}`;
  }

  const isAsset = !externalTarget && !loading && assetPath !== null;
  const isResolved =
    !externalTarget &&
    !loading &&
    linkIntent?.kind === 'navigate' &&
    linkIntent.displayState === 'resolved';
  const isFolder =
    !externalTarget &&
    !loading &&
    linkIntent?.kind === 'navigate' &&
    linkIntent.displayState === 'folder';
  const isUnresolved = !externalTarget && !loading && !assetPath && linkIntent?.kind === 'create';

  let stateLabel: { icon: React.ReactNode; text: string; className: string };
  if (loading) {
    stateLabel = {
      icon: <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />,
      text: 'Loading…',
      className: 'text-muted-foreground',
    };
  } else if (externalTarget) {
    stateLabel = {
      icon: <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'External wiki link',
      className: 'text-foreground',
    };
  } else if (isAsset) {
    stateLabel = {
      icon: <FileImage className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Asset',
      className: 'text-foreground',
    };
  } else if (isFolder) {
    stateLabel = {
      icon: <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Folder (no index)',
      className: 'text-foreground',
    };
  } else if (isUnresolved) {
    stateLabel = {
      icon: <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Page not found',
      className: 'text-red-700 dark:text-red-300',
    };
  } else if (isResolved) {
    stateLabel = {
      icon: <File className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Wiki link',
      className: 'text-foreground',
    };
  } else {
    stateLabel = {
      icon: <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Unrecognized wiki link',
      className: 'text-muted-foreground',
    };
  }

  const triggerReference = {
    getBoundingClientRect: () => {
      const livePos = getPos();
      if (typeof livePos !== 'number') return new DOMRect();
      const liveNode = editor.state.doc.nodeAt(livePos);
      if (!liveNode) return new DOMRect();
      try {
        return posToDOMRect(editor.view, livePos, livePos + liveNode.nodeSize);
      } catch {
        return new DOMRect();
      }
    },
    contextElement: editor.view.dom,
  };

  return (
    <>
      <InteractionPropPanel
        kind="wiki-link"
        ariaLabel="Wiki link options"
        onDeactivate={onClose}
        triggerReference={triggerReference}
      >
        <div className="mb-2 flex items-start gap-2 pr-8">
          <div className={cn('mt-0.5 flex shrink-0', stateLabel.className)}>{stateLabel.icon}</div>
          <div className="flex-1 min-w-0">
            <div className={cn('text-sm font-medium', stateLabel.className)}>{stateLabel.text}</div>
            <div
              className="truncate font-mono text-xs text-muted-foreground"
              title={
                assetPath ??
                (externalTarget ? externalTarget.url : `${target}${anchor ? `#${anchor}` : ''}`)
              }
            >
              {assetPath ??
                (externalTarget ? externalTarget.url : `${target}${anchor ? `#${anchor}` : ''}`)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!isUnresolved ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                handleNavigate({});
                onClose();
              }}
            >
              {externalTarget ? 'Open in new tab' : 'Open'}
            </Button>
          ) : null}
          {isUnresolved ? (
            <Button
              size="sm"
              variant="default"
              disabled={creatingMode !== null}
              onClick={() => void handleCreatePage('missing')}
            >
              {creatingMode === 'missing' ? 'Creating…' : 'Create page'}
            </Button>
          ) : null}
          {isFolder && folderCreateSeed ? (
            <Button
              size="sm"
              variant="outline"
              disabled={creatingMode !== null}
              onClick={() => void handleCreatePage('folder-index')}
            >
              <FilePlus2 className="size-3.5" aria-hidden="true" />
              {creatingMode === 'folder-index' ? 'Creating…' : 'Create index'}
            </Button>
          ) : null}
          {/* Spacer pushes Edit + Remove to the right, separating
              navigation/creation actions (left) from modify-the-mark
              actions (right). */}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button size="sm" variant="destructive" onClick={handleRemove}>
            {isUnresolved ? (
              <Unlink2 className="size-3.5" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            {isUnresolved ? 'Unlink' : 'Remove'}
          </Button>
        </div>
      </InteractionPropPanel>

      <EditWikiLinkDialog
        open={editDialogOpen}
        target={target}
        alias={alias}
        anchor={anchor}
        pages={pages}
        assetPaths={assetPaths}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveEdit}
      />
    </>
  );
}
