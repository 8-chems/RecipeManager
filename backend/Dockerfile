# ======================================
# Stage 1: Builder
# ======================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifest and install production deps
COPY package*.json ./
RUN npm ci --omit=dev

# ======================================
# Stage 2: Final runtime image
# ======================================
FROM node:20-alpine

WORKDIR /app

# Copy installed node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source files
COPY . .

# Cloud Run injects PORT automatically; default 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
