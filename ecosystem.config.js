module.exports = {
  apps: [{
    name: 'hls',
    script: 'hls.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env_file: '.env',
    env: {
      NODE_ENV: 'production',
      PORT: 4665
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 4665
    },
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    error_file: './logs/hls-error.log',
    out_file: './logs/hls-out.log',
    log_file: './logs/hls-combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000
  }]
};