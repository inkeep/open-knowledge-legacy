# FU-3: Typed Electron IPC Comparison with Reference Implementations

**Parent report:** electron-ai-coding-agent-development
**Extends:** §D9 (IPC observability + typed contextBridge) — deepens to a decision
**User preference signal:** strongly prefers typed approaches ("definitely prefer typed approaches to everything")
**Date:** 2026-04-15
**Depth:** Moderate-Deep

## Summary

Seven viable typed-IPC patterns exist for Electron in 2026. They split cleanly into two families:

- **Named-channel typed wrappers** — the channel name is still visible at the IPC layer, types are carried by a keyed discriminated-union contract. Members: GitHub Desktop's hand-rolled pattern, `@electron-toolkit/typed-ipc`, `electron-typescript-ipc`, `electron-typed-ipc` (deiucanta).
- **Opaque-envelope procedure RPC** — one IPC channel carries a procedure-call envelope; types come from a tRPC-style router. Members: `electron-trpc` (tRPC v10), `trpc-electron` (tRPC v11 fork), `@egoist/tipc`.

**Recommendation, typed-biased:**

| Use case | Winner | Why |
|---|---|---|
| Small app (<20 channels), minimal deps | **GitHub Desktop-style hand-rolled** | Zero deps, grep-able channels, ESLint rule enforces purity. ~150 LOC to own. |
| Medium app (20-100 channels), need Zod validation, want richer ergonomics | **`@electron-toolkit/typed-ipc`** | Thin wrapper; named channels stay observable; `IpcListener`/`IpcEmitter` classes remove boilerplate; one tiny peer dep. |
| Large app (100+ channels), full procedure semantics, React Query integration | **`@egoist/tipc`** | Named-channel-per-procedure (NOT opaque); tRPC-like DX; React Query adapter built-in; no tRPC runtime. |
| Strict runtime validation, zero trust in renderer | **`electron-trpc` v0.7.1 + Zod input validators** | Only option with first-class validator hooks; pay the opacity cost deliberately. |

