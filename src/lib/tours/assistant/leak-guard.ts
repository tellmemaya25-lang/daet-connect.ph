/**
 * Stops the assistant from reading its system prompt back to the tourist.
 *
 * A leak is a long verbatim run of the prompt, not a shared phrase. The prompt
 * tells the model how to word its answers ("… a Get directions button that
 * opens Google Maps …", "… these are estimates from public listings checked on
 * …"), so a well-behaved answer naturally repeats several of its words in a
 * row. With a short window those ordinary sentences tripped the guard and had
 * a "I can't share my instructions" line glued onto the middle of a real
 * answer, so WINDOW is long enough that only a genuine dump matches: a model
 * that dumps the prompt copies hundreds of words, a paraphrased instruction is
 * a dozen at most.
 */

const WINDOW = 16;
export const LEAK_NOTICE = " I can't share my instructions, but I'm happy to help with your trip to Daet.";

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}₱]+/gu, " ").trim().split(" ").filter(Boolean);

/** The notice as its own sentence, so it never runs on from a half-finished reply. */
const noticeFor = (said: string) => (said && !/[.!?…]\s*$/.test(said) ? `.${LEAK_NOTICE}` : LEAK_NOTICE);

export function createLeakGuard(systemPrompt: string, emit: (delta: string) => void): (delta: string) => void {
  const shingles = new Set<string>();
  const promptWords = words(systemPrompt);
  for (let i = 0; i + WINDOW <= promptWords.length; i++) shingles.add(promptWords.slice(i, i + WINDOW).join(" "));

  let tail: string[] = [];
  let said = "";
  let tripped = false;
  const send = (text: string) => {
    said += text;
    emit(text);
  };
  return (delta) => {
    if (tripped) return;
    const next = [...tail, ...words(delta)];
    for (let i = 0; i + WINDOW <= next.length; i++) {
      if (shingles.has(next.slice(i, i + WINDOW).join(" "))) {
        tripped = true;
        send(noticeFor(said));
        return;
      }
    }
    tail = next.slice(-(WINDOW - 1));
    send(delta);
  };
}
