#!/usr/bin/env node

/**
 * Worker 5b: Warm Maps Ecosystem Metrics (Tier 2)
 *
 * Runs every 30 minutes to collect metrics for moderately active maps  
 * - Processes next 12,000 maps after hot tier
 * - Fetches last 30 minutes in minute intervals (3 ten-minute buckets)
 * - Only stores non-null/non-zero values to save space
 * - Total time: ~28 minutes for 12,000 maps at 7 req/sec
 */

const { Client } = require('@elastic/elasticsearch');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ecosystemAPI = require('../../EpicGames/apis/ecosystemAPI');
const { getMapTiers } = require('./ecosystem-tier-classifier');

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

const BATCH_DELAY = 140; // 0.14 second delay (7 req/sec)
const INTERVAL = 'minute'; // Fetch 10-minute interval buckets

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
 * Collect metrics for warm maps (Tier 2)
 */
async function collectWarmMapMetrics() {
  console.log('\n[TIER 2 - WARM] Collecting metrics for next 12,000 active maps...');

  // Get last 30 minutes of data (3 ten-minute buckets)
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  
  const fromTime = thirtyMinutesAgo.toISOString();
  const toTime = now.toISOString();
  
  console.log(`Time range: ${fromTime} to ${toTime}`);

  // Get tier 2 maps
  const { tier2 } = await getMapTiers();
  
  if (!tier2 || tier2.length === 0) {
    console.log('No warm maps found');
    return;
  }

  console.log(`Processing ${tier2.length} warm maps\n`);

  let processed = 0;
  let successful = 0;
  let noData = 0;
  let failed = 0;
  let totalDatapoints = 0;
  const bulk = [];

  // Process maps sequentially with delay
  for (const mapId of tier2) {
    processed++;
    
    try {
      // Fetch last 30 minutes (3 buckets)
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
            tier: 2,
            collection_cycle: '30min',
            data_source: 'ecosystem_api',
            collected_at: now.toISOString()
          }
        );
        
        totalDatapoints++;
      }

      successful++;
      
      // Progress indicator every 500 maps
      if (processed % 500 === 0) {
        console.log(`  Progress: ${processed}/${tier2.length} | Success: ${successful} | No Data: ${noData} | Failed: ${failed} | Datapoints: ${totalDatapoints}`);
      }

    } catch (error) {
      failed++;
      if (error.response?.status === 429) {
        console.log(`  Rate limited at ${processed}/${tier2.length}`);
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

  console.log('\nWarm Maps Collection Summary:');
  console.log(`   Total Processed: ${processed}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   No Data: ${noData}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total Datapoints: ${totalDatapoints}`);
  console.log(`   Duration: ~${Math.round(processed * BATCH_DELAY / 60000)} minutes\n`);
}

/**
 * Start the warm maps worker
 */
async function startWorker() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Worker 5b: Warm Maps Ecosystem Metrics (Tier 2)');
  console.log('   Schedule: Every 30 minutes');
  console.log('   Coverage: Next 12,000 moderately active maps');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Run immediately on start (offset by 5 minutes to avoid clash with hot)
  console.log('Waiting 5 minutes before first run to offset from hot maps worker...\n');
  await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
  
  await collectWarmMapMetrics();

  // Schedule every 30 minutes
  cron.schedule('5,35 * * * *', async () => {
    console.log(`\n[${new Date().toISOString()}] Starting warm maps collection cycle...`);
    await collectWarmMapMetrics();
  });

  console.log('Worker started - running every 30 minutes at :05 and :35\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down warm maps worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down warm maps worker...');
  process.exit(0);
});

// Start worker
if (require.main === module) {
  startWorker().catch(error => {
    console.error('Worker failed to start:', error);
    process.exit(1);
  });
}

module.exports = { collectWarmMapMetrics };
