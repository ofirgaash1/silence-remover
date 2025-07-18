#!/bin/bash

source /etc/github-deploy.env

# Waiting for network (optional if needed)
until ping -c1 github.com &>/dev/null; do
  echo "[INFO] Waiting for network..."
  sleep 2
done

# Trigger deploy workflow from this VM
echo "[INFO] Triggering GitHub deploy workflow..."

curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_PAT" \
  https://api.github.com/repos/ofirgaash1/silence-remover/dispatches \
  -d '{"event_type":"trigger-deploy", "client_payload": {"tag": "latest"}}'

echo "[INFO] Deploy triggered from rc.local"