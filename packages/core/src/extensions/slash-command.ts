export interface SlashCommandMatch {
  query: string;
  from: number;
  to: number;
}

export function getSlashCommandMatch(
  textBeforeCursor: string,
  cursorPosition: number,
): SlashCommandMatch | null {
  const match = textBeforeCursor.match(/\/([a-z0-9-]*)$/i);
  if (!match) {
    return null;
  }

  const query = match[1] ?? '';
  return {
    query,
    from: cursorPosition - query.length - 1,
    to: cursorPosition,
  };
}
