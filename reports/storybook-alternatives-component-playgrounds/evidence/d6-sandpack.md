# Evidence: D6 — Sandpack

**Dimension:** Sandpack (codesandbox/sandpack) — in-browser bundling, React rendering substrate, composability
**Date:** 2026-04-14
**Sources:** https://sandpack.codesandbox.io/docs, https://sandpack.codesandbox.io/docs/advanced-usage/components, https://codesandbox.io/blog/announcing-sandpack-2, https://api.github.com/repos/codesandbox/sandpack, https://api.npmjs.org/downloads/point/last-month/@codesandbox/sandpack-react

---

## Key files / pages referenced
- https://sandpack.codesandbox.io/docs — Core architecture, SandpackProvider
- https://sandpack.codesandbox.io/docs/advanced-usage/components — SandpackLayout, SandpackCodeEditor, SandpackPreview
- https://codesandbox.io/blog/announcing-sandpack-2 — Nodebox / two-runtime architecture
- https://sandpack.codesandbox.io/docs/advanced-usage/nodebox — Nodebox details
- GitHub API: 6,101 stars, last pushed 2025-04-24

---

## Findings

### Finding: Sandpack has two distinct bundler runtimes — SandpackRuntime (browser, React/Vue/etc.) and SandpackNode (Nodebox, Node.js frameworks)
**Confidence:** CONFIRMED
**Evidence:** https://codesandbox.io/blog/announcing-sandpack-2

```text
SandpackRuntime: "mounts the bundler used on codesandbox.io and runs runtime JavaScript frameworks 
  in-browser." Target: React, Vue, Angular, Svelte, etc.
SandpackNode: "mounts a Nodebox instance, which is designed to execute Node.js frameworks 
  and applications." Target: Next.js, Vite, Astro, Express.
SandpackStatic: "simple service worker for static templates, vanilla sandboxes."
Nodebox: "implements its own abstraction of Node.js in-browser, no SharedArrayBuffer required 
  for cross-browser support, no install/setup step."
Sandpack transpiler "completely rewritten in Rust, with Vite template hot-start at 500ms."
```

**Implications:** Sandpack is the only tool surveyed that can run a full Next.js or Vite dev server in-browser. For a component block preview use case (not requiring a Node.js server), SandpackRuntime is the relevant mode.

---

### Finding: Sandpack's files prop injects virtual filesystem entries; customSetup.dependencies installs npm packages from CDN
**Confidence:** CONFIRMED
**Evidence:** https://sandpack.codesandbox.io/docs (advanced provider section) + search results

```text
files prop: object where keys are file paths, values are file content strings or objects.
  Object form: { code: string, readOnly?: boolean, active?: boolean, hidden?: boolean }
  String form: shorthand for { code: string }
customSetup.dependencies: object mapping package name to version (npm package.json format).
  Packages are fetched from Sandpack CDN (Rust-based package manager, can be self-hosted).
Example: 
  customSetup={{ dependencies: { "react-markdown": "latest" } }}
  files={{ "/App.js": `import ReactMarkdown from 'react-markdown' ...` }}
```

**Implications:** Custom component injection requires either (a) injecting component source code as a virtual file or (b) publishing the component to npm and using customSetup.dependencies. Neither option allows for pre-bundled local components without a publish step. This is the most significant limitation for in-editor use cases with locally-defined components.

---

### Finding: Sandpack's React API is composable — SandpackProvider + individual components + hooks
**Confidence:** CONFIRMED
**Evidence:** https://sandpack.codesandbox.io/docs/advanced-usage/components

```text
SandpackLayout: responsive two-column layout (breaks <700px). Applies theming.
SandpackCodeEditor: wraps CodeMirror; configurable line numbers, tabs, inline errors, extensions.
SandpackPreview: runs the bundler, executes code. Multiple previews can share one Provider.
SandpackFileExplorer: folder/file navigation.
SandpackTests: run Jest tests in-browser.
SandpackConsole: console output display.
SandpackCodeViewer: read-only code display.
OpenInCodeSandboxButton: export edits to codesandbox.io.
All components communicate through context; useSandpack hook for custom components.
```

**Implications:** Sandpack is the most composable of the tools surveyed. The headless provider + component model means it can be embedded in any React application as a component preview substrate. The CodeMirror-based editor supports extensions, including custom language modes.

---

### Finding: Sandpack dependencies are resolved via Sandpack's own CDN — requires internet access, no offline mode by default
**Confidence:** CONFIRMED
**Evidence:** https://codesandbox.io/blog/announcing-sandpack-2 + FAQ

```text
"Sandpack will try to fetch all dependencies from public registries."
CDN: "open-source Rust package manager that runs in the cloud and can be self-hosted."
Self-hosted bundler documented at: https://sandpack.codesandbox.io/docs/guides/hosting-the-bundler
Nodebox "uses internal dependency manager fine-tuned for initial load time with caching via Sandpack CDN."
```

**Implications:** Online dependency resolution is a requirement for the default Sandpack setup. Self-hosting the bundler is possible but requires operational infrastructure. This is a significant consideration for embedded use cases requiring offline-capable or air-gapped deployments.

---

### Finding: Sandpack maintenance status — last release v2.20.0 Feb 2025, last push Apr 2025, 6,101 stars
**Confidence:** CONFIRMED
**Evidence:** GitHub API + npm registry

```text
GitHub: 6,101 stars, 471 forks, last pushed 2025-04-24, 152 open issues
Latest release: v2.20.0, 2025-02-14 (React 19 support)
Monthly downloads @codesandbox/sandpack-react (Mar 15–Apr 13 2026): 2,753,343
Highest monthly download count among all tools surveyed.
```

**Implications:** Despite last push being a year ago (Apr 2025), the 2.75M/month download count indicates heavy production use. The 152 open issues and inactivity since Apr 2025 are caution signals — CodeSandbox may have shifted priorities internally. Note: vendor bias possible — these download numbers include CodeSandbox's own documentation site usage.

---

## Negative searches
- Searched: Sandpack offline mode without CDN → available via self-hosted bundler only
- Searched: Sandpack prop controls panel → NOT FOUND (Sandpack is a code execution substrate, not a component explorer)

---

## Gaps / follow-ups
- Whether the Apr 2025 maintenance stall reflects project stability vs deprioritization — CodeSandbox as a company has shifted toward AI coding products
- Self-hosted bundler operational complexity for embedded use cases
