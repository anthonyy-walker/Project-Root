#!/usr/bin/env node

/**
 * Epic Games Authentication CLI
 * Exchanges an authorization code for access and refresh tokens
 * 
 * Usage: node authenticate.js <exchange_code>
 */

const { exchangeCode } = require('./auth');

// Get exchange code from command line argument
const code = process.argv[2];

if (!code) {
  console.error('❌ Please provide an exchange code');
  console.log('\nUsage: node authenticate.js <exchange_code>');
  console.log('\nTo get an exchange code:');
  console.log('1. Visit: https://www.epicgames.com/id/api/redirect?clientId=ec684b8c687f479fadea3cb2ad83f5c6&responseType=code');
  console.log('2. Login and authorize');
  console.log('3. Copy the "code" parameter from the redirect URL');
  console.log('4. Run: node authenticate.js <code>');
  process.exit(1);
}

console.log('🚀 Starting authentication...\n');

exchangeCode(code)
  .then((tokenData) => {
    console.log('\n✅ Authentication complete!');
    console.log('\n📝 Token saved to: data/tokenData.json');
    console.log('\n🔄 Automatic token refresh is now active');
    console.log('   Token will be refreshed automatically before expiration');
    console.log('\n✅ Ready to start API collectors!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Authentication failed');
    console.error('   Error:', error.message);
    console.log('\n💡 Tips:');
    console.log('   - Make sure the exchange code is fresh (expires quickly)');
    console.log('   - Check your internet connection');
    console.log('   - Verify Epic Games services are online');
    process.exit(1);
  });
