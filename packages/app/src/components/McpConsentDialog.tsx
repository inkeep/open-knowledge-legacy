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

import { useId, useState, useSyncExternalStore } from 'react';
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
 * Test-injectable store — production consumers use the default export.
 * Exposed as a prop so `bun test` doesn't need to reset module singletons.
 */
interface McpConsentDialogProps {
  store?: McpConsentStore;
}

export function McpConsentDialog({ store = mcpConsentStore }: McpConsentDialogProps = {}) {
  const request = useSyncExternalStore<OkMcpWiringShowPayload | null>(
    store.subscribe,
    store.getSnapshot,
    () => null,
  );

  if (!request) return null;
  return <McpConsentDialogBody payload={request} store={store} />;
}

interface McpConsentDialogBodyProps {
  payload: OkMcpWiringShowPayload;
  store: McpConsentStore;
}

function McpConsentDialogBody({ payload, store }: McpConsentDialogBodyProps) {
  const detectedEditors = payload.detectedEditors;
  const [selection, setSelection] = useState<ReadonlySet<OkMcpWiringEditorId>>(() =>
    computeInitialSelection(detectedEditors),
  );
  const [busy, setBusy] = useState(false);
  const headingId = useId();
  const descriptionId = useId();

  function onToggle(id: OkMcpWiringEditorId) {
    setSelection((prev) => toggleSelectedId(prev, id));
  }

  async function onAdd() {
    setBusy(true);
    const result = await store.confirm(selectedIdsOrdered(selection, detectedEditors));
    // Regardless of ok/error, the store clears currentRequest on resolution,
    // so `useSyncExternalStore` will unmount this subtree. Log failures; the
    // main-side emits structured `mcp-wiring-write-failed` events as the
    // operator-grade signal per AC2.14.
    if (!result.ok) {
      console.warn('[McpConsentDialog] confirm failed:', result.error);
    }
  }

  async function onSkip() {
    setBusy(true);
    const result = await store.skip();
    if (!result.ok) {
      console.warn('[McpConsentDialog] skip failed:', result.error);
    }
  }

  function onOpenChange(open: boolean) {
    // ESC, outside-click, X button — treat as skip (per OQ-4 minimum-viable).
    if (!open && !busy) void onSkip();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
      >
        <DialogHeader>
          <DialogTitle id={headingId}>Add Open Knowledge to your AI tools</DialogTitle>
          <DialogDescription id={descriptionId}>
            Open Knowledge can register as an MCP server so your AI tools can read and write your
            notes. Detected editors are preselected — you can toggle any row.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 overflow-y-auto rounded-md border border-border bg-card/50 divide-y divide-border">
          {detectedEditors.map((editor) => {
            const checked = selection.has(editor.id);
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
                    aria-describedby={`mcp-consent-label-${editor.id}`}
                  />
                  <span
                    id={`mcp-consent-label-${editor.id}`}
                    className="flex min-w-0 flex-1 flex-col gap-0.5"
                  >
                    <span className="font-medium text-foreground">{editor.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {editor.detected ? 'Detected on this machine' : 'Not detected'}
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
