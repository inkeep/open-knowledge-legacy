# Evidence: Desktop Framework Landscape 2025/2026

**Dimension:** Framework Landscape
**Date:** 2026-04-11
**Sources:** Official framework docs, HN discussions, benchmark blog posts

---

## Key sources
- [Electron Releases](https://releases.electronjs.org/)
- [Tauri 2.0 Release](https://v2.tauri.app/blog/tauri-20/)
- [Hopp: Tauri vs Electron](https://www.gethopp.app/blog/tauri-vs-electron)
- [DoltHub: Electron vs Tauri Nov 2025](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
- [Wails v3 alpha](https://v3alpha.wails.io/)
- [WebKit for SwiftUI WWDC 2025](https://dev.to/arshtechpro/wwdc-2025-webkit-for-swiftui-2igc)
- [Pake GitHub](https://github.com/tw93/Pake)
- [9to5Mac: Electron Tahoe GPU bug](https://9to5mac.com/2025/11/21/mac-tahoe-electron-performance-bug/)

---

## Findings

### Electron still dominant (~1.66M weekly npm downloads vs Tauri ~85K)
**Confidence:** CONFIRMED

Electron 41 (current Apr 2026) ships Chromium 146, V8 14.6, Node 24.14. Six major versions in 2025. macOS 26 Tahoe launch triggered Electron×WindowServer GPU bug affecting Slack/Discord/VS Code (patched November 2025). Project entered "quiet period" December 2025 (standing policy). Structural complaints persist: full Chromium + Node per app, installers >100MB.

### Tauri v2 took share fast
**Confidence:** CONFIRMED

2.0 stable shipped October 2024. First full year 2025. YoY adoption +35%, repo activity +55%. 74K+ GitHub stars. Hoppscotch migration cut 165MB → 8MB, ~70% memory reduction. v2 added mobile support (iOS/Android), unified plugin system. Production users: 1Password, Cody AI, Spacedrive.

### Apple shipped first-class SwiftUI WebView at WWDC 2025
**Confidence:** CONFIRMED

New `WebView` + `WebPage` API shipped with iOS/macOS 26 (Fall 2025). Designed for the Observation framework. `WebPage` exposes async JS evaluation and observable state. For macOS-only wrapping, this is now the "right" native path — tiny binary, Apple-signed APIs, instant startup, deep OS integration. Tradeoff: zero cross-platform.

### Wails v3 still alpha; v2 production
**Confidence:** CONFIRMED

v3 in alpha as of April 2026. v2.12.0 shipped 2026-03-26 (still active). Best-in-class IPC DX (auto-generated TS bindings from Go). Build times dramatically faster than Tauri (~12s vs ~343s in one benchmark). No mobile story. Target: Go-first teams.

### Pake = Tauri-based website-to-app generator (not a framework)
**Confidence:** CONFIRMED

Rust CLI that wraps any URL into a Tauri-built desktop app with one command. ~5MB binaries. Ships prebuilt releases for popular sites. Relevance: shows you don't need to write Rust to get Tauri's benefits for pure-webview wrapping.

### Tauri's Linux WebKitGTK inconsistency is the #1 counter-argument
**Confidence:** CONFIRMED

Webview fragmentation across platforms (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux) means different bugs/features per OS. Linux WebKitGTK often 1-2 years behind. "Write once, debug three webviews."

---

## Framework Comparison Matrix (April 2026)

| Framework | Version | Stack | Bundle | Idle Memory | Mobile | Maturity |
|-----------|---------|-------|--------|-------------|--------|----------|
| Electron | 41 (Chromium 146) | JS + Chromium + Node | ~100MB+ | ~150-250MB | No | Dominant, stable |
| Tauri | 2.x | JS + Rust + OS webview | <10MB | ~30-40MB | Yes (v2) | Growing fast |
| Wails | v2.12 stable, v3 alpha | JS + Go + OS webview | ~8MB | Low | No | v2 stable |
| Pake | Rolling | Tauri-based generator | ~5MB | Low | No | Tool, not framework |
| Neutralinojs | Active | JS + C++ + OS browser | ~0.5-2MB | Very low | No | Niche |
| SwiftUI WebView | macOS/iOS 26 | Swift native | Tiny | Native | iOS | New (WWDC 2025) |
| RN macOS | Active fork | JS + AppKit | Moderate | Moderate | Separate | Microsoft-backed |
| Flutter desktop | 3.x | Dart + Skia/Impeller | ~20MB+ | Moderate | Yes | Maturing |
