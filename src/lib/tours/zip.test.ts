import { crc32, zipStore } from "./zip";

/** Reads a stored ZIP back through its central directory, the way an unzip tool does. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Record<string, { text: string; crcOk: boolean }> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    const localNameLen = view.getUint16(local + 26, true);
    const data = zip.subarray(local + 30 + localNameLen, local + 30 + localNameLen + size);
    out[name] = { text: new TextDecoder().decode(data), crcOk: crc32(data) === crc };
    at += 46 + nameLen;
  }
  return out;
}

describe("zipStore", () => {
  it("matches the known CRC-32 of a test string", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes files that read back whole, with valid checksums and UTF-8 names", () => {
    const enc = new TextEncoder();
    const zip = zipStore([
      { name: "bookings.csv", data: enc.encode("Reference\r\nCD1\r\n") },
      { name: "pesos ₱.csv", data: enc.encode("₱1,200") },
      { name: "empty.csv", data: new Uint8Array() },
    ]);
    const files = readZip(zip);
    expect(Object.keys(files)).toEqual(["bookings.csv", "pesos ₱.csv", "empty.csv"]);
    expect(files["bookings.csv"].text).toBe("Reference\r\nCD1\r\n");
    expect(files["pesos ₱.csv"].text).toBe("₱1,200");
    expect(Object.values(files).every((f) => f.crcOk)).toBe(true);
  });
});
