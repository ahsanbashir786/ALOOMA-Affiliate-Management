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
};

export default nextConfig;
