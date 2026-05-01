---
name: user_outcomes
description: User-stated outcomes and intent captured at intake (2026-04-30)
type: evidence
date: 2026-04-30
sources:
  - intake conversation 2026-04-30
---

# User outcomes (intake)

This is internal-refactor work in a pre-release codebase. The "users" of the change are:

1. **The OK team** working in the monorepo (and AI coding agents working alongside them).
2. **Project authors** — the team's dogfood today, future external users post-release — who configure project scoping.

## What the user said (2026-04-30)

- "We are changing the directory name where we store open-knowledge specific paths. We think `.open-knowledge` is too cluttersome. So we agreed to condense it to `.ok` directory."
- "Also we are going to move the include/exclude system from the config.yaml to a `.okignore` file that follows the same syntax as `.gitignore`."
- "Keep shadow repo consistent for now." (re: `.git/open-knowledge/` rename scope)
- "This is a greenfield project. I don't want to maintain any legacy code or migrators at this point (it is pre-release)." (re: migration UX)
- "`.okignore` is at the root and can be at any file/folder level." (re: nested-`.okignore` support)

## What this implies for value framing

- **Cognitive load reduction** for both internal devs and project authors. `.ok/` is shorter, matches the `ok` CLI binary, removes one mental translation layer.
- **Convention reuse over custom config.** Project authors who already know `.gitignore` get a familiar tool. Custom YAML globs disappear.
- **Greenfield posture.** No backward-compat code, no legacy readers, no transitional flags. The implementation gets to be aggressively simpler than a typical migration would be.
- **Strict expressiveness gain** as a side-effect: `.okignore` with `!` negation can override `.gitignore` exclusions to opt files back IN — something today's `content.exclude`-only YAML can't do.

## What the user did NOT say (and we should not assume)

- Nothing about renaming the package names (`@inkeep/open-knowledge`, etc.) or the CLI bin name (`open-knowledge`, alias `ok`). Out of scope; tag NG4.
- Nothing about renaming `OK_*` env vars (already correct).
