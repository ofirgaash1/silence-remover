# app/Dockerfi

FROM nginx:alpine

# Remove default HTML files
RUN rm -rf /usr/share/nginx/html/*

# Copy built static site from build pipeline (downloaded artifact)
COPY dist /usr/share/nginx/html

HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD curl -f http://localhost || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
