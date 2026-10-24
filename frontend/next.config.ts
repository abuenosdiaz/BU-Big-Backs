import type { NextConfig } from "next";

// The JSON API is served by the Python integration server (backend/server.py).
// In production the integration server sits in front and proxies the frontend,
// so same-origin /api/* calls reach it directly. But when the Next.js server is
// hit on its own port (e.g. `next dev`, or opening :3000 by habit), it has no
// /api routes. These rewrites forward /api/* to the backend so the app works
// from either origin. BACKEND_ORIGIN overrides the default target.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  /* config options here */
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
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
