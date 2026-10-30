-- Guide directory refresh, checked 2026-10-30. Idempotent: run any time.
-- Rows stay verified = false: these are still web sources, not local checks.
-- Only rows with a newer or clearer source change; nothing is invented.

-- Manila -> Daet bus: a 2026 fare listing shows higher fares than the old ₱801.
UPDATE public.tours_fares
SET fare_min = 801, fare_max = 1084,
    schedule_note = 'DLTB from PITX, Cubao and Pasay; Superlines also runs Manila–Daet. Recent listings: about ₱980 regular and ₱1,084 Greyhound from Cubao; older listings ₱801. Overnight trips are common.',
    source = 'pamasahe.com DLTB Manila–Camarines Norte fares (2026 listing); bustickets.ph DLTB schedule (₱801, undated); rome2rio trip times',
    checked_on = '2026-10-30'
WHERE mode = 'bus' AND lower(from_name) = lower('Manila (PITX)') AND lower(to_name) = 'daet';

-- Paracale -> Calaguas: the newest published rates are still from 2014–2017 guides.
UPDATE public.tours_fares
SET schedule_note = 'Hired boat for a group, overnight. Published rates (2014–2017 guides): about ₱3,000 for 6, ₱5,000 for 10, ₱6,500 for 15 people; expect higher now. Plus an environmental fee (₱25 per person in 2014).',
    source = 'lakwatsero.com Calaguas travel guide (rates updated to about 2017); s1expeditions.com guide (2014)',
    checked_on = '2026-10-30'
WHERE mode = 'boat' AND lower(from_name) = lower('Paracale port') AND lower(to_name) = 'calaguas';

-- Daet -> Bagasbas tricycle: the only published fare is from 2018.
UPDATE public.tours_fares
SET schedule_note = 'About ₱30 one way in 2018; likely higher now. Agree on the fare before you ride; special trips cost more.',
    source = 'philippinebeaches.org Bagasbas travel tips (2018)',
    checked_on = '2026-10-30'
WHERE mode = 'tricycle' AND lower(from_name) = lower('Daet town center') AND lower(to_name) = 'bagasbas';

-- Tourism office: a 2023 PIA article names it the Provincial Tourism Operations Office.
UPDATE public.tours_guide_places
SET description = 'Provincial tourism office (called the Provincial Tourism Operations Office in 2023). Ask here to confirm fares, boat schedules and permits. No current phone number was found online; ask at the Provincial Capitol.',
    source = 'Philippine Information Agency, Bantayog Festival article (May 2023); ivanhenares.com (2012) for the Capitol location',
    checked_on = '2026-10-30'
WHERE slug = 'camarines-norte-tourism-office';
