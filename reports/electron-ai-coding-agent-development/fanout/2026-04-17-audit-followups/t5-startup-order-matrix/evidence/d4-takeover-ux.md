# Evidence: D4 — "Take Over" / "Quit the Other" UX

**Dimension:** D4 — Second-instance forcibly taking the lock from the first
**Date:** 2026-04-17
**Sources:** VS Code source, Electron docs, shadow-lock patterns in Open Knowledge's own server (reference only — 1P code not analyzed in report body), community forum discussions

---

## Findings

### Finding: No production Electron app in the surveyed set offers auto-takeover
**Confidence:** CONFIRMED (by exhaustive negative search)
**Evidence:** VS Code source inspection (`claimInstance` → dialog, then exit non-zero if first instance deadlocked); GitHub Desktop (`app.quit()` immediately on `!gotSingleInstanceLock`); Logseq (`app.quit()` immediately); Obsidian (no takeover, user must kill manually).

No surveyed app automates "detect first instance is stuck, SIGTERM it, take lock." All defer to the user.

**Implications:** "Auto-takeover" is an architecturally risky feature — racing with a deadlocked-but-salvageable first instance could destroy unsaved state. The uniform industry answer is user-mediated.

### Finding: Manual takeover is surfaced via modal dialog instructing the user to kill the other instance
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:378-383`

```text
secondInstanceNoResponse: "Another instance of {0} is running but not responding"
secondInstanceNoResponseDetail: "Please close all other instances and try again."
```

VS Code's exact wording (localized). No button labeled "kill it" — only "Close" (dismiss dialog).

**Implications:** The user is informed, not given a one-click remediation. This is the safe default because "kill the other" could be killing legitimate in-progress work.

### Finding: Some apps offer "run as admin" escalation path on EPERM (Windows)
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:337-344`

```text
if (error.code === 'EPERM') {
    this.showStartupWarningDialog(
        localize('secondInstanceAdmin', "Another instance of {0} is already running as administrator.", ...),
        localize('secondInstanceAdminDetail', "Please close the other instance and try again."),
        ...
    );
}
```

When Instance A is admin-elevated and Instance B (non-admin) can't connect to A's IPC pipe (EPERM), VS Code surfaces a specific dialog — explicitly naming the privilege mismatch. No automated fix.

**Implications:** Error-code-specific dialogs are a UX quality marker. Instead of generic "couldn't start," the specific failure mode is named, letting the user take the right action.

### Finding: Read-only mode + user override is the Logseq proposal for cross-machine collisions
**Confidence:** CONFIRMED
**Evidence:** [logseq/logseq#3386](https://github.com/logseq/logseq/issues/3386)

```text
The application also provides a button to force-exit this read-only mode for situations where the user knows better.
```

Three-state UX: (1) owner mode (no peer detected), (2) read-only mode (peer detected), (3) forced-owner mode (user clicked "I know better," overriding).

**Implications:** When takeover is possible but risky, an intermediate "limp along safely" state is better than binary fail/succeed. Read-only is the natural middle ground — user can read data, can't corrupt it.

### Finding: The "give the user the PID" pattern enables user-mediated takeover without in-app UI
**Confidence:** INFERRED
**Evidence:** VS Code writes PID to `code.lock`; dialog says "close the other instance"; `pgrep`/Activity Monitor/Task Manager is the expected action path.

```text
FSPromises.writeFile(environmentMainService.mainLockfile, String(process.pid))
```

The PID in the lockfile serves no code purpose within VS Code — it's a diagnostic that a user (or support agent) can read to identify the right process to kill.

**Implications:** Even if the app never reads the PID, writing it makes the lockfile self-documenting. Trivial change; meaningfully better debugging.

---

## Gaps / follow-ups

- No public documentation found on JetBrains' "another IDE is holding this lock" recovery flow — their multi-IDE environment (IntelliJ, PyCharm, WebStorm sharing `.idea/`) must handle this, but path not traced.
