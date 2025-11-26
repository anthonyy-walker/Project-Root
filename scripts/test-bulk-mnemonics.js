#!/usr/bin/env node

/**
 * Test Bulk Mnemonic API Call
 * 
 * Fetches 100 map codes from Elasticsearch and makes a bulk API call
 * to the Links Service API to test the getBulkMnemonicInfo function.
 */

const { Client } = require('@elastic/elasticsearch');
const { getBulkMnemonicInfo } = require('../EpicGames/apis/linksServiceAPI');
const { getMnemonicInfo } = require('../EpicGames/apis/mnemonicInfoAPI');
const { initAuth, getValidToken } = require('../EpicGames/auth/auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

/**
 * Fetch 100 sample map codes from Elasticsearch
 */
async function fetchSampleMapCodes(count = 100) {
  console.log(`📦 Fetching ${count} sample map codes from Elasticsearch...\n`);
  
  try {
    const response = await es.search({
      index: 'maps',
      size: count,
      _source: false, // We only need the IDs (map codes)
      query: {
        match_all: {}
      }
    });
    
    const mapCodes = response.hits.hits.map(hit => hit._id);
    console.log(`✅ Retrieved ${mapCodes.length} map codes\n`);
    
    // Show first 5 as preview
    console.log('Preview of map codes:');
    mapCodes.slice(0, 5).forEach((code, idx) => {
      console.log(`  ${idx + 1}. ${code}`);
    });
    console.log(`  ... and ${mapCodes.length - 5} more\n`);
    
    return mapCodes;
    
  } catch (error) {
    console.error('❌ Error fetching map codes:', error.message);
    throw error;
  }
}

/**
 * Main test function
 */
async function testBulkMnemonics() {
  console.log('🚀 Testing Bulk Mnemonic API Call\n');
  console.log('='.repeat(50));
  console.log('\n');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Initialize authentication
    console.log('🔐 Initializing Epic Games authentication...');
    await initAuth();
    const accessToken = await getValidToken();
    console.log('✅ Authentication successful\n');
    
    // Step 2: Fetch sample map codes
    const mapCodes = await fetchSampleMapCodes(100);
    
    if (mapCodes.length === 0) {
      console.log('⚠️  No map codes found in Elasticsearch. Please seed the database first.');
      process.exit(0);
    }
    
    // Step 3: Make bulk API call
    console.log('📡 Making bulk API call to Links Service...');
    console.log(`   Requesting info for ${mapCodes.length} mnemonics...\n`);
    
    const apiStartTime = Date.now();
    const results = await getBulkMnemonicInfo(mapCodes, accessToken);
    const apiDuration = Date.now() - apiStartTime;
    
    // Step 4: Display results
    console.log('\n' + '='.repeat(50));
    console.log('📊 Results Summary');
    console.log('='.repeat(50) + '\n');
    
    console.log(`Total mnemonics requested: ${mapCodes.length}`);
    console.log(`Total results received:    ${results.length}`);
    console.log(`API call duration:         ${apiDuration}ms`);
    console.log(`Average per mnemonic:      ${(apiDuration / mapCodes.length).toFixed(2)}ms\n`);
    
    // Analyze results
    const successful = results.filter(r => r && r.mnemonic);
    const failed = results.filter(r => !r || !r.mnemonic);
    
    console.log(`✅ Successful lookups:     ${successful.length}`);
    console.log(`❌ Failed lookups:         ${failed.length}\n`);
    
    // Show sample results
    if (successful.length > 0) {
      console.log('Sample successful results:');
      successful.slice(0, 3).forEach((result, idx) => {
        console.log(`\n${idx + 1}. ${result.mnemonic || 'Unknown'}`);
        console.log(`   Link Type: ${result.linkType || 'N/A'}`);
        console.log(`   Version: ${result.version || 'N/A'}`);
        if (result.metadata) {
          console.log(`   Title: ${result.metadata.title || 'N/A'}`);
          console.log(`   Author: ${result.metadata.creatorName || 'N/A'}`);
        }
      });
    }
    
    // Show failed samples
    if (failed.length > 0) {
      console.log(`\n❌ Failed lookups (${failed.length} total):`);
      failed.slice(0, 3).forEach((result, idx) => {
        console.log(`   ${idx + 1}. ${JSON.stringify(result)}`);
      });
    }
    
    const totalDuration = Date.now() - startTime;
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Test completed in ${(totalDuration / 1000).toFixed(2)}s`);
    console.log('='.repeat(50) + '\n');
    
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

// Run the test
testBulkMnemonics().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
