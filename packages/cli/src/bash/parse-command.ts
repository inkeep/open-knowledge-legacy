/**
 * `parseCommand` — the sole primary security boundary for `exec`.
 *
 * Uses `shell-quote` to tokenize the user-supplied command string, then
 * walks the resulting AST and rejects anything not structurally allowed.
 * A post-exec mtime-scan backstop (FR21) is the defense-in-depth layer
 * for any bug that slips past this parser.
 *
 * Three layers of validation:
 *   1. AST-level op denylist — only `|` is allowed; every other operator
 *      (redirection, sequencing, backgrounding, subshell) rejects with a
 *      categorized error.
 *   2. First-token allowlist per pipeline stage — Conservative-plus set
 *      from D15: cat, ls, grep, find, head, tail, wc, sort, uniq, cut.
 *      awk/sed/xargs explicitly excluded (program-arg write vectors).
 *   3. Argument-level flag denylist — universal `-o` / `--output-file` /
 *      `--output`, plus find-specific `-exec`/`-execdir`/`-delete`/etc.
 *   4. String-token scan — arguments containing backticks, `$(`, or `${`
 *      are treated as shell-construct-blocked (injection vectors that
 *      shell-quote may not split but that just-bash could interpret).
 *
 * Error messages are category-specific per D21 so agents receive an
 * actionable next-step, not a wall of allowlist text.
 *
 * Spec: SPEC.md FR2 + FR3 + FR8 + D15 + D21.
 */
import shellQuote from 'shell-quote';

export type ErrorCategory =
  | 'unknown_command'
  | 'write_blocked'
  | 'shell_construct_blocked'
  | 'path_traversal'
  | 'output_overflow'
  | 'security_invariant_violation';

export interface ParseCommandError {
  category: ErrorCategory;
  message: string;
}

export interface Stage {
  /** First token — the allowlisted command. */
  command: string;
  /** All tokens including the command itself. */
  args: string[];
}

export type ParseResult = { stages: Stage[] } | { error: ParseCommandError };

// Conservative-plus allowlist (D15).
const ALLOWLIST: ReadonlySet<string> = new Set([
  'cat',
  'ls',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'cut',
]);

const ALLOWLIST_HINT = 'cat, ls, grep, find, head, tail, wc, sort, uniq, cut';

// Redirections (write to file/fd) — write_blocked.
const WRITE_OPS: ReadonlySet<string> = new Set(['>', '>>', '<', '>&', '<&', '|&']);

// Shell constructs (sequencing, subshell, background, heredoc) — shell_construct_blocked.
const SHELL_CONSTRUCT_OPS: ReadonlySet<string> = new Set([
  '&',
  ';',
  ';;',
  '&&',
  '||',
  '(',
  ')',
  '<(',
  '>(',
  '<<',
  '<<-',
]);

// Flags that write to file on any command.
const UNIVERSAL_FLAG_DENY: ReadonlySet<string> = new Set(['-o', '--output-file', '--output']);
const UNIVERSAL_FLAG_PREFIX_DENY = ['-o=', '--output-file=', '--output='];

// find-specific flags that execute arbitrary commands or delete files.
const FIND_FLAG_DENY: ReadonlySet<string> = new Set([
  '-exec',
  '-execdir',
  '-delete',
  '-fprint',
  '-fprintf',
  '-fprint0',
  '-ok',
  '-okdir',
]);

