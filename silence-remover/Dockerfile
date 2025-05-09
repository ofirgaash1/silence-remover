# Stage 1: Build the app with Node
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve with NGINX
FROM nginx:alpine

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy the built files from previous stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port and start
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
