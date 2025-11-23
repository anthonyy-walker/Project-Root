const httpClient = require('../http/httpClient');
const Logger = require('../utils/Logger');
const { ENDPOINTS, buildUrlWithParams } = require('../config/endpoints');

const logger = Logger.create('fetchDiscoveryPanelPages');

// Load environment variables from root
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const MATCHMAKING_REGIONS = process.env.MATCHMAKING_REGIONS ? 
  process.env.MATCHMAKING_REGIONS.split(',').map(region => region.trim()) : 
  ["NAE", "NAW", "NAC", "EU", "ME", "OCE", "BR", "ASIA"];

/**
 * Fetches all pages for a given panel across multiple matchmaking regions.
 * @param {string} surfaceName - The surface name to query.
 * @param {string} panelName - The panel name to query.
 * @param {string} testVariantName - The variant name from the main discovery response.
 * @param {string} accessToken - Fortnite API access token.
 * @param {string} playerId - Your Epic Games account ID.
 * @returns {Promise<object[]>} Aggregated data from all regions, including region info.
 */
async function fetchDiscoveryPanelPages(
  surfaceName,
  panelName,
  testVariantName,
  accessToken,
  playerId
) {
  const branch = encodeURIComponent(process.env.FORTNITE_BRANCH);
  const baseUrl = `${ENDPOINTS.DISCOVERY_SURFACE}/${surfaceName}/page`;
  const url = buildUrlWithParams(baseUrl, { 
    appId: 'Fortnite', 
    stream: branch 
  });

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "X-Epic-Access-Token": `${process.env.EPIC_X_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };

  let allRegionResults = [];

  logger.info(`Fetching panel "${panelName}" for surface "${surfaceName}" across ${MATCHMAKING_REGIONS.length} regions`);

  for (const region of MATCHMAKING_REGIONS) {
    logger.info(`Processing region: ${region}`);
    let regionResults = [];
    let hasMore = true;
    let pageIndex = 0;

    try {
      while (hasMore) {
        const body = {
          testVariantName,
          panelName,
          pageIndex,
          playerId,
          partyMemberIds: [playerId],
          matchmakingRegion: region, // Use the current region
          platform: "Windows",
          isCabined: false,
          ratingAuthority: "ESRB",
          rating: "ESRB_T",
          numLocalPlayers: 1,
        };

        const response = await httpClient.post(url, body, { headers });

        if (response.data && response.data.results) {
          // Append region info to each result
          const pageResults = response.data.results.map((result) => ({
            ...result,
            _fetchedRegion: region // Add region info
          }));
          regionResults = regionResults.concat(pageResults);
          hasMore = response.data.hasMore || false;
          pageIndex += 1;
        } else {
          logger.warn(`No results found for panel "${panelName}" in region ${region} on page ${pageIndex}`);
          hasMore = false;
        }
      }
      logger.info(`Fetched ${regionResults.length} results for region ${region}`);
      allRegionResults = allRegionResults.concat(regionResults);

    } catch (error) {
      // Check if it's the specific error we want to ignore
      const errorCode = error.response?.data?.errorCode;
      const specificErrorCode = "errors.com.epicgames.discovery.invalid_discovery_surface";

      if (errorCode === specificErrorCode) {
        logger.warn(`Ignoring expected error for panel "${panelName}" in region ${region}: ${errorCode} - ${error.response?.data?.errorMessage || error.message}`);
        // Continue to the next region without adding results
      } else {
        // Handle other unexpected errors for this region
        logger.error(`Error fetching panel pages for "${panelName}" in region ${region}:`, error.response?.data || error.message);
        // Log and continue to the next region
      }
    }
  }
  
  logger.info(`Total results fetched across all regions (pre-deduplication): ${allRegionResults.length}`);

  // Return the raw results including duplicates across regions, but with region info attached
  return allRegionResults;
}

module.exports = { fetchDiscoveryPanelPages };
