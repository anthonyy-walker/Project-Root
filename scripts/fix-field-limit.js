#!/usr/bin/env node

/**
 * Fix Field Limit Issue
 * 
 * Updates the maps index to:
 * 1. Increase field limit from 1000 to 2000
 * 2. Add mappings for localized fields and raw_metadata as non-indexed objects
 */

const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  }
});

const INDEX_NAME = 'maps';

async function fixFieldLimit() {
  console.log('🔧 Fixing Field Limit Issue\n');
  console.log('=' .repeat(80));
  
  try {
    // Step 1: Close the index (required to update total_fields.limit)
    console.log('\n📋 Step 1: Closing index to update settings');
    await client.indices.close({ index: INDEX_NAME });
    console.log('✅ Index closed');
    
    // Step 2: Update the field limit setting
    console.log('\n📋 Step 2: Increasing field limit to 2000');
    await client.indices.putSettings({
      index: INDEX_NAME,
      body: {
        'index.mapping.total_fields.limit': 2000
      }
    });
    console.log('✅ Field limit increased to 2000');
    
    // Step 3: Reopen the index
    console.log('\n📋 Step 3: Reopening index');
    await client.indices.open({ index: INDEX_NAME });
    console.log('✅ Index reopened');
    
    // Step 4: Add new field mappings for non-indexed objects
    console.log('\n📋 Step 4: Adding mappings for non-indexed fields');
    await client.indices.putMapping({
      index: INDEX_NAME,
      body: {
        properties: {
          localized_titles: {
            type: 'object',
            enabled: false
          },
          localized_descriptions: {
            type: 'object',
            enabled: false
          },
          localized_taglines: {
            type: 'object',
            enabled: false
          },
          raw_metadata: {
            type: 'object',
            enabled: false
          }
        }
      }
    });
    console.log('✅ Non-indexed field mappings added');
    
    // Step 5: Verify settings
    console.log('\n📋 Step 5: Verifying settings');
    const settings = await client.indices.getSettings({ index: INDEX_NAME });
    const fieldLimit = settings[INDEX_NAME].settings.index.mapping.total_fields.limit;
    console.log(`✅ Current field limit: ${fieldLimit}`);
    
    // Step 6: Get current field count
    const mapping = await client.indices.getMapping({ index: INDEX_NAME });
    const fieldCount = countFields(mapping[INDEX_NAME].mappings.properties);
    console.log(`✅ Current field count: ${fieldCount}`);
    console.log(`   Headroom: ${fieldLimit - fieldCount} fields available`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Field limit fix complete!\n');
    console.log('⚠️  Note: Existing documents with the old "metadata" field structure');
    console.log('   will continue to work. New documents will use "raw_metadata".');
    console.log('   Consider running a reindex if you need consistency.\n');
    
    return {
      index: INDEX_NAME,
      fieldLimit: parseInt(fieldLimit),
      currentFields: fieldCount,
      headroom: fieldLimit - fieldCount
    };
    
  } catch (error) {
    console.error('\n❌ Fix failed:', error.message);
    
    // Try to reopen index if it's closed
    try {
      await client.indices.open({ index: INDEX_NAME });
      console.log('⚠️  Reopened index after error');
    } catch (reopenError) {
      // Index might already be open
    }
    
    throw error;
  }
}

/**
 * Recursively count fields in a mapping
 */
function countFields(properties, depth = 0) {
  let count = 0;
  
  for (const [key, value] of Object.entries(properties)) {
    count++; // Count this field
    
    // If it has nested properties, count those too
    if (value.properties) {
      count += countFields(value.properties, depth + 1);
    }
    
    // If it has fields (multi-fields), count those too
    if (value.fields) {
      count += countFields(value.fields, depth + 1);
    }
  }
  
  return count;
}

// Run if executed directly
if (require.main === module) {
  fixFieldLimit()
    .then((result) => {
      console.log('Summary:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { fixFieldLimit };
