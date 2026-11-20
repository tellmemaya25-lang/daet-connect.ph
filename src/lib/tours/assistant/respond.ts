import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { basicReply } from "@/lib/tours/assistant/basic";
import { countOf, daysAsked, groupSize, isPlanRequest, peopleAsked, missingInputs, tripDays, TripContextSchema, type MissingInput, type TripContext } from "@/lib/tours/assistant/context";
import { describeItinerary, planTrip, wantsFromText, type ItineraryResult } from "@/lib/tours/assistant/plan-tool";
import type { AssistantCard, ToolContext } from "@/lib/tours/assistant/tools";
import { CHANGE_EXAMPLES } from "@/lib/tours/itinerary/assistant";

/**
 * One assistant turn as a stream of events (newline-delimited JSON on the
 * wire). Dependencies are injected so it can be tested without Next or a
 * real model: `runAi` streams text and throws when the model can't be used.
 */

export const ASSISTANT_MESSAGE_MAX = 1000;
export const ASSISTANT_HISTORY_MAX = 12;

/**
 * How long one turn waits for the model before answering in basic mode. The
 * route's own limit is 60 s (maxDuration in src/app/api/assistant/route.ts);
 * Gemini's per-call timeout is 30 s and a busy model is retried, so without
 * this a slow turn outlived the function and the traveller got nothing at all.
 */
export const AI_DEADLINE_MS = 25_000;

export const AssistantRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(40),
  /** Only when the traveller tapped "Use my location" for this message; used for "near me", never stored. */
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
  /** The page it was opened on and the trip answers so far (dates, travellers, origin). */
  context: TripContextSchema.nullable().optional(),
  /** A photo with this message (decision 39): signed-in visitors, AI answers only, never stored. About 1 MB at most. */
  image: z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().max(1_500_000).regex(/^[A-Za-z0-9+/=]+$/) }).nullable().optional(),
});

/** About 100 m: enough for "nearest eatery", without an exact position. */
export const roundLocation = (p: { lat: number; lng: number }) => ({ lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 });

export type AssistantEvent =
  | { t: "mode"; mode: "ai" | "basic" }
  | { t: "text"; v: string }
  | { t: "cards"; cards: AssistantCard[] }
  /** The planner needs these answers before it drafts; the client shows the "Before I draft" card. */
  | { t: "questions"; missing: MissingInput[]; prefill: TripContext | null }
  /** Progress while a tool runs, e.g. "Checking operators". */
  | { t: "status"; label: string }
  /** A drafted plan, built from the plan_trip result (never from model text). */
  | { t: "itinerary"; itinerary: ItineraryResult }
  /** Follow-ups the traveller can tap; each sends its text as a message. */
  | { t: "choices"; options: string[] }
  /** A visitor who is not signed in has used the day's full answers: show the sign-in card. */
  | { t: "signin" }
  | { t: "done" }
  | { t: "error"; message: string };

/** Adds the sign-in card's event just before the turn ends. */
export async function* withSignInCard(events: AsyncGenerator<AssistantEvent>, ask: boolean): AsyncGenerator<AssistantEvent> {
  for await (const event of events) {
    if (ask && event.t === "done") yield { t: "signin" };
    yield event;
  }
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type RespondDeps = {
  supabase: SupabaseClient;
  userId: string | null;
  today: string;
  /** Whether the caller's authoritative role is tourist. */
  canBook?: boolean;
  /** Whether the AI may be used for this call (key configured and within the limit). */
  aiAllowed: boolean;
  /** Road legs for travel_time (the cached Routes API); estimates when missing. */
  route?: ToolContext["route"];
  /** Ask for dates, travellers and origin before a plan request (TRIP_PLANNER_V2 is not "off"). */
  tripQuestions?: boolean;
  runAi: (ctx: ToolContext, history: ChatTurn[], onText: (delta: string) => void) => Promise<{ stopReason: string | null }>;
};

/** Validates and trims the conversation; null when it isn't usable. */
export function cleanHistory(raw: unknown): { history: ChatTurn[]; here: { lat: number; lng: number } | null; trip: TripContext | null; image: { mimeType: string; data: string } | null } | { error: string } {
  const parsed = AssistantRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: "Send a message to the assistant." };
  const turns = parsed.data.messages.map((m) => ({ role: m.role, content: m.content.replace(/\s+$/g, "").trim() })).filter((m) => m.content);
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return { error: "Send a message to the assistant." };
  if (last.content.length > ASSISTANT_MESSAGE_MAX) return { error: `Keep messages under ${ASSISTANT_MESSAGE_MAX} characters.` };
  let history = turns.slice(-ASSISTANT_HISTORY_MAX).map((m) => ({ ...m, content: m.content.slice(0, m.role === "user" ? ASSISTANT_MESSAGE_MAX : 2000) }));
  // The API needs the conversation to start with the tourist.
  while (history.length && history[0].role !== "user") history = history.slice(1);
  return { history, here: parsed.data.location ? roundLocation(parsed.data.location) : null, trip: parsed.data.context ?? null, image: parsed.data.image ?? null };
}

