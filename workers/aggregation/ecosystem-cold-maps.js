#!/usr/bin/env node

/**
 * Worker 5c: Cold Maps Ecosystem Metrics (Tier 3)
 *
 * Runs every 60 minutes to collect metrics for remaining low-activity maps
 * - Processes ~25,000 maps per hour (rotating through all ~150k over 6 hours)
 * - Fetches last 60 minutes in minute intervals (6 ten-minute buckets)
 * - Only stores non-null/non-zero values to save space
 * - Total time: ~58 minutes for 25,000 maps at 7 req/sec
 */

const { Client } = require('@elastic/elasticsearch');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ecosystemAPI = require('../../EpicGames/apis/ecosystemAPI');
const { getMapTiers } = require('./ecosystem-tier-classifier');

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

const BATCH_DELAY = 140; // 0.14 second delay (7 req/sec)
const INTERVAL = 'minute'; // Fetch 10-minute interval buckets
const MAPS_PER_CYCLE = 25872; // 60 min * 60 sec * 7.15 req/sec
const STATE_FILE = path.join(__dirname, '../../data/cold-maps-state.json');

/**
 * Check if metric value has meaningful data
 */
function hasData(value) {
  return value !== null && value !== undefined && value !== 0;
}

/**
 * Parse metrics from API response, returning all 10-min buckets with data
 */
function parseAllMetrics(metricsResponse) {
  if (!metricsResponse) return [];

  const timestampMap = new Map();

  const addMetric = (metricName, array) => {
    if (!array || !Array.isArray(array)) return;
    
    for (const entry of array) {
      if (!entry.timestamp || !hasData(entry.value)) continue;
      
      const timestamp = entry.timestamp;
      if (!timestampMap.has(timestamp)) {
        timestampMap.set(timestamp, { timestamp });
      }
      
      const bucket = timestampMap.get(timestamp);
      bucket[metricName] = metricName.includes('avg') 
        ? parseFloat(entry.value.toFixed(2))
        : Math.round(entry.value);
    }
  };

  // Parse all metrics
  addMetric('peak_ccu', metricsResponse.peakCCU);
  addMetric('unique_players', metricsResponse.uniquePlayers);
  addMetric('plays', metricsResponse.plays);
  addMetric('minutes_played', metricsResponse.minutesPlayed);
  addMetric('avg_minutes_per_player', metricsResponse.averageMinutesPerPlayer);
  addMetric('favorites', metricsResponse.favorites);
  addMetric('recommendations', metricsResponse.recommendations);

  // Convert to array, filter out buckets with only timestamp
  const datapoints = [];
  for (const [timestamp, metrics] of timestampMap) {
    const hasAnyData = Object.keys(metrics).some(key => key !== 'timestamp');
    if (hasAnyData) {
      datapoints.push(metrics);
    }
  }

  return datapoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/**
 * Load rotation state from disk
 */
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // First run or file doesn't exist
    return { currentIndex: 0, totalMaps: 0 };
  }
}

/**
 * Save rotation state to disk
 */
async function saveState(state) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(STATE_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Failed to save state:', error.message);
  }
}

/**
 * Collect metrics for cold maps (Tier 3) - rotation based
 */
