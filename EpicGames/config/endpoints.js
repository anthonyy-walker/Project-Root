/**
 * Epic Games API Endpoints Configuration
 * Centralized endpoint definitions for easy modification
 */

const ENDPOINTS = {
  // Authentication endpoints
  OAUTH_TOKEN: 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
  
  // Discovery Service endpoints
  DISCOVERY_SURFACE: 'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/v2/discovery/surface',
  DISCOVERY_PANEL_PAGES: 'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/v2/discovery/panel/pages',
  
  // Creator endpoints
  CREATOR_PAGE: 'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/v1/creator/page',
  
  // Mnemonic (map code) endpoints
  MNEMONIC_INFO: 'https://links-public-service-live.ol.epicgames.com/links/api',
  
  // POPS (Player Overview Page Service) endpoints
  POPS: 'https://pops-api-live-public.ogs.live.on.epicgames.com/page'
};

/**
 * Build URL with path parameters
 * @param {string} endpoint - Base endpoint URL
 * @param {string} path - Path to append
 * @returns {string} Complete URL
 */
function buildUrl(endpoint, path = '') {
  return path ? `${endpoint}/${path}` : endpoint;
}

/**
 * Build URL with query parameters
 * @param {string} url - Base URL
 * @param {object} params - Query parameters object
 * @returns {string} URL with query parameters
 */
function buildUrlWithParams(url, params = {}) {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      searchParams.append(key, value);
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

module.exports = {
  ENDPOINTS,
  buildUrl,
  buildUrlWithParams
};
