/**
 * Test All Epic Games Endpoints
 * This script will call all available endpoints and save the raw responses
 * to understand the exact data structure returned by Epic Games API
 */

const fs = require('fs');
const path = require('path');

// Import API clients
const { getMnemonicInfo } = require('../apis/mnemonicInfoAPI');
const { getCreatorMaps } = require('../apis/creatorPageAPI');
const { getCreatorDetails } = require('../apis/popsAPI');
const DiscoveryClient = require('../apis/discovery/discoveryClient');

// Test credentials
const ACCESS_TOKEN = '1fd84fc4350d47f1830b7eb55b472c8d';
const ACCOUNT_ID = '702668b59afe48f4a40f66769d8b95a0';

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
  console.log(`✅ Saved: ${filename}`);
}

/**
 * Test 1: Mnemonic Info API (Map Details)
 */
async function testMnemonicInfo() {
  console.log('\n🔍 Testing Mnemonic Info API...');
  
  try {
    // Test with a popular map code (Peely vs Jonesy from fn360 example)
    const mnemonic = '8530-0110-2817';
    const response = await getMnemonicInfo(mnemonic, ACCESS_TOKEN);
    
    saveResponse('1_mnemonic_info_response.json', {
      endpoint: 'MNEMONIC_INFO',
      mnemonic: mnemonic,
      timestamp: new Date().toISOString(),
      response: response
    });
    
    return response;
  } catch (error) {
    console.error('❌ Error testing Mnemonic Info:', error.message);
    saveResponse('1_mnemonic_info_ERROR.json', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Test 2: Creator Page API (Creator's Maps)
 */
async function testCreatorPage() {
  console.log('\n🔍 Testing Creator Page API...');
  
  try {
    // Test with NATM0R's account ID (from mnemonic API response)
    const creatorAccountId = 'c27bfa5946f3465492d31fe1b9fae9c1';
    
    const response = await getCreatorMaps(creatorAccountId, ACCESS_TOKEN, ACCOUNT_ID, 50);
    
    saveResponse('2_creator_page_response.json', {
      endpoint: 'CREATOR_PAGE',
      creatorAccountId: creatorAccountId,
      timestamp: new Date().toISOString(),
      response: response
    });
    
    return response;
  } catch (error) {
    console.error('❌ Error testing Creator Page:', error.message);
    saveResponse('2_creator_page_ERROR.json', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Test 3: POPS API (Creator Details)
 */
async function testPopsAPI() {
  console.log('\n🔍 Testing POPS API...');
  
  try {
    // Test with NATM0R's account ID
    const creatorAccountId = 'c27bfa5946f3465492d31fe1b9fae9c1';
    const response = await getCreatorDetails(creatorAccountId, ACCESS_TOKEN, ACCOUNT_ID);
    
    saveResponse('3_pops_creator_details_response.json', {
      endpoint: 'POPS',
      creatorAccountId: creatorAccountId,
      timestamp: new Date().toISOString(),
      response: response
    });
    
    return response;
  } catch (error) {
    console.error('❌ Error testing POPS API:', error.message);
    saveResponse('3_pops_creator_details_ERROR.json', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Test 4: Discovery Surface API (All Surfaces)
 */
async function testDiscoverySurface() {
  console.log('\n🔍 Testing Discovery Surface API...');
  
  try {
    const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
    
    // Test with Browse surface (most common)
    const surfaceName = 'CreativeDiscoverySurface_Browse';
    const panels = await discoveryClient.fetchDiscoveryPanels(surfaceName);
    
    saveResponse('4_discovery_surface_browse_response.json', {
      endpoint: 'DISCOVERY_SURFACE',
      surfaceName: surfaceName,
      timestamp: new Date().toISOString(),
      response: panels
    });
    
    return panels;
  } catch (error) {
    console.error('❌ Error testing Discovery Surface:', error.message);
    saveResponse('4_discovery_surface_ERROR.json', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Test 5: Discovery Panel Pages API
 */
async function testDiscoveryPanelPages() {
  console.log('\n🔍 Testing Discovery Panel Pages API...');
  
  try {
    const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
    
    // First get panels
    const surfaceName = 'CreativeDiscoverySurface_Browse';
    const panels = await discoveryClient.fetchDiscoveryPanels(surfaceName);
    
    if (panels && panels.length > 0) {
      // Test with first panel
      const firstPanel = panels[0];
      console.log(`Testing panel: ${firstPanel.panelName}`);
      
      const panelPages = await discoveryClient.fetchPanelPages(
        surfaceName,
        firstPanel.panelName,
        firstPanel.testVariantName,
        3 // Just fetch first 3 pages for testing
      );
      
      saveResponse('5_discovery_panel_pages_response.json', {
        endpoint: 'DISCOVERY_PANEL_PAGES',
        surfaceName: surfaceName,
        panelName: firstPanel.panelName,
        timestamp: new Date().toISOString(),
        response: panelPages
      });
      
      return panelPages;
    } else {
      console.log('⚠️  No panels found to test');
      return null;
    }
  } catch (error) {
    console.error('❌ Error testing Discovery Panel Pages:', error.message);
    saveResponse('5_discovery_panel_pages_ERROR.json', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Test 6: Multiple Surfaces
 */
async function testMultipleSurfaces() {
  console.log('\n🔍 Testing Multiple Discovery Surfaces...');
  
  const surfaces = [
    'CreativeDiscoverySurface_Frontend',
    'CreativeDiscoverySurface_Browse',
    'CreativeDiscoverySurface_Library'
  ];
  
  const results = {};
  
  for (const surface of surfaces) {
    try {
      console.log(`  Testing surface: ${surface}`);
      const discoveryClient = new DiscoveryClient(ACCESS_TOKEN, ACCOUNT_ID);
      const panels = await discoveryClient.fetchDiscoveryPanels(surface);
      results[surface] = {
        success: true,
        panelCount: panels.length,
        panels: panels
      };
    } catch (error) {
      console.error(`  ❌ Error with ${surface}:`, error.message);
      results[surface] = {
        success: false,
        error: error.message
      };
    }
  }
  
  saveResponse('6_multiple_surfaces_response.json', {
    endpoint: 'DISCOVERY_SURFACE_MULTIPLE',
    timestamp: new Date().toISOString(),
    response: results
  });
  
  return results;
}

/**
 * Main Test Runner
 */
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Starting Epic Games API Endpoint Tests');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📁 Output Directory: ${OUTPUT_DIR}`);
  console.log(`🔑 Using Account ID: ${ACCOUNT_ID}`);
  console.log('═══════════════════════════════════════════════════════');
  
  const results = {
    startTime: new Date().toISOString(),
    tests: {}
  };
  
  // Test 1: Mnemonic Info
  try {
    const mnemonicResult = await testMnemonicInfo();
    results.tests.mnemonicInfo = { success: !!mnemonicResult };
  } catch (error) {
    results.tests.mnemonicInfo = { success: false, error: error.message };
  }
  
  // Wait a bit to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Creator Page
  try {
    const creatorPageResult = await testCreatorPage();
    results.tests.creatorPage = { success: !!creatorPageResult };
  } catch (error) {
    results.tests.creatorPage = { success: false, error: error.message };
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: POPS API
  try {
    const popsResult = await testPopsAPI();
    results.tests.popsAPI = { success: !!popsResult };
  } catch (error) {
    results.tests.popsAPI = { success: false, error: error.message };
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 4: Discovery Surface
  try {
    const discoveryResult = await testDiscoverySurface();
    results.tests.discoverySurface = { success: !!discoveryResult };
  } catch (error) {
    results.tests.discoverySurface = { success: false, error: error.message };
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 5: Discovery Panel Pages
  try {
    const panelPagesResult = await testDiscoveryPanelPages();
    results.tests.discoveryPanelPages = { success: !!panelPagesResult };
  } catch (error) {
    results.tests.discoveryPanelPages = { success: false, error: error.message };
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 6: Multiple Surfaces
  try {
    const multipleSurfacesResult = await testMultipleSurfaces();
    results.tests.multipleSurfaces = { success: !!multipleSurfacesResult };
  } catch (error) {
    results.tests.multipleSurfaces = { success: false, error: error.message };
  }
  
  results.endTime = new Date().toISOString();
  
  // Save summary
  saveResponse('_TEST_SUMMARY.json', results);
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ All Tests Complete!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\nResults Summary:');
  Object.entries(results.tests).forEach(([test, result]) => {
    console.log(`  ${result.success ? '✅' : '❌'} ${test}`);
  });
  console.log('\n📁 Check the endpoint_responses folder for detailed results');
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
