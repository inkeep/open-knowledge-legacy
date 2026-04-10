# Evidence: Developer Experience (D6)

**Dimension:** npx/bunx, package publishing, debugging, error messages, ecosystem maturity
**Date:** 2026-04-03
**Sources:** Bun documentation, developer reports, comparison articles

---

## Key files / pages referenced

- [bunx docs](https://bun.com/docs/pm/bunx) -- bunx vs npx
- [NPX executables with Bun](https://runspired.com/2025/01/25/npx-executables-with-bun.html) -- Cross-runtime publishing
- [Bun debugging docs](https://bun.sh/docs/runtime/debugger) -- Debugger support
- [Bun VS Code extension](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode) -- IDE integration
- [Bun VS Code debugging discussion](https://github.com/oven-sh/bun/discussions/8104) -- Community experience

---

## Findings

### Finding: npx and bunx both work for npm-published packages
**Confidence:** CONFIRMED
**Evidence:** [bunx docs](https://bun.com/docs/pm/bunx), [NPX with Bun guide](https://runspired.com/2025/01/25/npx-executables-with-bun.html)

A package published to npm with a `bin` field works with both `npx` and `bunx`. The package.json bin entry is runtime-agnostic:
```json
{ "bin": { "openknowledge": "./dist/cli.js" } }
```

npx runs it with Node.js; bunx runs it with Bun (or Node.js if --bun flag not used).

For users: `npx openknowledge` works regardless. Users with Bun installed can use `bunx openknowledge` for faster execution.

**Implications:** Single npm publish serves both user bases. No conditional packaging needed.

### Finding: Bun debugging is functional but less mature than Node.js
**Confidence:** CONFIRMED
**Evidence:** [Bun debugging docs](https://bun.sh/docs/runtime/debugger), [VS Code discussion](https://github.com/oven-sh/bun/discussions/8104)

Bun debugging support:
- VS Code extension available (oven.bun-vscode)
- WebKit Web Inspector at debug.bun.sh
- Breakpoints work but require `stopOnEntry: true` and `--inspect-wait` for reliable binding
- Source maps are auto-generated for transpiled TypeScript

Known issues:
- "Bun is much harder to debug compared to NodeJS"
- Breakpoints can fail with complex dev servers (Vite/Nuxt)
- Web Inspector is WebKit-based (different UX from Chrome DevTools)

Node.js debugging:
- Mature Chrome DevTools integration
- Reliable breakpoints
- Extensive VS Code support (built-in)
- Well-documented workflows

**Implications:** For development of the knowledge platform itself, debugging is an ongoing activity. Node.js has a significantly better debugging experience. For end users running the product, debugging is rarely needed.

### Finding: Bun async stack traces are significantly worse than Node.js
**Confidence:** CONFIRMED
**Evidence:** Community reports, [Hacker News discussion](https://www.draconianoverlord.com/2025/04/17/fixing-async-stack-traces.html/)

"Bun async stack traces are pretty terrible. Node & V8 have put significant effort into stack traces DX over the years, while Bun and/or JavaScriptCore just don't have the same capabilities/ergonomics yet."

Synchronous error formatting is good (V8-compatible format, syntax-highlighted source preview). But async operations (which dominate a server application) produce less useful traces.

**Implications:** When debugging server issues (WebSocket errors, file system failures, git operation errors), developers will have a harder time tracing the root cause in Bun. This is a meaningful DX disadvantage for an actively-developed OSS project.

### Finding: Bun error messages include syntax-highlighted source previews
**Confidence:** CONFIRMED
**Evidence:** [Bun docs](https://bun.sh/docs/runtime/debugger)

Bun prints a syntax-highlighted preview of the source code where the error occurred. This is a DX improvement over Node.js's plain text stack traces.

Bun also formats error.stack identically to Node.js's V8 format for synchronous errors.

**Implications:** First-impression error DX is good. The issue is with async traces in production debugging scenarios.

### Finding: Single package can serve both npx and bunx users
**Confidence:** CONFIRMED
**Evidence:** [bunx docs](https://bun.com/docs/pm/bunx), npm package conventions

Standard npm package publishing with a `bin` field:
1. `npx openknowledge` -- npm downloads, Node.js executes
2. `bunx openknowledge` -- Bun downloads and executes (faster)
3. `bunx --bun openknowledge` -- Forces Bun runtime even if shebang says node

No separate build or package needed. The same JavaScript/compiled output works on both runtimes.

**Implications:** Zero publishing overhead for supporting both runtimes.

---

## Gaps / follow-ups

* VS Code debugging with Bun + Hocuspocus WebSocket connections not tested
* Error message quality for specific failure modes (git errors, CRDT merge conflicts) not compared
