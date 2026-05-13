import { EDITOR_LABELS } from '@inkeep/open-knowledge-core';
import { toast as sonnerToast } from 'sonner';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { relativeToProject } from '@/lib/project-paths';

const TOAST_DURATION_MS = 4000;
/** "Sticky" toast — large finite duration in lieu of `Infinity`. Used for
 *  MCP-repair outcomes that surface an action item the user must see.
 *  24h is long enough to span typical user idle windows; the close button
 *  on the Toaster gives an immediate-dismiss escape hatch. */
const STICKY_TOAST_DURATION_MS = 24 * 60 * 60 * 1000;

export function installOnboardingToastListener(opts: {
  bridge: OkDesktopBridge | undefined;
}): (() => void) | undefined {
  const bridge = opts.bridge;
  if (!bridge) return undefined;
  if (!bridge.onboarding) return undefined;
  return bridge.onboarding.onToast((payload) => {
    if (payload.kind === 'ancestor-promote') {
      sonnerToast.success(`Opened existing OK project at ${payload.ancestorPath}`, {
        duration: TOAST_DURATION_MS,
      });
      return;
    }
    if (payload.kind === 'mcp-repaired') {
      const names = payload.editors
        .map((id) => EDITOR_LABELS[id as keyof typeof EDITOR_LABELS] ?? id)
        .join(', ');
      sonnerToast.success(`Repaired ${names} MCP integration. Restart ${names} if already open.`, {
        duration: STICKY_TOAST_DURATION_MS,
      });
      return;
    }
    if (payload.kind === 'mcp-repair-failed') {
      sonnerToast.error('MCP auto-repair failed — open Settings → AI Tool Integration to fix.', {
        duration: STICKY_TOAST_DURATION_MS,
      });
      return;
    }
    const subPath = relativeToProject(payload.gitRoot, payload.pickedPath) ?? payload.pickedPath;
    sonnerToast.success(
      `Initialized OK at ${payload.gitRoot} — opened parent of ${subPath} because it contains a .git folder`,
      { duration: TOAST_DURATION_MS },
    );
  });
}
