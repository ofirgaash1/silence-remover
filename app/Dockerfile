# app/Dockerfile

# Stage 1: Build with Node
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy app source and build
COPY . .
RUN npm run build

# Stage 2: Serve with NGINX
FROM nginx:alpine

# Remove default HTML files
RUN rm -rf /usr/share/nginx/html/*

# Copy built static site
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
