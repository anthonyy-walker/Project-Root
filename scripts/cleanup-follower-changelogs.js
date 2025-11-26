#!/usr/bin/env node

/**
 * Clean up follower count changes from creator-changelog
 * Removes entries that ONLY have follower_count changes
 */

const { Client } = require('@elastic/elasticsearch');

const es = new Client({ node: 'http://159.89.229.112:9200' });

async function cleanupFollowerChangelogs() {
  console.log('🧹 Cleaning up follower-only changes from creator-changelog...\n');
  
  try {
    let deletedCount = 0;
    let scrollId = null;
    
    // Search for all changelog entries
    let response = await es.search({
      index: 'creator-changelog',
      scroll: '2m',
      size: 100,
      body: {
        query: { match_all: {} }
      }
    });
    
    scrollId = response._scroll_id;
    let hits = response.hits.hits;
    
    while (hits.length > 0) {
      for (const hit of hits) {
        const changes = hit._source.changes;
        
        // Check if this entry ONLY has follower changes
        if (changes) {
          const changeKeys = Object.keys(changes);
          const onlyFollowerChanges = changeKeys.length === 1 && 
            (changeKeys.includes('follower_count') || changeKeys.includes('followers'));
          
          if (onlyFollowerChanges) {
            // Delete this entry
            await es.delete({
              index: 'creator-changelog',
              id: hit._id
            });
            deletedCount++;
            
            if (deletedCount % 10 === 0) {
              process.stdout.write(`\r   Deleted: ${deletedCount}`);
            }
          }
        }
      }
      
      // Get next batch
      response = await es.scroll({
        scroll_id: scrollId,
        scroll: '2m'
      });
      
      hits = response.hits.hits;
    }
    
    // Clear scroll
    if (scrollId) {
      await es.clearScroll({ scroll_id: scrollId });
    }
    
    console.log(`\n\n✅ Cleanup complete!`);
    console.log(`   Deleted: ${deletedCount} follower-only changelog entries`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanupFollowerChangelogs().then(() => process.exit(0));
