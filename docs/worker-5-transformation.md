# Worker 5: Ecosystem Metrics Collector - Transformation Complete

## Overview
Worker 5 has been transformed from a daily aggregator (CCU averaging) into an **Ecosystem Metrics Collector** that scrapes official Epic Games API data to build unlimited historical metrics storage.

---

## What Changed

### Before (Daily Aggregator)
- Calculated 24h/7d/30d CCU averages from `concurrent-users-*` indexes
- Calculated creator follower growth from `creator-follower-history`
- Created discovery snapshots
- **Problem**: Limited to our own CCU snapshots (every 10 min), no retention data, no engagement metrics

### After (Ecosystem Metrics Collector)
- Fetches official metrics from Epic's Ecosystem API
- Stores: **peak CCU, unique players, plays, minutes played, avg session time, favorites, recommendations, retention (D1/D7)**
- Scrapes daily before 7-day window expires → **builds unlimited historical data**
- More reliable than Worker 3's CCU snapshots (official Epic data)

---

## Architecture

### Data Flow
```
Epic Ecosystem API (7-day rolling window)
         ↓ scrape daily at 1 AM UTC
map-metrics-history index (unlimited retention)
         ↓ future aggregation
map performance fields (30d/90d/1y trends)
```

### New Index: `map-metrics-history`
```json
{
  "map_id": "1234-5678-9012",
  "date": "2025-11-25",
  "timestamp": "2025-11-26T01:15:00.000Z",
  "metrics": {
    "peak_ccu": 559,
    "unique_players": 6527,
    "plays": 8814,
    "minutes_played": 211640,
    "avg_minutes_per_player": 32.43,
    "favorites": 192,
    "recommendations": 85,
    "retention_d1": 0.14,
    "retention_d7": 0.08
  },
  "data_source": "ecosystem_api"
}
```

**Document ID**: `{map_id}-{date}` (e.g., `8530-0110-2817-2025-11-25`)

---

## Key Features

