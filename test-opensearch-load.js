const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// OpenSearch configuration
const OPENSEARCH_HOST = process.env.OPENSEARCH_HOST || 'https://vpc-fncreategg-uvqqs2rgbr53urneyxrzgki6m4.us-east-1.es.amazonaws.com';
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME;
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD;

// Rate limiting configuration
const BATCH_SIZE = 100;  // Number of documents per batch
const BATCH_DELAY = 1000; // Delay between batches in milliseconds
const MAX_RETRIES = 3;

// Initialize OpenSearch client configuration
const clientConfig = {
  node: OPENSEARCH_HOST,
  ssl: {
    rejectUnauthorized: false
  },
  requestTimeout: 30000,
  maxRetries: 3
};

// Add authentication if credentials are provided
if (OPENSEARCH_USERNAME && OPENSEARCH_PASSWORD) {
  clientConfig.auth = {
    username: OPENSEARCH_USERNAME,
    password: OPENSEARCH_PASSWORD
  };
  console.log('Using basic authentication');
}

const client = new Client(clientConfig);

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test connection to OpenSearch
async function testConnection() {
  try {
    console.log('Testing OpenSearch connection...');
    const health = await client.cluster.health();
    console.log('✓ Connection successful!');
    console.log('Cluster status:', health.status);
    console.log('Cluster name:', health.cluster_name);
    return true;
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
    return false;
  }
}

// Load JSON data from file
function loadJSONData(filename) {
  try {
    const filePath = path.join(__dirname, '..', filename);
    console.log(`Loading data from: ${filePath}`);
    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);
    
    // Extract documents from Elasticsearch export format
    if (data.hits && data.hits.hits) {
      return data.hits.hits;
    }
    return data;
  } catch (error) {
    console.error(`Error loading ${filename}:`, error.message);
    return [];
  }
}

// Index documents in batches with rate limiting
async function indexDocuments(indexName, documents, retryCount = 0) {
  if (documents.length === 0) {
    console.log(`No documents to index for ${indexName}`);
    return { success: 0, errors: 0 };
  }

  let successCount = 0;
  let errorCount = 0;

  console.log(`\nIndexing ${documents.length} documents to ${indexName}...`);
  
  // Process in batches
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(documents.length / BATCH_SIZE);
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} documents)`);
    
    try {
      // Prepare bulk operations
      const operations = batch.flatMap(doc => {
        const id = doc._id || doc._source?.id;
        const source = doc._source || doc;
        
        return [
          { index: { _index: indexName, _id: id } },
          source
        ];
      });

      // Execute bulk operation
      const response = await client.bulk({
        refresh: false,
        operations
      });

      // Check for errors
      if (response.errors) {
        const errors = response.items.filter(item => item.index.error);
        errorCount += errors.length;
        successCount += batch.length - errors.length;
        
        console.log(`  ✓ ${batch.length - errors.length} successful, ✗ ${errors.length} errors`);
        
        // Log first error for debugging
        if (errors.length > 0) {
          console.log('  Sample error:', JSON.stringify(errors[0].index.error, null, 2));
        }
      } else {
        successCount += batch.length;
        console.log(`  ✓ ${batch.length} documents indexed successfully`);
      }

      // Rate limiting delay between batches
      if (i + BATCH_SIZE < documents.length) {
        await sleep(BATCH_DELAY);
      }
    } catch (error) {
      console.error(`  ✗ Batch error:`, error.message);
      errorCount += batch.length;
      
      // Retry logic
      if (retryCount < MAX_RETRIES && error.message.includes('rate')) {
        console.log(`  Retrying batch after delay (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await sleep(BATCH_DELAY * 2);
        // Retry just this batch
        const retryResult = await indexDocuments(indexName, batch, retryCount + 1);
        successCount += retryResult.success;
        errorCount = errorCount - batch.length + retryResult.errors;
      }
    }
  }

  return { success: successCount, errors: errorCount };
}

// Check if index exists
async function checkIndex(indexName) {
  try {
    const exists = await client.indices.exists({ index: indexName });
    return exists;
  } catch (error) {
    console.error(`Error checking index ${indexName}:`, error.message);
    return false;
  }
}

// Get index stats
async function getIndexStats(indexName) {
  try {
    const stats = await client.indices.stats({ index: indexName });
    return stats.indices[indexName];
  } catch (error) {
    console.error(`Error getting stats for ${indexName}:`, error.message);
    return null;
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('OpenSearch Data Loading Test');
  console.log('='.repeat(60));
  
  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.log('\nPlease check your OpenSearch connection and try again.');
    process.exit(1);
  }

  console.log('\n' + '-'.repeat(60));
  console.log('Loading Creators Data');
  console.log('-'.repeat(60));
  
  // Load creators data
  const creators = loadJSONData('creators.json');
  console.log(`Loaded ${creators.length} creators from file`);
  
  // Check if creators index exists
  const creatorsExists = await checkIndex('creators');
  console.log(`Creators index exists: ${creatorsExists}`);
  
  if (creatorsExists) {
    const stats = await getIndexStats('creators');
    if (stats) {
      console.log(`Current document count: ${stats.total.docs.count}`);
    }
  }
  
  // Index creators
  const creatorsResult = await indexDocuments('creators', creators);
  console.log(`\nCreators Results: ${creatorsResult.success} successful, ${creatorsResult.errors} errors`);

  console.log('\n' + '-'.repeat(60));
  console.log('Loading Maps Data');
  console.log('-'.repeat(60));
  
  // Load maps data
  const maps = loadJSONData('maps.json');
  console.log(`Loaded ${maps.length} maps from file`);
  
  // Check if maps index exists
  const mapsExists = await checkIndex('maps');
  console.log(`Maps index exists: ${mapsExists}`);
  
  if (mapsExists) {
    const stats = await getIndexStats('maps');
    if (stats) {
      console.log(`Current document count: ${stats.total.docs.count}`);
    }
  }
  
  // Index maps
  const mapsResult = await indexDocuments('maps', maps);
  console.log(`\nMaps Results: ${mapsResult.success} successful, ${mapsResult.errors} errors`);

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Creators: ${creatorsResult.success}/${creators.length} indexed`);
  console.log(`Maps: ${mapsResult.success}/${maps.length} indexed`);
  console.log(`Total errors: ${creatorsResult.errors + mapsResult.errors}`);
  
  // Final index stats
  console.log('\nFinal Index Stats:');
  const finalCreatorsStats = await getIndexStats('creators');
  if (finalCreatorsStats) {
    console.log(`  creators: ${finalCreatorsStats.total.docs.count} documents`);
  }
  
  const finalMapsStats = await getIndexStats('maps');
  if (finalMapsStats) {
    console.log(`  maps: ${finalMapsStats.total.docs.count} documents`);
  }
  
  console.log('\n✓ Data loading complete!');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
