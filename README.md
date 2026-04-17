# Silence Remover

Production site: [https://silence-remover.com](https://silence-remover.com)

GitHub Pages preview: [https://ofirgaash1.github.io/silence-remover/](https://ofirgaash1.github.io/silence-remover/)

![Silence Remover](./image.png)

## Purpose

Silence Remover is a browser-based editor for trimming silent sections from audio and video files.
It is designed to be fast and simple: upload a file, detect or adjust silence regions, and export a shorter result as MP3 or MP4.

## Production Runbook

## Deployment path

- Production deploys run through GitHub Actions on the self-hosted `ec2` runner.
- The source of truth is `.github/workflows/deploy.yml`.
- The production stack is defined in `docker-compose.prod.yml`.
- GitHub Pages is a manual preview path only and is not the production deployment target.

## Normal deploy

- Push to the `com` branch, or run the workflow manually from GitHub Actions.
- The workflow builds the image, recreates `web` and `certbot`, sets restart policies, and reinstalls the renewal cron job.
- `web` and `certbot` must both be running. Deploying only `web` can leave certificate renewal broken.

## GitHub Pages preview

- GitHub Pages previews are manual-only and use `.github/workflows/deploy-pages.yml`.
- Use Pages only when you want a static preview build at `ofirgaash1.github.io/silence-remover/`.
- Do not treat the Pages deployment as production.

## SSL layout

- `docker-compose.prod.yml` shares the named `certbot-etc` volume between `web` and `certbot`.
- nginx reads the live certificate from `/etc/letsencrypt/live/silence-remover.com/`.
- The nginx config is baked into the image from `app/nginx.conf`, not from a host-specific bind mount.

## Renewal

- `renew-ssl.sh` renews certificates with certbot, then reloads nginx.
- `install-renew-cron.sh` installs the renewal cron job idempotently.
- The expected cron entry is:
  `17 2,14 * * * cd /home/ubuntu/silence-remover && bash /home/ubuntu/silence-remover/renew-ssl.sh >> /home/ubuntu/silence-remover/renew-ssl.log 2>&1`

## New machine or rebuilt machine

- Install Docker and Docker Compose on the target machine.
- Set up the self-hosted GitHub Actions runner.
- Point DNS for `silence-remover.com` and `www.silence-remover.com` to the new machine.
- Open inbound port `80` and `443`.
- Run the initial certificate bootstrap:
  `LETSENCRYPT_EMAIL=ops@example.com bash ./bootstrap-ssl.sh`
- After bootstrap succeeds, normal GitHub Actions deploys are enough.

## If the certificate expired

- Symptom: the browser shows `net::ERR_CERT_DATE_INVALID`.
- SSH to the server and run:
  `cd /home/ubuntu/silence-remover && bash ./renew-ssl.sh`
- Verify certbot sees a valid certificate:
  `docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certificates`
- Verify the site serves the renewed certificate:
  `curl -Iv https://silence-remover.com`
- If renewal succeeds but the site still serves an old cert, reload or restart the web container:
  `docker exec silence-remover nginx -s reload || docker restart silence-remover`

## First checks during an outage

- `docker ps`
- `crontab -l`
- `docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certificates`
- `curl -Iv https://silence-remover.com`
