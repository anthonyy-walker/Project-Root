#!/usr/bin/env node

/**
 * Worker 6: Data Compactor
 *
 * Runs monthly to compact old data and reduce storage
 * 
 * ECOSYSTEM METRICS (map-metrics-history):
 * - Individual 10-minute datapoint documents (same structure as CCU)
 * - 1 week old: 10min → 30min intervals
 * - 1 month old: 30min → 1 hour intervals
 * - 1 year old: 1 hour → 12 hour intervals
 * 
 * CCU DATA (concurrent-users-*):
 * - 1 week old: 10min → 30min intervals
 * - 1 month old: 30min → 1 hour intervals
 * - 1 year old: 1 hour → 12 hour intervals
 */

const { Client } = require('@elastic/elasticsearch');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

// Ecosystem metrics retention
const ECOSYSTEM_RETENTION_DAYS = 30; // Keep hourly data for last 30 days
const ECOSYSTEM_BATCH_SIZE = 1000; // Process 1000 documents per batch

// CCU aggregation thresholds
const CCU_1_WEEK_DAYS = 7;   // After 7 days: 10min → 30min
const CCU_1_MONTH_DAYS = 30;  // After 30 days: 30min → 1 hour
const CCU_1_YEAR_DAYS = 365;  // After 365 days: 1 hour → 12 hours

/**
 * Compact CCU data based on age
 * - 1 week old: 10min → 30min intervals (keep every 3rd datapoint)
 * - 1 month old: 30min → 1 hour intervals (keep every 2nd datapoint)
 * - 1 year old: 1 hour → 12 hour intervals (average every 12 hours)
 */
async function compactCCUData() {
  console.log(' Compacting CCU data...');

  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - CCU_1_WEEK_DAYS);
  
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setDate(oneMonthAgo.getDate() - CCU_1_MONTH_DAYS);
  
  const oneYearAgo = new Date(now);
  oneYearAgo.setDate(oneYearAgo.getDate() - CCU_1_YEAR_DAYS);

  // Compact both CCU and ecosystem metrics (both use timestamp-based documents)
  const indexes = ['concurrent-users-*', 'map-metrics-history'];
  
  for (const indexPattern of indexes) {
    console.log(`\nCompacting index: ${indexPattern}`);
    
    // Stage 1: 1 week old → 30 minute intervals (delete 2 out of every 3 documents)
    console.log('\nStage 1: Aggregating 7-day old data to 30-minute intervals...');
    await aggregateCCU(oneWeekAgo, oneMonthAgo, 30, indexPattern);
    
    // Stage 2: 1 month old → 1 hour intervals (delete every other 30min document)
    console.log('\nStage 2: Aggregating 30-day old data to 1-hour intervals...');
    await aggregateCCU(oneMonthAgo, oneYearAgo, 60, indexPattern);
    
    // Stage 3: 1 year old → 12 hour intervals (keep 2 per day)
    console.log('\nStage 3: Aggregating 1-year old data to 12-hour intervals...');
    await aggregateCCU(oneYearAgo, new Date('2000-01-01'), 720, indexPattern);
  }
  
  console.log('\n✓ CCU compaction complete\n');
}

/**
 * Aggregate CCU data to target interval (in minutes)
 * Strategy: Delete documents that don't align with target interval
 */
