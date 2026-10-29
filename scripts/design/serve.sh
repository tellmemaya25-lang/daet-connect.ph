#!/usr/bin/env bash
# Starts the e2e mock Supabase (54329) and a dev server (3101) for screenshots; waits until ready.
cd "$(dirname "$0")/../.."
LOG=${TMPDIR:-/tmp}
pgrep -f "node e2e/mock-supabase.cjs" >/dev/null || (MOCK_SUPABASE_PORT=54329 nohup node e2e/mock-supabase.cjs >"$LOG/daet-mock.log" 2>&1 &)
if ! curl -s -o /dev/null http://localhost:3101/; then
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key SUPABASE_SERVICE_ROLE_KEY= \
  QR_SIGNING_SECRET=e2e-only-qr-signing-secret-0123456789abcdef NEXT_TELEMETRY_DISABLED=1 \
  nohup npx next dev --port 3101 >"$LOG/daet-dev.log" 2>&1 &
fi
for _ in $(seq 1 80); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3101/)" = 200 ] && echo "ready" && exit 0
  sleep 3
done
echo "dev server did not start; see $LOG/daet-dev.log" >&2
exit 1
