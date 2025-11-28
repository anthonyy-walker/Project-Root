#!/usr/bin/env node

/**
 * Map Schema Migration Script
 * 
 * Migrates all maps in Elasticsearch to use the exact schema from Links Service Bulk API
 * and updates map-changelog to follow creator-changelog format
 * 
 * WHAT THIS DOES:
 * 1. Fetches all maps from Elasticsearch
 * 2. Transforms them to match Links Service response structure
 * 3. Updates map-changelog to use flat Old/New format like creator-changelog
 * 4. Bulk updates all documents in place
 */

const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

const SCROLL_SIZE = 1000;
const BULK_SIZE = 500;

// Statistics
const stats = {
  totalMaps: 0,
  processed: 0,
  updated: 0,
  errors: 0,
  changelogUpdated: 0,
  startTime: Date.now()
};

/**
 * Transform old schema to new Links Service schema format
 * Preserves CCU/performance data
 */
function transformToNewSchema(oldDoc) {
  const mapId = oldDoc.code || oldDoc.mnemonic || oldDoc._id;
  
  return {
    // Core identifiers (from Links Service)
    namespace: oldDoc.namespace || 'fn',
    accountId: oldDoc.creatorAccountId || oldDoc.owner_account_id || null,
    creatorName: oldDoc.creatorName || oldDoc.owner_name || null,
    mnemonic: mapId,
    linkType: oldDoc.linkType || oldDoc.link_type || 'Creative:Island',
    
    // Metadata object (Links Service structure)
    metadata: {
      title: oldDoc.title || null,
      tagline: oldDoc.tagline || null,
      introduction: oldDoc.description || oldDoc.introduction || null,
      image_url: oldDoc.image || oldDoc.image_url || null,
      image_urls: oldDoc.image_urls || (oldDoc.image ? {
        url: oldDoc.image,
        url_s: oldDoc.image,
        url_m: oldDoc.image
      } : {}),
      genre_labels: oldDoc.genreLabels || oldDoc.genre_labels || [],
      category_labels: oldDoc.categoryLabels || oldDoc.category_labels || [],
      supportCode: oldDoc.supportCode || oldDoc.support_code || null,
      locale: oldDoc.locale || 'en',
      mode: oldDoc.mode || 'live',
      matchmakingV2: oldDoc.matchmakingV2 || oldDoc.matchmaking || {
        minPlayers: oldDoc.minPlayers || 1,
        maxPlayers: oldDoc.maxPlayers || 16
      },
      quicksilver_id: oldDoc.metadata?.quicksilver_id || oldDoc.quicksilver_id || null,
      projectId: oldDoc.metadata?.projectId || oldDoc.projectId || null,
      activated_public_date: oldDoc.published || oldDoc.metadata?.activated_public_date || null,
      internal_description_tags: oldDoc.metadata?.internal_description_tags || [],
      public_modules: oldDoc.metadata?.public_modules || {},
      ratings: oldDoc.metadata?.ratings || {},
      dynamicXp: oldDoc.metadata?.dynamicXp || {},
      machineTranslationPreferences: oldDoc.metadata?.machineTranslationPreferences || {},
      attributions: oldDoc.metadata?.attributions || []
    },
    
    // Status fields
    version: oldDoc.version || 1,
    active: oldDoc.active !== false,
    disabled: oldDoc.disabled || false,
    linkState: oldDoc.linkState || (oldDoc.active ? 'LIVE' : 'DISABLED'),
    
    // Timestamps
    created: oldDoc.created || oldDoc.first_indexed || new Date().toISOString(),
    published: oldDoc.published || oldDoc.created || null,
    updated: oldDoc.updated || oldDoc.last_updated || new Date().toISOString(),
    lastActivatedDate: oldDoc.lastActivatedDate || oldDoc.last_activated || null,
    
    // Moderation & Discovery
    moderationStatus: oldDoc.moderationStatus || oldDoc.moderation_status || 'Unknown',
    discoveryIntent: oldDoc.discoveryIntent || oldDoc.discovery_intent || 'PRIVATE',
    descriptionTags: oldDoc.descriptionTags || oldDoc.description_tags || oldDoc.tags || [],
    
    // PRESERVE PERFORMANCE METRICS (not from Links Service - our own data)
    performance: {
      currentCCU: oldDoc.currentCCU || oldDoc.ccu || 0,
      peakCCU24h: oldDoc.peakCCU24h || oldDoc.peak_ccu_24h || 0,
      avgCCU24h: oldDoc.avgCCU24h || oldDoc.avg_ccu_24h || 0,
      avgCCU7d: oldDoc.avgCCU7d || oldDoc.avg_ccu_7d || 0,
      avgCCU30d: oldDoc.avgCCU30d || oldDoc.avg_ccu_30d || 0,
      lastCalculated: oldDoc.lastCalculated || oldDoc.last_calculated || null
    },
    
    // PRESERVE DISCOVERY TRACKING (not from Links Service - our own data)
    discovery: {
      inDiscovery: oldDoc.inDiscovery || oldDoc.in_discovery || false,
      discoveryAppearances7d: oldDoc.discoveryAppearances7d || oldDoc.discovery_appearances_7d || 0,
      bestDiscoveryPosition: oldDoc.bestDiscoveryPosition || oldDoc.best_discovery_position || null,
      discoveryFirstSeen: oldDoc.discoveryFirstSeen || oldDoc.discovery_first_seen || null,
      discoveryLastSeen: oldDoc.discoveryLastSeen || oldDoc.discovery_last_seen || null
    },
    
    // Metadata tracking
    _metadata: {
      firstIndexed: oldDoc.firstIndexed || oldDoc.first_indexed || oldDoc.created || new Date().toISOString(),
      lastIngestion: new Date().toISOString(),
      ingestionSource: 'schema_migration_script',
      schemaVersion: '2.0'
    }
  };
}

