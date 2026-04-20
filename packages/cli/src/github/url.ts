/**
 * Parsed Git URL result.
 */
export interface ParsedGitUrl {
  protocol: 'https' | 'ssh' | 'git';
  hostname: string;
  owner: string;
  name: string;
}

/**
 * Strip a trailing :port from a hostname string.
 */
function stripPort(hostname: string): string {
  return hostname.replace(/:\d+$/, '');
}

/**
 * Parse a git remote URL or shorthand into its components.
 *
 * Handles:
 *   - https://host[:port]/owner/repo[.git]
 *   - http://host[:port]/owner/repo[.git]
 *   - ssh://[user@]host[:port]/owner/repo[.git]
 *   - git://host[:port]/owner/repo[.git]
 *   - git@host:owner/repo[.git]           (SCP-style SSH)
 *   - [user@]host.ghe.com:owner/repo[.git] (GHES SCP-style)
 *   - git:host/owner/repo[.git]            (bare git protocol)
 *   - owner/repo[.git]                     (shorthand → github.com)
 *
 * Returns null for invalid or unrecognised input.
 */
export function parseGitUrl(input: string): ParsedGitUrl | null {
  const raw = input.trim();
  if (!raw) return null;

  // https:// or http://
  {
    const m = /^https?:\/\/([^/?#]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(raw);
    if (m) return { protocol: 'https', hostname: stripPort(m[1]), owner: m[2], name: m[3] };
  }

  // ssh://[user@]host/owner/repo(.git)?
  {
    const m = /^ssh:\/\/(?:[\w.-]+@)?([^/?#]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(
      raw,
    );
    if (m) return { protocol: 'ssh', hostname: stripPort(m[1]), owner: m[2], name: m[3] };
  }

  // git://host/owner/repo(.git)?
  {
    const m = /^git:\/\/([^/?#]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(raw);
    if (m) return { protocol: 'git', hostname: stripPort(m[1]), owner: m[2], name: m[3] };
  }

  // SCP-style: [user@]host:owner/repo(.git)?
  // The hostname must contain a dot or be a known hostname pattern (prevents
  // matching Windows-style paths like C:\path or plain "foo:bar/baz").
  {
    const m = /^(?:[\w.-]+@)?([\w.-]+):([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?$/.exec(raw);
    if (m?.[1].includes('.')) {
      return { protocol: 'ssh', hostname: m[1], owner: m[2], name: m[3] };
    }
    // Also match well-known SCP host without dot (e.g. git@localhost:owner/repo)
    if (m && raw.startsWith('git@')) {
      return { protocol: 'ssh', hostname: m[1], owner: m[2], name: m[3] };
    }
  }

  // git:host/owner/repo(.git)?  (bare git protocol without //)
  {
    const m = /^git:([\w.-]+)\/([\w.\-~%]+)\/([\w.\-~%]+?)(?:\.git)?\/?$/.exec(raw);
    if (m) return { protocol: 'git', hostname: m[1], owner: m[2], name: m[3] };
  }

  // owner/repo shorthand → github.com
  if (!raw.includes('://') && !raw.includes('@') && !raw.startsWith('/')) {
    const m = /^([\w.-]+)\/([\w.\-~%]+?)(?:\.git)?$/.exec(raw);
    if (m) return { protocol: 'https', hostname: 'github.com', owner: m[1], name: m[2] };
  }

  return null;
}
