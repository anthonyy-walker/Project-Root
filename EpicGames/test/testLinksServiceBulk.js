/**
 * Test Links Service Bulk API
 * Fetches metadata for sample maps and inspects the response structure
 */

const { getBulkMnemonicInfo } = require('../apis/linksServiceAPI');
const { getValidToken } = require('../auth/auth');
const fs = require('fs');
const path = require('path');

async function testBulkLinksService() {
  console.log('🧪 Testing Links Service Bulk API\n');
  
  try {
    // Get valid token
    const tokenData = await getValidToken();
    console.log('✅ Got valid token\n');
    
    // Sample map codes to test (mix of known and discovered maps)
    const testMaps = [
      '3557-4842-3529', // From your discovered maps
      '7623-5999-4448', // From your discovered maps
      '5550-9593-2518', // From your discovered maps
      '8530-0110-2817', // Test map from docs
      '1111-1111-1111'  // Test invalid to see error handling
    ];
    
    console.log(`📋 Testing with ${testMaps.length} map codes...\n`);
    
    // Fetch bulk metadata
    const results = await getBulkMnemonicInfo(testMaps, tokenData.access_token);
    
    console.log(`✅ Received ${results.length} results\n`);
    console.log('=' .repeat(80));
    
    // Inspect each result
    results.forEach((map, index) => {
      console.log(`\n📍 Map ${index + 1}: ${map.mnemonic || 'N/A'}`);
      console.log('-'.repeat(80));
      
      if (map.error) {
        console.log(`❌ Error: ${map.error}`);
        return;
      }
      
      // Display key fields
      console.log(`Title: ${map.metadata?.title || 'N/A'}`);
      console.log(`Creator: ${map.creatorName || map.accountId}`);
      console.log(`Link Type: ${map.linkType}`);
      console.log(`Active: ${map.active}`);
      console.log(`Created: ${map.created}`);
      console.log(`Published: ${map.published}`);
      console.log(`Version: ${map.version}`);
      console.log(`Moderation: ${map.moderationStatus}`);
      
      // Metadata fields
      if (map.metadata) {
        console.log(`\nMetadata fields available:`);
        console.log(`  - introduction: ${!!map.metadata.introduction}`);
        console.log(`  - tagline: ${!!map.metadata.tagline}`);
        console.log(`  - image_urls: ${!!map.metadata.image_urls}`);
        console.log(`  - matchmaking: ${!!map.metadata.matchmaking}`);
        console.log(`  - descriptionTags: ${map.descriptionTags?.length || 0} tags`);
        
        if (map.metadata.image_urls) {
          console.log(`\nImage URLs:`);
          console.log(`  - Full: ${map.metadata.image_urls.url ? 'Yes' : 'No'}`);
          console.log(`  - Medium: ${map.metadata.image_urls.url_m ? 'Yes' : 'No'}`);
          console.log(`  - Small: ${map.metadata.image_urls.url_s ? 'Yes' : 'No'}`);
        }
        
        if (map.metadata.matchmaking) {
          console.log(`\nMatchmaking:`);
          console.log(`  - Player Count: ${map.metadata.matchmaking.playerCount?.min}-${map.metadata.matchmaking.playerCount?.max}`);
          console.log(`  - MMS Type: ${map.metadata.matchmaking.mmsType || 'N/A'}`);
        }
      }
    });
    
    console.log('\n' + '='.repeat(80));
    
    // Save full response for inspection
    const outputPath = path.join(__dirname, '../test/endpoint_responses/links_bulk_test.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full response saved to: ${outputPath}`);
    
    // Display field summary
    console.log('\n📊 Field Analysis:');
    const allFields = new Set();
    const metadataFields = new Set();
    
    results.forEach(map => {
      if (!map.error) {
        Object.keys(map).forEach(key => allFields.add(key));
        if (map.metadata) {
          Object.keys(map.metadata).forEach(key => metadataFields.add(key));
        }
      }
    });
    
    console.log(`\nTop-level fields (${allFields.size}):`);
    console.log([...allFields].sort().join(', '));
    
    console.log(`\nMetadata fields (${metadataFields.size}):`);
    console.log([...metadataFields].sort().join(', '));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testBulkLinksService()
    .then(() => {
      console.log('\n✅ Test complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Test failed:', err);
      process.exit(1);
    });
}

module.exports = testBulkLinksService;
