const httpClient = require('../../http/httpClient');
const Logger = require('../../utils/Logger');
const { ENDPOINTS, buildUrlWithParams } = require('../../config/endpoints');

const logger = Logger.create('fetchDiscoveryPanels');

// Load environment variables from root
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

/**
 * Fetches all panels for a given discovery surface.
 * @param {string} surfaceName - The surface name to query.
 * @returns {Promise<object[]>} List of panels with `testVariantName`, `panelName`, and `panelDisplayName`.
 */
async function fetchDiscoveryPanels(surfaceName) {
  try {
    const branch = encodeURIComponent(process.env.FORTNITE_BRANCH);
    const baseUrl = `${ENDPOINTS.DISCOVERY_SURFACE}/${surfaceName}`;
    const url = buildUrlWithParams(baseUrl, { 
      appId: 'Fortnite', 
      stream: branch 
    });

    const headers = {
      Authorization: `Bearer ${process.env.EPIC_ACCESS_TOKEN}`,
      "X-Epic-Access-Token": `${process.env.EPIC_X_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };

    logger.info(`Fetching discovery panels for surface: ${surfaceName}`);
    const response = await httpClient.post(url, {}, { headers });

    if (response.data && response.data.panels) {
      const result = response.data.panels.map((panel) => ({
        testVariantName: response.data.testVariantName,
        panelName: panel.panelName,
        panelDisplayName: panel.panelDisplayName || "N/A",
      }));

      logger.info(`Successfully fetched ${result.length} panels for surface: ${surfaceName}`);
      return result;
    }

    logger.warn(`No panels found for surface: ${surfaceName}`);
    return [];
  } catch (error) {
    logger.error(`Error fetching panels for surface ${surfaceName}:`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = { fetchDiscoveryPanels };
