import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Room for uploaded member lists (Excel files).
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
