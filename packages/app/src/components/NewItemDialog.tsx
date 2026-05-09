import { CreatePageSuccessSchema } from '@inkeep/open-knowledge-core';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { usePageList } from '@/components/PageListContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type TemplateMenuEntry, useFolderConfig } from '@/hooks/use-folder-config';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse } from '@/lib/parse-server-response';
import {
  type DocExtension,
  detectExtension,
  SUPPORTED_EXTENSIONS,
  stripExt,
} from './extension-picker-utils';

const BLANK_TEMPLATE_VALUE = '__blank__';

const SCOPE_ORDER: Record<TemplateMenuEntry['scope'], number> = {
  local: 0,
  inherited: 1,
  user: 2,
};

export function sortTemplatesForPicker(
  templates: readonly TemplateMenuEntry[],
): TemplateMenuEntry[] {
  return [...templates].sort((a, b) => {
    const scopeDelta = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    if (scopeDelta !== 0) return scopeDelta;
    const aLabel = (a.title ?? a.name).toLowerCase();
    const bLabel = (b.title ?? b.name).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

interface NewItemDialogProps {
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
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return name;
  return `${name}.md`;
}

export function composeNewItemPath(args: {
  kind: 'file' | 'folder';
  initialDir: string;
  fileName: string;
  fileExtension?: DocExtension;
  folderName?: string;
}): string {
  const trimmed = args.fileName.trim();
  const sniffed = detectExtension(trimmed);
  const file = sniffed ? trimmed : `${trimmed}${args.fileExtension ?? '.md'}`;
  if (args.kind === 'folder') {
    const folder = (args.folderName ?? '').trim();
    const base = args.initialDir ? `${args.initialDir}/${folder}` : folder;
    return `${base}/${file}`;
  }
  return args.initialDir ? `${args.initialDir}/${file}` : file;
}

interface ShortcutEventLike {
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
  const folderConfig = useFolderConfig(initialDir);
  const [fileName, setFileName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [fileExtension, setFileExtension] = useState<DocExtension>('.md');
  const [selectedTemplate, setSelectedTemplate] = useState<string>(BLANK_TEMPLATE_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorField, setErrorField] = useState<'folder' | 'file' | 'form' | null>(null);
  const errorId = useId();
  const folderInputId = useId();
  const fileInputId = useId();
  const templatePickerLabelId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setErrorField(null);
      setBusy(false);
      setFolderName('');
      setSelectedTemplate(BLANK_TEMPLATE_VALUE);
      const initial = kind === 'file' ? (suggestedName ?? 'untitled') : 'index';
      const sniffed = detectExtension(initial);
      setFileExtension(sniffed ?? '.md');
      setFileName(sniffed ? stripExt(initial) : initial);
    }
  }, [open, kind, suggestedName]);

  const templates: TemplateMenuEntry[] =
    folderConfig.state.status === 'ready'
      ? sortTemplatesForPicker(folderConfig.state.data.folder.templates_available ?? [])
      : [];
  const showTemplatePicker = kind === 'file';
  const templatesLoading =
    folderConfig.state.status === 'loading' || folderConfig.state.status === 'idle';
  const templatesError = folderConfig.state.status === 'error' ? folderConfig.state.message : null;

  function handleFileNameChange(next: string) {
    const sniffed = detectExtension(next);
    if (sniffed) {
      setFileExtension(sniffed);
      setFileName(stripExt(next));
    } else {
      setFileName(next);
    }
    setError(null);
  }

  function composePath(): string {
    return composeNewItemPath({
      kind,
      initialDir,
      fileName,
      fileExtension,
      folderName,
    });
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
    const templateParam =
      kind === 'file' && selectedTemplate !== BLANK_TEMPLATE_VALUE ? selectedTemplate : undefined;
    const requestBody: { path: string; template?: string } = { path };
    if (templateParam !== undefined) requestBody.template = templateParam;

    try {
      const res = await fetch('/api/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const parsed = await parseServerResponse(res, `Server error (HTTP ${res.status})`);
      if (!parsed.ok) {
        setBusy(false);
        setError(parsed.title);
        setErrorField('form');
        return;
      }
      const success = CreatePageSuccessSchema.safeParse(parsed.body);
      setBusy(false);
      if (!success.success) {
        setError(`Failed to create ${kind}`);
        setErrorField('form');
        return;
      }
      const docName = success.data.docName;
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

        <DialogBody>
          <div className="space-y-3">
            {showTemplatePicker && (
              <div>
                <p id={templatePickerLabelId} className="mb-1.5 text-sm font-medium">
                  Start from
                </p>
                {templatesLoading ? (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Loading templates…
                  </div>
                ) : (
                  <>
                    {templatesError ? (
                      <p role="alert" className="mb-1.5 text-xs text-destructive">
                        Could not load templates: {templatesError}. You can still create a blank
                        note.
                      </p>
                    ) : null}
                    <RadioGroup
                      value={selectedTemplate}
                      onValueChange={setSelectedTemplate}
                      aria-labelledby={templatePickerLabelId}
                      className="max-h-56 overflow-y-auto rounded-md border border-border bg-card subtle-scrollbar"
                    >
                      <TemplatePickerRow
                        value={BLANK_TEMPLATE_VALUE}
                        title="Blank note"
                        description="Empty starting content"
                      />
                      {templates.length === 0 && !templatesError ? (
                        <p className="px-3 pb-2 text-xs text-muted-foreground">
                          No templates resolve here. Add one in this folder's Templates section, or
                          in Settings → User templates.
                        </p>
                      ) : (
                        templates.map((tpl) => (
                          <TemplatePickerRow
                            key={`${tpl.scope}:${tpl.source_folder}:${tpl.name}`}
                            value={tpl.name}
                            title={tpl.title ?? tpl.name}
                            subName={tpl.title && tpl.title !== tpl.name ? tpl.name : undefined}
                            description={tpl.description}
                            scope={tpl.scope}
                            sourceFolder={tpl.source_folder}
                          />
                        ))
                      )}
                    </RadioGroup>
                  </>
                )}
              </div>
            )}
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
              <div className="flex items-stretch gap-2">
                <Input
                  ref={fileInputRef}
                  id={fileInputId}
                  value={fileName}
                  onChange={(e) => handleFileNameChange(e.target.value)}
                  placeholder="my-note"
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
                  className="flex-1"
                />
                <ToggleGroup
                  type="single"
                  value={fileExtension}
                  onValueChange={(v) => {
                    if (v === '.md' || v === '.mdx') setFileExtension(v);
                  }}
                  variant="outline"
                  size="sm"
                  aria-label="File extension"
                  className="shrink-0"
                >
                  {SUPPORTED_EXTENSIONS.map((ext) => (
                    <ToggleGroupItem key={ext} value={ext} aria-label={`Use ${ext} extension`}>
                      {ext}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              {error && (
                <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          </div>
        </DialogBody>

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
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TemplatePickerRowProps {
  value: string;
  title: string;
  subName?: string;
  description?: string;
  scope?: TemplateMenuEntry['scope'];
  sourceFolder?: string;
}

function TemplatePickerRow({
  value,
  title,
  subName,
  description,
  scope,
  sourceFolder,
}: TemplatePickerRowProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 px-3 py-2 transition-colors hover:bg-muted/50 has-data-[state=checked]:bg-muted/70"
    >
      <RadioGroupItem id={id} value={value} className="mt-1" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {subName ? (
            <code className="font-mono text-2xs text-muted-foreground shrink-0">{subName}</code>
          ) : null}
          {scope === 'inherited' && sourceFolder ? (
            <Badge variant="gray" className="ml-auto shrink-0 text-2xs">
              {sourceFolder || 'root'}
            </Badge>
          ) : null}
          {scope === 'user' ? (
            <Badge variant="primary" className="ml-auto shrink-0 text-2xs">
              user
            </Badge>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </label>
  );
}
