// PM2 process definition for the GTB OS backend (apps/api — Next.js on :3001).
//
//   pm2 start ecosystem.config.cjs     # first run
//   pm2 save && pm2 startup            # persist + survive reboots (run the printed cmd once)
//   pm2 reload gtb-api                 # zero-downtime redeploy after a build
//   pm2 logs gtb-api                   # tail logs
//
// Runtime secrets are NOT defined here — they live in apps/api/.env, which
// `next start` loads automatically. This file only sets process-level vars
// (NODE_ENV, PORT) and PM2 supervision options. Paths resolve from __dirname,
// so it works wherever the repo is cloned (no hard-coded /var/www path).

const path = require("node:path");

const apiDir = path.join(__dirname, "apps", "api");

module.exports = {
  apps: [
    {
      name: "gtb-api",
      cwd: apiDir,
      // The .bin/next pnpm generates is a POSIX shell shim (#!/bin/sh), not JS — running
      // it via the "node" interpreter below throws a SyntaxError on its shell syntax.
      // Use Next's real JS entrypoint instead (#!/usr/bin/env node, which `node` strips).
      script: path.join(apiDir, "node_modules", "next", "dist", "bin", "next"),
      args: "start --port 3001",
      interpreter: "node",

      instances: 1, // bump to "max" + exec_mode: "cluster" once verified stateless
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      // Tune to your VPS RAM — this is a leak guard, not a normal operating point.
      // Next idles well under this; raise it if you see restarts under real load.
      max_memory_restart: "512M",
      time: true, // prepend timestamps to logs

      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
