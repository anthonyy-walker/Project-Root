#!/usr/bin/env node

/**
 * Simple Ecosystem API Throughput Test
 * Tests maximum requests per 10 minutes without rate limiting
 */

const { getIslandMetrics } = require('../EpicGames/apis/ecosystemAPI');
const { getAccessToken } = require('../workers/utils/auth-helper');

// Test with known working map codes
const TEST_MAPS = [
  '7775-6862-7050',
  '8029-8763-0877',
  '5178-2465-1702',
  '5790-9798-3857',
  '2076-5778-0327',
  '4570-2237-4868',
  '9661-0254-9282',
  '2750-5700-3679',
  '6179-3331-8096',
  '0500-2885-3137'
];

async function testThroughput() {
  console.log('🚀 Testing Ecosystem API Throughput\n');
  
  const accessToken = await getAccessToken();
  const to = new Date();
  const from = new Date(to.getTime() - 10 * 60 * 1000);
  
  let mapIndex = 0;
  let successCount = 0;
  let errorCount = 0;
  let rateLimitCount = 0;
  
  const startTime = Date.now();
  const duration = 120000; // Test for 2 minutes
  
  console.log(`⏱️  Testing for ${duration / 1000} seconds...`);
  console.log(`🎯 Target: 287 requests/sec (172k maps / 600 seconds)\n`);
  
  while (Date.now() - startTime < duration) {
    const mapCode = TEST_MAPS[mapIndex % TEST_MAPS.length];
    mapIndex++;
    
    try {
      await getIslandMetrics(mapCode, 'minute', from.toISOString(), to.toISOString(), accessToken);
      successCount++;
      
      // Log progress every 100 requests
      if (successCount % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = successCount / elapsed;
        process.stdout.write(`\r✅ ${successCount} requests | ${rate.toFixed(2)} req/sec | Errors: ${errorCount} | Rate Limited: ${rateLimitCount}`);
      }
    } catch (error) {
      errorCount++;
      if (error.response?.status === 429) {
        rateLimitCount++;
        console.log(`\n⚠️  RATE LIMITED at ${successCount} requests`);
        break;
      }
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const requestsPerSecond = successCount / totalTime;
  const requestsPer10Min = requestsPerSecond * 600;
  
  console.log(`\n\n📊 ===== RESULTS =====`);
  console.log(`✅ Successful: ${successCount.toLocaleString()}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`⏱️  Rate Limited (429): ${rateLimitCount}`);
  console.log(`⏱️  Duration: ${totalTime.toFixed(1)}s`);
  console.log(`📈 Rate: ${requestsPerSecond.toFixed(2)} req/sec`);
  console.log(`📊 10-minute capacity: ${Math.floor(requestsPer10Min).toLocaleString()} requests`);
  
  if (rateLimitCount === 0) {
    console.log(`\n✅ NO RATE LIMITING!`);
    if (requestsPer10Min >= 172000) {
      console.log(`🎉 Can process all 172,000 maps in 10 minutes!`);
    } else {
      const timeNeeded = Math.ceil((172000 / requestsPerSecond) / 60);
      console.log(`⏱️  Would need ${timeNeeded} minutes to process all 172,000 maps`);
    }
  } else {
    console.log(`\n⚠️  Hit rate limit after ${successCount} requests`);
  }
}

testThroughput().catch(console.error);
