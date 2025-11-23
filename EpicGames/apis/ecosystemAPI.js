/**
 * Fortnite Ecosystem API Client
 * Official Epic Games API for island metrics and historical data
 * 
 * Documentation: https://api.fortnite.com/ecosystem/v1/docs/openapi.yaml
 * 
 * Key Features:
 * - 7 days of historical data
 * - Minutes played, unique players, plays, favorites, recommendations
 * - Peak CCU with historical tracking
 * - Retention metrics (D1, D7)
 * - Average session length
 * 
 * Rate Limits: Unknown (use standard retry logic)
 * Authentication: OAuth 2.0 Client Credentials
 */

const httpClient = require('../http/httpClient');
const Logger = require('../utils/Logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const logger = Logger.create('ecosystemAPI');

const BASE_URL = 'https://api.fortnite.com/ecosystem/v1';

/**
 * Get all available metrics for an island in a single request
 * @param {string} mapCode - Island code (e.g., "8530-0110-2817")
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} from - ISO 8601 datetime (e.g., "2025-11-23T00:00:00.000Z")
 * @param {string} to - ISO 8601 datetime (e.g., "2025-11-23T23:59:59.999Z")
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} All metrics for the time period
 */
async function getIslandMetrics(mapCode, interval = 'day', from = null, to = null, accessToken = null) {
  const log = logger.fn('getIslandMetrics');
  
  const token = accessToken || process.env.EPIC_ACCESS_TOKEN;
  if (!token) {
    const error = new Error('Access token is required');
    log.error('Missing required authentication credentials', error);
    throw error;
  }

  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    
    const url = `${BASE_URL}/islands/${mapCode}/metrics/${interval}${params.toString() ? '?' + params.toString() : ''}`;
    
    log.info(`Fetching metrics for island: ${mapCode} (interval: ${interval})`);
    
    const headers = httpClient.createHeaders(token);
    const response = await httpClient.get(url, { headers });

    log.info(`Successfully fetched metrics for ${mapCode}`);
    return response.data;
  } catch (error) {
    log.error(`Failed to fetch metrics for ${mapCode}`, error);
    throw error;
  }
}

/**
 * Get specific metric for an island
 * @param {string} mapCode - Island code
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} metric - Metric name (e.g., 'peak-ccu', 'minutes-played', 'unique-players')
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Specific metric data
 */
async function getIslandMetric(mapCode, interval, metric, from = null, to = null, accessToken = null) {
  const log = logger.fn('getIslandMetric');
  
  const token = accessToken || process.env.EPIC_ACCESS_TOKEN;
  if (!token) {
    const error = new Error('Access token is required');
    log.error('Missing required authentication credentials', error);
    throw error;
  }

  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    
    const url = `${BASE_URL}/islands/${mapCode}/metrics/${interval}/${metric}${params.toString() ? '?' + params.toString() : ''}`;
    
    log.info(`Fetching ${metric} for island: ${mapCode} (interval: ${interval})`);
    
    const headers = httpClient.createHeaders(token);
    const response = await httpClient.get(url, { headers });

    log.info(`Successfully fetched ${metric} for ${mapCode}`);
    return response.data;
  } catch (error) {
    log.error(`Failed to fetch ${metric} for ${mapCode}`, error);
    throw error;
  }
}

/**
 * Get peak CCU for an island over time
 * @param {string} mapCode - Island code
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Peak CCU data
 */
async function getPeakCCU(mapCode, interval = 'day', from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, interval, 'peak-ccu', from, to, accessToken);
}

/**
 * Get total minutes played for an island
 * @param {string} mapCode - Island code
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Minutes played data
 */
async function getMinutesPlayed(mapCode, interval = 'day', from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, interval, 'minutes-played', from, to, accessToken);
}

/**
 * Get unique players for an island
 * @param {string} mapCode - Island code
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Unique players data
 */
async function getUniquePlayers(mapCode, interval = 'day', from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, interval, 'unique-players', from, to, accessToken);
}

/**
 * Get number of plays (sessions) for an island
 * @param {string} mapCode - Island code
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Plays data
 */
async function getPlays(mapCode, interval = 'day', from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, interval, 'plays', from, to, accessToken);
}

/**
 * Get favorites count for an island
 * @param {string} mapCode - Island code
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Favorites data
 */
