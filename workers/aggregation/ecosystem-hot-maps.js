#!/usr/bin/env node

/**
 * Worker 5a: Hot Maps Ecosystem Metrics (Tier 1)
 *
 * Runs every 10 minutes to collect metrics for the top 1,000 most active maps
 * - Fetches last 10 minutes of data in minute intervals (1 datapoint per 10 min)
 * - Only stores non-null/non-zero values to save space
 * - Fast real-time data for trending/popular maps
 * - Total time: ~140 seconds for 1,000 maps at 7 req/sec
 */

const { Client } = require('@elastic/elasticsearch');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ecosystemAPI = require('../../EpicGames/apis/ecosystemAPI');
const { getMapTiers } = require('./ecosystem-tier-classifier');

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

const BATCH_DELAY = 140; // 0.14 second delay between requests (7 req/sec)
const INTERVAL = 'minute'; // Fetch 10-minute interval buckets

/**
 * Check if metric value has meaningful data (not null, undefined, or zero)
 */
function hasData(value) {
  return value !== null && value !== undefined && value !== 0;
}

/**
 * Parse metrics from API response, filtering out null/zero values
 * Returns only the most recent 10-minute bucket (latest datapoint)
 */
function parseLatestMetrics(metricsResponse) {
  if (!metricsResponse) return null;

  // Get latest timestamp with data
  let latestData = null;
  let latestTimestamp = null;

  const checkMetric = (metricName, array) => {
    if (!array || !Array.isArray(array)) return;
    
    for (const entry of array) {
      if (!entry.timestamp || !hasData(entry.value)) continue;
      
      const timestamp = new Date(entry.timestamp);
      if (!latestTimestamp || timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        if (!latestData) latestData = {};
      }
    }
  };

  // Find latest timestamp across all metrics
  checkMetric('peak_ccu', metricsResponse.peakCCU);
  checkMetric('unique_players', metricsResponse.uniquePlayers);
  checkMetric('plays', metricsResponse.plays);
  checkMetric('minutes_played', metricsResponse.minutesPlayed);
  checkMetric('avg_minutes_per_player', metricsResponse.averageMinutesPerPlayer);
  checkMetric('favorites', metricsResponse.favorites);
  checkMetric('recommendations', metricsResponse.recommendations);

  if (!latestTimestamp) return null;

  // Now extract values for that timestamp only
  latestData = { timestamp: latestTimestamp.toISOString() };

  const addMetricValue = (metricName, array) => {
    if (!array || !Array.isArray(array)) return;
    
    for (const entry of array) {
      if (entry.timestamp === latestData.timestamp && hasData(entry.value)) {
        latestData[metricName] = metricName.includes('avg') 
          ? parseFloat(entry.value.toFixed(2))
          : Math.round(entry.value);
      }
    }
  };

  addMetricValue('peak_ccu', metricsResponse.peakCCU);
  addMetricValue('unique_players', metricsResponse.uniquePlayers);
  addMetricValue('plays', metricsResponse.plays);
  addMetricValue('minutes_played', metricsResponse.minutesPlayed);
  addMetricValue('avg_minutes_per_player', metricsResponse.averageMinutesPerPlayer);
  addMetricValue('favorites', metricsResponse.favorites);
  addMetricValue('recommendations', metricsResponse.recommendations);

  // Only return if we have at least one metric with data
  const hasAnyData = Object.keys(latestData).some(key => key !== 'timestamp');
  return hasAnyData ? latestData : null;
}

/**
 * Collect metrics for hot maps (Tier 1)
 */
async function collectHotMapMetrics() {
  console.log('\n🔥 [TIER 1 - HOT] Collecting metrics for top 1,000 active maps...');

  // Get last 10 minutes of data
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  
  const fromTime = tenMinutesAgo.toISOString();
  const toTime = now.toISOString();
  
  console.log(`📅 Time range: ${fromTime} to ${toTime}`);

  // Get tier 1 maps
  const { tier1 } = await getMapTiers();
  
  if (!tier1 || tier1.length === 0) {
    console.log('No hot maps found');
    return;
  }

  console.log(`Processing ${tier1.length} hot maps\n`);

  let processed = 0;
  let successful = 0;
  let noData = 0;
  let failed = 0;
  const bulk = [];

  // Process maps sequentially with delay
  for (const mapId of tier1) {
    processed++;
    
    try {
      // Fetch latest 10-minute metrics
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

      // Parse and get only latest non-zero datapoint
      const latestMetrics = parseLatestMetrics(metricsResponse);
      
      if (!latestMetrics) {
        noData++;
        continue;
      }

      // Create document ID: mapId-timestamp
      const docId = `${mapId}-${new Date(latestMetrics.timestamp).getTime()}`;

      // Add to bulk operation
      bulk.push(
        { index: { _index: 'map-metrics-history', _id: docId } },
        {
          map_id: mapId,
          ...latestMetrics,
          tier: 1,
          collection_cycle: '10min',
          data_source: 'ecosystem_api',
          collected_at: now.toISOString()
        }
      );

      successful++;
      
      // Progress indicator
      if (processed % 100 === 0) {
        console.log(`  Progress: ${processed}/${tier1.length} | Success: ${successful} | No Data: ${noData} | Failed: ${failed}`);
      }

    } catch (error) {
      failed++;
      if (error.response?.status === 429) {
        console.log(`  Rate limited at ${processed}/${tier1.length}`);
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

  console.log('\nHot Maps Collection Summary:');
  console.log(`   Total Processed: ${processed}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   No Data: ${noData}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Duration: ~${Math.round(processed * BATCH_DELAY / 1000)}s\n`);
}

/**
 * Start the hot maps worker
 */
async function startWorker() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Worker 5a: Hot Maps Ecosystem Metrics (Tier 1)');
  console.log('   Schedule: Every 10 minutes');
  console.log('   Coverage: Top 1,000 most active maps');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Run immediately on start
  await collectHotMapMetrics();

  // Schedule every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    console.log(`\n[${new Date().toISOString()}] Starting hot maps collection cycle...`);
    await collectHotMapMetrics();
  });

  console.log('Worker started - running every 10 minutes\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down hot maps worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down hot maps worker...');
  process.exit(0);
});

// Start worker
if (require.main === module) {
  startWorker().catch(error => {
    console.error('Worker failed to start:', error);
    process.exit(1);
  });
}

module.exports = { collectHotMapMetrics };
