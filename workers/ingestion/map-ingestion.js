#!/usr/bin/env node

/**
 * Worker 1: Map Ingestion (Updated for Bulk Links Service)
 *
 * Continuously fetches and updates map data from Epic Links Service
 * - Uses bulk API (100 maps per request)
 * - Saves in fn360-compatible format
 * - Detects changes and logs to map-changelog
 * - Auto-discovers new creators
 * - Preserves performance metrics
 */

const { Client } = require('@elastic/elasticsearch');
const { getBulkMnemonicInfo } = require('../../EpicGames/apis/linksServiceAPI');
const { transformBulkMapData } = require('../../database/transformers/mapTransformer');
const { initAuth, getValidToken } = require('../../EpicGames/auth/auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ES_HOST = process.env.ELASTICSEARCH_URL
const BATCH_SIZE = 100; // Links Service supports 100 per request
const SCROLL_SIZE = 10000; // ES scroll size - increased for faster fetching
const ES_BULK_SIZE = 1000; // Elasticsearch bulk operation size - increased
const PARALLEL_BATCHES = 40; // Process 40 batches in parallel (4000 maps at once!)
const ERROR_RETRY_DELAY = 5000; // 5 seconds
const BATCH_DELAY = 0; // No delay - API has no rate limit!

// Initialize Elasticsearch client
const es = new Client({ node: ES_HOST });

// Worker state
let isRunning = false;

// Track statistics
const stats = {
 processed: 0,
 updated: 0,
 errors: 0,
 newCreators: 0,
 changeDetected: 0,
 startTime: Date.now()
};

/**
 * Fetch existing documents in bulk (for performance preservation)
 */
async function fetchExistingBulk(mapIds) {
 try {
 const response = await es.mget({
 index: 'maps',
 body: {
 ids: mapIds
 }
 });

 const responseBody = response.body || response;
 const existingMap = new Map();

 if (responseBody.docs) {
 for (const doc of responseBody.docs) {
 if (doc.found) {
 existingMap.set(doc._id, doc._source);
 }
 }
 }

 return existingMap;
 } catch (error) {
 console.error('Error fetching existing documents:', error.message);
 return new Map();
 }
}

/**
 * Detect changes between old and new map data
 * Updated for new schema format
 */
function detectChanges(oldDoc, newDoc) {
 const changes = {};

 // Check basic fields
 if (oldDoc.title !== newDoc.title) {
 changes.title = { old: oldDoc.title, new: newDoc.title };
 }
 if (oldDoc.description !== newDoc.description) {
 changes.description = { old: oldDoc.description, new: newDoc.description };
 }
 if (oldDoc.tagline !== newDoc.tagline) {
 changes.tagline = { old: oldDoc.tagline, new: newDoc.tagline };
 }

 // Check creator
 if (oldDoc.creatorAccountId !== newDoc.creatorAccountId) {
 changes.creator = {
 old: oldDoc.creatorAccountId,
 new: newDoc.creatorAccountId
 };
 }

 // Check tags
 const oldTags = (oldDoc.tags || []).sort().join(',');
 const newTags = (newDoc.tags || []).sort().join(',');
 if (oldTags !== newTags) {
 changes.tags = {
 old: oldDoc.tags || [],
 new: newDoc.tags || []
 };
 }

 // Check matchmaking
 if (oldDoc.minPlayers !== newDoc.minPlayers ||
 oldDoc.maxPlayers !== newDoc.maxPlayers) {
 changes.matchmaking = {
 old: { minPlayers: oldDoc.minPlayers, maxPlayers: oldDoc.maxPlayers },
 new: { minPlayers: newDoc.minPlayers, maxPlayers: newDoc.maxPlayers }
 };
 }

 // Check active status
 if (oldDoc.active !== newDoc.active) {
 changes.active = { old: oldDoc.active, new: newDoc.active };
 }

 // Check image
 if (oldDoc.image !== newDoc.image) {
 changes.image = { old: oldDoc.image, new: newDoc.image };
 }

 // Check version
 if (oldDoc.version !== newDoc.version) {
 changes.version = { old: oldDoc.version, new: newDoc.version };
 }

 // Check published date
 if (oldDoc.published !== newDoc.published) {
 changes.published = { old: oldDoc.published, new: newDoc.published };
 }

 // Check genre labels
 const oldGenre = (oldDoc.genreLabels || []).sort().join(',');
 const newGenre = (newDoc.genreLabels || []).sort().join(',');
 if (oldGenre !== newGenre) {
 changes.genre = {
 old: oldDoc.genreLabels || [],
 new: newDoc.genreLabels || []
 };
 }

 // Check category labels
 const oldCategory = (oldDoc.categoryLabels || []).sort().join(',');
 const newCategory = (newDoc.categoryLabels || []).sort().join(',');
 if (oldCategory !== newCategory) {
 changes.category = {
 old: oldDoc.categoryLabels || [],
 new: newDoc.categoryLabels || []
 };
 }

 // Check support code
 if (oldDoc.supportCode !== newDoc.supportCode) {
 changes.support_code = { old: oldDoc.supportCode, new: newDoc.supportCode };
 }

 // Check moderation status
 if (oldDoc.moderationStatus !== newDoc.moderationStatus) {
 changes.moderation_status = { old: oldDoc.moderationStatus, new: newDoc.moderationStatus };
 }

 // Check discovery intent
 if (oldDoc.discoveryIntent !== newDoc.discoveryIntent) {
 changes.discovery_intent = { old: oldDoc.discoveryIntent, new: newDoc.discoveryIntent };
 }

 // Check link state (LIVE, DISABLED, etc.)
 if (oldDoc.linkState !== newDoc.linkState) {
 changes.link_state = { old: oldDoc.linkState, new: newDoc.linkState };
 }

 return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Process a batch of maps using bulk Links Service API
 * Returns documents ready for bulk indexing
 */
async function processBatch(mapIds, existingDocs) {
 try {
 // Get valid token
 const tokenData = await getValidToken();
 accessToken = tokenData.access_token;

 console.log(`Requesting bulk info for ${mapIds.length} mnemonics...`);

 // Fetch from bulk Links Service (100 maps in one request!)
 const linksData = await getBulkMnemonicInfo(mapIds, accessToken, {
 ignoreFailures: true
 });

 console.log(`Received ${linksData?.length || 0} results`);

 if (!linksData || linksData.length === 0) {
 console.log(` Batch of ${mapIds.length}: No data returned`);
 stats.errors += mapIds.length;
 return { documents: [], changes: [], newCreators: [] };
 }

 // Transform to new schema format with performance preservation
 const documents = [];
 const changes = [];
 const newCreators = [];

 for (const data of linksData) {
 const mapId = data.mnemonic;
 const existing = existingDocs.get(mapId);

 // Prepare options for transformation
 const options = {
 ingestionSource: 'map_ingestion_bulk',
 preservePerformance: existing ? {
 currentCCU: existing.currentCCU,
 peakCCU24h: existing.peakCCU24h,
 avgCCU24h: existing.avgCCU24h,
 avgCCU7d: existing.avgCCU7d,
 avgCCU30d: existing.avgCCU30d,
 firstIndexed: existing.firstIndexed,
 lastCalculated: existing.lastCalculated
 } : null,
 preserveDiscovery: existing ? {
 inDiscovery: existing.inDiscovery,
 discoveryAppearances7d: existing.discoveryAppearances7d,
 bestDiscoveryPosition: existing.bestDiscoveryPosition,
 discoveryFirstSeen: existing.discoveryFirstSeen,
 discoveryLastSeen: existing.discoveryLastSeen
 } : null
 };

 // Transform single map
 const { transformMapData } = require('../../database/transformers/mapTransformer');
 const newDoc = transformMapData(data, options);
 documents.push(newDoc);

 // Detect changes
 if (existing) {
 const changeSet = detectChanges(existing, newDoc);
 if (changeSet) {
 changes.push({
 map_id: mapId,
 timestamp: new Date().toISOString(),
 changes: changeSet,
 source: 'map_ingestion_bulk'
 });
 stats.changeDetected++;
 }
 }

 // Track new creators (we'll check these later in bulk)
 if (newDoc.creatorAccountId) {
 newCreators.push({
 id: newDoc.creatorAccountId,
 name: newDoc.creatorName
 });
 }
 }

 stats.processed += mapIds.length;
 return { documents, changes, newCreators };

 } catch (error) {
 console.error('❌ Error processing batch:', error.message);
 stats.errors += mapIds.length;
 return { documents: [], changes: [], newCreators: [] };
 }
}

/**
 * Bulk index documents to Elasticsearch
 */
async function bulkIndexMaps(documents) {
 if (documents.length === 0) return 0;

 const body = documents.flatMap(doc => [
 { index: { _index: 'maps', _id: doc.code } },
 doc
 ]);

 try {
 const result = await es.bulk({ body, refresh: false });
 
 if (result.errors) {
 const errors = result.items.filter(item => item.index?.error);
 for (const error of errors.slice(0, 5)) { // Show first 5 errors
 console.error(`❌ Error processing map ${error.index._id}: ${error.index.error.type}`);
 if (error.index.error.caused_by) {
 console.error(`       Caused by:`);
 console.error(`               ${error.index.error.caused_by.type}: ${error.index.error.caused_by.reason}`);
 }
 if (error.index.error.root_cause) {
 console.error(`       Root causes:`);
 error.index.error.root_cause.forEach(cause => {
 console.error(`               ${cause.type}: ${cause.reason}`);
 });
 }
 }
 stats.errors += errors.length;
 return documents.length - errors.length;
 }
 
 stats.updated += documents.length;
 return documents.length;
 } catch (error) {
 console.error('❌ Bulk index error:', error.message);
 stats.errors += documents.length;
 return 0;
 }
}

/**
 * Bulk index changes to changelog
 */
async function bulkIndexChanges(changes) {
 if (changes.length === 0) return;

 const body = changes.flatMap(change => [
 { index: { _index: 'map-changelog' } },
 change
 ]);

 try {
 await es.bulk({ body, refresh: false });
 } catch (error) {
 console.error('❌ Error indexing changes:', error.message);
 }
}

/**
 * Bulk check and create new creators
 */
async function processNewCreators(creatorList) {
 if (creatorList.length === 0) return;

 // Deduplicate
 const uniqueCreators = new Map();
 for (const creator of creatorList) {
 uniqueCreators.set(creator.id, creator.name);
 }

 // Check which creators already exist
 const creatorIds = Array.from(uniqueCreators.keys());
 
 try {
 const response = await es.mget({
 index: 'creators',
 body: { ids: creatorIds }
 });

 const responseBody = response.body || response;
 const newCreatorBodies = [];

 for (let i = 0; i < responseBody.docs.length; i++) {
 const doc = responseBody.docs[i];
 if (!doc.found) {
 const creatorId = creatorIds[i];
 newCreatorBodies.push(
 { index: { _index: 'creators', _id: creatorId } },
 {
 id: creatorId,
 account_id: creatorId,
 display_name: uniqueCreators.get(creatorId),
 metadata: {
 first_indexed: new Date().toISOString(),
 ingestion_source: 'map_ingestion_auto_discover'
 }
 }
 );
 stats.newCreators++;
 }
 }

 if (newCreatorBodies.length > 0) {
 await es.bulk({ body: newCreatorBodies, refresh: false });
 console.log(` Discovered ${stats.newCreators} new creators`);
 }
 } catch (error) {
 console.error('❌ Error processing new creators:', error.message);
 }
}

/**
 * Fetch all map codes quickly - prioritize maps with recent activity
 */
async function fetchAllMapCodes() {
 console.log(' Fetching all map codes...');
 const mapCodes = [];
 
 try {
 // First, get maps from recent CCU data (these are definitely active)
 console.log(' Fetching maps from recent CCU data (active maps)...');
 const ccuMaps = await es.search({
 index: 'concurrent-users-*',
 size: 0,
 body: {
 aggs: {
 unique_maps: {
 terms: {
 field: 'map_id.keyword',
 size: 50000 // Get up to 50k unique maps
 }
 }
 }
 }
 });
 
 const ccuMapCodes = ccuMaps.aggregations.unique_maps.buckets.map(b => b.key);
 console.log(` Found ${ccuMapCodes.length} maps from CCU data`);
 mapCodes.push(...ccuMapCodes);
 
 // Then get maps from discovery (featured maps)
 console.log(' Fetching maps from discovery data...');
 const discoveryMaps = await es.search({
 index: 'discovery-current',
 size: 10000,
 _source: ['map_id'],
 body: {
 query: { match_all: {} }
 }
 });
 
 const discoveryMapCodes = discoveryMaps.hits.hits
 .map(hit => hit._source.map_id)
 .filter(id => id && !mapCodes.includes(id));
 console.log(` Found ${discoveryMapCodes.length} additional maps from discovery`);
 mapCodes.push(...discoveryMapCodes);
 
 // Deduplicate and validate format
 const uniqueMapCodes = [...new Set(mapCodes)]
 .filter(id => id && id.match(/^\d{4}-\d{4}-\d{4}$/));
 
 console.log(` ✓ Total unique valid map codes: ${uniqueMapCodes.length.toLocaleString()}\n`);
 return uniqueMapCodes;
 } catch (error) {
 console.error('❌ Error fetching map codes:', error.message);
 return [];
 }
}
/**
 * Main worker loop - OPTIMIZED BULK MODE
 */
async function runWorker() {
 console.log('\n');
 console.log('🚀 Worker 1: Map Ingestion (OPTIMIZED BULK MODE) ');
 console.log('\n');

 // Initialize authentication
 await initAuth();
 console.log(' Authentication initialized\n');

 while (isRunning) {
 try {
 console.log('═══════════════════════════════════════════════════════════════');
 console.log(' Starting new ingestion cycle...');
 console.log('═══════════════════════════════════════════════════════════════\n');

 // PHASE 1: Fetch all map codes (fast!)
 const allMapCodes = await fetchAllMapCodes();
 if (allMapCodes.length === 0) {
 console.log('⚠️  No maps found, waiting...');
 await new Promise(resolve => setTimeout(resolve, 60000));
 continue;
 }

 const totalMaps = allMapCodes.length;
 console.log(`📊 Total maps to process: ${totalMaps.toLocaleString()}\n`);

 // PHASE 2: Fetch existing documents in large batches for performance data
 console.log('📦 Fetching existing map data for performance preservation...');
 const existingDocs = new Map();
 
 for (let i = 0; i < allMapCodes.length; i += 1000) {
 const chunk = allMapCodes.slice(i, i + 1000);
 const existing = await fetchExistingBulk(chunk);
 for (const [key, value] of existing.entries()) {
 existingDocs.set(key, value);
 }
 
 if ((i + 1000) % 10000 === 0) {
 console.log(` Loaded ${Math.min(i + 1000, totalMaps).toLocaleString()}/${totalMaps.toLocaleString()} existing documents...`);
 }
 }
 console.log(` ✓ Loaded ${existingDocs.size.toLocaleString()} existing documents\n`);

 // PHASE 3: Process maps in batches and accumulate results
 console.log('⚙️  Processing maps in batches from Epic API...\n');
 console.log(`⚡ Parallel processing: ${PARALLEL_BATCHES} batches at once (${PARALLEL_BATCHES * BATCH_SIZE} maps simultaneously)\n`);
 
 let allDocuments = [];
 let allChanges = [];
 let allNewCreators = [];

 // Process batches in parallel chunks
 for (let i = 0; i < allMapCodes.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
 if (!isRunning) break;

 // Create parallel batch promises
 const parallelBatches = [];
 for (let j = 0; j < PARALLEL_BATCHES && (i + j * BATCH_SIZE) < allMapCodes.length; j++) {
 const start = i + j * BATCH_SIZE;
 const chunk = allMapCodes.slice(start, start + BATCH_SIZE);
 parallelBatches.push(processBatch(chunk, existingDocs));
 }

 // Wait for all parallel batches to complete
 const results = await Promise.all(parallelBatches);

 // Aggregate results
 for (const result of results) {
 allDocuments.push(...result.documents);
 allChanges.push(...result.changes);
 allNewCreators.push(...result.newCreators);
 }

 // Log progress
 const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
 const rate = (stats.processed / elapsed).toFixed(0);
 const percentComplete = ((stats.processed / totalMaps) * 100).toFixed(1);
 console.log(`⏳ Progress: ${stats.processed.toLocaleString()}/${totalMaps.toLocaleString()} (${percentComplete}%) | Rate: ${rate}/min | Changes: ${stats.changeDetected} | Errors: ${stats.errors}`);

 // Bulk index accumulated documents
 if (allDocuments.length >= ES_BULK_SIZE) {
 const toIndex = allDocuments.splice(0, ES_BULK_SIZE);
 await bulkIndexMaps(toIndex);
 }

 // Bulk index changes periodically
 if (allChanges.length >= 200) {
 const toIndex = allChanges.splice(0, 200);
 await bulkIndexChanges(toIndex);
 }
 }

 // PHASE 4: Index remaining documents
 console.log('\n💾 Indexing remaining documents...');
 
 if (allDocuments.length > 0) {
 console.log(` Indexing ${allDocuments.length} maps...`);
 await bulkIndexMaps(allDocuments);
 }

 if (allChanges.length > 0) {
 console.log(` Indexing ${allChanges.length} changes...`);
 await bulkIndexChanges(allChanges);
 }

 // PHASE 5: Process new creators
 if (allNewCreators.length > 0) {
 console.log(` Processing ${allNewCreators.length} potential new creators...`);
 await processNewCreators(allNewCreators);
 }

 // Refresh indices
 console.log(' Refreshing indices...');
 await es.indices.refresh({ index: 'maps' });

 console.log('\n═══════════════════════════════════════════════════════════════');
 console.log('✅ Ingestion cycle complete!');
 console.log('═══════════════════════════════════════════════════════════════');
 console.log(`📊 Statistics:`);
 console.log(`   Processed: ${stats.processed.toLocaleString()}`);
 console.log(`   Updated: ${stats.updated.toLocaleString()}`);
 console.log(`   Changes Detected: ${stats.changeDetected.toLocaleString()}`);
 console.log(`   New Creators: ${stats.newCreators}`);
 console.log(`   Errors: ${stats.errors.toLocaleString()}`);
 console.log(`   Time: ${((Date.now() - stats.startTime) / 1000 / 60).toFixed(1)} minutes`);
 console.log('═══════════════════════════════════════════════════════════════\n');

 // Reset stats for next cycle
 stats.processed = 0;
 stats.updated = 0;
 stats.changeDetected = 0;
 stats.newCreators = 0;
 stats.errors = 0;
 stats.startTime = Date.now();

 } catch (error) {
 console.error('❌ Worker error:', error);
 console.log(` Retrying in ${ERROR_RETRY_DELAY / 1000}s...`);
 await new Promise(resolve => setTimeout(resolve, ERROR_RETRY_DELAY));
 }
 }
}

// Handle shutdown gracefully
async function shutdown() {
 console.log('\n⏹️ Shutting down map ingestion worker...');
 isRunning = false;

 // Stop auth refresh
 const { stopAuth } = require('../EpicGames/auth/auth');
 await stopAuth();

 console.log(' Shutdown complete');
 process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start worker
isRunning = true;
runWorker().catch(error => {
 console.error('Fatal error:', error);
 process.exit(1);
});
