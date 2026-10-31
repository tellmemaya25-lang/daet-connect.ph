#!/usr/bin/env node
/**
 * MapLibre 6 runs its map worker from a separate file, found next to the
 * library's own URL. Bundling moves the library, so serve the worker from
 * public/ under a versioned name (src/components/maps/free-map.tsx points
 * MapLibre at it). Runs after `npm install` and before `next build`.
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "maplibre-gl");
try {
  const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const outDir = join(root, "public", "vendor");
  mkdirSync(outDir, { recursive: true });
  copyFileSync(join(pkgDir, "dist", "maplibre-gl-worker.mjs"), join(outDir, `maplibre-gl-worker-${version}.mjs`));
  console.log(`maplibre worker ${version} copied to public/vendor`);
} catch (error) {
  // Maps fall back to the sketch without the worker; don't fail the install.
  console.warn(`maplibre worker not copied: ${error instanceof Error ? error.message : error}`);
}
