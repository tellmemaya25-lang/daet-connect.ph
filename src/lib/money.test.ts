import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatPeso, pesoAmount } from "@/lib/money";

describe("formatPeso (R3)", () => {
  it("always shows two decimals and thousands separators", () => {
    expect(formatPeso(850)).toBe("₱850.00");
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(850.5)).toBe("₱850.50");
    expect(formatPeso(1234567.891)).toBe("₱1,234,567.89");
    expect(formatPeso("1500")).toBe("₱1,500.00");
  });

  it("shows unreadable amounts as zero", () => {
    expect(formatPeso(null)).toBe("₱0.00");
    expect(formatPeso(undefined)).toBe("₱0.00");
    expect(formatPeso("abc")).toBe("₱0.00");
  });

  it("gives plain amounts for CSV and form defaults", () => {
    expect(pesoAmount(850)).toBe("850.00");
    expect(pesoAmount("12.345")).toBe("12.35");
  });
});

describe("no hand-formatted pesos", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith("database.types.ts") && path !== join(process.cwd(), "src/lib/money.ts")) files.push(path);
    }
  };
  walk(join(process.cwd(), "src"));

  it("formats every peso amount with formatPeso", () => {
    // "₱{" in JSX or "₱${" in a template means a number was formatted by hand.
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /₱\$?\{/.test(line) || /₱\s*$/.test(line))
        .map(({ i }) => `${file.replace(process.cwd() + "/", "")}:${i + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});
