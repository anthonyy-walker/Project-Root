#!/usr/bin/env node

/**
 * Find Ecosystem API Rate Limit Sweet Spot
 */

const { getIslandMetrics } = require('../EpicGames/apis/ecosystemAPI');
const { getAccessToken } = require('../workers/utils/auth-helper');

const TEST_MAPS = ['7775-6862-7050', '8029-8763-0877', '5178-2465-1702'];

async function testWithDelay(delayMs) {
  const accessToken = await getAccessToken();
  const to = new Date();
  const from = new Date(to.getTime() - 10 * 60 * 1000);
  
  let successCount = 0;
  let rateLimitCount = 0;
  const startTime = Date.now();
  const testDuration = 60000; // 1 minute test
  
  process.stdout.write(`Testing ${delayMs}ms delay... `);
  
  while (Date.now() - startTime < testDuration && rateLimitCount === 0) {
    const mapCode = TEST_MAPS[successCount % TEST_MAPS.length];
    
    try {
      await getIslandMetrics(mapCode, 'minute', from.toISOString(), to.toISOString(), accessToken);
      successCount++;
      await new Promise(r => setTimeout(r, delayMs));
    } catch (error) {
      if (error.response?.status === 429) {
        rateLimitCount++;
        break;
      }
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = successCount / elapsed;
  const capacity10min = Math.floor(rate * 600);
  
  console.log(`${successCount} req in ${elapsed.toFixed(0)}s = ${rate.toFixed(2)} req/s = ${capacity10min.toLocaleString()}/10min ${rateLimitCount > 0 ? '❌ RATE LIMITED' : '✅'}`);
  
  return { delayMs, successCount, rate, capacity10min, rateLimited: rateLimitCount > 0 };
}

async function findOptimalDelay() {
  console.log('🔍 Finding optimal delay for Ecosystem API...\n');
  
  const delays = [3000, 4000, 5000, 6000, 10000]; // Start conservative
  
  for (const delay of delays) {
    const result = await testWithDelay(delay);
    
    if (!result.rateLimited && result.capacity10min >= 172000) {
      console.log(`\n✅ FOUND IT! ${delay}ms delay can handle all 172,000 maps in 10 minutes!`);
      return;
    }
    
    if (!result.rateLimited) {
      console.log(`   Can process ${result.capacity10min.toLocaleString()} maps in 10 min (need 172,000)`);
    }
    
    await new Promise(r => setTimeout(r, 5000)); // Cooldown
  }
  
  console.log(`\n⚠️  None of the tested delays can handle 172k maps in 10 minutes.`);
  console.log(`   Consider splitting across multiple 10-minute cycles or increasing worker count.`);
}

findOptimalDelay().catch(console.error);
