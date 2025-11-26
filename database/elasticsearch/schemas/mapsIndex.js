/**
 * Elasticsearch Index Mapping for Maps
 * Based on Epic Links Service response + fn360 API compatibility
 */

const MAPS_INDEX_MAPPING = {
  settings: {
    number_of_shards: 2,
    number_of_replicas: 1,
    "index.mapping.total_fields.limit": 2000, // Increase for all metadata fields
    analysis: {
      analyzer: {
        map_title_analyzer: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "asciifolding"]
        }
      }
    }
  },
  mappings: {
    properties: {
      // Primary identifier
      code: { type: "keyword" }, // Map code (mnemonic)
      
      // Basic info (fn360 compatible)
      title: {
        type: "text",
        analyzer: "map_title_analyzer",
        fields: {
          keyword: { type: "keyword" },
          raw: { type: "keyword" }
        }
      },
      description: { type: "text" },
      tagline: { type: "text" },
      
      // Creator info
      creatorAccountId: { type: "keyword" },
      creatorName: {
        type: "text",
        fields: { keyword: { type: "keyword" } }
      },
      
      // Images (fn360 uses these exact fields)
      image: { type: "keyword" },      // Full size
      imageMedium: { type: "keyword" }, // Medium size
      imageSmall: { type: "keyword" },  // Small size
      
      // Epic metadata
      namespace: { type: "keyword" },
      linkType: { type: "keyword" },
      linkState: { type: "keyword" },
      linkCategory: { type: "keyword" },
      
      // Status
      active: { type: "boolean" },
      disabled: { type: "boolean" },
      moderationStatus: { type: "keyword" },
      discoveryIntent: { type: "keyword" },
      
      // Dates
      created: { type: "date" },
      published: { type: "date" },
      updated: { type: "date" },
      lastActivatedDate: { type: "date" },
      activatedPublicDate: { type: "date" },
      
      // Version
      version: { type: "integer" },
      
      // Tags and categories (fn360 compatible)
      tags: { type: "keyword" },  // descriptionTags
      categoryLabels: { type: "keyword" },
      genreLabels: { type: "keyword" },
      
      // Matchmaking (fn360 provides this)
      minPlayers: { type: "integer" },
      maxPlayers: { type: "integer" },
      maxTeamSize: { type: "integer" },
      maxTeamCount: { type: "integer" },
      allowJoinInProgress: { type: "boolean" },
      useSkillBasedMatchmaking: { type: "boolean" },
      
      // Ratings
      contentRating: { type: "keyword" }, // ESRB rating
      
      // Support & attribution
      supportCode: { type: "keyword" },
      attributions: { type: "text" },
      
      // Mode
      mode: { type: "keyword" }, // live, ltm, etc
      
      // Localized content (stored as nested for multi-language)
      localizedTitles: {
        type: "object",
        enabled: false // Store but don't index
      },
      localizedDescriptions: {
        type: "object",
        enabled: false
      },
      localizedTaglines: {
        type: "object",
        enabled: false
      },
      
      // Full metadata object (for backward compatibility)
      metadata: {
        type: "object",
        enabled: false // Store raw but don't index deeply
      },
      
      // Performance metrics (updated by workers - NOT from Links API)
      currentCCU: { type: "integer" },
      peakCCU24h: { type: "integer" },
      avgCCU24h: { type: "float" },
      avgCCU7d: { type: "float" },
      avgCCU30d: { type: "float" },
      
      // Discovery tracking (updated by workers)
      inDiscovery: { type: "boolean" },
      discoveryAppearances7d: { type: "integer" },
      bestDiscoveryPosition: { type: "integer" },
      discoveryFirstSeen: { type: "date" },
      discoveryLastSeen: { type: "date" },
      
      // Timestamps
      firstIndexed: { type: "date" },
      lastUpdated: { type: "date" },
      lastCalculated: { type: "date" },
      
      // Source tracking
      ingestionSource: { type: "keyword" } // discovery_auto_discover, bulk_refresh, manual, etc
    }
  }
};

module.exports = { MAPS_INDEX_MAPPING };
