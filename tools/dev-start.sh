#!/bin/bash
# Starts (or restarts) the local dev server in the background with the local Postgres + payment emulator.
cd "$(dirname "$0")/.."
./tools/dev-pg.sh
[ -f /tmp/rynse-dev.pid ] && kill "$(cat /tmp/rynse-dev.pid)" 2>/dev/null; sleep 0.3
export DATABASE_URL=${DATABASE_URL:-postgres://postgres@127.0.0.1:5432/rynse_dev} PAYMENT_PROVIDER=${PAYMENT_PROVIDER:-emulator} SITE_URL=${SITE_URL:-http://localhost:3000} ADMIN_TOKEN=${ADMIN_TOKEN:-dev-admin-token-0123456789} CRON_SECRET=${CRON_SECRET:-dev-cron-secret}
nohup node src/server/dev.js > /tmp/rynse-dev.log 2>&1 &
echo $! > /tmp/rynse-dev.pid
sleep 1.2; curl -s -o /dev/null -w "dev server: %{http_code}\n" localhost:3000/api/health
