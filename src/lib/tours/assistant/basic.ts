import { formatPeso } from "@/lib/money";
import { FAQS, matchFaq } from "@/lib/tours/assistant/knowledge";
import { attractionInfo, handoff, myBookings, planTripLink, searchTours, tourDetails, upcomingEvents, type ToolContext } from "@/lib/tours/assistant/tools";
import { normalizeText } from "@/lib/tours/itinerary/assistant";

/**
 * Basic mode: answers without a language model. Used when no Anthropic key
 * is configured, when the AI limit is reached, or when the AI call fails.
 * Recognises a few intents, then falls back to the FAQ.
 */

const has = (t: string, pattern: RegExp) => pattern.test(t);
const STOP = new Set(["what", "when", "where", "which", "the", "are", "is", "for", "any", "open", "dates", "date", "available", "availability", "seats", "slots", "tour", "tours", "this", "next", "weekend", "week", "there", "still", "have", "you", "do", "can", "book", "how", "much", "price", "cost", "meron", "pa", "ba", "ang", "sa", "ng", "may", "magkano"]);

export async function basicReply(text: string, ctx: ToolContext): Promise<string> {
  const t = normalizeText(text);

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|kumusta|musta|magandang (umaga|hapon|gabi))\b/.test(t) && t.split(" ").length <= 4) {
    return "Hi! I'm the CONNECT-Daet travel assistant. Ask me about tours and open dates, prices, places and events in Daet, or about your own booking, payment or ticket.";
  }

  // A person, or a complaint
  if (has(t, /\b(talk to|speak (to|with)|human|real person|agent|complain|complaint|reklamo|emergency|kausapin|not happy|scam|lost)\b/)) {
    const ref = /\bbk-[0-9a-z-]+\b/i.exec(text)?.[0] ?? null;
    await handoff(ctx, { summary: text, bookingReference: ref });
    return ctx.userId
      ? "I'll pass this to a person. Check the message below, edit it if you like, and send it."
      : "I'll pass this to a person. Sign in first so they can reply to you.";
  }

  // Their own bookings, payments and tickets
  if (has(t, /\b(my|ko|namin|ko ba)\b/) && has(t, /\b(booking|bookings|reservation|ticket|tiket|payment|bayad|status|refund|qr)\b/) || /\bbk-[0-9a-z]/i.test(text)) {
    const ref = /\bbk-[0-9a-z-]+\b/i.exec(text)?.[0] ?? null;
    const result = await myBookings(ctx, { reference: ref });
    if ("error" in result && result.error) return result.error;
    if (!("signedIn" in result) || !result.signedIn) return "Sign in to see your bookings, payments and tickets.";
    if (!result.bookings?.length) return ref ? `I couldn't find a booking with reference ${ref.toUpperCase()} on your account.` : "You don't have any bookings yet. Browse tours to book one.";
    // A ticket question is about the next confirmed tour; keep just those cards when there are any.
    if (/\b(ticket|tiket|qr|check in)\b/.test(t)) {
      const upcoming = ctx.cards.filter((c) => c.type === "booking" && c.status === "confirmed" && c.date >= ctx.today);
      if (upcoming.length) ctx.cards.splice(0, ctx.cards.length, ...ctx.cards.filter((c) => c.type !== "booking"), ...upcoming);
    }
    const first = result.bookings[0];
    return `${result.bookings.length === 1 ? "Here's your booking" : `Here are your bookings, upcoming first`}. ${first.reference} (${first.tour}, ${first.date}): ${first.nextStep}`;
  }

  // Events
  if (has(t, /\b(event|events|festival|fiesta|pista|happening|activities)\b/)) {
    const result = await upcomingEvents(ctx, {});
    if ("error" in result && result.error) return result.error;
    if (!result.events?.length) return "There are no published events coming up yet. Check the events calendar later.";
    return `Coming up: ${result.events.slice(0, 3).map((e) => `${e.title} at ${e.venue}`).join("; ")}.`;
  }

  // Opening hours of a place
  if (has(t, /\b(open|close|closing|hours|what time|anong oras|bukas ba|entrance|fee)\b/) && !has(t, /\b(tour|tours|booking)\b/)) {
    const name = t.replace(/\b(what time|anong oras|does|do|is|are|the|open|opens|close|closes|closing|hours|of|at|bukas ba|entrance|fee|how much|magkano)\b/g, " ").replace(/\s+/g, " ").trim();
    if (name.length >= 3) {
      const result = await attractionInfo(ctx, { name });
      if (result.places?.length) {
        const p = result.places[0];
        return `${p.name}: ${p.hours}${p.entranceFee ? ` Entrance fee ${formatPeso(p.entranceFee)} per person.` : ""}`;
      }
    }
  }

  // Tours, prices and open dates
  if (has(t, /\b(tour|tours|package|island|hopping|surf|surfing|calaguas|trip|available|availability|open dates|slots|seats|price|cost|magkano|how much)\b/) && !matchFaqStrong(t)) {
    const words = t.split(" ").filter((w) => w.length >= 4 && !STOP.has(w));
    let result = await searchTours(ctx, { query: words.join(" ") || null });
    if (!result.tours?.length && words.length) result = await searchTours(ctx, { query: words[0] });
    if (!result.tours?.length) result = await searchTours(ctx, {});
    if ("error" in result && result.error) return result.error;
    if (!result.tours?.length) return "There are no published tours yet. Please check back soon.";
    if (result.tours.length === 1 || /\b(open dates|available|availability|slots|seats|when)\b/.test(t)) {
      const details = await tourDetails(ctx, { packageId: result.tours[0].id });
      if (!("error" in details)) {
        const dates = details.nextOpenDates.slice(0, 4).map((d) => `${d.date} (${d.seatsLeft} seats)`).join(", ");
        return `${details.title}${details.prices[0]?.perPerson ? ` from ${formatPeso(details.prices[0].perPerson)} per person` : ""}. ${dates ? `Next open dates: ${dates}.` : "No open dates are listed right now."}`;
      }
    }
    return `Here ${result.tours.length === 1 ? "is a tour" : "are some tours"} you can book. Open one to see its open dates.`;
  }

  // Trip planning
  if (has(t, /\b(plan|itinerary|what to do|places to visit|saan|pasyalan|day trip)\b/) && !matchFaqStrong(t)) {
    planTripLink(ctx, { description: text });
    return "The trip planner can build a day-by-day plan for you. I've passed your request to it.";
  }

  const faq = matchFaq(text);
  if (faq) {
    for (const link of faq.links) ctx.cards.push({ type: "link", ...link });
    return faq.answer;
  }

  return `I can help with: ${FAQS.slice(0, 5).map((f) => f.title.toLowerCase()).join(", ")}, tours and open dates, places and events. Or ask to talk to a person.`;
}

/** A policy question that mentions a tour ("cancel my tour") is still a policy question. */
function matchFaqStrong(t: string): boolean {
  return /\b(cancel|cancellation|refund|kansela|pay|payment|gcash|bayad|ticket|qr|check in|points|rewards)\b/.test(t);
}
