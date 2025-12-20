# Quick Start Guide

## Prerequisites

Before starting:
- ✅ Node.js 16+ installed
- ✅ Elasticsearch 8.x running on port 9200
- ✅ Epic Games account

## 1. Install Dependencies

```bash
npm install
```

## 2. Authenticate with Epic Games

**Step 1**: Get an exchange code

Visit this URL in your browser:
```
https://www.epicgames.com/id/api/redirect?clientId=ec684b8c687f479fadea3cb2ad83f5c6&responseType=code
```

**Step 2**: Login and copy the code

After logging in, you'll be redirected to a URL like:
```
https://www.epicgames.com/id/api/redirect?code=YOUR_EXCHANGE_CODE_HERE
```

Copy the `code` parameter value.

**Step 3**: Authenticate

```bash
cd EpicGames
node auth/authenticate.js YOUR_EXCHANGE_CODE_HERE
```

You should see:
```
✅ Authentication complete!
📝 Token saved to: data/tokenData.json
🔄 Automatic token refresh is now active
```

## 3. Configure Environment

Create a `.env` file in the project root:

```bash
# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Epic Games Configuration
FORTNITE_BRANCH=++Fortnite+Release-32.10-CL-35815136-Windows
EPIC_X_ACCESS_TOKEN=your_token_here

# Discovery Configuration (optional - defaults provided)
ALL_SURFACES=CreativeDiscoverySurface_Frontend,CreativeDiscoverySurface_Browse
MATCHMAKING_REGIONS=NAE,NAW,EU,OCE,BR,ASIA
```

## 4. Start Workers

### Using PM2 (Recommended)

```bash
# Install PM2 globally (if not already installed)
npm install -g pm2

# Start all workers
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs
```

### Manual Start (Development)

Start each worker in separate terminal windows:

```bash
# Terminal 1: Map ingestion
node workers/ingestion/maps-collector.js

# Terminal 2: Creator ingestion
node workers/ingestion/profiles-collector.js

# Terminal 3: Creator maps discovery
node workers/ingestion/maps-discovery.js

# Terminal 4: CCU monitor
node workers/monitoring/player-counts.js

# Terminal 5: Discovery monitor
node workers/monitoring/discovery-tracker.js
```

## Workers Overview

| Worker | Description | Frequency |
|--------|-------------|-----------|
| **maps-collector** | Fetches map metadata and tracks changes | Continuous |
| **profiles-collector** | Updates creator profiles and follower counts | Continuous |
| **maps-discovery** | Discovers new maps from creators | Every hour |
| **player-counts** | Records player counts | Every 10 min |
| **discovery-tracker** | Tracks featured map positions | Every 10 min |

## Token Management

### Check Token Status

```bash
cd EpicGames
node -e "const auth = require('./auth/auth'); const t = auth.loadTokens(); console.log('Account:', t.displayName); console.log('Expires:', t.expires_at);"
```

### Re-authenticate (if needed)

If your token expires or you need to re-authenticate:

```bash
cd EpicGames
# Get new exchange code from URL above, then:
node auth/authenticate.js YOUR_NEW_EXCHANGE_CODE
```

### Manual Token Refresh

Tokens auto-refresh, but you can manually refresh if needed:

```bash
cd EpicGames
node -e "require('./auth/auth').refreshAccessToken().then(() => console.log('✅ Refreshed')).catch(e => console.error('❌', e.message));"
```

## PM2 Commands

```bash
# View status of all workers
pm2 status

# View logs
pm2 logs                    # All workers
pm2 logs maps-collector      # Specific worker

# Restart workers
pm2 restart all             # All workers
pm2 restart maps-collector   # Specific worker

# Stop workers
pm2 stop all                # All workers
pm2 stop maps-collector      # Specific worker

# Delete workers (stops and removes from PM2)
pm2 delete all

# Real-time monitoring
pm2 monit
```

## Verify Everything is Working

### Check Elasticsearch

```bash
# Cluster health
curl http://localhost:9200/_cluster/health?pretty

# List indices
curl http://localhost:9200/_cat/indices?v

# Count documents
curl http://localhost:9200/maps/_count
curl http://localhost:9200/creators/_count
```

### Check Workers

```bash
# PM2 status
pm2 status

# Should show all 5 workers running:
# - maps-collector
# - profiles-collector
# - maps-discovery
# - player-counts
# - discovery-tracker
```

## Troubleshooting

### Workers won't start

**Authentication issues**:
```bash
# Check if token exists
ls -la data/tokenData.json

# Check token validity
cd EpicGames
node -e "const auth = require('./auth/auth'); console.log(auth.isTokenValid())"
```

**Elasticsearch connection**:
```bash
# Check if Elasticsearch is running
curl http://localhost:9200

# Check Elasticsearch status
curl http://localhost:9200/_cluster/health?pretty
```

**Check logs**:
```bash
pm2 logs <worker-name>
```

### Token expired

Tokens auto-refresh every 4 hours. If auto-refresh fails:

1. Check refresh token is valid (valid for 8 hours)
2. Re-authenticate with new exchange code
3. Restart workers: `pm2 restart all`

### High memory usage

Workers are configured with memory limits:
- maps-collector: 1GB max
- Others: 512MB max

View memory usage:
```bash
pm2 monit
```

If hitting limits:
- Adjust `max_memory_restart` in ecosystem.config.js
- Increase server RAM
- Use AWS EC2 larger instance

### Rate limiting errors

Check RATE_LIMITS.md for details. Workers respect rate limits by default:
- Links Service: 10 requests/minute
- POPS API: 30 requests/minute
- Others: No limits

## Next Steps

1. ✅ Workers are running
2. 📊 Access Elasticsearch data directly or through a UI like Kibana
3. 📈 Monitor worker logs: `pm2 logs`
4. 🚀 For production deployment, see README.md AWS section

## Support

- Check logs: `pm2 logs <worker-name>`
- Review RATE_LIMITS.md for API details
- Verify Elasticsearch health: `curl http://localhost:9200/_cluster/health?pretty`
