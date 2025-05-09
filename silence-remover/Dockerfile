# Use the official NGINX image
FROM nginx:alpine

# Remove default static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built site to NGINX public directory
COPY dist/ /usr/share/nginx/html/

# Copy custom NGINX config if needed
# COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
