module.exports = {
  apps: [
    {
      name: "despatch-backend",
      script: "server.js",
      cwd: __dirname,
      instances: 1,       // keep at 1 until Redis adapter is added for Socket.io multi-instance
      exec_mode: "fork",

      // Environment
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },

      // V8 heap: lets Node use up to 1 GB before GC pressure hits
      node_args: "--max-old-space-size=1024",

      // Restart policy
      watch: false,               // never watch in production
      max_memory_restart: "900M", // was 500M — Socket.io + buffers + 20 staff easily reach 300-400M
      restart_delay: 3000,        // wait 3 s before restarting after crash
      max_restarts: 10,           // stop after 10 consecutive crashes

      // Logging
      output: "./logs/pm2-out.log",
      error:  "./logs/pm2-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 8000,         // give server 8 s to drain Socket.io connections (was 5 s)
      wait_ready: false,
    },
  ],
};
