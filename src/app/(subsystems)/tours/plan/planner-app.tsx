"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { RouteMap } from "@/components/maps/route-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ATTRACTION_CATEGORIES, CATEGORY_ICONS, type AttractionCategory } from "@/lib/tours/attractions";
import { visitIds, type PlannerInput } from "@/lib/tours/itinerary/form";
import { scheduleOrder, withTotals } from "@/lib/tours/itinerary/schedule";
import type { PackageMatch } from "@/lib/tours/itinerary/suggest";
import { formatClock, MAX_DAYS, type Plan, type Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";
import { generateItinerary, saveItinerary, suggestPackages, type GenerateResult } from "./actions";

type Generated = Extract<GenerateResult, { ok: true }>;

const PACE_LABELS = { relaxed: "Relaxed", normal: "Normal", packed: "Packed" } as const;
const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

export function PlannerApp({ defaultDate, aiAvailable, signedIn }: { defaultDate: string; aiAvailable: boolean; signedIn: boolean }) {
  const [input, setInput] = useState<PlannerInput>({ startDate: defaultDate, days: 2, budgetPerDay: 500, interests: ["beach", "heritage"], pace: "normal", groupSize: 2, dayStart: "08:00", dayEnd: "18:00" });
  const [useAi, setUseAi] = useState(aiAvailable);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setMessage(null);
    startTransition(async () => {
      const response = await generateItinerary(input, useAi);
      if (!response.ok) {
        setErrors(response.errors);
        setMessage(response.message ?? null);
        return;
      }
      setErrors({});
      setResult(response);
      setPlan(response.plan);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const set = <K extends keyof PlannerInput>(key: K, value: PlannerInput[K]) => setInput((current) => ({ ...current, [key]: value }));

  if (result && plan) {
    return <PlanEditor result={result} plan={plan} setPlan={setPlan} input={input} onBack={() => setResult(null)} signedIn={signedIn} />;
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        generate();
      }}
    >
      {message ? <Notice variant="error">{message}</Notice> : null}
      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="startDate" label="First day" required error={errors.startDate}>
          <Input id="startDate" type="date" value={input.startDate} min={defaultDate} onChange={(e) => set("startDate", e.target.value)} invalid={Boolean(errors.startDate)} />
        </Field>
        <Field id="days" label="Days" required error={errors.days}>
          <Select id="days" value={input.days} onChange={(e) => set("days", Number(e.target.value))} invalid={Boolean(errors.days)}>
            {Array.from({ length: MAX_DAYS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} day{n > 1 ? "s" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="groupSize" label="People" required error={errors.groupSize}>
          <Input id="groupSize" type="number" inputMode="numeric" min={1} max={30} value={input.groupSize} onChange={(e) => set("groupSize", Number(e.target.value))} invalid={Boolean(errors.groupSize)} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-bold text-daet-ink">What do you enjoy?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.entries(ATTRACTION_CATEGORIES) as Array<[AttractionCategory, string]>).map(([value, label]) => {
            const on = input.interests.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => set("interests", on ? input.interests.filter((i) => i !== value) : [...input.interests, value])}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm font-bold transition ${on ? "border-daet-forest bg-daet-forest text-white" : "border-daet-ink/15 bg-white text-daet-ink hover:bg-daet-sand"}`}
              >
                <span aria-hidden="true">{CATEGORY_ICONS[value]}</span> {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="budgetPerDay" label="Entrance-fee budget (₱ per person per day)" hint="Food and transport are not included." error={errors.budgetPerDay}>
          <Input id="budgetPerDay" type="number" inputMode="numeric" min={0} value={input.budgetPerDay} onChange={(e) => set("budgetPerDay", Number(e.target.value))} invalid={Boolean(errors.budgetPerDay)} />
        </Field>
        <fieldset>
          <legend className="text-sm font-bold text-daet-ink">Pace</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(Object.keys(PACE_LABELS) as Array<keyof typeof PACE_LABELS>).map((pace) => (
              <label key={pace} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-daet-ink/20 bg-white text-sm font-bold text-daet-ink has-[:checked]:border-daet-forest has-[:checked]:bg-daet-forest/10">
                <input type="radio" name="pace" value={pace} checked={input.pace === pace} onChange={() => set("pace", pace)} className="sr-only" />
                {PACE_LABELS[pace]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="dayStart" label="Start each day at" error={errors.dayStart}>
          <Input id="dayStart" type="time" value={input.dayStart} onChange={(e) => set("dayStart", e.target.value)} invalid={Boolean(errors.dayStart)} />
        </Field>
        <Field id="dayEnd" label="Finish by" error={errors.dayEnd}>
          <Input id="dayEnd" type="time" value={input.dayEnd} onChange={(e) => set("dayEnd", e.target.value)} invalid={Boolean(errors.dayEnd)} />
        </Field>
      </div>

      {aiAvailable ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-daet-ink/10 bg-daet-sand/40 p-3">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-1 h-5 w-5 accent-daet-forest" />
          <span>
            <span className="block text-sm font-bold text-daet-ink">Polish with AI</span>
            <span className="block text-xs text-daet-ink/60">Reorders stops and adds tips using only our attraction list. Every suggestion is checked against opening hours and your budget.</span>
          </span>
        </label>
      ) : null}

      <Button type="submit" size="lg" fullWidth loading={pending} loadingText="Planning your trip…">
        Plan my trip
      </Button>
    </form>
  );
}

function PlanEditor({ result, plan, setPlan, input, onBack, signedIn }: { result: Generated; plan: Plan; setPlan: (plan: Plan) => void; input: PlannerInput; onBack: () => void; signedIn: boolean }) {
  const byId = useMemo(() => new Map(result.attractions.map((a) => [a.id, a])), [result.attractions]);
  const prefs: Preferences = result.prefs;
  const validation = useMemo(() => validatePlan(plan, byId, prefs), [plan, byId, prefs]);
  const used = new Set(plan.days.flatMap((d) => visitIds(d.blocks)));
  const unused = result.attractions.filter((a) => !used.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
  const [title, setTitle] = useState(`Daet trip · ${longDate(prefs.startDate)}`);
  const [saveState, setSaveState] = useState<{ tone: "success" | "error"; text: string; id?: string } | null>(null);
  const [matches, setMatches] = useState<PackageMatch[] | null>(null);
  const [pending, startTransition] = useTransition();

  function editDay(dayIndex: number, ids: string[]) {
    const days = plan.days.map((day, i) => (i === dayIndex ? scheduleOrder(day.date, ids, byId, prefs) : day));
    setPlan(withTotals(days));
    setSaveState(null);
  }

  function save() {
    startTransition(async () => {
      const response = await saveItinerary({ title, preferences: input, plan, tips: result.tips, summary: result.summary, source: result.source });
      if (!response.ok) {
        setSaveState({ tone: "error", text: response.message });
        return;
      }
      setSaveState({ tone: "success", text: "Saved to My itineraries.", id: response.id });
      const places = plan.days.flatMap((d) => visitIds(d.blocks)).map((id) => byId.get(id)!).map((a) => ({ name: a.name, lat: a.lat, lng: a.lng }));
      setMatches(await suggestPackages(places));
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Change trip details
        </Button>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="brand">{plan.totals.visits} stops</Badge>
          <Badge tone="neutral">{plan.totals.travelMinutes} min travel</Badge>
          <Badge tone="neutral">{peso(plan.totals.cost)} entrance fees</Badge>
          {result.source === "llm" ? <Badge tone="info">Polished with AI</Badge> : null}
        </div>
      </div>

      {result.summary ? <p className="rounded-2xl bg-daet-forest/5 p-4 text-sm leading-6 text-daet-ink">{result.summary}</p> : null}

      {validation.ok ? null : (
        <Notice variant="warning" title="This plan needs a fix before you can save it">
          <ul className="list-disc pl-5">
            {validation.issues.map((issue, i) => (
              <li key={i}>
                Day {issue.day + 1}: {issue.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {plan.days.map((day, dayIndex) => {
        const ids = visitIds(day.blocks);
        const points = ids.map((id) => byId.get(id)!).map((a) => ({ lat: a.lat, lng: a.lng, label: a.name }));
        return (
          <section key={day.date} className="rounded-3xl border border-daet-ink/10 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-daet-ink">
              Day {dayIndex + 1} · {longDate(day.date)}
            </h2>
            {day.blocks.length === 0 ? (
              <p className="mt-2 text-sm text-daet-ink/60">Free day: nothing else fits your interests, hours and budget. Add a stop below.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {day.blocks.map((block, i) => {
                  const visitIndex = block.kind === "visit" ? ids.indexOf(block.attractionId) : -1;
                  return (
                    <li key={`${block.kind}-${block.kind === "visit" ? block.attractionId : i}`} className={`rounded-2xl border p-4 ${block.kind === "lunch" ? "border-daet-sun/40 bg-amber-50/60" : "border-daet-ink/10"}`}>
                      {block.travelMinutes > 0 ? <p className="mb-1 text-xs text-daet-ink/50">↓ about {block.travelMinutes} min travel</p> : null}
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-black text-daet-ink">
                          {block.kind === "lunch" ? "🍽️ " : `${CATEGORY_ICONS[byId.get(block.attractionId)?.category ?? "park"]} `}
                          {block.name}
                        </p>
                        <p className="text-sm font-bold text-daet-forest">
                          {formatClock(block.start)} – {formatClock(block.end)}
                        </p>
                      </div>
                      {block.kind === "visit" ? (
                        <>
                          <p className="mt-1 text-xs text-daet-ink/60">
                            {block.cost > 0 ? `${peso(block.cost)} for the group` : "No listed entrance fee"}
                            {!block.hoursConfirmed ? " · hours not listed, check before going" : ""}
                          </p>
                          {result.tips[block.attractionId] ? <p className="mt-2 text-sm text-daet-ink/75">💡 {result.tips[block.attractionId]}</p> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="ghost" disabled={visitIndex === 0} onClick={() => editDay(dayIndex, move(ids, visitIndex, -1))} aria-label={`Move ${block.name} earlier`}>
                              ↑
                            </Button>
                            <Button variant="ghost" disabled={visitIndex === ids.length - 1} onClick={() => editDay(dayIndex, move(ids, visitIndex, 1))} aria-label={`Move ${block.name} later`}>
                              ↓
                            </Button>
                            {unused.length ? (
                              <Select
                                aria-label={`Swap ${block.name} for another place`}
                                value=""
                                onChange={(e) => e.target.value && editDay(dayIndex, ids.map((id) => (id === block.attractionId ? e.target.value : id)))}
                                className="mt-0 w-auto min-w-[9rem]"
                              >
                                <option value="">Swap…</option>
                                {unused.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                              </Select>
                            ) : null}
                            <Button variant="danger" onClick={() => editDay(dayIndex, ids.filter((id) => id !== block.attractionId))}>
                              Remove
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
            {unused.length ? (
              <div className="mt-4">
                <Select aria-label={`Add a stop to day ${dayIndex + 1}`} value="" onChange={(e) => e.target.value && editDay(dayIndex, [...ids, e.target.value])} className="mt-0">
                  <option value="">+ Add a stop to this day…</option>
                  {unused.map((a) => (
                    <option key={a.id} value={a.id}>
                      {CATEGORY_ICONS[a.category]} {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {points.length ? (
              <div className="mt-4">
                <RouteMap points={points} connect title={`Map of day ${dayIndex + 1}`} />
              </div>
            ) : null}
          </section>
        );
      })}

      <section className="rounded-3xl border border-daet-ink/10 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-daet-ink">Save this plan</h2>
        {saveState ? (
          <Notice variant={saveState.tone} className="mt-3">
            {saveState.text}{" "}
            {saveState.id ? (
              <Link href={`/tours/my-itineraries/${saveState.id}`} className="font-bold underline">
                Open it
              </Link>
            ) : null}
          </Notice>
        ) : null}
        {signedIn ? (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field id="title" label="Plan name" className="flex-1">
              <Input id="title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Button onClick={save} loading={pending} loadingText="Saving…" disabled={!validation.ok || saveState?.tone === "success"}>
              Save plan
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-daet-ink/70">
            <Link href={`/login?next=${encodeURIComponent("/tours/plan")}`} className="font-bold text-daet-forest underline">
              Sign in
            </Link>{" "}
            to save plans and share them.
          </p>
        )}
      </section>

      {matches ? (
        <section className="rounded-3xl border border-daet-ink/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-daet-ink">Book matching tours</h2>
          {matches.length === 0 ? (
            <p className="mt-2 text-sm text-daet-ink/65">No published tours pass these places yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {matches.map((match) => (
                <li key={match.id} className="flex items-center gap-3 rounded-2xl border border-daet-ink/10 p-3">
                  {match.coverImageUrl ? <img src={match.coverImageUrl} alt="" className="h-14 w-20 rounded-xl object-cover" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-daet-ink">{match.title}</p>
                    <p className="text-xs text-daet-ink/60">Visits {match.matched.join(", ")}</p>
                  </div>
                  <Link href={`/tours/packages/${match.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-daet-forest px-4 text-sm font-bold text-white hover:bg-daet-ink">
                    View tour
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function move(ids: string[], index: number, by: number): string[] {
  const next = [...ids];
  const target = index + by;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