async function aggregateCCU(startDate, endDate, targetIntervalMinutes, indexPattern) {
  console.log(`  Time range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`  Target interval: ${targetIntervalMinutes} minutes`);

  try {
    // Find all documents in time range
    const searchResponse = await es.search({
      index: indexPattern,
      size: 10000,
      scroll: '5m',
      body: {
        query: {
          range: {
            timestamp: {
              gte: startDate.toISOString(),
              lt: endDate.toISOString()
            }
          }
        },
        sort: [{ timestamp: 'asc' }]
      }
    });

    let scrollId = searchResponse._scroll_id;
    let documents = searchResponse.hits.hits;
    let deleted = 0;
    let kept = 0;

    console.log(`  Found ${searchResponse.hits.total.value} documents to process`);

    while (documents.length > 0) {
      const bulk = [];

      for (const doc of documents) {
        const timestamp = new Date(doc._source.timestamp);
        const minutes = timestamp.getUTCMinutes();

        // Determine if this timestamp should be kept
        let shouldKeep = false;

        if (targetIntervalMinutes === 30) {
          // Keep :00 and :30
          shouldKeep = minutes === 0 || minutes === 30;
        } else if (targetIntervalMinutes === 60) {
          // Keep :00 only
          shouldKeep = minutes === 0;
        } else if (targetIntervalMinutes === 720) {
          // Keep :00 at 00:00 and 12:00 only
          const hours = timestamp.getUTCHours();
          shouldKeep = minutes === 0 && (hours === 0 || hours === 12);
        }

        if (!shouldKeep) {
          // Delete this document
          bulk.push({ delete: { _index: doc._index, _id: doc._id } });
          deleted++;
        } else {
          kept++;
        }
      }

      // Execute bulk delete
      if (bulk.length > 0) {
        try {
          await es.bulk({ body: bulk, refresh: false });
        } catch (error) {
          console.error('  Bulk delete error:', error.message);
        }
      }

      // Get next batch
      const scrollResponse = await es.scroll({
        scroll_id: scrollId,
        scroll: '5m'
      });

      documents = scrollResponse.hits.hits;
      scrollId = scrollResponse._scroll_id;
    }

    // Clear scroll
    if (scrollId) {
      await es.clearScroll({ scroll_id: scrollId });
    }

    console.log(`  Kept: ${kept} documents`);
    console.log(`  Deleted: ${deleted} documents`);
  } catch (error) {
    console.error(`  Error aggregating CCU data:`, error.message);
  }
}

/**
 * Aggregate hourly metrics into daily summary
 */
function aggregateHourlyToDaily(hourlyMetrics) {
  if (!hourlyMetrics || hourlyMetrics.length === 0) return null;

  const totals = {
    peak_ccu: [],
    unique_players: [],
    plays: [],
    minutes_played: [],
    avg_minutes_per_player: [],
    favorites: [],
    recommendations: []
  };

  // Collect all values
  for (const hour of hourlyMetrics) {
    if (hour.peak_ccu !== null && hour.peak_ccu !== undefined) totals.peak_ccu.push(hour.peak_ccu);
    if (hour.unique_players !== null && hour.unique_players !== undefined) totals.unique_players.push(hour.unique_players);
    if (hour.plays !== null && hour.plays !== undefined) totals.plays.push(hour.plays);
    if (hour.minutes_played !== null && hour.minutes_played !== undefined) totals.minutes_played.push(hour.minutes_played);
    if (hour.avg_minutes_per_player !== null && hour.avg_minutes_per_player !== undefined) totals.avg_minutes_per_player.push(hour.avg_minutes_per_player);
    if (hour.favorites !== null && hour.favorites !== undefined) totals.favorites.push(hour.favorites);
    if (hour.recommendations !== null && hour.recommendations !== undefined) totals.recommendations.push(hour.recommendations);
  }

  // Calculate daily aggregates
  const daily = {};

  // Peak CCU: Max of all hours
  if (totals.peak_ccu.length > 0) {
    daily.peak_ccu = Math.max(...totals.peak_ccu);
  }

  // Unique players: Sum (can't average, players are unique across hours)
  if (totals.unique_players.length > 0) {
    daily.unique_players = totals.unique_players.reduce((a, b) => a + b, 0);
  }

  // Plays: Sum of all plays
  if (totals.plays.length > 0) {
    daily.plays = totals.plays.reduce((a, b) => a + b, 0);
  }

  // Minutes played: Sum of all minutes
  if (totals.minutes_played.length > 0) {
    daily.minutes_played = totals.minutes_played.reduce((a, b) => a + b, 0);
  }

  // Average minutes per player: Calculate from totals
  if (daily.minutes_played && daily.unique_players) {
    daily.avg_minutes_per_player = parseFloat((daily.minutes_played / daily.unique_players).toFixed(2));
  } else if (totals.avg_minutes_per_player.length > 0) {
    // Fallback: average of hourly averages
    daily.avg_minutes_per_player = parseFloat(
      (totals.avg_minutes_per_player.reduce((a, b) => a + b, 0) / totals.avg_minutes_per_player.length).toFixed(2)
    );
  }

  // Favorites: Sum
  if (totals.favorites.length > 0) {
    daily.favorites = totals.favorites.reduce((a, b) => a + b, 0);
  }

  // Recommendations: Sum
  if (totals.recommendations.length > 0) {
    daily.recommendations = totals.recommendations.reduce((a, b) => a + b, 0);
  }

  return daily;
}

/**
 * Compact old hourly data into daily summaries
 */
async function compactEcosystemData() {
  console.log(' Compacting old ecosystem hourly data into daily summaries...');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ECOSYSTEM_RETENTION_DAYS);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  console.log(`Cutoff date: ${cutoffDateStr} (data older than this will be compacted)\n`);

  // Find documents with hourly_metrics older than 30 days
  const searchResponse = await es.search({
    index: 'map-metrics-history',
    size: ECOSYSTEM_BATCH_SIZE,
    scroll: '5m',
    body: {
      query: {
        bool: {
          must: [
            { exists: { field: 'hourly_metrics' } },
            { range: { date: { lt: cutoffDateStr } } }
          ]
        }
      }
    }
  });

  let scrollId = searchResponse._scroll_id;
  let documents = searchResponse.hits.hits;
  let processed = 0;
  let compacted = 0;

  console.log(`Found ${searchResponse.hits.total.value} documents to compact\n`);

  while (documents.length > 0) {
    const bulk = [];

    for (const doc of documents) {
      const { map_id, date, hourly_metrics, data_source } = doc._source;

      try {
        // Aggregate hourly data into daily summary
        const dailySummary = aggregateHourlyToDaily(hourly_metrics);

        if (dailySummary) {
          // Replace hourly_metrics with daily_metrics
          bulk.push(
            { update: { _index: 'map-metrics-history', _id: doc._id } },
            {
              script: {
                source: `
                  ctx._source.remove('hourly_metrics');
                  ctx._source.daily_metrics = params.daily_metrics;
                  ctx._source.compacted_at = params.compacted_at;
                `,
                params: {
                  daily_metrics: dailySummary,
                  compacted_at: new Date().toISOString()
                }
              }
            }
          );
          compacted++;
        }

        processed++;
      } catch (error) {
        console.error(`Error compacting ${map_id}-${date}:`, error.message);
      }
    }

    // Execute bulk update
    if (bulk.length > 0) {
      try {
        await es.bulk({ body: bulk, refresh: false });
        console.log(` Compacted ${compacted} documents (${processed} processed)...`);
      } catch (error) {
        console.error('Bulk update error:', error.message);
      }
    }

    // Get next batch
    const scrollResponse = await es.scroll({
      scroll_id: scrollId,
      scroll: '5m'
    });

    documents = scrollResponse.hits.hits;
    scrollId = scrollResponse._scroll_id;
  }

  // Clear scroll
  if (scrollId) {
    await es.clearScroll({ scroll_id: scrollId });
  }

  console.log(`\n Compaction Complete:`);
  console.log(`  Total documents processed: ${processed}`);
  console.log(`  Compacted: ${compacted}\n`);
}

/**
 * Run monthly compaction
 */
async function runMonthlyCompaction() {
  console.log('\n');
  console.log(' Monthly Data Compaction Starting... ');
  console.log('');
  console.log(`⏰ ${new Date().toISOString()}\n`);

  const startTime = Date.now();

  try {
    await compactEcosystemData();
    await compactCCUData();

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log('\n');
    console.log(' Monthly Compaction Complete! ');
    console.log('');
    console.log(` Completed in ${elapsed} minutes\n`);

  } catch (error) {
    console.error('❌ Monthly compaction error:', error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n');
  console.log(' Worker 6: Data Compactor (Cron: 1st of month, 02:00) ');
  console.log('\n');

  // Schedule monthly on 1st day at 2 AM UTC (0 2 1 * *)
  cron.schedule('0 2 1 * *', () => {
    runMonthlyCompaction();
  });

  console.log('✓ Data compactor scheduled for 1st of each month at 02:00 UTC');
  console.log(' Waiting for scheduled time...\n');

  // Optional: Run immediately on startup for testing
  if (process.argv.includes('--run-now')) {
    console.log(' Running compaction immediately (--run-now flag)...\n');
    await runMonthlyCompaction();
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️ Shutting down data compactor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Shutting down data compactor...');
  process.exit(0);
});

// Start worker
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
