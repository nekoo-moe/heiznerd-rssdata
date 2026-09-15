module.exports = {
  apps: [
    {
      name: "cuutruyen-bot",
      script: "dist/index.js",
      cwd: "/home/ubuntu/heiznerd-rssdata",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

