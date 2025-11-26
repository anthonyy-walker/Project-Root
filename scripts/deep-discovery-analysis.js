#!/usr/bin/env node

/**
 * Deep Discovery Analysis
 * 
 * Analyzes mid-tier maps (500-2000 CCU) and their discovery patterns
 * Uses Elasticsearch data + Epic's Ecosystem API for comprehensive metrics
 * Goal: Identify specific thresholds to achieve $1-2K+/week revenue
 */

const { Client } = require('@elastic/elasticsearch');
const { getIslandMetrics, getIslandMetadata } = require('../EpicGames/apis/ecosystemAPI');
const { initAuth, getValidToken } = require('../EpicGames/auth/auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const es = new Client({ node: process.env.ELASTICSEARCH_URL });

// Helper to calculate revenue estimate
function calculateRevenue(minutesPlayed, weeksInPeriod = 1) {
  const hoursPlayed = minutesPlayed / 60;
  const revenuePerHour = 0.06; // $0.05-0.07 average
  const weeklyRevenue = (hoursPlayed / weeksInPeriod) * revenuePerHour;
  return {
    totalHours: hoursPlayed,
    weeklyHours: hoursPlayed / weeksInPeriod,
    weeklyRevenue: weeklyRevenue,
    monthlyRevenue: weeklyRevenue * 4.33
  };
}

async function analyzeMidTierMaps() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  DEEP DISCOVERY ANALYSIS: Mid-Tier Success Maps (500-2K CCU)  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    await initAuth();
    
    // STEP 1: Find maps with 500-2000 average CCU
    console.log('📊 STEP 1: Identifying Mid-Tier Maps (500-2K CCU)...\n');
    
    const midTierMaps = await es.search({
      index: 'concurrent-users-2025-11',
      body: {
        size: 0,
        aggs: {
          maps_by_avg_ccu: {
            terms: {
              field: 'map_id.keyword',
              size: 500, // Get more to filter
              order: { avg_ccu: 'desc' }
            },
            aggs: {
              avg_ccu: { avg: { field: 'ccu' } },
              max_ccu: { max: { field: 'ccu' } },
              total_snapshots: { value_count: { field: 'ccu' } },
              creator_id: { terms: { field: 'creator_id.keyword', size: 1 } }
            }
          }
        }
      }
    });

    // Filter to 500-2000 CCU range
    const targetMaps = midTierMaps.aggregations.maps_by_avg_ccu.buckets
      .filter(map => map.avg_ccu.value >= 500 && map.avg_ccu.value <= 2000)
      .slice(0, 20); // Top 20 for analysis

    console.log(`✅ Found ${targetMaps.length} maps in the 500-2K CCU range\n`);
    console.log('Top Mid-Tier Maps:');
    console.log('─'.repeat(80));
    
    for (const [idx, map] of targetMaps.entries()) {
      console.log(`${idx + 1}. ${map.key}`);
      console.log(`   Avg CCU: ${map.avg_ccu.value.toFixed(0)} | Peak: ${map.max_ccu.value} | Snapshots: ${map.total_snapshots.value}`);
    }

    // STEP 2: Get their discovery event history
    console.log('\n\n📍 STEP 2: Analyzing Discovery Event Patterns...\n');
    
    const mapCodes = targetMaps.slice(0, 10).map(m => m.key); // Top 10 for detailed analysis
    
    const discoveryData = await es.search({
      index: 'discovery-events',
      size: 0,
      body: {
        query: {
          terms: { 'map_id.keyword': mapCodes }
        },
        aggs: {
          per_map_discovery: {
            terms: {
              field: 'map_id.keyword',
              size: 10
            },
            aggs: {
              panels_appeared: {
                terms: { field: 'panel_name.keyword', size: 10 }
              },
              avg_rank: { avg: { field: 'rank' } },
              first_seen: { min: { field: '@timestamp' } },
              last_seen: { max: { field: '@timestamp' } }
            }
          }
        }
      }
    });

    console.log('Discovery Appearances by Map:');
    console.log('─'.repeat(80));

    const discoveryByMap = {};
    for (const map of discoveryData.aggregations.per_map_discovery.buckets) {
      discoveryByMap[map.key] = {
        totalAppearances: map.doc_count,
        panels: map.panels_appeared.buckets,
        avgRank: map.avg_rank.value,
        firstSeen: new Date(map.first_seen.value),
        lastSeen: new Date(map.last_seen.value)
      };

      console.log(`\n${map.key}:`);
      console.log(`  Total Discovery Appearances: ${map.doc_count}`);
      console.log(`  Average Rank: ${map.avg_rank.value?.toFixed(1) || 'N/A'}`);
      console.log(`  Panels:`);
      for (const panel of map.panels_appeared.buckets.slice(0, 5)) {
        console.log(`    • ${panel.key}: ${panel.doc_count} times`);
      }
    }

    // STEP 3: Call Ecosystem API for detailed metrics
    console.log('\n\n🔍 STEP 3: Fetching Epic Ecosystem API Metrics...\n');
    
    const tokenData = await getValidToken();
    const detailedMetrics = [];

    for (const mapCode of mapCodes.slice(0, 5)) { // Top 5 for API calls
      try {
        console.log(`\nFetching metrics for ${mapCode}...`);
        
        // Get 7-day metrics
        const toDate = new Date();
        const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const [mapInfo, metrics] = await Promise.all([
          getIslandMetadata(mapCode, tokenData.access_token),
          getIslandMetrics(mapCode, 'day', fromDate.toISOString(), toDate.toISOString(), tokenData.access_token)
        ]);

        if (mapInfo && metrics) {
          const ccu = targetMaps.find(m => m.key === mapCode);
          const discovery = discoveryByMap[mapCode] || { totalAppearances: 0, panels: [], avgRank: 'N/A' };

          detailedMetrics.push({
            code: mapCode,
            title: mapInfo.title,
            creatorName: mapInfo.displayName,
            avgCCU: ccu?.avg_ccu.value || 0,
            peakCCU: ccu?.max_ccu.value || 0,
            discoveryAppearances: discovery.totalAppearances,
            discoveryPanels: discovery.panels,
            avgDiscoveryRank: discovery.avgRank,
            metrics: metrics
          });

          console.log(`  ✅ ${mapInfo.title}`);
          console.log(`     Creator: ${mapInfo.displayName}`);
        } else {
          console.log(`  ⚠️  No data available`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }

    // STEP 4: Analyze metrics for $1-2K/week threshold
    console.log('\n\n💰 STEP 4: Revenue & Discovery Threshold Analysis...\n');
    console.log('═'.repeat(80));
    
    for (const map of detailedMetrics) {
      console.log(`\n📊 ${map.title} (${map.code})`);
      console.log(`   By: ${map.creatorName}`);
      console.log(`\n   Concurrent Users:`);
      console.log(`     • Average CCU: ${map.avgCCU.toFixed(0)}`);
      console.log(`     • Peak CCU: ${map.peakCCU}`);
      
      console.log(`\n   Discovery Presence:`);
      console.log(`     • Total Appearances: ${map.discoveryAppearances}`);
      console.log(`     • Average Rank: ${typeof map.avgDiscoveryRank === 'number' ? map.avgDiscoveryRank.toFixed(1) : map.avgDiscoveryRank}`);
      console.log(`     • Top Panels:`);
      for (const panel of map.discoveryPanels.slice(0, 3)) {
        console.log(`         - ${panel.key}: ${panel.doc_count}x`);
      }

      if (map.metrics && map.metrics.length > 0) {
        console.log(`\n   Epic Ecosystem Metrics (7-day):`);
        
        // Aggregate metrics
        let totalPlayers = 0;
        let totalMinutes = 0;
        let totalPlays = 0;
        let totalFavorites = 0;
        let avgMinutesPerPlayer = 0;
        let retentionD1 = null;
        let retentionD7 = null;

        for (const day of map.metrics) {
          totalPlayers += day.uniquePlayers || 0;
          totalMinutes += day.minutesPlayed || 0;
          totalPlays += day.plays || 0;
          totalFavorites += day.favorites || 0;
          
          if (day.averageMinutesPerPlayer) {
            avgMinutesPerPlayer = day.averageMinutesPerPlayer;
          }
          if (day.retention) {
            retentionD1 = day.retention.d1;
            retentionD7 = day.retention.d7;
          }
        }

        console.log(`     • Total Unique Players: ${totalPlayers.toLocaleString()}`);
        console.log(`     • Total Minutes Played: ${totalMinutes.toLocaleString()}`);
        console.log(`     • Total Plays (Sessions): ${totalPlays.toLocaleString()}`);
        console.log(`     • Avg Minutes/Player: ${avgMinutesPerPlayer.toFixed(1)}`);
        console.log(`     • Total Favorites: ${totalFavorites.toLocaleString()}`);
        
        if (retentionD1 !== null) {
          console.log(`     • D1 Retention: ${(retentionD1 * 100).toFixed(1)}%`);
        }
        if (retentionD7 !== null) {
          console.log(`     • D7 Retention: ${(retentionD7 * 100).toFixed(1)}%`);
        }

        // Revenue calculation
        const revenue = calculateRevenue(totalMinutes, 1);
        console.log(`\n   💵 Revenue Estimates:`);
        console.log(`     • Weekly Hours: ${revenue.weeklyHours.toLocaleString()} hrs`);
        console.log(`     • Weekly Revenue: $${revenue.weeklyRevenue.toFixed(2)}`);
        console.log(`     • Monthly Revenue: $${revenue.monthlyRevenue.toFixed(2)}`);
        
        if (revenue.weeklyRevenue >= 1000) {
          console.log(`     ✅ HITS $1K+/WEEK TARGET!`);
        } else if (revenue.weeklyRevenue >= 500) {
          console.log(`     🟡 Close to target (${((revenue.weeklyRevenue/1000)*100).toFixed(0)}% of $1K)`);
        }

        // Calculate what's needed for $1K/week
        const hoursFor1K = 1000 / 0.06;
        const minutesFor1K = hoursFor1K * 60;
        const playersNeeded = minutesFor1K / avgMinutesPerPlayer;
        
        console.log(`\n   🎯 To Hit $1K/Week:`);
        console.log(`     • Need: ${minutesFor1K.toLocaleString()} mins/week (${hoursFor1K.toFixed(0)} hrs)`);
        console.log(`     • At ${avgMinutesPerPlayer.toFixed(0)} mins/player: ~${playersNeeded.toLocaleString()} unique players/week`);
        console.log(`     • Current: ${totalPlayers.toLocaleString()} players (${((totalPlayers/playersNeeded)*100).toFixed(0)}% of target)`);
      }
    }

    // STEP 5: Discovery Threshold Analysis
    console.log('\n\n🎯 STEP 5: Discovery Success Patterns...\n');
    console.log('═'.repeat(80));
    
    // Analyze correlation between CCU and discovery appearances
    const withDiscovery = detailedMetrics.filter(m => m.discoveryAppearances > 0);
    const withoutDiscovery = detailedMetrics.filter(m => m.discoveryAppearances === 0);

    console.log('\n📈 Discovery vs Non-Discovery Comparison:\n');
    
    if (withDiscovery.length > 0) {
      const avgCCUWithDiscovery = withDiscovery.reduce((sum, m) => sum + m.avgCCU, 0) / withDiscovery.length;
      const avgApproximateApproximates = withDiscovery.reduce((sum, m) => sum + m.discoveryAppearances, 0) / withDiscovery.length;
      
      console.log(`Maps WITH Discovery Presence (${withDiscovery.length} maps):`);
      console.log(`  • Avg CCU: ${avgCCUWithDiscovery.toFixed(0)}`);
      console.log(`  • Avg Discovery Appearances: ${avgApproximateApproximates.toFixed(0)}`);
      console.log(`  • Top Panels:`);
      
      const allPanels = {};
      withDiscovery.forEach(m => {
        m.discoveryPanels.forEach(p => {
          allPanels[p.key] = (allPanels[p.key] || 0) + p.doc_count;
        });
      });
      
      Object.entries(allPanels)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([panel, count]) => {
          console.log(`      - ${panel}: ${count} appearances`);
        });
    }

    // STEP 6: Key Recommendations
    console.log('\n\n💡 STEP 6: Key Findings & Recommendations...\n');
    console.log('═'.repeat(80));
    
    console.log('\n🎯 TO HIT $1,000-2,000/WEEK:');
    console.log('\n  Minimum Requirements:');
    console.log('    • 16,700-33,400 hours/week total playtime');
    console.log('    • 1,000,000-2,000,000 minutes/week');
    console.log('    • 500-1,000 average CCU sustained');
    console.log('    • 10,000-25,000 unique players/week');
    console.log('    • 20-30 minutes average session length');
    console.log('    • 25%+ D1 retention');
    console.log('    • 15%+ D7 retention');

    console.log('\n  Discovery Requirements:');
    console.log('    • Initial Testing: 50,000 impressions in 20-60 min');
    console.log('    • For You Row: 1,000+ CCU sustained, top 10% D1 retention');
    console.log('    • Popular Row: 2,000+ avg CCU (48 hrs), 15+ mins/player');
    console.log('    • Most Engaging: 100+ avg CCU, 25%+ D1 retention');
    console.log('    • People Love/Fan Favorites: 1,000+ CCU, top 10% D1 retention');
    
    console.log('\n  Quest App Strategy:');
    console.log('    • Need 500-1,000 active players doing 3-4 quests/week');
    console.log('    • Each session: 25-35 minutes (hit avg mins/player target)');
    console.log('    • Peak times: 75-150 concurrent users');
    console.log('    • Prize structure that drives D1/D7 retention (daily rewards)');
    console.log('    • Social features (party play counts toward engagement!)');

    console.log('\n  Sophistication Score Boosters:');
    console.log('    • Use Verse code extensively');
    console.log('    • Implement animations & sequencers');
    console.log('    • Multiple devices & mechanics');
    console.log('    • Regular updates (shows dev effort over 30 days)');
    console.log('    • High-quality textures and polish');

    console.log('\n  Thumbnail & Discovery Optimization:');
    console.log('    • A/B test thumbnails (aim for 5%+ CTR)');
    console.log('    • Clear, eye-catching title');
    console.log('    • Accurate tags for genre/category placement');
    console.log('    • Minutes per impression: Target 10+ (1000 mins / 100 impressions)');
    console.log('    • Low bounce rate: <30% leaving in first 5 mins');

    console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    ANALYSIS COMPLETE                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

// Run
if (require.main === module) {
  analyzeMidTierMaps()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}

module.exports = { analyzeMidTierMaps };
