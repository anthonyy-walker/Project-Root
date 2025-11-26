#!/usr/bin/env node

/**
 * Test POPS API to see what data it returns
 */

const { getCreatorDetails } = require('../apis/popsAPI');
const { initAuth, getValidToken } = require('../auth/auth');
const fs = require('fs');
const path = require('path');

async function testPops() {
  console.log('🧪 Testing POPS API\n');
  
  try {
    // Initialize auth
    await initAuth();
    const tokenData = await getValidToken();
    const accessToken = tokenData.access_token;
    const accountId = tokenData.account_id;
    
    console.log('✅ Authentication initialized\n');
    
    // Test with a known creator (Epic Games)
    const testCreatorId = '22c7836be2db4515a347bbd2f30f5865'; // From our test map
    
    console.log(`📡 Fetching POPS data for creator: ${testCreatorId}`);
    const popsData = await getCreatorDetails(testCreatorId, accessToken, accountId);
    
    console.log('\n📄 POPS API Response:');
    console.log(JSON.stringify(popsData, null, 2));
    
    // Save to file
    const outputPath = path.join(__dirname, 'pops_response.json');
    fs.writeFileSync(outputPath, JSON.stringify(popsData, null, 2));
    console.log(`\n💾 Saved response to: ${outputPath}`);
    
    // Show key fields
    console.log('\n🔑 Key Fields:');
    console.log(`   Display Name: ${popsData.displayName || 'N/A'}`);
    console.log(`   Follower Count: ${popsData.followerCount || 'N/A'}`);
    console.log(`   Bio: ${popsData.bio || 'N/A'}`);
    console.log(`   Avatar: ${popsData.images?.avatar ? 'Yes' : 'No'}`);
    console.log(`   Banner: ${popsData.images?.banner ? 'Yes' : 'No'}`);
    console.log(`   Socials: ${Object.keys(popsData.social || {}).length} platforms`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

testPops().then(() => process.exit(0)).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
