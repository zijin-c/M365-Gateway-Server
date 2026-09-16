module.exports = {
  apps: [
    {
      name: "m365-gateway",
      script: "server.mjs",
      instances: 1, // Single process required for local Durable Object / SQLite persistence
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
