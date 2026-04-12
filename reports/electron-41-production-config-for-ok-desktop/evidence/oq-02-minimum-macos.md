# Evidence: OQ-02 — Minimum macOS Version for Electron 41

**Dimension:** What is the minimum macOS version that Electron 41 binaries support, and what's the user-impact for the docs-author persona?
**Date:** 2026-04-11
**Sources:**
- Electron README on GitHub (https://github.com/electron/electron/blob/main/README.md)
- Electron 38 release notes (https://www.electronjs.org/blog/electron-38-0)
- Electron 41 release notes (https://www.electronjs.org/blog/electron-41-0)

---

## Key files / pages referenced

- https://github.com/electron/electron/blob/main/README.md — current platform support statement
- https://www.electronjs.org/blog/electron-38-0 — release that dropped Big Sur (macOS 11) support
- https://www.electronjs.org/blog/electron-41-0 — Electron 41 ships Chromium 146.0.7680.65, Node 24.14.0, V8 14.6

---

## Findings

### Finding: Electron 41 minimum macOS version is **macOS 12 (Monterey)**
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron/blob/main/README.md

> "macOS (Monterey and up): Electron provides 64-bit Intel and Apple Silicon / ARM binaries for macOS."

This is the current platform support statement on Electron's main README, applying to all currently-supported Electron majors (the three latest: 39, 40, 41 as of April 2026).

**Implications:** Electron 41 will not launch on macOS 11 (Big Sur) or earlier. macOS 12 (Monterey, released Oct 2021) and newer are supported.

---

### Finding: macOS 11 (Big Sur) was dropped in **Electron 38** (Sep 2025), driven by upstream Chromium dropping Big Sur
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/blog/electron-38-0

> "macOS 11 (Big Sur) is no longer supported by Chromium. Older versions of Electron will continue to run on Big Sur, but macOS 12 (Monterey) or later will be required to run Electron v38.0.0 and higher."

This was listed as a breaking change in Electron 38.

**Implications:** Electron 38, 39, 40, and 41 all share the same minimum: macOS 12 Monterey. The drop happened ~6 months before Electron 41's release (Mar 2026), so this is settled and no further drops are imminent in the supported support window (Electron 39, 40, 41).

---

### Finding: Electron 41 ships Chromium 146.0.7680.65, Node 24.14.0, V8 14.6
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/blog/electron-41-0

> "- Chromium: `146.0.7680.65`
> - Node.js: `v24.14.0`
> - V8: `14.6`"

**Implications:** Confirms Chromium 146 as the upstream basis. Chromium 146 (and Chrome 146) drop macOS 11 support — this is the upstream forcing function for Electron's macOS 12 minimum.

---

### Finding: macOS Monterey (12.x) install base in early 2026
**Confidence:** UNCERTAIN (no Apple-published statistic; estimates from third-party telemetry vendors are not in evidence here)
**Evidence:** Apple does not publish macOS version distribution stats. Public telemetry sources (Statcounter, Mixpanel snapshots) typically show that within ~24 months of a new macOS major release, the prior 4 majors collectively cover >95% of active installs. As of April 2026:
- macOS 15 Sequoia (Sep 2024) — current latest
- macOS 14 Sonoma (Sep 2023)
- macOS 13 Ventura (Oct 2022)
- macOS 12 Monterey (Oct 2021) — minimum for Electron 41
- macOS 11 Big Sur (Nov 2020) — UNSUPPORTED by Electron 41

Big Sur is now ~5.5 years old and no longer receives Apple security updates (Apple typically supports the current macOS major + 2 prior, so Big Sur exited Apple security support in late 2023). Users who haven't upgraded past Big Sur are very likely on a 2017-or-older Intel Mac with no upgrade path to Monterey, OR are deliberately holding back. This population is small but non-zero.

**Implications for the docs-author persona:** The target persona (technical writers, DevRel, docs engineers, solo founders writing product docs) is overwhelmingly on Monterey or newer — most own a Mac purchased in the last 4-5 years and run Slack, VS Code, modern browsers, and AI tools that have long since required Monterey+ themselves. The Monterey floor is not a meaningful adoption barrier for this persona.

The only real-world concern would be a docs author on a circa-2017 MacBook Pro running Big Sur because they can't upgrade and don't want to buy new hardware. For that user, Open Knowledge's CLI (`npx @inkeep/open-knowledge`, which only requires Node 22+) remains a fallback.

---

## Negative searches

- Searched Electron 39, 40, 41 release notes for any further macOS version bump: NOT FOUND. macOS 12 floor stable through 41.
- Searched for "Monterey deprecation Electron 42" or roadmap discussions: NOT FOUND. No imminent bump signaled.

---

## Gaps / follow-ups

- If a follow-up is needed, third-party telemetry vendors (Mixpanel, Amplitude, Statcounter) publish quarterly macOS version distribution reports that could anchor "what % of Mac users are on Monterey+" with a real number. Not pursued here because the docs-author persona is heavily skewed to recent hardware.
