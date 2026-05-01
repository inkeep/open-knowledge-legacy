import type { Config } from '../config/schema.ts';

const DEFAULT_OAUTH_CLIENT_ID = 'Ov23liqlSd0V1MwR6rhI';

export function getOAuthClientId(config?: Pick<Config, 'github'>): string {
  return (
    process.env.OPEN_KNOWLEDGE_GITHUB_CLIENT_ID ??
    config?.github?.oauthAppClientId ??
    DEFAULT_OAUTH_CLIENT_ID
  );
}