/** Events that close a turn: the form, the plan and its follow-ups, the cards. */
function* closing(ctx: ToolContext, trip: ToolContext["trip"]): Generator<AssistantEvent> {
  if (ctx.questions?.length) yield { t: "questions", missing: ctx.questions, prefill: trip ?? null };
  if (ctx.itinerary) {
    yield { t: "itinerary", itinerary: ctx.itinerary };
    if (ctx.itinerary.plan.totals.visits) yield { t: "choices", options: [CHANGE_EXAMPLES[0], CHANGE_EXAMPLES[1], CHANGE_EXAMPLES[3]] };
  }
  yield { t: "cards", cards: ctx.cards };
  yield { t: "done" };
}

/**
 * Basic mode's answer for this turn: the rule-based answer, or a plan. It never
 * yields an empty reply, so the chat never ends a turn with nothing in it.
 */
async function* basicAnswer(ctx: ToolContext, latest: string, planning: boolean): AsyncGenerator<AssistantEvent> {
  if (planning) {
    try {
      const result = await planTrip(ctx, wantsFromText(latest, ctx));
      yield { t: "text", v: ctx.itinerary ? describeItinerary(ctx.itinerary) : "error" in result ? String(result.error) : "Please fill in the short form first." };
    } catch (error) {
      console.error("Assistant basic plan error:", error);
      yield { t: "text", v: "Sorry, the plan could not be drafted. Please try again in a moment." };
    }
    return;
  }
  try {
    yield { t: "text", v: await basicReply(latest, ctx) };
  } catch (error) {
    console.error("Assistant basic mode error:", error);
    yield { t: "text", v: "Sorry, something went wrong. Please try again in a moment." };
  }
}

/** The whole of a basic-mode turn: its notice, its answer, then the plan, cards and done. */
async function* basicTurn(ctx: ToolContext, trip: ToolContext["trip"], latest: string, planning: boolean, formNotice: string): AsyncGenerator<AssistantEvent> {
  yield { t: "mode", mode: "basic" };
  if (formNotice) yield { t: "text", v: formNotice };
  yield* basicAnswer(ctx, latest, planning);
  yield* closing(ctx, trip);
}

