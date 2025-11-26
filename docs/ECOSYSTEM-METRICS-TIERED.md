# Tiered Ecosystem Metrics Collection System

## Overview
A hybrid 3-tier system for collecting map metrics from Epic's Ecosystem API, optimized for rate limits while maintaining real-time data for active maps.

## Architecture

### Rate Limit Constraints
- **Sequential limit**: 7.19 req/sec (~432 req/min)
- **Parallel limit**: Concurrency of 2+ triggers 429 errors
- **Total capacity**: ~4,300 maps per 10 minutes

### Tier Structure

#### 🔥 Tier 1 - Hot Maps (Worker 5a)
- **Maps**: Top 1,000 by recent CCU activity
- **Collection**: Every 10 minutes
- **Data**: Last 10 minutes (1 ten-minute bucket)
- **Duration**: ~140 seconds per cycle
- **Use case**: Real-time trending/discovery, live performance tracking

#### 🌡️ Tier 2 - Warm Maps (Worker 5b)
- **Maps**: Next 12,000 moderately active maps
- **Collection**: Every 30 minutes (at :05 and :35)
- **Data**: Last 30 minutes (3 ten-minute buckets)
- **Duration**: ~28 minutes per cycle
- **Use case**: Near real-time monitoring for active maps

#### ❄️ Tier 3 - Cold Maps (Worker 5c)
- **Maps**: Remaining ~150,000 low/inactive maps
- **Collection**: Every 60 minutes (at :15) - **rotating subset**
- **Data**: Last 60 minutes (6 ten-minute buckets)
- **Subset**: ~25,872 maps per cycle
- **Duration**: ~58 minutes per cycle
- **Full rotation**: Every ~6 hours through all cold maps
- **Use case**: Eventually consistent data for inactive/dead maps

## Data Storage Strategy

### Storage Optimization
**Only non-null/non-zero values are saved**
- Reduces storage for inactive maps by 80-95%
- Cold maps with no activity generate zero documents
- Active metrics automatically stored

### Document Structure
```javascript
{
  _index: "map-metrics-history",
  _id: "{mapId}-{timestamp_ms}",
  map_id: "1234-5678-9012",
  timestamp: "2025-11-26T14:20:00.000Z",
  
  // Metrics (only if non-zero/non-null)
  peak_ccu: 150,
  unique_players: 450,
  plays: 523,
  minutes_played: 12500,
  avg_minutes_per_player: 27.78,
  favorites: 12,
  recommendations: 8,
  
  // Metadata
  tier: 1,  // 1=hot, 2=warm, 3=cold
  collection_cycle: "10min",  // "10min", "30min", "60min"
  data_source: "ecosystem_api",
  collected_at: "2025-11-26T14:22:35.000Z"
}
```

## Tier Classification

### Auto-promotion/demotion
Maps are reclassified on each cycle based on:
- Last 24 hours peak CCU (aggregated from `concurrent-users-*` index)
- Recent activity trends

### Classifier (`ecosystem-tier-classifier.js`)
```javascript
const { getMapTiers } = require('./ecosystem-tier-classifier');
const { tier1, tier2, tier3 } = await getMapTiers();
```

## Data Compaction

### Existing CCU Compaction (Worker 6)
The data-compactor already handles time-series data:
- 1 week old: 10min → 30min intervals
- 1 month old: 30min → 1 hour intervals  
- 1 year old: 1 hour → 12 hour intervals

### Ecosystem Metrics Compatibility
✅ **Fully compatible** - Individual 10-minute documents follow same timestamp-based structure as CCU data

The compactor will:
1. Delete non-aligned timestamps for older data
2. Keep :00, :30 timestamps (30min retention)
3. Keep :00 only (1hr retention)
4. Keep :00 at 00:00 and 12:00 (12hr retention)

## Graph Display

### 10-minute Granularity Maintained
Even though collection happens every 10/30/60 minutes, the API returns data in 10-minute buckets:

**Example**: 30-minute warm collection at 2:35 PM
```javascript
// API request
from: "2025-11-26T14:05:00.000Z"
to: "2025-11-26T14:35:00.000Z"
interval: "minute"

// Returns 3 buckets
[
  { timestamp: "14:10:00", peak_ccu: 50, ... },
  { timestamp: "14:20:00", peak_ccu: 48, ... },
  { timestamp: "14:30:00", peak_ccu: 52, ... }
]

// Each stored as separate document
// Graphs display smooth 10-minute resolution
```

## PM2 Management

### Start all workers
```bash
pm2 start ecosystem.config.js
```

### Start individual tiers
```bash
pm2 start ecosystem.config.js --only worker-5a-ecosystem-hot
pm2 start ecosystem.config.js --only worker-5b-ecosystem-warm
pm2 start ecosystem.config.js --only worker-5c-ecosystem-cold
```

### Monitor
```bash
pm2 list
pm2 logs worker-5a-ecosystem-hot
pm2 logs worker-5b-ecosystem-warm
pm2 logs worker-5c-ecosystem-cold
```

### Restart (to refresh tier classifications)
```bash
pm2 restart worker-5a-ecosystem-hot
pm2 restart worker-5b-ecosystem-warm
pm2 restart worker-5c-ecosystem-cold
```

## Timing Offsets

Workers are offset to avoid API conflicts:
- **Hot (5a)**: Every 10 minutes at :00, :10, :20, :30, :40, :50
- **Warm (5b)**: Every 30 minutes at :05, :35
- **Cold (5c)**: Every 60 minutes at :15

## Cold Maps Rotation State

Worker 5c maintains rotation state in `/data/cold-maps-state.json`:
```json
{
  "currentIndex": 25872,
  "totalMaps": 155234,
  "lastRun": "2025-11-26T14:15:00.000Z",
  "cyclesCompleted": 2
}
```

To reset rotation (start from beginning):
```bash
rm /root/Project-Root/data/cold-maps-state.json
pm2 restart worker-5c-ecosystem-cold
```

## Performance Summary

| Tier | Maps | Cycle | Duration | Data Age | Use Case |
|------|------|-------|----------|----------|----------|
| Hot | 1,000 | 10 min | 2.3 min | 0-10 min | Real-time trending |
| Warm | 12,000 | 30 min | 28 min | 0-30 min | Active monitoring |
| Cold | ~26k/cycle | 60 min | 58 min | 1-6 hours | Inactive maps |

**Total API usage**: ~39,000 requests/hour (well under theoretical maximum)

## Advantages

✅ **Real-time data** for trending maps  
✅ **Near real-time** for active maps  
✅ **Storage efficient** (skip null/zero values)  
✅ **Graph quality** (10-min resolution maintained)  
✅ **Rate limit safe** (sequential requests only)  
✅ **Auto-scaling** (maps promoted/demoted based on activity)  
✅ **Eventually consistent** (all maps covered within 6 hours)  
✅ **Compatible** with existing compaction system
