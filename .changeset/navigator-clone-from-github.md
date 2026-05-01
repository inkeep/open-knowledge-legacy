---
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge-desktop": minor
---

feat(navigator): clone-from-GitHub end-to-end via IPC

The Project Navigator (the launcher window with no backing API server) can
now drive the full GitHub clone flow: Sign in via device-flow auth, browse
your repositories, clone, and spawn the cloned project as a new editor
window. Editor windows continue using the existing HTTP path — no
regression.

Server (`@inkeep/open-knowledge-server`):
- New public API in `local-ops/`: `runDeviceFlowSubprocess`,
  `runCloneSubprocess`, `runAuthStatusSubprocess`, `runAuthReposSubprocess`,
  `validateCloneInputs`. Framing-agnostic subprocess runners shared by
  both the HTTP relay and the desktop IPC handlers — guarantees the two
  paths can't drift.
- `CloneCompleteEvent.dir` is now required on the wire (was optional).
  The HTTP relay always emits it; tightening the type retires the silent
  no-op when downstream consumers checked `if (!dir) return`.

Desktop (`@inkeep/open-knowledge-desktop`):
- New IPC channels for streaming flows: `ok:local-op:auth:start` /
  `ok:local-op:clone:start` (with `:event` push + `:cancel` siblings).
- New IPC channels for one-shot bounded queries:
  `ok:local-op:auth:status` and `ok:local-op:auth:repos`.
- New bridge surface: `bridge.localOp.{auth.start, clone.start,
  authStatus, authRepos}`.

App (`@inkeep/open-knowledge-app`):
- `CloneDialog` accepts pluggable `transport` (clone subprocess) and
  `authQueryTransport` (status + repos) props, defaulting to the existing
  HTTP path. Navigator passes the IPC equivalents.
- `AuthModal` accepts a pluggable device-flow `transport`, same default
  pattern.
