# Our API Endpoints (What We Can Offer)

## 📊 Map Endpoints

| Endpoint | Params | What It Returns | Data Retention |
|----------|--------|----------------|----------------|
| `GET /maps/:code` | - | Map details (title, creator, images, tags) | Forever |
| `GET /maps/:code/ccu` | - | Current players online | 90 days raw |
| `GET /maps/:code/ccu/history` | `?period=1d\|7d\|30d\|90d\|1y\|all` | CCU over time (auto-interval) | 90d raw → 1y hourly → forever daily |
| `GET /maps/:code/metrics` | `?period=7d\|30d\|90d\|1y\|all` | Minutes played, unique players, sessions, favorites, retention | Forever (daily) |
| `GET /maps/:code/discovery` | `?days=7\|30\|90` | Where map appears in discovery | 90 days detailed |
| `GET /maps/search` | `?q=text`<br>`?creator=name`<br>`?tags=pvp,combat`<br>`?sort=ccu\|new\|popular`<br>`?page=1&limit=50` | Search results | Real-time |
| `GET /maps/trending` | `?period=1h\|24h\|7d`<br>`?page=1&limit=50` | Top maps by CCU growth | 90 days |
| `GET /maps/leaderboard` | `?metric=ccu\|favorites`<br>`?period=24h\|7d\|30d\|all`<br>`?page=1&limit=100` | Top maps by metric | Real-time |

## 👤 Creator Endpoints

| Endpoint | Params | What It Returns | Data Retention |
|----------|--------|----------------|----------------|
| `GET /creators/:id` | - | Creator profile (name, bio, socials, followers) | Forever |
| `GET /creators/:id/maps` | `?sort=ccu\|new\|popular`<br>`?page=1&limit=50` | All maps by creator + CCU | Real-time |
| `GET /creators/:id/stats` | `?period=24h\|7d\|30d\|all` | Total CCU, total maps, peak CCU, growth | 90d raw → forever daily |
| `GET /creators/leaderboard` | `?metric=ccu\|followers`<br>`?period=24h\|7d\|30d\|all`<br>`?page=1&limit=100` | Top creators by metric | Real-time |

## 🔍 Discovery Endpoints

| Endpoint | Params | What It Returns | Data Retention |
|----------|--------|----------------|----------------|
| `GET /discovery/surfaces` | - | All 16 surfaces list | Static |
| `GET /discovery/:surface` | `?panel=PanelName` | Current maps in surface/panel | Real-time |
| `GET /discovery/:surface/history` | `?days=7\|30\|90`<br>`?panel=PanelName` | Historical placements & positions | 90 days detailed |
| `GET /discovery/featured` | - | Featured maps right now | Real-time |

## 📈 Analytics Endpoints (NEW - fn360 doesn't have!)

| Endpoint | Params | What It Returns | Data Retention |
|----------|--------|----------------|----------------|
| `GET /analytics/top-maps` | `?metric=ccu\|plays\|favorites\|retention`<br>`?period=24h\|7d\|30d`<br>`?page=1&limit=100` | Top maps by metric | Forever (daily aggregates) |
| `GET /analytics/trending` | `?period=1h\|24h\|7d`<br>`?metric=ccu\|plays\|favorites`<br>`?page=1&limit=50` | Fastest growing maps | 90 days |
| `GET /analytics/retention` | `?period=7d\|30d`<br>`?minPlayers=1000`<br>`?page=1&limit=100` | Best retention rates (D1/D7) | Forever (daily) |
| `GET /analytics/engagement` | `?period=7d\|30d`<br>`?sort=sessionLength\|playsPerUser`<br>`?page=1&limit=100` | Avg session length, plays per user | Forever (daily) |

---

## 📦 Data Retention & Aggregation Policy

| Data Type | Raw Data | Aggregated | Notes |
|-----------|----------|------------|-------|
| **CCU** | 90 days (5-min) | 1 year (hourly) → Forever (daily) | Auto-aggregates after 90 days |
| **Ecosystem Metrics** | Forever (daily) | N/A | Daily from Epic API |
| **Discovery** | 90 days (10-min) | Forever (daily snapshots) | Position tracking |
| **Map Metadata** | Forever | N/A | Updates when changed |
| **Creator Profiles** | Forever | N/A | Updates hourly |

