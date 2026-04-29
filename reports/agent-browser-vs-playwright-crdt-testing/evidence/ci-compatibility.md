# Evidence: CI Compatibility

**Dimension:** CI compatibility — must run in GitHub Actions (Linux runner, headless)
**Date:** 2026-04-09
**Sources:** Playwright docs, agent-browser docs, Peekaboo docs, GitHub Actions runner specs

---

## Key files / pages referenced

- [https://playwright.dev/docs/ci](https://playwright.dev/docs/ci) — Playwright CI configuration
- [https://github.com/vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) — agent-browser README and issues
- [https://github.com/vercel-labs/agent-browser/issues/743](https://github.com/vercel-labs/agent-browser/issues/743) — Playwright 1.58.x on Linux servers without X Server
- [https://github.com/vercel-labs/agent-browser/issues/369](https://github.com/vercel-labs/agent-browser/issues/369) — --headed fails on Linux: DISPLAY env var not passed
- [https://github.com/steipete/Peekaboo](https://github.com/steipete/Peekaboo) — Peekaboo README (macOS-only)

---

## Findings

### Finding: Playwright has first-class CI support with official GitHub Actions integration

**Confidence:** CONFIRMED
**Evidence:** [https://playwright.dev/docs/ci](https://playwright.dev/docs/ci)

Playwright provides:

- Official Docker image (`mcr.microsoft.com/playwright:v1.59.1-noble`) with all browsers pre-installed
- `npx playwright install --with-deps` for system dependency installation on Linux runners
- Headless mode is the default — no display server required
- GitHub Actions official example in docs
- Sharding support for parallel execution across multiple CI machines
- Artifact upload for traces, screenshots, videos on failure

The project already uses `@playwright/test: ^1.59.1` — the same version runs identically in CI and locally.

**Implications:** Zero CI friction. The test suite will run on standard `ubuntu-latest` GitHub Actions runners without modification.

### Finding: agent-browser runs on Linux headless but has known CI issues

**Confidence:** CONFIRMED
**Evidence:** agent-browser GitHub issues #743, #369

agent-browser supports:

- Headless mode by default (no display server needed)
- Linux ARM64/x64 native binaries
- `agent-browser install --with-deps` for system dependencies
- `AGENT_BROWSER_IDLE_TIMEOUT_MS` for CI ephemeral environments

Known CI issues:

- Issue #743 (Playwright 1.58.x on Linux servers without X Server): headless shell binary path needs explicit configuration
- Issue #369 (--headed fails on Linux): DISPLAY env var not passed to browser subprocess
- Chrome for Testing download required on first run (additional CI setup step)

**Implications:** Workable in CI but requires more setup and has rougher edges than Playwright. Not a blocking issue, but adds CI maintenance overhead.

### Finding: Peekaboo MCP is macOS-only — fundamentally incompatible with CI

**Confidence:** CONFIRMED
**Evidence:** [https://github.com/steipete/Peekaboo](https://github.com/steipete/Peekaboo)

Peekaboo requires:

- macOS 15+ (Sequoia or later)
- Xcode 16+ / Swift 6.2
- Screen Recording + Accessibility permissions (system-level grants)
- A graphical session (not available in standard CI)

**Implications:** Peekaboo cannot run in GitHub Actions. It is a local-only macOS tool for interactive development — explicitly not designed for CI pipelines.

---

## Gaps / follow-ups

- GitHub Actions self-hosted macOS runners could theoretically run Peekaboo, but this would be exotic and fragile. Not worth investigating.

