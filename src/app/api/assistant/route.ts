import { headers } from "next/headers";
import { aiCallerKey, allowAiCall } from "@/lib/ai/limits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAssistantLlmEnabled, runAssistant } from "@/lib/tours/assistant/claude";
import { respond } from "@/lib/tours/assistant/respond";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

/**
 * Travel assistant (F13). POST { messages } → newline-delimited JSON events
 * (mode, text deltas, cards, done). Reads only, with the caller's session.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "The assistant is not set up." }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a message to the assistant." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const aiAllowed = isAssistantLlmEnabled() && allowAiCall("assistant", aiCallerKey(user?.id, (await headers()).get("x-forwarded-for")));

  const events = respond(body, {
    supabase,
    userId: user?.id ?? null,
    today: toManilaDateKey(new Date()),
    aiAllowed,
    runAi: (ctx, history, onText) => runAssistant(ctx, history, onText),
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
