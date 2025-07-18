# app/Dockerfi

FROM nginx:alpine

# Remove default HTML files
RUN rm -rf /usr/share/nginx/html/*

# Copy built static site
COPY dist /usr/share/nginx/html

# Set ownership to nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html

# Run as non-root
USER nginx

HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD curl -f http://localhost || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
