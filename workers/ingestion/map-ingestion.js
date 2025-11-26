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
const SCROLL_SIZE = 1000; // ES scroll size
const ERROR_RETRY_DELAY = 5000; // 5 seconds
const BATCH_DELAY = 500; // 500ms between batches (rate limiting)

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
 */
async function processBatch(mapIds) {
 try {
 // Get valid token
 const tokenData = await getValidToken();
 accessToken = tokenData.access_token;

 // Fetch existing documents for performance preservation
 const existingDocs = await fetchExistingBulk(mapIds);

 // Fetch from bulk Links Service (100 maps in one request!)
 const linksData = await getBulkMnemonicInfo(mapIds, accessToken, {
 ignoreFailures: true
 });

 if (!linksData || linksData.length === 0) {
 console.log(` Batch of ${mapIds.length}: No data returned`);
 stats.errors += mapIds.length;
 return;
 }

 // Transform to new schema format with performance preservation
 const existingArray = linksData.map(data => {
 const existing = existingDocs.get(data.mnemonic);
 return existing ? {
 performance: {
 currentCCU: existing.currentCCU,
 peakCCU24h: existing.peakCCU24h,
 avgCCU24h: existing.avgCCU24h,
 avgCCU7d: existing.avgCCU7d,
 avgCCU30d: existing.avgCCU30d
 },
 discovery: {
 inDiscovery: existing.inDiscovery,
 discoveryAppearances7d: existing.discoveryAppearances7d,
 bestDiscoveryPosition: existing.bestDiscoveryPosition
 }
 } : null;
 });

 const transformed = transformBulkMapData(linksData, {
 existingDocs: existingArray,
 ingestionSource: 'map_ingestion_bulk'
 });

 // Process each transformed map
 for (let i = 0; i < transformed.length; i++) {
 const newDoc = transformed[i];
 const mapId = newDoc.code;
 const existingDoc = existingDocs.get(mapId);

 try {
 // Detect changes
 let changes = null;
 if (existingDoc) {
 changes = detectChanges(existingDoc, newDoc);
 if (changes) {
 stats.changeDetected++;

 // Log change to map-changelog
 await es.index({
 index: 'map-changelog',
 body: {
 map_id: mapId,
 timestamp: new Date().toISOString(),
 changes,
 source: 'map_ingestion_bulk'
 }
 });
 }
 }

 // Check if creator is new
 const isNewCreator = newDoc.creatorAccountId &&
 !(await es.exists({ index: 'creators', id: newDoc.creatorAccountId }));

 if (isNewCreator) {
 stats.newCreators++;

 // Add to creators queue
 await es.index({
 index: 'creators',
 id: newDoc.creatorAccountId,
 body: {
 id: newDoc.creatorAccountId,
 account_id: newDoc.creatorAccountId,
 display_name: newDoc.creatorName,
 metadata: {
 first_indexed: new Date().toISOString(),
 ingestion_source: 'map_ingestion_auto_discover'
 }
 }
 });

 console.log(` New creator discovered: ${newDoc.creatorAccountId}`);
 }

 // Update map in Elasticsearch
 await es.index({
 index: 'maps',
 id: mapId,
 body: newDoc
 });

 stats.updated++;

 } catch (error) {
 console.error(`❌ Error processing map ${mapId}:`, error.message);
 stats.errors++;
 }
 }

 stats.processed += mapIds.length;

 } catch (error) {
 console.error('❌ Error processing batch:', error.message);
 stats.errors += mapIds.length;
 }
}

/**
 * Main worker loop
 */
async function runWorker() {
 console.log('\n');
 console.log(' Worker 1: Map Ingestion (Bulk API Mode) ');
 console.log('\n');

 // Initialize authentication
 await initAuth();
 console.log(' Authentication initialized\n');

 while (isRunning) {
 try {
 console.log(' Starting new ingestion cycle...');

 // Scroll through all maps
 let scrollId = null;

 const searchResponse = await es.search({
 index: 'maps',
 scroll: '5m',
 size: SCROLL_SIZE,
 _source: ['code', 'id'], // Support both old (id) and new (code) field names
 body: {
 query: { match_all: {} }
 }
 });

 const responseBody = searchResponse.body || searchResponse;
 scrollId = responseBody._scroll_id;
 const totalMaps = responseBody.hits.total.value;
 console.log(` Total maps to process: ${totalMaps.toLocaleString()}`);

 // Process initial batch
 let batch = responseBody.hits.hits.map(h => h._source.code || h._source.id);

 while (batch.length > 0 && isRunning) {
 // Split into smaller batches for parallel processing
 for (let i = 0; i < batch.length; i += BATCH_SIZE) {
 if (!isRunning) break;

 const chunk = batch.slice(i, i + BATCH_SIZE);
 await processBatch(chunk);

 // Log progress
 const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
 const rate = (stats.processed / elapsed).toFixed(0);
 console.log(` Processed: ${stats.processed.toLocaleString()}/${totalMaps.toLocaleString()} | Rate: ${rate}/min | Updated: ${stats.updated} | Changes: ${stats.changeDetected} | New Creators: ${stats.newCreators} | Errors: ${stats.errors}`);

 // Rate limiting delay between chunks
 await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
 }

 // Get next scroll batch
 if (isRunning) {
 const scrollResponse = await es.scroll({
 scroll_id: scrollId,
 scroll: '5m'
 });

 const scrollBody = scrollResponse.body || scrollResponse;
 batch = scrollBody.hits.hits.map(h => h._source.code || h._source.id);
 scrollId = scrollBody._scroll_id;
 } else {
 batch = [];
 }
 }

 // Clear scroll
 if (scrollId) {
 await es.clearScroll({ scroll_id: scrollId });
 }

 console.log('✓ Ingestion cycle complete\n');

 // Reset stats for next cycle
 stats.processed = 0;
 stats.updated = 0;
 stats.changeDetected = 0;
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