async function collectColdMapMetrics() {
  console.log('\n[TIER 3 - COLD] Collecting metrics for low-activity maps (rotation)...');

  // Get last 60 minutes of data (6 ten-minute buckets)
  const now = new Date();
  const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  const fromTime = sixtyMinutesAgo.toISOString();
  const toTime = now.toISOString();
  
  console.log(`Time range: ${fromTime} to ${toTime}`);

  // Get tier 3 maps
  const { tier3 } = await getMapTiers();
  
  if (!tier3 || tier3.length === 0) {
    console.log('No cold maps found');
    return;
  }

  // Load rotation state
  const state = await loadState();
  
  // Determine which slice to process
  const startIndex = state.currentIndex;
  const endIndex = Math.min(startIndex + MAPS_PER_CYCLE, tier3.length);
  const mapsToProcess = tier3.slice(startIndex, endIndex);
  
  console.log(`Total cold maps: ${tier3.length}`);
  console.log(`Processing slice: ${startIndex} to ${endIndex} (${mapsToProcess.length} maps)`);
  console.log(`Rotation progress: ${Math.round((startIndex / tier3.length) * 100)}%\n`);

  let processed = 0;
  let successful = 0;
  let noData = 0;
  let failed = 0;
  let totalDatapoints = 0;
  const bulk = [];

  // Process maps sequentially with delay
  for (const mapId of mapsToProcess) {
    processed++;
    
    try {
      // Fetch last 60 minutes (6 buckets)
      const metricsResponse = await ecosystemAPI.getIslandMetrics(
        mapId,
        INTERVAL,
        fromTime,
        toTime
      );

      if (!metricsResponse) {
        noData++;
        continue;
      }

      // Parse all non-zero datapoints
      const datapoints = parseAllMetrics(metricsResponse);
      
      if (!datapoints || datapoints.length === 0) {
        noData++;
        continue;
      }

      // Add each datapoint as separate document
      for (const metrics of datapoints) {
        const docId = `${mapId}-${new Date(metrics.timestamp).getTime()}`;

        bulk.push(
          { index: { _index: 'map-metrics-history', _id: docId } },
          {
            map_id: mapId,
            ...metrics,
            tier: 3,
            collection_cycle: '60min',
            data_source: 'ecosystem_api',
            collected_at: now.toISOString()
          }
        );
        
        totalDatapoints++;
      }

      successful++;
      
      // Progress indicator every 1000 maps
      if (processed % 1000 === 0) {
        console.log(`  Progress: ${processed}/${mapsToProcess.length} | Success: ${successful} | No Data: ${noData} | Failed: ${failed} | Datapoints: ${totalDatapoints}`);
      }

    } catch (error) {
      failed++;
      if (error.response?.status === 429) {
        console.log(`  Rate limited at ${processed}/${mapsToProcess.length}`);
      }
    }

    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
  }

  // Bulk insert all collected metrics
  if (bulk.length > 0) {
    try {
      const bulkResponse = await es.bulk({ body: bulk, refresh: false });
      
      if (bulkResponse.errors) {
        const errorCount = bulkResponse.items.filter(item => item.index?.error).length;
        console.log(`${errorCount} documents failed to index`);
      }
      
      console.log(`\nIndexed ${bulk.length / 2} documents to Elasticsearch`);
    } catch (error) {
      console.error('Bulk insert error:', error.message);
    }
  }

  // Update rotation state
  const nextIndex = endIndex >= tier3.length ? 0 : endIndex;
  const newState = {
    currentIndex: nextIndex,
    totalMaps: tier3.length,
    lastRun: now.toISOString(),
    cyclesCompleted: nextIndex === 0 ? (state.cyclesCompleted || 0) + 1 : (state.cyclesCompleted || 0)
  };
  
  await saveState(newState);

  console.log('\nCold Maps Collection Summary:');
  console.log(`   Total Processed: ${processed}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   No Data: ${noData}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total Datapoints: ${totalDatapoints}`);
  console.log(`   Duration: ~${Math.round(processed * BATCH_DELAY / 60000)} minutes`);
  console.log(`   Next Rotation Index: ${nextIndex}/${tier3.length}`);
  if (nextIndex === 0) {
    console.log(`   Full rotation complete! Starting new cycle.`);
  }
  console.log();
}

/**
 * Start the cold maps worker
 */
async function startWorker() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Worker 5c: Cold Maps Ecosystem Metrics (Tier 3)');
  console.log('   Schedule: Every 60 minutes');
  console.log('   Coverage: ~25,000 low-activity maps per cycle (rotating)');
  console.log('   Full Rotation: ~6 hours for all cold maps');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Run immediately on start (offset by 15 minutes to avoid other workers)
  console.log('Waiting 15 minutes before first run to offset from other workers...\n');
  await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
  
  await collectColdMapMetrics();

  // Schedule every 60 minutes at :15 past the hour
  cron.schedule('15 * * * *', async () => {
    console.log(`\n[${new Date().toISOString()}] Starting cold maps collection cycle...`);
    await collectColdMapMetrics();
  });

  console.log('Worker started - running every 60 minutes at :15\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down cold maps worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down cold maps worker...');
  process.exit(0);
});

// Start worker
if (require.main === module) {
  startWorker().catch(error => {
    console.error('Worker failed to start:', error);
    process.exit(1);
  });
}

module.exports = { collectColdMapMetrics };
