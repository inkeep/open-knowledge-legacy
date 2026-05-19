// FIXTURE — drives `no-raw-html-interactive-element.test.ts` via shell-out
// to `biome check`. Not part of the main lint (lives outside the lint
// command's path list).
//
// Eight positive cases (deliberate violations — plugin must fire) + five
// negative cases (clean usage that must NOT fire). Exact-equality
// (`toBe(8)`) in the test catches both false-negative regressions (drop
// below 8) and false-positive widenings (above 8).

// biome-ignore lint/correctness/noExplicitAny: fixture-only — production types unimportant here
declare const Button: any;
// biome-ignore lint/correctness/noExplicitAny: fixture-only — production types unimportant here
declare const Input: any;
// biome-ignore lint/correctness/noExplicitAny: fixture-only — production types unimportant here
declare const Textarea: any;
// biome-ignore lint/correctness/noExplicitAny: fixture-only — production types unimportant here
declare const Select: any;
// biome-ignore lint/correctness/noExplicitAny: fixture-only — production types unimportant here
declare const ButtonGroup: any;
// biome-ignore lint/correctness/noExplicitAny: fixture-only — production types unimportant here
declare const InputGroup: any;

// === Positive cases — must fire ===

// (1) Self-closing <button />.
export function Positive1() {
  return <button type="button" />;
}

// (2) Paired <button>...</button> with text child.
export function Positive2() {
  return <button type="button">Click me</button>;
}

// (3) Self-closing <input /> (the dominant form for void HTML elements).
export function Positive3() {
  return <input type="text" placeholder="email" />;
}

// (4) Explicit close <input></input> (non-idiomatic but legal JSX).
export function Positive4() {
  return <input type="text"></input>;
}

// (5) <textarea> self-closing.
export function Positive5() {
  return <textarea rows={3} />;
}

// (6) <textarea>...</textarea> with default-value child.
export function Positive6() {
  return <textarea defaultValue="initial">{'initial'}</textarea>;
}

// (7) <select> with <option> children — the option element is NOT in the
//     ban list (no shadcn equivalent at the primitive level), but the
//     enclosing <select> is.
export function Positive7() {
  return (
    <select defaultValue="a">
      <option value="a">A</option>
      <option value="b">B</option>
    </select>
  );
}

// (8) <select> self-closing.
export function Positive8() {
  return <select />;
}

// === Negative cases — must NOT fire ===

// (1) shadcn Button — the canonical replacement.
export function Negative1() {
  return <Button variant="ghost">Click me</Button>;
}

// (2) shadcn Input — the canonical replacement.
export function Negative2() {
  return <Input type="text" placeholder="email" />;
}

// (3) shadcn Textarea — the canonical replacement.
export function Negative3() {
  return <Textarea rows={3} />;
}

// (4) PascalCase composite component whose name starts with `Button` or
//     `Input` — should NOT match the lowercase `button`/`input` pattern.
//     This case proves the rule scopes to lowercase tag names only and
//     does not over-fire on adjacent compound components.
export function Negative4() {
  return (
    <ButtonGroup>
      <InputGroup>
        <Input type="text" />
      </InputGroup>
    </ButtonGroup>
  );
}

// (5) shadcn Select. Confirms the lowercase `<select>` ban does not bleed
//     into the PascalCase shadcn Select.
export function Negative5() {
  return <Select value="a" />;
}
