#!/usr/bin/env node

/**
 * Ecosystem Tier Classifier
 * 
 * Classifies maps into tiers based on recent activity:
 * - Tier 1 (Hot): Top 1,000 maps by recent CCU - collected every 10 minutes
 * - Tier 2 (Warm): Next 12,000 maps with moderate activity - collected every 30 minutes  
 * - Tier 3 (Cold): Remaining maps with low/no activity - collected every 60 minutes (rotation)
 * 
 * Auto-promotes/demotes maps based on activity trends
 */

const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

const TIER_1_SIZE = 1000;   // Hot maps: every 10 minutes
const TIER_2_SIZE = 12000;  // Warm maps: every 30 minutes
// Tier 3: All remaining maps (60 minute rotation)

/**
 * Get map tiers based on recent CCU activity
 * Returns: { tier1: [...mapIds], tier2: [...mapIds], tier3: [...mapIds] }
 */
async function getMapTiers() {
  console.log('Classifying maps into tiers based on recent activity...');

  try {
    // Get current month's CCU index
    const now = new Date();
    const currentIndex = `concurrent-users-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Get maps ordered by recent peak CCU (last 24 hours)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const response = await es.search({
      index: currentIndex,
      size: 0,
      body: {
        query: {
          range: {
            timestamp: {
              gte: oneDayAgo.toISOString()
            }
          }
        },
        aggs: {
          maps_by_activity: {
            terms: {
              field: 'map_id',
              size: TIER_1_SIZE + TIER_2_SIZE + 10000, // Get extra for tier 3
              order: { max_ccu: 'desc' }
            },
            aggs: {
              max_ccu: {
                max: { field: 'ccu' }
              },
              avg_ccu: {
                avg: { field: 'ccu' }
              }
            }
          }
        }
      }
    });

    const buckets = response.aggregations.maps_by_activity.buckets;
    
    // Classify into tiers
    const tier1 = buckets.slice(0, TIER_1_SIZE).map(b => b.key);
    const tier2 = buckets.slice(TIER_1_SIZE, TIER_1_SIZE + TIER_2_SIZE).map(b => b.key);
    
    // Get all maps for tier 3 (those not in tier 1 or 2)
    const activeMaps = new Set([...tier1, ...tier2]);
    
    const allMapsResponse = await es.search({
      index: 'maps',
      size: 10000,
      scroll: '5m',
      _source: ['id']
    });

    let scrollId = allMapsResponse._scroll_id;
    let maps = allMapsResponse.hits.hits;
    const tier3 = [];

    while (maps.length > 0) {
      for (const map of maps) {
        const mapId = map._source.id;
        if (!activeMaps.has(mapId)) {
          tier3.push(mapId);
        }
      }

      const scrollResponse = await es.scroll({
        scroll_id: scrollId,
        scroll: '5m'
      });

      maps = scrollResponse.hits.hits;
      scrollId = scrollResponse._scroll_id;
    }

    if (scrollId) {
      await es.clearScroll({ scroll_id: scrollId });
    }

    console.log(`Tier 1 (Hot): ${tier1.length} maps (10-min cycle)`);
    console.log(`Tier 2 (Warm): ${tier2.length} maps (30-min cycle)`);
    console.log(`Tier 3 (Cold): ${tier3.length} maps (60-min rotation)`);

    return { tier1, tier2, tier3 };
  } catch (error) {
    console.error('Error classifying tiers:', error.message);
    
    // Fallback: get all maps and put in tier 3
    const allMapsResponse = await es.search({
      index: 'maps',
      size: 10000,
      scroll: '5m',
      _source: ['id']
    });

    const allMaps = [];
    let scrollId = allMapsResponse._scroll_id;
    let maps = allMapsResponse.hits.hits;

    while (maps.length > 0) {
      allMaps.push(...maps.map(m => m._source.id));
      
      const scrollResponse = await es.scroll({
        scroll_id: scrollId,
        scroll: '5m'
      });

      maps = scrollResponse.hits.hits;
      scrollId = scrollResponse._scroll_id;
    }

    if (scrollId) {
      await es.clearScroll({ scroll_id: scrollId });
    }

    return {
      tier1: allMaps.slice(0, TIER_1_SIZE),
      tier2: allMaps.slice(TIER_1_SIZE, TIER_1_SIZE + TIER_2_SIZE),
      tier3: allMaps.slice(TIER_1_SIZE + TIER_2_SIZE)
    };
  }
}

module.exports = { getMapTiers };
