# Evidence: Docker Desktop — first-launch auto-install + user-selectable location

**Dimension:** D4 (Docker Desktop auto-install pattern + $HOME fallback option)
**Date:** 2026-04-21
**Sources:** [Docker Mac permission requirements](https://docs.docker.com/desktop/setup/install/mac-permission-requirements/), [docker/for-mac#6538](https://github.com/docker/for-mac/issues/6538), [#5593](https://github.com/docker/for-mac/issues/5593), [#2890](https://github.com/docker/for-mac/issues/2890)

---

## Key pages referenced

- [Docker Desktop Mac permission requirements](https://docs.docker.com/desktop/setup/install/mac-permission-requirements/)
- [docker/for-mac#6538 — Hard-coded symlink paths](https://github.com/docker/for-mac/issues/6538)
- [docker/for-mac#6328 — Overwrites existing kubectl even when k8s disabled](https://github.com/docker/for-mac/issues/6328)
- [docker/for-mac#2890 — kubectl overrides /usr/local/bin/kubectl](https://github.com/docker/for-mac/issues/2890)

---

## Findings

### Finding: Docker Desktop presents a first-launch installer dialog, not a post-launch menu item

**Confidence:** CONFIRMED
**Evidence:** Docker docs + search results

> "The first time Docker Desktop for Mac launches, it presents an installation window where you can choose to either use the default settings, which work for most developers and requires you to grant privileged access, or use advanced settings."

The CLI install is NOT deferred behind a user-triggered "Install CLI" menu item like VS Code / Zed. It happens at first-launch as part of the onboarding flow. User can:

- Accept defaults → admin prompt fires → symlinks go to `/usr/local/bin/`
- Pick "advanced settings" → choose `$HOME/.docker/bin` → no admin prompt, user adds PATH manually

**Implications:**

Docker's first-launch-install is a different UX from VS Code's explicit opt-in. Pros: zero friction for the 99% case. Cons: users can't opt out cleanly; aggressive symlink re-creation (see below) has caused community friction. OK's D52 decision to go with the VS Code opt-in menu model is the more conservative choice.

---

### Finding: Docker Desktop symlinks from `/Applications/Docker.app/Contents/Resources/bin/` into the chosen PATH location

**Confidence:** CONFIRMED
**Evidence:** Docker Mac permission docs + multiple issue threads

Binaries bundle location (fixed): `/Applications/Docker.app/Contents/Resources/bin/`.

Symlinks placed into either:

- **Default**: `/usr/local/bin/docker`, `/usr/local/bin/docker-compose`, `/usr/local/bin/kubectl`, etc.
- **User-opt**: `$HOME/.docker/bin/` (no admin required; user modifies PATH)

Additionally, Docker Desktop can manage `/var/run/docker.sock` as a symlink via a startup privileged helper task:

> "ln -s -f /Users/<user>/.docker/run/docker.sock /var/run/docker.sock"

**Implications for OK:**

- The fallback of `$HOME/.docker/bin/` + user PATH setup is a good precedent for OK to document as a "no-sudo" alternative. OK's equivalent would be `$HOME/.open-knowledge/bin/` or `~/.local/bin/`. Not required for M6, but future enhancement if admin-prompt friction surfaces.
- Docker's socket-symlink pattern is NOT relevant for OK — OK has no equivalent to `docker.sock`. `ok mcp` stdio and `ok start` TCP listen don't cross filesystem boundaries that way.

---

### Finding: Docker aggressively re-creates symlinks on every launch — causes conflict when users have their own kubectl

**Confidence:** CONFIRMED
**Evidence:** [#6328](https://github.com/docker/for-mac/issues/6328), [#2890](https://github.com/docker/for-mac/issues/2890), community reports

> "You can't just delete or rename the symlink that Docker Desktop creates; it will simply re-create the symlink the next time it launches."

Known issue: if the user installs `kubectl` via Homebrew (which lands at `/usr/local/bin/kubectl`), Docker Desktop on next launch overwrites the symlink to point at its bundled (often-older) `kubectl`, silently breaking the user's toolchain. Reopened in [#6328](https://github.com/docker/for-mac/issues/6328) multiple times; Docker's position is that this is intended behavior when k8s is enabled.

**Implications for OK:**

- **DO NOT replicate this**: OK should check-before-create, and if `/usr/local/bin/ok` already exists AND does not point at the current app bundle (e.g., user has `npm i -g @inkeep/open-knowledge` installed), OK should prompt rather than silently overwrite. The VS Code behavior is more conservative (one-shot on user click; never auto-reconciles on launch).
- Open Knowledge has a specific version of this risk: the `ok` bin from `npm i -g @inkeep/open-knowledge` lands at `$NPM_PREFIX/bin/ok`. `$NPM_PREFIX` is typically `/usr/local/` (Homebrew Node), `/opt/homebrew/` (Apple Silicon Homebrew), or `~/.npm-global/`. Coexistence is fine as long as BOTH point at conceptually the same CLI. Reconciliation isn't needed — the shell PATH resolution picks whichever appears first.
- Per OK spec D52 §8.12: "Subsequent menu clicks no-op if both symlinks already exist and point at the current app bundle." This is the correct conservative choice.

---

### Finding: Docker Desktop requires admin only if the chosen location isn't user-writable

**Confidence:** CONFIRMED
**Evidence:** Docker Mac permission docs (verbatim)

> "If `/usr/local/bin` is chosen, and this location is not writable by unprivileged users, Docker Desktop requires authorization to confirm this choice before the symlinks to Docker binaries are created in `/usr/local/bin`."

> "When choosing this location [$HOME/.docker/bin], authorization is not required, but then you must manually add `$HOME/.docker/bin` to your PATH."

Admin is lazy-evaluated at install time based on target dir writability. On Apple Silicon, `/usr/local/bin` may be pre-created by Homebrew with user-owned permissions, in which case the admin prompt is skipped entirely.

**Implications:**

The "needs admin" decision is file-system-state dependent. OK's install action should use the same model — `fs.access(targetDir, fs.constants.W_OK)` before `osascript`. If writable without admin, silently create the symlinks. If not, prompt.

---

## Gaps / follow-ups

- **Docker Desktop uninstall CLI behavior**: whether the uninstaller removes the symlinks (leaving dangling links is a common user complaint; didn't locate definitive doc). Best-effort cleanup should be part of OK's uninstall story.
- **Windows Docker Desktop**: skipped — out of scope for OK M2-M3 which is macOS-only.
