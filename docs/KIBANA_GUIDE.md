# Kibana Data Views Guide - Project Root

## Access Kibana
- **URL**: `http://YOUR_SERVER_IP:5601`
- **Port**: 5601 (firewall already opened)

## Created Data Views

### 1. **Maps** (`maps`)
View all Fortnite Creative maps with their metadata.

**Key Fields**:
- `id` - Map code (e.g., 1234-5678-9012)
- `title` - Map name
- `creator.account_id` - Creator ID
- `creator.display_name` - Creator name
- `description` - Map description
- `metadata.last_synced` - Last update timestamp
- `lastSyncCcu` - Latest player count
- `performance.*` - Performance metrics

**Common Queries**:
```
# Maps with high CCU
lastSyncCcu > 100

# Recently updated maps
metadata.last_synced > now-1d

# Maps by specific creator
creator.account_id: "CREATOR_ID_HERE"
```

---

### 2. **Creators** (`creators`)
View all map creators and their profiles.

**Key Fields**:
- `account_id` - Unique creator ID
- `display_name` - Creator display name
- `metadata.last_synced` - Last profile update
- `metadata.total_maps` - Number of maps

**Common Queries**:
```
# Creators with display names
_exists_: display_name

# Recently active creators
metadata.last_synced > now-7d
```

---

### 3. **Concurrent Users (All Time)** (`concurrent-users-*`)
Time-series data of player counts across all maps.

**Key Fields**:
- `timestamp` - When CCU was recorded
- `map_id` - Map code
- `ccu` - Concurrent user count
- `creator_id` - Creator who made the map
- `source` - Data source (creator_page_api, epic_api)

**Common Queries**:
```
# High player count snapshots
ccu > 500

# Last 24 hours
timestamp > now-24h

# Specific map's CCU history
map_id: "1234-5678-9012"
```

**Visualizations**:
- Line chart: `timestamp` (X) vs `ccu` (Y) - Shows player count over time
- Area chart: `timestamp` (X) vs `sum(ccu)` (Y) - Total concurrent users
- Top values: `map_id` by `max(ccu)` - Highest CCU maps

---

### 4. **Discovery Current** (`discovery-current`)
Currently featured maps in Epic's discovery system.

**Key Fields**:
- `map_id` - Featured map code
- `surface_name` - Discovery surface (Frontend, Browse, etc.)
- `panel_name` - Section name
- `position` - Display position
- `first_seen` - When first detected
- `last_seen` - Most recent detection

**Common Queries**:
```
# Frontend featured maps
surface_name: "CreativeDiscoverySurface_Frontend"

# Currently active (seen in last hour)
last_seen > now-1h

# Specific panel
panel_name: "FeaturedHub"
```

---

### 5. **Discovery Events** (`discovery-events`)
Historical log of discovery feature changes.

**Key Fields**:
- `timestamp` - When change occurred
- `event_type` - Type of change (added, removed, moved)
- `map_id` - Affected map
- `surface_name` - Discovery surface
- `position` - New/old position

**Common Queries**:
```
# Recently added maps
event_type: "added" AND timestamp > now-1d

# Maps removed from discovery
event_type: "removed"
```

---

### 6. **Map Changelog** (`map-changelog`)
Track changes to map metadata over time.

**Key Fields**:
- `timestamp` - When change was detected
- `map_id` - Which map changed
- `field` - What field changed
- `old_value` - Previous value
- `new_value` - New value

**Common Queries**:
```
# Title changes
field: "title"

# Recent changes
timestamp > now-24h

# Changes to specific map
map_id: "1234-5678-9012"
```

---

### 7. **Creator Changelog** (`creator-changelog`)
Track changes to creator profiles.

**Key Fields**:
- `timestamp` - When change occurred
- `creator_id` - Which creator
- `field` - What changed
- `old_value` - Before
- `new_value` - After

**Common Queries**:
```
# Display name changes
field: "display_name"

# Recent updates
timestamp > now-7d
```

---

## Quick Start Guide

### 1. **Discover Tab** (Explore Data)
1. Click **Discover** in left sidebar
2. Select a data view from dropdown (top-left)
3. Adjust time range (top-right)
4. Add filters using **+ Add filter** button
5. Select fields to display from left panel

