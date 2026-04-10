# Evidence: Dependency Compatibility (D1)

**Dimension:** Bun vs Node.js compatibility for specific project dependencies
**Date:** 2026-04-03
**Sources:** GitHub issues, npm registries, official documentation, community reports

---

## Key files / pages referenced

- [Hocuspocus GitHub Issue #878](https://github.com/ueberdosis/hocuspocus/issues/878) -- WebSocket ping bug in Bun
- [Bun Node-API docs](https://bun.com/docs/runtime/node-api) -- NAPI compatibility
- [Orama JSR package](https://jsr.io/@orama/orama) -- Runtime compatibility
- [@mdx-js/mdx docs](https://mdxjs.com/packages/mdx/) -- Bun integration via esbuild plugin
- [Shiki docs](https://shiki.style/guide/) -- Runtime-agnostic design
- [isomorphic-git Issue #1966](https://github.com/isomorphic-git/isomorphic-git/issues/1966) -- Clone hanging
- [@parcel/watcher Bun Issue #19282](https://github.com/oven-sh/bun/issues/19282) -- Prebuild not found
- [Bun compatibility 2026](https://dev.to/alexcloudstar/bun-compatibility-in-2026-what-actually-works-what-does-not-and-when-to-switch-23eb) -- What works/doesn't

---

## Findings

### Finding: Hocuspocus works in Bun after Bun v1.1.37
**Confidence:** CONFIRMED
**Evidence:** [GitHub Issue #878](https://github.com/ueberdosis/hocuspocus/issues/878)

Hocuspocus WebSocket ping messages were not transmitted correctly to clients in Bun versions prior to 1.1.37, causing endless reconnection loops (error code 4408 Connection Timeout). The issue was a Bun bug (oven-sh/bun#15247), fixed in Bun v1.1.37. The reporter confirmed: "the most recent Bun version (>= v1.1.37) has fixed the problem for us!"

**Implications:** Hocuspocus is compatible with current Bun versions. The fix was upstream in Bun, not in Hocuspocus itself, indicating Bun's WebSocket implementation has matured.

### Finding: Yjs / y-prosemirror / y-codemirror are pure JS and Bun-compatible
**Confidence:** INFERRED
**Evidence:** Yjs ecosystem is pure JavaScript/TypeScript with no native dependencies. Standard WebSocket protocol used.

Yjs is a CRDT implementation in pure JavaScript. y-prosemirror and y-codemirror are bindings that don't use Node-specific APIs. The WebSocket provider (y-websocket) requires a standard WebSocket class, which Bun implements natively.

**Implications:** No compatibility risk for the Yjs ecosystem.

### Finding: isomorphic-git works in Bun; the hanging issue was protocol-related, not runtime-related
**Confidence:** CONFIRMED
**Evidence:** [GitHub Issue #1966](https://github.com/isomorphic-git/isomorphic-git/issues/1966)

A user reported git.clone() hanging in Bun. Investigation revealed the root cause was a Git protocol compatibility issue (missing side-band capability on the server), not a Bun-specific bug. isomorphic-git's core functionality uses standard fs and Buffer APIs that Bun supports.

**Implications:** isomorphic-git should work in Bun for local git operations. Remote operations depend on standard HTTP/fetch which Bun supports.

### Finding: react-docgen-typescript should work in Bun (uses TypeScript Compiler API, not native addons)
**Confidence:** INFERRED
**Evidence:** react-docgen-typescript uses ts.createProgram() from the TypeScript npm package. TypeScript itself is pure JavaScript. Bun can run the TypeScript compiler as a library.

react-docgen-typescript invokes the TypeScript Compiler API (ts.createProgram, ts.getPreEmitDiagnostics, etc.), which is a pure JavaScript library distributed via npm. Bun can import and execute the typescript npm package. No native addons involved.

**Implications:** This dependency is likely compatible. The TypeScript Compiler API is computationally heavy but does not use Node-specific APIs that Bun lacks.

### Finding: Orama explicitly supports Bun
**Confidence:** CONFIRMED
**Evidence:** [Orama JSR package](https://jsr.io/@orama/orama), [Orama docs](https://docs.orama.com/)

Orama documentation states: "compatible with every JavaScript environment, including Node.js, Deno, Bun, and browsers." Installation via `bun add @orama/orama` is documented. Pure TypeScript, ES modules.

**Implications:** Zero compatibility risk.

### Finding: @parcel/watcher has known issues with Bun
**Confidence:** CONFIRMED
**Evidence:** [Bun Issue #19282](https://github.com/oven-sh/bun/issues/19282)

@parcel/watcher is a native C++ addon using Node-API. Users report "No prebuild or local build of @parcel/watcher found" when using Bun. The issue involves: (1) Bun not running postinstall scripts for non-top-500 packages by default, (2) detect-libc returning a function instead of a string in Bun. Workaround: add @parcel/watcher to trustedDependencies in package.json.

**Implications:** Requires workaround. Bun's built-in fs.watch or chokidar (pure JS) are alternatives.

### Finding: @mdx-js/mdx works in Bun via the esbuild plugin
**Confidence:** CONFIRMED
**Evidence:** [MDX docs](https://mdxjs.com/packages/mdx/)

Official MDX documentation provides Bun integration instructions using @mdx-js/esbuild:
```javascript
import mdx from '@mdx-js/esbuild'
import {type BunPlugin, plugin} from 'bun'
await plugin(mdx() as unknown as BunPlugin)
```

**Implications:** Officially supported path. Uses Bun's native esbuild integration.

### Finding: Shiki is runtime-agnostic, works in Bun
**Confidence:** CONFIRMED
**Evidence:** [Shiki docs](https://shiki.style/guide/)

Shiki documentation states it "runs on any JavaScript runtime" and does not rely on Node.js APIs or the filesystem. Fully tree-shakable ESM.

**Implications:** Zero compatibility risk.

### Finding: simple-git should work in Bun (uses child_process to call git CLI)
**Confidence:** INFERRED
**Evidence:** simple-git uses Node's child_process.spawn to invoke the git CLI. Bun supports child_process APIs.

simple-git is a lightweight wrapper around the git CLI binary. It spawns git processes using Node's child_process module, which Bun implements. No native addons.

**Implications:** Should work without issues. The main requirement is that git is installed on the system.

---

## Gaps / follow-ups

* react-docgen-typescript on Bun not directly tested by community -- worth a manual smoke test
* @parcel/watcher workaround needs validation with current Bun versions
* Hocuspocus with Bun's native WebSocket API (rather than ws polyfill) not extensively tested for edge cases
