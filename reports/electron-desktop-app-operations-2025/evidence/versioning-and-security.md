# Evidence: Electron Versioning & Security Hardening

**Dimension:** Versioning & Release Cadence + Security & Hardening
**Date:** 2026-04-11
**Sources:** Electron docs, GitHub Advisory Database, Trail of Bits disclosure, Chromium release notes

---

## Key sources
- [Electron Release Timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [Electron Release Schedule](https://releases.electronjs.org/schedule)
- [8-week release cadence announcement](https://www.electronjs.org/blog/8-week-cadence)
- [Breaking changes log](https://www.electronjs.org/docs/latest/breaking-changes)
- [Electron 41 blog](https://www.electronjs.org/blog/electron-41-0)
- [Electron Security Tutorial](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Trail of Bits: CVE-2025-55305 ASAR bypass](https://blog.trailofbits.com/2025/09/03/subverting-code-integrity-checks-to-locally-backdoor-signal-1password-slack-and-more/)
- [CVE-2025-10585 V8 KEV analysis](https://medium.com/meetcyber/kev-v8-cve-2025-10585-hits-electron-apps-04544099f585)

---

## Release Cadence (Current as of April 2026)

| Version | Stable | EOL | Chromium | Node.js | V8 |
|---------|--------|-----|----------|---------|-----|
| 37 | 2025-06-24 | 2026-01-13 | 138 | 22.x | 13.x |
| 38 | 2025-09-02 | 2026-03-10 | 140.0.7339 | 22.18 | 13.8 |
| 39 | 2025-10-28 | 2026-05-05 | 142.0.7444 | 22.20 | 14.2 |
| 40 | 2026-01-13 | 2026-06-30 | 144.0.7559.60 | 24.11.1 | 14.4 |
| **41** | **2026-03-10** | **2026-08-25** | **146.0.7680.65** | **24.14.0** | **14.6** |
| 42 | 2026-05-05 | 2026-09-22 | 148 | 24.x | 14.x |

**Cadence:** Every 8 weeks, tracking every other Chromium major. Latest 3 majors supported (N, N-1, N-2).

## Findings

### Finding: Electron 40 was the Node 22→24 bump — native module ABI break
**Confidence:** CONFIRMED
**Evidence:** Electron 40 blog, breaking changes

This is the critical upgrade boundary for OK: `@parcel/watcher` and other N-API addons need to be rebuilt against Node 24 ABI when moving from Electron 39 → 40. Native module prebuilds must target the new ABI.

### Finding: Production apps cluster 1-2 majors behind latest stable
**Confidence:** CONFIRMED
**Evidence:** VS Code 1.110 ships Electron 39.6.0; Obsidian 1.12.x ships Electron 39.8.3

VS Code is the reference for "one major behind latest stable" (N-1 pattern). Obsidian is notably more conservative (often 3-5 majors behind). Shipping on Electron 40 today (N-1) is the safe commercial position — Electron 41 is the newest stable but still in .0.x bug-fix cycle.

### Finding: Electron 41+ required for CVE-2025-55305 fix (ASAR integrity bypass)
**Confidence:** CONFIRMED
**Evidence:** Trail of Bits disclosure Sept 2025

Trail of Bits disclosed that `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` fuses validated `app.asar` contents but did NOT consider `v8_context_snapshot.bin` as executable content. Attackers with local filesystem write access could overwrite the V8 heap snapshot to clobber JavaScript builtins (e.g. `Array.isArray`) with attacker-controlled code. **Signal, Slack, 1Password all affected at disclosure.** Electron 41 + `@electron/asar ≥ 4.1.0` introduce a signed digest layer that closes this.

**Implication:** Ship on Electron 41+ from the start. No reason to adopt the broken-fuses posture.

### Finding: 7 fuses to flip for hardened production
**Confidence:** CONFIRMED
**Evidence:** Electron Fuses docs, @electron/fuses

```typescript
// electron.fuses.config.ts
import { FuseV1Options, FuseVersion } from '@electron/fuses'

export default {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,                          // prevent binary being hijacked as Node
  [FuseV1Options.EnableCookieEncryption]: true,              // OS-level keychain for cookies
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // block NODE_OPTIONS injection
  [FuseV1Options.EnableNodeCliInspectArguments]: false,      // block --inspect in prod
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // validate app.asar at load
  [FuseV1Options.OnlyLoadAppFromAsar]: true,                 // no disk fallback
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: true, // separate V8 snapshots per process
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,   // OK doesn't load file://
}
```

Fuses must be flipped AFTER packaging, BEFORE code signing. Both electron-builder and @electron/packager integrate @electron/fuses.

### Finding: CVE patch latency is real — Chromium → Electron → user auto-update = 3-14 days minimum
**Confidence:** CONFIRMED
**Evidence:** CVE-2025-10585 (V8, CISA KEV 2025-09-23)

Chrome stable patched the V8 type confusion in 140.0.7339.185. A week after KEV listing, Electron 38.2.0 still shipped Chromium 140.0.7339.133. Slack, Zoom, Skype historically lag security patches by weeks to months.

**Mitigation for OK:** Subscribe to GitHub advisories for `electron/electron`. Have a "security patch within 72 hours of KEV" runbook. Force-update path for critical CVEs (not routine updates).

### Finding: Modern secure defaults are automatic in Electron 28+
**Confidence:** CONFIRMED

- `contextIsolation: true` (default since Electron 12)
- `nodeIntegration: false` (default since Electron 5)
- `sandbox: true` for renderers (default since Electron 20)
- `webSecurity: true`, `allowRunningInsecureContent: false`
- `nodeIntegrationInWorker: false`
- `enableRemoteModule`: removed entirely in Electron 14

**Gotcha:** Setting `nodeIntegration: true` OR `contextIsolation: false` disables the sandbox. Add a lint rule that fails the build if either is set.

### Finding: IPC security requires sender validation
**Confidence:** CONFIRMED

Every `ipcMain.handle` / `ipcMain.on` handler should validate `event.senderFrame` against an allowlist. The Electron Security Checklist item #17 is consistently missed even in disciplined codebases.

```typescript
ipcMain.handle('agent-write', (event, ...args) => {
  const url = event.senderFrame?.url
  if (!url?.startsWith('file://')) {
    throw new Error('Unauthorized sender')
  }
  // ... handler logic
})
```
