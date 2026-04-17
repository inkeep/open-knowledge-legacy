---
"@inkeep/open-knowledge": minor
---

Add semantic color bloom to the graph visualization. The `/api/link-graph` endpoint now returns frontmatter metadata (`cluster`, `category`, `tags`) on doc nodes. Graph nodes are colored by cluster using a deterministic 16-color palette, with rich HTML tooltips showing metadata on hover and a cluster legend in fullscreen Explore mode.
