/**
 * InternalLinkPropPanel — singleton React UI for the active internal link mark.
 *
 * Replaces the per-instance `InternalLinkView` React MarkView with a single
 * subtree rendered at editor root via the InteractionLayer (FR4/FR5). The
 * chip itself is plain DOM (see `internal-link.ts` `renderHTML`), so on a
 * PROJECT.md-scale doc 768 React portals collapse to one. See V2 SPEC §9.2
 * + cold-mount-profile §Corrected 5-component attribution row 4.
 *
 * Reads live MarkInfo via `getCurrentMarkInfo(editor.state, nodeId)` (the
 * `mark-interaction-bridge` contract) so positions stay current as the user
 * edits — captured `from`/`to` would go stale across transactions.
 *
 * Three cases handled at render time, mirroring the pre-V2 InternalLinkView:
 *   - 'doc'      → show navigate / edit / remove + create-dialog when missing
 *   - 'external' → show navigate / edit / remove
 *   - 'anchor'   → show navigate / edit / remove
 *
 * The PropPanel is anchored to the chip via Floating UI (`computePosition` +
 * `autoUpdate`) inside `InteractionPropPanel`. The caller passes a virtual
 * reference whose `getBoundingClientRect` resolves the live mark range via
 * `getCurrentMarkInfo` + `posToDOMRect`, so the panel tracks PM edits and
 * scroll without stale rects.
 */

import {
  type ClassifiedLinkTarget,
  classifyMarkdownHref,
  isExternalHref,
} from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/core';
import { posToDOMRect } from '@tiptap/core';
import {
  CircleAlert,
  ExternalLink,
  File,
  FilePlus2,
  FolderOpen,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import { InteractionPropPanel } from '../../components/InteractionPropPanel';
import {
  folderIndexCreateSeed,
  resolveLinkTargetIntent,
} from '../../components/link-target-intent';
import { NewItemDialog } from '../../components/NewItemDialog';
import { usePageList } from '../../components/PageListContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { normalizeDocNameInput } from '../../lib/doc-paths';
import { cn } from '../../lib/utils';
import {
  buildCurrentRelativeMarkdownHref,
  classifyCurrentMarkdownHref,
  navigateToMarkdownTarget,
  openInternalHashHrefInNewTab,
  toInternalHashHref,
} from '../internal-link-helpers';
import { getCurrentMarkInfo } from './mark-interaction-bridge';
import { useHeadings } from './use-headings';
import { isResolvedWikiLinkTarget } from './wiki-link-helpers';

type MarkdownLinkEditMode = 'doc' | 'anchor' | 'external';

function getMarkdownLinkEditMode(
  value: string,
  fallback: MarkdownLinkEditMode,
): MarkdownLinkEditMode {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('#')) return 'anchor';
  if (trimmed.startsWith('/') || isExternalHref(trimmed)) return 'external';
  return 'doc';
}

function getInitialMarkdownLinkEditMode(target: ClassifiedLinkTarget | null): MarkdownLinkEditMode {
  if (target?.kind === 'doc') return 'doc';
  if (target?.kind === 'anchor') return 'anchor';
  return 'external';
}

interface EditMarkdownLinkDialogProps {
  open: boolean;
  href: string;
  pages: Set<string>;
  onOpenChange: (open: boolean) => void;
  onSave: (href: string) => void;
}