**Aggregation Rules:**
- **After 90 days**: 5-min CCU → 1-hour averages
- **After 1 year**: 1-hour CCU → Daily min/max/avg
- **Discovery**: Keep daily "snapshot" of what was featured
- **Metrics**: Keep all daily data forever (small storage)

**Auto-Interval for CCU History** (based on period param):
- `period=1d` → Every 10 minutes
- `period=7d` → Every 30 minutes  
- `period=30d` → Twice per day (12h intervals)
- `period=1y` → Once per day
- `period=all` → Once per day

**Storage Estimate:**
- 10,000 maps × 90 days × 288 points/day = ~260M records → ~50GB
- After aggregation: ~5GB per year

---

## 🎯 What Makes Us Better Than fn360

| Feature | fn360 | Us | Advantage |
|---------|-------|-----|-----------|
| Current CCU | ✅ | ✅ | Same |
| CCU History | ✅ | ✅ | Same |
| Minutes Played | ✅ | ✅ | Same |
| **Unique Players** | ❌ | ✅ | **We win!** |
| **Play Sessions** | ❌ | ✅ | **We win!** |
| **Favorites** | ❌ | ✅ | **We win!** |
| **Recommendations** | ❌ | ✅ | **We win!** |
| **Session Length** | ❌ | ✅ | **We win!** |
| **Retention (D1/D7)** | ❌ | ✅ | **We win!** |
| Discovery Tracking | ✅ | ✅ | Same |

**Score: 6 exclusive metrics + 100% parity = Better platform!** 🚀

---

## 📱 Example API Responses

### Get CCU History (Auto-Interval)
```json
GET /maps/8530-0110-2817/ccu/history?period=7d

{
  "mapCode": "8530-0110-2817",
  "period": "7d",
  "interval": "30min",
  "dataPoints": 336,
  "data": [
    { "timestamp": "2025-11-16T00:00:00Z", "ccu": 450 },
    { "timestamp": "2025-11-16T00:30:00Z", "ccu": 523 }
  ]
}
```

### Get Map Metrics (Daily Only)
```json
GET /maps/8530-0110-2817/metrics?period=7d

{
  "mapCode": "8530-0110-2817",
  "period": "7d",
  "data": [
    {
      "date": "2025-11-23",
      "peakCCU": 814,
      "minutesPlayed": 434436,
      "uniquePlayers": 12095,
      "sessions": 17791,
      "favorites": 372,
      "avgSessionMinutes": 35.92,
      "retention": { "d1": 0.33, "d7": 0.12 }
    }
  ]
}
```

### Get Discovery History
```json
GET /discovery/CreativeDiscoverySurface_Browse/history?days=30&panel=Featured_Nested

{
  "surface": "Browse",
  "panel": "Featured_Nested",
  "history": [
    {
      "date": "2025-11-23",
      "position": 1,
      "mapCode": "8530-0110-2817",
      "duration": "3 days"
    }
  ]
}
```

### Get Maps Leaderboard
```json
GET /maps/leaderboard?metric=ccu&period=24h&page=1&limit=10

{
  "metric": "ccu",
  "period": "24h",
  "page": 1,
  "totalPages": 245,
  "totalMaps": 2450,
  "maps": [
    {
      "rank": 1,
      "code": "1234-5678-9012",
      "title": "Arctic Road FFA",
      "value": 5430,
      "change": "+15%"
    }
  ]
}
```

### Get Creators Leaderboard
```json
GET /creators/leaderboard?metric=ccu&period=7d&page=1&limit=10

{
  "metric": "ccu",
  "period": "7d",
  "page": 1,
  "totalPages": 82,
  "totalCreators": 820,
  "creators": [
    {
      "rank": 1,
      "id": "abc123",
      "name": "ProBuilder",
      "value": 45230,
      "totalMaps": 12
    }
  ]
}
```

---

**Total Endpoints: ~25 endpoints**  
**Data Sources: 5 Epic APIs**  
**Update Speed: 5-10 minutes (real-time) + daily metrics**
