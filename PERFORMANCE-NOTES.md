# Performance Configuration Notes

## Player Counts Worker - 10 Minute Completion

### Calculation for 150,000 Creators

**Target**: Complete all creators in 10 minutes

**Math**:
- 150,000 creators ÷ 10 minutes = **15,000 creators/minute**
- 15,000 creators/minute ÷ 60 seconds = **250 creators/second**

**Configuration**:
- `BATCH_SIZE = 50` (creators per parallel batch)
- `BATCH_DELAY = 200ms` (0.2 seconds between batches)
- **Rate**: 50 creators / 0.2 seconds = **250 creators/second** ✅
- **Total Time**: 150,000 ÷ 15,000/min = **10 minutes exactly**

### Current Worker Settings

| Worker | Batch Size | Delay | Rate | Completion Time (150k) |
|--------|-----------|-------|------|----------------------|
| **maps-collector** | 100 maps | 6s | 1,000 maps/min | N/A (processes all maps) |
| **profiles-collector** | 15 creators | 60s | 900/hour | ~7 days |
| **maps-discovery** | 25 creators | 3s | 500/min | ~5 hours |
| **player-counts** | 50 creators | 0.2s | 15,000/min | **10 minutes** |
| **discovery-tracker** | N/A | 10 min | N/A | 10 minutes |

### OpenSearch Load Distribution

**Peak Load** (all workers running):
- **Writes/sec**: ~300-500 docs/sec
- **Reads/sec**: ~250 requests/sec (player-counts fetching)
- **Bulk Operations**: Every 2-4 seconds

**Safe for**:
- t3.medium.search (2 vCPU, 4GB RAM)
- t3.large.search (2 vCPU, 8GB RAM) - Recommended

### Memory Usage

| Worker | Expected RAM | Max Restart |
|--------|-------------|-------------|
| maps-collector | 256-512 MB | 512 MB |
| profiles-collector | 128-256 MB | 256 MB |
| maps-discovery | 128-256 MB | 256 MB |
| **player-counts** | **384-512 MB** | **512 MB** |
| discovery-tracker | 128-256 MB | 256 MB |

**Total EC2 RAM needed**: ~2GB for all workers + 512MB for system = **3GB minimum**

Recommended EC2: **t3.small** (2 vCPU, 2GB) or **t3.medium** (2 vCPU, 4GB)

### Timing Schedule

**Player Counts Worker**:
- Starts at: `:05, :15, :25, :35, :45, :55` (offset from :00 to avoid collision)
- Waits until: `:00, :10, :20, :30, :40, :50` (exact 10-min marks)
- Processes: 10 minutes
- Completes by: `:10, :20, :30, :40, :50, :00`
- Sleeps until: next cycle

**Other Workers**:
- Run continuously in loops with rate limiting
- Staggered startup (5-25s delays)

### If OpenSearch Still Struggles

**Reduce player-counts aggressiveness**:
```javascript
BATCH_SIZE = 30      // 150 creators/sec = 9k/min = 16 min completion
BATCH_DELAY = 200ms  
```

Or:
```javascript
BATCH_SIZE = 50      // 100 creators/sec = 6k/min = 25 min completion
BATCH_DELAY = 500ms  
```

**Or run at longer intervals**:
```javascript
cron_restart: '0,30 * * * *'  // Every 30 minutes instead of 10
```
