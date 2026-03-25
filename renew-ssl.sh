#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="silence-remover.com"
NGINX_CONTAINER="silence-remover"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"

echo "----------------------------------------"
echo "Starting SSL renewal for ${DOMAIN}"
echo "----------------------------------------"

echo "[1/3] Running certbot renewal..."
cd "${SCRIPT_DIR}"
docker compose -f "${COMPOSE_FILE}" run --rm --entrypoint certbot \
  certbot renew --webroot -w /var/lib/letsencrypt

echo "Certbot renewal completed."

echo "[2/3] Reloading NGINX in ${NGINX_CONTAINER}..."
docker exec "${NGINX_CONTAINER}" nginx -s reload || {
  echo "NGINX reload failed. Restarting container..."
  docker restart "${NGINX_CONTAINER}"
}

echo "NGINX reloaded."

echo "[3/3] Checking certificate expiration..."
docker compose -f "${COMPOSE_FILE}" run --rm --entrypoint certbot \
  certbot certificates

echo "----------------------------------------"
echo "SSL renewal process finished."
echo "----------------------------------------"
