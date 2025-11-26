#!/usr/bin/env node

/**
 * Bootstrap Script - Project Root
 * 
 * Creates Elasticsearch indices and loads seed data:
 * - 266,865 unique map codes
 * - 160,726 unique creator IDs
 */

const { Client } = require('@elastic/elasticsearch');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const ES_HOST = 'http://localhost:9200';
const BATCH_SIZE = 5000; // Bulk insert batch size

// Initialize ES client (ES 8.x client with ES 8.19 server)
const client = new Client({ node: ES_HOST });

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(color, symbol, message) {
  console.log(`${color}${symbol} ${message}${colors.reset}`);
}

/**
 * Create index with mapping from JSON file
 */
async function createIndex(indexName, mappingFile) {
  try {
    // Check if index already exists
    const exists = await client.indices.exists({ index: indexName });
    
    if (exists) {
      log(colors.yellow, '⚠️ ', `Index "${indexName}" already exists, skipping`);
      return false;
    }
    
    // Read mapping file
    const mappingPath = path.join(__dirname, 'elasticsearch-mappings', mappingFile);
    const mapping = JSON.parse(await fs.readFile(mappingPath, 'utf8'));
    
    // Create index
    await client.indices.create({
      index: indexName,
      body: mapping
    });
    
    log(colors.green, '✓', `Created index: ${indexName}`);
    return true;
  } catch (error) {
    log(colors.red, '✗', `Failed to create ${indexName}: ${error.message}`);
    throw error;
  }
}

/**
 * Create index template (for time-series indices)
 */
async function createTemplate(templateName, templateFile) {
  try {
    const templatePath = path.join(__dirname, 'elasticsearch-mappings', templateFile);
    const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
    
    await client.indices.putIndexTemplate({
      name: templateName,
      body: template
    });
    
    log(colors.green, '✓', `Created template: ${templateName}`);
    return true;
  } catch (error) {
    log(colors.red, '✗', `Failed to create template ${templateName}: ${error.message}`);
    throw error;
  }
}

/**
 * Load seed data from CSV file
 */
async function loadSeedData(filePath, indexName, type) {
  const startTime = Date.now();
  let processed = 0;
  let batch = [];
  
  const fileStream = require('fs').createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  log(colors.blue, '⏳', `Loading ${type} from ${path.basename(filePath)}...`);
  
  for await (const line of rl) {
    const id = line.trim();
    if (!id) continue;
    
    // Build document based on type
    const doc = {
      id: id,
      metadata: {
        first_indexed: new Date(),
        ingestion_source: 'bootstrap_seed_data',
        last_updated: new Date()
      }
    };
    
    if (type === 'creators') {
      doc.account_id = id;
      doc.totals = {
        maps_created: 0,
        total_plays: 0,
        total_favorites: 0,
        total_followers: 0
      };
    }
    
    // Add to batch
    batch.push({ index: { _index: indexName, _id: id } });
    batch.push(doc);
    processed++;
    
    // Bulk insert when batch is full
    if (batch.length >= BATCH_SIZE * 2) {
      await client.bulk({ body: batch, refresh: false });
      batch = [];
      process.stdout.write(`\r${colors.blue}⏳ Loaded ${processed.toLocaleString()} ${type}...${colors.reset}`);
    }
  }
  
  // Insert remaining batch
  if (batch.length > 0) {
    await client.bulk({ body: batch, refresh: false });
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(''); // New line after progress
  log(colors.green, '✓', `Loaded ${processed.toLocaleString()} ${type} in ${elapsed}s`);
  
  return processed;
}

/**
 * Main bootstrap function
 */
async function bootstrap() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Project Root - Elasticsearch Bootstrap      ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  try {
    // 1. Check Elasticsearch connection
    log(colors.blue, '⏳', 'Checking Elasticsearch connection...');
    const info = await client.info();
    log(colors.green, '✓', `Connected to Elasticsearch ${info.version.number}`);
    
    // 2. Create indices
    log(colors.blue, '\n⏳', 'Creating indices...');
    await createIndex('maps', '1-maps.json');
    await createIndex('creators', '2-creators.json');
    await createTemplate('concurrent-users-template', '3-concurrent-users-template.json');
    await createIndex('discovery-current', '4-discovery-current.json');
    await createIndex('discovery-events', '5-discovery-events.json');
    await createIndex('discovery-daily', '6-discovery-daily.json');
    await createIndex('map-changelog', '7-map-changelog.json');
    await createIndex('creator-changelog', '8-creator-changelog.json');
    await createIndex('creator-favorites', '9-creator-favorites.json');
    
    // Create initial CCU index for current month (use basic mapping, not template)
    const currentMonth = new Date().toISOString().slice(0, 7);
    const ccuMapping = {
      mappings: {
        properties: {
          map_id: { type: 'keyword' },
          ccu: { type: 'integer' },
          timestamp: { type: 'date' },
          source: { type: 'keyword' }
        }
      }
    };
    
    await client.indices.create({
      index: `concurrent-users-${currentMonth}`,
      body: ccuMapping
    });
    log(colors.green, '✓', `Created index: concurrent-users-${currentMonth}`);
    
    // 3. Load seed data
    log(colors.blue, '\n⏳', 'Loading seed data...');
    
    const mapsPath = path.join(__dirname, 'seed-data', 'unique_maps.csv');
    const creatorsPath = path.join(__dirname, 'seed-data', 'unique_creators.csv');
    
    const mapsCount = await loadSeedData(mapsPath, 'maps', 'maps');
    const creatorsCount = await loadSeedData(creatorsPath, 'creators', 'creators');
    
    // 4. Refresh indices
    log(colors.blue, '\n⏳', 'Refreshing indices...');
    await client.indices.refresh({ index: 'maps,creators' });
    log(colors.green, '✓', 'Indices refreshed');
    
    // 5. Verify data
    log(colors.blue, '\n⏳', 'Verifying data...');
    const mapsStats = await client.count({ index: 'maps' });
    const creatorsStats = await client.count({ index: 'creators' });
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║              Bootstrap Complete!               ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`\n  Maps indexed:     ${mapsStats.count.toLocaleString()} / ${mapsCount.toLocaleString()}`);
    console.log(`  Creators indexed: ${creatorsStats.count.toLocaleString()} / ${creatorsCount.toLocaleString()}`);
    console.log(`\n  Cluster:  ${info.cluster_name}`);
    console.log(`  Node:     ${info.name}`);
    console.log(`  Version:  ${info.version.number}\n`);
    
    if (mapsStats.count === mapsCount && creatorsStats.count === creatorsCount) {
      log(colors.green, '✓', 'All data verified successfully!\n');
      process.exit(0);
    } else {
      log(colors.yellow, '⚠️ ', 'Data count mismatch - some records may have failed\n');
      process.exit(1);
    }
    
  } catch (error) {
    log(colors.red, '\n✗', `Bootstrap failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run bootstrap
bootstrap();
