#!/usr/bin/env node

/**
 * High-performance script to fetch creator IDs (accountId) for all maps
 * Uses Epic Games Links Service Mnemonic Info API
 * No rate limiting - runs as fast as possible with concurrency control
 */

const { Client } = require('@elastic/elasticsearch');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const CONFIG = {
  NAMESPACE: 'fn',
  EPIC_API_BASE: 'https://links-public-service-live.ol.epicgames.com/links/api',
  LINK_TYPES: ['Creative:Island', 'valkyrie:application', 'ModeSet'],
  MAX_CONCURRENT_REQUESTS: 1, // Sequential processing
  ELASTICSEARCH_INDEX: 'maps', // The Elasticsearch index for maps
  OUTPUT_FILE: path.join(__dirname, '../data/creator-ids.json'),
  CSV_FILE: path.join(__dirname, '../data/creator-ids.csv'),
  LOG_FILE: path.join(__dirname, '../logs/creator-ids-fetch.log'),
  CHECKPOINT_FILE: path.join(__dirname, '../data/creator-ids-checkpoint.json'),
  CHECKPOINT_INTERVAL: 2000, // Save checkpoint every N maps
  SCROLL_SIZE: 10000, // Number of documents to fetch per scroll
  SCROLL_TIMEOUT: '5m' // Scroll context timeout
};

// Statistics
const stats = {
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
  alreadyHaveAccountId: 0,
  startTime: Date.now(),
  errors: {}
};

// Results storage
const results = {
  creatorIds: {}, // mnemonic -> { accountId, creatorName, linkType, namespace }
  failures: []
};

// Stream writer for real-time output
let csvStream = null;

/**
 * Fetch mnemonic info from Epic Games API
 */
async function fetchMnemonicInfo(mnemonic, accessToken) {
  const baseUrl = `${CONFIG.EPIC_API_BASE}/${CONFIG.NAMESPACE}/mnemonic/${mnemonic}`;
  
  // Try all link types
  for (const linkType of CONFIG.LINK_TYPES) {
    try {
      const url = `${baseUrl}?type=${encodeURIComponent(linkType)}&includeActivationHistory=true`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 2000
      });
      
      if (response.data && response.data.accountId) {
        return {
          accountId: response.data.accountId,
          creatorName: response.data.metadata?.creatorName || '',
          linkType: response.data.linkType || linkType,
          namespace: response.data.namespace || CONFIG.NAMESPACE,
          version: response.data.version,
          active: response.data.active,
          metadata: response.data.metadata
        };
      }
    } catch (error) {
      // If 400 error, try to extract correct type from error message
      if (error.response?.status === 400) {
        const errorMessage = error.response.data?.errorMessage || '';
        if (errorMessage.includes('wrong_link_type')) {
          const typeMatch = errorMessage.match(/has type ([^,]+),/);
          if (typeMatch && typeMatch[1] && !CONFIG.LINK_TYPES.includes(typeMatch[1])) {
            try {
              const correctType = typeMatch[1];
              const url = `${baseUrl}?type=${encodeURIComponent(correctType)}&includeActivationHistory=true`;
              const retryResponse = await axios.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 2000
              });
              
              if (retryResponse.data && retryResponse.data.accountId) {
                return {
                  accountId: retryResponse.data.accountId,
                  creatorName: retryResponse.data.metadata?.creatorName || '',
                  linkType: retryResponse.data.linkType || correctType,
                  namespace: retryResponse.data.namespace || CONFIG.NAMESPACE,
                  version: retryResponse.data.version,
                  active: retryResponse.data.active,
                  metadata: retryResponse.data.metadata
                };
              }
            } catch (retryError) {
              // Continue to next type
            }
          }
        }
        continue; // Try next type
      } else if (error.response?.status !== 404) {
        // For non-404 errors, log and continue
        const errorType = error.response?.status || 'network_error';
        stats.errors[errorType] = (stats.errors[errorType] || 0) + 1;
      }
    }
  }
  
  return null;
}

/**
 * Process a batch of maps concurrently
 */
