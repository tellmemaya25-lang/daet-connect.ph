#!/usr/bin/env node
/**
 * `npm run dev:poll`: the dev server with hot reloading driven by polling.
 * Use it when saved files don't reload the page under `npm run dev`
 * (Windows, WSL with the project on the Windows drive, Docker, network
 * drives). Works on every OS; extra arguments go to `next dev`.
 */
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", "--hostname", "0.0.0.0", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, WATCHPACK_POLLING: "true", CHOKIDAR_USEPOLLING: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
