#!/bin/sh
set -eu

cd "${CASE_HUB_SERVER_DIR:-/app/sci-viz-case-hub/server}"
schema_template="${CASE_HUB_SCHEMA_TEMPLATE:-/app/prisma-template/schema.prisma}"

# Refuse a missing production database before modifying the mounted directory.
if [ ! -f prisma/dev.db ] && [ "${NODE_ENV:-development}" = "production" ] && [ "${CASE_HUB_ALLOW_DATABASE_INITIALIZATION:-false}" != "true" ]; then
  echo "Refusing to create a new production database. Restore the database or explicitly set CASE_HUB_ALLOW_DATABASE_INITIALIZATION=true for the one-time initialization." >&2
  exit 1
fi

initialize_database=false
if [ ! -f prisma/dev.db ]; then initialize_database=true; fi

# The schema belongs to the image, never to a previous version in the data volume.
# Back up an existing database before synchronizing its schema. Fail closed on any error.
if [ -f prisma/dev.db ]; then
  node dist/utils/backup.js
fi
cp "$schema_template" prisma/schema.prisma
node node_modules/prisma/build/index.js db push --skip-generate

if [ "$initialize_database" = "true" ] && [ "${NODE_ENV:-development}" != "production" ]; then
  # Development fixtures only: restored production libraries must never be reseeded.
  node dist/seed.js
fi

exec node dist/index.js
