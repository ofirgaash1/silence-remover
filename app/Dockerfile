# app/Dockerfile

FROM nginx:alpine

# Remove default HTML files
RUN rm -rf /usr/share/nginx/html/*

# Copy built static site
COPY dist /usr/share/nginx/html

# prevent permission denied
RUN mkdir -p \
    /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /run \
 && chown -R nginx:nginx \
    /usr/share/nginx/html \
    /var/cache/nginx \
    /run

# Run as non-root
USER nginx

# Healthcheck to ensure container is alive
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD curl -f http://localhost || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
