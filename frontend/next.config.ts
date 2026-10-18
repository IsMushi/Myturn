import type { NextConfig } from "next";

// The browser talks to Next.js only. Everything under /api is proxied to the
// Flask API, so the staff session cookie stays on one origin.
const backend = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