async function getFavorites(mapCode, interval = 'day', from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, interval, 'favorites', from, to, accessToken);
}

/**
 * Get recommendations count for an island
 * @param {string} mapCode - Island code
 * @param {string} interval - 'day', 'hour', or 'minute'
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Recommendations data
 */
async function getRecommendations(mapCode, interval = 'day', from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, interval, 'recommendations', from, to, accessToken);
}

/**
 * Get average minutes per player for an island (day interval only)
 * @param {string} mapCode - Island code
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Average minutes per player data
 */
async function getAverageMinutesPerPlayer(mapCode, from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, 'day', 'average-minutes-per-player', from, to, accessToken);
}

/**
 * Get retention metrics for an island (day interval only)
 * @param {string} mapCode - Island code
 * @param {string} from - ISO 8601 datetime
 * @param {string} to - ISO 8601 datetime
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Retention data (D1 and D7)
 */
async function getRetention(mapCode, from = null, to = null, accessToken = null) {
  return getIslandMetric(mapCode, 'day', 'retention', from, to, accessToken);
}

/**
 * Get island metadata
 * @param {string} mapCode - Island code
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Island metadata
 */
async function getIslandMetadata(mapCode, accessToken = null) {
  const log = logger.fn('getIslandMetadata');
  
  const token = accessToken || process.env.EPIC_ACCESS_TOKEN;
  if (!token) {
    const error = new Error('Access token is required');
    log.error('Missing required authentication credentials', error);
    throw error;
  }

  try {
    const url = `${BASE_URL}/islands/${mapCode}`;
    
    log.info(`Fetching metadata for island: ${mapCode}`);
    
    const headers = httpClient.createHeaders(token);
    const response = await httpClient.get(url, { headers });

    log.info(`Successfully fetched metadata for ${mapCode}`);
    return response.data;
  } catch (error) {
    log.error(`Failed to fetch metadata for ${mapCode}`, error);
    throw error;
  }
}

/**
 * Get paginated list of all islands
 * @param {number} size - Number of results per page (1-1000, default 100)
 * @param {string} after - Cursor for next page
 * @param {string} before - Cursor for previous page
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} Paginated island list
 */
async function getAllIslands(size = 100, after = null, before = null, accessToken = null) {
  const log = logger.fn('getAllIslands');
  
  const token = accessToken || process.env.EPIC_ACCESS_TOKEN;
  if (!token) {
    const error = new Error('Access token is required');
    log.error('Missing required authentication credentials', error);
    throw error;
  }

  try {
    const params = new URLSearchParams();
    params.append('size', size.toString());
    if (after) params.append('after', after);
    if (before) params.append('before', before);
    
    const url = `${BASE_URL}/islands?${params.toString()}`;
    
    log.info(`Fetching islands list (size: ${size})`);
    
    const headers = httpClient.createHeaders(token);
    const response = await httpClient.get(url, { headers });

    log.info(`Successfully fetched ${response.data.data?.length || 0} islands`);
    return response.data;
  } catch (error) {
    log.error('Failed to fetch islands list', error);
    throw error;
  }
}

/**
 * Get last 7 days of metrics for an island (for daily backfill)
 * @param {string} mapCode - Island code
 * @param {string} accessToken - Epic Games access token
 * @returns {Promise<Object>} 7 days of all metrics
 */
async function getLast7DaysMetrics(mapCode, accessToken = null) {
  const log = logger.fn('getLast7DaysMetrics');
  
  // Use current moment as 'to', and 7 days before as 'from'
  // Subtract a few hours from 'now' to avoid "future timestamp" errors
  const now = new Date();
  now.setHours(now.getHours() - 1); // Go back 1 hour to be safe
  
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  
  const from = sevenDaysAgo.toISOString();
  const to = now.toISOString();
  
  log.info(`Fetching last 7 days of metrics for ${mapCode} (${from} to ${to})`);
  
  return getIslandMetrics(mapCode, 'day', from, to, accessToken);
}

module.exports = {
  getIslandMetrics,
  getIslandMetric,
  getPeakCCU,
  getMinutesPlayed,
  getUniquePlayers,
  getPlays,
  getFavorites,
  getRecommendations,
  getAverageMinutesPerPlayer,
  getRetention,
  getIslandMetadata,
  getAllIslands,
  getLast7DaysMetrics
};
