# AWS Deployment Guide

Complete guide for deploying the Fortnite Creative Data Collection System on AWS.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Internet                           │
└─────────────┬───────────────────────────────────────────┘
              │
              │ HTTPS (443)
              ▼
┌─────────────────────────────────────────────────────────┐
│                 Application Layer                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │           EC2 Instance (t3.medium)                │  │
│  │                                                    │  │
│  │  - Node.js 18+                                    │  │
│  │  - PM2 Process Manager                            │  │
│  │  - 5 Worker Processes:                            │  │
│  │    • maps-collector                                │  │
│  │    • profiles-collector                            │  │
│  │    • maps-discovery                       │  │
│  │    • player-counts                                  │  │
│  │    • discovery-tracker                            │  │
│  └──────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────────────────┘
             │
             │ Port 9200 (Internal)
             ▼
┌─────────────────────────────────────────────────────────┐
│                   Data Layer                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │    AWS OpenSearch Service (t3.small.search)       │  │
│  │                                                    │  │
│  │  - 1-3 data nodes                                 │  │
│  │  - 100GB EBS storage                              │  │
│  │  - Automated snapshots                            │  │
│  │  - VPC security group                             │  │
│  └──────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────────────────┘
             │
             │ Port 443 (HTTPS)
             ▼
┌─────────────────────────────────────────────────────────┐
│              Monitoring & Logging                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │         CloudWatch Logs & Metrics                 │  │
│  │                                                    │  │
│  │  - Application logs                               │  │
│  │  - Worker metrics                                 │  │
│  │  - Elasticsearch metrics                          │  │
│  │  - Alarms & notifications                         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- AWS Account with admin access
- AWS CLI configured locally
- SSH key pair for EC2 access
- Epic Games account with valid credentials

## Step 1: Create VPC and Security Groups

### 1.1 Create VPC (Optional - can use default)

If you want isolated networking:

```bash
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=fortnite-data-vpc}]'
```

### 1.2 Create Security Groups

**App Server Security Group:**

```bash
aws ec2 create-security-group \
  --group-name fortnite-app-sg \
  --description "Security group for Fortnite data collection app" \
  --vpc-id vpc-xxxxx

# Allow SSH (restrict to your IP)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP_ADDRESS/32

# Allow outbound HTTPS for Epic Games API
# (Outbound is allowed by default)
```

**OpenSearch Security Group:**

```bash
aws ec2 create-security-group \
  --group-name fortnite-opensearch-sg \
  --description "Security group for OpenSearch cluster" \
  --vpc-id vpc-xxxxx

# Allow access from app server security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-opensearch-xxxxx \
  --protocol tcp \
  --port 443 \
  --source-group sg-app-xxxxx
```

## Step 2: Launch AWS OpenSearch Service

### 2.1 Create OpenSearch Domain

Via AWS Console:
1. Navigate to AWS OpenSearch Service
2. Click "Create domain"
3. Configure:
   - **Deployment type**: Standard
   - **Version**: Latest (7.10+)
   - **Instance type**: t3.small.search (for testing) or m6g.large.search (production)
   - **Number of nodes**: 1 (dev) or 3 (prod with high availability)
   - **EBS storage**: 100 GB gp3
   - **Network**: VPC access (choose your VPC and subnets)
   - **Fine-grained access control**: Disabled (or enable with master user)
   - **Encryption**: Enable encryption at rest and in-transit

4. Access policy - allow access from app server:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": "es:*",
      "Resource": "arn:aws:es:REGION:ACCOUNT:domain/fortnite-data/*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": [
            "APP_SERVER_PRIVATE_IP/32"
          ]
        }
      }
    }
  ]
}
```

### 2.2 Note the Endpoint

Save the OpenSearch endpoint URL (looks like):
```
https://search-fortnite-data-xxxxx.us-east-1.es.amazonaws.com
```

## Step 3: Launch EC2 Instance

### 3.1 Choose AMI

**Recommended**: Amazon Linux 2023 or Ubuntu 22.04 LTS

### 3.2 Instance Configuration

**Instance Type**: t3.medium
- 2 vCPUs
- 4 GB RAM
- Good balance for 5 workers

**Storage**: 30 GB gp3 SSD

**User Data Script** (optional - automates initial setup):

```bash
#!/bin/bash
# Update system
yum update -y

# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs git

# Install PM2 globally
npm install -g pm2

# Create application directory
mkdir -p /opt/fortnite-data
chown ec2-user:ec2-user /opt/fortnite-data

# Setup PM2 startup script
sudo -u ec2-user pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

### 3.3 Launch Instance

```bash
aws ec2 run-instances \
  --image-id ami-xxxxx \
  --instance-type t3.medium \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxx \
  --subnet-id subnet-xxxxx \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=fortnite-data-app}]' \
  --user-data file://user-data.sh
```

## Step 4: Configure Application

### 4.1 SSH into EC2 Instance

```bash
ssh -i your-key.pem ec2-user@ec2-instance-ip
```

### 4.2 Clone Repository

```bash
cd /opt/fortnite-data
git clone https://github.com/your-username/Project-Root.git .
```

### 4.3 Install Dependencies

```bash
npm install
```

### 4.4 Authenticate with Epic Games

```bash
cd EpicGames

# Get exchange code from:
# https://www.epicgames.com/id/api/redirect?clientId=ec684b8c687f479fadea3cb2ad83f5c6&responseType=code

node auth/authenticate.js YOUR_EXCHANGE_CODE_HERE
```

### 4.5 Create .env File

