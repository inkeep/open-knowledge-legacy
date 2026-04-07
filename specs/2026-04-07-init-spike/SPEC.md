# SPEC: Open Knowledge Foundation — Bootstrap the Core Editor + CRDT + Persistence Stack

**Status:** Final
**Created:** 2026-04-07
**Baseline commit:** (no commits — new repo)
**Implementer:** AI coding agent (Claude Code)
**Location:** `init_spike/` within the open-knowledge repo
**Nature:** Foundational bootstrapping. This is the first real code in the project — the editor, CRDT sync, persistence pipeline, and source toggle that everything else builds on. Write it like production code: clean architecture, proper error handling, well-structured modules. The 7 validations are end-to-end integration tests that prove the foundation works. If something doesn't work, document it precisely — that's the most valuable output.

**Pace:** There is no time pressure. Take as long as needed. The goal is thoroughness and quality, not speed. Every validation should be done methodically and completely — understand what you're building before you build it, read the research reports when you hit uncertainty, and don't move to the next validation until the current one is solid. Skimping on any validation defeats the purpose of this work.

---

## 1. Problem Statement (SCR)

**Situation:** The Open Knowledge project has made 15+ architectural decisions based on research reports: TipTap + y-prosemirror, Hocuspocus embedded in Vite, Yjs CRDT with DirectConnection for agent writes, void nodes for JSX components, git auto-persistence pipeline. Every story (S1, S2, S4, S5, S6) depends on these holding together.

**Complication:** The decisions are grounded in individual research, but no single prototype has validated them working together. Six assumptions are load-bearing and interconnected. A seventh assumption — that Yjs v14's unified YType enables native dual-view editing — emerged during research and could fundamentally improve the architecture. If any of these fail, it changes the product direction, not just implementation details.

**Resolution:** Bootstrap the project by building the foundational stack — editor, CRDT sync, persistence pipeline, source toggle — and validate 7 load-bearing architectural assumptions end-to-end. This is the first real code. Write it to last. Where something doesn't work, document precisely what broke and why — that's the most valuable output.

---

## 2. Success Criteria

All 7 validations produce a clear PASS or FAIL with documented evidence. For FAILs: document exactly what broke, why, and what alternative approaches exist. A foundation where 5 validations pass and 2 fail with clear documentation is more valuable than one where 7 "sort of work" with unclear results.

### End-to-End Validation Principle

**Every validation must be tested "for real" — against real files, with real editors, using real browser sessions, and using the AI coding agent itself (Claude Code) as the agent writer.** No mock unit tests. No simulated environments. The foundation IS the integration test.

Specifically:
- **Real markdown files on disk** — the test fixture is a `.md` file that exists on the filesystem, not an in-memory string
- **Real browser sessions** — TipTap and CodeMirror run in actual browser tabs, not jsdom/happy-dom
- **Real WebSocket connections** — Hocuspocus sync over actual WebSocket, not mocked transports
- **Real AI agent writes** — for V3, use Claude Code itself (via DirectConnection or a script invoked from the terminal) to write to the Y.Doc. The implementer IS the agent — use `claude code` to trigger writes and watch them appear in the browser editor
- **Real git operations** — for V5, actual `git` commands creating real commits on real refs, verifiable with `git log`
- **Real file watching** — for V4b, actual @parcel/watcher detecting actual filesystem changes
- **Multi-tab testing** — open two real browser tabs to verify collaboration, not programmatic simulation
- **Real round-trip verification** — diff the actual `.md` file before and after the round-trip using `diff` or a file comparison, not assertion-based checks on in-memory strings

The validation procedure for each V# describes the manual steps to execute. Results are observed visually in the browser and verified by inspecting files on disk and git state. Screenshots and terminal output are valid evidence.

---

## 3. What to Validate

### V7: Yjs v14 Delta Protocol — Can y-prosemirror bind to a flat YType?

**Hypothesis:** Yjs v14 refactored to a unified `YType<DeltaConf>` class. y-prosemirror v14 operates through a generic delta protocol (`toDeltaDeep()`, `applyDelta()`, `observeDeep()`). If this protocol works with a text-configured YType (not just XmlFragment-configured), both ProseMirror and CodeMirror can bind to the same CRDT — dissolving the source toggle problem entirely.

**Availability (verified 2026-04-07):** Yjs v14 IS available on npm as pre-release: `yjs@14.0.0-8` (next tag), `yjs@14.0.0-16` (beta tag). Stable latest remains 13.6.30. y-prosemirror v14-compatible version is `y-prosemirror@2.0.0-2` (pre-release). `@tiptap/y-tiptap` v3.0.2 likely pins `yjs@^13` — may refuse to install alongside v14. Hocuspocus v3.4.x likely also pins `yjs@^13`.

**Approach:** Work through this methodically. The most likely failure mode is ecosystem packaging conflicts (npm peer dependency errors), not architectural incompatibility. If you hit packaging issues, work through them thoroughly — try npm overrides, `--legacy-peer-deps`, isolated subdirectories, or using y-prosemirror directly (bypassing @tiptap/y-tiptap). If a clean path doesn't exist, that's a genuine finding worth documenting in detail.

**Procedure:**
1. Run `npm install yjs@next y-prosemirror@2` in the `v7-test/` subdirectory (isolated from the main project). Document what happens — clean install, peer dep warnings, or hard failures.
2. If install succeeds: attempt to bind y-prosemirror v14's sync plugin to a YType. Does it initialize?
3. If binding works: type formatted text, verify CRDT ops. Bind y-codemirror.next to the same YType. Test cross-editor sync.
4. If dual binding works: test with TipTap (may require bypassing @tiptap/extension-collaboration and using y-prosemirror directly with npm overrides).
5. If at any point you hit a wall that isn't a packaging issue but a genuine architectural limitation (the delta protocol requires recursive deltas, the sync plugin crashes), document the exact error with a stack trace and code context. That's the most valuable V7 output.

**Pass criteria:** y-prosemirror v14 sync plugin initializes and syncs content through a flat YType. Edits in TipTap (or raw ProseMirror) appear in CodeMirror and vice versa.

**Fail criteria:** Any of: (a) npm peer dependencies block installation, (b) the delta protocol requires recursive deltas a flat YType can't produce, (c) the binding initializes but content doesn't sync correctly. Document the specific failure.

