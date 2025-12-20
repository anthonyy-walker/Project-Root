# Fortnite Creative Data Collection System

A simplified, production-ready system for collecting and monitoring Fortnite Creative map and creator data using Epic Games APIs.

## Overview

This system continuously collects data from Epic Games APIs and stores it in Elasticsearch for analysis. It tracks:

- **Maps**: Metadata, changes, and discovery status
- **Creators**: Profile data, follower counts, and published maps
- **Player Counts**: Concurrent users (CCU) for all maps
- **Discovery**: Featured map positions and movement tracking
- **Changelogs**: Historical changes for maps and creators

## Quick Start Options

### Option 1: Docker (Recommended)

The easiest way to get started:

```bash
# 1. Clone and configure
git clone https://github.com/your-username/Project-Root.git
cd Project-Root
cp .env.example .env
# Edit .env with your credentials

# 2. Authenticate (one-time setup)
npm install && cd EpicGames && npm install && cd ..
node EpicGames/auth/authenticate.js <YOUR_EXCHANGE_CODE>

# 3. Start everything
docker-compose up -d

# 4. View logs
docker-compose logs -f workers
```

See **[DOCKER.md](DOCKER.md)** for complete Docker documentation.

### Option 2: Manual Setup

For development or custom deployments:

```bash
# 1. Install dependencies
npm install

# 2. Authenticate
cd EpicGames
node auth/authenticate.js <YOUR_EXCHANGE_CODE>
cd ..

# 3. Configure
cp .env.example .env
# Edit .env with your settings

# 4. Start workers
pm2 start ecosystem.config.js
pm2 logs
```

See **[STARTUP_GUIDE.md](STARTUP_GUIDE.md)** for detailed manual setup.
   - Uses Links Service bulk API (100 maps/request)
   - Detects and logs changes to map-changelog
   - Auto-discovers new creators
   - Rate limit: 10 requests/minute

2. **profiles-collector** - Updates creator profiles
   - Fetches display names, bios, follower counts, images, socials
   - Logs changes to creator-changelog
   - Tracks follower count history
   - Rate limit: 30 requests/minute

3. **maps-discovery** - Discovers new maps
   - Scans all creators for their published maps
   - Auto-discovers new maps not yet indexed
   - No rate limit
   - Fast full scan: ~15 minutes

4. **player-counts** - Monitors player counts
   - Saves concurrent user counts every 10 minutes
   - Stores time-series data in monthly indices
   - Aligned timestamps (:00, :10, :20, etc.)

5. **discovery-tracker** - Tracks featured maps
   - Monitors discovery surfaces every 10 minutes
   - Detects ADDED/REMOVED/MOVED events
   - Saves current snapshot to discovery-current
   - Logs events to discovery-events

### Authentication

The system uses Epic Games OAuth tokens that auto-refresh:

- Initial authentication via browser-based exchange code
- Tokens stored in `data/tokenData.json`
- Auto-refresh 5 minutes before expiration
- Shared across all workers via `workers/utils/auth-helper.js`

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- Elasticsearch 8.x running on port 9200
- Epic Games account

### 1. Install Dependencies

```bash
npm install
```

### 2. Authenticate with Epic Games

```bash
cd EpicGames
node auth/authenticate.js

# Follow the instructions:
# 1. Visit the authentication URL
# 2. Login and copy the 'code' from redirect URL
# 3. Run: node auth/authenticate.js <code>
```

### 3. Configure Environment

Create a `.env` file in the root directory:

```env
# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Epic Games Configuration
FORTNITE_BRANCH=++Fortnite+Release-32.10-CL-35815136-Windows
EPIC_X_ACCESS_TOKEN=your_token_here

# Discovery Configuration
ALL_SURFACES=CreativeDiscoverySurface_Frontend,CreativeDiscoverySurface_Browse
MATCHMAKING_REGIONS=NAE,NAW,EU,OCE,BR,ASIA
```

### 4. Start Workers

Using PM2 (recommended):

```bash
pm2 start ecosystem.config.js
pm2 logs
```

Or manually:

```bash
node workers/ingestion/maps-collector.js
node workers/ingestion/profiles-collector.js
node workers/ingestion/maps-discovery.js
node workers/monitoring/player-counts.js
node workers/monitoring/discovery-tracker.js
```

## AWS Deployment

### Recommended Architecture

```
┌─────────────────┐
│   EC2 Instance  │
│                 │
│  - Node.js App  │
│  - PM2 Process  │
│    Manager      │
└────────┬────────┘
         │
         ├─────────────────────────┐
         │                         │
    ┌────▼─────┐         ┌─────────▼────────┐
    │ AWS      │         │   Amazon         │
    │ OpenSearch│◄───────┤   CloudWatch     │
    │ Service   │         │   (Logs/Metrics) │
    └───────────┘         └──────────────────┘
```

### EC2 Setup

**Instance Type**: t3.medium or larger
- 2 vCPUs
- 4 GB RAM minimum
- General Purpose SSD (gp3)

