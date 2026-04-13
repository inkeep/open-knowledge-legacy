# Evidence: Security, TOCTOU, platform differences

**Dimension:** Symlink escape, TOCTOU, Windows/macOS/Linux platform matrix
**Date:** 2026-04-12
**Sources:** CVE databases, OWASP, MSDN, Node.js Windows notes

---

## Findings

### Symlink escape is a real attack class with many CVEs
**Confidence:** CONFIRMED
**Evidence:**
- CVE-2021-32803 (node-tar): tar entries with symlinks that escape the extraction directory enabled arbitrary file write. Fix: reject symlinks whose target resolves outside the destination.
- CVE-2025-47290 (containerd): TOCTOU — layer 1 creates a directory, layer 2 replaces it with symlink, layer 3 writes into the now-symlinked path, escaping the container root.
- CVE-2022-29799/29800 ("Nimbuspwn", systemd networkd-dispatcher): symlink race for root privilege escalation.
- CVE-2026-32282 (Go): `Root.Chmod` TOCTOU permits root escape via symlink.

**Implication:** Any file-write pipeline that follows symlinks without canonical-path validation is vulnerable. Mitigation pattern is consistent across CVEs:
1. Compute the canonical path (realpath) of the write target.
2. Verify `canonical.startsWith(contentRoot)` — reject if escape.
3. Perform the write against the canonical path.
4. For hardcore cases (TOCTOU), use `openat(fd, path, O_NOFOLLOW)` relative to a pre-opened root fd (Linux-only; no Node builtin).

### For our use case, TOCTOU is low-risk but escape validation is still required
**Confidence:** INFERRED
**Evidence:** Our threat model: the server is a local process writing files owned by the user. Attackers are not a realistic concern. HOWEVER, accidental escape is — a user symlinks `my-notes/CLAUDE.md -> /etc/passwd` and the editor dutifully writes to `/etc/passwd` through the link. This is a **user-protection** issue, not a security boundary.

**Implication:** Recommended policy:
- Resolve realpath on every write.
- If realpath is within `contentDir`: proceed with tmp+rename against canonical.
- If realpath is OUTSIDE `contentDir`: choose one of:
  - **Strict:** refuse the write; log; surface as error in UI.
  - **Permissive with warning:** write anyway; log a warning.
  - **Allowlist:** allow writes to an explicit set of external paths.

Strict is the safe default. Permissive matches "user's computer, user's problem" but is a footgun.

### Windows: symlink creation requires elevated privilege or Developer Mode
**Confidence:** CONFIRMED
**Evidence:**
- MSDN / Windows Developer Blog (blogs.windows.com/windowsdeveloper/2016/12/02/symlinks-windows-10/): SeCreateSymbolicLinkPrivilege is admin-only by default.
- Since Win10 1703 (Creators Update), Developer Mode lifts this requirement.
- Node.js docs: `fs.symlink(target, path[, type])` — `type` argument is Windows-specific, values `'dir' | 'file' | 'junction'`. Junctions work WITHOUT the privilege (directories only, absolute paths only).
- gitforwindows.org/symbolic-links: documents workaround and privilege issue in detail.

**Implication:** Our server should not attempt to *create* symlinks (we only read and write-through them). Reading symlinks (lstat, readlink, realpath) requires no privilege on any platform.

### NTFS junctions vs. symlinks
**Confidence:** CONFIRMED
**Evidence:**
- Junctions: NTFS reparse points, directories only, absolute paths only, no privilege required.
- Symlinks: both file and directory, absolute or relative, privilege required.
- Node.js `fs.lstat` returns `isSymbolicLink() === true` for both. `fs.realpath` resolves both transparently.

**Implication:** We do not need to distinguish at the application layer. Node abstracts them.

### macOS APFS and Linux ext4/btrfs/zfs: no surprises
**Confidence:** CONFIRMED
**Evidence:** POSIX-compliant symlink semantics across all. APFS firmlinks (macOS internal `/System/Volumes/Data` plumbing) are kernel-level and invisible to user code.

### Node.js `realpath.native` vs pure-JS realpath: both safe; .native is faster
**Confidence:** CONFIRMED
**Evidence:** Node.js fs docs; `.native` calls libc realpath(3). Pure-JS version exists for legacy caching API compatibility.

---

## Gaps / follow-ups

- We did not deeply probe openat-with-O_NOFOLLOW patterns. Node does not expose these. For a pure-Node server, the realpath-then-check pattern is what's available. A future hardening pass could shell out or use FFI, but the ROI is low for a localhost dev tool.
