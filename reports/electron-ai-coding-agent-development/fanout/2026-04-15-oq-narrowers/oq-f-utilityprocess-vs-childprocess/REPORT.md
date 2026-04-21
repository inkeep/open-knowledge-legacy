# OQ-F Narrower: utilityProcess vs child_process.fork confirmation

## Key finding
Lock utilityProcess.fork(). No confirmed blocker for Hocuspocus-per-window in Electron 41.2.0. Known landmines (#42978 dev/packaged, #44013 kill idempotency, #45053 kill blocks main) are workaroundable. Defensive patterns: track alive-state, timeout-guarded kill, keep event loop alive. child_process.fork() remains clean fallback if needed.

Full evidence from subagent — 16 Electron issue citations verified.
