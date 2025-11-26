/**
 * Rebuild Maps Index from Links Service
 * Fetches all map codes from current index and refetches metadata in bulk
 */

const { Client } = require('@elastic/elasticsearch');
const { getBulkMnemonicInfoBatched } = require('../../EpicGames/apis/linksServiceAPI');
const { getValidToken } = require('../../EpicGames/auth/auth');
const { transformBulkMapData } = require('../transformers/mapTransformer');
const { MAPS_INDEX_MAPPING } = require('./schemas/mapsIndex');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  }
});

const OLD_INDEX = 'maps';
const NEW_INDEX = 'maps-v2';
const BATCH_SIZE = 100;

async function rebuildMapsIndex() {
  console.log('🔄 Starting Maps Index Rebuild\n');
  console.log('=' .repeat(80));
  
  try {
    // Step 1: Get authentication
    console.log('\n📋 Step 1: Authentication');
    const tokenData = await getValidToken();
    console.log('✅ Got valid token');
    
    // Step 2: Fetch all existing map codes
    console.log('\n📋 Step 2: Fetching existing map codes from Elasticsearch');
    const mapCodes = await fetchAllMapCodes();
    console.log(`✅ Found ${mapCodes.length} maps in current index`);
    
    // Step 3: Create new index with updated mapping
    console.log('\n📋 Step 3: Creating new index with updated schema');
    await createNewIndex();
    console.log('✅ New index created: ' + NEW_INDEX);
    
    // Step 4: Fetch fresh metadata from Links Service in batches
    console.log('\n📋 Step 4: Fetching fresh metadata from Links Service');
    console.log(`Processing ${mapCodes.length} maps in batches of ${BATCH_SIZE}...`);
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    
    const allResults = await getBulkMnemonicInfoBatched(
      mapCodes,
      tokenData.access_token,
      (currentBatch, totalBatches, results) => {
        processedCount += results.length;
        const errors = results.filter(r => r.error).length;
        successCount += results.length - errors;
        errorCount += errors;
        
        console.log(`  Batch ${currentBatch}/${totalBatches}: ${results.length - errors} success, ${errors} errors`);
      }
    );
    
    console.log(`\n✅ Fetched ${allResults.length} results from Links Service`);
    console.log(`   Success: ${successCount}, Errors: ${errorCount}`);
    
    // Step 5: Transform and index data
    console.log('\n📋 Step 5: Transforming and indexing data');
    const transformed = transformBulkMapData(allResults, {
      ingestionSource: 'links_service_rebuild'
    });
    
    console.log(`✅ Transformed ${transformed.length} documents`);
    
    // Step 6: Bulk index to Elasticsearch
    console.log('\n📋 Step 6: Bulk indexing to Elasticsearch');
    await bulkIndexMaps(transformed);
    console.log('✅ All documents indexed');
    
    // Step 7: Verify new index
    console.log('\n📋 Step 7: Verifying new index');
    const stats = await getIndexStats(NEW_INDEX);
    console.log(`✅ New index stats:`);
    console.log(`   Documents: ${stats.count}`);
    console.log(`   Size: ${stats.size}`);
    
    // Step 8: Update alias (optional - uncomment to switch)
    console.log('\n📋 Step 8: Update alias (optional)');
    console.log('⚠️  To switch to new index, run:');
    console.log(`   POST /_aliases`);
    console.log(`   {`);
    console.log(`     "actions": [`);
    console.log(`       { "remove": { "index": "${OLD_INDEX}", "alias": "maps-current" } },`);
    console.log(`       { "add": { "index": "${NEW_INDEX}", "alias": "maps-current" } }`);
    console.log(`     ]`);
    console.log(`   }`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Maps index rebuild complete!\n');
    
    return {
      oldIndex: OLD_INDEX,
      newIndex: NEW_INDEX,
      totalMaps: mapCodes.length,
      successCount,
      errorCount,
      indexed: transformed.length
    };
    
  } catch (error) {
    console.error('\n❌ Rebuild failed:', error.message);
    throw error;
  }
}

async function fetchAllMapCodes() {
  const mapCodes = [];
  let searchAfter = null;
  
  while (true) {
    const query = {
      index: OLD_INDEX,
      size: 1000,
      _source: ['id'],
      sort: [{ _id: 'asc' }]
    };
    
    if (searchAfter) {
      query.search_after = searchAfter;
    }
    
    const result = await client.search(query);
    
    if (result.hits.hits.length === 0) break;
    
    result.hits.hits.forEach(hit => {
      const code = hit._source.id || hit._id;
      if (code && /^\d{4}-\d{4}-\d{4}$/.test(code)) {
        mapCodes.push(code);
      }
    });
    
    searchAfter = result.hits.hits[result.hits.hits.length - 1].sort;
    
    console.log(`  Fetched ${mapCodes.length} map codes...`);
  }
  
  return mapCodes;
}

async function createNewIndex() {
  // Delete if exists
  const exists = await client.indices.exists({ index: NEW_INDEX });
  if (exists) {
    console.log(`  Deleting existing index: ${NEW_INDEX}`);
    await client.indices.delete({ index: NEW_INDEX });
  }
  
  // Create with new mapping
  await client.indices.create({
    index: NEW_INDEX,
    body: MAPS_INDEX_MAPPING
  });
}

async function bulkIndexMaps(documents) {
  const BULK_SIZE = 500;
  let indexed = 0;
  
  for (let i = 0; i < documents.length; i += BULK_SIZE) {
    const batch = documents.slice(i, i + BULK_SIZE);
    
    const body = batch.flatMap(doc => [
      { index: { _index: NEW_INDEX, _id: doc.code } },
      doc
    ]);
    
    const result = await client.bulk({ body, refresh: false });
    
    if (result.errors) {
      const errors = result.items.filter(item => item.index.error);
      console.warn(`  ⚠️  ${errors.length} errors in batch ${Math.floor(i / BULK_SIZE) + 1}`);
    }
    
    indexed += batch.length;
    console.log(`  Indexed ${indexed}/${documents.length} documents...`);
  }
  
  // Refresh index
  await client.indices.refresh({ index: NEW_INDEX });
}

async function getIndexStats(index) {
  const stats = await client.indices.stats({ index });
  const count = await client.count({ index });
  
  return {
    count: count.count,
    size: stats.indices[index].primaries.store.size_in_bytes
  };
}

// Run if executed directly
if (require.main === module) {
  rebuildMapsIndex()
    .then((result) => {
      console.log('Summary:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { rebuildMapsIndex };
