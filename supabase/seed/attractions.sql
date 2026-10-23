-- Provisional Daet attractions (F6). Only places with a citable public
-- source are listed; every row keeps location_verified = false until the
-- Municipal Tourism Office confirms the pin, hours and fees. Unknown values
-- stay NULL rather than guessed. Load the full MTO list with the CSV import
-- on /tours/admin/attractions.
INSERT INTO public.tours_attractions
  (name, slug, category, description, municipality, address, latitude, longitude, opening_hours, hours_note, dwell_minutes, source)
VALUES
  ('First José Rizal Monument', 'first-rizal-monument', 'heritage',
   'The first monument built to honor José Rizal and the oldest surviving one in the country, unveiled on December 30, 1898 and declared a National Historical Landmark in 2008. Its coral stones came from an old Spanish prison.',
   'Daet', 'Rizal Park, cor. Justo Lukban and J.P. Rizal Sts., Daet', 14.113100, 122.954500, NULL, 'Open-air monument in Rizal Park.', 20,
   'Wikipedia: First José Rizal Monument (Daet) — coordinates and history'),
  ('Daet Heritage Center and Museum', 'daet-heritage-center', 'heritage',
   'Museum in the old municipal hall facing the Rizal Monument, with displays and relics on the history of Daet.',
   'Daet', 'Old municipal hall, Rizal Park, Daet', 14.113187, 122.954828,
   '{"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]]}'::jsonb,
   'Hours from a travel itinerary; confirm with the museum.', 45,
   'Trip.com Daet itinerary (Plus Code 4X73+7WG; Mon–Fri 08:00–17:00); Wikipedia (location facing the monument)'),
  ('Bagasbas Beach', 'bagasbas-beach', 'beach',
   'One of the oldest and most popular surfing spots in the Philippines, known for long waves and a safe sandy bottom; also a kitesurfing spot.',
   'Daet', 'Barangay Bagasbas, Daet', 14.131583, 122.985083, NULL, 'Public beach.', 180,
   'WannaKiteSurf spot listing (approx. 14°7.895''N 122°59.105''E); PhilAtlas (Barangay Bagasbas); Kupi travel guide'),
  ('Tinaga Island (Calaguas)', 'tinaga-island-calaguas', 'beach',
   'One of the two main islands of the Calaguas group, known for its long white-sand beach. Boat trips usually leave from Paracale.',
   'Vinzons', 'Calaguas Islands, Vinzons', 14.469200, 122.945000, NULL, 'Day trip by boat; check sea conditions.', 480,
   'PhilAtlas: Tinaga Island (approx. 14.4692, 122.9450); Lakwatsero Calaguas travel guide'),
  ('Canimog Island', 'canimog-island', 'nature',
   'Inhabited island of the Mercedes group with a lighthouse reached by 107 stone steps. About an hour by boat from the mainland.',
   'Mercedes', 'Mercedes Islands, Mercedes', 14.113600, 123.063700, NULL, 'Island hopping from Mercedes port.', 180,
   'PhilAtlas: Canimog Island (approx. 14.1136, 123.0637); TransitPinas trip report'),
  ('Apuao Grande Island', 'apuao-grande-island', 'beach',
   'Inhabited island of the Mercedes group, joined to Apuao Pequeña by a sandbar. The Mercedes waters host the easternmost population of the endangered Irrawaddy dolphin.',
   'Mercedes', 'Barangay Apuao, Mercedes', 14.082300, 123.104800, NULL, 'Island hopping from Mercedes port. Pin is the barangay centre.', 240,
   'PhilAtlas: Barangay Apuao (14.0823, 123.1048 — barangay centre, not the beach); Inquirer Lifestyle; Wikipedia: Mercedes, Camarines Norte'),
  ('Daet Elevated Town Plaza', 'daet-elevated-town-plaza', 'park',
   'Raised town plaza in central Daet, popular for an evening walk and sunset views.',
   'Daet', 'Town centre, Daet', NULL, NULL,
   '{"mon":[["00:00","24:00"]],"tue":[["00:00","24:00"]],"wed":[["00:00","24:00"]],"thu":[["00:00","24:00"]],"fri":[["00:00","24:00"]],"sat":[["00:00","24:00"]],"sun":[["00:00","24:00"]]}'::jsonb,
   'Open 24/7 per a travel itinerary.', 30,
   'Trip.com Daet itinerary (open 24/7). Location to be confirmed by the Tourism Office.'),
  ('Cathedral of the Most Holy Trinity', 'cathedral-most-holy-trinity', 'religious',
   'The cathedral church of Daet.',
   'Daet', 'Daet', NULL, NULL, NULL, 'Mass schedule to be confirmed.', 30,
   'Trip.com Daet attractions list. Location and schedule to be confirmed by the Tourism Office.')
ON CONFLICT (slug) DO NOTHING;
