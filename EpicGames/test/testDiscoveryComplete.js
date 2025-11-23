/**
 * Full Discovery Snapshot Test
 * Tests the complete discovery client to fetch ALL panels and ALL pages for a surface
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const DiscoveryClient = require('../apis/discovery/discoveryClient');
const fs = require('fs');
const path = require('path');

// Test credentials
const ACCESS_TOKEN = process.env.EPIC_ACCESS_TOKEN || '1fd84fc4350d47f1830b7eb55b472c8d';
const ACCOUNT_ID = process.env.EPIC_ACCOUNT_ID || '702668b59afe48f4a40f66769d8b95a0';

// Output directory
const OUTPUT_DIR = path.join(__dirname, 'endpoint_responses');

/**
 * Save response to JSON file
 */
function saveResponse(filename, data) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved: ${filename}`);
  return filepath;
}

/**
 * Test 1: Complete Discovery Snapshot for Browse Surface
 * This is what we need for fn360 - all panels with all their maps
 */
async function testCompleteDiscoveryBrowse() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔍 TEST 1: Complete Discovery Snapshot - Browse Surface');
  console.log('═══════════════════════════════════════════════════════');
  console.log('This will fetch ALL panels and ALL pages for Browse...\n');
  
  const startTime = Date.now();
  
  try {
    const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
    
    // Fetch complete discovery for Browse surface
    // maxPanels = null (fetch all panels)
    // maxPages = 50 (fetch up to 50 pages per panel)
    const completeDiscovery = await discoveryClient.fetchCompleteDiscovery(
      'CreativeDiscoverySurface_Browse',
      null,  // null = fetch ALL panels
      50     // max 50 pages per panel (should be enough)
    );
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Save full snapshot
    const filepath = saveResponse('discovery_browse_COMPLETE_SNAPSHOT.json', {
      test: 'Complete Discovery Snapshot',
      surface: 'CreativeDiscoverySurface_Browse',
      timestamp: new Date().toISOString(),
      duration: `${duration} seconds`,
      ...completeDiscovery
    });
    
    // Print summary
    console.log('\n✅ COMPLETE SNAPSHOT FETCHED!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📊 Summary:`);
    console.log(`   Surface: ${completeDiscovery.surface}`);
    console.log(`   Total Panels: ${completeDiscovery.totalPanels}`);
    console.log(`   Total Items: ${completeDiscovery.totalItems}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log(`   Saved to: ${path.basename(filepath)}`);
    console.log('═══════════════════════════════════════════════════════');
    
    // Show panel breakdown
    console.log('\n📋 Panel Breakdown:');
    console.log('─────────────────────────────────────────────────────');
    completeDiscovery.panels.forEach((panel, index) => {
      const status = panel.error ? '❌' : '✅';
      console.log(`${status} ${index + 1}. ${panel.panelDisplayName} (${panel.panelName})`);
      console.log(`     Type: ${panel.panelType} | Items: ${panel.itemCount}`);
      if (panel.error) {
        console.log(`     Error: ${panel.error}`);
      }
    });
    console.log('─────────────────────────────────────────────────────');
    
    return completeDiscovery;
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Test 2: Complete Discovery for Frontend Surface
 */
async function testCompleteDiscoveryFrontend() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔍 TEST 2: Complete Discovery Snapshot - Frontend Surface');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const startTime = Date.now();
  
  try {
    const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
    
    const completeDiscovery = await discoveryClient.fetchCompleteDiscovery(
      'CreativeDiscoverySurface_Frontend',
      null,  // fetch all panels
      50
    );
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    saveResponse('discovery_frontend_COMPLETE_SNAPSHOT.json', {
      test: 'Complete Discovery Snapshot',
      surface: 'CreativeDiscoverySurface_Frontend',
      timestamp: new Date().toISOString(),
      duration: `${duration} seconds`,
      ...completeDiscovery
    });
    
    console.log(`\n✅ Frontend Snapshot: ${completeDiscovery.totalPanels} panels, ${completeDiscovery.totalItems} items (${duration}s)`);
    
    return completeDiscovery;
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    throw error;
  }
}

/**
 * Test 3: Multiple Surfaces (Browse + Frontend)
 */
async function testMultipleSurfaces() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔍 TEST 3: Multiple Surfaces - PARALLEL FETCH');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Fetching Browse + Frontend in parallel...\n');
  
  const startTime = Date.now();
  
  try {
    const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
    
    const surfaces = [
      'CreativeDiscoverySurface_Browse',
      'CreativeDiscoverySurface_Frontend'
    ];
    
    const results = await discoveryClient.fetchMultipleSurfaces(surfaces, null, 50);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    saveResponse('discovery_MULTIPLE_SURFACES.json', {
      test: 'Multiple Surfaces Parallel Fetch',
      timestamp: new Date().toISOString(),
      duration: `${duration} seconds`,
      ...results
    });
    
    console.log('\n✅ MULTIPLE SURFACES FETCHED!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📊 Summary:`);
    console.log(`   Surfaces: ${results.totalSurfaces}`);
    console.log(`   Total Panels: ${results.totalPanels}`);
    console.log(`   Total Items: ${results.totalItems}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log('═══════════════════════════════════════════════════════');
    
    // Show per-surface breakdown
    console.log('\n📋 Per-Surface Breakdown:');
    console.log('─────────────────────────────────────────────────────');
    results.surfaces.forEach((surface, index) => {
      const status = surface.error ? '❌' : '✅';
      console.log(`${status} ${index + 1}. ${surface.surface}`);
      console.log(`     Panels: ${surface.totalPanels} | Items: ${surface.totalItems}`);
      if (surface.error) {
        console.log(`     Error: ${surface.error}`);
      }
    });
    console.log('─────────────────────────────────────────────────────');
    
    return results;
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    throw error;
  }
}

/**
 * Test 4: Fetch EVERYTHING (All surfaces available)
 * This is the ultimate test - fetches ALL surfaces in parallel!
 */
async function testFetchEverything() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🚀 TEST 4: FETCH EVERYTHING - ALL SURFACES!');
  console.log('═══════════════════════════════════════════════════════');
  
  const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
  const allSurfaces = discoveryClient.getAllSurfaces();
  
  console.log(`\nThis will fetch ALL ${allSurfaces.length} surfaces in parallel:`);
  allSurfaces.forEach((surface, index) => {
    console.log(`   ${index + 1}. ${surface}`);
  });
  
  console.log('\n⏳ Starting ULTRA PARALLEL FETCH...\n');
  
  const startTime = Date.now();
  
  try {
    const results = await discoveryClient.fetchEverything(50);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    saveResponse('discovery_EVERYTHING.json', {
      test: 'Fetch Everything',
      timestamp: new Date().toISOString(),
      duration: `${duration} seconds`,
      ...results
    });
    
    console.log('\n🎉 EVERYTHING FETCHED!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📊 Grand Summary:`);
    console.log(`   Surfaces Processed: ${results.totalSurfaces}/${results.surfaceCount}`);
    console.log(`   Total Panels: ${results.totalPanels}`);
    console.log(`   Total Items: ${results.totalItems}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log(`   Average: ${(results.totalItems / parseFloat(duration)).toFixed(0)} items/second`);
    console.log('═══════════════════════════════════════════════════════');
    
    // Show per-surface breakdown
    console.log('\n📋 All Surfaces Breakdown:');
    console.log('─────────────────────────────────────────────────────');
    results.surfaces.forEach((surface, index) => {
      const status = surface.error ? '❌' : '✅';
      const surfaceName = surface.surface.replace('CreativeDiscoverySurface_', '');
      console.log(`${status} ${(index + 1).toString().padStart(2, ' ')}. ${surfaceName.padEnd(30, ' ')} | ${surface.totalPanels.toString().padStart(2, ' ')} panels | ${surface.totalItems.toString().padStart(4, ' ')} items`);
    });
    console.log('─────────────────────────────────────────────────────');
    
    return results;
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    throw error;
  }
}

/**
 * Main Test Runner
 */
async function runDiscoveryTests() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   🚀 DISCOVERY CLIENT FULL SNAPSHOT TEST             ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\n📝 Access Token: ${ACCESS_TOKEN.substring(0, 10)}...`);
  console.log(`👤 Account ID: ${ACCOUNT_ID}`);
  console.log(`📁 Output Directory: ${OUTPUT_DIR}\n`);
  
  const overallStart = Date.now();
  const results = {};
  
  try {
    // Test 1: Complete Browse snapshot (most important)
    results.browse = await testCompleteDiscoveryBrowse();
    
    // Wait a bit to avoid rate limiting
    console.log('\n⏱️  Waiting 3 seconds to avoid rate limiting...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: Complete Frontend snapshot
    results.frontend = await testCompleteDiscoveryFrontend();
    
    // Wait a bit to avoid rate limiting
    console.log('\n⏱️  Waiting 3 seconds to avoid rate limiting...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 3: Multiple surfaces in parallel
    results.multiple = await testMultipleSurfaces();
    
    // Wait before the big one
    console.log('\n⏱️  Waiting 5 seconds before fetching EVERYTHING...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test 4: FETCH EVERYTHING!
    results.everything = await testFetchEverything();
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
  
  const overallEnd = Date.now();
  const totalDuration = ((overallEnd - overallStart) / 1000).toFixed(2);
  
  // Final Summary
  console.log('\n\n╔═══════════════════════════════════════════════════════╗');
  console.log('║              🎉 ALL TESTS COMPLETE!                  ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\n⏱️  Total Duration: ${totalDuration} seconds`);
  console.log(`\n📁 All results saved to: ${OUTPUT_DIR}`);
  console.log('\n✅ Test Results:');
  if (results.browse) {
    console.log(`   - Browse: ${results.browse.totalPanels} panels, ${results.browse.totalItems} items`);
  }
  if (results.frontend) {
    console.log(`   - Frontend: ${results.frontend.totalPanels} panels, ${results.frontend.totalItems} items`);
  }
  if (results.multiple) {
    console.log(`   - Multiple: ${results.multiple.totalSurfaces} surfaces, ${results.multiple.totalItems} items`);
  }
  if (results.everything) {
    console.log(`   - Everything: ${results.everything.totalSurfaces} surfaces, ${results.everything.totalItems} items`);
  }
  
  console.log('\n🎯 Key Files Created:');
  console.log('   - discovery_browse_COMPLETE_SNAPSHOT.json');
  console.log('   - discovery_frontend_COMPLETE_SNAPSHOT.json');
  console.log('   - discovery_MULTIPLE_SURFACES.json');
  console.log('   - discovery_EVERYTHING.json');
  
  console.log('\n💡 Next Steps:');
  console.log('   1. Review the complete snapshots');
  console.log('   2. Use this data to design discovery tracking');
  console.log('   3. Build ingestion pipeline for 10-min snapshots');
  console.log('   4. Create discovery position change tracking');
}

// Run the tests
runDiscoveryTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
