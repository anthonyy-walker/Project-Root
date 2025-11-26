#!/usr/bin/env node

/**
 * Seed Maps Database - Bulk Mode
 * 
 * Fetches ALL map codes from discovery/CCU and populates the database
 * with fresh map data from Epic's Links Service API.
 * 
 * This is a one-time seed operation - no change detection, just pure insertion.
 * Runs FAST with maximum parallelization.
 */

const { Client } = require('@elastic/elasticsearch');
const { getBulkMnemonicInfo } = require('../EpicGames/apis/linksServiceAPI');
const { transformMapData } = require('../database/transformers/mapTransformer');
const { initAuth, getValidToken } = require('../EpicGames/auth/auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

const BATCH_SIZE = 100; // Links Service supports 100 per request
const PARALLEL_BATCHES = 20; // Process 20 batches in parallel (2000 maps at once!)
const ES_BULK_SIZE = 500; // Elasticsearch bulk operation size - balanced for network latency

// Statistics
const stats = {
  totalMaps: 0,
  fetched: 0,
  indexed: 0,
  errors: 0,
  startTime: Date.now()
};

/**
 * Fetch all map codes from the existing maps index
 */
async function fetchExistingMapCodes() {
  console.log('📦 Fetching map codes from maps index...\n');
  const mapCodes = [];

  try {
    // Scroll through all documents in the maps index
    let scrollId;
    let response = await es.search({
      index: 'maps',
      scroll: '2m',
      size: 10000,
      _source: false, // We only need the _id
      body: {
        query: { match_all: {} }
      }
    });

    scrollId = response._scroll_id;
    
    // Add map codes from first batch
    for (const hit of response.hits.hits) {
      if (hit._id && hit._id.match(/^\d{4}-\d{4}-\d{4}$/)) {
        mapCodes.push(hit._id);
      }
    }

    console.log(`  ✓ Found ${mapCodes.length} maps...`);

    // Continue scrolling
    while (response.hits.hits.length > 0) {
      response = await es.scroll({
        scroll_id: scrollId,
        scroll: '2m'
      });

      for (const hit of response.hits.hits) {
        if (hit._id && hit._id.match(/^\d{4}-\d{4}-\d{4}$/)) {
          mapCodes.push(hit._id);
        }
      }

      if (response.hits.hits.length > 0) {
        console.log(`  ✓ Found ${mapCodes.length} maps...`);
      }
    }

    // Clear scroll
    if (scrollId) {
      await es.clearScroll({ scroll_id: scrollId });
    }

    console.log(`\n✅ Total maps to refresh: ${mapCodes.length.toLocaleString()}\n`);
    return mapCodes;
    
  } catch (error) {
    console.error('❌ Error fetching map codes:', error.message);
    return [];
  }
}

/**
 * Process a batch of maps from Epic API
 */
async function processBatch(mapIds) {
  const batchStartTime = Date.now();
  
  try {
    const tokenData = await getValidToken();
    
    console.log(`  🔄 Requesting ${mapIds.length} maps from Epic API...`);
    const linksData = await getBulkMnemonicInfo(mapIds, tokenData.access_token, {
      ignoreFailures: true
    });

    const apiTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);

    if (!linksData || linksData.length === 0) {
      console.error(`  ❌ Epic API returned no data for ${mapIds.length} maps (${apiTime}s)`);
      stats.errors += mapIds.length;
      return [];
    }

    // Transform to Elasticsearch format
    const documents = linksData
      .filter(data => data && !data.error)
      .map(data => {
        const transformed = transformMapData(data, {
          ingestionSource: 'bulk_seed'
        });
        stats.fetched++;
        return transformed;
      });

    const errorCount = mapIds.length - documents.length;
    if (errorCount > 0) {
      console.log(`  ⚠️  Epic API: ${documents.length} success, ${errorCount} errors (${apiTime}s)`);
      stats.errors += errorCount;
    } else {
      console.log(`   Epic API: ${documents.length} maps fetched (${apiTime}s)`);
    }

    return documents;

  } catch (error) {
    const apiTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    console.error(`  ❌ Epic API batch error (${apiTime}s): ${error.message}`);
    stats.errors += mapIds.length;
    return [];
  }
}

/**
 * Bulk index documents to Elasticsearch
 */
