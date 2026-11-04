#!/usr/bin/env bash
# Runs on the server (every few minutes via portfolio-update.timer).
# Pulls the latest image from ghcr.io and restarts the site only when it changed.
# If the new version does not become healthy, it rolls back to the previous image
# and remembers the bad one so it is not retried until a newer image is published.
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE="${PORTFOLIO_IMAGE:-ghcr.io/medamine1920/med-amin-portfolio:latest}"
SERVICE="studio"
COMPOSE=(docker compose -f compose.caddy.yaml)
BAD_FILE=".bad-image"

image_id() { docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null || true; }

before="$(image_id)"
docker pull -q "$IMAGE" >/dev/null
after="$(image_id)"

if [ "$before" = "$after" ]; then exit 0; fi
if [ -f "$BAD_FILE" ] && [ "$(cat "$BAD_FILE")" = "$after" ]; then
  # Known-bad image: keep running the previous one.
  [ -n "$before" ] && docker tag "$before" "$IMAGE"
  exit 0
fi

echo "New version $after: restarting $SERVICE"
"${COMPOSE[@]}" up -d "$SERVICE"
cid="$("${COMPOSE[@]}" ps -q "$SERVICE")"

for _ in $(seq 1 40); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid")"
  if [ "$status" = "healthy" ]; then
    echo "Deployed $after"
    rm -f "$BAD_FILE"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "New version is not healthy: rolling back" >&2
echo "$after" > "$BAD_FILE"
if [ -n "$before" ]; then
  docker tag "$before" "$IMAGE"
  "${COMPOSE[@]}" up -d "$SERVICE"
fi
exit 1
