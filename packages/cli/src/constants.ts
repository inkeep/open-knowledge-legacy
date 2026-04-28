import pkgJson from '../package.json' with { type: 'json' };

/** Root directory name for open-knowledge inside a project. */
export { OK_DIR } from '@inkeep/open-knowledge-core';

/** Workspace-level config file inside the open-knowledge directory. */
export const CONFIG_FILENAME = 'config.yml';
export const PUBLISH_CONFIG_FILENAME = 'publish.yml';

/** Gitignored directory for derived/cached data. */
export const CACHE_DIR = 'cache';

export const PACKAGE_VERSION = pkgJson.version;

export const MCP_SERVER_NAME = 'open-knowledge';