// Injection vectors that may survive shell-quote.parse: backticks, command
// substitution `$(...)`, variable expansion `${...}`, and ANSI-C quoting
// `$'...'` (which bash evaluates escape sequences in, distinct from plain
// single-quoted strings).
const SUSPICIOUS_STRING_RE = /[`]|\$\(|\$\{|\$'/;

type ShellOpToken = {
  op?: string;
  pattern?: string;
  comment?: string;
};
type ShellToken = string | ShellOpToken;

function isOpToken(token: unknown): token is ShellOpToken {
  return typeof token === 'object' && token !== null && 'op' in token;
}

function opTokenError(token: ShellOpToken): ParseCommandError {
  const op = typeof token.op === 'string' ? token.op : '(unknown)';
  if (WRITE_OPS.has(op)) {
    return {
      category: 'write_blocked',
      message: `Write operation blocked: '${op}'. exec is read-only. For document changes, use write_document or edit_document.`,
    };
  }
  if (SHELL_CONSTRUCT_OPS.has(op)) {
    return {
      category: 'shell_construct_blocked',
      message: `Shell construct '${op}' is not supported. Only pipes (|) are allowed between allowlisted stages.`,
    };
  }
  return {
    category: 'shell_construct_blocked',
    message: `Operator '${op}' is not supported.`,
  };
}

function buildStageArgs(tokens: ShellToken[]): { args: string[] } | { error: ParseCommandError } {
  const args: string[] = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      if (SUSPICIOUS_STRING_RE.test(token)) {
        return {
          error: {
            category: 'shell_construct_blocked',
            message: `Argument '${token}' contains a shell-injection pattern (backtick, $(), or \${}); not supported.`,
          },
        };
      }
      args.push(token);
      continue;
    }
    if (!isOpToken(token)) {
      return {
        error: { category: 'shell_construct_blocked', message: 'Unrecognized token shape.' },
      };
    }
    // Glob tokens {op:'glob', pattern:'*.md'} pass through as args — just-bash
    // expands them inside the sandbox.
    if (token.op === 'glob' && typeof token.pattern === 'string') {
      args.push(token.pattern);
      continue;
    }
    // Comments shouldn't appear in an `exec` command; reject.
    if (typeof token.comment === 'string') {
      return {
        error: {
          category: 'shell_construct_blocked',
          message: 'Comments are not allowed in exec commands.',
        },
      };
    }
    return { error: opTokenError(token) };
  }
  return { args };
}

function checkStage(stage: Stage): ParseCommandError | null {
  if (!ALLOWLIST.has(stage.command)) {
    return {
      category: 'unknown_command',
      message: `Command '${stage.command}' is not in the allowlist. For pattern matching try 'grep'; for file listing try 'ls' or 'find'. Allowlist: ${ALLOWLIST_HINT}.`,
    };
  }
  for (const arg of stage.args.slice(1)) {
    if (UNIVERSAL_FLAG_DENY.has(arg) || UNIVERSAL_FLAG_PREFIX_DENY.some((p) => arg.startsWith(p))) {
      return {
        category: 'write_blocked',
        message: `Write operation blocked: '${arg}'. exec is read-only. For document changes, use write_document or edit_document.`,
      };
    }
    if (stage.command === 'find' && FIND_FLAG_DENY.has(arg)) {
      return {
        category: 'write_blocked',
        message: `find flag '${arg}' is blocked (executes commands or deletes files). Use exec for read-only discovery; chain with another allowlisted tool via '|' if you need to transform output.`,
      };
    }
  }
  return null;
}

/**
 * Validate a command string and return a parsed pipeline structure, or a
 * categorized error. Does NOT execute anything.
 */
export function parseCommand(commandStr: string): ParseResult {
  const trimmed = commandStr.trim();
  if (!trimmed) {
    return {
      error: { category: 'unknown_command', message: 'Empty command.' },
    };
  }

  let ast: ShellToken[];
  try {
    ast = shellQuote.parse(trimmed) as ShellToken[];
  } catch {
    return {
      error: {
        category: 'shell_construct_blocked',
        message: 'Failed to parse command — likely malformed quoting or an unsupported construct.',
      },
    };
  }

  // Split into pipeline stages at `{ op: '|' }`.
  const stagesTokens: ShellToken[][] = [];
  let current: ShellToken[] = [];
  for (const token of ast) {
    if (isOpToken(token) && token.op === '|') {
      stagesTokens.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  stagesTokens.push(current);

  const stages: Stage[] = [];
  for (const tokens of stagesTokens) {
    const result = buildStageArgs(tokens);
    if ('error' in result) return result;
    if (result.args.length === 0) {
      return {
        error: {
          category: 'shell_construct_blocked',
          message: 'Empty pipeline stage (trailing pipe or leading pipe).',
        },
      };
    }
    const stage: Stage = { command: result.args[0], args: result.args };
    const stageError = checkStage(stage);
    if (stageError) return { error: stageError };
    stages.push(stage);
  }

  return { stages };
}
