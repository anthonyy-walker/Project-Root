# Worker Scripts Architecture

## Worker 1: Maps Ingestion (Continuous)
**No rate limit - runs 24/7**

```javascript
// workers/map-ingestion.js

async function runMapsIngestion() {
  while (true) {
    const maps = await getMapsQueue(); // Get next batch
    
    for (const mapCode of maps) {
      try {
        // 1. Fetch from Epic API
        const apiData = await mnemonicAPI.getMnemonicInfo(mapCode);
        
        // 2. Get existing doc from ES
        const existingDoc = await es.get({ index: 'maps', id: mapCode });
        
        // 3. Transform API data to ES format
        const newDoc = transformMapData(apiData);
        
        // 4. Detect changes
        const changes = detectChanges(existingDoc, newDoc);
        
        // 5. If changes exist, log to changelog
        if (changes.length > 0) {
          await es.index({
            index: 'map-changelog',
            body: {
              map_id: mapCode,
              timestamp: new Date(),
              version: newDoc.version,
              activated: newDoc.last_activated_date,
              changes_detected: changes,
              previous_values: getChangedFields(existingDoc, changes),
              new_values: getChangedFields(newDoc, changes)
            }
          });
        }
        
        // 6. Update/insert map doc
        await es.index({
          index: 'maps',
          id: mapCode,
          body: newDoc
        });
        
        console.log(`✓ ${mapCode} updated`);
        
      } catch (error) {
        console.error(`✗ ${mapCode} failed:`, error.message);
        // Log to error queue for retry
      }
    }
    
    // Small delay between batches
    await sleep(100);
  }
}

// ~500K maps, ~100ms per call = 13.8 hours per full cycle
// Each map updated ~2x per day
```

## Worker 2: Creators Ingestion (Continuous, Rate-Limited)
**30 requests/min limit**

```javascript
// workers/creator-ingestion.js

const RATE_LIMIT = 30; // requests per minute
const DELAY_MS = (60 * 1000) / RATE_LIMIT; // 2000ms between calls

async function runCreatorsIngestion() {
  while (true) {
    const creators = await getCreatorsQueue(); // Get next batch
    
    for (const creatorId of creators) {
      try {
        // 1. Fetch creator page (includes maps list)
        const creatorPage = await creatorPageAPI.getCreatorPage(creatorId);
        
        // 2. Fetch POPS data (socials, bio, followers)
        const popsData = await popsAPI.getCreatorInfo(creatorId);
        
        // 3. Get existing doc
        const existingDoc = await es.get({ index: 'creators', id: creatorId });
        
        // 4. Transform and merge data
        const newDoc = transformCreatorData(creatorPage, popsData);
        
        // 5. Aggregate stats from creator's maps
        const mapStats = await aggregateCreatorMaps(creatorId);
        newDoc.total_ccu = mapStats.total_ccu;
        newDoc.total_maps = mapStats.total_maps;
        
        // 6. Detect changes
        const changes = detectCreatorChanges(existingDoc, newDoc);
        
        // 7. Log to changelog if changed
        if (changes.length > 0) {
          await es.index({
            index: 'creator-changelog',
            body: {
              creator_id: creatorId,
              timestamp: new Date(),
              changes: buildChangeObject(existingDoc, newDoc, changes),
              daily_stats: {
                total_ccu: newDoc.total_ccu,
                total_maps: newDoc.total_maps,
                total_minutes_played: newDoc.total_minutes_played
              }
            }
          });
        }
        
        // 8. Update creator doc
        await es.index({
          index: 'creators',
          id: creatorId,
          body: newDoc
        });
        
        console.log(`✓ ${creatorId} updated`);
        
        // 9. Rate limit delay
        await sleep(DELAY_MS);
        
      } catch (error) {
        console.error(`✗ ${creatorId} failed:`, error.message);
        await sleep(DELAY_MS); // Still respect rate limit on errors
      }
    }
  }
}

// 50K creators, 2 sec per call = 27.7 hours per full cycle
// Each creator updated ~1x per day
```

## Worker 3: CCU Monitor (Every 10 min)
**Top 500-1000 maps + discovers new maps from playercount API**

