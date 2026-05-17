interface ParsedGitUrl {
  protocol: 'https' | 'ssh' | 'git';
  hostname: string;
  owner: string;
  name: string;
}

export interface ParsedGitHubBlobUrl {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

function stripPort(hostname: string): string {
  return hostname.replace(/:\d+$/, '');
}

export function parseGitUrl(input: string): ParsedGitUrl | null {
  const raw = input.trim();
  if (!raw) return null;

  {
    const m = /^https?:\/\/([^/?#]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(raw);
    if (m) return { protocol: 'https', hostname: stripPort(m[1]), owner: m[2], name: m[3] };
  }

  {
    const m = /^ssh:\/\/(?:[\w.-]+@)?([^/?#]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(
      raw,
    );
    if (m) return { protocol: 'ssh', hostname: stripPort(m[1]), owner: m[2], name: m[3] };
  }

  {
    const m = /^git:\/\/([^/?#]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(raw);
    if (m) return { protocol: 'git', hostname: stripPort(m[1]), owner: m[2], name: m[3] };
  }

  {
    const m = /^(?:[\w.-]+@)?([\w.-]+):([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?$/.exec(raw);
    if (m?.[1].includes('.')) {
      return { protocol: 'ssh', hostname: m[1], owner: m[2], name: m[3] };
    }
    if (m && raw.startsWith('git@')) {
      return { protocol: 'ssh', hostname: m[1], owner: m[2], name: m[3] };
    }
  }

  {
    const m = /^git:([\w.-]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(raw);
    if (m) return { protocol: 'git', hostname: m[1], owner: m[2], name: m[3] };
  }

  if (!raw.includes('://') && !raw.includes('@') && !raw.startsWith('/')) {
    const m = /^([\w.-]+)\/([\w.\-~%]+?)(?:\.git)?$/.exec(raw);
    if (m) return { protocol: 'https', hostname: 'github.com', owner: m[1], name: m[2] };
  }

  return null;
}

export function parseGitHubBlobUrl(input: string): ParsedGitHubBlobUrl | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
    return null;
  }

  const rawSegments = url.pathname.split('/').filter((s) => s.length > 0);

  if (rawSegments.length < 5) return null;
  if (rawSegments[2] !== 'blob') return null;

  let owner: string;
  let repo: string;
  let branch: string;
  let pathParts: string[];
  try {
    owner = decodeURIComponent(rawSegments[0]);
    repo = decodeURIComponent(rawSegments[1]);
    branch = decodeURIComponent(rawSegments[3]);
    pathParts = rawSegments.slice(4).map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }

  if (!owner || !repo || !branch || pathParts.length === 0) return null;
  if (pathParts.some((p) => p.length === 0)) return null;

  return { owner, repo, branch, path: pathParts.join('/') };
}
