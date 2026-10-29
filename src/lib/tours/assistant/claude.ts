import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { assistantSystemPrompt } from "@/lib/tours/assistant/prompt";
import type { ChatTurn } from "@/lib/tours/assistant/respond";
import {
  attractionInfo,
  handoff,
  myBookings,
  planTripLink,
  policy,
  POLICY_TOPICS,
  searchTours,
  tourDetails,
  upcomingEvents,
  type ToolContext,
} from "@/lib/tours/assistant/tools";

/**
 * The travel assistant on Claude (F13): the SDK tool runner with streaming
 * and the read-only tools. On whenever ANTHROPIC_API_KEY is set, unless
 * ASSISTANT_LLM=off. Any failure throws, and the route answers in basic mode.
 */

export function isAssistantLlmEnabled(): boolean {
  return process.env.ASSISTANT_LLM !== "off" && Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = () => process.env.ASSISTANT_MODEL || "claude-opus-5-5";
const MAX_RESULT_CHARS = 6000;


/** Tool results go back as data, trimmed so one big result can't flood the context. */
const asResult = (value: unknown) => JSON.stringify(value).slice(0, MAX_RESULT_CHARS);

async function guard(run: () => unknown | Promise<unknown>): Promise<string> {
  try {
    return asResult(await run());
  } catch (error) {
    console.error("Assistant tool error:", error);
    return asResult({ error: "That lookup failed. Try again or answer without it." });
  }
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, Manila");

export function assistantTools(ctx: ToolContext) {
  return [
    betaZodTool({
      name: "search_tours",
      eager_input_streaming: true,
      description: "Find published tours by words in the title, place or description. Optionally only tours with free seats on a date, or at most a price per person. Returns ids for tour_details.",
      inputSchema: z.object({
        query: z.string().max(60).nullable().describe("e.g. 'Calaguas', 'surf', 'island hopping'; null for all"),
        date: date.nullable(),
        maxPrice: z.number().nonnegative().nullable().describe("pesos per person"),
      }),
      run: (input) => guard(() => searchTours(ctx, input)),
    }),
    betaZodTool({
      name: "tour_details",
      eager_input_streaming: true,
      description: "Prices, inclusions, stops, operator and the next open dates with seats left for one tour.",
      inputSchema: z.object({ packageId: z.string().describe("id from search_tours") }),
      run: (input) => guard(() => tourDetails(ctx, input)),
    }),
    betaZodTool({
      name: "attraction_info",
      eager_input_streaming: true,
      description: "Opening hours, entrance fee and a short description of a listed place in Daet (beaches, churches, museums, parks...).",
      inputSchema: z.object({ name: z.string().max(60) }),
      run: (input) => guard(() => attractionInfo(ctx, input)),
    }),
    betaZodTool({
      name: "upcoming_events",
      eager_input_streaming: true,
      description: "Published events in Daet between two dates (defaults to from today).",
      inputSchema: z.object({ from: date.nullable(), to: date.nullable() }),
      run: (input) => guard(() => upcomingEvents(ctx, input)),
    }),
    betaZodTool({
      name: "policy",
      eager_input_streaming: true,
      description: "CONNECT-Daet rules and how-tos: cancel (cancellation and refunds), pay (payment methods), ticket (QR and check-in), status (booking statuses), book (how to book), rewards, plan (trip planner), contact (operators and the Tourism Office), account.",
      inputSchema: z.object({ topic: z.enum(POLICY_TOPICS) }),
      run: (input) => guard(() => policy(ctx, input)),
    }),
    betaZodTool({
      name: "my_bookings",
      eager_input_streaming: true,
      description: "The signed-in tourist's own bookings: reference, tour, date, status, amount still due and the next step. Optionally one booking by reference (BK-...).",
      inputSchema: z.object({ reference: z.string().max(40).nullable() }),
      run: (input) => guard(() => myBookings(ctx, input)),
    }),
    betaZodTool({
      name: "plan_trip_link",
      eager_input_streaming: true,
      description: "A link to the trip planner, pre-filled with the tourist's trip description, for when they want a day-by-day itinerary.",
      inputSchema: z.object({ description: z.string().max(300).describe("their trip in their words: days, group, interests, budget") }),
      run: (input) => guard(() => planTripLink(ctx, input)),
    }),
    betaZodTool({
      name: "handoff",
      eager_input_streaming: true,
      description: "Offer to pass the conversation to a person: the booking's operator when it is about one of their bookings, otherwise the Daet Tourism Office. Shows a message they can edit and send.",
      inputSchema: z.object({
        summary: z.string().max(600).describe("first person, ready to send, with the key details"),
        bookingReference: z.string().max(40).nullable(),
      }),
      run: (input) => guard(() => handoff(ctx, input)),
    }),
  ];
}

/**
 * Streams the reply through `onText`. Resolves when done; throws when the
 * model can't be used (the caller falls back to basic mode if nothing was
 * streamed yet).
 */
export async function runAssistant(
  ctx: ToolContext,
  history: ChatTurn[],
  onText: (delta: string) => void,
  client: Anthropic = new Anthropic({ timeout: 30_000, maxRetries: 1 }),
): Promise<{ stopReason: string | null }> {
  const runner = client.beta.messages.toolRunner({
    model: MODEL(),
    max_tokens: 2000,
    system: assistantSystemPrompt({ today: ctx.today, signedIn: Boolean(ctx.userId) }),
    messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
    tools: assistantTools(ctx),
    output_config: { effort: "low" },
    stream: true,
    max_iterations: 6,
  });

  let stopReason: string | null = null;
  for await (const stream of runner) {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
    }
    const message = await stream.finalMessage();
    stopReason = message.stop_reason;
    if (message.stop_reason === "refusal") break;
    // A cut-off turn may carry a truncated tool call; don't run it.
    if (message.stop_reason === "max_tokens" && message.content.some((block) => block.type === "tool_use")) break;
  }
  return { stopReason };
}
