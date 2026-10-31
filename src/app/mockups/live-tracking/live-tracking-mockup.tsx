"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { LineIcon } from "@/components/ui/icons";
import { formatDistance, haversineMeters } from "@/lib/maps/geo";
import {
  GUESTS,
  NO_EVENTS,
  OTHER_TOURS,
  STOPS,
  T,
  alertsAt,
  clockLabel,
  durationLabel,
  guestView,
  guidePosition,
  narrationAt,
  phaseAt,
  stopIndexAt,
  type Alert,
  type Events,
  type GuestId,
  type GuestView,
  type Mode,
  type Variant,
} from "@/lib/tours/live-tracking-sim";
import { SketchMap, type MapMarker, type MapScale } from "./sketch-map";

/** Zoom to where the group is: the bus route, the town centre, the road, then the beach. */
function mapScale(t: number): MapScale {
  if (phaseAt(t) === "travel") return "region";
  if (t < T.ride) return "center";
  if (t < T.bagasbas) return "town";
  return "beach";
}

type View = "guide" | "operator" | "tourist";

const SPEEDS = [
  { id: "slow", label: "5 min/s", rate: 5 },
  { id: "normal", label: "15 min/s", rate: 15 },
  { id: "fast", label: "45 min/s", rate: 45 },
] as const;

const VARIANTS: Array<{ id: Variant; label: string; note: string }> = [
  { id: "recommended", label: "Recommended", note: "Guests choose. Town-level on the way, live during the tour, deleted after." },
  { id: "guide-only", label: "Guide only", note: "No guest tracking. Only the guide's dot, stop progress and tapped updates." },
  { id: "full", label: "Full tracking", note: "Everyone, exact, all the time. Shown for comparison; not advised." },
];

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "guide", label: "Guide" },
  { id: "operator", label: "Operator" },
  { id: "tourist", label: "Tourist" },
];

const CHAPTERS = [
  { label: "Bus leaves", t: T.depart },
  { label: "Near Labo", t: T.busArrive - 50 },
  { label: "Arrives Daet", t: T.busArrive + 5 },
  { label: "Meet guide", t: T.meet + 6 },
  { label: "Phone locks", t: T.lockStart + 4 },
  { label: "Away from group", t: T.driftStart + 12 },
  { label: "“I'm separated”", t: T.separated + 2 },
  { label: "Tour ends", t: T.end },
];

const PHASE_LABEL = { travel: "On the bus to Daet", arrived: "In Daet, before the tour", tour: "Tour in progress", ended: "Tour ended" } as const;

const MODE_CHIP: Record<Mode, { tone: BadgeTone; label: string }> = {
  precise: { tone: "success", label: "Live" },
  town: { tone: "warning", label: "Town only" },
  paused: { tone: "neutral", label: "Paused" },
  off: { tone: "neutral", label: "Not sharing" },
  updates: { tone: "info", label: "Tapped updates" },
};

/* ---------- Small pieces ---------- */

function Segmented<T extends string>({ name, legend, options, value, onChange }: { name: string; legend: string; options: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-daet-ink/70">{legend}</legend>
      <div className="flex flex-wrap gap-1 rounded-[1.5rem] bg-muted p-1">
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "flex min-h-11 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-3 text-sm font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600",
              value === option.id ? "bg-blue-600 text-white" : "text-daet-ink/75 hover:text-daet-ink",
            )}
          >
            <input type="radio" name={name} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ControlButton({ onClick, children, pressed, disabled, tone = "plain" }: { onClick: () => void; children: ReactNode; pressed?: boolean; disabled?: boolean; tone?: "plain" | "primary" | "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        tone === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
        tone === "danger" && "bg-red-600 text-white hover:bg-red-700",
        tone === "plain" && (pressed ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-muted text-daet-ink hover:bg-muted-strong"),
      )}
    >
      {children}
    </button>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
      {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" /> : <path d="M8 5l11 7-11 7z" />}
    </svg>
  );
}

