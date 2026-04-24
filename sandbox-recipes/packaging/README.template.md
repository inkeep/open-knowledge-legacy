# claude-sandbox

Tiered local sandboxing for [Claude Code](https://code.claude.com/) on macOS. From kernel-level Seatbelt (zero overhead) to nested-VM matryoshka (strongest isolation). Five commands on PATH, one registry file, no runtime daemon to keep alive.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/inkeep/claude-sandbox/main/install.sh | bash
# or non-interactive:
curl -fsSL https://raw.githubusercontent.com/inkeep/claude-sandbox/main/install.sh | bash -s -- -y
```

What happens: clones to `~/.claude-sandbox`, builds Tier 1 container images if [Apple Container](https://github.com/apple/container) is installed, installs `ccs`/`ccu`/`ccb`/`ccbu`/`ccm`/`ccmu` to `~/.local/bin/`, writes alias block to `~/.zshrc`, creates `~/.cc-projects.sh`.

Re-running the installer = `git pull` + rebuild. Safe and idempotent.

## Quick start

```bash
ccs --about              # tier comparison chart
ccs --help               # short usage
ccs                      # Tier 0 sandboxed claude in current dir
ccs -p myrepo            # cd to registered project + sandboxed claude
ccb -p myrepo            # Tier 1 microVM (Apple Container)
ccmu -p myrepo           # Matryoshka (strongest) + unattended
```

**Add your repos** to `~/.cc-projects.sh`:

```bash
_CC_PROJECTS[myrepo]="$HOME/code/myrepo"
_CC_PROJECTS[api]="$HOME/src/api-service"
```

Save → `ccs -p myrepo` works immediately.

## Tiers

| Command | Tier | Tech |
|---|---|---|
| `ccs` / `ccu` | 0 | Anthropic `/sandbox` (Seatbelt on macOS) |
| `ccb` / `ccbu` | 1 | Apple Container microVM |
| `ccm` / `ccmu` | 1 matryoshka | microVM + bubblewrap + Anthropic proxy (strongest) |

`u` suffix = unattended (adds `--dangerously-skip-permissions`, safe because the sandbox is kernel-enforced and the escape hatch is disabled in the installed settings).

Full reference: [`ALIASES.md`](ALIASES.md). Background / research on the tier choices: [original report](https://github.com/inkeep/open-knowledge/blob/main/reports/claude-code-local-sandbox-options/REPORT.md) (Inkeep open-knowledge).

## Requirements

| Tier | Needs |
|---|---|
| 0 | macOS 13+ + Claude Code v2.0+ |
| 1 Apple Container | macOS 26 Tahoe + Apple Silicon + [`container` CLI](https://github.com/apple/container/releases) |
| 1 Matryoshka | Same as Tier 1 Apple Container |
| 1 Lima | `brew install lima` (macOS 13+, CNCF-backed alternative) |

## Limitations worth knowing

- Network allowlist in all tiers is domain-level, not URL-path — see [`URL-PATH-RESTRICTIONS.md`](URL-PATH-RESTRICTIONS.md). The short of it: use fine-grained GitHub PATs for org-scoping, or add mitmproxy inside the container if you need arbitrary path rules.
- Claude's own `-p` (print mode) is shadowed by our `-p` (project). Use `--print` from these aliases.
- Tier 0's default read posture is broad. Untrusted-code review should pair Tier 0 with Tier 1 (microVM).
- `~/.claude/` is mounted into Tier 1 containers by default — a compromised agent could exfiltrate credentials over any allowed domain. For high-assurance work, use a separate Claude account inside.

## Contributing

- Linux / Windows support is out of scope today — Tier 1 is Apple-Container-specific. Podman + bubblewrap variants welcome.
- All the launchers are shell scripts. Test pattern: bash `-n` for syntax, zsh `-n` for the launcher, end-to-end against a scratch `$HOME` with stubbed `claude` / `container`.
- File a GitHub issue before large refactors — the alias naming is user-facing and changes require migration logic.

## License

MIT. See [`LICENSE`](LICENSE).
