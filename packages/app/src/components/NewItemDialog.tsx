import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { usePageList } from '@/components/PageListContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { emitDocumentsChanged } from '@/lib/documents-events';

export interface NewItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'file' | 'folder';
  initialDir: string;
  suggestedName?: string;
  description?: ReactNode;
  onCreated?: (docName: string) => void;
}

export function validatePath(value: string): string | null {
  if (!value.trim()) return 'Name cannot be empty';
  if (value.includes('..')) return 'Path cannot contain ".."';
  if (value.startsWith('/')) return 'Path cannot start with "/"';
  if (value.includes('\\')) return 'Path cannot contain backslashes';
  if (value.includes('\0')) return 'Path cannot contain null bytes';
  return null;
}

export function ensureMdExtension(name: string): string {
  return name.endsWith('.md') ? name : `${name}.md`;
}

/**
 * Compose the final path to POST to /api/create-page.
 * Trims fileName and folderName; auto-appends `.md`. Returns the canonical path
 * relative to the content directory (no leading slash).
 */
export function composeNewItemPath(args: {
  kind: 'file' | 'folder';
  initialDir: string;
  fileName: string;
  folderName?: string;
}): string {
  const file = ensureMdExtension(args.fileName.trim());
  if (args.kind === 'folder') {
    const folder = (args.folderName ?? '').trim();
    const base = args.initialDir ? `${args.initialDir}/${folder}` : folder;
    return `${base}/${file}`;
  }
  return args.initialDir ? `${args.initialDir}/${file}` : file;
}

/**
 * Pure predicate: does a keyboard event match the Cmd/Ctrl+Alt+N shortcut
 * and is it coming from a target that is NOT an input/textarea/contenteditable?
 * Used by the global NewItemShortcutHandler; exported for unit testing.
 */
export interface ShortcutEventLike {
  // Use a duck-typed target shape so the predicate is trivially unit-testable
  // without constructing real DOM events. Production callers pass
  // KeyboardEvent which widens to this via a cast at the call site.
  target: { tagName?: string; isContentEditable?: boolean } | null;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  key: string;
}

export function isNewItemShortcut(e: ShortcutEventLike): boolean {
  const target = e.target;
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
    return false;
  }
  const modKey = e.metaKey || e.ctrlKey;
  return Boolean(modKey && e.altKey && e.key.toLowerCase() === 'n');
}

function selectBasename(input: HTMLInputElement) {
  const value = input.value;
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex > 0) {
    input.setSelectionRange(0, dotIndex);
  } else {
    input.select();
  }
}

export function NewItemDialog({
  open,
  onOpenChange,
  kind,
  initialDir,
  suggestedName,
  description,
  onCreated,
}: NewItemDialogProps) {
  const { addPage } = usePageList();
  const [fileName, setFileName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorField, setErrorField] = useState<'folder' | 'file' | 'form' | null>(null);
  const errorId = useId();
  const folderInputId = useId();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setErrorField(null);
      setBusy(false);
      setFolderName('');
      if (kind === 'file') {
        setFileName(suggestedName ?? 'untitled.md');
      } else {
        setFileName('index.md');
      }
    }
  }, [open, kind, suggestedName]);

  function composePath(): string {
    return composeNewItemPath({ kind, initialDir, fileName, folderName });
  }

  function getClientError(): { message: string; field: 'folder' | 'file' } | null {
    if (kind === 'folder') {
      const folderErr = validatePath(folderName.trim());
      if (folderErr) return { message: `Folder name: ${folderErr}`, field: 'folder' };
    }
    const fileErr = validatePath(fileName.trim());
    if (fileErr) return { message: fileErr, field: 'file' };
    return null;
  }

  const isSubmitDisabled = busy || !fileName.trim() || (kind === 'folder' && !folderName.trim());

  async function handleCreate() {
    const clientError = getClientError();
    if (clientError) {
      setError(clientError.message);
      setErrorField(clientError.field);
      return;
    }

    setBusy(true);
    setError(null);
    setErrorField(null);
    const path = composePath();

    try {
      const res = await fetch('/api/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        let msg = `Server error (HTTP ${res.status})`;
        try {
          const d = (await res.json()) as { error?: string };
          if (d?.error) msg = d.error;
        } catch {}
        setBusy(false);
        setError(msg);
        setErrorField('form');
        return;
      }
      const data = (await res.json()) as { ok: boolean; docName?: string; error?: string };
      setBusy(false);
      if (!data.ok) {
        setError(data.error ?? 'Failed to create page');
        setErrorField('form');
        return;
      }
      const docName = data.docName ?? path.replace(/\.md$/, '');
      onOpenChange(false);
      window.location.hash = `#/${docName}`;
      addPage(docName);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      onCreated?.(docName);
    } catch (err) {
      console.error('[NewItemDialog] create failed:', err);
      setBusy(false);
      setError('Network error — please try again');
      setErrorField('form');
    }
  }

  const dirDisplay = initialDir || '(root)';
  const title = kind === 'file' ? 'New file' : 'New folder';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Dialog.Title className="mb-1 text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            {description ?? (
              <>
                Create in <span className="font-medium text-foreground">{dirDisplay}</span>
              </>
            )}
          </Dialog.Description>

          <div className="mb-4 space-y-3">
            {kind === 'folder' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor={folderInputId}>
                  Folder name
                </label>
                <Input
                  ref={folderInputRef}
                  id={folderInputId}
                  value={folderName}
                  onChange={(e) => {
                    setFolderName(e.target.value);
                    setError(null);
                  }}
                  placeholder="folder-name"
                  autoFocus
                  aria-describedby={
                    error && (errorField === 'folder' || errorField === 'form')
                      ? errorId
                      : undefined
                  }
                  aria-invalid={
                    error && (errorField === 'folder' || errorField === 'form') ? true : undefined
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const folderErr = validatePath(folderName.trim());
                      if (folderErr) {
                        setError(`Folder name: ${folderErr}`);
                        setErrorField('folder');
                        return;
                      }
                      fileInputRef.current?.focus();
                    }
                  }}
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={fileInputId}>
                {kind === 'folder' ? 'First file name' : 'File name'}
              </label>
              <Input
                ref={fileInputRef}
                id={fileInputId}
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  setError(null);
                }}
                placeholder="my-page.md"
                autoFocus={kind === 'file'}
                aria-describedby={
                  error && (errorField === 'file' || errorField === 'form') ? errorId : undefined
                }
                aria-invalid={
                  error && (errorField === 'file' || errorField === 'form') ? true : undefined
                }
                onFocus={(e) => selectBasename(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSubmitDisabled) void handleCreate();
                }}
              />
            </div>
            {error && (
              <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitDisabled}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
