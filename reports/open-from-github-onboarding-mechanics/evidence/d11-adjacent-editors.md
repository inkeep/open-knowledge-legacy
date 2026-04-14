# Evidence: D11 — Adjacent editor patterns (Logseq, TinaCMS)

**Dimension:** Do Tier-1/Tier-2 adjacent editors add patterns not already seen?
**Date:** 2026-04-14
**Sources:** Logseq, TinaCMS

---

## Findings

### Finding: Logseq does NOT ship any clone-from-GitHub flow
**Confidence:** CONFIRMED (searched-and-absent)
**Evidence:** Grep across `logseq/src/` and `logseq/resources/package.json`

- Searched terms: `clone`, `git clone`, `GitHub` — zero hits in graph-onboarding code (only plugin-installation code)
- `/resources/package.json` declares zero git-related deps: no isomorphic-git, simple-git, dugite, nodegit
- Onboarding flow (`src/main/frontend/components/onboarding/setups.cljs`): "choose folder or import DB" only

Graph open path (`src/main/frontend/fs/node.cljs:133-145`):
```clojure
(p/let [dir-path (or dir (util/mocked-open-dir-path))
        result (if dir-path
                 (ipc/ipc "getFiles" dir-path)
                 (ipc/ipc "openDir" {}))
```

Logseq expects the user to have already cloned (or created) the graph folder by other means. If a user wants a git-backed graph on Logseq, they clone via terminal or GitHub Desktop, then "Open graph" in Logseq. **This is the "offload to system" pattern** — worth noting as an option.

### Finding: Logseq DOES support GitHub URL for plugin installation, not graph data
**Confidence:** CONFIRMED
**Evidence:** Plugin manager prompts for a GitHub URL but only for plugin code, not content. Not relevant to our feature.

### Finding: TinaCMS uses isomorphic-git for READING git state, not cloning; git writes go through Octokit REST API
**Confidence:** CONFIRMED
**Evidence:** `tinacms/packages/@tinacms/graphql/src/git/index.ts:1-31`

```typescript
import git from 'isomorphic-git';
import fs from 'fs-extra';
// ...
export const getSha = async ({ fs, dir }) => {
  dir = await findGitRoot(dir);
  return git.resolveRef({ fs, dir, ref: 'HEAD' });
};
```

Used only for: `resolveRef`, `log`, tree walking. No `git.clone`, `git.fetch`, `git.pull` calls found.

### Finding: TinaCMS architecture is server-centric; it does not target on-device clone
**Confidence:** CONFIRMED
**Evidence:** `tinacms/packages/tinacms-gitprovider-github/src/index.ts:16-34`

```typescript
export class GitHubProvider implements GitProvider {
  octokit: Octokit;
  owner: string; repo: string; branch: string;
  constructor(args: GitHubProviderOptions) {
    this.octokit = new Octokit({ auth: args.token, ...(args.octokitOptions || {}) });
  }
  // ...writes files via /repos/{owner}/{repo}/contents/* API
}
```

TinaCMS's model: Next.js server holds a token, Octokit writes files to GitHub directly via the Contents API. User's browser never clones; the git "working copy" is actually a server-side process reading/writing to GitHub over HTTP.

**This pattern doesn't apply to us** (we're on-device, no backend server to hold tokens).

### Finding: Neither editor introduces a pattern absent from our reference set
**Confidence:** CONFIRMED
**Evidence:** Comparison table

| Pattern | Seen in reference set? | Logseq | TinaCMS |
|---|---|---|---|
| Shell out to git binary | VSCode, Desktop, gh, Obsidian-Git (desktop) | No | No |
| libgit2 in-process | Zed | No | No |
| Pure-JS isomorphic-git | Obsidian-Git (mobile) | No | Read-only |
| Octokit REST (contents API) | Not for cloning specifically | No | Yes (their choice) |
| "User clones externally, open folder" | — | **Logseq** (only this) | No |

Logseq's "open folder — you bring the clone" is the only pattern not already in the Tier-1 reference set. It's worth naming as the **minimum viable option**: ship nothing new; document "clone with `git`/gh/Desktop, then run the editor's open-folder command on the result." This is free to implement. Suitable for developer audiences; unsuitable for non-developer onboarding flows.

---

## Conclusion

D11 adds one lightweight option ("tell the user to clone externally, then open") and one non-applicable pattern (TinaCMS's server-as-mediator, which depends on a backend). No new mechanism invalidates the D2–D9 findings. The Tier-1 editors (VSCode/Desktop/Zed/Obsidian-Git/gh) cover the full space for on-device editor architectures without a trusted backend.

---

## Gaps / follow-ups

- AFFiNE (MIT, Electron + Yjs CRDT, closest architectural neighbor) and SilverBullet (self-hosted web notebook) were not investigated. AFFiNE's plugin system and self-hosting surfaces might include a workspace-import-from-git flow worth checking in a follow-up.
