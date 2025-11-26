# Fetch Creator IDs from Epic Games API - Complete Guide

## What This Script Does

Fetches **Epic Games creator account IDs** for all ~267,000 Fortnite Creative maps.

**Input**: Map mnemonics from Elasticsearch (e.g., `2644-7129-6041`)  
**Output**: CSV file with creator IDs  
**API Used**: `https://links-public-service-live.ol.epicgames.com/links/api/fn/mnemonic/:mnemonic`

---

## Prerequisites

### 1. Epic Games Access Token

You need a valid token in `/root/Project-Root/data/tokenData.json`:

```json
{
  "access_token": "your_token_here",
  "expires_at": "2025-11-24T04:05:24.200Z"
}
```

**Check if token exists:**
```bash
cat /root/Project-Root/data/tokenData.json
```

**Token expired?** You'll need to refresh it using your Epic Games authentication method.

### 2. Elasticsearch Running

**Check if running:**
```bash
curl http://localhost:9200/_cluster/health
```

**Start if needed:**
```bash
sudo systemctl start elasticsearch
sleep 10
curl http://localhost:9200/_cluster/health
```

**Check maps index exists:**
```bash
curl -s http://localhost:9200/_cat/indices/maps
```

Should show something like:
```
yellow open maps 267036 docs
```

---

## Step-by-Step Instructions

### Step 1: Navigate to Project Directory

```bash
cd /root/Project-Root
```

### Step 2: Verify Script Exists

```bash
ls -lh scripts/fetch-all-creator-ids.js
```

Should show: `-rwxr-xr-x ... fetch-all-creator-ids.js`

### Step 3: Check Dependencies Installed

```bash
npm list @elastic/elasticsearch axios
```

If missing:
```bash
npm install
```

### Step 4: Configure Elasticsearch Connection

**Option A: Local Elasticsearch (Default)**

No changes needed. Uses `http://localhost:9200`

**Option B: Remote Elasticsearch**

Edit `.env` file:
```bash
nano /root/Project-Root/.env
```

Add/modify:
```bash
# Remote ES without authentication
ELASTICSEARCH_URL=http://YOUR_ES_IP:9200

# OR with authentication
ELASTICSEARCH_URL=https://YOUR_ES_HOST:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your_password

# OR with API key
ELASTICSEARCH_URL=https://YOUR_ES_HOST:9200
ELASTICSEARCH_API_KEY=your_api_key
```

Save: `Ctrl+X`, `Y`, `Enter`

### Step 5: Test Connection

Run test script first:
```bash
node scripts/test-elasticsearch-connection.js
```

Should show:
```
✅ Connected to Elasticsearch
✅ Maps index has 267,036 documents
```

If errors, check Elasticsearch is running and connection details are correct.

---

## Running the Script

### Option 1: Run in Foreground (Simple)

```bash
cd /root/Project-Root
node scripts/fetch-all-creator-ids.js
```

**You'll see:**
```
🚀 Starting Creator ID Fetch
📥 Loading access token...
✅ Access token loaded
📥 Connecting to Elasticsearch...
✅ Elasticsearch connected
📥 Starting Elasticsearch scroll...
  Fetched 10000 maps so far...
  Fetched 20000 maps so far...
✅ Found 267040 maps in Elasticsearch

🔄 Processing maps with 1 concurrent requests...

Progress: 100/267040 (0.0%) | Success: 92 | Failed: 8 | Rate: 11.2/s | ETA: 23700s
Progress: 200/267040 (0.1%) | Success: 185 | Failed: 15 | Rate: 11.5/s | ETA: 23200s
```

**Time estimate**: 6-8 hours at 10-15 maps/second

**To stop**: Press `Ctrl+C`

---

### Option 2: Run in Background (Recommended)

Use `screen` to keep running after you disconnect:

```bash
# Install screen if needed
sudo apt-get install screen -y

# Start a screen session
screen -S creator-fetch

# Run the script
cd /root/Project-Root
node scripts/fetch-all-creator-ids.js

# Detach from screen (keeps running)
Press: Ctrl+A, then D
```

