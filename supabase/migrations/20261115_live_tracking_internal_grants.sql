-- Live tracking: internal helpers are called only from the live RPCs, which
-- run as their owner. Supabase grants EXECUTE on new functions to the
-- authenticated role by default, so take it back for these. (Security
-- advisor 0029.) tours_live_can_watch stays: the read policies call it.
REVOKE EXECUTE ON FUNCTION
  public.tours_live_expire(uuid),
  public.tours_live_sweep(),
  public.tours_live_session_active(uuid),
  public.tours_live_snap_town(double precision, double precision),
  public.tours_live_distance_m(double precision, double precision, double precision, double precision)
FROM authenticated;
