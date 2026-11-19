import "server-only";
import { backupFileStem, tablesToJson, tableToCsv, type BackupFormat, type BackupTables } from "@/lib/tours/backup";
import { zipStore } from "@/lib/tours/zip";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export const backupRefusal = (message: string, status: number) => new Response(message, { status, headers: HEADERS });

/** The download for a built backup: one JSON file, or a ZIP with a CSV per item and a short about.txt. */
export function backupResponse({ tables, format, owner, now = new Date() }: { tables: BackupTables; format: BackupFormat; owner: string; now?: Date }): Response {
  const stem = backupFileStem(now);
  const ids = Object.keys(tables);
  if (format === "json") {
    return new Response(tablesToJson({ exportedAt: now.toISOString(), business: owner }, tables), {
      headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${stem}.json"` },
    });
  }
  const encoder = new TextEncoder();
  const files = [
    ...ids.map((id) => ({ name: `${id}.csv`, data: encoder.encode(tableToCsv(tables[id])) })),
    { name: "about.txt", data: encoder.encode(`CONNECT-Daet data backup\r\nFor: ${owner}\r\nSaved: ${now.toISOString()}\r\nIncluded: ${ids.join(", ")}\r\n`) },
  ];
  return new Response(zipStore(files, now) as BodyInit, {
    headers: { ...HEADERS, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${stem}.zip"` },
  });
}
