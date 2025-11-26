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
  
  // Extract image URLs
  const images = linksData.metadata?.image_urls || {};
  
  // Extract matchmaking info
  const matchmaking = linksData.metadata?.matchmakingV2 || linksData.metadata?.matchmaking || {};
  
  // Extract ratings (use ESRB as primary)
  const esrbRating = linksData.metadata?.ratings?.boards?.ESRB?.rating || 'UNRATED';
  
  // Build the transformed document
  const transformed = {
    // Primary identifier
    code: linksData.mnemonic,
    
    // Basic info (fn360 compatible fields)
    title: linksData.metadata?.title || 'Untitled',
    description: linksData.metadata?.introduction || '',
    tagline: linksData.metadata?.tagline || '',
    
    // Creator info
    creatorAccountId: linksData.accountId,
    creatorName: linksData.creatorName || 'Unknown',
    
    // Images (fn360 field names)
    image: images.url || images.image_url || '',
    imageMedium: images.url_m || '',
    imageSmall: images.url_s || '',
    
    // Epic metadata
    namespace: linksData.namespace,
    linkType: linksData.linkType,
    linkState: linksData.linkState || 'ACTIVE',
    linkCategory: linksData.linkCategory || '',
    
    // Status
    active: linksData.active !== false,
    disabled: linksData.disabled === true,
    moderationStatus: linksData.moderationStatus || 'Unknown',
    discoveryIntent: linksData.discoveryIntent || '',
    
    // Dates
    created: linksData.created || now,
    published: linksData.published || linksData.created || now,
    updated: linksData.updated || now,
    lastActivatedDate: linksData.lastActivatedDate || null,
    activatedPublicDate: linksData.metadata?.activated_public_date || null,
    
    // Version
    version: linksData.version || 1,
    
    // Tags and categories
    tags: linksData.descriptionTags || [],
    categoryLabels: linksData.metadata?.category_labels || [],
    genreLabels: linksData.metadata?.genre_labels || [],
    
    // Matchmaking
    minPlayers: matchmaking.minPlayers || 1,
    maxPlayers: matchmaking.maxPlayers || 16,
    maxTeamSize: matchmaking.maxTeamSize || null,
    maxTeamCount: matchmaking.maxTeamCount || null,
    allowJoinInProgress: matchmaking.allowJoinInProgress !== false,
    useSkillBasedMatchmaking: matchmaking.useSkillBasedMatchmaking === true,
    
    // Ratings
    contentRating: esrbRating,
    
    // Support & attribution
    supportCode: linksData.metadata?.supportCode || null,
    attributions: linksData.metadata?.attributions || '',
    
    // Mode
    mode: linksData.metadata?.mode || 'live',
    
    // Localized content (store for multi-language support)
    localizedTitles: linksData.metadata?.alt_title || {},
    localizedDescriptions: linksData.metadata?.alt_introduction || {},
    localizedTaglines: linksData.metadata?.alt_tagline || {},
    
    // Store full metadata for future reference
    metadata: linksData.metadata || {},
    
    // Performance metrics (preserve existing if available, otherwise defaults)
    currentCCU: preservePerformance?.currentCCU || 0,
    peakCCU24h: preservePerformance?.peakCCU24h || 0,
    avgCCU24h: preservePerformance?.avgCCU24h || 0,
    avgCCU7d: preservePerformance?.avgCCU7d || 0,
    avgCCU30d: preservePerformance?.avgCCU30d || 0,
    
    // Discovery tracking (preserve existing if available)
    inDiscovery: preserveDiscovery?.inDiscovery || false,
    discoveryAppearances7d: preserveDiscovery?.discoveryAppearances7d || 0,
    bestDiscoveryPosition: preserveDiscovery?.bestDiscoveryPosition || null,
    discoveryFirstSeen: preserveDiscovery?.discoveryFirstSeen || null,
    discoveryLastSeen: preserveDiscovery?.discoveryLastSeen || null,
    
    // Timestamps
    firstIndexed: preservePerformance?.firstIndexed || now,
    lastUpdated: now,
    lastCalculated: preservePerformance?.lastCalculated || now,
    
    // Source tracking
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
