"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type LiveSession = Tables<"tours_live_sessions">;
export type LivePosition = Tables<"tours_live_positions">;
export type LiveFlare = Tables<"tours_live_flares">;
export type LiveConsent = Tables<"tours_live_consents">;
export type LiveWindow = { opens: string; closes: string; trip_opens: string };

export type LiveBookingState = {
  loading: boolean;
  session: LiveSession | null;
  positions: LivePosition[];
  flares: LiveFlare[];
  consents: LiveConsent[];
  window: LiveWindow | null;
  error: string | null;
};

const EMPTY: LiveBookingState = { loading: true, session: null, positions: [], flares: [], consents: [], window: null, error: null };
/** Fallback refresh in case a Realtime signal is missed. */
const REFRESH_MS = 30_000;

/**
 * Everything live about one booking, read through RLS (each viewer sees only
 * what they may). Re-reads when the database's private "changed" signal
 * arrives on tour-live:<booking id>, and every 30 s.
 */
export function useLiveBooking(bookingId: string): LiveBookingState & { refresh: () => void } {
  const [state, setState] = useState<LiveBookingState>(EMPTY);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const supabase = (supabaseRef.current ??= createSupabaseBrowserClient());
    const [session, positions, flares, consents, win] = await Promise.all([
      supabase.from("tours_live_sessions").select("*").eq("booking_id", bookingId).maybeSingle(),
      supabase.from("tours_live_positions").select("*").eq("booking_id", bookingId),
      supabase.from("tours_live_flares").select("*").eq("booking_id", bookingId).is("resolved_at", null).order("created_at", { ascending: false }),
      supabase.from("tours_live_consents").select("*").eq("booking_id", bookingId),
      supabase.rpc("tours_live_window", { p_booking_id: bookingId }),
    ]);
    const failed = [session, positions, flares, consents].find((r) => r.error);
    const windowRow = Array.isArray(win.data) ? win.data[0] : win.data;
    setState({
      loading: false,
      session: session.data ?? null,
      positions: positions.data ?? [],
      flares: flares.data ?? [],
      consents: consents.data ?? [],
      window: (windowRow as LiveWindow | null) ?? null,
      error: failed ? "Live details couldn't load. Retrying…" : null,
    });
  }, [bookingId]);

  const refresh = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    // Several rows change together (end of tour); read once.
    timer.current = window.setTimeout(() => void load(), 250);
  }, [load]);

  useEffect(() => {
    void load();
    const supabase = (supabaseRef.current ??= createSupabaseBrowserClient());
    const channel = supabase.channel(`tour-live:${bookingId}`, { config: { private: true } }).on("broadcast", { event: "changed" }, refresh).subscribe();
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      if (timer.current) window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [bookingId, load, refresh]);

  return { ...state, refresh };
}
