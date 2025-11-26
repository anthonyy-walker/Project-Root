#!/usr/bin/env node

/**
 * Test script to verify Elasticsearch connection and map data
 */

const { Client } = require('@elastic/elasticsearch');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function test() {
  console.log('🧪 Testing Elasticsearch Connection\n');
  
  const client = new Client({
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    maxRetries: 3,
    requestTimeout: 10000,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Test connection
    console.log('1. Testing connection...');
    await client.ping();
    console.log('✅ Connected to Elasticsearch\n');
    
    // Get index info
    console.log('2. Getting maps index info...');
    const count = await client.count({ index: 'maps' });
    console.log(`✅ Maps index has ${count.count.toLocaleString()} documents\n`);
    
    // Fetch sample maps
    console.log('3. Fetching 5 sample maps...');
    const response = await client.search({
      index: 'maps',
      size: 5,
      body: {
        query: { match_all: {} },
        _source: ['id', 'metadata']
      }
    });
    
    console.log('✅ Sample maps:\n');
    response.hits.hits.forEach((hit, i) => {
      const map = hit._source;
      const meta = map.metadata || {};
      console.log(`  ${i+1}. Mnemonic: ${map.id || hit._id}`);
      console.log(`     Owner Account ID: ${meta.owner_account_id || 'MISSING'}`);
      console.log(`     Owner Name: ${meta.owner_name || 'N/A'}`);
      console.log(`     Link Type: ${meta.link_type || 'N/A'}`);
      console.log(`     Namespace: ${meta.namespace || 'N/A'}`);
      console.log('');
    });
    
    // Count maps with and without owner_account_id
    console.log('4. Checking metadata.owner_account_id coverage...');
    const withAccount = await client.count({
      index: 'maps',
      body: {
        query: {
          exists: { field: 'metadata.owner_account_id' }
        }
      }
    });
    
    const withoutAccount = count.count - withAccount.count;
    const percentage = ((withAccount.count / count.count) * 100).toFixed(1);
    
    console.log(`✅ Maps with metadata.owner_account_id: ${withAccount.count.toLocaleString()} (${percentage}%)`);
    console.log(`⚠️  Maps without metadata.owner_account_id: ${withoutAccount.toLocaleString()}\n`);
    
    console.log('🎉 All tests passed! Ready to run fetch-all-creator-ids.js');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

test();
