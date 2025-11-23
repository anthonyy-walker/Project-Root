/**
 * Test Authentication System
 * Tests token exchange, refresh, and automatic renewal
 */

const { exchangeCode, refreshAccessToken, getValidToken, isTokenValid, loadTokens, initAuth } = require('./auth');

async function testAuth() {
  console.log('🧪 Testing Authentication System\n');
  console.log('=' .repeat(60));
  
  // Test 1: Load existing tokens
  console.log('\n📋 Test 1: Load Existing Tokens');
  console.log('-'.repeat(60));
  const tokenData = loadTokens();
  
  if (tokenData) {
    console.log('✅ Tokens loaded successfully');
    console.log(`   Account: ${tokenData.displayName} (${tokenData.account_id})`);
    console.log(`   Access Token: ${tokenData.access_token.substring(0, 30)}...`);
    if (tokenData.refresh_token) {
      console.log(`   Refresh Token: ${tokenData.refresh_token.substring(0, 30)}...`);
      console.log(`   Refresh Expires At: ${tokenData.refresh_expires_at}`);
    } else {
      console.log(`   Refresh Token: None (migrated from .env)`);
    }
    console.log(`   Expires At: ${tokenData.expires_at}`);
  } else {
    console.log('⚠️ No tokens found');
    console.log('   Run: node authenticate.js <exchange_code>');
    return;
  }
  
  // Test 2: Check token validity
  console.log('\n📋 Test 2: Check Token Validity');
  console.log('-'.repeat(60));
  const valid = isTokenValid(tokenData);
  
  if (valid) {
    console.log('✅ Token is valid and not expiring soon');
    const expiresAt = new Date(tokenData.expires_at);
    const now = new Date();
    const minutesUntilExpiry = Math.floor((expiresAt - now) / 60000);
    console.log(`   Time until expiry: ${minutesUntilExpiry} minutes`);
  } else {
    console.log('⚠️ Token is expired or expiring soon');
    console.log('   Will be refreshed automatically');
  }
  
  // Test 3: Get valid token (with auto-refresh)
  console.log('\n📋 Test 3: Get Valid Token (with auto-refresh)');
  console.log('-'.repeat(60));
  try {
    const validToken = await getValidToken();
    console.log('✅ Got valid token');
    console.log(`   Access Token: ${validToken.access_token.substring(0, 30)}...`);
    console.log(`   Expires At: ${validToken.expires_at}`);
  } catch (error) {
    console.error('❌ Failed to get valid token:', error.message);
  }
  
  // Test 4: Initialize auth system
  console.log('\n📋 Test 4: Initialize Auth System');
  console.log('-'.repeat(60));
  const initialized = initAuth();
  
  if (initialized) {
    console.log('✅ Auth system initialized');
    console.log('   Automatic token refresh scheduled');
  } else {
    console.log('⚠️ Auth system needs authentication');
  }
  
  // Test 5: Manual refresh (optional)
  console.log('\n📋 Test 5: Manual Token Refresh');
  console.log('-'.repeat(60));
  console.log('⏭️ Skipping manual refresh test (use only if needed)');
  console.log('   To test manually: uncomment the refreshAccessToken() call');
  
  // Uncomment to test manual refresh:
  // try {
  //   const refreshedToken = await refreshAccessToken();
  //   console.log('✅ Token refreshed successfully');
  //   console.log(`   New Expires At: ${refreshedToken.expires_at}`);
  // } catch (error) {
  //   console.error('❌ Failed to refresh token:', error.message);
  // }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests complete!\n');
}

// Run tests
if (require.main === module) {
  testAuth()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Test failed:', err);
      process.exit(1);
    });
}

module.exports = testAuth;
