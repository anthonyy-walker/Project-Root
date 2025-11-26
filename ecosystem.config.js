module.exports = {
  apps: [
    {
      name: 'worker-1-maps',
      script: './workers/ingestion/map-ingestion.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-1-maps-error.log',
      out_file: './logs/worker-1-maps-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'worker-2a-creator-profiles',
      script: './workers/ingestion/creator-ingestion.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-2a-profiles-error.log',
      out_file: './logs/worker-2a-profiles-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'worker-2b-creator-maps',
      script: './workers/ingestion/creator-maps-discovery.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-2b-maps-error.log',
      out_file: './logs/worker-2b-maps-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'worker-3-ccu-monitor',
      script: './workers/monitoring/ccu-monitor.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-3-ccu-error.log',
      out_file: './logs/worker-3-ccu-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'worker-4-discovery-monitor',
      script: './workers/monitoring/discovery-monitor.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-4-discovery-error.log',
      out_file: './logs/worker-4-discovery-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'worker-5-ecosystem-metrics',
      script: './workers/aggregation/daily-aggregator.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-5-ecosystem-error.log',
      out_file: './logs/worker-5-ecosystem-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'worker-6-data-compactor',
      script: './workers/aggregation/data-compactor.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-6-compactor-error.log',
      out_file: './logs/worker-6-compactor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'worker-7-performance',
      script: './workers/aggregation/performance-calculator.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-7-performance-error.log',
      out_file: './logs/worker-7-performance-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
