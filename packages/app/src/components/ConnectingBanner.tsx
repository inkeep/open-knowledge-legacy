/**
 * "Connecting — waiting for collab server" banner (US-014 / FR-1.13).
 *
 * Renders while `useCollabUrl()` has not yet resolved the collab WebSocket
 * URL from `/api/config`. Resolution happens either:
 *   (a) immediately on the first successful fetch returning a non-null
 *       `collabUrl` (production `ok ui` with `server.lock` alive), or
 *   (b) after 404-fallback to the same-origin URL (`bun run dev`).
 *
 * While unresolved the banner sits fixed at the top of the viewport so the
 * user knows the collab server is starting or stale and a retry is in
 * flight — the hook runs its exponential backoff loop behind the scenes.
 */
import { useDocumentContext } from '@/editor/DocumentContext';

export function ConnectingBanner() {
  const { collabUrl } = useDocumentContext();
  if (collabUrl !== null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-amber-500/95 text-amber-950 text-sm text-center py-2 px-4 shadow-md"
    >
      Connecting — waiting for collab server…
    </div>
  );
}