async function processBatch(maps, accessToken, esClient) {
  const promises = maps.map(async (map) => {
    try {
      stats.processed++;
      
      // Skip if we already have owner_account_id in Elasticsearch
      if (map.owner_account_id && map.owner_account_id.trim() !== '') {
        stats.alreadyHaveAccountId++;
        const result = {
          accountId: map.owner_account_id,
          creatorName: map.owner_name || '',
          linkType: map.link_type || '',
          namespace: map.namespace || CONFIG.NAMESPACE,
          source: 'elasticsearch'
        };
        results.creatorIds[map.mnemonic] = result;
        stats.success++;
        
        // Write immediately to CSV
        if (csvStream) {
          csvStream.write(`${map.mnemonic},${map.owner_account_id},${(map.owner_name || '').replace(/,/g, ' ')},${map.link_type || ''},${map.namespace || 'fn'}\n`);
        }
        return;
      }
      
      // Fetch from API
      const info = await fetchMnemonicInfo(map.mnemonic, accessToken);
      
      if (info && info.accountId) {
        const result = {
          accountId: info.accountId,
          creatorName: info.creatorName,
          linkType: info.linkType,
          namespace: info.namespace,
          source: 'api'
        };
        results.creatorIds[map.mnemonic] = result;
        stats.success++;
        
        // Write immediately to CSV
        if (csvStream) {
          csvStream.write(`${map.mnemonic},${info.accountId},${(info.creatorName || '').replace(/,/g, ' ')},${info.linkType},${info.namespace}\n`);
        }
      } else {
        results.failures.push(map.mnemonic);
        stats.failed++;
      }
      
      // Log progress to stderr so it doesn't interfere with data output
      if (stats.processed % 100 === 0) {
        const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
        const rate = (stats.processed / elapsed).toFixed(1);
        const eta = ((stats.total - stats.processed) / rate).toFixed(0);
        console.error(`Progress: ${stats.processed}/${stats.total} (${((stats.processed/stats.total)*100).toFixed(1)}%) | Success: ${stats.success} | Failed: ${stats.failed} | Rate: ${rate}/s | ETA: ${eta}s`);
      }
      
      // Save checkpoint
      if (stats.processed % CONFIG.CHECKPOINT_INTERVAL === 0) {
        await saveCheckpoint();
      }
    } catch (error) {
      console.error(`Error processing ${map.mnemonic}:`, error.message);
      results.failures.push(map.mnemonic);
      stats.failed++;
    }
  });
  
  await Promise.all(promises);
}

/**
 * Save checkpoint to file
 */
async function saveCheckpoint() {
  try {
    await fs.writeFile(
      CONFIG.CHECKPOINT_FILE,
      JSON.stringify({
        stats,
        results,
        timestamp: new Date().toISOString()
      }, null, 2)
    );
  } catch (error) {
    console.error('Error saving checkpoint:', error.message);
  }
}

/**
 * Save final results
 */
async function saveResults() {
  try {
    // Ensure directories exist
    await fs.mkdir(path.dirname(CONFIG.OUTPUT_FILE), { recursive: true });
    await fs.mkdir(path.dirname(CONFIG.LOG_FILE), { recursive: true });
    
    // Save creator IDs
    await fs.writeFile(
      CONFIG.OUTPUT_FILE,
      JSON.stringify(results, null, 2)
    );
    
    // Save log
    const logContent = [
      `Creator ID Fetch Complete - ${new Date().toISOString()}`,
      `======================================================`,
      `Total maps: ${stats.total}`,
      `Processed: ${stats.processed}`,
      `Successful: ${stats.success}`,
      `Already had owner_account_id: ${stats.alreadyHaveAccountId}`,
      `Failed: ${stats.failed}`,
      `Duration: ${((Date.now() - stats.startTime) / 1000).toFixed(1)}s`,
      `Average rate: ${(stats.processed / ((Date.now() - stats.startTime) / 1000)).toFixed(1)} maps/s`,
      ``,
      `Errors by type:`,
      ...Object.entries(stats.errors).map(([type, count]) => `  ${type}: ${count}`),
      ``,
      `Failed mnemonics (${results.failures.length}):`,
      ...results.failures.slice(0, 100).map(m => `  ${m}`),
      results.failures.length > 100 ? `  ... and ${results.failures.length - 100} more` : ''
    ].join('\n');
    
    await fs.writeFile(CONFIG.LOG_FILE, logContent);
    
    console.log(`\n✅ Results saved to: ${CONFIG.OUTPUT_FILE}`);
    console.log(`📊 Log saved to: ${CONFIG.LOG_FILE}`);
  } catch (error) {
    console.error('Error saving results:', error);
  }
}

/**
 * Load access token from tokenData.json
 */
async function loadAccessToken() {
  try {
    const tokenPath = path.join(__dirname, '../data/tokenData.json');
    const tokenData = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
    
    // Check if token is expired
    if (tokenData.expires_at) {
      const expiresAt = new Date(tokenData.expires_at);
      if (expiresAt < new Date()) {
        throw new Error('Access token has expired. Please refresh it first.');
      }
    }
    
    return tokenData.access_token;
  } catch (error) {
    console.error('Error loading access token:', error.message);
    throw new Error('Could not load access token from tokenData.json');
  }
}

/**
 * Fetch all maps from Elasticsearch using scroll API
 */
