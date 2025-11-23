/**
 * Get Fresh Access Token
 * Uses client credentials to get a new access token from Epic Games
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const CLIENT_ID = process.env.CLIENT_ID || 'ec684b8c687f479fadea3cb2ad83f5c6';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'e1f31c211f28413186262d37a13fc84d';

async function getAccessToken() {
  console.log('🔑 Requesting fresh access token from Epic Games...\n');
  
  try {
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post(
      'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    const tokenData = response.data;
    
    console.log('✅ Access Token Retrieved!\n');
    console.log('Token Details:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Access Token: ${tokenData.access_token}`);
    console.log(`Token Type: ${tokenData.token_type}`);
    console.log(`Expires In: ${tokenData.expires_in} seconds (${Math.floor(tokenData.expires_in / 3600)} hours)`);
    console.log(`Account ID: ${tokenData.account_id || 'Not provided'}`);
    console.log('─────────────────────────────────────────────────────');
    
    console.log('\n📝 Update your .env file with:');
    console.log(`EPIC_ACCESS_TOKEN=${tokenData.access_token}`);
    if (tokenData.account_id) {
      console.log(`EPIC_ACCOUNT_ID=${tokenData.account_id}`);
    }
    
    return tokenData;
    
  } catch (error) {
    console.error('❌ Error getting access token:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    throw error;
  }
}

// Run it
getAccessToken();
