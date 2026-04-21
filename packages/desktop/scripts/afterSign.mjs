#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { notarize } from '@electron/notarize';

/**
 * electron-builder `afterSign` hook — runs after the `.app` is code-signed
 * with the Developer ID cert, before the DMG is created.
 *
 * Per spec §8.9 and §14 M2 DOD:
 *   1. Submit the `.app` to Apple's notary service (`@electron/notarize` calls
 *      `xcrun notarytool`) — this also staples the ticket on success.
 *   2. Validate the stapled ticket via `xcrun stapler validate`.
 *   3. Read fuses via `@electron/fuses.getCurrentFuseWire` and assert every
 *      fuse matches `afterPack.mjs`'s `targetFuses`. D17 LOCKED: paranoid
 *      post-sign verification is REQUIRED — Windows signtool has shipped
 *      silent fuse-clobber regressions (electron-builder #9428), and macOS
 *      codesign+notarize has no formal guarantee against the same class of
 *      bug. Fuses confirmed at flip-time are not evidence they survive
 *      signing; always re-read.
 *
 * Signing path is gated on env vars. When credentials are absent (the
 * procurement-in-progress state today), we log and return so the unsigned
 * smoke build still succeeds — this is the macOS M2 "scaffolding is ready,
 * flip the switch" shape. Set any of:
 *   - APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (password flow)
 *   - APPLE_API_KEY + APPLE_API_KEY_ID [+ APPLE_API_ISSUER] (App Store Connect API key)
 *   - APPLE_KEYCHAIN_PROFILE [+ APPLE_KEYCHAIN] (keychain-stored creds)
 */

/**
 * Canonical fuse config — must match `afterPack.mjs` exactly. Any drift means
 * the post-sign read-verify below will fail the build.
 */
const targetFuses = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

function resolveNotarizeCredentials() {
  const {
    APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID,
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_API_ISSUER,
    APPLE_KEYCHAIN_PROFILE,
    APPLE_KEYCHAIN,
  } = process.env;

  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    return {
      kind: 'password',
      creds: {
        appleId: APPLE_ID,
        appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
        teamId: APPLE_TEAM_ID,
      },
    };
  }

  if (APPLE_API_KEY && APPLE_API_KEY_ID) {
    return {
      kind: 'api-key',
      creds: {
        appleApiKey: APPLE_API_KEY,
        appleApiKeyId: APPLE_API_KEY_ID,
        ...(APPLE_API_ISSUER ? { appleApiIssuer: APPLE_API_ISSUER } : {}),
      },
    };
  }

  if (APPLE_KEYCHAIN_PROFILE) {
    return {
      kind: 'keychain',
      creds: {
        keychainProfile: APPLE_KEYCHAIN_PROFILE,
        ...(APPLE_KEYCHAIN ? { keychain: APPLE_KEYCHAIN } : {}),
      },
    };
  }

  return null;
}

async function verifyFuses(electronBinary, expected) {
  const wire = await getCurrentFuseWire(electronBinary);
  const mismatches = [];
  for (const [optIndex, expectedValue] of Object.entries(expected)) {
    const key = Number(optIndex);
    const actualState = wire[key];
    // FuseState: DISABLE=48 ('0'), ENABLE=49 ('1'). Map to boolean.
    const actualBool = actualState === 49;
    if (actualBool !== expectedValue) {
      mismatches.push(
        `${FuseV1Options[key]}: expected ${expectedValue}, got ${actualBool} (state=${actualState})`,
      );
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `[afterSign] Fuse verification failed (D17 paranoid check):\n  ${mismatches.join('\n  ')}`,
    );
  }
  console.log('[afterSign] fuse verification passed — all 6 fuses match targetFuses');
}

export default async function afterSign(context) {
  const { appOutDir, packager, electronPlatformName } = context;

  if (electronPlatformName !== 'darwin') {
    console.log(`[afterSign] skipping on platform "${electronPlatformName}"`);
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);
  const electronBinary = join(appPath, 'Contents', 'MacOS', appName);

  if (!existsSync(appPath)) {
    throw new Error(`[afterSign] .app bundle not found at ${appPath}`);
  }

  const credentials = resolveNotarizeCredentials();

  if (!credentials) {
    console.log(
      '[afterSign] skipping notarize — no Apple credentials in env ' +
        '(APPLE_ID+APPLE_APP_SPECIFIC_PASSWORD+APPLE_TEAM_ID, APPLE_API_KEY+APPLE_API_KEY_ID, ' +
        'or APPLE_KEYCHAIN_PROFILE). Build continues as unsigned smoke.',
    );
    return;
  }

  console.log(`[afterSign] notarizing ${appPath} via ${credentials.kind} credentials`);
  console.log('[afterSign]   this typically takes 1-5 minutes...');

  await notarize({
    appPath,
    ...credentials.creds,
  });

  console.log('[afterSign] notarize + staple complete; validating stapled ticket');
  try {
    execFileSync('xcrun', ['stapler', 'validate', appPath], {
      stdio: 'inherit',
    });
  } catch (err) {
    throw new Error(
      `[afterSign] stapler validation failed — notarization succeeded but ticket was not ` +
        `stapled correctly. This will cause Gatekeeper warnings on first launch. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await verifyFuses(electronBinary, targetFuses);

  console.log('[afterSign] signed + notarized + stapled + fuse-verified successfully');
}
