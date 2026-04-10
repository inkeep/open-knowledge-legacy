# Evidence: VS Code Webview API & Simple Browser Reference

**Dimension:** D5 — VS Code Webview Reference
**Date:** 2026-04-03
**Sources:** VS Code official docs, extension API reference, community guides

---

## Key pages referenced

- https://code.visualstudio.com/api/extension-guides/webview — Webview API guide
- https://code.visualstudio.com/api/ux-guidelines/webviews — Webview UX guidelines
- https://code.visualstudio.com/docs/debugtest/integrated-browser — Integrated browser docs
- https://github.com/microsoft/vscode/issues/70339 — Feature request for URL webviews
- https://github.com/microsoft/vscode/issues/102959 — CORS issues in webview

---

## Findings

### Finding: VS Code webviews can render arbitrary HTML/JS but have strict CSP by default
**Confidence:** CONFIRMED
**Evidence:** VS Code API docs

"A webview can render almost any HTML content" but runs in a sandboxed iframe with restricted Content Security Policy. Extensions must explicitly configure CSP to allow external resource loading.

For loading external URLs:
```html
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'self'; frame-src 'self' ${domain}; script-src 'self';">
```

**Implications:** A VS Code extension could embed our editor as an iframe within a webview panel, with appropriate CSP configuration.

### Finding: VS Code's Simple Browser can load localhost and external URLs as editor tabs
**Confidence:** CONFIRMED
**Evidence:** VS Code docs

Command palette → "Simple Browser: Show" → enters URL. Opens as an editor tab. Supports localhost URLs natively. This is the simplest pathway for viewing a web app inside VS Code/Cursor.

**Implications:** Our editor URL can be opened in Simple Browser with zero extension code. The limitation is this is manual (user must open it) and has no programmatic control.

### Finding: WebviewPanel (editor area) and WebviewView (sidebar) are the two placement options
**Confidence:** CONFIRMED
**Evidence:** VS Code API docs

- `WebviewPanel` — opens in the editor area (like a code tab)
- `WebviewView` — renders in a sidebar or panel view container
- Both support message passing between extension and webview via postMessage
- `portMapping` option maps localhost ports for secure access

**Implications:** Our editor could render as either an editor tab (WebviewPanel) or a sidebar panel (WebviewView). Sidebar is probably better for side-by-side with code.

### Finding: Loading external URLs in VS Code webviews requires iframe embedding, not direct URL setting
**Confidence:** CONFIRMED
**Evidence:** GitHub issue #70339 + community guides

There is no API to set a webview's URL directly. To load an external URL, the extension must create an HTML page that contains an iframe pointing to the URL. This adds complexity and potential CSP/CORS issues.

**Implications:** A dedicated VS Code extension is needed to properly embed our editor — Simple Browser works but isn't customizable. The extension approach gives control over layout, sizing, and communication.

---

## Gaps / follow-ups

- Whether VS Code's Integrated Browser (newer than Simple Browser) offers better programmatic control
- Port forwarding behavior for remote development scenarios
