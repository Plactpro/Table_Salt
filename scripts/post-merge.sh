#!/bin/bash
set -e

npm install --legacy-peer-deps
npx tsx scripts/run-migrations.ts
