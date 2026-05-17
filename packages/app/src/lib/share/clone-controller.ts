import { toast } from 'sonner';
import type { ShareReceiveCloneController } from '@/components/ShareReceiveDialog';
import type { OkDesktopBridge, OkLocalOpAuthStatusResponse } from '@/lib/desktop-bridge-types';
import type { AuthQueryTransport } from '@/lib/transports/auth-query-transport';
import type { CloneTransport } from '@/lib/transports/clone-transport';

export interface CloneControllerDeps {
  bridge: OkDesktopBridge;
  authQueryTransport: AuthQueryTransport;
  cloneTransport: CloneTransport;
  openSignIn(): Promise<OkLocalOpAuthStatusResponse | null>;
}

function repoNameFromCloneUrl(url: string): string {
  const match = /\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  return match ? match[1] : 'repo';
}

export function createCloneController(deps: CloneControllerDeps): ShareReceiveCloneController {
  return {
    async getAuthStatus() {
      return deps.authQueryTransport.status();
    },
    async startSignIn() {
      return deps.openSignIn();
    },
    async runClone({ url }) {
      const parent = await deps.bridge.dialog.openFolder();
      if (!parent) return { kind: 'cancelled' };
      const repoName = repoNameFromCloneUrl(url);
      const targetDir = `${parent.replace(/\/$/, '')}/${repoName}`;

      const toastId = toast.loading(`Cloning ${repoName}...`, {
        duration: Number.POSITIVE_INFINITY,
      });

      const handle = deps.cloneTransport.start({ url, dir: targetDir });
      try {
        for await (const event of handle.events) {
          if (event.type === 'progress') {
            toast.loading(`Cloning ${repoName}...`, {
              id: toastId,
              description: `${event.phase} — ${Math.round(event.pct)}%`,
              duration: Number.POSITIVE_INFINITY,
            });
            continue;
          }
          if (event.type === 'complete') {
            toast.success(`Cloned ${repoName}.`, { id: toastId, duration: 4000 });
            return { kind: 'ok', dir: event.dir };
          }
          if (event.type === 'error') {
            toast.error(`Clone failed: ${event.message}`, { id: toastId, duration: 8000 });
            return { kind: 'error' };
          }
        }
        toast.error('Clone ended unexpectedly.', { id: toastId, duration: 8000 });
        return { kind: 'error' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast.error(`Clone failed: ${message}`, { id: toastId, duration: 8000 });
        return { kind: 'error' };
      }
    },
  };
}
