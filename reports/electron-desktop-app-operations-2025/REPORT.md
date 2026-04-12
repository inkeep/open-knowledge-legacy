---
title: "Electron Desktop App Operations: Versioning, Signing, Updates, CI, and Security (2025/2026)"
description: "Factual reference for the operational surface of shipping an Electron desktop app in 2025/2026. Covers Electron release cadence, code signing economics, auto-update infrastructure, CI/CD pipelines, distribution channels, security hardening (fuses, ASAR integrity), release lifecycle, telemetry, bundle sizes, and developer experience. Evidence-driven, vendor-neutral."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - Electron
  - electron-builder
  - electron-vite
  - electron-updater
  - Sentry
  - GitHub Actions
  - Apple Developer Program
  - Azure Trusted Signing
topics:
  - electron operations
  - desktop app release pipeline
  - code signing
  - auto-update infrastructure
---

# Electron Desktop App Operations (2025/2026)

**Purpose:** Factual reference for the operational surface of shipping an Electron desktop app in 2025/2026. This report documents what the tooling does, what it costs, what failure modes exist, and what reference apps do — without making recommendations about what any specific project should choose.

---

## Scope

This report covers ten dimensions of Electron operations:
1. Versioning and release cadence
2. Code signing (macOS + Windows)
3. Auto-update infrastructure
4. Distribution channels
5. CI/CD pipeline requirements
6. Security and hardening
7. Release operations / lifecycle
8. Telemetry, crash reporting, analytics
9. Bundle sizes and CDN cost
10. Developer experience / dev loop

Findings are evidence-backed from primary sources (Electron docs, electron-builder docs, app bundle inspection, GitHub advisories, Apple/Microsoft documentation) and linked in the evidence files.

---

## 1. Electron Versioning and Release Cadence

**Evidence:** [evidence/versioning-and-security.md](evidence/versioning-and-security.md)

### Release schedule

Electron ships a new major version every 8 weeks, tracking every other Chromium milestone (Electron picks up even-numbered Chromium versions). Alpha and beta phases each last ~4 weeks ahead of stable.

### Current landscape (April 2026)

| Version | Stable | EOL | Chromium | Node.js | V8 |
|---------|--------|-----|----------|---------|-----|
| 37 | 2025-06-24 | 2026-01-13 | 138 | 22.x | 13.x |
| 38 | 2025-09-02 | 2026-03-10 | 140.0.7339 | 22.18 | 13.8 |
| 39 | 2025-10-28 | 2026-05-05 | 142.0.7444 | 22.20 | 14.2 |
| 40 | 2026-01-13 | 2026-06-30 | 144.0.7559.60 | 24.11.1 | 14.4 |
| 41 | 2026-03-10 | 2026-08-25 | 146.0.7680.65 | 24.14.0 | 14.6 |
| 42 | 2026-05-05 | 2026-09-22 | 148 | 24.x | 14.x |

