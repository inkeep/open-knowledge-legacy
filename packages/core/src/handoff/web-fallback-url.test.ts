import { expect, test } from 'bun:test';
import { buildClaudeAiWebUrl } from './web-fallback-url.ts';

test('buildClaudeAiWebUrl emits https://claude.ai/new?q=<encoded>', () => {
  expect(buildClaudeAiWebUrl('hello')).toBe('https://claude.ai/new?q=hello');
});

test('buildClaudeAiWebUrl single-encodes edge-case chars: %, em-dash, space, unicode', () => {
  // % → %25, space → %20, em-dash (U+2014, UTF-8 E2 80 94) → %E2%80%94,
  // é (U+00E9, UTF-8 C3 A9) → %C3%A9
  expect(buildClaudeAiWebUrl('My %Project — notes café')).toBe(
    'https://claude.ai/new?q=My%20%25Project%20%E2%80%94%20notes%20caf%C3%A9',
  );
});
