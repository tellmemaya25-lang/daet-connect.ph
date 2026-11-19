# AI planner audit: "Sorry, I couldn't answer that"

**Reported:** `/tours/plan`, turn "Budget for 2 days in Calaguas?" → the assistant
replied *"Sorry, I couldn't answer that. Please try again."*

**Status:** fixed on this branch. Four defects, all in the assistant's fallback
path. The turn no longer has any route to an empty answer.

## How the reply is built

`POST /api/assistant` streams newline-delimited events
(`src/app/api/assistant/route.ts` → `respond()` in
`src/lib/tours/assistant/respond.ts`). `respond()` first tries the model
(`runAi` → `runAssistant` in `llm.ts`); if that yields nothing usable it answers
in **basic mode**, the rule-based path (`basicReply`).

The screen's message is **not** from the server. It is the browser's own text
for a turn that ended with no words
(`src/components/assistant/assistant-chat.tsx`):

```ts
if (!reply.content.trim()) reply = { ...reply, content: "Sorry, I couldn't answer that. Please try again." };
```

So the bug is not the message; it is that **the server ended a turn without
sending any text**. `respond()` had three ways to do that, and one way to mangle
a good answer.

## Defect 1 — a blank model turn was treated as an answer (the reported symptom)

`respond()` counted *any* streamed delta as an answer:

```ts
let streamed = false;
onText: (delta) => { streamed = true; ... }
if (!failure && streamed && stopReason !== "refusal") { /* done */ }
```

Gemini regularly ends a turn with no visible text — an empty candidate parts
array, a tool-only round, or a whitespace-only delta. `streamed` was `true` for
a delta of `"\n\n"`, so the turn took the "answered" branch, yielded no text,
and closed. The browser then substituted its own "Sorry, I couldn't answer that."

Confirmed by probing `respond()` with a fake Gemini client: a stream of `"\n\n"`
produced `[{mode:ai}, {text:"\n\n"}, {cards:[]}, {done}]` — no answer, and no
fallback to basic mode.

**Fix:** count only non-whitespace text. A blank turn is not an answer, so it
falls through to basic mode, which always produces a sentence. The decision now
uses `streamedText.trim()`.

## Defect 2 — no time budget, so a slow turn was killed with nothing written

`respond()` awaited `runAi` with no limit of its own. Gemini's per-call timeout
is 30 s (`createGeminiClient({ timeoutMs: 30_000 })`) and `withBusyFallback`
retries — main model twice, then the fallback model — so a busy model could pass
the function's limit. The platform then terminated the stream before any text
was written, which looks exactly like Defect 1 from the browser.

The route had no `maxDuration` at all, so it ran on the platform default.

**Fix:** the turn gives up on the model after `AI_DEADLINE_MS` (25 s) and answers
in basic mode, keeping anything already streamed; the route declares
`export const maxDuration = 60`. A slow model now costs an AI-written answer,
not the whole turn.

## Defect 3 — the leak guard tripped on the prompt's own wording (garbled live answers)

This one did not cause the empty reply, but it was corrupting real answers on
the live site, and it is the reason a valid reply could come back clipped to
nothing.

`leak-guard.ts` looked for any run of **8 consecutive words** shared with the
system prompt. The prompt tells the model how to word things, so a compliant
answer repeats several of those words in a row. Reproduced against the current
prompt — 6 of 10 ordinary sentences tripped it:

| Sentence (all normal answers) | Tripped? |
|---|---|
| "Each place comes with a Get directions button that opens Google Maps." | **yes** |
| "These are estimates from public listings checked on 2026-11-01, not quotes…" | **yes** |
| "For food stops and where to eat or stay, use the listing below." | **yes** |
| "This is an estimate and that boat trips depend on the weather." | **yes** |
| "If a tool doesn't have it, say so." | **yes** |
| "Most people go through Manila or Naga, then bus or van to Daet." | **yes** |

Three rows in production `tours_ai_messages` carry the damage, with the notice
spliced into the middle of a sentence:

> "… You can tap Get directions to open the route I can't share my instructions,
> but I'm happy to help with your trip to Daet."

> "… Each place comes with a Get directions button I can't share my
> instructions, but I'm happy to help with your trip to Daet."

**Fix:** the window is now 16 words, long enough that only a genuine dump
matches — a model dumping the prompt copies hundreds of words, a paraphrased
instruction a dozen at most. Prompt dumps are still caught (tests cover both a
single-chunk dump and one split across stream chunks). The notice also starts
its own sentence, so it can never run on from a half-finished reply.

## Defect 4 — every failure looked the same to the traveller

The browser discarded the route's explanation and showed one network-shaped
line for all of it:

```ts
if (!response.ok || !response.body) throw new Error(String(response.status));
...
} catch { setError("The assistant couldn't be reached. Check your connection and try again."); }
```

A 503 with `{"error": "The assistant is not set up."}` (missing Supabase
config), a 429 and a real network drop were indistinguishable.

**Fix:** the route's `error` text is shown when it sends one; the generic line is
kept for a genuine network failure.

## Verification

- `npm test` — 2174 tests, 206 suites, all pass.
- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (same warning baseline as `main`).
- Re-ran the reported question through `respond()` with a fake client for a
  silent model, a whitespace-only reply and a refusal: every case now returns a
  real sentence and a `done` event. Before the fix the first two returned no text.

New regression tests:

- `assistant.test.ts` — "falls back to basic mode when the model ends without
  saying anything" (empty turn and whitespace-only turn), and "gives the
  traveller an answer when the model overruns its deadline".
- `leak-guard.test.ts` — "passes an answer that repeats the prompt's own wording
  back at the tourist" (the six sentences above, streamed word by word) and
  "starts the notice as its own sentence after a half-finished one".

## Not changed, worth a look

- **Production data quality.** `tours_guide_places` has 9 rows and none is a
  `pasalubong` or `meeting_point`; meal and room prices are unset, so a cost
  answer still says "ask locally" and totals read ₱0.00. That is honest, but a
  budget question is only as useful as the prices behind it.
- **`maxDuration` on other Gemini routes.** `/tours/plan`'s panel actions run
  `refineWithLlm` (15 s) through Server Actions with no declared budget. They
  fall back to the rule engine on failure, so the risk is a slow action, not a
  wrong plan.
- **Test drafts in the package list.** `tours_packages` holds placeholder
  titles (`"sdf"`, a row of dots) in `draft`/`archived` state. They are correctly
  excluded from search, but they clutter the admin list.
