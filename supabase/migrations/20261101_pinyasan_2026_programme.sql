-- 33rd Pinyasan Festival 2026: the day-by-day programme, transcribed from the
-- Municipality of Daet's "Calendar of Events" posters (four images).
--
-- The posters give start times only, so timed events end when they start
-- (the app then shows the start time alone). Multi-day events without a time
-- run from the first day's 00:00 to the last day's 23:59. The poster labels
-- June 24 "Sunday"; June 24, 2026 is a Wednesday, so the date is used.
-- Safe to re-run: rows from this source are replaced.

DO $$
DECLARE
  v_source constant text := '33rd Pinyasan Festival 2026 calendar of events (Municipality of Daet posters)';
  v_bagasbas uuid := (SELECT id FROM public.tours_attractions WHERE name ILIKE 'Bagasbas Beach%' ORDER BY name LIMIT 1);
BEGIN
  DELETE FROM public.tours_events WHERE source = v_source;

  INSERT INTO public.tours_events (title, category, venue, starts_at, ends_at, organizer, source, description, is_published, attraction_id)
  SELECT e.title, e.category, e.venue, e.starts_at::timestamptz, COALESCE(e.ends_at, e.starts_at)::timestamptz,
         'Municipality of Daet', v_source, e.description, true,
         CASE WHEN e.venue ILIKE '%Bagasbas Beach%' THEN v_bagasbas END
  FROM (VALUES
    -- June 15 (Monday)
    ('Thanksgiving Mass', 'religious', 'Daet Municipal Covered Court', '2026-06-15 07:00+08', NULL, 'Opening day of the 33rd Pinyasan Festival.'),
    ('Flag Raising Ceremony and Opening Program', 'cultural', 'Daet Municipal Covered Court', '2026-06-15 08:00+08', NULL, 'From 8:00 AM onwards.'),
    ('Penlight Parade', 'cultural', 'Downtown Daet', '2026-06-15 18:00+08', NULL, 'From 6:00 PM onwards.'),
    ('Pineapple Lighting Ceremony', 'festival', 'Pineapple Marker, Elevated Plaza', '2026-06-15 19:00+08', NULL, NULL),
    -- June 15–24
    ('Maogmang Beer Plaza sa Pinyasan', 'market', 'J. P. Rizal St., Magallanes–Iraya St., in front of DBP', '2026-06-15 00:00+08', '2026-06-24 23:59+08', 'Every day of the festival, June 15 to 24.'),
    ('Maogmang Pinyasan Trade Fair', 'market', 'J. P. Rizal St., Magallanes–Iraya St., in front of Daet Heritage Center', '2026-06-15 00:00+08', '2026-06-24 23:59+08', 'Every day of the festival, June 15 to 24.'),
    ('Maogmang Pinyasan Bazaar', 'market', 'Moreno St., Elevated Plaza', '2026-06-15 00:00+08', '2026-06-24 23:59+08', 'Every day of the festival, June 15 to 24.'),
    -- June 16 (Tuesday)
    ('Berry Barley Maogmang Arm Wrestling', 'sports', 'SM City Daet', '2026-06-16 10:00+08', NULL, NULL),
    -- June 17 (Wednesday)
    ('Kasalang Bayan sa Maogmang Pinyasan', 'other', 'Bluerock Events', '2026-06-17 10:00+08', NULL, 'Mass wedding.'),
    ('Hataw mga Tugang: Sayaw ng Kabataan sa Maogmang Pinyasan', 'cultural', 'Daet Municipal Covered Court', '2026-06-17 19:00+08', NULL, 'Youth dance.'),
    ('Awarding of the Top 10 Most Outstanding Tricycle Drivers and TODA', 'other', 'Bluerock Events', '2026-06-17 19:00+08', NULL, NULL),
    -- June 18 (Thursday)
    ('Maogmang Pinyasan Job Fair', 'other', 'SM City Daet', '2026-06-18 10:00+08', NULL, 'From 10:00 AM onwards.'),
    ('Pinyasan Souvenir Making Contest', 'cultural', 'SM City Daet, Active Hub', '2026-06-18 13:00+08', NULL, NULL),
    ('Maogmang Pinyasan Grand Festival Inter-Town Zumba Competition', 'sports', 'Pineapple Marker, Elevated Plaza', '2026-06-18 15:00+08', NULL, NULL),
    -- June 19 (Friday)
    ('Maogmang Pinyasan Padyak Race', 'sports', 'Lifeguard Station, Bagasbas Beach', '2026-06-19 06:00+08', NULL, NULL),
    ('Pinya Delights Challenge', 'cultural', 'SM City Daet, Active Hub', '2026-06-19 13:00+08', NULL, NULL),
    ('Tertulia de Daet', 'cultural', 'Municipal Hall Covered Court', '2026-06-19 15:00+08', NULL, NULL),
    ('Maogmang Bagasbas Beach Rave Party', 'festival', 'Bagasbas Beach', '2026-06-19 19:00+08', NULL, 'Night 1 of 2 (June 19 and 20).'),
    -- June 20 (Saturday)
    ('Maogmang Paraw Regatta sa Pinyasan', 'sports', 'Bagasbas Beach', '2026-06-20 06:00+08', NULL, 'Sailboat race.'),
    ('Maogmang Pinyasan Laro ng Lahi Beach Edition', 'sports', 'Bagasbas Beach', '2026-06-20 07:00+08', NULL, 'Traditional Filipino games on the beach.'),
    ('Maogmang Pinyasan Sepak Takraw', 'sports', 'Gregorio Pimentel Memorial School', '2026-06-20 07:00+08', NULL, NULL),
    ('Maogmang Pinyasan Pickleball', 'sports', 'Courtside Amore', '2026-06-20 08:00+08', NULL, NULL),
    ('Padagos Lang sa Maogmang Darts (50K Pinyasan Dart Tournament)', 'sports', 'Hashtag Restobar', '2026-06-20 08:00+08', NULL, NULL),
    ('Maogmang Kasalang Barangay', 'other', 'Mantagbac Elementary School', '2026-06-20 09:00+08', NULL, NULL),
    ('Pinyasan Chess Tournament', 'sports', 'SM City Daet, Cyberzone', '2026-06-20 10:00+08', NULL, 'Day 1 of 2 (June 20 and 21).'),
    ('Maogmang Bagasbas Beach Rave Party', 'festival', 'Bagasbas Beach', '2026-06-20 19:00+08', NULL, 'Night 2 of 2 (June 19 and 20).'),
    ('Maogmang Pinyasan Motor Trike Show', 'other', 'Pineapple Marker, Elevated Plaza', '2026-06-20 19:00+08', NULL, NULL),
    -- June 21 (Sunday)
    ('Maogmang Pinyasan Duathlon Challenge', 'sports', 'SM City Parking Grounds', '2026-06-21 06:00+08', NULL, NULL),
    ('Maogmang Daet Pinyasan Festival Palengke-lympics: Laro ng Lahi Market Edition', 'sports', 'Felipe II St.', '2026-06-21 08:00+08', NULL, 'Traditional Filipino games at the market.'),
    ('Maogmang Pinyasan Circuit Clash Tamiya Mini 4WD Competition', 'sports', 'Daet Municipal Covered Court', '2026-06-21 08:00+08', NULL, NULL),
    ('Pinyasan Chess Tournament', 'sports', 'SM City Daet, Cyberzone', '2026-06-21 10:00+08', NULL, 'Day 2 of 2 (June 20 and 21).'),
    ('Maogmang Zumbayugyog sa Pinyasan', 'sports', 'Pineapple Marker, Elevated Plaza', '2026-06-21 17:00+08', NULL, NULL),
    ('Star Millenium Talents: Music, Dance, and Style', 'cultural', 'CamNorte Bazaar, San Vicente Rd., Brgy. Lag-on, Daet', '2026-06-21 17:00+08', NULL, 'A Festival of Legacy and Love for Fathers in Pinyasan.'),
    -- June 22 (Monday)
    ('Maogmang Pinyasan Tricycle Float Competition', 'cultural', 'Pineapple Marker, Elevated Plaza', '2026-06-22 15:00+08', NULL, NULL),
    ('Maogmang Pinyasan Drum and Lyre Parade Competition', 'cultural', 'Pineapple Marker, Elevated Plaza', '2026-06-22 15:00+08', NULL, NULL),
    -- June 23 (Tuesday)
    ('Maogmang Pinyasan Fiesta Vibes (Celebrity Night)', 'festival', 'Pineapple Marker, Elevated Plaza', '2026-06-23 19:00+08', NULL, 'From 7:00 PM onwards.'),
    -- June 24 (Wednesday; the poster says Sunday)
    ('Viva San Juan Bautista: Daet Town Fiesta', 'religious', 'Daet', '2026-06-24 00:00+08', '2026-06-24 23:59+08', 'Feast of St. John the Baptist, patron of Daet.'),
    ('Maogmang Barangay Night', 'festival', 'Daet Municipal Covered Court', '2026-06-24 19:00+08', NULL, NULL),
    -- June 28
    ('Pinyasan Runway Fashion Show V: Eco-Fashion and Sustainability', 'cultural', 'SM City Daet', '2026-06-28 15:00+08', NULL, NULL)
  ) AS e(title, category, venue, starts_at, ends_at, description);

  -- The festival-wide entry now points to the day-by-day programme.
  UPDATE public.tours_events
     SET title = '33rd Pinyasan Festival 2026',
         description = 'Daet''s pineapple festival, held with the town fiesta of St. John the Baptist, June 15 to 24. The day-by-day programme is on the calendar: races and games at Bagasbas Beach, parades and nightly shows at the Pineapple Marker on the Elevated Plaza, and the trade fair, bazaar and beer plaza downtown.'
   WHERE title = 'Pinyasan Festival 2026' AND starts_at = '2026-06-15 00:00+08';
END $$;
