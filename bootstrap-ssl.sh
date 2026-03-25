#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
DOMAIN="${DOMAIN:-silence-remover.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.silence-remover.com}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

if [[ -z "${LETSENCRYPT_EMAIL}" ]]; then
  echo "LETSENCRYPT_EMAIL is required."
  echo "Example: LETSENCRYPT_EMAIL=ops@example.com bash ${SCRIPT_DIR}/bootstrap-ssl.sh"
  exit 1
fi

cd "${SCRIPT_DIR}"

echo "Starting initial SSL bootstrap for ${DOMAIN}..."
echo "This requires DNS for ${DOMAIN} and ${WWW_DOMAIN} to point to this machine and port 80 to be reachable."

echo "[1/5] Ensuring compose volumes exist..."
docker compose -f "${COMPOSE_FILE}" up -d certbot

ETC_VOL="$(docker inspect certbot -f '{{range .Mounts}}{{if eq .Destination "/etc/letsencrypt"}}{{.Name}}{{end}}{{end}}')"
VAR_VOL="$(docker inspect certbot -f '{{range .Mounts}}{{if eq .Destination "/var/lib/letsencrypt"}}{{.Name}}{{end}}{{end}}')"

if [[ -z "${ETC_VOL}" || -z "${VAR_VOL}" ]]; then
  echo "Could not detect certbot volumes."
  exit 1
fi

echo "[2/5] Stopping web if it is already running..."
docker rm -f silence-remover 2>/dev/null || true

echo "[3/5] Requesting initial certificate via standalone HTTP challenge..."
docker run --rm -p 80:80 \
  -v "${ETC_VOL}:/etc/letsencrypt" \
  -v "${VAR_VOL}:/var/lib/letsencrypt" \
  certbot/certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email "${LETSENCRYPT_EMAIL}" \
  -d "${DOMAIN}" \
  -d "${WWW_DOMAIN}"

echo "[4/5] Starting production services..."
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate web certbot

echo "[5/5] Installing renewal cron..."
bash "${SCRIPT_DIR}/install-renew-cron.sh"

echo "Initial SSL bootstrap finished."