```javascript
// workers/ccu-monitor.js

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function runCCUMonitor() {
  while (true) {
    const startTime = Date.now();
    
    try {
      // 1. Get top maps to monitor
      const topMaps = await es.search({
        index: 'maps',
        size: 1000,
        sort: [{ 'performance.avg_ccu_7d': 'desc' }],
        _source: ['id', 'name']
      });
      
      // 2. Fetch current CCU for each map
      const ccuData = await fetchCurrentCCU(topMaps.hits.hits.map(h => h._source.id));
      
      // 3. Check for NEW maps in playercount response (after all creators checked)
      const knownMapIds = topMaps.hits.hits.map(h => h._source.id);
      const allPlayerCountMaps = await getAllPlayerCountMaps(); // Get all maps with playercount
      const newMapIds = allPlayerCountMaps.filter(id => !knownMapIds.includes(id));
      
      if (newMapIds.length > 0) {
        console.log(`🆕 Found ${newMapIds.length} new maps from playercount`);
        
        for (const mapId of newMapIds) {
          await es.index({
            index: 'maps',
            id: mapId,
            body: {
              id: mapId,
              metadata: {
                first_indexed: new Date(),
                ingestion_source: 'playercount_auto_discover'
              }
            }
          });
          
          // Fetch full map data to get creator
          const mapData = await mnemonicAPI.getMnemonicInfo(mapId);
          
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
                    ingestion_source: 'playercount_auto_discover'
                  }
                }
              });
            }
          }
        }
      }
      
      // 4. Bulk insert into time-series index (SKIP -1 values)
      const bulk = [];
      const updates = [];
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      
      for (const [mapId, ccu] of Object.entries(ccuData)) {
        // Skip -1 values (invalid/unavailable)
        if (ccu < 0) {
          console.log(`⚠️  Skipping ${mapId}: CCU = ${ccu}`);
          continue;
        }
        
        // Insert CCU snapshot
        bulk.push(
          { index: { _index: `concurrent-users-${currentMonth}` } },
          {
            map_id: mapId,
            ccu: ccu,
            timestamp: new Date(),
            source: 'epic_api'
          }
        );
        
        // Prepare map update
        const existingMap = topMaps.hits.hits.find(h => h._source.id === mapId);
        const updateDoc = {
          lastSyncCcu: ccu,
          lastSyncDate: new Date()
        };
        
        // Update record if new peak
        if (existingMap && ccu > (existingMap._source.ccu_record || 0)) {
          updateDoc.ccu_record = ccu;
          updateDoc.ccu_record_date = new Date();
        }
        
        updates.push({ update: { _index: 'maps', _id: mapId } }, { doc: updateDoc });
      }
      
      // 5. Execute bulk operations
      if (bulk.length > 0) {
        await es.bulk({ body: bulk });
      }
      if (updates.length > 0) {
        await es.bulk({ body: updates });
      }
      
      console.log(`✓ CCU updated for ${Object.keys(ccuData).length} maps (skipped ${Object.values(ccuData).filter(v => v < 0).length} invalid)`);
      
    } catch (error) {
      console.error('CCU monitor error:', error);
    }
    
    // 6. Wait until next interval
    const elapsed = Date.now() - startTime;
    const waitTime = Math.max(0, INTERVAL_MS - elapsed);
    await sleep(waitTime);
  }
}
```

## Worker 4: Discovery Monitor (Every 10 min)
**Also discovers new maps & creators**

```javascript
// workers/discovery-monitor.js

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function runDiscoveryMonitor() {
  while (true) {
    const startTime = Date.now();
    
    try {
      // 1. Get previous snapshot from ES
      const prevSnapshot = await getCurrentDiscoverySnapshot();
      
      // 2. Fetch all discovery surfaces from Epic API
      const surfaces = await discoveryAPI.getAllSurfaces();
      const newSnapshot = [];
      
      for (const surface of surfaces) {
        const panels = await discoveryAPI.getSurfacePanels(surface);
        
        for (const panel of panels) {
          const maps = await discoveryAPI.getPanelMaps(surface, panel);
          newSnapshot.push(...maps);
        }
      }
      
      // 3. Detect NEW maps (not in ES)
      const allMapIds = newSnapshot.map(m => m.map_id);
      const existingMaps = await es.search({
        index: 'maps',
        size: 0,
        body: {
          query: { ids: { values: allMapIds } }
        }
      });
      
      const newMapIds = allMapIds.filter(id => !existingMaps.hits.hits.some(h => h._id === id));
      
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
          const mapData = await mnemonicAPI.getMnemonicInfo(mapId);
          
          if (mapData && mapData.accountId) {
            // Check if creator exists
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
        }
      }
      
      // 4. Detect changes (ADDED/REMOVED/MOVED)
      const changes = detectDiscoveryChanges(prevSnapshot, newSnapshot);
      
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
        
        await es.bulk({ body: eventBulk });
      }
      
      // 6. Update discovery-current (upsert all)
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
      
      await es.bulk({ body: currentBulk });
      
      // 7. Update discovery_summary in maps
      await updateMapDiscoverySummaries(newSnapshot);
      
      console.log(`✓ Discovery updated: ${changes.length} changes, ${newMapIds.length} new maps`);
      
    } catch (error) {
      console.error('Discovery monitor error:', error);
    }
    
    // 8. Wait until next interval
    const elapsed = Date.now() - startTime;
    const waitTime = Math.max(0, INTERVAL_MS - elapsed);
    await sleep(waitTime);
  }
}
```

