# Docker Deployment Guide

Quick guide for running the Fortnite Creative data collection system using Docker.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Epic Games account with valid credentials

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/your-username/Project-Root.git
cd Project-Root
```

### 2. Configure Environment

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` and add your Epic Games credentials:

```bash
# Required: Epic Games credentials
EPIC_ACCESS_TOKEN=your_access_token_here
EPIC_ACCOUNT_ID=your_account_id_here
EPIC_X_ACCESS_TOKEN=your_x_access_token_here

# Elasticsearch (using Docker service)
ELASTICSEARCH_URL=http://elasticsearch:9200
```

### 3. Authenticate with Epic Games

Before starting the containers, you need to authenticate:

```bash
# Install dependencies locally (just for authentication)
npm install
cd EpicGames && npm install && cd ..

# Get exchange code from:
# https://www.epicgames.com/id/api/redirect?clientId=ec684b8c687f479fadea3cb2ad83f5c6&responseType=code

# Authenticate
cd EpicGames
node auth/authenticate.js YOUR_EXCHANGE_CODE
cd ..
```

This creates `data/tokenData.json` which will be mounted into the container.

### 4. Start Services

```bash
# Start all services (workers + Elasticsearch + Kibana)
docker-compose up -d

# View logs
docker-compose logs -f workers

# Check status
docker-compose ps
```

## Services

The docker-compose setup includes:

1. **workers** - All 5 data collection workers
   - maps-collector
   - profiles-collector
   - maps-discovery
   - player-counts
   - discovery-tracker

2. **elasticsearch** - Data storage (port 9200)

3. **kibana** - Data visualization (port 5601)

## Managing Workers

### View Logs

```bash
# All workers
docker-compose logs -f workers

# Specific time range
docker-compose logs --since 10m workers

# Last 100 lines
docker-compose logs --tail 100 workers
```

### Restart Workers

```bash
# Restart all services
docker-compose restart

# Restart only workers
docker-compose restart workers
```

### Stop Workers

```bash
# Stop all services
docker-compose stop

# Stop only workers
docker-compose stop workers
```

### Update Workers

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build
```

## PM2 Commands Inside Container

```bash
# Execute PM2 commands inside container
docker-compose exec workers pm2 list
docker-compose exec workers pm2 logs
docker-compose exec workers pm2 restart all
docker-compose exec workers pm2 stop maps-collector
docker-compose exec workers pm2 monit
```

## Data Persistence

Docker volumes persist data between restarts:

- `./data` - Token data (tokenData.json)
- `./logs` - Worker logs
- `elasticsearch-data` - Elasticsearch indices

## Accessing Services

- **Elasticsearch**: http://localhost:9200
- **Kibana**: http://localhost:5601

### Test Elasticsearch

```bash
# Cluster health
curl http://localhost:9200/_cluster/health?pretty

# List indices
curl http://localhost:9200/_cat/indices?v

# Count documents
curl http://localhost:9200/maps/_count
curl http://localhost:9200/creators/_count
```

## Scaling

### Run Workers on Separate Containers

Edit `docker-compose.yml` to split workers:

```yaml
services:
  maps-collector:
    build: .
    command: pm2-runtime start ecosystem.config.js --only maps-collector
    # ... other config

  profiles-collector:
    build: .
    command: pm2-runtime start ecosystem.config.js --only profiles-collector
    # ... other config
```

### Increase Resources

```yaml
services:
  workers:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Troubleshooting

### Workers Not Starting

```bash
# Check logs
docker-compose logs workers

# Check if ES is healthy
docker-compose logs elasticsearch
curl http://localhost:9200/_cluster/health

# Verify token file exists
ls -la data/tokenData.json
```

### Token Expired

```bash
# Stop containers
docker-compose stop workers

# Re-authenticate
cd EpicGames
node auth/authenticate.js NEW_EXCHANGE_CODE

# Start containers
docker-compose start workers
```

### High Memory Usage

```bash
# Check container stats
docker stats fortnite-workers

# Increase memory limit in docker-compose.yml
# Or reduce BATCH_SIZE in worker files
```

### Elasticsearch Issues

```bash
# Check Elasticsearch logs
docker-compose logs elasticsearch

# Restart Elasticsearch
docker-compose restart elasticsearch

# Reset Elasticsearch (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

## Production Deployment

### Using External Elasticsearch

1. Update `.env`:
```bash
ELASTICSEARCH_URL=https://your-elasticsearch-url:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your_password
```

2. Remove Elasticsearch from `docker-compose.yml`:
```yaml
services:
  workers:
    # ... remove depends_on: elasticsearch
```

3. Comment out the elasticsearch service

### Security Best Practices

1. **Use secrets for credentials**:
```bash
docker secret create epic_token data/tokenData.json
```

2. **Enable Elasticsearch security**:
```yaml
environment:
  - xpack.security.enabled=true
```

3. **Use read-only volumes**:
```yaml
volumes:
  - ./data:/app/data:ro
```

4. **Limit container capabilities**:
```yaml
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE
```

## Monitoring

### Healthchecks

Workers have built-in health checks:

```bash
# Check worker health
docker inspect fortnite-workers | grep -A 10 Health

# Manual health check
docker-compose exec workers pm2 list | grep online
```

### Resource Monitoring

```bash
# Real-time stats
docker stats fortnite-workers fortnite-elasticsearch

# Container logs size
du -sh /var/lib/docker/containers/$(docker ps -qf name=fortnite-workers)
```

## Backup and Recovery

### Backup Token Data

```bash
# Backup
cp data/tokenData.json data/tokenData.json.backup

# Restore
cp data/tokenData.json.backup data/tokenData.json
docker-compose restart workers
```

### Backup Elasticsearch Data

```bash
# Using Docker volume
docker run --rm \
  -v project-root_elasticsearch-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/elasticsearch-backup.tar.gz /data

# Restore
docker run --rm \
  -v project-root_elasticsearch-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/elasticsearch-backup.tar.gz -C /
```

## Next Steps

1. ✅ Workers running in Docker
2. 📊 Access Kibana at http://localhost:5601
3. 📈 Query data from Elasticsearch
4. 🔧 Adjust worker settings in `ecosystem.config.js`
5. 📱 Set up monitoring and alerts

## Support

- Check logs: `docker-compose logs -f`
- Review worker configs: `ecosystem.config.js`
- Test Elasticsearch: `curl http://localhost:9200`
- PM2 status: `docker-compose exec workers pm2 list`
