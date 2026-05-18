import {
  type ClassifiedLinkTarget,
  classifyMarkdownHref,
  isExternalHref,
  resolveAssetProjectPath,
} from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/core';
import { posToDOMRect } from '@tiptap/core';
import {
  CircleAlert,
  File,
  FilePlus2,
  FolderOpen,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { InteractionPropPanel } from '../../components/InteractionPropPanel';
import {
  folderIndexCreateSeed,
  resolveLinkTargetIntent,
} from '../../components/link-target-intent';
import { usePageList } from '../../components/PageListContext';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { type CreatePageSeed, createPageFromSeedAndUpdate } from '../../lib/create-page';
import { normalizeDocNameInput } from '../../lib/doc-paths';
import { cn } from '../../lib/utils';
import { dispatchAssetClick } from '../asset-dispatch';
import {
  buildCurrentRelativeMarkdownHref,
  classifyCurrentMarkdownHref,
  navigateToMarkdownTarget,
  openInternalHashHrefInNewTab,
  toInternalHashHref,
} from '../internal-link-helpers';
import { CopyButton } from './LinkPropPanelCopy';
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
  text: string;
  pages: Set<string>;
  onOpenChange: (open: boolean) => void;
  onSave: (href: string, text: string, labelChanged: boolean) => void;
}