export async function* respond(raw: unknown, deps: RespondDeps): AsyncGenerator<AssistantEvent> {
  const cleaned = cleanHistory(raw);
  if ("error" in cleaned) {
    yield { t: "error", message: cleaned.error };
    return;
  }
  const { history, here, trip, image } = cleaned;
  const ctx: ToolContext = { supabase: deps.supabase, userId: deps.userId, today: deps.today, cards: [], canBook: deps.canBook === true, route: deps.route, here, trip, image };

  // Photos need a signed-in visitor and a full AI answer; basic mode can't look at one.
  if (image && (!deps.userId || !deps.aiAllowed)) {
    yield { t: "mode", mode: deps.aiAllowed ? "ai" : "basic" };
    yield { t: "text", v: deps.userId ? "I can't look at photos right now. Describe what you see, or ask again later." : "Sign in to send a photo. You can still describe what you see and I'll help." };
    yield { t: "done" };
    return;
  }

  // A plan needs dates, who is coming and where from. Ask once, before any model call.
  const latest = history[history.length - 1].content;
  let formNotice = "";
  const planning = Boolean(deps.tripQuestions && trip && isPlanRequest(latest));
  if (planning) {
    const missing = missingInputs(trip, deps.today);
    if (missing.length) {
      yield { t: "mode", mode: deps.aiAllowed ? "ai" : "basic" };
      yield { t: "questions", missing, prefill: trip };
      yield { t: "text", v: "Before I draft your plan, I need three things: your dates, who is coming, and where you are travelling from." };
      yield { t: "done" };
      return;
    }
    // The form's values are validated; the words only add preferences. If the
    // words ask for a different length, say which one is being used.
    const asked = daysAsked(latest);
    const saved = trip!.dates ? tripDays(trip!.dates) : 0;
    const group = groupSize(trip!.travelers);
    const people = peopleAsked(latest);
    if ((asked && asked !== saved) || (people && people !== group)) {
      formNotice = `Using your form details (${countOf(saved, "day")}, ${countOf(group, "traveler")})\n\n`;
    }
  }

  if (deps.aiAllowed) {
    // A plan request with a complete form: draft it with the rule engine now and
    // show it at once, so the panel fills in about a second instead of waiting
    // for the model to choose plan_trip, run it, and come back for a second round.
    // The model then only explains the result it is handed.
    yield { t: "mode", mode: "ai" };
    if (planning) {
      try {
        yield { t: "status", label: "Drafting your plan" };
        const result = await planTrip(ctx, wantsFromText(latest, ctx));
        if (ctx.itinerary) {
          ctx.drafted = result;
          yield { t: "itinerary", itinerary: ctx.itinerary };
        }
      } catch (error) {
        console.error("Assistant early plan error:", error);
      }
    }
    type Item = { t: "text"; v: string } | { t: "status"; label: string };
    const queue: Item[] = [];
    let streamed = false;
    // Everything the model said, so a turn that says only whitespace is not taken for an answer.
    let streamedText = "";
    let wake: (() => void) | null = null;
    let finished = false;
    // The model itself came back, as opposed to the deadline giving up on it.
    let settled = false;
    let failure: unknown = null;
    let stopReason: string | null = null;
    ctx.onStatus = (label) => {
      queue.push({ t: "status", label });
      wake?.();
    };
    // Settles when the model is done, or when the deadline gives up on it. Its
    // own rejections are caught here, so awaiting it never throws.
    const run = deps
      .runAi(ctx, history, (delta) => {
        queue.push({ t: "text", v: delta });
        streamed = true;
        streamedText += delta;
        wake?.();
      })
      .then((result) => {
        stopReason = result.stopReason;
      })
      .catch((error) => {
        failure = error;
      })
      .finally(() => {
        finished = true;
        settled = true;
        wake?.();
      });
    // A slow model must not run the function out of time: after AI_DEADLINE_MS
    // the turn gives up on it and answers in basic mode, unprompted, so the
    // traveller gets an answer either way. The reply already sent is kept.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        if (finished) return;
        if (!streamedText.trim()) failure = new Error(`no answer within ${AI_DEADLINE_MS} ms`);
        else stopReason = "max_tokens";
        finished = true;
        wake?.();
        resolve();
      }, AI_DEADLINE_MS);
    });

    if (formNotice) yield { t: "text", v: formNotice };
    while (!finished || queue.length) {
      if (queue.length) {
        const items = queue.splice(0, queue.length);
        for (const item of items) if (item.t === "status") yield item;
        const text = items.flatMap((item) => (item.t === "text" ? [item.v] : [])).join("");
        if (text) yield { t: "text", v: text };
        continue;
      }
      await Promise.race([
        new Promise<void>((resolve) => {
          wake = resolve;
          if (finished || queue.length) resolve();
        }),
        deadline,
      ]);
      wake = null;
    }
    clearTimeout(timer);
    // When the model settled, this is instant. After the deadline it is not
    // awaited at all: a model still talking must not hold the answer back, and
    // `run` catches its own rejection.
    if (settled) await run;
    ctx.onStatus = undefined;

    // A turn that said nothing is not an answer. Gemini sometimes ends with
    // only whitespace, or with a tool-only round; the traveller then gets an
    // empty bubble and the chat's own "Sorry, I couldn't answer that" line.
    const said = formNotice.trim().length > 0 || (streamed && streamedText.trim().length > 0);
    if (!failure && said && stopReason !== "refusal") {
      if (stopReason === "max_tokens") yield { t: "text", v: "…" };
      // A plan request the model answered without drafting: draft it anyway, so the panel always has the plan.
      if (planning && !ctx.itinerary && !ctx.questions) await planTrip(ctx, wantsFromText(latest, ctx)).catch((error) => console.error("Assistant plan error:", error));
      yield* closing(ctx, trip);
      return;
    }
    if (failure) console.error("Assistant AI error, using basic mode:", failure);
    else if (!said) console.warn("Assistant AI said nothing, using basic mode");
    // Part of an answer already went out: close it rather than start over.
    if (said) {
      yield { t: "text", v: failure ? "\n\nSorry, I lost the connection there. Please ask again." : "" };
      yield* closing(ctx, trip);
      return;
    }
    ctx.cards.length = 0;
    ctx.itinerary = null;
    ctx.questions = null;
  }

  yield* basicTurn(ctx, trip, latest, planning, formNotice);
}
