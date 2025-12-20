# Fortnite Creative Data Collection - Docker Image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy package files
COPY package*.json ./
COPY EpicGames/package*.json ./EpicGames/

# Install dependencies
RUN npm install && \
    cd EpicGames && npm install && cd ..

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p /app/logs

# Create data directory for tokens
RUN mkdir -p /app/data

# Expose no ports (workers don't need incoming connections)

# Health check - verify PM2 is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD pm2 list | grep -q "online" || exit 1

# Start workers using PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