function EditMarkdownLinkDialog({
  open,
  href,
  text,
  pages,
  onOpenChange,
  onSave,
}: EditMarkdownLinkDialogProps) {
  const [editTarget, setEditTarget] = useState('');
  const [editAnchor, setEditAnchor] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editMode, setEditMode] = useState<MarkdownLinkEditMode>('doc');
  const targetId = useId();
  const anchorId = useId();
  const labelId = useId();
  const headingListId = useId();

  const prevOpenRef = useRef(false);
  const labelSnapshotRef = useRef('');

  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    if (prevOpenRef.current) return;
    prevOpenRef.current = true;
    labelSnapshotRef.current = text;
    setEditLabel(text);
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
  }, [open, href, text]);

  const docTarget = normalizeDocNameInput(editTarget);
  const docTargetMode = editMode === 'doc';
  const resolvedDocTarget = docTargetMode && isResolvedWikiLinkTarget(docTarget, pages);
  const headings = useHeadings(docTarget, resolvedDocTarget && open);
  const showHeadings = !!headings?.length;

  function handleSave() {
    const trimmedTarget = editTarget.trim();
    if (!trimmedTarget) return;
    const nextHref = docTargetMode
      ? buildCurrentRelativeMarkdownHref(docTarget, editAnchor.trim() || null)
      : trimmedTarget;
    const labelChanged = editLabel.trim() !== labelSnapshotRef.current.trim();
    onSave(nextHref, editLabel, labelChanged);
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle>Edit markdown link</DialogTitle>
          <DialogDescription>Update the destination and optional section anchor.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-6">
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
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={labelId}>
                Label <span className="font-normal text-muted-foreground">(visible link text)</span>
              </label>
              <Input
                id={labelId}
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Display text"
                onKeyDown={handleKeyDown}
              />
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
                  onKeyDown={handleKeyDown}
                />
                {/*
                  Heading-list is plain click-to-toggle buttons — not a
                  WAI-ARIA listbox. Previously declared role="listbox" /
                  role="option" but lacked the matching keyboard model
                  (arrow nav, aria-activedescendant). axe-core flags the
                  role + missing keyboard model as a conflict; native
                  button semantics already match the actual interaction.
                */}
                {showHeadings ? (
                  <div
                    id={headingListId}
                    className="mt-1.5 max-h-36 overflow-y-auto subtle-scrollbar rounded-md border border-border bg-muted/30"
                  >
                    {headings.map((heading) => (
                      <button
                        key={`${heading.slug}-${heading.level}-${heading.text}`}
                        type="button"
                        aria-pressed={editAnchor === heading.slug}
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
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!editTarget.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [creatingMode, setCreatingMode] = useState<'missing' | 'folder-index' | null>(null);

  const { addPage, folderPaths, pages, loading } = usePageList();

  if (!info || !href) {
    return null;
  }

  const target = classifyMarkdownHref(href, sourceDocName);

  const displayHref =
    target?.kind === 'doc'
      ? `${target.docName}${target.anchor ? `#${target.anchor}` : ''}`
      : target?.kind === 'anchor'
        ? `#${target.anchor}`
        : target?.kind === 'external'
          ? target.url
          : href;

  const linkText = editor.state.doc.textBetween(info.from, info.to);

  function handleSave(nextHref: string, nextText: string, labelChanged: boolean) {
    const live = getCurrentMarkInfo(editor.state, nodeId);
    if (!live) return;
    const trimmedText = nextText.trim();
    if (!labelChanged || !trimmedText) {
      editor
        .chain()
        .setTextSelection({ from: live.from, to: live.to })
        .extendMarkRange('link')
        .updateAttributes('link', { href: nextHref })
        .run();
      return;
    }
    const linkType = editor.schema.marks.link;
    if (!linkType) return;
    const linkMark = linkType.create({ href: nextHref });
    const textNode = editor.schema.text(trimmedText, [linkMark]);
    editor.view.dispatch(editor.state.tr.replaceWith(live.from, live.to, textNode));
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
    if (target.kind === 'asset') {
      const projectRelPath = resolveAssetProjectPath(target.url, sourceDocName);
      if (!projectRelPath) return;
      void dispatchAssetClick({
        url: target.url,
        projectRelPath,
        ext: target.ext,
        title: projectRelPath.split('/').pop() ?? target.url,
        forceOsDelegation: opts.newTab ?? false,
      });
      return;
    }
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

  function updateMissingLinkHref(docName: string) {
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

  let stateLabel: { icon: React.ReactNode; text: string; className: string };
  let isUnresolved = false;
  let isFolder = false;
  let folderCreateSeed: ReturnType<typeof folderIndexCreateSeed> = null;
  let missingCreateSeed: CreatePageSeed | null = null;

  if (loading) {
    stateLabel = {
      icon: <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />,
      text: 'Loading',
      className: 'text-muted-foreground',
    };
  } else if (target?.kind === 'asset') {
    stateLabel = {
      icon: <File className="size-3.5 shrink-0" aria-hidden="true" />,
      text: 'Asset reference',
      className: 'text-foreground',
    };
  } else if (target?.kind === 'external') {
    stateLabel = {
      icon: <Globe className="size-3.5 shrink-0" aria-hidden="true" />,
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
    missingCreateSeed =
      intent.kind === 'create'
        ? { initialDir: intent.initialDir, suggestedName: intent.suggestedName }
        : null;
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

  function createSeedForMode(mode: 'missing' | 'folder-index'): CreatePageSeed | null {
    if (mode === 'folder-index') return folderCreateSeed;
    return missingCreateSeed;
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
            updateMissingLinkHref(docName);
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

  const iconNode = (
    <span className={cn('flex shrink-0', stateLabel.className)}>{stateLabel.icon}</span>
  );
  const iconElement = isUnresolved ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0" data-slot="internal-link-prop-panel-icon-trigger">
          {iconNode}
        </span>
      </TooltipTrigger>
      <TooltipContent>{stateLabel.text}</TooltipContent>
    </Tooltip>
  ) : (
    iconNode
  );

  return (
    <>
      <InteractionPropPanel
        kind="internal-link"
        ariaLabel={`${stateLabel.text}: ${displayHref}`}
        onDeactivate={onClose}
        triggerReference={triggerReference}
        className="w-96"
      >
        <div className="flex items-center gap-2 pr-8">
          {iconElement}
          <div
            className="flex-1 min-w-0 truncate text-sm"
            title={displayHref}
            data-slot="internal-link-prop-panel-text"
          >
            <span
              className={cn(
                'font-medium',
                isUnresolved ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {displayHref}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {isUnresolved ? (
              <Button
                type="button"
                size="sm"
                variant="link"
                disabled={creatingMode !== null}
                onClick={() => void handleCreatePage('missing')}
                data-slot="internal-link-prop-panel-create"
                className="flex items-center text-foreground"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {creatingMode === 'missing' ? 'Creating…' : 'Create page'}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={() => {
                  handleNavigate({});
                  onClose();
                }}
                data-slot="internal-link-prop-panel-open"
                className="flex items-center text-foreground"
              >
                {target?.kind === 'external' ? 'Open in new tab' : 'Open'}
              </Button>
            )}
            {isFolder && folderCreateSeed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={creatingMode !== null}
                    onClick={() => void handleCreatePage('folder-index')}
                    aria-label={creatingMode === 'folder-index' ? 'Creating index' : 'Create index'}
                    data-slot="internal-link-prop-panel-create-index"
                  >
                    <FilePlus2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {creatingMode === 'folder-index' ? 'Creating index…' : 'Create index'}
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Edit"
                  onClick={() => setEditDialogOpen(true)}
                  data-slot="internal-link-prop-panel-edit"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <CopyButton copyContent={href} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove"
                  onClick={handleRemove}
                  data-slot="internal-link-prop-panel-remove"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </InteractionPropPanel>

      <EditMarkdownLinkDialog
        open={editDialogOpen}
        href={href}
        text={linkText}
        pages={pages}
        onOpenChange={setEditDialogOpen}
        onSave={handleSave}
      />
    </>
  );
}
