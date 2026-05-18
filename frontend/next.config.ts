import type { NextConfig } from "next";

// API proxying is handled at runtime by src/app/api/[...path]/route.ts
// so that BACKEND_URL is read per-request, not baked in at build time.
const nextConfig: NextConfig = {};

export default nextConfig;
