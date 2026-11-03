import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // The old Creators list is now the Affiliates Overview.
  async redirects() {
    return [
      { source: "/creators", destination: "/affiliates", permanent: false },
      { source: "/actions", destination: "/today", permanent: false },
    ];
  },
};

export default nextConfig;
