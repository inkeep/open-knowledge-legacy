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

### Follow-up candidates

**Parked as future work (not pursued in this run):**

- **macOS security-scoped bookmarks** — `securityScopedBookmarks` option on `showOpenDialog` for MAS-sandbox apps. Relevant for Mac App Store distribution. Moderate depth, single-facet. Status: parked.
- **`webRequest.onBeforeRequest`** — main-process HTTP intercept, an alternative to `will-navigate` for localhost asset requests specifically. Briefly noted in D3; no full treatment. Moderate depth. Status: parked.
- **Deep `webContents.on('context-menu')` patterns across OSS apps** — only lightly touched in D3/D5. Could deepen if right-click "Reveal in Finder" + "Open in default app" becomes OK's primary OS-integration UX (it's the universally-safe pattern per P4). Moderate depth, single-facet. Status: **parked (2026-04-23, explicit user direction)**. Reopen when OK commits to context-menu as the primary OS-integration surface — then do a focused 4-5 app read of Electron's `context-menu` event handler patterns (VSCode's contribution-based menu, Joplin's renderer-built menu, AFFiNE's React-side menu).

**Researched in 2026-04-23 Path C update:**

- Logseq `shell.openPath` call site — UNCERTAIN gap closed.
- Standard Notes URL scheme validation — UNCERTAIN gap closed.
- Obsidian `shell.openPath` limits (closed-source via forum + plugin source + docs) — new D10 dimension.
- User-activation forwarding across IPC — new D11 dimension.
- Linux XDG Desktop Portal APIs for sandboxed Electron (Flatpak/Snap) — new D12 dimension.

---

## 2026-04-23 — Path C update: close 2 gaps + add D10/D11/D12

**Trigger:** User direction post-initial-pass: "do path c research on the two confidence gaps? and do you want to do it on if obsedian puts any limits on what gets passed through as openPath?" followed by "do two path c subagents research for [user-gesture forwarding] + [Linux XDG portals] as well."

**Scope:** 5 focused questions, 5 subagents in parallel.

**Execution:** 5 concurrent general-purpose subagents:
- S5 — Logseq deep-dive (`shell.openPath` call site)
- S6 — Standard Notes scheme validation upstream
- S7 — Obsidian `shell.openPath` limits (closed-source forum + plugin + docs)
- S8 — User-activation forwarding across IPC
- S9 — Linux XDG Desktop Portal APIs

All 5 returned evidence within ~3 minutes. Orchestrator synthesized into evidence files + REPORT.md dimension additions.

### Findings closed + added

