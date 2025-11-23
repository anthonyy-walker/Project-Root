# Discovery Data: Flow & Storage Strategy

## 📥 How Discovery Data is Collected

### 1. Data Structure from Epic API

**Three-Level Hierarchy:**
```
Surface (16 total)
  └─ Panel (193 total)
       └─ Item/Map (2,436 unique items)
```

**Example Flow:**
```
Surface: CreativeDiscoverySurface_Browse
  ├─ Panel: Featured_Nested
  │    ├─ Item: 8530-0110-2817 (regions: NAE, EU, OCE)
  │    ├─ Item: 1234-5678-9012 (regions: NAE, NAW)
  │    └─ Item: 9876-5432-1098 (regions: ALL)
  │
  ├─ Panel: Popular_ThisWeek
  │    ├─ Item: 5555-6666-7777
  │    └─ ...
  └─ ...
```

### 2. API Response Structure

**Surface Panels API** (`/discovery/surface/{surface}`):
```json
{
  "testVariantName": "DEFAULT NO TARGET",
  "panels": [
    {
      "panelName": "Featured_Nested",
      "panelDisplayName": "Featured",
      "panelType": "CuratedList",
      "panelSubtitle": "Hand-picked maps"
    }
  ]
}
```

**Panel Pages API** (`/discovery/surface/{surface}/page`):
```json
{
  "results": [
    {
      "linkCode": "8530-0110-2817",
      "lastVisited": null,
      "isFavorite": false,
      "globalCCU": -1,
      "lockStatus": "UNLOCKED",
      "isVisible": true
    }
  ],
  "hasMore": true
}
```

### 3. Our Client Collection Process

**Current Implementation:**
```javascript
// discoveryClient.js

// STEP 1: Fetch all 16 surfaces in PARALLEL
fetchEverything() {
  const surfacePromises = ALL_SURFACES.map(surface => 
    fetchCompleteDiscovery(surface)
  );
  await Promise.all(surfacePromises);
}

// STEP 2: For each surface, fetch all panels in PARALLEL
fetchCompleteDiscovery(surfaceName) {
  const panels = await fetchDiscoveryPanels(surfaceName);
  
  const panelPromises = panels.map(panel =>
    fetchPanelPages(surfaceName, panel.panelName)
  );
  
  await Promise.all(panelPromises);
}

// STEP 3: For each panel, fetch 8 regions in PARALLEL
fetchPanelPages(surfaceName, panelName) {
  const regionPromises = MATCHMAKING_REGIONS.map(region =>
    fetchRegionPage(panelName, region)
  );
  
  const results = await Promise.all(regionPromises);
  
  // DEDUPLICATION: Remove duplicate linkCodes across regions
  return deduplicateByLinkCode(results);
}
```

**Performance:**
- 16 surfaces × 8 regions × 193 panels = ~1,500 requests
- Completes in ~24-30 seconds (ultra-parallel)
- Returns 2,436 unique items (deduplicated by linkCode)

---

## 💾 Database Storage Strategy

### Problem: Volume Over Time

**Raw Data Volume:**
- Snapshots every 10 minutes = 144 snapshots/day
- 2,436 items × 144 snapshots = 350,784 records/day
- 30 days = 10,523,520 records (~2GB)
- 1 year = 127,944,000 records (~25GB)

**This is too much!** Need smart aggregation.

---

## 🗄️ Proposed Storage Architecture

### Strategy 1: Event-Based Storage (RECOMMENDED)

**Store changes only, not full snapshots**

#### Table: `discovery_events`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique event ID |
| `timestamp` | DateTime | When change occurred |
| `mapCode` | String | Map code (indexed) |
| `surfaceName` | String | Surface name |
| `panelName` | String | Panel name |
| `panelDisplayName` | String | Display name |
| `eventType` | Enum | `ADDED` \| `REMOVED` \| `MOVED` |
| `position` | Integer | Position in panel (1-50) |
| `previousPosition` | Integer | Previous position (for MOVED) |
| `regions` | JSON Array | Regions where visible |

**Storage:** ~100-500 events/day (only changes) = **10MB/month** ✅

