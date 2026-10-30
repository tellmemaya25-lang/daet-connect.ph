-- Daet local guide directory: provisional seed (checked 2026-10-29).
-- Only entries found in public sources, each naming that source. None is
-- verified yet: the app shows them as "verify locally" until the Tourism
-- Office confirms them in /tours/admin/guide-places and /tours/admin/fares.
-- Prices from hotel sites were listed in US dollars and are converted at
-- about ₱58 per dollar, rounded; unknown prices are left empty on purpose.
-- Coordinates are left empty where no reliable pin was found: directions
-- then search Google Maps by name.

INSERT INTO public.tours_guide_places
  (kind, name, slug, municipality, address, latitude, longitude, price_min, price_max, price_unit, specialties, tags, description, source, checked_on)
VALUES
  ('terminal', 'Daet Central Terminal', 'daet-central-terminal', 'Daet', 'Daet, Camarines Norte', NULL, NULL, NULL, NULL, NULL, '{}', '{bus,van}',
   'Main stop for buses to and from Manila and UV Express vans from Naga.',
   'Wikivoyage, Daet (Feb 2025 edition)', '2026-10-29'),
  ('service', 'Camarines Norte Provincial Tourism Office', 'camarines-norte-tourism-office', 'Daet', 'Provincial Capitol, Daet, Camarines Norte', NULL, NULL, NULL, NULL, NULL, '{}', '{help,tourism}',
   'Travel information and assistance for the province. Ask here to confirm fares, boat schedules and permits.',
   'ivanhenares.com travel blog (2012), listing the office at the Provincial Capitol; phone numbers there are old, so confirm before calling', '2026-10-29'),
  ('eatery', 'Leo''s Cuisine', 'leos-cuisine', 'Daet', 'Bagasbas Boulevard, Bagasbas, Daet', NULL, NULL, NULL, NULL, NULL, '{}', '{beachfront}',
   'Restaurant on the Bagasbas beachfront.',
   'Wikivoyage, Daet (Feb 2025 edition)', '2026-10-29'),
  ('eatery', 'Kwadro Cafe', 'kwadro-cafe', 'Daet', 'Daet, Camarines Norte', NULL, NULL, NULL, NULL, NULL, '{}', '{cafe}',
   'Café in Daet.', 'Wikivoyage, Daet (Feb 2025 edition)', '2026-10-29'),
  ('eatery', 'Panulukan Restobar', 'panulukan-restobar', 'Daet', 'Daet, Camarines Norte', NULL, NULL, NULL, NULL, NULL, '{}', '{restobar}',
   'Restaurant and bar in Daet.', 'Wikivoyage, Daet (Feb 2025 edition)', '2026-10-29'),
  ('eatery', 'Bagasbas Beach eateries', 'bagasbas-beach-eateries', 'Daet', 'Along Bagasbas Beach, Daet', 14.1316, 122.9851, NULL, NULL, NULL, '{sinantolan,Bicol express}', '{beachfront,local food}',
   'A strip of restaurants and bars along the beach. Look for sinantolan (grated santol in coconut cream), a Bicol specialty.',
   '7641islands.ph, Bagasbas Beach guide', '2026-10-29'),
  ('lodging', 'Hotel Formosa', 'hotel-formosa', 'Daet', 'Daet town center', NULL, NULL, 2900, NULL, 'night', '{}', '{boutique,parking}',
   '16-room boutique hotel in central Daet, about 10 minutes from Bagasbas.',
   'Trip.com Daet hotel list (from about USD 50 a night)', '2026-10-29'),
  ('lodging', 'Asia Novo Boutique Hotel Daet', 'asia-novo-boutique-hotel-daet', 'Daet', 'Daet, Camarines Norte', NULL, NULL, 1300, NULL, 'night', '{}', '{boutique}',
   'Boutique hotel in Daet town.', 'Trip.com Daet hotel list (from about USD 23 a night)', '2026-10-29'),
  ('lodging', 'Dolor Hotel', 'dolor-hotel', 'Daet', 'Daet, Camarines Norte', NULL, NULL, 650, NULL, 'night', '{}', '{budget}',
   'Budget hotel in Daet town.', 'Trip.com Daet hotel list (from about USD 11 a night)', '2026-10-29'),
  ('lodging', 'Nathaniel Hotel', 'nathaniel-hotel', 'Daet', 'San Gregorio Village, Daet', NULL, NULL, NULL, NULL, NULL, '{}', '{breakfast,wifi,parking}',
   '3-star hotel with free breakfast, wifi and parking; Bagasbas is nearby.', 'Expedia hotel listing', '2026-10-29'),
  ('lodging', 'Camping at Bagasbas', 'camping-at-bagasbas', 'Daet', 'Bagasbas Beach, Daet', 14.1316, 122.9851, NULL, NULL, NULL, '{}', '{camping,budget}',
   'Rooms right on the beach are few; locals suggest a tent or hammock. Mobile signal can drop here.',
   '7641islands.ph, Bagasbas Beach guide', '2026-10-29')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.tours_fares
  (mode, from_name, to_name, fare_min, fare_max, fare_per, minutes_min, minutes_max, schedule_note, source, checked_on)
VALUES
  ('bus', 'Manila (PITX)', 'Daet', 801, 801, 'person', 540, 720, 'Daily DLTB trips from PITX, Cubao and Pasay; Superlines also runs Manila–Daet. Overnight trips are common.',
   'bustickets.ph DLTB Manila–Bicol schedule; 12go.com and rome2rio trip times', '2026-10-29'),
  ('van', 'Naga', 'Daet', NULL, NULL, 'person', 120, 150, 'UV Express vans to Daet Central Terminal. Naga (Pili) has the nearest commercial airport.',
   'Wikivoyage, Daet (Feb 2025 edition)', '2026-10-29'),
  ('tricycle', 'Daet town center', 'Bagasbas', 30, 30, 'person', 10, 15, 'Agree on the fare before you ride; special trips cost more.',
   'philippinebeaches.org Bagasbas travel tips', '2026-10-29'),
  ('boat', 'Paracale port', 'Calaguas', 3000, 7000, 'boat', 120, 150, 'Hired boat, usually for a group; prices in the source are from 2014 and vary with group size. Plus about ₱20–25 environmental fee per person.',
   's1expeditions.com Calaguas guide (2014) and lakwatsero.com reader reports', '2026-10-29'),
  ('boat', 'Vinzons', 'Calaguas', NULL, NULL, 'boat', 90, 120, 'Hire a banca at the Vinzons fish port; the price depends on the boat size.',
   'lakwatsero.com Calaguas DIY guide', '2026-10-29'),
  ('boat', 'Mercedes port', 'Apuao Grande', NULL, NULL, 'boat', 30, 45, 'Island-hopping boats from Mercedes port.',
   'CONNECT-Daet transport notes (provisional)', '2026-10-29')
ON CONFLICT (mode, lower(from_name), lower(to_name)) DO NOTHING;
