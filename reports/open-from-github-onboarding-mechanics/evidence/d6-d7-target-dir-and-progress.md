# Evidence: D6 + D7 — Target directory & progress UX

**Date:** 2026-04-14
**Sources:** VSCode, GitHub Desktop, simple-git, isomorphic-git

---

## D6 — Target directory selection

### Finding: VSCode uses `showOpenDialog` with folder-only + config-driven default
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/cloneManager.ts:60-88`

```typescript
if (!parentPath) {
  const config = workspace.getConfiguration('git');
  let defaultCloneDirectory = config.get<string>('defaultCloneDirectory') || os.homedir();
  defaultCloneDirectory = defaultCloneDirectory.replace(/^~/, os.homedir());

  const uris = await window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: Uri.file(defaultCloneDirectory),
    title: l10n.t('Choose a folder to clone {0} into', url),
    openLabel: l10n.t('Select as Repository Destination')
  });
  parentPath = uris[0].fsPath;
}
```

VSCode asks for **parent dir**, then the clone command uses the derived `folderPath = parentPath/baseFolderName` where baseFolderName is computed from the URL. Target directory conflicts (non-empty dir) are not explicitly validated — git itself refuses.

### Finding: Desktop asks for full target path + validates emptiness
**Confidence:** CONFIRMED
**Evidence:** `app/src/ui/clone-repository/clone-generic-repository.tsx:32-68`, `clone-repository.tsx:682-721`

Desktop's dialog has two fields: **Local Path** (TextBox) + **Choose...** button. Choose... opens `showSaveDialog` (macOS) or `showOpenDialog` (Windows). After choice, Desktop validates the target is empty before enabling the Clone button.

### Finding: Desktop auto-fills the local path from `owner/repo`
**Confidence:** CONFIRMED
**Evidence:** `app/src/ui/clone-repository/clone-repository.tsx:646-680`

Desktop watches the URL input; on valid parse, sets local-path to `<default-clone-directory>/<repo-name>`. User can edit before committing.

### Finding: gh CLI uses `target = path.Base(strings.TrimSuffix(cloneURL, ".git"))` as default
**Confidence:** CONFIRMED
**Evidence:** `gh-cli/git/client.go:819-853`

Matches git's own default behavior. User can override via positional arg.

---

## D6 summary

| Editor | Prompt shape | Default | Validation |
|---|---|---|---|
| VSCode | Pick **parent** folder; derive repo name from URL | `git.defaultCloneDirectory` → `~` | None (lets git fail on conflict) |
| Desktop | **Full target path** textbox + Choose... | `<default>/<repo-name>` | Must be empty |
| gh | Positional arg or derived | `./<repo-name>` | None (git decides) |
| Obsidian-Git | Modal for path | Vault subdir | Warns on Obsidian config overlap |

**Pattern choice for implementers:** A CLI command (e.g., `<appname> clone <url> [<dir>]`) should match gh's defaulting (basename of URL minus `.git`). An editor-side dialog should match Desktop's "full path, validate empty" for best non-developer UX — users see exactly where the project will live.

---

## D7 — Progress UX

### Finding: Native-git clone emits progress on stderr as sideband-2 messages
**Confidence:** CONFIRMED
**Evidence:** `git --progress` on stderr; regex shared across VSCode, simple-git, dugite

Format: `<phase>: <percent>% (<processed>/<total>)` e.g., `Receiving objects: 42% (500/1200)`.

### Finding: VSCode parses sideband-2 with phase-weighted percentages
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/git.ts:451-476`

VSCode maps phases to a weighted overall progress:
- `Counting objects: N%` → 0–10%
- `Compressing objects: N%` → 10–20%
- `Receiving objects: N%` → 20–60%
- `Resolving deltas: N%` → 60–100%

Then calls `window.withProgress()` for the UI indicator.

### Finding: simple-git exposes this as a structured plugin
**Confidence:** CONFIRMED
**Evidence:** `git-js/simple-git/src/lib/plugins/progress-monitor-plugin.ts:6-50`

```typescript
export function progressMonitorPlugin(progress) {
  context.spawned.stderr?.on('data', (chunk: Buffer) => {
    const message = /^([\s\S]+?):\s*(\d+)% \((\d+)\/(\d+)\)/.exec(chunk.toString('utf8'));
    if (!message) return;
    progress({
      method: context.method,
      stage: progressEventStage(message[1]),
      progress: asNumber(message[2]),
      processed: asNumber(message[3]),
      total: asNumber(message[4]),
    });
  });
}
```

Usage: `simpleGit({ progress: (data) => { ... } })`. **Already available to us** — simple-git is a dep.

### Finding: isomorphic-git offers structured `onProgress({phase, loaded, total})` but Node HTTP plugin marks it "reserved for future use"
**Confidence:** CONFIRMED
**Evidence:** `isomorphic-git/src/typedefs-http.js:8-12`, `isomorphic-git/src/http/node/index.js:14-57`

On browser with fetch, progress works via ReadableStream. On Node via `simple-get`, progress is not populated today — the onProgress callback fires once at completion. Any isomorphic-git clone progress bar on Node will be an indeterminate spinner.

---

## D7 summary

| Library | Progress granularity | Ease |
|---|---|---|
| simple-git | Full (phase + %) via plugin | Already a dep; zero extra work |
| VSCode's hand-written parser | Full (phase + weighted %) | Copy if we want weighted total |
| isomorphic-git (browser) | Full | n/a (we're Node) |
| isomorphic-git (Node) | Indeterminate only | Poor for large clones |
| dugite | Full (stderr stream exposed) | Same as simple-git |

**Pattern for implementers on a Node stack:** simple-git's `progress` plugin gives phase-aware percentages for free. The progress UI surface is a separate rendering question (status bar, toast, modal, progress bar) but the *data* layer is already available across all renderings.

---

## Gaps / follow-ups

- Transfer-rate (KB/s) is not in simple-git's plugin today; only phase/percent. VSCode doesn't show rate either. Matches prior art; fine.
