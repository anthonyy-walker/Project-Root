const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');

const es = new Client({ node: 'http://159.89.229.112:9200' });

async function createIndex() {
  try {
    console.log('Creating creator-follower-history index...');
    
    const mapping = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../elasticsearch-mappings/4-creator-follower-history.json'),
        'utf8'
      )
    );
    
    const exists = await es.indices.exists({ index: 'creator-follower-history' });
    
    if (exists) {
      console.log('Index already exists. Deleting...');
      await es.indices.delete({ index: 'creator-follower-history' });
    }
    
    await es.indices.create({
      index: 'creator-follower-history',
      body: mapping
    });
    
    console.log('✅ Index created successfully');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createIndex();
