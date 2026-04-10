import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSuggestedPath(target: string): string {
  const match = window.location.hash.match(/^#doc=(.+)$/);
  const currentDoc = match ? decodeURIComponent(match[1]) : 'test-doc';
  const lastSlash = currentDoc.lastIndexOf('/');
  const dir = lastSlash > 0 ? currentDoc.slice(0, lastSlash + 1) : '';
  return `${dir}${toSlug(target)}.md`;
}

interface CreatePageDialogProps {
  open: boolean;
  target: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (docName: string) => void;
}

export function CreatePageDialog({ open, target, onOpenChange, onCreated }: CreatePageDialogProps) {
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset state each time the dialog opens (possibly for a different target).
  useEffect(() => {
    if (open) {
      setPath(getSuggestedPath(target));
      setError(null);
    }
  }, [open, target]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = (await res.json()) as { ok: boolean; docName?: string; error?: string };
      setBusy(false);
      if (!data.ok) {
        setError(data.error ?? 'Failed to create page');
        return;
      }
      onCreated(data.docName ?? path.replace(/\.md$/, ''));
      onOpenChange(false);
    } catch {
      setBusy(false);
      setError('Network error — please try again');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Dialog.Title className="mb-1 text-base font-semibold">Create page</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Create a new page for <span className="font-medium text-foreground">[[{target}]]</span>
          </Dialog.Description>

          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium" htmlFor="create-page-path">
              Path
            </label>
            <Input
              id="create-page-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="my-page.md"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) handleCreate();
              }}
            />
            {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={busy || !path.trim()}>
              {busy ? 'Creating…' : 'Create page'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