## Worker 5: Daily Aggregator (Cron: 0 0 * * *)

```javascript
// workers/daily-aggregator.js

async function runDailyAggregation() {
  console.log('Starting daily aggregation...');
  
  try {
    // 1. Calculate performance metrics from CCU data
    const maps = await es.search({
      index: 'maps',
      size: 10000,
      scroll: '5m',
      _source: ['id']
    });
    
    let scrollId = maps._scroll_id;
    let allMaps = maps.hits.hits;
    
    // Process in batches
    while (maps.hits.hits.length > 0) {
      const batch = allMaps.splice(0, 100);
      
      for (const map of batch) {
        const mapId = map._source.id;
        
        // Calculate from concurrent-users index
        const performance = await calculatePerformanceMetrics(mapId);
        
        // Update maps doc
        await es.update({
          index: 'maps',
          id: mapId,
          body: {
            doc: {
              performance: performance,
              'metadata.last_updated': new Date()
            }
          }
        });
      }
      
      // Get next batch
      const scrollResult = await es.scroll({
        scroll_id: scrollId,
        scroll: '5m'
      });
      allMaps = scrollResult.hits.hits;
      scrollId = scrollResult._scroll_id;
    }
    
    // 2. Aggregate discovery stats for yesterday
    await aggregateDiscoveryDaily(new Date() - 86400000);
    
    // 3. Calculate rankings
    await calculateGlobalRankings();
    
    console.log('✓ Daily aggregation complete');
    
  } catch (error) {
    console.error('Daily aggregation error:', error);
  }
}

// Run via cron
const cron = require('node-cron');
cron.schedule('0 0 * * *', runDailyAggregation);
```

## PM2 Configuration

```javascript
// ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'map-ingestion',
      script: './workers/map-ingestion.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G'
    },
    {
      name: 'creator-ingestion',
      script: './workers/creator-ingestion.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'ccu-monitor',
      script: './workers/ccu-monitor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M'
    },
    {
      name: 'discovery-monitor',
      script: './workers/discovery-monitor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M'
    },
    {
      name: 'daily-aggregator',
      script: './workers/daily-aggregator.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      cron_restart: '0 0 * * *'
    }
  ]
};
```

## Queue Management

```javascript
// Queue system for continuous workers

class IngestionQueue {
  constructor(indexName) {
    this.index = indexName;
    this.cursor = 0;
  }
  
  async getNextBatch(size = 100) {
    const result = await es.search({
      index: this.index,
      from: this.cursor,
      size: size,
      sort: [{ 'metadata.last_updated': 'asc' }],
      _source: ['id']
    });
    
    const ids = result.hits.hits.map(h => h._source.id);
    
    // Reset cursor if end reached
    if (ids.length < size) {
      this.cursor = 0;
    } else {
      this.cursor += size;
    }
    
    return ids;
  }
}
```

## Error Handling & Retry

```javascript
// Retry failed operations

class RetryQueue {
  constructor(maxRetries = 3) {
    this.queue = new Map();
    this.maxRetries = maxRetries;
  }
  
  add(id, error) {
    const attempts = (this.queue.get(id)?.attempts || 0) + 1;
    
    if (attempts <= this.maxRetries) {
      this.queue.set(id, { attempts, error, timestamp: Date.now() });
    } else {
      // Log to dead letter queue
      console.error(`Max retries reached for ${id}`);
    }
  }
  
  async process(handler) {
    for (const [id, data] of this.queue.entries()) {
      try {
        await handler(id);
        this.queue.delete(id);
      } catch (error) {
        this.add(id, error);
      }
    }
  }
}
```
