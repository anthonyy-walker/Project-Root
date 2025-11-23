/**
 * Migrate tokens from .env to token management system
 * This creates a tokenData.json file from existing .env tokens
 */

const fs = require('fs');
const path = require('path');
const { saveTokens } = require('./auth');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function migrateTokens() {
  console.log('🔄 Migrating tokens from .env to token management system...\n');
  
  const accessToken = process.env.EPIC_ACCESS_TOKEN;
  const accountId = process.env.EPIC_ACCOUNT_ID;
  
  if (!accessToken || !accountId) {
    console.error('❌ Missing tokens in .env file');
    console.error('   Required: EPIC_ACCESS_TOKEN, EPIC_ACCOUNT_ID');
    console.log('\n💡 To get new tokens:');
    console.log('   1. Get exchange code from Epic Games');
    console.log('   2. Run: node auth/authenticate.js <exchange_code>');
    process.exit(1);
  }
  
  console.log('✅ Found tokens in .env:');
  console.log(`   Access Token: ${accessToken.substring(0, 20)}...`);
  console.log(`   Account ID: ${accountId}\n`);
  
  // Create token data object
  // Note: .env tokens don't have expiration or refresh token
  // So we'll create a placeholder that will need refreshing
  const tokenData = {
    access_token: accessToken,
    account_id: accountId,
    token_type: 'bearer',
    
    // Set expiration to 8 hours from now (typical Epic token lifetime)
    expires_in: 28800,
    expires_at: new Date(Date.now() + 28800000).toISOString(),
    
    // Note: No refresh token available from .env
    // User will need to re-authenticate when this expires
    refresh_token: null,
    refresh_expires_in: null,
    refresh_expires_at: null,
    
    // Placeholder for display name (not in .env)
    displayName: 'Unknown (from .env)',
    
    // Migration metadata
    _migrated_from_env: true,
    _migration_date: new Date().toISOString()
  };
  
  // Save to token file
  const saved = saveTokens(tokenData);
  
  if (saved) {
    console.log('✅ Tokens migrated successfully!');
    console.log('   Saved to: data/tokenData.json');
    console.log(`   Expires at: ${tokenData.expires_at}\n`);
    
    console.log('⚠️ Important Notes:');
    console.log('   - No refresh token available (from .env)');
    console.log('   - You\'ll need to re-authenticate after expiration');
    console.log('   - For automatic refresh, get a new token with:');
    console.log('     node auth/authenticate.js <exchange_code>\n');
    
    console.log('✅ You can now use the auth system:');
    console.log('   - initAuth() to initialize');
    console.log('   - getValidToken() to get current token');
    console.log('   - Tokens will work until expiration\n');
    
  } else {
    console.error('❌ Failed to save tokens');
    process.exit(1);
  }
}

if (require.main === module) {
  migrateTokens()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = migrateTokens;
