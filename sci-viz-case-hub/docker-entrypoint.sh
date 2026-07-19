#!/bin/sh
set -eu

cd /app/sci-viz-case-hub/server

if [ ! -f prisma/schema.prisma ]; then
  cp /app/prisma-template/schema.prisma prisma/schema.prisma
fi

if [ ! -f prisma/dev.db ]; then
  if [ "${NODE_ENV:-development}" = "production" ] && [ "${CASE_HUB_ALLOW_DATABASE_INITIALIZATION:-false}" != "true" ]; then
    echo "Refusing to create a new production database. Restore the database or explicitly set CASE_HUB_ALLOW_DATABASE_INITIALIZATION=true for the one-time initialization." >&2
    exit 1
  fi
  npx prisma db push --skip-generate
  node dist/seed.js
else
  npx prisma db push --skip-generate
fi

exec node dist/index.js
