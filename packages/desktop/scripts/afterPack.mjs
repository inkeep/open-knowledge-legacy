#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';
import { targetFuses } from './target-fuses.mjs';

export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;

  if (electronPlatformName !== 'darwin') {
    console.log(`[afterPack] skipping fuses on platform "${electronPlatformName}"`);
    return;
  }

  if (appOutDir.endsWith('-temp')) {
    console.log(
      `[afterPack] skipping per-arch temp "${appOutDir}" — fuses flip on the merged universal app`,
    );
    return;
  }

  const appName = packager.appInfo.productFilename;
  const electronBinary = join(appOutDir, `${appName}.app`, 'Contents', 'MacOS', appName);

  if (!existsSync(electronBinary)) {
    throw new Error(
      `[afterPack] Electron binary not found at ${electronBinary}. ` +
        `Expected electron-builder to have packed the .app before afterPack ran.`,
    );
  }

  console.log(`[afterPack] flipping fuses on ${electronBinary}`);
  for (const [optIndex, value] of Object.entries(targetFuses)) {
    const name = FuseV1Options[Number(optIndex)];
    console.log(`[afterPack]   ${name} = ${value}`);
  }

  try {
    await flipFuses(electronBinary, {
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: true,
      ...targetFuses,
    });
  } catch (err) {
    throw new Error(
      `[afterPack] fuse flip failed on ${electronBinary}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }

  console.log('[afterPack] fuses flipped successfully; electron-builder will re-sign next');
}
