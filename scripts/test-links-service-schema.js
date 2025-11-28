#!/usr/bin/env node

/**
 * Test Links Service Bulk API to see exact schema returned
 * This will fetch a few real maps and save the response structure
 */

const { getBulkMnemonicInfo } = require('../EpicGames/apis/linksServiceAPI');
const { initAuth, getValidToken } = require('../EpicGames/auth/auth');
const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

async function testLinksServiceSchema() {
  console.log('🧪 Testing Links Service Bulk API Schema\n');
  console.log('='.repeat(60) + '\n');
  
  try {
    // Initialize auth
    console.log('🔐 Initializing authentication...');
    await initAuth();
    const tokenData = await getValidToken();
    const accessToken = tokenData.access_token;
    console.log('✅ Authentication successful\n');
    
    // Get 10 sample map codes from Elasticsearch
    console.log('📦 Fetching sample map codes from Elasticsearch...');
    const response = await es.search({
      index: 'maps',
      size: 10,
      _source: false,
      body: {
        query: { match_all: {} }
      }
    });
    
    const mapCodes = response.hits.hits.map(hit => hit._id);
    console.log(`✅ Retrieved ${mapCodes.length} map codes:`);
    mapCodes.forEach((code, idx) => {
      console.log(`   ${idx + 1}. ${code}`);
    });
    console.log('');
    
    // Make bulk API call
    console.log('📡 Making bulk API call to Links Service...\n');
    const results = await getBulkMnemonicInfo(mapCodes, accessToken);
    
    console.log('✅ Response received!\n');
    console.log('='.repeat(60));
    console.log('📊 Response Analysis');
    console.log('='.repeat(60) + '\n');
    
    console.log(`Total results: ${results.length}`);
    
    if (results.length > 0) {
      const firstResult = results[0];
      
      // Analyze structure
      console.log('\n📋 Top-level fields in response:');
      Object.keys(firstResult).forEach(key => {
        const value = firstResult[key];
        const type = Array.isArray(value) ? 'array' : typeof value;
        console.log(`   • ${key}: ${type}`);
      });
      
      if (firstResult.metadata) {
        console.log('\n📋 Fields in metadata object:');
        Object.keys(firstResult.metadata).forEach(key => {
          const value = firstResult.metadata[key];
          const type = Array.isArray(value) ? 'array' : typeof value;
          console.log(`   • ${key}: ${type}`);
        });
      }
      
      // Save full response
      const outputPath = path.join(__dirname, '../test-data/links-service-bulk-response.json');
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n💾 Full response saved to: ${outputPath}`);
      
      // Show first result in detail
      console.log('\n' + '='.repeat(60));
      console.log('📄 First Result (Full Structure)');
      console.log('='.repeat(60) + '\n');
      console.log(JSON.stringify(firstResult, null, 2));
      
      // Show comparison with what we expect
      console.log('\n' + '='.repeat(60));
      console.log('🔍 Key Observations');
      console.log('='.repeat(60) + '\n');
      
      console.log('Fields present:');
      const expectedFields = [
        'namespace', 'accountId', 'creatorName', 'mnemonic', 'linkType',
        'metadata', 'version', 'active', 'disabled', 'created', 'published',
        'updated', 'descriptionTags', 'moderationStatus', 'lastActivatedDate',
        'discoveryIntent', 'activationHistory', 'linkState'
      ];
      
      expectedFields.forEach(field => {
        const exists = field in firstResult;
        const icon = exists ? '✅' : '❌';
        const value = exists ? (typeof firstResult[field]) : 'missing';
        console.log(`   ${icon} ${field}: ${value}`);
      });
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ Schema test complete!');
      console.log('='.repeat(60) + '\n');
    } else {
      console.log('⚠️  No results returned from API');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('API Response:', {
        status: error.response.status,
        data: JSON.stringify(error.response.data, null, 2)
      });
    }
    process.exit(1);
  }
}

// Run test
testLinksServiceSchema().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
