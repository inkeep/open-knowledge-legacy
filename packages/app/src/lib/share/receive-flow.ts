import type {
  OkShareReceivedPayload,
  RecentProjectEntry,
  ShareFolderValidationResult,
} from '@/lib/desktop-bridge-types';

export interface ExpectedShareRepo {
  readonly owner: string;
  readonly repo: string;
}

export interface ResolvedSharePayload {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly blobUrl: string;
}

export function canonicalGitHubRemoteUrl(expected: ExpectedShareRepo): string {
  return `https://github.com/${expected.owner}/${expected.repo}.git`;
}

function normalizeForMatch(url: string): string {
  let normalized = url.toLowerCase().trim();
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  if (normalized.endsWith('.git')) normalized = normalized.slice(0, -4);
  return normalized;
}

export function findQ1Match(
  recents: readonly RecentProjectEntry[],
  expected: ExpectedShareRepo,
): RecentProjectEntry | null {
  const target = normalizeForMatch(canonicalGitHubRemoteUrl(expected));
  for (const entry of recents) {
    if (entry.missing === true) continue;
    if (!entry.gitRemoteUrl) continue;
    if (normalizeForMatch(entry.gitRemoteUrl) === target) return entry;
  }
  return null;
}

export function buildCloneUrl(expected: ExpectedShareRepo): string {
  return `https://github.com/${expected.owner}/${expected.repo}.git`;
}

export function mapValidationToToast(
  result: ShareFolderValidationResult,
  expected: ExpectedShareRepo,
): string | null {
  switch (result.kind) {
    case 'ok':
      return null;
    case 'not-git':
      return "This folder doesn't contain a git repository. Pick a different folder?";
    case 'wrong-repo':
      return `This folder is a clone of ${result.actualOwner}/${result.actualRepo}, not ${expected.owner}/${expected.repo}. Pick a different folder?`;
    case 'no-origin':
    case 'non-github':
    case 'symlink-escape':
      return `This folder isn't a clone of ${expected.owner}/${expected.repo}. Pick a different folder?`;
  }
}

export type ReceiveErrorPresentation =
  | { readonly kind: 'unsupported-version'; readonly message: string }
  | { readonly kind: 'invalid'; readonly message: string }
  | null;

export function presentReceiveError(payload: OkShareReceivedPayload): ReceiveErrorPresentation {
  if (payload.kind === 'unsupported-version') {
    return {
      kind: 'unsupported-version',
      message: 'Update Open Knowledge to open this share.',
    };
  }
  if (payload.kind === 'invalid') {
    return { kind: 'invalid', message: 'Invalid share URL.' };
  }
  return null;
}

export function resolveSharePayload(payload: OkShareReceivedPayload): ResolvedSharePayload | null {
  if (payload.kind !== 'ok') return null;
  return {
    owner: payload.owner,
    repo: payload.repo,
    branch: payload.branch,
    path: payload.path,
    blobUrl: payload.blobUrl,
  };
}

export interface ReceiveLogFields {
  readonly q1_hit?: boolean;
  readonly q2_path?: 'clone' | 'local';
  readonly folder_validate?: ShareFolderValidationResult['kind'];
}

export function formatReceiveLog(fields: ReceiveLogFields): string {
  const parts: string[] = ['[receive]'];
  if (fields.q1_hit !== undefined) parts.push(`q1_hit=${fields.q1_hit}`);
  if (fields.q2_path !== undefined) parts.push(`q2_path=${fields.q2_path}`);
  if (fields.folder_validate !== undefined) {
    parts.push(`folder_validate=${fields.folder_validate}`);
  }
  return parts.join(' ');
}
