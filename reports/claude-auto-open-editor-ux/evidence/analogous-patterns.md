# Analogous "auto-open preview" patterns in other tools

## Vite / Create-React-App / Next.js dev server

- Vite: `server.open: true` in config (or `--open` flag) calls Node's
  `open`-style native launch on first start. Once running, pressing `o` in the
  terminal opens the browser. (vitejs/vite discussions #8467, #11971.)
- CRA: auto-opens on `npm start` by default unless `BROWSER=none` is set.
- Next.js dev: does **not** auto-open by default; logs the URL and waits
  (vercel/next.js #13448).

Pattern: **open once per process start, not on every event.** The dev server
doesn't reopen on every hot-module-reload. The user opens it once; HMR
updates the already-open tab in place.

## GitHub Codespaces / VS Code port forwarding

Source: https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace

When a process prints `http://localhost:PORT`, VS Code detects it and forwards
the port. Default behavior is a **toast notification** in the bottom-right —
the user clicks "Open in Browser" or "Preview in Editor." Configurable via
`devcontainer.json`:

```json
"portsAttributes": {
  "3000": {
    "label": "App",
    "onAutoForward": "notify"   // or "openBrowser" or "openPreview" or "silent"
  }
}
```

`openPreview` opens the Simple Browser *inside* the editor. This is the
closest thing to "editor auto-opens on the first signal."

Pattern: **detect once, prompt with non-modal toast, let user choose how to
open.** Subsequent port activity doesn't re-prompt.

## Streamlit / Jupyter / Observable

- Streamlit: `streamlit run app.py` auto-opens browser on start (via Python's
  `webbrowser.open`).
- Jupyter notebook / lab: auto-opens browser on `jupyter lab` unless
  `--no-browser`.
- Observable: opens a web tab on `observable serve`.

All one-shot-on-start. None re-opens on content change.

## Cursor's "composer" / Lovable / v0 / Bolt

Split-screen is **always-on** once the session is established — the preview
pane is a first-class UI region, not a transient notification. The preview
updates content as the agent writes; it never jumps or re-opens. Focus
doesn't follow because the pane is persistent. This is the gold standard for
our use case, but it requires the host to have a persistent preview pane
(Cursor does; Claude Code CLI does not; Claude Desktop has one but only
for launch.json targets).

## Focus-stealing mitigations in general

- VS Code toasts: non-modal, auto-dismissed, stacked.
- Chrome: new tabs open in background by default unless triggered by user
  gesture.
- macOS `open` command: `open -g URL` opens without stealing focus; `open URL`
  raises the browser. We can choose.
- Safari / Chrome: opening the same URL twice focuses the existing tab rather
  than duplicating — a built-in deduplication for "I already have this open."

## Distilled lessons

1. **Open once, then update in place.** Don't re-open on every write.
2. **Toast + click beats auto-navigate.** Users hate focus theft.
3. **Persistent pane beats transient iframe.** If the host has a pane, use it.
4. **A URL in stdout is a surprisingly-good minimum viable signal.** Terminals
   make it clickable; Cursor/Claude Desktop detect-and-preview.
5. **Same-URL dedup is free** — the browser does it for us if the URL is
   stable across writes (i.e., no `?t=<timestamp>` cache-busters).
