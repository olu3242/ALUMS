#!/usr/bin/env bash
# Applies migrations + seed to a throwaway PostgreSQL and runs supabase/tests/*.test.sql.
# Uses $DATABASE_URL if set (CI service container); otherwise boots a temporary local cluster.
set -uo pipefail
shopt -s nullglob
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
CLEANUP=""
if [[ -z "${DATABASE_URL:-}" ]]; then
  DIR="${DB_TEST_DIR:-${TMPDIR:-/tmp}/alums-db-test}"; rm -rf "$DIR"; mkdir -p "$DIR"
  AS=()  # postgres refuses to run as root; use the distro's existing 'postgres' account when root
  if [[ $(id -u) -eq 0 ]]; then
    id postgres >/dev/null 2>&1 || { echo "BLOCKED: running as root and no 'postgres' user; set DATABASE_URL"; exit 2; }
    chown postgres "$DIR"; AS=(runuser -u postgres --)
  fi
  "${AS[@]}" "$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null || { echo "BLOCKED: initdb unavailable"; exit 2; }
  "${AS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p 54329 -k $DIR -c listen_addresses=''" -l "$DIR/pg.log" start -w >/dev/null \
    || { echo "BLOCKED: postgres failed to start"; exit 2; }
  CLEANUP="${AS[*]} $PGBIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"
  trap "$CLEANUP" EXIT
  export DATABASE_URL="postgresql://postgres@/postgres?host=$DIR&port=54329"
fi
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql" >/dev/null || exit 1
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null || { echo "FAIL: migration $(basename "$f")"; exit 1; }
done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql" >/dev/null || { echo "FAIL: seed"; exit 1; }
"${PSQL[@]}" -f "$ROOT/supabase/tests/01_harness.sql" >/dev/null || exit 1

pass=0; fail=0; results=()
for t in "$ROOT"/supabase/tests/*.test.sql; do
  name="$(basename "$t" .test.sql)"
  out="$("${PSQL[@]}" -c 'begin;' -f "$t" -c 'rollback;' 2>&1)"; code=$?
  n=$(grep -c 'PASS:' <<<"$out")
  if [[ $code -eq 0 ]]; then pass=$((pass+1)); results+=("PASS  $name ($n assertions)")
  else fail=$((fail+1)); results+=("FAIL  $name"); echo "---- $name"; grep -E 'PASS:|FAIL|ERROR' <<<"$out" | tail -8; fi
done
printf '%s\n' "${results[@]}"
echo "db suites: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
