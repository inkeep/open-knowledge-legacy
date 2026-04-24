import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { usePageList } from '@/components/PageListContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { emitDocumentsChanged } from '@/lib/documents-events';

interface NewItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'file' | 'folder';
  initialDir: string;
  /**
   * Pre-fills the file name input. Only applies when `kind === 'file'`;
   * ignored when `kind === 'folder'` (folder always defaults to `index.md`).
   */
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
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return name;
  return `${name}.md`;
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
interface ShortcutEventLike {
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
        setError(data.error ?? `Failed to create ${kind}`);
        setErrorField('form');
        return;
      }
      const docName = data.docName ?? path.replace(/\.(mdx|md)$/, '');
      onOpenChange(false);
      window.location.hash = `#/${docName}`;
      addPage(docName);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      onCreated?.(docName);
    } catch (err) {
      console.warn('[NewItemDialog] create failed:', err);
      setBusy(false);
      setError('Network error — please try again');
      setErrorField('form');
    }
  }

  const dirDisplay = initialDir || '(root)';
  const title = kind === 'file' ? 'New file' : 'New folder';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* data-ok-layer-spawned — consumed by InteractionLayer's outside-click
        dismiss logic (review Pass-2 Major #12). When this dialog is opened
        from a PropPanel (InternalLinkPropPanel's Create-Page affordance),
        clicking inside it should NOT dismiss the PropPanel. Tagging the
        shared NewItemDialog is safe because it's always modal — interacting
        with it is exclusive, so there's no PropPanel-dismiss scenario to
        preserve when the dialog is open from elsewhere. */}
      <DialogContent className="sm:max-w-md" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? (
              <>
                Create in <span className="font-medium text-foreground">{dirDisplay}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
                  error && (errorField === 'folder' || errorField === 'form') ? errorId : undefined
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
              placeholder="my-note.md"
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
            <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="font-mono uppercase"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isSubmitDisabled}>
            {busy ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
