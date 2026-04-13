# Symlink-Safe File Sync

**Status:** Phase 1 · ready for handoff
**Owner:** Andrew Mikofalvy
**Research:** [reports/symlink-handling-file-sync-crdt/REPORT.md](../../reports/symlink-handling-file-sync-crdt/REPORT.md) (12 questions, 7 evidence files, decision matrix, 17-case edge catalog)
**Codebase map:** see Phase 1 exploration notes in conversation transcript — file-watcher, persistence, content-filter, shadow-repo, external-change, agent-sessions, api-extension touchpoints enumerated with file:line citations.

---

## Problem

The OpenKnowledge CRDT → disk pipeline is symlink-naive. When a Y.Doc persists to a path that is a symlink on disk, the atomic-write pattern `writeFile(tmp) + rename(tmp, target)` in `packages/server/src/persistence.ts:374-375` replaces the symlink with a regular file — silently, because `rename(2)` is POSIX-specified to overwrite symlinks rather than follow them ([research §1](../../reports/symlink-handling-file-sync-crdt/REPORT.md#1-atomic-writes-through-symlinks); [rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html)).

Confirmed repro: `CLAUDE.md` → `AGENTS.md` symlink broke in commit `12e7998` (type change `120000 → 100644`) and the two files drifted for six weeks before being caught. Manual restoration shipped as commit `8026ea6` on main.

A compounding issue: the file watcher indexes entries by `docName` derived from the raw path; `safeContentPath` never calls `realpath`. Two paths that resolve to the same inode are two separate Y.Docs. Even if we fix persistence, opening `CLAUDE.md` and `AGENTS.md` in parallel tabs yields two diverging CRDT states until the last writer on disk wins.

Zero symlink awareness exists anywhere in `packages/server/src/` — confirmed by `grep -rE 'symlink|lstat|readlink|realpath'` returning no matches. No tests cover symlink scenarios.

### Why this matters

- **Silent data loss.** Users who ship symlinked files (common for aliased configs: `AGENTS.md` ↔ `CLAUDE.md` ↔ `.cursorrules`, or cross-package shared templates) lose the link on first edit, with no signal.
- **Blocks monorepo doc workflows** where one canonical file is surfaced under multiple names.
- **Security hygiene.** A malicious or accidental symlink inside the content root whose target is outside the root (`/etc/passwd`, `~/.ssh/id_rsa`) becomes a write primitive for the Hocuspocus server. Currently unguarded.

---

## Goals

1. **Persistence preserves symlinks.** Writing to a Y.Doc whose on-disk path is a symlink keeps the symlink intact; the target content is atomically replaced.
2. **Realpath-based doc identity.** Two paths that resolve to the same canonical file share one Y.Doc. Editing `CLAUDE.md` and `AGENTS.md` in parallel tabs is editing the same CRDT document.
3. **Deterministic handling of degenerate cases.** Broken links, cycles, and escape-the-root symlinks have documented, tested behavior — no crashes, no silent corruption.
4. **Escape-safe by default.** Writes whose canonical path falls outside `contentDir` are refused with a clear error. Optional allowlist escape hatch deferred unless a concrete need emerges.

## Non-goals (as of 2026-04-12)

- **Hardlink detection.** Hardlinks share an inode but not a link entry — rare in doc workflows, different mitigation. Defer.
- **UI for creating symlinks.** Users create symlinks in the shell; the editor need not offer this affordance.
- **Cross-filesystem symlinks (EXDEV handling on tmp colocation).** Document as a known edge case; if encountered in practice, revisit with a write-through fallback. Not a pre-merge blocker.
- **Retroactive healing / drift detection.** A scanner that finds "pairs that should be symlinked but aren't" is out of scope. Document the manual procedure used in commit `8026ea6`.
- **Preserving symlinks across git operations.** If a branch commits the path as a regular file, `git checkout` materializes a regular file. That's a git-discipline issue, not a server issue ([research §7, §12](../../reports/symlink-handling-file-sync-crdt/REPORT.md#7-how-git-handles-symlinks)).
- **Logseq comparison.** One open research stone left unturned; not load-bearing.

---

## Requirements

### R1 — Symlink-preserving atomic write (write-file-atomic pattern)

Port the canonical pattern from `write-file-atomic@1.3.1` ([research §1](../../reports/symlink-handling-file-sync-crdt/REPORT.md#1-atomic-writes-through-symlinks)):

1. `const canonical = await fs.realpath(filePath)` — resolve the symlink chain to the canonical target.
2. Write tmp file **next to canonical** (same directory → same filesystem → rename is atomic).
3. `await rename(tmpPath, canonical)` — atomically replaces the canonical file's contents; symlinks along the chain are untouched.

**Degraded paths:**
- **Broken symlink** (`realpath` throws `ENOENT`): fall back to direct write at the original path. Creates a regular file there. Log a `warn` with `{ docName, originalPath, reason: 'broken-symlink' }`.
- **Cyclic symlink** (`realpath` throws `ELOOP`): refuse the write, surface error to Hocuspocus. Log the cycle. Do not retry.
- **Canonical outside contentDir** (escape): refuse the write in strict mode (default). See R4.
- **Non-symlink regular file:** no behavior change — `realpath` returns the same path; tmp+rename works as today.

**Acceptance:** Given a symlinked file `link.md → target.md` in the content dir, a CRDT write to `docName=link` preserves the symlink. Assert `lstat(linkPath).isSymbolicLink() === true` after the write, and `readFileSync(linkPath)` matches `readFileSync(targetPath)` matches the new CRDT content.

**Files:** `packages/server/src/persistence.ts` (primary); `packages/server/src/persistence.test.ts` (new tests).

### R2 — Realpath-based document identity

The file watcher indexes by **canonical path** (realpath-resolved) as the primary key; the original path(s) are stored as aliases.

- **Startup walk (`seedLastKnownHashes`):** For every file, call `lstat` + `readlink`/`realpath` to detect symlinks. Build:
  - `fileIndex: Map<canonicalDocName, FileIndexEntry>` (existing structure, key is now canonical).
  - `aliasMap: Map<aliasDocName, canonicalDocName>` (new; only populated for symlinks).
- **Cycle protection:** maintain a `visitedInodes: Set<inode>` during the walk. Skip any entry whose inode was already visited, log at `debug`. Prevents infinite traversal when a subtree contains cyclic links ([research §3 Obsidian cautionary tale, §8 parcel#2069](../../reports/symlink-handling-file-sync-crdt/REPORT.md#8-parcelwatcher-and-chokidar-behavior-on-symlinks)).
- **Watcher events (`classifyEvents`):** on every event, resolve the incoming path through `aliasMap` (or realpath live for paths not yet in the index). Emit the `DiskEvent` with the canonical `docName`. Original path is preserved in the event for logging only.
- **Escape during indexing:** a symlink whose canonical resolves outside contentDir is excluded from the index entirely (does not become a Y.Doc). Log at `warn`.
- **Runtime repointing:** when a watcher event arrives for a known alias, re-resolve via `realpath`. If the canonical changed, update `aliasMap` and emit a synthetic rename event (`oldDocName` → `newDocName`) so Hocuspocus can migrate Y.Doc state if a session is open.

**Acceptance:**
- Create `foo.md` symlinked to `bar.md`. Open HocuspocusProvider(`foo`) and HocuspocusProvider(`bar`) in two clients. Type in `foo` — `bar` sees the edit in real-time via CRDT sync (both clients are attached to the same Y.Doc). `document.getText('source')` for both returns the same content.
- `GET /api/documents` returns **both** `foo` and `bar` as entries. Each entry includes alias metadata: `{ docName, isSymlink: boolean, canonicalDocName: string | null, targetPath: string | null }`. The canonical entry has `isSymlink: false, canonicalDocName: null`. Alias entries have `isSymlink: true, canonicalDocName: "bar", targetPath: "<contentDir-relative path to target>"`.
- `GET /api/document?docName=foo` transparently resolves to the canonical Y.Doc and returns the same content as `docName=bar`.

**Files:** `packages/server/src/file-watcher.ts` (primary); `packages/server/src/content-filter.ts` (escape check); `packages/server/src/persistence.ts` (reconciled-base keying is already canonical if docName is canonical — verify); `packages/server/src/api-extension.ts` (alias metadata in `/api/documents`); `packages/server/src/file-watcher.test.ts`, `packages/server/src/api-pages.test.ts`, and `packages/app/tests/integration/bridge-matrix.test.ts` (new tests).

### R3 — Self-write tracker compatibility

`isSelfWrite(filePath, hash)` in `file-watcher.ts:299` keys by exact path string. With R1 active, the persistence write registers the **canonical** path; watcher events arrive for the canonical path too (because we no longer watch aliases independently — the index key is canonical). **Acceptance:** self-write detection continues to work without echo-loops after R1 + R2 are live. Add a test that exercises: Y.Doc write → persistence uses realpath → watcher fires → event is classified as self-write → no re-import.

**Files:** `packages/server/src/file-watcher.ts` (verify + test).

### R4 — Escape-safe by default

On every persistence write, after resolving `canonical = realpath(filePath)`:
- If `canonical.startsWith(contentDir + sep)` — proceed.
- Else — refuse. Throw an error that Hocuspocus surfaces to the client; log at `error` with `{ docName, originalPath, canonical, contentDir }`.

No config escape hatch in this iteration. Add `content.symlinks.allowedExternalPaths: []` only if a user asks. ([research §9](../../reports/symlink-handling-file-sync-crdt/REPORT.md#9-security-symlink-escape-and-toctou))

**Acceptance:** Create `escape.md` symlinked to `/tmp/outside.md`. Attempt a CRDT write to `docName=escape`. The write fails; the on-disk symlink is untouched; the log contains a clear `symlink-escape` entry.

**Files:** `packages/server/src/persistence.ts` + test.

### R5 — UI symlink indicator and hover

Render alias state honestly in the file tree to reduce user confusion about what's a real file vs a symlink.

- **File tree entries:** every entry from `/api/documents` is shown (aliases are NOT hidden). Entries where `isSymlink: true` render a small "↪" or "link" badge next to the filename — subtle, not intrusive, consistent with the existing sidebar visual language.
- **Hover tooltip (all symlink entries):** on hover, show:
  - Line 1: `Symlink → <targetPath>` (where `targetPath` is contentDir-relative).
  - Line 2: `Opens the same document as <canonicalDocName>` (so users understand edits sync).
- **Open behavior:** unchanged — clicking a symlink entry opens the canonical Y.Doc. Because R2 routes both alias and canonical to the same Y.Doc, editing from the alias tab is identical to editing from the canonical tab.
- **Canonical entries:** no badge, no special hover. Canonical files are the default UI state.

**Acceptance:**
- Given `foo.md` symlinked to `bar.md`, the sidebar shows both entries. `foo.md` has a symlink badge; `bar.md` does not.
- Hovering `foo.md` shows a tooltip with the target path and the canonical docName.
- Clicking either opens the same editor view; typing in one is visible in the other after CRDT sync.
- Broken symlinks: do not appear in the sidebar at all (R2 excludes them from the index during startup walk).

**Files:** `packages/app/src/components/FileSidebar.tsx` (badge + tooltip); a small shared type for alias metadata if not already inferred from the API response (`packages/app/src/types/documents.ts` or inline). Tests: co-located `FileSidebar.test.tsx` if the existing test file covers rendering, otherwise add behavioral coverage via Playwright in `packages/app/tests/stress/ux-interactions.e2e.ts` or a new `symlink-ui.e2e.ts`.

### R6 — Documentation

Update `AGENTS.md` server section with:
- New subsection `### Symlinks` describing: supported, realpath-based identity, atomic-with-symlink writes, escape policy, broken-link fallback, Windows caveat (symlinks require Developer Mode but server only reads so no privilege needed).
- Cross-link to the research report.

---

## Technical design

### Persistence write path (R1, R4)

Current code (`persistence.ts:369-376`):

```ts
const filePath = safeContentPath(documentName, contentDir);
const tmpPath = `${filePath}.tmp`;
await mkdir(dirname(filePath), { recursive: true });
await writeFile(tmpPath, markdown, 'utf-8');
await rename(tmpPath, filePath);
registerWrite(filePath, contentHash(markdown));
```

Proposed:

```ts
const requestedPath = safeContentPath(documentName, contentDir);
await mkdir(dirname(requestedPath), { recursive: true });

let canonicalPath: string;
try {
  canonicalPath = await realpath(requestedPath);
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
    // Path doesn't exist (new file) OR broken symlink → write at requested path.
    canonicalPath = requestedPath;
  } else if ((e as NodeJS.ErrnoException).code === 'ELOOP') {
    throw new Error(`Symlink cycle detected at ${requestedPath}`);
  } else {
    throw e;
  }
}

if (!isWithinContentDir(canonicalPath, contentDir)) {
  throw new Error(`Symlink escape: ${requestedPath} → ${canonicalPath} is outside ${contentDir}`);
}

const tmpPath = `${canonicalPath}.tmp`;
await writeFile(tmpPath, markdown, 'utf-8');
await rename(tmpPath, canonicalPath);
registerWrite(canonicalPath, contentHash(markdown));
```

Key subtleties:
- `tmpPath` is next to **canonical**, not next to the symlink — prevents cross-FS EXDEV.
- `registerWrite` registers the canonical path so the watcher's self-write detection matches (because watcher also keys by canonical post-R2).
- `safeContentPath` is kept for the initial containment check (rejects `..` traversal); realpath adds a second layer that catches symlink escapes.

### File watcher index + alias map (R2, R3)

New fields on `WatcherHandle`:

```ts
type FileIndexEntry = {
  size: number;
  modified: string;
  canonicalPath: string;   // absolute realpath
  inode: number;           // for cycle detection + hardlink dedup
  aliases: string[];       // other docNames pointing here (empty for non-symlinks)
};

type WatcherState = {
  fileIndex: Map<string /* canonical docName */, FileIndexEntry>;
  aliasMap: Map<string /* alias docName */, string /* canonical docName */>;
};
```

Startup walk (`seedLastKnownHashes`) becomes:

```ts
function walk(dir, visitedInodes) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const lst = lstatSync(fullPath);

    if (lst.isSymbolicLink()) {
      let canonical: string;
      try { canonical = realpathSync(fullPath); }
      catch (e) { logBrokenLink(fullPath, e); continue; }

      if (!isWithinContentDir(canonical, contentDir)) { logEscape(fullPath, canonical); continue; }

      const canonicalStat = statSync(canonical);
      if (visitedInodes.has(canonicalStat.ino)) continue;  // alias already indexed
      visitedInodes.add(canonicalStat.ino);

      const canonicalDocName = pathToDocName(canonical, contentDir);
      const aliasDocName = pathToDocName(fullPath, contentDir);
      aliasMap.set(aliasDocName, canonicalDocName);
      const existing = fileIndex.get(canonicalDocName);
      if (existing) existing.aliases.push(aliasDocName);
      else indexFile(canonical, canonicalDocName, canonicalStat, [aliasDocName]);
    } else if (lst.isDirectory()) {
      walk(fullPath, visitedInodes);
    } else if (lst.isFile() && entry.name.endsWith('.md')) {
      if (visitedInodes.has(lst.ino)) continue;
      visitedInodes.add(lst.ino);
      const docName = pathToDocName(fullPath, contentDir);
      indexFile(fullPath, docName, lst, []);
    }
  }
}
```

Watcher event resolution (`classifyEvents`) adds a step at the top:

```ts
function resolveToCanonical(eventPath: string): { canonicalDocName, canonicalPath } | null {
  const rawDocName = pathToDocName(eventPath, contentDir);
  // Fast path: known alias
  const canonicalDocName = aliasMap.get(rawDocName);
  if (canonicalDocName) return { canonicalDocName, canonicalPath: fileIndex.get(canonicalDocName).canonicalPath };
  // Unknown path: lstat to check if it's a symlink
  try {
    const lst = lstatSync(eventPath);
    if (!lst.isSymbolicLink()) return { canonicalDocName: rawDocName, canonicalPath: eventPath };
    const canonical = realpathSync(eventPath);
    if (!isWithinContentDir(canonical, contentDir)) return null;  // escape → drop event
    return { canonicalDocName: pathToDocName(canonical, contentDir), canonicalPath: canonical };
  } catch { return null; }  // deleted/broken → drop
}
```

### Content filter (R2)

`content-filter.ts` filters by relative path; no change needed for R2 itself. The escape check lives in the watcher walk (rejects symlinks escaping contentDir before they enter the index) and in the persistence write (defense in depth). Adding escape detection to the content filter would be a third layer — **recommend against** (violates single-source-of-truth for the rule).

### Shadow repo (R2)

No change required. Shadow repo keys by `docName`; if `docName` is canonical post-R2, shadow repo automatically uses canonical too. Confirm `git config core.symlinks` — if `true` (Unix default), `git add` records the symlink as a mode-120000 blob with the target as content. For our shadow repo, we want `core.symlinks=true` so the attribution journal reflects reality. Add an explicit `core.symlinks=true` set in `initShadowRepo()` for clarity.

### API surface (R2)

`/api/documents` returns one entry per canonical docName. `/api/document?docName=<alias>` resolves the alias to the canonical Y.Doc transparently (inject alias resolution at the top of the handler via `aliasMap`). The response body is unchanged.

### Tests

New / expanded:
- `persistence.test.ts`: symlink-preserved atomic write (R1), broken symlink fallback, cyclic symlink rejection, canonical-outside-contentDir refusal (R4).
- `file-watcher.test.ts`: startup walk on directory with symlinks (R2), alias map correctness, cycle detection via visited-inode set (R2), watcher event routing from alias path to canonical docName (R2), self-write detection after symlink resolution (R3).
- `bridge-matrix.test.ts`: two HocuspocusProvider clients on `foo.md` symlinked to `bar.md` — edit in one, observe in the other, assert single Y.Doc via server-side `documents.size`.
- `content-filter.test.ts`: unchanged behavior confirmed — symlinks are the watcher's concern, not the filter's.
- `api-pages.test.ts`: verify `/api/documents` dedups aliases.

Platform coverage: CI runs on Linux + macOS (Node 22 per `.github/workflows`). Windows is not in CI — document this in AGENTS.md and leave the Windows path untested for now. `fs.realpath` is platform-abstracting per Node docs ([research §10](../../reports/symlink-handling-file-sync-crdt/REPORT.md#10-platform-differences)), so risk is low.

---

## Edge case catalog (condensed from research)

Full 17-case matrix: [research report](../../reports/symlink-handling-file-sync-crdt/REPORT.md#edge-case-catalog). Key entries:

| Case | Behavior |
|---|---|
| Write to regular file | Unchanged from today; `realpath` returns same path. |
| Write to symlink inside contentDir | R1 atomic-with-symlink; link preserved. |
| Write to symlink escaping contentDir | R4 refuses with clear error. |
| Write to symlink with broken target | Direct write at original path creates regular file; logged. |
| Write to cyclic symlink chain | Refused with `ELOOP` surfaced; logged. |
| Two paths aliased to same inode | R2: single Y.Doc; both API paths resolve. |
| Symlink repointed at runtime | Next event re-resolves; alias map updated; synthetic rename emitted. |
| Cross-filesystem symlink (tmp colocation works) | Standard R1 path. |
| Cross-filesystem with failed colocation | Out of scope; document as future consideration. |
| Windows w/o Developer Mode | Server only reads/traverses; no symlink creation needed; no privilege required. |

---

## Open questions for operator decision

Surfacing the 6 research-flagged decisions. My recommendation on each in italics — confirm or override before implementation.

1. **Dedup timing: eager (startup) vs lazy (first-touch)?** *Eager.* Startup walk already scans the tree; adding lstat+realpath per entry is cheap and makes `/api/documents` correct from t=0. Lazy creates a window where two tabs open via different paths briefly get separate Y.Docs until reconciliation kicks in.

2. **Surface aliases in the UI?** *Yes — user-amended 2026-04-12.* Must-have: aliases are listed in the file tree with a symlink badge, and hover shows the target path + canonical docName. Promoted to R5 (was deferred).

3. **Config key for future escape allowlist.** *Defer entirely.* Don't add config until a user asks. Ship with strict-only.

4. **`safeContentPath` vs `realpath` interaction when they disagree.** *Realpath wins (strict).* `safeContentPath` catches `..` traversal in the requested docName; `realpath` catches symlink escapes in the canonical resolution. If they disagree, the canonical is outside contentDir — R4 refuses.

5. **Git-level startup check for symlink drift.** *Out of scope.* Scope creep; solve the server-side problem first. A future story can add a warn-on-startup check like "git has CLAUDE.md as regular-file but working tree is symlink — drift likely" using `git ls-files -s CLAUDE.md` + `lstat` comparison. Not in this spec.

6. **Logseq investigation.** *Skip.* Three LSP implementations + write-file-atomic + Obsidian cover the design space. Logseq is one more data point, not load-bearing.

---

## Acceptance summary (to decompose into stories in Phase 2)

- [ ] **R1.** Persistence realpath-then-rename preserves symlinks. Tests for preserved / broken / cyclic / non-symlink cases pass.
- [ ] **R2.** File watcher indexes by canonical docName; alias map resolves events. Two-path → one-Y.Doc invariant holds (integration test).
- [ ] **R3.** Self-write detection works after R1+R2 (no echo loops). Regression test.
- [ ] **R4.** Writes whose canonical escapes contentDir are refused. Test + log assertion.
- [ ] **R5.** File sidebar shows symlink badge on aliases; hover tooltip shows target + canonical docName.
- [ ] **R6.** `AGENTS.md` has a Symlinks section documenting behavior, limitations, Windows caveat.
- [ ] **Regression gate:** `bun run check` green.

---

## Deferred / surfaced opportunities

- **File-tree alias badge** (UX) — Open Q #2. Surface in Phase 9 summary.
- **Config escape allowlist** — Open Q #3. Add if a user requests.
- **Startup git-drift check** — Open Q #5. Potential future story.
- **Logseq comparison** — Open Q #6. Research follow-up.
- **Retroactive drift scanner** — mentioned in Non-goals. Tool to find clone pairs that should be symlinks.
- **Windows CI coverage** — not in this spec; would expand test matrix to include windows-latest runner.

---

## Amendments log

- **2026-04-12** — UI symlink indicator promoted from deferred to must-have (R5). Badge + hover tooltip showing target path and canonical docName. Amended `/api/documents` response shape to surface alias metadata (`isSymlink`, `canonicalDocName`, `targetPath`). R2 listing no longer dedups — both alias and canonical entries appear in the tree, with aliases clearly marked. Y.Doc identity remains canonical (one Y.Doc per inode); editing either entry edits the same document.
