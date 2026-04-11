import {
  getWikiLinkText,
  normalizeNullableString,
  renderWikiLink,
} from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, FilePlus2, Pencil, Trash2 } from 'lucide-react';
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
import { cn } from '../../lib/utils';
import { isResolvedWikiLinkTarget } from './wiki-link-helpers';

interface EditWikiLinkDialogProps {
  open: boolean;
  target: string;
  alias: string | null;
  anchor: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (target: string, alias: string | null, anchor: string | null) => void;
}

function EditWikiLinkDialog({
  open,
  target,
  alias,
  anchor,
  onOpenChange,
  onSave,
}: EditWikiLinkDialogProps) {
  const [editTarget, setEditTarget] = useState(target);
  const [editAlias, setEditAlias] = useState(alias ?? '');
  const [editAnchor, setEditAnchor] = useState(anchor ?? '');
  const targetId = useId();
  const anchorId = useId();
  const aliasId = useId();

  // Reset fields each time the dialog opens (may be for a different link).
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Dialog.Title className="mb-4 text-base font-semibold">Edit wiki link</Dialog.Title>

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
                onKeyDown={handleKeyDown}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={anchorId}>
                Anchor{' '}
                <span className="font-normal text-muted-foreground">(optional heading link)</span>
              </label>
              <Input
                id={anchorId}
                value={editAnchor}
                onChange={(e) => setEditAnchor(e.target.value)}
                placeholder="heading-anchor"
                onKeyDown={handleKeyDown}
              />
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

export function WikiLinkView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const target = String(node.attrs.target ?? '');
  const alias = normalizeNullableString(node.attrs.alias);
  const anchor = normalizeNullableString(node.attrs.anchor);
  const label = getWikiLinkText({ target, alias, anchor });
  const source = renderWikiLink({ target, alias, anchor });
  const { pages, loading, refetch } = usePageList();

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

  function handleOpenPage() {
    window.location.hash = `#/${target}`;
  }

  function handleCreated(docName: string) {
    if (docName !== target) {
      updateAttributes({ target: docName, alias: alias ?? label });
    }
    refetch();
    window.location.hash = `#/${docName}`;
  }

  function handleSaveEdit(newTarget: string, newAlias: string | null, newAnchor: string | null) {
    updateAttributes({ target: newTarget, alias: newAlias, anchor: newAnchor });
  }

  return (
    <>
      <NodeViewWrapper as="span" contentEditable={false}>
        <DropdownMenuRoot>
          <DropdownMenuTrigger asChild>
            <span
              className={cn(
                'mx-0.5 inline-flex max-w-full cursor-pointer select-none items-center rounded-md border px-2 py-0.5 align-baseline text-[0.85em] font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                resolved
                  ? 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 focus-visible:ring-sky-300'
                  : unresolved
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-300'
                    : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted focus-visible:ring-ring',
              )}
              data-target={target}
              data-alias={alias ?? ''}
              data-anchor={anchor ?? ''}
              data-resolved={resolved ? 'true' : 'false'}
              data-resolution-state={resolutionState}
              title={source}
            >
              <span className="truncate">{label}</span>
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-44">
            {resolved && (
              <DropdownMenuItem onSelect={handleOpenPage}>
                <ExternalLink />
                Open page
              </DropdownMenuItem>
            )}
            {unresolved && (
              <DropdownMenuItem onSelect={() => setCreateDialogOpen(true)}>
                <FilePlus2 />
                Create page
              </DropdownMenuItem>
            )}
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
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveEdit}
      />
    </>
  );
}