### 1. Official Epic Data
- **Peak CCU**: Authoritative concurrent player counts (vs Worker 3's estimates)
- **Unique Players**: Actual player reach per day
- **Retention Metrics**: D1 and D7 retention rates (unavailable elsewhere)
- **Engagement**: Favorites, recommendations, session length

### 2. Historical Data Building
- API provides 7-day rolling window
- Worker scrapes daily → captures yesterday's data before it expires
- Result: **Unlimited historical data** (months/years of trends)

### 3. Batch Processing
- Processes 50 maps concurrently per batch
- 2-second delay between batches (rate limit protection)
- Handles 285K+ maps efficiently

### 4. Smart Data Handling
- Parses yesterday's complete data (most recent full day)
- Handles null values gracefully (maps with <5 players return null)
- Tracks no-data maps separately for reporting

---

## Configuration

### Schedule
- **Cron**: `0 1 * * *` (1 AM UTC daily)
- **Why 1 AM**: After Worker 4 (discovery monitor) completes, before peak traffic

### Performance
- **Batch Size**: 50 maps per batch
- **Delay**: 2 seconds between batches
- **Memory**: 1GB limit (increased from 500MB)
- **Estimated Duration**: ~2-3 hours for 285K maps

### Manual Execution
```bash
node workers/aggregation/daily-aggregator.js --run-now
```

---

## File Changes

### New Files
1. **`elasticsearch-mappings/5-map-metrics-history.json`**
   - Index schema for historical metrics storage
   - 2 shards, 1 replica
   - Optimized for time-series queries

### Modified Files
1. **`workers/aggregation/daily-aggregator.js`** (Complete rewrite)
   - Lines 1-18: Updated header + imports
   - Lines 23-76: `parseMetrics()` - extracts yesterday's data from API response
   - Lines 78-230: `collectMapMetrics()` - batch processing with Ecosystem API
   - Lines 232-260: `runDailyCollection()` - main execution wrapper
   - Lines 262-280: Cron schedule (1 AM UTC)

2. **`ecosystem.config.js`**
   - Worker name: `worker-5-daily-aggregator` → `worker-5-ecosystem-metrics`
   - Memory limit: 500M → 1G
   - Log files: `worker-5-aggregator-*` → `worker-5-ecosystem-*`

3. **`EpicGames/apis/ecosystemAPI.js`** (Already existed)
   - Official Epic Games Ecosystem API client
   - OAuth2 authentication with automatic token refresh
   - Rate limit handling (429 detection)
   - 404 handling for maps with no data

---

## Benefits vs Old Approach

| Aspect | Old (CCU Aggregator) | New (Ecosystem Metrics) |
|--------|---------------------|------------------------|
| **Data Source** | Our CCU snapshots (10 min intervals) | Official Epic API |
| **Metrics Available** | CCU only | CCU + 8 engagement metrics |
| **Reliability** | Depends on Worker 3 uptime | Epic's official infrastructure |
| **Retention Data** | ❌ Not available | ✅ D1 and D7 retention |
| **Session Length** | ❌ Not available | ✅ Average minutes per player |
| **Player Reach** | ❌ Not available | ✅ Unique players + plays |
| **Social Metrics** | ❌ Not available | ✅ Favorites + recommendations |
| **Historical Depth** | Limited to our CCU snapshots | Unlimited (scrape daily) |

---

## Future Enhancements

### Phase 1: Aggregation Layer (Next)
Create new aggregation worker to calculate:
- 30-day average metrics (peak CCU, unique players, etc.)
- 90-day trends
- 1-year trends
- Growth rates (week-over-week, month-over-month)

### Phase 2: Replace Worker 3 (CCU Monitor)
- Worker 3 becomes redundant once we trust Ecosystem API data
- Can deprecate `concurrent-users-*` indexes
- Reduces system complexity and storage costs

### Phase 3: Discovery Correlation
- Cross-reference `map-metrics-history` with `discovery-events`
- Analyze: "What happens to metrics when map enters/exits discovery?"
- Calculate ROI of discovery placement

### Phase 4: Creator Analytics
- Aggregate map metrics to creator level
- Total unique players across all creator maps
- Creator retention rates (weighted average)
- Creator engagement score

---

## Monitoring

### Success Indicators
```bash
# Check if metrics are being collected
curl -X GET "http://159.89.229.112:9200/map-metrics-history/_count"

# View recent metrics
curl -X GET "http://159.89.229.112:9200/map-metrics-history/_search?size=5&sort=timestamp:desc&pretty"

# Check specific map's history
curl -X GET "http://159.89.229.112:9200/map-metrics-history/_search?q=map_id:8530-0110-2817&sort=date:desc&pretty"
```

### Logs
```bash
pm2 logs worker-5-ecosystem-metrics
```

Expected output:
```
Collecting metrics from Ecosystem API...
Found 285539 maps to process

Processing batch 1 (50 maps)...
Processing batch 2 (50 maps)...
...

✓ Metrics Collection Complete:
  Successful: 12,453
  No Data: 273,086
  Failed: 0
```

---

## API Documentation

### Ecosystem API Endpoints Used
- **Base URL**: `https://api.fortnite.com/ecosystem/v1`
- **Endpoint**: `/islands/{code}/metrics`
- **Authentication**: OAuth2 Bearer token
- **Rate Limits**: Unknown (handle 429 responses)
- **Data Window**: 7 days (rolling)

### Metrics Available
1. **peakCCU** - Peak concurrent players (all intervals)
2. **uniquePlayers** - Unique player count (all intervals)
3. **plays** - Total plays/sessions (all intervals)
4. **minutesPlayed** - Total playtime (all intervals)
5. **averageMinutesPerPlayer** - Avg session length (day/hour only)
6. **favorites** - Times added to favorites (all intervals)
7. **recommendations** - Times recommended (all intervals)
8. **retention** - D1 and D7 retention rates (day only)

---

## Notes

### API Limitations
- **7-day window**: Historical data limited to last 7 days (why we scrape daily)
- **5 player minimum**: Maps with <5 players return null values
- **Epic-made maps**: Some first-party maps return 0 for favorites/recommendations
- **Public only**: Only discoverable/public islands included

### Storage Considerations
- **285K maps × 365 days = 104M documents/year**
- At ~500 bytes per document ≈ **52GB/year**
- Consider retention policy after 2-3 years of data

### Rate Limit Strategy
- 50 maps per batch
- 2-second delay between batches
- Processes 1,500 maps/min (assuming instant API response)
- Total runtime: ~190 minutes for full dataset

---

## Related Documentation
- Epic Ecosystem API: `/docs/ecosystemAPI.md`
- Index Mappings: `/elasticsearch-mappings/5-map-metrics-history.json`
- PM2 Config: `/ecosystem.config.js`
- Worker Code: `/workers/aggregation/daily-aggregator.js`

---

## Questions?

**Q: Why not run at midnight UTC like before?**  
A: Running at 1 AM gives Worker 4 (discovery monitor) time to complete its snapshots first. Also avoids potential midnight UTC traffic spikes.

**Q: What happens if Worker 5 misses a day?**  
A: We lose that day's metrics permanently (7-day window). Consider adding alerting for Worker 5 failures.

**Q: Can we backfill historical data?**  
A: No. API only provides last 7 days. That's why daily scraping is critical.

**Q: Why keep Worker 3 (CCU monitor)?**  
A: For now, as backup. Worker 3 provides real-time CCU tracking (10 min intervals) vs Worker 5's daily summaries. Once we trust Ecosystem API, Worker 3 can be deprecated.

**Q: How do we know if Ecosystem API data is accurate?**  
A: Cross-reference with Worker 3's peak CCU for a few weeks. Compare values to build confidence before deprecating Worker 3.
