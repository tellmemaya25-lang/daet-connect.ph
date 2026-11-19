import { createSupabaseServerClient } from "@/lib/supabase/server";
import { backupFileStem, parseBackupFormat, parseBackupItems, tablesToJson, tableToCsv } from "@/lib/tours/backup";
import { loadBackupTables } from "@/lib/tours/backup.server";
import { getAuthenticatedSession, getAuthUser } from "@/lib/tours/server-auth";
import { zipStore } from "@/lib/tours/zip";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** The signed-in, approved operator's own data, as a ZIP of CSV files or one JSON file. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const items = parseBackupItems(url.searchParams.getAll("items"));
  const format = parseBackupFormat(url.searchParams.get("format"));
  if (items.length === 0) return new Response("Choose at least one thing to save.", { status: 400, headers: HEADERS });

  const user = await getAuthUser();
  if (!user) return new Response("Not available", { status: 401, headers: HEADERS });
  const supabase = await createSupabaseServerClient();
  const [session, { data: operator }] = await Promise.all([
    getAuthenticatedSession(),
    supabase.from("tours_operators").select("id, business_name, accreditation_status").eq("profile_id", user.id).maybeSingle(),
  ]);
  if (session.role !== "operator" || !operator || operator.accreditation_status !== "approved") {
    return new Response("Not available", { status: 403, headers: HEADERS });
  }

  let tables;
  try {
    tables = await loadBackupTables(supabase, operator.id, items);
  } catch (error) {
    console.error("Backup error:", error);
    return new Response("The backup could not be built. Please try again.", { status: 500, headers: HEADERS });
  }

  const now = new Date();
  const stem = backupFileStem(now);
  const encoder = new TextEncoder();
  if (format === "json") {
    const body = tablesToJson({ exportedAt: now.toISOString(), business: operator.business_name }, tables);
    return new Response(body, { headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${stem}.json"` } });
  }
  const files = [
    ...items.map((id) => ({ name: `${id}.csv`, data: encoder.encode(tableToCsv(tables[id]!)) })),
    { name: "about.txt", data: encoder.encode(`CONNECT-Daet data backup\r\nBusiness: ${operator.business_name}\r\nSaved: ${now.toISOString()}\r\nIncluded: ${items.join(", ")}\r\n`) },
  ];
  return new Response(zipStore(files, now) as BodyInit, { headers: { ...HEADERS, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${stem}.zip"` } });
}
