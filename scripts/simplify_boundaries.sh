#!/usr/bin/env bash
# Display boundaries for the web map, simplified from the full-resolution set.
set -euo pipefail

SRC="${1:-pipeline/boundaries}"
OUT="${2:-web/public/boundaries}"
mkdir -p "$OUT"

# Districts are dissolved from the simplified counties so shared edges line up.
npx --yes mapshaper "$SRC/indiana_counties.geojson" \
  -simplify 8% keep-shapes \
  -o "$OUT/counties.geojson" precision=0.0001 format=geojson \
  -dissolve ASD_CODE copy-fields=ASD_NAME \
  -each 'SLUG = ASD_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "_")' \
  -o "$OUT/districts.geojson" precision=0.0001 format=geojson