Source: [Electron Release Schedule](https://releases.electronjs.org/schedule)

### Support policy

The latest three stable majors are supported:
- **Latest stable:** all fixes from main
- **N-1:** most fixes as bandwidth permits
- **N-2 (oldest supported):** security fixes only

Breaking changes get a minimum 2-major-version deprecation window when possible.

### Notable transitions

- **Electron 40** was the Node 22 → 24 ABI break. Native modules compiled for Node 22 must be rebuilt.
- **Electron 40 (clipboard):** Clipboard access in renderer deprecated — moved to preload + contextBridge.
- **Electron 38:** macOS 12 (Monterey) minimum supported version. Linux Wayland becomes default.
- **Electron 41:** ASAR integrity gained a signed digest layer (closes CVE-2025-55305, see §6).

### Production version patterns (April 2026)

| App | Electron version | Position |
|-----|:----------------:|:---------|
| VS Code 1.110 (Feb 2026) | 39.6.0 / Node 22.22.0 / Chromium 142.0.7444.265 | N-2 (one behind latest) |
| Obsidian 1.8.x | 34-39 | N-5 to N-2 (very conservative) |
| Cursor | Pinned independently from VS Code upstream | Near current |
| Claude Desktop | 40.8.5 (confirmed from app.asar inspection) | N-1 |
| Codex Desktop | 40.0.0 | N-1 |
| Slack, 1Password | Various, track security patches with weeks-to-months lag | Variable |

### Chromium-to-Electron CVE lag

Concrete case: **CVE-2025-10585** (V8 type confusion, CISA KEV 2025-09-23, actively exploited).
- Chrome patched in 140.0.7339.185 on release day
- Electron 38.2.0 as of 2025-09-30 (one week later) still shipped Chromium 140.0.7339.133
- The app-to-user propagation adds additional lag (CI time + user auto-update cadence)

The typical Chromium CVE → Electron patch → packaged app → user auto-update chain runs 3-14 days for disciplined teams and weeks for less active apps.

### EOL consequences

Electron versions past EOL receive no security fixes. Apple and Microsoft stores situationally reject apps built on EOL Electron versions due to unpatched Chromium CVEs. Arch Linux removes EOL Electron majors from its repositories.

---

## 2. Code Signing

**Evidence:** [evidence/code-signing.md](evidence/code-signing.md)

### macOS

| Item | Cost | Notes |
|------|:----:|:------|
| Apple Developer Program (Individual or Organization) | $99/yr | Organization enrollment requires D-U-N-S Number, 1-6 week delivery |
| Developer ID Application cert | $0 | Included in program; max 5 per account |
| Developer ID Installer cert | $0 | Only needed if shipping .pkg |
| Apple notarization | $0 | Free service, typical submission 5-10 min |

Organization enrollment displays the legal entity name (e.g., "Inkeep, Inc.") in macOS trust dialogs. Individual enrollment displays the founder's legal name.

**Notarization workflow:**
1. Sign with Developer ID + hardened runtime flag + secure timestamp
2. Zip/DMG/PKG submission via `xcrun notarytool submit ... --wait`
3. Staple ticket with `xcrun stapler staple` (required for offline first-launch)

Apple SLA: 98% of submissions complete in <15 min. Long tail: first-ever submissions or >1GB apps reported 30min-4.5hrs.

### Hardened runtime entitlements for Electron

```xml
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
```

V8 requires `allow-jit`. Native modules (e.g., `@parcel/watcher`) require `disable-library-validation`.

### macOS Gatekeeper behavior by signing state

| State | User experience on first launch |
|-------|:--------------------------------|
| Unsigned (macOS 13-14) | Modal: "Apple cannot check for malicious software." Right-click → Open workaround available (~15 seconds) |
| Unsigned (macOS 15+ Sequoia) | **Right-click-Open bypass removed.** User must navigate System Settings → Privacy & Security → "Open Anyway" → authenticate (~45 seconds) |
| Signed + notarized + stapled | No dialog. App opens on double-click. |

macOS 15 Sequoia (released September 2024) removed the right-click-Open bypass for unsigned apps.

### Windows

| Item | Cost | Notes |
|------|:----:|:------|
| Sectigo/Comodo OV cert | ~$225/yr | Requires HSM storage since June 2023 (USB token or cloud HSM) |
| DigiCert OV cert | ~$549/yr | Same HSM requirement |
| Sectigo/Comodo EV cert | ~$297-325/yr | EV no longer grants "instant" SmartScreen trust since March 2024 |
| DigiCert EV cert | ~$699/yr | Same as above |
| Azure Trusted Signing (Basic) | ~$120/yr ($9.99/mo) | MS-managed HSM, native GitHub Action, 5K signatures/mo |
| Azure Trusted Signing (Premium) | ~$1200/yr ($99.99/mo) | 100K signatures/mo |
| Azure Key Vault Premium (for OV cert HSM) | ~$360/yr | When using OV cert with cloud HSM |

### Key regulatory events

- **June 2023:** CA/B Forum mandated FIPS 140-2 Level 2 (or CC EAL 4+) HSM storage for BOTH OV and EV private keys. No more `.pfx` files in CI secrets.
- **March 2024:** Microsoft removed EV "instant SmartScreen trust" mechanism. Both OV and EV now build reputation identically via downloads + Defender telemetry.
- **Late 2024:** Azure Trusted Signing became generally available.
- **October 2025:** Azure Trusted Signing opened public preview for individual US/CA developers.

### Windows unsigned/signed state

| State | User experience |
|-------|:----------------|
| Unsigned | "Windows protected your PC" modal → "More info" → "Run anyway" (2 extra clicks + "Unknown publisher" label) |
| Enterprise-managed Windows (SmartScreen Block mode) | No "Run anyway" button — app fully blocked |
| Signed with OV/EV or Azure Trusted Signing | SmartScreen reputation builds over time via downloads |

Enterprise-managed Windows with SmartScreen in Block mode affects 10-25% of corporate endpoints.

### Notarization credentials

App Store Connect API keys (`.p8` file + key ID + issuer ID) and Apple ID + app-specific password are both supported by `notarytool`. API keys don't expire and don't trigger 2FA prompts; app-specific passwords are tied to the Apple ID and expire when the Apple ID password changes.

---

## 3. Auto-Update Infrastructure

**Evidence:** [evidence/updates-and-distribution.md](evidence/updates-and-distribution.md)

### Available updaters

| Tool | Platforms | Features | Status |
|------|:---------:|:---------|:-------|
| `electron-updater` (from electron-builder) | macOS, Windows, Linux | Differential downloads via blockmap, staged rollouts, signature validation, progress events | De facto standard |
| Built-in Electron `autoUpdater` | macOS, Windows (wraps Squirrel) | Simpler API, no Linux support, no progress events | Used via `update-electron-app` |
| `update-electron-app` | macOS, Windows | Wraps built-in `autoUpdater` for update.electronjs.org (free OSS service) | Requires public GitHub repo + valid semver |
| Sparkle | macOS only (native) | EdDSA-signed appcast XML | Not practical for Electron (no first-party support) |

### Update server providers (electron-builder)

| Provider | Setup | Cost | Limits | Notes |
|----------|:------|:----:|:-------|:------|
| `github` | `publish: { provider: 'github' }` | Free for public repos | 2 GB per file; intermittent 403s documented (July 2025 Azure change) | Native integration |
| `s3` | AWS credentials | $0.085/GB egress (after 100 GB free tier) | None | Full control |
| `spaces` (DigitalOcean) | DO Spaces credentials | $0.02/GB egress | None | Cheaper than S3 |
| `generic` | Any HTTPS host | Varies | None | Maximum control |
| `keygen` | Keygen.sh account | $50-500/mo | Varies | Licensing + updates combined |

### CDN cost comparison (3 TB/month egress)

| Provider | Cost |
|----------|------:|
| GitHub Releases (public repo) | $0 |
| Cloudflare R2 | ~$15 (free egress) |
| Bunny CDN | ~$10-30 |
| S3 (raw) | ~$261 |
| S3 + CloudFront | ~$34-340 (depending on differential downloads) |

### Update UX patterns

electron-updater default behavior: download in background, call `quitAndInstall()` when complete.

Common patterns observed in production apps:
- **Install-on-quit** (Obsidian, Claude Desktop): Update downloads silently in background, installs automatically when user quits the app.
- **Restart notification** (Slack, VS Code): Update downloads in background, banner appears with "Restart to update" button.
- **Immediate install** (default electron-updater): `autoUpdater.quitAndInstall()` called on `update-downloaded` event.

### Staged rollouts

electron-updater supports staged rollouts via `stagingPercentage` in `latest.yml` / `latest-mac.yml`:

```yaml
version: 1.2.3
path: App-1.2.3.dmg
stagingPercentage: 10
```

Clients hash the user ID and compare against the percentage — the same 10% receive the update each step (not random churn). Percentage is manually edited in the published manifest. Third-party services like ToDesktop provide a dashboard UI for this.

### Version rollback rule

electron-updater only updates forward. A broken version 1.2.3 cannot be "rolled back" by re-uploading with the same version number — users on 1.2.3 will stay until a higher version (1.2.4) is published.

### Known failure modes

Documented issues in electron-updater ([electron-builder GitHub issues](https://github.com/electron-userland/electron-builder/issues)):
- `net::ERR_CONNECTION_RESET` on dropped wifi → uncaught main-process exceptions (#3171)
- Progress events stop firing after internal retries (#7799)
- Windows EBUSY rename errors leave pending folders stuck (#7051)
- UAC failures can cause update loops (#2640)
- `quitAndInstall` can fail if app process is locked (#2317, #8026)
- Partial downloads can stall without error (#2451)

Reference hardened implementation: [Doyensec ElectronSafeUpdater](https://blog.doyensec.com/2026/02/16/electron-safe-updater.html) documents an exponential backoff pattern with 1-day max retry window.

---

## 4. Distribution Channels

**Evidence:** [evidence/updates-and-distribution.md](evidence/updates-and-distribution.md)

### Channel comparison

| Channel | Setup cost | Discovery | Update mechanism | Sandbox required |
|---------|:----------:|:---------:|:----------------:|:----------------:|
| Direct DMG/NSIS from website | Hosting + CDN | Low (SEO) | electron-updater | No |
| GitHub Releases | Free, instant | Low (dev community only) | electron-updater `github` provider | No |
| Homebrew Cask | Free, PR to homebrew-cask repo | Medium (dev community) | `brew upgrade` OR internal updater with `auto_updates true` | No |
| Mac App Store (MAS) | $99 Apple Dev + 30%/15% rev cut | High (Mac users) | MAS automatic | **Yes** (full app sandbox) |
| Microsoft Store (MSIX) | Free registration | Medium (Windows users) | Store automatic | Partial |
| Snap Store (classic confinement) | Free, store review ~weeks | Medium (Ubuntu users) | snapd automatic | No (classic) |
| Snap Store (strict confinement) | Free, no review | Medium (Ubuntu users) | snapd automatic | Yes (strict) |
| AppImage | Free, built by electron-builder | Low | electron-updater | No |
| `.deb`, `.rpm` | Free, built by electron-builder | Low | Manual or repo | No |
| Flatpak (Flathub) | Free, community review | Medium | Flatpak automatic | Yes (flatpak portals) |
| ToDesktop (managed) | $58+/mo | N/A | ToDesktop managed | No |

### Mac App Store sandbox restrictions

MAS requires `com.apple.security.app-sandbox = true` in entitlements. Sandboxed apps are restricted to:
- `~/Downloads`, `~/Music`, `~/Pictures`
- User-selected files via NSOpenPanel (one-at-a-time)
- App container at `~/Library/Containers/<bundle-id>/`

Restrictions:
- No arbitrary filesystem access (recursive watching of arbitrary paths blocked)
- No `child_process.spawn` of arbitrary binaries (blocked by sandbox)
- No raw sockets or server listening (limited network entitlements)

### Distribution patterns from reference apps

Confirmed via bundle inspection and official download pages:

| App | Direct | GitHub | Cask | MAS | MS Store | Snap | .deb/.rpm |
|-----|:------:|:------:|:----:|:---:|:--------:|:----:|:---------:|
| VS Code | ✓ | — | ✓ | ✗ | ✓ | ✓ (classic) | ✓ |
| Obsidian | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ + AppImage |
| Slack | ✓ | ✗ | ✓ | ✓ (reduced) | ✓ | ✓ | ✓ |
| Discord | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ (deb only) |
| Claude Desktop | ✓ | ✗ | Community cask | ✗ | ✓ | ✗ | ✗ |
| Linear | ✓ (ToDesktop) | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Cursor | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ + AppImage |

Among the 7 reference apps:
- All 7 ship direct download as primary
- 6/7 skip Mac App Store entirely (only Slack with reduced feature set)
- 5/7 ship Homebrew Cask
- 4/7 ship Linux formats

---

## 5. CI/CD Pipeline Requirements

**Evidence:** [evidence/ci-cd-and-release-ops.md](evidence/ci-cd-and-release-ops.md)

### Build matrix options

| Platform | Runner | Notes |
|----------|:------|:------|
| macOS arm64 | `macos-14` (Apple Silicon) | Can cross-build x64 + arm64 + universal via `@electron/universal` |
| macOS x64 | `macos-13` (Intel) | Most apps dropping Intel-only; universal binary auto-picks at runtime |
| Windows x64 | `windows-latest` | Standard |
| Windows arm64 | `windows-latest` with cross-compile | Niche; x64 runs via emulation |
| Linux x64 | `ubuntu-latest` | Builds .deb + .rpm + AppImage + snap |
| Linux arm64 | Limited runner support | Manual QEMU or self-hosted |

### GitHub Actions pricing (April 2026)

| Runner | Multiplier | Per-minute cost |
|--------|:----------:|:---------------:|
| ubuntu-latest | 1x | $0.008 |
| windows-latest | 2x | $0.016 |
| macos-14 (M1 6-core) | 10x | $0.08 |
| macos-14-xlarge | 12x | $0.20 |

Included free minutes: 2000/mo (public repos), 3000/mo (private, Team plan). macOS runners consume from the same pool with 10x multiplier applied.

GitHub announced a ~39% price reduction on hosted runners effective January 1, 2026, paired with a new $0.002/min "cloud platform charge" that also applies to self-hosted runners.

### Self-hosted runners

| Option | Cost | Notes |
|--------|:-----|:------|
| Refurbished M1 Mac Mini | ~$350 one-time | Break-even ~4,375 GitHub macOS minutes |
| New M4 Mac Mini | $599 one-time | Break-even ~7,487 minutes |
| AWS EC2 Mac (mac2.metal) | $0.65/hr, **24-hour minimum dedicated host** | $26/day = ~$780/month minimum |
| AWS EC2 Mac (mac2-m2.metal) | $0.878/hr, 24-hour minimum | ~$21/day minimum |

AWS EC2 Mac billing requires a minimum 24-hour allocation per dedicated host. Self-hosted keychain automation is non-trivial: signing on self-hosted runners requires interactive keychain unlock or careful automation scripts.

### Build time benchmarks

| App size | Per-platform build time | Notarization wait | End-to-end (3 parallel) |
|----------|:-----------------------:|:-----------------:|:-----------------------:|
| Small (<50 MB) | 10-15 min | 1-5 min | 15-25 min |
| Medium (~100 MB) | 20-30 min | 5-15 min | 30-45 min |
| Large (VS Code ~200 MB+) | 40-60 min | 15-30 min | 60-90 min |

Notarization long tail: first-ever submissions or >1GB apps have been reported taking 30 min to 4.5 hours during Apple server congestion.

### Native module rebuild

Native modules are ABI-specific. `@electron/rebuild` (or `electron-builder install-app-deps`) compiles against Electron's Node ABI. Cache keys must include `runner.os` and `runner.arch`:

```yaml
- uses: actions/cache@v4
  with:
    path: node_modules
    key: deps-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('bun.lock') }}
```

### Secrets required for signed release

- `APPLE_CERT_P12_BASE64` + `APPLE_CERT_PASSWORD` — macOS signing cert
- `APPLE_API_KEY_ID` + `APPLE_API_ISSUER_ID` + `APPLE_API_KEY_BASE64` — notarization credentials (API key preferred over Apple ID)
- `WIN_CERT_PFX_BASE64` + `WIN_CERT_PASSWORD` — Windows signing cert (or Azure SP credentials for Trusted Signing)
- `AZURE_CLIENT_ID` + `AZURE_TENANT_ID` + `AZURE_CLIENT_SECRET` — Azure Trusted Signing
- `GH_TOKEN` — GitHub Releases publishing

---

## 6. Security and Hardening

**Evidence:** [evidence/versioning-and-security.md](evidence/versioning-and-security.md)

### Modern Electron secure defaults (Electron 28+)

| Setting | Default | Since |
|---------|:-------:|:-----:|
| `contextIsolation` | `true` | Electron 12 |
| `nodeIntegration` | `false` | Electron 5 |
| `sandbox` (renderer) | `true` | Electron 20 |
| `webSecurity` | `true` | Long-standing |
| `allowRunningInsecureContent` | `false` | Long-standing |
| `nodeIntegrationInWorker` | `false` | Long-standing |
| `enableRemoteModule` | Removed | Electron 14 |

Setting `nodeIntegration: true` or `contextIsolation: false` disables the sandbox regardless of other settings.

### The Electron Security Checklist (20 items)

Summary of [official Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security):

1. Only load secure content (HTTPS/WSS)
2. Do not enable Node.js integration for remote content
3. Enable context isolation
4. Enable process sandboxing
5. Handle session permission requests
6. Do not disable `webSecurity`
7. Define a Content Security Policy
8. Do not enable `allowRunningInsecureContent`
9. Do not enable `experimentalFeatures`
10. Do not use `enableBlinkFeatures`
11. Do not use `allowpopups` for `<webview>`
12. Verify webview options before creation
13. Disable or limit navigation (`will-navigate`)
14. Disable or limit new window creation (`setWindowOpenHandler`)
15. Do not use `shell.openExternal` with untrusted content
16. Use a current version of Electron
17. Validate the sender of all IPC messages (`event.senderFrame`)
18. Avoid the `file://` protocol (use custom `protocol.handle()`)
19. Check which fuses can be flipped
20. Do not expose Electron APIs to untrusted content via contextBridge

### @electron/fuses

Eight fuses available for hardening a production build:

| Fuse | Default | Hardened value | Purpose |
|------|:-------:|:--------------:|:--------|
| `RunAsNode` | on | off | Disable `ELECTRON_RUN_AS_NODE` — prevent binary being used as Node interpreter |
| `EnableCookieEncryption` | off | on | OS keychain encryption for cookie store (one-way — cannot flip back) |
| `EnableNodeOptionsEnvironmentVariable` | on | off | Block `NODE_OPTIONS` injection |
| `EnableNodeCliInspectArguments` | on | off | Block `--inspect` / `--inspect-brk` in packaged binary |
| `EnableEmbeddedAsarIntegrityValidation` | off | on | Validate `app.asar` contents at load time |
| `OnlyLoadAppFromAsar` | off | on | Restrict code loading to `app.asar` only (no disk fallback) |
| `LoadBrowserProcessSpecificV8Snapshot` | off | on | Separate V8 snapshots per process type |
| `GrantFileProtocolExtraPrivileges` | on | off | Don't privilege `file://` pages |

Fuses must be flipped after packaging, before code signing. Both electron-builder and electron-forge integrate `@electron/fuses`.

### CVE-2025-55305 (September 2025)

Trail of Bits disclosed that `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` fuses validated `app.asar` contents but did NOT consider `v8_context_snapshot.bin` as executable content. An attacker with local filesystem write access could overwrite the V8 heap snapshot to clobber JavaScript builtins (e.g., `Array.isArray`) with attacker-controlled code, which would execute on next launch — bypassing all existing integrity checks.

Apps confirmed affected at disclosure: **Signal, Slack, 1Password** (1Password patched in v8.11.8-40).

Electron 41 + `@electron/asar ≥ 4.1.0` introduced a signed digest layer that closes this.

### CVE patch cadence

Example: **CVE-2025-10585** (V8 type confusion, added to CISA Known Exploited Vulnerabilities list on 2025-09-23).
- Chrome patched in 140.0.7339.185 on release day
- One week after KEV listing, Electron 38.2.0 still shipped Chromium 140.0.7339.133

Publicly tracked Electron security advisories: [github.com/electron/electron/security/advisories](https://github.com/electron/electron/security/advisories).

### Supply chain considerations

- `npm audit` / `bun pm audit` catch known CVEs from a single database
- [Socket.dev](https://socket.dev) integrates as a GitHub App, analyzes postinstall scripts, filesystem access patterns, typosquatting
- Snyk provides similar behavioral analysis
- Dependabot / Renovate automate dependency updates
- `bun.lock` + `bun install --frozen-lockfile` in CI ensures reproducible builds
- Everything in `packages/app` ends up in `app.asar` — every dependency is in the user's trusted computing base

---

## 7. Release Operations / Lifecycle

**Evidence:** [evidence/ci-cd-and-release-ops.md](evidence/ci-cd-and-release-ops.md)

### Release cadence at reference apps

| App | Stable cadence | Insider/beta cadence | Versioning | Notes |
|-----|:--------------:|:---------------------:|:----------:|:------|
| VS Code | Weekly (since v1.111, March 2026) | Daily | Semver (1.111.0) | Formal "endgame" process with 24hr Insiders validation |
| Obsidian | Monthly | ~2 weeks | Semver (1.12.7) | Early access is paid ($25 one-time) |
| Slack Desktop | ~Monthly | — | Semver (4.47.72) | Hotfix cycle within ~1 week of critical bugs |
| Claude Desktop | Near-daily | — | Build-number (1.1062.0) | Every successful CI build tagged as release |
| Cursor | Near-daily patch + periodic minor bumps | — | Semver (3.0.12) | Inherits pinned Electron from VS Code fork |
| 1Password | Monthly+ | — | Semver (8.11.8-40) | Actively tracks Electron security advisories |

### Version numbering patterns

| Pattern | Examples | Pros | Cons |
|---------|:---------|:-----|:-----|
| Semver (1.2.3) | VS Code, Obsidian, Cursor, Slack, most | User-readable, changelog-linkable, signals intent | Requires discipline to avoid "semver drift" |
| Build-number (1.1062.0) | Claude Desktop | CI-automatable, no human decisions | No signal to users, hard to cite in docs |
| Calver (2026.4.1) | Rare for Electron desktop | Clear recency signal | Bad for libraries implying API stability |

### Changelog management

Two separate concerns observed in reference apps:
1. **Developer changelog** (`CHANGELOG.md`) — auto-generated from conventional commits or changesets, shipped as release notes
2. **User "what's new"** — hand-written marketing copy, shown in-app on first launch after major/minor update

VS Code, Slack, and Obsidian all hand-curate the user-facing "what's new" dialog rather than auto-generating from commit messages.

### Rollback strategies

electron-updater's version comparison only updates forward. Options for recovering from a bad release:
1. **Ship a higher version with the fix** — always works, but users on the bad version remain there until the next update
2. **Staged rollout (10% → 50% → 100% over 48h)** — limits blast radius by only releasing to a fraction of users initially
3. **Minimum-version enforcement** — app can check its own version against a backend-controlled minimum and block start if below, but this requires infrastructure
4. **Hotfix release within 24-48h** — common pattern, matches Slack's post-bug cadence

---

## 8. Telemetry, Crash Reporting, Analytics

**Evidence:** [evidence/telemetry-bundle-devex.md](evidence/telemetry-bundle-devex.md)

### Sentry for Electron

`@sentry/electron` is an SDK that bridges main and renderer process error capture with native crash reporting via Electron's built-in Crashpad. Single DSN, one initialization per process.

Pricing (April 2026):
- Free: 5K errors/mo, 50 session replays, limited log/span volume
- Team: $26/mo annual ($32/mo monthly) — 50K errors, 50 replays, 5GB logs, 5M spans
- Business/Enterprise: significantly higher

Confirmed usage: Claude Desktop bundles `@sentry/electron ^7.0.0` (verified via app.asar inspection).

### Electron Crashpad (built-in)

`crashReporter.start({ submitURL })` enables native crash reporting. Crashpad writes `.dmp` minidumps to `{userData}/Crashpad/` and POSTs them as multipart form data. Upload targets:
- Sentry minidump endpoint (`/api/<project>/minidump/?sentry_key=<key>`)
- Custom backend
- [Backtrace.io](https://backtrace.io)

Native crashes (V8/Node/Blink segfaults) are not caught by JavaScript-only error reporting.

### PostHog for Electron

`posthog-js` works in the renderer (Chromium context, autocapture supported). Free tier: 1M events/month + 5K session recordings + 1M feature flag requests. Self-hostable (AGPL).

### Telemetry stances observed in reference apps

| App | Default | Mechanism | GDPR posture |
|-----|:-------:|:----------|:-------------|
| Obsidian | Zero telemetry | Only update check (disableable) | Trivially compliant |
| Raycast | Aggregated-only, AI opt-in | Custom | Strong |
| VS Code | Opt-out | `telemetry.telemetryLevel: all/error/crash/off`; Microsoft claims pseudonymization | Contested in EU case law |
| Slack | Opt-out | Standard SaaS telemetry | Regularly in court |

### GDPR considerations

IP addresses, device IDs, and user-agent strings are "personal data" under GDPR. EU case law leans toward requiring opt-in consent for analytics beyond what is "strictly necessary." VS Code's opt-out model is contested.

---

## 9. Bundle Sizes and CDN Cost

**Evidence:** [evidence/telemetry-bundle-devex.md](evidence/telemetry-bundle-devex.md)

### Reference DMG sizes (from app bundle inspection)

| App | macOS DMG size |
|-----|---------------:|
| Raycast (native Swift, for comparison) | 99 MB |
| ChatGPT Desktop (native Swift, for comparison) | 137 MB |
| Slack (Electron) | 287 MB |
| Figma (Electron + C++/WASM canvas) | 279 MB |
| Notion | 267 MB |
| VS Code | 374 MB |
| Codex Desktop | 442 MB |
| Perplexity (native Swift + WKWebView) | 432 MB |
| Obsidian | 482 MB |
| Linear | 509 MB |
| Claude Desktop | 623 MB |
| Cursor | 804 MB |

Electron baseline (runtime only, Chromium + V8 + Node): ~200 MB. App code + node_modules + assets add the remainder.

### Differential updates

`electron-builder` generates a `.blockmap` file alongside each release. The blockmap splits the installer into content-addressed blocks; the updater downloads only blocks whose hashes changed.

Real-world observations:
- Blockmap savings typically 30-60% (vs full download)
- `electron-delta` adds true binary diffing for single-digit MB patches
- Community consensus: blockmap is "mediocre" compared to pure binary diffing but zero-config

### CDN pricing comparison (3 TB/month egress)

| Provider | Cost |
|----------|-----:|
| GitHub Releases (public repo) | $0 (unlimited bandwidth, 2 GB per file limit) |
| Cloudflare R2 | ~$15 (storage) + $0 egress |
| Bunny CDN | ~$10-30 |
| S3 (raw) | ~$261 |
| S3 + CloudFront | ~$34-340 (depending on differential download usage) |
| ToDesktop (managed, includes signing + updates) | $58+/month |

GitHub Releases rate limits: unauthenticated API requests capped at 60/hour per IP, but direct `releases/download/...` URLs are served from a CDN and not subject to those limits for end-users. Intermittent 403 errors documented in community discussions (July 2025 Azure-side change).

---

## 10. Developer Experience / Dev Loop

**Evidence:** [evidence/telemetry-bundle-devex.md](evidence/telemetry-bundle-devex.md)

### electron-vite

Modern scaffolding tool that provides:
- Vite dev server for renderer with native HMR
- Rollup watcher for main/preload with automatic Electron process restart
- Separate Vite configs for main, preload, and renderer
- TypeScript support out of the box

Observed feedback loop speeds:
- **Renderer HMR: <500ms** (native Vite)
- **Preload reload: 1-2s** (window reload)
- **Main process restart: 2-4s** (full Electron process restart)

Since electron-vite v0.29.0, preload scripts can emit an `electron-vite&type=hot-reload` event that triggers window reload without full app restart.

### Main process debugging

```bash
electron --inspect=9229 .
```

VS Code launch.json:
```json
{
  "type": "node",
  "request": "attach",
  "port": 9229
}
```

Standard Node Inspector protocol. Breakpoints, step debugging, watches work as expected.

### Renderer debugging

- Chrome DevTools via `webContents.openDevTools()`
- React DevTools extension via `session.defaultSession.loadExtension()`
- Memory profiling: standard Chrome DevTools Memory tab
- Main process memory: connect via `chrome://inspect` in a separate Chrome instance

### Production-only bug categories

Bugs that appear in packaged builds but not `electron-vite dev`:
1. **ASAR path differences** — `fs.readFileSync(__dirname + '/foo')` works in dev but fails in ASAR unless file is in `asar.unpacked`
2. **Fuses rejecting modifications** — `EnableEmbeddedAsarIntegrityValidation` + `OnlyLoadAppFromAsar` reject post-signing modifications
3. **Native `.node` addon signing** — must be signed separately on macOS 10.14.5+ with hardened runtime
4. **Hardened runtime restrictions** — blocks `eval`, JIT, library validation unless entitlements granted
5. **Code signing affects cert pinning** — production-only HTTPS verification behavior

These require launching the packaged `.app` / `.exe` in CI to catch, not just running `electron-vite dev`.

### DevTools in production

Electron ships with the `EnableNodeCliInspectArguments` fuse that disables `--inspect` / `--inspect-brk` in packaged builds when flipped off. DevTools itself is runtime-gated via `webContents.openDevTools()` calls.

Pattern observed in some apps: gate DevTools opening on environment variable (e.g., `OK_DEBUG=1`) or dotfile sentinel for support mode.

### Cross-platform testing

- Windows-specific bugs cannot be faithfully reproduced from macOS locally
- CI is the primary way to catch platform-specific regressions
- Local Windows testing options: UTM/Parallels VM, cloud VM (AWS EC2, Tart on Apple Silicon)

---

## Known Failure Modes (Cross-Cutting)

From evidence across all dimensions:

1. **ESM in `utilityProcess.fork()`** — not supported ([electron/electron#40031](https://github.com/electron/electron/issues/40031)). Server code targeted at utility process must build to CJS.
2. **Native module ABI mismatch** — `NODE_MODULE_VERSION` errors after Electron upgrade without rebuild.
3. **`.node` files inside ASAR** — cannot be `dlopen`'d from inside an archive; must be in `app.asar.unpacked`.
4. **macOS 15 Sequoia right-click-Open removal** — unsigned apps require Settings navigation (~45s friction).
5. **GitHub Releases intermittent 403** — July 2025 Azure-side change affects authenticated download requests.
6. **CA/B Forum HSM mandate (June 2023)** — no more `.pfx` files in CI for Windows code signing.
7. **EV "instant trust" removal (March 2024)** — EV certs no longer bypass SmartScreen immediately.
8. **CVE-2025-55305** — ASAR integrity fuses did not cover V8 heap snapshot; fixed in Electron 41 + `@electron/asar ≥ 4.1.0`.
9. **Notarization long tail** — reported 30 min to 4.5 hours for first-time submissions or >1 GB apps.
10. **Mac App Store sandbox** — blocks arbitrary file access, `child_process.spawn` of unlisted binaries, server listening. Non-starter for apps needing recursive file watching or git shell-out.

---

## References

### Evidence Files
- [evidence/versioning-and-security.md](evidence/versioning-and-security.md) — Electron release cadence, support policy, CVE patch windows, fuses, ASAR integrity
- [evidence/code-signing.md](evidence/code-signing.md) — Apple Developer, Azure Trusted Signing, notarization, Gatekeeper/SmartScreen states
- [evidence/updates-and-distribution.md](evidence/updates-and-distribution.md) — electron-updater providers, staged rollouts, distribution channel tradeoffs
- [evidence/ci-cd-and-release-ops.md](evidence/ci-cd-and-release-ops.md) — Build matrix, GitHub Actions pricing, native module caching, reference app release cadence
- [evidence/telemetry-bundle-devex.md](evidence/telemetry-bundle-devex.md) — Sentry, PostHog, reference DMG sizes, CDN pricing, dev loop

### Primary sources (external)
- [Electron Release Timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [Electron Security Tutorial](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [electron-vite docs](https://electron-vite.org/)
- [Apple Developer Program](https://developer.apple.com/programs/enroll/)
- [Apple Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Azure Trusted Signing](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/)
- [Sentry Electron Docs](https://docs.sentry.io/platforms/javascript/guides/electron/)
- [Trail of Bits: CVE-2025-55305 ASAR bypass](https://blog.trailofbits.com/2025/09/03/subverting-code-integrity-checks-to-locally-backdoor-signal-1password-slack-and-more/)
- [Doyensec ElectronSafeUpdater](https://blog.doyensec.com/2026/02/16/electron-safe-updater.html)

### Related Research
- [../web-to-macos-desktop-wrapping-2025/](../web-to-macos-desktop-wrapping-2025/) — Framework selection (Electron vs Tauri), 20-app stack inspection
- [../oss-licensing-strategies-open-core/](../oss-licensing-strategies-open-core/) — License selection strategy
