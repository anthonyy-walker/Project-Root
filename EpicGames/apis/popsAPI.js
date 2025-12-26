// Rate Limit - 30 per minute
const httpClient = require('../http/httpClient');
const { ENDPOINTS, buildUrl, buildUrlWithParams } = require('../config/endpoints');
const Logger = require('../utils/Logger');
const path = require('path');

// Only load .env if running standalone (not via PM2)
if (!process.env.EPIC_ACCESS_TOKEN) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const logger = Logger.create('popsAPI.js');

/**
 * Fetches creator data using the POPS API.
 * @param {string} creatorAccountId - The creator's account ID.
 * @param {string} accessToken - Fortnite API access token.
 * @param {string} accountId - Your Epic Games account ID.
 * @returns {Promise<Object>} - Creator data including bio, socials, and images.
 */
async function getCreatorDetails(creatorAccountId, accessToken = null, accountId = null) {
    const log = logger.fn('getCreatorDetails');
    
    // Use environment variables if not provided
    const token = accessToken || process.env.EPIC_ACCESS_TOKEN;
    const playerId = accountId || process.env.EPIC_ACCOUNT_ID;

    if (!token || !playerId) {
        const error = new Error('Access token and account ID are required');
        log.error('Missing required authentication credentials', error);
        throw error;
    }

    try {
        // log.info(`Fetching creator details for: ${creatorAccountId}`); // Silenced for cleaner logs

        const baseUrl = buildUrl(ENDPOINTS.POPS, `v1/${creatorAccountId}`);
        const url = buildUrlWithParams(baseUrl, { playerId });

        const headers = httpClient.createHeaders(token);
        const response = await httpClient.get(url, { headers });

        // log.info(`Retrieved creator details for ${creatorAccountId}`); // Silenced for cleaner logs
        return response.data;
    } catch (error) {
        log.error(`Failed to fetch creator details for ${creatorAccountId}`, error);
        throw error;
    }
}

module.exports = { getCreatorDetails };
