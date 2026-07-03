# ======================================
# Stage 1: Build the Vite React app
# ======================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .

# VITE_API_BASE_URL can be set at build time via --build-arg
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ======================================
# Stage 2: Serve with nginx
# ======================================
FROM nginx:1.25-alpine

# Copy compiled static files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config for SPA (React Router history mode support)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
