module.exports = {
  apps: [
    {
      name: 'msgk',
      script: '.output/server/index.mjs',
      cwd: '/www/wwwroot/msgk',
      node_args: '--env-file=.env',
      user: 'www',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        NITRO_PORT: 3005,
        TZ: 'Asia/Shanghai'
      },
      error_file: './logs/msgk-error.log',
      out_file: './logs/msgk-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
