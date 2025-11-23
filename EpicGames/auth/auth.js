/**
 * Epic Games Authentication Manager
 * Handles token exchange, refresh, and automatic renewal
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '../../data/tokenData.json');
const EPIC_AUTH_BASE = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth';
const EPIC_CLIENT_CREDENTIALS = 'basic ZWM2ODRiOGM2ODdmNDc5ZmFkZWEzY2IyYWQ4M2Y1YzY6ZTFmMzFjMjExZjI4NDEzMTg2MjYyZDM3YTEzZmM4NGQ=';

// Refresh token 5 minutes before expiration
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

let refreshTimeout = null;

/**
 * Load tokens from file
 */
function loadTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return null;
    }
    const data = fs.readFileSync(TOKEN_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading tokens:', error.message);
    return null;
  }
}

/**
 * Save tokens to file
 */
function saveTokens(tokenData) {
  try {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Add expiration timestamps if not present
    const now = new Date();
    if (!tokenData.expires_at && tokenData.expires_in) {
      tokenData.expires_at = new Date(now.getTime() + (tokenData.expires_in * 1000)).toISOString();
    }
    if (!tokenData.refresh_expires_at && tokenData.refresh_expires_in) {
      tokenData.refresh_expires_at = new Date(now.getTime() + (tokenData.refresh_expires_in * 1000)).toISOString();
    }
    
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('❌ Error saving tokens:', error.message);
    return false;
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCode(exchangeCode) {
  console.log('🔐 Exchanging authorization code for tokens...');
  
  try {
    const response = await axios.post(
      `${EPIC_AUTH_BASE}/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: exchangeCode
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': EPIC_CLIENT_CREDENTIALS
        }
      }
    );

    const tokenData = response.data;
    saveTokens(tokenData);
    
    console.log('✅ Token exchange successful!');
    console.log(`👤 Account: ${tokenData.displayName} (${tokenData.account_id})`);
    console.log(`⏰ Expires: ${tokenData.expires_at}`);
    
    // Schedule automatic refresh
    scheduleTokenRefresh(tokenData);
    
    return tokenData;
    
  } catch (error) {
    console.error('❌ Token exchange failed:', error.response?.data || error.message);
    throw new Error('Failed to exchange authorization code');
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken = null) {
  console.log('🔄 Refreshing access token...');
  
  try {
    // Load refresh token from file if not provided
    if (!refreshToken) {
      const tokenData = loadTokens();
      if (!tokenData || !tokenData.refresh_token) {
        throw new Error('No refresh token available');
      }
      refreshToken = tokenData.refresh_token;
    }
    
    const response = await axios.post(
      `${EPIC_AUTH_BASE}/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': EPIC_CLIENT_CREDENTIALS
        }
      }
    );

    const tokenData = response.data;
    saveTokens(tokenData);
    
    console.log('✅ Token refresh successful!');
    console.log(`⏰ New expiration: ${tokenData.expires_at}`);
    
    // Schedule next refresh
    scheduleTokenRefresh(tokenData);
    
    return tokenData;
    
  } catch (error) {
    console.error('❌ Token refresh failed:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
}

/**
 * Check if token is valid and not expiring soon
 */
function isTokenValid(tokenData = null) {
  if (!tokenData) {
    tokenData = loadTokens();
  }
  
  if (!tokenData || !tokenData.access_token) {
    return false;
  }
  
  if (tokenData.expires_at) {
    const expiresAt = new Date(tokenData.expires_at);
    const now = new Date();
    
    // Token is valid if it expires more than the buffer time from now
    return expiresAt.getTime() - now.getTime() > REFRESH_BUFFER_MS;
  }
  
  return true;
}

/**
 * Get valid access token (refreshes if needed)
 */
async function getValidToken() {
  const tokenData = loadTokens();
  
  if (!tokenData) {
    throw new Error('No tokens found. Please authenticate first using exchangeCode()');
  }
  
  if (isTokenValid(tokenData)) {
    return tokenData;
  }
  
  // Token expired or expiring soon, refresh it
  console.log('⚠️ Token expired or expiring soon, refreshing...');
  return await refreshAccessToken(tokenData.refresh_token);
}

/**
 * Schedule automatic token refresh before expiration
 */
function scheduleTokenRefresh(tokenData) {
  // Clear existing timeout
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }
  
  if (!tokenData.expires_at) {
    return;
  }
  
  const expiresAt = new Date(tokenData.expires_at);
  const now = new Date();
  const timeUntilExpiry = expiresAt.getTime() - now.getTime();
  
  // Schedule refresh 5 minutes before expiration
  const refreshIn = timeUntilExpiry - REFRESH_BUFFER_MS;
  
  if (refreshIn > 0) {
    const refreshDate = new Date(now.getTime() + refreshIn);
    console.log(`⏰ Token refresh scheduled for: ${refreshDate.toISOString()}`);
    
    refreshTimeout = setTimeout(async () => {
      try {
        await refreshAccessToken();
      } catch (error) {
        console.error('❌ Scheduled token refresh failed:', error.message);
      }
    }, refreshIn);
  } else {
    console.log('⚠️ Token already expired or expiring soon');
  }
}

/**
 * Initialize authentication system
 * Call this when your app starts to schedule token refresh
 */
function initAuth() {
  const tokenData = loadTokens();
  
  if (tokenData && isTokenValid(tokenData)) {
    console.log('✅ Existing valid token found');
    console.log(`👤 Account: ${tokenData.displayName} (${tokenData.account_id})`);
    scheduleTokenRefresh(tokenData);
    return true;
  }
  
  console.log('⚠️ No valid token found. Please authenticate first.');
  return false;
}

/**
 * Stop automatic token refresh
 */
function stopAuth() {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
    console.log('⏹️ Token refresh stopped');
  }
}

module.exports = {
  // Core functions
  exchangeCode,
  refreshAccessToken,
  getValidToken,
  
  // Token management
  loadTokens,
  saveTokens,
  isTokenValid,
  
  // Lifecycle
  initAuth,
  stopAuth,
  
  // Deprecated (kept for backwards compatibility)
  getTokenInfo: loadTokens
};