**Example Records:**
```json
// Map added to Featured
{
  "timestamp": "2025-11-23T14:30:00Z",
  "mapCode": "8530-0110-2817",
  "surfaceName": "CreativeDiscoverySurface_Browse",
  "panelName": "Featured_Nested",
  "eventType": "ADDED",
  "position": 1,
  "regions": ["NAE", "EU", "OCE"]
}

// Map moved within Featured (position change)
{
  "timestamp": "2025-11-23T18:00:00Z",
  "mapCode": "8530-0110-2817",
  "eventType": "MOVED",
  "position": 3,
  "previousPosition": 1
}

// Map removed from Featured
{
  "timestamp": "2025-11-24T10:00:00Z",
  "mapCode": "8530-0110-2817",
  "eventType": "REMOVED"
}
```

**How to Detect Changes:**
```javascript
// Compare current snapshot to previous snapshot
const changes = [];

// Check for ADDED maps
currentSnapshot.forEach(item => {
  if (!previousSnapshot.has(item.mapCode)) {
    changes.push({ type: 'ADDED', ...item });
  } else if (item.position !== previousSnapshot.get(item.mapCode).position) {
    changes.push({ type: 'MOVED', ...item });
  }
});

// Check for REMOVED maps
previousSnapshot.forEach(item => {
  if (!currentSnapshot.has(item.mapCode)) {
    changes.push({ type: 'REMOVED', mapCode: item.mapCode });
  }
});

// Only insert changes
await db.insert('discovery_events', changes);
```

---

### Strategy 2: Snapshot + Diff Storage (HYBRID)

**Combine full snapshots with event tracking**

#### Table: `discovery_snapshots`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Snapshot ID |
| `timestamp` | DateTime | Snapshot time |
| `frequency` | Enum | `HOURLY` \| `DAILY` \| `WEEKLY` |
| `data` | JSON (compressed) | Full snapshot data |

**Retention:**
- **Hourly**: Keep 48 hours (48 snapshots × 2MB = 96MB)
- **Daily**: Keep 90 days (90 × 2MB = 180MB)
- **Weekly**: Keep forever (~104 snapshots/year × 2MB = 208MB/year)

#### Table: `discovery_events` (same as Strategy 1)

**Storage:** ~400MB first year, ~200MB/year after ✅

**Benefits:**
- Can reconstruct ANY point in time (hourly for 48h, daily for 90d)
- Event log for detailed analytics
- Efficient storage

---

### Strategy 3: Current State + History (SIMPLE)

**Store current state + historical positions**

#### Table: `discovery_current`

| Field | Type | Description |
|-------|------|-------------|
| `mapCode` | String (PK) | Map code |
| `surfaceName` | String (PK) | Surface name |
| `panelName` | String (PK) | Panel name |
| `position` | Integer | Current position |
| `regions` | JSON Array | Visible regions |
| `firstSeen` | DateTime | First discovered |
| `lastSeen` | DateTime | Last seen |
| `totalAppearances` | Integer | Times appeared |

**Update every 10 minutes (upsert)**

#### Table: `discovery_history`

| Field | Type | Description |
|-------|------|-------------|
| `mapCode` | String | Map code (indexed) |
| `surfaceName` | String | Surface name |
| `panelName` | String | Panel name |
| `date` | Date | Date (not time) |
| `avgPosition` | Float | Average position that day |
| `appearances` | Integer | Times seen that day |
| `regions` | JSON Array | Regions appeared in |

**Aggregated daily (end of day job)**

**Storage:** 
- Current: ~2,436 rows × 1KB = 2.4MB (constant)
- History: ~2,436 rows/day = 900KB/day = 27MB/month = **324MB/year** ✅

---

## 🎯 Recommended Approach: Strategy 1 + Strategy 3

**Combine event-based + current state:**

### Tables:

**1. `discovery_current`** (real-time state)
- Fast queries: "What's in Featured right now?"
- Updated every 10 minutes
- ~2.4MB constant size

**2. `discovery_events`** (change log)
- Track all additions/removals/moves
- Answer: "When did this map enter Featured?"
- ~10MB/month

**3. `discovery_daily_summary`** (aggregated analytics)
- Daily rollup at midnight
- Answer: "What was featured on Nov 15?"
- ~27MB/month

**Total Storage:** ~40MB/month = **480MB/year** ✅

---

## 📊 Query Patterns & Indexes

### Queries We Need to Support:

**1. Current Discovery State**
```sql
-- What's in Featured right now?
SELECT * FROM discovery_current
WHERE panelName = 'Featured_Nested'
ORDER BY position ASC;

-- Index: (panelName, position)
```

**2. Map Discovery History**
```sql
-- When was this map featured?
SELECT * FROM discovery_events
WHERE mapCode = '8530-0110-2817'
  AND panelName = 'Featured_Nested'
ORDER BY timestamp DESC;

-- Index: (mapCode, panelName, timestamp)
```