**S5 — Logseq `shell.openPath` (UNCERTAIN → CONFIRMED negative):** Logseq does NOT call `shell.openPath`. Uses the [`open`](https://www.npmjs.com/package/open) npm package (Sindre Sorhus), gated by a synchronous `electron.dialog.showMessageBoxSync` confirmation dialog in `open-default-app!` (`src/electron/electron/window.cljs:88-106`). Consent-before-open pattern — matches Joplin's safety posture but with per-click confirmation rather than per-extension. D5 Logseq entry updated in-place.

**S6 — Standard Notes allowlist (UNCERTAIN → CONFIRMED):** Standard Notes DOES validate. Strict deny-by-default `shouldOpenUrl = (url) => url.startsWith('http') || url.startsWith('mailto')` at `Window.ts:83`. Both `setWindowOpenHandler` (returns `{action: 'deny'}` baseline) and `will-navigate` (unconditional `preventDefault`) gate every `shell.openExternal` call through this predicate. `file:`, `javascript:`, `smb:`, custom schemes all silently dropped. **D5 entry had outdated line numbers** — corrected from 91/93/99/105 to 83/127/142.

**S7 — Obsidian `shell.openPath` limits (new D10):** Findings, with honest confidence labels:
- **No published extension blocklist** (CONFIRMED via Obsidian 1.12.2 changelog + 1.12.2 is Early Access 2026-02-18 — extremely recent).
- **A confirmation dialog for external-app opens was added in 1.12.2** (CONFIRMED existence, verbatim: "Opening files in an external application now shows a confirmation dialog for added safety"). **The gating model — per-click, per-file, per-extension, configurable, with-or-without checkbox — is NOT documented in the public changelog and was not confirmed via forum reports. UNVERIFIED.**
- **A separate warning for executable files** (CONFIRMED existence, verbatim: "Added a warning when attempting to open an executable file"). Reasonably INFERRED warn-not-block from wording; not behaviorally verified.
- Pre-1.12.2 was silent delegation (CONFIRMED via forum #83532: `.py`/`.c`/zip auto-unzip on macOS all silent).
- **No realpath-inside-vault check** documented (UNCERTAIN on absolute-path escape).
- **No CVE** targets `shell.openPath` directly. 2024 forum report of executable-silent-exec sat unfixed for ~20 months.
- **Plugins bypass the 1.12.2 safeguards** (CONFIRMED via community plugin source like `phibr0/obsidian-open-with`).

Corrects an error in `editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md` which originally claimed Obsidian shows a "blank/degraded preview pane" for opaque types. D9 updated in-place with the correction pointer.

**Calibration note (added after initial Path C write):** initial S7 output asserted "Every click, not Joplin-style first-click-only" — the orchestrator accepted this without verification. The user caught this during review. The claim is NOT supported by the changelog text (which says only "now shows a confirmation dialog"). D10 evidence file and REPORT.md D10 section were patched to replace the "every click" inference with honest UNVERIFIED labels. Lesson: "no forum report of a checkbox" is negative evidence, not proof of absence — should not be used to assert a positive claim about gating.

**S8 — Gesture forwarding across IPC (new D11):** Confirmed negative on Electron's side + confirmed negative on OSS adoption.
- Electron does NOT forward user activation across IPC. `IpcMainInvokeEvent` carries no `isTrusted` / `userActivation` / `hasTransientActivation` field.
- No OSS app surveyed (VSCode, AFFiNE, Zettlr, Logseq) implements token-based gesture forwarding. VSCode's `userGesture: boolean` IPC arg is a UX signal (accessibility sound), trust-the-renderer.
- App-level token schemes don't work against XSS (same JS context as click handler).
- **Containment IS the gesture forwarding in practice.** Accepted ecosystem threat model: "all IPC is renderer-initiated."
- No Electron RFC filed for exposing `senderFrame.hasTransientActivation()` on IPC events.

**S9 — Linux XDG portals (new D12):** Mapped portal surface → Electron equivalents. Electron's `showItemInFolder` already uses `FileManager1` D-Bus (PR #25087). `shell.openPath` / `openExternal` work via xdg-open with Flatpak-sandbox edge cases (file:// prefix required, `/var/data` paths). **OSS Flatpak-distributed editors opt out of portal sandboxing** via broad filesystem permissions (VSCode `--filesystem=host`, Obsidian `--filesystem=home`) rather than integrate portals directly. Linux is NOT-NOW work for macOS-primary roadmap.

### Report updates

- **REPORT.md frontmatter:** added `revisions` entry for 2026-04-23 Path C.
- **D5 summary table:** Logseq and Standard Notes rows updated with resolved findings.
- **D10, D11, D12 sections** added to Detailed Findings (between D5 and D6). Each links to its evidence file.
- **Limitations section:** 2 of 4 previous UNCERTAIN items marked CLOSED Path C 2026-04-23. 2 new open items noted (exact executable-extension list in Obsidian; Electron RFC status for gesture forwarding).
- **References:** D10/D11/D12 evidence files added.

### Validation (Path C update)

- [x] Updates are surgical (targeted edits, not wholesale rewrite)
- [x] Evidence files D5 (updated), D10/D11/D12 (new) cite primary sources with URLs + file:line where applicable
- [x] REPORT.md D5 summary + Limitations updated for in-place accuracy
- [x] Cross-finding consistency: D10 Obsidian correction aligns with editor-asset-embed D9 pointer. D11 gesture finding aligns with D4 security model's "containment is the defense."
- [x] Confidence labels applied consistently
- [x] Executive summary — not rewritten for this Path C since the core thesis (shell.openPath-on-click is minority pattern, containment is primary defense) STRENGTHENS with the new findings. Narrative-level updates deferred to a future comprehensive revision if one is warranted.

### Audit

Skipped for same rationale as initial pass — subagent outputs were independently produced and cross-referenced. Next audit trigger: if a consumer (OK implementation spec) disagrees with a specific Path C finding, scope a re-audit on that dimension.

### Remaining open after Path C

- Exact executable-extension list in Obsidian 1.12.2+ not published.
- Electron RFC for `senderFrame.hasTransientActivation()` on IPC events — not filed; concrete-work-if-motivated.
- Logseq's exact file:line for `window.apis.openPath` renderer call wasn't precisely pinned (GitHub code search rate-limited); confirmed the behavior via the main-process wrapper `open-default-app!`.
- Parked items (macOS security-scoped bookmarks, `webRequest.onBeforeRequest`, deep context-menu survey) remain as future work — documented in "Follow-up candidates" above.
