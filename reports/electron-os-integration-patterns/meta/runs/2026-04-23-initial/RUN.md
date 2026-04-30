# Run 2026-04-23-initial

**Status:** Active
**Parent report:** `reports/electron-os-integration-patterns/`
**Trigger:** User ask post-PR-270 — needs a pattern map for OS-integration capabilities before deciding how to wire click-on-asset behavior in OK's Electron build.

## Scope (user-confirmed rubric)

Primary question: *What OS-integration capabilities does Electron offer that the web doesn't, how should they be used, and what's the best-practice pattern set across OSS Electron apps for "open this thing in the OS"?*

Reader: OK engineer deciding whether/how to wire `shell.openPath`-on-click in the Electron build.

Dimensions:
- D1 — Electron shell/OS API surface (Deep)
- D2 — Web / browser equivalents + gaps (Moderate)
- D3 — Click-interception patterns (Moderate)
- D4 — Path-containment + security patterns (Moderate)
- D5 — OSS Electron app case studies (Deep)
- D6 — Best-practice synthesis / rubric (Deep)

Scope locks (from AskUserQuestion):
- **Platform:** macOS primary; cross-platform inline notes where behavior meaningfully differs.
- **Non-OSS apps:** skip entirely. OSS-only for primary evidence.
- **Implementation:** pattern-level only. No OK-specific file/line prescriptions in the report.

Non-goals:
- Tauri / Neutralino / Wails alternatives.
- Installer / code-signing / distribution (covered by `electron-desktop-app-operations-2025/`).
- URL scheme / deep-link design (covered by `deep-linking-ai-desktop-apps-2026/`).
- Benchmarks.

## Canonical sources + owners

| Source | Owner | Purpose |
|---|---|---|
| electron.org/docs — shell module | S1 | D1 API surface + platform notes |
| electron.org/docs — webContents events | S1 | D1 + D3 interception APIs |
| electron.org/docs — security best practices | S1 | D4 baseline |
| github.com/electron/electron security advisories | S1 | D4 CVE history |
| MDN — File System Access API, Web Share API, PWA protocol handlers | S2 | D2 web gaps |
| caniuse.com — web capability matrix | S2 | D2 availability |
| github.com/microsoft/vscode | S3 | D5 case: VSCode shell-open patterns |
| github.com/desktop/desktop (GitHub Desktop) | S3 | D5 case |
| github.com/laurent22/joplin | S3 | D5 case |
| github.com/logseq/logseq | S3 | D5 case |
| github.com/toeverything/AFFiNE | S3 | D5 case (Electron main only) |
| github.com/Zettlr/Zettlr | S3 | D5 case (already partial from D9 research) |
| github.com/standardnotes/app | S3 | D5 case |
| github.com/Alex313031/thorium or equivalent | S4 | Security patterns from hardened Electron |
| Electron fuses + contextIsolation docs | S4 | D4 baseline |

## Workers

| ID | Scope | Dimensions |
|---|---|---|
| S1 | API surface enumeration — authoritative from Electron docs + source | D1 |
| S2 | Web equivalents + PWA capability gap | D2 |
| S3 | OSS case studies (7 apps) — click-interception + path-containment in practice | D3 + D5 (pattern derivation at D5 level) |
| S4 | Security + path-containment patterns + CVE review | D4 |

D6 synthesis is orchestrator-owned after S1-S4 findings land.

## Output contract (per worker)

Structured Markdown findings:

```md
# Findings — <Worker ID> <Dimension(s)>

## Summary
<2-3 sentence executive summary>

## Findings
### Finding: <declarative claim>
**Confidence:** CONFIRMED | INFERRED | UNCERTAIN | NOT FOUND
**Sources:** <URLs or repo:file:line>
<implication>

## Negative searches
- Searched <...> for <...> → <result>

## Gaps
<what couldn't be answered>
```

No file writes. Orchestrator authors evidence files from worker findings + primary sources.

## Coverage tracking (via tasks)

- [ ] D1 covered (Task #82 → S1 finding)
- [ ] D2 covered (S2)
- [ ] D3 covered (S3 + orchestrator synthesis)
- [ ] D4 covered (S4)
- [ ] D5 covered (S3 per-app tables)
- [ ] D6 covered (orchestrator synthesis)
