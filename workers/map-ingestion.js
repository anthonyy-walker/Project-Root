#!/usr/bin/env node

/**
 * Worker 1: Map Ingestion
 * 
 * Continuously fetches and updates map data from Epic API
 * - No rate limit (can run continuously)
 * - Processes maps from ES queue
 * - Detects changes and logs to map-changelog
 * - Auto-discovers new creators
 */

const { Client } = require('@elastic/elasticsearch');
const { getMnemonicInfo } = require('../EpicGames/apis/mnemonicInfoAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('./auth-helper');

const ES_HOST = 'http://localhost:9200';
const BATCH_SIZE = 100; // Process maps in batches
const SCROLL_SIZE = 1000; // ES scroll size
const ERROR_RETRY_DELAY = 5000; // 5 seconds
const BATCH_DELAY = 1000; // 1 second between batches

const es = new Client({ node: ES_HOST });

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
 * Detect changes between old and new map data
 */
function detectChanges(oldDoc, newData) {
  const changes = {};
  
  // Check basic fields
  if (oldDoc.name !== newData.title) changes.name = { old: oldDoc.name, new: newData.title };
  if (oldDoc.description !== newData.introduction) changes.description = true;
  
  // Check creator
  if (oldDoc.creator?.account_id !== newData.accountId) {
    changes.creator = { old: oldDoc.creator?.account_id, new: newData.accountId };
  }
  
  // Check tags
  const oldTags = (oldDoc.tags || []).sort().join(',');
  const newTags = (newData.tagsFull || []).map(t => t.linkCode).sort().join(',');
  if (oldTags !== newTags) changes.tags = true;
  
  // Check matchmaking
  const oldMM = oldDoc.matchmaking?.enabled || false;
  const newMM = newData.metadata?.matchmakingEnabled || false;
  if (oldMM !== newMM) changes.matchmaking = { old: oldMM, new: newMM };
  
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Process a single map
 */
async function processMap(mapId) {
  try {
    // Get auth token
    const accessToken = await getAccessToken();
    
    // Fetch from Epic API
    const response = await getMnemonicInfo(mapId, accessToken);
    
    if (!response || !response.title) {
      console.log(`⚠️  Map ${mapId}: No data returned`);
      return false;
    }
    
    // Get existing document
    const existing = await es.get({
      index: 'maps',
      id: mapId
    }).catch(() => null);
    
    // Build updated document
    const updateDoc = {
      id: mapId,
      name: response.title,
      description: response.introduction || '',
      creator: {
        account_id: response.accountId,
        display_name: response.accountName || ''
      },
      tags: (response.tagsFull || []).map(t => t.linkCode),
      image_url: response.image || '',
      video_url: response.video || '',
      matchmaking: {
        enabled: response.metadata?.matchmakingEnabled || false,
        min_players: response.metadata?.minPlayers || 0,
        max_players: response.metadata?.maxPlayers || 0
      },
      rating: {
        likes: response.metrics?.likes || 0,
        dislikes: response.metrics?.dislikes || 0,
        score: response.metrics?.score || 0
      },
      metadata: {
        ...existing?._source?.metadata,
        last_updated: new Date(),
        api_version: response.version || 1
      }
    };
    
    // Detect changes
    const changes = existing ? detectChanges(existing._source, response) : null;
    
    if (changes) {
      stats.changeDetected++;
      
      // Log to changelog
      await es.index({
        index: 'map-changelog',
        body: {
          map_id: mapId,
          changes: changes,
          timestamp: new Date(),
          source: 'map_ingestion_worker'
        }
      });
    }
    
    // Update map document
    await es.index({
      index: 'maps',
      id: mapId,
      body: updateDoc
    });
    
    stats.updated++;
    
    // Check if creator exists
    if (response.accountId) {
      const creatorExists = await es.exists({
        index: 'creators',
        id: response.accountId
      });
      
      if (!creatorExists) {
        console.log(`🆕 New creator discovered: ${response.accountId}`);
        
        await es.index({
          index: 'creators',
          id: response.accountId,
          body: {
            id: response.accountId,
            account_id: response.accountId,
            display_name: response.accountName || '',
            metadata: {
              first_indexed: new Date(),
              ingestion_source: 'map_ingestion_auto_discover'
            }
          }
        });
        
        stats.newCreators++;
      }
    }
    
    return true;
    
  } catch (error) {
    stats.errors++;
    console.error(`❌ Error processing map ${mapId}:`, error.message);
    return false;
  }
}

/**
 * Process a batch of maps
 */
async function processBatch(mapIds) {
  const promises = mapIds.map(id => processMap(id));
  await Promise.allSettled(promises);
  stats.processed += mapIds.length;
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     Worker 1: Map Ingestion (Continuous)      ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  // Initialize authentication
  initializeAuth();
  
  while (true) {
    try {
      console.log('🔄 Starting new ingestion cycle...');
      
      // Scroll through all maps
      let scrollId = null;
      let hasMore = true;
      
      const searchResponse = await es.search({
        index: 'maps',
        scroll: '5m',
        size: SCROLL_SIZE,
        _source: ['id'],
        body: {
          query: { match_all: {} }
        }
      });
      
      scrollId = searchResponse._scroll_id;
      const totalMaps = searchResponse.hits.total.value;
      console.log(`📊 Total maps to process: ${totalMaps.toLocaleString()}`);
      
      // Process initial batch
      let batch = searchResponse.hits.hits.map(h => h._source.id);
      
      while (batch.length > 0) {
        // Split into smaller batches for parallel processing
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          const chunk = batch.slice(i, i + BATCH_SIZE);
          await processBatch(chunk);
          
          // Log progress
          const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
          const rate = (stats.processed / elapsed).toFixed(0);
          console.log(`⏳ Processed: ${stats.processed.toLocaleString()}/${totalMaps.toLocaleString()} | Rate: ${rate}/min | Updated: ${stats.updated} | Changes: ${stats.changeDetected} | New Creators: ${stats.newCreators} | Errors: ${stats.errors}`);
          
          // Small delay between chunks
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
        
        // Get next scroll batch
        if (hasMore) {
          const scrollResponse = await es.scroll({
            scroll_id: scrollId,
            scroll: '5m'
          });
          
          batch = scrollResponse.hits.hits.map(h => h._source.id);
          scrollId = scrollResponse._scroll_id;
          hasMore = batch.length > 0;
        } else {
          break;
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
      console.log(`⏳ Retrying in ${ERROR_RETRY_DELAY / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, ERROR_RETRY_DELAY));
    }
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down map ingestion worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down map ingestion worker...');
  process.exit(0);
});

// Start worker
runWorker().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
