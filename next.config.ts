import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for Docker / VPS (node server.js).
  output: "standalone",
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
  async redirects() {
    return [
      { source: "/actions", destination: "/today", permanent: false },
    ];
  },
};

export default nextConfig;
