import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The redesign's rules, enforced (docs/DESIGN_SYSTEM.md): no emoji as icons,
 * no tiny uppercase letter-spaced labels, no resting shadows (only things that
 * float use --shadow-float), no eyebrow labels above headings, cards rounded-2xl.
 */
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    // gallery-schema-verification.ts is a CLI check that prints to a terminal, not UI.
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith("database.types.ts") && !name.endsWith("gallery-schema-verification.ts")) files.push(path);
  }
};
walk(join(process.cwd(), "src"));

const offenders = (test: (line: string) => boolean) =>
  files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => test(line))
      .map(({ i }) => `${file.replace(process.cwd() + "/", "")}:${i + 1}`),
  );

// Pictographic emoji only; typographic marks (★ ✓ ✕ → ·) are fine.
const EMOJI = /[\u{1F300}-\u{1FAFF}☕⚙⚠⛔✅⭐⏰-⏳✈✏✉❌]/u;

describe("design rules", () => {
  it("uses line icons, not emoji", () => {
    expect(offenders((line) => EMOJI.test(line) && !line.includes("console."))).toEqual([]);
  });

  it("has no uppercase letter-spaced labels", () => {
    expect(offenders((line) => /\buppercase\b[^"`]*\btracking-|\btracking-[^"`]*\buppercase\b/.test(line))).toEqual([]);
  });

  it("has no resting shadows", () => {
    expect(offenders((line) => /(?<![\w-])shadow(-(sm|md|lg|xl|2xl|card))?(?![\w-[])/.test(line) && !line.trim().startsWith("*") && !line.includes("print:shadow-none"))).toEqual([]);
  });

  it("has no eyebrow labels and no rounded-3xl cards", () => {
    expect(offenders((line) => /\beyebrow\b|rounded-3xl/.test(line) && !line.trim().startsWith("*"))).toEqual([]);
  });
});
