/**
 * PM2 Ecosystem Configuration - Essential Workers Only
 * 
 * Simplified worker setup for Fortnite Creative data collection
 */
module.exports = {
  apps: [
    {
      name: 'map-ingestion',
      script: './workers/ingestion/map-ingestion.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/map-ingestion-error.log',
      out_file: './logs/map-ingestion-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'creator-ingestion',
      script: './workers/ingestion/creator-ingestion.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/creator-ingestion-error.log',
      out_file: './logs/creator-ingestion-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'creator-maps-discovery',
      script: './workers/ingestion/creator-maps-discovery.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/creator-maps-discovery-error.log',
      out_file: './logs/creator-maps-discovery-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'ccu-monitor',
      script: './workers/monitoring/ccu-monitor.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/ccu-monitor-error.log',
      out_file: './logs/ccu-monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'discovery-monitor',
      script: './workers/monitoring/discovery-monitor.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/discovery-monitor-error.log',
      out_file: './logs/discovery-monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