async function bulkIndexMaps(documents) {
  if (documents.length === 0) return 0;

  console.log(`  📤 Indexing batch of ${documents.length} documents...`);
  const startTime = Date.now();

  const body = documents.flatMap(doc => [
    { index: { _index: 'maps', _id: doc.code } },
    doc
  ]);

  try {
    const result = await es.bulk({ 
      body, 
      refresh: false,
      timeout: '120s', // Longer timeout for larger batches
      requestTimeout: 120000 // 120 seconds in milliseconds
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ Indexed in ${elapsed}s`);

    if (result.errors) {
      const errors = result.items.filter(item => item.index?.error);
      console.error(`  ⚠️  ${errors.length} indexing errors in batch`);
      stats.errors += errors.length;
      stats.indexed += (documents.length - errors.length);
      return documents.length - errors.length;
    }

    stats.indexed += documents.length;
    return documents.length;
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Bulk index error after ${elapsed}s: ${error.message}`);
    stats.errors += documents.length;
    return 0;
  }
}

/**
 * Main seeding function
 */
async function seedMapsDatabase() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🌱 MAPS DATABASE SEEDING - BULK MODE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');

  try {
    // Initialize authentication
    console.log('🔐 Initializing authentication...');
    await initAuth();
    console.log('✅ Authentication ready\n');

    // Fetch all active map codes
    const allMapCodes = await fetchExistingMapCodes();
    
    if (allMapCodes.length === 0) {
      console.log('⚠️  No map codes found. Exiting.');
      return;
    }

    stats.totalMaps = allMapCodes.length;
    console.log(`📊 Total maps to seed: ${stats.totalMaps.toLocaleString()}`);
    console.log(`⚡ Parallel processing: ${PARALLEL_BATCHES} batches (${PARALLEL_BATCHES * BATCH_SIZE} maps at once)`);
    console.log(`📦 Elasticsearch bulk size: ${ES_BULK_SIZE}\n`);

    // Process maps in parallel batches
    console.log('⚙️  Processing maps from Epic API...\n');
    
    let allDocuments = [];

    for (let i = 0; i < allMapCodes.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
      const batchRoundStart = Date.now();
      
      // Create parallel batch promises
      const parallelBatches = [];
      for (let j = 0; j < PARALLEL_BATCHES && (i + j * BATCH_SIZE) < allMapCodes.length; j++) {
        const start = i + j * BATCH_SIZE;
        const chunk = allMapCodes.slice(start, start + BATCH_SIZE);
        parallelBatches.push(processBatch(chunk));
      }

      console.log(`\n🚀 Starting ${parallelBatches.length} parallel API calls...`);
      
      // Wait for all parallel batches to complete
      const results = await Promise.all(parallelBatches);

      const apiRoundTime = ((Date.now() - batchRoundStart) / 1000).toFixed(1);
      console.log(`✅ All API calls completed in ${apiRoundTime}s\n`);

      // Aggregate documents
      for (const docs of results) {
        allDocuments.push(...docs);
      }

      // Bulk index when we have enough documents
      while (allDocuments.length >= ES_BULK_SIZE) {
        const toIndex = allDocuments.splice(0, ES_BULK_SIZE);
        await bulkIndexMaps(toIndex);
      }

      // Progress update
      const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
      const rate = (stats.fetched / elapsed).toFixed(0);
      const percentComplete = ((stats.fetched / stats.totalMaps) * 100).toFixed(1);
      
      console.log(`📊 Progress: ${stats.fetched.toLocaleString()}/${stats.totalMaps.toLocaleString()} (${percentComplete}%) | Rate: ${rate}/min | Indexed: ${stats.indexed.toLocaleString()} | Errors: ${stats.errors.toLocaleString()}\n`);
    }

    // Index remaining documents
    if (allDocuments.length > 0) {
      console.log(`\n💾 Indexing remaining ${allDocuments.length} maps...`);
      await bulkIndexMaps(allDocuments);
    }

    // Refresh index
    console.log('🔄 Refreshing maps index...');
    await es.indices.refresh({ index: 'maps' });

    // Final statistics
    const totalTime = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(2);
    const avgRate = (stats.indexed / totalTime).toFixed(0);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ SEEDING COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📊 Final Statistics:`);
    console.log(`   Total Maps: ${stats.totalMaps.toLocaleString()}`);
    console.log(`   Fetched: ${stats.fetched.toLocaleString()}`);
    console.log(`   Indexed: ${stats.indexed.toLocaleString()}`);
    console.log(`   Errors: ${stats.errors.toLocaleString()}`);
    console.log(`   Time: ${totalTime} minutes`);
    console.log(`   Average Rate: ${avgRate} maps/min`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  seedMapsDatabase()
    .then(() => {
      console.log('Exiting...');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { seedMapsDatabase };
