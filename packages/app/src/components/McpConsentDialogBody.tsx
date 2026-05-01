
import { useState } from 'react';
import { toast as sonnerToast } from 'sonner';
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
import type { OkMcpWiringEditorId, OkMcpWiringShowPayload } from '@/lib/desktop-bridge-types';
import { type McpConsentStore, mcpConsentStore } from '@/lib/mcp-consent-store';

type EditorDetection = OkMcpWiringShowPayload['detectedEditors'][number];

export function computeInitialSelection(
  detectedEditors: readonly EditorDetection[],
): ReadonlySet<OkMcpWiringEditorId> {
  const out = new Set<OkMcpWiringEditorId>();
  for (const d of detectedEditors) if (d.detected) out.add(d.id);
  return out;
}

export function toggleSelectedId(
  prev: ReadonlySet<OkMcpWiringEditorId>,
  id: OkMcpWiringEditorId,
): ReadonlySet<OkMcpWiringEditorId> {
  const next = new Set(prev);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function selectedIdsOrdered(
  selection: ReadonlySet<OkMcpWiringEditorId>,
  detectedEditors: readonly EditorDetection[],
): OkMcpWiringEditorId[] {
  const out: OkMcpWiringEditorId[] = [];
  for (const d of detectedEditors) if (selection.has(d.id)) out.push(d.id);
  return out;
}

export interface McpConsentDialogBodyProps {
  store?: McpConsentStore;
  toast?: ToastImpl;
  payload?: OkMcpWiringShowPayload;
}

export interface ToastImpl {
  error(message: string): void;
}

const defaultToast: ToastImpl = {
  error: (msg) => sonnerToast.error(msg),
};

export function McpConsentDialogBody({
  store = mcpConsentStore,
  toast = defaultToast,
  payload,
}: McpConsentDialogBodyProps = {}) {
  const snapshot = payload ?? store.getSnapshot();
  if (!snapshot) return null;
  return <McpConsentDialogForm payload={snapshot} store={store} toast={toast} />;
}

interface McpConsentDialogFormProps {
  payload: OkMcpWiringShowPayload;
  store: McpConsentStore;
  toast: ToastImpl;
}

function McpConsentDialogForm({ payload, store, toast }: McpConsentDialogFormProps) {
  const detectedEditors = payload.detectedEditors;
  const [selection, setSelection] = useState<ReadonlySet<OkMcpWiringEditorId>>(() =>
    computeInitialSelection(detectedEditors),
  );
  const [busy, setBusy] = useState(false);

  function onToggle(id: OkMcpWiringEditorId) {
    setSelection((prev) => toggleSelectedId(prev, id));
  }

  async function onAdd() {
    setBusy(true);
    const result = await store.confirm(selectedIdsOrdered(selection, detectedEditors));
    if (!result.ok) {
      toast.error(result.error);
      setBusy(false);
    }
  }

  async function onSkip() {
    setBusy(true);
    const result = await store.skip();
    if (!result.ok) {
      toast.error(result.error);
      setBusy(false);
    }
  }

  function onOpenChange(open: boolean) {
    if (!open && !busy) void onSkip();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/*
       * Radix Dialog auto-wires `aria-labelledby` / `aria-describedby` on
       * `DialogContent` from `DialogTitle` / `DialogDescription` via context
       * — no manual `useId` plumbing needed (Review Pass 0 Major #11 +
       * Minor #4). Each editor row's `<label>` provides the implicit
       * accessible name for its checkbox; no `aria-describedby` on the
       * input either, since duplicating the label content via that attr
       * causes screen readers to either announce the label twice or drop
       * the implicit association.
       */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Open Knowledge to your AI tools</DialogTitle>
          <DialogDescription>
            Connect Open Knowledge to your AI tools so they can read and write your notes. Once
            added, asking Claude to summarize or update a page works without copy-paste. Detected
            editors are preselected — you can toggle any row.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <ul className="rounded-md border border-border bg-card/50 divide-y divide-border">
            {detectedEditors.map((editor) => {
              const checked = selection.has(editor.id);
              const statusLabel = editor.willReplace
                ? 'Will replace existing Open Knowledge entry'
                : editor.detected
                  ? 'Detected on this machine'
                  : 'Not detected';
              const statusClass = editor.willReplace
                ? 'text-xs text-amber-600 dark:text-amber-400'
                : 'text-xs text-muted-foreground';
              return (
                <li key={editor.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => onToggle(editor.id)}
                      className="size-4 shrink-0 rounded accent-primary"
                      data-testid={`mcp-consent-checkbox-${editor.id}`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium text-foreground">{editor.label}</span>
                      <span className={statusClass} data-testid={`mcp-consent-status-${editor.id}`}>
                        {statusLabel}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            className="font-mono uppercase"
            onClick={() => void onSkip()}
            disabled={busy}
            data-testid="mcp-consent-skip"
          >
            Skip
          </Button>
          <Button
            onClick={() => void onAdd()}
            disabled={busy || selection.size === 0}
            data-testid="mcp-consent-add"
          >
            {busy ? 'Working...' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default McpConsentDialogBody;
