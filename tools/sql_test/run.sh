#!/bin/bash
# Rejoue v54 + v55 sur une base PostgreSQL locale qui imite Supabase (jamais sur Supabase).
#   bash tools/sql_test/run.sh        (PostgreSQL 16 local ; démarre le cluster si besoin)
set -e
cd "$(dirname "$0")/../.."
pg_ctlcluster 16 main status >/dev/null 2>&1 || pg_ctlcluster 16 main start
Q() { su postgres -s /bin/bash -c "psql -q -v ON_ERROR_STOP=1 -tA $*"; }
Q "-c 'drop database if exists sbtest'" >/dev/null; Q "-c 'create database sbtest'" >/dev/null
for f in tools/sql_test/mock_supabase.sql tools/sql_test/export_functions.sql github_upload/server/schema_mp_v54_voyages.sql github_upload/server/schema_mp_v55_troncons.sql github_upload/server/schema_mp_v55_troncons.sql tools/sql_test/test_v55.sql; do
  cp "$f" /tmp/sbtest_in.sql; chmod 644 /tmp/sbtest_in.sql
  Q "-d sbtest -f /tmp/sbtest_in.sql" 2>&1 | grep -v "^$" | grep -vE "^(NOTICE|psql:.*NOTICE)" || true
done
rm -f /tmp/sbtest_in.sql
