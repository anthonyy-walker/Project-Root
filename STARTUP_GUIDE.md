# Project Root - Setup & Startup Guide

## Authentication Status

✅ **Currently Authenticated**
- Account: Project Harvest
- Token expires: 2025-11-24 04:05:24 UTC (auto-refreshes)
- Location: `/root/Project-Root/data/tokenData.json`

## Token Management

### Check Token Status
```bash
cd /root/Project-Root/EpicGames
node -e "const auth = require('./auth/auth'); const t = auth.loadTokens(); console.log('Account:', t.displayName); console.log('Expires:', t.expires_at);"
```

### Re-authenticate (if needed)
```bash
cd /root/Project-Root/EpicGames
# 1. Get exchange code from: https://www.epicgames.com/id/api/redirect?clientId=ec684b8c687f479fadea3cb2ad83f5c6&responseType=code
# 2. Run:
node auth/authenticate.js <YOUR_EXCHANGE_CODE>
```

### Manual Token Refresh
```bash
cd /root/Project-Root/EpicGames
node -e "require('./auth/auth').refreshAccessToken().then(() => console.log('✅ Refreshed')).catch(e => console.error('❌', e.message));"
```

## Starting the Workers

### Start All Workers with PM2
```bash
cd /root/Project-Root
pm2 start ecosystem.config.js
```

### Monitor Workers
```bash
# View status
pm2 status

# View logs (all workers)
pm2 logs

# View specific worker
pm2 logs map-ingestion

# Real-time monitoring
pm2 monit
```

### Individual Worker Control
```bash
# Restart
pm2 restart map-ingestion
pm2 restart creator-ingestion
pm2 restart ccu-monitor
pm2 restart discovery-monitor
pm2 restart daily-aggregator

# Stop
pm2 stop map-ingestion

# Delete
pm2 delete map-ingestion
```

### Stop All Workers
```bash
pm2 stop all
pm2 delete all
```

## System Services

### Elasticsearch
```bash
sudo systemctl status elasticsearch
sudo systemctl restart elasticsearch
curl http://localhost:9200
```

### Kibana
```bash
# Check process
ps aux | grep kibana | grep -v grep

# Access
http://YOUR_SERVER_IP:5601

# Restart
pkill -f kibana
/opt/kibana/bin/kibana --allow-root > /root/Project-Root/logs/kibana.log 2>&1 &
```

## Worker Details

1. **map-ingestion** - Continuous map data ingestion
   - Processes all 266K maps in cycles
   - Auto-discovers new creators
   - No rate limit

2. **creator-ingestion** - Creator data ingestion (rate-limited)
   - 30 requests/minute (2-second delays)
   - Fetches POPS + creator page data
   - Tracks follower growth

3. **ccu-monitor** - Every 10 minutes
   - Monitors top 1000 maps
   - Auto-discovers new maps from playercount
   - Skips invalid (-1) values

4. **discovery-monitor** - Every 10 minutes
   - Scans all discovery surfaces
   - Detects ADDED/REMOVED/MOVED events
   - Auto-discovers new maps/creators

5. **daily-aggregator** - Cron at 00:00 UTC
   - Calculates 24h/7d/30d averages
   - Updates performance metrics
   - Creates daily snapshots

## Data Access

### Kibana
- URL: http://YOUR_SERVER_IP:5601
- No authentication required (dev mode)
- Use Dev Tools, Discover, and dashboards

### Elasticsearch Queries
```bash
# Count documents
curl http://localhost:9200/maps/_count
curl http://localhost:9200/creators/_count

# Search maps
curl -X GET "http://localhost:9200/maps/_search?size=10&pretty"

# Check indices
curl http://localhost:9200/_cat/indices?v
```

## Troubleshooting

### Workers won't start
- Check authentication: Token must be valid
- Check Elasticsearch: Must be running on port 9200
- Check logs: `pm2 logs <worker-name>`

### Out of Memory
- Elasticsearch heap: 1GB (configured in `/etc/elasticsearch/jvm.options.d/heap.options`)
- Monitor: `free -h`
- Restart ES if needed: `sudo systemctl restart elasticsearch`

### Token expired
- Auto-refresh should handle this
- If fails, re-authenticate with new exchange code

## Quick Start Commands

```bash
# Start everything
cd /root/Project-Root
pm2 start ecosystem.config.js
pm2 logs

# Check status in another terminal
curl http://localhost:9200/_cat/indices?v
curl http://localhost:5601/api/status

# Access Kibana
# http://YOUR_SERVER_IP:5601
```

## Current State

✅ Elasticsearch running (1GB heap)
✅ Kibana available on port 5601
✅ 266,865 maps indexed
✅ 160,726 creators indexed
✅ 10 indices created
✅ Authentication configured (expires 2025-11-24 04:05:24 UTC)
✅ All 5 workers ready with auth
✅ PM2 ecosystem configured

**System is ready to start!**
