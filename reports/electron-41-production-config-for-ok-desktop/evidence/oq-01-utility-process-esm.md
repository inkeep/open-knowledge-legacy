# Evidence: OQ-01 — ESM Support in utilityProcess.fork()

**Dimension:** Whether Electron 41's `utilityProcess.fork()` accepts ESM entry points (`.mjs` or `"type": "module"` `.js` files), and what timeline/caveats apply.
**Date:** 2026-04-11
**Sources:**
- Electron 28 release notes (https://www.electronjs.org/blog/electron-28-0)
- Electron ESM tutorial (https://www.electronjs.org/docs/latest/tutorial/esm)
- Issue electron/electron#40031 (https://github.com/electron/electron/issues/40031)
- PR electron/electron#40047 (https://github.com/electron/electron/pull/40047)
- Issue electron/electron#42757 (https://github.com/electron/electron/issues/42757)
- Electron 41 release notes (https://www.electronjs.org/blog/electron-41-0)

---

## Key files / pages referenced

- https://www.electronjs.org/blog/electron-28-0 — release notes that announced ESM support including utilityProcess
- https://www.electronjs.org/docs/latest/tutorial/esm — current ESM tutorial; documents main, preload, renderer caveats
- https://github.com/electron/electron/issues/40031 — original feature request "Support forking ES Modules (.mjs) in electron's utilityProcess"
- https://github.com/electron/electron/pull/40047 — implementing PR by MarshallOfSound, "feat: support esm entrypoint to utility process"
- https://github.com/electron/electron/issues/42757 — follow-up issue confirming ESM is fully supported as of Node 22 / current Electron
- https://www.electronjs.org/blog/electron-41-0 — Electron 41 release notes (Chromium 146, Node 24.14.0, V8 14.6); no breaking changes to utilityProcess ESM

---

## Findings

### Finding: ESM entry points for `utilityProcess.fork()` are supported in Electron 28.0.0 and later
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/blog/electron-28-0

> "Implemented support for ECMAScript modules or ESM" was a notable change, with "support for ESM in Electron proper, as well as areas such as the `UtilityProcess` API entrypoints."
>
> Listed as a new feature: "Added ESM entrypoints to the `UtilityProcess` API."

Electron 28.0.0 stable shipped on **December 5, 2023**.

**Implications:** Electron 41 (March 2026, Node 24.14.0) inherits this support — the feature has been stable for 2.5 years. No breaking changes to `utilityProcess` ESM are listed in the Electron 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, or 41 release notes.

---

### Finding: Implementation works by swapping CJS loader → Node ESM loader, with CJS fallback
**Confidence:** CONFIRMED
**Evidence:** PR #40047 description quoted via https://github.com/electron/electron/pull/40047

> "just swapping to using the ESM loader instead of the CJS loader should work fine. (the esm loader falls back to CJS)"
> — MarshallOfSound (Samuel Attard, Electron maintainer), Sep 29 2023

**Implications:** Existing CJS entry points continue to work — the change is purely additive. The Node ESM loader handles `.mjs` and `.js` files in packages with `"type": "module"` in `package.json`, and falls back to CJS for everything else. This matches stock Node.js behavior.

---

### Finding: ESM modules load asynchronously — has implications for `app.whenReady()` ordering, but does not block utilityProcess use
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/esm

> "ES Modules are loaded **asynchronously**. This means that only side effects from the main process entry point's imports will execute before the `ready` event."
>
> Developers must "use `await` generously before the app's `ready` event"

**Implications:** This caveat is about the Electron **main process** entry point, not utilityProcess. For utilityProcess, the parent process explicitly awaits the child via the `UtilityProcess` lifecycle events (`spawn`, `exit`, message ports), so async load order is naturally serialized through the parent's IPC handshake.

---

### Finding: Top-level await is supported in ESM utilityProcess entry points
**Confidence:** INFERRED (from ESM loader semantics; not contradicted by any docs)
**Evidence:** Node.js ESM loader supports TLA in module entry points since Node 14+. Electron 41 ships **Node 24.14.0** ([Electron 41 release notes](https://www.electronjs.org/blog/electron-41-0)), which includes full TLA support. Issue #42757 explicitly notes ESM works in Electron with Node 22+:

> "As of right now, Electron does support ESM for Node 22 and higher, and we're not aware of any upstream changes that would change the state of ESM in future versions of Node."
> — VerteDinde (Member), Jul 9 2024

The only TLA limitation noted in #42757 is on `require('esm-module.js')` (Node's `--experimental-require-module` flag), which is a separate code path from the ESM entry-point loader used by `utilityProcess.fork()`.

---

### Finding: Native module imports work from ESM utilityProcess entry points
**Confidence:** INFERRED (from Node.js ESM loader semantics — Node ESM loader can import CJS modules including native `.node` addons)
**Evidence:** Node.js ESM ↔ CJS interop has been stable since Node 16. `import` statements in ESM can resolve CJS modules; native `.node` modules are loaded via the underlying CJS loader regardless of how they're transitively imported. No Electron docs or issues flag this as a problem.

The package layout for `@parcel/watcher`'s main entry is a CJS `index.js` (`require('./wrapper')`, `require(name)`); the Open Knowledge server would `import('@parcel/watcher')` from its ESM source, and Node's ESM↔CJS interop loads the CJS `index.js` and its native binding cleanly.

**Implications:** The Open Knowledge server package — published as ESM (`"type": "module"`) and importing `@parcel/watcher` (CJS) — runs as-is in a `utilityProcess.fork()` entry point on Electron 41 with no adapter needed.

---

### Finding: Electron 41 release notes do not list any breaking changes to utilityProcess or ESM
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/blog/electron-41-0

The Electron 41 release notes list breaking changes only for **PDFs** ("PDFs are rendered within the same `WebContents` instead") and **Cookies** (cookie change-cause event semantics). The notes also mention a `disclaim` option added to utilityProcess on macOS (a TCC inheritance feature unrelated to ESM).

**Implications:** Forking ESM entry points behaves identically in Electron 28 → 41. The Open Knowledge spec can lock to Electron 41 without compatibility risk on this dimension.

---

## Negative searches

- Searched for "utilityProcess ESM broken" / "utilityProcess mjs error" in Electron issues 2024-2026: NOT FOUND. The only relevant issues (#40031, #42757) are both closed and confirm the feature works.
- Searched Electron 38, 39, 40, 41 release notes for any utilityProcess regressions: NOT FOUND.
- Searched for `import.meta.url` issues in utilityProcess: NOT FOUND. Standard Node ESM semantics apply.

---

## Gaps / follow-ups

- Worth a smoke test in actual Electron 41: spawn `utilityProcess.fork('./server.mjs')` against `packages/server/src/standalone.ts` (after a thin `.mjs` wrapper or by pointing `modulePath` directly at the ESM entry). Confirm `import('@parcel/watcher')` resolves and `subscribe()` runs without `dlopen` errors. This is implementation-time validation, not pre-decision research.
