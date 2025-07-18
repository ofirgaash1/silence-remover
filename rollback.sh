#!/bin/bash

IMAGE_NAME="ofirgaash/silence-remover"

echo "🔄 Available tags:"
docker images "$IMAGE_NAME" --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedSince}}" | grep -v "<none>" | sort -r

echo
read -p "⏮️  Enter tag to roll back to (e.g. v20240718-120300): " TAG

if [[ -z "$TAG" ]]; then
  echo "❌ No tag provided. Exiting."
  exit 1
fi

CONTAINER_NAME="silence-$TAG"

echo "✅ Selected image: $IMAGE_NAME:$TAG"
echo "🛑 Stopping all other 'silence-*' containers..."
docker ps --filter "name=silence-" --format "{{.Names}}" | grep -v "$CONTAINER_NAME" | xargs -r docker rm -f

echo "🚀 Starting rollback container: $CONTAINER_NAME"
docker run -d \
  --name "$CONTAINER_NAME" \
  --network traefik-net \
  -l traefik.enable=true \
  -l "traefik.http.routers.silence.rule=Host(\`azure.ofirgaash.click\`)" \
  -l traefik.http.routers.silence.entrypoints=websecure \
  -l traefik.http.routers.silence.tls.certresolver=myresolver \
  -l traefik.http.services.silence.loadbalancer.server.port=80 \
  "$IMAGE_NAME:$TAG"

echo "✅ Rollback to $TAG completed successfully."
