#!/usr/bin/env node

/**
 * Test Creator Change Detection with Simulated Changes
 * 
 * This script simulates changes to test the changelog functionality.
 */

const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ES_URL = process.env.ELASTICSEARCH_URL;
const es = new Client({ node: ES_URL });

/**
 * Detect changes function (same as in worker)
 */
function detectChanges(oldDoc, popsData) {
 const changes = {};

 if (popsData?.displayName !== undefined && 
     popsData.displayName !== null && 
     popsData.displayName !== oldDoc.display_name) {
   changes.display_name = { 
     old: oldDoc.display_name || null, 
     new: popsData.displayName 
   };
 }

 if (popsData?.bio !== undefined && 
     popsData.bio !== null && 
     popsData.bio !== oldDoc.bio) {
   changes.bio = { 
     old: oldDoc.bio || null, 
     new: popsData.bio 
   };
 }

 if (popsData?.images?.avatar !== undefined &&
     popsData.images.avatar !== null &&
     popsData.images.avatar !== oldDoc.images?.avatar) {
   changes.avatar = {
     old: oldDoc.images?.avatar || null,
     new: popsData.images.avatar
   };
 }

 if (popsData?.social) {
   const oldSocial = oldDoc.social || {};
   const newSocial = popsData.social || {};
   
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

async function testSimulatedChanges() {
  console.log('🧪 Testing Creator Changelog with Simulated Changes\n');
  
  const testCreatorId = '5c4c11ba627d46cdbf526e244e526e3d';
  
  // 1. Get current state
  console.log('📦 Step 1: Get current creator state');
  const current = await es.get({
    index: 'creators',
    id: testCreatorId
  });
  
  console.log('Current display_name:', current._source.display_name);
  console.log('Current bio:', current._source.bio || '(null)');
  console.log('Current youtube:', current._source.social?.youtube || '(null)');
  
  // 2. Simulate POPS API response with changes
  console.log('\n🔄 Step 2: Simulate POPS API with changes');
  const simulatedPopsData = {
    displayName: 'ciagov_updated',  // Changed
    bio: 'This is a test bio',       // Changed from null
    followerCount: 5,                 // Changed from 3
    images: current._source.images,   // Same
    social: {
      youtube: 'https://youtube.com/@ciagov',  // Changed from null
      twitter: null,
      twitch: null,
      instagram: null,
      tiktok: null
    }
  };
  
  console.log('Simulated display_name:', simulatedPopsData.displayName);
  console.log('Simulated bio:', simulatedPopsData.bio);
  console.log('Simulated youtube:', simulatedPopsData.social.youtube);
  
  // 3. Detect changes
  console.log('\n🔍 Step 3: Detect changes');
  const changes = detectChanges(current._source, simulatedPopsData);
  
  if (changes) {
    console.log('✅ Changes detected:');
    console.log(JSON.stringify(changes, null, 2));
    
    // 4. Save to changelog
    console.log('\n💾 Step 4: Save to changelog');
    const changelogEntry = {
      creator_id: testCreatorId,
      snapshot: {
        ...current._source,
        display_name: simulatedPopsData.displayName,
        bio: simulatedPopsData.bio,
        follower_count: simulatedPopsData.followerCount,
        social: simulatedPopsData.social
      },
      changes: changes,
      timestamp: new Date(),
      source: 'simulated_test'
    };
    
    const result = await es.index({
      index: 'creator-changelog',
      body: changelogEntry
    });
    
    console.log(`✅ Changelog entry saved: ${result._id}`);
    
    // 5. Verify it was saved correctly
    console.log('\n✅ Step 5: Verify changelog entry');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for ES refresh
    
    const saved = await es.get({
      index: 'creator-changelog',
      id: result._id
    });
    
    console.log('\nSaved changelog entry:');
    console.log(JSON.stringify(saved._source, null, 2));
    
    // 6. Test querying for specific changes
    console.log('\n🔍 Step 6: Query for display_name changes');
    const displayNameChanges = await es.search({
      index: 'creator-changelog',
      body: {
        query: {
          exists: { field: 'changes.display_name' }
        },
        size: 5,
        sort: [{ timestamp: 'desc' }]
      }
    });
    
    console.log(`Found ${displayNameChanges.hits.total.value} display_name changes:`);
    displayNameChanges.hits.hits.forEach(hit => {
      const c = hit._source.changes.display_name;
      console.log(`  ${hit._source.creator_id}: "${c.old}" → "${c.new}" at ${hit._source.timestamp}`);
    });
    
  } else {
    console.log('❌ No changes detected (unexpected)');
  }
  
  console.log('\n✅ Test complete!');
}

testSimulatedChanges().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
