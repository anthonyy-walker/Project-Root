#!/usr/bin/env node

/**
 * Player Counts Worker
 *
 * Monitors concurrent users for all maps
 * - Runs every 10 minutes at :00, :10, :20, :30, :40, :50
 * - Fetches CCU from creator page API for all creators
 * - Auto-discovers new maps from playercount data
 * - Skips -1 values (invalid/unavailable)
 * - Updates time-series index
 * - Timestamps are exact (on-the-dot: 8:00, 8:10, 8:20, etc.)
 */

const { Client } = require('@opensearch-project/opensearch');
const { getCreatorMaps } = require('../../EpicGames/apis/creatorPageAPI');
const { getMnemonicInfo } = require('../../EpicGames/apis/mnemonicInfoAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('../utils/auth-helper');
const { ProgressBar } = require('../utils/progress-bar');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OPENSEARCH_HOST = process.env.OPENSEARCH_HOST;
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME;
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD;
const SNAPSHOT_INTERVAL_MINUTES = 10; // Take snapshot every 10 minutes
const BATCH_SIZE = 50; // Process 50 creators concurrently
const BULK_INSERT_SIZE = 500; // Bulk insert every 500 records

const clientConfig = {
  node: OPENSEARCH_HOST,
  ssl: {
    rejectUnauthorized: false
  }
};

if (OPENSEARCH_USERNAME && OPENSEARCH_PASSWORD) {
  clientConfig.auth = {
    username: OPENSEARCH_USERNAME,
    password: OPENSEARCH_PASSWORD
  };
}

const client = new Client(clientConfig);

/**
 * Calculate next snapshot time (aligned to 10-minute intervals)
 * Returns milliseconds to wait until next :00, :10, :20, :30, :40, or :50
 */
function getMillisecondsUntilNextSnapshot() {
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();
  const currentMs = now.getMilliseconds();

  // Calculate next 10-minute mark
  const nextMinute = Math.ceil((currentMinute + 1) / SNAPSHOT_INTERVAL_MINUTES) * SNAPSHOT_INTERVAL_MINUTES;

  // If we're past :50, go to next hour
  const targetMinute = nextMinute >= 60 ? 0 : nextMinute;
  const hoursToAdd = nextMinute >= 60 ? 1 : 0;

  // Create target time
  const targetTime = new Date(now);
  targetTime.setHours(targetTime.getHours() + hoursToAdd);
  targetTime.setMinutes(targetMinute);
  targetTime.setSeconds(0);
  targetTime.setMilliseconds(0);

  return targetTime.getTime() - now.getTime();
}

/**
 * Get exact snapshot timestamp (aligned to 10-minute mark)
 */
function getExactSnapshotTime() {
  const now = new Date();
  now.setSeconds(0);
  now.setMilliseconds(0);

  // Round down to nearest 10-minute mark
  const currentMinute = now.getMinutes();
  const alignedMinute = Math.floor(currentMinute / SNAPSHOT_INTERVAL_MINUTES) * SNAPSHOT_INTERVAL_MINUTES;
  now.setMinutes(alignedMinute);

  return now;
}

/**
 * Get all creators from Elasticsearch using scroll API
 */
async function getAllCreators() {
  const allCreators = [];
  const scrollTimeout = '5m';

  // Initial search
  let response = await client.search({
    index: 'creators',
    scroll: scrollTimeout,
    size: 1000,
    _source: ['id', 'account_id', 'display_name'],
    body: {
      query: { match_all: {} }
    }
  });

  let scrollId = response.body._scroll_id;
  let hits = response.body.hits.hits;

  // Add first batch
  allCreators.push(...hits.map(hit => ({
    creator_id: hit._source.account_id || hit._source.id,
    display_name: hit._source.display_name || hit._source.account_id
  })));

  // Continue scrolling until no more results
  while (hits.length > 0) {
    response = await client.scroll({
      scroll_id: scrollId,
      scroll: scrollTimeout
    });

    scrollId = response.body._scroll_id;
    hits = response.body.hits.hits;

    if (hits.length > 0) {
      allCreators.push(...hits.map(hit => ({
        creator_id: hit._source.account_id || hit._source.id,
        display_name: hit._source.display_name || hit._source.account_id
      })));
    }
  }

  // Clear scroll
  try {
    await client.clearScroll({ scroll_id: scrollId });
  } catch (error) {
    // Ignore errors clearing scroll
  }

  return allCreators;
}

/**
 * Fetch all maps for a creator with pagination
 */
async function fetchCreatorMapsWithCCU(creatorId, accessToken, accountId) {
  const allMaps = [];
  let olderThan = null;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await getCreatorMaps(
        creatorId,
        accessToken,
        accountId,
        100,
        olderThan
      );

      if (!response || !response.links || response.links.length === 0) {
        break;
      }

      allMaps.push(...response.links);
      hasMore = response.hasMore || false;

      if (hasMore && response.links.length > 0) {
        const lastMap = response.links[response.links.length - 1];
        olderThan = lastMap.lastActivatedDate;
      } else {
        break;
      }
    } catch (error) {
      console.error(`Error fetching maps for creator ${creatorId}:`, error.message);
      break;
    }
  }

  return allMaps;
}

