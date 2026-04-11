# Evidence: CI/CD Pipeline & Release Operations

**Dimension:** CI/CD + Release Operations
**Date:** 2026-04-11
**Sources:** GitHub Actions docs, VS Code release wiki, Obsidian docs, electron-builder docs

---

## Key sources
- [GitHub Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- [@electron/universal](https://github.com/electron/universal)
- [electron-builder multi-platform build](https://www.electron.build/multi-platform-build.html)
- [VS Code Release Management wiki](https://deepwiki.com/microsoft/vscode-wiki/3.2-release-management)
- [Obsidian early access docs](https://help.obsidian.md/early-access)
- [electron-vite debugging](https://electron-vite.org/guide/debugging)

---

## CI/CD Findings

### Finding: macOS universal binary is the default in 2025
**Confidence:** CONFIRMED

`@electron/universal` merges an x64 `.app` and arm64 `.app` into one Universal binary. electron-builder exposes `--universal` flag. VS Code, Slack, 1Password all ship universal.

```yaml
# electron-builder.yml
mac:
  target:
    - target: dmg
      arch: universal  # builds both x64 + arm64 and merges
```

**UX impact:** One download URL, one installer, auto-picks the right slice at runtime. Users don't see an "Intel or Apple Silicon?" dialog. This matters.

### Finding: Build matrix = 3 concurrent runners
**Confidence:** CONFIRMED

```yaml
# .github/workflows/release.yml
jobs:
  build:
    strategy:
      matrix:
        os: [macos-14, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
```

- `macos-14` (Apple Silicon) — builds universal DMG + notarization
- `windows-latest` — builds NSIS installer + signing
- `ubuntu-latest` — builds .deb + .rpm + AppImage

All three run in parallel. Total pipeline time: ~25-30 minutes for a small Electron app.

### Finding: Native module rebuild and caching strategy
**Confidence:** CONFIRMED

Native modules are ABI-specific. Cache key must include `runner.os` and `runner.arch`:

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.cache/electron
      ~/.cache/electron-builder
    key: electron-${{ hashFiles('package.json') }}

- uses: actions/cache@v4
  with:
    path: node_modules
    key: deps-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('bun.lock') }}

- run: bun install --frozen-lockfile
- run: bun run electron-builder install-app-deps
```

`electron-builder install-app-deps` runs `@electron/rebuild` against the Electron version.

### Finding: GitHub Actions cost is trivial at OK's scale
**Confidence:** CONFIRMED

- macOS runner: 10x multiplier. 30 min build = 300 billable min = $2.40
- Windows runner: 2x multiplier. 20 min build = 40 billable min = $0.32
- Linux runner: 1x. 15 min build = 15 billable min = $0.12
- **Per release: ~$3.** For 4 releases/month: **~$12/mo.**

Self-hosted runners are not worth it until >50 macOS builds/month.

### Finding: Secrets for signing in GitHub Actions
**Confidence:** CONFIRMED

```yaml
env:
  # Apple
  APPLE_CERT_P12_BASE64: ${{ secrets.APPLE_CERT_P12_BASE64 }}
  APPLE_CERT_PASSWORD: ${{ secrets.APPLE_CERT_PASSWORD }}
  APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
  APPLE_API_ISSUER_ID: ${{ secrets.APPLE_API_ISSUER_ID }}
  APPLE_API_KEY_BASE64: ${{ secrets.APPLE_API_KEY_BASE64 }}

  # Windows (via Azure Trusted Signing)
  AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
  AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
  AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}

  # GitHub Releases
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Use App Store Connect API key, not Apple ID.** Doesn't expire, revocable per-key, no 2FA issues in CI.

### Finding: Post-package smoke test is critical
**Confidence:** CONFIRMED

Production-only bugs cluster around:
1. **ASAR path differences** — `fs.readFileSync(__dirname + '/foo')` works in dev but fails in ASAR
2. **Fuses rejecting modifications** — `EnableEmbeddedAsarIntegrityValidation` catches post-signing modifications
3. **Native `.node` addons** need separate code signing on macOS 10.14.5+
4. **Hardened runtime** blocks `eval`, JIT, library validation unless entitlements granted

**None of these surface in `electron-vite dev`.** CI must run a smoke test that launches the actual packaged `.app`/`.exe` and verifies it opens.

```yaml
# After electron-builder produces dist/*
- name: Smoke test packaged app
  run: |
    open dist/mac-universal/Open\ Knowledge.app
    sleep 10
    # Verify process is running
    pgrep -x "Open Knowledge" || exit 1
```

Better: use Playwright to actually click through a basic workflow.

---

## Release Operations Findings

### Finding: VS Code moved from monthly to weekly releases in March 2026
**Confidence:** CONFIRMED

VS Code 1.111 (March 2026) kicked off weekly stable releases, up from monthly. Motivation: Copilot/agent feature velocity required shorter iteration cycles.

**Pattern (even for monthly):** Each iteration has a "champion," an Endgame checklist, and Insiders builds must be in the wild for 24 hours before entering final endgame phase.

**For OK:** Start with monthly stable + weekly insider channel. You won't need weekly stable for 12+ months. Adopt endgame-style checklist even for monthly — the discipline matters more than cadence.

### Finding: Obsidian pattern — monthly stable + early access (paid)
**Confidence:** CONFIRMED

- Semver: `1.12.7`
- Monthly stable, ~2-week intervals for insider/early-access
- Early access is paid ($25 one-time) — functions as funding + quality gate
- Small team (<10 engineers), manual release trigger, no complex automation

**For OK:** The pattern is right (monthly + insider). Don't copy paid insider — it's unusual.

### Finding: Claude Desktop uses near-daily build-number versioning
**Confidence:** CONFIRMED

Version format `1.1062.0` — build-number based, not semver. Observed real sequence: 200-300 build number increments per day. Every successful CI build is effectively tagged as a release.

**For OK:** Do NOT copy. Build-number versioning breaks user mental models ("is 1.1062 a major update?"), makes external changelog linking impossible, and is suited only for internal-tools velocity with scale support orgs.

### Finding: Semver is the universal norm
**Confidence:** CONFIRMED

| App | Versioning |
|-----|-----------|
| VS Code | `1.111.0` (semver, iteration.patch) |
| Obsidian | `1.12.7` (semver) |
| Cursor | `3.0.12` (semver) |
| Slack | `4.47.72` (semver) |
| 1Password | `8.11.8-40` (semver + build) |
| Discord | `0.0.322` (semver) |
| Claude Desktop | `1.1062.0` (build-number — outlier) |

**For OK:** Use semver via `changesets` (already in the codebase). Don't auto-generate user-facing changelog from commit messages — keep a hand-written `whats-new.md` for the in-app dialog.

### Finding: Changelog pattern — dev-changelog vs user-changelog
**Confidence:** CONFIRMED

Two separate concerns:
1. **Dev changelog** (`CHANGELOG.md`) — auto-generated from changesets, ships in release. Useful for developers + GitHub release notes.
2. **User "what's new"** — hand-written marketing copy, shown on first launch after major/minor update. Curated by a human.

VS Code, Obsidian, Slack all hand-write the user-facing "what's new" dialog. Never auto-generate it from `feat(editor):` commit messages.

### Finding: Release cadence for OK — monthly + insider weekly
**Confidence:** INFERRED

Based on team size (small), user base (early), and complexity (moderate):

- **Stable:** Monthly release, first Tuesday of month
- **Insider/beta:** Weekly, auto-published from main branch
- **Hotfix:** Ad-hoc for critical bugs (e.g., CRDT data loss, crash loops, security CVE)
- **Rollout:** 10% → 50% → 100% over 48 hours, gated on crash rate from Sentry

Keep it boring. Monthly is easier to reason about than weekly. Upgrade cadence only when you have the telemetry + on-call + rollback discipline for it.
