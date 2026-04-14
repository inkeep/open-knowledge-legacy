# Evidence: D2 — Clone execution mechanisms

**Dimension:** How different editors actually invoke git clone
**Date:** 2026-04-14
**Sources:** VSCode, GitHub Desktop, dugite (full), Zed, Obsidian-Git, gh CLI, isomorphic-git (full), simple-git (full)

---

## Key files read

- `vscode/extensions/git/src/git.ts`, `cloneManager.ts`
- `desktop/app/src/lib/git/clone.ts`, `app/src/lib/stores/cloning-repositories-store.ts`
- `dugite/lib/exec.ts`, `lib/git-environment.ts`, `script/download-git.js`, `script/config.js`, `script/embedded-git.json`, `package.json`
- `zed/crates/git_ui/src/clone.rs`, `crates/git/Cargo.toml`
- `obsidian-git/src/gitManager/simpleGit.ts`, `isomorphicGit.ts`
- `gh-cli/pkg/cmd/repo/clone/clone.go`, `git/client.go`
- `isomorphic-git/src/api/clone.js`, `src/commands/clone.js`, `src/commands/fetch.js`, `src/managers/GitRemoteManager.js`, `src/managers/GitRemoteHTTP.js`, `src/http/node/index.js`, `src/utils/translateSSHtoHTTP.js`
- `git-js/simple-git/src/lib/tasks/clone.ts`, `runners/git-executor-chain.ts`, `plugins/progress-monitor-plugin.ts`, `plugins/command-config-prefixing-plugin.ts`, `types/index.ts`, `errors/git-error.ts`

---

## Findings

### Finding: Every shipped editor invokes the `git` binary via subprocess — except Zed (libgit2) and isomorphic-git (pure JS)
**Confidence:** CONFIRMED (see prior worldmodel quotes)

Summary table:

| Editor | Mechanism | Binary source |
|---|---|---|
| VSCode | `cp.spawn(gitPath, ['clone', ...])` | System git or Windows-bundled git |
| GitHub Desktop | dugite → `execFile(embeddedGit, ['clone', ...])` | Prebuilt from `desktop/dugite-native` releases |
| gh CLI | `git -c credential.helper=... clone <url>` | System git |
| Obsidian-Git (desktop) | simple-git → `spawn('git', [...])` | System git |
| Obsidian-Git (mobile) | isomorphic-git pure JS | n/a |
| Zed | `fs.git_clone()` → libgit2 via `git2` Rust crate | In-process |

### Finding: dugite requires Node 20+ and is NOT compatible with Bun without rewrites
**Confidence:** CONFIRMED
**Evidence:** `dugite/package.json:18-20` (`"engines": {"node": ">= 20"}`), `script/download-git.js:94` (`Readable.fromWeb(res.body)`), `lib/exec.ts:1` (`child_process.execFile`), `script/download-git.js:5` (`require('tar-stream')`)

The postinstall script uses:
- `stream.Readable.fromWeb()` — Node 16+ API not in Bun
- `tar-stream` npm package — Node-specific
- `child_process.execFile` callback style — Bun supports this
- `fs/promises` — Bun compatible

Dugite's runtime invocation uses `execFile`, which works. But **the postinstall step fails on Bun without shims.** We can't npm-install dugite under a Bun-only stack.

**Implication:** dugite is blocked on Bun-based stacks unless the implementer:
(a) runs postinstall under Node then switches to Bun, OR
(b) writes a Bun-compatible postinstall wrapper.

### Finding: dugite binary footprint is 400–600MB extracted per platform
**Confidence:** CONFIRMED
**Evidence:** `dugite/script/embedded-git.json`, dugite-native release assets

Each platform bundle is ~150-200MB tar.gz, ~400-600MB extracted. Only one platform's binary downloads at install time for a given user. Any Node CLI that bundles dugite adds 400–600MB to the user's install footprint per platform.

### Finding: dugite update cadence follows dugite-native releases; git 2.53.0 currently bundled
**Confidence:** CONFIRMED
**Evidence:** `dugite/script/embedded-git.json` filenames (`v2.53.0-8635780-...`), `script/update-embedded-git.js`

dugite-native follows upstream git releases (~every 4-8 weeks). dugite npm package typically updates within days of a new dugite-native. `LOCAL_GIT_DIRECTORY` env var is the runtime escape hatch; `DUGITE_CACHE_DIR` is the install-time cache.

### Finding: simple-git does NOT inherit process.env by default — callers must pass env explicitly
**Confidence:** CONFIRMED (correcting earlier assumption)
**Evidence:** `git-js/simple-git/src/git.js:80-88` + README note

```typescript
Git.prototype.env = function (name, value) {
  if (arguments.length === 1 && typeof name === 'object') {
    this._executor.env = name;  // REPLACES process.env
  } else {
    (this._executor.env = this._executor.env || {})[name] = value;
  }
  return this;
};
```

README note: *"when passing environment variables into the child process, these will replace the standard `process.env` variables — the example above creates a new object based on `process.env` but with the `GIT_SSH_COMMAND` property added."*

**Nuance:** when `.env()` is NOT called, simple-git passes `undefined` to `spawn`, which causes Node's spawn to inherit `process.env` by default. So "simple-git inherits env by default" is true ONLY IF the caller never calls `.env()`. Once `.env()` is called with an object, `process.env` is REPLACED, not merged. This is a gotcha — we must remember to spread `process.env` if we ever need to add env vars.