### 2. **Create Visualizations**
1. Click **Visualize Library** in left sidebar
2. Click **Create visualization**
3. Choose visualization type (Line, Bar, Pie, etc.)
4. Select data view
5. Configure:
   - **Metrics**: What to measure (count, sum, avg, max, etc.)
   - **Buckets**: How to group (by field, date histogram, etc.)

### 3. **Build Dashboards**
1. Click **Dashboard** in left sidebar
2. Click **Create dashboard**
3. Click **Add** to add visualizations
4. Arrange and resize panels
5. Click **Save** to save dashboard

---

## Example Dashboards to Create

### Dashboard 1: "Map Analytics"
- **Line Chart**: Map CCU over time (last 24h)
- **Data Table**: Top 10 maps by current CCU
- **Metric**: Total maps in database
- **Pie Chart**: Maps by discovery surface

### Dashboard 2: "Creator Analytics"  
- **Metric**: Total creators
- **Data Table**: Most active creators (by map count)
- **Line Chart**: New creators over time
- **Tag Cloud**: Popular creator names

### Dashboard 3: "Discovery Tracking"
- **Data Table**: Currently featured maps
- **Timeline**: Discovery events (adds/removes)
- **Heatmap**: Feature frequency by surface
- **Bar Chart**: Most featured maps (all time)

### Dashboard 4: "Real-Time Monitoring"
- **Metric**: Total concurrent users (all maps)
- **Line Chart**: Live CCU trend (last hour, auto-refresh)
- **Data Table**: Top 20 maps by current CCU
- **Area Chart**: CCU by discovery surface

---

## Useful KQL (Kibana Query Language) Examples

```kql
# Exact match
field_name: "exact value"

# Wildcard
title: *parkour*

# Multiple conditions (OR)
status: "online" OR status: "active"

# Multiple conditions (AND)
ccu > 100 AND map_id: *

# Range
ccu >= 50 AND ccu <= 500
timestamp >= "2025-11-20" AND timestamp <= "2025-11-24"

# Exists
_exists_: display_name

# Does not exist
NOT _exists_: description

# Negation
NOT status: "deleted"
```

---

## Tips & Tricks

1. **Auto-refresh**: Set auto-refresh interval (top-right) for real-time monitoring
2. **Save searches**: Save frequently used queries in Discover tab
3. **Export data**: Export search results to CSV via "Share" > "CSV Reports"
4. **Create alerts**: Use "Stack Management" > "Rules" for threshold alerts
5. **Time zones**: Adjust timezone in "Stack Management" > "Advanced Settings"

---

## Troubleshooting

### Data not showing up?
- Check time range (expand to "Last 7 days" or "Last 30 days")
- Verify index has data: `curl localhost:9200/INDEX_NAME/_count`
- Refresh data view: Stack Management > Data Views > Refresh

### Kibana not loading?
```bash
# Check Kibana process
ps aux | grep kibana

# Check logs
tail -50 /root/Project-Root/logs/kibana.log

# Restart Kibana
pkill -f kibana
/opt/kibana/bin/kibana > /root/Project-Root/logs/kibana.log 2>&1 &
```

### Need to recreate data views?
```bash
cd /root/Project-Root
node scripts/setup-kibana-data-views.js
```

---

## Next Steps

1. ✅ Access Kibana at `http://YOUR_SERVER_IP:5601`
2. ✅ Explore data in **Discover** tab
3. ✅ Create visualizations for key metrics
4. ✅ Build dashboards for monitoring
5. ⏭️  Set up alerts for important events
6. ⏭️  Export and share insights

---

## Advanced: Create Index Lifecycle Policies

For managing data retention on time-series indices like `concurrent-users-*`:

```bash
# Go to: Stack Management > Index Lifecycle Policies
# Create policy to automatically delete old monthly indices after 90 days
```

**Recommended Policy**:
- **Hot phase**: Keep for 30 days
- **Warm phase**: Keep for 60 days (reduce replicas)
- **Delete phase**: Delete after 90 days

This keeps your storage manageable while retaining historical data.
