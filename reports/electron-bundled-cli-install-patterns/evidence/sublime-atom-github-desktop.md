# Evidence: Sublime (manual), Atom (legacy Electron menu), GitHub Desktop (no CLI)

**Dimension:** D5 (Additional precedents — manual, legacy, and negative cases)
**Date:** 2026-04-21
**Sources:** [Sublime command line docs](https://www.sublimetext.com/docs/command_line.html), [Atom Flight Manual](https://flight-manual.atom-editor.cc/), [atom/atom#7956](https://github.com/atom/atom/issues/7956), GitHub Desktop search

---

## Key pages referenced

- [Sublime Text command line](https://www.sublimetext.com/docs/command_line.html) — manual PATH recipe
- [Atom Flight Manual — Installing Atom](https://flight-manual.atom-editor.cc/getting-started/sections/installing-atom/)
- [atom/atom#7956 — EACCES symlink permission](https://github.com/atom/atom/issues/7956)
- [cli/cli (GitHub CLI)](https://github.com/cli/cli) — separate product, NOT bundled with GitHub Desktop

---

## Findings

### Finding: Sublime Text has NO in-app install action — users run `ln -s` by hand

**Confidence:** CONFIRMED
**Evidence:** Sublime docs (verbatim)

For zsh (macOS ≥ 10.15):

```bash
echo 'export PATH="/Applications/Sublime Text.app/Contents/SharedSupport/bin:$PATH"' >> ~/.zprofile
```

Binary location inside bundle: `/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl`.

No menu item. No Command Palette command. The user is expected to either append PATH or manually `ln -s`.

On Linux, package manager installs auto-symlink to `/usr/bin/subl`; tarball installs require:

```bash
sudo ln -s /opt/sublime_text/sublime_text /usr/local/bin/subl
```

**Implications:**

- Sublime's model is valid for a niche tool with a developer audience, but is below the bar for Open Knowledge's persona (P1 is a docs author without terminal fluency — per OK Electron spec §4). OK needs an in-GUI install action.
- **Useful historical note**: Sublime's `SharedSupport/bin` location is a convention some apps use instead of `Resources/app/bin` or `MacOS/`. Either works; Apple does not mandate one.

---

### Finding: Atom (sunsetted) had the same "Install Shell Commands" menu pattern VS Code still uses

**Confidence:** CONFIRMED
**Evidence:** Atom Flight Manual + atom/atom#7956

Menu: `Atom > Install Shell Commands` (macOS-only menu item).
Command Palette: `Window: Install Shell Commands`.

Symlinks created:

- `/usr/local/bin/atom` → `/Applications/Atom.app/Contents/Resources/app/atom.sh`
- `/usr/local/bin/apm` → `/Applications/Atom.app/Contents/Resources/app/apm/node_modules/.bin/apm` (apm is itself a published Node CLI shipped inside Atom's bundle, so its bin stub lives under `node_modules/.bin/`, not `bin/`)

Admin prompt surfaces for writing to `/usr/local/bin`.

**Historical note:** Atom was Electron's flagship app; VS Code inherited Atom's install pattern and refined it. That Atom → VS Code lineage is the direct ancestor of the pattern OK is proposing to adopt.

**Implications:**

- The menu-item-based install with `osascript` admin prompt is the most battle-tested pattern in the Electron ecosystem. Atom shipped it for ~7 years, VS Code has now shipped it for 10+, and every VS Code fork inherits it. Precedent strength is at the top tier.
- Atom shipped TWO symlinks (`atom` for editor, `apm` for package manager). OK's plan to ship TWO symlinks (`ok` + `open-knowledge` as backward-compat alias) is architecturally lighter (both point to the same binary) but the "multiple symlinks from one install action" precedent is clearly established.

---

### Finding: GitHub Desktop ships no CLI — bundles `git` internally but does not install a GitHub-branded PATH command

**Confidence:** CONFIRMED
**Evidence:** GitHub search + GitHub Desktop docs inventory

GitHub Desktop is GUI-only. It:

- Bundles its own internal `git` binary (for its own use), not installed on user PATH
- Does NOT install a `github` or `github-desktop` command

`gh` (GitHub CLI, [cli/cli](https://github.com/cli/cli)) is a separate product distributed via Homebrew / goreleaser / `.pkg` — NOT a component of GitHub Desktop. Users who want both install both.

**Implications:**

- The user's research prompt mentioned GitHub Desktop as a precedent. **It isn't one.** GitHub Desktop is a counter-example: a GUI-only app that chose NOT to bundle a CLI, even though it could.
- The relevant precedent here is the CHOICE: GitHub Desktop decided its GUI audience doesn't need a bundled CLI, and the power-user audience already has `gh`. Open Knowledge made the opposite call (D52: bundle CLI because P1 without Node cannot run MCP integration otherwise). This is the correct call for OK given the agent-integration story, but worth noting that not shipping a CLI is also a defensible choice for Electron apps.

---

## Gaps / follow-ups

- **Atom deprecation note**: Atom was sunset by GitHub in Dec 2022. Pattern lives on unchanged in VS Code. Reference only — do not wire OK's M6 to any Atom-derived assumptions about update cadence or security posture.
- **Slack / Discord / Linear / Figma Desktop**: also GUI-only. No bundled CLI. Same category as GitHub Desktop. No additional evidence needed.
