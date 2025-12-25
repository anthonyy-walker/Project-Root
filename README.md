# Fortnite Creative Data Collection System

A production-ready system for collecting and monitoring Fortnite Creative map and creator data using Epic Games APIs. Optimized for PM2 deployment.

## Overview

This system continuously collects data from Epic Games APIs and stores it in OpenSearch/Elasticsearch for analysis. It tracks:

- **Maps**: Metadata, changes, and discovery status
- **Creators**: Profile data, follower counts, and published maps
- **Player Counts**: Concurrent users (CCU) for all maps every 10 minutes
- **Discovery**: Featured map positions and movement tracking
- **Changelogs**: Historical changes for maps, creators, and follower counts

## Prerequisites

- **Node.js** 16+ and npm
- **OpenSearch/Elasticsearch** 8.x (accessible via network)
- **Epic Games Account** for API authentication
- **PM2** for process management (installed globally)

## Installation

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/anthonyy-walker/Project-Root.git
cd Project-Root
npm install
```

### 2. Authenticate with Epic Games

The system requires Epic Games OAuth tokens:

```bash
cd EpicGames
node auth/authenticate.js

# Follow the instructions:
# 1. Visit the authentication URL shown
# 2. Login with your Epic Games account
# 3. Copy the 'code' parameter from the redirect URL
# 4. Run: node auth/authenticate.js <code>
cd ..
```

Tokens are stored in `data/tokenData.json` and auto-refresh every 8 hours.

### 3. Configure Environment

Create a `.env` file in the root directory:

```env
# OpenSearch/Elasticsearch Configuration
OPENSEARCH_HOST=https://your-opensearch-host:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=your-password

# Epic Games Configuration (optional overrides)
# Note: Update FORTNITE_BRANCH to current Fortnite release version
FORTNITE_BRANCH=++Fortnite+Release-32.10-CL-35815136-Windows
EPIC_X_ACCESS_TOKEN=your_token_here

# Discovery Configuration (optional)
ALL_SURFACES=CreativeDiscoverySurface_Frontend,CreativeDiscoverySurface_Browse
MATCHMAKING_REGIONS=NAE,NAW,NAC,EU,ME,OCE,BR,ASIA
```

## Usage

### Start All Workers

```bash
npm start
# or
pm2 start ecosystem.config.js
```

### Start Specific Workers

```bash
# Start only data collection workers
npm run workers

# Start only data loader (one-time)
npm run load-data
```

### Monitor Workers

```bash
# View status
pm2 status

# View logs
pm2 logs

# View logs for specific worker
pm2 logs maps-collector

# Monitor resource usage
pm2 monit
```

### Stop Workers

```bash
npm stop
# or
pm2 stop ecosystem.config.js
```

### Restart Workers

```bash
npm restart
# or
pm2 restart ecosystem.config.js
```

## Workers

The system runs 5 independent workers, each with specific responsibilities:

### 1. maps-collector
**Purpose**: Continuously updates map metadata from Epic Links Service  
**Rate Limit**: 10 requests/minute (100 maps per request)  
**Features**:
- Bulk API for efficiency
- Detects and logs changes to `map-changelog`
- Auto-discovers new creators
- Preserves performance metrics

### 2. profiles-collector
**Purpose**: Updates creator profile data from POPS API  
**Rate Limit**: 30 requests/minute  
**Features**:
- Updates display names, bios, follower counts, images, socials
- Logs profile changes to `creator-changelog`
- Tracks follower count history in `creator-follower-history`
- Processes 24 creators per batch with 1-minute delays

### 3. maps-discovery
**Purpose**: Discovers new maps by scanning all creators  
**Rate Limit**: Optimized for 10-minute completion  
**Features**:
- Updates `maps_created` count for each creator
- Discovers new maps not in maps index
- Creates placeholder entries for Maps Collector to enrich
- Processes 50 creators per batch with 2-second delays

### 4. player-counts
**Purpose**: Monitors concurrent users for all maps  
**Schedule**: Every 10 minutes at :00, :10, :20, :30, :40, :50  
**Features**:
- Fetches CCU data from creator page API
- Auto-discovers new maps from player count data
- Stores time-series data in monthly indices (`concurrent-users-YYYY-MM`)
- Skips invalid values (-1)
- Exact timestamps (on-the-dot: 8:00, 8:10, 8:20, etc.)

### 5. discovery-tracker
**Purpose**: Monitors Fortnite Creative discovery surfaces  
**Schedule**: Every 10 minutes  
**Features**:
- Detects ADDED/REMOVED/MOVED events
- Auto-discovers new maps and creators
- Updates `discovery-current` index (snapshot)
- Logs events to `discovery-events` index
- Conservative rate limiting: 100ms delay between API calls

## Data Storage

### OpenSearch/Elasticsearch Indices

The system creates the following indices:

| Index | Purpose | Update Frequency |
|-------|---------|------------------|
| `maps` | Map metadata and current state | Continuous |
| `creators` | Creator profiles and stats | Continuous |
| `map-changelog` | Historical map changes | On change |
| `creator-changelog` | Historical profile changes | On change |
| `creator-follower-history` | Follower count time-series | On change |
| `concurrent-users-YYYY-MM` | Monthly CCU data | Every 10 min |
| `discovery-current` | Current discovery snapshot | Every 10 min |
| `discovery-events` | Discovery movement history | Every 10 min |

All indices are auto-created on first write with dynamic mappings.

## Authentication

The system uses Epic Games OAuth with automatic token refresh:

- **Initial Authentication**: Browser-based exchange code flow
- **Token Storage**: `data/tokenData.json`
- **Auto-Refresh**: 5 minutes before expiration
- **Token Sharing**: All workers use `workers/utils/auth-helper.js`
- **Refresh Token Lifespan**: 8 hours

## File Structure

```
Project-Root/
├── EpicGames/                  # Epic Games API clients
│   ├── apis/                   # API wrappers
│   │   ├── discovery/          # Discovery API clients
│   │   ├── linksServiceAPI.js  # Maps metadata API
│   │   ├── mnemonicInfoAPI.js  # Map code lookup
│   │   ├── creatorPageAPI.js   # Creator maps API
│   │   └── popsAPI.js          # Creator profiles API
│   ├── auth/                   # OAuth authentication
│   ├── config/                 # API endpoints
│   ├── http/                   # HTTP client
│   └── utils/                  # Utilities
├── workers/
│   ├── ingestion/              # Data collection workers
│   │   ├── maps-collector.js
│   │   ├── profiles-collector.js
│   │   └── maps-discovery.js
│   ├── monitoring/             # Monitoring workers
│   │   ├── player-counts.js
│   │   └── discovery-tracker.js
│   └── utils/                  # Shared worker utilities
│       ├── auth-helper.js      # Shared authentication
│       └── mapTransformer.js   # Data transformation
├── data/
│   ├── tokenData.json          # OAuth tokens (auto-generated)
│   └── creator-ids.csv         # Initial creator list
├── ecosystem.config.js         # PM2 process configuration
├── package.json                # Dependencies and scripts
├── test-opensearch-load.js     # Data loader utility
└── .env                        # Environment configuration
```

## Monitoring

### Check Worker Health

```bash
# View all workers
pm2 status

