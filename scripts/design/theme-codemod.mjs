#!/usr/bin/env node
/**
 * One-off dark-mode sweep. Rewrites light-only colour classes in src/:
 *  - neutral surfaces become theme tokens (bg-white → bg-surface, …);
 *  - coloured tints, text and borders get a dark: partner class.
 * Light mode is unchanged: tokens keep the old light values, and dark:
 * classes only apply in dark mode. Run with --dry to list changes only.
 *
 *   node scripts/design/theme-codemod.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const ROOT = "src";

// Files left alone: they render inside a data-theme="light" scope (printed badge).
const KEEP_WHITE = new Set(["src/app/(subsystems)/tours/guide/guide-qr-badge.tsx"]);

const TOKENS = {
  "bg-white": "bg-surface",
  "bg-slate-50": "bg-canvas",
  "bg-slate-100": "bg-muted",
  "bg-slate-200": "bg-muted-strong",
  "bg-slate-300": "bg-line",
  "border-slate-100": "border-muted",
  "border-slate-200": "border-line",
  "border-slate-300": "border-line",
  "divide-slate-200": "divide-line",
  "ring-white": "ring-surface",
};

const HUES = "blue|red|green|yellow|sky|amber|emerald|orange|rose";
// A line that paints a solid fill: text on it already has contrast in both themes.
const SOLID_FILL = new RegExp(`\\bbg-(?:(?:${HUES}|slate)-(?:[4-9]00|950)|daet-(?:forest|leaf|coral|sun))(?![/\\w-])`);

function darkPartner(cls, lineHasFill) {
  let m;
  if ((m = cls.match(new RegExp(`^bg-(${HUES})-(50|100|200|300)(?:/\\d+)?$`)))) {
    const map = { 50: "950/40", 100: "900/40", 200: "800/60", 300: "700" };
    return `bg-${m[1]}-${map[m[2]]}`;
  }
  if ((m = cls.match(new RegExp(`^border-(${HUES})-(100|200|300|400)$`)))) return `border-${m[1]}-700`;
  if (lineHasFill) return null;
  if ((m = cls.match(new RegExp(`^text-(${HUES})-(600|700|800|900|950)$`)))) return `text-${m[1]}-${m[1] === "yellow" || m[1] === "amber" ? 200 : 300}`;
  if (cls === "text-daet-leaf" || cls === "text-daet-forest") return "text-blue-300";
  if (/^text-slate-(500|600)$/.test(cls)) return "text-slate-400";
  if (/^text-slate-(800|900)$/.test(cls)) return "text-slate-100";
  return null;
}

// A class token, with any variant prefixes (hover:, md:, group-open:, …).
const TOKEN = /(?<=^|[\s"'`{(])((?:[a-z0-9-]+(?:-\[[^\]]+\])?:)*)((?:bg|text|border|divide|ring)-[a-z0-9-]+(?:\/\d+)?)(?=$|[\s"'`})])/g;

function rewriteLine(line, file) {
  const hasFill = SOLID_FILL.test(line);
  return line.replace(TOKEN, (whole, prefix, cls) => {
    if (prefix.includes("dark:") || prefix.includes("print:")) return whole;
    if (TOKENS[cls] && !(cls === "bg-white" && KEEP_WHITE.has(file))) return `${prefix}${TOKENS[cls]}`;
    const partner = darkPartner(cls, hasFill);
    if (!partner) return whole;
    const dark = `dark:${prefix}${partner}`;
    return line.includes(dark) ? whole : `${whole} ${dark}`;
  });
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

let changed = 0;
const leftovers = new Map();
for (const file of walk(ROOT)) {
  if (KEEP_WHITE.has(file)) continue;
  const src = readFileSync(file, "utf8");
  const next = src
    .split("\n")
    .map((l) => rewriteLine(l, file))
    .join("\n");
  for (const m of next.matchAll(/\b(?<!dark:)(?:[a-z-]+:)*(bg-white|bg-slate-(?:50|100|200|300))\b(?!\/)/g)) {
    leftovers.set(`${file}: ${m[0]}`, true);
  }
  if (next !== src) {
    changed++;
    if (!DRY) writeFileSync(file, next);
    else console.log(file);
  }
}
console.log(`${DRY ? "would change" : "changed"} ${changed} files`);
if (leftovers.size) console.log("left as is:\n" + [...leftovers.keys()].join("\n"));
