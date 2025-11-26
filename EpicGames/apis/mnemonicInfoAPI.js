const httpClient = require('../http/httpClient');
const { ENDPOINTS, buildUrl, buildUrlWithParams } = require('../config/endpoints');
const Logger = require('../utils/Logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const logger = Logger.create('mnemonicInfoAPI.js');

/**
 * Fetches mnemonic information for a specific map or playlist.
 * @param {string} mnemonic - The unique mnemonic (e.g., linkCode) for the map or playlist.
 * @param {string} accessToken - Fortnite API access token.
 * @param {string} namespace - The namespace (e.g., 'fn' for Fortnite).
 * @returns {Promise<object>} - The mnemonic info data.
 */
async function getMnemonicInfo(mnemonic, accessToken = null, namespace = "fn") {
  const log = logger.fn('getMnemonicInfo');
  
  const token = accessToken || process.env.EPIC_ACCESS_TOKEN;
  
  if (!token) {
    const error = new Error('Access token is required');
    log.error('Missing required authentication credentials', error);
    throw error;
  }

  // Build the base URL for this mnemonic
  const baseUrl = buildUrl(ENDPOINTS.MNEMONIC_INFO, `${namespace}/mnemonic/${mnemonic}`);
  
  // Try all three link types
  const linkTypes = ["valkyrie:application", "Creative:Island", "ModeSet"];
  const attemptedTypes = new Set();
  
  for (const linkType of linkTypes) {
    if (attemptedTypes.has(linkType)) {
      continue; // Skip if already tried
    }
    
    try {
      if (attemptedTypes.size === 0) {
        log.info(`Fetching mnemonic info for: ${mnemonic}`);
      } else {
        log.info(`Retrying ${mnemonic} with type "${linkType}"`);
      }
      
      attemptedTypes.add(linkType);
      const response = await fetchWithType(baseUrl, token, linkType);
      
      if (response && response.mnemonic) {
        log.info(`Successfully found map for mnemonic: ${mnemonic} with type "${linkType}"`);
        return response;
      }
    } catch (error) {
      // If it's a 400 error with wrong_link_type, extract the correct type and try it immediately
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        const errorMessage = errorData.errorMessage || '';
        
        // Check if error message indicates the correct type
        if (errorMessage.includes('wrong_link_type')) {
          // Extract the actual type from error message
          // Format: "Link: XXXX has type Creative:Island, but request specified valkyrie:application"
          const typeMatch = errorMessage.match(/has type ([^,]+),/);
          if (typeMatch && typeMatch[1]) {
            const correctType = typeMatch[1];
            
            // If we haven't tried this type yet, try it immediately
            if (!attemptedTypes.has(correctType)) {
              log.info(`Error indicates correct type is "${correctType}", trying it now`);
              try {
                attemptedTypes.add(correctType);
                const response = await fetchWithType(baseUrl, token, correctType);
                if (response && response.mnemonic) {
                  log.info(`Successfully found map for mnemonic: ${mnemonic} with type "${correctType}"`);
                  return response;
                }
              } catch (retryError) {
                // If this also fails, continue to next type in list
                if (retryError.response && retryError.response.status !== 400) {
                  // Non-400 error, give up
                  log.error(`Failed to fetch mnemonic info for ${mnemonic}`, retryError);
                  return null;
                }
              }
            }
          }
        }
        // Continue to next type in list
      } else {
        // Non-400 error (404, network error, etc) - give up
        log.error(`Failed to fetch mnemonic info for ${mnemonic}`, error);
        return null;
      }
    }
  }
  
  log.error(`Failed to fetch mnemonic info for ${mnemonic} - no valid type found after trying: ${Array.from(attemptedTypes).join(', ')}`);
  return null;
}

/**
 * Fetches data from the API with a specific type.
 * @param {string} url - The API endpoint URL.
 * @param {string} accessToken - Fortnite API access token.
 * @param {string} type - The type to query (e.g., "Creative:Island").
 * @returns {Promise<object>} - The API response data.
 */
async function fetchWithType(url, accessToken, type) {
  const fullUrl = buildUrlWithParams(url, { 
    type,
    includeActivationHistory: true
  });

  const response = await httpClient.get(fullUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return response.data;
}

/**
 * Logs detailed API errors for easier debugging.
 * @param {object} error - The error object from Axios.
 * @param {string} mnemonic - The mnemonic being queried.
 */
function handleError(error, mnemonic) {
  if (error.response) {
    const { status, statusText } = error.response;
    const errorMessage = error.response.data?.errorMessage || "Unknown error";

    if (status === 400) {
      console.error(
        `❌ Bad request for mnemonic: ${mnemonic}. Error: ${errorMessage}`
      );
    } else if (status === 404) {
      console.error(`❌ Mnemonic not found: ${mnemonic}.`);
    } else {
      console.error(`❌ API Error: ${status} - ${statusText}`);
    }
  } else {
    console.error(
      `❌ Network or unknown error for mnemonic ${mnemonic}:`,
      error.message
    );
  }
}

module.exports = { getMnemonicInfo };
