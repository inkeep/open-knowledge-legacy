
import { toast } from 'sonner';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

interface InstallGitInitToastOptions {
  bridge: OkDesktopBridge | undefined;
  toastImpl?: (message: string) => void;
}

export function installGitInitToast(opts: InstallGitInitToastOptions): (() => void) | undefined {
  const bridge = opts.bridge;
  if (!bridge) return undefined;

  const fire = opts.toastImpl ?? ((msg: string) => toast.info(msg));
  return bridge.onGitInitNotice((evt) => {
    fire(`Initialized git repo at ${evt.gitDir}`);
  });
}