function AlertCard({ alert, actions }: { alert: Alert; actions?: ReactNode }) {
  const tone = {
    danger: "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200",
    warning: "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-950 dark:text-yellow-100",
    info: "bg-muted text-daet-ink",
  }[alert.tone];
  return (
    <div role={alert.tone === "danger" ? "alert" : "status"} className={cn("rounded-2xl p-3", tone)}>
      <p className="flex items-center gap-2 text-sm font-bold">
        <LineIcon name={alert.tone === "info" ? "clock" : "warning"} className="h-4 w-4 shrink-0" />
        {alert.title}
      </p>
      <p className="mt-1 text-sm">{alert.body}</p>
      {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div aria-label={label} role="region" className="overflow-hidden rounded-[2.25rem] border-[10px] border-slate-900 bg-canvas dark:border-slate-700">
        <div className="flex items-center justify-between bg-surface px-5 pb-1 pt-2 text-xs font-bold text-daet-ink">
          <span>CONNECT-Daet</span>
          <span className="h-1.5 w-16 rounded-full bg-muted-strong" aria-hidden="true" />
        </div>
        <div className="h-[760px] overflow-y-auto">{children}</div>
      </div>
      <p className="mt-2 text-center text-sm text-daet-ink/70">{label}</p>
    </div>
  );
}

function GuestRow({ guest }: { guest: GuestView }) {
  const chip = MODE_CHIP[guest.mode];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-extrabold", guest.mode === "precise" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-muted-strong text-daet-ink")}>
        {guest.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-daet-ink">{guest.name}</span>
        <span className="block text-sm text-daet-ink/70">{guest.detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={chip.tone}>{chip.label}</Badge>
        {guest.checkedIn ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 dark:text-green-300">
            <LineIcon name="check" className="h-3.5 w-3.5" /> Checked in
          </span>
        ) : null}
      </span>
    </li>
  );
}

function markersFor(t: number, guests: GuestView[], opts: { guideLabel: string; self?: GuestId; showGuests: boolean }): MapMarker[] {
  const markers: MapMarker[] = [];
  // The guide goes first so guests standing next to them stay visible on top.
  const guide = guidePosition(t);
  if (guide && phaseAt(t) !== "travel") markers.push({ id: "guide", label: opts.guideLabel, position: guide, kind: "guide" });
  if (opts.showGuests) {
    for (const g of guests) {
      if (!g.position) continue;
      const kind = g.mode === "town" ? "town" : g.mode === "paused" ? "paused" : "guest";
      markers.push({ id: g.id, label: g.id === opts.self ? "You" : g.initials, position: g.position, kind });
    }
  } else if (opts.self) {
    const me = guests.find((g) => g.id === opts.self);
    if (me?.position) markers.push({ id: me.id, label: "You", position: me.position, kind: me.mode === "town" ? "town" : me.mode === "paused" ? "paused" : "guest" });
  }
  for (const g of guests) if (g.flare) markers.push({ id: `${g.id}-flare`, label: "!", position: g.flare, kind: "flare" });
  return markers;
}

