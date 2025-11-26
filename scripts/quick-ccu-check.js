const {Client} = require('@elastic/elasticsearch');
const es = new Client({node: process.env.ELASTICSEARCH_URL});

(async () => {
  const result = await es.search({
    index: 'concurrent-users-2025-11',
    body: {
      size: 0,
      aggs: {
        ccu_ranges: {
          range: {
            field: 'ccu',
            ranges: [
              {to: 10},
              {from: 10, to: 50},
              {from: 50, to: 100},
              {from: 100, to: 500},
              {from: 500, to: 1000},
              {from: 1000, to: 5000},
              {from: 5000}
            ]
          }
        },
        top_maps: {
          terms: {
            field: 'map_id.keyword',
            size: 30,
            order: { max_ccu: 'desc' }
          },
          aggs: {
            max_ccu: { max: { field: 'ccu' } },
            avg_ccu: { avg: { field: 'ccu' } }
          }
        }
      }
    }
  });
  
  console.log('CCU Ranges:');
  result.aggregations.ccu_ranges.buckets.forEach(b => 
    console.log(`  ${b.key}: ${b.doc_count.toLocaleString()}`)
  );
  
  console.log('\nTop Maps by Peak CCU:');
  result.aggregations.top_maps.buckets.slice(0, 15).forEach((m, i) => 
    console.log(`${i+1}. ${m.key}: Avg ${m.avg_ccu.value.toFixed(0)} | Peak ${m.max_ccu.value}`)
  );
})().catch(e => console.error(e.message));
