#!/bin/bash

echo "[INFO] Waiting for Docker to start..."
until docker info >/dev/null 2>&1; do
  sleep 2
done

echo "[INFO] Pulling latest image from Docker Hub..."
docker pull ofirgaash/silence-remover:latest

echo "[INFO] Stopping old container..."
docker stop silence-remover || true
docker rm silence-remover || true

echo "[INFO] Starting new container..."
docker run -d \
  --name silence-remover \
  -p 80:80 -p 443:443 \
  -v certbot-etc:/etc/letsencrypt:ro \
  -v certbot-var:/var/lib/letsencrypt \
  ofirgaash/silence-remover:latest
