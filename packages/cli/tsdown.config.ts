import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  unbundle: false,
  format: 'esm',
  dts: true,
  clean: true,
  minify: true,
  deps: {
    // Native addons stay external — they ship .node binaries resolved at runtime
    // and the desktop bundle places them under app.asar.unpacked/node_modules/.
    neverBundle: ['@parcel/watcher', '@napi-rs/keyring'],
    // tsdown defaults to externalizing entries in `dependencies`, but the
    // desktop install ships no node_modules/ next to dist/cli.mjs, so bare
    // specifiers crash on resolve. Force-inline every pure-JS runtime dep.
    // Keep this in sync with packages/cli/package.json `dependencies`.
    alwaysBundle: [
      /^@inquirer\/password(\/|$)/,
      /^@modelcontextprotocol\/sdk(\/|$)/,
      /^@octokit\/auth-oauth-device(\/|$)/,
      /^@octokit\/request(\/|$)/,
      /^@octokit\/rest(\/|$)/,
      /^cli-boxes(\/|$)/,
      /^commander(\/|$)/,
      /^just-bash(\/|$)/,
      /^picocolors(\/|$)/,
      /^picomatch(\/|$)/,
      /^shell-quote(\/|$)/,
      /^simple-git(\/|$)/,
      /^sirv(\/|$)/,
      /^smol-toml(\/|$)/,
      /^yaml(\/|$)/,
      /^zod(\/|$)/,
    ],
  },
});
