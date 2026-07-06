#!/bin/sh
set -eu

nginx
exec ./node_modules/.bin/tsx apps/server/src/index.ts
