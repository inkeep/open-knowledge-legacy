# How each host renders a URL returned by a tool

Based on: the prior-art report
`reports/ai-coding-tools-embedded-browsers/REPORT.md`, and the GitHub issues
/ docs cited below.

## Claude Code CLI (in terminal)

- Renders tool result text to stdout.
- Markdown `[label](url)` emits OSC 8 escape sequences where supported by the
  user's terminal emulator (iTerm2, Kitty, WezTerm, Windows Terminal). The
  label becomes a clickable hyperlink. (github.com/anthropics/claude-code
  #27889, #37808 document current rendering of markdown links.)
- Long URLs that wrap lose clickability (#20823).
- Plain file paths are NOT hyperlinked today — feature request #13008.
- **No auto-open behavior.** The user must click the hyperlink; the click
  opens the system default browser (via the terminal's OSC 8 handler).
- No embedded browser panel exists.

## Claude Desktop

- Renders tool results as chat bubbles with rich Markdown.
- URLs are clickable; clicks open the system default browser (usually).
- Embedded browser preview panel exists but is bound to dev-server configs in
  `.claude/launch.json` — it auto-previews localhost URLs declared there, not
  arbitrary URLs returned from MCP tools.
- MCP Apps iframes render inline in the chat stream for tools that declare
  them.
- The "Claude in Chrome" extension is a separate mechanism — the user's
  Chrome is controlled via MCP, and can be asked to navigate.

## Cursor

- Renders tool result markdown inline in chat. URL clicks open in the system
  default browser.
- The built-in browser panel (GA v2.0) is the richest surface — it can load
  any URL including localhost. But opening it requires *user* action (command
  palette → "Open in browser" / paste URL), not an MCP server action.
- MCP Apps (v2.6+) renders inline iframes.
- There is no documented MCP-to-built-in-browser auto-route command.

## OpenAI Codex desktop

- No browser panel. URLs in tool output are clickable (opens system browser).
  No embedded path.

## Convergent conclusion

**No MCP host today has a protocol-level "open this URL in your embedded
panel automatically" channel triggered from a server tool response.** The
three routes that work:

1. Text-with-URL → user clicks → system browser. Universal but manual.
2. MCP App iframe → renders inline when the declaring tool is called. Not
   ambient, not persistent, not available on Claude Code CLI.
3. Dedicated browser-control MCP server (Chrome DevTools MCP, Claude in
   Chrome, browser-tools-mcp) — our MCP server could chain-call it, but the
   user has to have it installed and configured, and it opens a *separate*
   Chrome window, not an embedded panel.
