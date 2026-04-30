import type { Config } from '../config/schema.ts';

/**
 * Default GitHub OAuth App client ID for Open Knowledge.
 * Public — committed to source. Overridable via env var or config.
 * See: packages/cli/src/github/app-config.ts
 */
const DEFAULT_OAUTH_CLIENT_ID = 'Ov23liqlSd0V1MwR6rhI';

/**
 * Resolve the OAuth App client ID with this precedence:
 *   1. OPEN_KNOWLEDGE_GITHUB_CLIENT_ID environment variable
 *   2. config.github.oauthAppClientId (project or user config)
 *   3. DEFAULT_OAUTH_CLIENT_ID built-in constant
 */
export function getOAuthClientId(config?: Pick<Config, 'github'>): string {
  return (
    process.env.OPEN_KNOWLEDGE_GITHUB_CLIENT_ID ??
    config?.github?.oauthAppClientId ??
    DEFAULT_OAUTH_CLIENT_ID
  );
}