function EditMarkdownLinkDialog({
  open,
  href,
  pages,
  onOpenChange,
  onSave,
}: EditMarkdownLinkDialogProps) {
  const [editTarget, setEditTarget] = useState('');
  const [editAnchor, setEditAnchor] = useState('');
  const [editMode, setEditMode] = useState<MarkdownLinkEditMode>('doc');
  const targetId = useId();
  const anchorId = useId();
  const headingListId = useId();

  useEffect(() => {
    if (!open) return;
    const classified = classifyCurrentMarkdownHref(href);
    setEditMode(getInitialMarkdownLinkEditMode(classified));
    if (classified?.kind === 'doc') {
      setEditTarget(classified.docName);
      setEditAnchor(classified.anchor ?? '');
      return;
    }
    if (classified?.kind === 'anchor') {
      setEditTarget(`#${classified.anchor}`);
      setEditAnchor('');
      return;
    }
    setEditTarget(classified?.kind === 'external' ? classified.url : href);
    setEditAnchor('');
  }, [href, open]);

  const docTarget = normalizeDocNameInput(editTarget);
  const docTargetMode = editMode === 'doc';
  const resolvedDocTarget = docTargetMode && isResolvedWikiLinkTarget(docTarget, pages);
  const headings = useHeadings(docTarget, resolvedDocTarget && open);
  const showHeadings = !!headings?.length;

  function handleSave() {
    const trimmedTarget = editTarget.trim();
    if (!trimmedTarget) return;
    if (docTargetMode) {
      onSave(buildCurrentRelativeMarkdownHref(docTarget, editAnchor.trim() || null));
    } else {
      onSave(trimmedTarget);
    }
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          data-slot="dialog-content"
          data-ok-layer-spawned=""
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <Dialog.Title className="mb-1 text-base font-semibold">Edit markdown link</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Update the destination and optional section anchor.
          </Dialog.Description>

          <div className="mb-4 space-y-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={targetId}>
                {docTargetMode ? 'Page' : 'Link target'}
              </label>
              <Input
                id={targetId}
                value={editTarget}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setEditTarget(nextValue);
                  setEditMode((current) => getMarkdownLinkEditMode(nextValue, current));
                }}
                placeholder="guides/install or https://example.com"
                autoFocus
                onKeyDown={handleKeyDown}
              />
              {docTargetMode ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  This changes the destination page. The visible link text stays editable inline in
                  the document.
                </p>
              ) : null}
            </div>

            {docTargetMode ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor={anchorId}>
                  Section{' '}
                  <span className="font-normal text-muted-foreground">
                    (optional heading anchor)
                  </span>
                </label>
                <Input
                  id={anchorId}
                  value={editAnchor}
                  onChange={(e) => setEditAnchor(e.target.value)}
                  placeholder="heading-slug"
                  aria-controls={showHeadings ? headingListId : undefined}
                  aria-expanded={showHeadings ? true : undefined}
                  aria-haspopup={showHeadings ? 'listbox' : undefined}
                  onKeyDown={handleKeyDown}
                />
                {showHeadings ? (
                  <div
                    role="listbox"
                    id={headingListId}
                    aria-label="Heading anchors"
                    className="mt-1.5 max-h-36 overflow-y-auto subtle-scrollbar rounded-md border border-border bg-muted/30"
                  >
                    {headings.map((heading) => (
                      <button
                        key={`${heading.slug}-${heading.level}-${heading.text}`}
                        type="button"
                        role="option"
                        aria-selected={editAnchor === heading.slug}
                        className={cn(
                          'flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                          editAnchor === heading.slug && 'bg-accent text-accent-foreground',
                        )}
                        style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                        onClick={() =>
                          setEditAnchor(editAnchor === heading.slug ? '' : heading.slug)
                        }
                      >
                        <span className="w-7 shrink-0 font-mono text-[10px] text-muted-foreground">
                          H{heading.level}
                        </span>
                        <span className="truncate">{heading.text}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
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

interface InternalLinkPropPanelProps {
  editor: Editor;
  nodeId: string;
  sourceDocName: string;
  onClose: () => void;
}

export function InternalLinkPropPanel({
  editor,
  nodeId,
  sourceDocName,
  onClose,
}: InternalLinkPropPanelProps) {
  const info = getCurrentMarkInfo(editor.state, nodeId);
  const href = (info?.attrs?.href as string | undefined) ?? '';

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogMode, setCreateDialogMode] = useState<'missing' | 'folder-index' | null>(null);

  const { folderPaths, pages, loading } = usePageList();

  if (!info || !href) {
    // Mark removed mid-render — gracefully close.
    return null;
  }

  const target = classifyMarkdownHref(href, sourceDocName);

  // Human-readable display path. Strips markdown-link surface
  // (`./` prefix, `.md` suffix) for doc kinds; preserves the URL form
  // for external; preserves `#anchor` for in-doc anchor jumps. The raw
  // `href` is still kept on the title attr for hover-disclosure.
  const displayHref =
    target?.kind === 'doc'
      ? `${target.docName}${target.anchor ? `#${target.anchor}` : ''}`
      : target?.kind === 'anchor'
        ? `#${target.anchor}`
        : target?.kind === 'external'
          ? target.url
          : href;

  function handleSave(nextHref: string) {
    const live = getCurrentMarkInfo(editor.state, nodeId);
    if (!live) return;
    editor
      .chain()
      .setTextSelection({ from: live.from, to: live.to })
      .extendMarkRange('link')
      .updateAttributes('link', { href: nextHref })
      .run();
  }

  function handleRemove() {
    const live = getCurrentMarkInfo(editor.state, nodeId);
    if (!live) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: live.from, to: live.to })
      .extendMarkRange('link')
      .unsetLink()
      .run();
    onClose();
  }

  function handleNavigate(opts: { newTab?: boolean }) {
    if (!target) return;
    if (target.kind === 'external') {
      navigateToMarkdownTarget(target);
      return;
    }
    if (target.kind === 'anchor' || target.kind === 'doc') {
      const docName = target.kind === 'doc' ? target.docName : sourceDocName;
      const anchor = target.anchor ?? null;
      if (opts.newTab) {
        openInternalHashHrefInNewTab({ docName, anchor });
      } else {
        window.location.assign(toInternalHashHref({ docName, anchor }));
      }
    }
  }

  function handleCreated(docName: string) {
    if (createDialogMode !== 'missing') return;
    const live = getCurrentMarkInfo(editor.state, nodeId);
    if (!live) return;
    editor
      .chain()
      .setTextSelection({ from: live.from, to: live.to })
      .extendMarkRange('link')
      .updateAttributes('link', {
        href: buildCurrentRelativeMarkdownHref(
          docName,
          target?.kind === 'doc' ? (target.anchor ?? null) : null,
        ),
      })
      .run();
  }

  // Determine resolution state for the panel header label.
  let stateLabel: { icon: React.ReactNode; text: string; className: string };
  let isUnresolved = false;
  let isFolder = false;
  let folderCreateSeed: ReturnType<typeof folderIndexCreateSeed> = null;

  if (loading) {
    stateLabel = {
      icon: <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />,
      text: 'Loading…',
      className: 'text-muted-foreground',
    };
  } else if (target?.kind === 'external') {
    stateLabel = {
      icon: <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'External link',
      className: 'text-foreground',
    };
  } else if (target?.kind === 'anchor') {
    stateLabel = {
      icon: <File className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Anchor in this page',
      className: 'text-foreground',
    };
  } else if (target?.kind === 'doc') {
    const intent = resolveLinkTargetIntent(target.docName, { pages, folderPaths });
    folderCreateSeed = folderIndexCreateSeed(intent);
    isFolder = intent.kind === 'navigate' && intent.displayState === 'folder';
    isUnresolved = intent.kind === 'create';
    if (isFolder) {
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
    } else {
      stateLabel = {
        icon: <File className="size-3.5 shrink-0" aria-hidden="true" />,
        text: 'Page link',
        className: 'text-foreground',
      };
    }
  } else {
    stateLabel = {
      icon: <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Unrecognized link',
      className: 'text-muted-foreground',
    };
  }

  // Floating-UI virtual reference. Each tick `getCurrentMarkInfo` resolves
  // the current mark range from PM state, then `posToDOMRect` yields the
  // chip's rect. Tracks live edits + scroll. Mirrors WikiLinkPropPanel.
  const triggerReference = {
    getBoundingClientRect: () => {
      const live = getCurrentMarkInfo(editor.state, nodeId);
      if (!live) return new DOMRect();
      try {
        return posToDOMRect(editor.view, live.from, live.to);
      } catch {
        return new DOMRect();
      }
    },
    contextElement: editor.view.dom,
  };

  return (
    <>
      <InteractionPropPanel
        kind="internal-link"
        ariaLabel="Link options"
        onDeactivate={onClose}
        triggerReference={triggerReference}
      >
        <div className="mb-2 flex items-start gap-2 pr-8">
          <div className={cn('mt-0.5 flex shrink-0', stateLabel.className)}>{stateLabel.icon}</div>
          <div className="flex-1 min-w-0">
            <div className={cn('text-sm font-medium', stateLabel.className)}>{stateLabel.text}</div>
            <div className="truncate font-mono text-xs text-muted-foreground" title={displayHref}>
              {displayHref}
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
              {target?.kind === 'external' ? 'Open in new tab' : 'Open'}
            </Button>
          ) : null}
          {isUnresolved ? (
            <Button size="sm" variant="default" onClick={() => setCreateDialogMode('missing')}>
              Create page
            </Button>
          ) : null}
          {isFolder && folderCreateSeed ? (
            <Button size="sm" variant="outline" onClick={() => setCreateDialogMode('folder-index')}>
              <FilePlus2 className="size-3.5" aria-hidden="true" />
              Create index
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
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove
          </Button>
        </div>
      </InteractionPropPanel>

      <NewItemDialog
        open={createDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) setCreateDialogMode(null);
        }}
        kind="file"
        initialDir={
          createDialogMode === 'folder-index' && folderCreateSeed
            ? folderCreateSeed.initialDir
            : isUnresolved && target?.kind === 'doc'
              ? resolveLinkTargetIntent(target.docName, { pages, folderPaths }).kind === 'create'
                ? (
                    resolveLinkTargetIntent(target.docName, { pages, folderPaths }) as {
                      kind: 'create';
                      initialDir: string;
                    }
                  ).initialDir
                : ''
              : ''
        }
        suggestedName={
          createDialogMode === 'folder-index' && folderCreateSeed
            ? folderCreateSeed.suggestedName
            : isUnresolved && target?.kind === 'doc'
              ? resolveLinkTargetIntent(target.docName, { pages, folderPaths }).kind === 'create'
                ? (
                    resolveLinkTargetIntent(target.docName, { pages, folderPaths }) as {
                      kind: 'create';
                      suggestedName?: string;
                    }
                  ).suggestedName
                : undefined
              : undefined
        }
        description={
          createDialogMode === 'folder-index' && folderCreateSeed ? (
            <>
              Create an index note for{' '}
              <span className="font-medium text-foreground">{folderCreateSeed.initialDir}/</span>
            </>
          ) : (
            <>
              Create a page for{' '}
              <span className="font-medium text-foreground">
                {target?.kind === 'doc' ? target.docName : ''}
              </span>
            </>
          )
        }
        onCreated={handleCreated}
      />

      <EditMarkdownLinkDialog
        open={editDialogOpen}
        href={href}
        pages={pages}
        onOpenChange={setEditDialogOpen}
        onSave={handleSave}
      />
    </>
  );
}
