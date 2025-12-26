/**
 * PM2 Ecosystem Configuration - Fortnite Data Collection
 * 
 * Optimized worker setup for production deployment
 */
module.exports = {
  apps: [
    {
      name: 'data-loader',
      script: './test-opensearch-load.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/data-loader-error.log',
      out_file: './logs/data-loader-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'maps-collector',
      script: './workers/ingestion/maps-collector.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/maps-collector-error.log',
      out_file: './logs/maps-collector-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'profiles-collector',
      script: './workers/ingestion/profiles-collector.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/profiles-collector-error.log',
      out_file: './logs/profiles-collector-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'maps-discovery',
      script: './workers/ingestion/maps-discovery.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/maps-discovery-error.log',
      out_file: './logs/maps-discovery-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'player-counts',
      script: './workers/monitoring/player-counts.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/player-counts-error.log',
      out_file: './logs/player-counts-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'discovery-tracker',
      script: './workers/monitoring/discovery-tracker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/discovery-tracker-error.log',
      out_file: './logs/discovery-tracker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