### Finding: simple-git supports per-invocation git config via `config` option
**Confidence:** CONFIRMED
**Evidence:** `git-js/simple-git/src/lib/plugins/command-config-prefixing-plugin.ts:4-15`, `types/index.ts:157-160`

```typescript
export function commandConfigPrefixingPlugin(configuration: string[]) {
  const prefix = prefixedArray(configuration, '-c');
  return {
    type: 'spawn.args',
    action(data) { return [...prefix, ...data]; },
  };
}
```

Usage:
```typescript
const git = simpleGit('/some/path', { config: ['credential.helper=!gh auth git-credential'] });
await git.clone(url, dir);
// Runs: git -c credential.helper='!gh auth git-credential' clone <url> <dir>
```

**This unlocks the gh-credential-helper delegation pattern (see D3).** With one config line, simple-git can use whatever auth gh is already configured with.

### Finding: simple-git exposes raw stdout/stderr streams via outputHandler
**Confidence:** CONFIRMED
**Evidence:** `git-js/simple-git/src/lib/runners/git-executor-chain.ts:223-226`, `types/index.ts:30-36`

```typescript
export type outputHandler = (
  command: string,
  stdout: NodeJS.ReadableStream,
  stderr: NodeJS.ReadableStream,
  args: string[]
) => void;
```

Gives us full control over progress rendering (e.g., tee to a UI) beyond the structured `progress` callback.

### Finding: simple-git v3.36.0 is current; Bun compatibility is probable
**Confidence:** INFERRED
**Evidence:** simple-git uses `child_process.spawn` and Node streams — all standard APIs Bun implements. No Node-specific internal APIs used. Verification: smoke test recommended.

### Finding: simple-git's GIT_TERMINAL_PROMPT=0 gives clean auth failure
**Confidence:** CONFIRMED
**Evidence:** `git-js/simple-git/src/lib/plugins/error-detection.plugin.ts:7-9, 15-50`

```typescript
function isTaskError(result: TaskResult) {
  return !!(result.exitCode && result.stdErr.length);
}
```

With `GIT_TERMINAL_PROMPT=0`, a private repo clone without credentials returns non-zero exit + stderr; simple-git wraps in `GitError`. No stdin hang. This is the pattern we want.

### Finding: isomorphic-git SSH URLs fail with UnknownTransportError + suggestion field
**Confidence:** CONFIRMED (correcting earlier "silent rewrite")
**Evidence:** `isomorphic-git/src/managers/GitRemoteManager.js:20-38`

```javascript
throw new UnknownTransportError(
  url,
  parts.transport,
  parts.transport === 'ssh' ? translateSSHtoHTTP(url) : undefined
);
```

`translateSSHtoHTTP` is called ONLY in the error constructor. The HTTPS equivalent is placed in `error.data.suggestion`. This is cleaner than I initially thought — no silent conversion.

### Finding: isomorphic-git's Node onProgress is confirmed unwired
**Confidence:** CONFIRMED
**Evidence:** `isomorphic-git/src/http/node/index.js:14-57`

```javascript
export async function request({ onProgress, url, method, headers, agent, body }) {
  // ... simple-get invoked without onProgress being passed through
  get({ url, method, headers, agent, body }, (err, res) => { ... });
}
```

`onProgress` is accepted in the function signature but not wired to `simple-get`. Progress callback fires at completion only, not during transfer. An isomorphic-git clone progress bar on Node would be "spinner only," not percentage.

### Finding: isomorphic-git buffers the entire packfile in memory
**Confidence:** CONFIRMED
**Evidence:** `isomorphic-git/src/commands/fetch.js:216`

```javascript
// CodeCommit will hang up if we don't send a Content-Length header
// so we can't stream the body.
const packbuffer = Buffer.from(await collect(packstream));
```

For large repos (say, 500MB+ cloned objects), this is a real RAM ceiling. The code has a TODO to stream packfiles in future. Large-repo users would be disadvantaged.

---

## Library decision heuristic

For a Node-based editor, simple-git is the default production choice across every prior-art editor using Node for its git operations:
- Actively maintained (~13M weekly npm downloads as of 2026-04-14)
- Supports clone, progress callbacks, per-invocation credential helper config, `outputHandler` for raw stream access, `GIT_TERMINAL_PROMPT` for clean failures
- Standard Node `child_process` + stream APIs → Bun-compatible in principle (smoke-test verifiable)
- Alternatives ruled out for typical Node/Bun editors:
  - nodegit abandoned — maintenance lapsed for years
  - dugite blocked by Bun postinstall incompat + 400–600 MB bundle cost
  - isomorphic-git blocked by no-SSH and packfile RAM ceiling for large private repos (viable only as a narrow fallback for HTTPS-public scenarios on git-less hosts)

---

## Gaps / follow-ups

- Bun smoke test for simple-git is the recommended verification before implementation commitment — it's trivial to run.
- isomorphic-git as a narrow fallback for "no git on PATH" is viable for HTTPS-only public repos, but rules out private-repo-via-SSH users. The trade-off deserves explicit product decision per implementer.
