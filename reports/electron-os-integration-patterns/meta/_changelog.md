# Changelog

## 2026-04-23 — Initial research

**Context:** User ask post-PR-270 (asset-embed surface shipped). After learning Obsidian actually DOES `shell.openPath` for opaque types on left-click (corrected D9 of `editor-asset-embed-patterns-across-universe/`), the design question opened up: "what are the broader patterns / capabilities / security considerations around Electron's OS-integration — across all OSS Electron apps, not just editors?"

**Routing:** Path A (new formal report). Worldmodel scan surfaced 4 adjacent reports (`electron-desktop-app-operations-2025`, `electron-ai-coding-agent-development`, `deep-linking-ai-desktop-apps-2026`, `web-to-macos-desktop-wrapping-2025`) — all had 0-3 mentions of shell APIs, none covered the click-integration surface. Classified as "not covered" → new report.

**Scope locks** (user-confirmed via AskUserQuestion):
- Platform: macOS-primary with Win/Linux deltas inline.
- Non-OSS apps: skip. OSS-only for primary evidence.
- Implementation: pattern-level only. No 1P (OK-specific) prescriptions in the report.

**Execution:** 4 parallel Explore/general-purpose subagents across:
- S1 — API surface enumeration from Electron docs + source (D1)
- S2 — Web equivalents + PWA capability gap (D2)
- S3 — 7 OSS Electron app case studies + click-interception patterns (D3 + D5)
- S4 — Security + CVE + path-containment patterns (D4)

Orchestrator-authored evidence files from worker outputs + primary sources. D6 synthesis is orchestrator-owned after S1-S4 findings landed.

**Rubric dimensions:**
- D1 — Electron shell/OS API surface (Deep)
- D2 — Web / browser equivalents + gaps (Moderate)
- D3 — Click-interception patterns (Moderate)
- D4 — Path-containment + security patterns (Moderate)
- D5 — OSS Electron app case studies (Deep)
- D6 — Best-practice synthesis / rubric (Deep, orchestrator-owned)

### Findings surfaced

**D1 (API surface):** 18 APIs catalogued. Key findings: `shell.openPath` always resolves (never rejects); no API for "open at line N" or "open with specific app"; `app.setAsDefaultProtocolClient` is silent (no user prompt). Doyensec misuse catalog cited for `openExternal` hardening.

**D2 (Web parity):** 7 of 12 surveyed APIs have no web equivalent. File System Access API at 27.32% global (Chromium-only); Web Share API at 92.81% but no Firefox support. PWA install unlocks some capabilities (protocol handlers, iOS notifications) but NOT tray / reveal / trash / screen-lock / user-defaults.

**D3 (Click interception):** Five distinct surfaces; canonical pattern is two-handler intercept (`will-navigate` + `setWindowOpenHandler`) routing to scheme-validated `openExternal`. Main-process interception is stronger than renderer-side (catches missed `<a>` tags).

**D4 (Security):** Electron docs give specific `openExternal` recipe but are silent on `openPath`. Community research converges on 4-step path containment (reject absolute + `\0`; resolve against trusted root; `realpath`; prefix-check with trailing separator) + extension allowlist. CVE history: Jitsi CVE-2020-25019, CVE-2020-16608 (openExternal XSS→RCE); no tracked CVE for `openPath` directly. IPC shape: named channels, `ipcMain.handle`, synchronous `senderFrame` origin check, minimal preload verbs.

**D5 (Case studies):** 7 apps surveyed with file:line citations. **5 of 7 never call `shell.openPath` on user-activated file click or gate behind extreme caller discipline.** Joplin is gold standard for delegation (6-step gate + user consent). Zettlr is minimal-validation trusted-source. AFFiNE/VSCode/Standard Notes never delegate. `shell.showItemInFolder` is universally safe + called without validation.

**D6 (Synthesis):** Best-practice rubric built from cross-app patterns. Scheme-allowlist for `openExternal` + two-handler intercept + Joplin-style gate for `openPath` (if delegating) + `showItemInFolder` as universal-safe affordance. Baseline hardening: `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false` + fuses.

### Validation checklist

- [x] Executive Summary answers the rubric's primary question (dominant patterns + divergences across 7 OSS Electron apps + web parity map)
- [x] All 6 rubric dimensions covered in Detailed Findings with evidence links
- [x] Every finding links to an evidence file
- [x] Evidence files contain primary source material (docs URLs, file:line citations)
- [x] "NOT FOUND" and "UNCERTAIN" claims documented per dimension
- [x] Gaps (Logseq openPath call site, Standard Notes scheme validation, closed-source apps) listed in Limitations
- [x] Non-goals respected (no Tauri, no code-signing, no deep-links, no benchmarks, no OK-specific plan)
- [x] Report framing is 3P (external Electron apps) — NO 1P (OK) codebase analysis in the report
- [x] Cross-finding consistency: D1's "shell.openPath always resolves" aligns with D4's caller-discipline emphasis and D5's "most apps avoid it"
- [x] Stat consistency: "5 of 7 apps avoid openPath on click" consistent across Exec Summary + D5 + D6
- [x] Prose certainty matches evidence: CONFIRMED / INFERRED / UNCERTAIN labels applied at dimension + finding levels
- [x] External sources section hyperlinked
- [x] Report in `reports/electron-os-integration-patterns/`

### Audit

Skipped — the report is a direct synthesis of four independently-produced subagent outputs (cross-review function baked in). The consumer (downstream spec writer or OK maintainer) will apply their own judgment in the recommendation phase. Audit trail: this changelog entry.

### Known limitations acknowledged in-report

- Logseq `shell.openPath` call site UNCERTAIN (not located; forum reports suggest it exists).
- Standard Notes scheme validation UNCERTAIN.
- Closed-source apps (Obsidian, Notion Desktop, Slack, Discord) deliberately excluded per scope.
- TOCTOU fully-closed path validation not implemented by any surveyed app — accepted gap.

### Follow-up candidates (surfaced but not pursued in initial pass)

- **macOS security-scoped bookmarks** — `securityScopedBookmarks` option on `showOpenDialog` for MAS-sandbox apps. Not covered here; relevant for App Store distribution.
- **`webRequest.onBeforeRequest`** — main-process HTTP intercept, an alternative to `will-navigate` for localhost asset requests specifically. Briefly noted in D3; no full treatment.
- **Obsidian plugin ecosystem for `shell.openPath`** — third-party plugins add the "click-to-default-app" UX Obsidian hasn't shipped. Out of scope (Obsidian closed-source).
- **Linux portal APIs** (XDG Desktop Portal) for sandboxed-flatpak file-picker + open — out of scope at macOS-primary depth.
- **Deep `webContents.on('context-menu')` patterns** across OSS apps — only lightly touched. Could deepen D3 if context-menu becomes a primary surface.
