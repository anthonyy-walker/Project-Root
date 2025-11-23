/**
 * Quick Test - Single Map Mnemonic Info
 * Tests the mnemonic info endpoint to see what Epic returns
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { getMnemonicInfo } = require('../apis/mnemonicInfoAPI');
const fs = require('fs');
const path = require('path');

// Test credentials
const ACCESS_TOKEN = process.env.EPIC_ACCESS_TOKEN || '1fd84fc4350d47f1830b7eb55b472c8d';
const ACCOUNT_ID = process.env.EPIC_ACCOUNT_ID || '702668b59afe48f4a40f66769d8b95a0';

async function quickTest() {
  console.log('🚀 Quick Test: Mnemonic Info API\n');
  console.log(`Using Access Token: ${ACCESS_TOKEN.substring(0, 10)}...`);
  console.log(`Using Account ID: ${ACCOUNT_ID}\n`);
  
  try {
    // Test with the map from fn360 example
    const mnemonic = '8530-0110-2817'; // PEELY VS JONESY map
    
    console.log(`📍 Testing map code: ${mnemonic}`);
    console.log('⏳ Fetching data from Epic Games API...\n');
    
    const response = await getMnemonicInfo(mnemonic, ACCESS_TOKEN);
    
    console.log('✅ SUCCESS! Response received:\n');
    console.log(JSON.stringify(response, null, 2));
    
    // Save to file
    const outputDir = path.join(__dirname, 'endpoint_responses');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, 'quick_test_mnemonic_info.json');
    fs.writeFileSync(outputFile, JSON.stringify({
      endpoint: 'MNEMONIC_INFO',
      mnemonic: mnemonic,
      timestamp: new Date().toISOString(),
      response: response
    }, null, 2));
    
    console.log(`\n💾 Saved response to: ${outputFile}`);
    
    // Show key fields
    console.log('\n📊 Key Fields in Response:');
    if (response) {
      console.log(`  - Fields: ${Object.keys(response).join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\nFull error:', error);
    
    if (error.response) {
      console.error('\nAPI Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

quickTest();
