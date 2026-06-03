#!/bin/bash
set -e

cd /app/sci-viz-case-hub/server

if [ ! -f prisma/dev.db ]; then
  echo "Initializing database..."
  npx prisma db push --skip-generate
  echo "Seeding database..."
  node dist/seed.js
fi

echo "Starting server..."
exec "$@"