/**
 * Process a single creator and return CCU data
 */
async function processCreator(creator, accessToken, accountId, snapshotTime) {
  try {
    const maps = await fetchCreatorMapsWithCCU(creator.creator_id, accessToken, accountId);
    const ccuRecords = [];

    for (const map of maps) {
      const linkCode = map.linkCode;
      const globalCCU = map.globalCCU || -1;

      // Skip invalid CCU values
      if (globalCCU < 0) {
        continue;
      }

      ccuRecords.push({
        map_id: linkCode,
        ccu: globalCCU,
        creator_id: creator.creator_id,
        timestamp: snapshotTime,
        source: 'creator_page_api'
      });
    }

    return {
      creator_id: creator.creator_id,
      maps_count: maps.length,
      ccu_records: ccuRecords,
      error: null
    };
  } catch (error) {
    return {
      creator_id: creator.creator_id,
      maps_count: 0,
      ccu_records: [],
      error: error.message
    };
  }
}

/**
 * Process creators in batches with concurrency
 */
async function processCreatorBatch(creators, accessToken, accountId, snapshotTime) {
  const promises = creators.map(creator =>
    processCreator(creator, accessToken, accountId, snapshotTime)
  );
  return await Promise.all(promises);
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log('\n');
  console.log(' Worker 3: CCU Monitor - Player Count Snapshot ');
  console.log(' Every 10 Minutes (:00, :10, :20, etc.) ');
  console.log('\n');

  // Initialize authentication
  initializeAuth();

  // Wait until next aligned timestamp before starting
  const initialWait = getMillisecondsUntilNextSnapshot();
  const nextTime = new Date(Date.now() + initialWait);
  console.log(`⏰ Waiting until ${nextTime.toISOString()} to start first snapshot (${(initialWait / 1000).toFixed(0)}s)...`);
  await new Promise(resolve => setTimeout(resolve, initialWait));

  while (true) {
    // Use exact snapshot time (aligned to 10-minute mark)
    const snapshotTime = getExactSnapshotTime();
    const startTime = Date.now();

    try {
      console.log(` [${snapshotTime.toISOString()}] Starting player count snapshot...`);

      // Get auth credentials
      const accessToken = await getAccessToken();
      const accountId = await getAccountId();

      // 1. Get all creators
      const creators = await getAllCreators();
      console.log(`📋 Found ${creators.length} creators to process`);

      let totalMaps = 0;
      let processedCreators = 0;
      let ccuDataPoints = 0;
      let errors = 0;
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Initialize progress bar
      const progressBar = new ProgressBar('Player Counts', creators.length);

      // 2. Process creators in batches
      const bulkBuffer = [];

      for (let i = 0; i < creators.length; i += BATCH_SIZE) {
        const batch = creators.slice(i, i + BATCH_SIZE);
        const results = await processCreatorBatch(batch, accessToken, accountId, snapshotTime);

        // Collect results
        for (const result of results) {
          processedCreators++;

          if (result.error) {
            errors++;
            continue;
          }

          totalMaps += result.maps_count;

          // Add CCU records to bulk buffer
          for (const record of result.ccu_records) {
            bulkBuffer.push(
              { index: { _index: `concurrent-users-${currentMonth}` } },
              record
            );
            ccuDataPoints++;
          }
        }

        // Bulk insert when buffer is large enough
        if (bulkBuffer.length >= BULK_INSERT_SIZE * 2) {
          try {
            await client.bulk({ body: bulkBuffer, refresh: false });
            bulkBuffer.length = 0; // Clear buffer
          } catch (error) {
            console.error('❌ Bulk insert error:', error.message);
          }
        }

        // Update progress bar
        progressBar.update(processedCreators, {
          'Maps': totalMaps,
          'CCU Points': ccuDataPoints,
          'Errors': errors
        });
      }

      progressBar.finish();

      // Insert remaining records
      if (bulkBuffer.length > 0) {
        try {
          await client.bulk({ body: bulkBuffer, refresh: false });
        } catch (error) {
          console.error('❌ Final bulk insert error:', error.message);
        }
      }

      console.log(`✓ Player count snapshot completed:`);
      console.log(`  - Creators processed: ${processedCreators}`);
      console.log(`  - Total maps: ${totalMaps}`);
      console.log(`  - CCU data points: ${ccuDataPoints}`);
      console.log(`  - Errors: ${errors}`);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Duration: ${duration}s`);

    } catch (error) {
      console.error('❌ CCU monitor error:', error);
      console.error(error.stack);
    }

    // Wait until next aligned 10-minute mark
    const waitTime = getMillisecondsUntilNextSnapshot();
    const nextSnapshotTime = new Date(Date.now() + waitTime);
    const waitMinutes = (waitTime / 1000 / 60).toFixed(1);

    console.log(`⏰ Next snapshot at ${nextSnapshotTime.toISOString()} (in ${waitMinutes} minutes)\n`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️ Shutting down CCU monitor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Shutting down CCU monitor...');
  process.exit(0);
});

// Start worker
runWorker().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
