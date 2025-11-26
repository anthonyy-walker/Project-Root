#!/usr/bin/env node

/**
 * Kibana Data Views Setup Script
 * Creates data views (index patterns) for all Project Root indices
 */

const http = require('http');

const KIBANA_URL = 'http://localhost:5601';
const ES_URL = 'http://localhost:9200';

const dataViews = [
  {
    id: 'maps-data-view',
    title: 'maps',
    name: 'Maps',
    timeFieldName: 'metadata.last_synced'
  },
  {
    id: 'creators-data-view',
    title: 'creators',
    name: 'Creators',
    timeFieldName: 'metadata.last_synced'
  },
  {
    id: 'concurrent-users-data-view',
    title: 'concurrent-users-*',
    name: 'Concurrent Users (All Time)',
    timeFieldName: 'timestamp'
  },
  {
    id: 'discovery-current-data-view',
    title: 'discovery-current',
    name: 'Discovery Current',
    timeFieldName: 'first_seen'
  },
  {
    id: 'discovery-events-data-view',
    title: 'discovery-events',
    name: 'Discovery Events',
    timeFieldName: 'timestamp'
  },
  {
    id: 'map-changelog-data-view',
    title: 'map-changelog',
    name: 'Map Changelog',
    timeFieldName: 'timestamp'
  },
  {
    id: 'creator-changelog-data-view',
    title: 'creator-changelog',
    name: 'Creator Changelog',
    timeFieldName: 'timestamp'
  }
];

/**
 * Make HTTP request
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Check if Kibana is ready
 */
async function waitForKibana() {
  const maxAttempts = 30;
  let attempt = 0;
  
  console.log('🔍 Checking Kibana status...');
  
  while (attempt < maxAttempts) {
    try {
      await makeRequest({
        hostname: 'localhost',
        port: 5601,
        path: '/api/status',
        method: 'GET',
        headers: {
          'kbn-xsrf': 'true'
        }
      });
      console.log('✅ Kibana is ready!\n');
      return true;
    } catch (error) {
      attempt++;
      if (attempt < maxAttempts) {
        process.stdout.write(`\r⏳ Waiting for Kibana... (${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  throw new Error('Kibana did not become ready in time');
}

/**
 * Check if index exists in Elasticsearch
 */
async function checkIndexExists(indexPattern) {
  try {
    await makeRequest({
      hostname: 'localhost',
      port: 9200,
      path: `/${indexPattern}/_count`,
      method: 'GET'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Create a data view in Kibana
 */
async function createDataView(dataView) {
  try {
    // Check if index exists first
    const exists = await checkIndexExists(dataView.title);
    if (!exists) {
      console.log(`⏭️  Skipping ${dataView.name} - index not found`);
      return false;
    }
    
    const payload = {
      data_view: {
        title: dataView.title,
        name: dataView.name,
        timeFieldName: dataView.timeFieldName
      }
    };
    
    const result = await makeRequest({
      hostname: 'localhost',
      port: 5601,
      path: '/api/data_views/data_view',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'kbn-xsrf': 'true'
      }
    }, payload);
    
    console.log(`✅ Created data view: ${dataView.name}`);
    return true;
  } catch (error) {
    if (error.message.includes('Duplicate')) {
      console.log(`ℹ️  Data view already exists: ${dataView.name}`);
      return true;
    } else {
      console.error(`❌ Failed to create ${dataView.name}:`, error.message);
      return false;
    }
  }
}

/**
 * List existing data views
 */
async function listDataViews() {
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 5601,
      path: '/api/data_views',
      method: 'GET',
      headers: {
        'kbn-xsrf': 'true'
      }
    });
    
    return result.data_view || [];
  } catch (error) {
    console.error('Failed to list data views:', error.message);
    return [];
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Kibana Data Views Setup - Project Root      ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  try {
    // Wait for Kibana to be ready
    await waitForKibana();
    
    // Check existing data views
    console.log('📋 Checking existing data views...\n');
    const existing = await listDataViews();
    console.log(`Found ${existing.length} existing data views\n`);
    
    // Create each data view
    console.log('🔨 Creating data views...\n');
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const dataView of dataViews) {
      const result = await createDataView(dataView);
      if (result) {
        created++;
      } else {
        skipped++;
      }
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
    }
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║              Setup Complete!                   ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    console.log(`✅ Created: ${created}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Failed: ${failed}\n`);
    console.log(`🌐 Access Kibana at: ${KIBANA_URL}`);
    console.log(`📊 Go to: Stack Management > Data Views\n`);
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { createDataView, listDataViews };
