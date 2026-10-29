import { fakeSupabase } from "@/lib/tours/assistant/__fixtures__/fake-supabase";
import { basicReply } from "@/lib/tours/assistant/basic";
import { faqById, matchFaq } from "@/lib/tours/assistant/knowledge";
import { assistantSystemPrompt } from "@/lib/tours/assistant/prompt";
import { travelTime, type ToolContext } from "@/lib/tours/assistant/tools";
import { findBoatLeg, findTransportPlace, readTravelQuestion } from "@/lib/tours/assistant/transport";

const ctx = (route?: ToolContext["route"]): ToolContext => ({
  supabase: fakeSupabase({
    tours_attractions: [
      { id: "a1", name: "Bagasbas Beach", slug: "bagasbas-beach", category: "beach", municipality: "Daet", latitude: 14.131583, longitude: 122.985083, is_active: true },
      { id: "a2", name: "Daet Heritage Center", slug: "daet-heritage-center", category: "museum", municipality: "Daet", latitude: 14.113187, longitude: 122.954828, is_active: true },
    ],
  }),
  userId: null,
  today: "2026-10-29",
  cards: [],
  route,
});

describe("transport knowledge (R5)", () => {
  it("answers getting here, getting around and boats in English and Taglish", () => {
    expect(matchFaq("How do I get to Daet from Manila by bus?")?.id).toBe("getting_here");
    expect(matchFaq("Paano pumunta sa Daet?")?.id).toBe("getting_here");
    expect(matchFaq("Is there a tricycle to the beach?")?.id).toBe("getting_around");
    expect(matchFaq("Anong oras ang bangka papuntang Calaguas?")?.id).toBe("boats");
    for (const id of ["getting_here", "getting_around", "boats"]) expect(faqById(id)?.answer).toMatch(/confirm/i);
  });

  it("reads travel-time questions", () => {
    expect(readTravelQuestion("How long from Daet to Bagasbas?")).toEqual({ from: "daet", to: "bagasbas" });
    expect(readTravelQuestion("Ilang oras mula sa Paracale papunta sa Calaguas?")).toEqual({ from: "paracale", to: "calaguas" });
    expect(readTravelQuestion("How long to Calaguas")).toEqual({ from: null, to: "calaguas" });
    expect(readTravelQuestion("What are the open dates for Calaguas?")).toBeNull();
  });

  it("finds towns, ports and boat legs", () => {
    expect(findTransportPlace("Naga airport")?.name).toBe("Naga airport (Pili)");
    expect(findTransportPlace("somewhere else")).toBeNull();
    expect(findBoatLeg("paracale", "calaguas")?.minutes).toEqual([120, 150]);
    expect(findBoatLeg("calaguas", "vinzons")?.from).toBe("Vinzons");
  });
});

describe("travel_time tool (R5)", () => {
  it("estimates road legs without the Routes API and adds a directions button", async () => {
    const c = ctx();
    const result = await travelTime(c, { from: "Daet", to: "Bagasbas Beach" });
    expect(result).toMatchObject({ from: "Daet town center", to: "Bagasbas Beach", estimated: true, kind: "drive" });
    expect(c.cards[0]).toMatchObject({ type: "link", external: true });
    expect((c.cards[0] as { href: string }).href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  it("uses the road route when the server provides one", async () => {
    const result = await travelTime(ctx(async () => ({ distanceM: 5200, durationS: 780, polyline: null, estimated: false })), { from: "Daet Heritage Center", to: "Bagasbas" });
    expect(result).toMatchObject({ duration: "13 min", distance: expect.stringMatching(/5\.2 km/), estimated: false });
  });

  it("falls back to an estimate when the route call fails", async () => {
    const result = await travelTime(ctx(async () => { throw new Error("down"); }), { from: "Daet", to: "Bagasbas" });
    expect(result).toMatchObject({ estimated: true });
  });

  it("answers islands from the boat table, never the road", async () => {
    expect(await travelTime(ctx(), { from: "Paracale", to: "Calaguas" })).toMatchObject({ kind: "boat", duration: "about 2 h–2 h 30 min" });
    const options = await travelTime(ctx(), { from: null, to: "Calaguas" });
    expect(options).toMatchObject({ kind: "boat", to: "Calaguas" });
    expect("options" in options && options.options?.length).toBe(2);
  });

  it("says when it doesn't know a place", async () => {
    expect(await travelTime(ctx(), { from: "Daet", to: "Atlantis" })).toMatchObject({ error: expect.stringMatching(/don't know where atlantis/i) });
  });

  it("works in basic mode", async () => {
    expect(await basicReply("How long from Daet to Bagasbas?", ctx())).toMatch(/Daet town center to Bagasbas: about \d+ min \(\d.* km\) by road/);
    expect(await basicReply("Ilang oras papuntang Calaguas?", ctx())).toMatch(/from Paracale port, about 2 h/);
  });

  it("is in the system prompt", () => {
    expect(assistantSystemPrompt({ today: "2026-10-29", signedIn: false })).toMatch(/travel_time/);
  });
});
