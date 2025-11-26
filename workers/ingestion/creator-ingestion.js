#!/usr/bin/env node

/**
 * Worker 2A: Creator Profile Ingestion (POPS Only)
 *
 * Continuously fetches and updates creator profile data from POPS API
 * - Rate limited: 30 requests per minute (2-second delay)
 * - Updates: display_name, bio, follower_count, images, socials
 * - Logs follower changes to creator-follower-history
 * - Logs other changes to creator-changelog
 * - Does NOT track maps (see Worker 2B for that)
 */

const { Client } = require('@elastic/elasticsearch');
const { getCreatorDetails } = require('../../EpicGames/apis/popsAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('../utils/auth-helper');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ES_URL = process.env.ELASTICSEARCH_URL;
const SCROLL_SIZE = 1000;
const RATE_LIMIT_DELAY = 2000; // 2 seconds = 30/min
const ERROR_RETRY_DELAY = 5000;

const es = new Client({ node: ES_URL });

// Track statistics
const stats = {
 processed: 0,
 updated: 0,
 errors: 0,
 changeDetected: 0,
 startTime: Date.now()
};

/**
 * Detect changes between old and new creator data (POPS fields only)
 */
function detectChanges(oldDoc, popsData) {
 const changes = {};

 // Check display name
 if (popsData?.displayName && popsData.displayName !== oldDoc.display_name) {
 changes.display_name = { old: oldDoc.display_name, new: popsData.displayName };
 }

 // Check bio
 if (popsData?.bio && popsData.bio !== oldDoc.bio) {
 changes.bio = { old: oldDoc.bio, new: popsData.bio };
 }

 // Check social links
 const oldSocials = JSON.stringify(oldDoc.social || {});
 const newSocials = JSON.stringify(popsData?.social || {});
 if (oldSocials !== newSocials) {
 changes.social = { old: oldDoc.social, new: popsData?.social };
 }

 return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Process a single creator
 */
async function processCreator(creatorId) {
 try {
 // Get auth credentials
 const accessToken = await getAccessToken();
 const accountId = await getAccountId();

 // Fetch POPS data (profile, followers, etc)
 const popsData = await getCreatorDetails(creatorId, accessToken, accountId);

 if (!popsData) {
 // Creator doesn't have a POPS profile - skip
 return false;
 }

 // Get existing document
 const existing = await es.get({
 index: 'creators',
 id: creatorId
 }).catch(() => null);

 // Build updated document from POPS API data
 const updateDoc = {
 id: creatorId,
 account_id: creatorId,
 display_name: popsData?.displayName || existing?._source?.display_name || null,
 bio: popsData?.bio || existing?._source?.bio || null,
 follower_count: popsData?.followerCount || existing?._source?.follower_count || 0,
 images: {
 avatar: popsData?.images?.avatar || existing?._source?.images?.avatar || null,
 banner: popsData?.images?.banner || existing?._source?.images?.banner || null
 },
 social: {
 youtube: popsData?.social?.youtube || existing?._source?.social?.youtube || null,
 twitter: popsData?.social?.twitter || existing?._source?.social?.twitter || null,
 twitch: popsData?.social?.twitch || existing?._source?.social?.twitch || null,
 instagram: popsData?.social?.instagram || existing?._source?.social?.instagram || null,
 tiktok: popsData?.social?.tiktok || existing?._source?.social?.tiktok || null
 },
 is_followed: popsData?.isFollowed || false,
 is_subscribed: popsData?.isSubscribed || false,
 metadata: {
 ...existing?._source?.metadata,
 last_synced: new Date(),
 last_updated: new Date(),
 api_version: 1
 }
 };

 // Detect changes (POPS fields only, excluding follower_count)
 const changes = existing ? detectChanges(existing._source, popsData) : null;

 // Track follower count changes separately in dedicated index
 const followerCountChanged = existing &&
 popsData?.followerCount !== undefined &&
 popsData.followerCount !== existing._source.follower_count;

 if (followerCountChanged) {
 // Log to dedicated follower history index (for graphing)
 await es.index({
 index: 'creator-follower-history',
 body: {
 creator_id: creatorId,
 follower_count: popsData.followerCount,
 timestamp: new Date()
 }
 });
 }

 if (changes) {
 stats.changeDetected++;

 // Log to changelog (non-follower changes only)
 await es.index({
 index: 'creator-changelog',
 body: {
 creator_id: creatorId,
 snapshot: updateDoc,
 changes: changes,
 timestamp: new Date(),
 source: 'creator_ingestion_worker'
 }
 });
 }

 // Update creator document
 await es.index({
 index: 'creators',
 id: creatorId,
 body: updateDoc
 });

 stats.updated++;
 return true;

 } catch (error) {
 stats.errors++;
 console.error(`❌ Error processing creator ${creatorId}:`, error.message);
 return false;
 }
}

/**
 * Main worker loop
 */
async function runWorker() {
 console.log('\n');
 console.log(' Worker 2A: Creator Profile (POPS Only) ');
 console.log(' 30 requests per minute ');
 console.log('\n');

 // Initialize authentication
 initializeAuth();

 while (true) {
 try {
 console.log(' Starting new ingestion cycle...');

 // Scroll through all creators
 let scrollId = null;

 const searchResponse = await es.search({
 index: 'creators',
 scroll: '5m',
 size: SCROLL_SIZE,
 _source: ['id'],
 body: {
 query: { match_all: {} }
 }
 });

 scrollId = searchResponse._scroll_id;
 const totalCreators = searchResponse.hits.total.value;
 console.log(` Total creators to process: ${totalCreators.toLocaleString()}`);

 // Process creators one at a time (rate limited)
 let allCreators = searchResponse.hits.hits.map(h => h._source.id);

 while (true) {
 // Process current batch
 for (const creatorId of allCreators) {
 await processCreator(creatorId);
 stats.processed++;

 // Log progress every 30 creators (1 minute)
 if (stats.processed % 30 === 0) {
 const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
 const rate = (stats.processed / elapsed).toFixed(1);
 console.log(` Processed: ${stats.processed.toLocaleString()}/${totalCreators.toLocaleString()} | Rate: ${rate}/min | Updated: ${stats.updated} | Changes: ${stats.changeDetected} | Errors: ${stats.errors}`);
 }

 // Rate limit delay
 await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
 }

 // Get next scroll batch
 const scrollResponse = await es.scroll({
 scroll_id: scrollId,
 scroll: '5m'
 });

 allCreators = scrollResponse.hits.hits.map(h => h._source.id);
 scrollId = scrollResponse._scroll_id;

 if (allCreators.length === 0) break;
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
process.on('SIGINT', () => {
 console.log('\n⏹️ Shutting down creator ingestion worker...');
 process.exit(0);
});

process.on('SIGTERM', () => {
 console.log('\n⏹️ Shutting down creator ingestion worker...');
 process.exit(0);
});

// Start worker
runWorker().catch(error => {
 console.error('Fatal error:', error);
 process.exit(1);
});