**If PASS → V4 uses native dual-view (both editors on same CRDT).**
**If FAIL → V4 uses serialize-on-toggle (V4b). This is the expected outcome — the fallback path is well-designed.**

**Key research references:**
- `reports/peritext-on-yjs-feasibility/` — Architecture B and C, delta protocol analysis
- `specs/2026-04-07-init-spike/evidence/dual-binding-infeasibility.md` — the Yjs 13 incompatibility that Yjs 14 may resolve

**Open questions for implementer:**
- Does `@tiptap/y-tiptap` v3.0.2 pin to `yjs@^13`? If so, can it be bypassed with `--legacy-peer-deps` or npm overrides?
- What DeltaConf produces flat text-like deltas? Check y-prosemirror v2 source.
- Does Hocuspocus v3.4.x work with yjs@14, or does it also pin to ^13?

---

### V2: Hocuspocus Embedded in Vite [RUN IN PARALLEL WITH V7]

**Hypothesis:** Hocuspocus can be embedded in a Vite dev server via the `configureServer()` plugin hook, intercepting WebSocket upgrade requests on a dedicated path.

**Test procedure:**
1. Create a Vite project with React + TypeScript
2. Write a Vite plugin that instantiates Hocuspocus and intercepts WebSocket upgrades on `/collab`
3. Create a TipTap editor component that connects to `ws://localhost:5173/collab` via `@hocuspocus/provider`
4. Verify: editor loads, WebSocket connects, Hocuspocus logs show the connection
5. Open two browser tabs. Verify: edits in one tab appear in the other

**Pass criteria:** Two browser tabs show the same TipTap editor, syncing through Hocuspocus embedded in Vite's dev server.

**Fail criteria:** WebSocket upgrade conflicts with Vite's HMR, or Hocuspocus lifecycle doesn't work within `configureServer()`. Document the specific failure.

**Known gotcha:** Must intercept the WebSocket `upgrade` event BEFORE Vite's HMR handler claims it. Filter by URL path (`/collab`). You MUST create a standalone `ws.WebSocketServer({ noServer: true })` — Vite's `server.ws` is its internal HMR server and does NOT expose `handleUpgrade()`.

**Implementation pattern:**
```typescript
// vite-hocuspocus-plugin.ts
import { Hocuspocus } from '@hocuspocus/server'
import { WebSocketServer } from 'ws'
import type { Plugin } from 'vite'

export function hocuspocusPlugin(): Plugin {
  const hocuspocus = new Hocuspocus({ /* config */ })
  return {
    name: 'hocuspocus',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true })
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            hocuspocus.handleConnection(ws, req)
          })
        }
      })
    }
  }
}
```

**Note:** Hocuspocus does NOT need `listen()` called when embedding — `handleConnection(ws, req)` is sufficient. Add `ws` to dependencies.

**Open questions for implementer:**
- Does Vite's HMR WebSocket filter by `sec-websocket-protocol` header, or by URL path? Ensure `/collab` requests don't get claimed by HMR first. If they do, the `upgrade` listener may need to be registered before Vite's own listener (use `configureServer` return function for post-middleware hooks if needed).

---

### V1: TipTap + Markdown Round-Trip Fidelity

**Hypothesis:** Markdown content round-trips through @tiptap/markdown with acceptable fidelity. The output converges after exactly 1 cycle (no progressive drift). Custom fixes (~115-150 lines, estimated but untested) should bring the round-trip to zero semantic loss for standard knowledge platform content.

**V1 is split into two sub-validations:**
- **V1a (ground truth):** Measure raw round-trip fidelity WITHOUT any fixes. This answers "is the architecture viable?"
- **V1b (fix validation):** Attempt the custom fixes and measure improvement. This answers "is the fix effort estimate realistic?"

**Test procedure:**
1. Create a test markdown file (`test-fixture.md`) containing:
   - YAML frontmatter (title, tags, description)
   - H1, H2, H3 headings
   - Paragraphs with **bold**, *italic*, `inline code`, [links](url)
   - Unordered list (nested 2 levels)
   - Ordered list
   - Fenced code block with language tag (```typescript)
   - Fenced code block with custom info string (```jsx-component)
   - GFM table (3 columns, 3 rows)
   - Blockquote
   - Horizontal rule
   - Image reference
   - A `<Callout>` JSX block (for V6)

2. Load the markdown into TipTap via @tiptap/markdown's parser
3. Immediately serialize back to markdown via @tiptap/markdown's serializer
4. Diff input vs output. Classify each difference as: byte-identical, cosmetic (formatting change, no semantic loss), or semantic loss
5. Run the output through a SECOND round-trip. Verify: output of cycle 2 === output of cycle 1 (convergence)
6. Implement the ~150 LOC fixes:
   - Frontmatter: strip before parse, re-prepend on serialize (~30 lines)
   - Tight/loose lists: custom extension with `tight` attribute (~50 lines)
   - Task list checkboxes: task list extension + renderMarkdown (~20 lines)
   - Normalize-on-first-load: run one round-trip on initial file load (~15 lines)
7. Re-run the round-trip with fixes applied. Verify improved fidelity.

**Pass criteria:**
- After fixes: zero semantic loss for standard content types
- Convergence: cycle 2 output === cycle 1 output (byte-identical)
- Custom fenced code info strings preserved (critical for V6)

**Fail criteria:** Semantic losses that cannot be fixed with custom extensions, OR output does not converge (progressive drift across cycles).

**Key research reference:** `reports/markdown-roundtrip-fidelity-tiptap/` — full 27-pattern test results, fix recipes, convergence proof

**Test fixture file content:**
```markdown
---
title: Deployment Guide
tags: [devops, infrastructure]
description: How to deploy the application to production
---

# Deployment Guide

## Prerequisites

You need **Docker** and `kubectl` installed. See the [installation guide](https://example.com/install) for details.

## Steps

1. Build the container image
2. Push to registry
3. Apply the Kubernetes manifests

### Build

- Clone the repository
  - Ensure you have access to the private registry
  - Set up your credentials
- Run the build script

```typescript
const config = {
  registry: "ghcr.io/org/app",
  tag: process.env.VERSION || "latest",
};

