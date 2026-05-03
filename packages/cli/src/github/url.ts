interface ParsedGitUrl {
  protocol: 'https' | 'ssh' | 'git';
  hostname: string;
  owner: string;
  name: string;
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
