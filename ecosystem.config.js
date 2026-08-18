module.exports = {
  apps: [
    {
      name: "krakentech-live",
      script: "./server.js",
      cwd: "./",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000,
        JWT_SECRET: "KrakenTech-Change-This-Secret-2026",
        ADMIN_SECRET: "KrakenTech-Admin-Change-This-Secret-2026"
      }
    }
  ]
};
