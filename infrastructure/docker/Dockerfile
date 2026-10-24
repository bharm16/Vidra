# Multi-stage build for production-ready Node.js application
# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# bash is needed by scripts/download-models.sh (uses [[ ]], BASH_SOURCE,
# set -o pipefail). node:20-alpine ships with sh only.
RUN apk add --no-cache bash

# Copy package files (root + workspace packages so `workspace:*`
# references in package.json resolve during `npm ci`)
COPY package*.json ./
COPY packages ./packages

# Install dependencies
# --ignore-scripts: skip lifecycle scripts, which are irrelevant in a
# production container.
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Download model assets during build (cached when inputs are unchanged)
COPY scripts/download-models.sh ./scripts/download-models.sh
COPY scripts/lib/modelDownloadPath.ts ./scripts/lib/modelDownloadPath.ts
ARG SPAN_LABELING_MODELS_GCS_URI
ENV SPAN_LABELING_MODELS_GCS_URI=${SPAN_LABELING_MODELS_GCS_URI}
RUN chmod +x ./scripts/download-models.sh && ./scripts/download-models.sh

# Copy only runtime inputs. Local credentials and unrelated checkout files
# cannot enter the image through a broad root-context copy.
COPY tsconfig.json ./
COPY server ./server
COPY shared ./shared

# Stage 2: Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies:
# - dumb-init: proper signal handling
# - ffmpeg: provides ffmpeg + ffprobe for continuity frame extraction
# - procps: ps -o rss= -p supports the native worker RSS monitor
RUN apk add --no-cache dumb-init ffmpeg procps

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy built application from builder (includes downloaded model assets)
COPY --from=builder --chown=nodejs:nodejs /app ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application (tsx runs TypeScript directly)
CMD ["npx", "tsx", "--tsconfig", "server/tsconfig.json", "server/index.ts"]
