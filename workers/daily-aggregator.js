#!/usr/bin/env node

/**
 * Worker 5: Daily Aggregator
 * 
 * Runs daily at midnight UTC to calculate performance metrics
 * - Aggregates CCU data (24h, 7d, 30d averages)
 * - Calculates growth metrics
 * - Updates performance fields in maps and creators
 * - Creates daily snapshots
 */

const { Client } = require('@elastic/elasticsearch');
const cron = require('node-cron');

const ES_HOST = 'http://localhost:9200';
const es = new Client({ node: ES_HOST });

/**
 * Calculate map performance metrics
 */
async function calculateMapMetrics() {
  console.log('📊 Calculating map performance metrics...');
  
  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  
  // Get all maps
  const mapsResponse = await es.search({
    index: 'maps',
    size: 10000,
    scroll: '5m',
    _source: ['id']
  });
  
  let scrollId = mapsResponse._scroll_id;
  let maps = mapsResponse.hits.hits;
  let processed = 0;
  
  while (maps.length > 0) {
    const bulk = [];
    
    for (const map of maps) {
      const mapId = map._source.id;
      
      try {
        // Get CCU data for different time periods
        const ccuMonth = new Date().toISOString().slice(0, 7);
        
        // 24-hour average
        const ccu24h = await es.search({
          index: `concurrent-users-${ccuMonth}`,
          body: {
            query: {
              bool: {
                must: [
                  { term: { map_id: mapId } },
                  { range: { timestamp: { gte: oneDayAgo.toISOString() } } }
                ]
              }
            },
            aggs: {
              avg_ccu: { avg: { field: 'ccu' } },
              max_ccu: { max: { field: 'ccu' } }
            },
            size: 0
          }
        });
        
        // 7-day average
        const ccu7d = await es.search({
          index: `concurrent-users-${ccuMonth}`,
          body: {
            query: {
              bool: {
                must: [
                  { term: { map_id: mapId } },
                  { range: { timestamp: { gte: sevenDaysAgo.toISOString() } } }
                ]
              }
            },
            aggs: {
              avg_ccu: { avg: { field: 'ccu' } }
            },
            size: 0
          }
        });
        
        // 30-day average
        const ccu30d = await es.search({
          index: `concurrent-users-${ccuMonth}`,
          body: {
            query: {
              bool: {
                must: [
                  { term: { map_id: mapId } },
                  { range: { timestamp: { gte: thirtyDaysAgo.toISOString() } } }
                ]
              }
            },
            aggs: {
              avg_ccu: { avg: { field: 'ccu' } }
            },
            size: 0
          }
        });
        
        // Get discovery events count
        const discoveryEvents = await es.count({
          index: 'discovery-events',
          body: {
            query: {
              bool: {
                must: [
                  { term: { map_id: mapId } },
                  { range: { timestamp: { gte: sevenDaysAgo.toISOString() } } }
                ]
              }
            }
          }
        });
        
        // Build performance update
        const performance = {
          avg_ccu_24h: Math.round(ccu24h.aggregations?.avg_ccu?.value || 0),
          max_ccu_24h: Math.round(ccu24h.aggregations?.max_ccu?.value || 0),
          avg_ccu_7d: Math.round(ccu7d.aggregations?.avg_ccu?.value || 0),
          avg_ccu_30d: Math.round(ccu30d.aggregations?.avg_ccu?.value || 0),
          discovery_appearances_7d: discoveryEvents.count,
          last_calculated: new Date()
        };
        
        bulk.push(
          { update: { _index: 'maps', _id: mapId } },
          { doc: { performance } }
        );
        
      } catch (error) {
        console.error(`Error calculating metrics for map ${mapId}:`, error.message);
      }
    }
    
    // Execute bulk update
    if (bulk.length > 0) {
      await es.bulk({ body: bulk, refresh: false });
      processed += bulk.length / 2;
      console.log(`   Updated ${processed} maps...`);
    }
    
    // Get next batch
    const scrollResponse = await es.scroll({
      scroll_id: scrollId,
      scroll: '5m'
    });
    
    maps = scrollResponse.hits.hits;
    scrollId = scrollResponse._scroll_id;
  }
  
  // Clear scroll
  if (scrollId) {
    await es.clearScroll({ scroll_id: scrollId });
  }
  
  console.log(`✓ Calculated metrics for ${processed} maps`);
}

/**
 * Calculate creator performance metrics
 */
