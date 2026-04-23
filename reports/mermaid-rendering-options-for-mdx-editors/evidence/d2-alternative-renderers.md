# Evidence: D2 — Alternative Mermaid renderers

**Dimension:** D2 (alternative renderers — beautiful-mermaid, WASM forks, server-side, non-JS)
**Date:** 2026-04-21
**Sources:** npm registry, GitHub repos (where accessible), mermaid-js team discussions, crates.io
**Scope:** Renderers that are NOT the official `mermaid` package

---

## Key files / URLs referenced

### `beautiful-mermaid`
- [lukilabs/beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) — T1
- [lukilabs/beautiful-mermaid/package.json](https://github.com/lukilabs/beautiful-mermaid/blob/main/package.json) — T1
- [lukilabs/beautiful-mermaid/LICENSE](https://github.com/lukilabs/beautiful-mermaid/blob/main/LICENSE) — T1
- [npm: beautiful-mermaid](https://www.npmjs.com/package/beautiful-mermaid) — T1 (page returned 403 during research; secondary confirmation via repo)
- [Dependents graph](https://github.com/lukilabs/beautiful-mermaid/network/dependents) — T1

### WASM
- [mermaid-js Discussion #4789](https://github.com/orgs/mermaid-js/discussions/4789) — T1 (official team statement)
- [btucker/selkie](https://github.com/btucker/selkie) — T1 (Rust reimpl with WASM build)
- [oovm/mermaid-wasm](https://github.com/oovm/mermaid-wasm) — T1 (dormant)
- [mermaid-wasmbind on lib.rs](https://lib.rs/crates/mermaid-wasmbind) — T1

### Server-side
- [mermaid-js/mermaid-cli](https://github.com/mermaid-js/mermaid-cli) — T1
- [npm: @mermaid-js/mermaid-cli](https://www.npmjs.com/package/@mermaid-js/mermaid-cli) — T1
- [DeepWiki: mermaid-cli installation](https://deepwiki.com/mermaid-js/mermaid-cli/2-installation-and-usage) — T3
- [jihchi/mermaid.ink](https://github.com/jihchi/mermaid.ink) — T1
- [mermaid.ink landing](https://mermaid.ink/) — T1
- [yuzutech/kroki](https://github.com/yuzutech/kroki) — T1
- [Kroki landing](https://kroki.io/) — T1
- [Kroki install docs](https://docs.kroki.io/kroki/setup/install/) — T1
- [yuzutech/kroki-mermaid Docker Hub](https://hub.docker.com/r/yuzutech/kroki-mermaid) — T1
- [GitLab Kroki admin integration](https://docs.gitlab.com/administration/integration/kroki/) — T3

### Non-JS
- [1jehuang/mermaid-rs-renderer (mmdr)](https://github.com/1jehuang/mermaid-rs-renderer) — T1
- [crates.io: mermaid-rs-renderer](https://crates.io/crates/mermaid-rs-renderer) — T1
- [HN: Show HN mmdr](https://news.ycombinator.com/item?id=46885868) — T4 (existence signal only)
- [dreampuf/mermaid.go](https://github.com/dreampuf/mermaid.go) — T1
- [abhinav/goldmark-mermaid](https://github.com/abhinav/goldmark-mermaid) — T1
- [bierner/markdown-mermaid Marketplace](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid) — T1
- [mjbvz/vscode-markdown-mermaid](https://github.com/mjbvz/vscode-markdown-mermaid) — T1

---

## Findings

### D2.1 — `beautiful-mermaid`

> **Vendor-bias flag:** 3P product published under the `lukilabs` GitHub org (Craft Docs team, per `package.json` `author` field). README framing is self-promotional ("beautiful," "ultra-fast"). Claims from its own README flagged at claim level.

#### D2.1.a: Identity
**Confidence:** CONFIRMED
**Evidence:** [package.json](https://github.com/lukilabs/beautiful-mermaid/blob/main/package.json), [releases](https://github.com/lukilabs/beautiful-mermaid/releases)

- Package: `beautiful-mermaid`
- License: MIT
- Current: v1.1.3 on `main` branch (package.json), v1.1.2 latest tagged release (Feb 26, 2026)
- Repository: `github.com/lukilabs/beautiful-mermaid`
- Author: Craft Docs (via `lukilabs` org)
- Swift-native sibling at `lukilabs/beautiful-mermaid-swift` (separate repo)

#### D2.1.b: Activity signal
**Confidence:** CONFIRMED (GitHub metadata); CONFIRMED (monthly downloads, via npm registry downloads API — see D2.1.i)
**Evidence:** Repo metadata + npm registry downloads API

- GitHub stars: 8.8k, forks: 289
- 21 commits on main, 6 releases
- Latest release: Feb 26, 2026 (v1.1.2)
- WebFetch on the npm *package page* `https://www.npmjs.com/package/beautiful-mermaid` returned HTTP 403; however, the separate npm registry downloads API (`api.npmjs.org/downloads/point/last-month/beautiful-mermaid`, consumed by D5 measurement pass) returned the monthly-download figure — see D2.1.i below

#### D2.1.c: API surface (from README — vendor-authored)
**Confidence:** CONFIRMED (existence of exports); UNCERTAIN (robustness claims)
**Evidence:** README

Functions exposed:
- `renderMermaidSVG(text, options?)` — **synchronous** SVG rendering
- `renderMermaidSVGAsync(text, options?)` — Promise-based alternative (for server-side handlers)
- `renderMermaidASCII(text, options?)` — terminal Unicode/ASCII output
- `parseMermaid(text)` — parse to structured graph object
- `fromShikiTheme(theme)` — extract color palette from a Shiki theme definition

README claim: *"The library uses a 'FakeWorker bypass' to run the ELK.js layout engine synchronously."* (VENDOR). Robustness of the bypass is not independently documented.

#### D2.1.d: Diagram coverage — 6 types (vs mermaid's ~20+)
**Confidence:** CONFIRMED (per README); UNCERTAIN (fidelity claim)
**Evidence:** README

**Supported (6):** Flowcharts (TD/LR/BT/RL), State diagrams (v2 syntax), Sequence, Class, ER, XY Charts (bar/line/combined).

**NOT supported (vs official mermaid): Gantt, pie, mindmap, timeline, C4, sankey, git graph, journey, quadrant, block, packet, treemap, kanban, architecture, requirement, radar.**

README is explicit that this is **not a wrapper**: *"Beautiful-mermaid is an independent rendering library for Mermaid diagrams, created by the Craft team. It's not a fork or wrapper of the official Mermaid package, but rather a reimplementation designed for aesthetic output and performance."*

#### D2.1.e: Runtime dependencies — minimal
**Confidence:** CONFIRMED
**Evidence:** [package.json](https://github.com/lukilabs/beautiful-mermaid/blob/main/package.json)

- `elkjs@^0.11.0` — layout engine
- `entities@^7.0.1` — HTML entity encoding
- Zero peer deps
- No `mermaid` dependency

#### D2.1.f: Theming — CSS variables with 15 built-in themes
**Confidence:** CONFIRMED (per README)
**Evidence:** README (VENDOR-authored)

Built-in themes: Tokyo Night, Catppuccin, Dracula, GitHub, Solarized, Nord, One Dark, others (15 total).
Two-color foundation (`bg`, `fg`) derives the rest via CSS `color-mix()`. Claimed feature: "live theme switching without re-renders." (VENDOR)
Shiki VS Code theme compatibility via `fromShikiTheme()`.

#### D2.1.g: Bundle size — local measurement + bundlephobia
**Confidence:** CONFIRMED (both sources agree on methodology; numbers differ because of elkjs inclusion)
**Evidence:** npm tarball unpack, bundlephobia.com/api/size

- **dist/index.js**: 335,537 bytes raw, **68,629 bytes gzipped** (measured locally from tarball)
- **dist/ total**: 1.1 MB
- **Tarball unpacked size**: 2,098,676 bytes
- **bundlephobia**: 1,619,941 B min / **482,271 B gzip** — includes `elkjs` lazy-load target
- **Gap explanation**: dist doesn't bundle elkjs (lazy-imported); bundlephobia aggregates including elkjs

#### D2.1.h: Error handling — not documented in README
**Confidence:** NOT FOUND (negative evidence)
**Evidence:** README skim

No documentation for error-handling semantics of `renderMermaidSVG` (throw / swallow / null return). Not derived from source in this research pass.

#### D2.1.i: Production usage
**Confidence:** MEDIUM (counts trustworthy; specific attributions noisy); CONFIRMED (monthly-download figure, via npm registry downloads API)
**Evidence:** [dependents graph](https://github.com/lukilabs/beautiful-mermaid/network/dependents), npm registry downloads API (`api.npmjs.org/downloads/point/last-month/<pkg>`)

- 102 repositories depend (dependents graph)
- 63 packages depend
- Notable consumers surfaced: `eslint-react` (532 stars), `opencow` (375 stars). `react-pdf` entry is suspicious (predates beautiful-mermaid by years) — GitHub dependents-graph attribution is noisy
- **Monthly npm downloads: 748,069** (vs mermaid's 24,722,045 — ~3% of mermaid's volume). Figure captured via npm registry downloads API during D5 bundle-measurement pass (the separate `npmjs.com/package/...` HTML page returned HTTP 403 in Agent B's D2 pass — see D2.1.b; the API endpoint is not subject to the same block)

#### D2.1.j: ASCII rendering provenance
**Confidence:** CONFIRMED
**Evidence:** README (VENDOR-authored attribution)

ASCII engine derives from *"Alexander Grooff's `mermaid-ascii` project (Go original, ported to TypeScript and extended with sequence, class, and ER diagram support, plus Unicode characters and configurable spacing)."*

---

### D2.2 — WASM builds / forks

#### D2.2.a: Official mermaid-js position — WASM not feasible
**Confidence:** CONFIRMED
**Evidence:** [mermaid-js Discussion #4789](https://github.com/orgs/mermaid-js/discussions/4789)

Maintainer statement: *"Unfortunately, Mermaid not only requires a DOM, but it also requires a layout engine, which currently, only browser engines support."*

Stated blockers: DOM dependency, layout engine requirements, heavy async/await usage, missing globals (`console`, `document`) in non-browser environments. **No official WASM fork exists.**

#### D2.2.b: `selkie` — Rust reimpl with WASM output (not a WASM compile of mermaid-js)
**Confidence:** CONFIRMED (existence + build); UNCERTAIN (fidelity claims)
**Evidence:** [btucker/selkie](https://github.com/btucker/selkie)

- Rust reimplementation; WASM built via `wasm-pack build --target web --features wasm`
- WASM entrypoint mirrors mermaid-js API (`initialize`, `parse`, `render`) plus `render_text` wrapper
- Latest: v0.3.0 (Feb 7, 2026). Stars: 20. Forks: 3. License: MIT. Language: Rust 96.8%
- Not published to npm (Cargo + standalone WASM bundle)
- Diagram-type coverage claim is **self-contradictory in the primary source**: README header reads *"Selkie supports 20 diagram types"* but the enumerated list beneath it contains **22 items** (flowchart, sequence, class, state, ER, Gantt, pie, architecture, git graph, requirement, quadrant, mindmap, timeline, Sankey, XY chart, C4, journey, radar, block, packet, treemap, kanban). Actual supported count is UNVERIFIABLE without running the renderer against each type; README self-report is unreliable. Fidelity to official mermaid output also not independently verified
- README self-report: *"CLI rendering is 200-250× faster than mermaid-cli, and browser rendering via WebAssembly is 10-20× faster than Mermaid.js"* — unverified
- README: *"built entirely with coding agents and includes an evaluation system comparing output against reference Mermaid.js"* — treat as experimental

#### D2.2.c: `oovm/mermaid-wasm` — abandoned/early-stage
**Confidence:** CONFIRMED (abandonment)
**Evidence:** [oovm/mermaid-wasm](https://github.com/oovm/mermaid-wasm)

- Rust/Yew wrapper that binds to mermaid.js from Rust/WASM context — **does NOT render mermaid in WASM natively**
- 2 commits, 0 releases. Outstanding TODO: *"Fix the problem that the entire wasm vm crashes when rendering errors."*
- Stars: 3. Forks: 2. License: MPL-2.0

#### D2.2.d: `mermaid-wasmbind` — mislabeled KaTeX crate
**Confidence:** CONFIRMED (not usable for mermaid)
**Evidence:** [lib.rs/crates/mermaid-wasmbind](https://lib.rs/crates/mermaid-wasmbind)

Despite the crate name, README content and example code are for KaTeX (LaTeX rendering), NOT mermaid. Latest 0.1.0 Oct 28, 2020 (6 years dormant). Not a usable mermaid renderer.

---

### D2.3 — Server-side rendering

#### D2.3.a: `@mermaid-js/mermaid-cli` (mmdc) — official, headless Chrome
**Confidence:** CONFIRMED
**Evidence:** [mermaid-js/mermaid-cli](https://github.com/mermaid-js/mermaid-cli), [DeepWiki](https://deepwiki.com/mermaid-js/mermaid-cli/2-installation-and-usage)

- Official mermaid-js org-owned package
- Latest: 11.12.0 (Sep 25, 2025). Stars: 4.4k. Forks: 368. License: MIT
- Mechanism: headless Chromium via Puppeteer; input `.mmd` file, emits SVG/PNG/PDF
- Main executable: `mmdc`
- **Puppeteer as peer dep at `^23` — must be installed manually.** Rationale per maintainers (issue #830): *"give users control over browser binaries and installation locations."*
- Node.js only; no browser-runtime path
- Docker image available (community: `matthewfeickert/mermaid-cli`)
- API: command-line (`mmdc -i input.mmd -o output.svg`) + Node.js programmatic API
- Output: SVG, PNG, PDF
- Documented limitations from README "Known Issues" section: Linux sandbox problems, Docker permission challenges, Chromium integration complexity
- Install footprint (Puppeteer-bundled Chromium) historically ~170 MB; v23 peer dep not verified in this pass

#### D2.3.b: `mermaid.ink` — hosted + self-hostable service
**Confidence:** CONFIRMED
**Evidence:** [jihchi/mermaid.ink](https://github.com/jihchi/mermaid.ink), [mermaid.ink landing](https://mermaid.ink/)

- Open-source service generating image URLs from mermaid code
- Implementation: Node.js + Puppeteer + headless Chrome
- License: MIT. Stars: 235. Forks: 54. Latest: v15.0.0 (Dec 31, 2025)
- Endpoints:
  - `/img/<encoded>` → image (JPEG default; also PNG, WebP)
  - `/svg/<encoded>` → SVG
  - `/pdf/<encoded>` → PDF (with `paper=` size, optional `landscape`)
- Query params: `width`, `height`, `scale` (1-3), `bgColor=`, theme (`default`/`neutral`/`dark`/`forest`)
- **Self-hostable:** Docker `ghcr.io/jihchi/mermaid.ink`. Local: `pnpm install && DEBUG=app:* pnpm start` on port 3000
- Configuration: `MAX_WIDTH`/`MAX_HEIGHT` (default 10000px), optional PostgreSQL caching, headless browser settings, concurrency limit
- **Privacy/rate-limit/ToS: NOT documented on landing or README.** Consumers sending proprietary diagrams to hosted service have no stated retention guarantee.
- Mermaid version bundled: Pinned to `jihchi/mermaid.ink` release tag's `package.json`; not captured this pass

#### D2.3.c: Kroki — multi-diagram service gateway (NOT mermaid-only)
**Confidence:** CONFIRMED
**Evidence:** [yuzutech/kroki](https://github.com/yuzutech/kroki), [Kroki landing](https://kroki.io/), [install docs](https://docs.kroki.io/kroki/setup/install/)

- Unified API over 25+ diagram languages (Mermaid among them, alongside BlockDiag, BPMN, Bytefield, C4, D2, DBML, Diagrams.net, Ditaa, Erd, Excalidraw, GoAT, GraphViz, Nomnoml, Pikchr, PlantUML, SvgBob, Symbolator, UMLet, Vega, Vega-Lite, WaveDrom, WireViz)
- Maintainer: Yuzu Technologies. License: MIT. Stars: 4.1k
- Latest: v0.30.1 (Mar 2, 2026)
- **Mermaid NOT bundled in core gateway image.** Self-hosters must also run companion container `yuzutech/kroki-mermaid` and point via `KROKI_MERMAID_HOST`
- API (3 modes):
  1. `GET /{diagram_type}/{output_format}/{encoded}` — deflate+base64-encoded into URL path
  2. `POST /` with JSON `{diagram_source, diagram_type, output_format}`
  3. `POST /{diagram_type}/{output_format}` with plain text body
- Self-hostable via Docker Compose (gateway + companion images)
- Hosted service: free; docs state "Free & Open source" and project seeks sponsors
- Rate limits / privacy: **NOT stated on landing page**
- Output formats: PNG, SVG, JPEG, PDF, TXT, base64 (varies by diagram type)
- Mermaid version bundled: pinned by `kroki-mermaid` companion image tag
- First-class GitLab integration documented at [GitLab Kroki admin docs](https://docs.gitlab.com/administration/integration/kroki/)

---

### D2.4 — Non-JS renderers

#### D2.4.a: `mermaid-rs-renderer` (mmdr) — native Rust
**Confidence:** CONFIRMED (existence, metadata); UNCERTAIN (performance + fidelity)
**Evidence:** [1jehuang/mermaid-rs-renderer](https://github.com/1jehuang/mermaid-rs-renderer), [crates.io](https://crates.io/crates/mermaid-rs-renderer), [HN thread](https://news.ycombinator.com/item?id=46885868)

- Parses Mermaid natively in Rust, renders directly to SVG
- PNG output via `resvg`
- **No browser / Node.js / Puppeteer dependency**
- Latest: v0.2.1 (Mar 8, 2026). 367 commits. Stars: 1.2k. Forks: 42. License: MIT
- Language composition: Rust 78.9%, Python 17.3%, Mermaid 2.3%
- Claimed 23 diagram types (README self-report; fidelity not independently verified)
- Performance claim (README, UNVERIFIED): *"100-1400× faster than mermaid-cli, specific claim of flowchart rendering at 4.49 ms vs. 1,971 ms (439× speedup)"*
- Distribution: crates.io, Homebrew, Scoop, AUR. **Not published to npm. No WASM build.**

#### D2.4.b: `dreampuf/mermaid.go` — NOT native Go
**Confidence:** CONFIRMED (not pure Go)
**Evidence:** [github.com/dreampuf/mermaid.go](https://github.com/dreampuf/mermaid.go)

- Uses `chromedp` to run headless Chrome/Chromium
- Embeds `mermaid.min.js` loaded into browser context at init
- **Not pure Go — uses headless browser**
- Latest: v0.2.0 (Apr 7, 2026). Stars: 19. Forks: 4. License: MIT
- API: `NewRenderEngine()`, `Render()` (SVG), `RenderAsPng()`, `RenderAsScaledPng()`, `Cancel()`

#### D2.4.c: `abhinav/goldmark-mermaid` — Goldmark extension (not a renderer itself)
**Confidence:** CONFIRMED
**Evidence:** [abhinav/goldmark-mermaid](https://github.com/abhinav/goldmark-mermaid)

- Two server-side modes: (a) CLI-based (invokes `mmdc`), (b) CDP-based (drives headless browser directly)
- **Not a native Go renderer** — delegates

#### D2.4.d: VS Code Markdown Preview — uses official mermaid
**Confidence:** CONFIRMED
**Evidence:** [bierner.markdown-mermaid Marketplace](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid), [mjbvz/vscode-markdown-mermaid](https://github.com/mjbvz/vscode-markdown-mermaid)

`bierner.markdown-mermaid` extension (by Matt Bierner / `mjbvz`, VS Code / GitHub staff):
- Installs: ~4.5M
- Stars: 911. Forks: 183. License: MIT
- **Bundles mermaid v11.12.0 — NOT a custom renderer**
- Hooks into VS Code markdown preview extensibility point

**Therefore:** VS Code's Mermaid preview is the official `mermaid` package, not an alternative renderer.

#### D2.4.e: Academic/research — negative finding
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searches: *"mermaid rust renderer"*, *"mermaid go renderer"*, crates.io `mermaid` keyword, Rust-HN-surfaced projects

No peer-reviewed or lab-affiliated Mermaid renderer surfaced.

---

## Negative searches (documented)

- **WASM ports of mermaid-js codebase itself**: searched npm (`mermaid-wasm`, `@mermaid-js/mermaid-wasm`, `mermaid-webassembly`), GitHub forks, mermaid-js official discussions → zero found. Mermaid-js team position: not feasible.
- **Academic/research Mermaid renderers**: crates.io keyword search, Rust HN surfacing → zero.
- **npm registry HTML pages for beautiful-mermaid, mermaid-cli, mermaid.ink, kroki**: WebFetch returned HTTP 403 during Agent B's D2 pass on the `npmjs.com/package/...` HTML pages. The separate `api.npmjs.org/downloads/...` endpoint (used by Agent D's D5 pass) is not subject to the same block — `beautiful-mermaid` (748K/mo) and `mermaid` (24.7M/mo) monthly-download figures WERE captured there and are cited in D2.1.i + D5.4. Monthly-download figures for `@mermaid-js/mermaid-cli`, `mermaid.ink`, `kroki` were NOT captured in either pass.
- **Error-handling semantics for `beautiful-mermaid.renderMermaidSVG`**: not in README; source not read in this pass.
- **Mermaid version pinned inside `mermaid.ink` and `kroki-mermaid`**: requires per-release `package.json` / Dockerfile read; not captured.

---

## Gaps / follow-ups

- Fidelity attestation for `selkie` (Rust/WASM) and `mmdr` diagram-type coverage — both report wide type coverage but are self-attested; no independent benchmarks located.
- Install-size of `@mermaid-js/mermaid-cli` with Puppeteer@23 peer dep — historically ~170 MB but v23-specific figure not verified.
- GitHub dependents-graph noise for `beautiful-mermaid` (suspect `react-pdf` entry) — per-repo verification not performed.
- Other commercial hosted services (e.g., MermaidChart.com by mermaid-js core maintainers) not investigated in depth.

---

## Vendor-bias flags applied

- **`beautiful-mermaid`**: Craft Docs (`lukilabs`) is a 3P product team with GTM interests. README claims about performance, aesthetic, "zero-flash rendering" flagged as vendor-authored.
- **Kroki**: Yuzu Technologies maintains the service; landing page claims and integration signals are vendor-authored.
- **mermaid.ink**: Individual-maintained but self-promotional on landing.
- **mermaid-cli**: First-party (mermaid-js org) — not 3P vendor-biased.