**To check on it later:**
```bash
# Reattach to see progress
screen -r creator-fetch

# Detach again: Ctrl+A, then D
```

**To list all screen sessions:**
```bash
screen -ls
```

---

### Option 3: Run From External Computer

If you want to run on your local machine but connect to remote Elasticsearch:

**On your local computer:**

1. **Copy the script:**
```bash
mkdir ~/creator-ids && cd ~/creator-ids
scp root@YOUR_SERVER_IP:/root/Project-Root/scripts/fetch-all-creator-ids.js .
scp root@YOUR_SERVER_IP:/root/Project-Root/data/tokenData.json .
```

2. **Install dependencies:**
```bash
npm init -y
npm install @elastic/elasticsearch axios dotenv
```

3. **Create .env file:**
```bash
cat > .env << 'EOF'
ELASTICSEARCH_URL=http://YOUR_SERVER_IP:9200
EOF
```

4. **Edit script paths** (use text editor):

Change:
```javascript
OUTPUT_FILE: path.join(__dirname, '../data/creator-ids.json'),
CSV_FILE: path.join(__dirname, '../data/creator-ids.csv'),
```

To:
```javascript
OUTPUT_FILE: path.join(__dirname, 'creator-ids.json'),
CSV_FILE: path.join(__dirname, 'creator-ids.csv'),
```

And:
```javascript
const tokenPath = path.join(__dirname, '../data/tokenData.json');
```

To:
```javascript
const tokenPath = path.join(__dirname, 'tokenData.json');
```

5. **Run locally:**
```bash
node fetch-all-creator-ids.js
```

---

## Monitoring Progress

### Check Progress in Real-Time

```bash
# Watch the CSV file grow
watch -n 5 "wc -l /root/Project-Root/data/creator-ids.csv"
```

### Check Last Entries
```bash
tail -20 /root/Project-Root/data/creator-ids.csv
```

### View Current Progress
```bash
tail -f /root/Project-Root/logs/creator-ids-fetch.log
```

### Check Checkpoint File
```bash
cat /root/Project-Root/data/creator-ids-checkpoint.json | jq '.stats'
```

---

## Output Files

### 1. CSV File (Main Output)
**Location**: `/root/Project-Root/data/creator-ids.csv`

**Format:**
```csv
mnemonic,accountId,creatorName,linkType,namespace
2644-7129-6041,abc123def456,PlayerName,Creative:Island,fn
0026-3016-0638,xyz789abc123,AnotherPlayer,Creative:Island,fn
```

### 2. JSON File (Full Data)
**Location**: `/root/Project-Root/data/creator-ids.json`

**Format:**
```json
{
  "creatorIds": {
    "2644-7129-6041": {
      "accountId": "abc123def456",
      "creatorName": "PlayerName",
      "linkType": "Creative:Island",
      "namespace": "fn",
      "source": "api"
    }
  },
  "failures": ["mnemonic1", "mnemonic2"]
}
```

### 3. Log File (Statistics)
**Location**: `/root/Project-Root/logs/creator-ids-fetch.log`

Contains:
- Total processed
- Success/failure counts
- Error breakdown
- Failed mnemonics list

### 4. Checkpoint File (Resume Data)
**Location**: `/root/Project-Root/data/creator-ids-checkpoint.json`

Saved every 2000 maps for recovery.

---

## Stopping and Resuming

### To Stop
- **Foreground**: Press `Ctrl+C`
- **Screen session**: Attach with `screen -r creator-fetch`, then `Ctrl+C`

### To Resume
Just run the script again:
```bash
cd /root/Project-Root
node scripts/fetch-all-creator-ids.js
```

The checkpoint file tracks progress. The script will skip already processed maps (though it re-fetches from start of Elasticsearch, processing is very fast for already-done maps).

---

## Troubleshooting

### Error: "Access token has expired"

**Fix:**
1. Get a new Epic Games token
2. Update `/root/Project-Root/data/tokenData.json`
3. Restart the script

### Error: "ConnectionError" or "Elasticsearch connection failed"

**Check Elasticsearch is running:**
```bash
sudo systemctl status elasticsearch
```

