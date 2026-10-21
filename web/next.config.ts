import type { NextConfig } from "next";

// The browser talks to Next.js only. Everything under /api is proxied to the
// Flask API, so the session cookie stays on one origin.
const backend = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The screenshots that go into the project report are taken from the running
  // development server, and the floating badge would sit in the corner of every
  // one of them. Compile and runtime errors are still reported in the terminal.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // The two pages that were renamed. The old addresses are still printed in
    // the project report, so they keep working.
    return [
      { source: "/screen", destination: "/display", permanent: false },
      { source: "/staff", destination: "/staff/dashboard", permanent: false },
      { source: "/auth/forget-password", destination: "/auth/forgot-password", permanent: false },
    ];
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
