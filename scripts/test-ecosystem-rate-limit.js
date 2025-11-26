#!/usr/bin/env node

/**
 * Test Ecosystem API Rate Limits
 * 
 * Tests how many concurrent requests we can make to the ecosystem API
 * to determine optimal batch size and delay for 10-minute collection cycles
 */

const { getIslandMetrics } = require('../EpicGames/apis/ecosystemAPI');
const { getAccessToken } = require('../workers/utils/auth-helper');
const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const es = new Client({ node: process.env.ELASTICSEARCH_URL });

// Test parameters
const TEST_DURATION_MS = 60000; // Test for 1 minute
const CONCURRENT_REQUESTS = [1, 5, 10, 20, 50, 100]; // Different concurrency levels to test

/**
 * Get random map codes from database
 */
async function getTestMapCodes(count) {
  const response = await es.search({
    index: 'maps',
    size: count,
    body: {
      query: {
        function_score: {
          query: { match_all: {} },
          random_score: {}
        }
      },
      _source: ['id']
    }
  });

  return response.hits.hits.map(h => h._source.id);
}

/**
 * Test a specific concurrency level
 */
async function testConcurrency(mapCodes, concurrency, accessToken) {
  console.log(`\n🧪 Testing ${concurrency} concurrent requests...`);
  
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  let rateLimitCount = 0;
  const errors = [];

  // Calculate time range (last 10 minutes)
  const to = new Date();
  const from = new Date(to.getTime() - 10 * 60 * 1000);

  let index = 0;

  while (Date.now() - startTime < TEST_DURATION_MS) {
    // Launch batch of concurrent requests
    const batch = [];
    
    for (let i = 0; i < concurrency && index < mapCodes.length; i++) {
      const mapCode = mapCodes[index % mapCodes.length];
      index++;
      
      batch.push(
        getIslandMetrics(mapCode, 'minute', from.toISOString(), to.toISOString(), accessToken)
          .then(() => {
            successCount++;
          })
          .catch((error) => {
            errorCount++;
            if (error.response?.status === 429) {
              rateLimitCount++;
            }
            if (errors.length < 3) {
              errors.push({
                mapCode,
                status: error.response?.status,
                message: error.message
              });
            }
          })
      );
    }

    await Promise.all(batch);

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const duration = (Date.now() - startTime) / 1000;
  const requestsPerSecond = successCount / duration;
  const requestsPer10Min = requestsPerSecond * 600;

  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`⏱️  Rate limited (429): ${rateLimitCount}`);
  console.log(`📊 Rate: ${requestsPerSecond.toFixed(2)} req/sec`);
  console.log(`📈 Projected 10-min capacity: ${Math.floor(requestsPer10Min).toLocaleString()} requests`);

  if (errors.length > 0) {
    console.log(`\n❌ Sample errors:`);
    errors.forEach(e => {
      console.log(`   ${e.mapCode}: ${e.status} - ${e.message}`);
    });
  }

  return {
    concurrency,
    successCount,
    errorCount,
    rateLimitCount,
    requestsPerSecond,
    requestsPer10Min: Math.floor(requestsPer10Min)
  };
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Starting Ecosystem API Rate Limit Test\n');
  console.log(`📍 Test duration: ${TEST_DURATION_MS / 1000} seconds per concurrency level`);
  console.log(`🎯 Goal: Process 172,000 maps in 10 minutes (287 maps/sec)\n`);

  try {
    // Get auth token
    const accessToken = await getAccessToken();
    
    // Get test map codes
    console.log('📦 Fetching test map codes...');
    const mapCodes = await getTestMapCodes(1000);
    console.log(`✅ Got ${mapCodes.length} map codes for testing\n`);

    const results = [];

    // Test each concurrency level
    for (const concurrency of CONCURRENT_REQUESTS) {
      const result = await testConcurrency(mapCodes, concurrency, accessToken);
      results.push(result);
      
      // Cooldown between tests
      console.log('⏸️  Cooling down for 5 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Summary
    console.log('\n📊 ===== SUMMARY =====\n');
    console.log('Concurrency | Req/Sec | 10-Min Capacity | Rate Limited');
    console.log('----------- | ------- | --------------- | ------------');
    
    results.forEach(r => {
      const rateLimited = r.rateLimitCount > 0 ? '❌ YES' : '✅ NO';
      console.log(
        `${String(r.concurrency).padStart(11)} | ` +
        `${r.requestsPerSecond.toFixed(2).padStart(7)} | ` +
        `${r.requestsPer10Min.toLocaleString().padStart(15)} | ` +
        `${rateLimited}`
      );
    });

    // Find optimal concurrency
    const validResults = results.filter(r => r.rateLimitCount === 0);
    if (validResults.length > 0) {
      const optimal = validResults[validResults.length - 1];
      console.log(`\n✨ Optimal concurrency: ${optimal.concurrency}`);
      console.log(`📊 Can process ${optimal.requestsPer10Min.toLocaleString()} maps in 10 minutes`);
      
      if (optimal.requestsPer10Min >= 172000) {
        console.log(`✅ Can handle all 172,000 maps! 🎉`);
      } else {
        const cycles = Math.ceil(172000 / optimal.requestsPer10Min);
        console.log(`⚠️  Would need ${cycles} cycles (${cycles * 10} minutes) to process all maps`);
      }
    } else {
      console.log(`\n⚠️  All concurrency levels hit rate limits. Need to use lower concurrency with delays.`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