**AMI**: Amazon Linux 2023 or Ubuntu 22.04

**Security Group**:
- Outbound: Allow HTTPS (443) for Epic Games API
- Inbound: SSH (22) for management only

### Elasticsearch Setup Options

#### Option 1: AWS OpenSearch Service (Recommended)

1. Create OpenSearch domain in AWS Console
2. Choose instance type: t3.small.search (for dev) or m6g.large.search (production)
3. Configure:
   - 1-3 data nodes
   - EBS storage: 100GB gp3
   - No dedicated master nodes needed for small deployments
4. Set access policy to allow EC2 security group
5. Update `.env` with OpenSearch endpoint URL

```env
ELASTICSEARCH_URL=https://your-domain.us-east-1.es.amazonaws.com
```

#### Option 2: Self-Hosted on EC2

1. Launch separate EC2 instance (t3.large, 8GB RAM minimum)
2. Install Elasticsearch 8.x
3. Configure heap size: 4GB
4. Enable security with basic authentication
5. Update EC2 security group to allow port 9200 from app server

### Deployment Steps

1. **Launch EC2 Instance**
```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@your-instance-ip

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Install PM2
sudo npm install -g pm2

# Setup PM2 startup script
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

2. **Clone and Configure**
```bash
git clone https://github.com/your-repo/Project-Root.git
cd Project-Root
npm install

# Create .env file
nano .env
# Add your configuration

# Authenticate with Epic Games
cd EpicGames
node auth/authenticate.js <your_exchange_code>
cd ..
```

3. **Start Application**
```bash
pm2 start ecosystem.config.js
pm2 save

# Check status
pm2 status
pm2 logs
```

4. **Setup CloudWatch (Optional)**
```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# Configure to send PM2 logs to CloudWatch
```

### Cost Estimation (US East-1)

- EC2 t3.medium: ~$30/month (on-demand)
- OpenSearch t3.small.search: ~$30/month
- Data transfer: ~$5-10/month
- EBS storage: ~$10/month (100GB)

**Total**: ~$75-80/month for a basic setup

**Cost Optimization**:
- Use Reserved Instances for 40% savings
- Use Spot Instances for EC2 (workers are stateless)
- Enable S3 archival for old Elasticsearch data

## Data Storage

### Elasticsearch Indices

- `maps` - Map metadata and current state
- `creators` - Creator profiles and stats
- `map-changelog` - Historical changes to maps
- `creator-changelog` - Historical changes to creators
- `creator-follower-history` - Follower count time-series
- `concurrent-users-YYYY-MM` - Monthly CCU data
- `discovery-current` - Current discovery snapshot
- `discovery-events` - Discovery movement history

### Index Management

Indices are auto-created on first write. For production, you may want to:

1. Create index templates for consistent mappings
2. Setup Index Lifecycle Management (ILM) policies
3. Configure retention policies (e.g., delete CCU data after 90 days)

## Monitoring

### PM2 Monitoring

```bash
# Check worker status
pm2 status

# View logs
pm2 logs maps-collector
pm2 logs --lines 100

# Monitor resources
pm2 monit

# Restart workers
pm2 restart all
```

### Elasticsearch Health

```bash
# Check cluster health
curl http://localhost:9200/_cluster/health?pretty

# Check indices
curl http://localhost:9200/_cat/indices?v

# Check document counts
curl http://localhost:9200/maps/_count
```

## Rate Limits

See [RATE_LIMITS.md](./RATE_LIMITS.md) for detailed information on all Epic Games API rate limits.

## File Structure

```
Project-Root/
├── EpicGames/              # Epic Games API clients
│   ├── auth/               # Authentication system
│   ├── apis/               # API wrappers
│   └── config/             # Endpoints configuration
├── workers/
│   ├── ingestion/          # Data collection workers
│   ├── monitoring/         # Monitoring workers
│   └── utils/              # Shared utilities
├── ecosystem.config.js     # PM2 configuration
├── package.json            # Dependencies
└── .env                    # Environment variables
```

## Troubleshooting

### Workers won't start
- Check authentication: `node -e "const auth = require('./EpicGames/auth/auth'); console.log(auth.loadTokens())"`
- Verify Elasticsearch is running: `curl http://localhost:9200`
- Check logs: `pm2 logs <worker-name>`

### Rate limiting errors
- Workers respect rate limits automatically
- If errors persist, check your Epic Games account status
- Verify tokens haven't expired

### High memory usage
- Adjust `max_memory_restart` in ecosystem.config.js
- Monitor with: `pm2 monit`
- Consider upgrading EC2 instance size

### Token expired
- Tokens auto-refresh
- If auto-refresh fails, re-authenticate manually
- Check that refresh_token hasn't expired (8 hours)

## Support

For issues or questions:
- Check logs: `pm2 logs`
- Review Epic Games API documentation
- Verify Elasticsearch indices: `curl http://localhost:9200/_cat/indices?v`

## License

ISC
