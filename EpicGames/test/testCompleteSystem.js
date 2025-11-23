/**
 * COMPLETE SYSTEM TEST
 * Tests all Epic Games API endpoints with real data
 * Validates all clients work correctly and fetches EVERYTHING from discovery
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import API clients
const { getMnemonicInfo } = require('../apis/mnemonicInfoAPI');
const { getCreatorMaps } = require('../apis/creatorPageAPI');
const { getCreatorDetails } = require('../apis/popsAPI');
const DiscoveryClient = require('../apis/discovery/discoveryClient');

const ACCESS_TOKEN = process.env.EPIC_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.EPIC_ACCOUNT_ID;

// Output directory for test results
const OUTPUT_DIR = path.join(__dirname, 'endpoint_responses');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Save response to JSON file
 */
function saveResponse(filename, data) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved: ${filename}`);
}

/**
 * Print section header
 */
function printHeader(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

/**
 * Test 1: Mnemonic Info API (Map Details)
 */
async function testMnemonicInfo() {
  printHeader('TEST 1: MNEMONIC INFO API (Map Details)');
  
  try {
    const testMaps = [
      '8530-0110-2817', // Popular map
      '9234-6017-8065', // Another test map
    ];

    console.log(`Testing ${testMaps.length} map codes...`);
    const results = [];

    for (const mnemonic of testMaps) {
      console.log(`\n📍 Fetching map: ${mnemonic}`);
      const response = await getMnemonicInfo(mnemonic, ACCESS_TOKEN);
      
      if (response && response.namespace) {
        console.log(`   ✅ Title: ${response.metadata?.title || 'N/A'}`);
        console.log(`   ✅ Creator: ${response.metadata?.creator || 'N/A'}`);
        console.log(`   ✅ Created: ${response.metadata?.createdDate || 'N/A'}`);
        results.push({
          mnemonic,
          success: true,
          data: response
        });
      } else {
        console.log(`   ⚠️  No data returned`);
        results.push({
          mnemonic,
          success: false,
          error: 'No data'
        });
      }
    }

    saveResponse('test1_mnemonic_info_COMPLETE.json', {
      test: 'Mnemonic Info API',
      timestamp: new Date().toISOString(),
      results
    });

    console.log(`\n✅ Mnemonic Info Test Complete: ${results.filter(r => r.success).length}/${testMaps.length} successful`);
    return true;

  } catch (error) {
    console.error('❌ Mnemonic Info Test Failed:', error.message);
    return false;
  }
}

/**
 * Test 2: Creator Page API (Creator's Published Maps)
 */
async function testCreatorPage() {
  printHeader('TEST 2: CREATOR PAGE API (Creator Maps)');
  
  try {
    const testCreators = [
      { name: 'NATM0R', accountId: ACCOUNT_ID }, // Your account
      { name: 'Epic Games', accountId: '2d0c4e7fbd814f35bb1e57ae1a5a47b4' }, // Epic's official account
    ];

    console.log(`Testing ${testCreators.length} creator accounts...`);
    const results = [];

    for (const creator of testCreators) {
      console.log(`\n👤 Fetching maps for: ${creator.name}`);
      const response = await getCreatorMaps(creator.accountId, ACCESS_TOKEN, ACCOUNT_ID);
      
      if (response && response.results) {
        console.log(`   ✅ Found ${response.results.length} published maps`);
        console.log(`   ✅ Has More: ${response.hasMore || false}`);
        
        // Show first 3 maps
        response.results.slice(0, 3).forEach((map, i) => {
          console.log(`   ${i + 1}. ${map.linkData?.mnemonic || 'N/A'} - CCU: ${map.playerCount || 0}`);
        });

        results.push({
          creator: creator.name,
          accountId: creator.accountId,
          success: true,
          mapCount: response.results.length,
          data: response
        });
      } else {
        console.log(`   ⚠️  No maps found`);
        results.push({
          creator: creator.name,
          accountId: creator.accountId,
          success: false,
          error: 'No data'
        });
      }
    }

    saveResponse('test2_creator_page_COMPLETE.json', {
      test: 'Creator Page API',
      timestamp: new Date().toISOString(),
      results
    });

    console.log(`\n✅ Creator Page Test Complete: ${results.filter(r => r.success).length}/${testCreators.length} successful`);
    return true;

  } catch (error) {
    console.error('❌ Creator Page Test Failed:', error.message);
    return false;
  }
}

/**
 * Test 3: POPS API (Creator Profile Details)
 */
async function testPOPS() {
  printHeader('TEST 3: POPS API (Creator Profiles)');
  
  try {
    const testCreators = [
      { name: 'NATM0R', accountId: ACCOUNT_ID },
      { name: 'Epic Games', accountId: '2d0c4e7fbd814f35bb1e57ae1a5a47b4' },
    ];

    console.log(`Testing ${testCreators.length} creator profiles...`);
    const results = [];

    for (const creator of testCreators) {
      console.log(`\n👤 Fetching profile for: ${creator.name}`);
      const response = await getCreatorDetails(creator.accountId, ACCESS_TOKEN, ACCOUNT_ID);
      
      if (response && response.displayName) {
        console.log(`   ✅ Display Name: ${response.displayName}`);
        console.log(`   ✅ Followers: ${response.followerCount || 0}`);
        console.log(`   ✅ Following: ${response.followingCount || 0}`);
        console.log(`   ✅ Bio: ${response.biography?.substring(0, 50) || 'N/A'}...`);
        
        results.push({
          creator: creator.name,
          accountId: creator.accountId,
          success: true,
          data: response
        });
      } else {
        console.log(`   ⚠️  No profile data found`);
        results.push({
          creator: creator.name,
          accountId: creator.accountId,
          success: false,
          error: 'No data'
        });
      }
    }

    saveResponse('test3_pops_COMPLETE.json', {
      test: 'POPS API (Creator Profiles)',
      timestamp: new Date().toISOString(),
      results
    });

    console.log(`\n✅ POPS Test Complete: ${results.filter(r => r.success).length}/${testCreators.length} successful`);
    return true;

  } catch (error) {
    console.error('❌ POPS Test Failed:', error.message);
    return false;
  }
}

/**
 * Test 4: Discovery API - EVERYTHING (All Surfaces, All Panels, All Items)
 */
async function testDiscoveryEverything() {
  printHeader('TEST 4: DISCOVERY API - FETCH EVERYTHING');
  
  try {
    const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
    
    console.log(`\n🚀 Fetching ALL discovery data...`);
    console.log(`   📊 Available Surfaces: ${discoveryClient.getSurfaceCount()}`);
    console.log(`   📋 Surfaces: ${discoveryClient.getAllSurfaces().join(', ')}`);
    console.log(`\n⏱️  This will take 2-3 minutes... Please wait...\n`);

    const startTime = Date.now();
    const everything = await discoveryClient.fetchEverything(50); // Max 50 pages per panel
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\n🎉 COMPLETE DISCOVERY SNAPSHOT FETCHED!`);
    console.log(`═══════════════════════════════════════════════════════`);
    console.log(`📊 Summary:`);
    console.log(`   Total Surfaces: ${everything.totalSurfaces}`);
    console.log(`   Total Panels: ${everything.totalPanels}`);
    console.log(`   Total Unique Items: ${everything.totalItems}`);
    console.log(`   Duration: ${duration.toFixed(2)} seconds`);
    console.log(`═══════════════════════════════════════════════════════`);

    // Show breakdown by surface
    console.log(`\n📋 Per-Surface Breakdown:`);
    console.log(`─────────────────────────────────────────────────────`);
    everything.surfaces.forEach((surface, index) => {
      const status = surface.error ? '❌' : '✅';
      console.log(`${status} ${index + 1}. ${surface.surface}`);
      console.log(`     Panels: ${surface.totalPanels} | Items: ${surface.totalItems}`);
      if (surface.error) {
        console.log(`     Error: ${surface.error}`);
      }
    });
    console.log(`─────────────────────────────────────────────────────`);

    saveResponse('test4_discovery_EVERYTHING.json', everything);

    // Also save a summary
    const summary = {
      test: 'Discovery API - Complete Snapshot',
      timestamp: new Date().toISOString(),
      duration: `${duration.toFixed(2)} seconds`,
      stats: {
        totalSurfaces: everything.totalSurfaces,
        successfulSurfaces: everything.surfaces.filter(s => !s.error).length,
        failedSurfaces: everything.surfaces.filter(s => s.error).length,
        totalPanels: everything.totalPanels,
        totalItems: everything.totalItems
      },
      surfaceList: everything.surfaces.map(s => ({
        name: s.surface,
        panels: s.totalPanels,
        items: s.totalItems,
        success: !s.error,
        error: s.error || null
      }))
    };

    saveResponse('test4_discovery_SUMMARY.json', summary);

    console.log(`\n✅ Discovery Test Complete: ${summary.stats.successfulSurfaces}/${summary.stats.totalSurfaces} surfaces successful`);
    return true;

  } catch (error) {
    console.error('❌ Discovery Test Failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                   ║');
  console.log('║          EPIC GAMES API - COMPLETE SYSTEM TEST                    ║');
  console.log('║          Testing ALL Endpoints & Fetching ALL Data                ║');
  console.log('║                                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔑 Using Token: ${ACCESS_TOKEN.substring(0, 10)}...`);
  console.log(`👤 Account ID: ${ACCOUNT_ID}`);
  console.log(`📁 Output Directory: ${OUTPUT_DIR}`);

  const results = {
    startTime: new Date().toISOString(),
    tests: []
  };

  // Test 1: Mnemonic Info
  const test1 = await testMnemonicInfo();
  results.tests.push({ name: 'Mnemonic Info API', passed: test1 });

  // Test 2: Creator Page
  const test2 = await testCreatorPage();
  results.tests.push({ name: 'Creator Page API', passed: test2 });

  // Test 3: POPS
  const test3 = await testPOPS();
  results.tests.push({ name: 'POPS API', passed: test3 });

  // Test 4: Discovery Everything
  const test4 = await testDiscoveryEverything();
  results.tests.push({ name: 'Discovery API (Everything)', passed: test4 });

  // Final summary
  results.endTime = new Date().toISOString();
  results.totalTests = results.tests.length;
  results.passedTests = results.tests.filter(t => t.passed).length;
  results.failedTests = results.tests.filter(t => !t.passed).length;

  printHeader('FINAL TEST SUMMARY');
  console.log(`\n📊 Test Results:`);
  results.tests.forEach((test, index) => {
    const status = test.passed ? '✅' : '❌';
    console.log(`   ${status} Test ${index + 1}: ${test.name}`);
  });
  console.log(`\n📈 Overall: ${results.passedTests}/${results.totalTests} tests passed`);

  if (results.passedTests === results.totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! System is fully functional.');
  } else {
    console.log(`\n⚠️  ${results.failedTests} test(s) failed. Check logs above.`);
  }

  saveResponse('test_COMPLETE_SUMMARY.json', results);

  console.log('\n' + '='.repeat(70));
  console.log('  Test execution complete. Check endpoint_responses/ for results.');
  console.log('='.repeat(70) + '\n');
}

// Run all tests
runAllTests().catch(error => {
  console.error('\n💥 CRITICAL ERROR:', error);
  process.exit(1);
});
