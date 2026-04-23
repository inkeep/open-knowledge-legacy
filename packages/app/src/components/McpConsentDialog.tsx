/**
 * M6b first-launch MCP consent dialog — host-agnostic modal rendered in both
 * NavigatorApp and App.tsx per D-M6-R10. Self-gates on the module-level
 * `mcpConsentStore` snapshot; renders nothing until main fires
 * `ok:mcp-wiring:show`.
 *
 * Minimum-viable UI per OQ-4: title, scrollable checkbox list of detected
 * editors (preselected per OQ-14 — true if detection.detected), Add primary +
 * Skip secondary. ESC / outside-click = skip via shadcn Dialog's built-in
 * behavior (routed through `onOpenChange(false)` → skip()).
 *
 * No shadcn Checkbox is installed in this repo — native `<input
 * type="checkbox">` styled with Tailwind `accent-primary` is used to keep the
 * minimum-viable scope.
 */

import { useState, useSyncExternalStore } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { OkMcpWiringEditorId, OkMcpWiringShowPayload } from '@/lib/desktop-bridge-types';
import { type McpConsentStore, mcpConsentStore } from '@/lib/mcp-consent-store';

type EditorDetection = OkMcpWiringShowPayload['detectedEditors'][number];

/**
 * Pure helper: from the detection payload, compute the initial checkbox
 * state — each detected editor starts checked (OQ-14 preselect), undetected
 * editors start unchecked but still appear in the list.
 */
export function computeInitialSelection(
  detectedEditors: readonly EditorDetection[],
): ReadonlySet<OkMcpWiringEditorId> {
  const out = new Set<OkMcpWiringEditorId>();
  for (const d of detectedEditors) if (d.detected) out.add(d.id);
  return out;
}

/** Pure helper: toggle a checkbox; returns a new Set (immutable-style). */
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

/**
 * Pure helper: project the selected Set back into an array preserving the
 * detection payload's order. Used at confirm time so downstream writes iterate
 * editors in the same order the user saw them.
 */
export function selectedIdsOrdered(
  selection: ReadonlySet<OkMcpWiringEditorId>,
  detectedEditors: readonly EditorDetection[],
): OkMcpWiringEditorId[] {
  const out: OkMcpWiringEditorId[] = [];
  for (const d of detectedEditors) if (selection.has(d.id)) out.push(d.id);
  return out;
}

/**
 * Test-injectable store + toast — production consumers use the default
 * exports. Exposed as props so `bun test` doesn't need to reset module
 * singletons OR mock the global `sonner` import.
 */
interface McpConsentDialogProps {
  store?: McpConsentStore;
  toast?: ToastImpl;
}

/** Minimal `sonner` surface the dialog uses — only `error`. */
export interface ToastImpl {
  error(message: string): void;
}

const defaultToast: ToastImpl = {
  error: (msg) => sonnerToast.error(msg),
};

export function McpConsentDialog({
  store = mcpConsentStore,
  toast = defaultToast,
}: McpConsentDialogProps = {}) {
  const request = useSyncExternalStore<OkMcpWiringShowPayload | null>(
    store.subscribe,
    store.getSnapshot,
    () => null,
  );

  if (!request) return null;
  return <McpConsentDialogBody payload={request} store={store} toast={toast} />;
}

interface McpConsentDialogBodyProps {
  payload: OkMcpWiringShowPayload;
  store: McpConsentStore;
  toast: ToastImpl;
}

function McpConsentDialogBody({ payload, store, toast }: McpConsentDialogBodyProps) {
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
    // Success: the store clears `currentRequest` → useSyncExternalStore
    // unmounts this subtree, so there's nothing to reset. Failure
    // (ok:false / thrown rejection): the store KEEPS the snapshot
    // populated (Pass 1 Major #1 recovery contract), so we must reset
    // `busy` here or the Add button stays disabled forever and same-boot
    // retry is impossible. Sonner is mounted globally in main.tsx; the
    // toast surfaces even if the dialog were to unmount.
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
      // Matching rationale to onAdd — reset `busy` so Skip stays
      // clickable after a transient marker-write failure.
      setBusy(false);
    }
  }

  function onOpenChange(open: boolean) {
    // ESC, outside-click, X button — treat as skip (per OQ-4 minimum-viable).
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

        <ul className="max-h-72 overflow-y-auto rounded-md border border-border bg-card/50 divide-y divide-border">
          {detectedEditors.map((editor) => {
            const checked = selection.has(editor.id);
            // Pass 1 Major #8: per-editor disclosure when Add would overwrite
            // an existing OK-managed entry. Priority over the detected/not-
            // detected line since the existing-entry state is strictly more
            // specific — an editor with a prior OK entry is necessarily also
            // detected, so showing both is redundant. Orange hint color to
            // signal "this row's behavior is different from the silent-write
            // case" without reading as error-red.
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
