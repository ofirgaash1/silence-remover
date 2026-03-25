#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_LINE="17 2,14 * * * cd ${SCRIPT_DIR} && bash ${SCRIPT_DIR}/renew-ssl.sh >> ${SCRIPT_DIR}/renew-ssl.log 2>&1"

tmp_file="$(mktemp)"
trap 'rm -f "${tmp_file}"' EXIT

crontab -l 2>/dev/null | grep -Fv "renew-ssl.sh" > "${tmp_file}" || true
printf '%s\n' "${CRON_LINE}" >> "${tmp_file}"
crontab "${tmp_file}"

echo "Installed crontab:"
crontab -l