# View specific worker logs
pm2 logs maps-collector --lines 50

# Monitor resource usage in real-time
pm2 monit

# View all logs
pm2 logs --lines 100
```

### Check OpenSearch Health

```bash
# Cluster health
curl -u username:password 'https://your-opensearch-host:9200/_cluster/health?pretty'

# List all indices
curl -u username:password 'https://your-opensearch-host:9200/_cat/indices?v'

# Check document counts
curl -u username:password 'https://your-opensearch-host:9200/maps/_count?pretty'
curl -u username:password 'https://your-opensearch-host:9200/creators/_count?pretty'
```

## Troubleshooting

### Workers won't start

**Check authentication**:
```bash
node -e "console.log(require('./data/tokenData.json'))"
```

**Verify OpenSearch connection**:
```bash
curl -u username:password 'https://your-opensearch-host:9200'
```

**Check PM2 logs**:
```bash
pm2 logs <worker-name> --lines 100
```

### Token Errors

Tokens auto-refresh, but if manual refresh is needed:

```bash
cd EpicGames
node auth/authenticate.js <new_exchange_code>
pm2 restart all
```

### Rate Limiting Errors

Workers automatically respect rate limits. If errors persist:
- Check your Epic Games account status
- Verify tokens are valid
- Review worker logs for specific API errors

### High Memory Usage

Monitor memory with `pm2 monit`. If needed:
- Adjust `max_memory_restart` in `ecosystem.config.js`
- Restart workers: `pm2 restart all`
- Consider server resource limits

### Missing Data

**Check if workers are running**:
```bash
pm2 status
```

**Verify worker logs for errors**:
```bash
pm2 logs --lines 200
```

**Check OpenSearch indices**:
```bash
curl -u username:password 'https://your-opensearch-host:9200/_cat/indices?v'
```

## Advanced Configuration

### Logs Directory

PM2 logs are stored in `./logs/`:
- `<worker-name>-error.log` - Error logs
- `<worker-name>-out.log` - Standard output logs

Logs rotate automatically when workers restart.

### Customizing Workers

Edit `ecosystem.config.js` to:
- Adjust memory limits (`max_memory_restart`)
- Change worker instances
- Modify environment variables
- Update log file paths

After changes:
```bash
pm2 reload ecosystem.config.js
```

### PM2 Startup on Boot

Configure PM2 to start on system boot:

```bash
pm2 startup
# Run the command shown by PM2

pm2 save
```

## License

ISC

## Support

For issues or questions:
- Check worker logs: `pm2 logs`
- Verify OpenSearch connectivity and indices
- Review Epic Games API documentation
- Check authentication tokens in `data/tokenData.json`
