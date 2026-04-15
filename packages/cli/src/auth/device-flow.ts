import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';

export interface DeviceFlowVerification {
  verificationUri: string;
  userCode: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceFlowResult {
  token: string;
  tokenType: string;
  scopes: string[];
}

export type OnVerification = (verification: DeviceFlowVerification) => void | Promise<void>;

export interface DeviceFlowOptions {
  clientId: string;
  scopes?: string[];
  /** Host for GitHub Enterprise (default: 'github.com') */
  host?: string;
  onVerification: OnVerification;
}

/**
 * Run the GitHub OAuth Device Flow, calling onVerification with the user code
 * so the CLI can display it. Returns the access token on success.
 *
 * Throws on timeout or auth failure.
 */
export async function runDeviceFlow(options: DeviceFlowOptions): Promise<DeviceFlowResult> {
  const { clientId, scopes = ['repo', 'read:user', 'user:email'], onVerification, host } = options;

  const baseUrl =
    host && host !== 'github.com' ? `https://${host}/api/v3` : 'https://api.github.com';

  const auth = createOAuthDeviceAuth({
    clientType: 'oauth-app',
    clientId,
    scopes,
    onVerification: async (v) => {
      await onVerification({
        verificationUri: v.verification_uri,
        userCode: v.user_code,
        expiresIn: v.expires_in,
        interval: v.interval,
      });
    },
    request:
      baseUrl !== 'https://api.github.com'
        ? (await import('@octokit/request')).request.defaults({
            baseUrl,
          })
        : undefined,
  });

  const result = await auth({ type: 'oauth' });
  return {
    token: result.token,
    tokenType: result.tokenType,
    scopes: result.scopes ?? [],
  };
}
