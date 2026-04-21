#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';
import { targetFuses } from './target-fuses.mjs';

/**
 * electron-builder `afterPack` hook — runs on the packed `.app` bundle before
 * code-signing. We flip the Electron fuses (D17 LOCKED, spec §8.9) to harden
 * the runtime: disable RunAsNode, disable NODE_OPTIONS env ingestion, require
 * asar integrity validation, and only load from asar. EnableNodeCliInspect is
 * left ON because Playwright's `_electron.launch` requires the inspect CLI
 * arguments to attach (M4+ testing). Cookie encryption is ON as a
 * defense-in-depth hygiene fuse.
 *
 * Fuses are flipped BEFORE the Developer ID signature is applied — electron
 * ships with an ad-hoc Darwin signature that flipFuses would invalidate, so
 * we set `resetAdHocDarwinSignature: true` to keep the intermediate binary
 * in a valid ad-hoc-signed state until electron-builder re-signs with the
 * Developer ID cert.
 *
 * Post-sign verification of these same fuses lives in `afterSign.mjs` per
 * D17 ("Windows signtool has shipped silent fuse-clobber regressions; paranoid
 * verification is load-bearing"). Both hooks import the same `targetFuses`
 * map from `./target-fuses.mjs` — flip-time and verify-time cannot drift.
 */

export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;

  // electron-builder runs afterPack once per target platform. We only flip
  // fuses on macOS for now (M2 is macOS-only per D51). When Windows/Linux
  // builds arrive in a later milestone, widen this guard.
  if (electronPlatformName !== 'darwin') {
    console.log(`[afterPack] skipping fuses on platform "${electronPlatformName}"`);
    return;
  }

  // Universal builds: electron-builder packs arm64 and x64 into separate
  // `mac-universal-<arch>-temp` dirs, fires afterPack on each, then calls
  // @electron/universal.makeUniversalApp to merge them. That merge asserts
  // that all non-Mach-O files have identical SHAs across arches — and
  // flipping fuses perturbs `Contents/Frameworks/.../CodeSignature/
  // CodeResources` differently per arch, breaking the SHA-parity check.
  // The canonical fix is to only flip fuses on the MERGED universal app
  // (which has a fat Mach-O binary; @electron/fuses v2 handles that shape
  // correctly). Detect the final output dir by the absence of the `-temp`
  // suffix.
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
    // Phase-annotated so a fuse-flip failure is distinguishable from a
    // post-sign verification failure in afterSign.mjs — the remediation
    // paths differ (rollback vs investigate re-sign pipeline).
    throw new Error(
      `[afterPack] fuse flip failed on ${electronBinary}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }

  console.log('[afterPack] fuses flipped successfully; electron-builder will re-sign next');
}