async function fetchAllMaps(esClient) {
  const allMaps = [];
  
  console.log('📥 Starting Elasticsearch scroll...');
  
  // Initial search with scroll
  let response = await esClient.search({
    index: CONFIG.ELASTICSEARCH_INDEX,
    scroll: CONFIG.SCROLL_TIMEOUT,
    size: CONFIG.SCROLL_SIZE,
    body: {
      query: {
        match_all: {}
      },
      _source: ['id', 'metadata']
    }
  });
  
  let scrollId = response._scroll_id;
  let hits = response.hits.hits;
  
  while (hits && hits.length > 0) {
    // Add documents to our array
    allMaps.push(...hits.map(hit => ({
      id: hit._id,
      mnemonic: hit._source.id || hit._id,
      owner_account_id: hit._source.metadata?.owner_account_id,
      owner_name: hit._source.metadata?.owner_name,
      link_type: hit._source.metadata?.link_type,
      namespace: hit._source.metadata?.namespace
    })));
    
    console.log(`  Fetched ${allMaps.length} maps so far...`);
    
    // Get next batch
    response = await esClient.scroll({
      scroll_id: scrollId,
      scroll: CONFIG.SCROLL_TIMEOUT
    });
    
    scrollId = response._scroll_id;
    hits = response.hits.hits;
  }
  
  // Clear scroll context
  if (scrollId) {
    try {
      await esClient.clearScroll({ scroll_id: scrollId });
    } catch (err) {
      // Ignore errors when clearing scroll
    }
  }
  
  return allMaps;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Creator ID Fetch');
  console.log('=============================');
  console.log(`Max concurrency: ${CONFIG.MAX_CONCURRENT_REQUESTS}`);
  console.log(`Namespace: ${CONFIG.NAMESPACE}`);
  console.log(`Elasticsearch Index: ${CONFIG.ELASTICSEARCH_INDEX}`);
  console.log('');
  
  let esClient;
  
  try {
    // Create CSV file and write header
    await fs.mkdir(path.dirname(CONFIG.CSV_FILE), { recursive: true });
    const fsSync = require('fs');
    csvStream = fsSync.createWriteStream(CONFIG.CSV_FILE);
    csvStream.write('mnemonic,accountId,creatorName,linkType,namespace\n');
    
    // Load access token
    console.error('📥 Loading access token...');
    const accessToken = await loadAccessToken();
    console.error('✅ Access token loaded');
    
    // Connect to Elasticsearch
    console.error('📥 Connecting to Elasticsearch...');
    const esUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
    const esConfig = {
      node: esUrl,
      maxRetries: 5,
      requestTimeout: 60000,
      ssl: {
        rejectUnauthorized: false
      }
    };
    
    // Add auth if provided
    if (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
      esConfig.auth = {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD
      };
    }
    
    // Add API key if provided
    if (process.env.ELASTICSEARCH_API_KEY) {
      esConfig.auth = {
        apiKey: process.env.ELASTICSEARCH_API_KEY
      };
    }
    
    esClient = new Client(esConfig);
    
    // Test connection
    await esClient.ping();
    console.error('✅ Elasticsearch connected');
    
    // Get all maps using scroll API
    const maps = await fetchAllMaps(esClient);
    stats.total = maps.length;
    console.error(`✅ Found ${stats.total} maps in Elasticsearch`);
    
    if (maps.length === 0) {
      console.error('⚠️  No maps found in Elasticsearch');
      return;
    }
    
    // Process in batches
    console.error(`\n🔄 Processing maps with ${CONFIG.MAX_CONCURRENT_REQUESTS} concurrent requests...\n`);
    
    for (let i = 0; i < maps.length; i += CONFIG.MAX_CONCURRENT_REQUESTS) {
      const batch = maps.slice(i, i + CONFIG.MAX_CONCURRENT_REQUESTS);
      await processBatch(batch, accessToken, esClient);
    }
    
    // Final statistics
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const rate = (stats.processed / duration).toFixed(1);
    
    console.error('\n');
    console.error('✅ Processing Complete!');
    console.error('======================');
    console.error(`Total maps: ${stats.total}`);
    console.error(`Processed: ${stats.processed}`);
    console.error(`Successful: ${stats.success} (${((stats.success/stats.total)*100).toFixed(1)}%)`);
    console.error(`  - From Elasticsearch: ${stats.alreadyHaveAccountId}`);
    console.error(`  - From API: ${stats.success - stats.alreadyHaveAccountId}`);
    console.error(`Failed: ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(1)}%)`);
    console.error(`Duration: ${duration}s`);
    console.error(`Average rate: ${rate} maps/s`);
    
    if (Object.keys(stats.errors).length > 0) {
      console.error('\nErrors by type:');
      Object.entries(stats.errors).forEach(([type, count]) => {
        console.error(`  ${type}: ${count}`);
      });
    }
    
    // Save results
    await saveResults();
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await saveResults();
    process.exit(1);
  } finally {
    // Close CSV stream
    if (csvStream) {
      csvStream.end();
      console.error(`\n✅ CSV saved to: ${CONFIG.CSV_FILE}`);
    }
    
    // Close Elasticsearch connection
    if (esClient) {
      await esClient.close();
      console.error('👋 Disconnected from Elasticsearch');
    }
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fetchMnemonicInfo };
