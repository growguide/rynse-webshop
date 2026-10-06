#!/bin/bash
# Ensures the local PostgreSQL 16 instance is running (workspace only).
PG=/usr/lib/postgresql/16/bin; D=/home/claude/.pgdata
if ! su postgres -c "$PG/pg_ctl -D $D status" >/dev/null 2>&1; then
  su postgres -c "$PG/pg_ctl -D $D -o '-c listen_addresses=127.0.0.1 -p 5432 -k /home/claude/.pgrun' -l $D/log start" >/dev/null
  sleep 1.5
fi