/**
 * Transform old changelog format to new format (flat Old/New structure like creator-changelog)
 */
function transformChangelog(oldChangelog) {
  const newChangelog = {
    map_id: oldChangelog.map_id,
    timestamp: oldChangelog.timestamp,
    source: oldChangelog.source || 'map_ingestion'
  };
  
  // Convert nested changes to flat Old/New format
  if (oldChangelog.changes) {
    for (const [field, value] of Object.entries(oldChangelog.changes)) {
      if (value && typeof value === 'object' && 'old' in value && 'new' in value) {
        // Already in correct format, just capitalize
        newChangelog[field] = {
          Old: value.old,
          New: value.new
        };
      } else if (value && typeof value === 'object') {
        // Complex nested object - keep as is but capitalize
        newChangelog[field] = value;
      }
    }
  }
  
  return newChangelog;
}

/**
 * Migrate all maps in batches
 */
async function migrateMaps() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        MAP SCHEMA MIGRATION - Links Service Format        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Get total count
    const countResponse = await es.count({ index: 'maps' });
    stats.totalMaps = countResponse.count;
    console.log(`📊 Total maps to migrate: ${stats.totalMaps.toLocaleString()}\n`);
    
    if (stats.totalMaps === 0) {
      console.log('⚠️  No maps found in Elasticsearch');
      return;
    }
    
    // Start scrolling through maps
    console.log('🔄 Starting migration...\n');
    
    let scrollResponse = await es.search({
      index: 'maps',
      scroll: '5m',
      size: SCROLL_SIZE,
      body: {
        query: { match_all: {} }
      }
    });
    
    let scrollId = scrollResponse._scroll_id;
    let hits = scrollResponse.hits.hits;
    let documents = [];
    
    while (hits.length > 0) {
      // Transform documents
      for (const hit of hits) {
        try {
          const transformed = transformToNewSchema(hit._source);
          documents.push(transformed);
          stats.processed++;
        } catch (error) {
          console.error(`❌ Error transforming map ${hit._id}:`, error.message);
          stats.errors++;
        }
      }
      
      // Bulk update when we have enough documents
      if (documents.length >= BULK_SIZE) {
        await bulkUpdateMaps(documents);
        documents = [];
      }
      
      // Log progress
      const percentComplete = ((stats.processed / stats.totalMaps) * 100).toFixed(1);
      const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
      const rate = (stats.processed / elapsed).toFixed(0);
      console.log(`⏳ Progress: ${stats.processed.toLocaleString()}/${stats.totalMaps.toLocaleString()} (${percentComplete}%) | Rate: ${rate}/min | Updated: ${stats.updated} | Errors: ${stats.errors}`);
      
      // Get next batch
      scrollResponse = await es.scroll({
        scroll_id: scrollId,
        scroll: '5m'
      });
      
      scrollId = scrollResponse._scroll_id;
      hits = scrollResponse.hits.hits;
    }
    
    // Update remaining documents
    if (documents.length > 0) {
      await bulkUpdateMaps(documents);
    }
    
    // Clear scroll
    await es.clearScroll({ scroll_id: scrollId });
    
    console.log('\n✅ Map migration complete!');
    console.log(`   Processed: ${stats.processed.toLocaleString()}`);
    console.log(`   Updated: ${stats.updated.toLocaleString()}`);
    console.log(`   Errors: ${stats.errors.toLocaleString()}`);
    console.log(`   Time: ${((Date.now() - stats.startTime) / 1000 / 60).toFixed(1)} minutes\n`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  }
}

/**
 * Bulk update maps in Elasticsearch
 */
