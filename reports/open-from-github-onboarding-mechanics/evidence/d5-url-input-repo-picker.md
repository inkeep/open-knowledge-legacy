# Evidence: D5 — URL input & repo picker UX

**Dimension:** How editors accept the "which repo" input
**Date:** 2026-04-14
**Sources:** VSCode, GitHub Desktop, Obsidian-Git, gh CLI

---

## Findings

### Finding: VSCode offers a composite QuickPick that combines URL paste with authenticated repo browse
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/cloneManager.ts:30-35`, `extensions/git-base/src/remoteSource.ts:26-199`, `extensions/github/src/remoteSourceProvider.ts:32-147`

```typescript
// cloneManager.ts:30-35
async clone(url?: string, options: CloneOptions = {}) {
  if (!url || typeof url !== 'string') {
    url = await pickRemoteSource({
      providerLabel: provider => l10n.t('Clone from {0}', provider.name),
      urlLabel: l10n.t('Clone from URL')
    });
  }
  // ...
}
```

The GitHub extension registers a `RemoteSourceProvider`:
```typescript
// github/src/remoteSourceProvider.ts:32-147
class GithubRemoteSourceProvider implements RemoteSourceProvider {
  async getRemoteSources(query?: string) {
    // If no query: returns user's repos via /user/repos
    // If query: searches via GitHub Search API
    // Protocol (https vs ssh) from `github.gitProtocol` config
  }
  async getBranches(url) { /* /repos/{owner}/{repo}/branches */ }
  async getRemoteSourceActions(url) { /* "Open on GitHub", "Checkout on vscode.dev" */ }
}
```

Debounce: 300ms on typed input. UI shows: repo name + description, stargazer count, icon.

### Finding: GitHub Desktop uses a three-tab dialog (GitHub.com / Enterprise / URL)
**Confidence:** CONFIRMED
**Evidence:** `app/src/ui/clone-repository/clone-repository.tsx:262-289`

```tsx
<TabBar onTabClicked={this.onTabClicked} selectedIndex={this.props.selectedTab}>
  <span id="dotcom-tab">GitHub.com</span>
  <span id="enterprise-tab">GitHub Enterprise</span>
  <span id="url-tab">URL</span>
</TabBar>
```

- **GitHub.com tab** — `CloneGithubRepository` component: account picker + paginated filterable repo list. Requires sign-in.
- **Enterprise tab** — same UI, different endpoint.
- **URL tab** — `CloneGenericRepository`: single TextBox. Label: "Repository URL or GitHub username and repository". Placeholder: "URL or username/repository". Accepts full URLs and `owner/repo` shorthand.

### Finding: Desktop's URL parser accepts 5 regex-matched formats + owner/repo shorthand
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/remote-parsing.ts:27-95`

```typescript
const remoteRegexes: ReadonlyArray<{ protocol: GitProtocol; regex: RegExp }> = [
  { protocol: 'https', regex: /^https?:\/\/(?:.+@)?(.+)\/([^/]+)\/([^/]+?)(?:\/|\.git\/?)?$/ },
  { protocol: 'ssh',   regex: /^git@(.+):([^/]+)\/([^/]+?)(?:\/|\.git)?$/ },
  { protocol: 'ssh',   regex: /^(?:.+)@(.+\.ghe\.com):([^/]+)\/([^/]+?)(?:\/|\.git)?$/ },
  { protocol: 'ssh',   regex: /^git:(.+)\/([^/]+)\/([^/]+?)(?:\/|\.git)?$/ },
  { protocol: 'ssh',   regex: /^ssh:\/\/git@(.+)\/(.+)\/(.+?)(?:\/|\.git)?$/ },
];

export function parseRepositoryIdentifier(url: string): IRepositoryIdentifier | null {
  const parsed = parseRemote(url);
  if (parsed) return { owner, name, hostname };

  const pieces = url.split('/');
  if (pieces.length === 2 && pieces[0].length > 0 && pieces[1].length > 0) {
    return { owner: pieces[0], name: pieces[1], hostname: null };
  }
  return null;
}
```

Formats accepted:
- `https://github.com/owner/name`
- `https://github.com/owner/name.git`
- `git@github.com:owner/name.git`
- `ssh://git@github.com/owner/name.git`
- `git:host/owner/name`
- Enterprise `*.ghe.com`
- `owner/name` shorthand

This regex set is copy-pasteable for a CLI/editor that wants parity. Alternatively, npm: `parse-github-url` / `hosted-git-info` (more permissive; handles gist, gitlab, bitbucket too).

### Finding: gh and Obsidian-Git ask for URL only; no repo browse
**Confidence:** CONFIRMED
**Evidence:** gh's command signature `gh repo clone <repository> [<directory>] [-- <gitflags>...]` where `<repository>` accepts `OWNER/REPO` shorthand, full URL, or SSH form. Obsidian-Git's handler (`src/commands.ts:379-382` → `main.ts:648-730`) opens a simple text-input modal for URL.

### Finding: Obsidian-Git prompts for URL → destination → depth as three sequential modals
**Confidence:** CONFIRMED
**Evidence:** `obsidian-git/src/main.ts:648-730`

Three modals in sequence, with the plugin warning if target path would overlap the Obsidian vault's config dir.

---

## Pattern synthesis

| Input mode | VSCode | Desktop | gh | Obsidian-Git | |
|---|---|---|---|---|---|
| Full URL paste | ✓ | ✓ | ✓ | ✓ | Universal |
| `owner/repo` shorthand | ✓ (GitHub ext) | ✓ | ✓ | ✗ | 4/5 |
| SSH `git@` paste | ✓ | ✓ | ✓ | ✓ | Universal |
| Authenticated repo list | ✓ | ✓ | ✗ | ✗ | Signed-in only |
| Search by repo name | ✓ (GitHub search API) | ✗ (filter own list only) | ✗ | ✗ | VSCode only |
| Branch picker | ✓ (after URL chosen) | ✗ (clone default branch) | ✗ | ✗ | VSCode only |

**Recommended shape for any editor implementing this feature:**
1. URL paste (all 5 formats + owner/repo shorthand) — matches Desktop's parser
2. After OAuth: `/user/repos` paginated list with filter — matches VSCode/Desktop
3. Branch picker: deferred; always clone default branch initially

---

## Gaps / follow-ups

- `hosted-git-info` vs Desktop's in-house regex: hosted-git-info supports gitlab/bitbucket too but adds a dep. Editors that only target GitHub initially can ship Desktop's ~7-line regex set dependency-free; editors anticipating multi-host support benefit from the library.
- Search-by-name via GitHub Search API adds rate-limit concerns (search is 30/min authenticated, 10/min unauthenticated). Worth noting but not blocking for v1.
