# Stage 1: Build with Node
FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve with NGINX
FROM nginx:alpine

# ✅ FIX: Ensure mount point isn't a directory
RUN rm -rf /etc/nginx/nginx.conf \
    && rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
