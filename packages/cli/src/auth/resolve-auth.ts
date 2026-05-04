import { detectGh } from './gh-detect.ts';
import type { TokenStore } from './token-store.ts';

type AuthTier = 'A' | 'B' | 'C' | 'none';

interface ResolvedAuth {
  tier: AuthTier;
  credentialArgs: string[];
}

interface ResolveAuthOptions {
  skipGhDetect?: boolean;
}

export async function resolveAuth(
  host: string,
  tokenStore: TokenStore,
  options: ResolveAuthOptions = {},
  _detectGhFn: () => ReturnType<typeof detectGh> = detectGh,
): Promise<ResolvedAuth> {
  if (!options.skipGhDetect) {
    const gh = _detectGhFn();
    if (gh.available) {
      return {
        tier: 'A',
        credentialArgs: ['-c', 'credential.helper=!gh auth git-credential'],
      };
    }
  }

  const entry = await tokenStore.get(host);
  if (entry != null) {
    const tier: AuthTier = entry.gitProtocol === 'ssh' ? 'C' : 'B';
    return {
      tier,
      credentialArgs: ['-c', 'credential.helper=!open-knowledge auth git-credential'],
    };
  }

  return { tier: 'none', credentialArgs: [] };
}
