/**
 * Links Service API - Bulk Mnemonic Info
 * Fetches metadata for multiple maps in a single request
 * 
 * Rate limit: 10 requests per minute (6 seconds between requests)
 */

const axios = require('axios');
const path = require('path');

// Only load .env if running standalone (not via PM2)
if (!process.env.FORTNITE_BRANCH) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const LINKS_API_BASE = 'https://links-public-service-live.ol.epicgames.com/links/api';
const RATE_LIMIT_DELAY = 6000; // 6 seconds between requests (10 per minute)

// Track last request time for rate limiting
let lastRequestTime = 0;

/**
 * Get bulk mnemonic info (up to 100 mnemonics per request)
 * @param {Array<string>} mnemonics - Array of map codes (e.g., ['1111-1111-1111', '2222-2222-2222'])
 * @param {string} accessToken - Epic Games access token
 * @param {Object} options - Optional parameters
 * @param {boolean} options.ignoreFailures - Don't throw error if some lookups fail (default: true)
 * @returns {Promise<Array>} Array of mnemonic info objects
 */
async function getBulkMnemonicInfo(mnemonics, accessToken, options = {}) {
  const { ignoreFailures = true } = options;
  
  if (!Array.isArray(mnemonics) || mnemonics.length === 0) {
    throw new Error('mnemonics must be a non-empty array');
  }
  
  if (mnemonics.length > 100) {
    throw new Error('Maximum 100 mnemonics per request');
  }
  
  // Build request body - try without type first (let API auto-detect)
  const body = mnemonics.map(mnemonic => ({
    mnemonic: mnemonic,
    linkType: '', // Empty to search all types
    filter: false,
    v: '' // Latest version
  }));
  
  try {
    // Rate limiting: enforce 6 second delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY && lastRequestTime > 0) {
      const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    console.log(`\n📦 Requesting bulk info for ${mnemonics.length} mnemonics...`);
    console.log(`   First 3: ${mnemonics.slice(0, 3).join(', ')}`);
    
    const response = await axios.post(
      `${LINKS_API_BASE}/fn/mnemonic?ignoreFailures=${ignoreFailures}`,
      body,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    const validMaps = response.data?.length || 0;
    const notFound = mnemonics.length - validMaps;
    
    console.log(`✅ Response: ${validMaps} FOUND (200), ${notFound} NOT FOUND (404)`);
    if (validMaps > 0) {
      const mnemonicsFound = response.data.map(m => m.mnemonic).join(', ');
      console.log(`   Found: ${mnemonicsFound}`);
    }
    
    // Update last request time
    lastRequestTime = Date.now();
    
    return response.data;
    
  } catch (error) {
    if (error.response) {
      console.error('API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    console.error('Error fetching bulk mnemonic info:', error.message);
    throw error;
  }
}

/**
 * Process large batches of mnemonics in chunks of 100
 * @param {Array<string>} mnemonics - Array of all map codes
 * @param {string} accessToken - Epic Games access token
 * @param {Function} onProgress - Progress callback (currentBatch, totalBatches, results)
 * @returns {Promise<Array>} All results combined
 */
async function getBulkMnemonicInfoBatched(mnemonics, accessToken, onProgress = null) {
  const BATCH_SIZE = 100;
  const batches = [];
  
  // Split into batches of 100
  for (let i = 0; i < mnemonics.length; i += BATCH_SIZE) {
    batches.push(mnemonics.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Processing ${mnemonics.length} mnemonics in ${batches.length} batches...`);
  
  const allResults = [];
  
  for (let i = 0; i < batches.length; i++) {
    try {
      const results = await getBulkMnemonicInfo(batches[i], accessToken);
      allResults.push(...results);
      
      if (onProgress) {
        onProgress(i + 1, batches.length, results);
      }
      
      console.log(`Batch ${i + 1}/${batches.length} complete (${results.length} results)`);
      
      // Note: Rate limiting is now enforced in getBulkMnemonicInfo() itself
      // No additional delay needed here
      
    } catch (error) {
      console.error(`Batch ${i + 1} failed:`, error.message);
      // Continue with next batch even if one fails
    }
  }
  
  return allResults;
}

module.exports = {
  getBulkMnemonicInfo,
  getBulkMnemonicInfoBatched
};
