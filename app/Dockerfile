# Stage 1: Build with Node
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy full source and build the app
COPY . .
RUN npm run build

# Stage 2: Serve with NGINX
FROM nginx:alpine

# ✅ Remove default HTML content
RUN rm -rf /usr/share/nginx/html/*

# ✅ Copy custom NGINX config into image
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ✅ Copy built frontend app
COPY --from=builder /app/dist /usr/share/nginx/html

# ✅ Expose ports for HTTP/HTTPS
EXPOSE 80 443

# ✅ Start NGINX in foreground
CMD ["nginx", "-g", "daemon off;"]
