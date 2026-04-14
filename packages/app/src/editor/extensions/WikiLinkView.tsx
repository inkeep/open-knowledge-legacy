import {
  getWikiLinkText,
  type HeadingEntry,
  normalizeNullableString,
  renderWikiLink,
} from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import { CreatePageDialog } from '../../components/CreatePageDialog';
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
import { cn } from '../../lib/utils';
import { LinkTooltipHint } from '../link-tooltip';
import { isResolvedWikiLinkTarget } from './wiki-link-helpers';

// ── Heading picker ────────────────────────────────────────────────────────────

/** Fetch headings for a resolved page. Returns null while loading, [] when none. */
function useHeadings(docName: string, enabled: boolean): HeadingEntry[] | null {
  const [headings, setHeadings] = useState<HeadingEntry[] | null>(null);

  useEffect(() => {
    if (!enabled || !docName) {
      setHeadings(null);
      return;
    }
    setHeadings(null);
    const controller = new AbortController();
    fetch(`/api/page-headings?docName=${encodeURIComponent(docName)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json() as Promise<{ ok: boolean; headings?: HeadingEntry[] }>)
      .then((data) => {
        if (data.ok && Array.isArray(data.headings)) setHeadings(data.headings);
        else setHeadings([]);
      })
      .catch(() => {
        setHeadings([]);
      });
    return () => controller.abort();
  }, [docName, enabled]);

  return headings;
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

interface EditWikiLinkDialogProps {
  open: boolean;
  target: string;
  alias: string | null;
  anchor: string | null;
  pages: Set<string>;
  onOpenChange: (open: boolean) => void;
  onSave: (target: string, alias: string | null, anchor: string | null) => void;
}

function EditWikiLinkDialog({
  open,
  target,
  alias,
  anchor,
  pages,
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

  // Resolve against the live editTarget so headings update as the user types
  const isEditTargetResolved = isResolvedWikiLinkTarget(editTarget, pages);
  const headings = useHeadings(editTarget, isEditTargetResolved && open);

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

  // Deduplicate heading keys — mirrors heading-anchors.ts so identical heading
  // texts get -1, -2 … suffixes, ensuring stable React keys without array index.
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Dialog.Title className="mb-1 text-base font-semibold">Edit wiki link</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Modify the link target, anchor, and display label.
          </Dialog.Description>

          <div className="mb-4 space-y-3">
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
                  className="mt-1.5 max-h-36 overflow-y-auto rounded-md border border-border bg-muted/30"
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

// ── WikiLinkView ──────────────────────────────────────────────────────────────

export function WikiLinkView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const target = String(node.attrs.target ?? '');
  const alias = normalizeNullableString(node.attrs.alias);
  const anchor = normalizeNullableString(node.attrs.anchor);
  const label = getWikiLinkText({ target, alias, anchor });
  const source = renderWikiLink({ target, alias, anchor });
  const { pages, loading } = usePageList();

  const resolutionState =
    loading && pages.size === 0
      ? 'loading'
      : isResolvedWikiLinkTarget(target, pages)
        ? 'resolved'
        : 'unresolved';
  const resolved = resolutionState === 'resolved';
  const unresolved = resolutionState === 'unresolved';

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  /** Primary click: navigate (resolved/loading) or open create dialog (unresolved). */
  function handlePrimaryClick() {
    if (unresolved) {
      setCreateDialogOpen(true);
      return;
    }
    if (anchor) {
      const hashMatch = window.location.hash.match(/^#\/([^?#/]+)/);
      const currentDoc = hashMatch ? decodeURIComponent(hashMatch[1]) : null;
      if (currentDoc === target) {
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          window.location.hash = `#/${target}?anchor=${encodeURIComponent(anchor)}`;
          return;
        }
      }
      window.location.hash = `#/${target}?anchor=${encodeURIComponent(anchor)}`;
      return;
    }
    window.location.hash = `#/${target}`;
  }

  function handleCreated(docName: string) {
    if (docName !== target) {
      updateAttributes({ target: docName, alias: alias ?? label });
    }
    window.location.hash = `#/${docName}`;
  }

  function handleSaveEdit(newTarget: string, newAlias: string | null, newAnchor: string | null) {
    updateAttributes({ target: newTarget, alias: newAlias, anchor: newAnchor });
  }

  return (
    <>
      <NodeViewWrapper as="span" contentEditable={false}>
        <DropdownMenuRoot>
          {/*
           * Chip — a <span> wrapper (not <button>) groups the primary click button
           * and the ⋯ trigger as siblings. Nesting <button> inside <button> is
           * invalid HTML and causes React hydration warnings.
           *
           * Tooltip surfaces the Cmd/Ctrl+click affordance (shared with
           * InternalLinkView via LinkTooltipHint). 400 ms delay so hover over
           * dense wiki-linked text doesn't spam tooltips.
           */}
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'group mx-0.5 inline-flex max-w-full select-none items-center gap-0.5 rounded-md border px-2 py-0.5 align-baseline text-[0.85em] font-medium',
                  resolved
                    ? 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                    : unresolved
                      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60'
                      : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted',
                )}
                data-target={target}
                data-alias={alias ?? ''}
                data-anchor={anchor ?? ''}
                data-resolved={resolved ? 'true' : 'false'}
                data-resolution-state={resolutionState}
              >
                {/* Primary action — <a> so browsers show the URL in the status bar on hover.
                onMouseDown prevents the <a> from stealing focus from the editor
                (focus fires on mousedown, before click), so Backspace keeps working. */}
                <a
                  href={anchor ? `#/${target}?anchor=${encodeURIComponent(anchor)}` : `#/${target}`}
                  className={cn(
                    'cursor-pointer truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                    resolved
                      ? 'focus-visible:ring-sky-300'
                      : unresolved
                        ? 'focus-visible:ring-red-300'
                        : 'focus-visible:ring-ring',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    handlePrimaryClick();
                  }}
                >
                  {label}
                </a>

                {/* ⋯ menu trigger — shown on chip hover/focus-within, hidden (no space) otherwise.
                data-[state=open]:inline-flex keeps it in layout while Radix measures
                the trigger position — without this the menu appears at 0,0.
                onMouseDown preventDefault stops the button from stealing editor focus. */}
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
                    <Ellipsis className="size-3" />
                  </button>
                </DropdownMenuTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              <LinkTooltipHint href={source} />
            </TooltipContent>
          </Tooltip>

          <DropdownMenuContent
            align="start"
            className="w-36"
            onCloseAutoFocus={(e) => {
              // Radix would return focus to the trigger button, which may be hidden.
              // Redirect back to the editor so Backspace keeps working after close.
              e.preventDefault();
              editor.commands.focus();
            }}
          >
            <DropdownMenuItem onSelect={() => setEditDialogOpen(true)}>
              <Pencil />
              Edit link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 focus:bg-red-50"
              onSelect={deleteNode}
            >
              <Trash2 />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuRoot>
      </NodeViewWrapper>

      <CreatePageDialog
        open={createDialogOpen}
        target={target}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleCreated}
      />

      <EditWikiLinkDialog
        open={editDialogOpen}
        target={target}
        alias={alias}
        anchor={anchor}
        pages={pages}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveEdit}
      />
    </>
  );
}
