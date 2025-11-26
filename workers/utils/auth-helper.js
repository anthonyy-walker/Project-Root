/**
 * Auth Helper for Workers
 * Initializes Epic Games authentication and provides token management
 */

const path = require('path');
const { initAuth, getValidToken } = require('../../EpicGames/auth/auth');

let cachedToken = null;
let lastTokenRefresh = 0;
const TOKEN_CACHE_MS = 60 * 1000; // Cache token for 1 minute

/**
 * Initialize authentication system
 * Call this once when worker starts
 */
function initializeAuth() {
 console.log('🔐 Initializing Epic Games authentication...');

 const success = initAuth();

 if (!success) {
 console.error('\n❌ Authentication not configured!');
 console.error('\n To authenticate:');
 console.error('1. Visit: https://www.epicgames.com/id/api/redirect?clientId=ec684b8c687f479fadea3cb2ad83f5c6&responseType=code');
 console.error('2. Login and copy the "code" from redirect URL');
 console.error('3. Run: cd /root/Project-Root/EpicGames && node auth/authenticate.js <code>');
 throw new Error('Authentication required');
 }

 console.log(' Authentication initialized\n');
 return true;
}

/**
 * Get valid access token (with caching to avoid frequent file reads)
 */
async function getAccessToken() {
 const now = Date.now();

 // Return cached token if still fresh
 if (cachedToken && (now - lastTokenRefresh < TOKEN_CACHE_MS)) {
 return cachedToken;
 }

 // Get fresh token
 const tokenData = await getValidToken();

 cachedToken = tokenData.access_token;
 lastTokenRefresh = now;

 return cachedToken;
}

/**
 * Get account ID
 */
async function getAccountId() {
 const tokenData = await getValidToken();
 return tokenData.account_id;
}

module.exports = {
 initializeAuth,
 getAccessToken,
 getAccountId
};
