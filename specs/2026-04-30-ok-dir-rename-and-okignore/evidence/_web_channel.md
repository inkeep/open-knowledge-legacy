---
name: web_channel
description: Web-channel worldmodel findings — `ignore` npm lib semantics + `.<tool>ignore` ecosystem conventions
type: evidence
date: 2026-04-30
sources:
  - https://github.com/kaelzhang/node-ignore
  - https://github.com/kaelzhang/node-ignore/blob/master/README.md
  - https://github.com/kaelzhang/node-ignore/releases
  - https://www.npmjs.com/package/ignore
  - https://www.npmjs.com/package/ignore/v/5.3.2
  - https://git-scm.com/docs/gitignore
  - https://www.kernel.org/pub/software/scm/git/docs/gitignore.html
  - https://github.com/eslint/eslint/issues/17831
  - https://eslint.org/docs/latest/use/migrate-to-9.0.0
  - https://github.com/eslint/eslint/discussions/18304
  - https://eslint.org/blog/2025/03/flat-config-extends-define-config-global-ignores/
  - https://prettier.io/docs/ignore
  - https://prettier.io/blog/2023/11/30/cli-deep-dive.html
  - https://github.com/prettier/prettier/issues/8506
  - https://github.com/prettier/prettier/issues/14115
  - https://github.com/prettier/prettier/issues/12923
  - https://cloud.google.com/sdk/gcloud/reference/topic/gcloudignore
  - https://8thlight.com/insights/effective-use-and-debugging-of-gcloudignore-dockerignore-and-gitignore
  - https://github.com/balena-io/balena-cli/issues/1148
  - https://cursor.com/docs/reference/ignore-file
  - https://docs.cursor.com/context/ignore-files
  - https://github.com/anthropics/claude-code/issues/79
  - https://s-celles.github.io/ai-config/docs/agentignore/
  - https://appga.pl/2025/11/22/ai-ignore-rules-protect-your-secrets-when-using-code-assistants/
  - https://blog.narnach.com/blog/2022/dot-gitignore-does-not-unignore-my-file/
  - https://www.aclockworkberry.com/git-how-to-reinclude-a-file-or-folder-inside-an-ignored-parent-folder/
  - https://github.com/npm/cli/wiki/Files-&-Ignores
depth: full
---

# Web Channel — Worldmodel findings

Observation only. No evaluation, no recommendations.

## Probe 1 — `ignore` npm library (kaelzhang/node-ignore)

