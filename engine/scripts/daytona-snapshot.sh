#!/bin/sh
# Build the review sandbox image and push it to Daytona as a snapshot.
#
#   engine/scripts/daytona-snapshot.sh [name]
#
# Needs Docker and the Daytona CLI (`daytona login` first). The name defaults
# to openvscan-sandbox-<date>; set DAYTONA_SNAPSHOT on the engine to it.
# Resources apply to every review sandbox: the image is about 4.5 GB and
# Opengrep wants a few GB of memory on large repositories.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
name=${1:-openvscan-sandbox-$(date +%Y%m%d%H%M)}
image="openvscan-sandbox:$name"

docker build --platform linux/amd64 -t "$image" "$here/container"
daytona snapshot push "$image" \
  --name "$name" \
  --cpu "${DAYTONA_CPU:-2}" \
  --memory "${DAYTONA_MEMORY:-4}" \
  --disk "${DAYTONA_DISK:-10}" \
  --entrypoint "sleep infinity"

echo
echo "Snapshot $name is ready. Point the engine at it:"
echo "  set \"DAYTONA_SNAPSHOT\": \"$name\" in engine/wrangler.jsonc, then pnpm run deploy"