await docker.build(config);
```

| Environment | URL | Status |
|-------------|-----|--------|
| Staging | staging.example.com | Active |
| Production | app.example.com | Active |
| Canary | canary.example.com | Limited |

> **Note:** Always deploy to staging first. Production deployments require approval from the platform team.

---

## Checklist

- [x] Completed task
- [ ] Pending task
- [ ] Another pending task

*Last updated: 2026-04-07*

![Architecture diagram](./images/architecture.png)

```jsx-component
<Callout type="warning">
  Always run the integration tests before deploying to production.
  Skipping tests has caused two incidents this quarter.
</Callout>
```
```

---

### V3: DirectConnection Writes → Editor Updates in Real-Time

**Hypothesis:** Server-side code can write to a Y.Doc via Hocuspocus DirectConnection, and the edit appears in the TipTap editor instantly without page reload. The editor cursor doesn't jump.

**Test procedure:**
1. With V2 running (Hocuspocus in Vite, TipTap editor connected in a browser tab):
2. Create a CLI script (`agent-sim.ts`) that can be invoked from the terminal to:
   a. Open a DirectConnection to the same document the editor is viewing
   b. Write a new paragraph ("Hello from the agent! [timestamp]") to the Y.XmlFragment
   c. Disconnect
3. Run the script from a SEPARATE terminal while watching the browser. Verify: the new paragraph appears in the TipTap editor immediately (no page reload).
4. Place the cursor in an existing paragraph in the browser BEFORE running the script.
5. Run the script. Verify: cursor stays in place (doesn't jump to the inserted content).
6. Run the script 5 times rapidly (or with a loop, 100ms apart). Verify: all 5 paragraphs appear, no crashes, no cursor disruption.
7. **Real agent test:** Use Claude Code itself to run the agent-sim script and observe the result in the browser. The implementer IS the agent — invoke the script from Claude Code's terminal, then visually confirm the edit appeared in the browser editor. This validates the actual agent → CRDT → editor pipeline.

**Pass criteria:** Agent-simulated writes appear in the editor in real-time. Cursor position is preserved. Rapid writes don't cause crashes or state corruption.

**Fail criteria:** Writes don't propagate, or cursor jumps, or state corruption occurs.

**Historical note (Hocuspocus #832):** DirectConnection state corruption was [fixed in v2.13.2](https://github.com/ueberdosis/hocuspocus/releases/tag/v2.13.2). The pinned version (^3.4.0) includes this fix. If unexpected sync behavior occurs when DirectConnection opens before any WebSocket client, check whether a regression has reintroduced the issue.

**DirectConnection API (PSEUDOCODE — do not run verbatim):**
```typescript
// This is approximate. Step 2a (below) must be completed first.
const conn = await hocuspocus.openDirectConnection('doc-name', {})
await conn.transact((doc) => {
  const fragment = doc.getXmlFragment('default')
  // INSERT USING y-prosemirror's EXPECTED NODE STRUCTURE
  // The exact API depends on how y-prosemirror maps ProseMirror
  // schema node types to Yjs XmlElement names and attributes.
  // See Step 2a prerequisite.
})
await conn.disconnect()
```

**Step 2a (PREREQUISITE — before writing the agent-sim script):** Inspect how y-prosemirror creates Yjs nodes from ProseMirror nodes. Read the y-prosemirror source (specifically the `pmToFragment` / `nodeToDelta` functions). Use the same node creation pattern in the agent-sim script. The node names, attribute conventions, and text node structure must match what y-prosemirror expects, or the editor will fail to render the inserted content.

**Open questions for implementer:**
- Does `conn.transact()` receive the Hocuspocus Document wrapper or the raw Y.Doc? Check the TypeScript types.
- What XmlElement name does y-prosemirror use for paragraphs? (Likely `'paragraph'` matching the ProseMirror schema node name, but verify.)

---

### V4: Source Toggle — Same Document, Two Editor Views

**Approach depends on V7 result.**

#### V4a: If V7 PASSES (native dual-view)

Both TipTap (WYSIWYG) and CodeMirror 6 (source) bind to the same YType. Toggle between them.

**Test procedure:**
1. Mount TipTap editor bound to the shared YType via y-prosemirror
2. Add a "Toggle Source" button
3. On toggle: unmount TipTap, mount CodeMirror 6 bound to the same YType via y-codemirror.next
4. Edit text in CodeMirror. Toggle back to TipTap.
5. Verify: edits from CodeMirror appear in TipTap
6. Verify: edits from TipTap appear in CodeMirror (toggle back and forth)
7. With two browser tabs open: edit in WYSIWYG in tab 1, verify source view in tab 2 updates (collaborative source)
8. Measure toggle time for the test fixture document

**Pass criteria:** Edits in either mode appear in the other. Both modes are collaborative. Toggle is <100ms.

#### V4b: If V7 FAILS (serialize-on-toggle via file watcher path)

Source mode writes markdown directly to disk. File watcher syncs changes back to CRDT.

**Test procedure:**
1. Mount TipTap editor (WYSIWYG mode, bound to Y.XmlFragment)
2. Add a "Toggle Source" button
3. On toggle to source:
   a. Serialize Y.XmlFragment → ProseMirror JSON → markdown string (via @tiptap/markdown)
   b. Write the markdown string to the .md file on disk
   c. Unmount TipTap, mount CodeMirror 6 with the markdown string (NOT connected to CRDT)
4. While in source mode: edit in CodeMirror → save to .md file on disk (debounced ~500ms)
5. On toggle back to WYSIWYG:
   a. Read the .md file from disk
   b. Parse markdown → ProseMirror Node
   c. Apply to Y.XmlFragment via `updateYFragment` (diff-based, NOT `prosemirrorJSONToYDoc`)
   d. Remount TipTap
6. Verify: edits from source mode appear in WYSIWYG after toggle-back
7. Verify: no content loss through the cycle (diff test fixture before/after)
8. **Divergence test (non-conflicting):** While in source mode, trigger a DirectConnection write (V3) to a DIFFERENT paragraph than what you edited. Toggle back. Document: are both the source edits AND the agent's edit present?
9. **Divergence test (conflicting — CHARACTERIZATION, not pass/fail):** While in source mode, trigger a DirectConnection write to the SAME paragraph you edited. Toggle back. Document exactly what `updateYFragment` does: does the user's version overwrite the agent's? Does the agent's overwrite the user's? Do they interleave? The outcome informs the product design for agent-during-source-mode behavior. Do NOT predict the outcome — observe and record it.
10. Measure toggle time for the test fixture document

**Pass criteria:** Round-trip through source mode preserves content. Concurrent non-conflicting edits merge correctly. Toggle is <100ms.

**CRITICAL implementation note:** On toggle-back, MUST use `updateYFragment()` (diff-based), NOT `prosemirrorJSONToYDoc()` (creates new Y.Doc, destroys collaboration state). See `reports/source-toggle-architecture/evidence/yjs-shared-type-internals.md`.

**CRITICAL implementation note:** Prevent feedback loops when source mode writes to disk. The file watcher will detect the write and try to sync to CRDT. Either: (a) suppress file watcher events for files we just wrote (content-hash comparison), or (b) don't run the file watcher → CRDT path while source mode is active for that file. See `reports/crdt-mcp-filesystem-bridge/evidence/feedback-loop-prevention.md`.

---

### V5: Git Auto-Persistence Pipeline

**Hypothesis:** The three-tier persistence pipeline (CRDT → filesystem → git) works end-to-end with configurable debounce timings.

**Test procedure:**
1. With V2 running (Hocuspocus + TipTap):
2. **Sub-validation: server-side Y.Doc → markdown serialization.** Before testing the full pipeline, validate that Y.Doc can be serialized to markdown SERVER-SIDE (in Node.js, not browser). This requires:
   - A ProseMirror schema available server-side (same schema as the browser editor)
   - Either `yDocToProsemirrorJSON()` from y-prosemirror/lib, or a headless TipTap instance (`@tiptap/core` supports server-side use without DOM)
   - Then `@tiptap/markdown` serialize from the ProseMirror JSON to markdown string
   Test this independently before wiring up the Hocuspocus hooks. If this bridge doesn't work, V5 cannot produce markdown files on disk — document the failure point.
3. Configure Hocuspocus with persistence hooks:
   - `onStoreDocument` (Layer 1): use the server-side serialization from step 2 to convert Y.Doc → markdown → write .md file to disk. Debounce: 2s quiet / 10s max.
   - `afterStoreDocument` (Layer 2): `git add` + `git commit` to a WIP ref (`refs/wip/main`). Debounce: 30s idle. (Note: if `afterStoreDocument` doesn't exist as a hook, trigger git at the end of `onStoreDocument` after the markdown write completes.)
4. Initialize a git repo in the spike directory (`git init`)
4. Edit content in the TipTap editor. Wait 2 seconds (quiet debounce).
5. Verify: .md file on disk reflects the edits (Layer 1)
6. Wait 30 seconds.
7. Verify: git log on `refs/wip/main` shows a commit with the changes (Layer 2)
8. Make another edit. Verify: a new commit appears on the WIP ref after the debounce.
9. Verify: the .md file content matches the TipTap editor content (no drift)

**Pass criteria:** Edits flow from CRDT → .md file (2-10s) → git WIP ref (30-60s) without manual intervention. File content matches editor content.

**Fail criteria:** Persistence hooks don't fire, or markdown serialization is lossy (see V1), or git operations fail.

**Git plumbing for WIP refs (via simple-git `.raw()`):**
```typescript
import simpleGit from 'simple-git'
const git = simpleGit(projectDir)

// Stage and create commit on WIP ref without checkout
await git.add('.')
const treeSha = (await git.raw('write-tree')).trim()
const parentSha = await git.raw('rev-parse', 'refs/wip/main').catch(() => null)
const args = ['commit-tree', treeSha, '-m', `WIP auto-save ${new Date().toISOString()}`]
if (parentSha) args.push('-p', parentSha.trim())
const commitSha = (await git.raw(...args)).trim()
await git.raw('update-ref', 'refs/wip/main', commitSha)
```

**Open questions for implementer:**
- Does `onStoreDocument` receive the document name and Y.Doc? Verify the hook signature.
- Does `afterStoreDocument` fire after `onStoreDocument` completes, or can they overlap?
- What happens if the git commit fails (e.g., nothing to commit)? Does it break the pipeline?

---

### V6: Void Node with React Component Preview

**Hypothesis:** A custom TipTap void node can render a React component via `ReactNodeViewRenderer`, store raw JSX as a string attribute, survive the markdown round-trip verbatim (as a fenced code block with `jsx-component` info string), and be atomic in the CRDT.

**Test procedure:**
1. Create a simple React component:
```typescript
function Callout({ type, children }: { type: string; children: React.ReactNode }) {
  const colors = { warning: '#fff3cd', info: '#cff4fc', error: '#f8d7da' }
  return (
    <div style={{ padding: '12px 16px', borderRadius: '6px', backgroundColor: colors[type] || '#f0f0f0' }}>
      <strong>{type.toUpperCase()}</strong>: {children}
    </div>
  )
}
```

2. Create a TipTap extension:
   - `name: 'jsxComponent'`
   - `group: 'block'`
   - `atom: true` (void/atomic node)
   - `attrs: { content: { default: '' } }` (stores raw JSX string)
   - `ReactNodeViewRenderer` renders the Callout component based on parsed props
   - `parseMarkdown`: intercept `code` tokens where `lang === 'jsx-component'` → create the node with the code content as the `content` attribute
   - `renderMarkdown`: emit fenced code block with `jsx-component` info string containing the `content` attribute

3. Load the test fixture (which contains a `<Callout>` jsx-component block) into TipTap
4. Verify: the Callout renders as a visual React component in the editor
5. Verify: you can type text BEFORE and AFTER the Callout block. The block is atomic — cursor skips over it, doesn't enter it.
6. Serialize to markdown. Verify: the jsx-component fenced code block appears verbatim (exact string match on the JSX content)
7. Parse the serialized markdown back. Verify: the Callout renders again (round-trip)
8. CRDT atomicity test: with two browser tabs open, in tab 1 type text immediately before the Callout. In tab 2 type text immediately after the Callout. Verify: the Callout stays intact, doesn't split, both edits appear correctly.

**Pass criteria:** React component renders in editor. Void node is atomic in CRDT. Raw JSX string survives markdown round-trip verbatim.

**Fail criteria:** Component doesn't render, OR node isn't atomic (splits under concurrent edits), OR JSX string is modified during round-trip.

**Serialization format:**
````
```jsx-component
<Callout type="warning">
  Always run the integration tests before deploying to production.
  Skipping tests has caused two incidents this quarter.
</Callout>
```
````

See `evidence/void-node-serialization.md` for the full rationale on choosing fenced code blocks.

---

## 4. Implementation Order

```
Phase 1:
  V2 — Hocuspocus in Vite (foundation — everything else needs this)

Phase 2 (after V2, parallel):
  V7 — Yjs v14 delta protocol test
  V1a — Markdown round-trip raw measurement (no fixes)
  V3 — DirectConnection writes
  V6 — Void node + React preview

Phase 3 (after V1a + V7 result):
  V1b — Round-trip fix attempt (~150 LOC)
  V4 — Source toggle (V4a if V7 passed, V4b if V7 failed)
  V5 — Git auto-persistence pipeline (including server-side serialization sub-validation)
```

V2 runs first because everything else needs Hocuspocus. V7 is time-boxed and runs in parallel with V1a/V3/V6 — it doesn't gate them, only V4. V1a (raw measurement) is separated from V1b (fix attempt) so the ground truth is captured regardless of fix complexity. V5 depends on V1 (markdown serialization) and V2 (Hocuspocus hooks).

---

## 5. Tech Stack

### Packages (verified versions as of 2026-04-07)

```json
{
  "dependencies": {
    "@tiptap/core": "^3.22.0",
    "@tiptap/react": "^3.22.0",
    "@tiptap/pm": "^3.22.0",
    "@tiptap/starter-kit": "^3.20.0",
    "@tiptap/extension-link": "^3.21.0",
    "@tiptap/extension-table": "^3.20.0",
    "@tiptap/extension-collaboration": "^3.20.0",
    "@tiptap/extension-collaboration-cursor": "^3.20.0",
    "@tiptap/markdown": "^3.22.0",
    "@hocuspocus/server": "^3.4.0",
    "@hocuspocus/provider": "^3.4.0",
    "yjs": "^13.6.30",       // V1-V6 use stable v13. V7 attempts yjs@14.0.0-16 (beta) in isolated test.
    "ws": "^8.0.0",           // Required for standalone WebSocketServer in V2 Vite plugin
    "y-codemirror.next": "^0.3.5",
    "@codemirror/state": "^6.0.0",
    "@codemirror/view": "^6.0.0",
    "@codemirror/lang-markdown": "^6.0.0",
    "simple-git": "^3.35.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

**For V7 specifically:** May need `yjs@next` (v14 RC) or building from source. Check npm availability first. If v14 is not available, use v13 and document the limitation.

**CodeMirror caveat:** CM6 packages don't declare peerDependencies. Duplicate `@codemirror/view` installs silently break Yjs sync (instanceof checks fail). Add to package.json:
```json
"overrides": {
  "@codemirror/state": "$@codemirror/state",
  "@codemirror/view": "$@codemirror/view"
}
```

### Project Structure

```
init_spike/
├── package.json
├── tsconfig.json
├── vite.config.ts              # Vite + Hocuspocus plugin
├── src/
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Editor + toggle + controls
│   ├── editor/
│   │   ├── TiptapEditor.tsx    # TipTap WYSIWYG editor component
│   │   ├── SourceEditor.tsx    # CodeMirror 6 source editor component
│   │   ├── extensions/
│   │   │   ├── jsx-component.ts    # Void node extension (V6)
│   │   │   ├── frontmatter.ts      # Frontmatter strip/prepend (V1)
│   │   │   └── markdown-fixes.ts   # Round-trip fidelity fixes (V1)
│   │   └── Callout.tsx         # Simple React component for V6
│   ├── server/
│   │   ├── hocuspocus-plugin.ts    # Vite plugin embedding Hocuspocus (V2)
│   │   ├── agent-sim.ts           # DirectConnection agent simulator (V3)
│   │   └── persistence.ts        # onStoreDocument + git pipeline (V5)
│   └── v7-test/                    # Isolated directory for V7 (may use different yjs version)
│       ├── package.json            # Separate deps: yjs@14.0.0-16, y-prosemirror@2.0.0-2
│       └── delta-protocol-test.ts  # Yjs v14 YType test (V7)
├── content/
│   └── test-fixture.md         # Test markdown file
└── RESULTS.md                  # Validation results — PASS/FAIL for each V#
```

---

## 5b. Implementation Notes from Research

These are gotchas, patterns, and warnings extracted from the research reports that are directly relevant to implementation. The implementer should read these before starting and reference the linked reports for deeper context when needed.

### General

- **y-prosemirror binding supports runtime rebinding.** The sync plugin's `update` hook detects `ytype` changes via transaction metadata (`tr.getMeta(ySyncPluginKey)`) and re-subscribes automatically (y-prosemirror/src/sync-plugin.js lines 264-282). You do NOT need to destroy and recreate the editor to switch Y.Types — dispatch a transaction with the new ytype in the plugin metadata. This simplifies source toggle (V4) and document switching. Verified from source: `/Users/edwingomezcuellar/.claude/oss-repos/y-prosemirror/src/sync-plugin.js`.
- **`@tiptap/extension-collaboration` depends on `@tiptap/y-tiptap` (v3.0.2)** — TipTap's maintained fork of y-prosemirror. This is a transitive dependency. For V7, you may need to bypass this and use y-prosemirror directly.
- **Hocuspocus v3.4.4 supports doc multiplexing** — multiple documents over a single WebSocket. Not needed yet (single doc) but useful to know for multi-document support.

### V1 (Markdown Round-Trip)

- **Tight/loose list fix — approach is UNTESTED for @tiptap/markdown.** marked's `Tokens.List` and `Tokens.ListItem` DO expose a `loose: boolean` property ([confirmed from source](https://github.com/markedjs/marked/blob/master/src/Tokens.ts)). However, @tiptap/markdown v3 (which uses marked) does NOT use this property — it has no tight/loose handling. The community `tiptap-markdown` package (which uses markdown-it, NOT marked) has a working `MarkdownTightLists` extension that detects tight/loose via DOM inspection (`!element.querySelector('p')`). The fix for @tiptap/markdown needs a different approach: (1) add `tight` attribute to list node schema, (2) use `marked.use()` walkTokens or renderer extension to read `token.loose`, (3) emit blank lines in `renderMarkdown` for loose lists. **This specific integration (marked walkTokens → TipTap list extension) is untested.** The spike should treat this as a V1b experiment, not a guaranteed fix. See `reports/markdown-roundtrip-fidelity-tiptap/evidence/d3-fixable-vs-fundamental.md`.
- **Normalize-on-load pattern:** Run one round-trip on initial file load so subsequent saves are stable. This means: parse markdown → TipTap → serialize back to markdown → overwrite file. First cycle normalizes formatting; all subsequent cycles are byte-identical. See `reports/markdown-roundtrip-fidelity-tiptap/evidence/d5-convergence.md`.
- **Frontmatter implementation:** `marked` treats `---` as a thematic break (horizontal rule). Frontmatter must be regex-stripped before parsing and re-prepended after serialization. Pattern: `/^---\n[\s\S]*?\n---\n/` to extract, store separately, and re-prepend. See `reports/markdown-roundtrip-fidelity-tiptap/evidence/d6-frontmatter.md`.

### V3 (DirectConnection Writes)

- **Node structure must match y-prosemirror conventions.** Read the y-prosemirror source (`pmToFragment` / `nodeToDelta` functions in sync-utils.js). XmlElement names must match ProseMirror schema node type names. Attributes must follow the same conventions. If the inserted structure doesn't match, the editor will fail to render the content or produce errors.
- **`conn.transact()` callback:** Verify via TypeScript types whether it receives a Hocuspocus `Document` wrapper or a raw `Y.Doc`. The Document wrapper may have additional methods.

### V4b (Source Toggle — Serialize via Disk)

- **Editor rebinding on toggle (NOT full remount):** y-prosemirror supports runtime Y.Type switching via transaction metadata (`tr.getMeta(ySyncPluginKey)` with new `ytype`). The sync plugin auto-detects the change and re-subscribes (sync-plugin.js lines 264-282). This means V4 may NOT require destroying the editor — try dispatching a transaction to unbind/rebind first. Full React key remount is the fallback if runtime rebinding proves unreliable. Verified from source: `oss-repos/y-prosemirror/src/sync-plugin.js`.
- **Feedback loop prevention is two-layer:** (1) Content-hash tracking at the file watcher level to suppress self-echo (writes we just made to disk). (2) If available, `skipStoreHooks: true` on file-watcher → CRDT transactions to prevent Loop 2 (watcher → CRDT → onStoreDocument → disk → watcher). Without both, rapid edits will create ping-pong loops. See `reports/crdt-mcp-filesystem-bridge/evidence/feedback-loop-prevention.md`.
- **@parcel/watcher event batching:** On macOS, events coalesce over 25-50ms. Timestamp-based write tracking is insufficient — use content hashes to distinguish self-writes from external writes within a batch.

### V5 (Git Auto-Persistence)

- **Server-side Y.Doc → JSON is trivial.** `yDocToProsemirrorJSON()` from y-prosemirror is pure Yjs/JSON manipulation — no DOM, no schema required. Verified from source: `oss-repos/y-prosemirror/`. For JSON → markdown on server-side, two options: (a) `@tiptap/html` package has server exports using `happy-dom` for DOM simulation — `generateHTML`/`generateJSON` verified in source at `oss-repos/tiptap/packages/html/src/server/`. (b) Use `prosemirror-markdown`'s serializer directly with a schema object (no DOM needed — it's a tree walk that builds a string). Option (b) is lighter.
- **Binary CRDT persistence is separate from markdown serialization.** Layer 1 crash recovery should write Yjs binary (`Y.encodeStateAsUpdate(doc)`) which is sub-millisecond. Markdown serialization can run in parallel or slightly after. These are two independent persistence concerns with different timing needs.
- **Git plumbing bypasses .git/index entirely.** The `hash-object` → `mktree` → `commit-tree` → `update-ref` pipeline creates commits without touching the working directory's staging area. Safe for concurrent use with normal git operations. See `reports/git-library-for-knowledge-platform/`.
- **Subprocess overhead is negligible.** simple-git spawns git subprocesses at ~1.5ms per call (Linux). At 30-60s commit intervals, this is irrelevant. Don't optimize for subprocess performance.

### V6 (Void Node)

- **Fumadocs components are self-contained.** If you want to use a real Fumadocs component (Callout, Tabs) as the void node preview, they work standalone in Vite with no context dependencies — no FrameworkProvider needed. For now, the trivial custom Callout is sufficient. See `reports/fumadocs-full-pipeline/`.
- **Void node children trade-off (KNOWN, by design):** Storing raw JSX as a single string attribute means children are NOT collaboratively editable at the CRDT level — the entire string is last-writer-wins. This is the intentional design from TQ3 (void nodes over WYSIWYG MDX). Editable children would require child nodes, not string attributes. See `reports/mdx-crdt-roundtrip-fidelity/`.

### V7 (Yjs v14)

- **Install v14 in an isolated subdirectory.** The v7-test/ directory has its own package.json to avoid polluting the main project's dependency tree. `@tiptap/y-tiptap` and Hocuspocus pin `yjs@^13` — installing v14 in the main directory will cause peer dependency conflicts.
- **If bypassing TipTap for V7:** You can use y-prosemirror directly (without TipTap's collaboration extension) by creating a raw ProseMirror editor with the y-prosemirror sync plugin. This avoids the @tiptap/y-tiptap → yjs@^13 dependency chain.

---

## 6. Scope Boundaries

**In scope (build well — this is the foundation):**
- TipTap editor with CRDT collaboration (foundation for S1)
- Markdown round-trip with fidelity fixes (foundation for all persistence)
- Hocuspocus embedded in Vite with DirectConnection (foundation for S4/S5)
- Source toggle between WYSIWYG and CodeMirror (foundation for S2)
- Git auto-persistence pipeline (foundation for S6)
- Void node with React component preview (foundation for S1 component model)
- Clean project structure, proper TypeScript, Biome formatting, CLAUDE.md for the repo

**Out of scope (don't build yet):**
- Real MCP server (DirectConnection simulates agent writes for now)
- Sidebar, file tree, or navigation (CC3 — separate story)
- Search, wiki-links, or backlinks (S8, S10 — later stories)
- Permissions or draft branches (CC4 — later story)
- Polished UI chrome (the editor itself should be clean, but no app shell)
- Fumadocs dependency (trivial custom Callout for void node test)

---

## 7. Developer Environment

### Toolchain (adapted from openbolts)

**Biome** for formatting + linting. Copy this `biome.jsonc` into `init_spike/`:
```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.4.4/schema.json",
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "warn",
        "noUnusedImports": "error"
      },
      "style": {
        "useImportType": "error"
      }
    }
  },
  "files": {
    "includes": ["**", "!**/node_modules", "!**/dist", "!**/.turbo"]
  }
}
```

**TypeScript** — strict, modern, Vite-compatible. `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Package manager: Bun** (following the openbolts pattern — `"packageManager": "bun@1.3.11"`). Bun for install (`bun install` — 7x faster), dev (`bun run dev`), and scripts. The project targets Node.js for eventual `npx` distribution, but development uses Bun. No Bun-specific APIs in the code — everything uses standard Node.js-compatible APIs.

