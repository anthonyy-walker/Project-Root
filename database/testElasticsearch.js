const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

async function testConnection() {
  try {
    console.log('🔍 Testing Elasticsearch connection...\n');
    
    // Test connection
    const info = await client.info();
    console.log('✅ Connected to Elasticsearch!');
    console.log(`   Cluster: ${info.cluster_name}`);
    console.log(`   Version: ${info.version.number}`);
    console.log(`   Lucene: ${info.version.lucene_version}\n`);
    
    // Test health
    const health = await client.cluster.health();
    console.log('📊 Cluster Health:');
    console.log(`   Status: ${health.status} ${health.status === 'green' ? '✅' : health.status === 'yellow' ? '⚠️' : '❌'}`);
    console.log(`   Nodes: ${health.number_of_nodes}`);
    console.log(`   Data Nodes: ${health.number_of_data_nodes}`);
    console.log(`   Active Shards: ${health.active_shards}\n`);
    
    // List existing indexes
    const indices = await client.cat.indices({ format: 'json' });
    console.log('📑 Existing Indexes:');
    if (indices.length === 0) {
      console.log('   None yet\n');
    } else {
      indices.forEach(index => {
        console.log(`   - ${index.index} (${index['docs.count']} docs, ${index['store.size']})`);
      });
      console.log('');
    }
    
    console.log('✅ Elasticsearch is ready!\n');
    return true;
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Is Elasticsearch running? (http://localhost:9200)');
    console.error('2. Check service: elasticsearch-service.bat status');
    console.error('3. Check logs: C:\\elasticsearch\\logs\\');
    return false;
  }
}

// Run test if executed directly
if (require.main === module) {
  testConnection()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('Unexpected error:', err);
      process.exit(1);
    });
}

module.exports = { client, testConnection };