function StopList({ t, onArrive }: { t: number; onArrive?: (stopFrom: number) => void }) {
  const current = stopIndexAt(t);
  const next = STOPS[current + 1];
  return (
    <div>
      <ol className="space-y-1">
        {STOPS.map((stop, i) => {
          const state = i < current || (i === current && t >= stop.to) ? "done" : i === current ? "here" : "next";
          return (
            <li key={stop.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold",
                  state === "done" && "bg-green-500 text-slate-950",
                  state === "here" && "bg-blue-600 text-white",
                  state === "next" && "bg-muted-strong text-daet-ink",
                )}
              >
                {state === "done" ? <LineIcon name="check" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className={cn("block font-bold", state === "next" ? "text-daet-ink/70" : "text-daet-ink")}>{stop.name}</span>
                <span className="block text-daet-ink/65">
                  {clockLabel(stop.from)}–{clockLabel(stop.to)}
                  {state === "here" ? " · here now" : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {onArrive && next && phaseAt(t) === "tour" ? (
        <button type="button" onClick={() => onArrive(next.from)} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-blue-50 text-sm font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40">
          <LineIcon name="pin" className="h-4 w-4" /> Arrived at stop {current + 2}
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Screens ---------- */

function GuideScreen({ t, variant, events, guests, alerts, setT, setEvents, readOnly = false }: ScreenProps & { readOnly?: boolean }) {
  const phase = phaseAt(t);
  const live = t >= T.guideLive && t < T.end;
  const markers = markersFor(t, guests, { guideLabel: readOnly ? "G" : "You", showGuests: true });
  const sharing = guests.filter((g) => g.mode === "precise" || g.mode === "town").length;
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-daet-ink">Daet heritage and Bagasbas</h3>
          <p className="text-sm text-daet-ink/70">BK-20261101-0042 (sample) · 3 guests</p>
        </div>
        {live ? (
          <Badge tone="danger" className="shrink-0">
            <span className="h-2 w-2 rounded-full bg-red-50 animate-pulse motion-reduce:animate-none" /> Live
          </Badge>
        ) : (
          <Badge className="shrink-0">{phase === "ended" ? "Ended" : `Live from ${clockLabel(T.guideLive)}`}</Badge>
        )}
      </div>

      {alerts.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          actions={
            readOnly ? null : alert.tone === "danger" ? (
              <>
                <span className="inline-flex min-h-9 items-center rounded-full bg-red-600 px-4 text-sm font-bold text-white">Call · 0917 000 0000</span>
                <button type="button" onClick={() => setEvents({ ...events, foundAt: t })} className="min-h-9 rounded-full bg-surface px-4 text-sm font-bold text-red-700 dark:text-red-300">
                  Mark as found
                </button>
              </>
            ) : alert.id === "drift" ? (
              <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-surface px-4 text-sm font-bold text-daet-ink">
                <LineIcon name="chat" className="h-4 w-4" /> Message Marco
              </span>
            ) : null
          }
        />
      ))}

      <SketchMap scale={mapScale(t)} markers={markers} activeStop={stopIndexAt(t)} title={`Map at ${clockLabel(t)}: ${markers.length} people shown`} />

      {phase === "travel" ? (
        <p className="rounded-2xl bg-surface p-3 text-sm text-daet-ink">
          Bus due in Daet at <strong>{clockLabel(T.busArrive)}</strong>, {durationLabel(T.busArrive - t)} from now. You meet them at the First José Rizal Monument at {clockLabel(T.meet)}.
        </p>
      ) : null}

      <section className="rounded-2xl bg-surface p-3">
        <h4 className="flex items-center justify-between text-sm font-bold text-daet-ink">
          Guests <span className="font-semibold text-daet-ink/70">{variant === "guide-only" ? "No locations" : `${sharing} of 3 sharing`}</span>
        </h4>
        <ul className="divide-y divide-line">
          {guests.map((g) => (
            <GuestRow key={g.id} guest={g} />
          ))}
        </ul>
      </section>

      {phase === "tour" || phase === "ended" ? (
        <section className="rounded-2xl bg-surface p-3">
          <h4 className="mb-1 text-sm font-bold text-daet-ink">Stops</h4>
          <StopList t={t} onArrive={readOnly ? undefined : (from) => setT(from)} />
        </section>
      ) : null}

      {readOnly ? null : phase === "ended" ? (
        <p className="rounded-2xl bg-green-50 p-3 text-sm font-semibold text-green-900 dark:bg-green-950/40 dark:text-green-200">Tour ended at {clockLabel(T.end)}. Live locations deleted for all guests.</p>
      ) : live ? (
        <ControlButton tone="danger" onClick={() => setT(T.end)}>
          End tour and stop sharing
        </ControlButton>
      ) : (
        <ControlButton tone="primary" onClick={() => setT(T.guideLive)}>
          Start live tour at {clockLabel(T.guideLive)}
        </ControlButton>
      )}
    </div>
  );
}

function TouristScreen({ t, variant, events, guests, setEvents, self }: ScreenProps & { self: GuestId }) {
  const phase = phaseAt(t);
  const me = guests.find((g) => g.id === self)!;
  const guide = guidePosition(t);
  const myTrue = me.position;
  const markers = markersFor(t, guests, { guideLabel: "G", self, showGuests: false });
  const separated = me.flare !== null;
  const stop = STOPS[stopIndexAt(t)];
  const nextStop = STOPS[stopIndexAt(t) + 1];

  const sharingCard = (() => {
    if (phase === "ended") return { tone: "bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-200", title: "Sharing stopped", body: "The tour ended. Your guide can no longer see your location, and it was deleted." };
    if (variant === "full") return { tone: "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-950 dark:text-yellow-100", title: "Your exact location is shared", body: "With your guide and Bagasbas Trails (sample operator), all trip long. You weren't asked." };
    if (variant === "guide-only") return { tone: "bg-muted text-daet-ink", title: "Your location isn't shared", body: "Tap an update below so your guide knows where you are." };
    if (me.mode === "precise") return { tone: "bg-blue-600 text-white", title: `Sharing with your guide until ${clockLabel(T.end)}`, body: "Your guide and the operator see where you are during the tour. It stops by itself when the tour ends." };
    if (me.mode === "town") return { tone: "bg-blue-600 text-white", title: "Sharing your trip, town only", body: `Your guide sees the nearest town and when you'll arrive, never your exact spot. Live sharing starts at ${clockLabel(T.meet)}.` };
    if (me.mode === "paused") return { tone: "bg-muted text-daet-ink", title: "Sharing paused", body: "Your phone locked or you left this page. Open it again to resume." };
    return null;
  })();

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-lg font-bold text-daet-ink">{phase === "travel" ? "Your trip to Daet" : phase === "ended" ? "Thanks for touring Daet" : "Your tour today"}</h3>
        <p className="text-sm text-daet-ink/70">Daet heritage and Bagasbas · guide Jun (sample)</p>
      </div>

      {sharingCard ? (
        <div className={cn("rounded-2xl p-4", sharingCard.tone)}>
          <p className="font-bold">{sharingCard.title}</p>
          <p className="mt-1 text-sm">{sharingCard.body}</p>
          {variant === "recommended" && (me.mode === "precise" || me.mode === "town") ? (
            <span className="mt-3 inline-flex min-h-10 items-center rounded-full bg-surface px-4 text-sm font-bold text-blue-700 dark:text-blue-300">Stop sharing</span>
          ) : null}
        </div>
      ) : null}

      {variant === "recommended" && me.mode === "off" && phase !== "ended" ? (
        <div className="rounded-2xl bg-surface p-4">
          <p className="font-bold text-daet-ink">{phase === "tour" ? "Share your location during the tour?" : "Share your trip with your guide?"}</p>
          <ul className="mt-2 space-y-1 text-sm text-daet-ink/80">
            <li>Who sees it: guide Jun and Bagasbas Trails only.</li>
            <li>{phase === "tour" ? "Your live spot, until the tour ends at 15:00." : "The nearest town and your arrival time. Not your exact spot."}</li>
            <li>Deleted when the tour ends. You can stop any time.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex min-h-10 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white">Share</span>
            <span className="inline-flex min-h-10 items-center rounded-full bg-muted px-4 text-sm font-bold text-daet-ink">Not now</span>
          </div>
          <p className="mt-2 text-xs text-daet-ink/65">In this demo {me.name.split(" ")[0]} chose “Not now”.</p>
        </div>
      ) : null}

      {phase === "travel" ? (
        <div className="rounded-2xl bg-surface p-4 text-sm text-daet-ink">
          <p>
            Arriving about <strong>{clockLabel(T.busArrive)}</strong>, in {durationLabel(T.busArrive - t)}.
          </p>
          <p className="mt-1">Meet your guide at the First José Rizal Monument, Rizal Park, at {clockLabel(T.meet)}.</p>
          {variant === "guide-only" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex min-h-10 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white">Left Manila</span>
              <span className="inline-flex min-h-10 items-center rounded-full bg-muted px-4 text-sm font-bold text-daet-ink">Arrived in Daet</span>
              <span className="inline-flex min-h-10 items-center rounded-full bg-muted px-4 text-sm font-bold text-daet-ink">Running late</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase !== "ended" ? <SketchMap scale={mapScale(t)} markers={markers} activeStop={stopIndexAt(t)} title={`Your map at ${clockLabel(t)}`} /> : null}

      {phase !== "travel" && phase !== "ended" ? (
        <div className="rounded-2xl bg-surface p-4 text-sm text-daet-ink">
          <p className="flex items-center gap-2 font-bold">
            <LineIcon name="guide" className="h-4 w-4" /> Where's my guide
          </p>
          <p className="mt-1">
            {guide
              ? myTrue && me.mode === "precise"
                ? `Jun is ${formatDistance(haversineMeters(myTrue, guide))} from you.`
                : `Jun is at ${stop && t < stop.to ? stop.name.replace(/, lunch.*$/, "") : "the meeting point"}.`
              : `Jun's location appears from ${clockLabel(T.guideLive)}.`}
          </p>
          {nextStop && phase === "tour" ? <p className="mt-1 text-daet-ink/70">Next: {nextStop.name} at {clockLabel(nextStop.from)}.</p> : null}
        </div>
      ) : null}

      {phase === "tour" ? (
        separated ? (
          <div role="status" className="rounded-2xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-bold">Your guide was told</p>
            <p className="mt-1">We sent Jun and the operator your location once. Stay where you are; Jun will call you.</p>
            <p className="mt-2 font-bold">Jun: 0917 000 0001 (sample)</p>
          </div>
        ) : (
          <ControlButton tone="danger" onClick={() => setEvents({ ...events, manualSeparated: { id: self, t } })}>
            <LineIcon name="warning" className="h-4 w-4" /> I'm separated from my group
          </ControlButton>
        )
      ) : null}
    </div>
  );
}

function OperatorScreen(props: ScreenProps) {
  const { t, alerts, variant } = props;
  const phase = phaseAt(t);
  const ours = phase === "ended" ? "Ended 15:00" : phase === "tour" ? `Stop ${stopIndexAt(t) + 1} of ${STOPS.length}` : phase === "arrived" ? "Guests in Daet" : `Bus due ${clockLabel(T.busArrive)}`;
  const sharing = props.guests.filter((g) => g.mode === "precise" || g.mode === "town").length;
  return (
    <div className="overflow-hidden rounded-2xl border-[10px] border-slate-900 bg-canvas dark:border-slate-700" role="region" aria-label="Operator desktop">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface px-5 py-3">
        <p className="font-bold text-daet-ink">Bagasbas Trails (sample operator) · Live now</p>
        <p className="text-sm text-daet-ink/70">{clockLabel(t)} · {OTHER_TOURS.length + 1} tours today</p>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <ul className="space-y-2" aria-label="Tours today">
          <li className="rounded-2xl bg-blue-50 p-3 dark:bg-blue-950/40">
            <p className="flex items-center justify-between gap-2 font-bold text-daet-ink">
              Daet heritage and Bagasbas {alerts.some((a) => a.tone !== "info") ? <Badge tone="danger" className="shrink-0 whitespace-nowrap">{alerts.filter((a) => a.tone !== "info").length} alert</Badge> : null}
            </p>
            <p className="text-sm text-daet-ink/75">Guide Jun · 3 guests · {ours}</p>
            <p className="text-sm text-daet-ink/75">{variant === "guide-only" ? "Guide only" : `${sharing} of 3 sharing`}</p>
          </li>
          {OTHER_TOURS.map((tour) => (
            <li key={tour.id} className="rounded-2xl bg-surface p-3">
              <p className="font-bold text-daet-ink">{tour.title}</p>
              <p className="text-sm text-daet-ink/75">
                Guide {tour.guide} · {tour.guests} guests · {phase === "tour" ? tour.status : "Starts later"}
              </p>
              <p className="text-sm text-daet-ink/75">{tour.sharing}</p>
            </li>
          ))}
        </ul>
        <div className="min-w-0">
          <SketchMap scale={mapScale(t)} markers={markersFor(t, props.guests, { guideLabel: "G", showGuests: true })} activeStop={stopIndexAt(t)} title={`Operator map at ${clockLabel(t)}`} />
          {phase === "tour" || phase === "ended" ? (
            <div className="mt-3 rounded-2xl bg-surface p-3">
              <StopList t={t} />
            </div>
          ) : null}
        </div>
        <div className="space-y-3">
          <section className="rounded-2xl bg-surface p-3">
            <h4 className="text-sm font-bold text-daet-ink">Alerts</h4>
            <div className="mt-2 space-y-2">
              {alerts.length ? alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />) : <p className="text-sm text-daet-ink/70">No alerts right now.</p>}
            </div>
          </section>
          <section className="rounded-2xl bg-surface p-3">
            <h4 className="text-sm font-bold text-daet-ink">Guests</h4>
            <ul className="divide-y divide-line">
              {props.guests.map((g) => (
                <GuestRow key={g.id} guest={g} />
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

type ScreenProps = {
  t: number;
  variant: Variant;
  events: Events;
  guests: GuestView[];
  alerts: Alert[];
  setT: (t: number) => void;
  setEvents: (e: Events) => void;
};

const WHO_SEES: Record<Variant, Array<[string, string]>> = {
  recommended: [
    ["Guide", "Their own dot, guests who share, check-ins, alerts."],
    ["Operator", "The same, read-only, for its own tours."],
    ["Tourist", `The guide's dot from ${clockLabel(T.guideLive)} until the tour ends.`],
    ["Kept", "Latest position only, no trail. Deleted when the tour ends."],
  ],
  "guide-only": [
    ["Guide", "Their own dot, check-ins and tapped updates."],
    ["Operator", "Each guide's dot and stop progress."],
    ["Tourist", "The guide's dot and the meeting point."],
    ["Kept", "No guest locations, except a one-time “I'm separated” pin."],
  ],
  full: [
    ["Guide", "Every guest, exact, from booking to the end."],
    ["Operator", "The same."],
    ["Tourist", "The guide's dot."],
    ["Kept", "A full location history unless deleted. Needs consent from every guest."],
  ],
};

/* ---------- Page ---------- */

export function LiveTrackingMockup() {
  const [t, setTState] = useState<number>(T.busArrive - 120);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]["id"]>("normal");
  const [variant, setVariant] = useState<Variant>("recommended");
  const [view, setView] = useState<View>("guide");
  const [self, setSelf] = useState<GuestId>("ana");
  const [events, setEventsState] = useState<Events>(NO_EVENTS);
  const last = useRef<number | null>(null);

  const setT = (value: number) => setTState(Math.min(T.end, Math.max(0, value)));
  const setEvents = (value: Events) => setEventsState(value);

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    const rate = SPEEDS.find((s) => s.id === speed)!.rate;
    let frame = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setTState((prev) => {
        const next = prev + dt * rate;
        if (next >= T.end) {
          setPlaying(false);
          return T.end;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const phase = phaseAt(t);
  const guests = GUESTS.map((g) => guestView(g, t, variant, events));
  const alerts = alertsAt(t, variant, events);
  const props: ScreenProps = { t, variant, events, guests, alerts, setT, setEvents };
  const variantNote = VARIANTS.find((v) => v.id === variant)!.note;

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="display-2 text-daet-ink">Live tour tracking</h1>
        <p className="mt-2 text-base text-daet-ink/80">
          A clickable mockup of how a guide and an operator could follow the guests they're assigned, from the overnight bus to Daet until the tour ends. Every name, time and booking here is a sample.
        </p>
      </div>

      <section aria-label="Preview controls" className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <ControlButton tone="primary" onClick={() => (t >= T.end ? (setT(0), setPlaying(true)) : setPlaying(!playing))}>
            <PlayIcon playing={playing} /> {playing ? "Pause" : t >= T.end ? "Replay" : "Play"}
          </ControlButton>
          <ControlButton
            onClick={() => {
              setPlaying(false);
              setT(0);
              setEvents(NO_EVENTS);
            }}
          >
            Restart
          </ControlButton>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold tabular-nums text-daet-ink" aria-live="off">
              {clockLabel(t)}
            </p>
            <p className="text-sm font-semibold text-daet-ink/70">{PHASE_LABEL[phase]}</p>
          </div>
        </div>

        <div>
          <label htmlFor="sim-time" className="sr-only">
            Time in the demo
          </label>
          <input id="sim-time" type="range" min={0} max={T.end} step={1} value={Math.round(t)} onChange={(e) => setT(Number(e.target.value))} className="w-full accent-blue-600" />
          <div className="mt-2 flex flex-wrap gap-2">
            {CHAPTERS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setT(c.t)}
                className={cn("min-h-9 rounded-full px-3 text-sm font-bold transition active:scale-[0.98]", Math.abs(t - c.t) < 3 ? "bg-blue-600 text-white" : "bg-muted text-daet-ink hover:bg-muted-strong")}
              >
                {c.label} <span className="font-semibold opacity-75">{clockLabel(c.t)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Segmented name="sim-speed" legend="Speed" options={SPEEDS.map(({ id, label }) => ({ id, label }))} value={speed} onChange={setSpeed} />
          <Segmented name="sim-view" legend="Screen" options={VIEWS} value={view} onChange={setView} />
          <Segmented name="sim-variant" legend="Option" options={VARIANTS.map(({ id, label }) => ({ id, label }))} value={variant} onChange={setVariant} />
        </div>
        <p className="text-sm text-daet-ink/80">
          <strong>{VARIANTS.find((v) => v.id === variant)!.label}:</strong> {variantNote}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-daet-ink/70">Try:</span>
          <ControlButton disabled={phase !== "tour"} onClick={() => setEvents({ ...events, manualSeparated: { id: "lia", t }, foundAt: null })}>
            Lia taps “I'm separated”
          </ControlButton>
          <ControlButton pressed={events.anaLockedAt !== null} disabled={phase === "ended"} onClick={() => setEvents({ ...events, anaLockedAt: events.anaLockedAt === null ? t : null })}>
            {events.anaLockedAt !== null ? "Unlock Ana's phone" : "Lock Ana's phone"}
          </ControlButton>
          {view === "tourist" ? (
            <Segmented
              name="sim-self"
              legend="Tourist"
              options={[
                { id: "ana", label: "Ana (shares)" },
                { id: "lia", label: "Lia (doesn't)" },
              ]}
              value={self}
              onChange={(v) => setSelf(v as GuestId)}
            />
          ) : null}
        </div>
      </section>

      <div className={cn("grid gap-6", view === "operator" ? "" : "lg:grid-cols-[380px_minmax(0,1fr)]")}>
        {view === "guide" ? (
          <PhoneFrame label="Guide's phone">
            <GuideScreen {...props} />
          </PhoneFrame>
        ) : view === "tourist" ? (
          <PhoneFrame label={`${self === "ana" ? "Ana" : "Lia"}'s phone`}>
            <TouristScreen {...props} self={self} />
          </PhoneFrame>
        ) : (
          <OperatorScreen {...props} />
        )}

        <div className={cn("grid content-start gap-4", view === "operator" && "md:grid-cols-2")}>
          <section className="rounded-2xl bg-surface p-5">
            <h2 className="text-lg font-bold text-daet-ink">What's happening at {clockLabel(t)}</h2>
            <ul className="mt-2 space-y-2 text-base text-daet-ink">
              {narrationAt(t, variant).map((line) => (
                <li key={line} className="flex gap-2">
                  <LineIcon name="arrowRight" className="mt-1 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl bg-surface p-5">
            <h2 className="text-lg font-bold text-daet-ink">Who sees what</h2>
            <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
              {WHO_SEES[variant].map(([who, what]) => (
                <div key={who} className="contents">
                  <dt className="font-bold text-daet-ink">{who}</dt>
                  <dd className="text-daet-ink/80">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-2xl bg-muted p-5 text-sm text-daet-ink">
            <h2 className="text-lg font-bold">Limits to know</h2>
            <ul className="mt-2 space-y-1.5">
              <li>A website can't share location while the phone is locked. Dots freeze and show “last seen”.</li>
              <li>On weak signal the last good position stays, with its time.</li>
              <li>Location is personal data under the Data Privacy Act of 2012, so guests opt in and can stop.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
