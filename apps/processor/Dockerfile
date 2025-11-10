# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.18.2

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/processor ./apps/processor

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the processor
WORKDIR /app/apps/processor
RUN pnpm build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.18.2

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/processor ./apps/processor

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=builder /app/apps/processor/dist ./apps/processor/dist
COPY --from=builder /app/packages ./packages

WORKDIR /app/apps/processor

# Start the application
CMD ["node", "dist/index.js"]

