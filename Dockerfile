# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ALL deps (dev included for build)
COPY package*.json ./
RUN npm ci

# Copy source and TypeScript config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript -> dist/
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy server manifest (referenced by MCP tooling)
COPY server.json ./

# MCP servers communicate over stdio by default
CMD ["node", "dist/index.js"]
