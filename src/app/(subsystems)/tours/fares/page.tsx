import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { formatPeso } from "@/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FARE_COLUMNS, FARE_PER, faresBetween, minutesLabel, toFare } from "@/lib/tours/guide/fares";
import { MAX_PEOPLE, farePlaces, meetingFarePlace, parsePeople, pickPlace, quoteRoute, type Quote } from "@/lib/tours/guide/fare-calculator";
import { meetingPointOf, meetingTimeLabel } from "@/lib/tours/guide/meeting";
import { isUuid } from "@/lib/tours/operator-access";

export const metadata = {
  title: "Fare calculator",
  description: "How much it costs to get picked up and brought to places in Daet: tricycle, van, bus and boat fares from the Tourism Office.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const range = (lo: number, hi: number) => (lo === hi ? formatPeso(lo) : `${formatPeso(lo)}–${formatPeso(hi)}`);
const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/**
 * Fare calculator (magkano ang pasundo?): where you are, where you're going,
 * how many of you. Prices come only from the Tourism Office fare table; the
 * form is a plain GET, so it works without JavaScript and runs once per
 * submit. Nothing polls.
 */
export default async function FareCalculatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isSupabaseConfigured()) return <PageFrame><Notice variant="error">The fare calculator is unavailable right now.</Notice></PageFrame>;
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const packageId = isUuid(one(params.package) ?? "") ? (one(params.package) as string) : null;
  // The fares and (for "to the meeting point") the tour, in one round trip.
  const [{ data, error }, pkgRes] = await Promise.all([
    supabase.from("tours_fares").select(FARE_COLUMNS).eq("is_active", true).limit(300),
    packageId
      ? supabase.from("tours_packages").select("id, title, location_name, meeting_point_name, meeting_time").eq("id", packageId).eq("status", "published").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const fares = (data ?? []).map((row) => toFare(row as Record<string, unknown>));
  const places = farePlaces(fares);

  const pkg = pkgRes.data as { id: string; title: string; location_name: string; meeting_point_name: string | null; meeting_time: string | null } | null;
  const meeting = pkg ? meetingPointOf(pkg) : null;
  const meetingTarget = pkg && meeting ? meetingFarePlace(meeting.name, pkg.location_name, places) : null;

  const from = pickPlace(one(params.from), places);
  const to = meetingTarget ? meetingTarget.place : pickPlace(one(params.to), places);
  const people = parsePeople(one(params.people));
  const roundTrip = one(params.back) === "1";
  const asked = Boolean(from && to);
  const quotes: Quote[] = asked && from !== to ? faresBetween(fares, from, to).slice(0, 4).map((r) => quoteRoute(r, people, roundTrip)) : [];

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="display-2 text-daet-ink">{pkg ? "Getting to the meeting point" : "Fare calculator"}</h1>
          {pkg && meeting ? (
            <p className="mt-1 font-bold text-daet-ink">
              {pkg.title}: meet at {meeting.name}
              {meetingTimeLabel(meeting.time) ? `, ${meetingTimeLabel(meeting.time)}` : ""}.{" "}
              <Link href={`/tours/packages/${pkg.id}`} className="font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">
                Back to the tour
              </Link>
            </p>
          ) : null}
          <p className="mt-1 text-daet-ink/70">How much will it cost to get picked up and brought there? Choose where you are and where you&apos;re going. Fares are from the Daet Tourism Office and can change, so confirm with the driver before you ride.</p>
        </div>

        {error ? <Notice variant="error" title="Fares could not be loaded">Please try again in a moment.</Notice> : null}

        <form action="/tours/fares" className="grid gap-4 rounded-2xl card-edge bg-surface p-5 sm:grid-cols-2">
          <Field id="fare-from" label="Pick me up at">
            <Select name="from" defaultValue={from} required>
              <option value="">Choose where you are</option>
              {places.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          {pkg ? (
            <div>
              <Input type="hidden" name="package" value={pkg.id} />
              <p className="text-sm font-bold text-daet-ink">Take me to</p>
              <p className="mt-1 flex min-h-12 items-center rounded-2xl bg-canvas px-4 text-daet-ink">
                {meetingTarget ? (meetingTarget.exact ? meeting?.name : `${meetingTarget.place} (near the meeting point)`) : "The meeting point"}
              </p>
            </div>
          ) : (
            <Field id="fare-to" label="Take me to">
              <Select name="to" defaultValue={to} required>
                <option value="">Choose where you&apos;re going</option>
                {places.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field id="fare-people" label="How many of you?">
            <Input type="number" name="people" min={1} max={MAX_PEOPLE} inputMode="numeric" defaultValue={people} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm font-bold text-daet-ink">
            <Checkbox name="back" value="1" defaultChecked={roundTrip} />
            Round trip (there and back)
          </label>
          <div className="sm:col-span-2">
            <Button type="submit">Calculate</Button>
          </div>
        </form>

        {pkg && !meetingTarget ? (
          <Notice variant="info">The fare table doesn&apos;t list the area of this meeting point yet. Use the tour&apos;s directions link, or ask the operator in Messages.</Notice>
        ) : null}
        {meetingTarget && !meetingTarget.exact && asked ? (
          <Notice variant="info">
            These fares are to {meetingTarget.place}. The meeting point, {meeting?.name}, is there or close by: show the driver the tour&apos;s directions.
          </Notice>
        ) : null}
        {asked ? (
          from === to ? (
            <Notice variant="info">Choose two different places.</Notice>
          ) : quotes.length === 0 ? (
            <Notice variant="info" title="No listed fare for this trip">
              The Tourism Office hasn&apos;t listed a way from {from} to {to} yet. Ask the{" "}
              <Link href="/tours/help" className="font-bold underline underline-offset-4">
                Daet AI assistant
              </Link>{" "}
              or a local driver.
            </Notice>
          ) : (
            <section aria-labelledby="fare-results" className="space-y-4">
              <h2 id="fare-results" className="text-xl font-bold text-daet-ink">
                {from} to {pkg && meetingTarget?.exact ? meeting?.name : to}
                {pkg ? " (meeting point)" : ""}
                {roundTrip ? " and back" : ""}, {people} {people === 1 ? "person" : "people"}
              </h2>
              {quotes.map((q, i) => (
                <article key={i} aria-label={`Option ${i + 1}: ${q.legs.map((l) => l.modeLabel).join(", then ")}`} className="rounded-2xl card-edge bg-surface p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-bold text-daet-ink">{q.legs.map((l) => l.modeLabel).join(" → ")}</h3>
                    <p className="text-2xl font-bold text-daet-ink">
                      {q.partial ? "at least " : ""}
                      {range(q.totalMin, q.totalMax)}
                    </p>
                  </div>
                  <p className="text-sm text-daet-ink/70">
                    {range(q.perPersonMin, q.perPersonMax)} each
                    {minutesLabel(q.minutesMin, q.minutesMax) ? ` · about ${minutesLabel(q.minutesMin, q.minutesMax)}${roundTrip ? " each way" : ""}` : ""}
                  </p>
                  <ol className="mt-3 space-y-2 text-sm">
                    {q.legs.map((l, j) => (
                      <li key={j} className="rounded-xl bg-canvas p-3">
                        <p className="font-bold text-daet-ink">
                          {l.modeLabel}: {l.from} to {l.to}
                        </p>
                        <p className="text-daet-ink/80">
                          {l.groupMin === null
                            ? "No listed fare: ask the driver."
                            : `${l.min !== null && l.max !== null && l.min !== l.max ? `${formatPeso(l.min)}–${formatPeso(l.max)}` : formatPeso((l.min ?? l.max) as number)} ${FARE_PER[l.per]}${l.per === "person" && people > 1 ? ` × ${people} = ${range(l.groupMin, l.groupMax as number)}` : ""}${l.min !== null && l.max === null ? " (lowest price seen)" : ""}`}
                        </p>
                        {l.scheduleNote ? <p className="text-daet-ink/70">{l.scheduleNote}</p> : null}
                      </li>
                    ))}
                  </ol>
                  {q.unknown.length ? <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">Not counted (no listed fare): {q.unknown.join("; ")}.</p> : null}
                  <p className="mt-2 text-xs text-daet-ink/70">
                    {roundTrip ? "Both ways counted. " : ""}Fares from {[...new Set(q.legs.map((l) => l.source))].join(", ")}
                    {q.checkedOn ? `, checked ${day(q.checkedOn)}` : ""}.
                  </p>
                </article>
              ))}
            </section>
          )
        ) : null}
      </div>
    </PageFrame>
  );
}
