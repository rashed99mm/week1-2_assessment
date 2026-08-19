#!/bin/bash
# Give the payment gateway its own database on the shared instance.
#
# One server, separate databases: the two services have unrelated schemas and
# migration histories, and letting them share would make "who owns this table"
# a question nobody can answer later.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE payments OWNER $POSTGRES_USER'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payments')\gexec
EOSQL
