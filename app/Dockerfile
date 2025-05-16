# Stage 1: Build with Node
FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve with NGINX
FROM nginx:alpine

# ✅ Ensure the directory exists so volume can mount here
RUN mkdir -p /etc/nginx/conf.d

# ✅ Clean the default HTML directory
RUN rm -rf /usr/share/nginx/html/*

# ✅ Copy the built app to the HTML directory
COPY --from=builder /app/dist /usr/share/nginx/html

# ✅ Expose ports
EXPOSE 80 443

# ✅ Start NGINX in foreground
CMD ["nginx", "-g", "daemon off;"]
