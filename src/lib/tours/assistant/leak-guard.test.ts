import { createLeakGuard, LEAK_NOTICE } from "@/lib/tours/assistant/leak-guard";
import { assistantSystemPrompt } from "@/lib/tours/assistant/prompt";

const prompt = assistantSystemPrompt({ today: "2026-11-05", signedIn: false });

function run(chunks: string[]) {
  let out = "";
  const guard = createLeakGuard(prompt, (d) => (out += d));
  for (const c of chunks) guard(c);
  return out;
}

describe("leak guard", () => {
  it("passes a normal reply through untouched", () => {
    const reply = "Bagasbas Beach is a popular surf spot. Tap View tour to see open dates.";
    expect(run([reply])).toBe(reply);
  });

  it("passes an answer that repeats the prompt's own wording back at the tourist", () => {
    // These all tripped the guard when its window was 8 words, and each is a
    // normal answer to a real question: the live site glued the notice onto
    // replies like the first one (tours_ai_messages, 2026-11-09).
    const replies = [
      "A tricycle ride from Daet town center to Bagasbas takes about 10 min to 15 min and costs ₱30.00 per person. Each place comes with a Get directions button that opens Google Maps.",
      "These are estimates from public listings checked on 2026-11-01, not quotes, and to confirm with the bus line.",
      "For food stops and where to eat or stay, use the listing below.",
      "This is an estimate and that boat trips depend on the weather.",
      "If a tool doesn't have it, say so.",
      "Most people go through Manila or Naga, then bus or van to Daet.",
    ];
    for (const reply of [...replies, replies[0].split(" ").map((w) => `${w} `).join("")]) {
      expect(run([reply])).toBe(reply);
    }
  });

  it("cuts off a verbatim prompt dump", () => {
    const out = run([prompt.slice(0, 400), prompt.slice(400, 800)]);
    expect(out).toContain(LEAK_NOTICE);
    expect(out.length).toBeLessThan(prompt.slice(0, 800).length + LEAK_NOTICE.length);
  });

  it("catches a leak split across stream chunks", () => {
    const words = prompt.split(" ").slice(20, 60);
    const out = run(words.map((w) => `${w} `));
    expect(out).toContain(LEAK_NOTICE);
  });

  it("emits nothing after a leak", () => {
    const out = run([prompt.slice(0, 300), "more text after", " and more"]);
    expect(out.endsWith(LEAK_NOTICE)).toBe(true);
  });

  it("starts the notice as its own sentence after a half-finished one", () => {
    // A reply cut off mid-sentence, then a dump: the saved live answers ran the
    // notice straight on from the last words ("… open the route I can't share
    // my instructions …").
    const out = run(["Open the route", " in Google Maps", ` ${prompt}`]);
    expect(out).toContain(`.${LEAK_NOTICE}`);
    expect(out).not.toContain("Maps I can't share my instructions");
  });
});
