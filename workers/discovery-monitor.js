#!/usr/bin/env node

/**
 * Worker 4: Discovery Monitor
 * 
 * Monitors Fortnite Creative discovery surfaces
 * - Runs every 10 minutes
 * - Detects ADDED/REMOVED/MOVED events
 * - Auto-discovers new maps and creators
 * - Updates discovery-current and discovery-events indices
 */

const { Client } = require('@elastic/elasticsearch');
const DiscoveryClient = require('../EpicGames/apis/discovery/discoveryClient');
const { getMnemonicInfo } = require('../EpicGames/apis/mnemonicInfoAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('./auth-helper');

const ES_HOST = 'http://localhost:9200';
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const es = new Client({ node: ES_HOST });

/**
 * Get current discovery snapshot from ES
 */
async function getCurrentDiscoverySnapshot() {
  try {
    const response = await es.search({
      index: 'discovery-current',
      size: 10000,
      body: {
        query: { match_all: {} }
      }
    });
    
    return response.hits.hits.map(h => h._source);
  } catch (error) {
    console.error('Error fetching discovery snapshot:', error.message);
    return [];
  }
}

/**
 * Detect changes between snapshots
 */
function detectDiscoveryChanges(prevSnapshot, newSnapshot) {
  const changes = [];
  const prevMap = new Map(prevSnapshot.map(s => [`${s.surface}-${s.panel}-${s.map_id}`, s]));
  const newMap = new Map(newSnapshot.map(s => [`${s.surface}-${s.panel}-${s.map_id}`, s]));
  
  // Detect REMOVED
  for (const [key, item] of prevMap) {
    if (!newMap.has(key)) {
      changes.push({
        type: 'REMOVED',
        surface: item.surface,
        panel: item.panel,
        map_id: item.map_id,
        position: item.position,
        previous_position: item.position
      });
    }
  }
  
  // Detect ADDED and MOVED
  for (const [key, item] of newMap) {
    const prev = prevMap.get(key);
    
    if (!prev) {
      changes.push({
        type: 'ADDED',
        surface: item.surface,
        panel: item.panel,
        map_id: item.map_id,
        position: item.position,
        previous_position: null
      });
    } else if (prev.position !== item.position) {
      changes.push({
        type: 'MOVED',
        surface: item.surface,
        panel: item.panel,
        map_id: item.map_id,
        position: item.position,
        previous_position: prev.position
      });
    }
  }
  
  return changes;
}

/**
 * Update discovery_summary in maps index
 */
async function updateMapDiscoverySummaries(snapshot) {
  const mapSummaries = new Map();
  
  // Aggregate by map_id
  for (const item of snapshot) {
    if (!mapSummaries.has(item.map_id)) {
      mapSummaries.set(item.map_id, {
        is_featured: false,
        surfaces: [],
        panels: [],
        positions: []
      });
    }
    
    const summary = mapSummaries.get(item.map_id);
    summary.is_featured = true;
    summary.surfaces.push(item.surface);
    summary.panels.push(item.panel);
    summary.positions.push(item.position);
  }
  
  // Bulk update maps
  const bulk = [];
  for (const [mapId, summary] of mapSummaries) {
    bulk.push(
      { update: { _index: 'maps', _id: mapId } },
      {
        doc: {
          discovery_summary: {
            is_featured: true,
            surface_count: [...new Set(summary.surfaces)].length,
            first_surface: summary.surfaces[0],
            best_position: Math.min(...summary.positions),
            last_updated: new Date()
          }
        }
      }
    );
  }
  
  if (bulk.length > 0) {
    await es.bulk({ body: bulk, refresh: false });
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║ Worker 4: Discovery Monitor (Every 10 Minutes)║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  // Initialize authentication
  initializeAuth();
  
  while (true) {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 [${new Date().toISOString()}] Starting discovery monitoring cycle...`);
      
      // Get auth credentials
      const accessToken = await getAccessToken();
      const accountId = await getAccountId();
      
      // Initialize discovery client
      const discoveryClient = new DiscoveryClient(accessToken, accountId);
      
      // 1. Get previous snapshot from ES
      const prevSnapshot = await getCurrentDiscoverySnapshot();
      console.log(`📋 Previous snapshot: ${prevSnapshot.length} entries`);
      
      // 2. Fetch all discovery surfaces from Epic API
      const newSnapshot = [];
      
      // List of surfaces to monitor (can be expanded)
      const surfaces = [
        'CreativeDiscoverySurface_Frontend',
        'CreativeDiscoverySurface_Browse'
      ];
      
      try {
        for (const surfaceName of surfaces) {
          const panels = await discoveryClient.fetchDiscoveryPanels(surfaceName);
          console.log(`🎮 Surface "${surfaceName}": ${panels.length} panels`);
          
          for (const panel of panels) {
            try {
              const pages = await discoveryClient.fetchPanelPages(
                surfaceName, 
                panel.panelName, 
                panel.testVariantName,
                2 // Limit to first 2 pages for performance
              );
              
              // Extract map IDs and positions
              pages.forEach((item, index) => {
                if (item.linkCode) {
                  newSnapshot.push({
                    surface: surfaceName,
                    panel: panel.panelName,
                    map_id: item.linkCode,
                    position: index,
                    region: item.region || 'unknown'
                  });
                }
              });
            } catch (error) {
              console.error(`Error fetching panel ${panel.panelName}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching discovery data:', error.message);
      }
      
      console.log(`📊 New snapshot: ${newSnapshot.length} entries`);
      
      // 3. Detect NEW maps (not in ES)
      const allMapIds = [...new Set(newSnapshot.map(m => m.map_id))];
      const newMapIds = [];
      
      for (const mapId of allMapIds) {
        const exists = await es.exists({
          index: 'maps',
          id: mapId
        });
        
        if (!exists) {
          newMapIds.push(mapId);
        }
      }
      
      if (newMapIds.length > 0) {
        console.log(`🆕 Found ${newMapIds.length} new maps in discovery`);
        
        for (const mapId of newMapIds) {
          // Add to maps index
          await es.index({
            index: 'maps',
            id: mapId,
            body: {
              id: mapId,
              metadata: {
                first_indexed: new Date(),
                ingestion_source: 'discovery_auto_discover'
              }
            }
          });
          
          // Fetch full map data to get creator
          try {
            const accessToken = await getAccessToken();
            const mapData = await getMnemonicInfo(mapId, accessToken);
            
            if (mapData && mapData.accountId) {
              const creatorExists = await es.exists({
                index: 'creators',
                id: mapData.accountId
              });
              
              if (!creatorExists) {
                console.log(`🆕 Found new creator: ${mapData.accountId}`);
                await es.index({
                  index: 'creators',
                  id: mapData.accountId,
                  body: {
                    id: mapData.accountId,
                    account_id: mapData.accountId,
                    metadata: {
                      first_indexed: new Date(),
                      ingestion_source: 'discovery_auto_discover'
                    }
                  }
                });
              }
            }
          } catch (error) {
            console.error(`Error fetching map ${mapId}:`, error.message);
          }
        }
      }
      
      // 4. Detect changes (ADDED/REMOVED/MOVED)
      const changes = detectDiscoveryChanges(prevSnapshot, newSnapshot);
      console.log(`📝 Detected ${changes.length} changes`);
      
      // Log change breakdown
      const added = changes.filter(c => c.type === 'ADDED').length;
      const removed = changes.filter(c => c.type === 'REMOVED').length;
      const moved = changes.filter(c => c.type === 'MOVED').length;
      console.log(`   - ADDED: ${added}, REMOVED: ${removed}, MOVED: ${moved}`);
      
      // 5. Log events
      if (changes.length > 0) {
        const eventBulk = changes.map(change => [
          { index: { _index: 'discovery-events' } },
          {
            event_type: change.type,
            surface: change.surface,
            panel: change.panel,
            map_id: change.map_id,
            position: change.position,
            previous_position: change.previous_position,
            timestamp: new Date()
          }
        ]).flat();
        
        await es.bulk({ body: eventBulk, refresh: false });
      }
      
      // 6. Update discovery-current (upsert all)
      if (newSnapshot.length > 0) {
        const currentBulk = newSnapshot.map(item => [
          {
            index: {
              _index: 'discovery-current',
              _id: `${item.surface}-${item.panel}-${item.map_id}`
            }
          },
          {
            surface: item.surface,
            panel: item.panel,
            map_id: item.map_id,
            position: item.position,
            last_updated: new Date()
          }
        ]).flat();
        
        await es.bulk({ body: currentBulk, refresh: false });
      }
      
      // 7. Update discovery_summary in maps
      await updateMapDiscoverySummaries(newSnapshot);
      
      console.log(`✓ Discovery updated: ${changes.length} changes, ${newMapIds.length} new maps`);
      
    } catch (error) {
      console.error('❌ Discovery monitor error:', error);
    }
    
    // 8. Wait until next interval
    const elapsed = Date.now() - startTime;
    const waitTime = Math.max(0, INTERVAL_MS - elapsed);
    const waitMinutes = (waitTime / 1000 / 60).toFixed(1);
    
    console.log(`⏳ Next update in ${waitMinutes} minutes\n`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down discovery monitor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down discovery monitor...');
  process.exit(0);
});

// Start worker
runWorker().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