**3. Position Tracking**
```sql
-- How has position changed over time?
SELECT date, avgPosition FROM discovery_daily_summary
WHERE mapCode = '8530-0110-2817'
  AND panelName = 'Featured_Nested'
ORDER BY date DESC;

-- Index: (mapCode, panelName, date)
```

**4. Panel Analytics**
```sql
-- How often does a panel change?
SELECT panelName, COUNT(*) as changes
FROM discovery_events
WHERE timestamp >= NOW() - INTERVAL 7 DAYS
GROUP BY panelName;

-- Index: (timestamp, panelName)
```

---

## ⚡ Implementation Plan

### Phase 1: Basic Storage (Week 1)

```javascript
// worker/discoveryWorker.js

async function collectDiscovery() {
  const snapshot = await discoveryClient.fetchEverything();
  
  // Save to discovery_current (upsert)
  for (const surface of snapshot.surfaces) {
    for (const panel of surface.panels) {
      for (const item of panel.items) {
        await db.upsert('discovery_current', {
          mapCode: item.linkCode,
          surfaceName: surface.surface,
          panelName: panel.panelName,
          position: item.position,
          regions: item.regions,
          lastSeen: new Date()
        }, ['mapCode', 'surfaceName', 'panelName']);
      }
    }
  }
}

// Run every 10 minutes
setInterval(collectDiscovery, 10 * 60 * 1000);
```

### Phase 2: Change Detection (Week 2)

```javascript
async function collectDiscoveryWithChanges() {
  const previousSnapshot = await loadPreviousSnapshot();
  const currentSnapshot = await discoveryClient.fetchEverything();
  
  const changes = detectChanges(previousSnapshot, currentSnapshot);
  
  // Save events
  for (const change of changes) {
    await db.insert('discovery_events', {
      timestamp: new Date(),
      mapCode: change.mapCode,
      eventType: change.type, // ADDED, REMOVED, MOVED
      ...change.data
    });
  }
  
  // Update current state
  await updateCurrentState(currentSnapshot);
  
  // Cache for next comparison
  await saveSnapshot(currentSnapshot);
}
```

### Phase 3: Daily Aggregation (Week 3)

```javascript
// Run at 00:00 UTC daily
async function aggregateDaily() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Aggregate events from yesterday
  const summary = await db.query(`
    SELECT 
      mapCode,
      surfaceName,
      panelName,
      AVG(position) as avgPosition,
      COUNT(*) as appearances,
      JSON_AGG(DISTINCT region) as regions
    FROM discovery_events
    WHERE DATE(timestamp) = ?
    GROUP BY mapCode, surfaceName, panelName
  `, [yesterday]);
  
  await db.insert('discovery_daily_summary', summary);
}
```

---

## 🔍 API Endpoints Impact

### Updated Endpoints:

**Current State:**
```
GET /discovery/:surface?panel=PanelName
→ Query: discovery_current table
→ Response time: <10ms
```

**Historical Placements:**
```
GET /discovery/:surface/history?days=30&panel=PanelName
→ Query: discovery_daily_summary table (30 rows)
→ Response time: <50ms
```

**Map Discovery Timeline:**
```
GET /maps/:code/discovery
→ Query: discovery_events WHERE mapCode = :code
→ Shows all panels map has appeared in
→ Response time: <100ms
```

---

## 📈 Storage Growth Projection

| Time | Events | Current | Daily Summary | Total |
|------|--------|---------|---------------|-------|
| 1 week | 5MB | 2.4MB | 7MB | **14MB** |
| 1 month | 10MB | 2.4MB | 27MB | **40MB** |
| 3 months | 30MB | 2.4MB | 81MB | **113MB** |
| 1 year | 120MB | 2.4MB | 324MB | **446MB** |
| 5 years | 600MB | 2.4MB | 1.6GB | **2.2GB** |

**Conclusion:** Manageable growth! ✅

---

## 🎯 Key Decisions

**✅ DO:**
- Store events (changes only), not full snapshots every 10 min
- Keep current state in separate table for fast queries
- Aggregate daily for historical analysis
- Index by mapCode, panelName, timestamp

**❌ DON'T:**
- Store full snapshot every 10 minutes (too much data)
- Keep hourly data forever (aggregate to daily after 48h)
- Store position for every single check (only on change)

**Result:** Efficient storage + fast queries + complete history! 🚀