**Scripts** — tiered quality gates (openbolts pattern):
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome check --write .",
    "check:fast": "tsc --noEmit && biome check .",
    "check": "tsc --noEmit && biome check . && vite build"
  }
}
```

### CLAUDE.md for the implementing agent

Create `init_spike/CLAUDE.md` with:
```markdown
# Open Knowledge — Foundation

## Commands

```bash
bun run dev          # Start Vite dev server + Hocuspocus (http://localhost:5173)
bun run check:fast   # Typecheck + lint (~5s) — run after every change
bun run check        # Full gate: typecheck + lint + build
```

## Verification

Before declaring any validation complete: `bun run check:fast`
Before declaring all work done: `bun run check`

## Quality

- This is foundational code — write it like it will be built upon.
- Proper TypeScript types, no `any` without justification.
- Clean module boundaries (editor/, server/, v7-test/).
- Biome formatting enforced — run `bun run format` if lint fails.
- Take your time. Thoroughness matters more than speed.

## Research

When you hit uncertainty or want to understand how others solve something:
- Use web search to look up API details, patterns, and prior art.
- Check `~/.claude/oss-repos/` for local copies of key repos (yjs, y-prosemirror, tiptap, hocuspocus, y-codemirror.next, etc.) — read source code directly.
- Use `/eng:research` skill for deeper investigation when warranted.
- The research reports in `../../reports/` have deep analysis — read them when the spec references them.

