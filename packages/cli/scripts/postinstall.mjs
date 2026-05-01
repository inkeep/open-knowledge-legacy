#!/usr/bin/env node

async function run() {
  let installUserSkill;
  try {
    const mod = await import('../dist/index.mjs');
    installUserSkill = mod.installUserSkill;
  } catch {
    return;
  }

  if (typeof installUserSkill !== 'function') return;

  let result;
  try {
    result = await installUserSkill();
  } catch {
    return;
  }

  if (result === 'installed') {
    process.stdout.write('[open-knowledge] Agent Skill installed to detected agent hosts.\n');
  } else if (result === 'failed') {
    process.stderr.write(
      '[open-knowledge] Agent Skill auto-install failed; run manually: ' +
        "npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy\n",
    );
  }
}

run().finally(() => {
  process.exit(0);
});