### File-name agnosticism — CONFIRMED (HIGH confidence)
The library accepts pattern strings or arrays — it does not read files itself, nor does it enforce a `.gitignore` filename. The README's basic-usage example shows callers reading any file (or building an array) and passing the contents to `ig.add(...)`. The package's tagline describes itself as "the manager and filter for .gitignore rules" — i.e., it implements gitignore *syntax*, not a `.gitignore`-specific *filename*. Confirmed by ESLint, Prettier, and others using it for `.eslintignore` / `.prettierignore` (see Probe 2). Source: [github.com/kaelzhang/node-ignore](https://github.com/kaelzhang/node-ignore), [npmjs.com/package/ignore](https://www.npmjs.com/package/ignore).

### Negation `!pattern` semantics across multiple `add()` calls — CONFIRMED (MEDIUM-HIGH)
The README explicitly documents that patterns are evaluated in the order they are added, and a later `!pattern` will re-include a file previously excluded. The package exposes a `TestResult` interface returning `{ ignored, unignored }` — the `unignored: true` state means "finally unignored by some negative pattern." `ig.add(stringA).add(stringB)` and `ig.add([a, b])` both compose order-dependently. Therefore: `ig.add(gitignoreContents).add(okignoreContents)` allows `!secret.md` in the okignore source to override `*.md` from gitignore. Sources: [README](https://github.com/kaelzhang/node-ignore/blob/master/README.md), [npm v5.3.2 docs](https://www.npmjs.com/package/ignore/v/5.3.2).

### Standard quirks — gitignore-spec compliant (MEDIUM)
README states the library follows "exactly the gitignore manpage" and explicitly fixes some upstream bugs (notably `'/*.js'` correctly matching only `a.js`, not `abc/a.js`). `options.ignorecase` (lowercase, default `true`) controls case sensitivity. Windows absolute paths throw by design (caller must pass POSIX-style relative paths). Comment lines (`#`), backslash escape for literal `#`, trailing-slash dir-only, leading-`/` anchor — all behave per gitignore spec. CRLF: not explicitly documented; callers typically split on `/\r?\n/` themselves (the package consumes pre-split arrays or strings via `add`). Sources: [README](https://github.com/kaelzhang/node-ignore/blob/master/README.md). UNRESOLVED: explicit CRLF behavior in `add(string)` — searched, not surfaced in docs; callers normalize upstream.

### Version recency — `7.x` current; `6.x` "release was a mistake"; `5.x → 7.x` safe in single-instance usage (HIGH)
Latest published is `7.0.5` (≈ May 2025 per npm metadata read 2026-04-30). The release notes explicitly state: "The release of 6.x is due to a mistake. Making an upgrade from 5.x to 6.x for now actually changes nothing and does no harm." For `7.0.0`: the only call-site-breaking change is mixing a v6 instance into a v7 instance via `ignore().add(anotherIgnoreInstance)`. New in v7: `.checkIgnore()` (mirrors `git check-ignore -v`). Negation works correctly across all current versions. Sources: [Releases](https://github.com/kaelzhang/node-ignore/releases), [npm](https://www.npmjs.com/package/ignore).

## Probe 2 — Convention scan: `.<tool>ignore` precedent files (JS/TS)

### `.eslintignore` — DEPRECATED in ESLint v9 (HIGH)
Flat config (default since v9.0.0) does not load `.eslintignore`. Migrate to the `ignores` property in `eslint.config.js`. ESLint 10 will not read `.eslintignore` at all. Compat shim: `includeIgnoreFile()` from `@eslint/compat` for users who want to keep reading `.gitignore` or `.eslintignore`. Notable syntax change: in `.eslintignore`, `temp.js` was treated as `**/temp.js`; in flat config it must be written explicitly as `**/temp.js`. Sources: [ESLint v9 migration](https://eslint.org/docs/latest/use/migrate-to-9.0.0), [issue #17831](https://github.com/eslint/eslint/issues/17831), [discussion #18304](https://github.com/eslint/eslint/discussions/18304), [2025 extends/global-ignores blog](https://eslint.org/blog/2025/03/flat-config-extends-define-config-global-ignores/).

### `.prettierignore` — backed by `node-ignore`; composes with `.gitignore` (HIGH)
Prettier docs state `.prettierignore` uses gitignore syntax. The CLI deep-dive blog post explicitly says Prettier uses `node-ignore` to filter and `fast-glob` for resolution. By default Prettier reads `./.gitignore` AND `./.prettierignore`, AND auto-ignores VCS dirs (`.git`, `.jj`, `.sl`, `.svn`, `.hg`) and `node_modules`. Custom path via `--ignore-path`. Known issue: `.prettierignore` in subdirectories is NOT honored — only the one in the cwd is read (issue #12923). Sources: [Prettier docs](https://prettier.io/docs/ignore), [CLI deep dive](https://prettier.io/blog/2023/11/30/cli-deep-dive.html), [issue #8506](https://github.com/prettier/prettier/issues/8506), [issue #12923](https://github.com/prettier/prettier/issues/12923).

### `.dockerignore` — gitignore-like; nested files NOT honored (MEDIUM-HIGH)
Same pattern syntax as gitignore. Only the `.dockerignore` at the root of the build context is read. Nested `.dockerignore` files are silently ignored — known issue tracked in tools like balena-cli ([#1148](https://github.com/balena-io/balena-cli/issues/1148)). No automatic composition with `.gitignore`. Source: [8thlight comparison](https://8thlight.com/insights/effective-use-and-debugging-of-gcloudignore-dockerignore-and-gitignore).

### `.gcloudignore` — falls back to `.gitignore` when absent; supports `#!include:` directive (HIGH)
gcloud's spec adds an `#!include:` directive that pulls another ignore file's patterns inline. Critically: the include directive is NOT recursive — if the included file has its own `#!include:`, that nested include is skipped. If `.gcloudignore` is absent, gcloud falls back to `.gitignore`. Source: [gcloud topic gcloudignore](https://cloud.google.com/sdk/gcloud/reference/topic/gcloudignore).

### `.npmignore` — gitignore syntax; falls back to `.gitignore` if absent; subdirectory `.npmignore` files known-buggy (MEDIUM)
Standard gitignore syntax. If `.npmignore` is absent in the package root, npm uses `.gitignore`. Known bug: `.npmignore` in subdirectories is ignored when the root `package.json` uses the `files` array ([npm/cli #4069](https://github.com/npm/cli/wiki/Files-&-Ignores)). Source: [npm wiki Files-&-Ignores](https://github.com/npm/cli/wiki/Files-&-Ignores).

### `.cursorignore` — gitignore-syntax; nested supported per Cursor docs (MEDIUM-HIGH)
Cursor docs explicitly state `.cursorignore` uses the same syntax as `.gitignore`. Cursor also reads `.gitignore` automatically. Nested `.cursorignore` files are honored. There is also `.cursorindexignore` for indexing-only exclusions. Sources: [cursor.com docs](https://cursor.com/docs/reference/ignore-file), [docs.cursor.com](https://docs.cursor.com/context/ignore-files).

### `.aiderignore` / `.geminiignore` / `.codeiumignore` / `.claudeignore` — fragmented landscape (MEDIUM)
Each AI-tool vendor has rolled its own. `.aiderignore`, `.geminiignore`, `.codeiumignore`, `.claudeignore` (community-requested but not officially shipped — see [anthropics/claude-code #79](https://github.com/anthropics/claude-code/issues/79)). All use gitignore-style syntax. There's a community proposal for a unified `.agentignore` standard ([s-celles/ai-config](https://s-celles.github.io/ai-config/docs/agentignore/)), explicitly stated to be a *proposal*, not adopted. Survey article notes: "If your team uses multiple tools, you will likely need to manage multiple ignore files." Sources: [Mastery In Dev survey 2025-11](https://appga.pl/2025/11/22/ai-ignore-rules-protect-your-secrets-when-using-code-assistants/), [claude-code #79](https://github.com/anthropics/claude-code/issues/79).

### Cross-tool composition library — `compactignore` / `ignore-sync`
Two community libraries (`@confused-techie/compactignore`, `ignore-sync`) generate multiple ignore files from a single source-of-truth file. Indicates real ecosystem pain around fragmentation but neither is a standard.

## Probe 3 — gitignore syntax footguns

### "Last match wins" within a flat pattern list — CONFIRMED (HIGH)
Per the gitignore manpage: "The last matching pattern decides the outcome." Negation `!pattern` re-includes a file *only if* the file is not blocked by an excluded ancestor directory. Source: [git-scm.com/docs/gitignore](https://git-scm.com/docs/gitignore).

### Cannot re-include inside an excluded parent — STRUCTURAL LIMITATION (HIGH)
Direct quote from manpage: "It is not possible to re-include a file if a parent directory of that file is excluded." Reason given: Git skips traversal of excluded directories for performance. Workaround pattern requires explicitly re-including each ancestor: `/*` exclude all → `!/foo` re-include parent → `/foo/*` exclude contents → `!/foo/bar` re-include target. Sources: [git-scm.com](https://git-scm.com/docs/gitignore), [Narnach blog](https://blog.narnach.com/blog/2022/dot-gitignore-does-not-unignore-my-file/), [aclockworkberry walkthrough](https://www.aclockworkberry.com/git-how-to-reinclude-a-file-or-folder-inside-an-ignored-parent-folder/).

### `**` only as full path component — CONFIRMED (HIGH)
Per gitignore manpage, `**` has special meaning ONLY in three positional forms: leading (`**/foo`), trailing (`foo/**`), or surrounded by slashes (`a/**/b`). "Other consecutive asterisks are considered regular asterisks and will match according to the previous rules" — i.e., `foo-**/x` is interpreted as `foo-*/x`, the second `*` collapses to a regular asterisk. This matches the OK config.yml's existing `foo-**` warning. Source: [git-scm.com/docs/gitignore](https://git-scm.com/docs/gitignore).

### `.git/` implicit ignore — yes for git itself; NOT for `node-ignore` (MEDIUM)
Git always ignores `.git/`. The `node-ignore` library does NOT add this implicit rule — callers must add it themselves if desired. Prettier separately hardcodes ignoring `.git`, `.jj`, `.sl`, `.svn`, `.hg`, and `node_modules` *outside* its `node-ignore` filter as a built-in default. Sources: [Prettier docs](https://prettier.io/docs/ignore), [github.com/kaelzhang/node-ignore](https://github.com/kaelzhang/node-ignore).

### Trailing slash makes pattern dir-only — CONFIRMED (HIGH)
`foo/` matches only directories named `foo` (and contents). `foo` matches both files and directories. Source: [git-scm.com/docs/gitignore](https://git-scm.com/docs/gitignore).

### Leading `/` anchors to the directory containing the ignore file — CONFIRMED (HIGH)
A pattern with a leading `/` (or with a `/` anywhere except at the end) is anchored to the directory of the ignore file. Without any `/`, the pattern matches at any depth. This is the source of the "ESLint v9 changed temp.js semantics" footgun above. Source: [git-scm.com/docs/gitignore](https://git-scm.com/docs/gitignore).
