/**
 * Test rebuild with small sample (10 maps)
 */

const { Client } = require('@elastic/elasticsearch');
const { getBulkMnemonicInfo } = require('../../EpicGames/apis/linksServiceAPI');
const { getValidToken } = require('../../EpicGames/auth/auth');
const { transformBulkMapData, toFn360Format } = require('../transformers/mapTransformer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  }
});

async function testRebuild() {
  console.log('🧪 Testing Maps Rebuild (Sample)\n');
  
  try {
    // Get token
    const tokenData = await getValidToken();
    console.log('✅ Got valid token\n');
    
    // Get 10 sample map codes
    console.log('📋 Fetching 10 sample map codes...');
    const result = await client.search({
      index: 'maps',
      size: 10,
      _source: ['id']
    });
    
    const mapCodes = result.hits.hits.map(hit => hit._source.id);
    console.log(`✅ Got ${mapCodes.length} map codes:`, mapCodes.join(', '), '\n');
    
    // Fetch from Links Service
    console.log('📋 Fetching from Links Service...');
    const linksData = await getBulkMnemonicInfo(mapCodes, tokenData.access_token);
    console.log(`✅ Received ${linksData.length} results\n`);
    
    // Transform
    console.log('📋 Transforming to Elasticsearch format...');
    const transformed = transformBulkMapData(linksData, {
      ingestionSource: 'test_rebuild'
    });
    console.log(`✅ Transformed ${transformed.length} documents\n`);
    
    // Show sample
    console.log('=' .repeat(80));
    console.log('📊 Sample Transformed Document:\n');
    const sample = transformed[0];
    console.log(`Code: ${sample.code}`);
    console.log(`Title: ${sample.title}`);
    console.log(`Creator: ${sample.creatorName} (${sample.creatorAccountId})`);
    console.log(`Images: ${sample.image ? 'Yes' : 'No'}`);
    console.log(`Tags: ${sample.tags.join(', ')}`);
    console.log(`Players: ${sample.minPlayers}-${sample.maxPlayers}`);
    console.log(`Active: ${sample.active}`);
    console.log(`Published: ${sample.published}`);
    console.log('=' .repeat(80), '\n');
    
    // Show fn360 format
    console.log('📊 Sample fn360 API Format:\n');
    const fn360Sample = toFn360Format(sample);
    console.log(JSON.stringify(fn360Sample, null, 2));
    console.log('\n' + '='.repeat(80));
    
    console.log('\n✅ Test complete! Data structure looks good.');
    console.log('\n📝 To run full rebuild:');
    console.log('   node database/elasticsearch/rebuildMapsIndex.js');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testRebuild();
