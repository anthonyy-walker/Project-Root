#!/usr/bin/env node

/**
 * Test Creator Change Detection
 * 
 * Tests the updated detectChanges function to ensure it properly
 * tracks old vs new values and only logs real changes.
 */

const { Client } = require('@elastic/elasticsearch');
const { getCreatorDetails } = require('../EpicGames/apis/popsAPI');
const { initializeAuth, getAccessToken, getAccountId } = require('../workers/utils/auth-helper');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ES_URL = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_URL });

/**
 * Detect changes between old and new creator data (POPS fields only)
 * Only detects changes when POPS API actually provides data (not null/undefined)
 * and that data differs from what we have stored
 */
function detectChanges(oldDoc, popsData) {
 const changes = {};

 // Check display name - only if POPS provides one AND it's different
 if (popsData?.displayName !== undefined && 
     popsData.displayName !== null && 
     popsData.displayName !== oldDoc.display_name) {
   changes.display_name = { 
     old: oldDoc.display_name || null, 
     new: popsData.displayName 
   };
 }

 // Check bio - only if POPS provides one AND it's different
 if (popsData?.bio !== undefined && 
     popsData.bio !== null && 
     popsData.bio !== oldDoc.bio) {
   changes.bio = { 
     old: oldDoc.bio || null, 
     new: popsData.bio 
   };
 }

 // Check avatar image
 if (popsData?.images?.avatar !== undefined &&
     popsData.images.avatar !== null &&
     popsData.images.avatar !== oldDoc.images?.avatar) {
   changes.avatar = {
     old: oldDoc.images?.avatar || null,
     new: popsData.images.avatar
   };
 }

 // Check banner image
 if (popsData?.images?.banner !== undefined &&
     popsData.images.banner !== null &&
     popsData.images.banner !== oldDoc.images?.banner) {
   changes.banner = {
     old: oldDoc.images?.banner || null,
     new: popsData.images.banner
   };
 }

 // Check social links - only track if they're actually different
 if (popsData?.social) {
   const oldSocial = oldDoc.social || {};
   const newSocial = popsData.social || {};
   
   // Check each platform individually for better changelog granularity
   ['youtube', 'twitter', 'twitch', 'instagram', 'tiktok'].forEach(platform => {
     const oldValue = oldSocial[platform] || null;
     const newValue = newSocial[platform] || null;
     
     if (newValue !== oldValue) {
       if (!changes.social) {
         changes.social = {};
       }
       changes.social[platform] = {
         old: oldValue,
         new: newValue
       };
     }
   });
 }

 return Object.keys(changes).length > 0 ? changes : null;
}

async function testCreator(creatorId) {
  console.log(`\n🧪 Testing creator: ${creatorId}`);
  console.log('='.repeat(60));
  
  try {
    // Initialize auth
    await initializeAuth();
    const accessToken = await getAccessToken();
    const accountId = await getAccountId();
    
    // Get existing doc from ES
    const existing = await es.get({
      index: 'creators',
      id: creatorId
    }).catch(() => null);
    
    if (!existing) {
      console.log('❌ Creator not found in Elasticsearch');
      return;
    }
    
    console.log('\n📦 Current data in Elasticsearch:');
    console.log(`  Display Name: ${existing._source.display_name}`);
    console.log(`  Bio: ${existing._source.bio || '(empty)'}`);
    console.log(`  Follower Count: ${existing._source.follower_count}`);
    console.log(`  Avatar: ${existing._source.images?.avatar?.substring(0, 50)}...`);
    
    // Fetch fresh data from POPS API
    console.log('\n🌐 Fetching fresh data from POPS API...');
    const popsData = await getCreatorDetails(creatorId, accessToken, accountId);
    
    if (!popsData) {
      console.log('❌ No POPS data available for this creator');
      return;
    }
    
    console.log('\n📡 Fresh data from POPS API:');
    console.log(`  Display Name: ${popsData.displayName}`);
    console.log(`  Bio: ${popsData.bio || '(empty)'}`);
    console.log(`  Follower Count: ${popsData.followerCount}`);
    console.log(`  Avatar: ${popsData.images?.avatar?.substring(0, 50)}...`);
    
    // Detect changes
    console.log('\n🔍 Detecting changes...');
    const changes = detectChanges(existing._source, popsData);
    
    if (changes) {
      console.log('✅ Changes detected:');
      console.log(JSON.stringify(changes, null, 2));
      
      // Save to changelog
      console.log('\n💾 Saving to changelog...');
      const result = await es.index({
        index: 'creator-changelog',
        body: {
          creator_id: creatorId,
          snapshot: {
            ...existing._source,
            display_name: popsData.displayName || existing._source.display_name,
            bio: popsData.bio || existing._source.bio,
            follower_count: popsData.followerCount || existing._source.follower_count
          },
          changes: changes,
          timestamp: new Date(),
          source: 'manual_test'
        }
      });
      console.log(`✅ Saved to changelog: ${result._id}`);
      
    } else {
      console.log('✅ No changes detected (data is identical)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.meta?.body) {
      console.error('ES Error:', JSON.stringify(error.meta.body, null, 2));
    }
  }
}

async function runTests() {
  console.log('🚀 Creator Change Detection Test\n');
  
  // Test with the creator from the example
  await testCreator('5c4c11ba627d46cdbf526e244e526e3d');
  
  // Find another creator to test
  console.log('\n\n🔍 Finding additional creators to test...');
  const result = await es.search({
    index: 'creators',
    size: 3,
    body: {
      query: {
        bool: {
          must_not: [
            { term: { 'account_id': '5c4c11ba627d46cdbf526e244e526e3d' } }
          ]
        }
      }
    }
  });
  
  for (const hit of result.hits.hits) {
    await testCreator(hit._id);
  }
  
  console.log('\n\n✅ Test complete!');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
