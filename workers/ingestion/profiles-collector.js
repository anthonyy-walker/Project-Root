#!/usr/bin/env node

/**
 * Profiles Collector Worker
 *
 * Continuously fetches and updates creator profile data from POPS API
 * - Rate limited: 30 requests per minute (2-second delay)
 * - Updates: display_name, bio, follower_count, images, socials
 * - Logs follower changes to creator-follower-history
 * - Logs other changes to creator-changelog
 * - Does NOT track maps (see Maps Discovery worker for that)
 */

const { Client } = require('@elastic/elasticsearch');
const { getCreatorDetails } = require('../../EpicGames/apis/popsAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('../utils/auth-helper');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OPENSEARCH_HOST = process.env.OPENSEARCH_HOST;
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME;
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD;
const SCROLL_SIZE = 1000;
const BATCH_SIZE = 24; // Process 24 creators in parallel (safer rate)
const BATCH_DELAY = 60000; // Wait 1 minute (60 seconds) between batches
const ERROR_RETRY_DELAY = 5000;

const clientConfig = {
  node: OPENSEARCH_HOST,
  requestTimeout: 30000,
  ssl: { rejectUnauthorized: false }
};

if (OPENSEARCH_USERNAME && OPENSEARCH_PASSWORD) {
  clientConfig.auth = {
    username: OPENSEARCH_USERNAME,
    password: OPENSEARCH_PASSWORD
  };
}

const es = new Client(clientConfig);

// Track statistics
const stats = {
 processed: 0,
 updated: 0,
 deleted: 0,
 errors: 0,
 changeDetected: 0,
 startTime: Date.now()
};

/**
 * Detect changes between old and new creator data (POPS fields only)
 * Only detects changes when POPS API actually provides data (not null/undefined)
 * and that data differs from what we have stored
 * Ignores changes to/from Epic's default placeholder images
 * Returns null if old document has no display_name (creator not yet fully processed)
 * Returns flat structure: { field_old: value, field_new: value }
 */
function detectChanges(oldDoc, popsData) {
 // If old document has no display_name, it hasn't been fully processed yet
 // Don't log any changes on first real processing
 if (!oldDoc.display_name) {
   return null;
 }
 
 const changes = {};
 
 // Epic's default placeholder images - don't log changes involving these
 const DEFAULT_AVATAR = 'https://cdn2.unrealengine.com/t-ui-creatorprofile-default-256x256-8d5feae6bc8e.png';
 const DEFAULT_BANNER = 'https://cdn2.unrealengine.com/t-ui-creatorprofile-banner-fallbackerror-1920x1080-3f830cc95018.png';

 // Check display_name - only if POPS provides one AND it's different
 if (popsData?.displayName !== undefined && 
     popsData.displayName !== null && 
     popsData.displayName !== oldDoc.display_name) {
   changes.displayName = {
     Old: oldDoc.display_name || null,
     New: popsData.displayName
   };
 }

 // Check bio - only if POPS provides one AND it's different
 if (popsData?.bio !== undefined && 
     popsData.bio !== null && 
     popsData.bio !== oldDoc.bio) {
   changes.bio = {
     Old: oldDoc.bio || null,
     New: popsData.bio
   };
 }

 // Check avatar image - ignore if both are default placeholder OR old is null/default and new is default
 if (popsData?.images?.avatar !== undefined &&
     popsData.images.avatar !== null &&
     popsData.images.avatar !== oldDoc.images?.avatar) {
   const oldAvatar = oldDoc.images?.avatar || null;
   const newAvatar = popsData.images.avatar;
   
   // Only log if:
   // - Old is NOT null AND old is NOT default AND new is different
   // - OR old is NOT default AND new is NOT default (both custom images changing)
   // Skip if: null→default, default→default
   const isOldDefault = !oldAvatar || oldAvatar === DEFAULT_AVATAR;
   const isNewDefault = newAvatar === DEFAULT_AVATAR;
   
   if (!isOldDefault || !isNewDefault) {
     changes.avatar = {
       Old: oldAvatar,
       New: newAvatar
     };
   }
 }

 // Check banner image - ignore if both are default placeholder OR old is null/default and new is default
 if (popsData?.images?.banner !== undefined &&
     popsData.images.banner !== null &&
     popsData.images.banner !== oldDoc.images?.banner) {
   const oldBanner = oldDoc.images?.banner || null;
   const newBanner = popsData.images.banner;
   
   // Only log if:
   // - Old is NOT null AND old is NOT default AND new is different
   // - OR old is NOT default AND new is NOT default (both custom images changing)
   // Skip if: null→default, default→default
   const isOldDefault = !oldBanner || oldBanner === DEFAULT_BANNER;
   const isNewDefault = newBanner === DEFAULT_BANNER;
   
   if (!isOldDefault || !isNewDefault) {
     changes.banner = {
       Old: oldBanner,
       New: newBanner
     };
   }
 }

 // Check social links - only track if they're actually different
 if (popsData?.social) {
   const oldSocial = oldDoc.social || {};
   const newSocial = popsData.social || {};
   
   // Check each platform individually for better changelog granularity
   ['youtube', 'twitter', 'twitch', 'instagram', 'tiktok'].forEach(platform => {
     const oldValue = oldSocial[platform] || null;
     const newValue = newSocial[platform] || null;
     
     if (newValue !== oldValue) {
       if (!changes.social) changes.social = {};
       changes.social[platform] = {
         Old: oldValue,
         New: newValue
       };
     }
   });
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
 let popsData;
 try {
   popsData = await getCreatorDetails(creatorId, accessToken, accountId);
 } catch (error) {
   // If 404, creator doesn't exist - delete from our database
   if (error.response?.status === 404) {
     console.log(`🗑️  Creator ${creatorId} not found (404) - deleting from database`);
     
     try {
       await es.delete({
         index: 'creators',
         id: creatorId
       });
       stats.deleted++;
       console.log(`✅ Deleted creator ${creatorId}`);
     } catch (deleteError) {
       if (deleteError.meta?.statusCode !== 404) {
         console.error(`❌ Error deleting creator ${creatorId}:`, deleteError.message);
       }
     }
     
     return false;
   }
   
   // For other errors, rethrow
   throw error;
 }

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

   // Log to changelog with flat structure (field_old, field_new format)
   await es.index({
     index: 'creator-changelog',
     body: {
       creator_id: creatorId,
       ...changes, // Spread changes directly into body for flat structure
       timestamp: new Date(),
       source: 'creator_ingestion_worker'
     }
   });
 } // Update creator document
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

 // Collect all creator IDs
 let allCreatorIds = searchResponse.hits.hits.map(h => h._source.id);

 // Continue scrolling to get all creators
 while (true) {
 const scrollResponse = await es.scroll({
 scroll_id: scrollId,
 scroll: '5m'
 });

 const moreCreators = scrollResponse.hits.hits.map(h => h._source.id);
 scrollId = scrollResponse._scroll_id;

 if (moreCreators.length === 0) break;
 allCreatorIds.push(...moreCreators);
 }

 // Clear scroll
 if (scrollId) {
 await es.clearScroll({ scroll_id: scrollId });
 }

 console.log(` Processing in batches of ${BATCH_SIZE} (30/min rate limit)\n`);

 // Process creators in parallel batches of 30 with staggered delays
 for (let i = 0; i < allCreatorIds.length; i += BATCH_SIZE) {
   const batch = allCreatorIds.slice(i, i + BATCH_SIZE);
   const batchStart = Date.now();

   // Process batch with 2.5-second stagger between each request to avoid rate limits
   // 24 requests * 2.5 seconds = 60 seconds total (24/min = safer than 30/min)
   const promises = batch.map((creatorId, index) => {
     return new Promise(async (resolve) => {
       await new Promise(r => setTimeout(r, index * 2500)); // Stagger by 2.5 seconds each
       const result = await processCreator(creatorId);
       resolve(result);
     });
   });
   await Promise.all(promises);

   stats.processed += batch.length;

   // Log progress after each batch
   const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
   const rate = (stats.processed / elapsed).toFixed(1);
   console.log(` Processed: ${stats.processed.toLocaleString()}/${totalCreators.toLocaleString()} | Rate: ${rate}/min | Updated: ${stats.updated} | Deleted: ${stats.deleted} | Changes: ${stats.changeDetected} | Errors: ${stats.errors}`);

   // No additional wait needed since staggered delays already took ~60 seconds
 }

 console.log('✓ Ingestion cycle complete\n');

 // Reset stats for next cycle
 stats.processed = 0;
 stats.updated = 0;
 stats.deleted = 0;
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