**Start if needed:**
```bash
sudo systemctl start elasticsearch
sleep 10
```

**Test connection:**
```bash
curl http://localhost:9200/_cluster/health
```

### Error: "Cannot find module"

**Install dependencies:**
```bash
cd /root/Project-Root
npm install @elastic/elasticsearch axios dotenv
```

### Script is Too Slow

Current settings: 1 request at a time, 2 second timeout
- **Expected**: 10-15 maps/second
- **Time**: 6-8 hours for 267k maps

This is intentional to prevent:
- Memory issues
- API rate limiting
- Server overload

### Script Crashes / Runs Out of Memory

Settings are already optimized for stability (sequential processing).

If crashes still occur:
1. Restart the script (checkpoint will resume)
2. Increase server RAM if possible
3. The CSV file saves data in real-time, so you won't lose progress

### High Failure Rate

Check the log file:
```bash
cat /root/Project-Root/logs/creator-ids-fetch.log
```

Common reasons for failures:
- **404 errors**: Map doesn't exist in Epic's system (normal)
- **Invalid mnemonics**: Deleted or private maps
- **Network errors**: Temporary connectivity issues

Expected failure rate: 5-10% is normal

---

## After Completion

### Verify Results

```bash
# Count total entries
wc -l /root/Project-Root/data/creator-ids.csv

# Count unique creators
cut -d',' -f2 /root/Project-Root/data/creator-ids.csv | sort -u | wc -l

# View final statistics
cat /root/Project-Root/logs/creator-ids-fetch.log
```

### Download Files

**From remote server to local machine:**
```bash
scp root@YOUR_SERVER_IP:/root/Project-Root/data/creator-ids.csv ~/Downloads/
scp root@YOUR_SERVER_IP:/root/Project-Root/data/creator-ids.json ~/Downloads/
```

### Use the Data

The CSV can be:
- Imported into databases (MySQL, PostgreSQL)
- Opened in Excel/Google Sheets
- Processed with Python/R/Node.js
- Used for analytics and reporting

**Example - Find maps by creator:**
```bash
grep "CREATOR_ACCOUNT_ID" /root/Project-Root/data/creator-ids.csv
```

**Example - Count maps per creator:**
```bash
cut -d',' -f2 /root/Project-Root/data/creator-ids.csv | sort | uniq -c | sort -rn | head -20
```

---

## Quick Command Reference

```bash
# Start the script
cd /root/Project-Root && node scripts/fetch-all-creator-ids.js

# Run in background with screen
screen -S creator-fetch
cd /root/Project-Root && node scripts/fetch-all-creator-ids.js
# Ctrl+A, D to detach

# Check progress
tail -20 /root/Project-Root/data/creator-ids.csv

# View live progress
tail -f /root/Project-Root/logs/creator-ids-fetch.log

# Count entries
wc -l /root/Project-Root/data/creator-ids.csv

# Reattach to screen
screen -r creator-fetch

# Check Elasticsearch
curl http://localhost:9200/_cluster/health

# Start Elasticsearch
sudo systemctl start elasticsearch
```

---

## Expected Timeline

- **Elasticsearch fetch**: 1-2 minutes (loads all 267k mnemonics)
- **API requests**: 6-8 hours (10-15 maps/second)
- **Total time**: ~7-8 hours

Progress updates every 100 maps, checkpoint saves every 2000 maps.

---

## Need Help?

1. **Check the log file**: `/root/Project-Root/logs/creator-ids-fetch.log`
2. **Check checkpoint**: `/root/Project-Root/data/creator-ids-checkpoint.json`
3. **Verify token**: `cat /root/Project-Root/data/tokenData.json`
4. **Test Elasticsearch**: `curl http://localhost:9200/_cat/indices/maps`

---

## Summary

**What to do:**
1. Make sure Elasticsearch is running and has the `maps` index
2. Ensure you have a valid Epic Games access token
3. Run: `cd /root/Project-Root && node scripts/fetch-all-creator-ids.js`
4. Wait 6-8 hours (or run in background with `screen`)
5. Get your CSV file at `/root/Project-Root/data/creator-ids.csv`

That's it! The script handles everything else automatically.
