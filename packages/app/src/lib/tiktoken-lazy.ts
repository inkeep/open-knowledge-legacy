import type { Tiktoken } from 'js-tiktoken/lite';

let encoding: Tiktoken | null = null;
let loading: Promise<Tiktoken> | null = null;

async function getEncoder(): Promise<Tiktoken> {
  if (encoding) return encoding;
  if (!loading) {
    loading = (async () => {
      const [{ Tiktoken: Ctor }, { default: ranks }] = await Promise.all([
        import('js-tiktoken/lite'),
        import('js-tiktoken/ranks/o200k_base'),
      ]);
      encoding = new Ctor(ranks);
      return encoding;
    })();
  }
  return loading;
}

/** Encode text using o200k_base (GPT-4o / GPT-5). Lazy — loads the rank table on first call. */
export async function tokenEncode(text: string): Promise<number[]> {
  const enc = await getEncoder();
  return enc.encode(text);
}
