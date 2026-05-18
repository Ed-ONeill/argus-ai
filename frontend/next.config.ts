import type { NextConfig } from "next";

// BACKEND_URL is a server-side-only variable — set it in the Railway frontend
// service to point at the deployed backend, e.g. https://argus-api.up.railway.app
// Falls back to localhost:8000 for local development.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
