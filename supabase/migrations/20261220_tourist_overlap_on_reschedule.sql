-- A tourist's overlap check also runs when a booking moves to another date.
-- Before this, it ran on INSERT only, so tours_reschedule_called_off() could
-- move a called-off trip onto a day the tourist already spends on another tour.
DROP TRIGGER IF EXISTS trg_tours_bookings_b_zz_tourist_time ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_b_zz_tourist_time
  BEFORE INSERT OR UPDATE OF tour_date, package_id ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_tourist_time_guard();
