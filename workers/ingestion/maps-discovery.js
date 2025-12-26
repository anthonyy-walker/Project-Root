#!/usr/bin/env node

/**
 * Maps Discovery Worker
 *
 * Continuously scans creators to:
 * - Update maps_created count
 * - Discover new maps not in maps index
 * - Create placeholder entries for Maps Collector to enrich
 *
 * Rate: 50 creators per batch with 2-second delays (completes within 10 minutes)
 * Speed: ~10 minutes for typical creator count
 */

const { Client } = require('@opensearch-project/opensearch');
const { getCreatorMaps } = require('../../EpicGames/apis/creatorPageAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('../utils/auth-helper');
const { ProgressBar } = require('../utils/progress-bar');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OPENSEARCH_HOST = process.env.OPENSEARCH_HOST;
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME;
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD;
const SCROLL_SIZE = 1000;
const BATCH_SIZE = 50; // Process 50 creators in parallel (rate limited for 10-minute completion)
const BATCH_DELAY = 2000; // 2-second delay between batches to ensure completion within 10 minutes
const ERROR_RETRY_DELAY = 5000;

const clientConfig = {
  node: OPENSEARCH_HOST,
  auth: {
    username: OPENSEARCH_USERNAME,
    password: OPENSEARCH_PASSWORD
  },
  ssl: {
    rejectUnauthorized: false
  }
};

const es = new Client(clientConfig);

// Track statistics
const stats = {
 processed: 0,
 creatorsUpdated: 0,
 mapsDiscovered: 0,
 mapsAlreadyExist: 0,
 errors: 0,
 startTime: Date.now()
};

/**
 * Check which maps exist in the maps index
 */
async function checkExistingMaps(mapIds) {
 if (mapIds.length === 0) return new Set();

 try {
 const response = await es.mget({
 index: 'maps',
 body: {
 ids: mapIds
 }
 });

 const responseBody = response.body || response;
 const existingIds = new Set();

 if (responseBody.docs) {
 responseBody.docs.forEach(doc => {
 if (doc.found) {
 existingIds.add(doc._id);
 }
 });
 }

 return existingIds;
 } catch (error) {
 console.error('Error checking existing maps:', error.message);
 return new Set();
 }
}

/**
 * Create placeholder entries for newly discovered maps
 */
async function createMapPlaceholders(newMaps, creatorId, creatorName) {
 if (newMaps.length === 0) return;

 const bulkOps = [];

 for (const map of newMaps) {
 bulkOps.push({ index: { _index: 'maps', _id: map.linkCode } });
 bulkOps.push({
 id: map.linkCode,
 code: map.linkCode,
 mnemonic: map.mnemonic,
 creatorAccountId: creatorId,
 creatorName: creatorName,
 metadata: {
 first_indexed: new Date().toISOString(),
 discovery_source: 'creator_maps_discovery_worker',
 awaiting_enrichment: true
 }
 });
 }

 try {
 await es.bulk({ body: bulkOps, refresh: false });
 stats.mapsDiscovered += newMaps.length;
 } catch (error) {
 console.error(`Error creating map placeholders:`, error.message);
 }
}

/**
 * Process a single creator
 */
async function processCreator(creator) {
 const creatorId = creator._source.id;
 const creatorName = creator._source.display_name || 'Unknown';

 try {
 // Get auth credentials
 const accessToken = await getAccessToken();
 const accountId = await getAccountId();

 // Fetch creator's maps (no rate limit!)
 const creatorData = await getCreatorMaps(creatorId, accessToken, accountId, 100);

 if (!creatorData || !creatorData.links) {
 return false;
 }

 const mapLinks = creatorData.links;
 const mapsCreatedCount = mapLinks.length;

 // Extract map IDs (linkCode)
 const mapIds = mapLinks.map(link => link.linkCode).filter(Boolean);

 // If no maps, just update the count and skip discovery
 if (mapIds.length === 0) {
 await es.update({
 index: 'creators',
 id: creatorId,
 body: {
 doc: {
 totals: { maps_created: 0 },
 metadata: { last_maps_check: new Date().toISOString() }
 }
 },
 retry_on_conflict: 3
 });
 stats.creatorsUpdated++;
 return true;
 }

 // Check which maps already exist
 const existingMapIds = await checkExistingMaps(mapIds);

 // Find new maps
 const newMaps = mapLinks.filter(link =>
 link.linkCode && !existingMapIds.has(link.linkCode)
 );

 stats.mapsAlreadyExist += existingMapIds.size;

 // Create placeholders for new maps
 if (newMaps.length > 0) {
 await createMapPlaceholders(newMaps, creatorId, creatorName);
 }

 // Update creator's maps_created count
 await es.update({
 index: 'creators',
 id: creatorId,
 body: {
 doc: {
 totals: {
 maps_created: mapsCreatedCount
 },
 metadata: {
 last_maps_check: new Date().toISOString()
 }
 }
 },
 retry_on_conflict: 3
 });

 stats.creatorsUpdated++;
 return true;

 } catch (error) {
 stats.errors++;
 if (error.message.includes('404')) {
 // Creator doesn't exist or has no maps - this is normal
 return false;
 }
 console.error(`❌ Error processing creator ${creatorId}:`, error.message);
 return false;
 }
}

/**
 * Process a batch of creators
 */
async function processBatch(creators) {
 const promises = creators.map(creator => processCreator(creator));
 await Promise.all(promises);
}

/**
 * Main worker loop
 */
async function runWorker() {
 console.log('\n');
 console.log(' Worker 2B: Creator Maps Discovery (FAST) ');
 console.log(' No Rate Limit - Runs in ~15 min ');
 console.log('\n');

 // Initialize authentication
 initializeAuth();

 while (true) {
 try {
 console.log(' Starting new discovery cycle...');

 // Scroll through all creators
 let scrollId = null;

 const searchResponse = await es.search({
 index: 'creators',
 scroll: '5m',
 size: SCROLL_SIZE,
 body: {
 query: { match_all: {} }
 }
 });

 scrollId = searchResponse.body._scroll_id;
 const totalCreators = searchResponse.body.hits.total.value;
 console.log(` Total creators to scan: ${totalCreators.toLocaleString()}`);

 // Create progress bar
 const progress = new ProgressBar('Maps Discovery', totalCreators);

 let allCreators = searchResponse.body.hits.hits;

 while (allCreators.length > 0) {
 // Process batch in parallel with rate limiting
 const batches = [];
 for (let i = 0; i < allCreators.length; i += BATCH_SIZE) {
 batches.push(allCreators.slice(i, i + BATCH_SIZE));
 }

 for (const batch of batches) {
 await processBatch(batch);
 stats.processed += batch.length;

 // Update progress bar
 progress.update(stats.processed, {
 discovered: stats.mapsDiscovered,
 updated: stats.creatorsUpdated
 });
   
 if (stats.errors > 0) {
 progress.addError(stats.errors);
 }

 // Add delay between batches to ensure completion within 10 minutes
 if (batch.length === BATCH_SIZE) {
 await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
 }
 }

 // Get next scroll batch
 const scrollResponse = await es.scroll({
 scroll_id: scrollId,
 scroll: '5m'
 });

 allCreators = scrollResponse.body.hits.hits;
 scrollId = scrollResponse.body._scroll_id;
 }

 // Clear scroll
 if (scrollId) {
 await es.clearScroll({ scroll_id: scrollId });
 }

 const totalTime = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
 console.log('\n Discovery cycle complete!');
 console.log(` Time: ${totalTime} minutes`);
 console.log(` Creators scanned: ${stats.processed.toLocaleString()}`);
 console.log(` Creators updated: ${stats.creatorsUpdated.toLocaleString()}`);
 console.log(` New maps discovered: ${stats.mapsDiscovered.toLocaleString()}`);
 console.log(` Maps already tracked: ${stats.mapsAlreadyExist.toLocaleString()}`);
 console.log(` Errors: ${stats.errors}\n`);

 // Reset stats for next cycle
 stats.processed = 0;
 stats.creatorsUpdated = 0;
 stats.mapsDiscovered = 0;
 stats.mapsAlreadyExist = 0;
 stats.errors = 0;
 stats.startTime = Date.now();

 // Wait before next cycle (run every hour)
 console.log(' Waiting 1 hour before next cycle...\n');
 await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));

 } catch (error) {
 console.error('❌ Worker error:', error);
 console.log(` Retrying in ${ERROR_RETRY_DELAY / 1000}s...`);
 await new Promise(resolve => setTimeout(resolve, ERROR_RETRY_DELAY));
 }
 }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
 console.log('\n⏹️ Shutting down creator maps discovery worker...');
 process.exit(0);
});

process.on('SIGTERM', () => {
 console.log('\n⏹️ Shutting down creator maps discovery worker...');
 process.exit(0);
});

// Start the worker
runWorker().catch(error => {
 console.error('Fatal error:', error);
 process.exit(1);
});
