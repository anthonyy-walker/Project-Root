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
  
  try {
    log.info(`Fetching mnemonic info for: ${mnemonic}`);
    
    // Start with "valkyrie:application" as the default type
    const response = await fetchWithType(baseUrl, token, "valkyrie:application");
    if (response && response.mnemonic) {
      log.info(`Successfully found map for mnemonic: ${mnemonic}`);
    }
    return response;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      const { errorMessage } = error.response.data;
      if (errorMessage.includes("Creative:Island")) {
        log.info(`Retrying ${mnemonic} with type "Creative:Island"`);
        return fetchWithType(baseUrl, token, "Creative:Island");
      } else {
        log.info(`Retrying ${mnemonic} with type "ModeSet"`);
        return fetchWithType(baseUrl, token, "ModeSet");
      }
    }
    log.error(`Failed to fetch mnemonic info for ${mnemonic}`, error);
    return null;
  }
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
