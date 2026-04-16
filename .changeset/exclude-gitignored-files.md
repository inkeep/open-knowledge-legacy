---
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---
feat: exclude git-ignored files from document system

The file watcher now maintains a filtered in-memory file index, replacing the slow `readdirSync` in the documents API. Filtering uses a unified `ContentFilter` that combines `.gitignore` rules with `config.content.exclude` patterns. The `content.include` and `content.exclude` config fields are now wired end-to-end. Response time for `GET /api/documents` dropped from \~35s to \~2-5ms.

feat: exclude git-ignored files from document system

The file watcher now maintains a filtered in-memory file index, replacing the slow `readdirSync` in the documents API. Filtering uses a unified `ContentFilter` that combines `.gitignore` rules with `config.content.exclude` patterns. The `content.include` and `content.exclude` config fields are now wired end-to-end. Response time for `GET /api/documents` dropped from \~35s to \~2-5ms.