## Key files

- `vite.config.ts` — Vite + Hocuspocus plugin (V2)
- `src/editor/TiptapEditor.tsx` — WYSIWYG editor (V1, V3, V6)
- `src/editor/SourceEditor.tsx` — CodeMirror source view (V4)
- `src/server/hocuspocus-plugin.ts` — Embedded Hocuspocus (V2)
- `src/server/agent-sim.ts` — DirectConnection write simulator (V3)
- `src/server/persistence.ts` — onStoreDocument + git pipeline (V5)
- `content/test-fixture.md` — Test markdown file

## Research references

If you hit a wall, check these reports for context:
- `../../reports/source-toggle-architecture/` — source toggle options
- `../../reports/peritext-on-yjs-feasibility/` — Yjs v14 delta protocol
- `../../reports/markdown-roundtrip-fidelity-tiptap/` — round-trip fix recipes
- `../../reports/crdt-mcp-filesystem-bridge/` — file watcher + persistence
- `../../specs/2026-04-07-init-spike/SPEC.md` — this spec (section 5b has implementation notes)
```

---

## 8. Output Requirements

The project produces a `RESULTS.md` file documenting each validation:

```markdown
# Validation Results

## V7: Yjs v14 Delta Protocol
**Result:** PASS / FAIL
**Evidence:** [what happened, screenshots, console output]
**If FAIL:** [exact error, which delta method failed, why]
**Implications:** [what this means for V4 and the architecture]

