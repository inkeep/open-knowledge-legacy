---
"@inkeep/open-knowledge-desktop": minor
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge": patch
"@inkeep/open-knowledge-server": patch
---

feat(desktop): M5 — `@napi-rs/keyring` end-to-end verification in packaged build.

Adds the verification layer that proves `@napi-rs/keyring` loads and round-trips inside `utilityProcess.fork()` in the packaged Electron app. The PR #166 auth substrate itself is unchanged — this milestone ships infrastructure for observing the substrate from outside the app (driver script) and from inside the renderer (gated debug IPC), so R15 (utilityProcess compat) and R16 (`CFBundleDisplayName` prompt + bundle-ID stability + upsert semantics) become empirically verifiable.

New surfaces:

- `packages/desktop/src/utility/keyring-smoke.ts` — `runKeyringSmoke(deps?)` primitive. Namespace-scoped round-trip (`open-knowledge-smoke` / `test-user`) via `@napi-rs/keyring`; cleans up on success. Injectable `deps` parameter allows AC3 YAML-fallback unit coverage without touching the production substrate (SPEC §9 SCOPE lock). Returns `KeyringSmokeResult = { ok, backend, durationMs, timestamp, error? }`.
- `packages/desktop/src/main/debug-ipc.ts` — renderer↔main↔utility relay. Correlation-ID `Map<id, {resolve,reject,timer}>` with 5 s default timeout; `clearTimeout` fires on both resolve and timeout paths so the Map stays bounded.
- `packages/desktop/src/utility/server-entry.ts` — extends the IPC protocol with `{ kind: 'debug-request' }` dispatch. Also adds a boot-time auto-smoke mode gated on `OK_DEBUG_KEYRING_SMOKE=1`: writes `KeyringSmokeResult` JSON to `OK_DEBUG_KEYRING_SMOKE_OUT`, exits `0` post-write when `OK_DEBUG_KEYRING_SMOKE_EXIT=1`. This is the only creds-free path that exercises the hardened-runtime + fuses + signed-binary loader on packaged builds.
- `packages/desktop/src/shared/{ipc-channels.ts,bridge-contract.ts}` + `packages/core/src/desktop-bridge.ts` + `packages/app/src/lib/desktop-bridge-types.ts` — add the `ok:debug:keyring-smoke` channel and the optional `debug?: { keyringSmoke(): Promise<KeyringSmokeResult> }` bridge namespace. The namespace is gated at preload time: `!app.isPackaged || process.env.OK_DEBUG_KEYRING_SMOKE === '1'`. In normal packaged runs, `window.okDesktop.debug` is `undefined` and typos surface at TypeScript compile time, not runtime.
- `scripts/verify-keyring-in-packaged-dmg.mjs` — driver for creds-free pre-flight. Accepts an `.app` or `.dmg`, launches the packaged app with the `OK_DEBUG_KEYRING_SMOKE*` env triplet, parses the result JSON, exits `0` on ok / `1` on smoke failure / `2` on 30 s boot timeout / `3` on pre-smoke crash.
- `packages/cli/src/auth/token-store.test.ts` — extended with upsert-semantics characterization tests + YAML-fallback mocking strategy. The production `token-store.ts` substrate is **unchanged** per SPEC §9 SCOPE lock; the new tests document and guard the substrate's already-correct behavior.
- `packages/desktop/tests/smoke/keyring-e2e.md` — 11-step creds-gated manual runbook covering AC4 (CFBundleDisplayName prompt), AC5 (relaunch persistence), AC6 (v0.1.0→v0.1.1 upgrade persistence), AC7 (`log show` caller-attribution). Executable once Apple Developer credentials are on the test machine.

Web and CLI distributions are unaffected — the debug namespace and env-var auto-smoke only fire in the Electron utility process, and the token-store test changes don't touch runtime behavior.

Creds-free ACs (AC1–AC3, AC8–AC10) land green in this changeset. Creds-gated ACs (AC4–AC7) execute manually via the runbook and will attach screenshots + `log show` output to a follow-up status update once Apple credentials are available on the test machine (same external dependency that gates M2's end-state DOD).

Full spec: `specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md`; design decisions (D-M5-1 through D-M5-8): `specs/2026-04-21-m5-keyring-packaged-e2e/meta/investigation-findings.md`; parent milestone plan: `specs/2026-04-11-electron-desktop-app/SPEC.md` §14.
