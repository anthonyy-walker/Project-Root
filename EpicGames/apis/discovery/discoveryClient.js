/**
 * Complete Discovery API Client
 * Fetches all discovery panels and their contents across all regions
 */

const httpClient = require('../../http/httpClient');
const Logger = require('../../utils/Logger');
const { ENDPOINTS, buildUrlWithParams } = require('../../config/endpoints');

const logger = Logger.create('discoveryClient');

// Load environment variables from root
const path = require('path');

// Only load .env if running standalone (not via PM2)
if (!process.env.EPIC_ACCESS_TOKEN) {
  require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
}

const MATCHMAKING_REGIONS = process.env.MATCHMAKING_REGIONS ? 
  process.env.MATCHMAKING_REGIONS.split(',').map(region => region.trim()) : 
  ["NAE", "NAW", "NAC", "EU", "ME", "OCE", "BR", "ASIA"];

// All available discovery surfaces - loaded from environment
const ALL_SURFACES = process.env.ALL_SURFACES ? 
  process.env.ALL_SURFACES.split(',').map(surface => surface.trim()) : 
  [
    'CreativeDiscoverySurface_Nested_Collab_TWD',
    'CreativeDiscoverySurface_Nested_Collab_TMNT',
    'CreativeDiscoverySurface_Nested_Collab_LEGO',
    'CreativeDiscoverySurface_Nested_Collab_FallGuys',
    'CreativeDiscoverySurface_Nested_Collab_RocketRacing',
    'CreativeDiscoverySurface_Nested_Category_BR',
    'CreativeDiscoverySurface_Nested_Category_Combat',
    'CreativeDiscoverySurface_Nested_Category_Survival',
    'CreativeDiscoverySurface_Nested_Category_Platformer',
    'CreativeDiscoverySurface_Nested_Category_RhythmParty',
    'CreativeDiscoverySurface_Frontend',
    'CreativeDiscoverySurface_Browse',
    'CreativeDiscoverySurface_DelMar_TrackAndExperience',
    'CreativeDiscoverySurface_EpicPage',
    'CreativeDiscoverySurface_CreatorPage',
    'CreativeDiscoverySurface_Library'
  ];

class DiscoveryClient {
  constructor(accessToken, accountId) {
    this.accessToken = accessToken;
    this.accountId = accountId;
    this.branch = encodeURIComponent(process.env.FORTNITE_BRANCH);
  }

