#!/usr/bin/env node

/**
 * Worker 5: Ecosystem Metrics Collector
 *
 * Runs daily at 1 AM UTC to scrape hourly metrics from Epic's Ecosystem API
 * - Fetches last 24 hours of hourly metrics (24 datapoints per map)
 * - Stores: peak CCU, unique players, plays, minutes played, avg session time
 * - Stores: favorites, recommendations (no retention data at hourly interval)
 * - Epic keeps 7 days → we store hourly forever → more granular than daily
 * - Storage efficient: 24 docs/day vs 144 docs/day with minute intervals
 */

const { Client } = require('@elastic/elasticsearch');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ecosystemAPI = require('../../EpicGames/apis/ecosystemAPI');

const ES_HOST = process.env.ELASTICSEARCH_URLl;
const es = new Client({ node: ES_HOST });

const BATCH_SIZE = 50; // Process 50 maps concurrently
const BATCH_DELAY = 2000; // 2 second delay between batches to avoid rate limits
const COLLECT_INTERVAL = 'hour'; // 'hour' gives hourly data, reducing storage vs 'minute'

/**
 * Parse metrics from Ecosystem API response
 * Returns array of hourly datapoints (not individual documents)
 */
function parseMetricsTimeSeries(metricsResponse) {
  if (!metricsResponse) return [];

  const hourlyDatapoints = [];
  const timestampMap = new Map();

  // Helper to add metric to timestamp bucket
  const addMetric = (metricName, array, valueKey = 'value') => {
    if (!array || !Array.isArray(array)) return;
    
    for (const entry of array) {
      if (!entry.timestamp) continue;
      
      const timestamp = entry.timestamp;
      if (!timestampMap.has(timestamp)) {
        timestampMap.set(timestamp, { timestamp });
      }
      
      const bucket = timestampMap.get(timestamp);
      if (entry[valueKey] !== null && entry[valueKey] !== undefined) {
        bucket[metricName] = metricName.includes('avg') 
          ? parseFloat(entry[valueKey].toFixed(2))
          : Math.round(entry[valueKey]);
      }
    }
  };

  // Parse all metrics into timestamp buckets
  addMetric('peak_ccu', metricsResponse.peakCCU);
  addMetric('unique_players', metricsResponse.uniquePlayers);
  addMetric('plays', metricsResponse.plays);
  addMetric('minutes_played', metricsResponse.minutesPlayed);
  addMetric('avg_minutes_per_player', metricsResponse.averageMinutesPerPlayer);
  addMetric('favorites', metricsResponse.favorites);
  addMetric('recommendations', metricsResponse.recommendations);

  // Convert to array of datapoints
  for (const [timestamp, metrics] of timestampMap) {
    hourlyDatapoints.push(metrics);
  }

  return hourlyDatapoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}
 console.log(' Calculating map performance metrics...');

/**
 * Collect metrics for all maps from Ecosystem API
 */