## V2: Hocuspocus in Vite
**Result:** PASS / FAIL
...

[repeat for V1, V3, V4, V5, V6]
```

For each FAIL: document the exact error, what was tried, and what alternative approaches exist. This is the most valuable output.

**Evidence types for RESULTS.md:**
- Terminal output (command + stdout/stderr) for git operations, script execution, build output
- File diffs (`diff before.md after.md`) for round-trip verification
- Screenshots of the browser editor showing real-time sync, void node rendering, source toggle
- `git log --oneline refs/wip/main` output for persistence verification
- Browser DevTools console output for WebSocket connection verification
- Side-by-side comparison of two browser tabs showing collaborative editing

---

## 8. Decision Log

| # | Decision | Resolution | Confidence | Evidence |
|---|----------|-----------|------------|----------|
| D1 | Markdown serializer: @tiptap/markdown (not prosemirror-markdown) | DIRECTED | HIGH | `reports/markdown-roundtrip-fidelity-tiptap/` — native TipTap integration, per-extension parse/render rules |
| D2 | Void node serialization: fenced code block with `jsx-component` info string | DIRECTED | HIGH | `evidence/void-node-serialization.md` — verbatim preservation by CommonMark spec, graceful degradation |
| D3 | Source toggle V4b approach: serialize through disk (source mode writes .md file, toggle-back reads .md file). Synchronous write/read on user-initiated toggle — file watcher NOT involved in the toggle itself. File watcher path is for Cursor interop (separate, async). | DIRECTED | HIGH | Session discussion — simplest approach, disk as the sync substrate |
| D4 | V7 (Yjs v14 delta protocol) runs first, determines V4 approach | LOCKED | HIGH | `reports/peritext-on-yjs-feasibility/` — if delta protocol is type-agnostic, architecture fundamentally improves |
| D5 | updateYFragment for toggle-back, never prosemirrorJSONToYDoc | LOCKED | HIGH | `reports/source-toggle-architecture/evidence/yjs-shared-type-internals.md` — prosemirrorJSONToYDoc destroys collab state |
| D6 | Include frontmatter in round-trip validation | DIRECTED | HIGH | Frontmatter is load-bearing (TQ6), no markdown library handles it natively |
| D7 | Prescribe validation ordering (not left to implementer) | DIRECTED | HIGH | Dependencies mapped — V7+V2 first, then V1/V3/V6, then V4/V5 |

---

## 9. Assumptions

| # | Assumption | Confidence | Verification | Expiry |
|---|-----------|------------|-------------|--------|
| A1 | Yjs v14 pre-release is available and the ecosystem (y-prosemirror, TipTap, Hocuspocus) cooperates | LOW | V7 will verify within 2-hour time-box. yjs@14.0.0-16 (beta) and y-prosemirror@2.0.0-2 exist on npm. But @tiptap/y-tiptap and Hocuspocus likely pin yjs@^13 — peer dep conflicts expected. | Start of spike |
| A2 | @tiptap/y-tiptap works with Yjs v14 | MEDIUM | V7 will verify. May need to use y-prosemirror directly. | Start of spike |
| A3 | Hocuspocus handleConnection works without listen() | HIGH | V2 will verify. Pattern from evidence/hocuspocus-direct-connection.md. | V2 |
| A4 | simple-git .raw() supports update-ref for arbitrary refs | HIGH | V5 will verify. Documented in simple-git types. | V5 |
| A5 | @tiptap/markdown preserves custom fenced code info strings | HIGH | V1/V6 will verify. Research confirms marked preserves lang field. | V1 |

---

## 10. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Yjs v14 not available or too unstable | MEDIUM | HIGH (V7 fails) | Fall back to V4b (serialize-on-toggle). The remaining 6 validations still prove the foundation works. |
| R2 | Hocuspocus DirectConnection state corruption (#832) | MEDIUM | LOW (workaround exists) | Ensure WebSocket client connects before DirectConnection opens. Document if observed. |
| R3 | updateYFragment clobbers concurrent agent writes | HIGH | MEDIUM | Document the behavior. This is a known architectural limitation — the foundation should characterize it, not fix it. See `reports/crdt-mcp-filesystem-bridge/evidence/updateyfragment-concurrent-mutations.md`. |
| R4 | File watcher feedback loop (CRDT→disk→watcher→CRDT) | MEDIUM | MEDIUM | Implement content-hash write tracking to suppress self-echo. See `reports/crdt-mcp-filesystem-bridge/evidence/feedback-loop-prevention.md`. |
| R5 | TipTap v3 markdown extension lossy for tables | LOW | LOW | Tables with alignment specifiers may normalize. Document if observed. Cosmetic loss is acceptable. |

---

## 11. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | Is Yjs v14 published to npm? | Technical | P0 | Resolves during V7 |
| OQ2 | What DeltaConf produces flat text-like deltas in Yjs v14? | Technical | P0 | Resolves during V7 |
| OQ3 | Does @tiptap/extension-collaboration's type creation need modification for V7? | Technical | P0 | Resolves during V7 |
| OQ4 | Does Vite's configureServer provide access to httpServer for WebSocket upgrade? | Technical | P0 | Resolves during V2 |
| OQ5 | Exact hook signature for Hocuspocus onStoreDocument — does it receive Y.Doc or Document wrapper? | Technical | P0 | Resolves during V5 |

---

## 12. Future Work

| Item | Maturity | Notes |
|------|----------|-------|
| Full Peritext boundary semantics on Yjs | Identified | Only needed if concurrent overlapping format ops become product-visible. 6-10 weeks. See `reports/peritext-on-yjs-feasibility/` Architecture A. |
| Three-way merge for updateYFragment | Identified | Would fix the clobber problem (R3). Requires storing common ancestor state. No off-the-shelf solution exists. |
| Split-view (WYSIWYG + read-only source side-by-side) | Noted | One-way serialization has zero correctness risk. Natural extension of whichever toggle approach ships. |
| Sub-500ms CRDT→disk latency | Explored | Feasible with `debounce: 200, maxDebounce: 500`. See `reports/crdt-mcp-filesystem-bridge/evidence/crdt-disk-latency-floor.md`. |
| Awareness-based mode locking (Option I) | Explored | ~50 lines of awareness code on top of the toggle. Prevents concurrent source mode access. See `reports/source-toggle-architecture/`. |

---

## 13. Agent Constraints

**SCOPE:** Only files within `init_spike/`. Read reports and evidence files in `reports/` and `specs/` for context.

**EXCLUDE:** Do not modify anything outside `init_spike/`. Do not install global packages. Do not modify the parent project's package.json.

**STOP_IF:**
- V7 test requires modifying Yjs source code (not just configuring it) — stop and document why
- Hocuspocus embedding requires patching Vite internals — stop and document why
- A validation is heading in a direction that contradicts the research findings — stop, re-read the relevant report, and reassess

**ASK_FIRST:**
- Before choosing between Yjs v14 from npm vs building from source
- Before adding any package not listed in section 5

---

## 14. Key Research References

| Report | Relevance |
|--------|-----------|
| `reports/source-toggle-architecture/` | Complete architecture options for source toggle. Options A/B/I. Competitor analysis. |
| `reports/peritext-on-yjs-feasibility/` | Yjs v14 delta protocol, three architectures (A/B/C), blast radius analysis |
| `reports/markdown-roundtrip-fidelity-tiptap/` | 27-pattern round-trip test, convergence proof, ~150 LOC fix recipes |
| `reports/mdx-text-editor-preview-approach/` | CM6-only path assessment, hybrid option (D11), Yandex Gravity UI prior art |
| `reports/crdt-mcp-filesystem-bridge/` | updateYFragment clobber analysis, feedback loop prevention, CRDT→disk latency |
| `reports/mdx-crdt-roundtrip-fidelity/` | Why void nodes were chosen over WYSIWYG MDX |
| `reports/tiptap-2026-direction-overlap/` | TipTap confirmed as foundation, competitive assessment |
| `specs/2026-04-07-init-spike/evidence/` | Package versions, Hocuspocus DirectConnection API, void node serialization |
