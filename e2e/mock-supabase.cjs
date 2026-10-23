/**
 * Mock Supabase (Auth + PostgREST subset) for the tours E2E suite.
 *
 * The role comes from the access token in each request ("e2e-<role>", set by
 * e2e/fixtures.ts), so one server serves every role. Filters: only `eq.` on
 * top-level columns and `count=exact`; enough for the pages under test.
 * Data is a fixed Daet scenario (one operator, one guide, one tourist).
 */
const http = require("http");
const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54329);
const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function build(role) {
const BID = "e9466de5-4877-47c1-ac14-d86deeb38b9e";
  const operator = { id: "op-1", profile_id: "9b7e5a5e-0000-4000-8000-000000000001", business_name: "Bagasbas Coast Tours", accreditation_status: "approved", accreditation_notes: null, contact_phone: "0917 555 0101", gcash_number: "0917 555 0101", gcash_name: "Maya Santos", bank_name: "BPI", bank_account_number: "1234-5678-90", bank_account_name: "Bagasbas Coast Tours", payment_instructions: "Please include your booking reference in the notes.", created_at: "2026-01-01T00:00:00Z" };
  const PKG = "aa000000-0000-4000-8000-000000000001";
  const pkg = { id: PKG, status: "published", description: "Learn to surf at sunrise.", tours_package_price_variants: [{ id: "v1", variant_name: "Standard", price_per_pax: 466, flat_price: null, min_pax: 1, max_pax: 8, is_default: true }], title: "Bagasbas Sunrise Surf Lesson", location_name: "Bagasbas Beach", duration_value: 3, duration_type: "hours", cover_image_url: null, operator_id: "op-1", tours_operators: operator };
  const booking = { id: BID, package_id: PKG, user_id: "9b7e5a5e-0000-4000-8000-000000000001", booking_reference: "BK-20261023-7F3K2Q", tour_date: TODAY, number_of_pax: 3, price_per_pax: 466, total_amount: 1398, total_paid: 500, payment_status: "partial", status: "confirmed", contact_name: "Juan Dela Cruz", contact_email: "juan@example.ph", contact_phone: "0918 222 3344", special_requests: null, assigned_guide_id: null, created_at: "2026-10-20T03:00:00Z", tours_packages: pkg };
  const payments = [
    { id: "pay-a", booking_id: BID, amount: 500, payment_method: "gcash", provider: "paymongo", provider_method: "gcash", reference_number: "BK-20261023-7F3K2Q", payment_date: "2026-10-21T02:15:00Z", payment_status: "completed", notes: "PayMongo checkout cs_abc", tours_bookings: { booking_reference: "BK-20261023-7F3K2Q", contact_name: "Juan Dela Cruz", tours_packages: pkg } },
    { id: "pay-b", booking_id: "other", amount: 2400, payment_method: "cash", provider: "manual", provider_method: null, reference_number: null, payment_date: "2026-10-12T08:00:00Z", payment_status: "completed", notes: null, tours_bookings: { booking_reference: "BK-20261010-Q2W9E1", contact_name: "Ana Reyes", tours_packages: { title: "Heritage Walk: Daet Poblacion", operator_id: "op-1" } } },
    { id: "pay-c", booking_id: "other2", amount: 1650.5, payment_method: "credit_card", provider: "paymongo", provider_method: "card", reference_number: "BK-20261015-ZX81PL", payment_date: "2026-10-16T11:30:00Z", payment_status: "completed", notes: null, tours_bookings: { booking_reference: "BK-20261015-ZX81PL", contact_name: "Mark O'Neil", tours_packages: { title: "Calaguas Island Day Trip", operator_id: "op-1" } } },
  ];
  const proofs = [
    { id: "11111111-2222-4333-8444-555555555555", booking_id: BID, amount: 898, payment_method: "gcash", reference_number: "1009 234 5678", verification_status: "pending", rejection_reason: null, submitted_at: "2026-10-22T09:00:00Z", proof_image_url: `${BID}/x.png` },
    { id: "66666666-2222-4333-8444-555555555555", booking_id: BID, amount: 898, payment_method: "bank_transfer", reference_number: "BPI-77812", verification_status: "rejected", rejection_reason: "Amount not received in our BPI account yet.", submitted_at: "2026-10-21T09:00:00Z", proof_image_url: `${BID}/y.png` },
  ];
  const cancelled = { ...booking, id: "c9466de5-4877-47c1-ac14-d86deeb38b9f", booking_reference: "BK-20261018-LM44RT", status: "cancelled", total_paid: 500, payment_status: "partial", cancellation_reason: "Typhoon signal no. 2 raised for Camarines Norte." };
  const availability = [
    { id: "a1000000-0000-4000-8000-000000000001", package_id: PKG, available_date: "2026-11-07", capacity_total: 10, capacity_booked: 3 },
    { id: "a1000000-0000-4000-8000-000000000002", package_id: PKG, available_date: "2026-11-08", capacity_total: 10, capacity_booked: 0 },
    { id: "a1000000-0000-4000-8000-000000000003", package_id: PKG, available_date: "2026-11-14", capacity_total: 6, capacity_booked: 6 },
    { id: "a1000000-0000-4000-8000-000000000004", package_id: PKG, available_date: "2026-11-15", capacity_total: 6, capacity_booked: 2 },
  ];
  const cancellations = role === "operator" ? [{ id: "cc000000-0000-4000-8000-000000000001", booking_id: BID, reason: "My flight to Naga was moved to the next day.", requested_at: "2026-11-05T22:00:00Z", status: "requested", admin_notes: null }] : [];
  if (role === "guide") { booking.user_id = "other-tourist"; booking.assigned_guide_id = "f66b1fe2-a997-4c0b-be13-22d62cf0dba6"; booking.tours_checkins = []; }
  const guides = [{ id: "f66b1fe2-a997-4c0b-be13-22d62cf0dba6", profile_id: "9b7e5a5e-0000-4000-8000-000000000001", accreditation_status: "approved", reviewed_at: "2026-10-16T13:18:25Z", updated_at: "2026-10-16T13:18:25Z", created_at: "2026-10-01T00:00:00Z", accreditation_notes: null }];
  const participants = [
    { id: "p1000000-0000-4000-8000-000000000001", booking_id: BID, full_name: "Juan Dela Cruz", age: 34, special_requirements: null, created_at: "2026-10-20T03:00:00Z" },
    { id: "p1000000-0000-4000-8000-000000000002", booking_id: BID, full_name: "Ana Dela Cruz", age: 31, special_requirements: "Vegetarian lunch", created_at: "2026-10-20T03:00:01Z" },
    { id: "p1000000-0000-4000-8000-000000000003", booking_id: BID, full_name: "Leo Dela Cruz", age: 9, special_requirements: "Needs a child life vest", created_at: "2026-10-20T03:00:02Z" },
  ];
  const checkins = [{ booking_id: BID, participant_id: "p1000000-0000-4000-8000-000000000002", method: "manual", scanned_at: new Date().toISOString() }];
  const CONV = "cc110000-0000-4000-8000-000000000001";
  const OPP = "0b7e5a5e-0000-4000-8000-0000000000aa";
  const conversation = { id: CONV, booking_id: BID, tours_bookings: { ...booking, tours_guides: { profile_id: "9b7e5a5e-0000-4000-8000-0000000000bb" }, tours_packages: { title: pkg.title, tours_operators: { profile_id: OPP, business_name: "Bagasbas Coast Tours" } } } };
  const t0 = Date.now() - 3 * 3600 * 1000;
  const at = (m) => new Date(t0 + m * 60000).toISOString();
  const messages = [
    { id: "m1", conversation_id: CONV, sender_id: booking.user_id, message_text: "Hi! Is hotel pickup included? We're staying near Bagasbas Beach.", attachment_url: null, created_at: at(0) },
    { id: "m2", conversation_id: CONV, sender_id: OPP, message_text: "Hello Juan! Yes, pickup is free within Daet. We'll be at your hotel lobby at 5:30 AM.", attachment_url: null, created_at: at(12) },
    { id: "m3", conversation_id: CONV, sender_id: "9b7e5a5e-0000-4000-8000-0000000000bb", message_text: "Hi, I'm your guide for the surf lesson. Bring sunscreen and a change of clothes 🏄", attachment_url: null, created_at: at(40) },
    { id: "m4", conversation_id: CONV, sender_id: booking.user_id, message_text: "Perfect, thank you! See you tomorrow.", attachment_url: null, created_at: at(55) },
  ];
  const inbox = [
    { conversation_id: CONV, booking_reference: booking.booking_reference, package_title: pkg.title, tour_date: booking.tour_date, tourist_name: "Juan Dela Cruz", last_message_at: at(55), last_message: "Perfect, thank you! See you tomorrow.", last_sender_id: booking.user_id, unread: 0 },
    { conversation_id: "cc110000-0000-4000-8000-000000000002", booking_reference: "BK-20261019-HH21KD", package_title: "Calaguas Island Day Trip", tour_date: "2026-11-14", tourist_name: "Juan Dela Cruz", last_message_at: at(-600), last_message: "Your booking is confirmed! Boat leaves Vinzons port at 6 AM.", last_sender_id: OPP, unread: 2 },
  ];
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const notifications = [
    { id: "n1", profile_id: booking.user_id, type: "booking_confirmed", title: "Booking confirmed", body: "Bagasbas Sunrise Surf Lesson on Oct 24, 2026 is confirmed. Your ticket QR is ready.", link: `/tours/bookings/${BID}`, read_at: null, created_at: ago(3) },
    { id: "n2", profile_id: booking.user_id, type: "message", title: "New message · Bagasbas Sunrise Surf Lesson", body: "Hello Juan! Yes, pickup is free within Daet.", link: "/tours/messages/cc110000-0000-4000-8000-000000000001", read_at: null, created_at: ago(25) },
    { id: "n3", profile_id: booking.user_id, type: "guide_assigned", title: "Your guide is assigned", body: "A local guide will lead Bagasbas Sunrise Surf Lesson on Oct 24, 2026.", link: `/tours/bookings/${BID}`, read_at: ago(60), created_at: ago(90) },
    { id: "n4", profile_id: booking.user_id, type: "payment_received", title: "Payment received", body: "₱500.00 for Bagasbas Sunrise Surf Lesson (BK-20261023-7F3K2Q).", link: `/tours/bookings/${BID}`, read_at: ago(1000), created_at: ago(1500) },
  ];
  const office = {"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]]};
  const allDay = Object.fromEntries(["mon","tue","wed","thu","fri","sat","sun"].map((d) => [d, [["00:00","24:00"]]]));
  const A = (id, name, slug, category, municipality, lat, lng, hours, dwell, description, source, verified = false) => ({ id: `a0000000-0000-4000-8000-00000000000${id}`, name, slug, category, description, municipality, address: null, latitude: lat === null ? null : String(lat), longitude: lng === null ? null : String(lng), location_verified: verified, opening_hours: hours, hours_note: null, dwell_minutes: dwell, entrance_fee: null, photo_url: null, source, is_active: true });
  const attractions = [
    A(1, "First José Rizal Monument", "first-rizal-monument", "heritage", "Daet", 14.1131, 122.9545, null, 20, "The first monument built to honor José Rizal and the oldest surviving one in the country, unveiled on December 30, 1898.", "Wikipedia: First José Rizal Monument (Daet)"),
    A(2, "Daet Heritage Center and Museum", "daet-heritage-center", "heritage", "Daet", 14.113187, 122.954828, office, 45, "Museum in the old municipal hall facing the Rizal Monument.", "Trip.com Daet itinerary (Plus Code 4X73+7WG)"),
    A(3, "Bagasbas Beach", "bagasbas-beach", "beach", "Daet", 14.131583, 122.985083, null, 180, "One of the oldest and most popular surfing spots in the Philippines.", "WannaKiteSurf; PhilAtlas"),
    A(4, "Tinaga Island (Calaguas)", "tinaga-island-calaguas", "beach", "Vinzons", 14.4692, 122.945, null, 480, "One of the two main islands of the Calaguas group.", "PhilAtlas: Tinaga Island"),
    A(5, "Canimog Island", "canimog-island", "nature", "Mercedes", 14.1136, 123.0637, null, 180, "Island with a lighthouse reached by 107 stone steps.", "PhilAtlas: Canimog Island"),
    A(6, "Daet Elevated Town Plaza", "daet-elevated-town-plaza", "park", "Daet", null, null, allDay, 30, "Raised town plaza in central Daet.", "Trip.com Daet itinerary"),
  ];
  pkg.tours_package_stops = [
    { id: "s1", location_name: "First José Rizal Monument", description: "Meet at Rizal Park.", latitude: "14.113100", longitude: "122.954500", stop_order: 0 },
    { id: "s2", location_name: "Daet Heritage Center", description: null, latitude: "14.113187", longitude: "122.954828", stop_order: 1 },
    { id: "s3", location_name: "Bagasbas Beach", description: "Surf lesson.", latitude: "14.131583", longitude: "122.985083", stop_order: 2 },
  ];
  pkg.tours_package_inclusions = []; pkg.tours_package_gallery = []; pkg.tours_operators = [operator];
  booking.status = booking.status;
  const rv = (id, rating, comment, extra = {}) => ({ id, booking_id: "b-" + id, package_id: PKG, operator_id: "op-1", rating, comment, created_at: "2026-10-1" + (id.length % 9) + "T05:00:00Z", operator_reply: null, replied_at: null, is_hidden: false, hidden_reason: null, tours_packages: { title: pkg.title }, tours_operators: { business_name: "Bagasbas Coast Tours" }, tours_bookings: { booking_reference: "BK-2026101" + (id.length % 9) + "-AB12CD", tour_date: "2026-10-10" }, ...extra });
  const reviews = [
    rv("r1", 5, "Coach Mark was patient and I stood up on my third wave! Boards were in good shape and they had rash guards for all of us.", { operator_reply: "Salamat po! See you on the next swell.", replied_at: "2026-10-18T09:00:00Z" }),
    rv("r22", 4, "Great lesson, but start was 20 minutes late."),
    rv("r333", 5, null),
    rv("r4444", 1, "Spam text with a phone number 0999...", { is_hidden: role !== "anon", hidden_reason: "Advertising, not about the tour" }),
  ];
  
  const visible = reviews.filter((r) => !r.is_hidden);
  const ratingRow = { package_id: PKG, operator_id: "op-1", review_count: visible.length, average_rating: (visible.reduce((a, r) => a + r.rating, 0) / visible.length).toFixed(2) };
  booking.assigned_guide_id = "f66b1fe2-a997-4c0b-be13-22d62cf0dba6";
  const addDays = (n) => { const d = new Date(TODAY + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const later = { ...booking, id: "b-later", booking_reference: "BK-20261101-LT55AA", tour_date: addDays(5), status: "confirmed", payment_status: "unpaid", total_paid: 0, number_of_pax: 2, total_amount: 932, contact_name: "Ana Reyes" };
  const pendingB = { ...booking, id: "b-pend", booking_reference: "BK-20261102-PN11ZZ", tour_date: addDays(9), status: "pending", payment_status: "unpaid", total_paid: 0, number_of_pax: 4, total_amount: 1864, contact_name: "Mark O'Neil" };
  const doneB = { ...booking, id: "b-done", booking_reference: "BK-20261001-DN88QQ", tour_date: addDays(-12), status: "completed", payment_status: "paid", total_paid: 1398 };
  const guideAvailability = [
    { guide_id: guides[0].id, available_date: addDays(1), is_available: true },
    { guide_id: guides[0].id, available_date: addDays(2), is_available: true },
    { guide_id: guides[0].id, available_date: addDays(4), is_available: false },
  ];
  const itineraries = [{ id: "it-1", title: "Weekend in Daet", start_date: addDays(14), end_date: addDays(15), tours_itinerary_items: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }];
  const day = (n) => addDays(-n);
  const analytics = {
    from: day(29), to: TODAY,
    arrivals: [[1, 6], [2, 9], [3, 4], [5, 12], [6, 15], [8, 7], [9, 3], [12, 18], [13, 22], [15, 8], [19, 5], [20, 14], [22, 11], [26, 6], [27, 9]].map(([n, c]) => ({ day: day(n), checkins: c })),
    bookings: { total: 64, pending: 6, confirmed: 21, completed: 28, cancelled: 5, rejected: 4, pax: 182 },
    operators: [
      { id: "op-1", business_name: "Bagasbas Coast Tours", bookings: 31, revenue: 48250, refunded: 466 },
      { id: "op-2", business_name: "Calaguas Island Hoppers", bookings: 22, revenue: 39600, refunded: 0 },
      { id: "op-3", business_name: "Daet Heritage Walks", bookings: 7, revenue: 4200, refunded: 0 },
    ],
    top_packages: [
      { id: PKG, title: "Bagasbas Sunrise Surf Lesson", bookings: 24, pax: 61 },
      { id: "p2", title: "Calaguas Island Day Trip", bookings: 19, pax: 74 },
      { id: "p3", title: "Heritage Walk: Daet Poblacion", bookings: 7, pax: 18 },
    ],
    top_attractions: [
      { id: "a1", name: "Bagasbas Beach", slug: "bagasbas-beach", planned: 17 },
      { id: "a2", name: "First José Rizal Monument", slug: "first-jose-rizal-monument", planned: 11 },
      { id: "a3", name: "Daet Heritage Center", slug: "daet-heritage-center", planned: 6 },
    ],
    queue: [
      { kind: "guide", id: "g9", name: "Liza Marquez", waiting_days: 9 },
      { kind: "operator", id: "o9", name: "Mercedes Bangka Rides", waiting_days: 4 },
      { kind: "guide", id: "g8", name: "Paolo Abad", waiting_days: 1 },
    ],
    ratings: [{ stars: 5, count: 14 }, { stars: 4, count: 6 }, { stars: 3, count: 2 }, { stars: 2, count: 0 }, { stars: 1, count: 1 }],
  };
  const EVT = "e1000000-0000-4000-8000-000000000001";
  const bagasbasAttr = attractions.find((a) => a.slug === "bagasbas-beach");
  const events = [{ id: EVT, title: "Bagasbas Surf Weekend", description: "Two days of surf clinics and a beach clean-up.", category: "sports", venue: "Bagasbas Beach", organizer: "Daet Tourism Office", starts_at: "2026-11-06T16:00:00Z", ends_at: "2026-11-08T10:00:00Z", image_url: null, is_published: true, attraction_id: bagasbasAttr ? bagasbasAttr.id : null, source: "Tourism Office memo" }];
  const surf = { id: PKG, title: "Bagasbas Sunrise Surf Lesson", location_name: "Bagasbas Beach", cover_image_url: null, status: "published", tours_package_stops: [{ latitude: "14.131583", longitude: "122.985083" }] };
  const heritage = { id: "p-heritage", title: "Heritage Walk: Daet Poblacion", location_name: "Daet", cover_image_url: null, status: "published", tours_package_stops: [{ latitude: "14.1122", longitude: "122.9553" }] };
  const eventAvailability = [
    { available_date: "2026-11-07", capacity_total: 10, capacity_booked: 3, tours_packages: surf },
    { available_date: "2026-11-08", capacity_total: 10, capacity_booked: 0, tours_packages: surf },
    { available_date: "2026-11-07", capacity_total: 8, capacity_booked: 2, tours_packages: heritage },
  ];
  const merch = [
    { id: "m1", name: "Bagasbas Surf Club Shirt", description: "Cotton tee.", category: "tshirt", price: 450, seller_name: "Bagasbas Coast Tours", where_to_buy: "Bagasbas Beach kiosk", contact_info: "0917 555 0101", image_url: null, is_featured: false, is_active: true, review_status: "pending", review_notes: null, reviewed_at: null, submitted_by_operator_id: "op-1", tours_operators: { business_name: "Bagasbas Coast Tours" } },
    { id: "m2", name: "Pineapple Jam", description: null, category: "pasalubong", price: 120, seller_name: "Bagasbas Coast Tours", where_to_buy: null, contact_info: null, image_url: null, is_featured: false, is_active: true, review_status: "rejected", review_notes: "Please add a photo of the jar and its label.", reviewed_at: "2026-10-22T03:00:00Z", submitted_by_operator_id: "op-1", tours_operators: { business_name: "Bagasbas Coast Tours" } },
    { id: "m3", name: "I Love Daet Mug", description: null, category: "mug", price: 250, seller_name: "Daet Tourism Office", where_to_buy: "Municipal Hall", contact_info: null, image_url: null, is_featured: true, is_active: true, review_status: "approved", review_notes: null, reviewed_at: null, submitted_by_operator_id: null, tours_operators: null },
  ];
  const user0 = "9b7e5a5e-0000-4000-8000-000000000001";
  const tables = {
    rewards_balances: [{ profile_id: user0, balance: 115, earned: 165 }],
    rewards_ledger: [
      { id: "l1", points: 30, source: "tours.checked_in", description: "Checked in with your guide", created_at: "2026-10-23T01:00:00Z" },
      { id: "l2", points: 5, source: "tours.itinerary_saved", description: "Saved a trip plan", created_at: "2026-10-21T01:00:00Z" },
      { id: "l3", points: -50, source: "tours.booking_paid_reversed", description: "Refunded: Calaguas Island Day Trip", created_at: "2026-10-18T01:00:00Z" },
      { id: "l4", points: 50, source: "tours.booking_paid", description: "Paid for Calaguas Island Day Trip", created_at: "2026-10-15T01:00:00Z" },
      { id: "l5", points: 20, source: "tours.tour_completed", description: "Completed Bagasbas Sunrise Surf Lesson", created_at: "2026-10-12T01:00:00Z" },
    ],
    tours_guide_availability: guideAvailability, tours_guide_ratings: [{ guide_id: guides[0].id, review_count: 9, average_rating: "4.78" }], tours_itineraries: itineraries,
    tours_reviews: reviews, tours_package_ratings: [ratingRow], tours_operator_ratings: [ratingRow],
    tours_attractions: attractions,
    tours_notifications: notifications,
    tours_conversations: [conversation], tours_messages: messages,
    tours_booking_participants: participants, tours_checkins: checkins,
    tours_bookings: role === "operator" ? [booking, later, pendingB, cancelled] : [booking, later, pendingB, doneB], tours_packages: [pkg], tours_package_availability: availability, _event_availability: eventAvailability, tours_cancellations: cancellations, tours_payments: payments, tours_payment_proofs: proofs, tours_operators: [operator],
    tours_guides: guides, profiles: [{ id: "9b7e5a5e-0000-4000-8000-000000000001", role, full_name: "Juan Dela Cruz" }],
    tours_events: events, tours_merchandise: role === "operator" ? merch.filter((m) => m.submitted_by_operator_id) : merch,
  };
  return { tables, analytics, inbox, user };
  }
  const user = { id: "9b7e5a5e-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "juan@example.ph", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,HEAD,OPTIONS", "access-control-expose-headers": "content-range" };
  const send = (code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...cors, ...headers }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  req.on("data", () => {}); req.on("end", () => {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const role = /^e2e-(tourist|operator|guide|admin)$/.test(token) ? token.slice(4) : "anon";
    const { tables, analytics, inbox, user } = build(role);
    if (url.pathname === "/auth/v1/user") return role === "anon" ? send(401, { message: "not signed in" }) : send(200, user);
    if (url.pathname === "/rest/v1/rpc/get_my_role") return send(200, role === "anon" ? null : role);
    if (url.pathname === "/rest/v1/rpc/tours_refundable_amount") return send(200, 500);
    if (url.pathname === "/rest/v1/rpc/tours_admin_analytics") return send(200, analytics);
    if (url.pathname === "/rest/v1/rpc/tours_inbox") return send(200, inbox);
    if (url.pathname === "/rest/v1/rpc/tours_mark_conversation_read") return send(200, null);
    if (url.pathname === "/rest/v1/rpc/tours_badge_lookup") return send(200, [{ status: "approved", full_name: "Jeremiah Sabihon", photo_url: null, approved_at: "2026-10-16T13:18:25Z" }]);
    const table = url.pathname.replace("/rest/v1/", "");
    // The event page asks for availability joined to packages.
    const wantsEventJoin = table === "tours_package_availability" && (url.searchParams.get("select") || "").includes("tours_packages");
    let rows = (wantsEventJoin ? tables._event_availability : tables[table]) || [];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith("eq.") && !k.includes(".")) rows = rows.filter((r) => !(k in r) || String(r[k]) === v.slice(3));
    }
    const prefer = req.headers.prefer || "";
    if (req.method === "HEAD" || prefer.includes("count=exact")) {
      const n = url.searchParams.get("read_at") === "is.null" ? rows.filter((r) => !r.read_at).length : rows.length;
      res.writeHead(200, { "content-type": "application/json", ...cors, "content-range": `0-${Math.max(n - 1, 0)}/${n}` });
      return res.end(req.method === "HEAD" ? undefined : JSON.stringify(rows));
    }
    const single = (req.headers.accept || "").includes("vnd.pgrst.object");
    if (single) return rows.length ? send(200, rows[0]) : send(406, { code: "PGRST116", message: "none" });
    send(200, rows);
  });
}).listen(PORT, () => console.log(`mock supabase on ${PORT}`));
