const httpClient = require('../http/httpClient');
const { ENDPOINTS, buildUrl, buildUrlWithParams } = require('../config/endpoints');
const Logger = require('../utils/Logger');
const path = require('path');

// Only load .env if running standalone (not via PM2)
if (!process.env.EPIC_ACCESS_TOKEN) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const logger = Logger.create('creatorPageAPI.js');

/**
 * Fetches maps published by the creator using the direct creator page API.
 * @param {string} creatorAccountId - The creator's account ID.
 * @param {string} accessToken - Fortnite API access token.
 * @param {string} playerId - Your Epic Games account ID.
 * @param {number} limit - Maximum number of results to return (default: 100).
 * @param {string} olderThan - For pagination, when there are more links than the specified page size.
 * @returns {Promise<Object>} - Response object with creatorId, links array, and hasMore flag.
 */
async function getCreatorMaps(creatorAccountId, accessToken = null, playerId = null, limit = 100, olderThan = null) {
  const log = logger.fn('getCreatorMaps');

  // Use environment variables if not provided
  const token = accessToken || process.env.EPIC_ACCESS_TOKEN;
  const accountId = playerId || process.env.EPIC_ACCOUNT_ID;

  if (!token || !accountId) {
    const error = new Error('Access token and account ID are required');
    log.error('Missing required authentication credentials', error);
    throw error;
  }

  try {
    // log.info(`Fetching maps for creator: ${creatorAccountId}`);

    // Build URL with query parameters
    const baseUrl = buildUrl(ENDPOINTS.CREATOR_PAGE, creatorAccountId);
    const queryParams = {
      playerId: accountId,
      limit,
      ...(olderThan && { olderThan })
    };
    const url = buildUrlWithParams(baseUrl, queryParams);

    const headers = httpClient.createHeaders(token);
    const response = await httpClient.get(url, { headers });

    const responseData = response.data || {};
    
    if (responseData.links && Array.isArray(responseData.links)) {
      // log.info(`Found ${responseData.links.length} maps for creator ${creatorAccountId}`);
      
      // Check if there are more results that need to be paginated
      if (responseData.hasMore === true) {
        // log.info(`More maps available for creator ${creatorAccountId}. Use olderThan for pagination.`);
      }
    } else {
      // log.info(`No links found in response for creator ${creatorAccountId}`);
    }
    
    return responseData;
  } catch (error) {
    log.error(`Failed to fetch maps for creator ${creatorAccountId}`, error);
    throw error;
  }
}

module.exports = { getCreatorMaps };
