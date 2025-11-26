#!/usr/bin/env node

/**
 * Discovery Metrics Analysis
 * 
 * Analyzes what metrics get maps into discovery and estimates
 * player requirements for quest-based app concept.
 */

const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const es = new Client({ node: process.env.ELASTICSEARCH_URL });

async function analyzeDiscoveryMetrics() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 DISCOVERY METRICS ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. Get discovery panel statistics
    console.log('1️⃣  Analyzing Discovery Panels...\n');
    const panelStats = await es.search({
      index: 'discovery-events',
      body: {
        size: 0,
        aggs: {
          unique_maps: {
            cardinality: { field: 'map_id.keyword' }
          },
          panels: {
            terms: { 
              field: 'panel_name.keyword', 
              size: 30 
            },
            aggs: {
              avg_rank: { avg: { field: 'rank' } },
              unique_maps_per_panel: { 
                cardinality: { field: 'map_id.keyword' } 
              }
            }
          }
        }
      }
    });

    console.log(`📍 Total Unique Maps in Discovery: ${panelStats.aggregations.unique_maps.value.toLocaleString()}`);
    console.log(`📋 Discovery Panels:\n`);

    for (const panel of panelStats.aggregations.panels.buckets) {
      console.log(`  ${panel.key}`);
      console.log(`    • Appearances: ${panel.doc_count.toLocaleString()}`);
      console.log(`    • Unique Maps: ${panel.unique_maps_per_panel.value.toLocaleString()}`);
      console.log(`    • Avg Rank: ${panel.avg_rank.value?.toFixed(1) || 'N/A'}`);
    }

    // 2. Get top maps by discovery appearances
    console.log('\n\n2️⃣  Top Maps by Discovery Appearances...\n');
    const topMaps = await es.search({
      index: 'discovery-events',
      body: {
        size: 0,
        aggs: {
          top_maps: {
            terms: { 
              field: 'map_id.keyword', 
              size: 15,
              order: { _count: 'desc' }
            },
            aggs: {
              panels_appeared: {
                terms: { field: 'panel_name.keyword', size: 5 }
              },
              avg_rank: { avg: { field: 'rank' } }
            }
          }
        }
      }
    });

    for (const [idx, map] of topMaps.aggregations.top_maps.buckets.entries()) {
      console.log(`${idx + 1}. Map: ${map.key}`);
      console.log(`   • Total Appearances: ${map.doc_count.toLocaleString()}`);
      console.log(`   • Avg Rank: ${map.avg_rank.value?.toFixed(1)}`);
      console.log(`   • Panels: ${map.panels_appeared.buckets.map(p => p.key).join(', ')}`);
    }

    // 3. Get CCU statistics for discovered maps
    console.log('\n\n3️⃣  Analyzing CCU Requirements...\n');
    
    // Get discovery map IDs
    const discoveryMaps = await es.search({
      index: 'discovery-current',
      size: 10000,
      _source: ['map_id']
    });

    const discoveryMapIds = [...new Set(discoveryMaps.hits.hits.map(h => h._source.map_id))];
    console.log(`📊 Current Discovery Maps: ${discoveryMapIds.length}`);

    // Get CCU stats for these maps
    const ccuStats = await es.search({
      index: 'concurrent-users-*',
      body: {
        size: 0,
        query: {
          terms: { 'map_id.keyword': discoveryMapIds.slice(0, 100) }
        },
        aggs: {
          ccu_stats: {
            stats: { field: 'ccu' }
          },
          ccu_percentiles: {
            percentiles: { 
              field: 'ccu',
              percents: [25, 50, 75, 90, 95, 99]
            }
          },
          ccu_distribution: {
            histogram: {
              field: 'ccu',
              interval: 100
            }
          },
          per_map_avg: {
            terms: {
              field: 'map_id.keyword',
              size: 20,
              order: { avg_ccu: 'desc' }
            },
            aggs: {
              avg_ccu: { avg: { field: 'ccu' } },
              max_ccu: { max: { field: 'ccu' } }
            }
          }
        }
      }
    });

    console.log('CCU Statistics for Discovery Maps:');
    console.log(`  • Average: ${ccuStats.aggregations.ccu_stats.avg?.toFixed(0) || 'N/A'}`);
    console.log(`  • Min: ${ccuStats.aggregations.ccu_stats.min?.toFixed(0) || 'N/A'}`);
    console.log(`  • Max: ${ccuStats.aggregations.ccu_stats.max?.toFixed(0) || 'N/A'}`);
    console.log(`  • 50th percentile (Median): ${ccuStats.aggregations.ccu_percentiles.values['50.0']?.toFixed(0) || 'N/A'}`);
    console.log(`  • 75th percentile: ${ccuStats.aggregations.ccu_percentiles.values['75.0']?.toFixed(0) || 'N/A'}`);
    console.log(`  • 90th percentile: ${ccuStats.aggregations.ccu_percentiles.values['90.0']?.toFixed(0) || 'N/A'}`);
    console.log(`  • 95th percentile: ${ccuStats.aggregations.ccu_percentiles.values['95.0']?.toFixed(0) || 'N/A'}`);
    console.log(`  • 99th percentile: ${ccuStats.aggregations.ccu_percentiles.values['99.0']?.toFixed(0) || 'N/A'}`);

    console.log('\n\nTop Maps by Average CCU:');
    for (const [idx, map] of ccuStats.aggregations.per_map_avg.buckets.slice(0, 10).entries()) {
      console.log(`${idx + 1}. ${map.key}: Avg ${map.avg_ccu.value.toFixed(0)} | Peak ${map.max_ccu.value.toFixed(0)}`);
    }

    // 4. Get map metrics data
    console.log('\n\n4️⃣  Analyzing Map Performance Metrics...\n');
    
    const metricsData = await es.search({
      index: 'map-metrics-history',
      body: {
        size: 0,
        aggs: {
          metrics_stats: {
            stats: { field: 'metrics.ccu_avg' }
          },
          discovery_correlation: {
            filters: {
              filters: {
                in_discovery: { term: { 'discovery.is_featured': true } },
                not_in_discovery: { term: { 'discovery.is_featured': false } }
              }
            },
            aggs: {
              avg_ccu: { avg: { field: 'metrics.ccu_avg' } },
              avg_favorites: { avg: { field: 'metrics.favorites_total' } }
            }
          }
        }
      }
    });

    if (metricsData.aggregations.discovery_correlation) {
      const inDiscovery = metricsData.aggregations.discovery_correlation.buckets.in_discovery;
      const notInDiscovery = metricsData.aggregations.discovery_correlation.buckets.not_in_discovery;

      console.log('Discovery vs Non-Discovery Maps:');
      console.log(`\n  In Discovery:`);
      console.log(`    • Count: ${inDiscovery.doc_count.toLocaleString()}`);
      console.log(`    • Avg CCU: ${inDiscovery.avg_ccu.value?.toFixed(0) || 'N/A'}`);
      console.log(`    • Avg Favorites: ${inDiscovery.avg_favorites.value?.toFixed(0) || 'N/A'}`);
      
      console.log(`\n  Not In Discovery:`);
      console.log(`    • Count: ${notInDiscovery.doc_count.toLocaleString()}`);
      console.log(`    • Avg CCU: ${notInDiscovery.avg_ccu.value?.toFixed(0) || 'N/A'}`);
      console.log(`    • Avg Favorites: ${notInDiscovery.avg_favorites.value?.toFixed(0) || 'N/A'}`);
    }

    // 5. Quest App Feasibility Analysis
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('🎮 QUEST APP FEASIBILITY ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const avgDiscoveryCCU = ccuStats.aggregations.ccu_stats.avg || 200;
    const minDiscoveryCCU = ccuStats.aggregations.ccu_stats.min || 50;

    console.log('Key Findings:\n');
    console.log(`1. Minimum CCU for Discovery Visibility: ~${minDiscoveryCCU.toFixed(0)} concurrent users`);
    console.log(`2. Average CCU for Featured Maps: ~${avgDiscoveryCCU.toFixed(0)} concurrent users`);
    console.log(`3. Total Unique Maps in Discovery History: ${panelStats.aggregations.unique_maps.value.toLocaleString()}`);

    console.log('\n\nEstimated Player Requirements for Your Quest App:\n');
    
    // Scenario calculations
    const scenarios = [
      { name: 'Conservative (Get Initial Discovery)', active: 100, dailyPlays: 2, questDuration: 7 },
      { name: 'Moderate (Maintain Discovery)', active: 300, dailyPlays: 3, questDuration: 7 },
      { name: 'Aggressive (Featured Discovery)', active: 500, dailyPlays: 4, questDuration: 7 }
    ];

    for (const scenario of scenarios) {
      const dailySessions = scenario.active * scenario.dailyPlays;
      const weeklySessions = dailySessions * 7;
      const avgSessionMinutes = 20;
      const peakCCU = Math.floor(scenario.active * 0.15); // 15% peak concurrency
      
      console.log(`\n📊 ${scenario.name}:`);
      console.log(`  • Active Users Needed: ${scenario.active.toLocaleString()}`);
      console.log(`  • Daily Sessions: ${dailySessions.toLocaleString()}`);
      console.log(`  • Weekly Sessions: ${weeklySessions.toLocaleString()}`);
      console.log(`  • Peak CCU: ~${peakCCU} (15% of active users)`);
      console.log(`  • Quest Prize Pool: $${(scenario.active * 0.3).toFixed(0)} - $${(scenario.active * 0.5).toFixed(0)}`);
    }

    console.log('\n\n💰 Revenue Potential Analysis:\n');
    
    const engagementData = await es.search({
      index: 'concurrent-users-*',
      body: {
        size: 0,
        query: {
          range: { ccu: { gte: 100 } }
        },
        aggs: {
          playtime_estimate: {
            avg: { field: 'ccu' }
          }
        }
      }
    });

    console.log('Epic Games Creator Economy Estimates:');
    console.log('  • Engagement Payout: ~$0.05 - $0.07 per hour played');
    console.log('  • 100 active users × 2 hrs/day × 7 days = 1,400 hours/week');
    console.log('  • Weekly Revenue: $70 - $98');
    console.log('  • Monthly Revenue: $280 - $392');
    console.log('\n  • 500 active users × 2 hrs/day × 7 days = 7,000 hours/week');
    console.log('  • Weekly Revenue: $350 - $490');
    console.log('  • Monthly Revenue: $1,400 - $1,960');

    console.log('\n\n🎯 Recommendations:\n');
    console.log('1. Start with 100-200 active users for initial discovery placement');
    console.log('2. Offer 3 quests per week (Mon/Wed/Fri) to maintain engagement');
    console.log('3. Prize pools: $30-$50 per quest (~$120-$150/week total)');
    console.log('4. Target metrics:');
    console.log('   • 50-100 peak concurrent users');
    console.log('   • 1,000-2,000 weekly sessions');
    console.log('   • 20-30 min average session length');
    console.log('5. Break-even point: ~300-400 active users');
    console.log('   (Revenue covers quest prizes + operational costs)');

    console.log('\n\n═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.meta?.body?.error) {
      console.error('Details:', JSON.stringify(error.meta.body.error, null, 2));
    }
  }
}

// Run if executed directly
if (require.main === module) {
  analyzeDiscoveryMetrics()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { analyzeDiscoveryMetrics };
