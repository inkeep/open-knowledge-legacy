#!/usr/bin/env node
import { FuseState, FuseV1Options } from '@electron/fuses';

/**
 * Canonical fuse configuration per spec §8.9. This is the single source of
 * truth for both `afterPack.mjs` (flip) and `afterSign.mjs` (verify). D17
 * LOCKED: flip-time and verify-time must compare against the same map — any
 * drift means the paranoid post-sign check silently passes on values the
 * flip didn't actually set.
 *
 * Keys are `FuseV1Options` indices (numeric). Values are booleans (true =
 * enable, false = disable). The verifier maps boolean → `FuseState.ENABLE` /
 * `FuseState.DISABLE` via `expectedFuseState()` and then compares raw
 * FuseState values — never collapses to booleans. This is load-bearing
 * because `FuseState` has four values (DISABLE, ENABLE, REMOVED, INHERIT);
 * a boolean collapse maps REMOVED/INHERIT to `false` and silently accepts
 * fuses that should have been explicitly DISABLE.
 */
export const targetFuses = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

/**
 * Human-readable name for a `FuseState` value. Used in verifier error
 * messages so `expected ENABLE, got REMOVED` beats `expected 49, got 114`.
 */
export function fuseStateName(state) {
  switch (state) {
    case FuseState.DISABLE:
      return 'DISABLE';
    case FuseState.ENABLE:
      return 'ENABLE';
    case FuseState.REMOVED:
      return 'REMOVED';
    case FuseState.INHERIT:
      return 'INHERIT';
    default:
      return `UNKNOWN(${state})`;
  }
}

/**
 * Map the canonical boolean expectation to the `FuseState` the post-sign
 * verifier must see. `true` → `FuseState.ENABLE`, `false` → `FuseState.DISABLE`.
 * Any other observed state (REMOVED, INHERIT) is a mismatch — the signing
 * pipeline should not leave fuses in those states.
 */
export function expectedFuseState(expectedValue) {
  return expectedValue ? FuseState.ENABLE : FuseState.DISABLE;
}
