# Performance Tuning Guide

## Problem: OpenSearch CPU Spike & EC2 Crashes

### Root Causes
1. **Massive scroll operations** - Loading 10,000 docs at once
2. **Large bulk inserts** - 1,000 docs per bulk request
3. **All workers starting simultaneously** - Overwhelming OpenSearch
4. **No connection limits** - Unlimited concurrent requests
5. **Player-counts worker** - 100 parallel requests every 10 minutes

### Solutions Applied

#### 1. Worker Configuration Changes
- **maps-collector**: Scroll 1000→1000, Bulk 1000→250
- **profiles-collector**: Batch 24→15
- **maps-discovery**: Batch 50→25, Delay 2s→3s  
- **player-counts**: Batch 100→20, Delay 300ms→2s, Bulk 500→200

#### 2. OpenSearch Client Limits
```javascript
{
  maxRetries: 3,
  requestTimeout: 30000,
  compression: true,
  maxResponseSize: 50000000 // 50MB
}
```

#### 3. PM2 Staggered Startup
- Workers start with 5-second delays
- Memory limits: 256M-512M per worker
- Auto-restart on memory threshold

### OpenSearch Cluster Recommendations

#### Minimum Configuration (AWS)
- **Instance Type**: `t3.medium.search` or larger
- **JVM Heap**: 50% of RAM (max 32GB)
- **Disk**: GP3 with at least 100 IOPS/GB
- **Shards**: 1-2 shards per index for <10M docs

#### Recommended Settings
```json
{
  "index.refresh_interval": "30s",
  "index.number_of_replicas": 0,
  "index.translog.durability": "async",
  "index.translog.flush_threshold_size": "512mb"
}
```

#### Monitor These Metrics
1. **CPU Usage** - Should stay <70%
2. **JVM Heap** - Should stay <85%
3. **Queue Rejections** - Should be 0
4. **Search Latency** - Should be <200ms
5. **Indexing Rate** - Aim for 5k-10k docs/sec max

### Scaling Strategy

#### If Still Having Issues

**Option 1: Reduce Worker Frequency**
```javascript
// Run workers less frequently
maps-collector: every 2 hours
profiles-collector: every 4 hours
maps-discovery: every 2 hours
```

**Option 2: Run Workers Sequentially**
```bash
# Use cron or PM2 cron_restart instead of parallel
pm2 start ecosystem.config.js --only maps-collector
# Wait 30 minutes
pm2 start ecosystem.config.js --only profiles-collector
```

**Option 3: Upgrade OpenSearch**
- Scale to `t3.large.search` or `r6g.large.search`
- Add more data nodes (distribute load)

### Safe Testing Procedure

1. **Start One Worker at a Time**
```bash
pm2 start ecosystem.config.js --only maps-collector
# Monitor for 5 minutes
pm2 monit
```

2. **Watch OpenSearch Metrics**
```bash
# Check cluster health
curl -u user:pass https://your-opensearch/_cluster/health?pretty

# Check node stats
curl -u user:pass https://your-opensearch/_nodes/stats/jvm,indices?pretty
```

3. **Add Workers Gradually**
```bash
# If stable, add next worker
pm2 start ecosystem.config.js --only profiles-collector
# Monitor again...
```

### Emergency Procedures

#### If OpenSearch CPU hits 100%
```bash
# Stop all workers immediately
pm2 stop all

# Clear any stuck scroll contexts
curl -X DELETE "https://your-opensearch/_search/scroll/_all"

# Wait for OpenSearch to stabilize (CPU < 30%)
# Then restart workers one at a time
```

#### If EC2 runs out of memory
```bash
# Add swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Long-term Optimization

1. **Implement Index Templates** - Pre-configure shard count
2. **Use Index Lifecycle Management** - Auto-delete old time-series data
3. **Enable Circuit Breakers** - Prevent OOM scenarios
4. **Add Monitoring** - CloudWatch or Grafana dashboards
5. **Consider Data Hot/Warm Architecture** - Move old data to cheaper storage

### Current Safe Limits
- **Maps Collector**: ~250 docs/6 seconds = 2,500 docs/min
- **Profiles Collector**: ~15 docs/60 seconds = 900 docs/hour  
- **Maps Discovery**: ~25 creators/3 seconds = 500 creators/min
- **Player Counts**: ~20 creators/2 seconds = 600 creators/min

These limits should allow **~150,000 creators** to be processed without overwhelming OpenSearch.
