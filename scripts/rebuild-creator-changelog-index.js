#!/usr/bin/env node

/**
 * Rebuild Creator Changelog Index
 * 
 * Deletes the existing creator-changelog index (which has incorrect mappings)
 * and recreates it with the proper structure for tracking old vs new values.
 */

const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ES_URL = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_URL });

async function rebuildIndex() {
  console.log('🔨 Rebuilding creator-changelog index\n');
  
  try {
    // 1. Check if index exists
    const exists = await es.indices.exists({ index: 'creator-changelog' });
    
    if (exists) {
      console.log('📦 Existing index found, deleting...');
      await es.indices.delete({ index: 'creator-changelog' });
      console.log('✅ Old index deleted\n');
    } else {
      console.log('ℹ️  No existing index found\n');
    }
    
    // 2. Load new mapping
    const mappingPath = path.join(__dirname, '../elasticsearch-mappings/8-creator-changelog.json');
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    
    console.log('📝 Creating new index with proper mappings...');
    await es.indices.create({
      index: 'creator-changelog',
      body: mapping
    });
    
    console.log('✅ Index created successfully\n');
    
    // 3. Verify mapping
    const newMapping = await es.indices.getMapping({ index: 'creator-changelog' });
    console.log('✅ Verified new mapping:');
    console.log(JSON.stringify(newMapping['creator-changelog'].mappings.properties.changes, null, 2));
    
    console.log('\n✅ Creator changelog index rebuild complete!');
    console.log('ℹ️  Note: All previous changelog entries have been deleted.');
    console.log('   New changes will be tracked with proper old/new values.\n');
    
  } catch (error) {
    console.error('❌ Error rebuilding index:', error.message);
    if (error.meta?.body) {
      console.error('Elasticsearch error:', JSON.stringify(error.meta.body, null, 2));
    }
    process.exit(1);
  }
}

rebuildIndex();
