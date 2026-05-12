import { toast as sonnerToast } from 'sonner';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { relativeToProject } from '@/lib/project-paths';

const TOAST_DURATION_MS = 4000;

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
    const subPath = relativeToProject(payload.gitRoot, payload.pickedPath) ?? payload.pickedPath;
    sonnerToast.success(
      `Initialized OK at ${payload.gitRoot} — opened parent of ${subPath} because it contains a .git folder`,
      { duration: TOAST_DURATION_MS },
    );
  });
}
