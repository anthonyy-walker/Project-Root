/**
 * Transform Links Service response to fn360-compatible map format
 */

/**
 * Transform a single map from Links Service format to our Elasticsearch format
 * @param {Object} linksData - Raw response from Links Service API
 * @param {Object} options - Optional metadata (ingestionSource, existingPerformance, etc)
 * @returns {Object} Elasticsearch-ready map document
 */
function transformMapData(linksData, options = {}) {
  const {
    ingestionSource = 'links_service_bulk',
    preservePerformance = null,
    preserveDiscovery = null
  } = options;
  
  const now = new Date().toISOString();
  
  // Save the COMPLETE Epic response (no transformation)
  // This preserves all fields exactly as Epic sends them
  const transformed = {
    // Spread all top-level Epic fields
    ...linksData,
    
    // Override/add these for consistency
    code: linksData.mnemonic,
    
    // Add our custom fields (preserve if they exist from previous ingestion)
    currentCCU: preservePerformance?.currentCCU ?? 0,
    peakCCU24h: preservePerformance?.peakCCU24h ?? 0,
    avgCCU24h: preservePerformance?.avgCCU24h ?? 0,
    avgCCU7d: preservePerformance?.avgCCU7d ?? 0,
    avgCCU30d: preservePerformance?.avgCCU30d ?? 0,
    
    inDiscovery: preserveDiscovery?.inDiscovery ?? false,
    discoveryAppearances7d: preserveDiscovery?.discoveryAppearances7d ?? 0,
    bestDiscoveryPosition: preserveDiscovery?.bestDiscoveryPosition ?? null,
    discoveryFirstSeen: preserveDiscovery?.discoveryFirstSeen ?? null,
    discoveryLastSeen: preserveDiscovery?.discoveryLastSeen ?? null,
    
    firstIndexed: preservePerformance?.firstIndexed ?? now,
    lastUpdated: now,
    lastCalculated: preservePerformance?.lastCalculated ?? now,
    ingestionSource: ingestionSource
  };
  
  return transformed;
}

/**
 * Transform bulk Links Service response
 * @param {Array} linksDataArray - Array of Links Service responses
 * @param {Object} options - Optional metadata
 * @returns {Array} Array of Elasticsearch-ready documents
 */
function transformBulkMapData(linksDataArray, options = {}) {
  return linksDataArray
    .filter(item => item && !item.error) // Filter out errors
    .map(item => transformMapData(item, options));
}

/**
 * Convert to fn360 API format (for API responses)
 * @param {Object} esDocument - Elasticsearch document
 * @returns {Object} fn360-compatible response
 */
function toFn360Format(esDocument) {
  return {
    code: esDocument.code,
    title: esDocument.title,
    description: esDocument.description,
    tagline: esDocument.tagline,
    image: esDocument.image,
    imageMedium: esDocument.imageMedium,
    imageSmall: esDocument.imageSmall,
    creator: {
      id: esDocument.creatorAccountId,
      name: esDocument.creatorName
    },
    minPlayers: esDocument.minPlayers,
    maxPlayers: esDocument.maxPlayers,
    tags: esDocument.tags,
    genres: esDocument.genreLabels,
    categories: esDocument.categoryLabels,
    rating: esDocument.contentRating,
    active: esDocument.active,
    published: esDocument.published,
    updated: esDocument.updated,
    version: esDocument.version,
    // Performance (not in original fn360, but useful)
    stats: {
      currentCCU: esDocument.currentCCU,
      peakCCU24h: esDocument.peakCCU24h,
      avgCCU24h: esDocument.avgCCU24h
    },
    discovery: {
      inDiscovery: esDocument.inDiscovery,
      appearances7d: esDocument.discoveryAppearances7d,
      bestPosition: esDocument.bestDiscoveryPosition
    }
  };
}

module.exports = {
  transformMapData,
  transformBulkMapData,
  toFn360Format
};