  /**
   * Fetches all panels for a given discovery surface
   */
  async fetchDiscoveryPanels(surfaceName) {
    try {
      const baseUrl = `${ENDPOINTS.DISCOVERY_SURFACE}/${surfaceName}`;
      const url = buildUrlWithParams(baseUrl, { 
        appId: 'Fortnite', 
        stream: this.branch 
      });

      const headers = {
        Authorization: `Bearer ${this.accessToken}`,
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
          panelType: panel.panelType || "unknown",
          panelSubtitle: panel.panelSubtitle || ""
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

  /**
   * Fetches panel pages for a specific panel across all regions (PARALLEL)
   */
  async fetchPanelPages(surfaceName, panelName, testVariantName, maxPages = 50) {
    const baseUrl = `${ENDPOINTS.DISCOVERY_SURFACE}/${surfaceName}/page`;
    const url = buildUrlWithParams(baseUrl, { 
      appId: 'Fortnite', 
      stream: this.branch 
    });

    const headers = {
      "Authorization": `Bearer ${this.accessToken}`,
      "X-Epic-Access-Token": `${process.env.EPIC_X_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };

    logger.info(`Fetching panel "${panelName}" for surface "${surfaceName}" across ${MATCHMAKING_REGIONS.length} regions (PARALLEL, max ${maxPages} pages each)`);

    // Process all regions in parallel
    const regionPromises = MATCHMAKING_REGIONS.map(async (region) => {
      try {
        let regionResults = [];
        let pageIndex = 0;
        let hasMore = true;

        // Fetch pages sequentially for this region (to respect hasMore)
        while (hasMore && pageIndex < maxPages) {
          const requestBody = {
            testVariantName: testVariantName,
            surfaceName: surfaceName,
            panelName: panelName,
            region: region,
            page: pageIndex,
            resultsPerPage: 50,
            playerId: this.accountId
          };

          try {
            const response = await httpClient.post(url, requestBody, { headers });

            if (response.data && response.data.results && response.data.results.length > 0) {
              // Add region info to each result
              const resultsWithRegion = response.data.results.map(item => ({
                ...item,
                region: region,
                page: pageIndex
              }));

              regionResults = regionResults.concat(resultsWithRegion);
              hasMore = response.data.hasMore || false;
              pageIndex += 1;

              // Reduced logging for speed
              if (pageIndex % 5 === 0 || !hasMore) {
                logger.info(`Region ${region}: ${regionResults.length} items (page ${pageIndex})`);
              }
            } else {
              hasMore = false;
            }
          } catch (pageError) {
            logger.warn(`Failed page ${pageIndex} for region ${region}: ${pageError.message}`);
            hasMore = false;
          }
        }

        return { region, results: regionResults, count: regionResults.length };

      } catch (error) {
        const errorCode = error.response?.data?.errorCode;
        const specificErrorCode = "errors.com.epicgames.discovery.invalid_discovery_surface";

        if (errorCode === specificErrorCode) {
          logger.info(`Skipping region ${region} for panel "${panelName}" - invalid surface`);
        } else {
          logger.error(`Error fetching panel pages for "${panelName}" in region ${region}: ${error.message}`);
        }
        return { region, results: [], count: 0 };
      }
    });

    // Wait for all regions to complete
    const regionResults = await Promise.all(regionPromises);
    let allResults = [];
    
    regionResults.forEach(({ region, results, count }) => {
      allResults = allResults.concat(results);
      if (count > 0) {
        logger.info(`Region ${region}: ${count} results`);
      }
    });

    // Remove duplicates based on linkCode
    const uniqueResults = [];
    const seenLinkCodes = new Set();

    allResults.forEach(item => {
      const linkCode = item.linkCode || item.mnemonic;
      if (linkCode && !seenLinkCodes.has(linkCode)) {
        seenLinkCodes.add(linkCode);
        uniqueResults.push(item);
      }
    });

    logger.info(`Total results fetched across all regions (pre-deduplication): ${allResults.length}`);
    logger.info(`Unique results after deduplication: ${uniqueResults.length}`);

    return uniqueResults;
  }

  /**
   * Fetches complete discovery data for a surface - panels and all their contents (PARALLEL)
   */
  async fetchCompleteDiscovery(surfaceName, maxPanels = null, maxPages = 50) {
    logger.info(`Fetching complete discovery data for surface: ${surfaceName}`);
    
    try {
      // Step 1: Get all panels
      const panels = await this.fetchDiscoveryPanels(surfaceName);
      
      if (!panels || panels.length === 0) {
        logger.warn(`No panels found for surface: ${surfaceName}`);
        return {
          surface: surfaceName,
          panels: [],
          totalPanels: 0,
          totalItems: 0
        };
      }

      // Limit panels if specified
      const panelsToProcess = maxPanels ? panels.slice(0, maxPanels) : panels;
      logger.info(`Processing ${panelsToProcess.length} panels (of ${panels.length} total) in PARALLEL`);

      // Step 2: Get contents for all panels in parallel
      const panelPromises = panelsToProcess.map(async (panel, index) => {
        try {
          const panelContent = await this.fetchPanelPages(surfaceName, panel.panelName, panel.testVariantName, maxPages);
          
          logger.info(`Panel "${panel.panelDisplayName}" completed: ${panelContent.length} items`);
          
          return {
            ...panel,
            items: panelContent,
            itemCount: panelContent.length
          };

        } catch (error) {
          logger.warn(`Failed to fetch content for panel "${panel.panelDisplayName}": ${error.message}`);
          return {
            ...panel,
            items: [],
            itemCount: 0,
            error: error.message
          };
        }
      });

      // Wait for all panels to complete
      const panelsWithContent = await Promise.all(panelPromises);
      const totalItems = panelsWithContent.reduce((sum, panel) => sum + panel.itemCount, 0);

      const result = {
        surface: surfaceName,
        panels: panelsWithContent,
        totalPanels: panelsWithContent.length,
        totalItems: totalItems,
        fetchedAt: new Date().toISOString()
      };

      logger.info(`Complete discovery fetch finished: ${result.totalPanels} panels, ${result.totalItems} total items`);
      return result;

    } catch (error) {
      logger.error(`Failed to fetch complete discovery for surface ${surfaceName}:`, error);
      throw error;
    }
  }

  /**
   * Fetches discovery data for multiple surfaces (FULL PARALLEL - ULTRA FAST)
   */
  async fetchMultipleSurfaces(surfaceNames, maxPanels = null, maxPages = 50) {
    logger.info(`Fetching discovery data for ${surfaceNames.length} surfaces in FULL PARALLEL MODE`);
    const startTime = Date.now();
    
    // Process ALL surfaces in parallel
    const surfacePromises = surfaceNames.map(async (surfaceName, index) => {
      try {
        logger.info(`Starting surface: ${surfaceName}`);
        const surfaceData = await this.fetchCompleteDiscovery(surfaceName, maxPanels, maxPages);
        logger.info(`✅ Completed surface: ${surfaceName} (${surfaceData.totalItems} items)`);
        return surfaceData;
      } catch (error) {
        logger.error(`❌ Failed surface ${surfaceName}:`, error.message);
        return {
          surface: surfaceName,
          panels: [],
          totalPanels: 0,
          totalItems: 0,
          error: error.message
        };
      }
    });

    // Wait for ALL surfaces to complete
    const results = await Promise.all(surfacePromises);
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    const summary = {
      surfaces: results,
      totalSurfaces: results.length,
      totalPanels: results.reduce((sum, surface) => sum + surface.totalPanels, 0),
      totalItems: results.reduce((sum, surface) => sum + surface.totalItems, 0),
      fetchedAt: new Date().toISOString(),
      duration: `${duration.toFixed(2)} seconds`
    };

    logger.info(`🚀 ULTRA FAST FETCH COMPLETE: ${summary.totalSurfaces} surfaces, ${summary.totalPanels} panels, ${summary.totalItems} items in ${summary.duration}`);
    
    return summary;
  }

  /**
   * Fetches EVERYTHING - all surfaces, all panels, all content (ULTRA FAST)
   * No parameters needed - just call and get everything!
   */
  async fetchEverything(maxPages = 50) {
    logger.info(`🚀 FETCHING EVERYTHING - ${ALL_SURFACES.length} surfaces with ULTRA PARALLEL processing`);
    const startTime = Date.now();
    
    // Use the built-in surface list and fetch everything
    const results = await this.fetchMultipleSurfaces(ALL_SURFACES, null, maxPages);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    logger.info(`🎉 EVERYTHING FETCHED! ${results.totalSurfaces} surfaces, ${results.totalPanels} panels, ${results.totalItems} items in ${duration.toFixed(2)} seconds`);
    
    return {
      ...results,
      method: 'fetchEverything',
      surfaceCount: ALL_SURFACES.length,
      availableSurfaces: ALL_SURFACES
    };
  }

  /**
   * Get the list of all available surfaces
   */
  getAllSurfaces() {
    return [...ALL_SURFACES];
  }

  /**
   * Get surface count
   */
  getSurfaceCount() {
    return ALL_SURFACES.length;
  }
}

module.exports = DiscoveryClient;