async function collectMapMetrics() {
  console.log(` Collecting ${COLLECT_INTERVAL} metrics from Ecosystem API...`);

  // Get yesterday's full 24 hours in 10-minute intervals
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0); // Start of yesterday
  
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999); // End of yesterday
  
  const fromTime = yesterday.toISOString();
  const toTime = yesterdayEnd.toISOString();
  
  console.log(`Time range: ${fromTime} to ${toTime}`);

  // Get all maps
  const mapsResponse = await es.search({
    index: 'maps',
    size: 10000,
    scroll: '5m',
    _source: ['id']
  });

  let scrollId = mapsResponse._scroll_id;
  let maps = mapsResponse.hits.hits;
  let processed = 0;
  let successful = 0;
  let failed = 0;
  let noData = 0;

  console.log(`Found ${mapsResponse.hits.total.value} maps to process\n`);

  while (maps.length > 0) {
    // Process in batches to avoid overwhelming API
    for (let i = 0; i < maps.length; i += BATCH_SIZE) {
      const batch = maps.slice(i, i + BATCH_SIZE);
      const bulk = [];

      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} maps)...`);

      // Fetch metrics for batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (map) => {
          const mapId = map._source.id;
          
          try {
            // Fetch hourly metrics for yesterday's full 24 hours
            const metricsResponse = await ecosystemAPI.getIslandMetrics(
              mapId,
              COLLECT_INTERVAL,
              fromTime,
              toTime
            );

            if (!metricsResponse) {
              return { mapId, status: 'no_data' };
            }

            // Parse into array of hourly datapoints
            const hourlyDatapoints = parseMetricsTimeSeries(metricsResponse);
            
            if (!hourlyDatapoints || hourlyDatapoints.length === 0) {
              return { mapId, status: 'no_data' };
            }

            return { mapId, hourlyDatapoints, status: 'success' };
          } catch (error) {
            return { mapId, status: 'error', error: error.message };
          }
        })
      );

      // Process results and build bulk insert
      const yesterdayDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { mapId, hourlyDatapoints, status, error } = result.value;

          if (status === 'success' && hourlyDatapoints && hourlyDatapoints.length > 0) {
            // ONE document per map per day, with array of 24 hourly datapoints
            const docId = `${mapId}-${yesterdayDate}`;
            
            bulk.push(
              { index: { _index: 'map-metrics-history', _id: docId } },
              {
                map_id: mapId,
                date: yesterdayDate,
                interval: COLLECT_INTERVAL,
                hourly_metrics: hourlyDatapoints,
                data_source: 'ecosystem_api',
                collected_at: new Date()
              }
            );
            successful++;
          } else if (status === 'no_data') {
            noData++;
          } else if (status === 'error') {
            console.error(`  Failed ${mapId}: ${error}`);
            failed++;
          }
        } else {
          failed++;
        }
      }

      // Execute bulk insert
      if (bulk.length > 0) {
        try {
          await es.bulk({ body: bulk, refresh: false });
          processed += bulk.length / 2;
        } catch (error) {
          console.error('  Bulk insert error:', error.message);
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < maps.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Get next scroll batch
    const scrollResponse = await es.scroll({
      scroll_id: scrollId,
      scroll: '5m'
    });

    maps = scrollResponse.hits.hits;
    scrollId = scrollResponse._scroll_id;
  }

  // Clear scroll
  if (scrollId) {
    await es.clearScroll({ scroll_id: scrollId });
  }

  console.log(`\n Metrics Collection Complete:`);
  console.log(`  Successful: ${successful}`);
  console.log(`  No Data: ${noData}`);
  console.log(`  Failed: ${failed}\n`);
}

/**
 * Run daily collection
 */
async function runDailyCollection() {
  console.log('\n');
  console.log(' Ecosystem Metrics Collection Starting... ');
  console.log('');
  console.log(`⏰ ${new Date().toISOString()}\n`);

  const startTime = Date.now();

  try {
    await collectMapMetrics();

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log('\n');
    console.log(' Metrics Collection Complete! ');
    console.log('');
    console.log(` Completed in ${elapsed} minutes\n`);

  } catch (error) {
    console.error('❌ Metrics collection error:', error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n');
  console.log(' Worker 5: Ecosystem Metrics Collector (Cron: 01:00) ');
  console.log('\n');

  // Schedule daily at 1 AM UTC (after Worker 4 discovery monitor)
  cron.schedule('0 1 * * *', () => {
    runDailyCollection();
  });

  console.log('✓ Metrics collector scheduled for 01:00 UTC');
  console.log(' Waiting for scheduled time...\n');

  // Optional: Run immediately on startup for testing
  if (process.argv.includes('--run-now')) {
    console.log(' Running collection immediately (--run-now flag)...\n');
    await runDailyCollection();
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️ Shutting down metrics collector...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Shutting down metrics collector...');
  process.exit(0);
});

// Start worker
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
