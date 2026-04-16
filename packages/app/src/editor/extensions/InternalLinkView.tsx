/**
 * Mark view for markdown links in WYSIWYG.
 *
 * Document links render as wiki-like chips with create/edit/remove affordances.
 * Anchor-only links navigate within the current document, and external links
 * preserve plain-anchor rendering while opening in a new tab.
 */
import { type ClassifiedLinkTarget, isExternalHref } from '@inkeep/open-knowledge-core';
import type { MarkViewProps } from '@tiptap/core';
import { MarkViewContent } from '@tiptap/react';
import { CircleAlert, Ellipsis, File, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import { NewItemDialog } from '../../components/NewItemDialog';
import { usePageList } from '../../components/PageListContext';
import { Button } from '../../components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { docNameToDialogSeed, normalizeDocNameInput } from '../../lib/doc-paths';
import { cn } from '../../lib/utils';
import {
  buildCurrentRelativeMarkdownHref,
  classifyCurrentMarkdownHref,
  navigateToMarkdownTarget,
  openInternalHashHrefInNewTab,
  shouldOpenInNewTab,
  toInternalHashHref,
} from '../internal-link-helpers';
import { LinkTooltipHint } from '../link-tooltip';
import { ExternalLinkChip } from './ExternalLinkChip';
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
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

// ── Component ─────────────────────────────────────────────────────────────────

export function InternalLinkView({ mark, editor, updateAttributes }: MarkViewProps) {
  const href = (mark.attrs.href as string | null) ?? '';
  const target = classifyCurrentMarkdownHref(href);
  const { pages, loading } = usePageList();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  function handleSave(nextHref: string) {
    updateAttributes({ href: nextHref });
  }

  function handleRemove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }

  if (target?.kind === 'external') {
    return (
      <>
        <ExternalLinkChip
          editor={editor}
          href={href}
          label={<MarkViewContent />}
          onNavigate={() => navigateToMarkdownTarget(target)}
          onEdit={() => setEditDialogOpen(true)}
          onRemove={handleRemove}
          wrapperProps={{
            'data-external-link': '',
            'data-link-kind': 'markdown',
            'data-url': target.url,
          }}
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

  if (!target || target.kind !== 'doc') {
    return (
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <a
            href={href}
            className="inline-flex items-center gap-1"
            onClick={(event) => {
              event.preventDefault();
              if (target) {
                navigateToMarkdownTarget(target);
              }
            }}
          >
            <MarkViewContent />
          </a>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <LinkTooltipHint href={href} />
        </TooltipContent>
      </Tooltip>
    );
  }

  const docTarget = target;
  const isResolved = !loading && pages.has(docTarget.docName);
  const isUnresolved = !loading && !pages.has(docTarget.docName);

  const hashHref = toInternalHashHref(docTarget);
  const createDialogSeed = docNameToDialogSeed(docTarget.docName);

  function handlePrimaryClick(e: React.MouseEvent) {
    e.preventDefault();
    if (isUnresolved) {
      setCreateDialogOpen(true);
      return;
    }
    if (shouldOpenInNewTab(e)) {
      openInternalHashHrefInNewTab(docTarget);
      return;
    }
    navigateToMarkdownTarget(docTarget);
  }

  function handleCreated(docName: string) {
    updateAttributes({ href: buildCurrentRelativeMarkdownHref(docName, docTarget.anchor ?? null) });
  }

  const resolutionState = loading ? 'loading' : isResolved ? 'resolved' : 'unresolved';

  return (
    <>
      <DropdownMenuRoot>
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'group mx-0.5 inline-flex max-w-full select-none items-center gap-0.5 rounded-sm px-1.5 py-0.5 align-baseline text-sm font-medium',
                isResolved &&
                  'bg-azure-900/5 text-azure-500 hover:bg-azure-50 dark:bg-azure-100/10 dark:text-azure-200',
                isUnresolved &&
                  'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-100/10 dark:text-red-300 dark:hover:bg-red-100/10 dark:hover:text-red-200',
                loading && 'bg-muted/60 text-muted-foreground hover:bg-muted',
              )}
              data-internal-link=""
              data-resolution-state={resolutionState}
              data-doc-name={docTarget.docName}
              data-anchor={docTarget.anchor ?? ''}
            >
              <a
                href={hashHref}
                className={cn(
                  'flex cursor-pointer items-center gap-1 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                  isResolved
                    ? 'focus-visible:ring-sky-300'
                    : isUnresolved
                      ? 'focus-visible:ring-red-300'
                      : 'focus-visible:ring-ring',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handlePrimaryClick}
              >
                {loading && (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                )}
                {isResolved && <File className="size-3.5 shrink-0" aria-hidden="true" />}
                {isUnresolved && <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />}
                <MarkViewContent />
              </a>

              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'hidden ml-0.5 shrink-0 items-center rounded-sm p-0.5',
                    'group-hover:inline-flex group-focus-within:inline-flex data-[state=open]:inline-flex',
                    'hover:bg-black/10 focus-visible:inline-flex focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current',
                  )}
                  aria-label="Link options"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Ellipsis className="size-3" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {isUnresolved ? <div>This page cannot be found.</div> : <LinkTooltipHint href={href} />}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          align="start"
          className="w-36"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            editor.commands.focus();
          }}
        >
          <DropdownMenuItem onSelect={() => setEditDialogOpen(true)}>
            <Pencil aria-hidden="true" />
            Edit link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600 focus:bg-red-50"
            onSelect={handleRemove}
          >
            <Trash2 aria-hidden="true" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuRoot>

      <NewItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        kind="file"
        initialDir={createDialogSeed.initialDir}
        suggestedName={createDialogSeed.suggestedName}
        description={
          <>
            Create a page for{' '}
            <span className="font-medium text-foreground">{docTarget.docName}</span>
          </>
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
