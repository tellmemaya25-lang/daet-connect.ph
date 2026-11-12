// PROTOTYPE launcher: mock Supabase + next dev, then open /tours/browse?variant=A (use ← → to switch).
import { spawn } from "node:child_process";
const env = { ...process.env, MOCK_SUPABASE_PORT: "54329", MOCK_COVERS: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "", QR_SIGNING_SECRET: "e2e-only-qr-signing-secret-0123456789abcdef" };
const kids = [spawn("node", ["e2e/mock-supabase.cjs"], { env, stdio: "inherit" }),
  spawn("npx", ["next", "dev", "--port", "3101"], { env, stdio: "inherit", shell: process.platform === "win32" })];
console.log("\nPROTOTYPE → http://localhost:3101/tours/browse?variant=A  (B, C; or ← → keys)\n");
process.on("SIGINT", () => { kids.forEach((k) => k.kill()); process.exit(); });