```bash
cat > .env << EOF
# Elasticsearch
ELASTICSEARCH_URL=https://search-fortnite-data-xxxxx.us-east-1.es.amazonaws.com

# Epic Games Configuration
FORTNITE_BRANCH=++Fortnite+Release-32.10-CL-35815136-Windows
EPIC_X_ACCESS_TOKEN=your_x_access_token

# Discovery Configuration
ALL_SURFACES=CreativeDiscoverySurface_Frontend,CreativeDiscoverySurface_Browse
MATCHMAKING_REGIONS=NAE,NAW,EU,OCE,BR,ASIA
EOF
```

## Step 5: Start Application

### 5.1 Start Workers with PM2

```bash
pm2 start ecosystem.config.js
pm2 save

# Verify all workers are running
pm2 status
```

### 5.2 Enable PM2 Startup on Reboot

```bash
pm2 startup systemd
# Run the command it outputs

pm2 save
```

## Step 6: Setup CloudWatch Monitoring (Optional)

### 6.1 Install CloudWatch Agent

```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm
```

### 6.2 Configure CloudWatch Agent

Create `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`:

```json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/opt/fortnite-data/logs/*.log",
            "log_group_name": "/fortnite-data/workers",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "FortniteData",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {"name": "cpu_usage_idle", "rename": "CPU_IDLE", "unit": "Percent"}
        ],
        "totalcpu": false
      },
      "mem": {
        "measurement": [
          {"name": "mem_used_percent", "rename": "MEM_USED", "unit": "Percent"}
        ]
      }
    }
  }
}
```

### 6.3 Start CloudWatch Agent

```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

## Step 7: Setup Alarms

### 7.1 CPU Utilization Alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name fortnite-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=InstanceId,Value=i-xxxxx
```

### 7.2 Memory Alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name fortnite-high-memory \
  --alarm-description "Alert when memory exceeds 90%" \
  --metric-name MEM_USED \
  --namespace FortniteData \
  --statistic Average \
  --period 300 \
  --threshold 90 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## Step 8: Backup and Disaster Recovery

### 8.1 OpenSearch Snapshots

Enable automated snapshots in OpenSearch domain settings:
- Snapshot hour: 00:00 UTC
- Retention: 14 days

### 8.2 Token Backup

The `data/tokenData.json` file contains authentication tokens:

```bash
# Backup to S3 daily (via cron)
0 0 * * * aws s3 cp /opt/fortnite-data/data/tokenData.json s3://your-backup-bucket/tokens/tokenData-$(date +\%Y\%m\%d).json
```

## Step 9: Scaling Considerations

### Horizontal Scaling (Multiple EC2 Instances)

If you need to scale beyond one instance:

1. **Separate workers by type**:
   - Instance 1: maps-collector
   - Instance 2: profiles-collector + maps-discovery
   - Instance 3: player-counts + discovery-tracker

2. **Load balancer**: Not needed (workers are independent)

3. **Shared authentication**: Store tokens in AWS Secrets Manager

### Vertical Scaling (Larger Instance)

If workers need more resources:
- Upgrade to t3.large (8GB RAM) or t3.xlarge (16GB RAM)
- Adjust `max_memory_restart` in ecosystem.config.js

## Cost Estimation

### Monthly Costs (us-east-1)

**Basic Setup:**
- EC2 t3.medium (on-demand): $30.37
- OpenSearch t3.small.search: $30.88
- EBS 100GB gp3: $8.00
- Data transfer: ~$5-10
- **Total: ~$74-79/month**

**Production Setup with HA:**
- EC2 t3.large (on-demand): $60.74
- OpenSearch m6g.large.search (3 nodes): $244.44
- EBS 300GB gp3: $24.00
- Data transfer: ~$20
- CloudWatch: ~$10
- **Total: ~$359/month**

**Cost Optimization:**
- Use EC2 Reserved Instances: Save 40%
- Use Spot Instances: Save up to 90%
- Use S3 for cold data archival: Save on EBS
- Enable OpenSearch UltraWarm: Save on storage

## Troubleshooting

### Workers not starting
```bash
# Check logs
pm2 logs

# Check authentication
ls -la /opt/fortnite-data/data/tokenData.json

# Check Elasticsearch connection
curl -XGET "https://your-opensearch-endpoint/_cluster/health?pretty"
```

### High CPU usage
```bash
# Check which worker
pm2 monit

# Restart specific worker
pm2 restart maps-collector
```

### Out of memory
```bash
# Check memory usage
free -h

# Increase instance size or adjust worker memory limits
```

### Token expired
```bash
# Re-authenticate
cd /opt/fortnite-data/EpicGames
node auth/authenticate.js NEW_EXCHANGE_CODE

# Restart workers
pm2 restart all
```

## Maintenance

### Update Application

```bash
cd /opt/fortnite-data
git pull
npm install
pm2 restart all
```

### Update Node.js

```bash
# Backup first
pm2 save

# Update Node.js
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Restart
pm2 resurrect
```

### Rotate Logs

PM2 handles log rotation, but you can configure:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Security Best Practices

1. **Restrict SSH access**: Use security groups to limit to your IP
2. **Use IAM roles**: Attach role to EC2 for AWS service access
3. **Enable CloudTrail**: Log all API calls
4. **Rotate tokens regularly**: Re-authenticate every 30 days
5. **Use AWS Secrets Manager**: Store sensitive data securely
6. **Enable VPC Flow Logs**: Monitor network traffic
7. **Regular updates**: Keep OS and packages updated

## Next Steps

1. ✅ Infrastructure deployed
2. ✅ Workers running
3. 📊 Monitor CloudWatch dashboard
4. 📈 Query data from OpenSearch
5. 🎯 Build analytics dashboards (Kibana/Grafana)

## Support

For AWS-specific issues:
- AWS Support Center
- AWS Documentation
- AWS Forums

For application issues:
- Check PM2 logs: `pm2 logs`
- Review RATE_LIMITS.md
- Check GitHub issues
