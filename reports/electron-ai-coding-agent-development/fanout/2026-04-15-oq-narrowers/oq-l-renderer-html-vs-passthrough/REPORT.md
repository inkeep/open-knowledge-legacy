# OQ-L Narrower: Renderer HTML vs pure pass-through

## Key finding
L1 (pure pass-through) was observed in ZERO production apps. Every sampled Electron app ships at least one host-owned HTML file. Two archetypes: Shell-as-host (Claude Desktop, Slack, Notion — thin HTML with desktop chrome, embeds remote/local app) and Shell-as-bootstrap (VS Code, Cursor, Linear, Obsidian — one HTML loads local renderer JS). Recommendation: L2 (thin shell HTML) is the right default — ~1KB overhead that enables CSP, drag region, error boundary, auto-update toast slot.

Full evidence from subagent — primary-source asar extraction of 8 apps.
