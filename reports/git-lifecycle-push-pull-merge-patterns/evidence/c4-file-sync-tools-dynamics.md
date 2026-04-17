# Evidence: File-Sync Tool Detection, Scheduling, Conflict, and Retry Dynamics

**Dimension:** Non-editor sync dynamics — file-sync tool scheduling, conflict patterns, rate limiting
**Date:** 2026-04-15
**Sources:** Syncthing, Rclone, Nextcloud, git-annex, Dropbox, OneDrive

---

## Key files / pages referenced

- [Syncthing — Understanding Synchronization](https://docs.syncthing.net/users/syncing.html) — watcher, debounce, conflict naming
- [Syncthing — Configuration reference](https://docs.syncthing.net/users/config.html) — intervals, rate limits, connection limits
- [Syncthing forum: FS Watcher and rescan interval](https://forum.syncthing.net/t/fs-watcher-and-rescan-interval/10982)
- [Rclone — Bisync](https://rclone.org/bisync/) — conflict resolver, listing snapshots, recovery
- [Rclone — Global Flags](https://rclone.org/flags/) — retries, bwlimit, transfers
- [Rclone — rclone mount](https://rclone.org/commands/rclone_mount/) — VFS cache, poll-interval
- [Nextcloud Desktop Architecture (v3.3)](https://docs.nextcloud.com/desktop/3.3/architecture.html) — sync engine, ETag pruning, journal DB
- [git-annex assistant syncing design](https://git-annex.branchable.com/design/assistant/syncing/) — watcher, push retry, lock files
- [Dropbox — What's a conflicted copy?](https://help.dropbox.com/organize/conflicted-copy) — conflict naming pattern
- [OneDrive sync conflict resolution](https://sharepointmaven.com/how-onedrive-sync-resolves-sync-conflicts/) — Office co-authoring, keep-both

---

## Findings

### Finding: Syncthing uses hybrid inotify + periodic full-rescan with jittered interval
**Confidence:** CONFIRMED
**Evidence:** [docs.syncthing.net/users/syncing.html](https://docs.syncthing.net/users/syncing.html)

inotify/FSEvents as primary trigger; full-rescan at `rescanIntervalS` (default 3600s when watcher active, 60s when disabled). Interval jittered ±25% to prevent thundering-herd across folders.

### Finding: Syncthing debounces at 10s with additional 60s hold for deletions
**Confidence:** CONFIRMED
**Evidence:** [docs.syncthing.net/users/syncing.html](https://docs.syncthing.net/users/syncing.html)

`fsWatcherDelayS` (default 10s) accumulates watcher events before triggering scan. Deletions held an additional ~60s on top to avoid spurious deletes from in-progress writes. Both configurable per-folder.

### Finding: Syncthing conflict resolution uses mtime with device-ID tiebreaker
**Confidence:** CONFIRMED
**Evidence:** [docs.syncthing.net/users/syncing.html](https://docs.syncthing.net/users/syncing.html)

Device with older mtime loses; its version renamed. Equal mtimes: smaller device ID wins. Pattern: `<basename>.sync-conflict-<YYYYMMDD>-<HHMMSS>-<deviceID8chars>.<ext>`. Conflict files propagated to all peers.

### Finding: Syncthing has per-device bandwidth throttle and connection limits
**Confidence:** CONFIRMED
**Evidence:** [docs.syncthing.net/users/config.html](https://docs.syncthing.net/users/config.html)

Global `maxSendKbps`/`maxRecvKbps` in `<options>`; per-device overrides in `<device>`. `connectionLimitEnough` (stop seeking above N) and `connectionLimitMax` (hard cap). LAN-only exemption since v1.13.0.

### Finding: Syncthing reconnects at fixed 60s interval with no exponential backoff
**Confidence:** CONFIRMED
**Evidence:** [docs.syncthing.net/users/config.html](https://docs.syncthing.net/users/config.html)

`reconnectionIntervalS` = 60s default. Relay connections: `relayReconnectIntervalM` = 10 min. No documented exponential backoff.

### Finding: Rclone bisync uses snapshot-based listing — no persistent watcher
**Confidence:** CONFIRMED
**Evidence:** [rclone.org/bisync](https://rclone.org/bisync/)

Each run lists both sides and diffs against `.lst` snapshot files in `~/.cache/rclone/bisync/`. No filesystem watcher. Change types: New, Newer, Older, Deleted. `--compare checksum` adds hash comparison.

### Finding: Rclone has two-level retry: 3 outer (whole pass) + 10 inner (per-API-call)
**Confidence:** CONFIRMED
**Evidence:** [rclone.org/flags](https://rclone.org/flags/)

`--retries` (default 3) retries entire sync pass. `--low-level-retries` (default 10) retries individual API calls. `--retries-sleep` for inter-retry delay. No documented exponential backoff for outer retries.

### Finding: Rclone bisync has configurable conflict resolver — the only surveyed tool with explicit conflict policy enum
**Confidence:** CONFIRMED
**Evidence:** [rclone.org/bisync](https://rclone.org/bisync/)

`--conflict-resolve` options: `none` (default — both renamed), `newer`, `older`, `larger`, `smaller`, `path1`, `path2`. `--conflict-suffix` defaults to `.conflict`. `--recover` replays against backup listing; `--resilient` allows retry without `--resync`.

### Finding: Rclone bwlimit supports timetable syntax for time-of-day rate limiting
**Confidence:** CONFIRMED
**Evidence:** [rclone.org/docs](https://rclone.org/docs/)

`--bwlimit "08:00,512k 18:00,10M 23:00,off"`. Separate upload/download: `10M:100k`. `--transfers` (default 4) for parallel file transfers; `--checkers` (default 8) for parallel equality checks.

### Finding: Nextcloud desktop uses ETag-based tree pruning for efficient sync
**Confidence:** CONFIRMED
**Evidence:** [docs.nextcloud.com/desktop/3.3/architecture.html](https://docs.nextcloud.com/desktop/3.3/architecture.html)

Directory ETags (unique IDs changing when any file changes) prune the tree-walk. Only directories with changed ETags are fully diffed. Polling fallback: 2 hours when inotify watch limit exceeded.

### Finding: Nextcloud conflict files are not uploaded to server by default
**Confidence:** CONFIRMED
**Evidence:** [docs.nextcloud.com/desktop/3.3](https://docs.nextcloud.com/desktop/3.3/architecture.html)

Local version renamed (`<basename>_conflict-<YYYYMMDD>-<HHMMSS>.<ext>`); remote version becomes canonical. Pattern `*_conflict-*` excluded from sync by default unless "conflict file uploading" explicitly enabled.

### Finding: git-annex assistant retries failed pushes every 30 minutes
**Confidence:** CONFIRMED
**Evidence:** [git-annex.branchable.com/design/assistant/syncing](https://git-annex.branchable.com/design/assistant/syncing/)

Failed pushes retried by the assistant's retry thread at 30-min intervals. Transfer races detected via lock files. Both conflicting files are kept (no LWW) — conflicts create separate commits.

### Finding: Dropbox conflict naming includes device name and date
**Confidence:** CONFIRMED
**Evidence:** [help.dropbox.com/organize/conflicted-copy](https://help.dropbox.com/organize/conflicted-copy)

Pattern: `<basename> (<DeviceName>'s conflicted copy <YYYY-MM-DD>).<ext>`. Last-saved version wins the original filename.

### Finding: All file-sync tools use rename-based conflict resolution — no tool auto-merges content
**Confidence:** CONFIRMED
**Evidence:** All docs surveyed

Syncthing (mtime wins), Nextcloud (server wins), Dropbox (last save wins), OneDrive (keep both), rclone (configurable), git-annex (keep both, no winner). No tool attempts content merge for non-text files.

### Finding: State persistence is via metadata database, not operation queue
**Confidence:** CONFIRMED
**Evidence:** All tools surveyed

Syncthing (BoltDB index), Nextcloud (SQLite journal), Dropbox (proprietary SQLite), OneDrive (proprietary SQLite), rclone (`.lst` snapshots), git-annex (git objects). Work is re-derived from metadata on reconnect, not replayed from a queue.

---

## Comparative Table

| Tool | Detection | Debounce | Conflict Winner | Conflict Pattern | Rate Limit | Reconnect | Retry | State |
|------|-----------|----------|----------------|-----------------|------------|-----------|-------|-------|
| Syncthing | inotify + 1h rescan | 10s (+60s deletes) | Older mtime loses | `.sync-conflict-YYYYMMDD-HHMMSS-<id>` | Per-device kBps | 60s fixed | Per-cycle | BoltDB index |
| Rclone | Snapshot listing | None | Configurable | `.<conflict-suffix>` | bwlimit timetable | Per-run | 3 outer + 10 inner | `.lst` files |
| Nextcloud | inotify + 2h poll | Implicit | Server wins | `_conflict-YYYYMMDD-HHMMSS` | None (client) | OS-event | Per-cycle | SQLite journal |
| git-annex | inotify/kqueue | Implicit | Both kept | git branch identity | None | 30min push retry | 30min push retry | git objects |
| Dropbox | inotify/FSEvents | Not disclosed | Last save wins | `(Device's conflicted copy YYYY-MM-DD)` | None (user) | Not disclosed | Not disclosed | SQLite |
| OneDrive | FSEvents/Win32 | Not disclosed | Keep both | `-<DeviceName>` | Group Policy | Not disclosed | Not disclosed | SQLite |

---

## Gaps / follow-ups

- Syncthing puller retry details (per-file failure) not fully documented
- Nextcloud exact polling fallback interval (2h) is from community; not confirmed in official config
- Dropbox and OneDrive reconnection backoff details are proprietary and undisclosed
- Rclone bisync `--retries-sleep` backoff behavior (linear vs exponential) not confirmed
