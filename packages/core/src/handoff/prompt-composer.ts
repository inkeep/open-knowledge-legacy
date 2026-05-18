const PATH_INJECTION_SANITIZE_RE = new RegExp(
  '[' +
    '\\u0000-\\u001f' + // ASCII C0 controls
    '\\u007f-\\u009f' + // DEL + ASCII C1 controls
    '\\u200b-\\u200f' + // zero-width + bidi marks
    '\\u2028-\\u202e' + // LINE SEP + PARAGRAPH SEP + bidi overrides (ES line terminators)
    '\\u2060-\\u2069' + // word-joiner + bidi isolates
    '\\ufeff' + // BOM / zero-width no-break space
    '`' + // backtick (terminates the wrapping fence at the call site)
    ']+',
  'g',
);

function sanitizePathForPrompt(path: string): string {
  return path.replace(PATH_INJECTION_SANITIZE_RE, '_');
}

export function composeFilePrompt(relativePath: string): string {
  const safe = sanitizePathForPrompt(relativePath);
  return `Can you open \`${safe}\` in web view with open knowledge editor.`;
}

export function composeFolderPrompt(relativeFolderPath: string): string {
  const safe = sanitizePathForPrompt(relativeFolderPath);
  return `Let's work on \`${safe}\` folder using Open Knowledge. Open the OK editor in web view.`;
}

export function composeEmptySpacePrompt(): string {
  return `Let's work on this project using Open Knowledge. Open the OK editor in web view.`;
}
