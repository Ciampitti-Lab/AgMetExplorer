#!/usr/bin/env bash
# Publish the processed AgMet graphics as a GitHub Release that the deploy workflow downloads.
# Usage: scripts/publish_agmet.sh YYYY-MM-DD [web/public/agmet]
set -euo pipefail

DATE="${1:?delivery date, YYYY-MM-DD}"
SRC="${2:-web/public/agmet}"
TAG="agmet-$DATE"

test -f "$SRC/manifest.json" || { echo "no manifest.json in $SRC, run agmet_ingest.py first" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(cd "$SRC" && zip -qr "$TMP/agmet.zip" .)

gh release create "$TAG" "$TMP/agmet.zip" \
  --title "AgMet graphics $DATE" \
  --notes "AgMet graphics delivered $DATE, processed with pipeline/agmet_ingest.py." \
  --latest=false
gh workflow run build-deploy.yml
