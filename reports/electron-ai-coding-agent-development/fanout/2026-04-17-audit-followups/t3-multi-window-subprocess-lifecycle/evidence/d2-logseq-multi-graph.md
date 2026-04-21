# Evidence D2: Logseq Multi-Graph Lifecycle

**Dimension:** D2 (P0) — Logseq: multi-graph simultaneous windows; graph lock/collision; crash recovery
**Date:** 2026-04-17
**Sources:** `~/.claude/oss-repos/logseq/` (Logseq, AGPL — ClojureScript Electron main)

---

## Key files referenced

- `src/electron/electron/core.cljs` (L316, L322, L343-354) — `before-quit`, `requestSingleInstanceLock`, `second-instance`, `window-all-closed`
- `src/electron/electron/window.cljs` (L21-74, L97-117) — `create-main-window!`, `switch-to-window!`, `graph-has-other-windows?`, `get-graph-all-windows`
- `src/electron/electron/handler.cljs` (L400-410) — `openNewWindow` IPC handler, no collision check

---

## Findings

### Finding D2a: Logseq supports multi-graph multi-window, with whole-app single-instance lock (not per-graph lock)

**Confidence:** CONFIRMED
**Evidence:** `core.cljs:321-353`

```clojure
(defn main []
  (if-not (.requestSingleInstanceLock app)
    (.quit app)                                            ; 2nd instance of app: quit
    (let [privileges ...]
      (.on app "second-instance"
           (fn [_event ^js command-line _working-directory]
             (when-let [window @*win]
               (win/switch-to-window! window)              ; focus first window
               ...)))
      (.on app "window-all-closed" (fn []
                                     (logger/debug "window-all-closed" "Quitting...")
                                     (.quit app))))))
```

**Implications:** Logseq allows only one Logseq.app process per OS user. Additional invocations are redirected into the existing process via `second-instance` handler. This is classic Electron single-instance — no per-graph concurrency with a second process.

---

### Finding D2b: Logseq *does* permit the same graph to be opened in multiple windows inside one app process — no collision check, no de-duplication

**Confidence:** CONFIRMED
**Evidence:** `handler.cljs:400-410` + `window.cljs:21-74`

```clojure
(defn open-new-window!
  [repo]
  (let [win (win/create-main-window! win/MAIN_WINDOW_ENTRY {:graph repo})]
    (win/on-close-actions! win)
    (win/setup-window-listeners! win)
    win))

(defmethod handle :openNewWindow [_window [_ repo]]
  (logger/info ::open-new-window)
  (open-new-window! repo)
  nil)
```

```clojure
; window.cljs
(defn create-main-window!
  [url {:keys [graph] :as opts}]
  (let [win-state (windowStateKeeper (clj->js {:defaultWidth 980 :defaultHeight 700}))
        url (if graph (str url "#/?graph=" graph) url)
        ...]
    (BrowserWindow. ...)))
```

No collision check, no lock, no `findWindowOnGraph` precheck. The handler goes straight from IPC → create-BrowserWindow.

**Implications:**
- Logseq deliberately allows multi-window-same-graph. This is an explicit product stance — not a bug.
- Graph integrity must be preserved by a lower layer (presumably the graph DB or the file watcher) because the window/process architecture is not enforcing single-writer semantics.
- There is no "project already open — focus existing" dialog in Logseq. The `graph-has-other-windows?` predicate exists but is used for shutdown ordering (don't-hide-on-Mac-if-multi-window), not for open-collision.

---

### Finding D2c: Logseq tracks graph→windows association in a state atom, used for close/shutdown logic

**Confidence:** CONFIRMED
**Evidence:** `window.cljs:106-117`

```clojure
(defn get-graph-all-windows
  [graph-path] ;; graph-path == dir
  (->> (group-by second (:window/graph @state/state))
       (#(get % graph-path))
       (map first)))

(defn graph-has-other-windows? [win dir]
  (let [windows (get-graph-all-windows dir)]
    (boolean (some (fn [^js window] (and (not (.isDestroyed window))
                                         (not= (.-id win) (.-id window))))
                   windows))))
```

The state atom `:window/graph` is a list of `[window graph-path]` pairs. `get-graph-all-windows` reverse-indexes by path. This is used to decide whether to tear down DB resources when closing a window — if other windows still use the graph, keep resources alive.

**Implications:**
- Graph-shared state is released by reference counting, not by single-owner semantics. Multi-window-same-graph is a first-class concern.
- This is a meaningful alternative design to per-project subprocess isolation.

---

### Finding D2d: Close-handler uses in-renderer teardown (preventDefault + dirty check), then destroy

**Confidence:** CONFIRMED
**Evidence:** `window.cljs:84-95` + `core.cljs:294-317`

```clojure
; window.cljs
(defn close-handler
  [^js win e]
  (.preventDefault e)
  (state/close-window! win)
  (let [web-contents (. win -webContents)]
    (.send web-contents "persist-zoom-level" (.getZoomLevel web-contents)))
  (destroy-window! win))
```

```clojure
; core.cljs L294
(.on win "close" (fn [e]
                   (when @*quit-dirty? ;; when not updating
                     (.preventDefault e)
                     (let [windows (win/get-all-windows)
                           window @*win
                           multiple-windows? (> (count windows) 1)]
                       (cond
                         (or multiple-windows? (not mac?) @win/*quitting?)
                           (when window (win/close-handler win e) ...)
                         (and mac? (not multiple-windows?))
                           ;; Just hiding — not actually closing
                           ...
                         :else nil)))))
(.on app' "before-quit" (fn [_e] (reset! win/*quitting? true)))
```

**Implications:**
- Logseq preventDefault-s window close, sends IPC to renderer to persist zoom level, then calls `.destroy()`. No utilityProcess to drain — Logseq's graph DB lives in-renderer + SQLite on disk.
- `*quitting?` atom is Logseq's equivalent to VS Code's `_quitRequested` — gates Mac "hide on close" vs "actually close".

---

### Finding D2e: Logseq has no utilityProcess — compute runs in-renderer

**Confidence:** CONFIRMED (by negative search)
**Evidence:** No import of `utilityProcess` or `fork` in `src/electron/electron/*.cljs`.

```bash
# Negative search
grep -r "utilityProcess\|utility-process\|fork\b" src/electron/electron/
# No matches
```

Logseq does spawn a Node HTTP server (`electron/server.cljs`) via in-process Express in the main process for HTTP API purposes, but does not fork utility subprocesses per window.

**Implications:**
- Logseq's "one process per graph" model is approximated by renderer-process isolation (each BrowserWindow is a separate renderer = separate V8 isolate), not by dedicated Node utility processes.
- This is a cheaper model (no fork overhead) but does NOT provide the "kill a runaway graph without taking down the whole app" property that utility-process isolation provides.

---

## Gaps / follow-ups

- Did not inspect Logseq's SQLite-level concurrent-write handling. Logseq presumably relies on SQLite's own WAL-mode locking for graph-level atomicity across multiple renderers.
- Did not locate Logseq's crash-recovery dialog code (if any). The core.cljs register-exception-handler reference (`exceptions.cljs`) should be inspected for comparison with GitHub Desktop's CrashWindow.