async function calculateCreatorMetrics() {
  console.log('📊 Calculating creator performance metrics...');
  
  const now = new Date();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  
  // Get all creators
  const creatorsResponse = await es.search({
    index: 'creators',
    size: 10000,
    scroll: '5m',
    _source: ['id', 'totals.total_followers']
  });
  
  let scrollId = creatorsResponse._scroll_id;
  let creators = creatorsResponse.hits.hits;
  let processed = 0;
  
  while (creators.length > 0) {
    const bulk = [];
    
    for (const creator of creators) {
      const creatorId = creator._source.id;
      
      try {
        // Get follower growth from changelog
        const changelog = await es.search({
          index: 'creator-changelog',
          size: 2,
          sort: [{ timestamp: 'desc' }],
          body: {
            query: {
              bool: {
                must: [
                  { term: { creator_id: creatorId } },
                  { range: { timestamp: { gte: sevenDaysAgo.toISOString() } } }
                ]
              }
            }
          }
        });
        
        let followerGrowth7d = 0;
        if (changelog.hits.hits.length >= 2) {
          const latest = changelog.hits.hits[0]._source.snapshot.totals?.total_followers || 0;
          const oldest = changelog.hits.hits[changelog.hits.hits.length - 1]._source.snapshot.totals?.total_followers || 0;
          followerGrowth7d = latest - oldest;
        }
        
        // Count active maps
        const activeMaps = await es.count({
          index: 'maps',
          body: {
            query: {
              bool: {
                must: [
                  { term: { 'creator.account_id': creatorId } },
                  { range: { 'performance.avg_ccu_7d': { gt: 0 } } }
                ]
              }
            }
          }
        });
        
        // Build performance update
        const performance = {
          follower_growth_7d: followerGrowth7d,
          active_maps_count: activeMaps.count,
          last_calculated: new Date()
        };
        
        bulk.push(
          { update: { _index: 'creators', _id: creatorId } },
          { doc: { performance } }
        );
        
      } catch (error) {
        console.error(`Error calculating metrics for creator ${creatorId}:`, error.message);
      }
    }
    
    // Execute bulk update
    if (bulk.length > 0) {
      await es.bulk({ body: bulk, refresh: false });
      processed += bulk.length / 2;
      console.log(`   Updated ${processed} creators...`);
    }
    
    // Get next batch
    const scrollResponse = await es.scroll({
      scroll_id: scrollId,
      scroll: '5m'
    });
    
    creators = scrollResponse.hits.hits;
    scrollId = scrollResponse._scroll_id;
  }
  
  // Clear scroll
  if (scrollId) {
    await es.clearScroll({ scroll_id: scrollId });
  }
  
  console.log(`✓ Calculated metrics for ${processed} creators`);
}

/**
 * Create daily discovery snapshot
 */
async function createDailyDiscoverySnapshot() {
  console.log('📸 Creating daily discovery snapshot...');
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Get current discovery state
  const currentState = await es.search({
    index: 'discovery-current',
    size: 10000,
    body: {
      query: { match_all: {} }
    }
  });
  
  // Aggregate by map
  const mapPositions = new Map();
  
  for (const hit of currentState.hits.hits) {
    const { map_id, surface, position } = hit._source;
    
    if (!mapPositions.has(map_id)) {
      mapPositions.set(map_id, {
        surfaces: [],
        positions: []
      });
    }
    
    mapPositions.get(map_id).surfaces.push(surface);
    mapPositions.get(map_id).positions.push(position);
  }
  
  // Create daily snapshot entries
  const bulk = [];
  
  for (const [mapId, data] of mapPositions) {
    bulk.push(
      { index: { _index: 'discovery-daily', _id: `${mapId}-${today}` } },
      {
        map_id: mapId,
        date: today,
        surface_count: [...new Set(data.surfaces)].length,
        best_position: Math.min(...data.positions),
        avg_position: data.positions.reduce((a, b) => a + b, 0) / data.positions.length,
        timestamp: new Date()
      }
    );
  }
  
  if (bulk.length > 0) {
    await es.bulk({ body: bulk, refresh: false });
  }
  
  console.log(`✓ Created daily snapshot for ${mapPositions.size} maps`);
}

/**
 * Run all aggregations
 */
async function runDailyAggregation() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║        Daily Aggregation Starting...          ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`⏰ ${new Date().toISOString()}\n`);
  
  const startTime = Date.now();
  
  try {
    await calculateMapMetrics();
    await calculateCreatorMetrics();
    await createDailyDiscoverySnapshot();
    
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║       Daily Aggregation Complete!             ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`⏱️  Completed in ${elapsed} minutes\n`);
    
  } catch (error) {
    console.error('❌ Daily aggregation error:', error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Worker 5: Daily Aggregator (Cron: 00:00)    ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  // Schedule daily at midnight UTC (0 0 * * *)
  cron.schedule('0 0 * * *', () => {
    runDailyAggregation();
  });
  
  console.log('✓ Daily aggregator scheduled for 00:00 UTC');
  console.log('⏳ Waiting for scheduled time...\n');
  
  // Optional: Run immediately on startup for testing
  if (process.argv.includes('--run-now')) {
    console.log('🚀 Running aggregation immediately (--run-now flag)...\n');
    await runDailyAggregation();
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down daily aggregator...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down daily aggregator...');
  process.exit(0);
});

// Start worker
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
