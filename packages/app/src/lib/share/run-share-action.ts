import type {
  ShareConstructUrlErrorCode,
  ShareConstructUrlResponse,
} from '@inkeep/open-knowledge-core';
import { ShareConstructUrlResponseSchema } from '@inkeep/open-knowledge-core';
import { docNameToMarkdownPath } from '@/lib/doc-paths';

const SHARE_CONSTRUCT_URL_PATH = '/api/share/construct-url';

export interface ShareActionDeps {
  fetchFn?: typeof fetch;
  clipboardWrite: (text: string) => Promise<void>;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
  logEvent: (msg: string) => void;
}

export interface RunShareActionInput {
  docName: string;
  hasRemote: boolean;
  onClickWhenNoRemote: () => void;
}

export type RunShareActionResult =
  | { kind: 'opened-wizard' }
  | { kind: 'copied'; shareUrl: string; branch: string }
  | { kind: 'clipboard-failed'; shareUrl: string }
  | { kind: 'business-error'; error: ShareConstructUrlErrorCode; branch?: string }
  | { kind: 'transport-error' };

const TRANSPORT_ERROR_TOAST = 'Could not construct share URL.';
const CLIPBOARD_ERROR_TOAST = 'Link ready but could not copy to clipboard.';

export async function requestShareConstructUrl(
  docPath: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShareConstructUrlResponse> {
  const res = await fetchFn(SHARE_CONSTRUCT_URL_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docPath }),
  });
  if (!res.ok) {
    throw new Error(`construct-url transport ${res.status}`);
  }
  const body = await res.json();
  const parsed = ShareConstructUrlResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('construct-url response shape mismatch');
  }
  return parsed.data;
}

export function mapShareErrorToToast(error: ShareConstructUrlErrorCode, branch?: string): string {
  switch (error) {
    case 'detached-head':
      return 'Switch to a branch to share.';
    case 'branch-not-on-origin':
      return branch
        ? `Push ${branch} to GitHub before sharing.`
        : 'Push this branch to GitHub before sharing.';
    case 'non-github-remote':
      return 'Sharing supports GitHub remotes only.';
    case 'invalid-path':
      return "Can't share this path.";
    case 'no-remote':
      return 'This project has no GitHub remote.';
  }
}

export async function runShareAction(
  input: RunShareActionInput,
  deps: ShareActionDeps,
): Promise<RunShareActionResult> {
  if (!input.hasRemote) {
    input.onClickWhenNoRemote();
    return { kind: 'opened-wizard' };
  }

  const docPath = docNameToMarkdownPath(input.docName);

  let response: ShareConstructUrlResponse;
  try {
    response = await requestShareConstructUrl(docPath, deps.fetchFn);
  } catch {
    deps.toastError(TRANSPORT_ERROR_TOAST);
    return { kind: 'transport-error' };
  }

  if (response.ok) {
    try {
      await deps.clipboardWrite(response.shareUrl);
    } catch {
      deps.toastError(CLIPBOARD_ERROR_TOAST);
      deps.logEvent('[share] action=link-construct result=clipboard-failed');
      return { kind: 'clipboard-failed', shareUrl: response.shareUrl };
    }
    deps.toastSuccess('Link copied.');
    deps.logEvent('[share] action=link-construct');
    return { kind: 'copied', shareUrl: response.shareUrl, branch: response.branch };
  }

  if (response.error === 'no-remote') {
    input.onClickWhenNoRemote();
    return { kind: 'opened-wizard' };
  }

  const branch = response.branch;
  deps.toastError(mapShareErrorToToast(response.error, branch));
  return { kind: 'business-error', error: response.error, branch };
}
