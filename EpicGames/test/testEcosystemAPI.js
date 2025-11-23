/**
 * Test Ecosystem API
 * Validates the new Fortnite Ecosystem API integration
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const fs = require('fs');

const {
  getIslandMetrics,
  getPeakCCU,
  getMinutesPlayed,
  getUniquePlayers,
  getPlays,
  getFavorites,
  getRecommendations,
  getAverageMinutesPerPlayer,
  getRetention,
  getIslandMetadata,
  getAllIslands,
  getLast7DaysMetrics
} = require('../apis/ecosystemAPI');

const ACCESS_TOKEN = process.env.EPIC_ACCESS_TOKEN;
const OUTPUT_DIR = path.join(__dirname, 'endpoint_responses');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function saveResponse(filename, data) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved: ${filename}`);
}

async function testEcosystemAPI() {
  console.log('\n🚀 TESTING FORTNITE ECOSYSTEM API');
  console.log('═══════════════════════════════════════════════════════\n');

  const testMapCode = '8530-0110-2817'; // PEELY VS JONESY

  try {
    // Test 1: Get Island Metadata
    console.log('📋 Test 1: Island Metadata');
    console.log('─────────────────────────────────────────────────────');
    try {
      const metadata = await getIslandMetadata(testMapCode, ACCESS_TOKEN);
      console.log(`✅ Island: ${metadata.title || metadata.code}`);
      console.log(`   Creator: ${metadata.creatorCode || 'Unknown'}`);
      console.log(`   Category: ${metadata.category || 'N/A'}`);
      console.log(`   Tags: ${metadata.tags?.join(', ') || 'N/A'}`);
      saveResponse('ecosystem_metadata.json', metadata);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    console.log('');

    // Test 2: Get Last 7 Days - All Metrics Combined
    console.log('📊 Test 2: Last 7 Days - All Metrics (Single Request)');
    console.log('─────────────────────────────────────────────────────');
    try {
      const sevenDaysMetrics = await getLast7DaysMetrics(testMapCode, ACCESS_TOKEN);
      
      // Count data points
      const peakCCUPoints = sevenDaysMetrics.peakCCU?.length || 0;
      const minutesPlayedPoints = sevenDaysMetrics.minutesPlayed?.length || 0;
      const uniquePlayersPoints = sevenDaysMetrics.uniquePlayers?.length || 0;
      const playsPoints = sevenDaysMetrics.plays?.length || 0;
      
      console.log(`✅ Data collected for last 7 days:`);
      console.log(`   Peak CCU: ${peakCCUPoints} days`);
      console.log(`   Minutes Played: ${minutesPlayedPoints} days`);
      console.log(`   Unique Players: ${uniquePlayersPoints} days`);
      console.log(`   Plays (Sessions): ${playsPoints} days`);
      console.log(`   Favorites: ${sevenDaysMetrics.favorites?.length || 0} days`);
      console.log(`   Recommendations: ${sevenDaysMetrics.recommendations?.length || 0} days`);
      console.log(`   Avg Minutes/Player: ${sevenDaysMetrics.averageMinutesPerPlayer?.length || 0} days`);
      console.log(`   Retention: ${sevenDaysMetrics.retention?.length || 0} days`);
      
      // Show sample data point
      if (peakCCUPoints > 0) {
        const latestDay = sevenDaysMetrics.peakCCU[peakCCUPoints - 1];
        console.log(`\n   Latest Day Sample (${latestDay.timestamp}):`);
        console.log(`   - Peak CCU: ${latestDay.value || 'N/A'}`);
        
        if (minutesPlayedPoints > 0) {
          const minutesData = sevenDaysMetrics.minutesPlayed[minutesPlayedPoints - 1];
          console.log(`   - Minutes Played: ${minutesData.value?.toLocaleString() || 'N/A'}`);
        }
        if (uniquePlayersPoints > 0) {
          const playersData = sevenDaysMetrics.uniquePlayers[uniquePlayersPoints - 1];
          console.log(`   - Unique Players: ${playersData.value?.toLocaleString() || 'N/A'}`);
        }
      }
      
      saveResponse('ecosystem_7days_all_metrics.json', sevenDaysMetrics);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    console.log('');

    // Test 3: Get Peak CCU (Last 24 Hours)
    console.log('📈 Test 3: Peak CCU - Last 24 Hours (Hour Interval)');
    console.log('─────────────────────────────────────────────────────');
    try {
      const now = new Date();
      now.setHours(now.getHours() - 1); // Go back 1 hour to avoid future timestamp
      
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      
      const peakCCU = await getPeakCCU(testMapCode, 'hour', yesterday.toISOString(), now.toISOString(), ACCESS_TOKEN);
      
      const hours = peakCCU.intervals?.length || 0;
      console.log(`✅ Peak CCU data: ${hours} hours`);
      
      if (hours > 0) {
        const maxCCU = Math.max(...peakCCU.intervals.map(i => i.value || 0));
        const avgCCU = peakCCU.intervals.reduce((sum, i) => sum + (i.value || 0), 0) / hours;
        console.log(`   Max Peak CCU: ${maxCCU}`);
        console.log(`   Avg Peak CCU: ${Math.round(avgCCU)}`);
      }
      
      saveResponse('ecosystem_peak_ccu_24h.json', peakCCU);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    console.log('');

    // Test 4: Get Retention Metrics
    console.log('🔄 Test 4: Player Retention (D1 & D7)');
    console.log('─────────────────────────────────────────────────────');
    try {
      const retention = await getRetention(testMapCode, null, null, ACCESS_TOKEN);
      
      const days = retention.intervals?.length || 0;
      console.log(`✅ Retention data: ${days} days`);
      
      if (days > 0) {
        const latestRetention = retention.intervals[days - 1];
        console.log(`   Latest (${latestRetention.timestamp}):`);
        console.log(`   - D1 Retention: ${latestRetention.d1 !== null ? latestRetention.d1 : 'N/A'} players`);
        console.log(`   - D7 Retention: ${latestRetention.d7 !== null ? latestRetention.d7 : 'N/A'} players`);
      }
      
      saveResponse('ecosystem_retention.json', retention);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    console.log('');

    // Test 5: Get All Islands (First Page)
    console.log('🗺️  Test 5: All Islands List (First 20)');
    console.log('─────────────────────────────────────────────────────');
    try {
      const islandsList = await getAllIslands(20, null, null, ACCESS_TOKEN);
      
      const count = islandsList.data?.length || 0;
      const totalMeta = islandsList.meta?.count || 0;
      
      console.log(`✅ Fetched ${count} islands (showing first ${totalMeta})`);
      
      if (count > 0) {
        console.log('\n   Sample Islands:');
        islandsList.data.slice(0, 5).forEach((island, idx) => {
          console.log(`   ${idx + 1}. ${island.title || island.code}`);
          console.log(`      Code: ${island.code}`);
          console.log(`      Creator: ${island.creatorCode || 'Unknown'}`);
        });
      }
      
      saveResponse('ecosystem_islands_list.json', islandsList);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ ECOSYSTEM API TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

// Run tests
testEcosystemAPI().catch(console.error);