async function bulkUpdateMaps(documents) {
  if (documents.length === 0) return;
  
  const body = documents.flatMap(doc => [
    { index: { _index: 'maps', _id: doc.mnemonic } },
    doc
  ]);
  
  try {
    const result = await es.bulk({ body, refresh: false });
    
    if (result.errors) {
      const errors = result.items.filter(item => item.index?.error);
      for (const error of errors.slice(0, 3)) {
        console.error(`❌ Bulk error for ${error.index._id}:`, error.index.error.reason);
      }
      stats.errors += errors.length;
      stats.updated += documents.length - errors.length;
    } else {
      stats.updated += documents.length;
    }
  } catch (error) {
    console.error('❌ Bulk update error:', error.message);
    stats.errors += documents.length;
  }
}

/**
 * Migrate changelog entries
 */
async function migrateChangelog() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║            MAP CHANGELOG FORMAT MIGRATION                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Check if changelog index exists
    const exists = await es.indices.exists({ index: 'map-changelog' });
    if (!exists) {
      console.log('ℹ️  map-changelog index does not exist yet. Skipping changelog migration.\n');
      return;
    }
    
    const countResponse = await es.count({ index: 'map-changelog' });
    const totalChanges = countResponse.count;
    console.log(`📊 Total changelog entries: ${totalChanges.toLocaleString()}\n`);
    
    if (totalChanges === 0) {
      console.log('ℹ️  No changelog entries to migrate\n');
      return;
    }
    
    console.log('🔄 Migrating changelog format...\n');
    
    let scrollResponse = await es.search({
      index: 'map-changelog',
      scroll: '5m',
      size: SCROLL_SIZE,
      body: {
        query: { match_all: {} }
      }
    });
    
    let scrollId = scrollResponse._scroll_id;
    let hits = scrollResponse.hits.hits;
    let documents = [];
    let processed = 0;
    
    while (hits.length > 0) {
      for (const hit of hits) {
        try {
          const transformed = transformChangelog(hit._source);
          documents.push({ id: hit._id, doc: transformed });
          processed++;
        } catch (error) {
          console.error(`❌ Error transforming changelog ${hit._id}:`, error.message);
        }
      }
      
      if (documents.length >= BULK_SIZE) {
        await bulkUpdateChangelog(documents);
        documents = [];
      }
      
      const percentComplete = ((processed / totalChanges) * 100).toFixed(1);
      console.log(`⏳ Progress: ${processed.toLocaleString()}/${totalChanges.toLocaleString()} (${percentComplete}%)`);
      
      scrollResponse = await es.scroll({
        scroll_id: scrollId,
        scroll: '5m'
      });
      
      scrollId = scrollResponse._scroll_id;
      hits = scrollResponse.hits.hits;
    }
    
    if (documents.length > 0) {
      await bulkUpdateChangelog(documents);
    }
    
    await es.clearScroll({ scroll_id: scrollId });
    
    console.log(`\n✅ Changelog migration complete! Updated ${stats.changelogUpdated.toLocaleString()} entries\n`);
    
  } catch (error) {
    console.error('❌ Changelog migration error:', error);
  }
}

/**
 * Bulk update changelog entries
 */
async function bulkUpdateChangelog(documents) {
  if (documents.length === 0) return;
  
  const body = documents.flatMap(item => [
    { index: { _index: 'map-changelog', _id: item.id } },
    item.doc
  ]);
  
  try {
    const result = await es.bulk({ body, refresh: false });
    if (!result.errors) {
      stats.changelogUpdated += documents.length;
    }
  } catch (error) {
    console.error('❌ Changelog bulk error:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  
  console.log('\n🚀 Starting schema migration process...\n');
  console.log('This will:');
  console.log('  1. Transform all maps to Links Service schema format');
  console.log('  2. Preserve all CCU and discovery data');
  console.log('  3. Update map-changelog to flat Old/New format\n');
  
  console.log('Press Ctrl+C to cancel or wait 3 seconds to continue...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  try {
    // Migrate maps
    await migrateMaps();
    
    // Migrate changelog
    await migrateChangelog();
    
    // Refresh indices
    console.log('🔄 Refreshing indices...');
    await es.indices.refresh({ index: 'maps,map-changelog' });
    
    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   MIGRATION COMPLETE                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Final Statistics:`);
    console.log(`   Maps Processed: ${stats.processed.toLocaleString()}`);
    console.log(`   Maps Updated: ${stats.updated.toLocaleString()}`);
    console.log(`   Changelog Updated: ${stats.changelogUpdated.toLocaleString()}`);
    console.log(`   Errors: ${stats.errors.toLocaleString()}`);
    console.log(`   Total Time: ${totalTime} minutes\n`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run migration
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
