#!/usr/bin/env node

/**
 * Worker 7: Performance Calculator
 *
 * Calculates and updates performance metrics for all maps:
 * - Current CCU (from most recent snapshot)
 * - Peak CCU (24h, 7d, 30d)
 * - Average CCU (24h, 7d, 30d)
 * - Discovery status (inDiscovery, appearances, positions, dates)
 * 
 * Runs every 30 minutes to keep metrics fresh
 */

const { Client } = require('@elastic/elasticsearch');

const ES_HOST = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_HOST });

const BATCH_SIZE = 500; // Process 500 maps at a time

/**
 * Calculate CCU metrics for a map
 */
async function calculateCCUMetrics(mapId) {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Get current CCU (most recent snapshot)
    const currentResult = await es.search({
      index: 'concurrent-users-*',
      size: 1,
      body: {
        query: { term: { 'map_id.keyword': mapId } },
        sort: [{ timestamp: 'desc' }]
      }
    });

    const currentCCU = currentResult.hits.hits[0]?._source?.ccu || 0;

    // Get 24h metrics
    const metrics24h = await es.search({
      index: 'concurrent-users-*',
      size: 0,
      body: {
        query: {
          bool: {
            must: [
              { term: { 'map_id.keyword': mapId } },
              { range: { timestamp: { gte: twentyFourHoursAgo.toISOString() } } }
            ]
          }
        },
        aggs: {
          peak: { max: { field: 'ccu' } },
          avg: { avg: { field: 'ccu' } }
        }
      }
    });

    // Get 7d metrics
    const metrics7d = await es.search({
      index: 'concurrent-users-*',
      size: 0,
      body: {
        query: {
          bool: {
            must: [
              { term: { 'map_id.keyword': mapId } },
              { range: { timestamp: { gte: sevenDaysAgo.toISOString() } } }
            ]
          }
        },
        aggs: {
          avg: { avg: { field: 'ccu' } }
        }
      }
    });

    // Get 30d metrics
    const metrics30d = await es.search({
      index: 'concurrent-users-*',
      size: 0,
      body: {
        query: {
          bool: {
            must: [
              { term: { 'map_id.keyword': mapId } },
              { range: { timestamp: { gte: thirtyDaysAgo.toISOString() } } }
            ]
          }
        },
        aggs: {
          avg: { avg: { field: 'ccu' } }
        }
      }
    });

    return {
      currentCCU,
      peakCCU24h: Math.round(metrics24h.aggregations.peak.value || 0),
      avgCCU24h: Math.round(metrics24h.aggregations.avg.value || 0),
      avgCCU7d: Math.round(metrics7d.aggregations.avg.value || 0),
      avgCCU30d: Math.round(metrics30d.aggregations.avg.value || 0)
    };
  } catch (error) {
    console.error(`Error calculating CCU for ${mapId}:`, error.message);
    return null;
  }
}

/**
 * Calculate discovery metrics for a map
 */
async function calculateDiscoveryMetrics(mapId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Check if currently in discovery
    const currentResult = await es.search({
      index: 'discovery-current',
      size: 1,
      body: {
        query: { term: { 'map_id.keyword': mapId } }
      }
    });

    const inDiscovery = currentResult.hits.total.value > 0;

    // Get 7d appearance count
    const appearances7d = await es.search({
      index: 'discovery-events',
      size: 0,
      body: {
        query: {
          bool: {
            must: [
              { term: { 'map_id.keyword': mapId } },
              { term: { 'event_type.keyword': 'ADDED' } },
              { range: { timestamp: { gte: sevenDaysAgo.toISOString() } } }
            ]
          }
        }
      }
    });

    // Get best position ever
    const bestPosition = await es.search({
      index: 'discovery-current',
      size: 1,
      body: {
        query: { term: { 'map_id.keyword': mapId } },
        sort: [{ position: 'asc' }]
      }
    });

    // Get first and last seen dates
    const firstSeen = await es.search({
      index: 'discovery-events',
      size: 1,
      body: {
        query: {
          bool: {
            must: [
              { term: { 'map_id.keyword': mapId } },
              { term: { 'event_type.keyword': 'ADDED' } }
            ]
          }
        },
        sort: [{ timestamp: 'asc' }]
      }
    });

    const lastSeen = await es.search({
      index: 'discovery-events',
      size: 1,
      body: {
        query: { term: { 'map_id.keyword': mapId } },
        sort: [{ timestamp: 'desc' }]
      }
    });

    return {
      inDiscovery,
      discoveryAppearances7d: appearances7d.hits.total.value,
      bestDiscoveryPosition: bestPosition.hits.hits[0]?._source?.position ?? null,
      discoveryFirstSeen: firstSeen.hits.hits[0]?._source?.timestamp ?? null,
      discoveryLastSeen: lastSeen.hits.hits[0]?._source?.timestamp ?? null
    };
  } catch (error) {
    console.error(`Error calculating discovery for ${mapId}:`, error.message);
    return null;
  }
}

/**
 * Update performance metrics for a batch of maps
 */
async function updateMapPerformance(mapIds) {
  const bulkOps = [];

  for (const mapId of mapIds) {
    // Calculate both CCU and discovery metrics
    const [ccuMetrics, discoveryMetrics] = await Promise.all([
      calculateCCUMetrics(mapId),
      calculateDiscoveryMetrics(mapId)
    ]);

    if (ccuMetrics && discoveryMetrics) {
      bulkOps.push({
        update: {
          _index: 'maps',
          _id: mapId
        }
      });
      bulkOps.push({
        doc: {
          ...ccuMetrics,
          ...discoveryMetrics,
          lastCalculated: new Date().toISOString()
        }
      });
    }
  }

  if (bulkOps.length > 0) {
    try {
      await es.bulk({ body: bulkOps, refresh: false });
      return bulkOps.length / 2; // Number of maps updated
    } catch (error) {
      console.error('Bulk update error:', error.message);
      return 0;
    }
  }

  return 0;
}

/**
 * Main calculation loop
 */
async function calculatePerformanceMetrics() {
  console.log('\n🔢 Starting performance metrics calculation...');
  const startTime = Date.now();

  try {
    // Get all map IDs
    const allMaps = await es.search({
      index: 'maps',
      size: 10000,
      _source: ['code'],
      body: {
        query: { match_all: {} }
      }
    });

    const mapIds = allMaps.hits.hits.map(hit => hit._source.code);
    console.log(`Found ${mapIds.length} maps to process`);

    let updated = 0;

    // Process in batches
    for (let i = 0; i < mapIds.length; i += BATCH_SIZE) {
      const batch = mapIds.slice(i, i + BATCH_SIZE);
      const batchUpdated = await updateMapPerformance(batch);
      updated += batchUpdated;

      console.log(`Progress: ${i + batch.length}/${mapIds.length} (Updated: ${updated})`);
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n✓ Performance calculation complete!`);
    console.log(`  Updated: ${updated} maps`);
    console.log(`  Time: ${elapsed} minutes\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run immediately if called directly
if (require.main === module) {
  console.log('Worker 7: Performance Calculator');
  console.log('================================\n');

  calculatePerformanceMetrics().then(() => {
    console.log('Calculation complete. Exiting...');
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { calculatePerformanceMetrics };
