import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for Docker / VPS (node server.js).
  output: "standalone",
  // One id per build. A browser still holding an older page is told the app was updated and loads the new version
  // (version skew protection), instead of calling buttons the new server no longer has.
  deploymentId: process.env.DEPLOYMENT_VERSION || `b${Date.now().toString(36)}`,
  // Per-user, always-fresh data: render dynamically rather than caching shells.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["exceljs", "postgres"],
};

export default nextConfig;
