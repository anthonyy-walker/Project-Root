#!/usr/bin/env node

/**
 * Worker 2: Creator Ingestion
 * 
 * Continuously fetches and updates creator data from Epic API
 * - Rate limited: 30 requests per minute (2-second delay)
 * - Processes creators from ES queue
 * - Fetches POPS data + creator page data
 * - Logs changes to creator-changelog
 */

const { Client } = require('@elastic/elasticsearch');
const { getCreatorMaps } = require('../EpicGames/apis/creatorPageAPI');
const { getCreatorDetails } = require('../EpicGames/apis/popsAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('./auth-helper');

const ES_HOST = 'http://localhost:9200';
const SCROLL_SIZE = 1000;
const RATE_LIMIT_DELAY = 2000; // 2 seconds = 30/min
const ERROR_RETRY_DELAY = 5000;

const es = new Client({ node: ES_HOST });

// Track statistics
const stats = {
  processed: 0,
  updated: 0,
  errors: 0,
  changeDetected: 0,
  startTime: Date.now()
};

/**
 * Detect changes between old and new creator data
 */
function detectChanges(oldDoc, popsData, creatorData) {
  const changes = {};
  
  // Check display name
  if (oldDoc.display_name !== creatorData?.displayName) {
    changes.display_name = { old: oldDoc.display_name, new: creatorData?.displayName };
  }
  
  // Check follower count
  const oldFollowers = oldDoc.totals?.total_followers || 0;
  const newFollowers = popsData?.followers || 0;
  if (oldFollowers !== newFollowers) {
    changes.followers = { old: oldFollowers, new: newFollowers };
  }
  
  // Check map count
  const oldMaps = oldDoc.totals?.maps_created || 0;
  const newMaps = creatorData?.totalMaps || 0;
  if (oldMaps !== newMaps) {
    changes.maps_created = { old: oldMaps, new: newMaps };
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
    
    // Fetch POPS data (followers, etc)
    const popsData = await getCreatorDetails(creatorId, accessToken, accountId);
    
    // Fetch creator page data
    const creatorData = await getCreatorMaps(creatorId, accessToken, accountId);
    
    if (!popsData && !creatorData) {
      console.log(`⚠️  Creator ${creatorId}: No data returned`);
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
      totals: {
        maps_created: creatorData?.links?.length || existing?._source?.totals?.maps_created || 0
      },
      metadata: {
        ...existing?._source?.metadata,
        last_synced: new Date(),
        last_updated: new Date(),
        api_version: 1
      }
    };
    
    // Detect changes
    const changes = existing ? detectChanges(existing._source, popsData, creatorData) : null;
    
    if (changes) {
      stats.changeDetected++;
      
      // Log to changelog (daily snapshot)
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
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Worker 2: Creator Ingestion (Rate Limited)   ║');
  console.log('║           30 requests per minute               ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  // Initialize authentication
  initializeAuth();
  
  while (true) {
    try {
      console.log('🔄 Starting new ingestion cycle...');
      
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
      console.log(`📊 Total creators to process: ${totalCreators.toLocaleString()}`);
      
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
            console.log(`⏳ Processed: ${stats.processed.toLocaleString()}/${totalCreators.toLocaleString()} | Rate: ${rate}/min | Updated: ${stats.updated} | Changes: ${stats.changeDetected} | Errors: ${stats.errors}`);
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
      console.log(`⏳ Retrying in ${ERROR_RETRY_DELAY / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, ERROR_RETRY_DELAY));
    }
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down creator ingestion worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down creator ingestion worker...');
  process.exit(0);
});

// Start worker
runWorker().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
