-- Pickup points (operator-typed fees) are retired: door pickup, priced by the
-- official fare, replaces them. Existing bookings keep their pickup_name and
-- pickup_fee. Turning the points off makes the booking trigger refuse them,
-- and operators can no longer save new ones.

UPDATE public.tours_package_pickup_points SET is_active = false WHERE is_active;

REVOKE EXECUTE ON FUNCTION public.tours_set_pickup_points(uuid, jsonb) FROM authenticated;
