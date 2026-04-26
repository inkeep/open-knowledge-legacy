# Publishing sandbox-recipes as a standalone repo

These recipes started as `open-knowledge/sandbox-recipes/` but the tooling is general Claude Code infrastructure, not tied to OK. This doc is the extraction playbook for spinning them into a standalone repo (e.g., `inkeep/claude-sandbox`).

**Strategy:** private-first, public-later. Extract with git history intact, push to a private repo, iterate + genericize, flip visibility to public when stable.

## Prerequisites

- You're on `main` of `open-knowledge` with PR #291 merged (otherwise the `subtree split` pulls from a WIP branch; not fatal but messy).
- `gh` CLI authenticated to the `inkeep` org with repo-create permissions.
- A target repo name decided (this doc uses `claude-sandbox`; substitute as needed).

## Step 1 — Split the subtree

`git subtree split` is built into git. Preserves every commit in `sandbox-recipes/`, rewritten so the files sit at the repo root:

```bash
cd ~/Documents/code/open-knowledge          # wherever your open-knowledge clone is
git checkout main
git pull --ff-only

# Split sandbox-recipes/ into a new local branch with file paths rewritten to root:
git subtree split --prefix=sandbox-recipes -b claude-sandbox-extracted
```

## Step 2 — Run extract.sh

Automates the "clone the split branch into a new standalone directory + write install.sh + genericize" steps:

```bash
./sandbox-recipes/packaging/extract.sh ~/Documents/code/claude-sandbox
```

What it does:

1. Clones the `claude-sandbox-extracted` branch (from step 1) into the target dir.
2. Renames it to `main` as the default branch.
3. Removes the `origin` remote (so `git push` doesn't accidentally go back to open-knowledge).
4. Copies `install.sh.template` to `install.sh` at the new repo root (the curl target).
5. Copies `README.template.md` to the new repo's `README.md` (stand-alone framing, not OK-specific).
6. Adds a `LICENSE` file (MIT by default — edit to Apache-2 if preferred).
7. Applies small genericization patches (drops the auto-detected `ok` in `bootstrap.sh`; its replacement prompts the user for a project key on first install).
8. Leaves you with a clean standalone repo ready for `gh repo create`.

## Step 3 — Publish (private first)

```bash
cd ~/Documents/code/claude-sandbox
gh repo create inkeep/claude-sandbox --private --source=. --push --description "Tiered Claude Code sandboxing for macOS"
```

Share with teammates via Slack:

```
Claude Code sandbox tooling — one-liner install:
  curl -fsSL https://raw.githubusercontent.com/inkeep/claude-sandbox/main/install.sh | bash

Requires inkeep GitHub access (private repo). Add repos to ~/.cc-projects.sh, then:
  ccs --about   # comparison chart
  ccs -p <key>  # Tier 0 sandbox
  ccb -p <key>  # Tier 1 microVM
```

> Private-repo `git clone` via curl-pipe works IF the user's git credential helper can authenticate. Most inkeep members will have this via `gh auth login`. If not, ask them to set it up before running the installer.

## Step 4 — Iterate privately

Gather feedback from teammates. Likely follow-ups:

- Handle edge cases in their shell/layout setups.
- Add a `packaging/homebrew/` formula draft for the eventual tap.
- Expand project-registry UX (e.g., an `cc-add <shortcut> <path>` helper).

**Critically, do not update the curl installer URL during this phase** — teammates will have `$HOME/.claude-sandbox` cloned and git-pull updates will pick up your changes automatically.

## Step 5 — Flip to public (when ready)

```bash
# Add license header if not done already, verify README has no inkeep-internal references
gh repo edit inkeep/claude-sandbox --visibility public --accept-visibility-change-consequences
```

Publicity checklist before flipping:

- [ ] `LICENSE` file present (MIT or Apache-2)
- [ ] No inkeep-internal references in README, tier docs, or scripts (search for "inkeep" — the word's ok as the author; unsolicited references to internal repos are not)
- [ ] The companion report (`reports/claude-code-local-sandbox-options/REPORT.md` from open-knowledge) is either (a) copied in, (b) linked to the public open-knowledge repo, or (c) rewritten as a blog post on inkeep.dev
- [ ] `CONTRIBUTING.md` with guidance for: Linux support, Windows/WSL2 Tier 1 path, testing against new Apple Container versions
- [ ] `CHANGELOG.md` starting at v1.0.0 when you tag the first release

## Step 6 — Optional: Homebrew tap

Once public, add `inkeep/homebrew-tap` with a formula that does the git clone + bootstrap:

```ruby
# Formula/claude-sandbox.rb
class ClaudeSandbox < Formula
  desc "Tiered Claude Code sandboxing for macOS"
  homepage "https://github.com/inkeep/claude-sandbox"
  url "https://github.com/inkeep/claude-sandbox.git", tag: "v1.0.0"
  license "MIT"

  def install
    prefix.install Dir["*"]
  end

  def post_install
    system "#{prefix}/bootstrap.sh", "-y"
  end

  test do
    system "#{prefix}/cc-launcher", "--version"  # add a --version flag first
  end
end
```

Users then install via `brew install inkeep/tap/claude-sandbox`. Homebrew handles updates automatically via `brew upgrade`.

## Future publishing considerations

- **Linux support.** Tier 0 already works via bubblewrap. Tier 1 needs a non-Apple-Container path — natural candidate is Podman. Worth a dedicated `tier1-podman/` directory.
- **CI for the standalone repo.** GitHub Actions matrix: macOS 26 / macOS 14 / Ubuntu 22.04. Run `bash -n` + `shellcheck` on all scripts; run bootstrap in a scratch `$HOME` with `--skip-build` as a smoke test; if macOS runner has Apple Container, full build.
- **Versioning.** Tag releases (`v1.0.0`, `v1.1.0`). Homebrew tap consumes tags. Semver discipline lets users pin.
- **Contributor guide.** What counts as an in-scope contribution? What's out of scope? (Example out-of-scope: adding non-Claude-Code agent support. That's a different project.)

## If you change your mind about `_CC_` prefix

Before going public is the cheap moment. After-publish renames are migrations, and migrations are a pain. The current `_CC_` prefix is ~50 references across the codebase; one sed pass handles it. Re-run the rename script (see the commit history for the `_OK_` → `_CC_` pattern as reference) before pushing to public.