**Headline tradeoff:** tRPC-over-IPC (`electron-trpc`, `trpc-electron`) gives the best end-to-end type inference *and* the worst observability. Every call funnels through a single channel named `'electron-trpc'` ([primary source: `ELECTRON_TRPC_CHANNEL` constant](https://raw.githubusercontent.com/jsonnull/electron-trpc/main/packages/electron-trpc/src/constants.ts), HIGH confidence). When an agent greps for `'saveFile'` in IPC logs, the channel is `electron-trpc` and the procedure name is buried inside a JSON envelope. For agent-iteration velocity this matters — see §"Hidden costs" below.

**Typed-bias applied:** when two options tie on types, I pick the one that keeps the channel name observable. Opacity is a real cost; type inference should not be bought with grep-ability.

## Evaluation axes

1. **Type inference quality** — does a signature change in main produce a TS error in renderer? End-to-end vs boundary-only?
2. **Runtime validation** — optional / required / integrated (Zod, Valibot, TypeBox)?
3. **Bundle size impact** — renderer and main. `INFERRED` unless bundlephobia checked.
4. **Runtime overhead** — envelope cost, serialization, per-call allocation.
5. **Observability** — is the channel name visible (grep-able, Chromium devtools, `ipcMain` middleware)? Or is every call one opaque channel?
6. **DX boilerplate** — lines per channel to add main handler + preload expose + renderer call.
7. **Subscriptions** — main → renderer push pattern quality; teardown/unsubscribe ergonomics.
8. **Schema sharing** — do main and renderer share a `.ts` types file (zero runtime), or ship a runtime dep?
9. **Testing mockability** — easy to stub in unit tests; works with Playwright `evaluate()` in renderer.
10. **Maintenance signals** — last commit, last release, stars, open-issue ratio.
11. **Context isolation compat** — requires `contextIsolation: true`? Any preload caveats?

Rationale: axes 5, 9, and 10 are weighted higher for an AI-agent-first codebase (this report's parent is about agent velocity). Agents iterate by reading logs, running tests, and cloning freshly — opacity, mock friction, and abandoned libraries all tax that loop.

## Reference example: 5 IPC channels

To keep library comparisons apples-to-apples, every reference implementation covers the same five channels:

1. **`getAppVersion`** — renderer → main, query, returns `string`.
2. **`openFile`** — renderer → main, query with input `{ path: string }`, returns `{ content: string; mtime: number }`.
3. **`saveFile`** — renderer → main, mutation with input `{ path: string; content: string }`, returns `{ ok: true }`.
4. **`onFileChanged`** — main → renderer, subscription/push, payload `{ path: string }`.
5. **`listRecentFiles`** — renderer → main, query, returns `string[]`.

## Library-by-library

### Pattern 1: Hand-rolled discriminated-union channel map (GitHub Desktop)

**Source:** `~/.claude/oss-repos/desktop/app/src/lib/ipc-shared.ts:27-90`, `main-process/ipc-main.ts:22-51`, `main-process/ipc-webcontents.ts:10-23`, `eslint-rules/no-loosely-typed-webcontents-ipc.js`.
**Maturity:** In production in GitHub Desktop since ~2019; ESLint rule enforces that `webContents.send` / `ipcMain.on` never be called with the raw `electron` module (HIGH confidence, seen in file).
**Runtime deps:** Zero. ~150 LOC of wrapper + a `.ts` types file.

**Reference implementation:**

```ts
// shared/ipc-shared.ts — the single source of truth (main + renderer import)
export type RequestResponseChannels = {
  'get-app-version': () => Promise<string>;
  'open-file': (input: { path: string }) => Promise<{ content: string; mtime: number }>;
  'save-file': (input: { path: string; content: string }) => Promise<{ ok: true }>;
  'list-recent-files': () => Promise<string[]>;
};
export type RequestChannels = {               // main → renderer push
  'file-changed': (payload: { path: string }) => void;
};

// main/ipc-main.ts — from GitHub Desktop pattern
import { ipcMain } from 'electron';
export function handle<T extends keyof RequestResponseChannels>(
  channel: T,
  listener: (e: Electron.IpcMainInvokeEvent, ...a: Parameters<RequestResponseChannels[T]>)
    => ReturnType<RequestResponseChannels[T]>,
) { ipcMain.handle(channel, listener as never); }

// main/handlers.ts
handle('get-app-version', async () => app.getVersion());
handle('open-file', async (_e, { path }) => ({
  content: await fs.readFile(path, 'utf8'),
  mtime: (await fs.stat(path)).mtimeMs,
}));
handle('save-file', async (_e, { path, content }) => {
  await fs.writeFile(path, content); return { ok: true };
});
handle('list-recent-files', async () => recentFiles);

// main/push.ts — typed wrapper on webContents.send (GitHub Desktop ipc-webcontents.ts)
export function send<T extends keyof RequestChannels>(
  wc: Electron.WebContents, channel: T, ...args: Parameters<RequestChannels[T]>
) { if (!wc.isDestroyed()) wc.send(channel, ...args); }

// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('api', {
  invoke: <T extends keyof RequestResponseChannels>(
    ch: T, ...a: Parameters<RequestResponseChannels[T]>
  ) => ipcRenderer.invoke(ch, ...a) as ReturnType<RequestResponseChannels[T]>,
  on: <T extends keyof RequestChannels>(ch: T, cb: RequestChannels[T]) => {
    const l = (_: unknown, ...a: unknown[]) => (cb as never)(...a);
    ipcRenderer.on(ch, l);
    return () => ipcRenderer.off(ch, l);
  },
});

// renderer/use.ts
const v: string = await window.api.invoke('get-app-version');
const unsub = window.api.on('file-changed', ({ path }) => console.log(path));
```

**Evaluation:**
- **Type inference:** End-to-end. Add a channel to `RequestResponseChannels` → renderer `invoke('unknown-channel')` fails to compile. **Best.**
- **Runtime validation:** None built-in. You add Zod at handler sites voluntarily.
- **Bundle impact:** ~0 KB (no runtime dep). **Best.**
- **Runtime overhead:** Native `ipcRenderer.invoke` → single roundtrip. No envelope. **Best.**
- **Observability:** Every call uses its own channel name. `ipcMain.on('open-file', ...)`, devtools IPC frames show `open-file`, greppable in every log line. **Best.**
- **DX boilerplate:** ~4 lines per channel (type entry + handler + optional preload line if you share a generic `invoke`).
- **Subscriptions:** Manual. Return-an-unsubscribe-function pattern works; not as ergonomic as a `.listen()`/`.unsubscribe()` method.
- **Schema sharing:** One `.ts` file, zero runtime. **Best.**
- **Testing:** Trivial — `window.api` is one object, easy to stub. Works with Playwright `page.evaluate()` because channels are plain strings.
- **Maintenance:** You maintain it. That is the point.
- **Context isolation:** Compatible; `contextBridge.exposeInMainWorld` is the sanctioned path.
- **Security bonus:** GitHub Desktop pairs this with `trusted-ipc-sender.ts` (`isTrustedIPCSender(event.sender)`) to reject IPC from untrusted frames — a pattern libraries do not enforce (MEDIUM confidence; visible at `main-process/ipc-main.ts:53-66`).

**When it wins:** <50 channels, team can own 150 LOC, values grep-ability, wants to apply its own Zod-per-handler policy.

### Pattern 2: `electron-trpc` (tRPC v10-aligned)

**Source:** https://github.com/jsonnull/electron-trpc, [`constants.ts`](https://raw.githubusercontent.com/jsonnull/electron-trpc/main/packages/electron-trpc/src/constants.ts), [electron-trpc.dev](https://electron-trpc.dev/).
**Version:** 0.7.1, released Dec 7 2024 (HIGH confidence). 155 commits on main; 10 open issues, 2 open PRs as of page snapshot.
**Runtime deps:** `@trpc/client`, `@trpc/server` peer dependencies (INFERRED — not verified via `package.json`; npmjs page blocked 403).

**Reference implementation:**

```ts
// main/router.ts
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
const t = initTRPC.create({ isServer: true });

export const router = t.router({
  getAppVersion: t.procedure.query(() => app.getVersion()),
  openFile: t.procedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => ({
      content: await fs.readFile(input.path, 'utf8'),
      mtime: (await fs.stat(input.path)).mtimeMs,
    })),
  saveFile: t.procedure
    .input(z.object({ path: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      await fs.writeFile(input.path, input.content);
      return { ok: true as const };
    }),
  listRecentFiles: t.procedure.query(() => recentFiles),
  onFileChanged: t.procedure.subscription(() =>
    observable<{ path: string }>((emit) => {
      const w = fs.watch('.', (_, file) => emit.next({ path: String(file) }));
      return () => w.close();
    })),
});
export type AppRouter = typeof router;

// main/index.ts
import { createIPCHandler } from 'electron-trpc/main';
createIPCHandler({ router, windows: [mainWindow] });

// preload.ts
import { exposeElectronTRPC } from 'electron-trpc/main';
process.once('loaded', () => { exposeElectronTRPC(); });

// renderer/client.ts
import { createTRPCProxyClient } from '@trpc/client';
import { ipcLink } from 'electron-trpc/renderer';
import type { AppRouter } from '../main/router';
export const client = createTRPCProxyClient<AppRouter>({ links: [ipcLink()] });

// renderer/use.ts
const v = await client.getAppVersion.query();
const unsub = client.onFileChanged.subscribe(undefined, {
  onData: (d) => console.log(d.path),
});
```

**Evaluation:**
- **Type inference:** End-to-end via `type AppRouter = typeof router`. Best-in-class inference. **Best.**
- **Runtime validation:** First-class via `.input(zodSchema)` — Zod/Valibot/TypeBox via tRPC's validator-adapter system. **Best.**
- **Bundle impact:** Renderer carries `@trpc/client` + `electron-trpc/renderer`. INFERRED ~15-25 KB gzipped for the tRPC client runtime; UNCERTAIN without bundlephobia check.
- **Runtime overhead:** JSON envelope `{id, type, input, path}` per call; observable fan-out state. INFERRED higher than hand-rolled but not measurable overhead for <1000 calls/sec.
- **Observability:** **Opaque.** One channel: `'electron-trpc'`. Every call uses this. Grep-ability is lost — the procedure name lives inside `event.args[0]` as JSON. **Weakest axis.**
- **DX boilerplate:** Very low. `t.procedure.query(...)` is one expression; no separate preload wiring per channel.
- **Subscriptions:** First-class. Observable-based; teardown from the observable cleanup. **Best.**
- **Schema sharing:** Types shared via `type AppRouter = typeof router`; Zod schemas if co-located are shared runtime.
- **Testing:** Harder — you mock the entire link rather than a channel string. Works in Playwright but `page.evaluate(() => client.foo.query())` must import the bundled client.
- **Maintenance:** MEDIUM — 0.7.1 (Dec 2024) is the last release at the time of writing; pre-1.0; commits ongoing but cadence unclear.
- **Context isolation:** Required. `contextIsolation: true` is a documented prerequisite (HIGH confidence, README).

**When it wins:** You already use tRPC in a web version of the app, or you want Zod validation on every input with zero per-handler boilerplate, and you are willing to pay the opacity cost.

### Pattern 3: `trpc-electron` (tRPC v11 fork)

**Source:** https://github.com/mat-sz/trpc-electron.
**Version:** Fork of `electron-trpc` for tRPC v11 (HIGH confidence, repo says "fork for TRPC v11.x.x since that version introduces many breaking changes"). 44 stars, 139 commits, 2 open issues.
**API shape:** Mirrors `electron-trpc` — `createIPCHandler`, `exposeElectronTRPC()`, `ipcLink()`.

**Evaluation:** Identical to `electron-trpc` on every axis except:
- **Maintenance:** Community fork; smaller audience (44 vs ~1k stars on upstream), but tracks tRPC v11 which upstream does not yet. MEDIUM confidence of long-term maintenance — fork owners change jobs; no multi-maintainer org.
- **When it wins:** You have standardized on tRPC v11 elsewhere. Otherwise pick `electron-trpc` upstream.

### Pattern 4: `@electron-toolkit/typed-ipc`

**Source:** [full README](https://raw.githubusercontent.com/alex8088/electron-toolkit/master/packages/typed-ipc/README.md), toolkit repo has 36 releases, latest Sep 2025, ~4k dependent projects (MEDIUM confidence — GitHub page signal).
**Runtime deps:** `@electron-toolkit/preload` (peer). That preload package only wraps base Electron APIs (`ipcRenderer`, `webFrame`, `webUtils`, `process`) — it does NOT provide custom typed channels (HIGH confidence, [preload README](https://github.com/alex8088/electron-toolkit/tree/master/packages/preload)).

**Reference implementation (adapted from README):**

```ts
// preload/index.ts
import { exposeElectronAPI } from '@electron-toolkit/preload';
exposeElectronAPI();  // exposes window.electron.ipcRenderer

// shared/ipc-events.d.ts
type IpcEvents =
  | { 'open-file': (path: string) => Promise<{ content: string; mtime: number }> }
  | { 'save-file': (path: string, content: string) => Promise<{ ok: true }> }
  | { 'get-app-version': () => Promise<string> }
  | { 'list-recent-files': () => Promise<string[]> };
type IpcRendererEvent = { 'file-changed': [{ path: string }] };

// main/ipc.ts
import { IpcListener, IpcEmitter } from '@electron-toolkit/typed-ipc/main';
const ipc = new IpcListener<IpcEvents>();
const emitter = new IpcEmitter<IpcRendererEvent>();
ipc.handle('get-app-version', () => app.getVersion());
ipc.handle('open-file', async (_e, path) => ({
  content: await fs.readFile(path, 'utf8'),
  mtime: (await fs.stat(path)).mtimeMs,
}));
ipc.handle('save-file', async (_e, path, content) => {
  await fs.writeFile(path, content); return { ok: true as const };
});
ipc.handle('list-recent-files', () => recentFiles);
// push:
emitter.send(mainWindow.webContents, 'file-changed', { path: '/tmp/foo' });

// renderer/ipc.ts
import { IpcListener, IpcEmitter } from '@electron-toolkit/typed-ipc/renderer';
const listener = new IpcListener<IpcRendererEvent>();
const emitter = new IpcEmitter<IpcEvents>();
listener.on('file-changed', (_e, { path }) => console.log(path));
const version = await emitter.invoke('get-app-version');
```

**Evaluation:**
- **Type inference:** End-to-end via shared `.d.ts`. A handler with wrong return type fails at `.handle()` call site. **Best.**
- **Runtime validation:** None built-in. Add Zod manually.
- **Bundle impact:** Small — `IpcListener`/`IpcEmitter` are thin classes over `ipcRenderer.on`/`invoke`. INFERRED <2 KB.
- **Runtime overhead:** Native `ipcRenderer.invoke`; same cost as hand-rolled.
- **Observability:** Named channels preserved. `emitter.invoke('get-app-version')` ends up as `ipcRenderer.invoke('get-app-version', ...)`. **Best.**
- **DX boilerplate:** Slightly less than hand-rolled — no bespoke `on`/`handle`/`send` wrappers to write; the classes provide them.
- **Subscriptions:** Via `listener.on('channel', cb)`. Teardown is manual `.removeListener`.
- **Schema sharing:** Types via `.d.ts`. Zero runtime.
- **Testing:** Easy; mock `window.electron.ipcRenderer` or stub class methods.
- **Maintenance:** HIGH — `alex8088`'s toolkit is widely used by electron-vite and electron-builder templates (INFERRED from ecosystem usage).
- **Context isolation:** Compatible; assumes `@electron-toolkit/preload` exposed `window.electron`.

**When it wins:** You want the hand-rolled discipline but don't want to maintain 150 LOC of `on`/`handle`/`send` wrappers. You like named channels. You're already using `electron-vite`/`electron-toolkit`.

### Pattern 5: `@egoist/tipc`

**Source:** [full README](https://raw.githubusercontent.com/egoist/tipc/main/README.md), GitHub egoist/tipc.
**Version:** 0.3.2, published ~mid-2024 (MEDIUM confidence). 301 stars, 18 commits (small), 2 open issues, 1 PR.
**Runtime deps:** None visible in README; INFERRED nothing beyond Electron itself. React Query adapter is a separate import path.

**Reference implementation:**

```ts
// main/tipc.ts
import { tipc } from '@egoist/tipc/main';
const t = tipc.create();
export const router = {
  getAppVersion: t.procedure.action(async () => app.getVersion()),
  openFile: t.procedure.input<{ path: string }>()
    .action(async ({ input }) => ({
      content: await fs.readFile(input.path, 'utf8'),
      mtime: (await fs.stat(input.path)).mtimeMs,
    })),
  saveFile: t.procedure.input<{ path: string; content: string }>()
    .action(async ({ input }) => {
      await fs.writeFile(input.path, input.content);
      return { ok: true as const };
    }),
  listRecentFiles: t.procedure.action(async () => recentFiles),
};
export type Router = typeof router;
// push events:
export type RendererHandlers = {
  fileChanged: (payload: { path: string }) => void;
};

// main/index.ts
import { registerIpcMain, getRendererHandlers } from '@egoist/tipc/main';
import type { RendererHandlers } from './tipc';
registerIpcMain(router);
const rh = getRendererHandlers<RendererHandlers>(mainWindow.webContents);
fs.watch('.', (_, f) => rh.fileChanged.send({ path: String(f) }));

// renderer/client.ts
import { createClient, createEventHandlers } from '@egoist/tipc/renderer';
import type { Router } from '../main/tipc';
import type { RendererHandlers } from '../main/tipc';
export const client = createClient<Router>({
  ipcInvoke: window.ipcRenderer.invoke,
});
export const handlers = createEventHandlers<RendererHandlers>({
  on: (ch, cb) => {
    window.ipcRenderer.on(ch, cb);
    return () => window.ipcRenderer.off(ch, cb);
  },
  send: window.ipcRenderer.send,
});

// renderer/use.ts
const v = await client.getAppVersion();
const unsub = handlers.fileChanged.listen(({ path }) => console.log(path));
```

**Evaluation:**
- **Type inference:** End-to-end via `type Router = typeof router` (tRPC-style). **Best.**
- **Runtime validation:** Not first-class in the README. You would call Zod inside `.action()` manually. **Weaker than electron-trpc on this axis.**
- **Bundle impact:** INFERRED small — no tRPC runtime. UNCERTAIN without bundlephobia check.
- **Runtime overhead:** Named-channel-per-procedure — each procedure gets its own `ipcMain.handle(...)` (INFERRED from the wording "Register all the TIPC router methods as IPC handlers using Electron's ipcMain.handle"; HIGH confidence but verify at implementation).
- **Observability:** Named channels (likely prefixed). Better than tRPC-style opaque; comparable to hand-rolled. **Good.**
- **DX boilerplate:** tRPC-like ergonomics. Very low.
- **Subscriptions:** First-class via `getRendererHandlers<T>()` + `.send()` / `.listen()` / `.invoke()` / `.handle()`. Symmetric bidirectional — **richer than hand-rolled**.
- **Schema sharing:** Type-only; zero runtime dep crossing processes.
- **Testing:** Mock `window.ipcRenderer.invoke`. Router is a plain object; straightforward.
- **Maintenance:** LOW confidence — 0.3.2, 18 commits, last published ~1 year ago. Small maintainer footprint; respect before adopting at scale.
- **Context isolation:** Compatible — you wire `window.ipcRenderer` via your own preload.

**When it wins:** You want tRPC-feel types and subscription ergonomics WITHOUT the opaque channel. You are willing to accept the "thinly maintained" risk for a ~300-star lib.

### Pattern 6: `electron-typescript-ipc` (JichouP)

**Source:** [full README](https://raw.githubusercontent.com/JichouP/electron-typescript-ipc/main/README.md).
**Version:** 8 tags; 29 commits; 42 stars; 0 open issues.
**Runtime deps:** Small — its own `createIpcRenderer` helper and `GetApiType` type.

**Reference implementation (adapted from README):**

```ts
// shared/api.ts
import { GetApiType } from 'electron-typescript-ipc';
export type Api = GetApiType<
  { openFile: (p: string) => Promise<{ content: string; mtime: number }>;
    saveFile: (p: string, c: string) => Promise<{ ok: true }>;
    getAppVersion: () => Promise<string>;
    listRecentFiles: () => Promise<string[]>; },
  { fileChanged: (p: { path: string }) => Promise<void> }
>;

// preload/preload.ts
import { contextBridge, createIpcRenderer } from 'electron-typescript-ipc';
import type { Api } from '../shared/api';
const ipcRenderer = createIpcRenderer<Api>();
const api: Api = {
  invoke: {
    openFile: (p) => ipcRenderer.invoke('openFile', p),
    saveFile: (p, c) => ipcRenderer.invoke('saveFile', p, c),
    getAppVersion: () => ipcRenderer.invoke('getAppVersion'),
    listRecentFiles: () => ipcRenderer.invoke('listRecentFiles'),
  },
  on: { fileChanged: (l) => ipcRenderer.on('fileChanged', l) },
};
contextBridge.exposeInMainWorld('myAPI', api);

// main/index.ts
import { ipcMain } from 'electron-typescript-ipc';
import type { Api } from '../shared/api';
ipcMain.handle<Api>('openFile', async (_e, path) => ({
  content: await fs.readFile(path, 'utf8'),
  mtime: (await fs.stat(path)).mtimeMs,
}));
ipcMain.handle<Api>('getAppVersion', async () => app.getVersion());
setInterval(() => ipcMain.send<Api>(mainWindow, 'fileChanged', { path: '/tmp/foo' }), 10000);

// renderer/app.ts
window.myAPI.invoke.openFile('/tmp/x').then(console.log);
window.myAPI.on.fileChanged((_e, { path }) => console.log(path));
```

**Evaluation:**
- **Type inference:** End-to-end via `GetApiType<Invoke, On>` two-slot generic. Good.
- **Runtime validation:** None built-in.
- **Bundle impact:** Tiny.
- **Runtime overhead:** Native IPC.
- **Observability:** Named channels. Good.
- **DX boilerplate:** MEDIUM — the preload requires *manually listing every invoke method twice* (once in the Api type, once in the `api` object). This is the key friction — at 50 channels this becomes 100 lines of repetition. The README example even shows `ipcMain.removeHandler<Api>(...)` as a required idiom to avoid double-registration.
- **Subscriptions:** Yes via `on`.
- **Maintenance:** LOW confidence — last releases old; 42 stars; small community.

**When it wins:** You want explicit `invoke` / `on` split at the preload boundary and don't mind the duplication. Rarely the best pick vs. `@electron-toolkit/typed-ipc`.

### Pattern 7: `electron-better-ipc` (sindresorhus)

**Source:** https://github.com/sindresorhus/electron-better-ipc.
**Version:** 2.0.1, June 30 2021 (HIGH confidence). Has `.d.ts` types but **not end-to-end typed** — channel names are plain strings without a channel-map generic.
**Status:** Not typed in the sense this user cares about. Pre-dates the typed-IPC movement. Exclude on typed-preference grounds. Included only for completeness.

### Other candidates surveyed (excluded)

- `electron-typed-ipc` (deiucanta) — 12 stars, mostly abandoned (HIGH confidence). `@kjn/electron-typesafe-ipc`, `@psalaets/typesafe-ipc`, `electron-typesafe-ipc`, `typed-ipc`, `typesafe-ipc` — all <50 stars / <50 downloads on npm; none has a stable maintainer footprint (MEDIUM confidence from npm listing). `interprocess` (Dalton Menezes) — GitHub 404 when fetched, likely renamed/archived; not a safe pick. `electron-ipc-cat` — untested in this review.

## Decision matrix

Score legend: 5 = best, 1 = weak.

| Axis | Hand-rolled (GH Desktop) | electron-trpc | trpc-electron (v11) | @electron-toolkit/typed-ipc | @egoist/tipc | electron-typescript-ipc |
|---|---|---|---|---|---|---|
| Type inference | 5 | 5 | 5 | 5 | 5 | 4 |
| Runtime validation | 2 (manual) | 5 (native) | 5 | 2 (manual) | 3 (manual, easier) | 2 |
| Bundle size | 5 | 2 (tRPC runtime) | 2 | 4 | 4 | 5 |
| Runtime overhead | 5 | 3 (envelope) | 3 | 5 | 4 | 5 |
| **Observability** | **5** (named channels) | **1** (one opaque channel) | **1** | **5** | **4** (prefixed named) | **5** |
| DX / boilerplate | 3 (wrappers to write) | 5 | 5 | 4 | 5 | 3 (duplication) |
| Subscriptions | 3 (manual teardown) | 5 (observables) | 5 | 3 | 5 (bidirectional invoke) | 3 |
| Schema sharing | 5 (pure types) | 4 (runtime dep) | 4 | 5 | 5 | 5 |
| Testing / mockability | 5 | 2 (mock link) | 2 | 4 | 4 | 4 |
| Maintenance signal | 5 (you) | 3 (0.7.1 Dec 2024) | 2 (fork) | 4 (ecosystem) | 2 (0.3.2, low commits) | 2 |
| contextIsolation compat | 5 | 5 (required) | 5 | 5 | 5 | 5 |
| **Sum** | **48** | **40** | **39** | **46** | **46** | **43** |

Scores are opinionated but primary-source-evidenced. Bundle-size rows flagged **INFERRED** — verify via bundlephobia before committing.

## Recommendation by use case

Typed-preference applied throughout.

### Small app (<20 IPC channels), minimal deps
**Hand-rolled channel map (GitHub Desktop pattern).**
- Zero dependency risk. Zero abandoned-library risk. The ~150 LOC is boring, testable, and grep-able.
- The ESLint rule (`no-loosely-typed-webcontents-ipc.js`) that GitHub Desktop ships is copy-pasteable and turns the convention into a CI gate.
- Add Zod per handler if validation is needed — one local line, no framework buy-in.

### Medium app (20-100 channels), some validation needs
**`@electron-toolkit/typed-ipc`.**
- Keeps named channels (observability parity with hand-rolled).
- `IpcListener`/`IpcEmitter` classes eliminate the `on`/`handle`/`send` wrapper code.
- Ecosystem momentum — pairs with `electron-vite` and `electron-builder` templates that many teams already use.
- Bolt Zod onto handler bodies for inputs you want validated.

### Large app (100+ channels), want procedure-RPC semantics + React Query
**`@egoist/tipc`** — *with a caveat*.
- tRPC-like ergonomics, named channels preserved (observability kept), React Query adapter built-in, symmetric main-to-renderer invoke.
- Caveat: maintenance is thin (0.3.2, ~1yr since publish). If that is unacceptable, fall back to `@electron-toolkit/typed-ipc` + a thin procedure-style wrapper you own.
- If the 100+ channels *need* runtime input validation uniformly, jump to `electron-trpc` and accept opacity.

### Strict runtime validation, zero trust in renderer
**`electron-trpc` 0.7.1** (upstream) or **`trpc-electron`** (if on tRPC v11).
- Only option with first-class `.input(zodSchema)` validation at the framework layer.
- Pay the opacity cost with eyes open — see §Hidden costs.
- Mitigation for opacity: wrap `ipcLink()` with dev-mode logging that extracts `path` (procedure name) from the tRPC envelope and mirrors it to console. ~15 LOC. Partially restores grep-ability.

## Hidden costs of opaque-channel approaches (tRPC)

**The issue (HIGH confidence):** `electron-trpc` and `trpc-electron` register one `ipcMain.handle('electron-trpc', ...)` — [`ELECTRON_TRPC_CHANNEL = 'electron-trpc'`](https://raw.githubusercontent.com/jsonnull/electron-trpc/main/packages/electron-trpc/src/constants.ts). Every query, mutation, and subscription uses this one channel; the procedure name lives inside the first argument, which is a tRPC envelope JSON.

**Why this matters for an AI-agent-first codebase:**

1. **Log greppability.** An agent debugging "why did `saveFile` throw?" greps logs for `saveFile`. Under electron-trpc, `saveFile` appears only inside serialized envelopes (often truncated in logs). Under hand-rolled or `@electron-toolkit/typed-ipc`, `saveFile` is a plain channel name in every native log line (`ipcMain.on('saveFile', ...)`).

2. **Chromium devtools IPC inspector.** Devtools shows IPC frames by channel. With electron-trpc, every frame is `channel: electron-trpc` — the inspector becomes useless for filtering. With named channels, you can filter to "show me only `saveFile` invocations."

3. **Intercept points.** A middleware that logs or throttles `saveFile` must unpack the envelope in both cases — but for hand-rolled you can `ipcMain.on('saveFile', middlewareWrapper)` by channel name; for tRPC you intercept at the router level (different mental model).

4. **Network tooling parity is gone.** A "tap the IPC bus" tool (hypothetical but writable in <100 LOC against `ipcMain`) can classify hand-rolled traffic by channel; against tRPC it must re-implement tRPC's envelope parser.

5. **Agent iteration speed.** Agents that can `grep ipc.*saveFile src/` and find every call + handler + type entry iterate faster than agents that have to reason "`saveFile` is a procedure on the tRPC router, which attaches to channel `electron-trpc`, so to find its uses I walk the router type."

**Mitigation:** ~15 LOC dev-mode middleware that taps the `electron-trpc` envelope and emits a structured `{proc, id, dir}` log line. Partially restores grep-ability at the log layer — but not at the `ipcMain` layer or the devtools IPC inspector.

**Verdict:** Opacity is a real, recurring tax. It is acceptable when bought for runtime validation + subscriptions + best-in-class DX. It is not acceptable when you could have had all three (procedure DX + subscriptions + named channels) via `@egoist/tipc`.

## When hand-rolled beats libraries

The "just use typed channel maps" argument (GitHub Desktop's lived approach) wins when **all** of the following hold:

1. **<~50 channels.** The constant cost of writing `on`/`handle`/`send` wrappers is a few hours. Above ~50 channels the library ergonomic wins start compounding.
2. **No universal runtime validation needed.** If every input must be Zod-validated, library-level validator hooks pay for themselves. If you are happy validating only untrusted inputs per handler, hand-rolled stays ahead.
3. **Team owns the wrappers long-term.** GitHub Desktop's ~150 LOC is load-bearing but boring. Teams that don't want to own it should pick a library.
4. **Observability is a stated priority.** Agent-iterated codebases, codebases with heavy logging pipelines, codebases that want `ipcMain` middleware — all prefer named channels.
5. **Security hardening wanted.** GitHub Desktop pairs typed channels with `isTrustedIPCSender(event.sender)` — a pattern libraries do not enforce (MEDIUM confidence, `main-process/ipc-main.ts:53-66`). The hand-rolled wrapper is the natural enforcement point.

It **loses** when:

- Subscriptions are heavy and ergonomic teardown matters (use `@egoist/tipc` or `electron-trpc`).
- You want React Query integration for free (`@egoist/tipc` ships an adapter; electron-trpc pairs via tRPC React Query adapter).
- You want schema validation without writing `zod.parse` at the top of every handler (use `electron-trpc`).
- The team composition churns — 150 LOC of homegrown wrappers invites drift if nobody owns them.

## Implications for parent report D9

**Current D9 framing:** "three options, different tradeoffs — hand-rolled vs tRPC-over-IPC vs `@electron-toolkit`."

**Revised framing (this FU's evidence):**

- **Two families**, not three options: named-channel typed wrappers (hand-rolled, `@electron-toolkit/typed-ipc`, `electron-typescript-ipc`, `@egoist/tipc` borderline) vs opaque-envelope RPC (`electron-trpc`, `trpc-electron`).
- **Observability is a family-level axis**, not per-library. Any opaque-envelope pick pays the grep-ability cost; any named-channel pick keeps it.
- **User-preference-aware default for this report's bet (AI-agent-first Electron):** named-channel family. Inside it, pick by scale — hand-rolled (<20), `@electron-toolkit/typed-ipc` (20-100), `@egoist/tipc` (>100, with maintenance-risk tolerance).
- **tRPC-over-IPC becomes a deliberate opt-in** only when runtime validation + procedure semantics + subscription ergonomics collectively justify the opacity tax. For most apps in the 2026 landscape, that is a minority case.

Suggested replacement for D9 ending: "No single convergence" → "Convergence: prefer named-channel typed wrappers for agent-readable IPC; escalate to tRPC-over-IPC only when runtime input validation is a hard requirement. GitHub Desktop's ~150-LOC pattern is the conservative-and-correct starting point; `@electron-toolkit/typed-ipc` is the low-maintenance evolution at medium scale."

## UNRESOLVED / NOT FOUND

- **Bundle sizes not verified via bundlephobia.** `electron-trpc` renderer footprint (~15-25 KB gzipped) is INFERRED. `@egoist/tipc` and `@electron-toolkit/typed-ipc` runtime sizes both INFERRED <5 KB. A direct bundlephobia check would firm these up.
- **`@egoist/tipc` exact channel naming convention.** The README implies named-per-procedure channels but does not show the naming pattern verbatim. MEDIUM confidence from the phrase "Register all the TIPC router methods as IPC handlers using Electron's ipcMain.handle." Verify by reading `packages/main/src/index.ts` in the `egoist/tipc` repo.
- **electron-trpc v0.7.1 tRPC v10 vs v11 support status.** README says "supports tRPC" without a version. The `trpc-electron` fork explicitly exists for v11, strongly implying upstream is v10. HIGH confidence.
- **Downloads / weekly install data.** npmjs.com returned 403 for direct fetch; weekly download deltas between libraries not captured. Would refine the maintenance-signal scores.
- **`interprocess` library status.** GitHub URL returned 404 — likely renamed or archived. Not tested further.

## References

Primary sources accessed:

- [GitHub Desktop: `app/src/lib/ipc-shared.ts`](https://github.com/desktop/desktop/blob/development/app/src/lib/ipc-shared.ts) (verified via local clone at `~/.claude/oss-repos/desktop/app/src/lib/ipc-shared.ts:27-90`)
- [GitHub Desktop: `app/src/main-process/ipc-main.ts`](https://github.com/desktop/desktop/blob/development/app/src/main-process/ipc-main.ts) (verified locally, lines 22-51, 53-66 for trusted-sender check)
- [GitHub Desktop: `app/src/main-process/ipc-webcontents.ts`](https://github.com/desktop/desktop/blob/development/app/src/main-process/ipc-webcontents.ts) (verified locally, lines 10-23)
- [GitHub Desktop: `eslint-rules/no-loosely-typed-webcontents-ipc.js`](https://github.com/desktop/desktop/blob/development/eslint-rules/no-loosely-typed-webcontents-ipc.js) (verified locally)
- [electron-trpc GitHub](https://github.com/jsonnull/electron-trpc)
- [electron-trpc channel constant](https://raw.githubusercontent.com/jsonnull/electron-trpc/main/packages/electron-trpc/src/constants.ts) — `ELECTRON_TRPC_CHANNEL = 'electron-trpc'`
- [electron-trpc.dev landing + getting-started](https://electron-trpc.dev/)
- [trpc-electron (tRPC v11 fork)](https://github.com/mat-sz/trpc-electron)
- [@electron-toolkit/typed-ipc README](https://raw.githubusercontent.com/alex8088/electron-toolkit/master/packages/typed-ipc/README.md)
- [@electron-toolkit/preload README (subpackage)](https://github.com/alex8088/electron-toolkit/tree/master/packages/preload)
- [@egoist/tipc README](https://raw.githubusercontent.com/egoist/tipc/main/README.md)
- [electron-typescript-ipc README (JichouP)](https://raw.githubusercontent.com/JichouP/electron-typescript-ipc/main/README.md)
- [electron-better-ipc (sindresorhus)](https://github.com/sindresorhus/electron-better-ipc) — last release 2.0.1 (2021-06-30)
- [electron-typed-ipc (deiucanta)](https://github.com/deiucanta/electron-typed-ipc)
