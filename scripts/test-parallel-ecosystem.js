#!/usr/bin/env node

/**
 * Test Parallel Ecosystem API Requests
 * Find maximum parallel concurrency before rate limiting
 */

const { getIslandMetrics } = require('../EpicGames/apis/ecosystemAPI');
const { getAccessToken } = require('../workers/utils/auth-helper');

const TEST_MAPS = [
  '7775-6862-7050', '8029-8763-0877', '5178-2465-1702', '5790-9798-3857',
  '2076-5778-0327', '4570-2237-4868', '9661-0254-9282', '2750-5700-3679',
  '6179-3331-8096', '0500-2885-3137', '8651-8982-0434', '8995-9837-0904',
  '2632-0671-4002', '0399-0088-5626', '1433-1651-2859', '1886-4760-4301',
  '9422-8238-0595', '1667-2542-1485', '2030-9838-1218', '6101-8319-5759'
];

async function testParallel(concurrency, totalRequests = 100) {
  console.log(`\n🧪 Testing ${concurrency} parallel requests...`);
  
  const accessToken = await getAccessToken();
  const to = new Date();
  const from = new Date(to.getTime() - 10 * 60 * 1000);
  
  let successCount = 0;
  let errorCount = 0;
  let rateLimitCount = 0;
  let requestIndex = 0;
  
  const startTime = Date.now();
  
  // Process in batches
  while (requestIndex < totalRequests && rateLimitCount === 0) {
    const batchPromises = [];
    
    // Launch batch of parallel requests
    for (let i = 0; i < concurrency && requestIndex < totalRequests; i++) {
      const mapCode = TEST_MAPS[requestIndex % TEST_MAPS.length];
      const reqNum = requestIndex + 1;
      requestIndex++;
      
      batchPromises.push(
        getIslandMetrics(mapCode, 'minute', from.toISOString(), to.toISOString(), accessToken)
          .then(() => {
            successCount++;
            process.stdout.write(`\r✅ ${successCount}/${totalRequests} | Errors: ${errorCount} | Rate Limited: ${rateLimitCount}`);
          })
          .catch((error) => {
            if (error.response?.status === 429) {
              rateLimitCount++;
              console.log(`\n⚠️  RATE LIMITED at request #${reqNum} (${successCount} successful so far)`);
            } else {
              errorCount++;
            }
          })
      );
    }
    
    // Wait for batch to complete
    await Promise.all(batchPromises);
    
    // Stop if rate limited
    if (rateLimitCount > 0) break;
    
    // Small delay between batches
    await new Promise(r => setTimeout(r, 100));
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = successCount / elapsed;
  const capacity10min = Math.floor(rate * 600);
  
  console.log(`\n⏱️  Time: ${elapsed.toFixed(1)}s`);
  console.log(`📊 Rate: ${rate.toFixed(2)} req/sec`);
  console.log(`📈 10-min capacity: ${capacity10min.toLocaleString()} requests`);
  
  return {
    concurrency,
    successCount,
    errorCount,
    rateLimitCount,
    rate,
    capacity10min,
    elapsed
  };
}

async function findOptimalConcurrency() {
  console.log('🚀 Finding Optimal Parallel Concurrency for Ecosystem API\n');
  console.log('🎯 Goal: Process as many requests as possible without rate limiting\n');
  
  const concurrencyLevels = [1, 2, 5, 10, 20, 50];
  const results = [];
  
  for (const concurrency of concurrencyLevels) {
    const result = await testParallel(concurrency, 100);
    results.push(result);
    
    if (result.rateLimitCount > 0) {
      console.log(`\n❌ Rate limited at concurrency ${concurrency}. Stopping tests.\n`);
      break;
    }
    
    console.log(`✅ Success! Can handle ${concurrency} parallel requests`);
    
    // Cooldown between tests
    console.log(`⏸️  Cooling down for 10 seconds...\n`);
    await new Promise(r => setTimeout(r, 10000));
  }
  
  // Summary
  console.log('\n📊 ===== SUMMARY =====\n');
  console.log('Concurrency | Success | Rate Limited | Req/Sec | 10-Min Capacity');
  console.log('----------- | ------- | ------------ | ------- | ---------------');
  
  results.forEach(r => {
    const limited = r.rateLimitCount > 0 ? '❌ YES' : '✅ NO';
    console.log(
      `${String(r.concurrency).padStart(11)} | ` +
      `${String(r.successCount).padStart(7)} | ` +
      `${limited.padStart(12)} | ` +
      `${r.rate.toFixed(2).padStart(7)} | ` +
      `${r.capacity10min.toLocaleString().padStart(15)}`
    );
  });
  
  // Find best result without rate limiting
  const validResults = results.filter(r => r.rateLimitCount === 0);
  if (validResults.length > 0) {
    const best = validResults[validResults.length - 1];
    console.log(`\n✨ Optimal concurrency: ${best.concurrency} parallel requests`);
    console.log(`📊 Can process ${best.capacity10min.toLocaleString()} maps in 10 minutes`);
    
    if (best.capacity10min >= 172000) {
      console.log(`✅ Can handle all 172,000 maps! 🎉`);
    } else {
      const timeNeeded = Math.ceil((172000 / best.capacity10min) * 10);
      console.log(`⏱️  Need ${timeNeeded} minutes to process all 172,000 maps`);
      console.log(`   Or ${Math.ceil(172000 / best.capacity10min)} cycles of 10 minutes each`);
    }
  } else {
    console.log(`\n⚠️  All concurrency levels hit rate limits`);
  }
}

findOptimalConcurrency().catch(console.error);
